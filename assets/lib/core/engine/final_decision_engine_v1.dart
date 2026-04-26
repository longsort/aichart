import '../models/fu_state.dart';

enum FinalPhase { ready, alert, confirm } // 준비/경고/확정

class FinalDecision {
  final String decision; // '롱 대기' / '숏 유효' / '관망'
  final String colorKey; // 'long'/'short'/'neutral'
  final FinalPhase phase;
  final String oneLine; // 사람 말투 1줄
  final String structureLine; // 구조
  final String patternLine;   // 패턴
  final String waveLine;      // 파동
  final int longPct;
  final int shortPct;
  final List<String> actions3;
  final String riskLine;
  final String priceBubble; // 지지 위/저항 아래/중앙
  final String pointUp; // 위 포인트(저항)
  final String pointDn; // 아래 포인트(지지)

  const FinalDecision({
    required this.decision,
    required this.colorKey,
    required this.phase,
    required this.oneLine,
    required this.structureLine,
    required this.patternLine,
    required this.waveLine,
    required this.longPct,
    required this.shortPct,
    required this.actions3,
    required this.riskLine,
    required this.priceBubble,
    required this.pointUp,
    required this.pointDn,
  });
}

class FinalDecisionEngineV1 {
  static FinalDecision build(FuState s, {double? priceOverride}) {
    final price = (priceOverride != null && priceOverride > 0) ? priceOverride : (s.price > 0 ? s.price : 0);
    final live = price;

    // 1) 기본 방향(확정 전): signalProb 기반으로 상대치 구성
    int longPct = 50;
    int shortPct = 50;
    if (s.signalDir == 'LONG') {
      longPct = s.signalProb.clamp(0, 100);
      shortPct = (100 - longPct).clamp(0, 100);
    } else if (s.signalDir == 'SHORT') {
      shortPct = s.signalProb.clamp(0, 100);
      longPct = (100 - shortPct).clamp(0, 100);
    } else {
      longPct = 50;
      shortPct = 50;
    }

    // 2) 가격 위치 말풍선(초보용)
    final hasSR = (s.s1 > 0 && s.r1 > 0);
    final bubble = _priceBubble(live, s.s1, s.r1, hasSR);

    // 3) 단계(준비/경고/확정)
    FinalPhase phase = FinalPhase.ready;

    final inReactBand = (s.reactLow > 0 && s.reactHigh > 0 && live >= s.reactLow && live <= s.reactHigh);
    final nearSupport = hasSR ? _nearPct(live, s.s1, 0.25) : false;
    final nearResist  = hasSR ? _nearPct(live, s.r1, 0.25) : false;

    if (s.locked) {
      phase = FinalPhase.ready;
    } else if (s.showSignal && s.expectedRoiPct >= 25.0 && s.evidenceHit >= 4 && (s.signalDir == 'LONG' || s.signalDir == 'SHORT')) {
      phase = FinalPhase.confirm;
    } else if (nearSupport || nearResist || inReactBand) {
      phase = FinalPhase.alert;
    } else {
      phase = FinalPhase.ready;
    }

    // 4) 최종 판단(롱/숏/관망)
    String decision = '관망';
    String colorKey = 'neutral';

    final diff = (longPct - shortPct).abs();

    if (s.locked) {
      decision = '관망';
      colorKey = 'neutral';
    } else if (phase == FinalPhase.confirm) {
      if (s.signalDir == 'LONG') { decision = '롱 대기'; colorKey = 'long'; }
      if (s.signalDir == 'SHORT') { decision = '숏 유효'; colorKey = 'short'; }
    } else {
      // 확정 전에는 “차이 < 10%”면 무조건 관망
      if (diff < 10) {
        decision = '관망';
        colorKey = 'neutral';
      } else {
        // 확정 전이라도 약간 우세는 표시(단, 관망 유지)
        decision = '관망';
        colorKey = 'neutral';
      }
    }

    // 5) 구조/패턴/파동(전문용어 금지, 쉬운 말)
    final structureLine = _structureKo(s);
    final patternLine = _patternKo(s, inReactBand, nearSupport, nearResist);
    final waveLine = _waveKo(s);

    // 6) 사람 말투 1줄(침묵 금지)
    final oneLine = _oneLineKo(s, decision, phase, inReactBand, nearSupport, nearResist, diff);

    // 7) 행동 3개(항상 3개)
    final actions3 = _actions3(decision);

    // 8) 리스크 1줄
    final riskLine = _riskLine(s, decision);

    // 포인트 2개(숫자는 표시해도 됨)
    final pointUp = (s.r1 > 0) ? _fmt(s.r1) : (s.reactHigh > 0 ? _fmt(s.reactHigh) : '-');
    final pointDn = (s.s1 > 0) ? _fmt(s.s1) : (s.reactLow > 0 ? _fmt(s.reactLow) : '-');

    return FinalDecision(
      decision: decision,
      colorKey: colorKey,
      phase: phase,
      oneLine: oneLine,
      structureLine: structureLine,
      patternLine: patternLine,
      waveLine: waveLine,
      longPct: longPct,
      shortPct: shortPct,
      actions3: actions3,
      riskLine: riskLine,
      priceBubble: bubble,
      pointUp: pointUp,
      pointDn: pointDn,
    );
  }

  // Windows 빌드(특히 AOT)에서 num/double 혼용으로 타입 에러가 나지 않게
  // 입력을 num으로 받고 내부에서 double로 정규화한다.
  static bool _nearPct(num a, num b, num pct) {
    final da = a.toDouble();
    final db = b.toDouble();
    final dp = pct.toDouble();
    if (da <= 0 || db <= 0) return false;
    final d = (da - db).abs() / db * 100.0;
    return d <= dp;
  }

  static String _priceBubble(double p, double s1, double r1, bool hasSR) {
    if (!hasSR || p <= 0) return '중앙';
    final mid = (s1 + r1) / 2.0;
    if (p <= mid) return '지지 위';
    return '저항 아래';
  }

  static String _structureKo(FuState s) {
    // RANGE/CHOCH/BOS 같은 용어는 숨기고 쉬운 표현만
    if (s.structureTag == 'RANGE') return '구조: 박스 구간';
    if (s.structureTag.contains('UP')) return '구조: 위쪽 시도 구간';
    if (s.structureTag.contains('DN')) return '구조: 아래쪽 시도 구간';
    return '구조: 확인 중';
  }

  static String _patternKo(FuState s, bool inBand, bool nearS, bool nearR) {
    if (inBand) return '패턴: 반응 구간 진입';
    if (nearS) return '패턴: 지지 확인 중';
    if (nearR) return '패턴: 저항 확인 중';
    return '패턴: 힘 모으는 중';
  }

  static String _waveKo(FuState s) {
    // risk/score 기반으로 단순화
    if (s.risk >= 70) return '파동: 흔들림 가능성 큼';
    if (s.confidence >= 70) return '파동: 방향이 잡히는 중';
    return '파동: 방향이 아직 약함';
  }

  static String _phaseKo(FinalPhase p) {
    switch (p) {
      case FinalPhase.ready: return '준비';
      case FinalPhase.alert: return '경고';
      case FinalPhase.confirm: return '확정';
    }
  }

  static String _oneLineKo(FuState s, String decision, FinalPhase phase, bool inBand, bool nearS, bool nearR, int diff) {
    if (s.locked && s.lockedReason.isNotEmpty) {
      return '지금은 거래가 어려워요: ${s.lockedReason}';
    }

    final phaseKo = _phaseKo(phase);

    if (decision == '롱 대기') {
      if (nearS) return '아래 지지가 버티는 중이라, 위로 다시 시도할 준비가 된 상태예요. ($phaseKo)';
      if (inBand) return '반응 구간에서 버티는지 확인 중이에요. ($phaseKo)';
      return '위쪽 가능성을 보고 있지만, 자리 확인이 먼저예요. ($phaseKo)';
    }

    if (decision == '숏 유효') {
      if (nearR) return '위에서 막히는 흐름이라, 아래로 밀릴 가능성이 커요. ($phaseKo)';
      return '아래로 더 밀릴 수 있어, 되돌림을 기다리는 게 좋아요. ($phaseKo)';
    }

    // 관망
    if (diff < 10) return '방향이 아직 거의 없어서, 지금은 기다리는 게 유리해요. ($phaseKo)';
    if (nearS || nearR || inBand) return '자리는 가까워졌지만, 확정 근거가 부족해요. ($phaseKo)';
    return '지금은 가운데 구간이라, 지지·저항 쪽으로 갈 때까지 기다려요. ($phaseKo)';
  }

  static List<String> _actions3(String decision) {
    if (decision == '롱 대기') {
      return const [
        '지지 반응 확인하며 대기 (추천)',
        '반등 확인 시 소액 롱 시도',
        '지지 이탈 시 관망 전환',
      ];
    }
    if (decision == '숏 유효') {
      return const [
        '되돌림 대기 후 숏 시도 (추천)',
        '강한 반등이면 관망 유지',
        '다시 박스 진입 시 판단 무효',
      ];
    }
    return const [
      '관망 유지 (추천)',
      '지지·저항 도달 시 재확인',
      '시간대 변경',
    ];
  }

  static String _riskLine(FuState s, String decision) {
    if (s.locked) return '지금은 무리하지 않는 게 좋아요.';
    if (decision == '관망') return '지금 진입하면 손익 대비 위험이 커요.';
    if (decision == '롱 대기') return '지지 아래로 내려가면 판단이 무효가 돼요.';
    return '강한 반등이 나오면 숏은 위험해져요.';
  }

  static String _fmt(double v) {
    if (v <= 0) return '-';
    // 정수로 보기 좋게
    return v.toStringAsFixed(0);
  }
}
