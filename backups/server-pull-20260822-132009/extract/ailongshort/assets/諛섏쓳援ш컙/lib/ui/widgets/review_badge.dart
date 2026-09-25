
import 'package:flutter/material.dart';

class ReviewBadge extends StatelessWidget{
  final String text;
  const ReviewBadge(this.text,{super.key});
  @override
  Widget build(BuildContext c){
    return Container(
      margin: const EdgeInsets.only(top:6),
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.35),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: Text(text, style: const TextStyle(color: Colors.white70,fontSize:12)),
    );
  }
}
