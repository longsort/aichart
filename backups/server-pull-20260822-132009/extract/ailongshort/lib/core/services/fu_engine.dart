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
  // ??? ë¬¼ ? í˜¸ ìµœì†Œ ê°•ë„(%) - ??ê°?ë¯¸ë§Œ?´ë©´ ? í˜¸??'ê´€ë§?ì£¼ì˜'
  // ê¸°ì¡´ 20% ì»·ì? ?¤ì „?ì„œ ? í˜¸ë¥?ì§€?˜ì¹˜ê²?"WATCH"ë¡?ë°€?´ë‚´??ë¬¸ì œê°€ ?ˆì—ˆ??
  // ê²°ì •???”ì§„(v2) ?„ì…ê³??¨ê»˜ ê¸°ë³¸ ì»·ì„ 15%ë¡??„í™”.
  static const double kMinFuturesSignalPct = 15.0;

  final _rng = math.Random();

  // === Candle-close signal lock ===
  // ê°™ì? TF?ì„œ ë§ˆì?ë§?ìº”ë“¤(ts)??ë°”ë€Œê¸° ?„ê¹Œì§€???œì‹ ???•ì •?ì„ ê°±ì‹ ?˜ì? ?ŠëŠ”??
  // (?„ì¬ê°€ë§?ë°”ë€ŒëŠ” êµ¬ê°„?ì„œ ? í˜¸ê°€ ?”ë“¤ë¦¬ëŠ” ê³¼ë§¤ë§?ë°©ì?)
  final Map<String, int> _lastClosedTs = <String, int>{};

  // ê°•ì œ ê²°ë¡  ëª¨ë“œ(? í˜¸ê°€ ? ë§¤?´ë„ ìµœì¢… ê²°ë¡ ???´ë¦¬?? RiskBrake/NO-TRADEë¡??œì–´)
  static const bool forceDecisionMode = true;

  final Map<String, FuState> _lastState = <String, FuState>{};

  // === P-LOCK (anti flip-flop) ===
  // ?•ì • ? í˜¸ë¥??¼ì • ?œê°„/ìº”ë“¤ ?™ì•ˆ ê³ ì •?´ì„œ "ì§„ì…?ˆë‹¤ê°€ ë§ì•˜??ë¥?ì¤„ì¸??
  final Map<String, _PLock> _pLock = <String, _PLock>{};
  final Map<String, int> _pDirStreak = <String, int>{};
  final Map<String, String> _pLastDir = <String, String>{};
  final Map<String, int> _pLastClosedForStreak = <String, int>{};

  // === MTF hierarchy cache (4H + 1D) ===
  // ë°©í–¥ TF: 4H/1D ????ê°™ì? ë°©í–¥???Œë§Œ ?ìœ„ ë°©í–¥?¼ë¡œ ì±„íƒ
  // - 15m: ?”íŠ¸ë¦?ê²€ì¦?4/5+ROI20) + ?ìœ„ë°©í–¥ ?¼ì¹˜ ?„ìˆ˜
  // - 5m : ?€?´ë° ?¸ë¦¬ê±?ë§ˆê°ìº”ë“¤)ë¡œë§Œ ?•ì •
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
        // ?”ë´‰?€ ê³ ì • ì´??¨ìœ„ê°€ ? ë§¤?˜ë‹ˆ 30?¼ë¡œ ê·¼ì‚¬
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
    // ?¤ì •ê°?(?„ìš”?˜ë©´ AppSettingsë¡?ëº????ˆìŒ)
    const int kNeedStreak = 2; // ê°™ì? ë°©í–¥??2ë²??°ì†(ë§ˆê° ìº”ë“¤ ê¸°ì?)??????    const int kMinProbToLock = 28; // "?•ì‹ " ìµœì†Œì¹?    const int kMinConfToLock = 28;
    const int kUnlockOppProb = 55; // ë°˜ë?ê°€ ???•ë„ë¡?ê°•í•˜ë©????´ì œ ?ˆìš©
    const int kUnlockOppConf = 55;

    final existing = _pLock[key];
    if (existing != null && existing.untilMs > nowMs) {
      // ë°˜ë? ? í˜¸ê°€ ?½í•˜ë©?ê·¸ë?ë¡?ê³ ì •
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
      // ??? ì? ì¤‘ì´?¼ë„ ê°™ì? ë°©í–¥?´ë©´ remainë§??…ë°?´íŠ¸
      final remainSec = ((existing.untilMs - nowMs) / 1000).ceil();
      return out.copyWith(
        pLocked: true,
        pLockDir: existing.dir,
        pLockProb: existing.prob,
        pLockRemainingSec: remainSec,
        pLockWhy: existing.why,
      );
    }

    // ë§Œë£Œ?????œê±°
    if (existing != null && existing.untilMs <= nowMs) {
      _pLock.remove(key);
    }

    // NO-TRADE/WATCHë©?????ê±´ë‹¤ (?½ë„ ?´ì œ)
    final title = (out.decisionTitle ?? '').toString();
    final isConfirmed = title.contains('?•ì •') || title.toUpperCase().contains('CONFIRMED');
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

    // ê°™ì? ë§ˆê°ìº”ë“¤?ì„œ ì¤‘ë³µ ì¹´ìš´??ë°©ì?
    final lastClosedForStreak = _pLastClosedForStreak[key];
    if (lastClosedForStreak != null && lastClosedForStreak == closedTs) {
      return out; // ?„ì§ ??ìº”ë“¤?????«í˜”?¼ë©´ streak ê³„ì‚° ?¤í‚µ
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

  // UI label -> ?”ì§„ tf
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
        return tfLabel; // '1m','5m','15m','1h','4h' ??    }
  }

  String _locOf({required double price, required double vwap}) {
    if (vwap <= 0) return 'EQ';
    final diff = (price - vwap).abs() / vwap;
    if (diff <= 0.0012) return 'EQ'; // Â±0.12%ë©?ê· í˜•
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
    // ?ˆë¬´ ??? ê°±ì‹  ë°©ì?(?¤ì‹œê°„ì? 5ì´ˆë©´ ì¶©ë¶„)
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
  // Pivot(?¤ìœ™) ê¸°ë°˜ ?ˆì •??êµ¬ì¡° ?ì •:
  // - ë§ˆì?ë§?2ê°?pivot high/lowë¥?ë½‘ì•„ "ìµœê·¼ êµ¬ì¡°"ë¥?ë§Œë“ ??
  // - ?„ì¬ê°€ê°€ pivot???ŒíŒŒ/?´íƒˆ?ˆì„ ?Œë§Œ BOS/CHOCHë¡??•ì •?œë‹¤.
  // - ë°˜ì‘ê°€ê²?reactLevel)?€ "?ŒíŒŒ ???˜ëŒë¦??ì„œ ì§€ì¼œì•¼ ?˜ëŠ” ê°€ê²?
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

    // --- pivot ì¶”ì¶œ (fractal: ì¢?/??) ---
    // ?¸ì´ì¦?ê°ì†Œ: ???ˆì •?ì¸ ?¤ìœ™ êµ¬ì¡°ë§??¨ê¸°ê¸?    final piv = _extractPivots(candles, maxScan: 160, left: 3, right: 3);
    final ph = piv.highs;
    final pl = piv.lows;

    // fallback: pivot??ë¶€ì¡±í•˜ë©?ê¸°ì¡´ SRë¡?    if (ph.isEmpty || pl.isEmpty) {
      final upBreak = (r1 > 0) ? r1 : px;
      final dnBreak = (s1 > 0) ? s1 : px;
      if (px > upBreak) return (tag: 'BOS_UP', breakLevel: upBreak, reactLevel: upBreak);
      if (px < dnBreak) return (tag: 'BOS_DN', breakLevel: dnBreak, reactLevel: dnBreak);
      return (tag: 'RANGE', breakLevel: upBreak, reactLevel: dnBreak);
    }

    // ìµœê·¼ pivot 2ê°œì”©
    final lastHigh = ph.last;
    final prevHigh = ph.length >= 2 ? ph[ph.length - 2] : ph.last;
    final lastLow = pl.last;
    final prevLow = pl.length >= 2 ? pl[pl.length - 2] : pl.last;

    // êµ¬ì¡° ë°©í–¥(ì¶”ì„¸) ?ì •: HH/HL = ?ìŠ¹ / LL/LH = ?˜ë½
    final bool upTrend = (lastHigh.price >= prevHigh.price) && (lastLow.price >= prevLow.price);
    final bool dnTrend = (lastHigh.price <= prevHigh.price) && (lastLow.price <= prevLow.price);

    // ?ŒíŒŒ ?ˆë²¨?€ SR(ë³´ìˆ˜) + pivot(ë³´ìˆ˜) ?¼í•©
    final upBreak = (r1 > 0) ? math.max(r1, lastHigh.price) : lastHigh.price;
    final dnBreak = (s1 > 0) ? math.min(s1, lastLow.price) : lastLow.price;

    // ??ë°˜ì‘ê°€ê²??˜ëŒë¦??€ "?ŒíŒŒ/?´íƒˆ ?ˆë²¨ ?ì²´"ê°€ 1?œìœ„
    // (ì´ˆë³´?ê²Œ ê°€??ì§ê??? "?¬ê¸° ?¤ì‹œ ì§€ì¼œì•¼ ?œë‹¤")
    final upReact = upBreak;
    final dnReact = dnBreak;

    final lastClose = candles.isNotEmpty ? candles.last.close : px;

    // ??ë§ˆê°(ì¢…ê?) ê¸°ì? êµ¬ì¡° ?ì • (?•í™•???°ì„ )
    // - BOS : ì¶”ì„¸ ? ì? ë°©í–¥?¼ë¡œ???ŒíŒŒ
    // - CHOCH : ë°©í–¥ ?„í™˜ '?œì‘' (ì¶”ì„¸ê°€ ëª…í™•?˜ì? ?Šê±°?? ë°˜ë?ë°©í–¥ ì²??ŒíŒŒ)
    // - MSB : ê¸°ì¡´ ì¶”ì„¸ê°€ ?•ì‹¤???íƒœ?ì„œ??'ë©”ì´?€ êµ¬ì¡° ë¶•ê´´'(???„í™˜)
    if (lastClose > upBreak) {
      String tag;
      if (dnTrend) {
        tag = 'MSB_UP'; // ?˜ë½ ì¶”ì„¸ ë¶•ê´´(?ìŠ¹ ?„í™˜)
      } else if (!upTrend && !dnTrend) {
        tag = 'CHOCH_UP';
      } else {
        // upTrend ?ëŠ” ?¼í•©?ì„œ???„ë¡œ ?ŒíŒŒë©?BOS ?°ì„ 
        tag = 'BOS_UP';
      }
      return (tag: tag, breakLevel: upBreak, reactLevel: upReact);
    }
    if (lastClose < dnBreak) {
      String tag;
      if (upTrend) {
        tag = 'MSB_DN'; // ?ìŠ¹ ì¶”ì„¸ ë¶•ê´´(?˜ë½ ?„í™˜)
      } else if (!upTrend && !dnTrend) {
        tag = 'CHOCH_DN';
      } else {
        tag = 'BOS_DN';
      }
      return (tag: tag, breakLevel: dnBreak, reactLevel: dnReact);
    }

    // êµ¬ê°„ ?´ë?: ë§ˆì?ë§?pivot ê¸°ì? ë²”ìœ„
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
    if (candles.length < 40) return (label: '?˜í”Œ ë¶€ì¡?, up1: 50, up3: 50, up5: 50);
    // avg range
    final int n = math.min(120, candles.length - 6);
    double avgR = 0;
    for (int i = candles.length - n; i < candles.length; i++) {
      avgR += (candles[i].high - candles[i].low).abs();
    }
    avgR = avgR / n;
    if (avgR <= 0) return (label: '?˜í”Œ ë¶€ì¡?, up1: 50, up3: 50, up5: 50);

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
    if (total < 6) return (label: '?˜í”Œ ë¶€ì¡?, up1: 50, up3: 50, up5: 50);
    final p1 = (w1 / total * 100).round().clamp(0, 100);
    final p3 = (w3 / total * 100).round().clamp(0, 100);
    final p5 = (w5 / total * 100).round().clamp(0, 100);
    return (label: '?¥ë?ìº”ë“¤ ???™ì¼ë°©í–¥ ?•ë¥ ', up1: p1, up3: p3, up5: p5);
  }

  double _closeSlope(List<FuCandle> candles, {int n = 30}) {
    if (candles.length < 8) return 0;
    final int m = math.min(n, candles.length);
    final recent = candles.sublist(candles.length - m);
    // ? í˜•?Œê? slope(ê°„ë‹¨)
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

    // ?ìœ„ TF??"ê°€ë³ê²Œ" (?¤ë”ë¶?ì²´ê²° ?†ì´) ìº”ë“¤ ê¸°ë°˜ë§??¬ìš©
    final s4h = await fetch(symbol: symbol, tf: '4h', allowNetwork: allowNetwork, safeMode: true);
    final s1d = await fetch(symbol: symbol, tf: '1d', allowNetwork: allowNetwork, safeMode: true);

    final d4 = _dirOf(s4h);
    final d1 = _dirOf(s1d);

    String top;
    if ((d4 == 'LONG' || d4 == 'SHORT') && d4 == d1) {
      top = d4; // ?©ì˜
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

    // 5m ?€?´ë° ?¸ë¦¬ê±°ëŠ” "ë§ˆê° ìº”ë“¤" ê¸°ì??¼ë¡œë§??•ì •
    bool _timingTriggered() {
      final candles = base.candles;
      if (candles.length < 2) return false;
      final last = candles.last;
      final prev = candles[candles.length - 2];
      final dir = base.signalDir;
      final rl = base.reactLow;
      final rh = base.reactHigh;
      final bl = base.breakLevel;

      // ë°˜ì‘êµ¬ê°„/?ŒíŒŒê°€ê°€ ?†ìœ¼ë©??¸ë¦¬ê±?ë¶ˆê?
      if (rl <= 0 || rh <= 0) return false;

      final bull = last.close > last.open;
      final bear = last.close < last.open;

      // (A) ë°˜ì‘êµ¬ê°„ ???˜ë‹¨ ?ŒíŒŒ ë§ˆê°
      final closeAboveBand = last.close > rh;
      final closeBelowBand = last.close < rl;

      // (B) ?¤ìœ• ??ë³µê?(ë°˜ì‘êµ¬ê°„ ë°–ìœ¼ë¡?ì°ê³ , ë°˜ì‘êµ¬ê°„ ?ˆìœ¼ë¡?ë³µê? ë§ˆê°)
      final sweepDown = prev.low < rl && last.close >= rl && last.close <= rh;
      final sweepUp = prev.high > rh && last.close <= rh && last.close >= rl;

      // (C) ?ŒíŒŒê°€ ?¬í™•??ê°€ê²©ì´ ?ŒíŒŒê°€ ê·¼ì²˜?ì„œ ì§€ì§€/?€???•ì¸)
      final nearBreak = (bl > 0) ? ((last.close - bl).abs() / (bl.abs() + 1e-9)) * 100.0 < 0.25 : false;

      if (dir == 'LONG') {
        return (bull && closeAboveBand) || (bull && sweepDown) || (bull && nearBreak && last.close >= rl);
      }
      if (dir == 'SHORT') {
        return (bear && closeBelowBand) || (bear && sweepUp) || (bear && nearBreak && last.close <= rh);
      }
      return false;
    }

    // 15m: ?ìœ„ë°©í–¥???•ì •(LONG/SHORT)?¸ë° ë°˜ë?ë¡??˜ì˜¤ë©?? í˜¸ ì°¨ë‹¨
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
          lockedReason: '?ìœ„TF($topDir) ??°©??,
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
          signalKo: '?ìœ„TF?€ ë°˜ë???ê´€ë§?,
          signalWhy: base.signalWhy,
          signalBullets: [
            ...base.signalBullets,
            '?ìœ„ ë°©í–¥($topDir)ê³?ë¶ˆì¼ì¹???? í˜¸ ì°¨ë‹¨',
          ],
          candles: base.candles,
lossStreak: base.lossStreak,
        );
      }
    }

    // 5m: 15mê°€ ? í˜¸(SIGNAL)?´ê³  ë°©í–¥ ?¼ì¹˜???Œë§Œ ?€?´ë° ?•ì •. ê·??¸ëŠ” ?¸ë¦¬ê±??€ê¸?
    if (tf == '5m') {
      // 5m?ì„œë§??¨ë… ? í˜¸ ?¨ë°œ ë°©ì?: ?ìœ„ê°€ MIXED/NEUTRAL?´ë©´ 5m??WATCH ì¤‘ì‹¬
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
            signalKo: '?ìœ„ ?¼ì¡° ??5m ?¨ë… ? í˜¸ ì°¨ë‹¨',
            signalWhy: base.signalWhy,
            signalBullets: [
              ...base.signalBullets,
              '?ìœ„(MTF) ?¼ì¡°/ì¤‘ë¦½ ??5m ?¨ë… ? í˜¸ ì°¨ë‹¨',
            ],
            candles: base.candles,
lossStreak: base.lossStreak,
          );
        }
      }

      // ???ìœ„ ë°©í–¥???•ì •(LONG/SHORT)???? 5m??"?€?´ë° ?¸ë¦¬ê±?ê°€ ?ˆì–´?¼ë§Œ showSignal ? ì?
      // - ?©ì˜/ROI ê²Œì´?¸ëŠ” ?´ë? base.showSignal??ë°˜ì˜??      if ((topDir == 'LONG' || topDir == 'SHORT') && base.showSignal) {
        // ë°©í–¥ ë¶ˆì¼ì¹˜ë©´ ì°¨ë‹¨(ë³´ê°•)
        if (base.signalDir != topDir) {
          return FuState(
            price: base.price,
            score: base.score,
            confidence: base.confidence,
            risk: base.risk,
            locked: base.locked,
            lockedReason: base.lockedReason,
            decisionTitle: 'ê´€ë§??€?´ë° ?€ê¸?',
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
            signalKo: '?ìœ„TF?€ ë°©í–¥???¬ë¼ ?€ê¸?,
            signalWhy: base.signalWhy,
            signalBullets: [
              ...base.signalBullets,
              '5m ?€?´ë°: ?ìœ„($topDir)?€ ë¶ˆì¼ì¹????€ê¸?,
            ],
            candles: base.candles,
            lossStreak: base.lossStreak,
          );
        }

        // ?€?´ë° ?¸ë¦¬ê±??†ìœ¼ë©??€ê¸?ë§ˆê° ìº”ë“¤ ê¸°ë°˜)
        if (!_timingTriggered()) {
          return FuState(
            price: base.price,
            score: base.score,
            confidence: base.confidence,
            risk: base.risk,
            locked: base.locked,
            lockedReason: base.lockedReason,
            decisionTitle: '?€ê¸??€?´ë°)',
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
            signalKo: '5m ?€?´ë° ìº”ë“¤ ë§ˆê° ?€ê¸?,
            signalWhy: base.signalWhy,
            signalBullets: [
              ...base.signalBullets,
              '5m ?€?´ë°: ë§ˆê° ìº”ë“¤ë¡?ë°˜ì‘ ?•ì¸???Œë§Œ ì§„ì…',
            ],
            candles: base.candles,
            lossStreak: base.lossStreak,
          );
        }
      }

      // 5m ?€?´ë° ?•ì • ê·œì¹™:
      // - ?ìœ„ë°©í–¥(topDir)??LONG/SHORTë¡??•ì •
      // - base ? í˜¸ê°€ ?œì„±(showSignal)
      // - 5m ë§ˆì?ë§?"ë§ˆê° ìº”ë“¤"?ì„œ ?¸ë¦¬ê±?_timingTriggered) ë°œìƒ
      // ??ì¡°ê±´??ëª¨ë‘ ë§Œì¡±???Œë§Œ 5m?ì„œ "?•ì •"?¼ë¡œ ? ì??œë‹¤.
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
            decisionTitle: '?€ê¸?5m ?€?´ë°)',
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
            signalKo: '5m ë§ˆê° ?€?´ë° ?€ê¸?,
            signalWhy: base.signalWhy,
            signalBullets: [
              ...base.signalBullets,
              '5m ë§ˆê° ?¸ë¦¬ê±??€ê¸?ë°˜ì‘êµ¬ê°„ ?ŒíŒŒ/?¤ìœ•ë³µê?/?¬í™•?? ???•ì • ë³´ë¥˜',
            ],
            candles: base.candles,
            lossStreak: base.lossStreak,
          );
        }
      }
    }

    return base;
  }

  /// ??ë©€???€?„í”„?ˆì„ ?•ì¶•(mtfPulse) ?©ì˜ ê²Œì´??  /// - ëª©ì : "???”ë©´"?ì„œ 1m~1M ?„ì²´ ?ë¦„??ë°˜ë?????ê³¼ë§¤ë§¤ë? ?ë™?¼ë¡œ ì°¨ë‹¨
  /// - ê·œì¹™:
  ///   - base.signalDirê°€ LONG/SHORT???Œë§Œ ?ìš©
  ///   - active(NEUTRAL ?œì™¸) TF ì¤??©ì˜??agreePct)????œ¼ë©?showSignal???„ê±°??locked ì²˜ë¦¬
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

    // active TFê°€ ?ˆë¬´ ?ìœ¼ë©??°ì´??ë¶€ì¡? ?ë˜ ?íƒœ ? ì?
    if (active < 3) return base;

    final agreePct = agree / active;

    // ?•ë¥ ???©ì˜?¨ë¡œ ?´ì§ ë³´ì •(ê³¼ë„???í”„ ë°©ì?)
    // 0.5(ì¤‘ë¦½) -> x1.0, 1.0 -> x1.12, 0.0 -> x0.88
    final probMul = (0.88 + (agreePct * 0.24)).clamp(0.80, 1.20);
    final newProb = (base.signalProb * probMul).round().clamp(0, 100);

    // ë¶ˆì¼ì¹??„ê³„ê°?    final conflict = agreePct < 0.55;
    final strongConflict = agreePct < 0.45;

    // ë¶ˆë¦¿(ë§??ì— ?£ê¸°)
    final bullets = <String>[
      'MTF: ?©ì˜ $agree/$active Â· ${(agreePct * 100).toStringAsFixed(0)}%',
      ...base.signalBullets,
    ];

    // ê°•í•œ ì¶©ëŒ?´ë©´ NO-TRADE(? ê¸ˆ)
    if (!base.locked && strongConflict) {
      return base.copyWith(
        locked: true,
        lockedReason: 'ê´€ë§??¤ì¤‘TF ì¶©ëŒ)',
        decisionTitle: 'ê´€ë§??¤ì¤‘TF ì¶©ëŒ)',
        showSignal: false,
        signalDir: 'NEUTRAL',
        signalProb: newProb,
        signalBullets: bullets,
      );
    }

    // ?½í•œ ì¶©ëŒ?´ë©´ ?•ì • ? í˜¸ë§?ì°¨ë‹¨(Watchë¡?
    if (!base.locked && conflict && base.showSignal) {
      return base.copyWith(
        decisionTitle: 'ì§€ì¼œë³´ê¸??¤ì¤‘TF ë¶ˆì¼ì¹?',
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

  // êµ¬ì¡° ë°”ì´?´ìŠ¤(0~100)
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

  // ?ìˆ˜(0~100): ì§€ì§€/?€??+ êµ¬ì¡° + ë¦¬ìŠ¤????„?˜ë¡) + RR ë³´ë„ˆ??  int longScore = (supP * tp.wSupport + structLong * tp.wStructure + (100 - risk) * 0.25 + (math.min(2.0, rr) / 2.0) * 10.0).round().clamp(0, 100);
  int shortScore = (resP * tp.wResist + structShort * tp.wStructure + (100 - risk) * 0.25 + (math.min(2.0, rr) / 2.0) * 10.0).round().clamp(0, 100);

  final dir = (longScore >= shortScore) ? 'LONG' : 'SHORT';
  final diff = (longScore - shortScore).abs().clamp(0, 100);
  final confidence = diff; // 0~100

  // ê¶Œì¥ R(?¬ì´ì¦?: ?•ì‹  ??„?˜ë¡ ?Œì•¡ ì§„ì…(?€ê¸??€??
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

  // 2?¨ê³„ ê²Œì´??  // - WATCH: ìµœì†Œ ë°©í–¥???ˆë‚´(?”ë©´/?Œëœë§?, DB ê¸°ë¡/?ìœ¨ë³´ì •?ëŠ” ë¯¸ë°˜??  // - CONFIRM: ?•ì • ì§„ì…(ê¸°ë¡/?ìœ¨ë³´ì •)
  final forceMin = (tp.thrConfirm * 0.55).clamp(0.22, 0.45);
  final watchTrade = (maxProb >= forceMin) && (confidence >= 20);
  final allow = (maxProb >= tp.thrConfirm) && (confidence >= 20);
  final prob = (50 + (confidence / 2)).round().clamp(0, 100);

  final reason = 'FORCED: $dir Â· conf $confidence% Â· R ${r.toStringAsFixed(2)} Â· L/S $longScore/$shortScore';

  return s.copyWith(
    locked: false,
    lockedReason: '',
    decisionTitle: allow ? '?•ì •($dir)' : (watchTrade ? 'WATCH($dir)' : 'NO-TRADE'),
    showSignal: watchTrade,
    signalDir: dir,
    signalProb: prob,
    confidence: confidence,
    confidenceScore: prob,
    confidenceLabel: confidence >= 75 ? 'ê°•í•¨' : confidence >= 60 ? 'ë³´í†µ' : confidence >= 45 ? '?½í•¨' : 'ë§¤ìš° ?½í•¨',
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
      // ??Fulink Pro Ultra ?¤ë°?´í„° ë°©ì‹(Bitget v3)
      // - ê¸°ë³¸?€ USDT ? ë¬¼ë¡?ì¡°íšŒ
      px = await BitgetPublic.getLastPrice(category: 'USDT-FUTURES', symbol: symbol);
    }
    px ??= _mockPrice(symbol);

    // ??ìº”ë“¤??ê°€?¥í•˜ë©??¤ë°?´í„°ë¡?    final candles = await _tryBitgetCandles(symbol: symbol, tf: tf) ?? _mockCandles(px, tf);

    // === (1) ìº”ë“¤ ë§ˆê° ê¸°ì?: ë§ˆì?ë§?ìº”ë“¤ tsê°€ ë°”ë€??Œë§Œ ? í˜¸ë¥??¬í™•??===
    final key = '$symbol|$tf';
    final closedTs = candles.isEmpty ? 0 : candles.last.ts;
    final prevTs = _lastClosedTs[key];
    final prevState = _lastState[key];
    if (prevTs != null && prevTs == closedTs && prevState != null) {
      // ?„ì¬ê°€ë§?ìµœì‹ ?¼ë¡œ ë°˜ì˜?˜ê³ , ?˜ë¨¸ì§€???´ì „ ?•ì •ê°?? ì?
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

    // ??SR(ì§€ì§€/?€?? = ìµœê·¼ êµ¬ê°„?ì„œ ê°€??ê°€ê¹Œìš´ ?€??ê³ ì  ê¸°ë°˜
    final sr = _calcSr(candles, px);
    final s1 = sr.$1;
    final r1 = sr.$2;
    final vwap = _calcVwap(candles, px);

    // ??êµ¬ê°„ ?´ë?(?ˆì¸ì§€) ?ì •
    final bool hasSr = (s1 > 0 && r1 > 0 && r1 > s1);
    final bool inRange = hasSr ? (px >= s1 && px <= r1) : false;
    final stTag = _structureTag(candles, px, s1, r1);
    // ë°˜ì‘ êµ¬ê°„(?? ?? ATR(?‰ê·  ìº”ë“¤ range) ê¸°ë°˜
    final atrAbs = _atrAbs(candles);
    final bandHalf = (atrAbs > 0) ? (atrAbs * 0.25) : (px * 0.0015);
    final reactLow = (stTag.reactLevel > 0) ? (stTag.reactLevel - bandHalf) : 0.0;
    final reactHigh = (stTag.reactLevel > 0) ? (stTag.reactLevel + bandHalf) : 0.0;

    // ???¤ë”ë¶?ì²´ê²° (ê°€?¥í•˜ë©??¤ë°?´í„°)
    final ob = allowNetwork ? await BitgetPublic.getOrderBook(category: 'USDT-FUTURES', symbol: symbol, limit: 50) : null;
    // NOTE: allowNetwork=false ???Œë„ ?€?…ì´ ê¹¨ì?ì§€ ?Šë„ë¡?ë¹?ë¦¬ìŠ¤???€??ê³ ì •
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

    // ??? í˜¸ ê°•ë„ ?„í„°(? ë¬¼): 20% ë¯¸ë§Œ?´ë©´ LONG/SHORT ? í˜¸ë¥??´ì? ?ŠìŒ
    final maxSidePct = math.max(core.longPct, core.shortPct);
    final weakSignal = maxSidePct < kMinFuturesSignalPct;


    // ???„í—˜??= ë³€?™ì„±(ATR ë¹„ìŠ·) + LOCK ë¹„ì¤‘
    final atr = _atrPct(candles);
    final risk = (atr * 260 + core.lockPct * 0.55).clamp(5, 95).round();
    int score = math.max(core.longPct, core.shortPct).clamp(0, 100).round();
    int conf = ((100 - risk) * 0.7 + (score) * 0.3).clamp(0, 100).round();
    bool locked = risk >= 82 || core.lockPct >= 45;
    String lockedReason = locked ? 'ê´€ë§??„í—˜/ì¶©ëŒ ?’ìŒ) Â· RISK ${risk}%' : '?•ìƒ';

    final dir = locked ? 'NEUTRAL' : core.bias;
    final prob = conf.clamp(0, 100);
    final grade = prob >= 82 ? 'SSS' : (prob >= 70 ? 'A' : (prob >= 55 ? 'B' : 'C'));

    final total = ev.length;
    int hit = ev.where((e) => e.strength >= 60 && e.vote != 'NEUTRAL').length;

    // ê¸°ë³¸ ì§€???”ì•½)
    final baseBullets = <String>[
      'SR: ì§€ì§€ ${(srScore.$3).round()}% Â· ?€??${(srScore.$4).round()}%',
      '?¤ë”ë¶? ë§¤ìˆ˜ ${(obScore.$3).round()}% Â· ë§¤ë„ ${(obScore.$4).round()}%',
      'ì²´ê²°: ë§¤ìˆ˜ ${(tapeScore.$3).round()}% Â· ë§¤ë„ ${(tapeScore.$4).round()}%',
      'ê±°ë˜?? ${volScore.$5}',
      'ëª¨ë©˜?€: ${momScore.$5}',
    ];

    // ???µì‹¬(???˜ëŠ”) ?´ìš©?€ ë§??„ì— ?¤ë„ë¡?"?¤ë” ë¶ˆë¦¿"?¼ë¡œ ë¨¼ì? êµ¬ì„±
    final headBullets = <String>[];

    // ??ê°€ê²?ì¡°ê±´ë¬?ê³ ì • ?œì‹œ
    if (hasSr) {
      headBullets.add('ê°€ê²©êµ¬ê°? ì§€ì§€ ${s1.toStringAsFixed(0)} / VWAP ${vwap.toStringAsFixed(0)} / ?€??${r1.toStringAsFixed(0)}');
    }

    // ??êµ¬ì¡°(CHOCH/BOS) + ?˜ëŒë¦?ë°˜ì‘ê°€ê²??«ì) ê³ ì • ?œì‹œ
    if (stTag.tag == 'CHOCH_UP' || stTag.tag == 'BOS_UP') {
      headBullets.add('êµ¬ì¡°: ${stTag.tag} ???ŒíŒŒ ???˜ëŒë¦?ë°˜ì‘ê°€ê²?${stTag.reactLevel.toStringAsFixed(0)}');
      headBullets.add('LONG ì¡°ê±´: ë§ˆê°ê°€ > ${stTag.breakLevel.toStringAsFixed(0)} ? ì? + ?˜ëŒë¦?${stTag.reactLevel.toStringAsFixed(0)} ì§€ì§€ ?•ì¸');
    } else if (stTag.tag == 'CHOCH_DN' || stTag.tag == 'BOS_DN') {
      headBullets.add('êµ¬ì¡°: ${stTag.tag} ??ë¶•ê´´ ???˜ëŒë¦?ë°˜ì‘ê°€ê²?${stTag.reactLevel.toStringAsFixed(0)}');
      headBullets.add('SHORT ì¡°ê±´: ë§ˆê°ê°€ < ${stTag.breakLevel.toStringAsFixed(0)} ? ì? + ?˜ëŒë¦?${stTag.reactLevel.toStringAsFixed(0)} ?€???•ì¸');
    } else if (inRange) {
      headBullets.add('êµ¬ì¡°: RANGE(êµ¬ê°„ ?´ë?) ???ŒíŒŒ/ë¶•ê´´ ?„ê¹Œì§€ ê´€ë§?);
    }

    // === ìº”ë“¤ ë§ˆê°/?ŒíŒŒ/ê±°ë˜??ë¶„ì„(?•í™•??ëª¨ë“œ) ===
    // - UI ë¶ˆë¦¿/?©ì˜/êµ¬ì¡° ë³´ì •?ì„œ ê³µí†µ?¼ë¡œ ?¬ìš©
    final cc = CloseContextEngineV1.eval(candles);
    final bq = BreakoutQualityEngineV1.eval(candles, s1: s1, r1: r1, vwap: vwap);
    final vq = VolumeQualityEngineV1.eval(candles);

    // êµ¬ì¡° ê¸°ë°˜ ?•ì • ë³´ì • ?Œë˜ê·?CHOCH???½í•˜ë©?ê´€ë§? MSB??ê°•í•˜ë©??•ì • ?„í™”)

    // ???¥ë??‘ë´‰/?¥ë??Œë´‰ ???•ë¥ (?„ì¬ ìº”ë“¤???´ë? ?µê³„)
    // - ?¸ë? CSV ?†ì´??ì¦‰ì‹œ ?™ì‘ (ì¶”í›„ CSV/?€?´ë¡± ?°ì´???°ê²° ???•êµ??
    final bc = _bigCandleStats(candles);
    headBullets.add('${bc.label}: ?¤ìŒ 1/3/5ìº”ë“¤ ${bc.up1}/${bc.up3}/${bc.up5}%');

    // ìµœì¢… ë¶ˆë¦¿: ?µì‹¬ ??ê¸°ë³¸ì§€????    final bullets = <String>[...headBullets, ...baseBullets];

    // ë§ˆê°/?ŒíŒŒ/ê±°ë˜???”ì•½(ì´ˆë³´??
    bullets.insert(0, 'ë§ˆê°: ${cc.labelKo}(${cc.score}) Â· ?ŒíŒŒ: ${bq.labelKo}(${bq.score}) Â· ê±°ë˜?? ${vq.labelKo}(${vq.score})');

    // --- êµ¬ì¡°/ë°˜ì‘ êµ¬ê°„ ê°?ë¡œì»¬ ë³„ì¹­) ---
    // NOTE:
    // - reactLow/reactHigh???´ë? ?„ì—??ATR ê¸°ë°˜ bandë¡?ê³„ì‚°??
    // - stTag??record({breakLevel, reactLevel, tag}) ?•íƒœ??reactLow/reactHigh getterê°€ ?†ìŒ.
    // ?°ë¼???¬ê¸°?œëŠ” ì¤‘ë³µ ? ì–¸???¼í•˜ê³? ê¸°ì¡´ ê³„ì‚°ê°’ì„ ê·¸ë?ë¡??¬ìš©?œë‹¤.
    final String structureTag = stTag.tag;
    final double breakLevel = stTag.breakLevel;
    final double reactLevel = stTag.reactLevel;

    // === êµ¬ì¡°/ë°˜ì‘ ê°€ê²?ë¸Œë¦¬??ê³ ì • ?œì‹œ) ===
    // ì´ˆë³´???´í•´?????ˆê²Œ ?œê? + ?ì–´ ë³‘ê¸°
    String _koStruct(String tag) {
      if (tag.contains('CHOCH')) return 'ì¶”ì„¸ë³€??CHOCH)';
      if (tag.contains('BOS')) return 'êµ¬ì¡°?ŒíŒŒ(BOS)';
      if (tag.contains('RANGE')) return 'ë°•ìŠ¤(?¡ë³´)';
      return tag;
    }

    // êµ¬ì¡° ?œê·¸/?ŒíŒŒê°€/ë°˜ì‘ê°€(?˜ëŒë¦? ?œì‹œ
    if ((structureTag).trim().isNotEmpty && structureTag != 'NONE') {
      bullets.insert(
        0,
        'êµ¬ì¡°: ${_koStruct(structureTag)} Â· ?ŒíŒŒê°€ ${breakLevel.toStringAsFixed(0)} Â· ë°˜ì‘êµ¬ê°„ ${reactLow.toStringAsFixed(0)}~${reactHigh.toStringAsFixed(0)}',
      );
    }

    String effDir = (locked || weakSignal) ? 'NEUTRAL' : dir;
    String effTitle = locked
        ? 'ê±°ë˜ê¸ˆì?'
        : (weakSignal
            ? 'ê´€ë§?ì£¼ì˜)'
            : (dir == 'LONG' ? 'ë¡??°ì„¸' : (dir == 'SHORT' ? '???°ì„¸' : 'ê´€ë§?)));

    // ??êµ¬ì¡° ?˜ëŒë¦?ë°˜ì‘êµ¬ê°„ ?´ë?ë©??œì§„???„ë³´ ?ë¦¬?ë¡œ ì·¨ê¸‰?œë‹¤.
    // - ?ˆì „ ?¨ì¹˜?ì„œ??ê³¼ë§¤ë§?ë°©ì?ë¡?effDirë¥?NEUTRALë¡?ë°”ê¿”ë²„ë ¤??    //   ?¤ì œ ?°ì´???¤ì‹œê°??ì„œ ? í˜¸/?¤ë²„?ˆì´ê°€ ?¬ë¼??ë³´ì´??ë¬¸ì œê°€ ?ˆì—ˆ??
    // - ë°©í–¥?€ ? ì??˜ê³ (ë¡???, ?€?´í?ë§??œêµ¬ê°?ë°˜ì‘?ìœ¼ë¡??œì‹œ?œë‹¤.
    final inReactionBand = px >= reactLow && px <= reactHigh;
    if (!locked && inReactionBand) {
      effTitle = 'êµ¬ê°„ ë°˜ì‘(?•ì¸)';
    }

    // ??êµ¬ê°„ ?´ë?ë©??œëª©??ê³ ì •: "ê´€ë§?êµ¬ê°„ ?´ë?)" (ê°€ì§?? í˜¸/ê³¼ë§¤ë§?ë°©ì?)
    if (!locked && inRange) {
      effDir = 'NEUTRAL';
      effTitle = 'ê´€ë§?êµ¬ê°„ ?´ë?)';
    }

    final signalKo = locked
        ? 'ì§€ê¸ˆì? ê±°ë˜ë¥??¬ëŠ” ê²?ì¢‹ì•„??'
        : (weakSignal
            ? '? í˜¸ê°€ ?½í•´??20% ë¯¸ë§Œ). ê´€ë§ì´ ì¢‹ì•„??'
            : (dir == 'LONG'
                ? '?ìŠ¹ ìª½ì´ ì¡°ê¸ˆ ??? ë¦¬?´ìš”.'
                : (dir == 'SHORT' ? '?˜ë½ ìª½ì´ ì¡°ê¸ˆ ??? ë¦¬?´ìš”.' : 'ë°©í–¥??? ë§¤?´ìš”.')));
    final signalWhy = 'ê·¼ê±° ${hit}/${total} Â· ë¡?${core.longPct.round()}% / ??${core.shortPct.round()}% / ê´€ë§?${core.lockPct.round()}%' + (weakSignal ? ' (20%ë¯¸ë§Œ ?„í„°)' : '');

    // === êµ¬ì¡°/ë§ˆê°/?ŒíŒŒ/ê±°ë˜??ë³´ì •(?•í™•???°ì„ ) ===
    // - êµ¬ì¡° ?œê·¸ê°€ ê°•í• ?˜ë¡(?¹íˆ MSB) ?ìˆ˜/? ë¢°?„ë? ë³´ì •?œë‹¤.
    // - CHOCH??'?„í™˜ ?œì‘'?´ë?ë¡??ŒíŒŒ/ê±°ë˜?‰ì´ ?½í•˜ë©?ê´€ë§ìœ¼ë¡?ë³´ìˆ˜ ì²˜ë¦¬?œë‹¤.
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

    // êµ¬ì¡°ê°€ ê°•í•  ?Œë§Œ(?¹íˆ MSB/BOS) evidence hitë¥??Œí­ ë³´ì •
    if (stUpper.contains('MSB_')) {
      if (bq.score >= 60) hit = (hit + 1);
      if (vq.score >= 60) hit = (hit + 1);
    } else if (stUpper.contains('BOS_')) {
      if (bq.score >= 60) hit = (hit + 1);
    }
    if (hit > total) hit = total;

    final bool chochWeak = stUpper.contains('CHOCH_') && (bq.score < 60 || vq.score < 55 || cc.score < 55);
    final bool msbStrong = stUpper.contains('MSB_') && (bq.score >= 60 && vq.score >= 55);


    // === ê²°ì •??Decision Power) v2 ===
    // ëª©í‘œ: "ê·¼ê±° 5ê°?ê°€ ?ˆì–´??ê´€ë§ìœ¼ë¡?ë¶™ëŠ” ë¬¸ì œë¥??´ê²°.
    // ?µì‹¬: (êµ¬ì¡°) + (ì¢…ê??•ì •) + (?ŒíŒŒ/ê±°ë˜?? + (ë°©í–¥???°ìœ„)??ê°€ì¤‘í•©?¼ë¡œ
    //       0~100 ê²°ì •???¤ì½”?´ë¡œ ë§Œë“¤ê³? ê°•í•˜ë©??¼ë? ê²Œì´?¸ë? ?°íšŒ?œë‹¤.
    final longPct = core.longPct;
    final shortPct = core.shortPct;
    final edge = (longPct - shortPct).clamp(-100.0, 100.0);

    structureBoost = 0;
    if (stUpper.contains('MSB_')) structureBoost = 12;
    if (stUpper.contains('BOS_')) structureBoost = 8;
    if (stUpper.contains('CHOCH_')) structureBoost = 4;

    // ì¢…ê??•ì •/?ŒíŒŒ/ê±°ë˜???ìˆ˜??50??ì¤‘ë¦½, 100??ê°•í•¨.
    final closeAdj = ((cc.score - 50.0) * 0.25);
    final breakoutAdj = ((bq.score - 50.0) * 0.25);
    final volumeAdj = ((vq.score - 50.0) * 0.20);

    // êµ¬ê°„ ?´ë?(?ˆì¸ì§€)ë©?ê²°ì •??ê°ì , ë°˜ë?ë¡?"?µì‹¬êµ¬ê°„ ë°˜ì‘"?´ë©´ ?Œí­ ê°€??    final zoneAdj = inRange ? -10.0 : (inReactionBand ? 6.0 : 0.0);

    final decisionPower = (50.0 + (edge * 0.5) + structureBoost + closeAdj + breakoutAdj + volumeAdj + zoneAdj)
        .clamp(0.0, 100.0);

    // 1) ?©ì˜(ê·¼ê±°) ê²Œì´??    // - ê¸°ì¡´ 4/5???ˆë¬´ ë¹¡ì„¸??? í˜¸ê°€ ???ˆë‚˜??
    // - ê¸°ë³¸ 3ê°œë¡œ ?„í™”.
    // - ê²°ì •?¥ì´ ê°?>=72)?´ë©´ ?©ì˜ ë¶€ì¡±ì„ ?°íšŒ.
    final consensusNeed = 3;
    final consensusOk = (hit >= consensusNeed) || (decisionPower >= 72.0);

    // 2) ROI ê²Œì´??(TPê¹Œì? ?ˆìƒ ?˜ìµë¥??ˆë²„ë¦¬ì?)
    // - ?”íŠ¸ë¦?SL/TP??SR ê¸°ë°˜ EntryPlanner(ì´ˆë³´?? ?¬ìš©
    // - ?ˆë²„ë¦¬ì???"TPê¹Œì? ëª©í‘œ ROI"ê°€ ?˜ë„ë¡?ìµœì†Œì¹˜ë¡œ ì¶”ì²œ
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
    // ê¸°ì¡´ 25%??? í˜¸ ?µì œ ?”ì¸??ì»¤ì„œ ê¸°ë³¸ 15%ë¡??„í™”
    final targetRoiPct = 15.0;
    final needLev = (movePct <= 0) ? 3 : ((targetRoiPct / movePct).ceil());
    double leverage = math.max(needLev.toDouble(), ep.leverageRec).clamp(3.0, 35.0);
    if (AppSettings.leverageOverride > 0) {
      leverage = AppSettings.leverageOverride.clamp(1.0, 200.0).toDouble();
    }
    final roiToTp = movePct * leverage;

    // UX: ëª©í‘œ ROI ê²Œì´???„ìš” ?ˆë²„ë¦¬ì?)
    final levNeed = (movePct <= 0) ? double.infinity : (targetRoiPct / movePct);
    final levNeedSafe = levNeed.isFinite ? levNeed.clamp(1.0, 200.0) : 200.0;
    final levNeedText = levNeed.isFinite ? levNeedSafe.toStringAsFixed(1) : '200+';
    bullets.add('${targetRoiPct.toStringAsFixed(0)}%: ?´ë™ ${movePct.toStringAsFixed(2)}% ???„ìš” ?ˆë²„ë¦¬ì? ${levNeedText}x');

    // 2) ROI ê²Œì´??    // - ê¸°ë³¸ 15%
    // - ?? ê²°ì •?¥ì´ ë§¤ìš° ê°•í•˜ë©?>=75) ROI ë¶€ì¡±ì´?´ë„ ? í˜¸ ?ˆìš©(ê²°ì • ? í˜¸ ê°•ì œ)
    final roiOk = (roiToTp >= targetRoiPct) || (decisionPower >= 75.0);

    // 3) ìµœì¢… ? í˜¸ ?œì‹œ
    // ??êµ¬ê°„ ?´ë???ê³¼ë§¤ë§?ë°©ì?: ê¸°ë³¸?ìœ¼ë¡?? í˜¸ ë¹„í™œ??ê´€ë§?
    // ???? ê²°ì •?¥ì´ ë§¤ìš° ê°•í•˜ë©?>=78) ?ˆì¸ì§€ ?´ë??¼ë„ ?ˆì™¸?ìœ¼ë¡??ˆìš©
    final allowInRangeByPower = decisionPower >= 78.0;
    final showSignal = !locked && consensusOk && roiOk && (allowInRangeByPower || !inRange) && prob >= AppSettings.signalMinProb;

    // 4) 5% ë¦¬ìŠ¤??ê¸°ì? ?¬ì????°ì¶œ
    // EntryPlannerê°€ ?´ë? ë¦¬ìŠ¤??ê¸°ë°˜ qty(ë² ì´?? ê³„ì‚°???œê³µ.
    final qty = ep.qtyBtc;

    // ê²Œì´??ê²°ê³¼ë¥?UX ë¬¸ì¥??ë°˜ì˜
    final gateHint = locked
        ? 'NO-TRADE'
        : (!consensusOk
            ? '?©ì˜ ë¶€ì¡?${hit}/${total})'
            : (!roiOk ? 'ROI ë¶€ì¡?${roiToTp.toStringAsFixed(0)}%)' : 'OK'));

    // ê²°ì •???œê¸°(UX)
    bullets.add('ê²°ì •?? ${decisionPower.toStringAsFixed(0)} (ì¢…ê? ${cc.score.toStringAsFixed(0)} / ?ŒíŒŒ ${bq.score.toStringAsFixed(0)} / ê±°ë˜??${vq.score.toStringAsFixed(0)})');
    final signalWhy2 = '$signalWhy Â· ê²Œì´?? $gateHint';

    // === (2) ë©€??TF ?„ê³„ ?„í„° ===
    // ë°©í–¥(1D/4H)??ê°•í•˜ê²?ë°˜ë?ë©? ?€TF ? í˜¸???½í™”(ê´€ë§? ì²˜ë¦¬
    final ht = await _higherTfFilter(symbol: symbol, allowNetwork: allowNetwork, safeMode: safeMode);
    String finalDir = effDir;
    String finalTitle = effTitle;
    bool finalShow = showSignal;

    // êµ¬ì¡° ê¸°ë°˜ ?•ì • ë³´ì •
    if (chochWeak) {
      finalShow = false;
      finalTitle = 'ê´€ë§??„í™˜?•ì¸)';
    }
    // MSB??êµ¬ì¡°?„í™˜???•ì‹¤???Œë§Œ ?•ì • ?ˆìš©(?ŒíŒŒ/ê±°ë˜???™ë°˜)
    if (msbStrong) {
      finalShow = finalShow || (hit >= 4);
    }
    if (!locked && ht != 'NEUTRAL' && finalDir != 'NEUTRAL' && ht != finalDir) {
      // ?ìœ„TFê°€ ë°˜ë? ??ê³¼ë§¤ë§?ë°©ì?
      finalDir = 'NEUTRAL';
      finalTitle = 'ê´€ë§??ìœ„TF ë°˜ë?)';
      finalShow = false;
    }

    // ? í˜¸ ê°•ë„ ?±ê¸‰
    final grade2 = locked
        ? 'LOCK'
        : (finalShow && hit >= 5 ? 'STRONG' : (finalShow ? 'WEAK' : 'WATCH'));

    // === Flow Radar ë³´ê°• ì§€??(0~100) ===
    final int obPct = obScore.$3.round().clamp(0, 100);
    final int tapePct = tapeScore.$3.round().clamp(0, 100);
    final int buyPressure = (((obPct + tapePct) / 2).round()).clamp(0, 100);
    final int sellPressure = (100 - buyPressure).clamp(0, 100);
    // ì²´ê²°ê³??¤ë”ë¶?ê´´ë¦¬ê°€ ?‘ì„?˜ë¡ "?¡ìˆ˜"ê°€ ???´ë¤„ì§?ê²ƒìœ¼ë¡?ê°„ì£¼
    final int absorptionScore = (100 - (tapePct - obPct).abs()).clamp(0, 100);

    // === êµ¬ì¡° ?´ë²¤???¸ë±???•í™• ?¼ë²¨?? ===
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
    // EQL/EQH ?¼ë²¨ ?œê±°(ë¶„Â·ì‹œê°„Â·ì¼Â·ì£¼Â·ë‹¬ ê³µí†µ)

    // ë°©ì–´/ë¶„ì‚°(?•í™•??ì½”ì–´): ë§ˆê°/?ŒíŒŒ/ê±°ë˜??+ ë°˜ì‘êµ¬ê°„ + ?•ë ¥ ì¡°í•©
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

    // UX: ??ì¤„ë¡œë§?ì¶”ê?(ê³¼ë‹¤ ?¤ëª… ë°©ì?)
    bullets.add('ë°©ì–´ ${def.score} Â· ë¶„ì‚° ${dist.score} Â· ?¡ìˆ˜ ${absorptionScore}');

    // ?¸ë ¥(Force) = ê³ ë˜?ìˆ˜ + ê¸°ê?ë°”ì´?´ìŠ¤ + ë§¤ìˆ˜??ì¡°í•©
    final int forceScore = ((whale.whaleScore * 0.5) + (whale.instBias * 0.3) + (buyPressure * 0.2)).round().clamp(0, 100);
    // ?¤ìœ• ë¦¬ìŠ¤?? SR ê·¼ì ‘ + ?¡ìˆ˜ ?½í•¨(ê´´ë¦¬ ???¼ìˆ˜ë¡??’ê²Œ
    final double atrp = _atrPct(candles);
    final double distS = ((px - s1).abs() / px) * 100.0;
    final double distR = ((r1 - px).abs() / px) * 100.0;
    final double distMin = (distS < distR) ? distS : distR;
    final int srClose = (distMin <= (atrp * 0.35)) ? 70 : 30;
    final int sweepRisk = (srClose + (100 - absorptionScore) * 0.3).round().clamp(0, 100);

    // === Zones (OB / FVG / BPR / MU-MB) ===
    // ëª©í‘œ: ?¬ìš©?ê? '??ë´ì„œ' ë°˜ì‘êµ¬ê°„???´í•´?˜ë„ë¡? ìµœê·¼ ?°ì´??ê¸°ë°˜?¼ë¡œ
    // ê³¼ë„??ê³„ì‚° ?†ì´(ë¸”ë¦¬ì¸? ?µì‹¬ ì¡´ë§Œ ì¶”ì¶œ?©ë‹ˆ??
    final fvgZones = _detectFvgZones(candles);
    // BPR: FVG ê²¹ì¹¨ êµ¬ê°„(ê°„ë‹¨) ???¨ìˆ˜ëª??¸í™˜
    final bprZones = _detectBprZones(fvgZones);
    final obZones = _detectObZones(candles);
    final mbZones = _detectMuMbZones(candles);


    final smcZones = _buildSmcZones(candles, obZones, mbZones);
    // === FINAL DECISION FIX (3ê°€ì§€) ===
    // 1) ?„ê³„ê°??•ì • ì¡°ê±´) ?ˆë¬´ ë¹¡ì„¼ ë¬¸ì œ: ì¡°ê±´/?¬ìœ ë¥?ëª…ì‹œ
    // 2) 0~1 vs 0~100 ?¤ì???ë¶ˆì¼ì¹? ?¼ì„¼???•ê·œ??    // 3) ìµœì¢…ê²°ì •??State?????¤ì–´ê°€??ë¬¸ì œ: signalDir/showSignal/reason???¬ê¸°???•ì •
    
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
    ? 'ê°•í•¨'
    : (confScore >= 60)
        ? 'ë³´í†µ'
        : (confScore >= 45)
            ? '?½í•¨'
            : 'ë§¤ìš° ?½í•¨';
    
    // edgePct(0~100): ì¤‘ë¦½(50)?ì„œ ?¼ë§ˆ??ë²—ì–´?¬ë‚˜. 20 ?´ìƒ?´ë©´ ë°©í–¥???ˆë‹¤ê³??ë‹¨
    final edgePct = ((probP - 50).abs() * 2).round().clamp(0, 100);
    
    const int MIN_HIT = 5;
    const int MIN_CONF = 60;
    const int MIN_PROB = 55;
    const int MIN_EDGE = 20;
    
    final reasons = <String>[];
    if (hit < MIN_HIT) reasons.add('ê·¼ê±° $hit/$total');
    if (confScore < MIN_CONF) reasons.add('ê²°ì •??${confScore}%');
    if (probP < MIN_PROB) reasons.add('?•ë¥  ${probP}%');
    if (edgePct < MIN_EDGE) reasons.add('ë°©í–¥??${edgePct}%');
    if (!consensusOk) reasons.add('TF?©ì˜X');
    if (!roiOk) reasons.add('ROIì¡°ê±´X');
    
    String finalDir2 = finalDir;
    bool finalShow2 = finalShow;
    if (finalDir2 == 'NEUTRAL') reasons.add('ë°©í–¥ì¤‘ë¦½');
    
    final ok = reasons.isEmpty;
    if (!ok) {
      finalDir2 = 'WATCH';
      finalShow2 = false;
    }
    final finalReason = ok ? '?•ì •' : ('ê´€ë§? ' + reasons.join(' Â· '));
    
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

      // ?¸ë ¥/ê³ ë˜/ê¸°ê? (public-data heuristics)
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
      // ë©€?°TF ?©ì˜ë¡?ìµœì¢… ? í˜¸(ë¡???ê´€ë§?ë¥???ë²????•ì œ
      out = _applyMtfConsensusGate(base: out);
    }

    // === Zone classifier (??ƒ 1ê°?ì¶œë ¥) ===
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

    // === v12 ALL-IN-ONE: ì§„ì…/?ì ˆ/ëª©í‘œ + NO-TRADE + 5% ë¦¬ìŠ¤??ì¹´ë“œ??ê°?===
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
      lockedReason = 'ë°©í–¥ ë¶ˆí™•????ê´€ë§?;
    } else if (out.sweepRisk >= 75) {
      locked = true;
      lockedReason = '?©ì˜(?¨ì •) ?„í—˜ ?’ìŒ';
    } else if (out.volumeScore < 35 && out.breakoutScore < 35) {
      locked = true;
      lockedReason = 'ê±°ë˜???ŒíŒŒ ??ë¶€ì¡?;
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



  /// ???¤ì‹œê°?ìº”ë“¤ ?¤íŠ¸ë¦?ë¯¸ì™„ë£?ìº”ë“¤ ?¬í•¨) ë°˜ì˜?? ?¤íŠ¸?Œí¬ ?†ì´
  /// êµ¬ì¡°(CHOCH/BOS) + ë°˜ì‘êµ¬ê°„(reactLow/reactHigh) + SR/VWAPë§?ë¹ ë¥´ê²??¬ê³„?°í•œ??
  ///
  /// - ê¸°ì¡´ ?”ì§„ `fetch()`??"ë§ˆê° ìº”ë“¤(ts)" ê¸°ì??¼ë¡œ ?•ì •ê°’ì„ ìºì‹±?œë‹¤.
  /// - UI?ì„œ??"?¤ì‹œê°????í•˜ë¯€ë¡? ìº”ë“¤ ê°±ì‹ ???¤ì–´???Œë§ˆ??ìµœì†Œ?œì˜ êµ¬ì¡°ê°’ì„ ê°±ì‹ ?œë‹¤.
  FuState recalcLive({
    required FuState prev,
    required List<FuCandle> candles,
  }) {
    if (candles.isEmpty) return prev;

    // ?¤ì‹œê°?ê°€ê²©ì? ë§ˆì?ë§?ìº”ë“¤ ì¢…ê?ë¡??ëŠ” ê¸°ì¡´ price ? ì?)
    final px = (candles.last.close > 0) ? candles.last.close : prev.price;

    // SR/VWAP/êµ¬ì¡°
    final sr = _calcSr(candles, px);
    final s1 = sr.$1;
    final r1 = sr.$2;
    final vwap = _calcVwap(candles, px);

    final stTag = _structureTag(candles, px, s1, r1);

    // ë°˜ì‘ êµ¬ê°„(?? ?? ATR(?‰ê·  ìº”ë“¤ range) ê¸°ë°˜
    final atrAbs = _atrAbs(candles);
    final bandHalf = (atrAbs > 0) ? (atrAbs * 0.25) : (px * 0.0015);
    final reactLow = (stTag.reactLevel > 0) ? (stTag.reactLevel - bandHalf) : 0.0;
    final reactHigh = (stTag.reactLevel > 0) ? (stTag.reactLevel + bandHalf) : 0.0;

    // === Zones (Blitz) ===
    final liveFvg = _detectFvgZones(candles);
    final liveBpr = _detectBprZones(liveFvg);
    final liveOb = _detectObZones(candles);
    final liveMb = _detectMuMbZones(candles);

    // ìµœì†Œ ?œì‹œ???ë™ ì¡?(?ì? ?¤íŒ¨ ??
    final autoZone = (reactLow > 0 && reactHigh > 0)
        ? <FuZone>[FuZone(low: reactLow, high: reactHigh, label: 'REACT', dir: 0)]
        : const <FuZone>[];

    // êµ¬ì¡° ?´ë²¤???¸ë±???¤ì‹œê°?ê°±ì‹ )
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
    // EQL/EQH ?¼ë²¨ ?œê±°(ë¶„Â·ì‹œê°„Â·ì¼Â·ì£¼Â·ë‹¬ ê³µí†µ)

    // ê¸°ì¡´ ? í˜¸/ê³„íš?€ ? ì??˜ë©´?? êµ¬ì¡°/ìº”ë“¤/ê°€ê²©ë§Œ ?¤ì‹œê°„ìœ¼ë¡?ê°±ì‹ 
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

      // ë°©í–¥/?•ë¥ /?±ê¸‰ ? ì?
      signalDir: prev.signalDir,
      signalProb: prev.signalProb,
      signalGrade: prev.signalGrade,
      signalKo: prev.signalKo,
      signalWhy: prev.signalWhy,
      signalBullets: prev.signalBullets,

      candles: candles,
      // ?¤ì‹œê°?ì¡?ê°±ì‹  (?ì? ?¤íŒ¨ ??ê¸°ì¡´/?ë™ ì¡´ìœ¼ë¡??´ë°±)
      obZones: liveOb.isNotEmpty ? liveOb : (prev.obZones.isNotEmpty ? prev.obZones : autoZone),
      fvgZones: liveFvg.isNotEmpty ? liveFvg : (prev.fvgZones.isNotEmpty ? prev.fvgZones : autoZone),
      bprZones: liveBpr.isNotEmpty ? liveBpr : prev.bprZones,
      mbZones: liveMb.isNotEmpty ? liveMb : prev.mbZones,
      lossStreak: prev.lossStreak,

      // flow ? ì?
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

      // structure/reaction ?¤ì‹œê°?ê°±ì‹ 
      structureTag: stTag.tag,
      breakLevel: stTag.breakLevel,
      reactLevel: stTag.reactLevel,
      reactLow: reactLow,
      reactHigh: reactHigh,
      structMarks: structMarks,

      // MTF ?¤íŠ¸ë¦½ì? ? ì?(?¤ì‹œê°?ìº”ë“¤ ê°±ì‹  ???¬ë¼ì§€ì§€ ?Šê²Œ)
      mtfPulse: prev.mtfPulse,

      // futures plan ? ì?
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

  // ?‰ê·  ìº”ë“¤ ë³€?™í­(?ˆë?ê°? - ë°˜ì‘êµ¬ê°„(?? ??ê³„ì‚°???¬ìš©
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

  // ATR(?ˆë?ê°? - ê¸°ì¡´ ì½”ë“œ ?¸í™˜??ë³„ì¹­
  // ?„ê²©??TR(?´ì „ ì¢…ê? ?¬í•¨) ?€?? ë¯¸ë‹ˆ ì°¨íŠ¸/ì¡?ê³„ì‚°???‰ê·  range(high-low)ë¡?ì¶©ë¶„?©ë‹ˆ??
  double _atr(List<FuCandle> candles, int period) {
    return _atrAbs(candles, period: period);
  }

  Future<String> _higherTfFilter({
    required String symbol,
    required bool allowNetwork,
    required bool safeMode,
  }) async {
    // 4H + 1D ë¥??œë°©?¥â€ìœ¼ë¡??¬ìš©
    if (!allowNetwork || safeMode) return 'NEUTRAL';
    final c4h = await _tryBitgetCandles(symbol: symbol, tf: '4h');
    final c1d = await _tryBitgetCandles(symbol: symbol, tf: '1d');
    final d4h = _dirFromCandles(c4h);
    final d1d = _dirFromCandles(c1d);
    // ????ê°™ì? ë°©í–¥?´ë©´ ê°•í•˜ê²?ì±„íƒ
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

  /// 2010-01-01 00:00:00 UTC (ms) ??ì£????„ë´‰ ê³¼ê±° ?°ì´???˜ì´ì§€?¤ì´??ëª©í‘œ
  static const int _historyFrom2010Ms = 1262304000000;
  /// 2022??11??1??00:00 UTC (ms) ??ì£¼ë´‰/?¬ë´‰ "2022??11?”ë???ì§€ê¸ˆê¹Œì§€" ëª©í‘œ
  // ìµœì†Œ ë¡œë”© ëª©í‘œ: 2011-07-01 (UTC)
  static const int _jul2011Ms = 1309478400000;

  Future<List<FuCandle>?> _tryBitgetCandles({required String symbol, required String tf}) async {
    final intervals = _tfToBitgetIntervals(tf);
    if (intervals == null || intervals.isEmpty) return null;

    final tfU = tf.trim().toUpperCase();

    // 1D/1W/1M/1Y: ?„ì²´ ì°¨íŠ¸(?¥ê¸°) ?„ìš” ???¼ë´‰???ê¹Œì§€ ?˜ì´ì§•ìœ¼ë¡?ê°€?¸ì˜¨ ??ì§‘ê³„
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

  /// ì£????„ë´‰: 2022??11?”ë????„ì¬ê¹Œì? ?˜ì´ì§€?¤ì´?˜ìœ¼ë¡??˜ì§‘
  /// Bitget: before=ê³¼ê±°(???¤ë˜??ìº”ë“¤), after=ë¯¸ë˜(??ìµœì‹ ). ì²??¸ì¶œ?€ ìµœì‹  200ê°? ?´í›„ before=ê°€???¤ë˜??tsë¡??´ì „ êµ¬ê°„ ?”ì²­.
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

  /// Bitget ìº”ë“¤ interval ë§¤í•‘.
  /// - ?±ì? ?Œë¬¸???€ë¬¸ì ?¼ìš©(tfStrip: 1d, 1D ?? ê°€?????¬ê¸°??ëª¨ë‘ ?¡ìˆ˜
  /// - 1m ?€ ê±°ë˜???”ë“œ?¬ì¸?¸ì— ?°ë¼ ?œê¸°ê°€ ?¬ë¼???„ë³´ë¥??œì„œ?€ë¡??œë„
  List<String>? _tfToBitgetIntervals(String tf) {
    final t = tf.trim();
    // ?”ë´‰?€ '1M' (?€ë¬¸ì)ë¡??¤ì–´?¤ëŠ” ì¼€?´ìŠ¤ê°€ ë§ì•„??ë¨¼ì? ë¶„ê¸°
    if (t == '1M') return const ['1M'];

    final tl = t.toLowerCase();
    switch (tl) {
      case '1m':
        // ë¶„ë´‰(1m): ê±°ë˜???”ë“œ?¬ì¸?¸ì— ?°ë¼ ?œê¸°ê°€ ?¤ë? ???ˆì–´ ?„ë³´ë¥??œì„œ?€ë¡??œë„
        // ?°ì„ ?œìœ„: 1m ??1min ??5m(?€ì²?
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
        // ì£¼ë´‰: ?¼ë? ?”ë“œ?¬ì¸?¸ëŠ” 1W ë¯¸ì?????1Dë¥?ë°›ì•„ ?±ì—??ì£¼ë´‰?¼ë¡œ ì§‘ê³„
        return const ['1D'];
      case '1y':
        // ?„ë´‰: 1Dë¥?ë°›ì•„ ?±ì—???°ë´‰?¼ë¡œ ì§‘ê³„
        return const ['1D'];
      default:
        if (t == '1D') return const ['1D'];
        if (t == '1W') return const ['1W'];
        if (t == '1Y') return const ['1M'];
        return null;
    }
  }

  // ?˜ìœ„ ?¸í™˜(ê¸°ì¡´ ?¸ì¶œë¶€ê°€ ?¨ì•„?ˆì„ ???ˆìŒ)
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
    // ?°ì´?°ê? ?†ì„ ??ì°¨íŠ¸ê°€ '?ˆë¬´ ì§§ì•„ ë³´ì´?? ë¬¸ì œ ë°©ì?
    // (OB/FVG/BPR/CHOCH/BOS ê°™ì? êµ¬ì¡° ?¼ë²¨?€ ìµœì†Œ 150~200ë´‰ì? ?ˆì–´??? ì˜ë¯?
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

  /// ìµœê·¼ ìº”ë“¤?ì„œ ì§€ì§€/?€???¨ìˆœ) ê³„ì‚°: ìµœê·¼ 20ë´‰ì˜ ìµœì?/ìµœê³ 
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
    // ?ˆë¬´ ë¶™ìœ¼ë©?ìµœì†Œ ???•ë³´
    if ((hi - lo).abs() < px * 0.002) {
      lo = px * 0.99;
      hi = px * 1.01;
    }
    return (lo, hi);
  }

  double _calcVwap(List<FuCandle> c, double px) {
    if (c.isEmpty) return px;
    // volume ?†ìœ¼ë©?close ?‰ê· ?¼ë¡œ ?€ì²?    double vSum = 0;
    double pv = 0;
    for (final k in c.take(40)) {
      final v = (k.volume <= 0 ? 1.0 : k.volume);
      vSum += v;
      pv += k.close * v;
    }
    return vSum == 0 ? px : (pv / vSum);
  }

  /// SR ê²Œì´?? ?„ì¬ê°€ê°€ ì§€ì§€/?€??— ?¼ë§ˆ??ê°€ê¹Œìš´ì§€ë¡?LONG/SHORT ?ŒíŠ¸
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

  /// ?¤ë”ë¶??•ë ¥: ?„ì¬ê°€ ê·¼ì²˜(Â±0.25%)??bid/ask ë¬¼ëŸ‰?¼ë¡œ LONG/SHORT ?ŒíŠ¸
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

  /// ìµœê·¼ ì²´ê²°(100ê°? BUY/SELL ?°ì„¸ë¡?LONG/SHORT ?ŒíŠ¸
  (String, double, double, double, String) _tapeImbalance(List<Map<String, dynamic>> fills) {
    if (fills.isEmpty) return ('NEUTRAL', 35.0, 50.0, 50.0, '?‰ê· ');
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
    if (t <= 0) return ('NEUTRAL', 35.0, 50.0, 50.0, '?‰ê· ');
    final buyPct = (buy / t * 100.0).clamp(0.0, 100.0).toDouble();
    final sellPct = (sell / t * 100.0).clamp(0.0, 100.0).toDouble();
    final ratio = buy / t; // 0..1
    final strength = ((ratio - 0.5).abs() * 200.0).clamp(0.0, 100.0).toDouble();
    final hint = ratio > 0.58 ? 'ë§¤ìˆ˜ ?°ì„¸' : (ratio < 0.42 ? 'ë§¤ë„ ?°ì„¸' : '?¼ì¡°');
    if (ratio > 0.55) return ('LONG', strength, buyPct, sellPct, hint);
    if (ratio < 0.45) return ('SHORT', strength, buyPct, sellPct, hint);
    return ('NEUTRAL', (30.0 + strength * 0.4).clamp(0.0, 100.0).toDouble(), buyPct, sellPct, hint);
  }

  /// ê³ ë˜/ê¸°ê? ?ŒíŠ¸: ìµœê·¼ ì²´ê²°?ì„œ ???¬ì´ì¦?ë¹„ì¤‘ + ?¤ë”ë¶?ì²´ê²° ê´´ë¦¬ë¡??¡ìˆ˜/?¸ë ¥ ?ë‚Œ???¨ìˆœ ì¶”ì •
  ({int whaleScore, int whaleBuyPct, int instBias, String flowHint}) _whaleHeuristic(
    List<Map<String, dynamic>> fills, {
    required double obBuyPct,
    required double tapeBuyPct,
  }) {
    if (fills.isEmpty) {
      return (whaleScore: 0, whaleBuyPct: 50, instBias: ((obBuyPct + tapeBuyPct) / 2).round().clamp(0, 100), flowHint: '?°ì´??ë¶€ì¡?);
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
      return (whaleScore: 0, whaleBuyPct: 50, instBias: ((obBuyPct + tapeBuyPct) / 2).round().clamp(0, 100), flowHint: '?°ì´??ë¶€ì¡?);
    }
    sizes.sort();
    final idx = (sizes.length * 0.90).floor().clamp(0, sizes.length - 1);
    final p90 = sizes[idx];
    // ?ˆë¬´ ?‘ì•„ì§€??ê²½ìš° ë°©ì?
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

    // ê¸°ê?/?¸ë ¥ ë°©í–¥?? ?¤ë”ë¶?+ ì²´ê²° + ê³ ë˜ ë§¤ìˆ˜ ë¹„ì¤‘???¼í•©
    final instBias = ((obBuyPct * 0.35) + (tapeBuyPct * 0.35) + (whaleBuyPct * 0.30)).round().clamp(0, 100);

    // ?¡ìˆ˜(Absorption) ?ŒíŠ¸: ì²´ê²° ë§¤ìˆ˜ ?°ì„¸?¸ë° ?¤ë”ë¶ì? ë§¤ë„ë²??ëŠ” ë°˜ë?)
    final delta = (tapeBuyPct - obBuyPct);
    String hint;
    if (delta > 12 && tapeBuyPct > 55) hint = 'ë§¤ìˆ˜ ? ì…??/ ë§¤ë„ë²??¡ìˆ˜?';
    else if (delta < -12 && tapeBuyPct < 45) hint = 'ë§¤ë„ ? ì…??/ ë§¤ìˆ˜ë²??¡ìˆ˜?';
    else hint = 'ê· í˜•/?¼ì¡°';
    if (whaleScore >= 55) hint = 'ê³ ë˜ ?œë™??Â· $hint';

    return (whaleScore: whaleScore, whaleBuyPct: whaleBuyPct, instBias: instBias, flowHint: hint);
  }

  /// ê±°ë˜???¤íŒŒ?´í¬: ë§ˆì?ë§?ë´?volume / ìµœê·¼ ?‰ê· 
  (String, double, double, double, String) _volumeSpike(List<FuCandle> c) {
    if (c.length < 12) return ('NEUTRAL', 30.0, 0.0, 0.0, '?°ì´??ë¶€ì¡?);
    final n = c.length < 21 ? c.length : 21;
    final sub = c.sublist(c.length - n);
    final lastV = sub.last.volume;
    double avg = 0;
    for (final k in sub.take(sub.length - 1)) {
      avg += (k.volume <= 0 ? 0 : k.volume);
    }
    avg = avg / math.max(1, sub.length - 1);
    if (avg <= 0 || lastV <= 0) return ('NEUTRAL', 35.0, 0.0, 0.0, '?‰ê· ');
    final r = (lastV / avg);
    final strength = ((r - 1).abs() * 35.0).clamp(0.0, 100.0).toDouble();
    final hint = r >= 1.8 ? 'ê¸‰ì¦' : (r >= 1.2 ? 'ì¦ê?' : (r <= 0.7 ? 'ê°ì†Œ' : '?‰ê· '));
    // volume?€ ë°©í–¥?±ì´ ?†ìœ¼ë¯€ë¡? ìµœê·¼ ìº”ë“¤??ë°©í–¥?¼ë¡œ voteë¥??´ì§ ë¶€??    final dir = sub.last.close >= sub.last.open ? 'LONG' : 'SHORT';
    return (
      hint == '?‰ê· ' ? 'NEUTRAL' : dir,
      (40.0 + strength * 0.6).clamp(0.0, 100.0).toDouble(),
      0.0,
      0.0,
      hint,
    );
  }

  /// ëª¨ë©˜?€: ?¨ê¸° SMA ?€ë¹??„ì¬ê°€
  (String, double, double, double, String) _momentum(List<FuCandle> c) {
    if (c.length < 12) return ('NEUTRAL', 35.0, 0.0, 0.0, '?°ì´??ë¶€ì¡?);
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
    if (diffPct > 0.01) return ('LONG', (40.0 + strength * 0.6).clamp(0.0, 100.0).toDouble(), 0.0, 0.0, '?ìŠ¹');
    if (diffPct < -0.01) return ('SHORT', (40.0 + strength * 0.6).clamp(0.0, 100.0).toDouble(), 0.0, 0.0, '?˜ë½');
    return ('NEUTRAL', (35.0 + strength * 0.3).clamp(0.0, 100.0).toDouble(), 0.0, 0.0, '?¡ë³´');
  }

  // ------------------------------
  // Zone detectors (Blitz / Lightweight)
  // ------------------------------

  /// GAP ê°œí¸: TFë³?Zone ì¤‘ì²©??ë³‘í•©?´ì„œ ì°¨íŠ¸ê°€ ì§€?€ë¶„í•´ì§€??ê²ƒì„ ë°©ì?.
  /// - ?œì‹œë¥?OFF ?˜ë”?¼ë„(ê¸°ë³¸ê°?, ?”ì§„/?•ë¥  ê³„ì‚°?€ ??ë³‘í•© ê²°ê³¼ë¥??¬ìš©.
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
        // ë³‘í•©: ë²”ìœ„ ?•ì¥ + ?¼ë²¨?€ ì§§ê²Œ(?œì‹œ??
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
    // BPR: ìµœê·¼ Bullish FVG?€ Bearish FVG??ê²¹ì¹˜??êµ¬ê°„(intersection)
    // ê²¹ì¹˜ë©?2ê°?ì¡?BPR1/2)ë¡?ìª¼ê°œ??ì°¨íŠ¸???œí˜„.
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
    // ?„ì£¼ ?¨ìˆœ??OB: ê°•í•œ ë³€??displacement) ì§ì „??ë°˜ë???ìº”ë“¤
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
      // ?´ì „ 1~3ê°?ì¤?ë°˜ë???ìº”ë“¤??OBë¡??¡ìŒ
      final jEnd = (i - 4).clamp(0, i - 1).toInt();
      for (int j = i - 1; j >= jEnd; j--) {
        final p = candles[j];
        final bullishMove = c.close > c.open;
        final pIsOpposite = bullishMove ? (p.close < p.open) : (p.close > p.open);
        if (!pIsOpposite) continue;
        final low = p.low;
        final high = bullishMove ? p.open : p.open; // open ê¸°ì?(ë³´ìˆ˜??
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
    // PO3 ê´€?ì˜ ê°„ë‹¨??Manipulation ì¡? ìµœê·¼ ë°•ìŠ¤ ë²”ìœ„ë¥??´ì§ ?´íƒˆ?ˆë‹¤ê°€ ë³µê???êµ¬ê°„
    if (candles.length < 60) return const <FuZone>[];
    final atr = _atr(candles, 14);
    final n = 40;
    final window = candles.sublist(candles.length - n);
    double hi = window.first.high, lo = window.first.low;
    for (final c in window) {
      if (c.high > hi) hi = c.high;
      if (c.low < lo) lo = c.low;
    }
    // sweep: lo ?„ë˜ë¡?atr*0.8 ?´ìƒ ì°ê³ , ?¤ì‹œ lo ?„ë¡œ ?Œë³µ??ê²½ìš°(?ìŠ¹ ?œë‚˜ë¦¬ì˜¤)
    final last = candles.last;
    // ìµœê·¼ 8ê°œì—??sweep ì°¾ê¸°
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

    final riskTag = (sweep >= 70.0) ? ' ? ï¸?¤ìœ•' : '';
    final absTag = (abs >= 70.0) ? ' ?¡ìˆ˜' : (abs <= 30.0 ? ' ?½í•¨' : '');
    final forceTag = (force >= 70.0) ? ' ê°•í•¨' : (force <= 30.0 ? ' ?½í•¨' : '');

    if (buyBias - sellBias >= 12.0) {
      return 'ë§¤ìˆ˜ ?°ì„¸${absTag}${forceTag}${riskTag}'.trim();
    }
    if (sellBias - buyBias >= 12.0) {
      return 'ë§¤ë„ ?°ì„¸${absTag}${forceTag}${riskTag}'.trim();
    }

    // Fallback to whale hint if provided
    final w = whaleHint.trim();
    if (w.isNotEmpty) {
      return '$w$riskTag'.trim();
    }
    return 'ì¤‘ë¦½${riskTag}'.trim();
  }
}

// ?´ë? ?¤ìœ™ ?¬ì¸???ë£Œ??(pivot)
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
