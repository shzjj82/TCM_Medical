<!-- 病人详情页「期初 → X 次治疗 → 末期」区块的渲染参考（对齐 data/patients/<PID>.json 的 contrast 字段） -->

┌─ 期初情况 · {{initial.date}} · 严重度 {{initial.severity_score}}/10 ─────────────┐
│  {{initial.summary}}                                                            │
│  {{initial.attachments 缩略图}}                                                 │
└─ 诊疗前基线 ────────────────────────────────────────────────────────────────────┘
                                   ↓
                        经过 {{visits_done}} 次治疗
                    （{{treatments：针灸 n 次 · 中药 m 诊 · …}}）
                                   ↓
┌─ 最新 / 末期情况 · {{latest.date}} · 严重度 {{latest.severity_score}}/10 ────────┐
│  {{latest.summary}}                                                             │
│  {{latest.attachments 缩略图}}                                                  │
└─ 第 {{visits_done}} 诊后 ───────────────────────────────────────────────────────┘

【疗效判定】{{delta.verdict}}
【严重度变化】{{delta.severity_delta}}（改善幅度 {{delta.improvement_rate}}）
【关键转折】
  · 第{{milestone.visit_no}}诊（{{milestone.date}}）：{{milestone.key_change}}
【期初基线修正】
  · {{amendment.at}} {{amendment.field}}：{{amendment.note}}

<!--
渲染约定：
1. 该区块固定在病人详情页首屏置顶，不得折叠，是疗效沟通的主视觉；
2. 期初用中性色（石板灰）、末期用主色（草本绿），中间箭头区显示治疗次数徽章；
3. 严重度用 0~10 的进度条/环形图呈现双值对比，禁止只展示单一数字；
4. 数据只读 `contrast`，前端不得自行推算，避免与后端口径不一致。
-->
