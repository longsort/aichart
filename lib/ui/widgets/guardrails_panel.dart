import 'package:flutter/material.dart';

class GuardrailsPanel extends StatelessWidget {
  final bool locked;
  final String lockText;

  final bool cooldownActive;
  final String cooldownLeft;

  final int risk0to100;
  final int crowd0to100;

  const GuardrailsPanel({
    super.key,
    required this.locked,
    required this.lockText,
    required this.cooldownActive,
    required this.cooldownLeft,
    required this.risk0to100,
    required this.crowd0to100,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final muted = cs.onSurface.withOpacity(0.65);

    String status;
    if (cooldownActive) {
      status = '?�식 LOCK: $cooldownLeft ?�음';
    } else if (locked) {
      status = '?�트?�이??LOCK)';
    } else {
      status = '거래 가??가???�과)';
    }

    final risk = risk0to100.clamp(0, 100);
    final crowd = crowd0to100.clamp(0, 100);

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
                'Guardrails',
                style: TextStyle(
                  color: cs.onSurface,
                  fontSize: 14,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const Spacer(),
              Text(
                status,
                style: TextStyle(
                  color: muted,
                  fontSize: 12,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          Row(
            children: [
              Expanded(child: _miniBar(context, '?�험', risk)),
              const SizedBox(width: 10),
              Expanded(child: _miniBar(context, '?�림', crowd)),
            ],
          ),
          const SizedBox(height: 10),

          if (cooldownActive || locked) ...[
            Text(
              lockText.isNotEmpty ? lockText : '보호 모드가 ?�성?�되??진입??막았??,
              style: TextStyle(
                color: muted,
                fontSize: 12,
                fontWeight: FontWeight.w800,
                height: 1.2,
              ),
            ),
            const SizedBox(height: 10),
          ],

          Text(
            '리스??5% 고정(기본):\n?��???USDT) = (?�본×0.05) ÷ ?�절??%)\n?�버리�???RR/변?�성??맞춰 최소??,
            style: TextStyle(
              color: muted,
              fontSize: 12,
              fontWeight: FontWeight.w800,
              height: 1.25,
            ),
          ),
        ],
      ),
    );
  }

  Widget _miniBar(BuildContext context, String label, int v) {
    final cs = Theme.of(context).colorScheme;
    final muted = cs.onSurface.withOpacity(0.65);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(label, style: TextStyle(color: muted, fontSize: 12, fontWeight: FontWeight.w900)),
            const Spacer(),
            Text('$v', style: TextStyle(color: muted, fontSize: 12, fontWeight: FontWeight.w900)),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: LinearProgressIndicator(
            value: v / 100.0,
            minHeight: 10,
            backgroundColor: cs.outline.withOpacity(0.20),
          ),
        ),
      ],
    );
  }
}
