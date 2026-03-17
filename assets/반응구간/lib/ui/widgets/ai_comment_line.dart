import 'package:flutter/material.dart';

class AiCommentLine extends StatelessWidget {
  final String text;

  const AiCommentLine({super.key, required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0x22FFFFFF)),
        color: const Color(0x11000000),
      ),
      child: Text(
        text,
        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900),
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
      ),
    );
  }
}
