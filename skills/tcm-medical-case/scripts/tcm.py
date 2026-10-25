#!/usr/bin/env python3
"""中医诊所医案沉淀 Skill —— CLI 总入口。

用法：python3 scripts/tcm.py <command> [options]
详见 SKILL.md §3 执行逻辑 与 §4 命令手册。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

sys.path.insert(0, str(Path(__file__).resolve().parent))

import lib_case as case  # noqa: E402
import lib_kb as kb  # noqa: E402
import lib_storage as store  # noqa: E402
from lib_ai import AIEngine  # noqa: E402


# ------------------------------------------------------------------ 辅助
def load_payload(args) -> Dict[str, Any]:
    if getattr(args, "json", None):
        return json.loads(args.json)
    if getattr(args, "json_file", None):
        return json.loads(Path(args.json_file).expanduser().read_text(encoding="utf-8"))
    # 交互式：无参数时从 stdin 读
    data = sys.stdin.read().strip()
    if data:
        return json.loads(data)
    raise SystemExit("缺少参数：请提供 --json 或 --json-file（无参数时可从 stdin 读 JSON）")


def dump(obj: Any) -> None:
    print(json.dumps(obj, ensure_ascii=False, indent=2, default=str))


def cjk_ljust(value: Any, width: int) -> str:
    """按终端显示宽度补齐（中文占 2 列），保证表格不会因为混排中文而错位。"""
    from unicodedata import east_asian_width

    s = str(value)
    size = sum(2 if east_asian_width(ch) in {"W", "F"} else 1 for ch in s)
    return s + " " * max(0, width - size)


def split_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value]
    return [s.strip() for s in str(value).replace("，", ",").split(",") if s.strip()]


def require_patient(pid: str) -> Dict[str, Any]:
    p = store.find_patient(pid)
    if not p:
        raise SystemExit(f"找不到病人: {pid}（用 `tcm.py list` 查看）")
    return p


# ------------------------------------------------------------------ 命令实现
def cmd_doctor(args) -> None:
    ai = AIEngine()
    cap = ai.capabilities()
    root = store.ensure_dirs()
    info = {
        "skill": "tcm-medical-case",
        "python": sys.version.split()[0],
        "data_dir": str(root),
        "output_dir": str(store.output_dir()),
        "capabilities": cap,
        "counts": {
            "patients": len(store.list_patients()),
            "external_refs": len(store.external_index()),
            "internal_entries": len(store.internal_index()),
        },
    }
    if not ai.has_llm:
        info["warning"] = "未检测到 DEEPSEEK_API_KEY，将以规则模式运行（结构化抽取精度下降，流程不受阻）"
    if not ai.has_asr:
        info["asr_warning"] = "未配置 ASR_PROVIDER，语音素材将归档但需人工补录文字"
    if not ai.has_vision:
        info["vision_warning"] = "未配置 VISION_PROVIDER=openai，图片素材将归档但需人工描述"
    dump(info)


def cmd_intake(args) -> None:
    ai = AIEngine()
    payload = load_payload(args)
    patient = case.create_patient(payload, ai, images=split_list(getattr(args, "image", None)),
                                  audios=split_list(getattr(args, "audio", None)))
    if getattr(args, "format", "json") == "view":
        print(f"建档完成：{patient['name']}　ID={patient['id']}　期初严重度="
              f"{patient['initial_condition'].get('severity_score')}")
        if patient["media"].get("pending_transcription"):
            print("语音待补录：" + json.dumps(patient["media"]["pending_transcription"], ensure_ascii=False))
    else:
        dump(patient)


def cmd_followup(args) -> None:
    ai = AIEngine()
    patient = require_patient(args.patient)
    visit = case.record_visit(
        patient["id"], ai,
        audio=split_list(getattr(args, "audio", None)),
        images=split_list(getattr(args, "image", None)),
        text=getattr(args, "text", None),
        doctor_note=getattr(args, "doctor_note", None),
        severity=getattr(args, "severity", None),
        visit_date=getattr(args, "visit_date", None),
        conclusion=getattr(args, "conclusion", None),
    )
    out = {"visit": f"V{visit['visit_no']:03d}", "date": visit["date"], "channels": visit["channels"],
           "ai_mode": visit["ai_mode"], "parsed": visit["parsed"], "outcome": visit["outcome"]}
    if getattr(args, "format", "json") == "view":
        p = require_patient(patient["id"])
        print(case.render_contrast(p, "view"))
    else:
        dump(out)


def cmd_parse(args) -> None:
    ai = AIEngine()
    material = args.doctor_note or args.text or ""
    if getattr(args, "file", None):
        material = Path(args.file).expanduser().read_text(encoding="utf-8")
    dump(case.parse_case_note(material, ai))


def cmd_summary(args) -> None:
    patient = require_patient(args.patient)
    print(case.render_contrast(patient, args.format))


def cmd_list(args) -> None:
    rows = store.list_patients(status=getattr(args, "status", None), keyword=getattr(args, "q", None))
    if args.format == "json":
        dump(rows)
        return
    if not rows:
        print("（暂无病人档案）")
        return
    print(f"{'ID':<18}{'姓名':<10}{'诊次':<6}{'期初':<6}{'末期':<6}{'判定':<10}主诉")
    print("-" * 64)
    for r in rows:
        c = r.get("contrast") or {}
        ini = (c.get("initial") or {}).get("severity_score")
        lat = (c.get("latest") or {}).get("severity_score")
        verdict = (c.get("delta") or {}).get("verdict") or "-"
        complaint = (r.get("initial_condition") or {}).get("chief_complaint") or "-"
        print(f"{str(r['id']):<18}{str(r['name']):<10}{str(c.get('visits_done', 0)):<6}"
              f"{str(ini if ini is not None else '-'):<6}{str(lat if lat is not None else '-'):<6}"
              f"{verdict:<10}{complaint}")


def cmd_show(args) -> None:
    patient = require_patient(args.patient)
    if args.format == "json":
        dump(patient)
        return
    print(case.render_contrast(patient, "view"))
    print("\n【复诊列表】")
    for v in store.list_visits(patient["id"]):
        print(f"  V{v['visit_no']:03d} {v['date']}  {','.join(v['channels'])}  "
              f"{(v.get('parsed') or {}).get('treatment_principle') or '-'}")


def cmd_amend(args) -> None:
    p = case.amend_initial(args.patient, args.note, getattr(args, "field", None))
    print(f"已追加期初基线修正：{args.note}（原值未改动）")


def cmd_report(args) -> None:
    ai = AIEngine()
    path = kb.generate_report(ai, scope=args.scope, patient_id=getattr(args, "patient", None),
                              period=getattr(args, "period", None))
    print(f"总结报告已生成：{path}")


def cmd_teach(args) -> None:
    ai = AIEngine()
    path = kb.generate_teaching_doc(ai, topic=args.topic, level=getattr(args, "level", "规培医师"))
    print(f"教学文档已生成：{path}")


def cmd_ref(args) -> None:
    if args.ref_action == "add":
        payload: Dict[str, Any] = {"created_by": "manual"}
        if getattr(args, "json", None) or getattr(args, "json_file", None):
            payload.update(load_payload(args))
        else:
            if not args.title:
                raise SystemExit("缺少 --title 或 --json")
            payload.update({
                "title": args.title,
                "source_type": getattr(args, "source_type", None) or "未分类",
                "source": getattr(args, "source", None),
                "tags": split_list(getattr(args, "tags", None)),
                "indications": split_list(getattr(args, "indications", None)),
                "syndromes": split_list(getattr(args, "syndromes", None)),
                "acupoints": split_list(getattr(args, "acupoints", None)),
                "prescriptions": split_list(getattr(args, "prescriptions", None)),
                "treatment_principle": getattr(args, "treatment_principle", None),
                "evidence_level": getattr(args, "evidence_level", None) or "未分级",
                "content": Path(args.file).expanduser().read_text(encoding="utf-8")
                if getattr(args, "file", None) else (getattr(args, "content", None) or ""),
            })
        row = kb.add_reference(payload)
        print(f"外部参考已录入：{row['id']}　{row['title']}")
        return

    if args.ref_action == "import":
        rows = kb.import_references(args.file)
        print(f"批量导入完成：{len(rows)} 条")
        for r in rows:
            print(f"  {r['id']}  {r['title']}")
        return

    if args.ref_action in ("list", "search"):
        rows = (
            store.external_index() if args.ref_action == "list"
            else kb.search_external(args.q, top_k=getattr(args, "top_k", 5))
        )
        empty_tip = (
            "（外部参考库为空，用 `ref add` 录入）" if args.ref_action == "list" else "（无命中）"
        )
        if args.format == "json":
            dump(rows)
            return
        if not rows:
            print(empty_tip)
            return
        for r in rows:
            print("".join(cjk_ljust(t, w) for t, w in (
                (r["id"], 20), (str(r.get("title"))[:24], 28),
                (r.get("source_type") or "-", 12), (r.get("evidence_level") or "-", 12),
                (r.get("source") or "-", 22),
            )))
        return


def cmd_kb(args) -> None:
    ai = AIEngine()
    if args.kb_action == "build":
        res = kb.ensure_internal_docs(ai)
        print(f"内部治疗资料库已重建：{len(res['entries'])} 个主题条目，{len(res['docs'])} 份 Markdown")
        for e in res["entries"]:
            print(f"  {e['id']}  {e['title']}　{e['visit_count']} 诊次　有效率 {int(e['effective_rate']*100)}%")
        return
    if args.kb_action == "search":
        rows = kb.search_internal(args.q, top_k=getattr(args, "top_k", 5))
        if args.format == "json":
            dump(rows)
        elif not rows:
            print("（内部资料库无命中，先执行 `kb build`）")
        else:
            for r in rows:
                print("".join(cjk_ljust(t, w) for t, w in (
                    (r["id"], 16), (str(r["title"])[:26], 30),
                    (f"诊次 {r.get('visit_count', 0)}", 10),
                    (f"有效率 {int(r.get('effective_rate', 0) * 100)}%", 14),
                )))
        return


def cmd_advise(args) -> None:
    ai = AIEngine()
    res = kb.advise(ai, patient_id=getattr(args, "patient", None), text=getattr(args, "text", None),
                    top_k=getattr(args, "top_k", 5))
    if args.format == "json":
        dump(res)
        return
    plan = res["plan"]
    print(f"模式：{res['mode']}　生成时间：{res['generated_at']}")
    print("\n【安全红线】" + ("\n  " + "\n  ".join(plan.get("safety_alerts") or ["无"])))
    prof = plan.get("case_profile") or {}
    print(f"\n【辨识】{prof.get('tcm_disease') or '-'}／{prof.get('tcm_syndrome') or '-'}")
    print(f"【治则】{plan.get('treatment_principle') or '-'}")
    print("\n【针灸方案】")
    for a in plan.get("acupuncture_plan") or []:
        print(f"  · {a.get('point')}（{a.get('laterality') or '双'}）{a.get('manipulation') or ''} "
              f"留针{a.get('retention_min') or '-'}分钟　{a.get('rationale') or ''}　[{a.get('source')}]")
    print("\n【方药方案】")
    for f in plan.get("herbal_plan") or []:
        print(f"  · {f.get('formula')}　{f.get('modification') or ''}　{f.get('note') or ''}　[{f.get('source')}]")
    print("\n【调摄随访】")
    for a in plan.get("lifestyle_advice") or []:
        print(f"  · {a}")
    print(f"\n【随访】{plan.get('followup_plan') or '-'}")
    ev = plan.get("evidence_summary") or {}
    print(f"\n【证据来源】外部 {len(ev.get('external_hits') or [])} 条 · 内部 {len(ev.get('internal_hits') or [])} 条 · 医案 {len(ev.get('case_hits') or [])} 条")
    print(f"置信度 {plan.get('confidence')}　待 {
          '、'.join(ev.get('insufficient_fields') or []) or '无'}")
    print("\n" + res["disclaimer"])


def cmd_sync(args) -> None:
    from sync_to_server import run_sync

    run_sync(server=getattr(args, "server", None), token=getattr(args, "token", None),
             patient_id=getattr(args, "patient", None))


# ------------------------------------------------------------------ CLI 构建
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="tcm.py", description="中医诊所医案沉淀 Skill")
    parser.add_argument("--version", action="version", version="tcm-medical-case 1.0.0")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("doctor", help="环境自检与能力矩阵").set_defaults(func=cmd_doctor)

    p = sub.add_parser("intake", help="建档：录入病人期初情况")
    p.add_argument("--json"), p.add_argument("--json-file")
    p.add_argument("--image"), p.add_argument("--audio")
    p.add_argument("--format", choices=["json", "view"], default="json")
    p.set_defaults(func=cmd_intake)

    p = sub.add_parser("followup", help="复诊跟进：语音/图片/文字 + 医生描述")
    p.add_argument("--patient", required=True)
    p.add_argument("--audio"), p.add_argument("--image")
    p.add_argument("--text"), p.add_argument("--doctor-note", dest="doctor_note")
    p.add_argument("--severity", type=float)
    p.add_argument("--visit-date", dest="visit_date")
    p.add_argument("--conclusion")
    p.add_argument("--format", choices=["json", "view"], default="json")
    p.set_defaults(func=cmd_followup)

    p = sub.add_parser("parse", help="仅解析不落库")
    p.add_argument("--doctor-note", dest="doctor_note"), p.add_argument("--text"), p.add_argument("--file")
    p.set_defaults(func=cmd_parse)

    p = sub.add_parser("summary", help="期初→X次治疗→末期 疗效对比")
    p.add_argument("--patient", required=True)
    p.add_argument("--format", choices=["view", "md", "json"], default="view")
    p.set_defaults(func=cmd_summary)

    p = sub.add_parser("list", help="病人列表")
    p.add_argument("--status"), p.add_argument("--q")
    p.add_argument("--format", choices=["table", "json"], default="table")
    p.set_defaults(func=cmd_list)

    p = sub.add_parser("show", help="病人详情")
    p.add_argument("--patient", required=True)
    p.add_argument("--format", choices=["view", "json"], default="view")
    p.set_defaults(func=cmd_show)

    p = sub.add_parser("amend", help="追加期初基线修正（不覆盖原值）")
    p.add_argument("--patient", required=True)
    p.add_argument("--note", required=True)
    p.add_argument("--field")
    p.set_defaults(func=cmd_amend)

    p = sub.add_parser("report", help="生成疗效总结报告")
    p.add_argument("--scope", choices=["patient", "cohort", "all"], default="all")
    p.add_argument("--patient"), p.add_argument("--period")
    p.set_defaults(func=cmd_report)

    p = sub.add_parser("teach", help="生成教学文档")
    p.add_argument("--topic", required=True)
    p.add_argument("--level", default="规培医师")
    p.set_defaults(func=cmd_teach)

    ref = sub.add_parser("ref", help="外部治疗参考库")
    ref_sub = ref.add_subparsers(dest="ref_action", required=True)
    r = ref_sub.add_parser("add", help="录入一条外部参考资料")
    r.add_argument("--json"), r.add_argument("--json-file")
    r.add_argument("--title"), r.add_argument("--source"), r.add_argument("--source-type", dest="source_type")
    r.add_argument("--tags"), r.add_argument("--indications"), r.add_argument("--syndromes")
    r.add_argument("--acupoints"), r.add_argument("--prescriptions")
    r.add_argument("--treatment-principle", dest="treatment_principle")
    r.add_argument("--evidence-level", dest="evidence_level")
    r.add_argument("--content"), r.add_argument("--file", help="从文件读取正文")
    r.set_defaults(func=cmd_ref)
    r = ref_sub.add_parser("import", help="批量导入 CSV/JSON")
    r.add_argument("--file", required=True)
    r.set_defaults(func=cmd_ref)
    r = ref_sub.add_parser("list", help="列出外部参考")
    r.add_argument("--format", choices=["table", "json"], default="table")
    r.set_defaults(func=cmd_ref)
    r = ref_sub.add_parser("search", help="检索外部参考")
    r.add_argument("--q", required=True)
    r.add_argument("--top-k", dest="top_k", type=int, default=5)
    r.add_argument("--format", choices=["table", "json"], default="table")
    r.set_defaults(func=cmd_ref)

    k = sub.add_parser("kb", help="内部治疗资料库")
    k_sub = k.add_subparsers(dest="kb_action", required=True)
    k_sub.add_parser("build", help="从全部医案重建内部资料库").set_defaults(func=cmd_kb)
    s = k_sub.add_parser("search", help="检索内部资料库")
    s.add_argument("--q", required=True)
    s.add_argument("--top-k", dest="top_k", type=int, default=5)
    s.add_argument("--format", choices=["table", "json"], default="table")
    s.set_defaults(func=cmd_kb)

    p = sub.add_parser("advise", help="治疗建议（联合内外部资料库）")
    p.add_argument("--patient")
    p.add_argument("--text")
    p.add_argument("--top-k", dest="top_k", type=int, default=5)
    p.add_argument("--format", choices=["view", "json"], default="view")
    p.set_defaults(func=cmd_advise)

    p = sub.add_parser("sync", help="同步本地医案到 NestJS 服务端")
    p.add_argument("--server"), p.add_argument("--token"), p.add_argument("--patient")
    p.set_defaults(func=cmd_sync)
    return parser


def main(argv=None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        args.func(args)
    except SystemExit:
        raise
    except Exception as exc:  # CLI 边界统一兜底，保证不抛出裸栈给用户
        print(f"[错误] {exc}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
