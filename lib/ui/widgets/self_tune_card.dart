import 'package:flutter/material.dart';
import '../../logic/self_tune.dart';

class SelfTuneCard extends StatelessWidget {
  final SelfTuneState state;
  const SelfTuneCard({super.key, required this.state});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.blueAccent.withOpacity(0.4)),
      ),
      child: Row(
        children: [
          const Text('?ß† ?êÍ?Î≥¥Ï†ï', style: TextStyle(fontWeight: FontWeight.w800)),
          const Spacer(),
          Text('Î™®Îìú: ${state.mode}'),
          const SizedBox(width: 8),
          Text('Bias ${state.conservativeBias}'),
        ],
      ),
    );
  }
}