---
name: tcm-medical-case
description: 中医诊所医案沉淀与治疗决策助手。当用户要完成以下任一事情时使用：建立/更新病人 SCRM 档案（初诊建档、主诉、舌脉、期初情况）；记录复诊跟进（接入语音录音、舌苔/处方/检查单图片、医生口述文字并使 AI 解析为结构化医案）；查看或生成病人「期初情况 → 经过 X 次治疗 → 末期情况」的疗效对比总结；整理医生 describe 的病症-治法-取穴/方剂经验（如高血压取曲池、糖尿病取承山、足三里调理中焦气机）沉淀为内部治疗资料库与教学文档；手动录入外部参考资料（经方、古籍、指南、论文病例）建立外部参考库；或输入病人情况后检索内部+外部资料库给出治疗建议。触发词包括：医案、病案、病例、接诊、建档、初诊、复诊、跟诊、诊疗记录、治疗跟进、上传病历、疗效对比、治疗总结、病例报告、教学文档、经验传承、内部资料库、外部参考库、参考资料录入、取穴建议、针灸方案、方剂推荐、中医治疗建议、TCM case、acupuncture record。不要用于处理药材采购、诊所排班、财务收费或非医疗内容。
version: 1.0.0
license: MIT
agent_created: true
---

# 中医诊所医案沉淀 Skill（TCM Medical Case Vault）

把一间中医诊所每天发生的**接诊 → 复诊 → 疗效 → 经验**闭环，沉淀成可检索、可教学、可复用的结构化资产。

---

## 1. 能力边界（4 条业务主线）

| 编号 | 业务能力 | 对应命令 |
| --- | --- | --- |
| A | **病人 SCRM**：初始录入病人情况，每次诊疗跟进（语音/图片/文字），AI 解析后更新最新情况，并在病人界面呈现显著的「期初情况 → 经过 X 次治疗 → 末期情况」疗效对比 | `intake` / `followup` / `summary` |
| B | **医生经验结构化**：把医生口语化描述（"高血压取曲池，糖尿病取承山，配足三里调理中焦气机"）解析成「病症—证型—治法—取穴/方剂—操作手法」标准条目 | `followup --doctor-note` / `parse` |
| C | **内部治疗资料库**：跨病人汇总全部病症与医生描述，生成疗效总结报告 + 教学文档 | `teach` / `report` |
| D | **外部参考库 + 治疗建议**：手动录入外部方案（经方、古籍、指南、论文），接诊时联合内外部库给出建议 | `ref add` / `advise` |

---

## 2. 触发词与意图路由（Decision Router）

收到用户请求后，**先判定意图，再选择唯一执行路径**：

| 优先级 | 判断依据（命中任一即路由） | 执行动作 |
| --- | --- | --- |
| 1 | 出现"建档/初诊/新病人/录入病人/初始情况/登记"，且尚无 patient_id | `intake` |
| 2 | 出现"复诊/跟进/今天又来/第 N 次治疗/上传录音/上传舌苔图/这张处方"，附带媒体或文本 | `followup`（自动识别 `--audio` / `--image` / `--text`） |
| 3 | 出现"疗效对比/恢复得怎么样/期初到现在/末期情况/治疗了几次" | `summary --patient <id> --format view`（默认渲染三段对比卡片） |
| 4 | 出现"总结/报告/月度总结/病例报告/疗效分析" | `report --scope <patient\|cohort\|all>` |
| 5 | 出现"教学文档/带教/经验传承/内部资料库/规培教材" | `teach --topic <病症或证型>` |
| 6 | 出现"录入参考/外部资料/经方/古籍/指南/论文病例" | `ref add` |
| 7 | 出现"给建议/怎么治/取什么穴/用什么方/治疗建议/推荐方案"，且已提供病人情况 | `advise --patient <id>` 或 `advise --text "<病人情况>"` |
| 8 | 出现"查/看/找/显示"病人或病例 | `list` / `show` |

**负向触发（不要加载本 Skill）**：药材进销存、诊所排班挂号、财务收款、非医疗闲聊。

---

## 3. 执行逻辑（Standard Operating Procedure）

### Step 0 · 环境与配置自检（每次进入先做一次）
```bash
python3 scripts/tcm.py doctor          # 检查 Python / DEEPSEEK_API_KEY / 数据目录 / Provider 能力矩阵
```
- 缺 `DEEPSEEK_API_KEY` → **不阻断**，自动进入「规则降级模式」：用 `references/tcm-terminology.md` 词典做关键词抽取，产物打上 `ai_mode: rule_based` 标签，后续可补跑 AI 增强。
- 未配 `ASR_PROVIDER` / `VISION_PROVIDER` → 语音/图片输入提示降级，要求改用文字补录，或直接跳过媒体解析。

### Step 1 · 建档（业务 A）
```bash
python3 scripts/tcm.py intake --json '{"name":"张某某","gender":"女","age":52,"phone":"138****","chief_complaint":"头晕头胀3月"}'
python3 scripts/tcm.py intake --json-file ./intake.json --image ./舌苔.jpg     # 支持附初始舌苔/检查单
```
产物：`data/patients/<PID>.json`，其中 `initial_condition` 是**不可变基线**（后续只允许追加修正意见，不覆盖原值，保证疗效对比可信）。

### Step 2 · 每次跟进（业务 A + B）
```bash
python3 scripts/tcm.py followup --patient P20260101XXXX \
  --audio ./复诊录音.m4a --image ./舌苔2.jpg \
  --doctor-note "高血压取曲池、太冲，糖尿病配承山，加足三里以调中焦气机，平补平泻，留针20分钟"
```
处理管线（严格 5 段）：
1. **采集**：音频 → ASR 转写；图片 → OCR/视觉描述；文字原样保留。三种原文都落盘到 `data/visits/<PID>/V<NN>/raw/` 保留证据。
2. **归一**：调用 AI（或规则）把原始素材合并成一段**标准医案叙述**。
3. **结构化抽取**：产出 `tcm_syndrome / treatment_principle / acupoints[] / herbs[] / manipulations / advice / efficacy`。
4. **对比更新**：与上一次 `current_condition` 做 diff，生成 `delta`，写入本次 `outcome`，并刷新病人 `current_condition`。
5. **计数**：`visit_count += 1`，更新 `latest_summary`。

### Step 3 · 疗效对比（业务 A 的展示要求）
```bash
python3 scripts/tcm.py summary --patient <PID> --format view
```
输出**三段对比结构**（前端据此渲染显著区块，见 §5 数据契约）：
```
[期初情况] 2026-01-05 · 头晕头胀、血压 158/96、舌红苔黄腻、脉弦滑 · 严重度 7/10
     ↓ 经过 6 次治疗（针灸 5 次 + 中药 4 诊）
[末期/最新情况] 2026-03-12 · 头晕消失、血压 132/84、苔薄白、脉弦缓 · 严重度 2/10
[疗效判定] 显效（改善 71%）
```

### Step 4 · 内部资料库（业务 C）
```bash
python3 scripts/tcm.py report --scope cohort --period 2026-01:2026-03      # 疗效总结报告
python3 scripts/tcm.py teach  --topic "高血压" --level 住院医师             # 教学文档
python3 scripts/tcm.py kb search --q "足三里 中焦气机"                      # 资料库检索
```
自动流程：拉取全部 `visits` → 按病症/证型聚类 → 统计取穴频次、方剂频次、有效率 → 用 AI 撰写报告 → 落 `output/internal/<doc>.md` 并写索引。

### Step 5 · 外部参考库与治疗建议（业务 D）
```bash
python3 scripts/tcm.py ref add --json '{"title":"天麻钩藤饮","source":"《中医内科学》","tags":["眩晕","肝阳上亢"],"content":"..."}'
python3 scripts/tcm.py ref import --file ./refs.csv
python3 scripts/tcm.py advise --patient <PID> --top-k 5        # 或 --text "<病人情况自由文本>"
```
`advise` 检索顺序：**外部参考库 → 内部资料库 → 本院同类高疗效医案**，最后交由模型综合成带**引用来源**的方案；输出必须包含 `安全红线校验` 结论。

### Step 6 · 沉淀到服务端
```bash
python3 scripts/tcm.py sync --server http://localhost:3001     # 把本地 JSON 推送到 NestJS/PostgreSQL
```

---

## 4. 命令手册（CLI）

统一入口：`python3 scripts/tcm.py <command> [options]`

| 命令 | 说明 | 关键参数 |
| --- | --- | --- |
| `doctor` | 环境自检 + Provider 能力矩阵 | — |
| `intake` | 建档 | `--json` / `--json-file` / `--image` / `--audio` |
| `followup` | 复诊跟进（多模态） | `--patient` / `--audio` / `--image` / `--text` / `--doctor-note` / `--visit-date` |
| `parse` | 只做解析不落库 | `--doctor-note` |
| `summary` | 三段对比 | `--patient` / `--format view\|md\|json` |
| `list` / `show` | 病人列表 / 详情 | `--patient` / `--q` / `--status` |
| `report` | 疗效总结报告 | `--scope patient\|cohort\|all` / `--period` / `--patient` |
| `teach` | 教学文档 | `--topic` / `--level` |
| `ref add` | 录入外部参考 | `--json` / `--title` / `--source` / `--tags` / `--file` |
| `ref import` | 批量导入 CSV/JSON | `--file` |
| `ref list` / `ref search` | 查阅外部库 | `--q` / `--tag` |
| `advise` | 治疗建议 | `--patient` / `--text` / `--top-k` |
| `kb search` | 内部资料库检索 | `--q` |
| `sync` | 同步到服务端 | `--server` / `--token` / `--patient` |

`python3 scripts/tcm.py <command> --help` 查看完整参数。

---

## 5. 数据契约（前端渲染依据）

**病人档案 `data/patients/<PID>.json` 关键字段**
```jsonc
{
  "id": "P20260105A1B2",
  "name": "张某某", "gender": "女", "age": 52, "phone": "138****",
  "status": "active",                 // active | paused | closed
  "visit_count": 6,
  "initial_condition": {              // 期初基线，写入后不可覆盖
    "date": "2026-01-05",
    "chief_complaint": "头晕头胀3月",
    "western_diagnosis": ["原发性高血压2级"],
    "tcm_disease": "眩晕",
    "tcm_syndrome": "肝阳上亢、痰湿中阻",
    "symptoms": ["头晕", "头胀", "颈项板滞", "夜寐欠安"],
    "tongue": "舌红苔黄腻", "pulse": "弦滑",
    "severity_score": 7,              // 0~10
    "attachments": ["initial/tongue.jpg"]
  },
  "current_condition": { /* 同结构，每次 followup 覆盖，代表最新 */ },
  "contrast": {                       // ← 前端「期初→X次治疗→末期」显著区块直接读这里
    "initial":  { "date": "...", "summary": "...", "severity_score": 7, "attachments": [...] },
    "visits_done": 6,
    "treatments": ["针灸 5 次", "中药 4 诊"],
    "latest": { "date": "...", "summary": "...", "severity_score": 2, "attachments": [...] },
    "delta": { "severity_delta": -5, "improvement_rate": 0.71, "verdict": "显效" },
    "milestones": [ { "visit_no": 3, "date": "...", "key_change": "头晕发作频次由每日降至每周1次" } ]
  },
  "tags": ["眩晕", "高血压"]
}
```
**复诊记录 `data/visits/<PID>/V<NN>.json`** 含 `raw`（原文/媒体路径）、`doctor_note`、`parsed`（结构化）、`outcome`（`symptom_changes` / `severity_score` / `doctor_conclusion` / `next_plan`）、`ai_mode`、`review_status`（`pending` → 医生确认后 `confirmed`）。

---

## 6. AI Provider 配置（环境变量）

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | — | 必填才有 AI 模式，否则降级为规则模式 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | OpenAI 兼容，可换任意兼容网关 |
| `DEEPSEEK_MODEL` | `deepseek-chat` | 常规解析 |
| `DEEPSEEK_REASONER_MODEL` | `deepseek-reasoner` | 报告/教学文档/建议综合，追求推理质量 |
| `ASR_PROVIDER` | `none` | `none\|openai\|whisper_local`；语音转写 |
| `VISION_PROVIDER` | `none` | `none\|openai`；舌苔图/处方图 OCR |
| `TCM_SKILL_DATA_DIR` | `skills/tcm-medical-case/data` | 本地资料库 |
| `TCM_SKILL_OUTPUT_DIR` | `skills/tcm-medical-case/output` | 报告与教学文档输出 |
| `TCM_API_BASE_URL` | `http://localhost:3001` | 服务端同步地址 |

DeepSeek 本身**不具备** ASR 与视觉能力，语音/图片需另配 OpenAI 兼容 Provider；未配置时 Skill 会明确提示降级而非静默失败。

---

## 7. 质量红线（必须遵守）

1. **不编造**：AI 无法从素材中确认的信息（剂量、既往史、过敏史）一律 `null` + `review_status: pending`，绝不补全。
2. **基线不可变**：`initial_condition` 只追加 `amendments[]`，不直接改写，否则疗效对比失真。
3. **必带引用**：`advise` 输出的每条建议必须标注来源（`external:<id>` / `internal:<doc>` / `case:<pid>#V<nn>`），无来源的建议不得输出。
4. **安全校验**：出现胸痛剧烈、意识障碍、大出血、急腹症、疑似卒中、妊娠禁忌、`十八反/十九畏`配伍冲突 → 输出转诊/禁忌警示，**不给出纯中医保守方案**。
5. **知情边界**：所有输出标注"由 AI 辅助生成，须经执业医师审核"，不能直接作为处方交付患者。
6. **幂等**：同一 `--visit-date` 重复执行 `followup` 视为更新该次记录，不重复计数。

---

## 8. 目录结构

```
skills/tcm-medical-case/
├── SKILL.md                    # 本文件：Agent 的执行契约
├── skill.yaml                  # 机器可读元数据（供 packages/agents 注册为工具）
├── scripts/
│   ├── tcm.py                  # CLI 总入口 + 意图路由辅助
│   ├── lib_storage.py          # JSON 文件存储层（零第三方依赖）
│   ├── lib_ai.py               # DeepSeek / ASR / Vision Provider 抽象
│   ├── lib_case.py             # 业务内核：建档/跟进/对比/汇报/建议
│   └── sync_to_server.py       # 本地 → NestJS/PostgreSQL 同步
├── references/
│   ├── intake-schema.md        # 建档字段规范 & 示例
│   ├── visit-parsing.md        # 多模态解析规则与 Prompt 模板
│   ├── tcm-terminology.md      # 证型/治法/方剂/穴位词典（规则降级模式用）
│   ├── acupuncture-map.md      # 病症—取穴经验映射（含高血压→曲池等院内置式）
│   └── report-templates.md     # 总结报告 & 教学文档模板
├── templates/
│   ├── summary-report.md
│   ├── teaching-doc.md
│   └── contrast-view.md        # 「期初→X次治疗→末期」卡片模板
├── data/                       # 运行时数据（Git 可追，含病例主数据）
└── output/                     # 报告、教学文档产物
```

---

## 9. 参考实现（Agent 可直接复用的典型调用序列）

```bash
# ① 建档
python3 scripts/tcm.py intake --json '{"name":"李某","gender":"男","age":61,"chief_complaint":"口干多饮、乏力半年","western_diagnosis":["2型糖尿病"],"tcm_syndrome":"气阴两虚","symptoms":["口干","乏力","夜尿频"],"tongue":"舌红少苔","pulse":"细数","severity_score":6}'

# ② 第1次跟进（语音+医生批注）
python3 scripts/tcm.py followup --patient <PID> \
  --doctor-note "糖尿病取承山、胰俞，配足三里调理中焦气机，健脾益气；加太溪养阴，毫针平补平泻，留针30分钟" \
  --text "今日精神好转，口干减轻" --severity 5

# ③ 查看三段对比
python3 scripts/tcm.py summary --patient <PID> --format view

# ④ 沉淀教学文档
python3 scripts/tcm.py teach --topic "消渴（气阴两虚）" --level 规培医师

# ⑤ 新病人给建议（联合内外部资料库）
python3 scripts/tcm.py advise --text "女，58岁，头晕耳鸣、腰膝酸软、血压160/95，舌红少苔脉弦细" --top-k 5
```
