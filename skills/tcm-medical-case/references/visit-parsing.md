# 多模态跟进与解析规则（visit parsing）

一次 `followup` 的处理管线固定为五段，任何一段失败都不应中断主流程，而是降级并在产物里留痕。

```
采集 → 归一 → 结构化抽取 → 对比更新 → 计数
```

## 1. 采集（Acquisition）

| 渠道 | 参数 | 处理 | 无 Provider 时的行为 |
| --- | --- | --- | --- |
| 语音 | `--audio ./录音.m4a` | ASR 转写（`ASR_PROVIDER=openai\|whisper_local`） | 归档原文件，写 `pending_transcription`，提示人工补录 |
| 图片 | `--image ./舌苔.jpg` | 视觉解析：分类 + OCR + 客观所见 + 临床提示 | 归档原文件，写 `[图片]（未解析）` |
| 文字 | `--text "..."` | 原样入库 | — |
| 医生批注 | `--doctor-note "..."` | 原样保留为 `doctor_note_raw`，是经验沉淀的主要来源 | — |

所有原始素材都写入 `visit.raw.material` 与 `visit.raw.media[]`，保证任何时候都能回溯重解析。

## 2. 归一（Normalization）

把多渠道素材按 `[渠道]\n内容` 拼接成一段 material，交给 LLM 生成 120~300 字规范门诊病历叙述。拼接顺序固定为：录音转写 → 图片 → 现场文字 → 医生批注，让最权威的医生批注处于上下文末尾（对模型权重更高）。

## 3. 结构化抽取（Extraction）

目标 JSON 见 `lib_case.PARSE_USER`，核心字段：

- `tcm_disease` / `tcm_syndrome` / `treatment_principle`：规范化术语
- `acupoints[]`：`name / laterality / manipulation / retention_min / depth_cun / rationale`
- `prescriptions[]`：`name / composition / dosage / usage`
- `efficacy`：`patient_reported` / `doctor_assessment` / `suggested_severity`
- `uncertain_fields[]`：**AI 不确定字段必须列出，这是防止幻觉的关键机制**

### Prompt 铁律
1. 只提炼素材中真实存在的信息；
2. 剂量、既往史、过敏史等无法确认的一律 `null`；
3. 输出单个 JSON 对象，禁止代码块；

## 4. 对比更新（Diff）

- 严重度取值优先级：`--severity` > AI `suggested_severity` > 继承上次。
- 症状增减通过 `summarize_delta()` 与上一次复诊的症状集合做差集，输出「缓解或消失症状 / 新增症状 / 患者自述」。
- 每次訪都写入 `review_status: pending`，医生确认后方可流转（UI 侧做角标提示）。

## 5. 计数（Counting）

同一 `--visit-date` 重复提交视为更新该次记录，不重复累加 `visit_count`（幂等性要求）。

## 降级矩阵

| 缺失能力 | 表现 | 产物标记 |
| --- | --- | --- |
| 无 `DEEPSEEK_API_KEY` | 词典关键词抽取 | `ai_mode: rule_based` |
| 有 Key 但调用失败 | 回落到词典抽取并记录错误 | `ai_mode: rule_based_fallback` |
| 无 ASR | 录音归档待补录 | `media[].degraded: true` |
| 无 Vision | 图片归档待描述 | `media[].degraded: true` |
| 无 Thinking 模型 | 报告/教学文档只出统计版 | `分析章缺失` |
