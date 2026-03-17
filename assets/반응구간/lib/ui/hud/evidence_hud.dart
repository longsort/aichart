
import 'package:flutter/material.dart';

class EvidenceHud extends StatelessWidget{
  final Map<String,double> e;
  const EvidenceHud({super.key, required this.e});

  @override
  Widget build(BuildContext context){
    return Column(
      children: e.entries.map((x){
        final v = x.value;
        final c = v>0.7?Colors.greenAccent:v<0.3?Colors.redAccent:Colors.orangeAccent;
        return Padding(
          padding: const EdgeInsets.symmetric(vertical:2),
          child: Row(children:[
            SizedBox(width:70, child: Text(x.key, style: TextStyle(color:c,fontSize:11))),
            Expanded(child: LinearProgressIndicator(
              value: v,
              minHeight: 6,
              backgroundColor: Colors.white12,
              valueColor: AlwaysStoppedAnimation(c),
            ))
          ]),
        );
      }).toList(),
    );
  }
}
