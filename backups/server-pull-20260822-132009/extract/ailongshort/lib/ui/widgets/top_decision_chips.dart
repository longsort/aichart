import 'package:flutter/material.dart';

class TopDecisionChips extends StatelessWidget {
  /// ?ÑÎûò Í∞íÎì§?Ä ultra_home_screen?êÏÑú ??Î™®Îç∏??ÎßûÍ≤å ?£Ïñ¥Ï£ºÎ©¥ ??  final String title;     // ?? 'Î°? / '?? / 'Í¥ÄÎß?
  final int score;        // 0~100
  final int confidence;   // 0~100
  final bool locked;      // LOCK ?ÅÌÉúÎ©?true
  final String lockText;  // ?? '?¥Ïãù LOCK 12:31' / '?∏Ìä∏?àÏù¥??

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

    // 3Í∞úÎ? ??ÉÅ ?úÍ?ÏßÄ?∞Ìûà??Î≥¥Ïó¨Ï£ºÎäî ?ïÌÉú:
    // [Í≤∞Ï†ï] [?êÏàò] [?†Î¢∞]  + (LOCK?¥Î©¥ ?§Î•∏Ï™ΩÏóê ??
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
            label: 'Í≤∞Ï†ï',
            value: title,
            strong: true,
          ),
          _chip(
            context,
            label: '?êÏàò',
            value: '${score.clamp(0, 100)}',
          ),
          _chip(
            context,
            label: '?†Î¢∞',
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