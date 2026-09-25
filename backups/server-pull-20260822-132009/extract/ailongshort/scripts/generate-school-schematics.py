# -*- coding: utf-8 -*-
"""Textbook-style school schematics (English labels, UTF-8 SVG)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "public" / "schematics"


def wrap(title: str, body: str, w=1000, h=480) -> str:
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">
  <rect width="{w}" height="{h}" fill="#ffffff"/>
  <text x="{w // 2}" y="28" text-anchor="middle" font-family="Georgia, Times New Roman, serif" font-size="16" font-weight="700" fill="#0f172a">{title}</text>
{body}
</svg>
'''


def save(rel: str, title: str, body: str) -> None:
    p = ROOT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(wrap(title, body), encoding="utf-8")


F = "Segoe UI, sans-serif"

FILES = {}

FILES["dow/hh-hl.svg"] = (
    "Dow — Uptrend HH / HL",
    f'''  <polyline fill="none" stroke="#0f172a" stroke-width="2.6" points="80,380 180,220 260,300 400,140 490,230 720,70 820,160 920,50"/>
  <text x="180" y="208" font-family="{F}" font-size="16" font-weight="800" fill="#1d4ed8">HH1</text>
  <text x="260" y="322" font-family="{F}" font-size="16" font-weight="800" fill="#16a34a">HL1</text>
  <text x="400" y="128" font-family="{F}" font-size="16" font-weight="800" fill="#1d4ed8">HH2</text>
  <text x="490" y="252" font-family="{F}" font-size="16" font-weight="800" fill="#16a34a">HL2</text>
  <text x="720" y="60" font-family="{F}" font-size="16" font-weight="800" fill="#1d4ed8">HH3</text>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">Primary trend up. Secondary pullbacks make higher lows. Not a forecast.</text>''',
)

FILES["dow/lh-ll.svg"] = (
    "Dow — Downtrend LH / LL",
    f'''  <polyline fill="none" stroke="#0f172a" stroke-width="2.6" points="80,70 180,210 260,140 400,300 490,220 720,400 820,320 920,430"/>
  <text x="180" y="228" font-family="{F}" font-size="16" font-weight="800" fill="#dc2626">LH1</text>
  <text x="260" y="132" font-family="{F}" font-size="16" font-weight="800" fill="#ea580c">LL1</text>
  <text x="400" y="318" font-family="{F}" font-size="16" font-weight="800" fill="#dc2626">LH2</text>
  <text x="490" y="210" font-family="{F}" font-size="16" font-weight="800" fill="#ea580c">LL2</text>
  <text x="720" y="418" font-family="{F}" font-size="16" font-weight="800" fill="#dc2626">LH3</text>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">Primary trend down. Rallies fail at lower highs. Not a forecast.</text>''',
)

FILES["dow/reversal-123.svg"] = (
    "Dow 1-2-3 Reversal (bullish sketch)",
    f'''  <polyline fill="none" stroke="#0f172a" stroke-width="2.6" points="80,80 220,360 380,200 560,300 780,90"/>
  <text x="220" y="390" font-family="{F}" font-size="20" font-weight="800" fill="#0f172a">1</text>
  <text x="380" y="188" font-family="{F}" font-size="20" font-weight="800" fill="#0f172a">2</text>
  <text x="560" y="328" font-family="{F}" font-size="20" font-weight="800" fill="#0f172a">3</text>
  <line x1="380" y1="200" x2="900" y2="200" stroke="#94a3b8" stroke-dasharray="5 4"/>
  <text x="790" y="190" font-family="{F}" font-size="12" fill="#64748b">break of 2</text>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">1=impulse low  2=reaction high  3=higher low  then break 2. Inverse for bearish.</text>''',
)

FILES["classical/hs.svg"] = (
    "Head &amp; Shoulders",
    f'''  <polyline fill="none" stroke="#0f172a" stroke-width="2.6" points="70,320 160,160 250,300 400,80 550,300 640,170 760,340 900,400"/>
  <line x1="160" y1="300" x2="640" y2="300" stroke="#64748b" stroke-dasharray="4 3"/>
  <text x="160" y="150" font-family="{F}" font-size="14" font-weight="800">LS</text>
  <text x="400" y="68" font-family="{F}" font-size="14" font-weight="800">HEAD</text>
  <text x="640" y="158" font-family="{F}" font-size="14" font-weight="800">RS</text>
  <text x="400" y="322" font-family="{F}" font-size="13" fill="#64748b">neckline</text>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">Break of neckline completes. Target ~ head-to-neck projected. Heuristic.</text>''',
)

FILES["classical/ihs.svg"] = (
    "Inverse Head &amp; Shoulders",
    f'''  <polyline fill="none" stroke="#0f172a" stroke-width="2.6" points="70,140 160,300 250,170 400,400 550,170 640,290 760,130 900,90"/>
  <line x1="160" y1="170" x2="640" y2="170" stroke="#64748b" stroke-dasharray="4 3"/>
  <text x="160" y="318" font-family="{F}" font-size="14" font-weight="800">LS</text>
  <text x="400" y="422" font-family="{F}" font-size="14" font-weight="800">HEAD</text>
  <text x="640" y="308" font-family="{F}" font-size="14" font-weight="800">RS</text>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">Bullish inverse. Neckline break up. Not guaranteed.</text>''',
)

FILES["classical/dt.svg"] = (
    "Double Top",
    f'''  <polyline fill="none" stroke="#0f172a" stroke-width="2.6" points="80,360 220,90 380,280 560,90 720,360 880,400"/>
  <line x1="220" y1="280" x2="720" y2="280" stroke="#64748b" stroke-dasharray="4 3"/>
  <text x="220" y="78" font-family="{F}" font-size="18" font-weight="800">P1</text>
  <text x="560" y="78" font-family="{F}" font-size="18" font-weight="800">P2</text>
  <text x="400" y="300" font-family="{F}" font-size="12" fill="#64748b">trough / neck</text>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">Two peaks near equal. Break of trough confirms. Heuristic.</text>''',
)

FILES["classical/db.svg"] = (
    "Double Bottom",
    f'''  <polyline fill="none" stroke="#0f172a" stroke-width="2.6" points="80,100 220,380 380,180 560,380 720,100 880,80"/>
  <line x1="220" y1="180" x2="720" y2="180" stroke="#64748b" stroke-dasharray="4 3"/>
  <text x="220" y="402" font-family="{F}" font-size="18" font-weight="800">T1</text>
  <text x="560" y="402" font-family="{F}" font-size="18" font-weight="800">T2</text>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">Two troughs near equal. Break of peak confirms. Heuristic.</text>''',
)

FILES["classical/tri-asc.svg"] = (
    "Ascending Triangle",
    f'''  <line x1="120" y1="120" x2="820" y2="120" stroke="#0f172a" stroke-width="2"/>
  <line x1="120" y1="380" x2="820" y2="140" stroke="#0f172a" stroke-width="2"/>
  <polyline fill="none" stroke="#2563eb" stroke-width="2.2" points="140,350 220,130 320,280 400,130 520,210 600,130 700,170"/>
  <text x="500" y="108" font-family="{F}" font-size="13" font-weight="700">flat resistance</text>
  <text x="200" y="400" font-family="{F}" font-size="13" font-weight="700">rising lows</text>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">Often bullish continuation. Break either side possible.</text>''',
)

FILES["classical/tri-desc.svg"] = (
    "Descending Triangle",
    f'''  <line x1="120" y1="380" x2="820" y2="380" stroke="#0f172a" stroke-width="2"/>
  <line x1="120" y1="120" x2="820" y2="360" stroke="#0f172a" stroke-width="2"/>
  <polyline fill="none" stroke="#dc2626" stroke-width="2.2" points="140,140 220,360 320,200 400,360 520,250 600,360 700,320"/>
  <text x="200" y="108" font-family="{F}" font-size="13" font-weight="700">falling highs</text>
  <text x="500" y="402" font-family="{F}" font-size="13" font-weight="700">flat support</text>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">Often bearish continuation. Break either side possible.</text>''',
)

FILES["classical/tri-sym.svg"] = (
    "Symmetrical Triangle",
    f'''  <line x1="120" y1="80" x2="780" y2="240" stroke="#0f172a" stroke-width="2"/>
  <line x1="120" y1="420" x2="780" y2="250" stroke="#0f172a" stroke-width="2"/>
  <polyline fill="none" stroke="#2563eb" stroke-width="2.2" points="150,100 230,380 330,140 420,340 530,180 620,300 700,230"/>
  <text x="400" y="70" font-family="{F}" font-size="13">contracting range</text>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">Coil. Direction = break. Apex timeout weakens pattern.</text>''',
)

FILES["classical/wedge-rise.svg"] = (
    "Rising Wedge",
    f'''  <line x1="120" y1="360" x2="820" y2="140" stroke="#0f172a" stroke-width="2"/>
  <line x1="120" y1="300" x2="820" y2="60" stroke="#0f172a" stroke-width="2"/>
  <polyline fill="none" stroke="#ea580c" stroke-width="2.2" points="160,340 260,250 360,280 480,170 580,200 700,110"/>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">Both lines rise, range shrinks. Often bearish at end of up-leg.</text>''',
)

FILES["classical/wedge-fall.svg"] = (
    "Falling Wedge",
    f'''  <line x1="120" y1="80" x2="820" y2="300" stroke="#0f172a" stroke-width="2"/>
  <line x1="120" y1="160" x2="820" y2="400" stroke="#0f172a" stroke-width="2"/>
  <polyline fill="none" stroke="#16a34a" stroke-width="2.2" points="160,100 260,200 360,170 480,280 580,250 700,340"/>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">Both lines fall, range shrinks. Often bullish at end of down-leg.</text>''',
)

FILES["classical/flag-bull.svg"] = (
    "Bull Flag",
    f'''  <polyline fill="none" stroke="#0f172a" stroke-width="2.6" points="80,400 280,80 360,140 500,90 640,150 900,40"/>
  <rect x="300" y="70" width="360" height="100" fill="none" stroke="#64748b" stroke-dasharray="4 3"/>
  <text x="140" y="260" font-family="{F}" font-size="13">pole</text>
  <text x="430" y="64" font-family="{F}" font-size="13">flag</text>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">Sharp pole + shallow counter flag. Continuation candidate.</text>''',
)

FILES["classical/flag-bear.svg"] = (
    "Bear Flag",
    f'''  <polyline fill="none" stroke="#0f172a" stroke-width="2.6" points="80,60 280,380 360,320 500,370 640,310 900,430"/>
  <rect x="300" y="300" width="360" height="90" fill="none" stroke="#64748b" stroke-dasharray="4 3"/>
  <text x="140" y="200" font-family="{F}" font-size="13">pole</text>
  <text x="430" y="292" font-family="{F}" font-size="13">flag</text>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">Sharp drop + shallow bounce flag. Continuation candidate.</text>''',
)

FILES["classical/cup.svg"] = (
    "Cup and Handle",
    f'''  <path d="M80 120 C 180 120, 220 380, 400 380 C 580 380, 620 120, 720 120 L 780 180 L 900 70" fill="none" stroke="#0f172a" stroke-width="2.6"/>
  <text x="380" y="408" font-family="{F}" font-size="14" font-weight="800">CUP</text>
  <text x="760" y="210" font-family="{F}" font-size="14" font-weight="800">HANDLE</text>
  <line x1="80" y1="120" x2="900" y2="120" stroke="#94a3b8" stroke-dasharray="4 3"/>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">U-rounded base then small handle. Break of rim. Heuristic.</text>''',
)

# Harmonic XABCD shared polyline style
def harm(title, ratios, pts, labels):
    poly = " ".join(f"{x},{y}" for x, y in pts)
    labs = ""
    for (x, y), lab in zip(pts, labels):
        labs += f'  <text x="{x}" y="{y - 10}" font-family="{F}" font-size="16" font-weight="800" fill="#1d4ed8">{lab}</text>\n'
    return (
        title,
        f'''  <polyline fill="none" stroke="#0f172a" stroke-width="2.5" points="{poly}"/>
{labs}  <text x="80" y="430" font-family="{F}" font-size="12" fill="#64748b">{ratios}</text>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">PRZ at D is a zone, not a fill. Invalid if XA structure breaks.</text>''',
    )

FILES["harmonic/gartley.svg"] = harm(
    "Gartley (bullish sketch)",
    "AB=0.618 XA   BC=0.382–0.886 AB   CD=1.27–1.618 BC   AD=0.786 XA",
    [(80, 120), (280, 380), (480, 200), (640, 320), (860, 160)],
    list("XABCD"),
)
FILES["harmonic/bat.svg"] = harm(
    "Bat",
    "AB=0.382–0.50 XA   AD=0.886 XA   CD often 1.618–2.618 BC",
    [(80, 100), (300, 390), (460, 230), (620, 340), (880, 140)],
    list("XABCD"),
)
FILES["harmonic/butterfly.svg"] = harm(
    "Butterfly",
    "AB=0.786 XA   AD=1.27–1.618 XA   D beyond X",
    [(120, 200), (300, 400), (480, 220), (640, 340), (900, 80)],
    list("XABCD"),
)
FILES["harmonic/crab.svg"] = harm(
    "Crab",
    "AB=0.382–0.618 XA   AD=1.618 XA   deep CD (2.24–3.618 BC)",
    [(100, 220), (300, 390), (470, 250), (620, 330), (920, 70)],
    list("XABCD"),
)
FILES["harmonic/shark.svg"] = harm(
    "Shark (0-X-A-B-C)",
    "AB=1.13–1.618 XA   BC=1.618–2.24 AB   C is PRZ  (not classic XABCD D)",
    [(80, 300), (260, 120), (480, 360), (700, 80), (900, 280)],
    ["0", "X", "A", "B", "C"],
)
FILES["harmonic/cypher.svg"] = harm(
    "Cypher",
    "AB=0.382–0.618 XA   BC=1.272–1.414 XA   CD=0.786 XC",
    [(80, 200), (280, 380), (460, 240), (700, 80), (900, 260)],
    list("XABCD"),
)
FILES["harmonic/abcd.svg"] = (
    "AB=CD measured move",
    f'''  <polyline fill="none" stroke="#0f172a" stroke-width="2.6" points="80,360 300,80 500,300 820,90"/>
  <text x="80" y="380" font-family="{F}" font-size="16" font-weight="800">A</text>
  <text x="300" y="70" font-family="{F}" font-size="16" font-weight="800">B</text>
  <text x="500" y="322" font-family="{F}" font-size="16" font-weight="800">C</text>
  <text x="820" y="80" font-family="{F}" font-size="16" font-weight="800">D</text>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">AB length ≈ CD. Time symmetry optional. Zone not a fill.</text>''',
)

FILES["vsa/effort.svg"] = (
    "VSA — Effort vs Result",
    f'''  <rect x="70" y="80" width="70" height="260" fill="#fecaca"/>
  <rect x="200" y="200" width="70" height="140" fill="#bbf7d0"/>
  <rect x="330" y="250" width="70" height="90" fill="#e2e8f0"/>
  <rect x="460" y="90" width="70" height="250" fill="#fed7aa"/>
  <text x="70" y="370" font-family="{F}" font-size="12">Climax wide+vol</text>
  <text x="200" y="370" font-family="{F}" font-size="12">No demand</text>
  <text x="330" y="370" font-family="{F}" font-size="12">No supply</text>
  <text x="460" y="370" font-family="{F}" font-size="12">Absorption high vol small range</text>
  <text x="600" y="160" font-family="{F}" font-size="13">Effort = volume</text>
  <text x="600" y="190" font-family="{F}" font-size="13">Result = spread / close</text>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">Wyckoff volume logic. One bar is a hint, not a phase.</text>''',
)

FILES["ichimoku/cloud.svg"] = (
    "Ichimoku — Price vs Cloud",
    f'''  <path d="M80 220 C 220 80, 380 80, 520 200 C 660 320, 800 300, 940 180 L 940 300 C 800 380, 660 400, 520 300 C 380 200, 220 200, 80 320 Z" fill="#bfdbfe" stroke="#1d4ed8"/>
  <polyline fill="none" stroke="#0f172a" stroke-width="2.4" points="60,340 180,300 300,120 420,160 560,90 700,260 840,320 960,200"/>
  <line x1="60" y1="200" x2="960" y2="140" stroke="#f59e0b" stroke-width="1.6"/>
  <line x1="60" y1="260" x2="960" y2="210" stroke="#ef4444" stroke-width="1.6"/>
  <text x="80" y="70" font-family="{F}" font-size="12" fill="#1d4ed8">Kumo (Senkou A/B)</text>
  <text x="700" y="120" font-family="{F}" font-size="12" fill="#b45309">Tenkan</text>
  <text x="700" y="250" font-family="{F}" font-size="12" fill="#b91c1c">Kijun</text>
  <text x="300" y="100" font-family="{F}" font-size="12" font-weight="700">ABOVE</text>
  <text x="700" y="300" font-family="{F}" font-size="12" font-weight="700">BELOW</text>
  <text x="480" y="230" font-family="{F}" font-size="12" font-weight="700">INSIDE</text>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">Above=bull bias  Inside=wait  Below=bear bias. Chikou confirm later.</text>''',
)

FILES["chan/zs-123.svg"] = (
    "Chan — Fenxing / Bi / Zhongshu / BS 1-2-3",
    f'''  <polyline fill="none" stroke="#0f172a" stroke-width="2.4" points="60,200 120,80 200,300 280,100 360,280 460,90 560,260 640,120 760,240 860,80 940,200"/>
  <rect x="200" y="140" width="360" height="140" fill="rgba(59,130,246,0.12)" stroke="#2563eb"/>
  <text x="320" y="130" font-family="{F}" font-size="13" font-weight="700" fill="#1d4ed8">ZHONGSHU (overlap of 3 bi)</text>
  <text x="120" y="70" font-family="{F}" font-size="12">fenxing</text>
  <text x="80" y="250" font-family="{F}" font-size="12">BI</text>
  <text x="200" y="320" font-family="{F}" font-size="13" font-weight="800">1</text>
  <text x="460" y="80" font-family="{F}" font-size="13" font-weight="800">2</text>
  <text x="760" y="260" font-family="{F}" font-size="13" font-weight="800">3</text>
  <text x="80" y="430" font-family="{F}" font-size="12" fill="#64748b">1=leave zs opposite  2=retest zs  3=break zs with trend bi. Approximate.</text>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">Not full CZSC. Overlap heuristic only.</text>''',
)

FILES["smc/map.svg"] = (
    "SMC / ICT — BOS · CHoCH · FVG · OB · Sweep · PO3",
    f'''  <polyline fill="none" stroke="#0f172a" stroke-width="2.4" points="60,300 140,180 200,240 320,80 400,200 480,60 560,220 640,280 760,120 900,200"/>
  <line x1="140" y1="180" x2="900" y2="180" stroke="#94a3b8" stroke-dasharray="4 3"/>
  <rect x="200" y="90" width="50" height="70" fill="rgba(56,189,248,0.35)" stroke="#0284c7"/>
  <text x="200" y="84" font-family="{F}" font-size="11">FVG</text>
  <rect x="300" y="80" width="40" height="90" fill="rgba(248,113,113,0.35)" stroke="#dc2626"/>
  <text x="300" y="74" font-family="{F}" font-size="11">OB</text>
  <text x="320" y="68" font-family="{F}" font-size="13" font-weight="800" fill="#16a34a">BOS</text>
  <text x="480" y="50" font-family="{F}" font-size="13" font-weight="800" fill="#dc2626">CHoCH</text>
  <text x="640" y="300" font-family="{F}" font-size="13" font-weight="800">SWEEP</text>
  <text x="760" y="110" font-family="{F}" font-size="12">PO3 dist.</text>
  <text x="80" y="430" font-family="{F}" font-size="12" fill="#64748b">BOS=continue structure  CHoCH=shift  Sweep=raid then reject.</text>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">PO3: accumulate · manipulate · distribute. Overlaps Wyckoff TR.</text>''',
)

FILES["brooks/pa.svg"] = (
    "Al Brooks — Trend · PB · H1/H2 · Trading Range",
    f'''  <polyline fill="none" stroke="#0f172a" stroke-width="2.4" points="60,360 140,200 200,260 280,120 340,190 420,80 500,200 700,180 780,220 860,160"/>
  <rect x="500" y="140" width="280" height="120" fill="none" stroke="#64748b" stroke-dasharray="4 3"/>
  <text x="140" y="190" font-family="{F}" font-size="12" font-weight="700">trend</text>
  <text x="200" y="280" font-family="{F}" font-size="12" font-weight="700">PB</text>
  <text x="280" y="108" font-family="{F}" font-size="13" font-weight="800">H1</text>
  <text x="420" y="70" font-family="{F}" font-size="13" font-weight="800">H2</text>
  <text x="600" y="130" font-family="{F}" font-size="13" font-weight="700">TR</text>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">H2=second attempt in trend. TR=tight range. Climax bars can fail.</text>''',
)

FILES["fib/retrace.svg"] = (
    "Fibonacci Retracement",
    f'''  <polyline fill="none" stroke="#0f172a" stroke-width="2.6" points="80,400 400,80 860,250"/>
  <line x1="80" y1="80" x2="900" y2="80" stroke="#94a3b8"/>
  <line x1="80" y1="400" x2="900" y2="400" stroke="#94a3b8"/>
  <line x1="80" y1="202" x2="900" y2="202" stroke="#22c55e" stroke-dasharray="4 3"/>
  <line x1="80" y1="240" x2="900" y2="240" stroke="#eab308" stroke-dasharray="4 3"/>
  <line x1="80" y1="278" x2="900" y2="278" stroke="#f97316" stroke-dasharray="4 3"/>
  <line x1="80" y1="332" x2="900" y2="332" stroke="#64748b" stroke-dasharray="4 3"/>
  <text x="910" y="86" font-family="{F}" font-size="12">0</text>
  <text x="910" y="206" font-family="{F}" font-size="12">0.382</text>
  <text x="910" y="244" font-family="{F}" font-size="12">0.50</text>
  <text x="910" y="282" font-family="{F}" font-size="12">0.618</text>
  <text x="910" y="336" font-family="{F}" font-size="12">0.786</text>
  <text x="910" y="404" font-family="{F}" font-size="12">1</text>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">GP cluster 0.38–0.62 is common reaction. Not a magnet guarantee.</text>''',
)

FILES["fib/extend.svg"] = (
    "Fibonacci Extension / Measured Move",
    f'''  <polyline fill="none" stroke="#0f172a" stroke-width="2.6" points="80,360 280,140 420,260 820,40"/>
  <line x1="80" y1="140" x2="900" y2="140" stroke="#94a3b8" stroke-dasharray="4 3"/>
  <line x1="80" y1="90" x2="900" y2="90" stroke="#22c55e" stroke-dasharray="4 3"/>
  <line x1="80" y1="40" x2="900" y2="40" stroke="#f97316" stroke-dasharray="4 3"/>
  <text x="910" y="144" font-family="{F}" font-size="12">1.00 AB</text>
  <text x="910" y="94" font-family="{F}" font-size="12">1.272</text>
  <text x="910" y="44" font-family="{F}" font-size="12">1.618</text>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">Extensions are measured targets. Overlap / fade both possible.</text>''',
)

FILES["wolfe/wave.svg"] = (
    "Wolfe Wave",
    f'''  <polyline fill="none" stroke="#0f172a" stroke-width="2.6" points="80,300 220,80 360,340 560,40 780,280 920,120"/>
  <line x1="80" y1="300" x2="560" y2="40" stroke="#94a3b8" stroke-dasharray="4 3"/>
  <line x1="220" y1="80" x2="780" y2="280" stroke="#94a3b8" stroke-dasharray="4 3"/>
  <text x="80" y="320" font-family="{F}" font-size="16" font-weight="800">1</text>
  <text x="220" y="70" font-family="{F}" font-size="16" font-weight="800">2</text>
  <text x="360" y="362" font-family="{F}" font-size="16" font-weight="800">3</text>
  <text x="560" y="30" font-family="{F}" font-size="16" font-weight="800">4</text>
  <text x="780" y="300" font-family="{F}" font-size="16" font-weight="800">5</text>
  <text x="900" y="110" font-family="{F}" font-size="12">EPA</text>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">1-3-5 and 2-4 converge. Point 5 is entry zone estimate. EPA is a line, not a fill.</text>''',
)

FILES["pitchfork/andrews.svg"] = (
    "Andrews Pitchfork",
    f'''  <polyline fill="none" stroke="#0f172a" stroke-width="2.2" points="80,360 260,80 420,300 900,120"/>
  <line x1="80" y1="360" x2="900" y2="80" stroke="#2563eb" stroke-width="1.6"/>
  <line x1="260" y1="80" x2="900" y2="40" stroke="#64748b"/>
  <line x1="420" y1="300" x2="900" y2="200" stroke="#64748b"/>
  <text x="70" y="380" font-family="{F}" font-size="14" font-weight="800">P0</text>
  <text x="250" y="70" font-family="{F}" font-size="14" font-weight="800">P1</text>
  <text x="420" y="322" font-family="{F}" font-size="14" font-weight="800">P2</text>
  <text x="700" y="70" font-family="{F}" font-size="12">upper</text>
  <text x="700" y="150" font-family="{F}" font-size="12" fill="#1d4ed8">median</text>
  <text x="700" y="230" font-family="{F}" font-size="12">lower</text>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">Median magnet / slide. Outside tines = stretch or new pitch.</text>''',
)

FILES["profile/tpo.svg"] = (
    "TPO / Volume Profile — VA · POC",
    f'''  <rect x="120" y="60" width="40" height="360" fill="#e2e8f0"/>
  <rect x="120" y="140" width="120" height="200" fill="#93c5fd"/>
  <rect x="120" y="210" width="200" height="40" fill="#1d4ed8"/>
  <line x1="340" y1="140" x2="900" y2="140" stroke="#64748b" stroke-dasharray="4 3"/>
  <line x1="340" y1="230" x2="900" y2="230" stroke="#1d4ed8"/>
  <line x1="340" y1="340" x2="900" y2="340" stroke="#64748b" stroke-dasharray="4 3"/>
  <polyline fill="none" stroke="#0f172a" stroke-width="2" points="360,100 480,180 560,90 700,300 820,200 920,250"/>
  <text x="350" y="132" font-family="{F}" font-size="13" font-weight="700">VAH</text>
  <text x="350" y="224" font-family="{F}" font-size="13" font-weight="700" fill="#1d4ed8">POC</text>
  <text x="350" y="360" font-family="{F}" font-size="13" font-weight="700">VAL</text>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">Value Area ~70% volume. Above VA / inside / below. Not full Market Profile TPO letters.</text>''',
)

FILES["pnf/xo.svg"] = (
    "Point &amp; Figure — X / O columns",
    f'''  <text x="80" y="80" font-family="Consolas, monospace" font-size="22" fill="#16a34a">X</text>
  <text x="80" y="108" font-family="Consolas, monospace" font-size="22" fill="#16a34a">X</text>
  <text x="80" y="136" font-family="Consolas, monospace" font-size="22" fill="#16a34a">X</text>
  <text x="80" y="164" font-family="Consolas, monospace" font-size="22" fill="#16a34a">X</text>
  <text x="130" y="164" font-family="Consolas, monospace" font-size="22" fill="#dc2626">O</text>
  <text x="130" y="192" font-family="Consolas, monospace" font-size="22" fill="#dc2626">O</text>
  <text x="130" y="220" font-family="Consolas, monospace" font-size="22" fill="#dc2626">O</text>
  <text x="180" y="192" font-family="Consolas, monospace" font-size="22" fill="#16a34a">X</text>
  <text x="180" y="164" font-family="Consolas, monospace" font-size="22" fill="#16a34a">X</text>
  <text x="180" y="136" font-family="Consolas, monospace" font-size="22" fill="#16a34a">X</text>
  <text x="180" y="108" font-family="Consolas, monospace" font-size="22" fill="#16a34a">X</text>
  <text x="180" y="80" font-family="Consolas, monospace" font-size="22" fill="#16a34a">X</text>
  <text x="230" y="80" font-family="Consolas, monospace" font-size="22" fill="#dc2626">O</text>
  <line x1="60" y1="70" x2="400" y2="70" stroke="#94a3b8" stroke-dasharray="4 3"/>
  <text x="420" y="76" font-family="{F}" font-size="13">breakout</text>
  <text x="420" y="160" font-family="{F}" font-size="13">3-box reversal</text>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">X=up column  O=down. Count for Wyckoff-style targets. Box size heuristic.</text>''',
)

FILES["nison/candles.svg"] = (
    "Nison Candlesticks — Hammer · Star · Engulf · Doji · Stars",
    f'''  <line x1="90" y1="80" x2="90" y2="320" stroke="#0f172a"/>
  <rect x="70" y="200" width="40" height="50" fill="#16a34a"/>
  <text x="60" y="350" font-family="{F}" font-size="12">Hammer</text>
  <line x1="190" y1="80" x2="190" y2="280" stroke="#0f172a"/>
  <rect x="170" y="80" width="40" height="50" fill="#dc2626"/>
  <text x="160" y="350" font-family="{F}" font-size="12">Shooting</text>
  <rect x="270" y="140" width="36" height="90" fill="#dc2626"/>
  <rect x="300" y="120" width="50" height="130" fill="#16a34a"/>
  <text x="270" y="350" font-family="{F}" font-size="12">Engulf up</text>
  <line x1="430" y1="160" x2="430" y2="240" stroke="#0f172a"/>
  <rect x="418" y="190" width="24" height="12" fill="#e2e8f0" stroke="#0f172a"/>
  <text x="410" y="350" font-family="{F}" font-size="12">Doji</text>
  <rect x="520" y="100" width="36" height="80" fill="#dc2626"/>
  <rect x="570" y="170" width="24" height="20" fill="#e2e8f0" stroke="#0f172a"/>
  <rect x="610" y="150" width="40" height="100" fill="#16a34a"/>
  <text x="530" y="350" font-family="{F}" font-size="12">Morning star</text>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">Location in trend matters more than the single print. 1-bar hint.</text>''',
)

FILES["turtle/donchian.svg"] = (
    "Turtle / Darvas — Donchian 20 break + box",
    f'''  <line x1="80" y1="100" x2="900" y2="100" stroke="#16a34a" stroke-dasharray="4 3"/>
  <line x1="80" y1="360" x2="900" y2="360" stroke="#dc2626" stroke-dasharray="4 3"/>
  <rect x="420" y="160" width="220" height="140" fill="none" stroke="#64748b"/>
  <polyline fill="none" stroke="#0f172a" stroke-width="2.4" points="80,280 180,240 300,300 420,220 520,200 640,190 760,80 900,120"/>
  <text x="80" y="90" font-family="{F}" font-size="12" fill="#16a34a">20-bar high</text>
  <text x="80" y="380" font-family="{F}" font-size="12" fill="#dc2626">20-bar low</text>
  <text x="470" y="150" font-family="{F}" font-size="12">Darvas box</text>
  <text x="760" y="70" font-family="{F}" font-size="13" font-weight="800">BREAK</text>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">Turtle entry = channel break. Stop often 2N ATR. Fakeouts common.</text>''',
)

FILES["macro/hurst.svg"] = (
    "Hurst-style nominal cycle (schematic, not a Hurst phasing)",
    f'''  <path d="M40 240 C 120 80, 200 80, 280 240 C 360 400, 440 400, 520 240 C 600 80, 680 80, 760 240 C 840 400, 920 400, 980 240" fill="none" stroke="#0f172a" stroke-width="2.4"/>
  <line x1="40" y1="240" x2="980" y2="240" stroke="#e2e8f0"/>
  <text x="120" y="70" font-family="{F}" font-size="13" font-weight="700">CREST</text>
  <text x="280" y="260" font-family="{F}" font-size="13" font-weight="700">TROUGH</text>
  <text x="520" y="70" font-family="{F}" font-size="13" font-weight="700">CREST</text>
  <text x="680" y="70" font-family="{F}" font-size="12" fill="#64748b">mid</text>
  <text x="80" y="430" font-family="{F}" font-size="12" fill="#64748b">App uses window relative high/low — NOT FLD / nominal 20w-40w phasing.</text>
  <text x="80" y="455" font-family="{F}" font-size="12" fill="#64748b">Bottom / mid / top of lookback only. Kondratiev not computed.</text>''',
)

for rel, (title, body) in FILES.items():
    save(rel, title, body)

print(f"wrote {len(FILES)} svgs under {ROOT}")
