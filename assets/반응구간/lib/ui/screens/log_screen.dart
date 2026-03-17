import 'package:flutter/material.dart';
import 'log_screen_mem.dart';

/// 호환용: 일부 라우팅이 LogScreen 을 참조합니다.
/// 현재는 메모리 기반 로그 화면(LogScreenMem)을 그대로 사용합니다.
class LogScreen extends StatelessWidget {
  const LogScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const LogScreenMem();
  }
}
