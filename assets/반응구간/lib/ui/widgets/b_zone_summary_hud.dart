import 'package:flutter/material.dart';

class BZoneSummaryHud extends StatelessWidget {
  final String zoneLabel;
  final double zoneLow;
  final double zoneHigh;

  final int absorption; // 0~100
  final int breakout;   // 0~100

  final int samples;

  final int upProb1;    // 0~100
  final double avgUp1;  // +%
  final double avgDown1;// -% (보통 음수로 들어오지만, 문자열로는 그대로 보여줌)

  // 3/5봉 추가(없으면 표시 안 함)
  final int? upProb3; // 0~100
  final double? avgUp3;
  final double? avgDown3;
  final int? upProb5; // 0~100
  final double? avgUp5;
  final double? avgDown5;

  // ✅ 추가: 기준가격(현재가) - 없으면 %만 표기
  final double? refPrice;

  const BZoneSummaryHud({
    super.key,
    required this.zoneLabel,
    required this.zoneLow,
    required this.zoneHigh,
    required this.absorption,
    required this.breakout,
    required this.samples,
    required this.upProb1,
    required this.avgUp1,
    required this.avgDown1,
    this.upProb3,
    this.avgUp3,
    this.avgDown3,
    this.upProb5,
    this.avgUp5,
    this.avgDown5,
    this.refPrice,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final muted = cs.onSurface.withOpacity(0.65);

    String fmt(double v) => v.toStringAsFixed(0);

    // 달러 변환(현물 기준): refPrice가 있을 때만 계산
    String toUsdText(double pct) {
      final rp = refPrice;
      if (rp == null || rp == 0) return '';
      final usd = rp * (pct / 100.0);
      final sign = usd >= 0 ? '+' : '';
      return ' ($sign${usd.toStringAsFixed(0)}\$)';
    }

    final upUsd = toUsdText(avgUp1);
    final downUsd = toUsdText(avgDown1);

    String line(int n, int upProb, double upAvg, double downAvg) {
      final upT = toUsdText(upAvg);
      final dnT = toUsdText(downAvg);
      return '${n}봉: ↑ $upProb% / 평균 +${upAvg.toStringAsFixed(2)}%$upT  ·  평균 ${downAvg.toStringAsFixed(2)}%$dnT';
    }

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
          // 헤더
          Row(
            children: [
              Text(
                '📍 ${fmt(zoneLow)} ~ ${fmt(zoneHigh)}',
                style: TextStyle(
                  color: cs.onSurface,
                  fontSize: 14,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                zoneLabel,
                style: TextStyle(
                  color: muted,
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const Spacer(),
              Text(
                '유사 $samples회',
                style: TextStyle(
                  color: muted,
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // 방어/뚫림 바
          Row(
            children: [
              Expanded(child: _bar(context, '방어', absorption)),
              const SizedBox(width: 10),
              Expanded(child: _bar(context, '뚫림', breakout)),
            ],
          ),
          const SizedBox(height: 10),

          // 1/3/5봉 요약
          Text(
            '1봉: ↑ $upProb1% / 평균 +${avgUp1.toStringAsFixed(2)}%$upUsd  ·  평균 ${avgDown1.toStringAsFixed(2)}%$downUsd',
            style: TextStyle(
              color: muted,
              fontSize: 12,
              fontWeight: FontWeight.w800,
              height: 1.2,
            ),
          ),

          if (upProb3 != null && avgUp3 != null && avgDown3 != null) ...[
            const SizedBox(height: 6),
            Text(
              line(3, upProb3!, avgUp3!, avgDown3!),
              style: TextStyle(
                color: muted,
                fontSize: 12,
                fontWeight: FontWeight.w800,
                height: 1.2,
              ),
            ),
          ],

          if (upProb5 != null && avgUp5 != null && avgDown5 != null) ...[
            const SizedBox(height: 6),
            Text(
              line(5, upProb5!, avgUp5!, avgDown5!),
              style: TextStyle(
                color: muted,
                fontSize: 12,
                fontWeight: FontWeight.w800,
                height: 1.2,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _bar(BuildContext context, String label, int v) {
    final cs = Theme.of(context).colorScheme;
    final muted = cs.onSurface.withOpacity(0.65);
    final value = v.clamp(0, 100);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            color: muted,
            fontSize: 12,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: LinearProgressIndicator(
            value: value / 100.0,
            minHeight: 10,
            backgroundColor: cs.outline.withOpacity(0.22),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          '$value/100',
          style: TextStyle(
            color: muted,
            fontSize: 11,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    );
  }
}