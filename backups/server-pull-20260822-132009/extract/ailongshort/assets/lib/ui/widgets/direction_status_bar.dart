import 'package:flutter/material.dart';

class DirectionStatusBar extends StatelessWidget {
  final String direction;
  final bool loading;
  const DirectionStatusBar({super.key, required this.direction, this.loading=false});

  @override
  Widget build(BuildContext context) {
    final icon = direction == 'LONG'
        ? Icons.arrow_upward
        : direction == 'SHORT'
            ? Icons.arrow_downward
            : Icons.remove;
    return Container(
      padding: const EdgeInsets.all(8),
      child: Row(
        children: [
          Icon(icon, size: 18),
          const SizedBox(width: 6),
          Text(
            loading ? '$direction 수집중' : direction,
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }
}
