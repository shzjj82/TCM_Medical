# 中医诊所医案沉淀平台（TCM Medical Case Vault）

把一间中医诊所每天发生的 **接诊 → 复诊 → 疗效 → 经验** 闭环，沉淀成可检索、可教学、可复用的结构化资产。

核心是一个 Agent Skill（`skills/tcm-medical-case`），外围是一套可以把它跑起来的工程：Vite + React + Tailwind + shadcn/ui 前端、NestJS + PostgreSQL + TypeORM 服务端、以及把 Skill 注册为 LLM 工具的 Agent 运行时。

## 一、它解决什么

| 业务诉求 | 实现 |
| --- | --- |
| 病人 SCRM：初始录入、每次跟进（语音/图片/文字 + AI 解析）、清晰呈现「期初情况 → 经过 X 次治疗 → 末期情况」 | `intake` / `followup` / `summary`，前端病人详情页首屏对比卡片 |
| 结构化医生经验：**高血压取曲池，糖尿病取承山，足三里调理中焦气机** 这类口语 → 病名/证型/治法/取穴/方剂 | `followup --doctor-note`（原话永不过洗，另存 `doctor_note_raw`） |
| 汇总所有病症与医生描述 → 疗效总结报告 + 教学文档 → 内部治疗资料库 | `report` / `teach` / `kb build` |
| 手动录入外部参考（经方/古籍/指南/论文）→ 外部参考库；接诊时联合内外部库给建议 | `ref add` / `advise` |

## 二、目录结构

```
TCM_Medical/
├── apps/web                  # Vite + React 18 + Tailwind + shadcn/ui
│   └── src/pages            # 病人档案 / 病人详情（疗效对比）/ 资料库 / 治疗建议 / Skill 面板
├── packages/server          # NestJS + TypeORM + PostgreSQL
│   ├── entities             # Patient / Visit / ExternalReference / InternalProtocol
│   └── modules              # patients / knowledge / ai（DeepSeek + Skill 执行 + Agent）
├── packages/agents          # Agent 运行时：DeepSeek 客户端 + Skill 注册表 + 工具执行器
├── skills/tcm-medical-case  # ★ 核心 Skill（SKILL.md + Python CLI + references）
│   ├── SKILL.md             # Agent 执行契约：触发词、意图路由、执行逻辑、质量红线
│   ├── skill.yaml           # 机器可读元数据（工具清单、环境变量、安全策略）
│   ├── scripts              # tcm.py CLI + 业务内核（零第三方依赖）
│   ├── references           # 建档规范 / 解析规则 / 术语词典 / 取穴映射 / 报告模板
│   ├── data                 # 运行时数据（JSON，可直接 Git 沉淀）
│   └── output               # 报告与教学文档产物
├── .env.example
└── README.md
```

## 三、快速开始

### 1. 前置条件
- Node ≥ 20（pnpm 9+）
- Python ≥ 3.9（Skill 零第三方依赖）
- PostgreSQL ≥ 12

### 2. 配置环境变量
```bash
cp .env.example .env
```
必填/关键项：
- `DEEPSEEK_API_KEY`：DeepSeek API Key（OpenAI 兼容协议，可换 `DEEPSEEK_BASE_URL` 指向任意兼容网关）
- `DB_*`：PostgreSQL 连接信息
- `ASR_PROVIDER` / `VISION_PROVIDER`：**可选**。DeepSeek 本身不具备语音识别与视觉能力，语音/图片解析需另配 OpenAI 兼容 Provider；不配也能跑，素材会归档并标记「待人工补录」。

### 3. 安装与启动
```bash
pnpm install
pnpm dev          # 同时起前端(3000) 与服务端(3001)
```
仅跑服务端：`pnpm dev:server`；仅跑前端：`pnpm dev:web`。

### 4. 初始化数据库
开发模式下 `DB_SYNCHRONIZE=true`（默认）会自动建表。**生产请关闭 synchronize 并使用 migration。**

### 5. 跑 Skill 冒烟测试（不依赖数据库）
```bash
python3 skills/tcm-medical-case/scripts/smoke_test.py        # 数据写临时目录
python3 skills/tcm-medical-case/scripts/smoke_test.py --persist  # 写入 data/
```

离线也能验证 AI 分支（不消耗 token）：
```bash
python3 skills/tcm-medical-case/scripts/mock_provider.py --port 8899 &
DEEPSEEK_API_KEY=test DEEPSEEK_BASE_URL=http://127.0.0.1:8899/v1 \
  python3 skills/tcm-medical-case/scripts/smoke_test.py
```

## 五之一、已实测结果（本机，DeepSeek 真实调用）

| 场景 | 结果 |
| --- | --- |
| 无 Key 规则模式全链路 | PASS（3 诊次，严重度 6→2，判定「有效」，改善 67%） |
| 有 Key AI 模式全链路 | PASS（取穴/方剂/报告/教学文档均由模型生成，建议带 `EXT-*`/`INT-*`/`CASE-*` 来源） |
| 安全红线 | 「孕妇 + 剧烈头痛」命中禁用提示 |

期间修掉的两个真实缺陷（已回归验证）：
1. **模型返回尾随逗号**导致 `json.loads` 失败 → AI 产物被误判为失败并降级为规则草稿。现 `extract_json` 增加去注释/去尾随逗号的容错层。
2. **`deepseek-reasoner` 把输出预算耗在思维链上，正文为空** → 现已针对推理模型加倍 `max_tokens` 上限，并在正文为空时自动回落到通用模型重试。

> TypeScript 侧的 `pnpm install / build` 在本次沙箱环境中被代理策略阻断（包管理器写入被拒），未能完成编译验证，请在正常终端执行：
> `pnpm install && pnpm --filter @tcm/agents build && pnpm typecheck`

## 四、Skill 命令手册

统一入口：`python3 skills/tcm-medical-case/scripts/tcm.py <command> [options]`

| 命令 | 作用 | 示例 |
| --- | --- | --- |
| `doctor` | 环境自检 + Provider 能力矩阵 | `tcm.py doctor` |
| `intake` | 建档，录入期初情况 | `tcm.py intake --json '{...}'` |
| `followup` | 复诊跟进（语音/图片/文字/批注） | `tcm.py followup --patient <PID> --doctor-note "…" --text "…" --severity 4` |
| `summary` | 期初→X次治疗→末期 对比 | `tcm.py summary --patient <PID>` |
| `report` | 疗效总结报告 | `tcm.py report --scope cohort --period 2026-01:2026-03` |
| `teach` | 生成教学文档 | `tcm.py teach --topic "消渴（气阴两虚）" --level 规培医师` |
| `ref add/import/list/search` | 外部参考库维护 | `tcm.py ref add --title "消渴方" --source "《丹溪心法》" --tags "消渴,糖尿病"` |
| `advise` | 治疗建议（内外部库联合） | `tcm.py advise --text "头晕耳鸣、血压160/95、舌红少苔脉弦细"` |
| `kb build/search` | 内部治疗资料库重建与检索 | `tcm.py kb build` |
| `sync` | 本地 JSON → PostgreSQL | `tcm.py sync --server http://localhost:3001` |

完整触发词与意图路由见 [`skills/tcm-medical-case/SKILL.md`](skills/tcm-medical-case/SKILL.md)。

## 五、数据契约要点

- **`initial_condition` 不可覆盖**：纠错用 `amend` 追加修正意见，保证疗效对比可信。
- **`contrast`** 是前端「期初 → N 次治疗 → 末期」区块的唯一数据源，含 `visits_done / treatments / delta.verdict / delta.improvement_rate / milestones`。
- **每次复诊保留原始素材**：`raw.material` 与 `raw.media[]`，任何时候都能回溯重解析。
- **`review_status`**：AI 产物默认 `pending`，医师确认后才算可靠；求和建议 confirm 后参与统计。

## 六、HTTP API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 服务健康 + AI Provider 状态 |
| GET | `/api/patients` | 病人列表（支持 `q` / `status`） |
| GET | `/api/patients/:key` | 病人详情 + 全部复诊 |
| POST | `/api/patients/sync` | 幂等同步（按 externalId） |
| GET/POST | `/api/visits`、`/api/visits/sync` | 复诊记录 |
| PATCH | `/api/visits/:externalId/review` | 确认/驳回 AI 抽取结果 |
| GET/POST | `/api/knowledge/external`、`/api/knowledge/internal` | 外部/内部资料库检索与同步 |
| POST | `/api/ai/advise` | 治疗建议 |
| POST | `/api/ai/parse` | 文本 → 结构化医案（预览） |
| GET/POST | `/api/skills/triggers`、`/api/skills/run`、`/api/skills/chat` | Skill 清单 / 执行 / Agent 自然语言调用 |

## 七、质量红线

1. AI 不编造：无法确认的剂量、既往史、过敏史一律 `null` 并列入 `uncertain_fields`。
2. 建议必带引用来源（`EXT-*` / `INT-*` / `CASE-*`），无来源的建议不输出。
3. 命中胸痛剧烈、意识障碍、大出血、疑似卒中、妊娠、十八反十九畏等 → 先输出转诊/禁忌警示。
4. 所有输出标注「由 AI 辅助生成，须经执业医师审核」，不得直接作为处方交付患者。
