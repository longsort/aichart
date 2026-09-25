import 'package:flutter/material.dart';
import '../../core/app_settings.dart';

class SettingsScreenV82 extends StatelessWidget {
  const SettingsScreenV82({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('설정')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _toggle('백그라운드 분석 유지', AppSettings.I.enableBackground),
          _toggle('시스템 알림', AppSettings.I.enableSystemNotify),
          _toggle('자동 안전장치(연속패 잠금)', AppSettings.I.enableAutoGuard),
          _toggle('자동 기록', AppSettings.I.enableAutoLog),
        ],
      ),
    );
  }

  Widget _toggle(String title, ValueNotifier<bool> v) {
    return ValueListenableBuilder<bool>(
      valueListenable: v,
      builder: (context, on, _) {
        return SwitchListTile(
          value: on,
          onChanged: (x) => v.value = x,
          title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
        );
      },
    );
  }
}
