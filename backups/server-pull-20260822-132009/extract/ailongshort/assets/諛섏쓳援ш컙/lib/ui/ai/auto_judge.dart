import 'dart:async';
import 'trade_models.dart';

/// Auto Judge Engine
/// - 입력: TradePlan + 실시간 priceStream
/// - 출력: TradeOutcome (TP/SL/TIMEOUT)
/// - MAE/MFE 자동 측정
///
/// 간단 룰:
/// - LONG: price <= sl => SL, price >= tp1/tp2/tp3 순차 hit (최종 tp3면 TP)
/// - SHORT: price >= sl => SL, price <= tp1/tp2/tp3
/// - TIMEOUT: 지정시간 초과 시 TIMEOUT
class AutoJudge {
  final Duration timeout;
  final double beAfterTp1; // 0이면 비활성. TP1 히트 후 BE(진입가)로 슬을 끌어올리는 옵션(롱) / 끌어내리는 옵션(숏)
  const AutoJudge({
    this.timeout = const Duration(minutes: 90),
    this.beAfterTp1 = 0.0,
  });

  Future<TradeOutcome> run({
    required TradePlan plan,
    required Stream<double> priceStream,
  }) async {
    final isLong = plan.direction.toUpperCase() == 'LONG';
    double sl = plan.sl;

    int tpHit = 0;
    double mae = 0.0; // adverse distance
    double mfe = 0.0; // favorable distance

    // define helpers
    double adverseDist(double p) => isLong ? (plan.entry - p) : (p - plan.entry);
    double favorableDist(double p) => isLong ? (p - plan.entry) : (plan.entry - p);

    final completer = Completer<TradeOutcome>();
    StreamSubscription<double>? sub;

    Timer? t;
    t = Timer(timeout, () async {
      await sub?.cancel();
      if (!completer.isCompleted) {
        completer.complete(TradeOutcome(
          result: 'TIMEOUT',
          closedAtMs: DateTime.now().millisecondsSinceEpoch,
          closePrice: null,
          mae: mae,
          mfe: mfe,
          tpHit: tpHit,
        ));
      }
    });

    sub = priceStream.listen((p) async {
      // update MAE/MFE
      final a = adverseDist(p);
      final f = favorableDist(p);
      if (a > mae) mae = a;
      if (f > mfe) mfe = f;

      // SL check
      if (isLong) {
        if (p <= sl) {
          await sub?.cancel();
          t?.cancel();
          if (!completer.isCompleted) {
            completer.complete(TradeOutcome(
              result: 'SL',
              closedAtMs: DateTime.now().millisecondsSinceEpoch,
              closePrice: p,
              mae: mae,
              mfe: mfe,
              tpHit: tpHit,
            ));
          }
          return;
        }
      } else {
        if (p >= sl) {
          await sub?.cancel();
          t?.cancel();
          if (!completer.isCompleted) {
            completer.complete(TradeOutcome(
              result: 'SL',
              closedAtMs: DateTime.now().millisecondsSinceEpoch,
              closePrice: p,
              mae: mae,
              mfe: mfe,
              tpHit: tpHit,
            ));
          }
          return;
        }
      }

      // TP check (sequential)
      final tps = plan.tps;
      if (tps.isNotEmpty) {
        if (isLong) {
          while (tpHit < tps.length && p >= tps[tpHit]) {
            tpHit += 1;
            if (tpHit == 1 && beAfterTp1 > 0) {
              // move SL toward breakeven
              final be = plan.entry;
              sl = (sl + (be - sl) * beAfterTp1);
            }
          }
        } else {
          while (tpHit < tps.length && p <= tps[tpHit]) {
            tpHit += 1;
            if (tpHit == 1 && beAfterTp1 > 0) {
              final be = plan.entry;
              sl = (sl - (sl - be) * beAfterTp1);
            }
          }
        }

        if (tpHit >= tps.length) {
          await sub?.cancel();
          t?.cancel();
          if (!completer.isCompleted) {
            completer.complete(TradeOutcome(
              result: 'TP',
              closedAtMs: DateTime.now().millisecondsSinceEpoch,
              closePrice: p,
              mae: mae,
              mfe: mfe,
              tpHit: tpHit,
            ));
          }
        }
      }
    }, onError: (_) async {
      // ignore stream errors
    });

    return completer.future;
  }
}