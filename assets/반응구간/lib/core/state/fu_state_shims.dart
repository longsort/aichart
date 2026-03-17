
extension FuStateShims on FuState {
  String get symbol {
    try {
      // try common fields if exist
      // ignore: unnecessary_cast
      return (this as dynamic).market?.toString() ?? '';
    } catch (_) {
      return '';
    }
  }

  String get tfLabel {
    try {
      // ignore: unnecessary_cast
      return (this as dynamic).tf?.toString() ?? '';
    } catch (_) {
      return '';
    }
  }
}
