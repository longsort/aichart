import 'package:flutter/material.dart';

class TopDecisionChips extends StatelessWidget {
  /// 아래 값들은 ultra_home_screen에서 네 모델에 맞게 넣어주면 됨
  final String title;     // 예: '롱' / '숏' / '관망'
  final int score;        // 0~100
  final int confidence;   // 0~100
  final bool locked;      // LOCK 상태면 true
  final String lockText;  // 예: '휴식 LOCK 12:31' / '노트레이드'

  const TopDecisionChips({
    super.key,
    required this.title,
    required this.score,
    required this.confidence,
    required this.locked,
    required this.lockText,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final muted = cs.onSurface.withOpacity(0.65);

    // 3개를 항상 “가지런히” 보여주는 형태:
    // [결정] [점수] [신뢰]  + (LOCK이면 오른쪽에 띠)
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: cs.surface.withOpacity(0.92),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: cs.outline.withOpacity(0.45)),
      ),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          _chip(
            context,
            label: '결정',
            value: title,
            strong: true,
          ),
          _chip(
            context,
            label: '점수',
            value: '${score.clamp(0, 100)}',
          ),
          _chip(
            context,
            label: '신뢰',
            value: '${confidence.clamp(0, 100)}%',
          ),
          if (locked)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.18),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: cs.outline.withOpacity(0.40)),
              ),
              child: Text(
                lockText.isEmpty ? 'LOCK' : lockText,
                style: TextStyle(
                  color: muted,
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _chip(BuildContext context,
      {required String label, required String value, bool strong = false}) {
    final cs = Theme.of(context).colorScheme;
    final muted = cs.onSurface.withOpacity(0.65);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.16),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: cs.outline.withOpacity(0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '$label ',
            style: TextStyle(
              color: muted,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
          Text(
            value,
            style: TextStyle(
              color: cs.onSurface,
              fontSize: 12,
              fontWeight: strong ? FontWeight.w900 : FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}