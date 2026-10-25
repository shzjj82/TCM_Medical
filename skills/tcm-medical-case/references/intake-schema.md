# 建档字段规范（intake schema）

建档命令：`tcm.py intake --json '{...}'`，字段以 `initial_condition` 优先；若未显式提供，则顶层字段的同名 key 会自动下沉到期初情况。

## 字段表

| 字段 | 类型 | 必填 | 说明 | 示例 |
| --- | --- | --- | --- | --- |
| `name` | string | ✅ | 真实姓名或脱敏代号 | 张某某 |
| `gender` | string | | 男/女 | 女 |
| `age` | int | | 周岁 | 52 |
| `phone` | string | | SCRM 触达用，建议脱敏 | 138****0000 |
| `chief_complaint` | string | ✅ | 主诉（症状 + 时长） | 头晕头胀 3 月 |
| `western_diagnosis` | string[] | | 西医诊断 | ["原发性高血压 2 级"] |
| `tcm_disease` | string | | 中医病名 | 眩晕 |
| `tcm_syndrome` | string | | 辨证分型 | 肝阳上亢、痰湿中阻 |
| `symptoms` | string[] | ✅ | 症状清单 | ["头晕","颈项板滞","夜寐欠安"] |
| `tongue` | string | | 舌象 | 舌红苔黄腻 |
| `pulse` | string | | 脉象 | 弦滑 |
| `severity_score` | number | ✅ | 0~10 主观严重度，**疗效对比的锚点** | 7 |
| `attachments` | string[] | | 图片/录音相对路径 | ["data/attachments/Px/tongue.jpg"] |
| `status` | string | | `active`/`paused`/`closed` | active |
| `tags` | string[] | | 自定义标签 | ["眩晕","高血压"] |

## 最小可用示例

```json
{
  "name": "李某", "gender": "男", "age": 61,
  "chief_complaint": "口干多饮、乏力半年",
  "western_diagnosis": ["2型糖尿病"],
  "tcm_syndrome": "气阴两虚",
  "symptoms": ["口干", "乏力", "夜尿频"],
  "tongue": "舌红少苔", "pulse": "细数",
  "severity_score": 6
}
```

## 规范约定

1. **严重度必须在建档时给出**：后续所有疗效判定都基于它与末期评分的差值，缺值会自动落到「待评估」。
2. **期初基线不可覆盖**：发现录入错误用 `tcm.py amend` 追加修正说明，系统会把修正挂在 `initial_condition.amendments[]`，原始值保留。`amend` 不是纠错工具，而是保留审计轨迹。
3. **可附舌苔/检查单图片**：`--image ./舌苔.jpg`，文件会复制进 `data/attachments/<PID>/`，避免原图丢失导致证据链断裂。
4. **脱敏**：若要对外写论文/教学，`phone` 与 `name` 建议在建档时就使用脱敏值。
