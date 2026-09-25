
import 'package:flutter/material.dart';

class LongShortHud extends StatelessWidget{
  final double longP;
  final double shortP;
  const LongShortHud({super.key, required this.longP, required this.shortP});

  @override
  Widget build(BuildContext context){
    return Column(children:[
      Text('?ÅÏäπ ${(longP*100).toStringAsFixed(1)}%', style: TextStyle(color:Colors.greenAccent)),
      LinearProgressIndicator(value: longP, valueColor: AlwaysStoppedAnimation(Colors.greenAccent)),
      const SizedBox(height:6),
      Text('?òÎùΩ ${(shortP*100).toStringAsFixed(1)}%', style: TextStyle(color:Colors.redAccent)),
      LinearProgressIndicator(value: shortP, valueColor: AlwaysStoppedAnimation(Colors.redAccent)),
    ]);
  }
}
