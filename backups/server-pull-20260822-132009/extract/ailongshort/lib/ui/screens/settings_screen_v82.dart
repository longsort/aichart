import 'package:flutter/material.dart';
import '../../core/app_settings.dart';

class SettingsScreenV82 extends StatelessWidget {
  const SettingsScreenV82({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('?§Ï†ï')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _toggle('Î∞±Í∑∏?ºÏö¥??Î∂ÑÏÑù ?†Ï?', AppSettings.I.enableBackground),
          _toggle('?úÏä§???åÎ¶º', AppSettings.I.enableSystemNotify),
          _toggle('?êÎèô ?àÏ†Ñ?•Ïπò(?∞ÏÜç???†Í∏à)', AppSettings.I.enableAutoGuard),
          _toggle('?êÎèô Í∏∞Î°ù', AppSettings.I.enableAutoLog),
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
