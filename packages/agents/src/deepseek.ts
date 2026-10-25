/**
 * DeepSeek 客户端（OpenAI 兼容协议）。
 *
 * 只用 Node 内置 fetch，不引入 SDK，方便在任意网关（官方 DeepSeek / 兼容中转）上跑。
 * 全部配置走环境变量：DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL / DEEPSEEK_MODEL / DEEPSEEK_REASONER_MODEL
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  /** 仅 assistant 消息携带：模型发起的工具调用，回灌给下一轮对话。 */
  tool_calls?: ToolCallPayload[];
}

export interface JsonSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ChatTool {
  type: 'function';
  function: { name: string; description: string; parameters: JsonSchema };
}

export interface ToolCallPayload {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatResult {
  content: string;
  toolCalls: ToolCallPayload[];
  raw: Record<string, unknown>;
}

export interface DeepSeekOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  reasonerModel?: string;
  timeoutMs?: number;
}

export class DeepSeekClient {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly reasonerModel: string;
  readonly timeoutMs: number;

  constructor(options: DeepSeekOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY ?? '';
    this.baseUrl = (options.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/+$/, '');
    this.model = options.model ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';
    this.reasonerModel = options.reasonerModel ?? process.env.DEEPSEEK_REASONER_MODEL ?? 'deepseek-reasoner';
    this.timeoutMs = options.timeoutMs ?? Number(process.env.DEEPSEEK_TIMEOUT ?? 90000);
  }

  get enabled(): boolean {
    return this.apiKey.length > 0;
  }

  status() {
    return {
      enabled: this.enabled,
      baseUrl: this.baseUrl,
      model: this.model,
      reasonerModel: this.reasonerModel,
    };
  }

  /** 文本对话。reasoner=true 时切换到推理模型（报告/教学文档/建议综合用）。 */
  async chat(messages: ChatMessage[], opts: { reasoner?: boolean; temperature?: number; maxTokens?: number } = {}): Promise<string> {
    const result = await this.completions(messages, { ...opts });
    return result.content;
  }

  /** 要求模型输出 JSON 对象；失败时抛出（上层负责降级，不让脏数据入库）。 */
  async chatJson<T>(messages: ChatMessage[], opts: { reasoner?: boolean; temperature?: number; maxTokens?: number } = {}): Promise<T> {
    const text = await this.chat(messages, { ...opts, maxTokens: opts.maxTokens ?? 4000 });
    return extractJson<T>(text);
  }

  async completions(
    messages: ChatMessage[],
    opts: { reasoner?: boolean; temperature?: number; maxTokens?: number; tools?: ChatTool[] } = {},
  ): Promise<ChatResult> {
    if (!this.enabled) {
      throw new Error('未配置 DEEPSEEK_API_KEY，无法调用 AI 能力');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const body: Record<string, unknown> = {
        model: opts.reasoner ? this.reasonerModel : this.model,
        messages,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 4000,
        stream: false,
      };
      if (opts.tools?.length) {
        body.tools = opts.tools;
        body.tool_choice = 'auto';
      }
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`DeepSeek ${res.status}: ${detail.slice(0, 300)}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string; tool_calls?: ToolCallPayload[] } }>;
      };
      const message = data.choices?.[0]?.message ?? {};
      return {
        content: (message.content ?? '').trim(),
        toolCalls: message.tool_calls ?? [],
        raw: data as Record<string, unknown>,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** 从可能被 ```json 包裹的输出里稳健抽取 JSON（对应 Python 侧 extract_json）。 */
export function extractJson<T>(text: string): T {
  if (!text) throw new Error('模型返回为空');
  const cleaned = text.replace(/^```(?:json)?/m, '').replace(/```$/m, '').trim();
  const candidates = [cleaned];
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(cleaned.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // 继续尝试下一个候选
    }
  }
  throw new Error(`模型未返回可解析的 JSON: ${text.slice(0, 200)}`);
}
