// lib/ui/widgets/no_trade_lock_banner.dart
import 'package:flutter/material.dart';
import '../../logic/no_trade_lock.dart';

class NoTradeLockBanner extends StatelessWidget {
  final NoTradeLockState state;
  const NoTradeLockBanner({super.key, required this.state});

  @override
  Widget build(BuildContext context) {
    if (!state.locked) return const SizedBox.shrink();

    final etaText = state.eta == null ? '-' : '${state.eta!.inMinutes}Î∂?;
    final sev = state.severity.clamp(1, 5);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.orangeAccent.withOpacity(0.55)),
        color: Colors.orangeAccent.withOpacity(0.08),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('?ö´ NO-TRADE ?êÎèô ?†Í∏à', style: TextStyle(fontWeight: FontWeight.w800)),
              const Spacer(),
              Text('L$sev', style: const TextStyle(fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 6),
          Text('?¨Ïú†: ${state.reason}', style: const TextStyle(fontSize: 12)),
          const SizedBox(height: 4),
          Text('?àÏÉÅ ?¥Ï†ú: $etaText', style: const TextStyle(fontSize: 12, color: Colors.white70)),
        ],
      ),
    );
  }
}