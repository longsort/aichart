
import 'package:flutter/material.dart';
class BtcHeader extends StatelessWidget{
 final double price; final bool up;
 const BtcHeader({super.key,required this.price,required this.up});
 @override Widget build(c)=>Container(
  height:48,color:Colors.black,alignment:Alignment.center,
  child:Text('BTC ${price.toStringAsFixed(1)}',
   style:TextStyle(color:up?Colors.green:Colors.red,fontSize:20,fontWeight:FontWeight.bold)));
}
