
import 'package:flutter/material.dart';
import '../../engine/zone/zone_score_engine.dart';

class ZoneGaugeCard extends StatelessWidget{
  final double price;
  final ZoneScore s;
  const ZoneGaugeCard({super.key, required this.price, required this.s});

  @override
  Widget build(BuildContext context){
    return Container(
      padding: const EdgeInsets.all(10),
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.25),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(price.toStringAsFixed(0),
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          _bar('지지', s.support/100),
          const SizedBox(height: 6),
          _bar('저항', s.resist/100),
          const SizedBox(height: 6),
          _bar('뚫림', s.breakRisk/100),
        ],
      ),
    );
  }

  Widget _bar(String t, double v){
    return Row(children: [
      SizedBox(width: 40, child: Text(t, style: const TextStyle(color: Colors.white70, fontSize: 11))),
      Expanded(child: LinearProgressIndicator(
        value: v.clamp(0.0,1.0),
        minHeight: 8,
        backgroundColor: Colors.white12,
      )),
      const SizedBox(width: 8),
      SizedBox(width: 42, child: Text('${(v*100).toStringAsFixed(0)}',
        textAlign: TextAlign.right,
        style: const TextStyle(color: Colors.white70, fontSize: 11),
      )),
    ]);
  }
}
