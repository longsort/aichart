/// AI 모드 선택 서비스
///
/// - A 보수: 구조 우선(안전)
/// - B 균형: 기본
/// - C 공격: 패턴/유동성 우선(공격)
/// - 자동: 기본은 B로 동작(향후 통계 기반 자동 선택으로 확장)

enum AiMode { a, b, c, auto }

class AiModeService {
  static String label(AiMode m) {
    switch (m) {
      case AiMode.a:
        return 'A 보수';
      case AiMode.b:
        return 'B 균형';
      case AiMode.c:
        return 'C 공격';
      case AiMode.auto:
        return '자동';
    }
  }
}
