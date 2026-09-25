from __future__ import annotations

from pathlib import Path

from .utils import ENGINE_ROOT, utc_now_iso, write_json


def write_final_report(payload: dict) -> Path:
    path = ENGINE_ROOT / "outputs" / "reports" / "FINAL_REPORT.json"
    payload["generated_at"] = utc_now_iso()
    write_json(path, payload)

    md = ENGINE_ROOT / "outputs" / "reports" / "FINAL_REPORT.md"
    q = payload.get("answers", {})
    lines = [
        "# BTC 15M Autonomous Edge Discovery — FINAL REPORT",
        "",
        f"- generated: {payload['generated_at']}",
        f"- bars: {payload.get('n_bars')}",
        f"- range: {payload.get('from_iso')} → {payload.get('to_iso')}",
        f"- features: {payload.get('n_features')}",
        "",
        "## Answers (20)",
        "",
    ]
    for i in range(1, 21):
        lines.append(f"{i}. {q.get(str(i), 'n/a')}")
    lines += ["", "## Notes", "- 확정 수익 아님 · Future leak 금지 준수 · Ambiguous≠WIN", ""]
    md.write_text("\n".join(lines), encoding="utf-8")
    return path
