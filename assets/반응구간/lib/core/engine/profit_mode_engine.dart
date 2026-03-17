import '../models/fu_state.dart';
import 'mtf_consensus.dart';
import '../config/profit_mode.dart';

class ProfitModeEngine {
  static FuState apply(FuState s) {
    if (ProfitConfig.mode != ProfitMode.profit) return s;

    final zoneHit = (s.reactLow > 0 && s.reactHigh > 0) && (s.price >= s.reactLow && s.price <= s.reactHigh);
    final nearSupport = zoneHit; // 현재 구현에서는 reactBand를 지지/저항 공통 밴드로 사용
    final forcedDir0 = nearSupport ? _dirByBias(s) : s.signalDir;
    final htDir = s.zoneBias.isNotEmpty ? s.zoneBias : s.signalDir;
    final forcedDir = MtfConsensus.resolve(dir: forcedDir0, htDir: htDir, tf: s.tfLabel);

    // WAIT 제거: 존 근처면 무조건 signal 표시
    final mustShow = ProfitConfig.forceOnZoneHit && zoneHit;

    // RR 기준
    final rr = _rr(s.entry, s.stop, s.target);
    final rrOk = rr >= ProfitConfig.minRR;

    // 확신 기준(간단): confidenceScore 사용
    final conf = s.confidenceScore;
    final size = conf >= 70 ? ProfitConfig.highSize : ProfitConfig.lowSize;

    // 레버리지 자동: SL 거리 기반 (5% 리스크 룰)
    final lev = _autoLev(entry: s.entry > 0 ? s.entry : s.price, stop: s.stop > 0 ? s.stop : (s.price*0.99), maxLev: ProfitConfig.maxLev);

    final show = mustShow ? true : (s.showSignal && rrOk);

    final grade = show ? (conf >= 70 ? 'P+' : 'P') : s.signalGrade;
    final ko = show ? (conf >= 70 ? '수익모드 확정(P+)' : '수익모드 진입(P)') : s.signalKo;

    return s.copyWith(
      showSignal: show,
      roiOk: true,
      consensusOk: true,
      signalDir: show ? (forcedDir == 'NEUTRAL' ? s.signalDir : forcedDir) : s.signalDir,
      signalGrade: grade,
      signalKo: ko,
      leverage: lev.toDouble(),
    );
  }

  static String _dirByBias(FuState s) {
    // zoneBias를 우선(있으면), 없으면 기존 dir 유지
    final b = (s.zoneBias ?? '').toString().toUpperCase();
    if (b.contains('LONG')) return 'LONG';
    if (b.contains('SHORT')) return 'SHORT';
    // fallback: longScore vs shortScore
    if (s.longScore > s.shortScore) return 'LONG';
    if (s.shortScore > s.longScore) return 'SHORT';
    return s.signalDir;
  }

  static double _rr(double e, double sl, double tp) {
    if (e <= 0 || sl <= 0 || tp <= 0) return 0;
    final risk = (e - sl).abs();
    final rew = (tp - e).abs();
    if (risk <= 1e-9) return 0;
    return rew / risk;
  }

  static int _autoLev({required double entry, required double stop, required int maxLev}) {
    final distPct = ((entry - stop).abs() / (entry.abs() + 1e-9)) * 100.0;
    // 목표: 리스크 5%를 레버리지로 맞추기 (대략)
    final targetRiskPct = 5.0;
    int lev = distPct <= 0.01 ? maxLev : (targetRiskPct / distPct).round();
    if (lev < 1) lev = 1;
    if (lev > maxLev) lev = maxLev;
    return lev;
  }
}
