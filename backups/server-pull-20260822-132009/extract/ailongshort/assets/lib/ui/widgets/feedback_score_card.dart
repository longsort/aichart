import 'package:flutter/material.dart';

import '../../logic/session_score.dart';

class FeedbackScoreCard extends StatelessWidget {
  final SessionScore score;
  final VoidCallback onWin;
  final VoidCallback onLoss;
  final VoidCallback onBe;
  final VoidCallback onReset;

  const FeedbackScoreCard({
    super.key,
    required this.score,
    required this.onWin,
    required this.onLoss,
    required this.onBe,
    required this.onReset,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final muted = cs.onSurface.withOpacity(0.65);

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
              Text('세션 스코어',
                  style: TextStyle(
                      color: cs.onSurface,
                      fontSize: 14,
                      fontWeight: FontWeight.w900)),
              const Spacer(),
              Text('점수 ${score.score}/100',
                  style: TextStyle(
                      color: muted,
                      fontSize: 12,
                      fontWeight: FontWeight.w900)),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              _pill(context, 'WIN ${score.wins}'),
              const SizedBox(width: 6),
              _pill(context, 'LOSS ${score.losses}'),
              const SizedBox(width: 6),
              _pill(context, 'BE ${score.be}'),
              const Spacer(),
              Text('승률 ${(score.winRate * 100).toStringAsFixed(0)}%',
                  style: TextStyle(
                      color: muted,
                      fontSize: 12,
                      fontWeight: FontWeight.w900)),
            ],
          ),
          const SizedBox(height: 10),
          Text('결과 버튼을 눌러 학습(자기보정) 로그를 쌓아줘.',
              style: TextStyle(
                  color: muted,
                  fontSize: 12,
                  fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _btn(context, 'WIN', onWin),
              _btn(context, 'LOSS', onLoss),
              _btn(context, 'BE', onBe),
              _btn(context, '리셋', onReset, subtle: true),
            ],
          ),
        ],
      ),
    );
  }

  Widget _pill(BuildContext context, String t) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withOpacity(0.18)),
      ),
      child: Text(
        t,
        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900),
      ),
    );
  }

  Widget _btn(BuildContext context, String label, VoidCallback onTap,
      {bool subtle = false}) {
    final cs = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: subtle ? Colors.black.withOpacity(0.10) : cs.primary.withOpacity(0.18),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: cs.outline.withOpacity(0.35)),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w900,
            color: cs.onSurface,
          ),
        ),
      ),
    );
  }
}
