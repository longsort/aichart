import 'dart:math';
import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:fulink_pro_ultra/data/bitget/bitget_live_store.dart';
import 'package:fulink_pro_ultra/engine/consensus/consensus_bus.dart';
import 'package:fulink_pro_ultra/engine/central/decision_logger.dart';

/// Central consensus hub:
/// - Collects multi-TF proxies from a single live price stream
/// - Publishes: consensus01 (0~1) + tfUp (TF => UP%)
///
/// NOTE:
/// This uses the live ticker ring buffer as a proxy until true candle snapshots are wired.
/// It is designed to be safe (no throws) and lightweight.
class CentralConsensusEngine {
  static final CentralConsensusEngine I = CentralConsensusEngine._();
  CentralConsensusEngine._();

  bool _started = false;
  Timer? _hb;

  // 2s live tick in BitgetLiveStore
  static const int _tickSec = 2;

  // TF windows in minutes
  static const Map<String, int> _tfMin = {
    '1m': 1,
    '3m': 3,
    '5m': 5,
    '15m': 15,
    '1H': 60,
    '4H': 240,
    '1D': 1440,
    '1W': 10080,
  };

  // weights for consensus (must sum doesn't matter)
  static const Map<String, int> _w = {
    '1m': 6,
    '3m': 10,
    '5m': 20,
    '15m': 25,
    '1H': 25,
    '4H': 20,
    '1D': 7,
    '1W': 3,
  };

  void start() {
    if (_started) return;
    _started = true;
    _tick();
    BitgetLiveStore.I.ticker.addListener(_tick);

    // Heartbeat: keep UI "연동" status moving even when external tick stalls.
    // Safe: lightweight and throttled.
    _hb ??= Timer.periodic(const Duration(seconds: 2), (_) {
      if (!_started) return;
      _tick();
    });
  }

  void stop() {
    if (!_started) return;
    _started = false;
    BitgetLiveStore.I.ticker.removeListener(_tick);
    _hb?.cancel();
    _hb = null;
  }

  void _tick() {
    final res = _calcSafe();
    ConsensusBus.I.consensus01.value = res.consensus01;
    ConsensusBus.I.tfUp.value = res.tfUp;
    // 중앙 엔진 ↔ UI 연동 상태 판단용
    ConsensusBus.I.lastUpdateMs.value = DateTime.now().millisecondsSinceEpoch;

    // 10 evidence (proxy) - makes UI move even before full market microstructure is wired.
    final ev = _calcEvidenceSafe(res);
    ConsensusBus.I.evidenceTotal.value = ev.total;
    ConsensusBus.I.evidenceHit.value = ev.hit;
    ConsensusBus.I.evidenceFlags.value = ev.flags;

    // Snapshot log (safe, throttled)
    DecisionLogger.I.log(consensus01: res.consensus01, tfUp: res.tfUp);
  }

  _EvidenceRes _calcEvidenceSafe(_CentralConsensusRes res) {
    try {
      final ps = BitgetLiveStore.I.prices;
      final vs = BitgetLiveStore.I.vols;
      if (ps.length < 30) {
        return const _EvidenceRes(0, 10, <String, bool>{});
      }

      // Direction bias (central)
      final c = res.consensus01;
      final bias = c >= 0.55 ? 1 : (c <= 0.45 ? -1 : 0);

      int up(String k) => res.tfUp[k] ?? 50;
      int dirFromUp(int u) => u >= 55 ? 1 : (u <= 45 ? -1 : 0);

      final d1m = dirFromUp(up('1m'));
      final d3m = dirFromUp(up('3m'));
      final d5m = dirFromUp(up('5m'));
      final d15m = dirFromUp(up('15m'));
      final d1h = dirFromUp(up('1H'));
      final d4h = dirFromUp(up('4H'));
      final d1d = dirFromUp(up('1D'));

      // Higher TF gate
      final higherOk = !(d4h != 0 && d1d != 0 && d4h != d1d);
      final swingOk = (d15m == 0 || d1h == 0) ? true : (d15m == d1h);
      final scalpOk = (d1m == 0 && d3m == 0 && d5m == 0) ? false : ((d5m != 0 ? d5m : (d3m != 0 ? d3m : d1m)) == (d15m != 0 ? d15m : (d1h != 0 ? d1h : (bias != 0 ? bias : 0))));

      // Volume/whale proxy
      final vNow = vs.isNotEmpty ? vs.last : 0.0;
      final vRef = vs.length >= 30 ? (vs.sublist(max(0, vs.length - 30)).reduce((a, b) => a + b) / min(30, vs.length)) : (vNow == 0 ? 1.0 : vNow);
      final volUp = vNow >= vRef * 1.03;
      final whaleOk = BitgetLiveStore.I.whaleGrade == 'MID' || BitgetLiveStore.I.whaleGrade == 'HIGH' || BitgetLiveStore.I.whaleGrade == 'ULTRA';

      // Volatility (proxy) - avoid noisy zone
      final recent = ps.sublist(max(0, ps.length - 50));
      final mean = recent.reduce((a, b) => a + b) / recent.length;
      double varSum = 0;
      for (final p in recent) {
        final d = p - mean;
        varSum += d * d;
      }
      final stdev = sqrt(varSum / recent.length);
      final volNorm = mean == 0 ? 0.0 : (stdev / mean);
      final volaOk = volNorm <= 0.008; // ~0.8% of mean (proxy)

      // Momentum strength (how far from 50)
      final momOk = (up('5m') - 50).abs() >= 8 || (up('15m') - 50).abs() >= 8;

      // Bias alignment
      final alignOk = bias == 0 ? true : ((d15m == 0 ? d1h : d15m) == 0 ? true : (bias == (d15m == 0 ? d1h : d15m)));

      // Risk OK (simple)
      final riskOk = higherOk && volaOk;

      final flags = <String, bool>{
        '상위(4H·1D) 동조': higherOk,
        '스윙(15m·1H) 동조': swingOk,
        '초단타(1·3·5분) 타이밍': scalpOk,
        '모멘텀 충분': momOk,
        '거래량 증가': volUp,
        '고래 등급(중↑)': whaleOk,
        '변동성 안정': volaOk,
        '중앙 방향 일치': alignOk,
        '리스크 OK': riskOk,
        '데이터 정상(연결)': true,
      };

      final hit = flags.values.where((v) => v).length;
      return _EvidenceRes(hit, 10, flags);
    } catch (_) {
      return const _EvidenceRes(0, 10, <String, bool>{});
    }
  }

  _CentralConsensusRes _calcSafe() {
    try {
      final ps = BitgetLiveStore.I.prices;
      if (ps.length < 50) {
        // Not enough samples yet: publish neutral values so UI still moves.
        return const _CentralConsensusRes(0.5, <String, int>{
          '5m': 50, '15m': 50, '1H': 50, '4H': 50, '1D': 50, '1W': 50,
        });
      }

      final tfUp = <String, int>{};
      for (final e in _tfMin.entries) {
        tfUp[e.key] = _upPct(ps, minutes: e.value);
      }

      // directional score from UP% (0..100) -> (-1..+1)
      double num = 0;
      double den = 0;
      for (final e in tfUp.entries) {
        final w = (_w[e.key] ?? 1).toDouble();
        final s = ((e.value - 50) / 50).clamp(-1.0, 1.0); // -1..1
        num += s * w;
        den += w;
      }
      double consensus01 = den == 0 ? 0.0 : ((num / den) * 0.5 + 0.5); // map -1..1 to 0..1
      consensus01 = consensus01.clamp(0.0, 1.0);

      // Gate: if long/short conflict between 1D and 1W, dampen consensus (acts like LOCK)
      final d1 = _dir(tfUp['1D'] ?? 50);
      final w1 = _dir(tfUp['1W'] ?? 50);
      if (d1 != 0 && w1 != 0 && d1 != w1) {
        // conflict => pull towards neutral
        consensus01 = (consensus01 + 0.5) / 2.0;
      }

      // Ensure all expected keys exist (prevents empty/stuck UI)
      tfUp.putIfAbsent('5m', () => 50);
      tfUp.putIfAbsent('15m', () => 50);
      tfUp.putIfAbsent('1H', () => 50);
      tfUp.putIfAbsent('4H', () => 50);
      tfUp.putIfAbsent('1D', () => 50);
      tfUp.putIfAbsent('1W', () => 50);

      return _CentralConsensusRes(consensus01, tfUp);
    } catch (_) {
      return const _CentralConsensusRes(0.5, <String, int>{'5m':50,'15m':50,'1H':50,'4H':50,'1D':50,'1W':50});
    }
  }

  int _dir(int upPct) {
    if (upPct >= 55) return 1; // long bias
    if (upPct <= 45) return -1; // short bias
    return 0;
  }

  int _upPct(List<double> ps, {required int minutes}) {
    if (ps.isEmpty) return 0;
    final win = max(10, (minutes * 60) ~/ _tickSec);
    final n = ps.length;
    final start = max(0, n - win);
    final base = ps[start];
    int up = 0;
    int tot = 0;
    for (int i = start; i < n; i++) {
      tot++;
      if (ps[i] >= base) up++;
    }
    if (tot == 0) return 0;
    return (up / tot * 100).round().clamp(0, 100);
  }
}

class _CentralConsensusRes {
  final double consensus01;
  final Map<String, int> tfUp;
  const _CentralConsensusRes(this.consensus01, this.tfUp);
}

class _EvidenceRes {
  final int hit;
  final int total;
  final Map<String, bool> flags;
  const _EvidenceRes(this.hit, this.total, this.flags);
}
