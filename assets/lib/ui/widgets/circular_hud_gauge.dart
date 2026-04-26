
import 'package:flutter/material.dart';
import 'dart:math';

class CircularHudGauge extends StatelessWidget{
 final double value;
 const CircularHudGauge({super.key,required this.value});

 @override Widget build(c){
  final color = value>0.7?Colors.greenAccent:value<0.3?Colors.redAccent:Colors.orangeAccent;
  return SizedBox(
    width:120,height:120,
    child:CustomPaint(painter:_P(value,color)),
  );
 }
}

class _P extends CustomPainter{
 final double v; final Color c;
 _P(this.v,this.c);
 @override void paint(Canvas canvas, Size s){
  final p=Paint()
    ..color=c.withOpacity(.2)
    ..style=PaintingStyle.stroke
    ..strokeWidth=8;
  canvas.drawCircle(s.center(Offset.zero), s.width/2-6, p);
  final arc=Paint()
    ..color=c
    ..style=PaintingStyle.stroke
    ..strokeWidth=8
    ..strokeCap=StrokeCap.round;
  canvas.drawArc(
    Rect.fromLTWH(6,6,s.width-12,s.height-12),
    -pi/2,
    2*pi*v,
    false,
    arc,
  );
 }
 @override bool shouldRepaint(_)=>true;
}
