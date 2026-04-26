
import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../core/models/fu_state.dart';
import '../../core/analysis/candle_event_analyzer.dart';
import 'neon_theme.dart';

class MiniChartV1 extends StatelessWidget {
  final List<FuCandle> candles;
  final List<FuZone> fvgZones;
  final String title;

  // ??ì¶”ê?: ?¤ì‹œê°?ê°€ê²?+ ì§€ì§€/?€??êµ¬ê°„ ?œí˜„???„í•´ widthë¥??´ë??ì„œ ?ë™ ?ì„±)
  final double price;
  final double s1;
  final double r1;

  const MiniChartV1({
    super.key,
    required this.candles,
    required this.fvgZones,
    required this.title,
    required this.price,
    required this.s1,
    required this.r1,
  });

  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);
    final ev = CandleEventAnalyzer.analyze(candles);

    String eventLine() {
      if (ev.typeKo == '?†ìŒ') return 'ë§‰í˜•(?¥ë?) ìº”ë“¤ ?†ìŒ';
      if (ev.sample < 5) return '${ev.typeKo} ë°œìƒ(?œë³¸ ë¶€ì¡? ${ev.sample}) ???•ë¥ ?€ ì°¸ê³ ë§?;
      return '${ev.typeKo} ë°œìƒ(?œë³¸ ${ev.sample})  |  ?ìŠ¹?•ë¥ : 1ìº”ë“¤ ${ev.pUp1}%, 3ìº”ë“¤ ${ev.pUp3}%, 5ìº”ë“¤ ${ev.pUp5}%';
    }

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: t.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: t.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: TextStyle(color: t.fg, fontWeight: FontWeight.w900)),
          const SizedBox(height: 10),
          SizedBox(
            height: 160,
            width: double.infinity,
            child: CustomPaint(painter: _P(candles, fvgZones, t, price, s1, r1)),
          ),
          const SizedBox(height: 8),
          Text(eventLine(), style: TextStyle(color: t.muted, fontSize: 11, height: 1.2)),
          const SizedBox(height: 4),
          Text('???•ë¥ ?€ ?œì°¸ê³ ìš©?? ë§ˆê°(ìº”ë“¤ ì¢…ë£Œ) ??? ë¢°ê°€ ?¬ë¼ê°‘ë‹ˆ??', style: TextStyle(color: t.muted, fontSize: 11)),
        ],
      ),
    );
  }
}

class _P extends CustomPainter {
  final List<FuCandle> c;
  final List<FuZone> z;
  final NeonTheme t;
  final double price;
  final double s1;
  final double r1;

  _P(this.c, this.z, this.t, this.price, this.s1, this.r1);

  @override
  void paint(Canvas canvas, Size size) {
    final bg = Paint()..color = t.bg;
    canvas.drawRRect(RRect.fromRectAndRadius(Offset.zero & size, const Radius.circular(14)), bg);
    if (c.isEmpty) return;

    double lo = c.first.low, hi = c.first.high;
    for (final x in c) { lo = math.min(lo, x.low); hi = math.max(hi, x.high); }
    // price/s1/r1??ì°¨íŠ¸ ë²”ìœ„???¬í•¨(? ì´ ë°–ìœ¼ë¡??€?”ê±° ë°©ì?)
    lo = math.min(lo, math.min(price, math.min(s1, r1)));
    hi = math.max(hi, math.max(price, math.max(s1, r1)));

    if (hi <= lo) return;
    double y(double p) => size.height - (p - lo) / (hi - lo) * size.height;

    // ??ì§€ì§€/?€??„ "êµ¬ê°„(??"ë¡??œí˜„: ?ˆë¹„??ATR ê·¼ì‚¬(ìµœê·¼ range ?‰ê· )ë¡??ë™ ê³„ì‚°
    final ranges = <double>[];
    final look = c.length < 30 ? c.length : 30;
    for (int i=c.length-look;i<c.length;i++){
      ranges.add((c[i].high - c[i].low).abs());
    }
    final avgRange = ranges.isEmpty ? (hi-lo)*0.01 : (ranges.reduce((a,b)=>a+b)/ranges.length);
    final band = avgRange * 0.8; // ???ê»˜(ê°€ê²?ê¸°ì?)

    void bandRect(double center, Color col) {
      final top = y(center + band);
      final bot = y(center - band);
      final r = Rect.fromLTRB(0, top, size.width, bot);
      final p = Paint()..color = col.withOpacity(0.10);
      canvas.drawRect(r, p);
    }

    // ì§€ì§€(ì´ˆë¡), ?€??ë¹¨ê°•)
    bandRect(s1, t.good);
    bandRect(r1, t.bad);

    // ???„ì¬ê°€ ?¼ì¸
    final py = y(price);
    final lp = Paint()..color = t.fg.withOpacity(0.55)..strokeWidth = 1.2;
    canvas.drawLine(Offset(0, py), Offset(size.width, py), lp);

    // ìº”ë“¤
    final n = c.length;
    final w = size.width / n;
    for (int i=0;i<n;i++) {
      final x = c[i];
      final cx = i*w + w*0.5;
      final up = x.close >= x.open;
      final col = up ? t.good : t.bad;
      final wick = Paint()..color = col.withOpacity(0.85)..strokeWidth = 2;
      canvas.drawLine(Offset(cx, y(x.high)), Offset(cx, y(x.low)), wick);
      final body = Paint()..color = col.withOpacity(0.85);
      final top = y(math.max(x.open, x.close));
      final bot = y(math.min(x.open, x.close));
      final r = Rect.fromLTRB(cx-w*0.22, top, cx+w*0.22, bot);
      canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(3)), body);
    }

    // (?µì…˜) FVG placeholder: ê¸°ì¡´ ê·¸ë?ë¡??ˆìœ¼ë©??½í•˜ê²?
    for (final f in z) {
      final p = Paint()..color = t.warn.withOpacity(0.08);
      final rt = Rect.fromLTRB(0, y(f.hi), size.width, y(f.lo));
      canvas.drawRect(rt, p);
    }
  }

  @override
  bool shouldRepaint(covariant _P oldDelegate) =>
      oldDelegate.c != c || oldDelegate.z != z || oldDelegate.price != price || oldDelegate.s1 != s1 || oldDelegate.r1 != r1;
}
