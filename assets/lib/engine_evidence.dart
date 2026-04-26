enum Signal { enter, watch, wait }

class EngineResult {
  final double confidence; // 0..1
  final int evidence;      // 0..6
  final Signal signal;
  final int lock; // stabilizer remaining ticks
  EngineResult(this.confidence, this.evidence, this.signal, this.lock);

  String labelKo() => signal == Signal.enter ? "진입" : (signal == Signal.wait ? "대기" : "관망");
  String labelZh() => signal == Signal.enter ? "入场" : (signal == Signal.wait ? "等待" : "观望");
  String labelEn() => signal == Signal.enter ? "ENTER" : (signal == Signal.wait ? "WAIT" : "WATCH");
}

class EvidenceEngine {
  int _lock = 0;
  Signal _sig = Signal.watch;

  EngineResult run(List<double> ev) {
    final weights = [0.22,0.20,0.18,0.14,0.14,0.12];
    double s = 0;
    for (int i=0;i<ev.length;i++) {
      s += ev[i] * weights[i];
    }
    s = s.clamp(0.0,1.0);
    final cnt = ev.where((e)=>e>=0.6).length;

    if (_lock > 0) {
      _lock--;
    } else {
      if (s >= 0.78 && cnt >= 4) {
        _sig = Signal.enter;
        _lock = 3;
      } else if (s <= 0.35) {
        _sig = Signal.wait;
        _lock = 2;
      } else {
        _sig = Signal.watch;
      }
    }
    return EngineResult(s, cnt, _sig, _lock);
  }
}
