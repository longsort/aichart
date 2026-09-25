import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart';
import '../data/snapshot/evidence.dart';
import '../engine/evidence/evidence_live_hub.dart';
import '../data/bitget/bitget_live_store.dart';
import 'app_core.dart';

/// EngineBridge
/// - 앱의 "중앙 파이프(AppCore -> SnapshotHub)"에 실제/실시간 근거(Evidence)를 밀어넣는 곳
/// - 네트워크/엔진이 죽어도 앱이 죽지 않게, 자동 데모 폴백 유지
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

  // 설정
  String symbol = 'BTCUSDT';
  Duration liveInterval = const Duration(seconds: 1);

  void start({String? symbol}) {
    if (_running) return;
    _running = true;
    if (symbol != null && symbol.isNotEmpty) this.symbol = symbol;

    // 1) 라이브 스토어 시작 (REST ticker 폴링 기반, 크래시 없이 동작)
    try {
      BitgetLiveStore.I.start(symbol: this.symbol, interval: const Duration(seconds: 2));
    } catch (_) {
      // ignore
    }

    // 2) 증거 허브 시작 (내부적으로 BitgetLiveStore 값을 사용)
    try {
      EvidenceLiveHub.I.start();
    } catch (_) {
      // ignore
    }

    // 3) live -> AppCore push 루프
    _startLivePush();

    // 4) 안전장치: 라이브가 안들어오면 데모 유지
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

    // 스토어/허브 dispose는 앱 전체 종료 시에만(여기서 끄면 화면이 멈출 수 있음)
  }

  void _startLivePush() {
    // notifier 리스너(즉시 반영)
    void onEv() {
      if (!_running) return;
      final list = EvidenceLiveHub.I.items.value;
      if (list.isEmpty) return;
      _pushEvidenceList(list);
    }

    _evListener = onEv;
    EvidenceLiveHub.I.items.addListener(onEv);

    // 주기적 push(혹시 notifier가 안바뀌는 상황 대비)
    _pushTimer ??= Timer.periodic(liveInterval, (_) {
      if (!_running) return;
      final list = EvidenceLiveHub.I.items.value;
      if (list.isNotEmpty) _pushEvidenceList(list);

      // 추가: 가격 모멘텀 기반 TREND_CORE 증거 생성
      _pushTrendEvidence();
    });
  }

  void _pushEvidenceList(List<EvidenceLive> list) {
    // live item -> Evidence 변환
    for (final it in list) {
      final mapped = _mapEvidence(it);
      if (mapped != null) {
        AppCore.I.push(mapped);
      }
    }
  }

  Evidence? _mapEvidence(EvidenceLive it) {
    // score: 0..100, 50이 중립
    final centered = ((it.score - 50.0) / 50.0).clamp(-1.0, 1.0).toDouble();

    double dirSign = 0.0;
    if (it.dir == 'LONG') dirSign = 1.0;
    if (it.dir == 'SHORT') dirSign = -1.0;

    // dir가 NEUTRAL이면 score만으로 방향을 잡지 않고 0에 가깝게
    final score = (dirSign == 0.0) ? (centered * 0.35) : (centered * dirSign).clamp(-1.0, 1.0);

    // confidence: 중립에서 멀수록 증가
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

    // 최근/이전 평균으로 간단 모멘텀
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
    // 라이브 온라인이 false가 오래 지속되면 데모를 유지/재개
    _demoTimer ??= Timer.periodic(const Duration(seconds: 2), (_) {
      if (!_running) return;
      final online = BitgetLiveStore.I.online.value;
      if (!online) {
        _pushDemoOnce();
      }
    });
  }

  void _pushDemoOnce() {
    // bias 역할: -1..+1
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
