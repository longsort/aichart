import 'package:flutter/material.dart';

class RealtimePriceText extends StatelessWidget {
  final double price;
  final String symbol;

  const RealtimePriceText({super.key, required this.price, required this.symbol});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Text('실시간 ', style: TextStyle(fontSize: 11, color: Colors.white54)),
        Text(symbol, style: const TextStyle(fontSize: 11, color: Colors.white54)),
        const SizedBox(width: 6),
        Text(price.toStringAsFixed(1),
            style: const TextStyle(fontSize: 12, color: Colors.white, fontWeight: FontWeight.w700)),
      ],
    );
  }
}
