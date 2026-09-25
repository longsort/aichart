import 'package:flutter/material.dart';
import 'fx_config.dart';
import 'neon_theme.dart';
import 'neon_shimmer_button.dart';
import '../../core/settings/app_settings.dart';

class FxSettingsSheet extends StatefulWidget {
  const FxSettingsSheet({super.key});

  @override
  State<FxSettingsSheet> createState() => _FxSettingsSheetState();
}

class _FxSettingsSheetState extends State<FxSettingsSheet> {
  late final TextEditingController _accountCtl;
  late final TextEditingController _riskCtl;
  late final TextEditingController _coolCtl;
  late final TextEditingController _minProbCtl;
  late final TextEditingController _signalProbCtl;
  late final TextEditingController _feeCtl;
  late final TextEditingController _levCtl;
  late final TextEditingController _ntfyCtl;

  @override
  void initState() {
    super.initState();
    _accountCtl = TextEditingController(text: AppSettings.accountUsdt.toStringAsFixed(0));
    _riskCtl = TextEditingController(text: AppSettings.riskPct.toStringAsFixed(1));
    _coolCtl = TextEditingController(text: AppSettings.notifyCooldownMin.toString());
    _minProbCtl = TextEditingController(text: AppSettings.notifyMinProb.toString());
    _signalProbCtl = TextEditingController(text: AppSettings.signalMinProb.toString());
    _feeCtl = TextEditingController(text: (AppSettings.feeRoundTrip * 100).toStringAsFixed(3));
    _levCtl = TextEditingController(text: AppSettings.leverageOverride.toStringAsFixed(0));
    _ntfyCtl = TextEditingController(text: AppSettings.ntfyUrl);
  }

  @override
  void dispose() {
    _accountCtl.dispose();
    _riskCtl.dispose();
    _coolCtl.dispose();
    _minProbCtl.dispose();
    _signalProbCtl.dispose();
    _feeCtl.dispose();
    _levCtl.dispose();
    _ntfyCtl.dispose();
    super.dispose();
  }

  void _applyNumbers() {
    double p(String s, double fallback) => double.tryParse(s.trim()) ?? fallback;
    int pi(String s, int fallback) => int.tryParse(s.trim()) ?? fallback;

    AppSettings.accountUsdt = (p(_accountCtl.text, AppSettings.accountUsdt)).clamp(0.0, 1e12);
    // risk is fixed to 5% for consistency
    AppSettings.riskPct = 5.0;

    AppSettings.feeRoundTrip = (p(_feeCtl.text, (AppSettings.feeRoundTrip * 100)) / 100.0).clamp(0.0, 0.02);
    AppSettings.leverageOverride = (p(_levCtl.text, AppSettings.leverageOverride)).clamp(0.0, 200.0);
    AppSettings.signalMinProb = (pi(_signalProbCtl.text, AppSettings.signalMinProb)).clamp(0, 100);

    AppSettings.notifyCooldownMin = (pi(_coolCtl.text, AppSettings.notifyCooldownMin)).clamp(0, 999);
    AppSettings.notifyMinProb = (pi(_minProbCtl.text, AppSettings.notifyMinProb)).clamp(0, 100);
    AppSettings.ntfyUrl = _ntfyCtl.text.trim().isEmpty ? AppSettings.ntfyUrl : _ntfyCtl.text.trim();
  }


  Widget _field(NeonTheme t, String label, TextEditingController ctl, {String? hint, bool enabled = true}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(color: t.muted, fontWeight: FontWeight.w900, fontSize: 12)),
        const SizedBox(height: 6),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
          decoration: BoxDecoration(
            color: t.bg,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: t.border),
          ),
          child: TextField(
            controller: ctl,
            enabled: enabled,
            style: TextStyle(color: t.fg, fontWeight: FontWeight.w900),
            decoration: InputDecoration(
              border: InputBorder.none,
              hintText: hint,
              hintStyle: TextStyle(color: t.muted),
            ),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: t.card,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
        border: Border.all(color: t.border),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(width: 44, height: 5, decoration: BoxDecoration(color: t.border, borderRadius: BorderRadius.circular(20))),
            const SizedBox(height: 12),
            Row(
              children: [
                Text('FX 설정', style: TextStyle(color: t.fg, fontWeight: FontWeight.w900, fontSize: 16)),
                const Spacer(),
                Switch(value: FxConfig.showMode, onChanged: (v) => setState(() => FxConfig.showMode = v)),
              ],
            ),
            const SizedBox(height: 6),
            Align(
              alignment: Alignment.centerLeft,
              child: Text(FxConfig.showMode ? '쇼 모드(화려함 ON)' : '실전 모드(애니 OFF)',
                  style: TextStyle(color: t.muted, fontWeight: FontWeight.w900)),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Text('강도', style: TextStyle(color: t.fg, fontWeight: FontWeight.w900)),
                const SizedBox(width: 10),
                Expanded(
                  child: Slider(
                    value: FxConfig.intensity,
                    min: 0.0,
                    max: 1.0,
                    onChanged: FxConfig.showMode ? (v) => setState(() => FxConfig.intensity = v) : null,
                  ),
                ),
                SizedBox(width: 44, child: Text('${(FxConfig.intensity * 100).round()}',
                    textAlign: TextAlign.end, style: TextStyle(color: t.fg, fontWeight: FontWeight.w900))),
              ],
            ),
            const SizedBox(height: 10),
            // ---- FX 스타일 ----
            Align(
              alignment: Alignment.centerLeft,
              child: Text('FX 스타일', style: TextStyle(color: t.fg, fontWeight: FontWeight.w900)),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: NeonShimmerButton(
                    text: FxConfig.mode == 0 ? 'Laser ✓' : 'Laser',
                    compact: true,
                    onPressed: () => setState(() => FxConfig.mode = 0),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: NeonShimmerButton(
                    text: FxConfig.mode == 1 ? 'Matrix ✓' : 'Matrix',
                    compact: true,
                    onPressed: () => setState(() => FxConfig.mode = 1),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: NeonShimmerButton(
                    text: FxConfig.mode == 2 ? 'Nebula ✓' : 'Nebula',
                    compact: true,
                    onPressed: () => setState(() => FxConfig.mode = 2),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: NeonShimmerButton(text: '가볍게(40)', compact: true, onPressed: () => setState(() => FxConfig.intensity = 0.4))),
                const SizedBox(width: 10),
                Expanded(child: NeonShimmerButton(text: '기본(80)', compact: true, onPressed: () => setState(() => FxConfig.intensity = 0.8))),
                const SizedBox(width: 10),
                Expanded(child: NeonShimmerButton(text: '최대(100)', compact: true, onPressed: () => setState(() => FxConfig.intensity = 1.0))),
              ],
            ),
            const SizedBox(height: 12),
            // ---- 계정/리스크/알림 ----
            Align(
              alignment: Alignment.centerLeft,
              child: Text('초보 설정(리스크/알림)', style: TextStyle(color: t.fg, fontWeight: FontWeight.w900)),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(child: _field(t, '내 계정(USDT)', _accountCtl, hint: '예: 500')),
                const SizedBox(width: 10),
                Expanded(child: _field(t, '리스크(%)', _riskCtl, hint: '고정 5%', enabled: false)),
              ],
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: Text('실전 설정(수수료/레버리지/확정컷)', style: TextStyle(color: t.fg, fontWeight: FontWeight.w900)),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(child: _field(t, '수수료(왕복, %)', _feeCtl, hint: '예: 0.08')),
                const SizedBox(width: 10),
                Expanded(child: _field(t, '레버리지(0=자동)', _levCtl, hint: '예: 10')),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(child: _field(t, '확정 최소확률(%)', _signalProbCtl, hint: '예: 65')),
                const SizedBox(width: 10),
                Expanded(child: _field(t, '알림 최소확률(%)', _minProbCtl, hint: '예: 70')),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(child: _field(t, '알림 쿨다운(분)', _coolCtl, hint: '예: 10')),
                const SizedBox(width: 10),
                Expanded(child: _field(t, 'ntfy 주소', _ntfyCtl, hint: 'https://ntfy.sh/fulinkpro')),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Text('폰 알림', style: TextStyle(color: t.fg, fontWeight: FontWeight.w900)),
                const Spacer(),
                Switch(value: AppSettings.notifyEnabled, onChanged: (v) => setState(() => AppSettings.notifyEnabled = v)),
              ],
            ),
            const SizedBox(height: 12),
            NeonShimmerButton(
              text: '적용 후 닫기',
              compact: true,
              onPressed: () {
                _applyNumbers();
                Navigator.of(context).pop();
              },
            ),
          ],
        ),
      ),
    );
  }
}
