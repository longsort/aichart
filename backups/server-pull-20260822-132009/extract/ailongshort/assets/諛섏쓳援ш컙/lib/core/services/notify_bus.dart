import 'dart:async';

class NotifyBus {
  static final _c = StreamController<String>.broadcast();
  static Stream<String> get stream => _c.stream;
  static void push(String msg) => _c.add(msg);
}
