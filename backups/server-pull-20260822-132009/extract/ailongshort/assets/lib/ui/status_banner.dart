
import 'package:flutter/material.dart';

class StatusBanner extends StatelessWidget{
 final String status;
 const StatusBanner({super.key,required this.status});

 Color get c{
  switch(status){
   case 'TP': return Colors.greenAccent;
   case 'SL': return Colors.redAccent;
   case 'ENTRY': return Colors.blueAccent;
   case 'WAIT': return Colors.grey;
   default: return Colors.white;
  }
 }

 @override Widget build(c)=>Container(
  margin:const EdgeInsets.all(12),
  padding:const EdgeInsets.all(12),
  decoration:BoxDecoration(
    color:c.withOpacity(.15),
    borderRadius:BorderRadius.circular(12),
    border:Border.all(color:c)),
  child:Row(mainAxisAlignment:MainAxisAlignment.center,
    children:[Text(status,style:TextStyle(color:c,fontSize:22,fontWeight:FontWeight.bold))]));
}
