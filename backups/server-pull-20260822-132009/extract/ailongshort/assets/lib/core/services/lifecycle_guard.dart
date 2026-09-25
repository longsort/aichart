import 'dart:async';
import 'package:flutter/widgets.dart';

typedef AsyncVoid = Future<void> Function();

class LifecycleGuard with WidgetsBindingObserver {
  LifecycleGuard._();
  static final LifecycleGuard I = LifecycleGuard._();

  final List<AsyncVoid> _onResume = [];
  bool _started = false;

  void start() {
    if (_started) return;
    _started = true;
    WidgetsBinding.instance.addObserver(this);
  }

  void registerOnResume(AsyncVoid fn) {
    _onResume.add(fn);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      for (final fn in _onResume) {
        // fire-and-forget
        Future.microtask(() async { try { await fn(); } catch (_) {} });
      }
    }
  }

  void dispose() {
    if (_started) {
      WidgetsBinding.instance.removeObserver(this);
      _started = false;
    }
  }
}
