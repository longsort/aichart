import 'dart:async';
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:flutter_background_service_android/flutter_background_service_android.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'app_core.dart';
import 'engine_bridge.dart';
import 'app_settings.dart';

/// Android ë°±ê·¸?¼ìš´???¬ê·¸?¼ìš´???œë¹„?? ?¤í–‰
/// - ???”ë©´ êº¼ì ¸??ì£¼ê¸°?ìœ¼ë¡??°ì´???˜ì§‘/ë¶„ì„ ? ì?
/// - ? í˜¸ ë°œìƒ ???œìŠ¤???Œë¦¼(?¸ì‹œ) ?œì‹œ
class BgService {
  BgService._();
  static final BgService I = BgService._();

  static const _channelId = 'fulink_signal';
  static const _channelName = 'Fulink ? í˜¸';
  static const _channelDesc = 'ë¡???? í˜¸ ?Œë¦¼';

  final FlutterLocalNotificationsPlugin _noti = FlutterLocalNotificationsPlugin();

  Future<void> init() async {
    // ë¡œì»¬ ?Œë¦¼ ì´ˆê¸°??    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const initSettings = InitializationSettings(android: androidInit);
    await _noti.initialize(initSettings);

    // ?Œë¦¼ ì±„ë„ ?ì„±(?ˆë“œë¡œì´??8+)
    const channel = AndroidNotificationChannel(
      _channelId,
      _channelName,
      description: _channelDesc,
      importance: Importance.high,
    );
    await _noti
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);
  }

  Future<void> start() async {
    if (!AppSettings.I.enableBackground.value) return;
    final service = FlutterBackgroundService();

    await service.configure(
      androidConfiguration: AndroidConfiguration(
        onStart: _onStart,
        autoStart: true,
        isForegroundMode: true,
        foregroundServiceNotificationId: 8801,
        initialNotificationTitle: 'Fulink ?¤í–‰ì¤?,
        initialNotificationContent: '?°ì´???˜ì§‘/ë¶„ì„ ? ì?ì¤?,
      ),
      iosConfiguration: IosConfiguration(
        autoStart: false,
        onForeground: _onStart,
      ),
    );

    await service.startService();
  }

  /// ë°±ê·¸?¼ìš´??isolate ?”íŠ¸ë¦?  @pragma('vm:entry-point')
  static void _onStart(ServiceInstance service) async {
    DartPluginRegistrant.ensureInitialized();

    // ?ˆì „?˜ê²Œ AppCore/EngineBridge???¬ê¸°???¤í???    AppCore.I.start();
    EngineBridge.I.start();

    final noti = FlutterLocalNotificationsPlugin();
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const initSettings = InitializationSettings(android: androidInit);
    await noti.initialize(initSettings);

    // 10ì´ˆë§ˆ??"?´ì•„?ˆìŒ" ??+ ?íƒœ ?…ë°?´íŠ¸
    Timer.periodic(const Duration(seconds: 10), (timer) async {
      if (service is AndroidServiceInstance) {
        service.setForegroundNotificationInfo(
          title: 'Fulink ?¤í–‰ì¤?,
          content: 'ë¶„ì„ ? ì?ì¤???${DateTime.now().hour}:${DateTime.now().minute.toString().padLeft(2, '0')}',
        );
      }
    });

    // ? í˜¸ ê°ì? ???œìŠ¤???Œë¦¼
    double lastBias = 0.0;
    AppCore.I.stream.listen((s) async {
      if (s.state != TradeState.allow) return;
      final bias = s.bias;
      final dir = bias > 0.10 ? 'ë¡? : (bias < -0.10 ? '?? : 'ì¤‘ë¦½');
      if (dir == 'ì¤‘ë¦½') return;

      // ë°©í–¥ ë°”ë€??Œë§Œ ?¸ë¦¼(?¤íŒ¸ ë°©ì?)
      if ((lastBias >= 0.10 && bias >= 0.10) || (lastBias <= -0.10 && bias <= -0.10)) return;
      lastBias = bias;

      final title = '$dir ? í˜¸';
      final body = '?©ì˜ ${(s.consensus * 100).round()}% / ? ë¢° ${(s.confidence * 100).round()}%';

      await noti.show(
        9901,
        title,
        body,
        const NotificationDetails(
          android: AndroidNotificationDetails(
            _channelId,
            _channelName,
            channelDescription: _channelDesc,
            importance: Importance.high,
            priority: Priority.high,
            showWhen: true,
          ),
        ),
      );
    });

    // ?¸ë??ì„œ stop ëª…ë ¹ ??    service.on('stopService').listen((event) {
      service.stopSelf();
    });
  }
}
