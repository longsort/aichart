# -*- coding: utf-8 -*-
from pathlib import Path

p = Path(r"d:\apps\ailongshort\lib\telegramPrecisionTouchRunner.ts")
text = p.read_text(encoding="utf-8")
start = text.find("/** HTF 폭락은 근접 패드를 넓혀")
end = text.find("function candlesFromAnalysis")
if start < 0 or end < 0:
    raise SystemExit(f"markers missing {start} {end}")

slim = """/** 근접: 현재가가 밴드±ATR*pad 안 · 직전은 더 멀리 */
function firstNearBand(
  candles: Candle[],
  top: number,
  bot: number,
  atr: number,
  padMult = NEAR_ATR
): boolean {
  if (candles.length < 2 || !(atr > 0)) return false;
  const pad = atr * padMult;
  const lo = Math.min(top, bot) - pad;
  const hi = Math.max(top, bot) + pad;
  const cur = candles[candles.length - 1]!;
  const prev = candles[candles.length - 2]!;
  const curNear = cur.low <= hi && cur.high >= lo;
  const prevNear = prev.low <= hi && prev.high >= lo;
  if (!curNear || prevNear) return false;
  if (candleInBand(cur, top, bot)) return false;
  return true;
}

"""
text = text[:start] + slim + text[end:]

old_imp = """import {
  buildMergedDeskMtfDumpZonePack,
  detectMtfDumpCeilingZone,
  detectMtfDumpZone,
  mergedDeskTfLabelKo,
  type MtfDumpZoneSpec,
} from '@/lib/mergedDeskMtfDumpZoneBridge';
import { buildTelegramDumpPathSignal } from '@/lib/telegramDumpPathBrief';"""
new_imp = "import { buildTelegramDumpPathSignal } from '@/lib/telegramDumpPathBrief';"
if old_imp not in text:
    raise SystemExit("import block missing")
text = text.replace(old_imp, new_imp)

needle = (
    "/** 1h~1M 폭락: 첫터치뿐 아니라 구간 안에서도 알림(쿨다운 길게) */\n"
    "const DUMP_INSIDE_ALERT_TFS = new Set(['1h', '4h', '1d', '1w', '1M']);\n\n"
)
text = text.replace(needle, "")

p.write_text(text, encoding="utf-8")
print("ok", len(text))
