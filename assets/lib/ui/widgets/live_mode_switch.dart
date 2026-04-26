
import 'package:flutter/material.dart';

class LiveModeSwitch extends StatelessWidget{
  final bool live;
  final VoidCallback onToggle;
  const LiveModeSwitch({required this.live, required this.onToggle, super.key});
  @override
  Widget build(BuildContext c){
    return Row(
      children:[
        const Text('실전 모드', style: TextStyle(color: Colors.white70)),
        Switch(value: live, onChanged: (_)=>onToggle()),
      ],
    );
  }
}
