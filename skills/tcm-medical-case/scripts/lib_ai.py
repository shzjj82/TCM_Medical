"""AI Provider 抽象层（零第三方依赖，仅用 urllib）。

文本：DeepSeek（OpenAI 兼容协议），环境变量 DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL
语音：可选 ASR Provider（openai / whisper_local）
图片：可选 Vision Provider（openai 兼容）

核心原则：任何 Provider 缺失都不抛异常中断流程，而是返回降级结果并在结果里标记
`degraded=True`，由上层决定提示用户或转 rule_based 模式。
"""
from __future__ import annotations

import base64
import json
import mimetypes
import os
import re
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib import request, error


DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-chat"
DEFAULT_REASONER = "deepseek-reasoner"
DEFAULT_TIMEOUT = 90
RETRYABLE_STATUS = (429, 500, 502, 503, 504)
MAX_RETRIES = 3
# 单次输出上限：DeepSeek 侧硬限制之内留出余量，避免 reasoner 思维链挤占正文预算
MAX_OUTPUT_TOKENS = 8000


class TransientError(RuntimeError):
    """可重试的瞬时故障：限流、网关错误、网络抖动、超时。"""


def _env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


# ------------------------------------------------------------------ HTTP
def http_json(url: str, payload: Dict[str, Any], headers: Dict[str, str], timeout: int = DEFAULT_TIMEOUT) -> Dict[str, Any]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = request.Request(url, data=body, method="POST")
    for k, v in headers.items():
        req.add_header(k, v)
    req.add_header("Content-Type", "application/json")
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except error.HTTPError as e:  # 带上服务端返回体，便于定位
        detail = e.read().decode("utf-8", errors="replace") if hasattr(e, "read") else ""
        if e.code >= 500 or e.code == 429:
            raise TransientError(f"HTTP {e.code} {url}: {detail[:300]}") from e
        raise RuntimeError(f"HTTP {e.code} {url}: {detail[:500]}") from e
    except error.URLError as e:
        raise TransientError(f"网络不可用 {url}: {e}") from e
    except TimeoutError as e:
        raise TransientError(f"请求超时 {url}") from e
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        raise RuntimeError(f"响应非 JSON: {raw[:300]}")


def http_multipart(url: str, fields: Dict[str, str], file_field: str, file_path: Path,
                   headers: Dict[str, str], timeout: int = 180) -> Dict[str, Any]:
    boundary = f"----tcm{uuid.uuid4().hex}"
    buf = bytearray()
    for k, v in fields.items():
        buf += f"--{boundary}\r\n".encode()
        buf += f'Content-Disposition: form-data; name="{k}"\r\n\r\n'.encode()
        buf += f"{v}\r\n".encode("utf-8")
    mime = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    buf += f"--{boundary}\r\n".encode()
    buf += (
        f'Content-Disposition: form-data; name="{file_field}"; filename="{file_path.name}"\r\n'
    ).encode("utf-8")
    buf += f"Content-Type: {mime}\r\n\r\n".encode()
    buf += file_path.read_bytes()
    buf += b"\r\n"
    buf += f"--{boundary}--\r\n".encode()

    req = request.Request(url, data=bytes(buf), method="POST")
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    for k, v in headers.items():
        req.add_header(k, v)
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace") if hasattr(e, "read") else ""
        raise RuntimeError(f"HTTP {e.code}: {detail[:500]}") from e
    return json.loads(raw) if raw.strip().startswith("{") else {"text": raw}


# ------------------------------------------------------------------ Engine
class AIEngine:
    def __init__(self, verbose: bool = True) -> None:
        self.api_key = _env("DEEPSEEK_API_KEY")
        self.base_url = _env("DEEPSEEK_BASE_URL", DEFAULT_BASE_URL).rstrip("/")
        self.model = _env("DEEPSEEK_MODEL", DEFAULT_MODEL)
        self.reasoner = _env("DEEPSEEK_REASONER_MODEL", DEFAULT_REASONER)
        self.timeout = int(_env("DEEPSEEK_TIMEOUT", str(DEFAULT_TIMEOUT)))

        self.asr_provider = _env("ASR_PROVIDER", "none").lower()
        self.asr_key = _env("ASR_API_KEY") or _env("OPENAI_API_KEY")
        self.asr_base = _env("ASR_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        self.asr_model = _env("ASR_MODEL", "whisper-1")

        self.vision_provider = _env("VISION_PROVIDER", "none").lower()
        self.vision_key = _env("VISION_API_KEY") or _env("OPENAI_API_KEY")
        self.vision_base = _env("VISION_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        self.vision_model = _env("VISION_MODEL", "gpt-4o-mini")

        self.verbose = verbose

    # ---------------------------------------------------------- 能力矩阵
    @property
    def has_llm(self) -> bool:
        return bool(self.api_key)

    @property
    def has_asr(self) -> bool:
        if self.asr_provider == "openai":
            return bool(self.asr_key)
        if self.asr_provider == "whisper_local":
            return bool(_which("whisper"))
        return False

    @property
    def has_vision(self) -> bool:
        return self.vision_provider == "openai" and bool(self.vision_key)

    def capabilities(self) -> Dict[str, Any]:
        return {
            "mode": "ai" if self.has_llm else "rule_based",
            "llm": {"provider": "deepseek" if self.has_llm else "none",
                    "model": self.model if self.has_llm else "-",
                    "reasoner": self.reasoner if self.has_llm else "-",
                    "base_url": self.base_url},
            "asr": {"provider": self.asr_provider, "enabled": self.has_asr, "model": self.asr_model},
            "vision": {"provider": self.vision_provider, "enabled": self.has_vision, "model": self.vision_model},
        }

    # ---------------------------------------------------------- 文本生成
    def chat(self, system: str, user: str, *, reasoner: bool = False,
             temperature: float = 0.3, max_tokens: int = 4000) -> str:
        if not self.has_llm:
            raise RuntimeError("未配置 DEEPSEEK_API_KEY，AI 生成不可用（请改用规则模式或补齐环境变量）")
        messages: List[Dict[str, str]] = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
        model = self.reasoner if reasoner else self.model
        # 给推理模型更宽的输出预算：思维链会占用一部分 completion_tokens
        budget = int(min(max_tokens * (2 if reasoner else 1), MAX_OUTPUT_TOKENS))
        text = self._request(model, messages, temperature, budget)
        # deepseek-reasoner 在长 prompt 下可能把预算全部耗在思维链上，导致正文为空；
        # 此时回落到通用模型重试一次，而不是直接让上层降级成规则草稿。
        if not text and reasoner:
            text = self._request(self.model, messages, temperature, max_tokens)
        if not text:
            raise RuntimeError("模型返回内容为空（可能触发长度限制，可增大 DEEPSEEK_MAX_TOKENS 或缩短输入）")
        return text

    def _request(self, model: str, messages: List[Dict[str, str]],
                 temperature: float, max_tokens: int) -> str:
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False,
        }
        # 瞬时故障（限流/网关错误/网络抖动）自动重试，避免一次抖动就把高质量 AI 产物降级成规则草稿
        data: Dict[str, Any] = {}
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                data = http_json(
                    f"{self.base_url}/chat/completions",
                    payload,
                    {"Authorization": f"Bearer {self.api_key}"},
                    timeout=self.timeout,
                )
                break
            except TransientError:
                if attempt == MAX_RETRIES:
                    raise
                time.sleep(1.5 * attempt)
        try:
            return (data["choices"][0]["message"]["content"] or "").strip()
        except (KeyError, IndexError):
            raise RuntimeError(f"模型返回格式异常: {json.dumps(data, ensure_ascii=False)[:300]}")

    def chat_json(self, system: str, user: str, **kw) -> Dict[str, Any]:
        text = self.chat(system, user, **kw)
        obj = extract_json(text)
        if obj is None:
            raise RuntimeError(f"模型未返回可解析 JSON: {text[:300]}")
        return obj

    # ---------------------------------------------------------- 语音转写
    def transcribe(self, audio_path: str) -> Dict[str, Any]:
        p = Path(audio_path).expanduser()
        if not p.exists():
            return {"text": "", "degraded": True, "reason": f"音频文件不存在: {audio_path}"}
        if self.asr_provider == "openai" and self.asr_key:
            data = http_multipart(
                f"{self.asr_base}/audio/transcriptions",
                {"model": self.asr_model, "language": "zh", "response_format": "json"},
                "file", p, {"Authorization": f"Bearer {self.asr_key}"},
            )
            return {"text": (data.get("text") or "").strip(), "degraded": False, "engine": f"openai:{self.asr_model}"}
        if self.asr_provider == "whisper_local":
            out_dir = Path.cwd() / ".tcm_asr"
            out_dir.mkdir(exist_ok=True)
            subprocess.run(["whisper", str(p), "--model", _env("WHISPER_MODEL", "small"),
                            "--language", "zh", "--output_format", "txt",
                            "--output_dir", str(out_dir)], check=False, capture_output=True)
            txt_file = out_dir / f"{p.stem}.txt"
            text = txt_file.read_text(encoding="utf-8") if txt_file.exists() else ""
            return {"text": text.strip(), "degraded": not text, "engine": "whisper_local"}
        return {
            "text": "",
            "degraded": True,
            "reason": "未配置 ASR_PROVIDER（可设 openai 或 whisper_local），语音素材转为待补录",
        }

    # ---------------------------------------------------------- 图片理解
    def describe_image(self, image_path: str, hint: str = "中医诊疗相关图片") -> Dict[str, Any]:
        p = Path(image_path).expanduser()
        if not p.exists():
            return {"text": "", "degraded": True, "reason": f"图片不存在: {image_path}"}
        if not self.has_vision:
            return {
                "text": "",
                "degraded": True,
                "reason": "未配置 VISION_PROVIDER=openai，图片未解析",
                "note": f"图片已归档: {image_path}（待人工描述补录）",
            }
        b64 = base64.b64encode(p.read_bytes()).decode()
        mime = mimetypes.guess_type(p.name)[0] or "image/jpeg"
        payload = {
            "model": self.vision_model,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": VISION_PROMPT.format(hint=hint)},
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                ],
            }],
            "max_tokens": 1200,
        }
        data = http_json(
            f"{self.vision_base}/chat/completions", payload,
            {"Authorization": f"Bearer {self.vision_key}"}, timeout=120,
        )
        text = data["choices"][0]["message"]["content"].strip()
        obj = extract_json(text)
        return {"text": text, "structured": obj or {}, "degraded": False, "engine": f"openai:{self.vision_model}"}


VISION_PROMPT = """你是中医师的助手。请观察这张{hint}图片，输出 JSON：
{
  "image_type": "舌苔照|处方单|检查报告|病历照片|其他",
  "visible_text": "图上可见文字的完整转录（无则空字符串）",
  "observation": "客观所见：舌色舌苔/皮疹/报告关键数值等",
  "clinical_hints": ["可提示的临床信息 1", "..."]
}
只输出 JSON，不要解释。"""


# ------------------------------------------------------------------ 工具
def extract_json(text: str) -> Optional[Dict[str, Any]]:
    """从模型输出中稳健抽取 JSON。

    兼容三类真实世界噪声，否则会把「模型其实答对了」误判成失败并降级：
    1. ```json 代码块包裹、前后带解释文字；
    2. deepseek-reasoner 常见的**尾随逗号**（"乏力", 后直接 }）；
    3. 行注释/块注释。
    """
    if not text:
        return None
    cleaned = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    sanitized = _sanitize_json(cleaned)
    for candidate in (cleaned, _slice_braces(cleaned), sanitized, _slice_braces(sanitized)):
        if not candidate:
            continue
        try:
            obj = json.loads(candidate)
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            continue
    return None


def _sanitize_json(text: str) -> str:
    """尽量修复非法 JSON：去注释、去尾随逗号。

    注意：这是有意识的工程折中——正则无法百分百区分字符串内的 `,}` 与结构性的
    尾随逗号，但在中医医案场景里该模式几乎不出现在字符串内容中，收益远大于风险；
    修复后仍需通过 json.loads 校验，不合规依然会走到降级分支。
    """
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
    text = re.sub(r"(?m)//.*$", "", text)
    text = re.sub(r",\s*([}\]])", r"\1", text)
    return text.strip()


def _slice_braces(text: str) -> str:
    start, end = text.find("{"), text.rfind("}")
    return text[start:end + 1] if 0 <= start < end else ""


def _which(cmd: str) -> Optional[str]:
    from shutil import which

    return which(cmd)
