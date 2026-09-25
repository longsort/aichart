
import 'package:flutter/material.dart';

class ReasonLine extends StatelessWidget {
  final List<String> reasons;
  const ReasonLine({super.key, required this.reasons});

  @override
  Widget build(BuildContext context) {
    final text = reasons.isEmpty ? "분석중…" : "이유: ${reasons.join(' + ')}";
    return Text(
      text,
      textAlign: TextAlign.center,
      style: TextStyle(color: Colors.white.withOpacity(0.78), fontSize: 12, fontWeight: FontWeight.w700),
    );
  }
}
