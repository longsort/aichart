import 'package:flutter/material.dart';

import '../core/neon_theme.dart';
import '../state/fulink_controller.dart';
import '../ui/screens/ultra_home_screen.dart';

class FulinkApp extends StatefulWidget {
  const FulinkApp({super.key});

  @override
  State<FulinkApp> createState() => _FulinkAppState();
}

class _FulinkAppState extends State<FulinkApp> {
  final FulinkController c = FulinkController();

  @override
  void initState() {
    super.initState();
    c.bootstrap();
  }

  @override
  void dispose() {
    c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: c,
      builder: (context, _) {
        return MaterialApp(
          debugShowCheckedModeBanner: false,
          title: 'Fulink Pro',
          theme: NeonTheme.build(),
          home: UltraHomeScreen(controller: c),
        );
      },
    );
  }
}
