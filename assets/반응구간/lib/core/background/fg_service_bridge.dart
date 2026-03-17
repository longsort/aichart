import 'package:flutter/services.dart';

class ForegroundServiceBridge {
  static const _ch = MethodChannel('fulink/foreground');

  static Future<void> start() async {
    try { await _ch.invokeMethod('start'); } catch (_) {}
  }

  static Future<void> stop() async {
    try { await _ch.invokeMethod('stop'); } catch (_) {}
  }
}
