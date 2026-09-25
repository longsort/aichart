import 'package:flutter/material.dart';
import '../../core/models/fu_state.dart';

/// ?µÌï© Î∏åÎ¶¨??Ïπ¥Îìú (Ï¥àÎ≥¥??
class IntegratedBriefingCardV1 extends StatelessWidget {
  final FuState s;
  final Color card;
  final Color fg;
  final Color sub;
  final Color border;

  const IntegratedBriefingCardV1({
    super.key,
    required this.s,
    required this.card,
    required this.fg,
    required this.sub,
    required this.border,
  });

  @override
  Widget build(BuildContext context) {
    final dir = s.signalDir.toUpperCase();
    final bool locked = s.locked;

    String title;
    String emoji;
    if (locked) {
      title = 'Í±∞Îûò Í∏àÏ?';
      emoji = '?îí';
    } else if (dir == 'LONG') {
      title = '?ÅÏäπ ?∞ÏÑ∏';
      emoji = '?ìà';
    } else if (dir == 'SHORT') {
      title = '?òÎùΩ ?∞ÏÑ∏';
      emoji = '?ìâ';
    } else {
      title = 'Í¥ÄÎß?;
      emoji = '??';
    }

    final reasons = <String>[];
    if (locked && s.lockedReason.trim().isNotEmpty) {
      reasons.add(s.lockedReason.trim());
    }
    // bullets?êÏÑú ?µÏã¨ 3Í∞úÎßå ÎΩëÍ∏∞
    for (final b in s.signalBullets) {
      if (reasons.length >= 3) break;
      final t = b.trim();
      if (t.isEmpty) continue;
      reasons.add(t);
    }
    if (reasons.isEmpty) {
      reasons.add(s.signalWhy.isNotEmpty ? s.signalWhy : '?∞Ïù¥???òÏßë Ï§?);
    }

    final bool actionable = s.showSignal && !locked;
    final guide1 = locked
        ? 'Ï¥àÎ≥¥: ÏßÄÍ∏àÏ? ?¨Ïñ¥??
        : (actionable ? 'Ï¥àÎ≥¥: 5% Î¶¨Ïä§?¨Î°ú ?åÏï°Îß? : 'Ï¥àÎ≥¥: Ï°∞Í±¥ Ï∂©Ï°± ?ÑÍπåÏßÄ ?ÄÍ∏?);
    final guide2 = locked
        ? '?ôÎ†®: Í≥ºÏó¥/Ï∂©Îèå Íµ¨Í∞Ñ ?åÌîº'
        : (actionable ? '?ôÎ†®: Í≥ÑÌöç(ÏßÑÏûÖ/?êÏ†à/Î™©Ìëú)?ÄÎ°? : '?ôÎ†®: ÏßÄÏßÄ/?Ä??Î∞òÏùë ?ïÏù∏');

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(emoji, style: TextStyle(color: fg, fontSize: 16)),
              const SizedBox(width: 6),
              Text(
                title,
                style: TextStyle(color: fg, fontSize: 14, fontWeight: FontWeight.w900),
              ),
              const Spacer(),
              Text(
                '?†Î¢∞ ${s.confidence}% ¬∑ ?ÑÌóò ${s.risk}%',
                style: TextStyle(color: sub, fontSize: 11, fontWeight: FontWeight.w700),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ...reasons.take(3).map(
            (t) => Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text('??$t', style: TextStyle(color: sub, fontSize: 12, fontWeight: FontWeight.w700)),
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(child: Text(guide1, style: TextStyle(color: fg, fontSize: 11, fontWeight: FontWeight.w800))),
              const SizedBox(width: 8),
              Expanded(child: Text(guide2, style: TextStyle(color: fg, fontSize: 11, fontWeight: FontWeight.w800))),
            ],
          )
        ],
      ),
    );
  }
}
