
import 'dart:async';

class EvidenceTick {
  final String name;
  final double value;
  EvidenceTick(this.name,this.value);
}

class EvidencePipe {
  final _c = StreamController<EvidenceTick>.broadcast();
  Stream<EvidenceTick> get stream => _c.stream;
  void push(String name,double v){ _c.add(EvidenceTick(name,v)); }
}
