import 'package:flutter/material.dart';

class NoTradeLockBadge extends StatelessWidget {
  final bool locked;
  final String reason;
  final Duration remaining;

  const NoTradeLockBadge({
    super.key,
    required this.locked,
    required this.reason,
    required this.remaining,
  });

  @override
  Widget build(BuildContext context) {
    if (!locked) return const SizedBox.shrink();

    final mm = remaining.inMinutes;
    final ss = remaining.inSeconds % 60;
    final timeTxt = mm > 0 ? '${mm}m ${ss}s' : '${ss}s';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      margin: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.55),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.redAccent.withOpacity(0.75), width: 1.2),
        boxShadow: [
          BoxShadow(
            blurRadius: 10,
            spreadRadius: 0,
            offset: const Offset(0, 6),
            color: Colors.black.withOpacity(0.25),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.block, size: 16, color: Colors.redAccent),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              'NO-TRADE LOCK · $timeTxt\n$reason',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 11,
                fontWeight: FontWeight.w700,
                height: 1.2,
              ),
            ),
          ),
        ],
      ),
    );
  }
}