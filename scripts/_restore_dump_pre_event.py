import json
path = r"C:\Users\USER\.cursor\projects\d-apps-ailongshort\agent-transcripts\54ded7b4-3996-4f2b-ac29-05d6c8deebb9\54ded7b4-3996-4f2b-ac29-05d6c8deebb9.jsonl"
targets = {
    "mergedDeskMtfDumpZoneBridge.ts": [],
    "mergedDeskDumpLifeCycle.ts": [],
    "mergedDeskMtfDumpZoneRegistry.ts": [],
}
event_line = None
with open(path, "r", encoding="utf-8") as f:
    for i, line in enumerate(f, 1):
        if "mergedDeskDumpEventZone.ts" in line and '"Write"' in line:
            event_line = i
        if '"Write"' not in line:
            continue
        for name in list(targets):
            if name not in line:
                continue
            try:
                o = json.loads(line)
            except Exception:
                continue
            content = o.get("message", {}).get("content", [])
            if not isinstance(content, list):
                continue
            for c in content:
                if c.get("type") != "tool_use" or c.get("name") != "Write":
                    continue
                inp = c.get("input") or {}
                p = str(inp.get("path") or "")
                if name not in p:
                    continue
                contents = inp.get("contents") or ""
                targets[name].append((i, len(contents), contents))
                print(name, "Write at", i, "len", len(contents))

print("event_line", event_line)
# restore last Write before event_line for each
out_dir = r"D:\apps\ailongshort\lib"
mapping = {
    "mergedDeskMtfDumpZoneBridge.ts": "mergedDeskMtfDumpZoneBridge.ts",
    "mergedDeskDumpLifeCycle.ts": "mergedDeskDumpLifeCycle.ts",
    "mergedDeskMtfDumpZoneRegistry.ts": "mergedDeskMtfDumpZoneRegistry.ts",
}
for name, writes in targets.items():
    good = [w for w in writes if event_line is None or w[0] < event_line]
    if not good:
        print("NO GOOD", name, "total writes", len(writes))
        continue
    line_no, length, contents = good[-1]
    out = out_dir + "\\" + mapping[name]
    with open(out, "w", encoding="utf-8", newline="\n") as wf:
        wf.write(contents)
    print("RESTORED", name, "from transcript line", line_no, "chars", length)
