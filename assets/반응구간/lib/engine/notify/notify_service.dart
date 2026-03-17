import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../models/briefing_output.dart';

/// S-11: 로컬 알림 — confirm=강한 알림, caution=약한, NO-TRADE=경고. 과장 표현 금지.
class NotifyService {
  static final NotifyService _instance = NotifyService._();
  factory NotifyService() => _instance;

  NotifyService._();

  final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  bool _initialized = false;
  bool _enabled = true;

  bool get enabled => _enabled;
  set enabled(bool value) => _enabled = value;

  Future<void> init() async {
    if (_initialized) return;
    try {
      const android = AndroidInitializationSettings('@mipmap/ic_launcher');
      const ios = DarwinInitializationSettings();
      const initSettings = InitializationSettings(android: android, iOS: ios);
      await _plugin.initialize(initSettings);
      if (Platform.isAndroid) {
        await _plugin
            .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
            ?.createNotificationChannel(const AndroidNotificationChannel(
              'briefing',
              '브리핑 알림',
              importance: Importance.defaultImportance,
            ));
      }
      _initialized = true;
    } catch (e) {
      if (kDebugMode) debugPrint('NotifyService.init: $e');
    }
  }

  /// Briefing 결과에 따라 알림 (confirm=강함, caution=약함, NO-TRADE=경고)
  Future<void> notifyFromBriefing(BriefingOutput b) async {
    if (!_enabled || !_initialized) return;
    try {
      String title;
      String body;
      if (b.lockReason != null && b.lockReason!.isNotEmpty) {
        title = '매매 금지';
        body = b.lockReason!.length > 80 ? '${b.lockReason!.substring(0, 80)}…' : b.lockReason!;
      } else if (b.status == '진입가능 후보') {
        title = '진입 후보';
        body = '${b.symbol} ${b.tf} 신뢰도 ${b.confidence}%. ${b.summaryLine.length > 60 ? "${b.summaryLine.substring(0, 60)}…" : b.summaryLine}';
      } else if (b.status == '주의') {
        title = '주의';
        body = '${b.symbol} ${b.tf} ${b.summaryLine.length > 70 ? "${b.summaryLine.substring(0, 70)}…" : b.summaryLine}';
      } else {
        title = '관망';
        body = '${b.symbol} ${b.tf} ${b.summaryLine.length > 70 ? "${b.summaryLine.substring(0, 70)}…" : b.summaryLine}';
      }
      final android = AndroidNotificationDetails(
        'briefing',
        '브리핑 알림',
        channelDescription: '브리핑 알림',
        importance: b.lockReason != null ? Importance.high : (b.status == '진입가능 후보' ? Importance.high : Importance.low),
      );
      const ios = DarwinNotificationDetails();
      final details = NotificationDetails(android: android, iOS: ios);
      await _plugin.show(DateTime.now().millisecondsSinceEpoch % 0x7FFFFFFF, title, body, details);
    } catch (e) {
      if (kDebugMode) debugPrint('NotifyService.notifyFromBriefing: $e');
    }
  }

  /// 1일 마감 브리핑용 알림 메시지
  Future<void> notifyDailyBriefing(String message) async {
    if (!_enabled || !_initialized) return;
    try {
      final title = '오늘 마감 브리핑';
      final body = message.length > 100 ? '${message.substring(0, 100)}…' : message;
      final android = AndroidNotificationDetails('briefing', '브리핑 알림', channelDescription: '브리핑 알림', importance: Importance.defaultImportance);
      const ios = DarwinNotificationDetails();
      await _plugin.show(1, title, body, NotificationDetails(android: android, iOS: ios));
    } catch (e) {
      if (kDebugMode) debugPrint('NotifyService.notifyDailyBriefing: $e');
    }
  }
}
