import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

/// Desktop에서 마우스/트랙패드 스크롤(드래그 포함) 사용성을 확실히 보장.
class AppScrollBehavior extends MaterialScrollBehavior {
  const AppScrollBehavior();

  @override
  Set<PointerDeviceKind> get dragDevices => const {
        PointerDeviceKind.touch,
        PointerDeviceKind.mouse,
        PointerDeviceKind.trackpad,
        PointerDeviceKind.stylus,
        PointerDeviceKind.invertedStylus,
        PointerDeviceKind.unknown,
      };
}
