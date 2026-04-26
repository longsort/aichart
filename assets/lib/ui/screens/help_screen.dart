
import 'package:flutter/material.dart';

class HelpScreen extends StatelessWidget{
 const HelpScreen({super.key});

 @override Widget build(c)=>Scaffold(
  appBar:AppBar(title:const Text('Fulink Pro ULTRA 도움말')),
  body:ListView(
    padding:const EdgeInsets.all(16),
    children:const [
      Text('• BTCUSDT 연결: 실시간 가격 수신 여부'),
      SizedBox(height:8),
      Text('• 증거 10: 세력/거래량/구조/FVG/유동성/펀딩/고래/온체인/거시/AI오차'),
      SizedBox(height:8),
      Text('• 합의도: 증거 10의 평균 점수'),
      SizedBox(height:8),
      Text('• LONG/SHORT 게이지: 현재 방향 우세도'),
      SizedBox(height:8),
      Text('• 기준값 55% 이상만 진입 고려'),
    ],
  ),
 );
}
