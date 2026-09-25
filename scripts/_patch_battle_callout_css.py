# append callout css
from pathlib import Path
g = Path(r"d:\apps\ailongshort\app\globals.css")
t = g.read_text(encoding="utf-8")
marker = "overlay-label.candle-battle-callout"
if marker in t:
    print("already")
else:
    t += """

.chart-wrap--merged-analysis .overlay-label.candle-battle-callout,
.chart-wrap--merged-analysis .overlay-zone.candle-battle-callout {
  font-size: 11px !important;
  font-weight: 800 !important;
  padding: 2px 7px !important;
  border-radius: 6px !important;
  border: 1px solid rgba(251, 191, 36, 0.45) !important;
  background: rgba(15, 23, 42, 0.92) !important;
  color: #fde68a !important;
  white-space: nowrap;
}
"""
    g.write_text(t, encoding="utf-8", newline="\n")
    print("ok")
