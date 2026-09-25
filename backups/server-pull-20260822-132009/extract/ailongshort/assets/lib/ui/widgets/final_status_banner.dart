
import 'package:flutter/material.dart';

class FinalStatusBanner extends StatelessWidget {
  final String text;
  const FinalStatusBanner(this.text,{super.key});

  @override
  Widget build(BuildContext context){
    return Container(
      margin: const EdgeInsets.only(bottom:8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.greenAccent.withOpacity(0.15),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.greenAccent.withOpacity(0.4)),
      ),
      child: Row(
        children: [
          const Icon(Icons.check_circle,color: Colors.greenAccent),
          const SizedBox(width:8),
          Expanded(child: Text(text,style: const TextStyle(color: Colors.greenAccent,fontWeight: FontWeight.w700))),
        ],
      ),
    );
  }
}
