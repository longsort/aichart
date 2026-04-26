
import 'package:flutter/material.dart';

class HudHelp extends StatelessWidget{
 const HudHelp({super.key});
 @override Widget build(c)=>Scaffold(
  appBar:AppBar(title:const Text('Fulink HUD 설명서')),
  body:const Padding(
    padding:EdgeInsets.all(16),
    child:Text(
    '• 상단 BTCUSDT: 실시간 가격/연결상태\n'
    '• 증거10: 실제 수집중인 근거들\n'
    '• 합의도: 증거 평균\n'
    '• LONG/SHORT: 방향 우세\n'
    '• 기준 55% 이상만 진입 고려'
    )));
}
