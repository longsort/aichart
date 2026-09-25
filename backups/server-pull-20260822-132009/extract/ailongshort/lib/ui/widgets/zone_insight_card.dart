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
              '?ìç ?µÏã¨ Íµ¨Í∞Ñ(?êÎèô): ${z.label}',
              style: t.textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              '${fmt(z.low)} ~ ${fmt(z.high)}  (?êÏàò ${z.score})',
              style: t.textTheme.bodyMedium?.copyWith(
                color: t.colorScheme.onSurface.withOpacity(0.7),
              ),
            ),
            const SizedBox(height: 10),
            if (s == null)
              Text(
                'Ï≤¥Í≤∞/?§ÎçîÎ∂?Î∂ÑÏÑù Î∂àÎü¨?§Îäî Ï§ë‚Ä?,
                style: t.textTheme.bodyMedium,
              )
            else ...[
              Row(
                children: [
                  _meter(context, 'Î∞©Ïñ¥(?°Ïàò)', s.absorption),
                  const SizedBox(width: 10),
                  _meter(context, '?´Î¶º(?ïÎ†•)', s.breakout),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                '?ÅÌÉú: ${s.status} ¬∑ Ï≤¥Í≤∞ ${pct(s.buyVol + s.sellVol)} '
                '(buy ${pct(s.buyVol)} / sell ${pct(s.sellVol)}) ¬∑ Î≤ÑÌ? ${s.holdSec}s',
                style: t.textTheme.bodySmall?.copyWith(
                  color: t.colorScheme.onSurface.withOpacity(0.6),
                ),
              ),
              const SizedBox(height: 12),
              Text(
                '?ìä Í≥ºÍ±∞ ÎπÑÏä∑???ÅÌô© ${s.samples}??,
                style: t.textTheme.bodyMedium,
              ),
              const SizedBox(height: 6),
              Text(
                '1Î¥? ??{(s.upProb1 * 100).round()}% '
                '/ ?âÍ∑† +${pct(s.avgUp1)}%',
                style: t.textTheme.bodySmall,
              ),
              const SizedBox(height: 4),
              Text(
                '3Î¥? ??{(s.upProb3 * 100).round()}% '
                '/ ?§Ìå® ${(s.failProb3 * 100).round()}%',
                style: t.textTheme.bodySmall,
              ),
              const SizedBox(height: 4),
              Text(
                '5Î¥? ÏµúÍ≥† +${pct(s.mfe5)}% / ÏµúÏïÖ ${pct(s.mae5)}%',
                style: t.textTheme.bodySmall,
              ),
            ],
            const SizedBox(height: 8),
            Text(
              '?§Î™Ö: ${z.reason}',
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
