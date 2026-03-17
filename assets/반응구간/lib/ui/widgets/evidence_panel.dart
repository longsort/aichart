
import 'package:flutter/material.dart';
import 'evidence_gauge.dart';

class EvidencePanel extends StatelessWidget{
 final Map<String,double> values;
 const EvidencePanel({super.key,required this.values});

 @override Widget build(c)=>GridView.count(
  shrinkWrap:true,
  physics:const NeverScrollableScrollPhysics(),
  crossAxisCount:2,
  childAspectRatio:4,
  children:values.entries.map((e)=>EvidenceGauge(label:e.key,value:e.value)).toList(),
 );
}
