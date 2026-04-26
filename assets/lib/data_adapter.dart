// 실데이터 연결용 어댑터(구조 고정). 자동매매 없음.
class WhaleSnapshot {
  final double cvd;     // -1..1
  final double volume;  // 0..1
  final DateTime time;
  WhaleSnapshot(this.cvd, this.volume, this.time);
}

abstract class WhaleDataSource {
  Future<WhaleSnapshot> fetch();
}

// MOCK (실제 API 연결 시 이 클래스만 교체)
class MockWhaleSource implements WhaleDataSource {
  @override
  Future<WhaleSnapshot> fetch() async {
    await Future.delayed(const Duration(milliseconds: 300));
    return WhaleSnapshot(0.42, 0.67, DateTime.now());
  }
}
