import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

/// Desktop?ì„œ ë§ˆìš°???¸ë™?¨ë“œ ?¤í¬ë¡??œë˜ê·??¬í•¨) ?¬ìš©?±ì„ ?•ì‹¤??ë³´ì¥.
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
