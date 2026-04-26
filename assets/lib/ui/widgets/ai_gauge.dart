import 'package:flutter/material.dart';

class AIGauge extends StatelessWidget {
  final String state; // LONG / SHORT / WAIT / BLOCK
  final int probability;

  const AIGauge({
    super.key,
    required this.state,
    required this.probability,
  });

  Color _color() {
    switch (state) {
      case 'LONG':
        return Colors.greenAccent;
      case 'SHORT':
        return Colors.redAccent;
      case 'BLOCK':
        return Colors.grey;
      default:
        return Colors.blueGrey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: _color(), width: 6),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(state, style: TextStyle(fontSize: 18, color: _color())),
          const SizedBox(height: 8),
          Text('$probability%',
              style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
