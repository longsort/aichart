
import '../models/fu_state.dart';
import '../utils/candle_close_util.dart';
import '../analysis/entry_planner.dart';
import '../settings/app_settings.dart';

class FuReporter {
  /// 반초보 톤: 쉬운 말 + 숫자(확률/근거) 충분히 포함
  static String build(FuState s, {
    required String symbol,
    required String tf,
    required bool locked,
    required String lockReason,
  }) {
    final dir = _dirKo(s.signalDir);
    final prob = s.signalProb.clamp(0, 100);
    final score = s.score.clamp(0, 100);
    final conf = s.confidence.clamp(0, 100);
    final risk = s.risk.clamp(0, 100);

    final hold = _supportHoldPct(s); // 지지 유지(추정)
    final breakp = 100 - hold;

    final now = _fmtPrice(s.price);
    final s1 = _fmtPrice(s.s1);
    final r1 = _fmtPrice(s.r1);
    final vwap = _fmtPrice(s.vwap);

    final rr = _rrApprox(s);

    final sb = StringBuffer();
    sb.writeln('【최종 분석 리포트(B: 반초보 톤)】');
    sb.writeln('심볼: $symbol   TF: $tf');
    sb.writeln('현재가: $now');
    sb.writeln('');

    sb.writeln('1) 결론(한 줄)');
    if (locked) {
      sb.writeln('- 상태: 거래금지(NO-TRADE)');
      sb.writeln('- 이유: ${lockReason.isEmpty ? '리스크/신뢰 조건 불충족' : lockReason}');
    } else {
      sb.writeln('- 상태: $dir (확률 ${prob}%)');
    }
    sb.writeln('');

    sb.writeln('2) 핵심 레벨');
    sb.writeln('- 지지(아래): $s1');
    sb.writeln('- 평균선(VWAP): $vwap');
    sb.writeln('- 저항(위): $r1');
    sb.writeln('');

    sb.writeln('3) 점수/신뢰/위험');
    sb.writeln('- 점수: $score / 100');
    sb.writeln('- 신뢰: $conf / 100');
    sb.writeln('- 위험: $risk / 100');
    sb.writeln('');

    sb.writeln('4) 지지 유지 vs 붕괴(추정)');
    sb.writeln('- 지지 유지 가능성: $hold%');
    sb.writeln('- 지지 붕괴 가능성: $breakp%');
    sb.writeln('  * 해석: 유지가 60%↑면 “방어 우세”, 붕괴가 60%↑면 “깨질 확률 우세”');
    sb.writeln('');

    sb.writeln('5) 근거(최대 5개)');
    final bullets = (s.signalBullets.isNotEmpty ? s.signalBullets : _fallbackBullets(s)).take(5).toList();
    if (bullets.isEmpty) {
      sb.writeln('- (근거 데이터 없음) SAFE 모드일 수 있음');
    } else {
      for (var i=0;i<bullets.length;i++) {
        sb.writeln('- ${i+1}) ${_humanize(bullets[i])}');
      }
    }
    sb.writeln('');

    sb.writeln('6) 초보 행동 가이드(규칙)');
    sb.writeln('- SL(손절) 먼저 정하고 들어가기. SL 없는 진입 금지.');
    sb.writeln('- RR 최소 1:2 이상만. (손절 1%면 목표 2% 이상)');
    sb.writeln('- 계좌 리스크 5% 고정. (감정매매 방지)');
    sb.writeln('- “마감(캔들 종료)” 전에는 확률을 낮게 보고 보수적으로.');
    sb.writeln('');

    sb.writeln('7) 참고 지표(간단)');
    sb.writeln('- 근거 충족: ${s.evidenceHit}/${s.evidenceTotal}');
    sb.writeln('- RR(대략): ${rr.toStringAsFixed(2)}');
    sb.writeln('');
    
    sb.writeln('8) 마감(캔들 종료) 체크');
    final i4 = CandleCloseUtil.evaluate(tfLabel: '4H', price: s.price, vwap: s.vwap, score: score, confidence: conf, risk: risk);
    final i1d = CandleCloseUtil.evaluate(tfLabel: '1D', price: s.price, vwap: s.vwap, score: score, confidence: conf, risk: risk);
    final i1w = CandleCloseUtil.evaluate(tfLabel: '1W', price: s.price, vwap: s.vwap, score: score, confidence: conf, risk: risk);
    final i1m = CandleCloseUtil.evaluate(tfLabel: '1M', price: s.price, vwap: s.vwap, score: score, confidence: conf, risk: risk);
    sb.writeln('- 4H: ${i4.verdict} (남은시간 ${CandleCloseUtil.fmtRemain(i4.remaining)})  / ${i4.reason}');
    sb.writeln('- 1D: ${i1d.verdict} (남은시간 ${CandleCloseUtil.fmtRemain(i1d.remaining)})  / ${i1d.reason}');
    sb.writeln('- 1W: ${i1w.verdict} (남은시간 ${CandleCloseUtil.fmtRemain(i1w.remaining)})  / ${i1w.reason}');
    sb.writeln('- 1M: ${i1m.verdict} (남은시간 ${CandleCloseUtil.fmtRemain(i1m.remaining)})  / ${i1m.reason}');
    sb.writeln('');

    sb.writeln('9) 진입 플랜(초보용)');
    final isLong = (s.decisionTitle.toLowerCase().contains('long') || s.decisionTitle.contains('롱'));
    final plan = EntryPlanner.plan(isLong: isLong, price: s.price, s1: s.s1, r1: s.r1, accountUsdt: AppSettings.accountUsdt, riskPct: AppSettings.riskPct);
    sb.writeln('- ENTRY: ${plan.entry.toStringAsFixed(1)}  / SL: ${plan.sl.toStringAsFixed(1)}');
    sb.writeln('- TP: ${plan.tp1.toStringAsFixed(1)} / ${plan.tp2.toStringAsFixed(1)} / ${plan.tp3.toStringAsFixed(1)}');
    sb.writeln('- RR: ${plan.rr1.toStringAsFixed(2)} / ${plan.rr2.toStringAsFixed(2)} / ${plan.rr3.toStringAsFixed(2)}');
    sb.writeln('- 추천 레버리지: ${plan.leverageRec.toStringAsFixed(0)}x  | 포지션: ${plan.qtyBtc.toStringAsFixed(4)} BTC  | 증거금: ${plan.marginUsdt.toStringAsFixed(2)} USDT');
    sb.writeln('');
sb.writeln('※ 본 리포트는 자동매매가 아니라 “분석+가이드”입니다. 100%는 없습니다.');

    return sb.toString();
  }

  static String _dirKo(String d) {
    final x = d.toUpperCase();
    if (x.contains('LONG')) return '롱(상승) 우세';
    if (x.contains('SHORT')) return '숏(하락) 우세';
    return '중립(관망)';
  }

  static String _fmtPrice(double v) {
    if (v.isNaN || v.isInfinite) return '-';
    // 정수처럼 보이면 소수 제거
    final iv = v.roundToDouble();
    if ((v - iv).abs() < 0.0001) return iv.toStringAsFixed(0);
    return v.toStringAsFixed(2);
  }

  static int _supportHoldPct(FuState s) {
    // 간단 추정: 신뢰↑, 위험↓, 근거↑, 점수↑면 유지 확률↑
    final e = (s.evidenceTotal <= 0) ? 0.0 : (s.evidenceHit / s.evidenceTotal).clamp(0.0, 1.0);
    final hold = 20
      + (s.confidence * 0.35)
      + (s.score * 0.25)
      + (e * 20)
      + ((100 - s.risk) * 0.20);
    return hold.round().clamp(0, 100);
  }

  static double _rrApprox(FuState s) {
    // 대략 RR: (r1 - price) / (price - s1) for long; for short inverse
    final price = s.price;
    final s1 = s.s1;
    final r1 = s.r1;
    if (price <= 0) return 0;
    final dir = s.signalDir.toUpperCase();
    if (dir.contains('SHORT')) {
      final reward = (price - s1).abs();
      final risk = (r1 - price).abs();
      if (risk <= 0) return 0;
      return reward / risk;
    } else {
      final reward = (r1 - price).abs();
      final risk = (price - s1).abs();
      if (risk <= 0) return 0;
      return reward / risk;
    }
  }

  static List<String> _fallbackBullets(FuState s) {
    final out = <String>[];
    if (s.evidenceHit >= 3) out.add('근거가 ${s.evidenceHit}개 이상 충족(초보 기준 통과 가능)');
    if (s.risk >= 70) out.add('위험이 높음: 손절쓸기/급변동 주의');
    if (s.confidence <= 30) out.add('신뢰가 낮음: 관망 추천');
    out.add('지지/저항 구간 중심으로만 판단(구간 밖은 중립)');
    return out;
  }

  static String _humanize(String raw) {
    var s = raw;
    s = s.replaceAll('FVG', '빈구간(급등/급락 흔적)');
    s = s.replaceAll('BPR', '되돌림 핵심구간');
    s = s.replaceAll('liquidity', '유동성(물량이 몰린 자리)');
    s = s.replaceAll('stop-hunt', '손절쓸기(함정)');
    s = s.replaceAll('OB', '주문/물량 구간');
    s = s.replaceAll('CVD', '매수/매도 우위');
    s = s.replaceAll('VWAP', '평균선(VWAP)');
    return s;
  }
}
