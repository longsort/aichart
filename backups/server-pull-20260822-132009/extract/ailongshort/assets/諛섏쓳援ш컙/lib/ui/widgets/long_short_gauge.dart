
import 'package:flutter/material.dart';

class LongShortGauge extends StatelessWidget{
 final double longScore;
 final double shortScore;
 const LongShortGauge({super.key,required this.longScore,required this.shortScore});

 @override Widget build(c)=>Column(children:[
  Text('LONG / SHORT',style:TextStyle(color:Colors.white70)),
  const SizedBox(height:8),
  LinearProgressIndicator(
    value:longScore,
    minHeight:10,
    backgroundColor:Colors.red.withOpacity(.2),
    valueColor:AlwaysStoppedAnimation(Colors.greenAccent),
  ),
  const SizedBox(height:4),
  LinearProgressIndicator(
    value:shortScore,
    minHeight:10,
    backgroundColor:Colors.green.withOpacity(.2),
    valueColor:AlwaysStoppedAnimation(Colors.redAccent),
  ),
 ]);
}
