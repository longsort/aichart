import 'package:flutter/material.dart';

/// 상단 빈 공간을 채우는 초간단 "AI 게이지" 카드
class MiniPulseHud extends StatelessWidget {
  final int energy; // 0~100
  final int confidence; // 0~100
  final int risk; // 0~100
  final String label;

  const MiniPulseHud({
    super.key,
    required this.energy,
    required this.confidence,
    required this.risk,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final muted = cs.onSurface.withOpacity(0.65);

    int clamp(int v) => v.clamp(0, 100);
    final e = clamp(energy);
    final c = clamp(confidence);
    final r = clamp(risk);

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
              Text(label, style: TextStyle(color: cs.onSurface, fontSize: 14, fontWeight: FontWeight.w900)),
              const Spacer(),
              Text('E$e C$c R$r', style: TextStyle(color: muted, fontSize: 12, fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 10),
          _bar(context, '에너지', e),
          const SizedBox(height: 8),
          _bar(context, '신뢰', c),
          const SizedBox(height: 8),
          _bar(context, '위험', r),
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
