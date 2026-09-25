
// Bitget WebSocket STUB
// TODO: replace with official WS endpoint
// This stub proves live pipeline hookup point.
import 'dart:async';

class BitgetWsStub {
  final _controller = StreamController<double>.broadcast();
  Stream<double> get priceStream => _controller.stream;

  Timer? _t;
  double _price = 90000;

  void connect() {
    _t = Timer.periodic(const Duration(seconds: 1), (_) {
      _price += (_price % 2 == 0 ? 5 : -3);
      _controller.add(_price);
    });
  }

  void dispose() {
    _t?.cancel();
    _controller.close();
  }
}
