import 'dart:collection';

class HistoryBuf {
  final int capacity;
  final Queue<double> _q = Queue<double>();

  HistoryBuf({this.capacity = 32});

  List<double> get values => List.unmodifiable(_q);

  void add(double v) {
    final x = v.isNaN ? 0.5 : v.clamp(0.0, 1.0);
    _q.addLast(x);
    while (_q.length > capacity) {
      _q.removeFirst();
    }
  }
}
