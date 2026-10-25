/**
 * Agent 主循环：把 Skill 工具暴露给 DeepSeek 做 function calling。
 *
 * 两条运行路径：
 * 1) 有 DEEPSEEK_API_KEY：模型自行选择工具 → 执行 → 由模型综合成自然语言答复；
 * 2) 无 Key（或调用失败）：按 skill.yaml 的 intent_routes 关键词做规则路由，
 *    直接执行对应命令并把原始输出返回，**流程不中断**，产物标记为 degraded。
 */
import { DeepSeekClient, type ChatMessage, type ChatTool, type ToolCallPayload } from './deepseek';
import { loadSkills, matchSkill, type SkillManifest, type SkillTool } from './skills/registry';
import { runSkillTool } from './skills/executor';

export interface AgentStep {
  tool: string;
  args: Record<string, unknown>;
  command: string;
  output: string;
  ok: boolean;
}

export interface AgentReply {
  text: string;
  steps: AgentStep[];
  mode: 'llm' | 'rule';
  usedSkill?: string;
}

const SYSTEM_PROMPT = `你是中医诊所的 AI 助手，负责把日常接诊沉淀为结构化医案资产。

行为准则：
1. 调用工具前先判断意图：建档用 intake、复诊跟进用 followup、看疗效对比用 summary、
   写总结报告用 report、写教学文档用 teach、录入外部资料用 ref add、
   给方案建议用 advise；
2. 工具参数只填用户明确提供的内容，**不要替医生编造**，缺失就留空；
3. 涉及诊断与治疗的输出，必须提醒"由 AI 辅助生成，须经执业医师审核"；
4. 命中胸痛剧烈、意识障碍、大出血、疑似卒中、妊娠等情形时，先给出转诊警示。`;

const MAX_ROUNDS = 8;

export interface TcmAgentOptions {
  skillsRoot: string;
  client?: DeepSeekClient;
}

export class TcmAgent {
  readonly client: DeepSeekClient;
  readonly skills: SkillManifest[];
  private toolIndex = new Map<string, { manifest: SkillManifest; tool: SkillTool }>();

  constructor(options: TcmAgentOptions) {
    this.client = options.client ?? new DeepSeekClient();
    this.skills = loadSkills(options.skillsRoot);
    for (const manifest of this.skills) {
      for (const tool of manifest.tools) {
        this.toolIndex.set(tool.name, { manifest, tool });
      }
    }
  }

  get ready(): boolean {
    return this.skills.length > 0;
  }

  /** Skill 的 CLI tools → OpenAI function schema。properties 由 skill.yaml 的 args 生成，避免两处维护。 */
  toChatTools(): ChatTool[] {
    return [...this.toolIndex.values()].map(({ tool }) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            tool.args.map((flag) => [flag.replace(/^--/, ''), { type: 'string' }]),
          ),
          additionalProperties: false,
        },
      },
    }));
  }

  async ask(input: string): Promise<AgentReply> {
    if (!this.ready) {
      return { text: '未发现任何 Skill，请检查 skillsRoot 路径。', steps: [], mode: 'rule' };
    }
    const chosen = this.skills.find((skill) => matchSkill(skill, input).hit);
    if (!chosen) {
      return {
        text: '输入未命中中医医案 Skill 的触发词（如建档/复诊跟进/疗效对比/治疗建议/教学文档）。',
        steps: [],
        mode: 'rule',
      };
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: input },
    ];

    if (!this.client.enabled) {
      return this.ruleRoute(chosen, input);
    }

    const steps: AgentStep[] = [];
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const result = await this.client.completions(messages, { tools: this.toChatTools(), temperature: 0.2 });
      if (result.toolCalls.length === 0) {
        return { text: result.content || '（模型未返回内容）', steps, mode: 'llm', usedSkill: chosen.id };
      }
      messages.push({
        role: 'assistant',
        content: result.content,
        tool_calls: result.toolCalls,
      });
      for (const call of result.toolCalls) {
        const executed = await this.execute(call);
        steps.push(executed);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.function.name,
          content: executed.output.slice(0, 6000),
        });
      }
    }
    const tail = await this.client.chat([...messages, {
      role: 'user',
      content: '请根据已获取的工具结果给出简明答复（中文，含必要的后续建议）。',
    }]);
    return { text: tail, steps, mode: 'llm', usedSkill: chosen.id };
  }

  async execute(call: ToolCallPayload): Promise<AgentStep> {
    const entry = this.toolIndex.get(call.function.name);
    const args = safeArgs(call.function.arguments);
    if (!entry) {
      return { tool: call.function.name, args, command: '', output: '未知工具', ok: false };
    }
    const result = await runSkillTool(entry.manifest, entry.tool, args);
    return {
      tool: call.function.name,
      args,
      command: result.command,
      output: result.ok ? result.stdout : `执行失败(${result.code}): ${result.stderr}`,
      ok: result.ok,
    };
  }

  /** 降级路由：按关键词猜一个最可能的命令，执行并把原文返回。 */
  private async ruleRoute(manifest: SkillManifest, input: string): Promise<AgentReply> {
    const lowered = input.toLowerCase();
    const toolName =
      (lowered.includes('建档') || lowered.includes('初诊') || lowered.includes('新病人') ? manifest.tools[0]?.name : undefined) ??
      (lowered.includes('建议') || lowered.includes('怎么治') || lowered.includes('取穴') ? lastByName(manifest, 'advise') : undefined) ??
      (lowered.includes('对比') || lowered.includes('疗效') ? lastByName(manifest, 'summary') : undefined);
    if (!toolName) {
      return {
        text: '未配置 DEEPSEEK_API_KEY，当前只能命中明确的关键词命令（建档/治疗建议/疗效对比）。'
          + '配置 Key 后可完整理解自然语言。',
        steps: [],
        mode: 'rule',
        usedSkill: manifest.id,
      };
    }
    const entry = this.toolIndex.get(toolName);
    if (!entry) return { text: '工具未注册', steps: [], mode: 'rule', usedSkill: manifest.id };
    const result = await runSkillTool(entry.manifest, entry.tool, guessParams(entry.tool, input));
    const step: AgentStep = {
      tool: toolName,
      args: guessParams(entry.tool, input),
      command: result.command,
      output: result.stdout || result.stderr,
      ok: result.ok,
    };
    return {
      text: `（规则降级模式，未调用大模型）\n${result.stdout || result.stderr}`,
      steps: [step],
      mode: 'rule',
      usedSkill: manifest.id,
    };
  }
}

function lastByName(manifest: SkillManifest, command: string): string | undefined {
  return manifest.tools.find((tool) => tool.command.startsWith(command))?.name;
}

function safeArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** 规则模式下从自然语句里抽取最粗糙的参数（仅供降级，模型模式不会走这里）。 */
function guessParams(tool: SkillTool, input: string): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (tool.args.includes('--text')) params.text = input;
  const pid = input.match(/P\d{8}[A-Z0-9]{4}/);
  if (pid && tool.args.includes('--patient')) params.patient = pid[0];
  if (tool.args.includes('--doctor-note')) params['doctor-note'] = input.slice(0, 400);
  if (tool.args.includes('--format')) params.format = 'view';
  return params;
}
