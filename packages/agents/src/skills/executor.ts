/**
 * Skill 工具执行器：把 LLM 的 tool_call 翻译成 Skill CLI 调用。
 *
 * 约定：skill.yaml 里 tools[].args 写的就是 CLI 的 flag 名（如 --doctor-note），
 * 因此这里只需做「参数归一化 + 拼命令行 + 执行」，不需要维护第二份参数映射表。
 */
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import type { SkillManifest, SkillTool } from './registry';

export interface RunOptions {
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

export interface RunResult {
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
  code: number;
}

function normalizeFlag(key: string): string {
  return key.startsWith('--') ? key : `--${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
}

function toValue(value: unknown): { flagOnly?: boolean; text?: string } {
  if (value === true) return { flagOnly: true };
  if (value === false || value === undefined || value === null) return { flagOnly: false };
  return { text: String(value) };
}

/**
 * 把 key/value 参数映射为命令行。
 * 只接受 skill.yaml 中声明过的 flag，避免任意参数注入（例如多余的分隔符或 flag）。
 */
export function buildArgs(tool: SkillTool, params: Record<string, unknown>): string[] {
  const allowed = new Set(tool.args.map(normalizeFlag));
  const argv: string[] = [tool.command];
  for (const [key, value] of Object.entries(params ?? {})) {
    const flag = normalizeFlag(key);
    if (!allowed.has(flag)) continue;
    const converted = toValue(value);
    if (converted.flagOnly) {
      argv.push(flag);
      continue;
    }
    if (converted.text === undefined) continue;
    argv.push(flag, converted.text);
  }
  return argv;
}

export function runSkillTool(
  manifest: SkillManifest,
  tool: SkillTool,
  params: Record<string, unknown>,
  options: RunOptions = {},
): Promise<RunResult> {
  const argv = [manifest.runtime.entrypoint, ...buildArgs(tool, params)];
  const command = [manifest.runtime.bin, ...argv].join(' ');
  return new Promise((resolve) => {
    execFile(
      manifest.runtime.bin,
      argv,
      {
        cwd: manifest.dir,
        timeout: options.timeoutMs ?? 120000,
        env: { ...process.env, ...(options.env ?? {}) },
        maxBuffer: 8 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const code = error ? (error as NodeJS.ErrnoException & { code?: number }).code ?? -1 : 0;
        resolve({
          ok: code === 0,
          command,
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
          code: typeof code === 'number' ? code : -1,
        });
      },
    );
  });
}

/** JSON 输出命令自动反序列化，便于上层直接拿对象。 */
export async function runSkillToolJson<T>(
  manifest: SkillManifest,
  tool: SkillTool,
  params: Record<string, unknown>,
  options: RunOptions = {},
): Promise<T> {
  if (!params.format) params = { ...params, format: 'json' };
  const result = await runSkillTool(manifest, tool, params, options);
  const text = result.stdout.trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1)) as T;
    } catch {
      throw new Error(`Skill 返回无法解析：${result.stderr || text.slice(0, 200)}`);
    }
  }
  throw new Error(`Skill 未返回 JSON：${result.stderr || result.stdout.slice(0, 200)}`);
}

export function resolveSkillTools(manifest: SkillManifest): SkillTool[] {
  return manifest.tools.filter((tool) => tool.command.length > 0);
}

export function skillEntrypointPath(manifest: SkillManifest): string {
  return join(manifest.dir, manifest.runtime.entrypoint);
}
