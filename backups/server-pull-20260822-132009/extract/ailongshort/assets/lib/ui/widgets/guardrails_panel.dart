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
      status = '휴식 LOCK: $cooldownLeft 남음';
    } else if (locked) {
      status = '노트레이드(LOCK)';
    } else {
      status = '거래 가능(가드 통과)';
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
              Expanded(child: _miniBar(context, '위험', risk)),
              const SizedBox(width: 10),
              Expanded(child: _miniBar(context, '쏠림', crowd)),
            ],
          ),
          const SizedBox(height: 10),

          if (cooldownActive || locked) ...[
            Text(
              lockText.isNotEmpty ? lockText : '보호 모드가 활성화되어 진입을 막았음',
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
            '리스크 5% 고정(기본):\n포지션(USDT) = (자본×0.05) ÷ 손절폭(%)\n레버리지는 RR/변동성에 맞춰 최소화',
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
