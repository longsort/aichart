
import 'dart:async';
class ConsensusSignal {
  final double score;
  final String dir;
  ConsensusSignal(this.score,this.dir);
}
class ConsensusEngine {
  final _c=StreamController<ConsensusSignal>.broadcast();
  Stream<ConsensusSignal> get stream=>_c.stream;
  void update(double s){
    if(s>70)_c.add(ConsensusSignal(s,'LONG'));
    else if(s<30)_c.add(ConsensusSignal(s,'SHORT'));
    else _c.add(ConsensusSignal(s,'WAIT'));
  }
}
