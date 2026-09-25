
import 'package:flutter/material.dart';
import '../core/consensus_engine.dart';
import '../core/bitget_ws_price.dart';
import '../core/auto_trade_loop.dart';

class UltraDashboard extends StatefulWidget{
 const UltraDashboard({super.key});
 @override State<UltraDashboard> createState()=>_S();
}
class _S extends State<UltraDashboard>{
 final price=BitgetWsPrice();
 final consensus=ConsensusEngine();
 late AutoTradeLoop loop;
 double last=0; bool up=true; String status='WAIT';
 @override void initState(){
  super.initState();
  loop=AutoTradeLoop(consensus);
  price.connect();
  price.stream.listen((p){
    up=p>=last; last=p;
    consensus.update((p%100));
    loop.onPrice(p);
    setState((){});
  });
  loop.stream.listen((s){status=s; setState((){});});
 }
 @override Widget build(c)=>Scaffold(
  backgroundColor:Colors.black,
  body:Column(children:[
    Container(height:48,alignment:Alignment.center,
      child:Text('BTC ${last.toStringAsFixed(1)}',
      style:TextStyle(color:up?Colors.green:Colors.red,fontSize:20))),
    const SizedBox(height:20),
    Text(status,style:TextStyle(color:Colors.white,fontSize:28,fontWeight:FontWeight.bold))
  ]));
}
