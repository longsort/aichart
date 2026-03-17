import 'package:flutter/material.dart';
import '../../core/models/trade_verdict.dart';

class VerdictCardV1 extends StatelessWidget {
  final TradeVerdict verdict;
  final VoidCallback? onOpen;

  const VerdictCardV1({
    super.key,
    required this.verdict,
    this.onOpen,
  });

  @override
  Widget build(BuildContext context) {
    final Color c = verdict.isShort
        ? const Color(0xFFFF3B6A)
        : verdict.isLong
            ? const Color(0xFF00FFB2)
            : const Color(0xFF8AA0B6);

    return GestureDetector(
      onTap: onOpen,
      child: Container(
        margin: const EdgeInsets.fromLTRB(14, 0, 14, 10),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFF0B0F14),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: c.withOpacity(0.70)),
          boxShadow: [
            if (verdict.isConfirmed)
              BoxShadow(
                color: c.withOpacity(0.35),
                blurRadius: 18,
                spreadRadius: 1,
              ),
          ],
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: c.withOpacity(0.14),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: c.withOpacity(0.55)),
              ),
              child: Text(
                verdict.title,
                style: TextStyle(color: c, fontWeight: FontWeight.w900, fontSize: 12),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                verdict.reason,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Colors.white70, fontSize: 12, height: 1.2),
              ),
            ),
            const SizedBox(width: 6),
            const Icon(Icons.open_in_new, color: Colors.white38, size: 18),
          ],
        ),
      ),
    );
  }
}
