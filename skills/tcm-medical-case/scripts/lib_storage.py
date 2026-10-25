"""中医医案 Skill —— 零依赖 JSON 存储层。

设计要点：
1. 只用 Python 标准库，任何环境都能跑；
2. 数据落 JSON 文件，可直接进 Git，满足"沉淀"的诉求；
3. initial_condition 一旦写入只允许 amendments 追加，不允许覆盖（疗效对比可信性的根基）。
"""
from __future__ import annotations

import json
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

SKILL_ROOT = Path(__file__).resolve().parents[1]


# ---------------------------------------------------------------- 路径工具
def data_dir() -> Path:
    return Path(os.environ.get("TCM_SKILL_DATA_DIR") or SKILL_ROOT / "data")


def output_dir() -> Path:
    return Path(os.environ.get("TCM_SKILL_OUTPUT_DIR") or SKILL_ROOT / "output")


def ensure_dirs() -> Path:
    root = data_dir()
    for sub in (
        "patients",
        "visits",
        "attachments",
        "knowledge/internal",
        "knowledge/external",
        "tmp",
    ):
        (root / sub).mkdir(parents=True, exist_ok=True)
    out = output_dir()
    for sub in ("internal", "reports", "teaching", "external-snapshot"):
        (out / sub).mkdir(parents=True, exist_ok=True)
    return root


def _p(*parts: str) -> Path:
    return (data_dir() / Path(*parts))


# ---------------------------------------------------------------- 基础工具
def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def new_id(prefix: str) -> str:
    stamp = datetime.now().strftime("%Y%m%d")
    return f"{prefix}{stamp}{uuid.uuid4().hex[:4].upper()}"


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        # 损坏文件不静默丢失，改名留档后按默认处理
        backup = path.with_suffix(path.suffix + ".corrupt")
        path.rename(backup)
        return default


def write_json(path: Path, payload: Any) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)
    return path


def write_text(path: Path, text: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


# ---------------------------------------------------------------- 病人
def patient_path(pid: str) -> Path:
    return _p("patients", f"{pid}.json")


def list_patients(status: Optional[str] = None, keyword: Optional[str] = None) -> List[Dict[str, Any]]:
    ensure_dirs()
    rows: List[Dict[str, Any]] = []
    for f in sorted(_p("patients").glob("*.json")):
        row = read_json(f)
        if not row:
            continue
        if status and row.get("status") != status:
            continue
        if keyword:
            hay = " ".join(
                str(row.get(k, "") or "")
                for k in ("id", "name", "phone", "chief_complaint")
            ) + " " + " ".join(row.get("tags") or [])
            if keyword not in hay:
                continue
        rows.append(row)
    rows.sort(key=lambda r: r.get("updated_at") or "", reverse=True)
    return rows


def find_patient(key: str) -> Optional[Dict[str, Any]]:
    """支持 patient_id 精确匹配、前缀匹配与姓名匹配。"""
    ensure_dirs()
    key = (key or "").strip()
    if not key:
        return None
    exact = read_json(patient_path(key))
    if exact:
        return exact
    for row in list_patients():
        if key == row.get("name") or row.get("id", "").upper().startswith(key.upper()):
            return row
    return None


def save_patient(patient: Dict[str, Any]) -> Dict[str, Any]:
    patient["updated_at"] = now_iso()
    write_json(patient_path(patient["id"]), patient)
    return patient


# ---------------------------------------------------------------- 复诊记录
def visit_dir(pid: str) -> Path:
    return _p("visits", pid)


def list_visits(pid: str) -> List[Dict[str, Any]]:
    d = visit_dir(pid)
    if not d.exists():
        return []
    rows = []
    for f in sorted(d.glob("V*.json")):
        row = read_json(f)
        if row:
            rows.append(row)
    rows.sort(key=lambda r: int(str(r.get("visit_no") or 0)))
    return rows


def load_visit(pid: str, visit_no: int) -> Optional[Dict[str, Any]]:
    return read_json(visit_dir(pid) / f"V{int(visit_no):03d}.json")


def save_visit(pid: str, visit: Dict[str, Any]) -> Dict[str, Any]:
    visit["updated_at"] = now_iso()
    write_json(visit_dir(pid) / f"V{int(visit['visit_no']):03d}.json", visit)
    return visit


# ---------------------------------------------------------------- 附件
def attach_store(pid: str, src: str) -> str:
    """把外部媒体文件复制进资料目录，返回相对路径（保证医案证据不丢）。"""
    from shutil import copy2

    src_path = Path(src).expanduser()
    if not src_path.exists():
        raise FileNotFoundError(f"附件不存在: {src}")
    dest_dir = _p("attachments", pid)
    dest_dir.mkdir(parents=True, exist_ok=True)
    name = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{src_path.name}"
    copy2(src_path, dest_dir / name)
    return str(Path("data/attachments") / pid / name)


# ---------------------------------------------------------------- 知识库
def internal_dir() -> Path:
    return ensure_dirs() / "knowledge" / "internal"


def external_dir() -> Path:
    return ensure_dirs() / "knowledge" / "external"


def internal_index() -> List[Dict[str, Any]]:
    return read_json(_p("knowledge", "internal", "index.json"), []) or []


def external_index() -> List[Dict[str, Any]]:
    return read_json(_p("knowledge", "external", "index.json"), []) or []


def save_internal_index(rows: Iterable[Dict[str, Any]]) -> None:
    write_json(_p("knowledge", "internal", "index.json"), list(rows))


def save_external_index(rows: Iterable[Dict[str, Any]]) -> None:
    write_json(_p("knowledge", "external", "index.json"), list(rows))


def add_reference_row(row: Dict[str, Any]) -> Dict[str, Any]:
    rows = external_index()
    rows.append(row)
    save_external_index(rows)
    write_json(external_dir() / f"{row['id']}.json", row)
    return row


def search_index(rows: List[Dict[str, Any]], query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    """轻量 BM25 风格打分：词项命中 + 标签加权，无第三方依赖。"""
    if not query.strip():
        return rows[:top_k]
    terms = [t for t in re.split(r"[\s,，、/|]+", query) if t]
    def join_field(value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value
        if isinstance(value, dict):
            return " ".join(f"{k} {v}" for k, v in value.items() if v is not None)
        try:
            return " ".join(join_field(v) for v in value)
        except TypeError:
            return str(value)

    scored = []
    for row in rows:
        haystack = " ".join([
            str(row.get("title", "")),
            str(row.get("summary") or row.get("content") or ""),
            join_field(row.get("tags")),
            str(row.get("tcm_disease") or ""),
            join_field(row.get("indications")),
            join_field(row.get("acupoints")),
            join_field(row.get("syndromes")),
            join_field(row.get("herbs_common")),
            join_field(row.get("treatment_principles")),
            join_field(row.get("manifestations")),
        ])
        tags = [str(t) for t in (row.get("tags") or [])]
        score = 0.0
        for t in terms:
            hits = haystack.count(t)
            if hits:
                score += 1 + 0.3 * (hits - 1)
            if any(t == tag or (t in tag) for tag in tags):
                score += 1.5
        if score > 0:
            scored.append((score, row))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [r for _, r in scored[:top_k]]
