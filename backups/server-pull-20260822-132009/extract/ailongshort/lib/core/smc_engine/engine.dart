import '../../data/models/candle.dart';
import 'models.dart';

SmcResult scanSmc(List<Candle> cs) {
  if (cs.length < 20) {
    return SmcResult(structure: 'RANGE', structureScore: 0, reactionScore: 0);
  }

  final n = cs.length;
  final look = cs.sublist(n - 60 < 0 ? 0 : n - 60);

  SmcPoint? lastHigh;
  SmcPoint? lastLow;

  for (int i = 2; i < look.length - 2; i++) {
    final a = look[i - 1], b = look[i], c = look[i + 1];
    if (b.h > a.h && b.h > c.h) lastHigh = SmcPoint(i, b.h);
    if (b.l < a.l && b.l < c.l) lastLow = SmcPoint(i, b.l);
  }

  final last = look.last;
  String st = 'RANGE';
  SmcPoint? bp;

  if (lastHigh != null && last.c > lastHigh!.price) {
    st = 'CHOCH_UP';
    bp = lastHigh;
  } else if (lastLow != null && last.c < lastLow!.price) {
    st = 'CHOCH_DN';
    bp = lastLow;
  }

  final sScore = st == 'RANGE' ? 35 : 70;

  double? top, bot;
  String label = '';

  if (bp != null) {
    // OB ?�보
    for (int i = look.length - 2; i >= 1; i--) {
      final c = look[i];
      final isUp = c.c >= c.o;
      if (st == 'CHOCH_UP') {
        if (!isUp) { top = c.h; bot = c.l; label = 'OB'; break; }
      } else {
        if (isUp) { top = c.h; bot = c.l; label = 'OB'; break; }
      }
    }

    // FVG ?�보 (간단)
    if (top == null || bot == null) {
      for (int i = look.length - 3; i >= 2; i--) {
        final a = look[i - 2];
        final b = look[i];
        if (st == 'CHOCH_UP' && a.h < b.l) { top = b.l; bot = a.h; label = 'FVG'; break; }
        if (st == 'CHOCH_DN' && a.l > b.h) { top = a.l; bot = b.h; label = 'FVG'; break; }
      }
    }
  }

  int rScore = 0;
  if (top != null && bot != null) {
    final mid = (top + bot) / 2;
    final dist = (last.c - mid).abs();
    final span = (top - bot).abs().clamp(1e-9, 1e18);
    final x = 1 - (dist / (span * 3));
    rScore = (x.clamp(0, 1) * 100).round();
  }

  return SmcResult(
    structure: st,
    structureScore: sScore,
    reactionScore: rScore,
    breakPoint: bp,
    reactionTop: top,
    reactionBot: bot,
    reactionLabel: label,
  );
}
