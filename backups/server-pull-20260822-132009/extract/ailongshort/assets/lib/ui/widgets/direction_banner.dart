
import 'package:flutter/material.dart';

class DirectionBanner extends StatelessWidget {
  final String direction;
  const DirectionBanner({super.key, required this.direction});

  Color get c {
    if (direction.contains('오르는')) return Colors.greenAccent;
    if (direction.contains('내리는')) return Colors.redAccent;
    return Colors.grey;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: c.withOpacity(0.15),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: c),
      ),
      child: Text(
        direction,
        textAlign: TextAlign.center,
        style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: c),
      ),
    );
  }
}
