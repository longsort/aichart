import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import '../autotune/tuning_bus.dart';
import '../models/fu_state.dart';
import '../models/struct_mark.dart';
import 'fu_signal_logger.dart';
import 'bitget_public.dart';
import '../utils/fu_candle_aggregate.dart';
import '../../core_ai/core_ai.dart';
import '../analysis/entry_planner.dart';
import '../analysis/close_context_engine_v1.dart';
import '../analysis/breakout_quality_engine_v1.dart';
import '../analysis/volume_quality_engine_v1.dart';
import '../analysis/defense_engine_v1.dart';
import '../analysis/distribution_engine_v1.dart';
import '../engines/zone_classifier_v1.dart';
import '../risk_engine/engine.dart' as risk;
import '../settings/app_settings.dart';

class FuEngine {
  // ✅ 선물 신호 최소 강도(%) - 이 값 미만이면 신호는 '관망/주의'
  // 기존 20% 컷은 실전에서 신호를 지나치게 "WATCH"로 밀어내는 문제가 있었음.
  // 결정력 엔진(v2) 도입과 함께 기본 컷을 15%로 완화.
  static const double kMinFuturesSignalPct = 15.0;

  final _rng = math.Random();

  // === Candle-close signal lock ===
  // 같은 TF에서 마지막 캔들(ts)이 바뀌기 전까지는 “신호 확정”을 갱신하지 않는다.
  // (현재가만 바뀌는 구간에서 신호가 흔들리는 과매매 방지)
  final Map<String, int> _lastClosedTs = <String, int>{};

  // 강제 결론 모드(신호가 애매해도 최종 결론을 내리되, RiskBrake/NO-TRADE로 제어)
  static const bool forceDecisionMode = true;

  final Map<String, FuState> _lastState = <String, FuState>{};

  // === P-LOCK (anti flip-flop) ===
  // 확정 신호를 일정 시간/캔들 동안 고정해서 "진입했다가 말았다"를 줄인다.
  final Map<String, _PLock> _pLock = <String, _PLock>{};
  final Map<String, int> _pDirStreak = <String, int>{};
  final Map<String, String> _pLastDir = <String, String>{};
  final Map<String, int> _pLastClosedForStreak = <String, int>{};

  // === MTF hierarchy cache (4H + 1D) ===
  // 방향 TF: 4H/1D 둘 다 같은 방향일 때만 상위 방향으로 채택
  // - 15m: 엔트리 검증(4/5+ROI20) + 상위방향 일치 필수
  // - 5m : 타이밍 트리거(마감캔들)로만 확정
  final Map<String, DateTime> _topDirUpdatedAt = <String, DateTime>{};
  final Map<String, String> _topDirCache = <String, String>{}; // LONG/SHORT/MIXED/NEUTRAL

  // === Multi-TF pulse cache (strip/pressure UI) ===
  final Map<String, DateTime> _mtfUpdatedAt = <String, DateTime>{};
  final Map<String, Map<String, FuTfPulse>> _mtfCache = <String, Map<String, FuTfPulse>>{};

  
  String _dirOf(FuState s) {
    final d = (s.signalDir).toUpperCase();
    if (d == 'LONG' || d == 'SHORT') return d;
    return 'NEUTRAL';
  }

  double _toDouble(dynamic v) {
    if (v == null) return 0;
    if (v is num) return v.toDouble();
    return double.tryParse('$v') ?? 0;
  }

  int _tfToSeconds(String tf) {
    switch (tf) {
      case '5m':
        return 5 * 60;
      case '15m':
        return 15 * 60;
      case '1h':
        return 60 * 60;
      case '4h':
        return 4 * 60 * 60;
      case '1D':
        return 24 * 60 * 60;
      case '1W':
        return 7 * 24 * 60 * 60;
      case '1M':
        // 월봉은 고정 초 단위가 애매하니 30일로 근사
        return 30 * 24 * 60 * 60;
      default:
        return 15 * 60;
    }
  }

  FuState _applyPLock({
    required String key,
    required String symbol,
    required String tf,
    required FuState out,
    required int nowMs,
    required int closedTs,
  }) {
    // 설정값 (필요하면 AppSettings로 뺄 수 있음)
    const int kNeedStreak = 2; // 같은 방향이 2번 연속(마감 캔들 기준)일 때 락
    const int kMinProbToLock = 28; // "확신" 최소치
    const int kMinConfToLock = 28;
    const int kUnlockOppProb = 55; // 반대가 이 정도로 강하면 락 해제 허용
    const int kUnlockOppConf = 55;

    final existing = _pLock[key];
    if (existing != null && existing.untilMs > nowMs) {
      // 반대 신호가 약하면 그대로 고정
      if (out.signalDir != existing.dir) {
        final oppStrong = (out.signalProb >= kUnlockOppProb) && (out.confidenceScore >= kUnlockOppConf);
        if (!oppStrong) {
          final remainSec = ((existing.untilMs - nowMs) / 1000).ceil();
          return out.copyWith(
            signalDir: existing.dir,
            signalProb: existing.prob,
            confidenceScore: math.max(out.confidenceScore, existing.conf),
            entry: existing.entry,
            stop: existing.sl,
            target: existing.tp3,
            pLocked: true,
            pLockDir: existing.dir,
            pLockProb: existing.prob,
            pLockRemainingSec: remainSec,
            pLockWhy: existing.why,
            showSignal: true,
          );
        }
      }
      // 락 유지 중이라도 같은 방향이면 remain만 업데이트
      final remainSec = ((existing.untilMs - nowMs) / 1000).ceil();
      return out.copyWith(
        pLocked: true,
        pLockDir: existing.dir,
        pLockProb: existing.prob,
        pLockRemainingSec: remainSec,
        pLockWhy: existing.why,
      );
    }

    // 만료된 락 제거
    if (existing != null && existing.untilMs <= nowMs) {
      _pLock.remove(key);
    }

    // NO-TRADE/WATCH면 락 안 건다 (락도 해제)
    final title = (out.decisionTitle ?? '').toString();
    final isConfirmed = title.contains('확정') || title.toUpperCase().contains('CONFIRMED');
    if (out.noTrade || out.signalDir == 'NO' || !isConfirmed) {
      _pDirStreak[key] = 0;
      _pLastDir[key] = 'NO';
      return out.copyWith(
        pLocked: false,
        pLockDir: 'NO',
        pLockProb: 0,
        pLockRemainingSec: 0,
        pLockWhy: '',
      );
    }

    // 같은 마감캔들에서 중복 카운트 방지
    final lastClosedForStreak = _pLastClosedForStreak[key];
    if (lastClosedForStreak != null && lastClosedForStreak == closedTs) {
      return out; // 아직 새 캔들이 안 닫혔으면 streak 계산 스킵
    }
    _pLastClosedForStreak[key] = closedTs;

    final dir = out.signalDir;
    final lastDir = _pLastDir[key] ?? 'NO';
    final isStrongEnough = out.signalProb >= kMinProbToLock && out.confidenceScore >= kMinConfToLock;

    if (!isStrongEnough) {
      _pDirStreak[key] = 0;
      _pLastDir[key] = dir;
      return out;
    }

    final streak = (dir == lastDir) ? ((_pDirStreak[key] ?? 0) + 1) : 1;
    _pDirStreak[key] = streak;
    _pLastDir[key] = dir;

    if (streak >= kNeedStreak) {
      final lockSec = _tfToSeconds(tf);
      final until = nowMs + (lockSec * 1000);
      final e = out.entry;
      final st = out.stop;
      final t = out.target;
      _pLock[key] = _PLock(
        dir: dir,
        prob: out.signalProb,
        conf: out.confidenceScore,
        entry: e,
        sl: st,
        tp1: e + (t - e) * 0.4,
        tp2: e + (t - e) * 0.75,
        tp3: t,
        untilMs: until,
        why: 'P-LOCK ${kNeedStreak}x confirm',
      );
      return out.copyWith(
        pLocked: true,
        pLockDir: dir,
        pLockProb: out.signalProb,
        pLockRemainingSec: lockSec,
        pLockWhy: 'P-LOCK ${kNeedStreak}x confirm',
        showSignal: true,
      );
    }

    return out;
  }

  // UI label -> 엔진 tf
  String _mapTfLabelToEngine(String tfLabel) {
    switch (tfLabel) {
      case '1D':
        return '1d';
      case '1W':
        return '1w';
      case '1M':
        return '1mth';
      case '1Y':
        return '1y';
      default:
        return tfLabel; // '1m','5m','15m','1h','4h' 등
    }
  }

  String _locOf({required double price, required double vwap}) {
    if (vwap <= 0) return 'EQ';
    final diff = (price - vwap).abs() / vwap;
    if (diff <= 0.0012) return 'EQ'; // ±0.12%면 균형
    return (price >= vwap) ? 'PREMIUM' : 'DISCOUNT';
  }

  FuTfPulse _pulseFromState(FuState s) {
    final d = _dirOf(s);
    final inRe = (s.reactLow > 0 && s.reactHigh > 0) ? (s.price >= s.reactLow && s.price <= s.reactHigh) : false;
    final strength = (d == 'NEUTRAL') ? 0 : s.signalProb.clamp(0, 100);
    return FuTfPulse(
      dir: d,
      structure: s.structureTag,
      risk: s.risk.clamp(0, 100),
      inReaction: inRe,
      location: _locOf(price: s.price, vwap: s.vwap),
      strength: strength,
    );
  }

  Future<Map<String, FuTfPulse>> _getMtfPulse({
    required String symbol,
    required bool allowNetwork,
  }) async {
    final now = DateTime.now();
    final last = _mtfUpdatedAt[symbol];
    // 너무 잦은 갱신 방지(실시간은 5초면 충분)
    if (last != null && now.difference(last).inSeconds < 5) {
      return _mtfCache[symbol] ?? const <String, FuTfPulse>{};
    }

    const labels = <String>['1m', '5m', '15m', '1h', '4h', '1D', '1W', '1M', '1Y'];
    final out = <String, FuTfPulse>{};
    for (final lab in labels) {
      final tfEng = _mapTfLabelToEngine(lab);
      final st = await fetch(symbol: symbol, tf: tfEng, allowNetwork: allowNetwork, safeMode: true);
      out[lab] = _pulseFromState(st);
    }

    _mtfUpdatedAt[symbol] = now;
    _mtfCache[symbol] = out;
    return out;
  }

  // === Structure tag (CHOCH/BOS/RANGE) ===
  // Pivot(스윙) 기반 안정형 구조 판정:
  // - 마지막 2개 pivot high/low를 뽑아 "최근 구조"를 만든다.
  // - 현재가가 pivot을 돌파/이탈했을 때만 BOS/CHOCH로 확정한다.
  // - 반응가격(reactLevel)은 "돌파 후 되돌림"에서 지켜야 하는 가격.
  ({String tag, double breakLevel, double reactLevel}) _structureTag(
    List<FuCandle> candles,
    double px,
    double s1,
    double r1,
  ) {
    if (candles.length < 25) {
      final lvlUp = (r1 > 0) ? r1 : px;
      final lvlDn = (s1 > 0) ? s1 : px;
      if (px > lvlUp) return (tag: 'BOS_UP', breakLevel: lvlUp, reactLevel: lvlUp);
      if (px < lvlDn) return (tag: 'BOS_DN', breakLevel: lvlDn, reactLevel: lvlDn);
      return (tag: 'RANGE', breakLevel: r1, reactLevel: s1);
    }

    // --- pivot 추출 (fractal: 좌3/우3) ---
    // 노이즈 감소: 더 안정적인 스윙 구조만 남기기
    final piv = _extractPivots(candles, maxScan: 160, left: 3, right: 3);
    final ph = piv.highs;
    final pl = piv.lows;

    // fallback: pivot이 부족하면 기존 SR로
    if (ph.isEmpty || pl.isEmpty) {
      final upBreak = (r1 > 0) ? r1 : px;
      final dnBreak = (s1 > 0) ? s1 : px;
      if (px > upBreak) return (tag: 'BOS_UP', breakLevel: upBreak, reactLevel: upBreak);
      if (px < dnBreak) return (tag: 'BOS_DN', breakLevel: dnBreak, reactLevel: dnBreak);
      return (tag: 'RANGE', breakLevel: upBreak, reactLevel: dnBreak);
    }

    // 최근 pivot 2개씩
    final lastHigh = ph.last;
    final prevHigh = ph.length >= 2 ? ph[ph.length - 2] : ph.last;
    final lastLow = pl.last;
    final prevLow = pl.length >= 2 ? pl[pl.length - 2] : pl.last;

    // 구조 방향(추세) 판정: HH/HL = 상승 / LL/LH = 하락
    final bool upTrend = (lastHigh.price >= prevHigh.price) && (lastLow.price >= prevLow.price);
    final bool dnTrend = (lastHigh.price <= prevHigh.price) && (lastLow.price <= prevLow.price);

    // 돌파 레벨은 SR(보수) + pivot(보수) 혼합
    final upBreak = (r1 > 0) ? math.max(r1, lastHigh.price) : lastHigh.price;
    final dnBreak = (s1 > 0) ? math.min(s1, lastLow.price) : lastLow.price;

    // ✅ 반응가격(되돌림)은 "돌파/이탈 레벨 자체"가 1순위
    // (초보에게 가장 직관적: "여기 다시 지켜야 한다")
    final upReact = upBreak;
    final dnReact = dnBreak;

    final lastClose = candles.isNotEmpty ? candles.last.close : px;

    // ✅ 마감(종가) 기준 구조 판정 (정확도 우선)
    // - BOS : 추세 유지 방향으로의 돌파
    // - CHOCH : 방향 전환 '시작' (추세가 명확하지 않거나, 반대방향 첫 돌파)
    // - MSB : 기존 추세가 확실한 상태에서의 '메이저 구조 붕괴'(큰 전환)
    if (lastClose > upBreak) {
      String tag;
      if (dnTrend) {
        tag = 'MSB_UP'; // 하락 추세 붕괴(상승 전환)
      } else if (!upTrend && !dnTrend) {
        tag = 'CHOCH_UP';
      } else {
        // upTrend 또는 혼합에서도 위로 돌파면 BOS 우선
        tag = 'BOS_UP';
      }
      return (tag: tag, breakLevel: upBreak, reactLevel: upReact);
    }
    if (lastClose < dnBreak) {
      String tag;
      if (upTrend) {
        tag = 'MSB_DN'; // 상승 추세 붕괴(하락 전환)
      } else if (!upTrend && !dnTrend) {
        tag = 'CHOCH_DN';
      } else {
        tag = 'BOS_DN';
      }
      return (tag: tag, breakLevel: dnBreak, reactLevel: dnReact);
    }

    // 구간 내부: 마지막 pivot 기준 범위
    return (tag: 'RANGE', breakLevel: upBreak, reactLevel: dnBreak);
  }

  // ---- pivot helper ----
  ({List<_Pivot> highs, List<_Pivot> lows}) _extractPivots(
    List<FuCandle> candles, {
    int maxScan = 120,
    int left = 2,
    int right = 2,
    double minMovePct = 0.12,
  }) {
    final highs = <_Pivot>[];
    final lows = <_Pivot>[];
    final lastPx = candles.isNotEmpty ? candles.last.close : 0.0;
    final minMoveAbs = (lastPx > 0) ? (lastPx * (minMovePct / 100.0)) : 0.0;
    final int start = math.max(0, candles.length - maxScan);
    final int end = candles.length;
    for (int i = start + left; i < end - right; i++) {
      final ch = candles[i].high;
      final cl = candles[i].low;
      bool isHigh = true;
      bool isLow = true;
      for (int j = i - left; j <= i + right; j++) {
        if (j == i) continue;
        if (candles[j].high >= ch) isHigh = false;
        if (candles[j].low <= cl) isLow = false;
        if (!isHigh && !isLow) break;
      }
      if (isHigh) {
        final p = _Pivot(index: i, price: ch);
        if (highs.isEmpty || minMoveAbs <= 0 || (p.price - highs.last.price).abs() >= minMoveAbs) {
          highs.add(p);
        }
      }
      if (isLow) {
        final p = _Pivot(index: i, price: cl);
        if (lows.isEmpty || minMoveAbs <= 0 || (p.price - lows.last.price).abs() >= minMoveAbs) {
          lows.add(p);
        }
      }
    }
    return (highs: highs, lows: lows);
  }

  // ---- big-candle stats (current candles only) ----
  ({String label, int up1, int up3, int up5}) _bigCandleStats(List<FuCandle> candles) {
    if (candles.length < 40) return (label: '샘플 부족', up1: 50, up3: 50, up5: 50);
    // avg range
    final int n = math.min(120, candles.length - 6);
    double avgR = 0;
    for (int i = candles.length - n; i < candles.length; i++) {
      avgR += (candles[i].high - candles[i].low).abs();
    }
    avgR = avgR / n;
    if (avgR <= 0) return (label: '샘플 부족', up1: 50, up3: 50, up5: 50);

    int total = 0;
    int w1 = 0, w3 = 0, w5 = 0;
    for (int i = candles.length - n; i < candles.length - 5; i++) {
      final c = candles[i];
      final r = (c.high - c.low).abs();
      final body = (c.close - c.open).abs();
      final bodyRatio = (r <= 0) ? 0.0 : (body / r);
      final bool big = (r >= avgR * 1.6) && (bodyRatio >= 0.65);
      if (!big) continue;
      total++;
      final int dir = (c.close >= c.open) ? 1 : -1;
      // next 1/3/5 candle direction (majority)
      int upCount1 = 0;
      upCount1 += (candles[i + 1].close >= candles[i + 1].open) ? 1 : 0;
      if (dir == 1) {
        if (upCount1 >= 1) w1++;
      } else {
        if (upCount1 == 0) w1++;
      }
      int upCount3 = 0;
      for (int k = 1; k <= 3; k++) {
        upCount3 += (candles[i + k].close >= candles[i + k].open) ? 1 : 0;
      }
      final bool upMaj3 = upCount3 >= 2;
      if (dir == 1) {
        if (upMaj3) w3++;
      } else {
        if (!upMaj3) w3++;
      }
      int upCount5 = 0;
      for (int k = 1; k <= 5; k++) {
        upCount5 += (candles[i + k].close >= candles[i + k].open) ? 1 : 0;
      }
      final bool upMaj5 = upCount5 >= 3;
      if (dir == 1) {
        if (upMaj5) w5++;
      } else {
        if (!upMaj5) w5++;
      }
    }
    if (total < 6) return (label: '샘플 부족', up1: 50, up3: 50, up5: 50);
    final p1 = (w1 / total * 100).round().clamp(0, 100);
    final p3 = (w3 / total * 100).round().clamp(0, 100);
    final p5 = (w5 / total * 100).round().clamp(0, 100);
    return (label: '장대캔들 후 동일방향 확률', up1: p1, up3: p3, up5: p5);
  }

  double _closeSlope(List<FuCandle> candles, {int n = 30}) {
    if (candles.length < 8) return 0;
    final int m = math.min(n, candles.length);
    final recent = candles.sublist(candles.length - m);
    // 선형회귀 slope(간단)
    double sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (int i = 0; i < recent.length; i++) {
      final x = i.toDouble();
      final y = recent[i].close;
      sx += x;
      sy += y;
      sxx += x * x;
      sxy += x * y;
    }
    final denom = (m * sxx - sx * sx);
    if (denom == 0) return 0;
    return (m * sxy - sx * sy) / denom;
  }

  Future<String> _getTopDir({
    required String symbol,
    required bool allowNetwork,
  }) async {
    // throttle: update at most once per 30 seconds per symbol
    final now = DateTime.now();
    final last = _topDirUpdatedAt[symbol];
    if (last != null && now.difference(last).inSeconds < 30) {
      return _topDirCache[symbol] ?? 'NEUTRAL';
    }

    // 상위 TF는 "가볍게" (오더북/체결 없이) 캔들 기반만 사용
    final s4h = await fetch(symbol: symbol, tf: '4h', allowNetwork: allowNetwork, safeMode: true);
    final s1d = await fetch(symbol: symbol, tf: '1d', allowNetwork: allowNetwork, safeMode: true);

    final d4 = _dirOf(s4h);
    final d1 = _dirOf(s1d);

    String top;
    if ((d4 == 'LONG' || d4 == 'SHORT') && d4 == d1) {
      top = d4; // 합의
    } else if (d4 == 'NEUTRAL' && d1 == 'NEUTRAL') {
      top = 'NEUTRAL';
    } else {
      top = 'MIXED';
    }

    _topDirUpdatedAt[symbol] = now;
    _topDirCache[symbol] = top;
    return top;
  }

  FuState _applyMtfGate({
    required FuState base,
    required String tf,
    required String topDir,
  }) {

    // 5m 타이밍 트리거는 "마감 캔들" 기준으로만 확정
    bool _timingTriggered() {
      final candles = base.candles;
      if (candles.length < 2) return false;
      final last = candles.last;
      final prev = candles[candles.length - 2];
      final dir = base.signalDir;
      final rl = base.reactLow;
      final rh = base.reactHigh;
      final bl = base.breakLevel;

      // 반응구간/돌파가가 없으면 트리거 불가
      if (rl <= 0 || rh <= 0) return false;

      final bull = last.close > last.open;
      final bear = last.close < last.open;

      // (A) 반응구간 상/하단 돌파 마감
      final closeAboveBand = last.close > rh;
      final closeBelowBand = last.close < rl;

      // (B) 스윕 후 복귀(반응구간 밖으로 찍고, 반응구간 안으로 복귀 마감)
      final sweepDown = prev.low < rl && last.close >= rl && last.close <= rh;
      final sweepUp = prev.high > rh && last.close <= rh && last.close >= rl;

      // (C) 돌파가 재확인(가격이 돌파가 근처에서 지지/저항 확인)
      final nearBreak = (bl > 0) ? ((last.close - bl).abs() / (bl.abs() + 1e-9)) * 100.0 < 0.25 : false;

      if (dir == 'LONG') {
        return (bull && closeAboveBand) || (bull && sweepDown) || (bull && nearBreak && last.close >= rl);
      }
      if (dir == 'SHORT') {
        return (bear && closeBelowBand) || (bear && sweepUp) || (bear && nearBreak && last.close <= rh);
      }
      return false;
    }

    // 15m: 상위방향이 확정(LONG/SHORT)인데 반대로 나오면 신호 차단
    if (tf == '15m') {
      if ((topDir == 'LONG' || topDir == 'SHORT') &&
          base.showSignal &&
          base.signalDir != topDir) {
    return FuState(
          price: base.price,
          score: base.score,
          confidence: base.confidence,
          risk: base.risk,
          locked: true,
          lockedReason: '상위TF($topDir) 역방향',
          decisionTitle: base.decisionTitle,
          evidenceHit: base.evidenceHit,
          evidenceTotal: base.evidenceTotal,
          s1: base.s1,
          r1: base.r1,
          vwap: base.vwap,
          structureTag: base.structureTag,
          breakLevel: base.breakLevel,
          reactLevel: base.reactLevel,
          reactLow: base.reactLow,
          reactHigh: base.reactHigh,
          entry: base.entry,
          stop: base.stop,
          target: base.target,
          leverage: base.leverage,
          qty: base.qty,
          roiPotential: base.roiPotential,
          consensusOk: base.consensusOk,
          roiOk: base.roiOk,
          showSignal: false,
          signalDir: 'NEUTRAL',
          signalProb: base.signalProb,
          signalGrade: 'WATCH',
          signalKo: '상위TF와 반대라 관망',
          signalWhy: base.signalWhy,
          signalBullets: [
            ...base.signalBullets,
            '상위 방향($topDir)과 불일치 → 신호 차단',
          ],
          candles: base.candles,
lossStreak: base.lossStreak,
        );
      }
    }

    // 5m: 15m가 신호(SIGNAL)이고 방향 일치할 때만 타이밍 확정. 그 외는 트리거 대기.
    if (tf == '5m') {
      // 5m에서만 단독 신호 남발 방지: 상위가 MIXED/NEUTRAL이면 5m는 WATCH 중심
      if (topDir == 'MIXED' || topDir == 'NEUTRAL') {
        if (base.showSignal) {
          return FuState(
            price: base.price,
            score: base.score,
            confidence: base.confidence,
            risk: base.risk,
            locked: base.locked,
            lockedReason: base.lockedReason,
            decisionTitle: base.decisionTitle,
            evidenceHit: base.evidenceHit,
            evidenceTotal: base.evidenceTotal,
            s1: base.s1,
            r1: base.r1,
            vwap: base.vwap,
            structureTag: base.structureTag,
            breakLevel: base.breakLevel,
            reactLevel: base.reactLevel,
            reactLow: base.reactLow,
            reactHigh: base.reactHigh,
            entry: base.entry,
            stop: base.stop,
            target: base.target,
            leverage: base.leverage,
            qty: base.qty,
            roiPotential: base.roiPotential,
            consensusOk: base.consensusOk,
            roiOk: base.roiOk,
            showSignal: false,
            signalDir: 'NEUTRAL',
            signalProb: base.signalProb,
            signalGrade: 'WATCH',
            signalKo: '상위 혼조 → 5m 단독 신호 차단',
            signalWhy: base.signalWhy,
            signalBullets: [
              ...base.signalBullets,
              '상위(MTF) 혼조/중립 → 5m 단독 신호 차단',
            ],
            candles: base.candles,
lossStreak: base.lossStreak,
          );
        }
      }

      // ✅ 상위 방향이 확정(LONG/SHORT)일 때: 5m는 "타이밍 트리거"가 있어야만 showSignal 유지
      // - 합의/ROI 게이트는 이미 base.showSignal에 반영됨
      if ((topDir == 'LONG' || topDir == 'SHORT') && base.showSignal) {
        // 방향 불일치면 차단(보강)
        if (base.signalDir != topDir) {
          return FuState(
            price: base.price,
            score: base.score,
            confidence: base.confidence,
            risk: base.risk,
            locked: base.locked,
            lockedReason: base.lockedReason,
            decisionTitle: '관망(타이밍 대기)',
            evidenceHit: base.evidenceHit,
            evidenceTotal: base.evidenceTotal,
            s1: base.s1,
            r1: base.r1,
            vwap: base.vwap,
            structureTag: base.structureTag,
            breakLevel: base.breakLevel,
            reactLevel: base.reactLevel,
            reactLow: base.reactLow,
            reactHigh: base.reactHigh,
            entry: base.entry,
            stop: base.stop,
            target: base.target,
            leverage: base.leverage,
            qty: base.qty,
            roiPotential: base.roiPotential,
            consensusOk: base.consensusOk,
            roiOk: base.roiOk,
            showSignal: false,
            signalDir: 'NEUTRAL',
            signalProb: base.signalProb,
            signalGrade: 'WATCH',
            signalKo: '상위TF와 방향이 달라 대기',
            signalWhy: base.signalWhy,
            signalBullets: [
              ...base.signalBullets,
              '5m 타이밍: 상위($topDir)와 불일치 → 대기',
            ],
            candles: base.candles,
            lossStreak: base.lossStreak,
          );
        }

        // 타이밍 트리거 없으면 대기(마감 캔들 기반)
        if (!_timingTriggered()) {
          return FuState(
            price: base.price,
            score: base.score,
            confidence: base.confidence,
            risk: base.risk,
            locked: base.locked,
            lockedReason: base.lockedReason,
            decisionTitle: '대기(타이밍)',
            evidenceHit: base.evidenceHit,
            evidenceTotal: base.evidenceTotal,
            s1: base.s1,
            r1: base.r1,
            vwap: base.vwap,
            structureTag: base.structureTag,
            breakLevel: base.breakLevel,
            reactLevel: base.reactLevel,
            reactLow: base.reactLow,
            reactHigh: base.reactHigh,
            entry: base.entry,
            stop: base.stop,
            target: base.target,
            leverage: base.leverage,
            qty: base.qty,
            roiPotential: base.roiPotential,
            consensusOk: base.consensusOk,
            roiOk: base.roiOk,
            showSignal: false,
            signalDir: 'NEUTRAL',
            signalProb: base.signalProb,
            signalGrade: 'WATCH',
            signalKo: '5m 타이밍 캔들 마감 대기',
            signalWhy: base.signalWhy,
            signalBullets: [
              ...base.signalBullets,
              '5m 타이밍: 마감 캔들로 반응 확인될 때만 진입',
            ],
            candles: base.candles,
            lossStreak: base.lossStreak,
          );
        }
      }

      // 5m 타이밍 확정 규칙:
      // - 상위방향(topDir)이 LONG/SHORT로 확정
      // - base 신호가 활성(showSignal)
      // - 5m 마지막 "마감 캔들"에서 트리거(_timingTriggered) 발생
      // 위 조건을 모두 만족할 때만 5m에서 "확정"으로 유지한다.
      if ((topDir == 'LONG' || topDir == 'SHORT')) {
        final bool needsTiming = base.showSignal && base.signalDir == topDir;
        if (needsTiming && !_timingTriggered()) {
          return FuState(
            price: base.price,
            score: base.score,
            confidence: base.confidence,
            risk: base.risk,
            locked: base.locked,
            lockedReason: base.lockedReason,
            decisionTitle: '대기(5m 타이밍)',
            evidenceHit: base.evidenceHit,
            evidenceTotal: base.evidenceTotal,
            s1: base.s1,
            r1: base.r1,
            vwap: base.vwap,
            structureTag: base.structureTag,
            breakLevel: base.breakLevel,
            reactLevel: base.reactLevel,
            reactLow: base.reactLow,
            reactHigh: base.reactHigh,
            entry: base.entry,
            stop: base.stop,
            target: base.target,
            leverage: base.leverage,
            qty: base.qty,
            roiPotential: base.roiPotential,
            consensusOk: base.consensusOk,
            roiOk: base.roiOk,
            showSignal: false,
            signalDir: 'NEUTRAL',
            signalProb: base.signalProb,
            signalGrade: 'WATCH',
            signalKo: '5m 마감 타이밍 대기',
            signalWhy: base.signalWhy,
            signalBullets: [
              ...base.signalBullets,
              '5m 마감 트리거 대기(반응구간 돌파/스윕복귀/재확인) → 확정 보류',
            ],
            candles: base.candles,
            lossStreak: base.lossStreak,
          );
        }
      }
    }

    return base;
  }

  /// ✅ 멀티 타임프레임 압축(mtfPulse) 합의 게이트
  /// - 목적: "한 화면"에서 1m~1M 전체 흐름이 반대일 때 과매매를 자동으로 차단
  /// - 규칙:
  ///   - base.signalDir가 LONG/SHORT일 때만 적용
  ///   - active(NEUTRAL 제외) TF 중 합의율(agreePct)이 낮으면 showSignal을 끄거나 locked 처리
  FuState _applyMtfConsensusGate({required FuState base}) {
    final dir = base.signalDir;
    if (dir != 'LONG' && dir != 'SHORT') return base;
    if (base.mtfPulse.isEmpty) return base;

    int agree = 0;
    int oppose = 0;
    int active = 0;

    base.mtfPulse.forEach((_, p) {
      final d = p.dir;
      if (d != 'LONG' && d != 'SHORT') return;
      active += 1;
      if (d == dir) {
        agree += 1;
      } else {
        oppose += 1;
      }
    });

    // active TF가 너무 적으면(데이터 부족) 원래 상태 유지
    if (active < 3) return base;

    final agreePct = agree / active;

    // 확률을 합의율로 살짝 보정(과도한 점프 방지)
    // 0.5(중립) -> x1.0, 1.0 -> x1.12, 0.0 -> x0.88
    final probMul = (0.88 + (agreePct * 0.24)).clamp(0.80, 1.20);
    final newProb = (base.signalProb * probMul).round().clamp(0, 100);

    // 불일치 임계값
    final conflict = agreePct < 0.55;
    final strongConflict = agreePct < 0.45;

    // 불릿(맨 앞에 넣기)
    final bullets = <String>[
      'MTF: 합의 $agree/$active · ${(agreePct * 100).toStringAsFixed(0)}%',
      ...base.signalBullets,
    ];

    // 강한 충돌이면 NO-TRADE(잠금)
    if (!base.locked && strongConflict) {
      return base.copyWith(
        locked: true,
        lockedReason: '관망(다중TF 충돌)',
        decisionTitle: '관망(다중TF 충돌)',
        showSignal: false,
        signalDir: 'NEUTRAL',
        signalProb: newProb,
        signalBullets: bullets,
      );
    }

    // 약한 충돌이면 확정 신호만 차단(Watch로)
    if (!base.locked && conflict && base.showSignal) {
      return base.copyWith(
        decisionTitle: '지켜보기(다중TF 불일치)',
        showSignal: false,
        signalProb: newProb,
        signalBullets: bullets,
      );
    }

    return base.copyWith(
      signalProb: newProb,
      signalBullets: bullets,
    );
  }


FuState _applyForceDecision(FuState s) {
  if (!forceDecisionMode) return s;

  // 구조 바이어스(0~100)
  int structLong = 50;
  int structShort = 50;
  final tag = s.structureTag.toUpperCase();
  if (tag.contains('UP') || tag.contains('BOS') || tag.contains('CHOCH_UP') || tag.contains('MSB_UP')) {
    structLong = 75;
    structShort = 25;
  } else if (tag.contains('DOWN') || tag.contains('CHOCH_DN') || tag.contains('MSB_DN')) {
    structLong = 25;
    structShort = 75;
  }

  final tp = TuningBus.p;
    final supP = s.reactionSupportProb.clamp(0, 100);
  final resP = s.reactionResistProb.clamp(0, 100);
  final risk = s.risk.clamp(0, 100);
  final rr = s.rr.isFinite ? s.rr : 1.0;

  // 점수(0~100): 지지/저항 + 구조 + 리스크(낮을수록) + RR 보너스
  int longScore = (supP * tp.wSupport + structLong * tp.wStructure + (100 - risk) * 0.25 + (math.min(2.0, rr) / 2.0) * 10.0).round().clamp(0, 100);
  int shortScore = (resP * tp.wResist + structShort * tp.wStructure + (100 - risk) * 0.25 + (math.min(2.0, rr) / 2.0) * 10.0).round().clamp(0, 100);

  final dir = (longScore >= shortScore) ? 'LONG' : 'SHORT';
  final diff = (longScore - shortScore).abs().clamp(0, 100);
  final confidence = diff; // 0~100

  // 권장 R(사이즈): 확신 낮을수록 소액 진입(대기 대신)
  double r;
  if (confidence < 20) {
    r = 0.25;
  } else if (confidence < 40) {
    r = 0.5;
  } else if (confidence < 60) {
    r = 1.0;
  } else if (confidence < 75) {
    r = 1.5;
  } else {
    r = 2.0;
  }

  final maxProb = math.max(supP, resP) / 100.0;

  // 2단계 게이트
  // - WATCH: 최소 방향성 안내(화면/플랜만), DB 기록/자율보정에는 미반영
  // - CONFIRM: 확정 진입(기록/자율보정)
  final forceMin = (tp.thrConfirm * 0.55).clamp(0.22, 0.45);
  final watchTrade = (maxProb >= forceMin) && (confidence >= 20);
  final allow = (maxProb >= tp.thrConfirm) && (confidence >= 20);
  final prob = (50 + (confidence / 2)).round().clamp(0, 100);

  final reason = 'FORCED: $dir · conf $confidence% · R ${r.toStringAsFixed(2)} · L/S $longScore/$shortScore';

  return s.copyWith(
    locked: false,
    lockedReason: '',
    decisionTitle: allow ? '확정($dir)' : (watchTrade ? 'WATCH($dir)' : 'NO-TRADE'),
    showSignal: watchTrade,
    signalDir: dir,
    signalProb: prob,
    confidence: confidence,
    confidenceScore: prob,
    confidenceLabel: confidence >= 75 ? '강함' : confidence >= 60 ? '보통' : confidence >= 45 ? '약함' : '매우 약함',
    recommendR: r,
    longScore: longScore,
    shortScore: shortScore,
    finalDecisionReason: reason,
    signalBullets: [reason, ...s.signalBullets],
  );
}

  Future<FuState> fetch({
    required String symbol,
    required String tf,
    required bool allowNetwork,
    required bool safeMode,
  }) async {
    double? px;
    if (allowNetwork) {
      // ✅ Fulink Pro Ultra 실데이터 방식(Bitget v3)
      // - 기본은 USDT 선물로 조회
      px = await BitgetPublic.getLastPrice(category: 'USDT-FUTURES', symbol: symbol);
    }
    px ??= _mockPrice(symbol);

    // ✅ 캔들도 가능하면 실데이터로
    final candles = await _tryBitgetCandles(symbol: symbol, tf: tf) ?? _mockCandles(px, tf);

    // === (1) 캔들 마감 기준: 마지막 캔들 ts가 바뀔 때만 신호를 재확정 ===
    final key = '$symbol|$tf';
    final closedTs = candles.isEmpty ? 0 : candles.last.ts;
    final prevTs = _lastClosedTs[key];
    final prevState = _lastState[key];
    if (prevTs != null && prevTs == closedTs && prevState != null) {
      // 현재가만 최신으로 반영하고, 나머지는 이전 확정값 유지
      final merged = FuState(
        price: px,
        score: prevState.score,
        confidence: prevState.confidence,
        risk: prevState.risk,
        locked: prevState.locked,
        lockedReason: prevState.lockedReason,
        decisionTitle: prevState.decisionTitle,
        evidenceHit: prevState.evidenceHit,
        evidenceTotal: prevState.evidenceTotal,
        s1: prevState.s1,
        r1: prevState.r1,
        vwap: prevState.vwap,

        structureTag: prevState.structureTag,
        breakLevel: prevState.breakLevel,
        reactLevel: prevState.reactLevel,
        reactLow: prevState.reactLow,
        reactHigh: prevState.reactHigh,

        mtfPulse: prevState.mtfPulse,

        entry: prevState.entry,
        stop: prevState.stop,
        target: prevState.target,
        leverage: prevState.leverage,
        qty: prevState.qty,
        roiPotential: prevState.roiPotential,
        consensusOk: prevState.consensusOk,
        roiOk: prevState.roiOk,
        showSignal: prevState.showSignal,
        pLocked: prevState.pLocked,
        pLockDir: prevState.pLockDir,
        pLockProb: prevState.pLockProb,
        pLockRemainingSec: prevState.pLockRemainingSec,
        pLockWhy: prevState.pLockWhy,
        signalDir: prevState.signalDir,
        signalProb: prevState.signalProb,
        signalGrade: prevState.signalGrade,
        signalKo: prevState.signalKo,
        signalWhy: prevState.signalWhy,
        signalBullets: prevState.signalBullets,
        whaleScore: prevState.whaleScore,
        forceScore: prevState.forceScore,
        absorptionScore: prevState.absorptionScore,
        sweepRisk: prevState.sweepRisk,
        defenseScore: prevState.defenseScore,
        distributionScore: prevState.distributionScore,
        whaleBuyPct: prevState.whaleBuyPct,
        instBias: prevState.instBias,
        obImbalance: prevState.obImbalance,
        tapeBuyPct: prevState.tapeBuyPct,
        flowHint: prevState.flowHint,

        zoneCode: prevState.zoneCode,
        zoneName: prevState.zoneName,
        zoneBias: prevState.zoneBias,
        zoneStrength: prevState.zoneStrength,
        zoneLongP: prevState.zoneLongP,
        zoneShortP: prevState.zoneShortP,
        zoneWaitP: prevState.zoneWaitP,
        zoneTrigger: prevState.zoneTrigger,
        zoneInvalidLine: prevState.zoneInvalidLine,
        zoneReasons: prevState.zoneReasons,

        candles: candles,
lossStreak: prevState.lossStreak,
      );
      _lastState[key] = merged;
      return _applyForceDecision(merged);
    }

    // ✅ SR(지지/저항) = 최근 구간에서 가장 가까운 저점/고점 기반
    final sr = _calcSr(candles, px);
    final s1 = sr.$1;
    final r1 = sr.$2;
    final vwap = _calcVwap(candles, px);

    // ✅ 구간 내부(레인지) 판정
    final bool hasSr = (s1 > 0 && r1 > 0 && r1 > s1);
    final bool inRange = hasSr ? (px >= s1 && px <= r1) : false;
    final stTag = _structureTag(candles, px, s1, r1);
    // 반응 구간(띠) 폭: ATR(평균 캔들 range) 기반
    final atrAbs = _atrAbs(candles);
    final bandHalf = (atrAbs > 0) ? (atrAbs * 0.25) : (px * 0.0015);
    final reactLow = (stTag.reactLevel > 0) ? (stTag.reactLevel - bandHalf) : 0.0;
    final reactHigh = (stTag.reactLevel > 0) ? (stTag.reactLevel + bandHalf) : 0.0;

    // ✅ 오더북/체결 (가능하면 실데이터)
    final ob = allowNetwork ? await BitgetPublic.getOrderBook(category: 'USDT-FUTURES', symbol: symbol, limit: 50) : null;
    // NOTE: allowNetwork=false 일 때도 타입이 깨지지 않도록 빈 리스트 타입 고정
    final List<Map<String, dynamic>> fills = allowNetwork
        ? await BitgetPublic.getRecentFills(category: 'USDT-FUTURES', symbol: symbol, limit: 100)
        : const <Map<String, dynamic>>[];

    final obScore = _orderbookPressure(ob, px);
    final tapeScore = _tapeImbalance(fills);
    final whale = _whaleHeuristic(
      fills,
      obBuyPct: obScore.$3,
      tapeBuyPct: tapeScore.$3,
    );
    final volScore = _volumeSpike(candles);
    final momScore = _momentum(candles);
    final srScore = _srGate(px, s1, r1);

    final ev = <Evidence>[
      Evidence('SR', srScore.$1, 1.2, srScore.$2),
      Evidence('ORDERBOOK', obScore.$1, 1.3, obScore.$2),
      Evidence('TAPE', tapeScore.$1, 1.1, tapeScore.$2),
      Evidence('VOLUME', volScore.$1, 0.9, volScore.$2),
      Evidence('MOMENTUM', momScore.$1, 0.8, momScore.$2),
    ];

    final core = CoreAI.run(ev);

    // ✅ 신호 강도 필터(선물): 20% 미만이면 LONG/SHORT 신호를 내지 않음
    final maxSidePct = math.max(core.longPct, core.shortPct);
    final weakSignal = maxSidePct < kMinFuturesSignalPct;


    // ✅ 위험도 = 변동성(ATR 비슷) + LOCK 비중
    final atr = _atrPct(candles);
    final risk = (atr * 260 + core.lockPct * 0.55).clamp(5, 95).round();
    int score = math.max(core.longPct, core.shortPct).clamp(0, 100).round();
    int conf = ((100 - risk) * 0.7 + (score) * 0.3).clamp(0, 100).round();
    bool locked = risk >= 82 || core.lockPct >= 45;
    String lockedReason = locked ? '관망(위험/충돌 높음) · RISK ${risk}%' : '정상';

    final dir = locked ? 'NEUTRAL' : core.bias;
    final prob = conf.clamp(0, 100);
    final grade = prob >= 82 ? 'SSS' : (prob >= 70 ? 'A' : (prob >= 55 ? 'B' : 'C'));

    final total = ev.length;
    int hit = ev.where((e) => e.strength >= 60 && e.vote != 'NEUTRAL').length;

    // 기본 지표(요약)
    final baseBullets = <String>[
      'SR: 지지 ${(srScore.$3).round()}% · 저항 ${(srScore.$4).round()}%',
      '오더북: 매수 ${(obScore.$3).round()}% · 매도 ${(obScore.$4).round()}%',
      '체결: 매수 ${(tapeScore.$3).round()}% · 매도 ${(tapeScore.$4).round()}%',
      '거래량: ${volScore.$5}',
      '모멘텀: ${momScore.$5}',
    ];

    // ✅ 핵심(돈 되는) 내용은 맨 위에 오도록 "헤더 불릿"으로 먼저 구성
    final headBullets = <String>[];

    // ✅ 가격 조건문 고정 표시
    if (hasSr) {
      headBullets.add('가격구간: 지지 ${s1.toStringAsFixed(0)} / VWAP ${vwap.toStringAsFixed(0)} / 저항 ${r1.toStringAsFixed(0)}');
    }

    // ✅ 구조(CHOCH/BOS) + 되돌림 반응가격(숫자) 고정 표시
    if (stTag.tag == 'CHOCH_UP' || stTag.tag == 'BOS_UP') {
      headBullets.add('구조: ${stTag.tag} → 돌파 후 되돌림 반응가격 ${stTag.reactLevel.toStringAsFixed(0)}');
      headBullets.add('LONG 조건: 마감가 > ${stTag.breakLevel.toStringAsFixed(0)} 유지 + 되돌림 ${stTag.reactLevel.toStringAsFixed(0)} 지지 확인');
    } else if (stTag.tag == 'CHOCH_DN' || stTag.tag == 'BOS_DN') {
      headBullets.add('구조: ${stTag.tag} → 붕괴 후 되돌림 반응가격 ${stTag.reactLevel.toStringAsFixed(0)}');
      headBullets.add('SHORT 조건: 마감가 < ${stTag.breakLevel.toStringAsFixed(0)} 유지 + 되돌림 ${stTag.reactLevel.toStringAsFixed(0)} 저항 확인');
    } else if (inRange) {
      headBullets.add('구조: RANGE(구간 내부) → 돌파/붕괴 전까지 관망');
    }

    // === 캔들 마감/돌파/거래량 분석(정확도 모드) ===
    // - UI 불릿/합의/구조 보정에서 공통으로 사용
    final cc = CloseContextEngineV1.eval(candles);
    final bq = BreakoutQualityEngineV1.eval(candles, s1: s1, r1: r1, vwap: vwap);
    final vq = VolumeQualityEngineV1.eval(candles);

    // 구조 기반 확정 보정 플래그(CHOCH는 약하면 관망, MSB는 강하면 확정 완화)

    // ✅ 장대양봉/장대음봉 후 확률(현재 캔들셋 내부 통계)
    // - 외부 CSV 없이도 즉시 동작 (추후 CSV/타이롱 데이터 연결 시 정교화)
    final bc = _bigCandleStats(candles);
    headBullets.add('${bc.label}: 다음 1/3/5캔들 ${bc.up1}/${bc.up3}/${bc.up5}%');

    // 최종 불릿: 핵심 → 기본지표 순
    final bullets = <String>[...headBullets, ...baseBullets];

    // 마감/돌파/거래량 요약(초보용)
    bullets.insert(0, '마감: ${cc.labelKo}(${cc.score}) · 돌파: ${bq.labelKo}(${bq.score}) · 거래량: ${vq.labelKo}(${vq.score})');

    // --- 구조/반응 구간 값(로컬 별칭) ---
    // NOTE:
    // - reactLow/reactHigh는 이미 위에서 ATR 기반 band로 계산됨.
    // - stTag는 record({breakLevel, reactLevel, tag}) 형태라 reactLow/reactHigh getter가 없음.
    // 따라서 여기서는 중복 선언을 피하고, 기존 계산값을 그대로 사용한다.
    final String structureTag = stTag.tag;
    final double breakLevel = stTag.breakLevel;
    final double reactLevel = stTag.reactLevel;

    // === 구조/반응 가격(브리핑 고정 표시) ===
    // 초보도 이해할 수 있게 한글 + 원어 병기
    String _koStruct(String tag) {
      if (tag.contains('CHOCH')) return '추세변화(CHOCH)';
      if (tag.contains('BOS')) return '구조돌파(BOS)';
      if (tag.contains('RANGE')) return '박스(횡보)';
      return tag;
    }

    // 구조 태그/돌파가/반응가(되돌림) 표시
    if ((structureTag).trim().isNotEmpty && structureTag != 'NONE') {
      bullets.insert(
        0,
        '구조: ${_koStruct(structureTag)} · 돌파가 ${breakLevel.toStringAsFixed(0)} · 반응구간 ${reactLow.toStringAsFixed(0)}~${reactHigh.toStringAsFixed(0)}',
      );
    }

    String effDir = (locked || weakSignal) ? 'NEUTRAL' : dir;
    String effTitle = locked
        ? '거래금지'
        : (weakSignal
            ? '관망(주의)'
            : (dir == 'LONG' ? '롱 우세' : (dir == 'SHORT' ? '숏 우세' : '관망')));

    // ✅ 구조 되돌림 반응구간 내부면 “진입 후보 자리”로 취급한다.
    // - 예전 패치에서는 과매매 방지로 effDir를 NEUTRAL로 바꿔버려서
    //   실제 데이터(실시간)에서 신호/오버레이가 사라져 보이는 문제가 있었다.
    // - 방향은 유지하고(롱/숏), 타이틀만 “구간 반응”으로 표시한다.
    final inReactionBand = px >= reactLow && px <= reactHigh;
    if (!locked && inReactionBand) {
      effTitle = '구간 반응(확인)';
    }

    // ✅ 구간 내부면 제목을 고정: "관망(구간 내부)" (가짜 신호/과매매 방지)
    if (!locked && inRange) {
      effDir = 'NEUTRAL';
      effTitle = '관망(구간 내부)';
    }

    final signalKo = locked
        ? '지금은 거래를 쉬는 게 좋아요.'
        : (weakSignal
            ? '신호가 약해요(20% 미만). 관망이 좋아요.'
            : (dir == 'LONG'
                ? '상승 쪽이 조금 더 유리해요.'
                : (dir == 'SHORT' ? '하락 쪽이 조금 더 유리해요.' : '방향이 애매해요.')));
    final signalWhy = '근거 ${hit}/${total} · 롱 ${core.longPct.round()}% / 숏 ${core.shortPct.round()}% / 관망 ${core.lockPct.round()}%' + (weakSignal ? ' (20%미만 필터)' : '');

    // === 구조/마감/돌파/거래량 보정(정확도 우선) ===
    // - 구조 태그가 강할수록(특히 MSB) 점수/신뢰도를 보정한다.
    // - CHOCH는 '전환 시작'이므로 돌파/거래량이 약하면 관망으로 보수 처리한다.
    final stUpper = stTag.tag.toUpperCase();
    int structureBoost = 0;
    int structureConfBoost = 0;
    if (stUpper.contains('MSB_')) { structureBoost = 14; structureConfBoost = 12; }
    else if (stUpper.contains('BOS_')) { structureBoost = 8; structureConfBoost = 6; }
    else if (stUpper.contains('CHOCH_')) { structureBoost = 4; structureConfBoost = 4; }

    final int closeBoost = ((cc.score - 50) * 0.08).round(); // -4~+4
    final int breakoutBoost = ((bq.score - 50) * 0.10).round(); // -5~+5
    final int volumeBoost = ((vq.score - 50) * 0.10).round(); // -5~+5

    score = (score + structureBoost + closeBoost + breakoutBoost + volumeBoost).clamp(0, 100);
    conf = (conf + structureConfBoost + closeBoost + breakoutBoost + volumeBoost).clamp(0, 100);

    // 구조가 강할 때만(특히 MSB/BOS) evidence hit를 소폭 보정
    if (stUpper.contains('MSB_')) {
      if (bq.score >= 60) hit = (hit + 1);
      if (vq.score >= 60) hit = (hit + 1);
    } else if (stUpper.contains('BOS_')) {
      if (bq.score >= 60) hit = (hit + 1);
    }
    if (hit > total) hit = total;

    final bool chochWeak = stUpper.contains('CHOCH_') && (bq.score < 60 || vq.score < 55 || cc.score < 55);
    final bool msbStrong = stUpper.contains('MSB_') && (bq.score >= 60 && vq.score >= 55);


    // === 결정력(Decision Power) v2 ===
    // 목표: "근거 5개"가 있어도 관망으로 붙는 문제를 해결.
    // 핵심: (구조) + (종가확정) + (돌파/거래량) + (방향성 우위)을 가중합으로
    //       0~100 결정력 스코어로 만들고, 강하면 일부 게이트를 우회한다.
    final longPct = core.longPct;
    final shortPct = core.shortPct;
    final edge = (longPct - shortPct).clamp(-100.0, 100.0);

    structureBoost = 0;
    if (stUpper.contains('MSB_')) structureBoost = 12;
    if (stUpper.contains('BOS_')) structureBoost = 8;
    if (stUpper.contains('CHOCH_')) structureBoost = 4;

    // 종가확정/돌파/거래량 점수는 50이 중립, 100이 강함.
    final closeAdj = ((cc.score - 50.0) * 0.25);
    final breakoutAdj = ((bq.score - 50.0) * 0.25);
    final volumeAdj = ((vq.score - 50.0) * 0.20);

    // 구간 내부(레인지)면 결정력 감점, 반대로 "핵심구간 반응"이면 소폭 가점
    final zoneAdj = inRange ? -10.0 : (inReactionBand ? 6.0 : 0.0);

    final decisionPower = (50.0 + (edge * 0.5) + structureBoost + closeAdj + breakoutAdj + volumeAdj + zoneAdj)
        .clamp(0.0, 100.0);

    // 1) 합의(근거) 게이트
    // - 기존 4/5는 너무 빡세서 신호가 잘 안나옴.
    // - 기본 3개로 완화.
    // - 결정력이 강(>=72)이면 합의 부족을 우회.
    final consensusNeed = 3;
    final consensusOk = (hit >= consensusNeed) || (decisionPower >= 72.0);

    // 2) ROI 게이트 (TP까지 예상 수익률*레버리지)
    // - 엔트리/SL/TP는 SR 기반 EntryPlanner(초보용) 사용
    // - 레버리지는 "TP까지 목표 ROI"가 되도록 최소치로 추천
    final isLong = dir == 'LONG';
    final accountUsdt = AppSettings.accountUsdt;
    final riskPct = AppSettings.riskPct;
    final ep = EntryPlanner.plan(
      isLong: isLong,
      price: px,
      s1: s1,
      r1: r1,
      accountUsdt: accountUsdt,
      riskPct: riskPct,
    );
    final target = ep.tp3;
    final stop = ep.sl;
    final movePct = (ep.entry <= 0) ? 0.0 : ((target - ep.entry).abs() / ep.entry) * 100.0;
    // 기존 25%는 신호 억제 요인이 커서 기본 15%로 완화
    final targetRoiPct = 15.0;
    final needLev = (movePct <= 0) ? 3 : ((targetRoiPct / movePct).ceil());
    double leverage = math.max(needLev.toDouble(), ep.leverageRec).clamp(3.0, 35.0);
    if (AppSettings.leverageOverride > 0) {
      leverage = AppSettings.leverageOverride.clamp(1.0, 200.0).toDouble();
    }
    final roiToTp = movePct * leverage;

    // UX: 목표 ROI 게이트(필요 레버리지)
    final levNeed = (movePct <= 0) ? double.infinity : (targetRoiPct / movePct);
    final levNeedSafe = levNeed.isFinite ? levNeed.clamp(1.0, 200.0) : 200.0;
    final levNeedText = levNeed.isFinite ? levNeedSafe.toStringAsFixed(1) : '200+';
    bullets.add('${targetRoiPct.toStringAsFixed(0)}%: 이동 ${movePct.toStringAsFixed(2)}% → 필요 레버리지 ${levNeedText}x');

    // 2) ROI 게이트
    // - 기본 15%
    // - 단, 결정력이 매우 강하면(>=75) ROI 부족이어도 신호 허용(결정 신호 강제)
    final roiOk = (roiToTp >= targetRoiPct) || (decisionPower >= 75.0);

    // 3) 최종 신호 표시
    // ✅ 구간 내부는 과매매 방지: 기본적으로 신호 비활성(관망)
    // ✅ 단, 결정력이 매우 강하면(>=78) 레인지 내부라도 예외적으로 허용
    final allowInRangeByPower = decisionPower >= 78.0;
    final showSignal = !locked && consensusOk && roiOk && (allowInRangeByPower || !inRange) && prob >= AppSettings.signalMinProb;

    // 4) 5% 리스크 기준 포지션 산출
    // EntryPlanner가 이미 리스크 기반 qty(베이스) 계산을 제공.
    final qty = ep.qtyBtc;

    // 게이트 결과를 UX 문장에 반영
    final gateHint = locked
        ? 'NO-TRADE'
        : (!consensusOk
            ? '합의 부족(${hit}/${total})'
            : (!roiOk ? 'ROI 부족(${roiToTp.toStringAsFixed(0)}%)' : 'OK'));

    // 결정력 표기(UX)
    bullets.add('결정력: ${decisionPower.toStringAsFixed(0)} (종가 ${cc.score.toStringAsFixed(0)} / 돌파 ${bq.score.toStringAsFixed(0)} / 거래량 ${vq.score.toStringAsFixed(0)})');
    final signalWhy2 = '$signalWhy · 게이트: $gateHint';

    // === (2) 멀티 TF 위계 필터 ===
    // 방향(1D/4H)이 강하게 반대면, 저TF 신호는 약화(관망) 처리
    final ht = await _higherTfFilter(symbol: symbol, allowNetwork: allowNetwork, safeMode: safeMode);
    String finalDir = effDir;
    String finalTitle = effTitle;
    bool finalShow = showSignal;

    // 구조 기반 확정 보정
    if (chochWeak) {
      finalShow = false;
      finalTitle = '관망(전환확인)';
    }
    // MSB는 구조전환이 확실할 때만 확정 허용(돌파/거래량 동반)
    if (msbStrong) {
      finalShow = finalShow || (hit >= 4);
    }
    if (!locked && ht != 'NEUTRAL' && finalDir != 'NEUTRAL' && ht != finalDir) {
      // 상위TF가 반대 → 과매매 방지
      finalDir = 'NEUTRAL';
      finalTitle = '관망(상위TF 반대)';
      finalShow = false;
    }

    // 신호 강도 등급
    final grade2 = locked
        ? 'LOCK'
        : (finalShow && hit >= 5 ? 'STRONG' : (finalShow ? 'WEAK' : 'WATCH'));

    // === Flow Radar 보강 지표 (0~100) ===
    final int obPct = obScore.$3.round().clamp(0, 100);
    final int tapePct = tapeScore.$3.round().clamp(0, 100);
    final int buyPressure = (((obPct + tapePct) / 2).round()).clamp(0, 100);
    final int sellPressure = (100 - buyPressure).clamp(0, 100);
    // 체결과 오더북 괴리가 작을수록 "흡수"가 잘 이뤄진 것으로 간주
    final int absorptionScore = (100 - (tapePct - obPct).abs()).clamp(0, 100);

    // === 구조 이벤트 인덱스(정확 라벨용) ===
    int crossIdx(double level) {
      for (int i = candles.length - 1; i >= 1; i--) {
        final a = candles[i - 1].close;
        final b = candles[i].close;
        if ((a < level && b >= level) || (a > level && b <= level)) return i;
      }
      return candles.length - 1;
    }
    int touchIdxLow(double level) {
      final tol = (level * 0.0008).abs();
      for (int i = candles.length - 1; i >= 0; i--) {
        if ((candles[i].low - level).abs() <= tol) return i;
      }
      return candles.length - 1;
    }
    int touchIdxHigh(double level) {
      final tol = (level * 0.0008).abs();
      for (int i = candles.length - 1; i >= 0; i--) {
        if ((candles[i].high - level).abs() <= tol) return i;
      }
      return candles.length - 1;
    }
    final structMarks = <StructMark>[];
    final tagU = stTag.tag.toUpperCase();
    if (stTag.breakLevel > 0 && (tagU.contains('BOS') || tagU.contains('CHOCH') || tagU.contains('MSB'))) {
      final idx = crossIdx(stTag.breakLevel);
      final isUp = tagU.contains('_UP');
      final label = tagU.contains('CHOCH') ? 'CHOCH' : tagU.contains('MSB') ? 'MSB' : 'BOS';
      structMarks.add(StructMark(index: idx, price: stTag.breakLevel, label: label, isUp: isUp));
    }
    // EQL/EQH 라벨 제거(분·시간·일·주·달 공통)

    // 방어/분산(정확도 코어): 마감/돌파/거래량 + 반응구간 + 압력 조합
    final def = DefenseEngineV1.eval(
      candles: candles,
      px: px,
      support: s1,
      reactLow: reactLow,
      reactHigh: reactHigh,
      cc: cc,
      bq: bq,
      vq: vq,
    );
    final dist = DistributionEngineV1.eval(
      candles: candles,
      px: px,
      resist: r1,
      tapeBuyPct: tapePct,
      obImbalance: obPct,
      instBias: whale.instBias,
      bq: bq,
      vq: vq,
    );

    // UX: 한 줄로만 추가(과다 설명 방지)
    bullets.add('방어 ${def.score} · 분산 ${dist.score} · 흡수 ${absorptionScore}');

    // 세력(Force) = 고래점수 + 기관바이어스 + 매수압 조합
    final int forceScore = ((whale.whaleScore * 0.5) + (whale.instBias * 0.3) + (buyPressure * 0.2)).round().clamp(0, 100);
    // 스윕 리스크: SR 근접 + 흡수 약함(괴리 큼)일수록 높게
    final double atrp = _atrPct(candles);
    final double distS = ((px - s1).abs() / px) * 100.0;
    final double distR = ((r1 - px).abs() / px) * 100.0;
    final double distMin = (distS < distR) ? distS : distR;
    final int srClose = (distMin <= (atrp * 0.35)) ? 70 : 30;
    final int sweepRisk = (srClose + (100 - absorptionScore) * 0.3).round().clamp(0, 100);

    // === Zones (OB / FVG / BPR / MU-MB) ===
    // 목표: 사용자가 '딱 봐서' 반응구간을 이해하도록, 최근 데이터 기반으로
    // 과도한 계산 없이(블리츠) 핵심 존만 추출합니다.
    final fvgZones = _detectFvgZones(candles);
    // BPR: FVG 겹침 구간(간단) — 함수명 호환
    final bprZones = _detectBprZones(fvgZones);
    final obZones = _detectObZones(candles);
    final mbZones = _detectMuMbZones(candles);


    final smcZones = _buildSmcZones(candles, obZones, mbZones);
    // === FINAL DECISION FIX (3가지) ===
    // 1) 임계값(확정 조건) 너무 빡센 문제: 조건/사유를 명시
    // 2) 0~1 vs 0~100 스케일 불일치: 퍼센트 정규화
    // 3) 최종결정이 State에 안 들어가는 문제: signalDir/showSignal/reason을 여기서 확정
    
    int _pct(num v) {
      final d = v.toDouble();
      if (d <= 1.0) return (d * 100.0).round().clamp(0, 100);
      return d.round().clamp(0, 100);
    }
    
    final probP = _pct(prob);
    final confP = _pct(conf);
    final riskP = _pct(risk);
    
    final confScore = ((confP * 0.45) + (probP * 0.45) + ((100 - riskP) * 0.10)).round().clamp(0, 100);
    final confLabel = (confScore >= 75)
    ? '강함'
    : (confScore >= 60)
        ? '보통'
        : (confScore >= 45)
            ? '약함'
            : '매우 약함';
    
    // edgePct(0~100): 중립(50)에서 얼마나 벗어났나. 20 이상이면 방향성 있다고 판단
    final edgePct = ((probP - 50).abs() * 2).round().clamp(0, 100);
    
    const int MIN_HIT = 5;
    const int MIN_CONF = 60;
    const int MIN_PROB = 55;
    const int MIN_EDGE = 20;
    
    final reasons = <String>[];
    if (hit < MIN_HIT) reasons.add('근거 $hit/$total');
    if (confScore < MIN_CONF) reasons.add('결정력 ${confScore}%');
    if (probP < MIN_PROB) reasons.add('확률 ${probP}%');
    if (edgePct < MIN_EDGE) reasons.add('방향성 ${edgePct}%');
    if (!consensusOk) reasons.add('TF합의X');
    if (!roiOk) reasons.add('ROI조건X');
    
    String finalDir2 = finalDir;
    bool finalShow2 = finalShow;
    if (finalDir2 == 'NEUTRAL') reasons.add('방향중립');
    
    final ok = reasons.isEmpty;
    if (!ok) {
      finalDir2 = 'WATCH';
      finalShow2 = false;
    }
    final finalReason = ok ? '확정' : ('관망: ' + reasons.join(' · '));
    
    final st = FuState(
      price: px,
      score: score,
      confidence: confP,
      risk: riskP,
      locked: locked,
      lockedReason: lockedReason,
      decisionTitle: finalTitle,
      evidenceHit: hit,
      evidenceTotal: total,
      s1: s1,
      r1: r1,
      vwap: vwap,
      signalDir: finalDir2,
      signalProb: probP,
      signalGrade: ok ? grade2 : 'CAUTION',
      confidenceScore: confScore,
      confidenceLabel: confLabel,
      finalDecisionReason: finalReason,
      closeScore: cc.score,
      breakoutScore: bq.score,
      volumeScore: vq.score,
      signalKo: signalKo,
      signalWhy: signalWhy2,
      signalBullets: bullets,
      candles: candles,
      lossStreak: 0,

      // 세력/고래/기관 (public-data heuristics)
      whaleScore: whale.whaleScore,
      forceScore: forceScore,
      absorptionScore: absorptionScore,
      sweepRisk: sweepRisk,
      defenseScore: def.score,
      distributionScore: dist.score,
      whaleBuyPct: whale.whaleBuyPct,
      instBias: whale.instBias,
      obImbalance: obScore.$3.round().clamp(0, 100),
      tapeBuyPct: tapeScore.$3.round().clamp(0, 100),
      flowHint: _flowDecisionHint(obScore.$3, tapeScore.$3, whale.whaleBuyPct.toDouble(), whale.instBias.toDouble(), absorptionScore.toDouble(), sweepRisk.toDouble(), forceScore.toDouble(), whale.flowHint),

      // structure/reaction
      structureTag: stTag.tag,
      breakLevel: stTag.breakLevel,
      reactLevel: stTag.reactLevel,
      reactLow: reactLow,
      reactHigh: reactHigh,
      structMarks: structMarks,
      obZones: obZones,
      fvgZones: fvgZones,
      bprZones: bprZones,
      mbZones: mbZones,

        smcZones: smcZones,
      // futures plan
      entry: ep.entry,
      stop: stop,
      target: target,
      leverage: leverage,
      qty: qty,
      roiPotential: roiToTp,
      consensusOk: consensusOk,
      roiOk: roiOk,
      showSignal: finalShow2,
    );
    // === MTF hierarchy gate (4H + 1D -> 15m -> 5m trigger) ===
    FuState out = st;
    if (tf == '15m' || tf == '5m') {
      final topDir = await _getTopDir(symbol: symbol, allowNetwork: allowNetwork);
      out = _applyMtfGate(base: st, tf: tf, topDir: topDir);
    }

    // === Multi-TF pulse (strip/pressure) ===
    if (!safeMode) {
      final pulse = await _getMtfPulse(symbol: symbol, allowNetwork: allowNetwork);
      out = out.copyWith(mtfPulse: pulse);
      // 멀티TF 합의로 최종 신호(롱/숏/관망)를 한 번 더 정제
      out = _applyMtfConsensusGate(base: out);
    }

    // === Zone classifier (항상 1개 출력) ===
    final zr = const ZoneClassifierV1().classify(out);
    out = out.copyWith(
      zoneCode: zr.code,
      zoneName: zr.name,
      zoneBias: zr.bias,
      zoneStrength: zr.strength,
      zoneLongP: zr.longP,
      zoneShortP: zr.shortP,
      zoneWaitP: zr.waitP,
      zoneTrigger: zr.trigger,
      zoneInvalidLine: zr.invalidLine,
      zoneReasons: zr.reasons,
    );

    // === v12 ALL-IN-ONE: 진입/손절/목표 + NO-TRADE + 5% 리스크 카드용 값 ===
    final entryMid = (out.reactLow + out.reactHigh) / 2.0;
    final isLongBias = zr.bias == 'LONG';
    final isShortBias = zr.bias == 'SHORT';

    final stopPx = isLongBias
        ? (out.reactLow - (atrAbs * 0.8))
        : (out.reactHigh + (atrAbs * 0.8));

    final rr = 2.0;
    final targetPx = isLongBias
        ? (entryMid + (entryMid - stopPx) * rr)
        : (entryMid - (stopPx - entryMid) * rr);

    // leverage recommendation (FuState expects double)
    final double lev = ((zr.strength / 15.0).round().clamp(1, 12)).toDouble();

    // NO-TRADE lock flags (reuse mutable locked/lockedReason)

    if (zr.bias == 'WAIT') {
      locked = true;
      lockedReason = '방향 불확실 → 관망';
    } else if (out.sweepRisk >= 75) {
      locked = true;
      lockedReason = '휩쏘(함정) 위험 높음';
    } else if (out.volumeScore < 35 && out.breakoutScore < 35) {
      locked = true;
      lockedReason = '거래량/돌파 힘 부족';
    }

    out = out.copyWith(
      entry: entryMid,
      stop: stopPx,
      target: targetPx,
      risk: 5,
      leverage: lev,
      locked: locked,
      lockedReason: lockedReason,
    );

    // === P-LOCK (anti flip-flop) ===
    final nowMs = DateTime.now().millisecondsSinceEpoch;
    out = _applyPLock(key: key, symbol: symbol, tf: tf, out: out, nowMs: nowMs, closedTs: closedTs);

    unawaited(FuSignalLogger.append(out));
    _lastState[key] = out;
    return out;
  }



  /// ✅ 실시간 캔들 스트림(미완료 캔들 포함) 반영용: 네트워크 없이
  /// 구조(CHOCH/BOS) + 반응구간(reactLow/reactHigh) + SR/VWAP만 빠르게 재계산한다.
  ///
  /// - 기존 엔진 `fetch()`는 "마감 캔들(ts)" 기준으로 확정값을 캐싱한다.
  /// - UI에서는 "실시간"을 원하므로, 캔들 갱신이 들어올 때마다 최소한의 구조값을 갱신한다.
  FuState recalcLive({
    required FuState prev,
    required List<FuCandle> candles,
  }) {
    if (candles.isEmpty) return prev;

    // 실시간 가격은 마지막 캔들 종가로(또는 기존 price 유지)
    final px = (candles.last.close > 0) ? candles.last.close : prev.price;

    // SR/VWAP/구조
    final sr = _calcSr(candles, px);
    final s1 = sr.$1;
    final r1 = sr.$2;
    final vwap = _calcVwap(candles, px);

    final stTag = _structureTag(candles, px, s1, r1);

    // 반응 구간(띠) 폭: ATR(평균 캔들 range) 기반
    final atrAbs = _atrAbs(candles);
    final bandHalf = (atrAbs > 0) ? (atrAbs * 0.25) : (px * 0.0015);
    final reactLow = (stTag.reactLevel > 0) ? (stTag.reactLevel - bandHalf) : 0.0;
    final reactHigh = (stTag.reactLevel > 0) ? (stTag.reactLevel + bandHalf) : 0.0;

    // === Zones (Blitz) ===
    final liveFvg = _detectFvgZones(candles);
    final liveBpr = _detectBprZones(liveFvg);
    final liveOb = _detectObZones(candles);
    final liveMb = _detectMuMbZones(candles);

    // 최소 표시용 자동 존 (탐지 실패 시)
    final autoZone = (reactLow > 0 && reactHigh > 0)
        ? <FuZone>[FuZone(low: reactLow, high: reactHigh, label: 'REACT', dir: 0)]
        : const <FuZone>[];

    // 구조 이벤트 인덱스(실시간 갱신)
    int crossIdx(double level) {
      for (int i = candles.length - 1; i >= 1; i--) {
        final a = candles[i - 1].close;
        final b = candles[i].close;
        if ((a < level && b >= level) || (a > level && b <= level)) return i;
      }
      return candles.length - 1;
    }
    int touchIdxLow(double level) {
      final tol = (level * 0.0008).abs();
      for (int i = candles.length - 1; i >= 0; i--) {
        if ((candles[i].low - level).abs() <= tol) return i;
      }
      return candles.length - 1;
    }
    int touchIdxHigh(double level) {
      final tol = (level * 0.0008).abs();
      for (int i = candles.length - 1; i >= 0; i--) {
        if ((candles[i].high - level).abs() <= tol) return i;
      }
      return candles.length - 1;
    }
    final structMarks = <StructMark>[];
    final tagU = stTag.tag.toUpperCase();
    if (stTag.breakLevel > 0 && (tagU.contains('BOS') || tagU.contains('CHOCH') || tagU.contains('MSB'))) {
      final idx = crossIdx(stTag.breakLevel);
      final isUp = tagU.contains('_UP');
      final label = tagU.contains('CHOCH') ? 'CHOCH' : tagU.contains('MSB') ? 'MSB' : 'BOS';
      structMarks.add(StructMark(index: idx, price: stTag.breakLevel, label: label, isUp: isUp));
    }
    // EQL/EQH 라벨 제거(분·시간·일·주·달 공통)

    // 기존 신호/계획은 유지하면서, 구조/캔들/가격만 실시간으로 갱신
    return FuState(
      price: px,
      score: prev.score,
      confidence: prev.confidence,
      risk: prev.risk,
      locked: prev.locked,
      lockedReason: prev.lockedReason,
      decisionTitle: prev.decisionTitle,
      evidenceHit: prev.evidenceHit,
      evidenceTotal: prev.evidenceTotal,
      s1: s1,
      r1: r1,
      vwap: vwap,

      // 방향/확률/등급 유지
      signalDir: prev.signalDir,
      signalProb: prev.signalProb,
      signalGrade: prev.signalGrade,
      signalKo: prev.signalKo,
      signalWhy: prev.signalWhy,
      signalBullets: prev.signalBullets,

      candles: candles,
      // 실시간 존 갱신 (탐지 실패 시 기존/자동 존으로 폴백)
      obZones: liveOb.isNotEmpty ? liveOb : (prev.obZones.isNotEmpty ? prev.obZones : autoZone),
      fvgZones: liveFvg.isNotEmpty ? liveFvg : (prev.fvgZones.isNotEmpty ? prev.fvgZones : autoZone),
      bprZones: liveBpr.isNotEmpty ? liveBpr : prev.bprZones,
      mbZones: liveMb.isNotEmpty ? liveMb : prev.mbZones,
      lossStreak: prev.lossStreak,

      // flow 유지
      whaleScore: prev.whaleScore,
      forceScore: prev.forceScore,
      absorptionScore: prev.absorptionScore,
      sweepRisk: prev.sweepRisk,
      defenseScore: prev.defenseScore,
      distributionScore: prev.distributionScore,
      whaleBuyPct: prev.whaleBuyPct,
      instBias: prev.instBias,
      obImbalance: prev.obImbalance,
      tapeBuyPct: prev.tapeBuyPct,
      flowHint: prev.flowHint,

      // structure/reaction 실시간 갱신
      structureTag: stTag.tag,
      breakLevel: stTag.breakLevel,
      reactLevel: stTag.reactLevel,
      reactLow: reactLow,
      reactHigh: reactHigh,
      structMarks: structMarks,

      // MTF 스트립은 유지(실시간 캔들 갱신 시 사라지지 않게)
      mtfPulse: prev.mtfPulse,

      // futures plan 유지
      entry: prev.entry,
      stop: prev.stop,
      target: prev.target,
      leverage: prev.leverage,
      qty: prev.qty,
      roiPotential: prev.roiPotential,
      consensusOk: prev.consensusOk,
      roiOk: prev.roiOk,
      showSignal: prev.showSignal,
    );
  }
  double _atrPct(List<FuCandle> candles, {int period = 14}) {
    if (candles.length < period + 2) return 0.8; // fallback
    final start = math.max(0, candles.length - period);
    double sum = 0;
    for (int i = start; i < candles.length; i++) {
      final c = candles[i];
      sum += (c.high - c.low).abs();
    }
    final avgRange = sum / (candles.length - start);
    final last = candles.last.close;
    if (last <= 0) return 0.8;
    return (avgRange / last) * 100.0;
  }

  // 평균 캔들 변동폭(절대값) - 반응구간(띠) 폭 계산에 사용
  double _atrAbs(List<FuCandle> candles, {int period = 14}) {
    if (candles.length < period + 2) return 0;
    final start = math.max(0, candles.length - period);
    double sum = 0;
    for (int i = start; i < candles.length; i++) {
      final c = candles[i];
      sum += (c.high - c.low).abs();
    }
    return sum / (candles.length - start);
  }

  // ATR(절대값) - 기존 코드 호환용 별칭
  // 엄격한 TR(이전 종가 포함) 대신, 미니 차트/존 계산엔 평균 range(high-low)로 충분합니다.
  double _atr(List<FuCandle> candles, int period) {
    return _atrAbs(candles, period: period);
  }

  Future<String> _higherTfFilter({
    required String symbol,
    required bool allowNetwork,
    required bool safeMode,
  }) async {
    // 4H + 1D 를 “방향”으로 사용
    if (!allowNetwork || safeMode) return 'NEUTRAL';
    final c4h = await _tryBitgetCandles(symbol: symbol, tf: '4h');
    final c1d = await _tryBitgetCandles(symbol: symbol, tf: '1d');
    final d4h = _dirFromCandles(c4h);
    final d1d = _dirFromCandles(c1d);
    // 둘 다 같은 방향이면 강하게 채택
    if (d4h != 'NEUTRAL' && d4h == d1d) return d4h;
    return 'NEUTRAL';
  }

  String _dirFromCandles(List<FuCandle>? candles) {
    if (candles == null || candles.length < 10) return 'NEUTRAL';
    final last = candles.last.close;
    final first = candles[candles.length - 10].close;
    if (last <= 0 || first <= 0) return 'NEUTRAL';
    final chg = (last - first) / first;
    if (chg > 0.003) return 'LONG';
    if (chg < -0.003) return 'SHORT';
    return 'NEUTRAL';
  }

  /// 2010-01-01 00:00:00 UTC (ms) — 주/달/년봉 과거 데이터 페이지네이션 목표
  static const int _historyFrom2010Ms = 1262304000000;
  /// 2022년 11월 1일 00:00 UTC (ms) — 주봉/달봉 "2022년 11월부터 지금까지" 목표
  // 최소 로딩 목표: 2011-07-01 (UTC)
  static const int _jul2011Ms = 1309478400000;

  Future<List<FuCandle>?> _tryBitgetCandles({required String symbol, required String tf}) async {
    final intervals = _tfToBitgetIntervals(tf);
    if (intervals == null || intervals.isEmpty) return null;

    final tfU = tf.trim().toUpperCase();

    // 1D/1W/1M/1Y: 전체 차트(장기) 필요 → 일봉을 끝까지 페이징으로 가져온 뒤 집계
    if (_needHistoryTo2010(tfU)) {
      final rawAll = await _fetchCandlesPaginated(symbol: symbol, interval: '1D');
      if (rawAll.isEmpty) return null;

      final outAll = <FuCandle>[];
      for (final row in rawAll) {
        try {
          final ts = int.parse('${row[0]}');
          outAll.add(FuCandle(
            ts: ts,
            open: _toDouble(row[1]),
            high: _toDouble(row[2]),
            low: _toDouble(row[3]),
            close: _toDouble(row[4]),
            volume: row.length > 5 ? _toDouble(row[5]) : 0,
          ));
        } catch (_) {}
      }
      outAll.sort((a, b) => a.ts.compareTo(b.ts));

      if (tfU == '1W') return FuCandleAggregate.toWeek(outAll);
      if (tfU == '1M') return FuCandleAggregate.toMonth(outAll);
      if (tfU == '1Y') return FuCandleAggregate.toYear(outAll);
      return outAll;
    }

    List<dynamic> raw = const [];
    for (final interval in intervals) {
      raw = await BitgetPublic.getCandlesRaw(
        category: 'USDT-FUTURES',
        symbol: symbol,
        interval: interval,
        limit: 200,
      );
      if (raw.isNotEmpty) break;
    }
    if (raw.isEmpty) return null;

    double d(dynamic v) {
      if (v == null) return 0.0;
      if (v is num) return v.toDouble();
      return double.tryParse(v.toString()) ?? 0.0;
    }

    int i(dynamic v) {
      if (v == null) return 0;
      if (v is num) return v.toInt();
      return int.tryParse(v.toString()) ?? 0;
    }

    final out = <FuCandle>[];
    final seenTs = <int>{};
    for (final arr in raw) {
      if (arr.length < 5) continue;
      final ts = i(arr[0]);
      if (seenTs.contains(ts)) continue;
      seenTs.add(ts);
      final open = d(arr[1]);
      final high = d(arr[2]);
      final low = d(arr[3]);
      final close = d(arr[4]);
      final vol = arr.length > 5 ? d(arr[5]) : 0.0;
      out.add(FuCandle(open: open, high: high, low: low, close: close, ts: ts, volume: vol));
    }
    out.sort((a, b) => a.ts.compareTo(b.ts));
    return out.isEmpty ? null : out;
  }

  bool _needHistoryTo2010(String tf) {
    final t = tf.trim().toUpperCase();
    return t == '1D' || t == '1W' || t == '1M' || t == '1Y';
  }

  /// 주/달/년봉: 2022년 11월부터 현재까지 페이지네이션으로 수집
  /// Bitget: before=과거(더 오래된 캔들), after=미래(더 최신). 첫 호출은 최신 200개, 이후 before=가장 오래된 ts로 이전 구간 요청.
  Future<List<dynamic>> _fetchCandlesPaginated({required String symbol, required String interval}) async {
    final all = <List<dynamic>>[];
    int? before;
    const maxRounds = 25;
    for (int round = 0; round < maxRounds; round++) {
      final raw = await BitgetPublic.getCandlesRaw(
        category: 'USDT-FUTURES',
        symbol: symbol,
        interval: interval,
        limit: 200,
        before: before,
      );
      if (raw.isEmpty) break;
      all.addAll(raw);
      int i(dynamic v) {
        if (v == null) return 0;
        if (v is num) return v.toInt();
        return int.tryParse(v.toString()) ?? 0;
      }
      int oldestTs = 0;
      for (final arr in raw) {
        if (arr.length > 0) {
          final ts = i(arr[0]);
          if (oldestTs == 0 || ts < oldestTs) oldestTs = ts;
        }
      }
      if (oldestTs <= 0) break;
      if (oldestTs <= _jul2011Ms) break;
      if (raw.length < 200) break;
      before = oldestTs;
      await Future<void>.delayed(const Duration(milliseconds: 220));
    }
    return all;
  }

  /// Bitget 캔들 interval 매핑.
  /// - 앱은 소문자/대문자 혼용(tfStrip: 1d, 1D 등) 가능 → 여기서 모두 흡수
  /// - 1m 은 거래소/엔드포인트에 따라 표기가 달라서 후보를 순서대로 시도
  List<String>? _tfToBitgetIntervals(String tf) {
    final t = tf.trim();
    // 월봉은 '1M' (대문자)로 들어오는 케이스가 많아서 먼저 분기
    if (t == '1M') return const ['1M'];

    final tl = t.toLowerCase();
    switch (tl) {
      case '1m':
        // 분봉(1m): 거래소/엔드포인트에 따라 표기가 다를 수 있어 후보를 순서대로 시도
        // 우선순위: 1m → 1min → 5m(대체)
        return const ['1m', '1min', '5m'];
      case '5m':
        return const ['5m'];
      case '15m':
        return const ['15m'];
      case '30m':
        return const ['30m'];
      case '1h':
        return const ['1H'];
      case '4h':
        return const ['4H'];
      case '1d':
        return const ['1D'];
      case '1w':
        // 주봉: 일부 엔드포인트는 1W 미지원 → 1D를 받아 앱에서 주봉으로 집계
        return const ['1D'];
      case '1y':
        // 년봉: 1D를 받아 앱에서 연봉으로 집계
        return const ['1D'];
      default:
        if (t == '1D') return const ['1D'];
        if (t == '1W') return const ['1W'];
        if (t == '1Y') return const ['1M'];
        return null;
    }
  }

  // 하위 호환(기존 호출부가 남아있을 수 있음)
  String? _tfToBitgetInterval(String tf) {
    final arr = _tfToBitgetIntervals(tf);
    return (arr == null || arr.isEmpty) ? null : arr.first;
  }

  double _mockPrice(String symbol) {
    final base = symbol.startsWith('BTC') ? 100000.0 : 1.0;
    final t = DateTime.now().millisecondsSinceEpoch / 1000.0;
    final wave = math.sin(t / 20) * 700 + math.sin(t / 7) * 220;
    return base + wave;
  }

  List<FuCandle> _mockCandles(double last, String tf) {
    // 데이터가 없을 때 차트가 '너무 짧아 보이는' 문제 방지
    // (OB/FVG/BPR/CHOCH/BOS 같은 구조 라벨은 최소 150~200봉은 있어야 유의미)
    final n = 200;
    final now = DateTime.now().millisecondsSinceEpoch;
    final dt = _tfMillis(tf);
    final candles = <FuCandle>[];
    var prev = last;

    for (int i = n - 1; i >= 0; i--) {
      final ts = now - (i * dt);
      final drift = (i % 7 == 0 ? 0.006 : 0.002);
      final noise = (_rng.nextDouble() - 0.5) * 0.010;
      final change = (drift + noise) * (_rng.nextBool() ? 1 : -1);
      final close = prev * (1 + change);
      final open = prev;
      final high = math.max(open, close) * (1 + _rng.nextDouble() * 0.003);
      final low = math.min(open, close) * (1 - _rng.nextDouble() * 0.003);
      candles.add(FuCandle(open: open, high: high, low: low, close: close, ts: ts));
      prev = close;
    }
    return candles;
  }

  List<FuZone> _mockZones(List<FuCandle> c) {
    if (c.length < 8) return const [];
    final last = c.last.close;
    return [
      FuZone(low: last * 0.992, high: last * 0.996),
      FuZone(low: last * 1.004, high: last * 1.008),
    ];
  }

  /// 최근 캔들에서 지지/저항(단순) 계산: 최근 20봉의 최저/최고
  (double, double) _calcSr(List<FuCandle> c, double px) {
    if (c.isEmpty) return (px * 0.98, px * 1.02);
    final n = c.length < 24 ? c.length : 24;
    final sub = c.sublist(c.length - n);
    double lo = sub.first.low;
    double hi = sub.first.high;
    for (final k in sub) {
      if (k.low < lo) lo = k.low;
      if (k.high > hi) hi = k.high;
    }
    // 너무 붙으면 최소 폭 확보
    if ((hi - lo).abs() < px * 0.002) {
      lo = px * 0.99;
      hi = px * 1.01;
    }
    return (lo, hi);
  }

  double _calcVwap(List<FuCandle> c, double px) {
    if (c.isEmpty) return px;
    // volume 없으면 close 평균으로 대체
    double vSum = 0;
    double pv = 0;
    for (final k in c.take(40)) {
      final v = (k.volume <= 0 ? 1.0 : k.volume);
      vSum += v;
      pv += k.close * v;
    }
    return vSum == 0 ? px : (pv / vSum);
  }

  /// SR 게이트: 현재가가 지지/저항에 얼마나 가까운지로 LONG/SHORT 힌트
  (String, double, double, double) _srGate(double px, double s1, double r1) {
    final range = (r1 - s1).abs().clamp(1.0, 1e18);
    final nearS = (1 - ((px - s1).abs() / range)).clamp(0.0, 1.0);
    final nearR = (1 - ((r1 - px).abs() / range)).clamp(0.0, 1.0);
    final holdPct = (55.0 + nearS * 45.0).clamp(0.0, 100.0).toDouble();
    final brkPct = (55.0 + nearR * 45.0).clamp(0.0, 100.0).toDouble();
    // vote
    if (nearS > 0.72 && nearR < 0.55) {
      return ('LONG', (nearS * 100.0).clamp(0.0, 100.0).toDouble(), holdPct, brkPct);
    }
    if (nearR > 0.72 && nearS < 0.55) {
      return ('SHORT', (nearR * 100.0).clamp(0.0, 100.0).toDouble(), holdPct, brkPct);
    }
    return (
      'NEUTRAL',
      ((nearS + nearR) * 50.0).clamp(0.0, 100.0).toDouble(),
      holdPct,
      brkPct,
    );
  }

  /// 오더북 압력: 현재가 근처(±0.25%)의 bid/ask 물량으로 LONG/SHORT 힌트
  (String, double, double, double) _orderbookPressure(Map<String, dynamic>? ob, double px) {
    if (ob == null || px <= 0) return ('NEUTRAL', 40.0, 50.0, 50.0);
    final bids = (ob['b'] is List) ? (ob['b'] as List) : const [];
    final asks = (ob['a'] is List) ? (ob['a'] as List) : const [];
    final band = px * 0.0025;
    double bSum = 0, aSum = 0;
    double d(dynamic v) {
      if (v == null) return 0.0;
      if (v is num) return v.toDouble();
      return double.tryParse(v.toString()) ?? 0.0;
    }
    for (final row in bids) {
      if (row is! List || row.length < 2) continue;
      final p = d(row[0]);
      final q = d(row[1]);
      if ((px - p).abs() <= band) bSum += q;
    }
    for (final row in asks) {
      if (row is! List || row.length < 2) continue;
      final p = d(row[0]);
      final q = d(row[1]);
      if ((p - px).abs() <= band) aSum += q;
    }
    final t = bSum + aSum;
    if (t <= 0) return ('NEUTRAL', 40.0, 50.0, 50.0);
    final buyPct = (bSum / t * 100.0).clamp(0.0, 100.0).toDouble();
    final sellPct = (aSum / t * 100.0).clamp(0.0, 100.0).toDouble();
    final pressure = (bSum - aSum) / t; // -1..+1
    final strength = (pressure.abs() * 100.0).clamp(0.0, 100.0).toDouble();
    if (pressure > 0.10) return ('LONG', strength, buyPct, sellPct);
    if (pressure < -0.10) return ('SHORT', strength, buyPct, sellPct);
    return ('NEUTRAL', (40.0 + strength * 0.4).clamp(0.0, 100.0).toDouble(), buyPct, sellPct);
  }

  /// 최근 체결(100개) BUY/SELL 우세로 LONG/SHORT 힌트
  (String, double, double, double, String) _tapeImbalance(List<Map<String, dynamic>> fills) {
    if (fills.isEmpty) return ('NEUTRAL', 35.0, 50.0, 50.0, '평균');
    double buy = 0, sell = 0;
    double d(dynamic v) {
      if (v == null) return 0.0;
      if (v is num) return v.toDouble();
      return double.tryParse(v.toString()) ?? 0.0;
    }
    for (final f in fills) {
      final side = (f['side'] ?? f['tradeSide'] ?? '').toString().toLowerCase();
      final sz = d(f['size'] ?? f['sz'] ?? f['qty']);
      if (side.contains('buy')) buy += sz;
      else if (side.contains('sell')) sell += sz;
    }
    final t = buy + sell;
    if (t <= 0) return ('NEUTRAL', 35.0, 50.0, 50.0, '평균');
    final buyPct = (buy / t * 100.0).clamp(0.0, 100.0).toDouble();
    final sellPct = (sell / t * 100.0).clamp(0.0, 100.0).toDouble();
    final ratio = buy / t; // 0..1
    final strength = ((ratio - 0.5).abs() * 200.0).clamp(0.0, 100.0).toDouble();
    final hint = ratio > 0.58 ? '매수 우세' : (ratio < 0.42 ? '매도 우세' : '혼조');
    if (ratio > 0.55) return ('LONG', strength, buyPct, sellPct, hint);
    if (ratio < 0.45) return ('SHORT', strength, buyPct, sellPct, hint);
    return ('NEUTRAL', (30.0 + strength * 0.4).clamp(0.0, 100.0).toDouble(), buyPct, sellPct, hint);
  }

  /// 고래/기관 힌트: 최근 체결에서 큰 사이즈 비중 + 오더북/체결 괴리로 흡수/세력 느낌을 단순 추정
  ({int whaleScore, int whaleBuyPct, int instBias, String flowHint}) _whaleHeuristic(
    List<Map<String, dynamic>> fills, {
    required double obBuyPct,
    required double tapeBuyPct,
  }) {
    if (fills.isEmpty) {
      return (whaleScore: 0, whaleBuyPct: 50, instBias: ((obBuyPct + tapeBuyPct) / 2).round().clamp(0, 100), flowHint: '데이터 부족');
    }

    double d(dynamic v) {
      if (v == null) return 0.0;
      if (v is num) return v.toDouble();
      return double.tryParse(v.toString()) ?? 0.0;
    }

    final sizes = <double>[];
    double total = 0, whaleTotal = 0, whaleBuy = 0;
    final parsed = <({double sz, bool isBuy})>[];
    for (final f in fills) {
      final side = (f['side'] ?? f['tradeSide'] ?? '').toString().toLowerCase();
      final sz = d(f['size'] ?? f['sz'] ?? f['qty']);
      if (sz <= 0) continue;
      final isBuy = side.contains('buy');
      sizes.add(sz);
      total += sz;
      parsed.add((sz: sz, isBuy: isBuy));
    }
    if (total <= 0 || sizes.length < 5) {
      return (whaleScore: 0, whaleBuyPct: 50, instBias: ((obBuyPct + tapeBuyPct) / 2).round().clamp(0, 100), flowHint: '데이터 부족');
    }
    sizes.sort();
    final idx = (sizes.length * 0.90).floor().clamp(0, sizes.length - 1);
    final p90 = sizes[idx];
    // 너무 작아지는 경우 방지
    final thr = math.max(p90, (total / sizes.length) * 2.5);

    for (final e in parsed) {
      if (e.sz >= thr) {
        whaleTotal += e.sz;
        if (e.isBuy) whaleBuy += e.sz;
      }
    }

    final whaleRatio = (whaleTotal / total).clamp(0.0, 1.0);
    final whaleScore = (whaleRatio * 220.0).clamp(0.0, 100.0).round();
    final whaleBuyPct = (whaleTotal <= 0 ? 50.0 : (whaleBuy / whaleTotal * 100.0)).clamp(0.0, 100.0).round();

    // 기관/세력 방향성: 오더북 + 체결 + 고래 매수 비중을 혼합
    final instBias = ((obBuyPct * 0.35) + (tapeBuyPct * 0.35) + (whaleBuyPct * 0.30)).round().clamp(0, 100);

    // 흡수(Absorption) 힌트: 체결 매수 우세인데 오더북은 매도벽(또는 반대)
    final delta = (tapeBuyPct - obBuyPct);
    String hint;
    if (delta > 12 && tapeBuyPct > 55) hint = '매수 유입↗ / 매도벽 흡수?';
    else if (delta < -12 && tapeBuyPct < 45) hint = '매도 유입↘ / 매수벽 흡수?';
    else hint = '균형/혼조';
    if (whaleScore >= 55) hint = '고래 활동↑ · $hint';

    return (whaleScore: whaleScore, whaleBuyPct: whaleBuyPct, instBias: instBias, flowHint: hint);
  }

  /// 거래량 스파이크: 마지막 봉 volume / 최근 평균
  (String, double, double, double, String) _volumeSpike(List<FuCandle> c) {
    if (c.length < 12) return ('NEUTRAL', 30.0, 0.0, 0.0, '데이터 부족');
    final n = c.length < 21 ? c.length : 21;
    final sub = c.sublist(c.length - n);
    final lastV = sub.last.volume;
    double avg = 0;
    for (final k in sub.take(sub.length - 1)) {
      avg += (k.volume <= 0 ? 0 : k.volume);
    }
    avg = avg / math.max(1, sub.length - 1);
    if (avg <= 0 || lastV <= 0) return ('NEUTRAL', 35.0, 0.0, 0.0, '평균');
    final r = (lastV / avg);
    final strength = ((r - 1).abs() * 35.0).clamp(0.0, 100.0).toDouble();
    final hint = r >= 1.8 ? '급증' : (r >= 1.2 ? '증가' : (r <= 0.7 ? '감소' : '평균'));
    // volume은 방향성이 없으므로, 최근 캔들의 방향으로 vote를 살짝 부여
    final dir = sub.last.close >= sub.last.open ? 'LONG' : 'SHORT';
    return (
      hint == '평균' ? 'NEUTRAL' : dir,
      (40.0 + strength * 0.6).clamp(0.0, 100.0).toDouble(),
      0.0,
      0.0,
      hint,
    );
  }

  /// 모멘텀: 단기 SMA 대비 현재가
  (String, double, double, double, String) _momentum(List<FuCandle> c) {
    if (c.length < 12) return ('NEUTRAL', 35.0, 0.0, 0.0, '데이터 부족');
    final n = c.length < 15 ? c.length : 15;
    final sub = c.sublist(c.length - n);
    double sma = 0;
    for (final k in sub) {
      sma += k.close;
    }
    sma /= sub.length;
    final px = sub.last.close;
    final diffPct = ((px - sma) / (sma == 0 ? 1 : sma)).clamp(-0.2, 0.2);
    final strength = (diffPct.abs() * 500.0).clamp(0.0, 100.0).toDouble();
    if (diffPct > 0.01) return ('LONG', (40.0 + strength * 0.6).clamp(0.0, 100.0).toDouble(), 0.0, 0.0, '상승');
    if (diffPct < -0.01) return ('SHORT', (40.0 + strength * 0.6).clamp(0.0, 100.0).toDouble(), 0.0, 0.0, '하락');
    return ('NEUTRAL', (35.0 + strength * 0.3).clamp(0.0, 100.0).toDouble(), 0.0, 0.0, '횡보');
  }

  // ------------------------------
  // Zone detectors (Blitz / Lightweight)
  // ------------------------------

  /// GAP 개편: TF별 Zone 중첩을 병합해서 차트가 지저분해지는 것을 방지.
  /// - 표시를 OFF 하더라도(기본값), 엔진/확률 계산은 이 병합 결과를 사용.
  List<FuZone> _mergeZones(List<FuZone> zones, {double overlapPct = 0.35}) {
    if (zones.isEmpty) return const <FuZone>[];
    final zs = [...zones]
      ..removeWhere((z) => !(z.low.isFinite && z.high.isFinite) || z.low <= 0 || z.high <= 0)
      ..sort((a, b) => a.low.compareTo(b.low));

    final out = <FuZone>[];
    FuZone cur = zs.first;
    for (int i = 1; i < zs.length; i++) {
      final n = zs[i];
      final lo = math.max(cur.low, n.low);
      final hi = math.min(cur.high, n.high);
      final inter = (hi - lo);
      final minW = math.min((cur.high - cur.low).abs(), (n.high - n.low).abs());
      final bool overlaps = inter > 0 && (inter / (minW == 0 ? 1 : minW)) >= overlapPct;

      if (overlaps) {
        // 병합: 범위 확장 + 라벨은 짧게(표시용)
        cur = FuZone(
          low: math.min(cur.low, n.low),
          high: math.max(cur.high, n.high),
          label: cur.label.isNotEmpty ? cur.label : n.label,
          dir: (cur.dir != 0) ? cur.dir : n.dir,
          iStart: cur.iStart ?? n.iStart,
          iEnd: cur.iEnd ?? n.iEnd,
        );
      } else {
        out.add(cur);
        cur = n;
      }
    }
    out.add(cur);
    return out;
  }

  List<FuZone> _applyBreakerTransform(List<FuZone> zones, List<FuCandle> candles) {
    // Breaker Block (BB) heuristic:
    // - Bullish OB (Bu-OB) broken below => becomes bearish breaker (Be-BB)
    // - Bearish OB (Be-OB) broken above => becomes bullish breaker (Bu-BB)
    if (zones.isEmpty || candles.isEmpty) return zones;
    final last = candles.last;
    final out = <FuZone>[];
    for (final z in zones) {
      if (z.dir == 1 && last.close < z.low) {
        out.add(FuZone(low: z.low, high: z.high, label: 'Be-BB', dir: -1, iStart: z.iStart, iEnd: z.iEnd));
      } else if (z.dir == -1 && last.close > z.high) {
        out.add(FuZone(low: z.low, high: z.high, label: 'Bu-BB', dir: 1, iStart: z.iStart, iEnd: z.iEnd));
      } else {
        out.add(z);
      }
    }
    return out;
  }

  List<FuZone> _detectFvgZones(List<FuCandle> candles, {int maxZones = 3}) {
    // Bullish FVG: candle[i-2].high < candle[i].low
    // Bearish FVG: candle[i-2].low > candle[i].high
    if (candles.length < 8) return const <FuZone>[];
    final out = <FuZone>[];
    final start = candles.length - 1;
    final end = (candles.length - 160).clamp(2, candles.length - 1);
    for (int i = start; i >= end; i--) {
      final a = candles[i - 2];
      final c = candles[i];
      if (a.high < c.low) {
        out.add(FuZone(low: a.high, high: c.low, label: 'FVG', dir: 1));
      } else if (a.low > c.high) {
        out.add(FuZone(low: c.high, high: a.low, label: 'FVG', dir: -1));
      }
      if (out.length >= maxZones) break;
    }
    return _mergeZones(out);
  }

  List<FuZone> _detectBprZones(List<FuZone> fvgZones) {
    // BPR: 최근 Bullish FVG와 Bearish FVG의 겹치는 구간(intersection)
    // 겹치면 2개 존(BPR1/2)로 쪼개서 차트에 표현.
    FuZone? bull;
    FuZone? bear;
    for (final z in fvgZones) {
      if (z.dir == 1 && bull == null) bull = z;
      if (z.dir == -1 && bear == null) bear = z;
    }
    if (bull == null || bear == null) return const <FuZone>[];
    final low = bull.low > bear.low ? bull.low : bear.low;
    final high = bull.high < bear.high ? bull.high : bear.high;
    if (high <= low) return const <FuZone>[];
    final mid = (low + high) / 2.0;
    return <FuZone>[
      FuZone(low: mid, high: high, label: 'BPR 1', dir: 0),
      FuZone(low: low, high: mid, label: 'BPR 2', dir: 0),
    ];
  }

  List<FuZone> _detectObZones(List<FuCandle> candles, {int maxZones = 2}) {
    // 아주 단순한 OB: 강한 변위(displacement) 직전의 반대색 캔들
    if (candles.length < 20) return const <FuZone>[];
    final out = <FuZone>[];
    final atr = _atr(candles, 14);
    final lookback = candles.length - 1;
    final end = (candles.length - 120).clamp(2, candles.length - 1).toInt();
    for (int i = lookback; i >= end; i--) {
      final c = candles[i];
      final body = (c.close - c.open).abs();
      final range = (c.high - c.low).abs();
      final isDisplacement = range > atr * 1.4 && body > atr * 0.7;
      if (!isDisplacement) continue;
      // 이전 1~3개 중 반대색 캔들을 OB로 잡음
      final jEnd = (i - 4).clamp(0, i - 1).toInt();
      for (int j = i - 1; j >= jEnd; j--) {
        final p = candles[j];
        final bullishMove = c.close > c.open;
        final pIsOpposite = bullishMove ? (p.close < p.open) : (p.close > p.open);
        if (!pIsOpposite) continue;
        final low = p.low;
        final high = bullishMove ? p.open : p.open; // open 기준(보수적)
        out.add(FuZone(
          low: low,
          high: (high > low) ? high : p.high,
          label: bullishMove ? 'Bu-OB' : 'Be-OB',
          dir: bullishMove ? 1 : -1,
        ));
        // keep scanning for 2nd zone
      }
      if (out.length >= maxZones) break;
    }
    final merged = _mergeZones(out);
    return _applyBreakerTransform(merged, candles);
  }

  List<FuZone> _detectMuMbZones(List<FuCandle> candles) {
    // PO3 관점의 간단한 Manipulation 존: 최근 박스 범위를 살짝 이탈했다가 복귀한 구간
    if (candles.length < 60) return const <FuZone>[];
    final atr = _atr(candles, 14);
    final n = 40;
    final window = candles.sublist(candles.length - n);
    double hi = window.first.high, lo = window.first.low;
    for (final c in window) {
      if (c.high > hi) hi = c.high;
      if (c.low < lo) lo = c.low;
    }
    // sweep: lo 아래로 atr*0.8 이상 찍고, 다시 lo 위로 회복한 경우(상승 시나리오)
    final last = candles.last;
    // 최근 8개에서 sweep 찾기
    final iEnd = (candles.length - 10).clamp(0, candles.length - 1).toInt();
    for (int i = candles.length - 1; i >= iEnd; i--) {
      final c = candles[i];
      final downSweep = (c.low < lo - atr * 0.8) && (last.close > lo);
      final upSweep = (c.high > hi + atr * 0.8) && (last.close < hi);
      if (downSweep) {
        return <FuZone>[FuZone(low: c.low, high: lo, label: 'Bu-MB', dir: 1)];
      }
      if (upSweep) {
        return <FuZone>[FuZone(low: hi, high: c.high, label: 'Be-MB', dir: -1)];
      }
    }
    return const <FuZone>[];
  }

  int _tfMillis(String tf) {
    switch (tf) {
      case '5m': return 5 * 60 * 1000;
      case '15m': return 15 * 60 * 1000;
      case '1h': return 60 * 60 * 1000;
      case '4h': return 4 * 60 * 60 * 1000;
      case '1D': return 24 * 60 * 60 * 1000;
      case '1W': return 7 * 24 * 60 * 60 * 1000;
      case '1M': return 30 * 24 * 60 * 60 * 1000;
      case '1Y': return 365 * 24 * 60 * 60 * 1000;
      default: return 15 * 60 * 1000;
    }
  }

  List<FuZone> _buildSmcZones(List<FuCandle> candles, List<FuZone> obZones, List<FuZone> mbZones) {
    final n = candles.length;
    if (n == 0) return const [];
    final startDefault = n > 120 ? n - 120 : 0;
    FuZone withSpan(FuZone z, String label) => FuZone(
      low: z.low,
      high: z.high,
      label: label,
      dir: z.dir,
      iStart: z.iStart ?? startDefault,
      iEnd: z.iEnd ?? (n - 1),
    );
    final out = <FuZone>[];
    for (final z in obZones) {
      out.add(withSpan(z, z.dir > 0 ? 'Bu-OB' : 'Be-OB'));
      out.add(withSpan(z, z.dir > 0 ? 'Bu-BB' : 'Be-BB'));
    }
    for (final z in mbZones) {
      out.add(withSpan(z, z.dir > 0 ? 'Bu-MB' : 'Be-MB'));
    }
    final seen = <String>{};
    final dedup = <FuZone>[];
    for (final z in out) {
      final key = '${z.label}|${(z.low * 100).round()}|${(z.high * 100).round()}|${z.dir}';
      if (seen.add(key)) dedup.add(z);
    }
    return dedup;
  }
}

// PATCH-3 FIX: missing helper in some branches.
// Lightweight + compile-safe: uses only public-data heuristics.
extension _FuEngineFlowHint on FuEngine {
  String _flowDecisionHint(
    double obImb,
    double tapeBuy,
    double whaleBuy,
    double instBias,
    double absorption,
    double sweepRisk,
    double forceScore,
    String whaleHint,
  ) {
    // Normalize inputs
    final ob = obImb.clamp(0.0, 100.0);
    final tape = tapeBuy.clamp(0.0, 100.0);
    final whale = whaleBuy.clamp(0.0, 100.0);
    final inst = instBias.clamp(0.0, 100.0);
    final abs = absorption.clamp(0.0, 100.0);
    final sweep = sweepRisk.clamp(0.0, 100.0);
    final force = forceScore.clamp(0.0, 100.0);

    // Quick directional read
    final buyBias = (tape * 0.35) + (ob * 0.25) + (whale * 0.20) + (inst * 0.20);
    final sellBias = ((100.0 - tape) * 0.35) + ((100.0 - ob) * 0.25) + ((100.0 - whale) * 0.20) + ((100.0 - inst) * 0.20);

    final riskTag = (sweep >= 70.0) ? ' ⚠️스윕' : '';
    final absTag = (abs >= 70.0) ? ' 흡수' : (abs <= 30.0 ? ' 약함' : '');
    final forceTag = (force >= 70.0) ? ' 강함' : (force <= 30.0 ? ' 약함' : '');

    if (buyBias - sellBias >= 12.0) {
      return '매수 우세${absTag}${forceTag}${riskTag}'.trim();
    }
    if (sellBias - buyBias >= 12.0) {
      return '매도 우세${absTag}${forceTag}${riskTag}'.trim();
    }

    // Fallback to whale hint if provided
    final w = whaleHint.trim();
    if (w.isNotEmpty) {
      return '$w$riskTag'.trim();
    }
    return '중립${riskTag}'.trim();
  }
}

// 내부 스윙 포인트 자료형 (pivot)
class _Pivot {
  final int index;
  final double price;
  const _Pivot({required this.index, required this.price});

// === MTF aggregation helpers (static) ===
static double _avgPulseScore(Map<String, FuTfPulse> pulses) {
  if (pulses.isEmpty) return 0.0;
  final vals = <double>[];
  for (final p in pulses.values) {
    vals.add(p.strength.toDouble());
  }
  if (vals.isEmpty) return 0.0;
  final sum = vals.fold<double>(0.0, (a, b) => a + b);
  return sum / vals.length;
}

static String _bestPulseGrade(Map<String, FuTfPulse> pulses) {
  if (pulses.isEmpty) return 'NA';
  String best = 'NA';
  int bestRank = -1;
  for (final p in pulses.values) {
    
final g = (() {
  final s = p.strength;
  final r = p.risk;
  int score = s - (r ~/ 2) + (p.inReaction ? 10 : 0);
  final d = p.dir.toUpperCase();
  if (d == 'WATCH' || d == 'NEUTRAL') score -= 10;
  if (score < 0) score = 0;
  if (score > 100) score = 100;
  if (score >= 90) return 'SSS++';
  if (score >= 80) return 'SSS';
  if (score >= 72) return 'SS+';
  if (score >= 65) return 'SS';
  if (score >= 58) return 'S+';
  if (score >= 50) return 'S';
  if (score >= 42) return 'A';
  if (score >= 34) return 'B';
  if (score >= 26) return 'C';
  if (score >= 18) return 'D';
  if (score >= 10) return 'E';
  return 'F';
})();
    final r = _gradeRank(g);
    if (r > bestRank) {
      bestRank = r;
      best = g;
    }
  }
  return best;
}

static int _gradeRank(String g) {
  final s = g.trim().toUpperCase();
  final plus = RegExp(r'\+').allMatches(s).length;
  final core = s.replaceAll(RegExp(r'[^A-Z]'), '');
  int base;
  if (core.startsWith('SSS')) base = 60;
  else if (core.startsWith('SS')) base = 50;
  else if (core.startsWith('S')) base = 40;
  else if (core.startsWith('A')) base = 30;
  else if (core.startsWith('B')) base = 25;
  else if (core.startsWith('C')) base = 20;
  else if (core.startsWith('D')) base = 15;
  else if (core.startsWith('E')) base = 10;
  else if (core.startsWith('F')) base = 5;
  else base = 0;
  return base + plus;
}

}

// === internal: P-LOCK state ===
class _PLock {
  final String dir;
  final int prob;
  final int conf;
  final double entry;
  final double sl;
  final double tp1;
  final double tp2;
  final double tp3;
  final int untilMs;
  final String why;

  const _PLock({
    required this.dir,
    required this.prob,
    required this.conf,
    required this.entry,
    required this.sl,
    required this.tp1,
    required this.tp2,
    required this.tp3,
    required this.untilMs,
    required this.why,
  });
}
