# -*- coding: utf-8 -*-
"""Export Cursor agent transcript to downloadable md/txt + raw jsonl copy."""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

SRC = Path(
    r"C:\Users\USER\.cursor\projects\d-apps-ailongshort\agent-transcripts"
    r"\54ded7b4-3996-4f2b-ac29-05d6c8deebb9"
    r"\54ded7b4-3996-4f2b-ac29-05d6c8deebb9.jsonl"
)
OUT_DIR = Path(__file__).resolve().parents[1] / "docs" / "chat-exports"
OUT_MD = OUT_DIR / "CHAT-FULL-54ded7b4-wave-path-eie.md"
OUT_TXT = OUT_DIR / "CHAT-FULL-54ded7b4-wave-path-eie.txt"
OUT_RAW = OUT_DIR / "CHAT-FULL-54ded7b4-raw.jsonl"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    parts: list[str] = [
        "# Cursor 채팅 전체 내보내기",
        "",
        "- transcript_id: `54ded7b4-3996-4f2b-ac29-05d6c8deebb9`",
        f"- exported_at: {datetime.now().isoformat(timespec='seconds')}",
        "- source: agent-transcripts/.../54ded7b4....jsonl",
        "- 포함: 사용자/어시스턴트 텍스트 + 도구호출 요약(결과는 용량상 요약)",
        "- 원본 전체: `CHAT-FULL-54ded7b4-raw.jsonl`",
        "",
        "---",
        "",
    ]

    n_user = n_asst = n_tool = 0
    turn = 0
    line_no = 0

    with SRC.open(encoding="utf-8", errors="replace") as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                o = json.loads(line)
            except Exception:
                parts.append(f"\n<!-- parse error line {line_no} -->\n")
                continue

            role = o.get("role") or "unknown"
            msg = o.get("message") or {}
            content = msg.get("content") if isinstance(msg, dict) else None
            if content is None and isinstance(o.get("content"), list):
                content = o["content"]
            if not isinstance(content, list):
                continue

            texts: list[str] = []
            tools: list[str] = []
            for c in content:
                if not isinstance(c, dict):
                    continue
                t = c.get("type")
                if t == "text":
                    tx = c.get("text") or ""
                    if tx.strip():
                        texts.append(tx)
                elif t == "tool_use":
                    name = c.get("name") or "tool"
                    inp = c.get("input") or {}
                    try:
                        preview = json.dumps(inp, ensure_ascii=False)
                    except Exception:
                        preview = str(inp)
                    if len(preview) > 500:
                        preview = preview[:500] + "…"
                    tools.append(f"- `{name}`: {preview}")
                    n_tool += 1
                elif t == "tool_result":
                    tools.append(f"- tool_result id={c.get('tool_use_id', '?')}")
                    n_tool += 1

            if not texts and not tools:
                continue

            if role == "user":
                n_user += 1
                turn += 1
                parts.append(f"## Turn {turn} — USER")
                parts.append("")
                for tx in texts:
                    parts.append(tx)
                    parts.append("")
            elif role == "assistant":
                n_asst += 1
                parts.append(f"## Turn {turn} — ASSISTANT" if turn else "## ASSISTANT")
                parts.append("")
                for tx in texts:
                    parts.append(tx)
                    parts.append("")
                if tools:
                    parts.append("### Tools")
                    parts.append("")
                    parts.extend(tools)
                    parts.append("")
            else:
                parts.append(f"## {role}")
                parts.append("")
                for tx in texts:
                    parts.append(tx)
                    parts.append("")

    stats = (
        f"- stats: user_msgs={n_user}, assistant_msgs={n_asst}, "
        f"tool_events≈{n_tool}, jsonl_lines={line_no}\n"
    )
    body = "\n".join(parts)
    idx = body.find("---")
    if idx >= 0:
        body = body[:idx] + stats + body[idx:]

    OUT_MD.write_text(body, encoding="utf-8")
    OUT_TXT.write_text(body, encoding="utf-8")
    OUT_RAW.write_bytes(SRC.read_bytes())

    print("md_mb", round(OUT_MD.stat().st_size / 1024 / 1024, 2))
    print("txt_mb", round(OUT_TXT.stat().st_size / 1024 / 1024, 2))
    print("raw_mb", round(OUT_RAW.stat().st_size / 1024 / 1024, 2))
    print("user", n_user, "asst", n_asst, "tools", n_tool)
    print("out_md", OUT_MD)
    print("out_txt", OUT_TXT)
    print("out_raw", OUT_RAW)


if __name__ == "__main__":
    main()
