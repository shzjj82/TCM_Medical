/**
 * Skill 注册表：把仓库 skills/ 目录下的 skill.yaml 加载成可调用的工具清单。
 *
 * Agent 不需要理解 Skill 内部实现——它只需要知道：这个 Skill 什么时候该被触发
 * （triggers），以及触发后能调用哪些工具（tools → CLI 命令 + 参数）。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml, asArray, asString, type YamlValue } from '../mini-yaml';

export interface SkillTool {
  name: string;
  description: string;
  command: string;
  args: string[];
}

export interface SkillTrigger {
  intent: string;
  when: string;
  command: string;
}

export interface SkillRuntime {
  type: string;
  bin: string;
  entrypoint: string;
  requires: string[];
  python: string;
}

export interface SkillPolicy {
  mustCiteSources: boolean;
  immutableInitialCondition: boolean;
  aiConfidenceGate: number;
  disclaimer: string;
}

export interface SkillManifest {
  id: string;
  name: string;
  version: string;
  entry: string;
  runtime: SkillRuntime;
  triggers: {
    keywords: string[];
    negativeKeywords: string[];
    intentRoutes: SkillTrigger[];
  };
  tools: SkillTool[];
  policy: SkillPolicy;
  dir: string;
}

function toMap(value: YamlValue | undefined): Record<string, YamlValue> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function toTool(raw: YamlValue): SkillTool {
  const row = toMap(raw);
  return {
    name: asString(row.name),
    description: asString(row.description),
    command: asString(row.command),
    args: asArray(row.args).map((a) => asString(a)),
  };
}

export function parseSkillManifest(yaml: string, dir: string): SkillManifest {
  const root = parseYaml(yaml);
  const triggers = toMap(root.triggers);
  const runtime = toMap(root.runtime);
  const policy = toMap(root.policy);

  const intentRoutes = asArray(triggers.intent_routes).map((raw) => {
    const row = toMap(raw);
    return {
      intent: asString(row.intent),
      when: asString(row.when),
      command: asString(row.command),
    };
  });

  return {
    id: asString(root.id),
    name: asString(root.name),
    version: asString(root.version, '0.0.0'),
    entry: asString(root.entry, 'SKILL.md'),
    runtime: {
      type: asString(runtime.type, 'python'),
      bin: asString(runtime.bin, 'python3'),
      entrypoint: asString(runtime.entrypoint, 'scripts/tcm.py'),
      requires: asArray(runtime.requires).map((r) => asString(r)),
      python: asString(runtime.python, '>=3.9'),
    },
    triggers: {
      keywords: asArray(triggers.keywords).map((k) => asString(k)).filter(Boolean),
      negativeKeywords: asArray(triggers.negative_keywords).map((k) => asString(k)).filter(Boolean),
      intentRoutes,
    },
    tools: asArray(root.tools).map(toTool),
    policy: {
      mustCiteSources: asString(policy.must_cite_sources) === 'true',
      immutableInitialCondition: asString(policy.immutable_initial_condition) === 'true',
      aiConfidenceGate: Number(asString(policy.ai_confidence_gate, '0.6')),
      disclaimer: asString(policy.disclaimer),
    },
    dir,
  };
}

export function loadSkill(skillDir: string): SkillManifest {
  const file = join(skillDir, 'skill.yaml');
  if (!existsSync(file)) throw new Error(`Skill 清单不存在: ${file}`);
  return parseSkillManifest(readFileSync(file, 'utf-8'), skillDir);
}

export function loadSkills(skillsRoot: string): SkillManifest[] {
  if (!existsSync(skillsRoot)) return [];
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(skillsRoot, entry.name))
    .filter((dir) => existsSync(join(dir, 'skill.yaml')))
    .map((dir) => loadSkill(dir));
}

/** 按关键词判断用户输入是否应由某个 Skill 处理（Agent 路由的第一道闸）。 */
export function matchSkill(manifest: SkillManifest, input: string): { hit: boolean; reason: string } {
  const { keywords, negativeKeywords } = manifest.triggers;
  const negative = negativeKeywords.find((word) => input.includes(word));
  if (negative) return { hit: false, reason: `命中负向词：${negative}` };
  const positive = keywords.find((word) => input.toLowerCase().includes(word.toLowerCase()));
  if (!positive) return { hit: false, reason: '未命中任何触发词' };
  return { hit: true, reason: `命中触发词：${positive}` };
}
