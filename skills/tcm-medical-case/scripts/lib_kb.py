"""业务内核 C/D：外部治疗参考库、内部治疗资料库（总结报告 + 教学文档）、联合检索治疗建议。"""
from __future__ import annotations

import csv
import json
import re
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from lib_ai import AIEngine, extract_json
import lib_storage as store
import lib_case as case

DISCLAIMER = case.DISCLAIMER
EFFECTIVE_VERDICTS = {"临床痊愈", "显效", "有效", "好转"}

REPORT_SYSTEM = """你是中医临床研究中心主任，负责把诊所真实医案沉淀成可复用的治疗规范。
只依据提供的数据做归纳，不做数据之外的医学断言；频次、有效率必须来自统计结果。
输出 Markdown，结构清晰，含表格；不要编造病例编号。"""

TEACH_SYSTEM = """你是中医临床带教老师，为{level}撰写规范的教学文档。
要求：概念准确、层次分明、突出"为什么这么治"，每项建议都要标注来自本院医案还是外部文献。
输出 Markdown。"""

ADVISE_SYSTEM = """你是给中医师提供决策支持的助手（不是给患者的处方生成器）。
规则：
1. 只使用【参考资料】中的条目，每条建议必须用 [来源ID] 标注出处；
2. 参考资料不足以支撑的部分，写"证据不足，建议上级医师会诊"，不要发挥；
3. 输出前做安全红线自查，命中禁忌必须写在最前面；
4. 输出 JSON，不要代码块。"""

ADVISE_USER = """【病人情况】
{case_text}

【外部治疗参考资料库命中】
{external}

【内部治疗资料库命中（本院沉淀）】
{internal}

【本院相似医案（经疗效验证）】
{cases}

【输出 JSON】
{{
  "case_profile": {{"tcm_disease": "...", "tcm_syndrome": "...", "western_diagnosis": ["..."], "key_symptoms": ["..."]}},
  "safety_alerts": ["命中的红色禁忌/必须排除的急症"],
  "treatment_principle": "治则治法",
  "acupuncture_plan": [{{"point": "曲池", "laterality": "双", "manipulation": "平补平泻", "retention_min": 20, "rationale": "...", "source": "EXT-xxx|INT-xxx|CASE-Pxxx#V1"}}],
  "herbal_plan": [{{"formula": "天麻钩藤饮", "modification": "加减", "source": "EXT-xxx", "note": null}}],
  "lifestyle_advice": ["..."],
  "followup_plan": "复诊安排与疗效观察指标",
  "evidence_summary": {{"external_hits": ["EXT-xxx"], "internal_hits": ["INT-xxx"], "case_hits": ["CASE-Pxxx#V1"], "insufficient_fields": ["..."]}},
  "confidence": 0.0
}}"""


# ================================================================ D-1 外部参考库
def _clean_list(value: Any) -> List[str]:
    if not value:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    return [s.strip() for s in re.split(r"[,，、/|；;]+", str(value)) if s.strip()]


def make_reference(payload: Dict[str, Any]) -> Dict[str, Any]:
    rid = store.new_id("EXT-")
    return {
        "id": rid,
        "title": payload.get("title") or "未命名参考条目",
        "source_type": payload.get("source_type") or "未分类",   # 经方|古籍|指南|论文病例|专家经验|其他
        "source": payload.get("source") or payload.get("citation") or None,
        "citation": payload.get("citation"),
        "tags": _clean_list(payload.get("tags")),
        "indications": _clean_list(payload.get("indications")),
        "syndromes": _clean_list(payload.get("syndromes")),
        "acupoints": _clean_list(payload.get("acupoints")),
        "prescriptions": _clean_list(payload.get("prescriptions")),
        "treatment_principle": payload.get("treatment_principle"),
        "content": payload.get("content") or "",
        "evidence_level": payload.get("evidence_level") or "未分级",  # 指南推荐|RCT|病例系列|专家经验|古籍记载
        "created_at": store.now_iso(),
        "created_by": payload.get("created_by") or "manual",
    }


def add_reference(payload: Dict[str, Any]) -> Dict[str, Any]:
    store.ensure_dirs()
    return store.add_reference_row(make_reference(payload))


def import_references(path: str) -> List[Dict[str, Any]]:
    src = Path(path).expanduser()
    if not src.exists():
        raise FileNotFoundError(f"导入文件不存在: {path}")
    rows: List[Dict[str, Any]] = []
    if src.suffix.lower() in {".json", ".jsonl"}:
        raw = json.loads(src.read_text(encoding="utf-8"))
        rows = raw if isinstance(raw, list) else [raw]
    else:
        with src.open(encoding="utf-8-sig", newline="") as f:
            rows = list(csv.DictReader(f))
    return [add_reference(r) for r in rows]


def search_external(query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    return store.search_index(store.external_index(), query, top_k)


# ================================================================ C 内部资料库
def _iter_all_visits(patients: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [(p, v) for p in patients for v in store.list_visits(p["id"])]


def aggregate_kb(patients: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
    """把全部会诊记录按「中医病名 + 证型」聚合成内部治疗资料库条目。"""
    patients = patients if patients is not None else store.list_patients()
    buckets: Dict[str, Dict[str, Any]] = {}

    for p in patients:
        visits = store.list_visits(p["id"])
        verdict = (p.get("contrast") or {}).get("delta", {}).get("verdict")
        for v in visits:
            parsed = v.get("parsed") or {}
            topic = parsed.get("tcm_disease") or "未归类"
            syndrome = parsed.get("tcm_syndrome") or "未辨证"
            key = f"{topic}::{syndrome}"
            b = buckets.setdefault(key, {
                "id": None,
                "title": f"{topic}（{syndrome}）治疗方案",
                "topic": topic,
                "syndrome": syndrome,
                "patients": set(),
                "visits": 0,
                "acupoints": Counter(),
                "rationales": {},
                "formulas": Counter(),
                "herbs": Counter(),
                "principles": Counter(),
                "manifestations": Counter(),
                "cases": [],
                "effective": 0,
                "treatments": set(),
            })
            b["patients"].add(p["id"])
            b["visits"] += 1
            b["cases"].append(f"CASE-{p['id']}#V{v['visit_no']}")
            if verdict in EFFECTIVE_VERDICTS:
                b["effective"] += 1
            for m in parsed.get("symptoms") or []:
                b["manifestations"][m] += 1
            for a in parsed.get("acupoints") or []:
                name = a.get("name") if isinstance(a, dict) else str(a)
                if not name:
                    continue
                b["acupoints"][name] += 1
                if isinstance(a, dict) and a.get("rationale"):
                    b["rationales"].setdefault(name, a["rationale"])
            for f in parsed.get("prescriptions") or []:
                nm = f.get("name") if isinstance(f, dict) else str(f)
                if nm:
                    b["formulas"][nm] += 1
            for h in parsed.get("herbs_added") or []:
                b["herbs"][h] += 1
            if parsed.get("treatment_principle"):
                for pr in re.split(r"[、,，]", parsed["treatment_principle"]):
                    if pr.strip():
                        b["principles"][pr.strip()] += 1
            for t in (parsed.get("other_therapy") or []):
                b["treatments"].add(t)
            tp = parsed.get("doctor_note_raw")
            if tp:
                b.setdefault("doctor_notes", []).append(tp)

    entries: List[Dict[str, Any]] = []
    for key, b in buckets.items():
        if b["visits"] == 0:
            continue
        entry = {
            "id": b["id"] or f"INT-{abs(hash(key)) % 10**8:08d}",
            "title": b["title"],
            "tcm_disease": b["topic"],
            "tcm_syndrome": b["syndrome"],
            "patient_count": len(b["patients"]),
            "visit_count": b["visits"],
            "effective_rate": round(b["effective"] / max(b["visits"], 1), 3),
            "manifestations": [m for m, _ in b["manifestations"].most_common(12)],
            "treatment_principles": [p for p, _ in b["principles"].most_common(6)],
            "acupoints": [{"name": n, "count": c, "rationale": b["rationales"].get(n)}
                          for n, c in b["acupoints"].most_common(15)],
            "formulas": [{"name": n, "count": c} for n, c in b["formulas"].most_common(8)],
            "herbs_common": [h for h, _ in b["herbs"].most_common(12)],
            "adjunct_therapy": sorted(b["treatments"]),
            "source_cases": b["cases"][:40],
            "source": "internal",
            "created_at": store.now_iso(),
        }
        entries.append(entry)

    entries.sort(key=lambda e: (e["visit_count"], e["effective_rate"]), reverse=True)
    store.save_internal_index(entries)
    return entries


def internal_doc_text(entry: Dict[str, Any], ai: Optional[AIEngine] = None) -> str:
    lines = [
        f"# 内部治疗资料库 · {entry['title']}",
        "",
        f"| 指标 | 值 |",
        f"| --- | --- |",
        f"| 覆盖病人 | {entry['patient_count']} 人 |",
        f"| 诊疗次数 | {entry['visit_count']} 诊次 |",
        f"| 有效率（好转及以上） | {int(entry['effective_rate'] * 100)}% |",
        f"| 资料库 ID | `{entry['id']}` |",
        "",
        "## 一、常见临床表现",
        "- " + "、".join(entry["manifestations"] or ["—"]),
        "",
        "## 二、治则治法",
        "- " + "、".join(entry["treatment_principles"] or ["—"]),
        "",
        "## 三、针灸取穴规律",
        "| 穴位 | 使用次数 | 取穴用意 |",
        "| --- | --- | --- |",
    ]
    for a in entry["acupoints"]:
        lines.append(f"| {a['name']} | {a['count']} | {a['rationale'] or '—'} |")
    lines += ["", "## 四、方药规律"]
    if entry["formulas"]:
        lines.append("| 方剂 | 使用次数 |")
        lines.append("| --- | --- |")
        for f in entry["formulas"]:
            lines.append(f"| {f['name']} | {f['count']} |")
    lines.append("- 常用加减药：" + "、".join(entry["herbs_common"] or ["—"]))
    if entry["adjunct_therapy"]:
        lines.append("")
        lines.append("## 五、辅助疗法")
        lines.append("- " + "、".join(entry["adjunct_therapy"]))
    lines += ["", "## 六、典型医案"]
    for c in entry["source_cases"][:10]:
        lines.append(f"- `{c}`")
    lines += ["", "---", "", DISCLAIMER]
    return "\n".join(lines)


def ensure_internal_docs(ai: Optional[AIEngine] = None, output_md: bool = True) -> Dict[str, Any]:
    entries = aggregate_kb()
    written = []
    if output_md:
        for e in entries:
            path = store.internal_dir() / f"{e['id']}.md"
            store.write_text(path, internal_doc_text(e))
            written.append(str(path))
    return {"entries": entries, "docs": written}


def search_internal(query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    index = store.internal_index() or aggregate_kb()
    if not query.strip():
        return index[:top_k]
    return store.search_index(index, query, top_k)


# ================================================================ C-1 总结报告
def generate_report(ai: AIEngine, scope: str = "all", patient_id: Optional[str] = None,
                    period: Optional[str] = None) -> Path:
    store.ensure_dirs()
    all_patients = store.list_patients()
    if scope == "patient":
        p = store.find_patient(patient_id or "")
        if not p:
            raise KeyError(f"病人不存在: {patient_id}")
        patients = [p]
    else:
        patients = all_patients
        if period:
            a, _, b = period.partition(":")
            patients = [p for p in patients
                        if (p.get("created_at") or "")[:10] >= a and (p.get("created_at") or "")[:10] <= (b or a)]

    stats = _stats(patients)
    brief = json.dumps(stats, ensure_ascii=False, indent=2)[:12000]
    topic_desc = f"病人 {patient_id}" if scope == "patient" else f"全诊所（{len(patients)} 例）"

    if ai.has_llm:
        try:
            body = ai.chat(
                REPORT_SYSTEM,
                f"请基于以下统计与医案摘要，撰写一份中医诊疗总结报告（范围：{topic_desc}，周期：{period or '全部'}）。\n\n{brief}",
                reasoner=True, temperature=0.4, max_tokens=3500,
            )
        except Exception as exc:
            body = f"> AI 生成失败（{exc}），以下为规则统计版。\n\n" + _fallback_report(stats)
    else:
        body = "> 未配置 DEEPSEEK_API_KEY，输出规则统计版（配置后可产出 AI 深度分析）。\n\n" + _fallback_report(stats)

    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    name = f"summary-report-{scope}-{ts}.md"
    text = f"# 中医诊疗总结报告\n\n- 范围：{topic_desc}\n- 周期：{period or '全部'}\n- 生成时间：{store.now_iso()}\n\n{body}\n\n---\n\n{DISCLAIMER}"
    return store.write_text(store.output_dir() / "reports" / name, text)


def _stats(patients: List[Dict[str, Any]]) -> Dict[str, Any]:
    verdicts, diseases, syndromes, points, formulas = Counter(), Counter(), Counter(), Counter(), Counter()
    total_visits = 0
    per_patient = []
    for p in patients:
        c = p.get("contrast") or {}
        verdicts[c.get("delta", {}).get("verdict") or "待评估"] += 1
        total_visits += c.get("visits_done") or 0
        for t in (p.get("tags") or []):
            diseases[t] += 1
        per_patient.append({
            "patient": f"{p['name']}/{p['id']}",
            "visits": c.get("visits_done"),
            "initial_score": (c.get("initial") or {}).get("severity_score"),
            "latest_score": (c.get("latest") or {}).get("severity_score"),
            "verdict": (c.get("delta") or {}).get("verdict"),
        })
        for v in store.list_visits(p["id"]):
            parsed = v.get("parsed") or {}
            if parsed.get("tcm_syndrome"):
                syndromes[parsed["tcm_syndrome"]] += 1
            for a in parsed.get("acupoints") or []:
                nm = a.get("name") if isinstance(a, dict) else a
                if nm:
                    points[nm] += 1
            for f in parsed.get("prescriptions") or []:
                nm = f.get("name") if isinstance(f, dict) else f
                if nm:
                    formulas[nm] += 1
    return {
        "patient_count": len(patients),
        "visit_count": total_visits,
        "verdict_distribution": dict(verdicts),
        "top_diseases": diseases.most_common(15),
        "top_syndromes": syndromes.most_common(15),
        "top_acupoints": points.most_common(20),
        "top_formulas": formulas.most_common(15),
        "per_patient": per_patient,
    }


def _fallback_report(stats: Dict[str, Any]) -> str:
    def table(title: str, pairs):
        rows = [f"### {title}", "", "| 项目 | 例数 |", "| --- | --- |"]
        rows += [f"| {k} | {v} |" for k, v in pairs] or ["| — | 0 |"]
        rows.append("")
        return rows

    lines = [
        f"## 一、总体规模",
        f"- 病人总数：{stats['patient_count']}　诊疗人次：{stats['visit_count']}",
        "",
    ]
    lines += table("二、疗效判定分布", stats["verdict_distribution"].items())
    lines += table("三、高频病种/标签", stats["top_diseases"])
    lines += table("四、高频证型", stats["top_syndromes"])
    lines += table("五、高频穴位", stats["top_acupoints"])
    lines += table("六、高频方剂", stats["top_formulas"])
    lines += ["## 七、逐例明细", "", "| 病人 | 诊次 | 期初评分 | 末期评分 | 判定 |", "| --- | --- | --- | --- | --- |"]
    for r in stats["per_patient"]:
        lines.append(f"| {r['patient']} | {r['visits']} | {r['initial_score']} | {r['latest_score']} | {r['verdict']} |")
    return "\n".join(lines)


# ================================================================ C-2 教学文档
def generate_teaching_doc(ai: AIEngine, topic: str, level: str = "规培医师") -> Path:
    store.ensure_dirs()
    internal = search_internal(topic, top_k=6)
    external = search_external(topic, top_k=6)
    cases = _collect_cases(topic, top_k=8)
    ctx = json.dumps({"internal": internal, "external": external, "cases": cases}, ensure_ascii=False, indent=2)[:14000]

    if ai.has_llm:
        body = ai.chat(
            TEACH_SYSTEM.format(level=level),
            f"请撰写《{topic}》教学文档。\n\n【可用资料】\n{ctx}\n\n"
            f"必含章节：1 病名与西医对应；2 病因病机；3 辨证要点（舌脉）；4 分型论治表；"
            f"5 本院针灸取穴经验（摘录『如高血压取曲池、糖尿病取承山、足三里调理中焦气机』这类医生原话并解释机制）；"
            f"6 方药运用与加减；7 医嘱与生活调摄；8 疗效评价与随访；9 思考题与考核点；"
            f"每个引用标注来源ID，最后列出参考资料清单。",
            reasoner=True, temperature=0.5, max_tokens=4500,
        )
    else:
        body = "\n".join([
            "> 未配置 DEEPSEEK_API_KEY，以下为资料汇编版（不含 AI 论述）。",
            "",
            "## 一、本院沉淀条目",
            *[f"- `{e['id']}` {e['title']}（{e['visit_count']} 诊次，有效率 {int(e['effective_rate']*100)}%）" for e in internal],
            "",
            "## 二、外部参考条目",
            *[f"- `{e['id']}` {e['title']}｜{e.get('source') or '未标注出处'}" for e in external],
            "",
            "## 三、本院相关医案",
            *[f"- `{c['ref']}` {c['summary']}" for c in cases],
        ])

    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    text = (f"# {topic} · 临床教学文档\n\n- 教学对象：{level}\n- 生成时间：{store.now_iso()}\n\n{body}\n\n---\n\n{DISCLAIMER}")
    path = store.write_text(store.output_dir() / "teaching" / f"{_safe(topic)}-{ts}.md", text)
    _register_teaching_doc(topic, level, path, internal, external, cases)
    return path


def _register_teaching_doc(topic: str, level: str, path: Path, internal, external, cases) -> None:
    index = store.read_json(store.output_dir() / "teaching" / "index.json", []) or []
    index.append({
        "topic": topic, "level": level, "path": str(path),
        "internal_refs": [e["id"] for e in internal], "external_refs": [e["id"] for e in external],
        "created_at": store.now_iso(),
    })
    store.write_json(store.output_dir() / "teaching" / "index.json", index)


def _safe(name: str) -> str:
    return re.sub(r"[^\w\u4e00-\u9fa5-]+", "_", name)[:40]


def _collect_cases(topic: str, top_k: int = 8) -> List[Dict[str, Any]]:
    out = []
    for p in store.list_patients():
        hay = json.dumps(p, ensure_ascii=False)
        for v in store.list_visits(p["id"]):
            note = json.dumps(v.get("parsed") or {}, ensure_ascii=False)
            if topic in hay or topic in note:
                out.append({
                    "ref": f"CASE-{p['id']}#V{v['visit_no']}",
                    "date": v.get("date"),
                    "summary": (p.get("latest_summary") or "")[:160],
                    "verdict": (p.get("contrast") or {}).get("delta", {}).get("verdict"),
                    "doctor_note": v.get("doctor_note_raw") or (v.get("doctor_note") or "")[:200],
                })
    out.sort(key=lambda c: 0 if c["verdict"] in EFFECTIVE_VERDICTS else 1)
    return out[:top_k]


# ================================================================ D-2 治疗建议
def advise(ai: AIEngine, patient_id: Optional[str] = None, text: Optional[str] = None,
           top_k: int = 5) -> Dict[str, Any]:
    store.ensure_dirs()
    case_text = text or ""
    patient = None
    if patient_id:
        patient = store.find_patient(patient_id)
        if not patient:
            raise KeyError(f"病人不存在: {patient_id}")
        cur = patient.get("current_condition") or {}
        case_text = "\n".join([
            f"姓名：{patient.get('name')}　性别：{patient.get('gender')}　年龄：{patient.get('age')}",
            f"已诊疗：{patient.get('visit_count')} 次",
            f"主诉：{(patient.get('initial_condition') or {}).get('chief_complaint')}",
            f"当前情况：{cur.get('summary') or '-'}",
            f"西医诊断：{'、'.join(cur.get('western_diagnosis') or []) or '-'}",
            f"舌脉：{cur.get('tongue') or '-'}　{cur.get('pulse') or '-'}",
            f"严重度：{cur.get('severity_score')}",
            f"补充说明：{text or '-'}",
        ])

    query = _build_query(patient, case_text)
    external = search_external(query, top_k)
    internal = search_internal(query, top_k)
    cases = _collect_cases(_guess_topic(case_text, patient), top_k)

    ctx_external = json.dumps([{k: v for k, v in e.items() if k != "content"} | {"content": (e.get("content") or "")[:600]}
                               for e in external], ensure_ascii=False, indent=2)
    ctx_internal = json.dumps(internal, ensure_ascii=False, indent=2)
    ctx_cases = json.dumps(cases, ensure_ascii=False, indent=2)

    flags = case.safety_flags(case_text, (patient or {}).get("latest_summary"))
    result: Dict[str, Any] = {
        "patient_id": patient["id"] if patient else None,
        "generated_at": store.now_iso(),
        "safety_alerts": flags or [],
        "external_refs": [{"id": e["id"], "title": e["title"], "source": e.get("source")} for e in external],
        "internal_refs": [{"id": e["id"], "title": e["title"], "visit_count": e.get("visit_count"),
                           "effective_rate": e.get("effective_rate")} for e in internal],
        "case_refs": [c["ref"] for c in cases],
        "review_status": "pending",
        "disclaimer": DISCLAIMER,
    }

    if ai.has_llm:
        try:
            plan = ai.chat_json(
                ADVISE_SYSTEM,
                ADVISE_USER.format(case_text=case_text or "-", external=ctx_external,
                                   internal=ctx_internal, cases=ctx_cases),
                reasoner=True, temperature=0.2, max_tokens=3500,
            )
            plan = dict(plan)
            plan.setdefault("safety_alerts", [])
            for f in flags:
                if f not in plan["safety_alerts"]:
                    plan["safety_alerts"].append(f"自动红线命中：{f}")
            result["plan"] = plan
            result["mode"] = "llm"
            return result
        except Exception as exc:
            result["mode"] = "rule_based_fallback"
            result["ai_error"] = str(exc)[:300]
    else:
        result["mode"] = "rule_based"

    # 降级：直接把检索到的证据拼成建议草稿（仍带来源，绝不凭空生成）
    result["plan"] = _fallback_plan(external, internal, cases, flags)
    return result


def _build_query(patient: Optional[Dict[str, Any]], case_text: str) -> str:
    """把结构化病人情况压成检索词串。

    直接用大段病人描述去检索会稀释命中率（大量"姓名/性别/严重度"之类的噪声词），
    这里只保留有鉴别力的字段：病名、证型、主诉、症状、西医诊断，外加本次自由描述前 120 字。
    """
    bits: List[str] = []
    if patient:
        for src_key in ("current_condition", "initial_condition"):
            src = patient.get(src_key) or {}
            for f in ("tcm_disease", "tcm_syndrome", "chief_complaint"):
                if src.get(f):
                    bits.append(str(src[f]))
            bits += [str(s) for s in (src.get("symptoms") or [])][:8]
            bits += [str(s) for s in (src.get("western_diagnosis") or [])][:4]
        # 用库内已有标签做一次退火匹配，提升同义词命中（如"高血压"→库内 tag"眩晕"）
        bits += _tag_pool_hits(case_text)
    else:
        bits.append(_keywords_from_text(case_text))
    seen, out = set(), []
    for b in bits:
        if b and b not in seen:
            seen.add(b)
            out.append(b)
    return " ".join(out)


SYNONYM_MAP = {
    "血压": "高血压", "血压高": "高血压", "降压": "高血压",
    "血糖": "糖尿病", "血糖高": "糖尿病", "降糖": "糖尿病",
    "头晕": "眩晕", "头昏": "眩晕",
    "睡不着": "失眠", "入睡困难": "失眠", "少寐": "失眠", "眠差": "失眠",
    "睡不好": "失眠", "多梦易醒": "失眠",
    "大便干": "便秘", "排便困难": "便秘",
    "饭后腹胀": "腹胀", "胃胀": "腹胀",
    "腰酸": "腰膝酸软", "腰膝无力": "腰膝酸软",
    "口渴": "口干", "多饮": "口干",
    "浑身没劲": "乏力", "疲倦": "乏力", "疲倦乏力": "乏力",
}

DISEASE_KEYWORDS = [
    "眩晕", "消渴", "不寐", "头痛", "痹证", "胃痛", "咳嗽", "便秘", "泄泻", "心悸", "胸痹",
    "喘证", "水肿", "腰痛", "中风", "郁证", "耳鸣", "健忘", "自汗", "盗汗", "月经不调",
    "高血压", "糖尿病", "失眠", "颈椎病", "关节炎", "慢性胃炎",
]


def _keywords_from_text(text: str) -> str:
    """从自由文本主诉里抽"能检索到东西"的词。

    整段文本直接做 BM 检索必然 0 命中（没有文档中会包含整句），所以先做词项化：
    词典词（症状/证型/病名）+ 库中已有标签，命中不足时退化为原文前 120 字。
    """
    pool = set(case.SYMPTOM_LEXICON) | set(case.SYNDROME_LEXICON) | set(DISEASE_KEYWORDS)
    pool |= set(_tag_pool_hits(text, _all_tags()))
    hits = {w for w in pool if w and w in (text or "")}
    # 同义归一：患者口语（血压/睡不着）→ 资料库术语（高血压/失眠）
    for spoken, canonical in SYNONYM_MAP.items():
        if spoken in (text or ""):
            hits.add(canonical)
    ordered = sorted(hits, key=lambda x: -len(x))
    return " ".join(ordered[:25]) if ordered else (text or "")[:120]


def _all_tags() -> List[str]:
    tags: List[str] = []
    for row in store.external_index() + store.internal_index():
        tags += [str(t) for t in (row.get("tags") or [])]
        for k in ("tcm_disease", "tcm_syndrome", "title"):
            if row.get(k):
                tags.append(str(row[k]))
    return tags


def _tag_pool_hits(text: str, tags: Optional[List[str]] = None) -> List[str]:
    tags = tags if tags is not None else _all_tags()
    if not text:
        return []
    return [t for t in tags if t and t in text]


def _guess_topic(text: str, patient: Optional[Dict[str, Any]]) -> str:
    if patient:
        cur = patient.get("current_condition") or {}
        if cur.get("tcm_disease"):
            return cur["tcm_disease"]
        if cur.get("tcm_syndrome"):
            return cur["tcm_syndrome"]
    for kw in ("眩晕", "消渴", "不寐", "头痛", "痹证", "胃痛", "咳嗽", "便秘", "高血压", "糖尿病"):
        if kw in (text or ""):
            return kw
    return ""


def _fallback_plan(external, internal, cases, flags) -> Dict[str, Any]:
    points = []
    for e in internal[:3]:
        for a in (e.get("acupoints") or [])[:6]:
            points.append({"point": a["name"], "laterality": "双", "manipulation": "平补平泻",
                           "retention_min": 20, "rationale": a.get("rationale") or "本院高频取穴",
                           "source": f"{e['id']}"})
    for e in external[:3]:
        for a in (e.get("acupoints") or [])[:6]:
            points.append({"point": a, "laterality": "双", "manipulation": "平补平泻",
                           "retention_min": 20, "rationale": "外部参考资料", "source": f"{e['id']}"})
    formulas = [{"formula": f["name"], "modification": None, "source": f"{e['id']}",
                 "note": f"本院使用 {f['count']} 诊次"}
                for e in internal[:2] for f in (e.get("formulas") or [])[:3]]
    formulas += [{"formula": f, "modification": None, "source": f"{e['id']}", "note": e.get("evidence_level")}
                 for e in external[:2] for f in (e.get("prescriptions") or [])[:3]]
    return {
        "case_profile": {"tcm_disease": internal[0]["tcm_disease"] if internal else None,
                         "tcm_syndrome": internal[0]["tcm_syndrome"] if internal else None,
                         "western_diagnosis": [], "key_symptoms": internal[0]["manifestations"][:8] if internal else []},
        "safety_alerts": [f"自动红线命中：{f}" for f in flags] or ["未命中急症红线词，但仍需常规鉴别诊断"],
        "treatment_principle": "、".join(internal[0]["treatment_principles"][:3]) if internal else "证据不足",
        "acupuncture_plan": points,
        "herbal_plan": formulas,
        "lifestyle_advice": ["证据不足：请补充外部参考资料库条目后重试"],
        "followup_plan": "建议 1 周后复诊，复评严重度并记录症状变化",
        "evidence_summary": {"external_hits": [e["id"] for e in external],
                             "internal_hits": [e["id"] for e in internal],
                             "case_hits": [c["ref"] for c in cases],
                             "insufficient_fields": ["AI 不可用，本方案为证据检索草稿，未做综合推理"]},
        "confidence": 0.3 if (external or internal) else 0.0,
    }
