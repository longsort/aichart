
import 'dart:async';
import '../pipe/evidence_pipe.dart';

class Evidence10Collector {
  final EvidencePipe pipe;
  Timer? _t;

  Evidence10Collector(this.pipe);

  void start(){
    _t = Timer.periodic(const Duration(seconds:1), (_) {
      // NOTE: replace mock with real metrics progressively
      pipe.push('세력', _norm(_wave()));
      pipe.push('거래량', _norm(_vol()));
      pipe.push('구조', _norm(_struct()));
      pipe.push('FVG', _norm(_fvg()));
      pipe.push('유동성', _norm(_liq()));
      pipe.push('펀딩', _norm(_fund()));
      pipe.push('고래', _norm(_whale()));
      pipe.push('온체인', _norm(_chain()));
      pipe.push('거시', _norm(_macro()));
      pipe.push('AI오차', _norm(_err()));
    });
  }

  void stop(){ _t?.cancel(); }

  double _norm(double v)=>v.clamp(0.0,1.0);

  // --- placeholders (hook points) ---
  double _wave()=>DateTime.now().millisecond%100/100;
  double _vol()=>((DateTime.now().second*7)%100)/100;
  double _struct()=>((DateTime.now().second*5)%100)/100;
  double _fvg()=>((DateTime.now().second*3)%100)/100;
  double _liq()=>((DateTime.now().second*9)%100)/100;
  double _fund()=>((DateTime.now().second*4)%100)/100;
  double _whale()=>((DateTime.now().second*8)%100)/100;
  double _chain()=>((DateTime.now().second*6)%100)/100;
  double _macro()=>((DateTime.now().second*2)%100)/100;
  double _err()=>((DateTime.now().second*1)%100)/100;
}
