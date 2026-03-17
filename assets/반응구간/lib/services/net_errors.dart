class NetBlockedException implements Exception {
  final String message;
  const NetBlockedException(this.message);
  @override
  String toString() => message;
}

bool isDnsFail(Object e) {
  final s = e.toString().toLowerCase();
  return s.contains('failed host lookup') ||
      s.contains('no address associated with hostname') ||
      s.contains('errno = 7') ||
      s.contains('errno=7');
}