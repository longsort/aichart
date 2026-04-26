
import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../core/models/fu_state.dart';
import '../../core/analysis/candle_event_analyzer.dart';
import 'neon_theme.dart';

class MiniChartV1 extends StatelessWidget {
  final List<FuCandle> candles;
  final List<FuZone> fvgZones;
  final String title;

  // ✅ 추가: 실시간 가격 + 지지/저항(구간 표현을 위해 width를 내부에서 자동 생성)
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
      if (ev.typeKo == '없음') return '막형(장대) 캔들 없음';
      if (ev.sample < 5) return '${ev.typeKo} 발생(표본 부족: ${ev.sample}) — 확률은 참고만';
      return '${ev.typeKo} 발생(표본 ${ev.sample})  |  상승확률: 1캔들 ${ev.pUp1}%, 3캔들 ${ev.pUp3}%, 5캔들 ${ev.pUp5}%';
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
          Text('※ 확률은 “참고용”. 마감(캔들 종료) 후 신뢰가 올라갑니다.', style: TextStyle(color: t.muted, fontSize: 11)),
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
    // price/s1/r1도 차트 범위에 포함(선이 밖으로 튀는거 방지)
    lo = math.min(lo, math.min(price, math.min(s1, r1)));
    hi = math.max(hi, math.max(price, math.max(s1, r1)));

    if (hi <= lo) return;
    double y(double p) => size.height - (p - lo) / (hi - lo) * size.height;

    // ✅ 지지/저항을 "구간(띠)"로 표현: 너비는 ATR 근사(최근 range 평균)로 자동 계산
    final ranges = <double>[];
    final look = c.length < 30 ? c.length : 30;
    for (int i=c.length-look;i<c.length;i++){
      ranges.add((c[i].high - c[i].low).abs());
    }
    final avgRange = ranges.isEmpty ? (hi-lo)*0.01 : (ranges.reduce((a,b)=>a+b)/ranges.length);
    final band = avgRange * 0.8; // 띠 두께(가격 기준)

    void bandRect(double center, Color col) {
      final top = y(center + band);
      final bot = y(center - band);
      final r = Rect.fromLTRB(0, top, size.width, bot);
      final p = Paint()..color = col.withOpacity(0.10);
      canvas.drawRect(r, p);
    }

    // 지지(초록), 저항(빨강)
    bandRect(s1, t.good);
    bandRect(r1, t.bad);

    // ✅ 현재가 라인
    final py = y(price);
    final lp = Paint()..color = t.fg.withOpacity(0.55)..strokeWidth = 1.2;
    canvas.drawLine(Offset(0, py), Offset(size.width, py), lp);

    // 캔들
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

    // (옵션) FVG placeholder: 기존 그대로(있으면 약하게)
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
