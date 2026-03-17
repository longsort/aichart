
import 'dart:async';

class HubTick {
  final Map<String,double> evidence;
  final double longScore;
  final double shortScore;
  final bool collecting;
  HubTick(this.evidence,this.longScore,this.shortScore,this.collecting);
}

final CentralHub centralHub = CentralHub();

class CentralHub {
  final _c = StreamController<HubTick>.broadcast();
  Stream<HubTick> get stream => _c.stream;

  final Map<String,double> _e = {
    '세력':0,'거래량':0,'구조':0,'FVG':0,'유동성':0,
    '펀딩':0,'고래':0,'온체인':0,'거시':0,'AI오차':0,
  };

  void push(String k,double v){
    _e[k]=v.clamp(0.0,1.0);
    final avg=_e.values.reduce((a,b)=>a+b)/_e.length;
    _c.add(HubTick(Map.from(_e), avg, 1-avg, true));
  }
}
