import 'package:flutter/material.dart';

class MiniAIPressure extends StatelessWidget {
  final double v; // -1 ~ 1
  const MiniAIPressure({super.key, required this.v});

  @override
  Widget build(BuildContext context) {
    final h = 80.0;
    return Container(
      width: 10,
      height: h,
      decoration: BoxDecoration(
        border: Border.all(color: Colors.white24),
        borderRadius: BorderRadius.circular(6),
      ),
      alignment: v >= 0 ? Alignment.bottomCenter : Alignment.topCenter,
      child: Container(
        width: 10,
        height: h * v.abs().clamp(0.05, 1.0),
        decoration: BoxDecoration(
          color: v >= 0 ? Colors.greenAccent : Colors.redAccent,
          borderRadius: BorderRadius.circular(6),
        ),
      ),
    );
  }
}