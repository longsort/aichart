import 'package:flutter/material.dart';

class FlowRadarHud extends StatelessWidget {
  final int buyStrength;     // 0~100
  final int sellStrength;    // 0~100
  final int obImbalance;     // 0~100 (호가 쏠림)
  final int absorption;      // 0~100 (매집 흔적)
  final int instBias;        // 0~100 (큰손 방향)
  final int whaleScore;      // 0~100 (고래 힘)
  final int whaleBuyPct;     // 0~100 (고래 매수 비중)
  final int sweepRisk;       // 0~100 (털기 위험)
  final double? cvd;         // 누적 델타(가능할 때만)
  final String note;         // 짧은 코멘트

  const FlowRadarHud({
    super.key,
    required this.buyStrength,
    required this.sellStrength,
    required this.obImbalance,
    required this.absorption,
    required this.instBias,
    required this.whaleScore,
    required this.whaleBuyPct,
    required this.sweepRisk,
    this.cvd,
    required this.note,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final muted = cs.onSurface.withOpacity(0.65);

    int clamp(int v) => v.clamp(0, 100);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: cs.surface.withOpacity(0.92),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: cs.outline.withOpacity(0.45)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                '세력·고래 레이더',
                style: TextStyle(
                  color: cs.onSurface,
                  fontSize: 14,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const Spacer(),
              if (cvd != null)
                Text(
                  'CVD ${cvd!.toStringAsFixed(0)}',
                  style: TextStyle(color: muted, fontSize: 12, fontWeight: FontWeight.w800),
                ),
            ],
          ),
          const SizedBox(height: 10),

          _bar(context, '매수 힘', clamp(buyStrength)),
          const SizedBox(height: 8),
          _bar(context, '매도 힘', clamp(sellStrength)),
          const SizedBox(height: 8),
          _bar(context, '호가 쏠림', clamp(obImbalance)),
          const SizedBox(height: 8),
          _bar(context, '매집 흔적', clamp(absorption)),
          const SizedBox(height: 8),
          _bar(context, '큰손 방향', clamp(instBias)),
          const SizedBox(height: 8),
          _bar(context, '고래 힘', clamp(whaleScore)),
          const SizedBox(height: 8),
          _bar(context, '털기 위험', clamp(sweepRisk)),

          const SizedBox(height: 8),
          Text(
            '고래 매수 ${clamp(whaleBuyPct)}%',
            style: TextStyle(color: muted, fontSize: 12, fontWeight: FontWeight.w900),
          ),

          const SizedBox(height: 10),
          Text(
            note,
            style: TextStyle(color: muted, fontSize: 12, fontWeight: FontWeight.w800, height: 1.2),
          ),
        ],
      ),
    );
  }

  Widget _bar(BuildContext context, String label, int v) {
    final cs = Theme.of(context).colorScheme;
    final muted = cs.onSurface.withOpacity(0.65);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(label, style: TextStyle(color: muted, fontSize: 12, fontWeight: FontWeight.w800)),
            const Spacer(),
            Text('$v/100', style: TextStyle(color: muted, fontSize: 12, fontWeight: FontWeight.w900)),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: TweenAnimationBuilder<double>(
            tween: Tween(begin: 0.0, end: v / 100.0),
            duration: const Duration(milliseconds: 520),
            curve: Curves.easeOutCubic,
            builder: (context, val, _) {
              final invert = label.contains('매도') || label.contains('털기');
              final strong = v >= 55;
              final c = invert
                  ? (strong ? cs.error : cs.primary)
                  : (strong ? cs.primary : cs.error.withOpacity(0.85));
              return LinearProgressIndicator(
                value: val,
                minHeight: 10,
                backgroundColor: cs.outline.withOpacity(0.20),
                valueColor: AlwaysStoppedAnimation<Color>(c),
              );
            },
          ),
        ),
      ],
    );
  }
}