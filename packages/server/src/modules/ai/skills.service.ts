import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { join } from 'node:path';
import {
  SkillManifest,
  SkillTool,
  TcmAgent,
  loadSkills,
  runSkillTool,
} from '@tcm/agents';

/** Skill 根目录解析顺序：环境变量 → monorepo 默认路径。 */
function resolveSkillsRoot(): string {
  if (process.env.TCM_SKILLS_DIR) return process.env.TCM_SKILLS_DIR;
  return join(process.cwd(), '..', '..', 'skills');
}

@Injectable()
export class SkillsService implements OnModuleInit {
  private readonly logger = new Logger(SkillsService.name);
  private readonly root = resolveSkillsRoot();
  private manifests: SkillManifest[] = [];
  private agent?: TcmAgent;
  private index = new Map<string, { manifest: SkillManifest; tool: SkillTool }>();

  onModuleInit() {
    this.reload();
  }

  reload(): SkillManifest[] {
    this.manifests = loadSkills(this.root);
    this.index.clear();
    for (const manifest of this.manifests) {
      for (const tool of manifest.tools) this.index.set(tool.name, { manifest, tool });
    }
    this.agent = new TcmAgent({ skillsRoot: this.root });
    this.logger.log(`已加载 ${this.manifests.length} 个 Skill：${this.manifests.map((s) => s.id).join(', ')}`);
    return this.manifests;
  }

  list(): SkillManifest[] {
    return this.manifests;
  }

  listTriggers() {
    return this.manifests.map((manifest) => ({
      id: manifest.id,
      name: manifest.name,
      keywords: manifest.triggers.keywords,
      negativeKeywords: manifest.triggers.negativeKeywords,
      intents: manifest.triggers.intentRoutes,
      tools: manifest.tools.map((tool) => ({ name: tool.name, description: tool.description })),
    }));
  }

  async run(toolName: string, params: Record<string, unknown>) {
    const entry = this.index.get(toolName);
    if (!entry) {
      throw new Error(`未知 Skill 工具: ${toolName}（可用：${[...this.index.keys()].join(', ')}）`);
    }
    const result = await runSkillTool(entry.manifest, entry.tool, params);
    if (!result.ok) {
      throw new Error(`Skill 执行失败(${result.code}): ${result.stderr || result.stdout}`);
    }
    const text = result.stdout.trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as unknown;
      } catch {
        // 输出不是纯 JSON 时原样返回文本
      }
    }
    return { output: result.stdout };
  }

  async chat(message: string) {
    if (!this.agent) throw new Error('Skill 运行时未初始化');
    return this.agent.ask(message);
  }
}
