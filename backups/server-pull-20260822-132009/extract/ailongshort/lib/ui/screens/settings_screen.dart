import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/constants.dart';
import '../../engine/update/patch_manager.dart';
import '../../engine/notify/notify_service.dart';
import '../../engine/notify/scheduler.dart';
import '../../engine/sync/sync_manager.dart';
import '../../core/services/report_exporter.dart';
import '../../core/settings/risk_presets.dart';
import '../../engine/paper/paper_trade_engine.dart';

/// S-09: ?§Ï†ï ?îÎ©¥ ??Î≤ÑÏ†Ñ ?úÏãú, ?????ÖÎç∞?¥Ìä∏(?®Ïπò) Î≤ÑÌäº
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  String _version = Constants.appVersion;
  String _applyLog = '';
  bool _notifyEnabled = true;
  bool _syncEnabled = false;
  int _syncInterval = 3;
  bool _batterySaver = false;
  RiskPreset _riskPreset = RiskPreset.standard;
  bool _paperEnabled = false;
  String _syncStatus = '';
  final _patchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _loadNotifyPref() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() => _notifyEnabled = prefs.getBool('notify_enabled') ?? true);
  }

  @override
  void dispose() {
    _patchController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    _riskPreset = await RiskPresetManager.load();
    _paperEnabled = PaperTradeEngine.I.state.value.enabled;
    final v = await PatchManager.currentVersion;
    final log = await PatchManager.applyLog;
    await _loadNotifyPref();
    await SyncManager().loadPrefs();
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _version = v;
      _applyLog = log;
      _syncEnabled = prefs.getBool('sync_background_enabled') ?? false;
      _syncInterval = SyncManager().intervalMinutes;
      _batterySaver = SyncManager().batterySaver;
      _syncStatus = SyncManager().statusText;
    });
  }

  Future<void> _toggleSync(bool value) async {
    await SyncManager().setEnabled(value);
    setState(() {
      _syncEnabled = SyncManager().isRunning;
      _syncStatus = SyncManager().statusText;
    });
  }

  Future<void> _setSyncInterval(int minutes) async {
    await SyncManager().setInterval(minutes);
    setState(() => _syncInterval = SyncManager().intervalMinutes);
  }

  Future<void> _toggleBatterySaver(bool value) async {
    await SyncManager().setBatterySaver(value);
    setState(() => _batterySaver = SyncManager().batterySaver);
  }

  Future<void> _syncOnce() async {
    await SyncManager().syncOnce();
    if (mounted) setState(() => _syncStatus = SyncManager().statusText);
  }

  Future<void> _toggleNotify(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('notify_enabled', value);
    NotifyService().enabled = value;
    if (value) Scheduler().start(); else Scheduler().stop();
    setState(() => _notifyEnabled = value);
  }

  Future<void> _applyPatch() async {
    final json = _patchController.text.trim();
    if (json.isEmpty) return;
    final ok = await PatchManager.applyPatch(json);
    await _load();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(ok ? '?ÅÏö© ?ÑÎ£å' : '?ÅÏö© ?§Ìå®, Î°§Î∞±??)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('?§Ï†ï'),
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => Navigator.of(context).pop()),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Î≤ÑÏ†Ñ: $_version', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 16),
          SwitchListTile(
            title: const Text('?åÎ¶º (Î∏åÎ¶¨??/ ??ÎßàÍ∞ê)'),
            subtitle: const Text('confirm/NO-TRADE Î∞?Îß§Ïùº 23:55 ÎßàÍ∞ê Î∏åÎ¶¨??),
            value: _notifyEnabled,
            onChanged: _toggleNotify,
          ),
          const SizedBox(height: 16),
          SwitchListTile(
            title: const Text('Î∞±Í∑∏?ºÏö¥???ôÍ∏∞??),
            subtitle: Text(_syncStatus.isEmpty ? 'Ï£ºÍ∏∞?ÅÏúºÎ°?Ï∫îÎì§ ?∞Ïù¥??Í∞±Ïã†' : _syncStatus),
            value: _syncEnabled,
            onChanged: _toggleSync,
          ),
          if (_syncEnabled) ...[
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  const Text('Ï£ºÍ∏∞: '),
                  SegmentedButton<int>(
                    segments: const [
                      ButtonSegment(value: 1, label: Text('1Î∂?)),
                      ButtonSegment(value: 3, label: Text('3Î∂?)),
                      ButtonSegment(value: 5, label: Text('5Î∂?)),
                    ],
                    selected: {_syncInterval},
                    onSelectionChanged: (s) {
                      if (s.isNotEmpty) _setSyncInterval(s.first);
                    },
                  ),
                ],
              ),
            ),
            SwitchListTile(
              title: const Text('Î∞∞ÌÑ∞Î¶??∞Ïù¥???àÏïΩ'),
              subtitle: const Text('?ôÍ∏∞??Ï£ºÍ∏∞ 5Î∂?Í≥†Ï†ï'),
              value: _batterySaver,
              onChanged: _toggleBatterySaver,
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: OutlinedButton.icon(
                icon: const Icon(Icons.sync),
                label: const Text('ÏßÄÍ∏?1???ôÍ∏∞??),
                onPressed: _syncOnce,
              ),
            ),
          ],
          const SizedBox(height: 24),
          const Text('?®Ïπò ?ÅÏö© (config.json ?¥Ïö© Î∂ôÏó¨?£Í∏∞)', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          TextField(
            controller: _patchController,
            maxLines: 6,
            decoration: const InputDecoration(
              hintText: '{"version":"1.0.1", ...}',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: _applyPatch,
            child: const Text('?ÅÏö© (?§Ìå® ???êÎèô Î°§Î∞±)'),
          ),
          if (_applyLog.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text('?ÅÏö© Î°úÍ∑∏:', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 4),
            Text(_applyLog, style: Theme.of(context).textTheme.bodySmall),
          ],
        ],
      ),
    );
  }
}
