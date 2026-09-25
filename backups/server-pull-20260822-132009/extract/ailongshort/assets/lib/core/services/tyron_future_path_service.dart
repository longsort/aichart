import 'dart:math' as math;

import '../models/fu_state.dart';
import '../models/future_path_price_dto.dart';
import '../../data/models/candle.dart';
import '../../logic/tyron_pro_engine.dart';

/// TYRON -> FuturePathPriceDTO 어댑터
///
/// - TyronProEngine은 상대 수익률 시퀀스(pathMain/pathAlt)를 만든다.
/// - UI(미래경로/점선)는 FuturePathPriceDTO(wavePrices 6포인트)를 사용한다.
/// - 이 서비스는 path를 6개 대표 포인트(anchor,w1,w2,w3,w4,w5)로 압축해서
///   기존 FuturePathPainter를 그대로 재사용한다.
class TyronFuturePathService {
  static FuturePathPriceDTO? buildFromFuCandles({
    required String tf,
    required List<FuCandle> candles,
    bool useAlt = false,
  }) {
    if (candles.length < 60) return null;

    final cs = candles
        .map((c) => Candle(
              t: DateTime.fromMillisecondsSinceEpoch(c.ts, isUtc: true),
              o: c.open,
              h: c.high,
              l: c.low,
              c: c.close,
              v: c.volume,
            ))
        .toList();

    final r = TyronProEngine.analyze(cs);
    final seq = useAlt ? r.pathAlt : r.pathMain;
    if (seq.isEmpty) return null;

    final anchor = cs.last.c;
    final target = anchor * (1.0 + seq.last);

    // 무효가: 마지막 캔들 기준 ATR 추정(간단)
    final atr = _atr(cs, 14);
    final basePct = (atr > 0 && anchor > 0) ? (atr / anchor) : 0.006;
    final isLong = r.bias == 'LONG';
    final invalid = isLong ? (anchor * (1.0 - basePct * 0.9)) : (anchor * (1.0 + basePct * 0.9));

    // 6포인트 샘플링(시퀀스 길이에 맞춰 균등 샘플)
    final wave = _sample6(anchor: anchor, returns: seq);

    // RR 근사
    final risk = (anchor - invalid).abs().clamp(1e-9, 1e18);
    final reward = (target - anchor).abs();
    final rr = reward / risk;
    final rrX10 = (rr * 10).round().clamp(0, 999);

    final pMain = r.confidence.clamp(0, 100);
    final dir = isLong ? 'LONG' : (r.bias == 'SHORT' ? 'SHORT' : 'WATCH');

    return FuturePathPriceDTO(
      tf: tf,
      anchor: anchor,
      target: target,
      invalid: invalid,
      pMain: pMain,
      rrX10: rrX10,
      dir: dir == 'WATCH' ? 'LONG' : dir, // painter expects LONG/SHORT; WATCH는 LONG로 안전 fallback
      wavePrices: wave,
    );
  }

  static List<double> _sample6({required double anchor, required List<double> returns}) {
    // returns: cumulative returns
    final idx = <int>[0, 0, 0, 0, 0, returns.length - 1];
    if (returns.length > 5) {
      idx[1] = (returns.length * 0.20).round().clamp(0, returns.length - 1);
      idx[2] = (returns.length * 0.35).round().clamp(0, returns.length - 1);
      idx[3] = (returns.length * 0.60).round().clamp(0, returns.length - 1);
      idx[4] = (returns.length * 0.80).round().clamp(0, returns.length - 1);
    }
    final out = <double>[];
    for (final i in idx) {
      final p = anchor * (1.0 + returns[i]);
      out.add(p);
    }
    // anchor 중복 제거용: 첫 값은 anchor로 고정
    out[0] = anchor;
    return out;
  }

  static double _atr(List<Candle> c, int len) {
    if (c.length < len + 2) return 0.0;
    final start = c.length - len;
    double sum = 0.0;
    for (int i = start; i < c.length; i++) {
      final cur = c[i];
      final prevClose = c[i - 1].c;
      final tr = math.max(cur.h - cur.l, math.max((cur.h - prevClose).abs(), (cur.l - prevClose).abs()));
      sum += tr;
    }
    return sum / len;
  }
}
