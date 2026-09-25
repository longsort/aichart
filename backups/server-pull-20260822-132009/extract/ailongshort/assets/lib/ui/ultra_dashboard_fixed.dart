
import 'package:flutter/material.dart';
import '../core/consensus_engine.dart';
import '../core/bitget_price_service.dart';
import '../core/auto_trade_loop.dart';

class UltraDashboard extends StatefulWidget{
 const UltraDashboard({super.key});
 @override State<UltraDashboard> createState()=>_S();
}

class _S extends State<UltraDashboard>{
 final priceSvc=BitgetPriceService();
 final consensus=ConsensusEngine();
 late AutoTradeLoop loop;

 double last=0;
 bool up=true;
 String status='WAIT';

 @override void initState(){
  super.initState();
  loop=AutoTradeLoop(consensus);
  priceSvc.start();

  priceSvc.stream.listen((p){
    if(!mounted) return;
    up=p>=last;
    last=p;
    consensus.update((p%100));
    loop.onPrice(p);
    setState((){});
  });

  loop.stream.listen((s){
    if(!mounted) return;
    status=s;
    setState((){});
  });
 }

 @override Widget build(c){
  return Scaffold(
   backgroundColor:Colors.black,
   body:SafeArea(
    child:SingleChildScrollView(
     physics:const AlwaysScrollableScrollPhysics(),
     child:ConstrainedBox(
      constraints:BoxConstraints(minHeight:MediaQuery.of(c).size.height),
      child:Column(
       crossAxisAlignment:CrossAxisAlignment.stretch,
       children:[
        const SizedBox(height:12),
        Center(child:Text(
         'BTC ${last.toStringAsFixed(1)}',
         style:TextStyle(
          color:up?Colors.greenAccent:Colors.redAccent,
          fontSize:20,fontWeight:FontWeight.bold),
        )),
        const SizedBox(height:24),
        Center(child:Text(
         status,
         style:const TextStyle(color:Colors.white,fontSize:28,fontWeight:FontWeight.bold),
        )),
        const SizedBox(height:400), // 화면 소실 방지 spacer
       ],
      ),
     ),
    ),
   ),
  );
 }
}
