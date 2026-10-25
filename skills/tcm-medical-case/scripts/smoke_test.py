#!/usr/bin/env python3
"""Skill 一键冒烟测试。

用途：在没有 PostgreSQL、没有 DeepSeek Key 的机器上也能验证整条业务链路是否可用。
默认把数据写到临时目录（不污染 data/），加 --persist 则写入正式资料目录。

用法：
  python3 scripts/smoke_test.py
  python3 scripts/smoke_test.py --persist
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import lib_case as case  # noqa: E402
import lib_kb as kb  # noqa: E402
import lib_storage as store  # noqa: E402
from lib_ai import AIEngine  # noqa: E402


def section(title: str) -> None:
    print(f"\n{'=' * 68}\n{title}\n{'=' * 68}")


def main() -> int:
    ap = argparse.ArgumentParser(description="中医医案 Skill 冒烟测试")
    ap.add_argument("--persist", action="store_true", help="把示例数据写入正式目录 data/ 而不是临时目录")
    args = ap.parse_args()

    skill_root = Path(__file__).resolve().parents[1]
    if not args.persist:
        tmp = Path(tempfile.mkdtemp(prefix="tcm-smoke-"))
        os.environ["TCM_SKILL_DATA_DIR"] = str(tmp / "data")
        os.environ["TCM_SKILL_OUTPUT_DIR"] = str(tmp / "output")
        runtime = f"临时目录 {tmp}"
    else:
        runtime = f"正式目录 {skill_root / 'data'}"
    store.ensure_dirs()

    failures: list[str] = []
    ai = AIEngine(verbose=False)

    section("0. 环境自检")
    cap = ai.capabilities()
    print(json.dumps(cap, ensure_ascii=False, indent=2))
    print(f"数据目录：{runtime}")

    section("1. 建档（期初情况）")
    patient = case.create_patient({
        "name": "示例·李某", "gender": "男", "age": 61,
        "chief_complaint": "口干多饮、乏力半年",
        "western_diagnosis": ["2型糖尿病"],
        "tcm_disease": "消渴", "tcm_syndrome": "气阴两虚",
        "symptoms": ["口干", "乏力", "夜尿频"],
        "tongue": "舌红少苔", "pulse": "细数",
        "severity_score": 6,
    }, ai)
    pid = patient["id"]
    print(f"建档成功：{pid}　期初严重度 {patient['initial_condition']['severity_score']}")
    if patient["initial_condition"]["severity_score"] != 6:
        failures.append("建档：严重度未正确写入")

    section("2. 三次复诊跟进（医生批注 + 文字记录）")
    notes = [
        ("糖尿病取承山、胰俞，配足三里调理中焦气机，健脾益气；加太溪养阴。毫针平补平泻，留针30分钟", "今日精神好转，口干减轻", 5),
        ("守前方，足三里用补法，加三阴交；处方玉女煎加减", "乏力明显改善，夜尿由 3 次减至 1 次", 4),
        ("上方去三阴交，加关元艾灸；饮冷则腹胀，嘱忌生冷", "夜尿 1 次，大便成形，仍觉轻度乏力", 2),
    ]
    for index, (note, text, severity) in enumerate(notes, start=1):
        visit = case.record_visit(pid, ai, doctor_note=note, text=text, severity=severity,
                                  visit_date=f"2026-10-{10 + index:02d}")
        parsed = visit["parsed"]
        points = "、".join(a["name"] for a in parsed.get("acupoints") or []) or "—"
        print(f"  第{visit['visit_no']}诊 {visit['date']} | 模式 {visit['ai_mode']} | 取穴 {points}")
        if not parsed.get("acupoints"):
            failures.append(f"第{index}诊：未能抽取到任何穴位")

    section("3. 期初 → X 次治疗 → 末期 疗效对比")
    patient = store.find_patient(pid)
    print(case.render_contrast(patient, "view"))
    verdict = (patient["contrast"]["delta"] or {}).get("verdict")
    if patient["contrast"]["visits_done"] != 3:
        failures.append("疗效对比：诊疗次数不为 3")
    if verdict not in {"显效", "有效", "临床痊愈", "好转"}:
        failures.append(f"疗效对比：判定异常 {verdict}")

    section("4. 外部治疗参考库录入")
    refs = [
        kb.add_reference({
            "title": "消渴方", "source_type": "古籍", "source": "《丹溪心法》",
            "tags": ["消渴", "糖尿病", "气阴两虚"], "syndromes": ["气阴两虚"],
            "acupoints": ["承山", "胰俞", "足三里", "太溪"],
            "prescriptions": ["玉女煎", "生脉散"],
            "treatment_principle": "益气养阴", "evidence_level": "古籍记载",
            "content": "消渴方以天花粉、葛根、麦冬益气养阴生津，主治口渴多饮。",
        }),
        kb.add_reference({
            "title": "高血压（眩晕·肝阳上亢）取穴经验", "source_type": "专家经验",
            "tags": ["眩晕", "高血压", "肝阳上亢"], "syndromes": ["肝阳上亢"],
            "acupoints": ["曲池", "太冲", "风池", "百会", "足三里"],
            "prescriptions": ["天麻钩藤饮"],
            "treatment_principle": "平肝潜阳", "evidence_level": "专家经验",
            "content": "血压偏高伴面赤急躁者，曲池、太冲重泻；眩晕明显加百会、风池。",
        }),
    ]
    for ref in refs:
        print(f"  {ref['id']}　{ref['title']}")

    section("5. 治疗建议（联合内外部资料库）")
    result = kb.advise(ai, patient_id=pid, top_k=3)
    plan = result["plan"]
    print(f"  模式 {result['mode']}　治则 {plan.get('treatment_principle')}")
    # AI 模式失败而降级时必须把原因暴露出来，否则会误以为是链路没通
    if result["mode"] != "llm":
        failures.append(f"治疗建议：期望 AI 模式，实际 {result['mode']}，原因：{result.get('ai_error')}")
        print(f"  降级原因：{result.get('ai_error')}")
    for item in (plan.get("acupuncture_plan") or [])[:6]:
        print(f"   · {item.get('point')}（{item.get('manipulation') or '-'}）留针 {item.get('retention_min')} [{item.get('source')}]")
    if not plan.get("acupuncture_plan"):
        failures.append("治疗建议：未产出任何取穴")

    section("6. 内部治疗资料库重建")
    built = kb.ensure_internal_docs(ai)
    for entry in built["entries"]:
        print(f"  {entry['id']}　{entry['title']}　{entry['visit_count']} 诊次　有效率 {int(entry['effective_rate'] * 100)}%")
    if not built["entries"]:
        failures.append("内部资料库：聚合结果为空")

    section("7. 教学文档与总结报告")
    doc = kb.generate_teaching_doc(ai, topic="消渴（气阴两虚）", level="规培医师")
    report = kb.generate_report(ai, scope="all")
    print(f"  教学文档：{doc}")
    print(f"  总结报告：{report}")
    if not doc.exists() or not report.exists():
        failures.append("文档产出失败")

    section("8. 误触与红线检查")
    flags = case.safety_flags("孕妇，血压 170/100，伴剧烈头痛", None)
    print(f"  红线命中：{flags or '无'}")
    if not any(flag in flags for flag in ("妊娠", "孕妇")):
        failures.append("安全红线：妊娠/孕妇未被识别")

    section("结果")
    if failures:
        print("FAIL — 以下问题需要检查：")
        for item in failures:
            print(f"  · {item}")
        return 1
    print("PASS — 全链路可用。")
    print(f"提示：配置 DEEPSEEK_API_KEY 后重跑，可验证 AI 模式的解析与生成质量（当前为 {cap['mode']} 模式）。")
    if not args.persist:
        print(f"示例数据写在临时目录 {runtime}，未影响 data/。需要保留示例请加 --persist。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
