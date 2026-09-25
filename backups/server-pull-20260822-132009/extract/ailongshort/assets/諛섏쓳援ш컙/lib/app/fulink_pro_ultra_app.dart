import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';
import '../ui/screens/ultra_home_screen.dart';

// Desktop: ensure mouse/trackpad drag and wheel scrolling works
class FulinkScrollBehavior extends MaterialScrollBehavior {
  const FulinkScrollBehavior();

  @override
  Set<PointerDeviceKind> get dragDevices => const {
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
      scrollBehavior: const FulinkScrollBehavior(),
      theme: ThemeData(
        brightness: Brightness.dark,
        useMaterial3: true,
        colorSchemeSeed: const Color(0xFF7C4DFF),
      ),
      home: const UltraHomeScreen(),
    );
  }
}
