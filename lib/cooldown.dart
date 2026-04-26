
class CooldownGate {
  final int ms;
  int _last = 0;

  CooldownGate({this.ms = 1200});

  bool allow() {
    final now = DateTime.now().millisecondsSinceEpoch;
    if (now - _last >= ms) {
      _last = now;
      return true;
    }
    return false;
  }
}
