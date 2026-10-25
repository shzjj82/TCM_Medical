"""业务内核 A/B：病人 SCRM 建档、多模态复诊跟进、AI 结构化解析、疗效对比（期初→X次治疗→末期）。"""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from lib_ai import AIEngine, extract_json
import lib_storage as store

DISCLAIMER = "> 本内容由 AI 辅助生成，须经执业医师审核后使用，不得直接作为处方交付患者。"

EMERGENCY_FLAGS = [
    "胸痛剧烈", "压榨性胸痛", "意识障碍", "昏迷", "抽搐", "大出血", "呕血", "咯血",
    "急腹症", "剧烈腹痛", "卒中", "偏瘫失语", "呼吸困难", "高热不退", "妊娠", "孕妇",
    "十八反", "十九畏", "乌头", "附子中毒",
]

# 规则降级模式词典（AI 不可用时保底）
SYNDROME_LEXICON = [
    "肝阳上亢", "肝肾阴虚", "气阴两虚", "阴虚火旺", "痰湿中阻", "痰热内扰", "气血两虚",
    "气滞血瘀", "脾胃虚弱", "脾虚湿盛", "脾肾阳虚", "心脾两虚", "肝郁脾虚", "肝火上炎",
    "风寒束表", "风热犯肺", "燥邪伤肺", "湿热蕴结", "寒湿阻络", "经络不通", "中焦气机不畅",
]
SYMPTOM_LEXICON = [
    "头晕", "头胀", "头痛", "耳鸣", "失眠", "多梦", "心悸", "胸闷", "乏力", "口干", "口苦",
    "多饮", "多尿", "消瘦", "纳差", "腹胀", "便溏", "便秘", "腰膝酸软", "畏寒", "手足心热",
    "颈项板滞", "视物模糊", "肢体麻木", "水肿", "自汗", "盗汗", "烦躁易怒", "咽喉不利",
]
PRINCIPLE_LEXICON = [
    "平肝潜阳", "滋阴降火", "益气养阴", "健脾益气", "燥湿化痰", "活血化瘀", "疏肝理气",
    "调理中焦气机", "调和脾胃", "温补肾阳", "养心安神", "清热利湿", "补中益气", "交通心肾",
]
HERB_FORMULA_LEXICON = [
    "天麻钩藤饮", "镇肝熄风汤", "半夏白术天麻汤", "杞菊地黄丸", "六味地黄丸", "知柏地黄丸",
    "玉女煎", "消渴方", "生脉散", "参苓白术散", "补中益气汤", "归脾汤", "二陈汤",
    "血府逐瘀汤", "丹栀逍遥散", "金匮肾气丸", "黄连温胆汤", "左归丸", "右归丸", "黄芪桂枝五物汤",
]
HERB_LEXICON = [
    "黄芪", "党参", "白术", "茯苓", "甘草", "天麻", "钩藤", "石决明", "杜仲", "牛膝", "桑寄生",
    "山药", "山萸肉", "熟地", "生地", "麦冬", "天花粉", "葛根", "丹参", "川芎", "当归", "白芍",
    "半夏", "陈皮", "黄连", "黄芩", "泽泻", "薏苡仁", "苍术", "枸杞", "菊花", "酸枣仁", "龙骨", "牡蛎",
]
TECHNIQUE_LEXICON = [
    "平补平泻", "提插捻转", "补法", "泻法", "温针灸", "艾灸", "隔姜灸", "拔罐", "走罐",
    "电针", "耳穴压豆", "留针", "点刺出血", "推拿", "正骨", "穴位贴敷", "刺络放血",
]

PARSE_SYSTEM = """你是资深中医师兼病案信息管理员。请把医生口述/转写/图片识别得到的原始素材，整理成一份规范的中医门诊病历。
铁律：
1. 只提炼素材中真实存在的信息，绝不臆造剂量、既往史、过敏史；
2. 无法确定就填 null，并在 uncertain_fields 中列出该字段名；
3. 证型、治法须使用规范中医术语；
4. 只输出一个 JSON 对象，不要任何解释或代码块。"""

PARSE_USER = """【原始素材】
{material}

【输出 JSON 结构】
{{
  "visit_date": "就诊日期 YYYY-MM-DD，未知填 null",
  "narrative": "120-300 字规范门诊病历叙述（主诉/现病史/四诊摘要/治法/医嘱）",
  "tcm_disease": "中医病名，如 眩晕/消渴/不寐",
  "tcm_syndrome": "辨证分型，如 肝阳上亢、痰湿中阻",
  "treatment_principle": "治则治法，如 平肝潜阳、调理中焦气机",
  "symptoms": ["当前症状"],
  "tongue": "舌象",
  "pulse": "脉象",
  "acupoints": [
    {{"name": "曲池", "laterality": "双|左|右", "manipulation": "平补平泻", "retention_min": 20,
      "depth_cun": null, "rationale": "为何取此穴"}}
  ],
  "prescriptions": [{{"name": "天麻钩藤饮", "composition": ["天麻","钩藤"], "dosage": null, "usage": null}}],
  "herbs_added": ["单味药加"],
  "other_therapy": ["拔罐","推拿"],
  "advice": ["生活调摄/饮食/情志医嘱"],
  "next_plan": "下次治疗安排",
  "efficacy": {{"patient_reported": "患者自述变化", "doctor_assessment": "医师疗效评价", "suggested_severity": null}},
  "uncertain_fields": ["无法确认的字段"]
}}"""


# ================================================================ 条件结构
def blank_condition(date: Optional[str] = None) -> Dict[str, Any]:
    return {
        "date": date or store.today(),
        "chief_complaint": None,
        "western_diagnosis": [],
        "tcm_disease": None,
        "tcm_syndrome": None,
        "symptoms": [],
        "tongue": None,
        "pulse": None,
        "severity_score": None,
        "attachments": [],
        "summary": None,
        "amendments": [],
    }


_KEEP = set(blank_condition().keys())


def normalize_condition(raw: Dict[str, Any], date: Optional[str] = None) -> Dict[str, Any]:
    cond = blank_condition(date or raw.get("date") or store.today())
    for k, v in (raw or {}).items():
        if k in _KEEP and v is not None:
            cond[k] = v
    if isinstance(cond["western_diagnosis"], str):
        cond["western_diagnosis"] = [s for s in re.split(r"[,，/、]", cond["western_diagnosis"]) if s]
    if isinstance(cond["symptoms"], str):
        cond["symptoms"] = [s for s in re.split(r"[,，/、]", cond["symptoms"]) if s]
    return cond


def summarize_condition(cond: Dict[str, Any]) -> str:
    bits = []
    if cond.get("chief_complaint"):
        bits.append(cond["chief_complaint"])
    if cond.get("tcm_syndrome"):
        bits.append(f"辨证 {cond['tcm_syndrome']}")
    if cond.get("symptoms"):
        bits.append("、".join(cond["symptoms"]))
    if cond.get("tongue") or cond.get("pulse"):
        bits.append(f"{cond.get('tongue') or ''} {cond.get('pulse') or ''}".strip())
    if cond.get("western_diagnosis"):
        bits.append("西医诊断 " + "、".join(cond["western_diagnosis"]))
    return "；".join(bits)


# ================================================================ 建档
def create_patient(payload: Dict[str, Any], ai: AIEngine,
                   images: Optional[List[str]] = None,
                   audios: Optional[List[str]] = None) -> Dict[str, Any]:
    store.ensure_dirs()
    pid = store.new_id("P")
    extras: List[str] = []

    for img in images or []:
        try:
            rel = store.attach_store(pid, img)
            extras.append(rel)
            if ai.has_vision:
                desc = ai.describe_image(img, "初诊（舌苔/检查单/处方）")
                if desc.get("structured"):
                    cond_txt = desc["structured"].get("observation", "")
                    if cond_txt:
                        payload.setdefault("initial_notes_from_image", [])
                        if isinstance(payload["initial_notes_from_image"], list):
                            payload["initial_notes_from_image"].append(cond_txt)
        except Exception as exc:  # 附件失败不阻断建档
            extras.append(f"[附件失败] {img}: {exc}")

    for audio in audios or []:
        res = ai.transcribe(audio)
        if res.get("text"):
            payload.setdefault("initial_notes_from_audio", res["text"])
        else:
            payload.setdefault("pending_transcription", []).append(
                {"path": audio, "reason": res.get("reason", "ASR 不可用")}
            )

    initial = normalize_condition(payload.get("initial_condition") or payload,
                                  payload.get("visit_date") or store.today())
    initial["attachments"] = extras
    if not initial.get("summary"):
        initial["summary"] = summarize_condition(initial)

    tags = list({
        *payload.get("tags", []),
        *([initial["tcm_disease"]] if initial.get("tcm_disease") else []),
        *(initial.get("western_diagnosis") or []),
    })

    patient = {
        "id": pid,
        "name": payload.get("name") or "未具名",
        "gender": payload.get("gender"),
        "age": payload.get("age"),
        "phone": payload.get("phone"),
        "tags": tags,
        "status": payload.get("status", "active"),
        "visit_count": 0,
        "created_at": store.now_iso(),
        "updated_at": store.now_iso(),
        "initial_condition": initial,          # ← 期初基线：写入后不可覆盖
        "current_condition": json.loads(json.dumps(initial, ensure_ascii=False)),
        "contrast": None,
        "latest_summary": None,
        "media": {
            "initial_audio_transcripts": payload.get("initial_notes_from_audio"),
            "pending_transcription": payload.get("pending_transcription", []),
            "image_notes": payload.get("initial_notes_from_image", []),
        },
    }
    patient["contrast"] = build_contrast(patient)
    return store.save_patient(patient)


def amend_initial(pid: str, note: str, field: Optional[str] = None) -> Dict[str, Any]:
    """期初基线修正：只追加 amendments，不改原值，保留疗效对比的审计链。"""
    patient = store.find_patient(pid)
    if not patient:
        raise KeyError(f"病人不存在: {pid}")
    patient["initial_condition"].setdefault("amendments", []).append(
        {"at": store.now_iso(), "field": field, "note": note}
    )
    patient["contrast"] = build_contrast(patient)
    return store.save_patient(patient)


# ================================================================ 解析
def parse_case_note(material: str, ai: AIEngine, *, reasoner: bool = False) -> Dict[str, Any]:
    if ai.has_llm:
        try:
            data = ai.chat_json(PARSE_SYSTEM, PARSE_USER.format(material=material[:8000]),
                                reasoner=reasoner, temperature=0.2)
            data["ai_mode"] = "llm"
            data["ai_model"] = ai.reasoner if reasoner else ai.model
            data["review_status"] = "pending"
            return data
        except Exception as exc:
            base = rule_parse(material)
            base["ai_mode"] = "rule_based_fallback"
            base["ai_error"] = str(exc)[:300]
            return base
    data = rule_parse(material)
    data["ai_mode"] = "rule_based"
    return data


def rule_parse(text: str) -> Dict[str, Any]:
    """基于词典的关键词抽取，AI 不可用时保底，绝不臆造。"""
    def hits(lex):
        return [w for w in lex if w in text]

    acupuncture = []
    for pt in set(hits(ACUPOINT_LEXICON)):
        m = re.search(rf"{pt}[^。；，,\n]{{0,12}}", text)
        seg = m.group(0) if m else pt
        man = next((t for t in TECHNIQUE_LEXICON if t in seg), None)
        minutes = None
        mm = re.search(r"留针\s*(\d+)\s*分", seg)
        if mm:
            minutes = int(mm.group(1))
        acupuncture.append({
            "name": pt, "laterality": "双", "manipulation": man, "retention_min": minutes,
            "depth_cun": None, "rationale": None,
        })
    principle = hits(PRINCIPLE_LEXICON)
    symptoms_seen = hits(SYMPTOM_LEXICON)
    return {
        "visit_date": None,
        "narrative": text[:400],
        "tcm_disease": None,
        "tcm_syndrome": "、".join(hits(SYNDROME_LEXICON)) or None,
        "treatment_principle": "、".join(principle) or None,
        "symptoms": symptoms_seen,
        "tongue": (_extract_after(text, "舌") or None),
        "pulse": (_extract_after(text, "脉") or None),
        "acupoints": acupuncture,
        "prescriptions": [{"name": f, "composition": [], "dosage": None, "usage": None} for f in hits(HERB_FORMULA_LEXICON)],
        "herbs_added": hits(HERB_LEXICON),
        "other_therapy": [t for t in TECHNIQUE_LEXICON if t in text and t not in {"补法", "泻法", "留针"}],
        "advice": [],
        "next_plan": None,
        "efficacy": {"patient_reported": None, "doctor_assessment": None, "suggested_severity": None},
        "uncertain_fields": ["全部由规则模式抽取，需人工复核"],
        "review_status": "pending",
    }


def _extract_after(text: str, key: str) -> str:
    m = re.search(rf"{key}[^。；，,\s]{{0,10}}", text)
    return m.group(0) if m else ""


ACUPOINT_LEXICON = [
    "百会", "风池", "曲池", "合谷", "太冲", "足三里", "三阴交", "太溪", "涌泉", "内关", "神门",
    "中脘", "天枢", "气海", "关元", "命门", "肾俞", "脾俞", "胃俞", "肝俞", "胰俞", "承山",
    "阳陵泉", "阴陵泉", "丰隆", "血海", "膈俞", "环跳", "委中", "昆仑", "外关", "后溪", "印堂",
    "太阳", "四神聪", "安眠", "照海", "复溜", "列缺", "尺泽", "曲泽", "膻中", "期门", "期門",
]


# ================================================================ 跟进
def record_visit(pid: str, ai: AIEngine, *, audio: Optional[List[str]] = None,
                 images: Optional[List[str]] = None, text: Optional[str] = None,
                 doctor_note: Optional[str] = None, severity: Optional[float] = None,
                 visit_date: Optional[str] = None, conclusion: Optional[str] = None) -> Dict[str, Any]:
    patient = store.find_patient(pid)
    if not patient:
        raise KeyError(f"病人不存在: {pid}")

    visit_date = visit_date or store.today()
    existing = next((v for v in store.list_visits(pid) if v.get("date") == visit_date), None)
    visit_no = existing["visit_no"] if existing else patient.get("visit_count", 0) + 1

    # ① 采集
    media, blocks = [], []
    for a in audio or []:
        rel = store.attach_store(pid, a)
        res = ai.transcribe(a)
        media.append({"type": "audio", "path": rel, "transcript": res.get("text"),
                      "degraded": res.get("degraded", False), "engine": res.get("engine")})
        if res.get("text"):
            blocks.append(f"[医生录音转写]\n{res['text']}")
        else:
            blocks.append(f"[医生录音] {rel}（{res.get('reason', '未转写')}，待人工补录）")
    for img in images or []:
        rel = store.attach_store(pid, img)
        res = ai.describe_image(img, "复诊")
        obs = res.get("structured") or {}
        media.append({"type": "image", "path": rel, "ocr": res.get("text"),
                      "image_type": obs.get("image_type"), "observation": obs.get("observation"),
                      "degraded": res.get("degraded", False)})
        if res.get("degraded"):
            blocks.append(f"[图片] {rel}（{res.get('reason', '未解析')}）")
        else:
            blocks.append(
                f"[{obs.get('image_type') or '图片'}]\n可见文字：{obs.get('visible_text') or '无'}\n"
                f"所见：{obs.get('observation') or ''}\n提示：{json.dumps(obs.get('clinical_hints') or [], ensure_ascii=False)}"
            )
    if text:
        blocks.append(f"[现场文字记录]\n{text}")
    if doctor_note:
        blocks.append(f"[医生批注]\n{doctor_note}")

    material = "\n\n".join(blocks) or "（本次未提供任何素材）"

    # ② 归一 + ③ 结构化
    parsed = parse_case_note(material, ai)
    parsed["visit_date"] = visit_date
    if doctor_note:
        parsed["doctor_note_raw"] = doctor_note
    _inherit_context(parsed, patient)

    # ④ 严重度：命令行优先 > AI 建议 > 继承上次
    prev = store.list_visits(pid)
    prev_severity = prev[-1]["outcome"].get("severity_score") if prev else None
    base_severity = prev_severity if prev_severity is not None else patient["initial_condition"].get("severity_score")
    sug = (parsed.get("efficacy") or {}).get("suggested_severity")
    final_severity = severity if severity is not None else (sug if sug is not None else base_severity)

    current = normalize_condition({
        "date": visit_date,
        "tcm_disease": parsed.get("tcm_disease"),
        "tcm_syndrome": parsed.get("tcm_syndrome"),
        "symptoms": parsed.get("symptoms") or [],
        "tongue": parsed.get("tongue"),
        "pulse": parsed.get("pulse"),
        "severity_score": final_severity,
        "attachments": [m["path"] for m in media],
    })
    current["summary"] = summarize_condition(current) or parsed.get("narrative")

    assessment = (parsed.get("efficacy") or {}).get("doctor_assessment")
    visit = {
        "patient_id": patient["id"],
        "visit_no": visit_no,
        "date": visit_date,
        "channels": _collect_channels(audio, images, text, doctor_note),
        "raw": {"material": material, "media": media},
        "doctor_note": doctor_note,
        "parsed": parsed,
        "outcome": {
            "symptom_changes": summarize_delta(prev[-1] if prev else None, parsed),
            "severity_score": final_severity,
            "doctor_conclusion": conclusion or assessment,
            "next_plan": parsed.get("next_plan"),
        },
        "ai_mode": parsed.get("ai_mode", "unknown"),
        "review_status": "pending",
        "created_at": store.now_iso(),
        "updated_at": store.now_iso(),
    }
    store.save_visit(patient["id"], visit)

    # ⑤ 刷新病人最新状态
    #    注意：向前补录旧日期的记录不应顶掉更新的 current_condition
    latest_date = max((v.get("date") or "" for v in prev), default="")
    is_backfill = bool(latest_date) and visit_date < latest_date
    if not is_backfill:
        patient["current_condition"] = current
        patient["latest_summary"] = parsed.get("narrative") or current["summary"]
    if not existing:
        patient["visit_count"] = int(patient.get("visit_count", 0)) + 1
    for t in _auto_tags(parsed):
        if t not in patient.setdefault("tags", []):
            patient["tags"].append(t)
    patient["contrast"] = build_contrast(patient)
    store.save_patient(patient)
    visit["contrast"] = patient["contrast"]
    return visit


def _inherit_context(parsed: Dict[str, Any], patient: Dict[str, Any]) -> None:
    """本次未抽到的病名/证型/主症，从病人既有档案继承，避免内部资料库聚成一堆「未归类」。

    继承项记入 uncertain_fields 提醒复核，绝不伪装成本次诊疗的判断。
    """
    base = patient.get("current_condition") or patient.get("initial_condition") or {}
    inferred: List[str] = []
    for key in ("tcm_disease", "tcm_syndrome", "western_diagnosis"):
        if not parsed.get(key) and base.get(key):
            parsed[key] = base[key]
            inferred.append(key)
    if not parsed.get("symptoms") and base.get("symptoms"):
        parsed["symptoms"] = base["symptoms"]
        inferred.append("symptoms")
    if inferred:
        parsed.setdefault("uncertain_fields", [])
        if isinstance(parsed["uncertain_fields"], list):
            parsed["uncertain_fields"].append("以下字段继承自既往档案：" + "、".join(inferred))


def _collect_channels(audio, images, text, doctor_note) -> List[str]:
    ch = []
    if audio:
        ch.append("audio")
    if images:
        ch.append("image")
    if text:
        ch.append("text")
    if doctor_note:
        ch.append("doctor_note")
    return ch or ["empty"]


def _auto_tags(parsed: Dict[str, Any]) -> List[str]:
    tags = []
    if parsed.get("tcm_disease"):
        tags.append(parsed["tcm_disease"])
    if parsed.get("tcm_syndrome"):
        tags.append(parsed["tcm_syndrome"])
    return tags


# ================================================================ 疗效对比
VERDICT_RULES = [
    (lambda ini, lat: lat is not None and lat <= 1, "临床痊愈"),
    (lambda ini, lat: ini and lat is not None and (ini - lat) / ini >= 0.7, "显效"),
    (lambda ini, lat: ini and lat is not None and (ini - lat) / ini >= 0.3, "有效"),
    (lambda ini, lat: ini and lat is not None and (ini - lat) / ini > 0, "好转"),
    (lambda ini, lat: ini and lat is not None and lat == ini, "无变化"),
]


def _verdict(initial_score: Optional[float], latest_score: Optional[float]) -> str:
    if initial_score is None or latest_score is None:
        return "待评估"
    if latest_score > initial_score:
        return "加重"
    for pred, name in VERDICT_RULES:
        if pred(initial_score, latest_score):
            return name
    return "待评估"


def build_contrast(patient: Dict[str, Any]) -> Dict[str, Any]:
    """生成前端「期初情况 → 经过 X 次治疗 → 末期情况」区块所需的全部数据。"""
    visits = store.list_visits(patient["id"])
    initial = patient.get("initial_condition", {})
    latest = patient.get("current_condition", initial)

    treatments = _treatment_tally(visits)
    initial_score, latest_score = initial.get("severity_score"), latest.get("severity_score")
    rate = None
    if initial_score and latest_score is not None and initial_score != 0:
        rate = round((initial_score - latest_score) / initial_score, 3)

    milestones = []
    for v in visits:
        change = (v.get("outcome") or {}).get("symptom_changes")
        key = (list(change.values())[0] if isinstance(change, dict) and change else None)
        if isinstance(key, str):
            milestones.append({"visit_no": v["visit_no"], "date": v["date"], "key_change": key[:120]})
        elif (v.get("parsed") or {}).get("efficacy", {}).get("patient_reported"):
            milestones.append({
                "visit_no": v["visit_no"], "date": v["date"],
                "key_change": str(v["parsed"]["efficacy"]["patient_reported"])[:120],
            })

    return {
        "initial": {
            "date": initial.get("date"),
            "summary": initial.get("summary") or summarize_condition(initial),
            "severity_score": initial_score,
            "attachments": initial.get("attachments") or [],
            "amendments": initial.get("amendments") or [],
        },
        "visits_done": len(visits),
        "treatments": treatments,
        "latest": {
            "date": latest.get("date"),
            "summary": latest.get("summary") or summarize_condition(latest),
            "severity_score": latest_score,
            "attachments": latest.get("attachments") or [],
        },
        "delta": {
            "severity_delta": (round(latest_score - initial_score, 2)
                               if initial_score is not None and latest_score is not None else None),
            "improvement_rate": rate,
            "verdict": _verdict(initial_score, latest_score),
        },
        "milestones": milestones,
    }


def _treatment_tally(visits: List[Dict[str, Any]]) -> List[str]:
    acupuncture = sum(1 for v in visits if (v.get("parsed") or {}).get("acupoints"))
    herbs = sum(1 for v in visits if (v.get("parsed") or {}).get("prescriptions"))
    other = set()
    for v in visits:
        for t in (v.get("parsed") or {}).get("other_therapy") or []:
            other.add(t)
    out = []
    if acupuncture:
        out.append(f"针灸 {acupuncture} 次")
    if herbs:
        out.append(f"中药 {herbs} 诊")
    if other:
        out.append("、".join(sorted(other)))
    return out


def summarize_delta(prev_visit: Optional[Dict[str, Any]], parsed: Dict[str, Any]) -> Dict[str, str]:
    """与上一次随访对比症状增减，用于 qualify 疗效。"""
    now = set(parsed.get("symptoms") or [])
    before = set((prev_visit or {}).get("parsed", {}).get("symptoms") or [])
    out: Dict[str, str] = {}
    if before:
        improved = before - now
        worsened = now - before
        if improved:
            out["缓解或消失症状"] = "、".join(sorted(improved))
        if worsened:
            out["新增症状"] = "、".join(sorted(worsened))
        if not improved and not worsened:
            out["症状谱"] = "与上次一致"
    reported = (parsed.get("efficacy") or {}).get("patient_reported")
    if reported:
        out["患者自述"] = str(reported)
    return out


def render_contrast(patient: Dict[str, Any], fmt: str = "view") -> Any:
    c = build_contrast(patient)
    if fmt == "json":
        return c
    ini, lat, d = c["initial"], c["latest"], c["delta"]
    rate = f"{int(round(d['improvement_rate'] * 100))}%" if d["improvement_rate"] is not None else "—"
    lines = [
        f"病人：{patient['name']}（{patient.get('gender') or '-'} {patient.get('age') or '-'}岁） ID：{patient['id']}",
        "",
        f"┌─ 期初情况 · {ini['date'] or '—'} · 严重度 {_fmt_score(ini['severity_score'])}/10",
        f"│  {ini['summary'] or '（未记录）'}",
        f"└─ 诊疗前基线",
        "      ↓ 经过 " + f"{c['visits_done']} 次治疗" + (f"（{'，'.join(c['treatments'])}）" if c["treatments"] else ""),
        f"┌─ 最新/末期情况 · {lat['date'] or '—'} · 严重度 {_fmt_score(lat['severity_score'])}/10",
        f"│  {lat['summary'] or '（尚无复诊）'}",
        f"└─ 第 {c['visits_done']} 诊后",
        "",
        f"【疗效判定】{d['verdict']}　严重度变化 {d['severity_delta'] if d['severity_delta'] is not None else '—'}　改善幅度 {rate}",
    ]
    if c["milestones"]:
        lines.append("")
        lines.append("【关键转折】")
        for m in c["milestones"][-6:]:
            lines.append(f"  · 第{m['visit_no']}诊（{m['date']}）：{m['key_change']}")
    if ini.get("amendments"):
        lines.append("")
        lines.append("【期初基线修正记录】")
        for a in ini["amendments"]:
            lines.append(f"  · {a['at']} {a.get('field') or ''}：{a['note']}")
    if fmt == "md":
        return "\n".join(lines) + f"\n\n{DISCLAIMER}"
    return "\n".join(lines)


def _fmt_score(v: Any) -> str:
    return "—" if v is None else str(v)


def safety_flags(*texts: Optional[str]) -> List[str]:
    joined = " ".join(t or "" for t in texts)
    return [w for w in EMERGENCY_FLAGS if w in joined]
