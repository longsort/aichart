import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../models/briefing_output.dart';

/// S-11: 로컬 ?�림 ??confirm=강한 ?�림, caution=?�한, NO-TRADE=경고. 과장 ?�현 금�?.
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
              '브리???�림',
              importance: Importance.defaultImportance,
            ));
      }
      _initialized = true;
    } catch (e) {
      if (kDebugMode) debugPrint('NotifyService.init: $e');
    }
  }

  /// Briefing 결과???�라 ?�림 (confirm=강함, caution=?�함, NO-TRADE=경고)
  Future<void> notifyFromBriefing(BriefingOutput b) async {
    if (!_enabled || !_initialized) return;
    try {
      String title;
      String body;
      if (b.lockReason != null && b.lockReason!.isNotEmpty) {
        title = '매매 금�?';
        body = b.lockReason!.length > 80 ? '${b.lockReason!.substring(0, 80)}?? : b.lockReason!;
      } else if (b.status == '진입가???�보') {
        title = '진입 ?�보';
        body = '${b.symbol} ${b.tf} ?�뢰??${b.confidence}%. ${b.summaryLine.length > 60 ? "${b.summaryLine.substring(0, 60)}?? : b.summaryLine}';
      } else if (b.status == '주의') {
        title = '주의';
        body = '${b.symbol} ${b.tf} ${b.summaryLine.length > 70 ? "${b.summaryLine.substring(0, 70)}?? : b.summaryLine}';
      } else {
        title = '관�?;
        body = '${b.symbol} ${b.tf} ${b.summaryLine.length > 70 ? "${b.summaryLine.substring(0, 70)}?? : b.summaryLine}';
      }
      final android = AndroidNotificationDetails(
        'briefing',
        '브리???�림',
        channelDescription: '브리???�림',
        importance: b.lockReason != null ? Importance.high : (b.status == '진입가???�보' ? Importance.high : Importance.low),
      );
      const ios = DarwinNotificationDetails();
      final details = NotificationDetails(android: android, iOS: ios);
      await _plugin.show(DateTime.now().millisecondsSinceEpoch % 0x7FFFFFFF, title, body, details);
    } catch (e) {
      if (kDebugMode) debugPrint('NotifyService.notifyFromBriefing: $e');
    }
  }

  /// 1??마감 브리?�용 ?�림 메시지
  Future<void> notifyDailyBriefing(String message) async {
    if (!_enabled || !_initialized) return;
    try {
      final title = '?�늘 마감 브리??;
      final body = message.length > 100 ? '${message.substring(0, 100)}?? : message;
      final android = AndroidNotificationDetails('briefing', '브리???�림', channelDescription: '브리???�림', importance: Importance.defaultImportance);
      const ios = DarwinNotificationDetails();
      await _plugin.show(1, title, body, NotificationDetails(android: android, iOS: ios));
    } catch (e) {
      if (kDebugMode) debugPrint('NotifyService.notifyDailyBriefing: $e');
    }
  }
}
