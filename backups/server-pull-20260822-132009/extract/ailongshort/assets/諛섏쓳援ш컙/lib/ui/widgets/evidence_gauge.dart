
import 'package:flutter/material.dart';

class EvidenceGauge extends StatelessWidget{
 final String label;
 final double value;
 const EvidenceGauge({super.key,required this.label,required this.value});

 @override Widget build(c){
  final color = value>0.7?Colors.greenAccent:value<0.3?Colors.redAccent:Colors.orangeAccent;
  return Column(children:[
    Text(label,style:TextStyle(color:color,fontSize:12)),
    const SizedBox(height:4),
    LinearProgressIndicator(
      value:value,
      minHeight:8,
      backgroundColor:Colors.white10,
      valueColor:AlwaysStoppedAnimation(color),
    )
  ]);
 }
}
