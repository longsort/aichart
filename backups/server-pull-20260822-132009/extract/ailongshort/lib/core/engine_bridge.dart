import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart';
import '../data/snapshot/evidence.dart';
import '../engine/evidence/evidence_live_hub.dart';
import '../data/bitget/bitget_live_store.dart';
import 'app_core.dart';

/// EngineBridge
/// - ?�의 "중앙 ?�이??AppCore -> SnapshotHub)"???�제/?�시�?근거(Evidence)�?밀?�넣??�?/// - ?�트?�크/?�진??죽어???�이 죽�? ?�게, ?�동 ?�모 ?�백 ?��?
class EngineBridge {
  EngineBridge._();
  static final EngineBridge I = EngineBridge._();

  bool _running = false;

  // live
  Timer? _pushTimer;
  VoidCallback? _evListener;

  // demo fallback
  final _rng = Random(42);
  Timer? _demoTimer;

  // ?�정
  String symbol = 'BTCUSDT';
  Duration liveInterval = const Duration(seconds: 1);

  void start({String? symbol}) {
    if (_running) return;
    _running = true;
    if (symbol != null && symbol.isNotEmpty) this.symbol = symbol;

    // 1) ?�이�??�토???�작 (REST ticker ?�링 기반, ?�래???�이 ?�작)
    try {
      BitgetLiveStore.I.start(symbol: this.symbol, interval: const Duration(seconds: 2));
    } catch (_) {
      // ignore
    }

    // 2) 증거 ?�브 ?�작 (?��??�으�?BitgetLiveStore 값을 ?�용)
    try {
      EvidenceLiveHub.I.start();
    } catch (_) {
      // ignore
    }

    // 3) live -> AppCore push 루프
    _startLivePush();

    // 4) ?�전?�치: ?�이브�? ?�들?�오�??�모 ?��?
    _ensureDemoFallback();
  }

  void stop() {
    _running = false;

    _pushTimer?.cancel();
    _pushTimer = null;

    if (_evListener != null) {
      EvidenceLiveHub.I.items.removeListener(_evListener!);
      _evListener = null;
    }

    _demoTimer?.cancel();
    _demoTimer = null;

    // ?�토???�브 dispose?????�체 종료 ?�에�??�기???�면 ?�면??멈출 ???�음)
  }

  void _startLivePush() {
    // notifier 리스??즉시 반영)
    void onEv() {
      if (!_running) return;
      final list = EvidenceLiveHub.I.items.value;
      if (list.isEmpty) return;
      _pushEvidenceList(list);
    }

    _evListener = onEv;
    EvidenceLiveHub.I.items.addListener(onEv);

    // 주기??push(?�시 notifier가 ?�바?�는 ?�황 ?��?
    _pushTimer ??= Timer.periodic(liveInterval, (_) {
      if (!_running) return;
      final list = EvidenceLiveHub.I.items.value;
      if (list.isNotEmpty) _pushEvidenceList(list);

      // 추�?: 가�?모멘?� 기반 TREND_CORE 증거 ?�성
      _pushTrendEvidence();
    });
  }

  void _pushEvidenceList(List<EvidenceLive> list) {
    // live item -> Evidence 변??    for (final it in list) {
      final mapped = _mapEvidence(it);
      if (mapped != null) {
        AppCore.I.push(mapped);
      }
    }
  }

  Evidence? _mapEvidence(EvidenceLive it) {
    // score: 0..100, 50??중립
    final centered = ((it.score - 50.0) / 50.0).clamp(-1.0, 1.0).toDouble();

    double dirSign = 0.0;
    if (it.dir == 'LONG') dirSign = 1.0;
    if (it.dir == 'SHORT') dirSign = -1.0;

    // dir가 NEUTRAL?�면 score만으�?방향???��? ?�고 0??가깝게
    final score = (dirSign == 0.0) ? (centered * 0.35) : (centered * dirSign).clamp(-1.0, 1.0);

    // confidence: 중립?�서 멀?�록 증�?
    final confidence = centered.abs().clamp(0.05, 1.0);

    final kind = _kindFromKey(it.key);
    final weight = _weightFromKey(it.key);

    return Evidence(
      id: it.key.toUpperCase(),
      kind: kind,
      tf: '15m',
      score: score,
      weight: weight,
      confidence: confidence,
    );
  }

  EvidenceKind _kindFromKey(String key) {
    switch (key) {
      case 'pat':
        return EvidenceKind.pattern;
      case 'pwr':
      case 'whale':
      case 'vol':
      case 'liq':
        return EvidenceKind.flow;
      case 'fvg':
      case 'fund':
      case 'chain':
      case 'sent':
      default:
        return EvidenceKind.trend;
    }
  }

  double _weightFromKey(String key) {
    switch (key) {
      case 'pwr':
        return 0.70;
      case 'whale':
        return 0.62;
      case 'vol':
        return 0.55;
      case 'pat':
        return 0.48;
      case 'liq':
        return 0.50;
      case 'fvg':
        return 0.46;
      case 'fund':
        return 0.40;
      default:
        return 0.38;
    }
  }

  void _pushTrendEvidence() {
    final prices = BitgetLiveStore.I.prices;
    if (prices.length < 10) return;

    // 최근/?�전 ?�균?�로 간단 모멘?�
    final n = prices.length;
    final a = prices.sublist(max(0, n - 5), n);
    final b = prices.sublist(max(0, n - 10), max(0, n - 5));
    double avg(List<double> x) => x.isEmpty ? 0 : x.reduce((p, c) => p + c) / x.length;

    final avgA = avg(a);
    final avgB = avg(b);
    if (avgA == 0 || avgB == 0) return;

    final mom = ((avgA - avgB) / avgB).clamp(-0.01, 0.01); // -1%..+1%
    final score = (mom / 0.01).clamp(-1.0, 1.0).toDouble(); // -1..+1
    final conf = (mom.abs() / 0.01).clamp(0.0, 1.0).toDouble();

    AppCore.I.push(Evidence(
      id: 'TREND_CORE',
      kind: EvidenceKind.trend,
      tf: '15m',
      score: score,
      weight: 0.80,
      confidence: conf.clamp(0.15, 1.0),
    ));
  }

  void _ensureDemoFallback() {
    // ?�이�??�라?�이 false가 ?�래 지?�되�??�모�??��?/?�개
    _demoTimer ??= Timer.periodic(const Duration(seconds: 2), (_) {
      if (!_running) return;
      final online = BitgetLiveStore.I.online.value;
      if (!online) {
        _pushDemoOnce();
      }
    });
  }

  void _pushDemoOnce() {
    // bias ??��: -1..+1
    final bias = (_rng.nextDouble() * 2 - 1).clamp(-1.0, 1.0).toDouble();
    final conf = (_rng.nextDouble() * 0.6 + 0.3).clamp(0.0, 1.0).toDouble();
    final cons = (_rng.nextDouble() * 0.6 + 0.2).clamp(0.0, 1.0).toDouble();

    AppCore.I.push(Evidence(
      id: 'PWR',
      kind: EvidenceKind.flow,
      tf: '15m',
      score: bias,
      weight: 0.65,
      confidence: conf,
    ));
    AppCore.I.push(Evidence(
      id: 'VOL',
      kind: EvidenceKind.flow,
      tf: '15m',
      score: bias * 0.8,
      weight: 0.55,
      confidence: (conf * 0.9),
    ));
    AppCore.I.push(Evidence(
      id: 'PAT',
      kind: EvidenceKind.pattern,
      tf: '15m',
      score: bias * 0.5,
      weight: 0.45,
      confidence: cons,
    ));
  }
}
