import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';
import '../ui/screens/ultra_home_screen.dart';

// Desktop: ensure mouse/trackpad drag and wheel scrolling works and doesn't feel "locked".
class _FulinkScrollBehavior extends MaterialScrollBehavior {
  const _FulinkScrollBehavior();

  @override
  Set<PointerDeviceKind> get dragDevices => {
        PointerDeviceKind.touch,
        PointerDeviceKind.mouse,
        PointerDeviceKind.trackpad,
        PointerDeviceKind.stylus,
        PointerDeviceKind.unknown,
      };
}

class FulinkProUltraApp extends StatelessWidget {
  const FulinkProUltraApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Fulink Pro ULTRA v58',
      debugShowCheckedModeBanner: false,
      scrollBehavior: const _FulinkScrollBehavior(),
      theme: ThemeData(
        brightness: Brightness.dark,
        useMaterial3: true,
        colorSchemeSeed: const Color(0xFF7C4DFF),
        fontFamily: null,
      ),
      home: const UltraHomeScreen(),
    );
  }
}
