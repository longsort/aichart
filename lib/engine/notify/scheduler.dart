import 'dart:async';
import 'package:flutter/foundation.dart';
import '../../core/timeframe.dart';
import '../../core/constants.dart';
import '../../core/result.dart';
import '../../data/repo/market_repo.dart';
import '../../data/exchange/dto/candle_dto.dart';
import '../models/candle.dart';
import '../analyzer/engine_runner.dart';
import '../briefing/briefing_engine.dart';
import '../self_tune/self_tune_engine.dart';
import 'notify_service.dart';

/// S-11: ë§¤ì¼ 23:55 1??ë§ˆê° ë¸Œë¦¬???ë™ ?ì„± ???Œë¦¼. (???¤í–‰ ì¤‘ì¼ ???™ìž‘)
class Scheduler {
  static final Scheduler _instance = Scheduler._();
  factory Scheduler() => _instance;

  Scheduler._();

  final MarketRepo _repo = MarketRepo();
  final EngineRunner _engine = EngineRunner();
  final BriefingEngine _briefingEngine = BriefingEngine();
  final SelfTuneEngine _selfTune = SelfTuneEngine();
  final NotifyService _notify = NotifyService();

  Timer? _timer;
  int? _lastFiredDay;

  bool get isRunning => _timer?.isActive ?? false;

  void start() {
    if (_timer != null) return;
    _timer = Timer.periodic(const Duration(minutes: 1), (_) => _checkAndFire());
    if (kDebugMode) debugPrint('Scheduler started (check every 1 min for 23:55)');
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
    _lastFiredDay = null;
  }

  void _checkAndFire() {
    final now = DateTime.now();
    if (now.hour != 23 || now.minute != 55) return;
    final today = now.year * 10000 + now.month * 100 + now.day;
    if (_lastFiredDay == today) return;
    _lastFiredDay = today;
    _runDailyBriefing();
  }

  Future<void> _runDailyBriefing() async {
    try {
      final symbol = Constants.defaultSymbol;
      const tf = Timeframe.h1;
      final r = await _repo.syncCandles(symbol, tf, 200);
      if (r is Err) {
        await _notify.notifyDailyBriefing('?™ê¸°???¤íŒ¨: ${(r as Err<String>).message}');
        return;
      }
      final list = await _repo.getCandles(symbol, tf, 200);
      final candles = list.map((d) => Candle(t: d.t, o: d.o, h: d.h, l: d.l, c: d.c, v: d.v)).toList();
      if (candles.isEmpty) {
        await _notify.notifyDailyBriefing('?°ì´???†ìŒ');
        return;
      }
      final output = _engine.run(candles, symbol, tf.code);
      final lastPrice = (await _repo.getLastPrice(symbol))?.lastPrice ?? candles.last.c;
      final lossStreak = await _selfTune.getLossStreak();
      final briefing = _briefingEngine.run(output, lastPrice, equity: 10000, lossStreak: lossStreak);
      final message = briefing.lockReason ?? briefing.summaryLine;
      await _notify.notifyDailyBriefing('$symbol ${tf.code} $message');
    } catch (e) {
      if (kDebugMode) debugPrint('Scheduler._runDailyBriefing: $e');
      await _notify.notifyDailyBriefing('?¤ë¥˜: ${e.toString().length > 50 ? e.toString().substring(0, 50) : e}');
    }
  }
}
