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

/// Android 백그라운드(포그라운드 서비스) 실행
/// - 폰 화면 꺼져도 주기적으로 데이터 수집/분석 유지
/// - 신호 발생 시 시스템 알림(푸시) 표시
class BgService {
  BgService._();
  static final BgService I = BgService._();

  static const _channelId = 'fulink_signal';
  static const _channelName = 'Fulink 신호';
  static const _channelDesc = '롱/숏 신호 알림';

  final FlutterLocalNotificationsPlugin _noti = FlutterLocalNotificationsPlugin();

  Future<void> init() async {
    // 로컬 알림 초기화
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const initSettings = InitializationSettings(android: androidInit);
    await _noti.initialize(initSettings);

    // 알림 채널 생성(안드로이드 8+)
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
        initialNotificationTitle: 'Fulink 실행중',
        initialNotificationContent: '데이터 수집/분석 유지중',
      ),
      iosConfiguration: IosConfiguration(
        autoStart: false,
        onForeground: _onStart,
      ),
    );

    await service.startService();
  }

  /// 백그라운드 isolate 엔트리
  @pragma('vm:entry-point')
  static void _onStart(ServiceInstance service) async {
    DartPluginRegistrant.ensureInitialized();

    // 안전하게 AppCore/EngineBridge도 여기서 스타트
    AppCore.I.start();
    EngineBridge.I.start();

    final noti = FlutterLocalNotificationsPlugin();
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const initSettings = InitializationSettings(android: androidInit);
    await noti.initialize(initSettings);

    // 10초마다 "살아있음" 핑 + 상태 업데이트
    Timer.periodic(const Duration(seconds: 10), (timer) async {
      if (service is AndroidServiceInstance) {
        service.setForegroundNotificationInfo(
          title: 'Fulink 실행중',
          content: '분석 유지중 • ${DateTime.now().hour}:${DateTime.now().minute.toString().padLeft(2, '0')}',
        );
      }
    });

    // 신호 감지 시 시스템 알림
    double lastBias = 0.0;
    AppCore.I.stream.listen((s) async {
      if (s.state != TradeState.allow) return;
      final bias = s.bias;
      final dir = bias > 0.10 ? '롱' : (bias < -0.10 ? '숏' : '중립');
      if (dir == '중립') return;

      // 방향 바뀔 때만 울림(스팸 방지)
      if ((lastBias >= 0.10 && bias >= 0.10) || (lastBias <= -0.10 && bias <= -0.10)) return;
      lastBias = bias;

      final title = '$dir 신호';
      final body = '합의 ${(s.consensus * 100).round()}% / 신뢰 ${(s.confidence * 100).round()}%';

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

    // 외부에서 stop 명령 시
    service.on('stopService').listen((event) {
      service.stopSelf();
    });
  }
}
