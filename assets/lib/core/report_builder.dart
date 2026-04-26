import '../data/snapshot/engine_snapshot.dart';
import '../engine/evidence/evidence_live_hub.dart';

/// 초보용 자동 리포트 (고정 포맷)
/// - 1) 지금 뭐냐(롱/숏/중립)
/// - 2) 가능/주의/금지
/// - 3) 근거 3줄
/// - 4) 한 줄 결론
class ReportBuilder {
  ReportBuilder._();
  static final ReportBuilder I = ReportBuilder._();

  String build(EngineSnapshot s) {
    final dir = s.bias > 0.10 ? '롱' : (s.bias < -0.10 ? '숏' : '중립');
    final st = s.state == TradeState.allow ? '가능' : (s.state == TradeState.caution ? '주의' : '금지');
    final cons = (s.consensus * 100).round();
    final conf = (s.confidence * 100).round();

    final reasons = _topReasons3();
    final conclusion = _conclusion(dir, st, cons, conf);

    return [
      '지금: $dir',
      '상태: $st  |  합의 $cons%  |  신뢰 $conf%',
      '근거1: ${reasons[0]}',
      '근거2: ${reasons[1]}',
      '근거3: ${reasons[2]}',
      '결론: $conclusion',
    ].join('\n');
  }

  List<String> _topReasons3() {
    String pretty(String key) {
      switch (key) {
        case 'pwr':
          return '매수/매도 힘';
        case 'whale':
          return '큰손 움직임';
        case 'vol':
          return '거래량 힘';
        case 'pat':
          return '패턴 근거';
        case 'liq':
          return '청산/급변';
        case 'fund':
          return '펀딩';
        case 'sent':
          return '분위기';
        default:
          return key.toUpperCase();
      }
    }

    final live = EvidenceLiveHub.I.items.value;
    if (live.isEmpty) return ['수집중', '수집중', '수집중'];

    final list = List<EvidenceLive>.from(live);
    list.sort((a, b) => (b.score - 50).abs().compareTo((a.score - 50).abs()));
    final top = list.take(3).toList();

    String line(EvidenceLive e) {
      final d = e.dir == 'LONG' ? '롱' : (e.dir == 'SHORT' ? '숏' : '중립');
      return '${pretty(e.key)} • 점수 ${e.score.round()} • 방향 $d';
    }

    final lines = top.map(line).toList();
    while (lines.length < 3) {
      lines.add('수집중');
    }
    return lines;
  }

  String _conclusion(String dir, String st, int cons, int conf) {
    if (st == '금지') return '조건 부족 → 진입 금지';
    if (st == '주의') return '조건 약함 → 관망/소액';
    // 가능
    if (conf >= 70 && cons >= 55) return '$dir 방향 우세 → 진입 가능';
    if (conf >= 60 && cons >= 50) return '$dir 가능하지만 약함 → 조심';
    return '가능이지만 애매 → 관망 권장';
  }
}
