import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/timeframe.dart';
import '../../core/constants.dart';
import '../../core/result.dart';
import '../../data/repo/market_repo.dart';

/// S-15: ë°±ê·¸?¼ìš´???™ê¸°??ê°€??ë²”ìœ„) + ë°°í„°ë¦??°ì´???ˆì•½ ?µì…˜
class SyncManager {
  static final SyncManager _instance = SyncManager._();
  factory SyncManager() => _instance;

  SyncManager._();

  final MarketRepo _repo = MarketRepo();
  Timer? _timer;
  DateTime? _lastSyncTime;
  int _intervalMinutes = 3;
  bool _batterySaver = false;

  static const String _keyEnabled = 'sync_background_enabled';
  static const String _keyInterval = 'sync_interval_minutes';
  static const String _keyBatterySaver = 'sync_battery_saver';
  static const String _keyLastSync = 'sync_last_time';

  bool get isRunning => _timer?.isActive ?? false;
  DateTime? get lastSyncTime => _lastSyncTime;
  int get intervalMinutes => _intervalMinutes;
  bool get batterySaver => _batterySaver;

  Future<void> loadPrefs() async {
    final prefs = await SharedPreferences.getInstance();
    _intervalMinutes = prefs.getInt(_keyInterval) ?? 3;
    _batterySaver = prefs.getBool(_keyBatterySaver) ?? false;
    final ms = prefs.getInt(_keyLastSync);
    if (ms != null) _lastSyncTime = DateTime.fromMillisecondsSinceEpoch(ms);
  }

  Future<void> saveLastSync() async {
    if (_lastSyncTime == null) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_keyLastSync, _lastSyncTime!.millisecondsSinceEpoch);
  }

  Future<bool> start() async {
    if (_timer != null) return true;
    await loadPrefs();
    final enabled = await _getEnabled();
    if (!enabled) return false;
    final minutes = _batterySaver ? 5 : _intervalMinutes;
    _timer = Timer.periodic(Duration(minutes: minutes), (_) => _runSync());
    if (kDebugMode) debugPrint('SyncManager started every $minutes min');
    return true;
  }

  Future<bool> _getEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_keyEnabled) ?? false;
  }

  Future<void> setEnabled(bool enabled) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_keyEnabled, enabled);
    if (enabled) {
      await start();
    } else {
      stop();
    }
  }

  Future<void> setInterval(int minutes) async {
    _intervalMinutes = minutes.clamp(1, 5);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_keyInterval, _intervalMinutes);
    if (isRunning && !_batterySaver) {
      stop();
      await start();
    }
  }

  Future<void> setBatterySaver(bool value) async {
    _batterySaver = value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_keyBatterySaver, _batterySaver);
    if (isRunning) {
      stop();
      await start();
    }
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
  }

  Future<void> _runSync() async {
    try {
      final r = await _repo.syncCandles(Constants.defaultSymbol, Timeframe.m15, 100);
      _lastSyncTime = DateTime.now();
      await saveLastSync();
      if (r is Err && kDebugMode) debugPrint('SyncManager sync: ${(r as Err<String>).message}');
    } catch (e) {
      if (kDebugMode) debugPrint('SyncManager._runSync: $e');
    }
  }

  /// ?˜ë™ 1???™ê¸°??(??ì¼œë©´ ì¦‰ì‹œ ìµœì‹ ?”ìš©)
  Future<void> syncOnce() async {
    await _runSync();
  }

  /// ?íƒœ ë¬¸ì??
  String get statusText {
    if (_lastSyncTime == null) return '?™ê¸°???€ê¸?;
    final d = _lastSyncTime!;
    return 'ë§ˆì?ë§? ${d.month}/${d.day} ${d.hour}:${d.minute.toString().padLeft(2, '0')}';
  }
}
