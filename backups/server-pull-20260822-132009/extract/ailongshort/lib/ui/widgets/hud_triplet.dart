import 'package:flutter/material.dart';

class HudTriplet extends StatelessWidget {
  final int score0to100;
  final int confidence0to100;
  final int risk0to100;

  const HudTriplet({
    super.key,
    required this.score0to100,
    required this.confidence0to100,
    required this.risk0to100,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: _miniGauge(context, title: '?êÏàò', value: score0to100)),
        const SizedBox(width: 10),
        Expanded(child: _miniGauge(context, title: '?†Î¢∞', value: confidence0to100)),
        const SizedBox(width: 10),
        Expanded(child: _miniGauge(context, title: '?ÑÌóò', value: risk0to100)),
      ],
    );
  }

  Widget _miniGauge(BuildContext context, {required String title, required int value}) {
    final t = Theme.of(context);
    final cs = t.colorScheme;

    final v = value.clamp(0, 100);

    // ?åÎßàÍ∞Ä ?¥Îñ§ Íµ¨Ï°∞??Íπ®Ï?ÏßÄ ?äÍ≤å ?àÏ†ÑÍ∞?Ï≤òÎ¶¨
    final Color cardBg = cs.surface.withOpacity(0.92);
    final Color border = (cs.outlineVariant ?? cs.outline).withOpacity(0.65);
    final Color muted = cs.onSurface.withOpacity(0.65);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.28),
            blurRadius: 18,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Row(
        children: [
          // ?ºÏ™Ω ?çÏä§??          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    color: muted,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  '$v',
                  style: TextStyle(
                    color: cs.onSurface,
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),

          // ?§Î•∏Ï™??êÌòï Í≤åÏù¥ÏßÄ (?¨Í∏∞ Í≥†Ï†ï ???§Î≤Ñ?åÎ°ú??Î∞©Ï?)
          SizedBox(
            width: 46,
            height: 46,
            child: Stack(
              alignment: Alignment.center,
              children: [
                CircularProgressIndicator(
                  value: v / 100.0,
                  strokeWidth: 6,
                  backgroundColor: border.withOpacity(0.35),
                ),
                Text(
                  '$v%',
                  style: TextStyle(
                    color: muted,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}