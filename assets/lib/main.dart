import 'dart:io';
import 'package:flutter/material.dart';
import 'core/settings/risk_presets.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'core/background/fg_service_bridge.dart';

import 'ui/screens/root_shell.dart';

void main() {
  if (Platform.isWindows || Platform.isLinux || Platform.isMacOS) {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  }

  WidgetsFlutterBinding.ensureInitialized();
  ForegroundServiceBridge.start();
  RiskPresetManager.load().then((p)=>RiskPresetManager.apply(p));
  runApp(const FulinkApp());
}

class FulinkApp extends StatelessWidget {
  const FulinkApp({super.key});

    @override
  Widget build(BuildContext context) {
    final base = ThemeData.dark(useMaterial3: true);
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: base.copyWith(
        scaffoldBackgroundColor: const Color(0xFF070A12),
        colorScheme: base.colorScheme.copyWith(
          brightness: Brightness.dark,
          surface: const Color(0xFF0C1020),
          primary: const Color(0xFF39FFB6),
          secondary: const Color(0xFF98A0C8),
        ),
        cardTheme: const CardThemeData(
          color: Color(0xFF0C1020),
          elevation: 0,
          margin: EdgeInsets.zero,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(18))),
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF070A12),
          foregroundColor: Color(0xFFE9ECFF),
          elevation: 0,
          centerTitle: false,
        ),
        textTheme: base.textTheme.apply(
          bodyColor: const Color(0xFFE9ECFF),
          displayColor: const Color(0xFFE9ECFF),
        ),
      ),
      home: const RootShell(),
    );
  }
}
