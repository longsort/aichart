
import 'dart:async';
import 'consensus_engine.dart';
class AutoTradeLoop{
 double? entry,tp,sl,price;
 final _c=StreamController<String>.broadcast();
 Stream<String> get stream=>_c.stream;
 AutoTradeLoop(ConsensusEngine ce){
  ce.stream.listen((s){
    if(entry==null && s.dir!='WAIT'){
      entry=price; tp=entry!+300; sl=entry!-300;
      _c.add('ENTRY');
    }
  });
 }
 void onPrice(double p){
  price=p;
  if(entry!=null){
    if(p>=tp!){_c.add('TP'); entry=null;}
    else if(p<=sl!){_c.add('SL'); entry=null;}
  }
 }
}
