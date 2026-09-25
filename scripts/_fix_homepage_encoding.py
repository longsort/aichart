# -*- coding: utf-8 -*-
from pathlib import Path

ROOT = Path(r"D:\apps\ailongshort")
DST = ROOT / "app" / "HomePageContent.tsx"
SERVER = ROOT / "backups" / "server-pull-20260822-132009" / "extract" / "ailongshort" / "app" / "HomePageContent.tsx"
REBUILD = ROOT / "backups" / "local-before-server-rebuild-20260822-132009" / "app" / "HomePageContent.tsx"


def is_clean(text: str) -> bool:
    if "AI議" in text or "遺꾩" in text or "AI議?" in text:
        return False
    # unterminated broken quote pattern
    if "raw === 'AI議" in text:
        return False
    return "handleUiModeChange" in text and "MERGED_ANALYSIS_DESK" in text


def apply_wrap(text: str) -> str:
    if "wrapEagle1Hud" in text and "chart-wrap--eagle1-structure" in text:
        return text
    old = (
        ") : uiMode === 'MERGED_ANALYSIS_DESK' ? (\n"
        "              <div className=\"chart-wrap chart-wrap--merged-analysis\">\n"
        "                <MergedAnalysisDeskView\n"
        "                  uiMode={uiMode}\n"
    )
    new = (
        ") : uiMode === 'MERGED_ANALYSIS_DESK' ? (\n"
        "              <div className=\"chart-wrap chart-wrap--merged-analysis chart-wrap--eagle1-structure\">\n"
        "                <MergedAnalysisDeskView\n"
        "                  wrapEagle1Hud\n"
        "                  shareMergedServerChart\n"
        "                  uiMode={uiMode}\n"
    )
    if old not in text:
        raise SystemExit("target merge block not found")
    return text.replace(old, new, 1)


def main() -> None:
    for cand in (SERVER, REBUILD):
        t = cand.read_text(encoding="utf-8")
        print(cand.name, "clean=", is_clean(t), "has_AI분석=", ("AI분석" in t), "has_AI존=", ("AI존" in t))
        if is_clean(t):
            out = apply_wrap(t)
            DST.write_text(out, encoding="utf-8", newline="\n")
            print("restored from", cand)
            print("dst clean=", is_clean(out), "wrap=", ("wrapEagle1Hud" in out))
            # show snippet
            i = out.find("raw === 'AI")
            print("snippet:", repr(out[i : i + 90]))
            return
    raise SystemExit("no clean backup")


if __name__ == "__main__":
    main()
