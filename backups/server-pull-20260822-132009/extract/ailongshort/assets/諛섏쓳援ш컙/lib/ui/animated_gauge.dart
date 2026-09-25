
import 'package:flutter/material.dart';

class AnimatedGauge extends StatelessWidget{
 final double value; final Color color; final String label;
 const AnimatedGauge({super.key,required this.value,required this.color,required this.label});

 @override Widget build(c)=>Column(
  children:[
   Text(label,style:TextStyle(color:color,fontSize:16)),
   const SizedBox(height:6),
   TweenAnimationBuilder<double>(
    tween:Tween(begin:0,end:value),
    duration:const Duration(milliseconds:400),
    builder:(c,v,_)=>LinearProgressIndicator(
      value:v,
      minHeight:12,
      backgroundColor:Colors.white12,
      valueColor:AlwaysStoppedAnimation(color),
    ),
   )
  ],
 );
}
