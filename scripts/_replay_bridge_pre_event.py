import json
from pathlib import Path

path = Path(
    r"C:\Users\USER\.cursor\projects\d-apps-ailongshort\agent-transcripts"
    r"\54ded7b4-3996-4f2b-ac29-05d6c8deebb9\54ded7b4-3996-4f2b-ac29-05d6c8deebb9.jsonl"
)
out = Path(r"D:\apps\ailongshort\lib\mergedDeskMtfDumpZoneBridge.ts")
target = "mergedDeskMtfDumpZoneBridge.ts"

base = None
base_line = None
patches = []  # (line, old, new)

with path.open("r", encoding="utf-8") as f:
    for i, line in enumerate(f, 1):
        if target not in line:
            continue
        if '"Write"' not in line and '"StrReplace"' not in line:
            continue
        try:
            o = json.loads(line)
        except Exception:
            continue
        content = o.get("message", {}).get("content", [])
        if not isinstance(content, list):
            continue
        for c in content:
            if c.get("type") != "tool_use":
                continue
            inp = c.get("input") or {}
            p = str(inp.get("path") or "")
            if target not in p.replace("\\", "/"):
                # also accept windows path
                if target not in p:
                    continue
            name = c.get("name")
            if name == "Write":
                # only keep writes before event rewrite (~5921)
                contents = inp.get("contents") or ""
                if i < 5920:
                    base = contents
                    base_line = i
                    patches = []  # reset patches after new write base
                    print("base Write", i, "len", len(contents))
            elif name == "StrReplace" and i < 5920:
                old = inp.get("old_string")
                new = inp.get("new_string")
                if old is not None and new is not None:
                    patches.append((i, old, new))

if base is None:
    raise SystemExit("no base")

text = base
applied = 0
failed = []
for i, old, new in patches:
    if old not in text:
        failed.append(i)
        continue
    text = text.replace(old, new, 1)
    applied += 1

out.write_text(text, encoding="utf-8", newline="\n")
print("base_line", base_line)
print("patches", len(patches), "applied", applied, "failed", failed[:20], "failcount", len(failed))
print("final len", len(text))
print("has pickFloorTarget", "pickFloorTarget" in text)
print("has detectMtfDumpCeilingZone", "detectMtfDumpCeilingZone" in text)
print("has separateOverlapping", "separateOverlappingFloorZones" in text)
print("has bandRole", "bandRole" in text)
print("has detectDumpEventZones", "detectDumpEventZones" in text)
