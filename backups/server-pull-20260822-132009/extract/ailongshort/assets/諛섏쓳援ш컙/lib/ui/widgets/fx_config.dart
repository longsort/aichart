class FxConfig {
  // 기본값: 과한 배경 연출(빙빙/매트릭스)을 끄고, 필요할 때만 상단 토글로 켭니다.
  static bool showMode = false;
  static double intensity = 0.8;

  /// FX 배경 스타일
  /// 0: Laser (기본)
  /// 1: Matrix Rain (비주얼 강)
  /// 2: Nebula (부드러운 글로우)
  static int mode = 1;
}
