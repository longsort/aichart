import 'package:flutter/material.dart';
import '../../models/zone.dart';
import 'future_glass.dart';

class ZoneInsightCard extends StatelessWidget {
  final ZoneCandidate? zone;
  final ZoneStrength? strength;

  const ZoneInsightCard({
    super.key,
    required this.zone,
    required this.strength,
  });

  @override
  Widget build(BuildContext context) {
    if (zone == null) {
      return const SizedBox.shrink();
    }

    final z = zone!;
    final s = strength;
    final t = Theme.of(context);

    String fmt(double v) => v.toStringAsFixed(0);
    String pct(double v) => v.isNaN ? '0.0' : v.toStringAsFixed(1);

    return FutureGlass(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '📍 핵심 구간(자동): ${z.label}',
              style: t.textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              '${fmt(z.low)} ~ ${fmt(z.high)}  (점수 ${z.score})',
              style: t.textTheme.bodyMedium?.copyWith(
                color: t.colorScheme.onSurface.withOpacity(0.7),
              ),
            ),
            const SizedBox(height: 10),
            if (s == null)
              Text(
                '체결/오더북 분석 불러오는 중…',
                style: t.textTheme.bodyMedium,
              )
            else ...[
              Row(
                children: [
                  _meter(context, '방어(흡수)', s.absorption),
                  const SizedBox(width: 10),
                  _meter(context, '뚫림(압력)', s.breakout),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                '상태: ${s.status} · 체결 ${pct(s.buyVol + s.sellVol)} '
                '(buy ${pct(s.buyVol)} / sell ${pct(s.sellVol)}) · 버팀 ${s.holdSec}s',
                style: t.textTheme.bodySmall?.copyWith(
                  color: t.colorScheme.onSurface.withOpacity(0.6),
                ),
              ),
              const SizedBox(height: 12),
              Text(
                '📊 과거 비슷한 상황 ${s.samples}회',
                style: t.textTheme.bodyMedium,
              ),
              const SizedBox(height: 6),
              Text(
                '1봉: ↑${(s.upProb1 * 100).round()}% '
                '/ 평균 +${pct(s.avgUp1)}%',
                style: t.textTheme.bodySmall,
              ),
              const SizedBox(height: 4),
              Text(
                '3봉: ↑${(s.upProb3 * 100).round()}% '
                '/ 실패 ${(s.failProb3 * 100).round()}%',
                style: t.textTheme.bodySmall,
              ),
              const SizedBox(height: 4),
              Text(
                '5봉: 최고 +${pct(s.mfe5)}% / 최악 ${pct(s.mae5)}%',
                style: t.textTheme.bodySmall,
              ),
            ],
            const SizedBox(height: 8),
            Text(
              '설명: ${z.reason}',
              style: t.textTheme.bodySmall?.copyWith(
                color: t.colorScheme.onSurface.withOpacity(0.6),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _meter(BuildContext context, String label, int v) {
    final t = Theme.of(context);
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: t.textTheme.labelMedium),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              value: (v.clamp(0, 100)) / 100.0,
              minHeight: 10,
              backgroundColor: Colors.white.withOpacity(0.08),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '$v/100',
            style: t.textTheme.bodySmall?.copyWith(
              color: t.colorScheme.onSurface.withOpacity(0.6),
            ),
          ),
        ],
      ),
    );
  }
}
