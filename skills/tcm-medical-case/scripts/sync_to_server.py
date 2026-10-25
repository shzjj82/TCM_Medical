#!/usr/bin/env python3
"""把 Skill 本地沉淀的医案数据同步到 NestJS / PostgreSQL 服务端。

用法：
  python3 scripts/sync_to_server.py --server http://localhost:3001 --token <JWT>
  python3 scripts/tcm.py sync --patient P2026xxxx
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List

sys.path.insert(0, str(Path(__file__).resolve().parent))

import lib_storage as store  # noqa: E402
from lib_ai import http_json  # noqa: E402


def _base(server: str | None) -> str:
    return (server or os.environ.get("TCM_API_BASE_URL") or "http://localhost:3001").rstrip("/")


def _headers(token: str | None) -> Dict[str, str]:
    headers = {"Content-Type": "application/json"}
    tok = token or os.environ.get("TCM_API_TOKEN")
    if tok:
        headers["Authorization"] = f"Bearer {tok}"
    return headers


def _post(url: str, payload: Any, headers: Dict[str, str]) -> Dict[str, Any]:
    try:
        return http_json(url, payload, headers, timeout=30)
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:200]}


def run_sync(server: str | None = None, token: str | None = None,
             patient_id: str | None = None, dry_run: bool = False) -> Dict[str, Any]:
    base = _base(server)
    headers = _headers(token)
    patients: List[Dict[str, Any]] = (
        [store.find_patient(patient_id)] if patient_id else store.list_patients()
    )
    patients = [p for p in patients if p]

    report = {"server": base, "patients": 0, "visits": 0,
              "external_refs": 0, "internal_entries": 0, "errors": []}

    for p in patients:
        payload = {k: v for k, v in p.items() if k != "contrast"}
        payload["external_id"] = p["id"]
        for key in ("initial_condition", "current_condition"):
            if isinstance(payload.get(key), dict):
                payload[key] = payload[key]
        if not dry_run:
            res = _post(f"{base}/api/patients/sync", payload, headers)
            if res.get("ok") is False:
                report["errors"].append(f"patient {p['id']}: {res.get('error')}")
        report["patients"] += 1

        for v in store.list_visits(p["id"]):
            vpayload = dict(v)
            vpayload["external_patient_id"] = p["id"]
            vpayload["external_id"] = f"{p['id']}-V{v['visit_no']:03d}"
            if not dry_run:
                res = _post(f"{base}/api/visits/sync", vpayload, headers)
                if res.get("ok") is False:
                    report["errors"].append(f"visit {p['id']}#V{v['visit_no']}: {res.get('error')}")
            report["visits"] += 1

    for ref in store.external_index():
        if dry_run:
            continue
        res = _post(f"{base}/api/knowledge/external/sync",
                    {**ref, "external_id": ref["id"]}, headers)
        if res.get("ok") is False:
            report["errors"].append(f"external {ref['id']}: {res.get('error')}")
        report["external_refs"] += 1

    for entry in store.internal_index():
        if dry_run:
            continue
        res = _post(f"{base}/api/knowledge/internal/sync",
                    {**entry, "external_id": entry["id"]}, headers)
        if res.get("ok") is False:
            report["errors"].append(f"internal {entry['id']}: {res.get('error')}")
        report["internal_entries"] += 1

    if dry_run:
        print("[dry-run] 未实际发送，载荷统计如下：")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if report["errors"] and not dry_run:
        print("提示：同步失败通常是服务端未启动或缺少鉴权 Token。"
              f"请确认 {base} 可访问（cd packages/server && pnpm dev）。", file=sys.stderr)
    return report


def main() -> None:
    ap = argparse.ArgumentParser(description="Sync local TCM case data to server")
    ap.add_argument("--server"), ap.add_argument("--token"), ap.add_argument("--patient")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    run_sync(a.server, a.token, a.patient, a.dry_run)


if __name__ == "__main__":
    main()
