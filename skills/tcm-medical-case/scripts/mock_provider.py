#!/usr/bin/env python3
"""本地 Mock DeepSeek（OpenAI 兼容协议）——用于离线验证 Skill 的 AI 分支。

用途：没有 API Key、或不想消耗 token 时，把 DEEPSEEK_BASE_URL 指到本服务，
即可完整跑通「AI 解析 → AI 建议 → AI 报告/教学文档」这条链路（验证代码路径正确性）。

用法：
  python3 scripts/mock_provider.py --port 8899
  export DEEPSEEK_API_KEY=test DEEPSEEK_BASE_URL=http://127.0.0.1:8899/v1
  python3 scripts/smoke_test.py
"""
from __future__ import annotations

import argparse
import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PARSE_REPLY = {
    "visit_date": "2026-10-25",
    "narrative": "【Mock】患者复诊，主症减轻，继续原方案加减治疗。",
    "tcm_disease": "消渴",
    "tcm_syndrome": "气阴两虚",
    "treatment_principle": "益气养阴、调理中焦气机",
    "symptoms": ["乏力"],
    "tongue": "舌淡红苔薄白",
    "pulse": "细缓",
    "acupoints": [
        {"name": "足三里", "laterality": "双", "manipulation": "补法", "retention_min": 30,
         "depth_cun": 1.0, "rationale": "调理中焦气机、健脾益气"},
        {"name": "三阴交", "laterality": "双", "manipulation": "平补平泻", "retention_min": 20,
         "depth_cun": None, "rationale": "健脾养血"},
    ],
    "prescriptions": [{"name": "玉女煎", "composition": ["石膏", "熟地", "麦冬", "知母", "牛膝"],
                       "dosage": None, "usage": None}],
    "herbs_added": ["黄芪"],
    "other_therapy": ["艾灸"],
    "advice": ["忌生冷", "规律作息"],
    "next_plan": "一周后复诊",
    "efficacy": {"patient_reported": "乏力减轻", "doctor_assessment": "病情好转", "suggested_severity": 3},
    "uncertain_fields": ["depth_cun"],
}

ADVISE_REPLY = {
    "case_profile": {"tcm_disease": "眩晕", "tcm_syndrome": "肝阳上亢",
                     "western_diagnosis": ["高血压"], "key_symptoms": ["头晕", "血压升高"]},
    "safety_alerts": ["建议先排除脑血管意外"],
    "treatment_principle": "平肝潜阳、调理中焦气机",
    "acupuncture_plan": [
        {"point": "曲池", "laterality": "双", "manipulation": "泻法", "retention_min": 20,
         "rationale": "清热降压", "source": "EXT-DEMO01"},
        {"point": "足三里", "laterality": "双", "manipulation": "平补平泻", "retention_min": 20,
         "rationale": "调理中焦气机", "source": "INT-DEMO01"},
    ],
    "herbal_plan": [{"formula": "天麻钩藤饮", "modification": "失眠加酸枣仁", "source": "EXT-DEMO01", "note": None}],
    "lifestyle_advice": ["低盐饮食", "规律监测血压"],
    "followup_plan": "一周后复诊，复评严重度",
    "evidence_summary": {"external_hits": ["EXT-DEMO01"], "internal_hits": ["INT-DEMO01"],
                         "case_hits": [], "insufficient_fields": []},
    "confidence": 0.8,
}


def build_reply(messages: list) -> str:
    user_text = " ".join(str(m.get("content", "")) for m in messages if m.get("role") == "user")
    if "uncertain_fields" in user_text or " shareholder" in user_text or "原始素材" in user_text:
        return json.dumps(PARSE_REPLY, ensure_ascii=False)
    if "case_profile" in user_text or "安全红线自查" in user_text:
        return json.dumps(ADVISE_REPLY, ensure_ascii=False)
    return (
        "# 【Mock】中医诊疗总结报告\n\n"
        "- 本段由 mock_provider.py 生成，用于验证 AI 分支链路可用。\n\n"
        "## 一、总体规模\n- 病人总数：1　诊疗人次：3\n\n"
        "## 二、疗效判定分布\n| 判定 | 例数 |\n| --- | --- |\n| 有效 | 1 |\n"
    )


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:  # 静音默认日志
        pass

    def _send(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        if not re.search(r"/chat/completions$", self.path):
            self._send({"error": {"message": f"mock 未提供 {self.path}"}}, 404)
            return
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = {}
        content = build_reply(payload.get("messages") or [])
        self._send({
            "id": "chatcmpl-mock",
            "object": "chat.completion",
            "model": payload.get("model", "mock-model"),
            "choices": [{"index": 0, "message": {"role": "assistant", "content": content},
                         "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        })

    def do_GET(self) -> None:
        self._send({"status": "mock-deepseek-ok"})


def main() -> None:
    ap = argparse.ArgumentParser(description="Mock DeepSeek provider")
    ap.add_argument("--port", type=int, default=8899)
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"mock deepseek listening on http://{args.host}:{args.port}/v1")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
