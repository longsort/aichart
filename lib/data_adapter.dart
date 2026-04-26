// ?¤ë°?´í„° ?°ê²°???´ëŒ‘??êµ¬ì¡° ê³ ì •). ?ë™ë§¤ë§¤ ?†ìŒ.
class WhaleSnapshot {
  final double cvd;     // -1..1
  final double volume;  // 0..1
  final DateTime time;
  WhaleSnapshot(this.cvd, this.volume, this.time);
}

abstract class WhaleDataSource {
  Future<WhaleSnapshot> fetch();
}

// MOCK (?¤ì œ API ?°ê²° ?????´ë˜?¤ë§Œ êµì²´)
class MockWhaleSource implements WhaleDataSource {
  @override
  Future<WhaleSnapshot> fetch() async {
    await Future.delayed(const Duration(milliseconds: 300));
    return WhaleSnapshot(0.42, 0.67, DateTime.now());
  }
}
