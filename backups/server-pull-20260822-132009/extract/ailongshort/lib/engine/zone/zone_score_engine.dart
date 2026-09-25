
import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/foundation.dart';

class ZoneScore {
  final double support; // 0~100
  final double resist;  // 0~100
  final double breakRisk; // 0~100
  const ZoneScore(this.support,this.resist,this.breakRisk);
}

class ZoneScoreEngine {
  static final ValueNotifier<Map<double,ZoneScore>> scores = ValueNotifier({});
  static Timer? _t;

  static double Function()? currentPrice;
  static double Function(double p)? bidWallNear;
  static double Function(double p)? askWallNear;
  static double Function(double p)? tradeImbNear;  // -1~+1
  static double Function(double p)? reactionNear;  // -1~+1

  static void start(List<double> zones){
    _t?.cancel();
    _t = Timer.periodic(const Duration(milliseconds: 900), (_) {
      final cp = (currentPrice?.call() ?? 0);
      final out = <double,ZoneScore>{};

      for(final p in zones){
        if(p<=0) continue;

        final bid = (bidWallNear?.call(p) ?? _demo(cp,p, 0.7));
        final ask = (askWallNear?.call(p) ?? _demo(cp,p, 0.6));
        final imb = (tradeImbNear?.call(p) ?? _demoImb(cp,p));
        final rea = (reactionNear?.call(p) ?? _demoRea(cp,p));

        final sup = _clamp100( 40*bid + 30*((imb+1)/2) + 30*((rea+1)/2) );
        final res = _clamp100( 40*ask + 30*(((-imb)+1)/2) + 30*(((-rea)+1)/2) );

        final pressure = _clamp01(0.5 + 0.25*(-rea) + 0.25*(-imb));
        final wall = _clamp01(0.55* (cp>=p? bid : ask) + 0.45*(cp>=p? ask : bid));
        final br = _clamp100( 80*pressure + 20*(1-wall) );

        out[p]=ZoneScore(sup,res,br);
      }
      scores.value = out;
    });
  }

  static void stop(){ _t?.cancel(); }

  static double _clamp01(double x)=>x.clamp(0.0,1.0);
  static double _clamp100(double x)=>x.clamp(0.0,100.0);

  static double _demo(double cp,double p,double base){
    final d = (cp==0)?0.5:(1 - ((cp-p).abs()/(p*0.006)).clamp(0.0,1.0));
    return _clamp01(base*0.6 + d*0.4);
  }
  static double _demoImb(double cp,double p){
    final s = math.sin(DateTime.now().millisecond/220.0 + (p%1000)/1000.0);
    return s.clamp(-1.0,1.0);
  }
  static double _demoRea(double cp,double p){
    final c = math.cos(DateTime.now().millisecond/260.0 + (p%777)/777.0);
    return c.clamp(-1.0,1.0);
  }
}
