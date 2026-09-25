import 'dart:async';
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/db/app_db.dart';
import '../../core/db/signal_dao.dart';
import '../../core/db/outcome_dao.dart';
import '../../core/db/tuning_dao.dart';
import '../../core/autotune/auto_tune.dart';
import '../../core/autotune/tuning_bus.dart';


import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/models/fu_state.dart';
import '../../core/engines/reaction_strength_engine.dart';
import '../../core/services/fu_engine.dart';
import '../../data/bitget/bitget_live_store.dart';
import '../../data/models/candle.dart' as rt;
import '../../data/repository/bitget_realtime_candle_repo.dart';
import '../../core/realtime/realtime_bus.dart';
import '../../core/storage/fu_log_store.dart';
import '../../core/services/sqlite_trade_recorder.dart';
import '../../core/services/tyron_h4_final_tracker.dart';
import '../../logic/tyron_engine.dart';
import '../../logic/tyron_pro_engine.dart';
import '../../models/candle.dart' as m;
import '../widgets/tyron_card.dart';
import '../../core/trade/paper_position.dart';
import '../../core/trade/paper_journal.dart';
// ?åÎ¶º/?òÏàòÎ£?Í≥ÑÏ¢å/?àÎ≤ÑÎ¶¨Ï? ???∏Î†à?¥Îî© ?§Ï†ï
// (?®ÌÇ§ÏßÄÎ™?Î≥ÄÍ≤ΩÏóê ?ÅÌñ•Î∞õÏ? ?äÎèÑÎ°??ÅÎ?Í≤ΩÎ°ú import ?¨Ïö©)
import '../../core/settings/app_settings.dart';
import '../widgets/neon_theme.dart';
import 'trade_chart_only_screen.dart';
import '../widgets/fx.dart';
import '../widgets/fx_particles_bg.dart';
import '../widgets/fx_config.dart';

import '../widgets/center_hub_v1.dart';
import '../widgets/tf_strip_v1.dart';
import '../widgets/sr_line_v1.dart';
import '../widgets/candle_close_badges_v1.dart';
import '../../core/utils/candle_close_util.dart';
import '../widgets/signal_card_v1.dart';
import '../widgets/mini_chart_v4.dart';
import '../widgets/pattern_sheet_v1.dart';
import '../widgets/csv_chip_row_v1.dart';
import '../widgets/manager_trade_panel.dart';
import '../widgets/procion_a_card_v1.dart';
import '../widgets/future_wave_panel.dart';
import '../widgets/glass_card.dart';
import '../widgets/flow_radar_hud.dart';
import '../widgets/help_sheet_v1.dart';
import '../widgets/clock_chip.dart';

import 'log_screen.dart';
import 'tune_screen.dart';
import 'position_screen.dart';
import '../../core/models/fu_state_ui_alias.dart';
import '../../core/models/tyron_quick_res.dart';
import '../../core/services/fu_engine_run_ext.dart';
import '../widgets/neon_theme_ext.dart';
import '../widgets/ultra_top_bar_v1.dart';
import 'indicator_glossary_screen.dart';
import 'briefing_fullscreen_page.dart';
import 'chart_fullscreen_page.dart';
import 'future_path_chart_page.dart';
import '../../core/services/flow_radar_calc.dart';
import '../../core/diagnostics/engine_signal_hub.dart';
import '../widgets/engine_signal_sheet_v1.dart';
import '../widgets/decision_dock_v1.dart';
import '../widgets/decision_hud_v11.dart';

import '../widgets/tf_strip_status_v3.dart';
import '../widgets/tf_briefing_cards_v2.dart';
import '../widgets/unified_decision_panel.dart';
class UltraHomeScreen extends StatefulWidget {
  const UltraHomeScreen({super.key});

  @override
  State<UltraHomeScreen> createState() => _UltraHomeScreenState();
}


class _RiskBrake {
  static const _kLossStreak = 'rb_loss_streak';
  static const _kCooldownUntil = 'rb_cooldown_until';
  static const _kBucketJson = 'rb_bucket_json';
  static const _kForceDecisionOn = 'rb_force_decision_on';
  static const _kBrakeOn = 'rb_brake_on';

  int lossStreak = 0;
  int cooldownUntilMs = 0;
  bool forceDecisionOn = true;
  bool brakeOn = true;

  // confidence bucket stats: key "0-20","20-40","40-60","60-75","75-100"
  Map<String, Map<String, int>> buckets = {
    '0-20': {'w': 0, 'l': 0},
    '20-40': {'w': 0, 'l': 0},
    '40-60': {'w': 0, 'l': 0},
    '60-75': {'w': 0, 'l': 0},
    '75-100': {'w': 0, 'l': 0},
  };

  bool get inCooldown => DateTime.now().millisecondsSinceEpoch < cooldownUntilMs;

  String bucketKey(int conf) {
    if (conf < 20) return '0-20';
    if (conf < 40) return '20-40';
    if (conf < 60) return '40-60';
    if (conf < 75) return '60-75';
    return '75-100';
  }

  Future<void> load() async {
    final sp = await SharedPreferences.getInstance();
    lossStreak = sp.getInt(_kLossStreak) ?? 0;
    cooldownUntilMs = sp.getInt(_kCooldownUntil) ?? 0;
    forceDecisionOn = sp.getBool(_kForceDecisionOn) ?? true;
    brakeOn = sp.getBool(_kBrakeOn) ?? true;
    final js = sp.getString(_kBucketJson);
    if (js != null && js.isNotEmpty) {
      try {
        final m = jsonDecode(js) as Map<String, dynamic>;
        final out = <String, Map<String, int>>{};
        for (final e in m.entries) {
          final v = e.value as Map<String, dynamic>;
          out[e.key] = {'w': (v['w'] ?? 0) as int, 'l': (v['l'] ?? 0) as int};
        }
        // merge to keep keys
        for (final k in buckets.keys) {
          if (out.containsKey(k)) buckets[k] = out[k]!;
        }
      } catch (_) {}
    }
  }

  Future<void> save() async {
    final sp = await SharedPreferences.getInstance();
    await sp.setInt(_kLossStreak, lossStreak);
    await sp.setInt(_kCooldownUntil, cooldownUntilMs);
    await sp.setBool(_kForceDecisionOn, forceDecisionOn);
    await sp.setBool(_kBrakeOn, brakeOn);
    await sp.setString(_kBucketJson, jsonEncode(buckets));
  }

  Future<void> resetStats() async {
    lossStreak = 0;
    cooldownUntilMs = 0;
    buckets = {
      '0-20': {'w': 0, 'l': 0},
      '20-40': {'w': 0, 'l': 0},
      '40-60': {'w': 0, 'l': 0},
      '60-75': {'w': 0, 'l': 0},
      '75-100': {'w': 0, 'l': 0},
    };
    await save();
  }

  Future<void> toggleForceDecision() async {
    forceDecisionOn = !forceDecisionOn;
    await save();
  }

  Future<void> toggleBrake() async {
    brakeOn = !brakeOn;
    await save();
  }

  Future<void> recordOutcome({required bool win, required int confidence}) async {
    final k = bucketKey(confidence);
    final b = buckets[k]!;
    if (win) {
      b['w'] = (b['w'] ?? 0) + 1;
      lossStreak = 0;
    } else {
      b['l'] = (b['l'] ?? 0) + 1;
      lossStreak += 1;
    }

    // Î∏åÎ†à?¥ÌÅ¨ Í∑úÏπô
    // 3?∞Ìå®: R 0.25 Í∞ïÏ†ú(?îÏßÑ?êÏÑú recommendR clamp)
    // 5?∞Ìå®: Ïø®Îã§??30Î∂?(NO-TRADE)
    if (lossStreak >= 5) {
      cooldownUntilMs = DateTime.now().add(const Duration(minutes: 30)).millisecondsSinceEpoch;
      lossStreak = 0; // Ïø®Îã§???§Ïñ¥Í∞ÄÎ©?streak Î¶¨ÏÖã
    }
    await save();
  }

  double winrateForBucket(String k) {
    final b = buckets[k]!;
    final w = b['w'] ?? 0;
    final l = b['l'] ?? 0;
    final n = w + l;
    if (n <= 0) return 0;
    return (w / n) * 100.0;
  }
}


class _DecisionTrack {
  String dir = '';
  double entry = 0;
  double atr = 0;
  int confidence = 0;
  int ts = 0; // ms
  bool active = false;

  void start({required String dir, required double entry, required double atr, required int confidence}) {
    this.dir = dir;
    this.entry = entry;
    this.atr = atr;
    this.confidence = confidence;
    ts = DateTime.now().millisecondsSinceEpoch;
    active = true;
  }

  void reset() {
    dir = '';
    entry = 0;
    atr = 0;
    confidence = 0;
    ts = 0;
    active = false;
  }
}

/// TYRON ??Í≤∞Í≥º (LONG/SHORT/WAIT + % + ?âÏÉÅ). _TyronChip Î∞?_tyronQuick?êÏÑú ?¨Ïö©.
class _TyronQuickRes {
  final String dir;
  final int pct;
  final Color color;
  const _TyronQuickRes(this.dir, this.pct, this.color);
}

/// TYRON Ïπ??ÑÏ†Ø. ?ÅÏúÑ?êÏÑú _tyronQuick Í≤∞Í≥ºÎ•??òÍ≤® ?úÏãú.
class _TyronChip extends StatelessWidget {
  final _TyronQuickRes res;
  const _TyronChip({required this.res});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: res.color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: res.color.withOpacity(0.55)),
      ),
      child: Text(
        'TYRON ${res.dir} (${res.pct}%)',
        style: TextStyle(
          color: res.color,
          fontSize: 11,
          fontWeight: FontWeight.w900,
          letterSpacing: 0.2,
        ),
      ),
    );
  }
}

class _UltraHomeScreenState extends State<UltraHomeScreen> with WidgetsBindingObserver {

// v10.7: ÎØ∏Îãà ?†Í? Ïπ??úÏãúÎß? ?îÏßÑ ?†Í? ?∞Í≤∞?Ä ?§Ïùå ?®Í≥Ñ?êÏÑú)
Widget _miniToggleChip(String label, bool on) {
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(10),
      border: Border.all(color: on ? NeonTheme.of(context).good.withOpacity(0.45) : NeonTheme.of(context).line.withOpacity(0.25)),
      color: (on ? NeonTheme.of(context).good : NeonTheme.of(context).muted).withOpacity(0.10),
    ),
    child: Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: on ? NeonTheme.of(context).textStrong : NeonTheme.of(context).text)),
  );
}

  bool _aExpanded = false; // AÏπ¥Îìú ?ºÏπ®/?ëÍ∏∞

  // v10 SAFE: ?§ÌÅ¨Î°?Í∏∞Î∞ò ÎØ∏Îãà ?§Îçî(Í≤∞Î°† ?îÏïΩ) - Sliver Íµ¨Ï°∞Î•?Í±¥ÎìúÎ¶¨Ï? ?äÍ≥† Stack?ºÎ°ú Í≥†Ï†ï
  final ScrollController _scrollCtrl = ScrollController();
  final ValueNotifier<double> _scrollY = ValueNotifier<double>(0);

  final _engine = FuEngine();
  // ?§ÏãúÍ∞?Í∞ÄÍ≤©Ï? BitgetLiveStore?êÏÑú Í∞Ä?∏Ïò§Î©? Î°úÏª¨ Ï∫êÏãú Î≥Ä?òÎ? ?êÏ? ?äÏäµ?àÎã§.
  // (Ï§ëÎ≥µ ?†Ïñ∏/?§ÏΩî??Ï∂©Îèå Î∞©Ï?)
  // double livePrice = 0.0;
  String symbol = 'BTCUSDT';
  String tf = '15m';
  // Backward-compat alias (some patches use _selectedTf)
  String get _selectedTf => tf;
  set _selectedTf(String v) => tf = v;
  // Backward-compat alias (some patches use _tf)
  String get _tf => tf;
  set _tf(String v) => tf = v;

  void _setTf(String v) {
    setState(() => tf = v);
    _refresh();
  }


  // PROCION Í∞úÌé∏: 1Î∂??¨Ìï®(Í≥†Ï†ï)
  final tfs = const ['1m', '5m', '15m', '1h', '4h', '1D', '1W', '1M'];

  FuState _s = FuState.initial();

  final _dt = _DecisionTrack();
  final _rb = _RiskBrake();
  bool _rbReady = false;
  final _tunDao = TuningDao();
  final _sigDao = SignalDao();
  final _outDao = OutcomeDao();
  final _autoTune = AutoTune();
  int? _activeSignalId;
  int _lastSignalTs = 0;

  double _approxAtr(FuState s) {
    final c = s.candles;
    if (c.isEmpty) return 0;
    final n = math.min(14, c.length);
    double sum = 0;
    for (var i = c.length - n; i < c.length; i++) {
      sum += (c[i].high - c[i].low).abs();
    }
    return n > 0 ? sum / n : 0;
  }

  // v10.3 SAFE: ?†Î¢∞???ÑÌÑ∞(UI ?®ÎèÖ)
  // - confidence < 60 ?¥Î©¥ '?ïÏ†ï(showSignal)' Í¥Ä??UIÎ•?WATCHÎ°??§Ïö¥Í∑∏Î†à?¥Îìú
  // ?∏Î†à?¥Îçî Î™®Îìú: ?ïÏ†ï ?†Ìò∏????Î≥¥Ïàò?ÅÏúºÎ°??®Î∞ú Î∞©Ï?)
  bool get _confOk => _s.confidence >= 75;
  bool get _showSig => _s.showSignal && _confOk;

  // AI ?®ÌÑ¥ Î™®Îìú(8Ï¢?15Ï¢? + Ï∞®Ìä∏ ?§Î≤Ñ?àÏù¥
  PatternSetMode _patternMode = PatternSetMode.pro8;
  PatternPick? _pendingPick;
  List<MiniChartLine> _patternLines = const [];
  String _patternLabel = '';

  // ?†Ìò∏ Î≥Ä??Î°???Í¥ÄÎß?LOCK) ???ÅÎã® ?åÎ¶º(?†Ïä§?? ?∏Î¶¨Í±∞Ïö©
  String _lastSignalToastKey = '';
  DateTime? _lastSignalToastAt;
  // "?Ä??Íµ¨Í∞Ñ"(ÏßÑÏûÖ Ï§ÄÎπ??ÑÎã¨) ?åÎ¶º ?§Ìå∏ Î∞©Ï? ??  String _lastApproachToastKey = '';
  DateTime? _lastApproachToastAt;

  // 4H ?ïÏ†ï ?†Ìò∏ ?åÎ¶º(Î≥ÑÎèÑ)
  String _lastH4ToastKey = '';
  DateTime? _lastH4ToastAt;

  void _openEntryDetail(NeonTheme theme) {
    final dir = _s.finalDir.toUpperCase();
    final dirKo = dir == 'LONG'
        ? 'Î°?
        : dir == 'SHORT'
            ? '??
            : 'Í¥ÄÎß?;

    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (_) {
        return AlertDialog(
          backgroundColor: const Color(0xFF0B1020),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: Text('ÏßÑÏûÖ ?åÎ¶º', style: TextStyle(color: theme.textPrimary)),
          content: SingleChildScrollView(
            child: DefaultTextStyle(
              style: TextStyle(color: theme.textSecondary, fontSize: 13),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Î∞©Ìñ•: $dirKo  / ?±Í∏â: ${_s.grade}'),
                  const SizedBox(height: 8),
                  Text('ÏßÑÏûÖ: ${_s.entry.toStringAsFixed(0)}'),
                  Text('?êÏ†à: ${_s.stop.toStringAsFixed(0)}'),
                  Text('Î™©Ìëú: ${_s.target.toStringAsFixed(0)}'),
                  const SizedBox(height: 8),
                  Text('?àÎ≤ÑÎ¶¨Ï?: ${_s.leverage.toStringAsFixed(1)}x'),
                  Text('?òÎüâ: ${_s.qty.toStringAsFixed(4)}'),
                  Text('RR: ${_s.rr.toStringAsFixed(2)}  / Î¶¨Ïä§?? 5%'),
                  const SizedBox(height: 10),
                  Text('?§Ïùå ?°ÏÖò(Íµ¨Ï°∞/Î∞òÏùë):', style: TextStyle(color: theme.textPrimary)),
                  const SizedBox(height: 6),
                  ..._s.signalBullets
                      .where((b) => b.contains('Íµ¨Ï°∞') || b.contains('?åÌåå') || b.contains('Î∞òÏùë'))
                      .take(5)
                      .map((b) => Padding(
                            padding: const EdgeInsets.only(bottom: 2),
                            child: Text('??$b'),
                          )),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text('?´Í∏∞', style: TextStyle(color: theme.accent)),
            ),
          ],
        );
      },
    );
  }

  // ??Î©îÏù∏ ?∞Ï∏°?òÎã® [Ï∞®Ìä∏] Î≤ÑÌäº ???ÑÏ≤¥?îÎ©¥(Ï¢?Ï∞®Ìä∏ / ??ÎØ∏ÎûòÍ≤ΩÎ°ú)
  void _openFullChart(double livePrice) {
    if (!mounted) return;
    if (_s.candles.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Ï∞®Ìä∏ ?∞Ïù¥??Î°úÎî© Ï§ë‚Ä??†Ïãú ???§Ïãú ?úÎèÑ')),
      );
      return;
    }

    Navigator.of(context).push(
  MaterialPageRoute(
    builder: (_) => FuturePathChartPage(
      symbol: symbol,
      tfLabel: tf,
      state: _s,
      livePrice: livePrice,
    ),
  ),
);
  }

  // v10 SAFE: ?§ÌÅ¨Î°??úÏóê????ÉÅ Î≥¥Ïù¥??'Í≤∞Î°† ?îÏïΩ' ÎØ∏Îãà ?§Îçî
  Widget _stickyDecisionBar(NeonTheme theme, double livePrice) {
    final dir = _s.finalDir.toUpperCase();
    final dirKo = dir.contains('LONG')
        ? 'Î°?
        : dir.contains('SHORT')
            ? '??
            : 'Í¥ÄÎß?;

    final locked = _s.locked || !_showSig;
    final lockLabel = locked ? (_s.noTradeReason.isNotEmpty ? _s.noTradeReason : 'Îß§Îß§Í∏àÏ?') : '?ïÏÉÅ';
    final probPct = (_s.probFinal * 100).round();
    final roi = _s.expectedRoiPct;

    // v10.1: ?§Ï†Ñ ?åÎûú ?îÏïΩ(5% Î¶¨Ïä§??Í∏∞Î∞ò ?∞Ï∂úÍ∞?
    String _fmt(double v) {
      if (v.isNaN || v.isInfinite || v <= 0) return '--';
      if (v >= 1000) return v.toStringAsFixed(0);
      if (v >= 100) return v.toStringAsFixed(1);
      return v.toStringAsFixed(2);
    }

    final entry = (_s.entry > 0) ? _s.entry : livePrice;
    final stop = _s.stop;
    final lev = _s.leverage;
    final qty = _s.qty;

    final planText = 'E ${_fmt(entry)}  SL ${_fmt(stop)}  L ${_fmt(lev)}  Q ${qty > 0 ? qty.toStringAsFixed(4) : '--'}';

    return Material(
      color: Colors.transparent,
      child: Container(
        height: 40,
        margin: const EdgeInsets.fromLTRB(14, 6, 14, 6),
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(
          color: theme.card.withOpacity(0.92),
          borderRadius: BorderRadius.circular(12),
          // NeonTheme ?∏Ìôò: line/ok/dangerÍ∞Ä ?ÜÎäî ?åÎßàÍ∞Ä ?àÏñ¥ border/good/badÎ°?Îß§Ìïë
          border: Border.all(color: theme.border.withOpacity(0.55)),
        ),
        child: Row(
          children: [
            _miniBadge(theme, 'Í≤∞Î°†', dirKo),
            const SizedBox(width: 6),
            _miniBadge(theme, '?ïÎ•†', '$probPct%'),
            const SizedBox(width: 6),
            _miniBadge(theme, 'ROI', '${roi.toStringAsFixed(0)}%'),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                planText,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                  color: theme.fg,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              lockLabel,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w900,
                color: locked ? theme.bad : theme.good,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _miniBadge(NeonTheme theme, String k, String v) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: theme.bg.withOpacity(0.35),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: theme.border.withOpacity(0.35)),
      ),
      child: RichText(
        text: TextSpan(
          style: TextStyle(color: theme.textSecondary, fontSize: 11, fontWeight: FontWeight.w800),
          children: [
            TextSpan(text: '$k '),
            TextSpan(text: v, style: TextStyle(color: theme.textPrimary, fontWeight: FontWeight.w900)),
          ],
        ),
      ),
    );
  }

  void _openPatternSheet(NeonTheme theme) {
    PatternSheetV1.open(
      context,
      t: theme,
      currentTf: tf,
      tfs: tfs,
      initialMode: _patternMode,
      onMode: (m) => setState(() => _patternMode = m),
      onPick: (pickTf, mode, pick) {
        // TFÎ•?Î∞îÍøî??Î≥¥Í≥† ?∂Ïñ¥ ?òÎãà, ?†ÌÉù??TFÎ°??¥Îèô ???∞Ïù¥??Í∞±Ïã†
        setState(() {
          _patternMode = mode;
          _pendingPick = pick;
          tf = pickTf;
          _patternLabel = _modeName(mode) + ' ¬∑ ' + pick.name;
        });
        _startRealtimeCandles();
        _startAutoRefresh();
        _refresh();
      },
    );
  }

  String _modeName(PatternSetMode m) => (m == PatternSetMode.pro8) ? '?§Ï†Ñ 8Ï¢? : '?Ä?¥Î°± 15Ï¢?;

  void _applyPendingPatternIfAny(FuState st) {
    final pick = _pendingPick;
    if (pick == null) return;
    final lines = _makePatternLines(pick.key, st.candles);
    if (!mounted) return;
    setState(() {
      _patternLines = lines;
    });
  }

  List<MiniChartLine> _makePatternLines(String key, List<FuCandle> candles) {
    if (candles.length < 12) return const [];

    // ÏµúÍ∑º Íµ¨Í∞ÑÎß??¨Ïö©(?àÎ¨¥ Í∏∏Î©¥ ?∏Ïù¥Ï¶?
    final n = candles.length;
    final win = n > 64 ? 64 : n;
    final start = n - win;

    double maxHigh(int a, int b) {
      double m = candles[a].high;
      for (int i = a; i <= b; i++) {
        m = math.max(m, candles[i].high);
      }
      return m;
    }

    double minLow(int a, int b) {
      double m = candles[a].low;
      for (int i = a; i <= b; i++) {
        m = math.min(m, candles[i].low);
      }
      return m;
    }

    // ??????Íµ¨Í∞Ñ?ºÎ°ú Í∑πÍ∞í Ï∂îÏ∂ú
    final mid = start + (win ~/ 2);
    final hi1 = maxHigh(start, mid);
    final hi2 = maxHigh(mid, n - 1);
    final lo1 = minLow(start, mid);
    final lo2 = minLow(mid, n - 1);

    // Í∏∞Î≥∏ 2?ºÏù∏(?ÅÎã®/?òÎã®)
    MiniChartLine upper(Color col, {double w = 2.0}) => MiniChartLine(i1: start, i2: n - 1, p1: hi1, p2: hi2, color: col, width: w);
    MiniChartLine lower(Color col, {double w = 2.0}) => MiniChartLine(i1: start, i2: n - 1, p1: lo1, p2: lo2, color: col, width: w);

    switch (key) {
      case 'triangle':
        return [upper(Colors.white), lower(Colors.white)];
      case 'wedge_up':
        // ?ÅÏäπ?êÍ∏∞: ???ºÏù∏ ?ÅÏäπ + ?òÎ†¥
        return [
          MiniChartLine(i1: start, i2: n - 1, p1: hi1, p2: hi2 * 0.98, color: Colors.white, width: 2.0),
          MiniChartLine(i1: start, i2: n - 1, p1: lo1, p2: lo2 * 1.02, color: Colors.white, width: 2.0),
        ];
      case 'wedge_dn':
        return [
          MiniChartLine(i1: start, i2: n - 1, p1: hi1, p2: hi2 * 1.02, color: Colors.white, width: 2.0),
          MiniChartLine(i1: start, i2: n - 1, p1: lo1, p2: lo2 * 0.98, color: Colors.white, width: 2.0),
        ];
      case 'channel':
        return [upper(Colors.white, w: 1.8), lower(Colors.white, w: 1.8)];
      case 'double_top':
        final lv = hi2;
        return [MiniChartLine(i1: start, i2: n - 1, p1: lv, p2: lv, color: Colors.white, width: 2.4)];
      case 'double_bottom':
        final lv = lo2;
        return [MiniChartLine(i1: start, i2: n - 1, p1: lv, p2: lv, color: Colors.white, width: 2.4)];
      case 'bull_flag':
        // Í∞ÑÎã®: ?òÎã® ÏßÄÏßÄ??+ ÏßßÏ? Ï±ÑÎÑê
        return [lower(Colors.white, w: 2.2)];
      case 'bear_flag':
        return [upper(Colors.white, w: 2.2)];
      case 'hs':
        // Î™©ÏÑ†(Ï§ëÍ∞Ñ ?Ä??
        final neckline = minLow(mid - 3 < start ? start : mid - 3, mid + 3 > n - 1 ? n - 1 : mid + 3);
        return [MiniChartLine(i1: start, i2: n - 1, p1: neckline, p2: neckline, color: Colors.white, width: 2.2)];
      case 'inv_hs':
        final neckline2 = maxHigh(mid - 3 < start ? start : mid - 3, mid + 3 > n - 1 ? n - 1 : mid + 3);
        return [MiniChartLine(i1: start, i2: n - 1, p1: neckline2, p2: neckline2, color: Colors.white, width: 2.2)];
      case 'range_box':
        return [
          MiniChartLine(i1: start, i2: n - 1, p1: hi1, p2: hi1, color: Colors.white, width: 2.0),
          MiniChartLine(i1: start, i2: n - 1, p1: lo1, p2: lo1, color: Colors.white, width: 2.0),
        ];
      default:
        return [upper(Colors.white, w: 1.6), lower(Colors.white, w: 1.6)];
    }
  }

  List<MiniChartLine> _buildPatternLines(PatternPick pick) {
    final candles = _s.candles;
    if (candles.length < 20) return const [];
    final n = candles.length;
    final win = (n < 80) ? n : 80;
    final start = n - win;
    double maxHigh(int a, int b) {
      double m = -1;
      for (int i = a; i <= b; i++) {
        final v = candles[i].high;
        if (v > m) m = v;
      }
      return m;
    }
    double minLow(int a, int b) {
      double m = 1e100;
      for (int i = a; i <= b; i++) {
        final v = candles[i].low;
        if (v < m) m = v;
      }
      return m;
    }

    final a1 = start;
    final a2 = start + (win * 0.35).round().clamp(5, win - 5);
    final b1 = start + (win * 0.65).round().clamp(5, win - 5);
    final b2 = n - 1;
    final sh1 = maxHigh(a1, a2);
    final sh2 = maxHigh(b1, b2);
    final sl1 = minLow(a1, a2);
    final sl2 = minLow(b1, b2);

    // NOTE: ???®Ïàò??BuildContext/Theme??ÏßÅÏ†ë ?ëÍ∑º?òÏ? ?äÏùå.
    // ?ºÏù∏ ?âÏÉÅ?Ä MiniChartPainter?êÏÑú Í∏∞Î≥∏(?±Ïùò accent)Î°?Ï≤òÎ¶¨?òÎèÑÎ°?null ?†Ï?.

    switch (pick.key) {
      case 'triangle':
        return [
          MiniChartLine(i1: a1, i2: b2, p1: sh1, p2: sh2, color: null, width: 1.8),
          MiniChartLine(i1: a1, i2: b2, p1: sl1, p2: sl2, color: null, width: 1.8),
        ];
      case 'wedge_up':
        return [
          MiniChartLine(i1: a1, i2: b2, p1: sh1, p2: sh2 * 0.995, color: null, width: 1.8),
          MiniChartLine(i1: a1, i2: b2, p1: sl1, p2: sl2 * 1.005, color: null, width: 1.8),
        ];
      case 'wedge_dn':
        return [
          MiniChartLine(i1: a1, i2: b2, p1: sh1, p2: sh2 * 1.005, color: null, width: 1.8),
          MiniChartLine(i1: a1, i2: b2, p1: sl1, p2: sl2 * 0.995, color: null, width: 1.8),
        ];
      case 'channel':
      case 'bull_flag':
      case 'bear_flag':
        return [
          MiniChartLine(i1: a1, i2: b2, p1: sh1, p2: sh2, color: null, width: 1.6),
          MiniChartLine(i1: a1, i2: b2, p1: sl1, p2: sl2, color: null, width: 1.6),
        ];
      case 'double_top':
        final lv = (sh1 + sh2) / 2;
        return [MiniChartLine(i1: a1, i2: b2, p1: lv, p2: lv, color: null, width: 2.2)];
      case 'double_bottom':
        final lv2 = (sl1 + sl2) / 2;
        return [MiniChartLine(i1: a1, i2: b2, p1: lv2, p2: lv2, color: null, width: 2.2)];
      default:
        // ?Ä?¥Î°± ?ïÏû• ?®ÌÑ¥?Ä Í∏∞Î≥∏?ÅÏúºÎ°??ºÍ∞Å/Ï±ÑÎÑê ?§Ì??ºÎ°ú ?àÏ†Ñ?òÍ≤å ?úÌòÑ
        return [
          MiniChartLine(i1: a1, i2: b2, p1: sh1, p2: sh2, color: null, width: 1.6),
          MiniChartLine(i1: a1, i2: b2, p1: sl1, p2: sl2, color: null, width: 1.6),
        ];
    }
  }

  void _openTradingSettingsSheet(NeonTheme theme) {
    final accCtl = TextEditingController(text: AppSettings.accountUsdt.toStringAsFixed(0));
    // feeRoundTrip?Ä ?åÏàò(0.0008)Î°??Ä?•ÌïòÎØÄÎ°?UI???ºÏÑº??0.08)Î°?Î≥¥Ïó¨Ï§?    final feeCtl = TextEditingController(text: (AppSettings.feeRoundTrip * 100).toStringAsFixed(3));
    final levCtl = TextEditingController(text: AppSettings.leverageOverride.toStringAsFixed(1));
    final sigProbCtl = TextEditingController(text: AppSettings.signalMinProb.toString());
    final notiProbCtl = TextEditingController(text: AppSettings.notifyMinProb.toString());
    final cdCtl = TextEditingController(text: AppSettings.notifyCooldownMin.toString());

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: theme.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (ctx) {
        Widget field(String label, TextEditingController c, {String hint = ''}) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(
              children: [
                SizedBox(
                  width: 120,
                  child: Text(label, style: TextStyle(color: theme.textSecondary, fontSize: 12, fontWeight: FontWeight.w700)),
                ),
                Expanded(
                  child: TextField(
                    controller: c,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    style: TextStyle(color: theme.textPrimary, fontWeight: FontWeight.w800),
                    decoration: InputDecoration(
                      hintText: hint,
                      hintStyle: TextStyle(color: theme.textSecondary.withOpacity(0.7)),
                      isDense: true,
                      filled: true,
                      fillColor: theme.bg,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(color: theme.border.withOpacity(0.35)),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(color: theme.border.withOpacity(0.35)),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(color: theme.accent.withOpacity(0.8)),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          );
        }

        void apply() {
          final acc = double.tryParse(accCtl.text.trim());
          if (acc != null && acc > 0) AppSettings.accountUsdt = acc;

          final feePct = double.tryParse(feeCtl.text.trim());
          if (feePct != null && feePct >= 0) {
            AppSettings.feeRoundTrip = (feePct / 100).clamp(0.0, 0.05);
          }

          final lev = double.tryParse(levCtl.text.trim());
          if (lev != null && lev >= 0) AppSettings.leverageOverride = lev;

          final sp = int.tryParse(sigProbCtl.text.trim());
          if (sp != null) AppSettings.signalMinProb = sp.clamp(50, 95);

          final np = int.tryParse(notiProbCtl.text.trim());
          if (np != null) AppSettings.notifyMinProb = np.clamp(50, 95);

          final cd = int.tryParse(cdCtl.text.trim());
          if (cd != null) AppSettings.notifyCooldownMin = cd.clamp(1, 120);

          setState(() {});
        }

        return Padding(
          padding: EdgeInsets.only(
            left: 14,
            right: 14,
            top: 14,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 14,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text('?∏Î†à?¥Îî© ?§Ï†ï', style: TextStyle(color: theme.textPrimary, fontSize: 16, fontWeight: FontWeight.w900)),
                  const Spacer(),
                  IconButton(
                    onPressed: () => Navigator.pop(ctx),
                    icon: Icon(Icons.close, color: theme.textSecondary),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text('Î¶¨Ïä§?¨Îäî 5% Í≥†Ï†ï(?êÎèô Í≥ÑÏÇ∞)', style: TextStyle(color: theme.textSecondary, fontSize: 12, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      decoration: BoxDecoration(
                        color: theme.bg,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: theme.border.withOpacity(0.35)),
                      ),
                      child: Row(
                        children: [
                          Text('?åÎ¶º', style: TextStyle(color: theme.textPrimary, fontWeight: FontWeight.w900)),
                          const Spacer(),
                          Switch(
                            value: AppSettings.notifyEnabled,
                            onChanged: (v) {
                              setState(() => AppSettings.notifyEnabled = v);
                            },
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              field('Í≥ÑÏ¢å(USDT)', accCtl, hint: '?? 1000'),
              field('?ïÎ≥µ ?òÏàòÎ£?%)', feeCtl, hint: '?? 0.08'),
              field('?àÎ≤ÑÎ¶¨Ï?(0=?êÎèô)', levCtl, hint: '?? 10'),
              field('?ïÏ†ï ÏµúÏÜå?ïÎ•†', sigProbCtl, hint: '?? 65'),
              field('?åÎ¶º ÏµúÏÜå?ïÎ•†', notiProbCtl, hint: '?? 70'),
              field('?åÎ¶º Ïø®Îã§??Î∂?', cdCtl, hint: '?? 10'),
              const SizedBox(height: 14),
              const _ChartOverlaySettingsCard(),
              const SizedBox(height: 6),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: theme.accent,
                        foregroundColor: Colors.black,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      onPressed: () {
                        apply();
                        Navigator.pop(ctx);
                      },
                      child: const Text('?ÅÏö©', style: TextStyle(fontWeight: FontWeight.w900)),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  void _maybeShowSignalToast(NeonTheme theme, FuState st) {
    if (!mounted) return;
    if (!AppSettings.notifyEnabled) return;
    if (!st.showSignal) return;
    final g = st.grade.toUpperCase();
    if (g == 'WATCH' || g == 'LOCK') return;
    if (st.expectedRoiPct < 25) return;
    final d = st.finalDir.toUpperCase();
    if (d != 'LONG' && d != 'SHORT') return;
    final p = st.signalProb.clamp(0, 100);
    if (p < AppSettings.notifyMinProb) return;
    final key = '${st.finalDir}|${st.grade}|${st.entry.toStringAsFixed(0)}|${st.stop.toStringAsFixed(0)}|${st.target.toStringAsFixed(0)}';
    final now = DateTime.now();
    final cd = Duration(minutes: AppSettings.notifyCooldownMin);
    if (key == _lastSignalToastKey && _lastSignalToastAt != null && now.difference(_lastSignalToastAt!) < cd) return;
    _lastSignalToastKey = key;
    _lastSignalToastAt = now;

    // ?ÅÎã® ?åÎ¶º(?¥Î¶≠ ???ÅÏÑ∏)
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final dir = st.finalDir.toUpperCase();
      final dirKo = dir == 'LONG'
          ? 'Î°?
          : dir == 'SHORT'
              ? '??
              : 'Í¥ÄÎß?;
      final c = (dir == 'LONG') ? theme.good : (dir == 'SHORT') ? theme.bad : theme.warn;

      final bar = SnackBar(
        behavior: SnackBarBehavior.floating,
        backgroundColor: theme.card,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: c.withOpacity(0.55)),
        ),
        duration: const Duration(seconds: 3),
        content: Row(
          children: [
            Icon(Icons.bolt, color: c, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                '$dirKo ?†Ìò∏ ¬∑ ÏßÑÏûÖ ${st.entry.toStringAsFixed(0)} / SL ${st.stop.toStringAsFixed(0)} / TP ${st.target.toStringAsFixed(0)}',
                style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900, fontSize: 12),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        action: SnackBarAction(
          label: 'Î≥¥Í∏∞',
          textColor: theme.accent,
          onPressed: () => _openEntryDetail(theme),
        ),
      );
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(bar);

      // ??ÏßÑÎèô(Í∞ÄÎ≤ºÏö¥ ?ÖÌã±) - ?ïÏ†ï ?†Ìò∏ Î∞úÏÉù ??1??      // (?åÎü¨Í∑∏Ïù∏ Ï∂îÍ? ?ÜÏù¥ Í∏∞Î≥∏ ?ÖÌã±Îß??¨Ïö©)
      try {
        if (dir == 'LONG') {
          HapticFeedback.mediumImpact();
        } else if (dir == 'SHORT') {
          HapticFeedback.heavyImpact();
        } else {
          HapticFeedback.selectionClick();
        }
      } catch (e) {}
    });
  }

  void _maybeShowApproachToast(NeonTheme theme, FuState st) {
    // ?Ä??Íµ¨Í∞Ñ ?ÑÎã¨ ?åÎ¶º (?ïÏ†ï ???®Í≥Ñ)
    if (!mounted) return;
    if (!AppSettings.notifyEnabled) return;
    if (st.locked) return;
    if (!st.showSignal) return;
    if (st.expectedRoiPct < 25) return;
    final p = st.signalProb.clamp(0, 100);
    if (p < 65) return;
    // ?ëÍ∑º ?åÎ¶º?Ä ?ïÏ†ïÎ≥¥Îã§ ??? Ïª∑ÏùÑ ?àÏö©?òÎêò, ÏµúÏÜå ?ïÎ•† ?µÏÖò??Ï°¥Ï§ë
    if (p < (AppSettings.notifyMinProb - 5).clamp(60, 100)) return;

    final g = st.grade.toUpperCase();
    // ?ïÏ†ï/Í∞ïÌïú ?†Ìò∏??_maybeShowSignalToast?êÏÑú Ï≤òÎ¶¨?òÎ?Î°??¨Í∏∞?úÎäî WATCH/Ï§ÄÎπ??®Í≥ÑÎß?    if (g != 'WATCH' && g != 'LOCK') return;

    final dir = st.finalDir.toUpperCase();
    final dirKo = (dir == 'LONG') ? 'Î°? : (dir == 'SHORT') ? '?? : 'Í¥ÄÎß?;
    final key = 'APPROACH|$dir|${st.entry.toStringAsFixed(0)}|${st.stop.toStringAsFixed(0)}|${st.target.toStringAsFixed(0)}|$p|${st.evidenceHit}/${st.evidenceTotal}';
    final now = DateTime.now();
    final cd = Duration(minutes: AppSettings.notifyCooldownMin);
    if (key == _lastApproachToastKey && _lastApproachToastAt != null && now.difference(_lastApproachToastAt!) < cd) return;
    _lastApproachToastKey = key;
    _lastApproachToastAt = now;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final bar = SnackBar(
        behavior: SnackBarBehavior.floating,
        backgroundColor: theme.card,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: theme.warn.withOpacity(0.55)),
        ),
        duration: const Duration(seconds: 2),
        content: Row(
          children: [
            Icon(Icons.notifications_active, color: theme.warn, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                '?Ä???ÑÎã¨(Ï§ÄÎπ? ¬∑ $dirKo ¬∑ ?ïÎ•† $p% ¬∑ Í∑ºÍ±∞ ${st.evidenceHit}/${st.evidenceTotal}',
                style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900, fontSize: 12),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      );
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(bar);
      try {
        HapticFeedback.selectionClick();
      } catch (e) {}
    });
  }

  // ??4H(4?úÍ∞Ñ) ?ïÏ†ï ?†Ìò∏ ?åÎ¶º: ?¨Ïö©?êÍ? 5Î∂ÑÏùÑ Î≥¥Í≥† ?àÏñ¥??4H ?ïÏ†ï?Ä Î∞îÎ°ú ?????àÍ≤å.
  void _maybeShowH4FinalToast(NeonTheme theme, FuState st) {
    if (!mounted) return;
    if (!AppSettings.notifyEnabled) return;
    if (!st.showSignal) return;
    if (st.expectedRoiPct < 25) return;
    final dir = st.finalDir.toUpperCase();
    if (dir != 'LONG' && dir != 'SHORT') return;

    final p = st.signalProb.clamp(0, 100);
    final cut = math.max(70, AppSettings.notifyMinProb);
    if (p < cut) return;

    final key = 'H4|$dir|${st.entry.toStringAsFixed(0)}|${st.stop.toStringAsFixed(0)}|${st.target.toStringAsFixed(0)}|$p';
    final now = DateTime.now();
    final cd = Duration(minutes: AppSettings.notifyCooldownMin);
    if (key == _lastH4ToastKey && _lastH4ToastAt != null && now.difference(_lastH4ToastAt!) < cd) return;
    _lastH4ToastKey = key;
    _lastH4ToastAt = now;

    final dirKo = (dir == 'LONG') ? '?§Î•¥??Ï™? : '?¥Î¶¨??Ï™?;
    final c = (dir == 'LONG') ? theme.good : theme.bad;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final bar = SnackBar(
        behavior: SnackBarBehavior.floating,
        backgroundColor: theme.card,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: c.withOpacity(0.55)),
        ),
        duration: const Duration(seconds: 3),
        content: Row(
          children: [
            Icon(Icons.bolt, color: c, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                '4?úÍ∞Ñ ?ïÏ†ï ¬∑ $dirKo ¬∑ ?ïÎ•† $p% ¬∑ ÏßÑÏûÖ ${st.entry.toStringAsFixed(0)} / ?êÏ†à ${st.stop.toStringAsFixed(0)} / ?µÏ†à ${st.target.toStringAsFixed(0)}',
                style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900, fontSize: 12),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        action: SnackBarAction(
          label: 'Î≥¥Í∏∞',
          textColor: theme.accent,
          onPressed: () => _openTyronBoltSheet(context),
        ),
      );
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(bar);
      try {
        if (dir == 'LONG') {
          HapticFeedback.mediumImpact();
        } else {
          HapticFeedback.heavyImpact();
        }
      } catch (_) {}
    });
  }

  bool _loading = false;

  // --- multi timeframe snapshots (for pinned signal row)
  final Map<String, FuState> tfSnap = {};
  final Map<String, DateTime> tfSnapAt = {};
  bool _refreshingAllTfs = false;

  // --- realtime mini-candles (auto refresh)
  RealtimeBus? _candleBus;
  StreamSubscription<List<rt.Candle>>? _candleSub;
  Timer? _autoRefreshTimer;

  // BitgetLiveStore ValueNotifier listener (?§ÏãúÍ∞?Í∞ÄÍ≤??®Îùº???ÅÌÉú UI Í∞±Ïã†)
  VoidCallback? _liveListener;

  double get livePrice => BitgetLiveStore.I.livePrice;

  // switches
  bool safeMode = false;
  bool enableApiSync = true;

  // ???§Îçî ?íÏù¥(?§Î≤Ñ?åÎ°ú??Î∞©Ï?): ?îÎ©¥ ?íÏù¥???∞Îùº ?êÎèô Ï°∞Ï†à
  double get headerH {
    final vh = MediaQuery.of(context).size.height;
    return (vh * 0.44).clamp(330.0, 440.0);
  }
  bool enableLogging = true;
  bool enableNoTradeLock = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    // v10 SAFE: ÎØ∏Îãà ?§Îçî ?úÏãúÎ•??ÑÌïú ?§ÌÅ¨Î°?Ï∂îÏ†Å
    _scrollCtrl.addListener(() {
      if (!_scrollY.hasListeners) return;
      _scrollY.value = _scrollCtrl.hasClients ? _scrollCtrl.offset : 0.0;
    });
    // ?îÏßÑ ?ëÎèô ?†Ìò∏ ?®ÎÑê(?îÎ≤ÑÍ∑??¨Ïö©???ïÏù∏??
    EngineSignalHub.I.start();
    EngineSignalHub.I.ensureKey('price');
    EngineSignalHub.I.ensureKey('candle');
    EngineSignalHub.I.ensureKey('analysis');
    EngineSignalHub.I.ensureKey('pattern');
    EngineSignalHub.I.ensureKey('db');

    // ?§ÏãúÍ∞?Í∞ÄÍ≤??§Ìä∏Î¶??úÏûë
    BitgetLiveStore.I.start(symbol: symbol);

    // tickerÍ∞Ä Í∞±Ïã†???åÎßà??UIÎ•?Í∞±Ïã†(?àÎ°úÍ≥†Ïπ® ?ÜÏù¥??Í∞ÄÍ≤??çÏä§??Ï∞®Ìä∏Í∞Ä ?ÄÏßÅÏù¥Í≤?
    _liveListener = () {
      if (!mounted) return;
      final on = BitgetLiveStore.I.online.value;
      if (on) {
        EngineSignalHub.I.mark('price', detail: 'Bitget ticker');
      } else {
        // online=false???ÅÌÉúÍ∞Ä Í≥ÑÏÜç?òÎ©¥ STALEÎ°?Î≥¥Ïù¥Í≤???      }
      setState(() {});
    };
    BitgetLiveStore.I.ticker.addListener(_liveListener!);

    _rb.load().then((_) {
      if (mounted) setState(() => _rbReady = true);
    });

    _startRealtimeCandles();
    _startAutoRefresh();
    _refresh();
  }


@override
void didChangeAppLifecycleState(AppLifecycleState state) {
  if (state == AppLifecycleState.resumed) {
    // resume ??DB/?úÎãù ?¨Ï£º??+ ?îÏßÑ ?¨Í???    Future.microtask(() async {
      final p = await _tunDao.loadOrCreate();
      TuningBus.inject(p);
      await _refresh();
    });
  }
}

  @override
  void dispose() {
    _autoRefreshTimer?.cancel();
    _candleSub?.cancel();
    _candleBus?.dispose();

    // v10 SAFE: ?§ÌÅ¨Î°??∏Ìã∞?åÏù¥???ïÎ¶¨
    _scrollCtrl.dispose();
    _scrollY.dispose();

    if (_liveListener != null) {
      BitgetLiveStore.I.ticker.removeListener(_liveListener!);
    }
    BitgetLiveStore.I.stop();

    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Duration tfInterval(String tf) {
    switch (tf) {
      case '1m':
        // 1Î∂ÑÎ¥â?Ä Ï≤¥Í∞ê??"?§ÏãúÍ∞????µÏã¨?¥Îùº ???êÏ£º Í∞±Ïã†
        return const Duration(seconds: 1);
      case '5m':
        return const Duration(seconds: 2);
      case '15m':
        return const Duration(seconds: 3);
      case '1h':
        return const Duration(seconds: 8);
      case '4h':
        return const Duration(seconds: 15);
      case '1D':
        return const Duration(seconds: 60);
      case '1W':
      case '1M':
        return const Duration(seconds: 120);
      default:
        return const Duration(seconds: 5);
    }
  }

  /// TFÎ≥ÑÎ°ú OB/FVG/BPR/Íµ¨Ï°∞ Í≥ÑÏÇ∞?????°Ìûà?ÑÎ°ù Ï∫îÎì§ ?òÎ? ?âÎÑâ?òÍ≤å ?ïÎ≥¥.
  int tfCandleLimit(String tf) {
    switch (tf) {
      case '1m':
        return 1200;
      case '5m':
        return 1000;
      case '15m':
        return 900;
      case '1h':
        return 800;
      case '4h':
        return 600;
      case '1D':
        return 520;
      case '1W':
        return 320;
      case '1M':
        // 2019-07 ~ ?ÑÏû¨(??79Î¥? Í∏∞Ï?, ?âÎÑâ?òÍ≤å
        return 220;
      default:
        return 400;
    }
  }

  void _startAutoRefresh() {
    _autoRefreshTimer?.cancel();
    // Î∂ÑÏÑù/Í≤åÏù¥ÏßÄ???àÎ¨¥ ?êÏ£º ?åÎ¶¥ ?ÑÏöî ?ÜÏùå (?§Ìä∏?åÌÅ¨/Î∞∞ÌÑ∞Î¶?Î∞©Ïñ¥)
    final d = tfInterval(tf);
    final refreshEvery = Duration(seconds: (d.inSeconds * 5).clamp(10, 120).round());
    _autoRefreshTimer = Timer.periodic(refreshEvery, (_) {
      if (!mounted) return;
      if (!enableApiSync) return;
      _refresh();
    });
  }

  void _startRealtimeCandles() {
    _candleSub?.cancel();
    _candleBus?.dispose();

    if (!enableApiSync) return;

    final repo = BitgetRealtimeCandleRepo();
    _candleBus = RealtimeBus(
      repo: repo,
      symbol: symbol,
      tf: tf,
      limit: tfCandleLimit(tf),
      interval: tfInterval(tf),
    );

    _candleSub = _candleBus!.stream.listen((list) {
      if (!mounted) return;
      EngineSignalHub.I.mark('candle', detail: '${tf} Ï∫îÎì§ ${list.length}Í∞?);
      // ?§ÏãúÍ∞?Ï∫îÎì§??FuCandleÎ°?Î≥Ä?òÌï¥??ÎØ∏ÎãàÏ∞®Ìä∏??Ï¶âÏãú Î∞òÏòÅ
      final mapped = list
          .map((c) => FuCandle(
                open: c.o,
                high: c.h,
                low: c.l,
                close: c.c,
                ts: c.t.millisecondsSinceEpoch,
                volume: c.v,
              ))
          .toList();
      final next = _engine.recalcLive(prev: _s, candles: mapped);
      setState(() {
        _s = next;
      });
      tfSnap[tf] = next; // ?ÑÏû¨ TF ?§ÎÉÖ???Ä??Îß§Îãà?Ä ?®ÎÑê/Î©Ä?∞TF ?îÏïΩ)
      tfSnapAt[tf] = DateTime.now();

    });



    _candleBus!.start();
  }

  
  Future<void> _refreshOtherTfs() async {
    // ?†ÌÉù TF???¥Î? _refresh()?êÏÑú Í∞±Ïã†??
    for (final t in tfs) {
      if (t == tf) continue;
      final lastAt = tfSnapAt[t];
      if (lastAt != null && DateTime.now().difference(lastAt).inSeconds < 12) {
        continue;
      }
      try {
        final r = await _engine.run(symbol: symbol, tf: t, allowNetwork: true);
        tfSnap[t] = r;
        tfSnapAt[t] = DateTime.now();

        // ??4H FINAL: ?êÎèô Í∏∞Î°ù/?πÌå® ?êÏ†ï(Í∞ÄÎ≤ºÏö¥ JSONL)
        if (t == '4h') {
          unawaited(TyronH4FinalTracker.I.onH4Snapshot(r));
        }

        if (mounted) {
          if (t == '4h') {
            _maybeShowH4FinalToast(NeonTheme.of(context), r);
          }
          final s = _s;
          if (_rbReady && _dt.active && s.price > 0 && _dt.entry > 0) {
            bool? win;
            final age = DateTime.now().millisecondsSinceEpoch - _dt.ts;
            final tp = (s.zoneValid > 0) ? s.zoneValid : 0.0;
            final sl = (s.zoneInvalid > 0) ? s.zoneInvalid : 0.0;
            if (tp > 0 && sl > 0) {
              if (_dt.dir == 'LONG') {
                if (s.price >= tp) win = true;
                if (s.price <= sl) win = false;
              } else if (_dt.dir == 'SHORT') {
                if (s.price <= tp) win = true;
                if (s.price >= sl) win = false;
              }
            } else {
              final atrVal = _dt.atr;
              if (atrVal > 0) {
                final move = s.price - _dt.entry;
                final th = atrVal * 0.35;
                if (_dt.dir == 'LONG') {
                  if (move >= th) win = true;
                  if (move <= -th) win = false;
                } else if (_dt.dir == 'SHORT') {
                  if (move <= -th) win = true;
                  if (move >= th) win = false;
                }
              }
            }
            if (age > const Duration(minutes: 60).inMilliseconds) {
              _dt.reset();
            } else if (win != null) {
              await _rb.recordOutcome(win: win, confidence: _dt.confidence);
              if (_activeSignalId != null) {
                await _outDao.insert(
                  signalId: _activeSignalId!,
                  tsClose: DateTime.now().millisecondsSinceEpoch,
                  result: win ? 'WIN' : 'LOSS',
                  pnl: win ? 1.0 : -1.0,
                  method: (tp > 0 && sl > 0) ? (win ? 'TP' : 'SL') : 'ATR',
                );
                await _autoTune.run();
              }
              _dt.reset();
            }
          }
          if (_rbReady && s.showSignal && (s.signalDir == 'LONG' || s.signalDir == 'SHORT') && s.price > 0) {
            final nowTs = DateTime.now().millisecondsSinceEpoch;
            if (nowTs - _lastSignalTs > 30000) {
              final entry = (s.entry > 0) ? s.entry : s.price;
              final slVal = (s.stop > 0) ? s.stop : (s.signalDir == 'LONG' ? entry * 0.99 : entry * 1.01);
              final tpVal = (s.target > 0) ? s.target : (s.signalDir == 'LONG' ? entry * 1.02 : entry * 0.98);
              final rr = (s.rr.isFinite ? s.rr : 1.0);
              final lev = (s.leverage > 0 ? s.leverage : 1.0);
              final row = SignalRow(
                ts: nowTs,
                symbol: s.symbol,
                tf: s.tfLabel,
                dir: s.signalDir,
                confidence: s.confidence.round().clamp(0, 100),
                entry: entry,
                sl: slVal,
                tp: tpVal,
                rr: rr,
                leverage: lev,
                supLow: s.reactLow > 0 ? s.reactLow : null,
                supHigh: s.reactHigh > 0 ? s.reactHigh : null,
                supProb: s.reactionSupportProb,
                resLow: s.resistLow > 0 ? s.resistLow : null,
                resHigh: s.resistHigh > 0 ? s.resistHigh : null,
                resProb: s.reactionResistProb,
                reason: s.finalDecisionReason,
              );
              _activeSignalId = await _sigDao.insert(row);
              _lastSignalTs = nowTs;
            }
            final atrVal = _approxAtr(s);
            _dt.start(dir: s.signalDir, entry: (s.entry > 0) ? s.entry : s.price, atr: atrVal, confidence: s.confidence.round().clamp(0, 100));
          }
          if (_rbReady && !_rb.forceDecisionOn) {
            _s = _s.copyWith(showSignal: false, decisionTitle: 'WATCH', finalDecisionReason: 'Í∞ïÏ†úÍ≤∞Ï†ï OFF');
          }
          if (_rbReady && _rb.brakeOn && _rb.inCooldown) {
            final until = DateTime.fromMillisecondsSinceEpoch(_rb.cooldownUntilMs);
            _s = _s.copyWith(
              locked: true,
              lockedReason: 'NO-TRADE(?∞ÏÜç?êÏã§) ¬∑ ${until.hour.toString().padLeft(2, '0')}:${until.minute.toString().padLeft(2, '0')}ÍπåÏ?',
              showSignal: false,
              decisionTitle: 'NO-TRADE',
              finalDecisionReason: '?∞ÏÜç ?êÏã§Î°??êÎèô Ï∞®Îã®(Ïø®Îã§??',
            );
          } else if (_rbReady && _rb.brakeOn && _rb.lossStreak >= 3) {
            _s = _s.copyWith(recommendR: 0.25, finalDecisionReason: 'Î∏åÎ†à?¥ÌÅ¨: 3?∞Ìå® ??R 0.25 Í≥†Ï†ï ¬∑ ' + _s.finalDecisionReason);
          }
          setState(() {});
        }
      } catch (_) {
        // Ï°∞Ïö©??Î¨¥Ïãú(?§Ìä∏?åÌÅ¨/?åÏã±)
      }
    }
  }

Future<void> _refresh() async {
    if (_loading) return;
    setState(() => _loading = true);
    try {
      final st = await _engine.fetch(
        symbol: symbol,
        tf: tf,
        allowNetwork: enableApiSync,
        safeMode: safeMode,
      );

      EngineSignalHub.I.mark('analysis', detail: 'FuEngine fetch OK');

      // NO-TRADE ?ÅÏö©
      final locked = enableNoTradeLock ? st.locked : false;
      final lockedReason = enableNoTradeLock ? st.lockedReason : '';

      final prev = _s;
      final lp = livePrice;
      final mergedPrice = (lp > 0) ? lp : st.price;

      // ???§ÏãúÍ∞??§Ìä∏Î¶??§ÌÜ†Î¶¨ÌîÑ?àÏãúÍ∞Ä Í≤πÏπ† ?? "Ï°?FVG/OB ??"??ÎπÑÏõåÏß??§ÎÉÖ?∑Ïù¥ ?§Ïñ¥?§Î©¥
      // Í∏∞Ï°¥ Ï°¥ÏùÑ ?†Ï??¥ÏÑú "Î≥¥Ï??§Í? ?¨ÎùºÏß? ?ÑÏÉÅ??ÎßâÎäî??
      FuState st2 = st.copyWith(
        price: mergedPrice,
        locked: locked,
        lockedReason: lockedReason,
      );

      st2 = st2.copyWith(
        // Ï°¥Ï? ?ÑÏ†Å/?†Ï?(ÎπÑÏñ¥?àÏúºÎ©?prev ?†Ï?)
        fvgZones: st2.fvgZones.isNotEmpty ? st2.fvgZones : prev.fvgZones,
        obZones: st2.obZones.isNotEmpty ? st2.obZones : prev.obZones,
        bprZones: st2.bprZones.isNotEmpty ? st2.bprZones : prev.bprZones,
        mbZones: st2.mbZones.isNotEmpty ? st2.mbZones : prev.mbZones,

        // Íµ¨Ï°∞/Î∞òÏùë Íµ¨Í∞Ñ??Í∞ÑÌóê??0?ºÎ°ú ?®Ïñ¥ÏßÄÎ©?prev ?†Ï?
        structureTag: (st2.structureTag.isNotEmpty && st2.structureTag != 'NONE') ? st2.structureTag : prev.structureTag,
        breakLevel: (st2.breakLevel > 0) ? st2.breakLevel : prev.breakLevel,
        reactLevel: (st2.reactLevel > 0) ? st2.reactLevel : prev.reactLevel,
        reactLow: (st2.reactLow > 0) ? st2.reactLow : prev.reactLow,
        reactHigh: (st2.reactHigh > 0) ? st2.reactHigh : prev.reactHigh,
      );

      // ?®ÌÑ¥ ?§Î≤Ñ?àÏù¥Í∞Ä ÏºúÏ†∏?àÎã§Î©??®ÌÑ¥ ?†Ìò∏???êÎì±
      if (_patternLabel.trim().isNotEmpty || _patternLines.isNotEmpty) {
        EngineSignalHub.I.mark('pattern', detail: _patternLabel.isEmpty ? 'overlay on' : _patternLabel);
      }

      if (mounted) {
        setState(() {
          _s = st2;
          tfSnap[tf] = st2;
          tfSnapAt[tf] = DateTime.now();
        });

        // ?†Ìò∏Í∞Ä ?ïÏ†ï(4/5 ?©Ïùò + ROI Í≤åÏù¥?????ºÎ°ú Î∞îÎÄåÎäî ?úÍ∞Ñ???ÅÎã® ?åÎ¶º?ºÎ°ú ?∏Ï∂ú
        _maybeShowSignalToast(NeonTheme.of(context), st2);
        // ?ïÏ†ï ??"?Ä??Íµ¨Í∞Ñ" ?ÑÎã¨ ?åÎ¶º(Ï§ÄÎπ??®Í≥Ñ)
        _maybeShowApproachToast(NeonTheme.of(context), st2);

        // ?®ÌÑ¥ ?†ÌÉù???ÄÍ∏?Ï§ëÏù¥Î©??§Î•∏ TFÎ°??¥Îèô ?¨Ìï®) ÏµúÏã† Ï∫îÎì§ Í∏∞Ï??ºÎ°ú ?ëÎèÑ Í∞±Ïã†
        _applyPendingPatternIfAny(st2);
      }

      // Update other TF snapshots (throttled) so the user can see 5m/1h/4h/1D/1W/1M signals while staying on one TF.
      _refreshOtherTfs();

      if (enableLogging) {
        FuLogStore.append(st2);
        // SQLite: ?†Ìò∏/Í≤∞Í≥º/?êÏú®Î≥¥Ï†ï ?êÎèô Í∏∞Î°ù
        unawaited(SqliteTradeRecorder.I.onState(st2));
      }
    } catch (_) {
      // keep last state
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _srNote(FuState s) {
    if (s.locked) return 'Í±∞ÎûòÍ∏àÏ?';
    final range = (s.r1 - s.s1).abs().clamp(1.0, 1e18);
    final distToS = (s.price - s.s1).clamp(0.0, range);
    final distToR = (s.r1 - s.price).clamp(0.0, range);

    final base = (0.55 * s.confidence + 0.45 * s.score);
    final riskPenalty = (s.risk * 0.35);

    double hold = base - riskPenalty + (1 - (distToS / range)) * 18;
    double brk = base - riskPenalty + (1 - (distToR / range)) * 18;

    // NOTE: ?ÑÎ°ú?ùÌä∏ÎßàÎã§ signalDir ?Ä?ÖÏù¥ enum/String ?±ÏúºÎ°??¨ÎùºÏß????àÏñ¥??    // (SignalDir enum ÎØ∏Ï°¥?¨Î°ú Ïª¥Ìåå???êÎü¨Í∞Ä ?òÎäî Í≤ΩÏö∞Í∞Ä ?àÏùå)
    // Î¨∏Ïûê??Í∏∞Î∞ò?ºÎ°ú ?àÏ†Ñ?òÍ≤å ?êÎ≥Ñ?úÎã§.
    final dirStr = (s.signalDir).toString().toLowerCase();
    if (dirStr.contains('long')) {
      hold += 6;
      brk += 10;
    } else if (dirStr.contains('short')) {
      hold -= 6;
      brk -= 10;
    }

    final holdPct = hold.clamp(0, 100).round();
    final brkPct = brk.clamp(0, 100).round();
    return 'ÏßÄÏßÄÎ∞©Ïñ¥ $holdPct% ¬∑ ?åÌåå $brkPct%';
  }

  /// ÎØ∏ÎãàÏ∞®Ìä∏ Î∞©Ìñ•(?∏Ìñ•) ?çÏä§??- Ï¥àÎ≥¥??Î∞îÎ°ú ?¥Ìï¥?òÎäî ?úÍ?
  /// signalDir ?Ä?ÖÏù¥ int/enum/string ?¥Îñ§ ?ïÌÉú?¨ÎèÑ ?àÏ†Ñ?òÍ≤å ?ôÏûë
  String _biasText(dynamic signalDir) {
    final v = signalDir;
    if (v is num) {
      if (v > 0) return '?ÅÏäπ';
      if (v < 0) return '?òÎùΩ';
      return 'Ï§ëÎ¶Ω';
    }
    final s = v.toString().toLowerCase();
    if (s.contains('long') || s.contains('up') || s.contains('bull')) return '?ÅÏäπ';
    if (s.contains('short') || s.contains('down') || s.contains('bear')) return '?òÎùΩ';
    return 'Ï§ëÎ¶Ω';
  }

  // =========================
  // Flow Radar Í≥ÑÏÇ∞ (50/100 Í≥†Ï†ï Î∞©Ï?)
  // - ?îÏßÑ Í∞íÏù¥ ÎπÑÏñ¥?àÏúºÎ©?score/confidence/risk/evidence/signalDirÎ°??ÄÏ≤??∞Ï∂ú
  // =========================
  Map<String, int> _calcFlowRadar(FuState s) {
    int clampInt(num v) => (v.isNaN ? 0 : v.round()).clamp(0, 100);

    // 1) ?êÏ≤úÍ∞??îÏßÑ?êÏÑú ?§Ïñ¥?§Î©¥ ?∞ÏÑ† ?¨Ïö©)
    final int buyRaw = clampInt(s.tapeBuyPct);
    final int obRaw = clampInt(s.obImbalance);
    final int absRaw = clampInt(s.absorptionScore);
    final int instRaw = clampInt(s.instBias);
    final int whaleRaw = clampInt(s.whaleScore);
    final int whaleBuyRaw = clampInt(s.whaleBuyPct);
    final int sweepRaw = clampInt(s.sweepRisk);

    // Í∞íÏù¥ ?úÏùòÎØ∏ÏûàÍ≤??§Ïñ¥??Í≤É‚ÄùÏúºÎ°??êÎã®??ÏµúÏÜå Ï°∞Í±¥
    bool hasReal =
        (buyRaw != 0 && buyRaw != 50) ||
        (obRaw != 0 && obRaw != 50) ||
        (absRaw != 0 && absRaw != 50) ||
        (instRaw != 0 && instRaw != 50) ||
        (whaleRaw != 0 && whaleRaw != 50) ||
        (whaleBuyRaw != 0 && whaleBuyRaw != 50) ||
        (sweepRaw != 0 && sweepRaw != 50);

    // 2) ?§Îç∞?¥ÌÑ∞Í∞Ä ?ÜÏúºÎ©? UI???úÎ?Ï≤?Í≥ÑÏÇ∞??    final double evRatio = (s.evidenceTotal <= 0)
        ? 0.0
        : (s.evidenceHit / s.evidenceTotal).clamp(0.0, 1.0).toDouble();
    final double conf = (s.confidence / 100.0).clamp(0.0, 1.0).toDouble();
    final double score = (s.score / 100.0).clamp(0.0, 1.0).toDouble();
    final double risk = (s.risk / 100.0).clamp(0.0, 1.0).toDouble();

    int dirBias = 0;
    final dirStr = s.signalDir.toString().toLowerCase();
    if (dirStr.contains('long') || dirStr.contains('up') || dirStr.contains('bull')) dirBias = 12;
    if (dirStr.contains('short') || dirStr.contains('down') || dirStr.contains('bear')) dirBias = -12;

    final int buyFallback = clampInt(
      (55 * conf) + (35 * score) + (20 * evRatio) - (40 * risk) + dirBias + 10,
    );
    final int sellFallback = (100 - buyFallback).clamp(0, 100);

    final int obFallback = clampInt(
      50 + dirBias + (25 * evRatio) + (15 * conf) - (10 * risk),
    );

    final int absFallback = clampInt(
      (40 * conf) + (35 * evRatio) + (15 * score) - (25 * risk) + 10,
    );

    final int instFallback = clampInt(
      50 + dirBias + (25 * conf) + (20 * score) - (10 * risk),
    );

    final int whaleFallback = clampInt(
      (30 * conf) + (30 * evRatio) + (20 * score) - (15 * risk) + 15,
    );

    final int whaleBuyFallback = clampInt(
      (buyFallback * 0.7) + (15 * evRatio),
    );

    final int sweepFallback = clampInt(
      (70 * risk) + (25 * (1.0 - evRatio)) + 5,
    );

    final int buy = hasReal ? (buyRaw == 0 ? buyFallback : buyRaw) : buyFallback;
    final int sell = hasReal ? (100 - buy).clamp(0, 100) : sellFallback;
    final int ob = hasReal ? (obRaw == 0 ? obFallback : obRaw) : obFallback;
    final int absorption = hasReal ? (absRaw == 0 ? absFallback : absRaw) : absFallback;
    final int inst = hasReal ? (instRaw == 0 ? instFallback : instRaw) : instFallback;
    final int whale = hasReal ? (whaleRaw == 0 ? whaleFallback : whaleRaw) : whaleFallback;
    final int whaleBuy = hasReal ? (whaleBuyRaw == 0 ? whaleBuyFallback : whaleBuyRaw) : whaleBuyFallback;
    final int sweep = hasReal ? (sweepRaw == 0 ? sweepFallback : sweepRaw) : sweepFallback;

    return {
      'buy': buy,
      'sell': sell,
      'ob': ob,
      'abs': absorption,
      'inst': inst,
      'whale': whale,
      'whaleBuy': whaleBuy,
      'sweep': sweep,
    };
  }

  // =========================
  // ?µÌï© Î∞©Ìñ• ?êÏàò(0~100) + Ï¥àÎ≥¥ ?úÏ§Ñ ?îÏïΩ
  // - Flow Radar + Í∑ºÍ±∞?©Ïùò + ?†Î¢∞/?ÑÌóò???òÎÇòÎ°??ïÏ∂ï
  // =========================
  int _directionScore(FuState s, Map<String, int> radar) {
    double clamp01(double v) => v.clamp(0.0, 1.0).toDouble();
    final ev = (s.evidenceTotal <= 0)
        ? 0.0
        : (s.evidenceHit / s.evidenceTotal).clamp(0.0, 1.0).toDouble();
    final conf = clamp01(s.confidence / 100.0);
    final risk = clamp01(s.risk / 100.0);

    final buy = (radar['buy'] ?? 50).toDouble();
    final sell = (radar['sell'] ?? 50).toDouble();
    final inst = (radar['inst'] ?? 50).toDouble();
    final whale = (radar['whale'] ?? 50).toDouble();
    final ob = (radar['ob'] ?? 50).toDouble();

    // Í∏∞Î≥∏ 50?êÏÑú ?úÏûë??Í∞ÄÏ§ëÏπòÎ°??¥Îèô
    double score = 50.0;
    score += (buy - sell) * 0.22;        // Ï≤¥Í≤∞/??Î∞©Ìñ•
    score += (inst - 50.0) * 0.16;       // ?∞ÏÜê Î∞©Ìñ•
    score += (whale - 50.0) * 0.14;      // Í≥†Îûò ?ÅÌñ•
    score += (ob - 50.0) * 0.10;         // ?∏Í? ?†Î¶º
    score += ev * 16.0;                  // Í∑ºÍ±∞ ?©Ïùò
    score += (conf - 0.5) * 18.0;        // ?†Î¢∞
    score -= risk * 28.0;                // ?ÑÌóò

    if (s.locked) score -= 12.0;         // LOCK?¥Î©¥ Ï∂îÍ? Í∞êÏ†ê
    return score.round().clamp(0, 100);
  }

  String _dirKoFromScore(int ds) {
    if (ds >= 62) return '?ÅÏäπ ?∞ÏúÑ';
    if (ds <= 38) return '?òÎùΩ ?∞ÏúÑ';
    return 'Í¥ÄÎß?;
  }

  String _oneLineWhy(FuState s, Map<String, int> radar, int ds) {
    if (s.locked && s.lockedReason.isNotEmpty) return s.lockedReason;
    // radar Í∏∞Î∞ò ?úÏ§Ñ
    final buy = radar['buy'] ?? 50;
    final inst = radar['inst'] ?? 50;
    final whale = radar['whale'] ?? 50;
    final sweep = radar['sweep'] ?? 50;
    final ev = (s.evidenceTotal <= 0) ? 0 : ((s.evidenceHit * 100) ~/ s.evidenceTotal);

    final parts = <String>[];
    parts.add('Í∑ºÍ±∞ ${s.evidenceHit}/${s.evidenceTotal}(${ev}%)');
    if (ds >= 62) {
      if (buy >= 55) parts.add('Îß§Ïàò ??);
      if (inst >= 58) parts.add('?∞ÏÜê ??);
      if (whale >= 62) parts.add('Í≥†Îûò ??);
    } else if (ds <= 38) {
      if (buy <= 45) parts.add('Îß§ÎèÑ ?∞ÏÑ∏');
      if (inst <= 42) parts.add('?∞ÏÜê ??);
      if (whale <= 45) parts.add('Í≥†Îûò ??);
    } else {
      parts.add('Î∞©Ìñ• Î∂àÌôï??);
    }

    if (sweep >= 70) parts.add('?∏Î¶ºÏ£ºÏùò');
    if (s.expectedRoiPct < 25) parts.add('25%Ï°∞Í±¥ ÎØ∏Îã¨');

    return parts.take(4).join(' ¬∑ ');
  }

  Widget _decisionBriefCard(NeonTheme t, FuState s, Map<String, int> radar, int ds, double livePrice) {
    final dir = _dirKoFromScore(ds);
    final why = _oneLineWhy(s, radar, ds);
    final double ev = (s.evidenceTotal <= 0) ? 0.0 : (s.evidenceHit / s.evidenceTotal).clamp(0.0, 1.0).toDouble();
    Color c;
    if (s.locked) {
      c = t.bad;
    } else if (ds >= 62) {
      c = t.good;
    } else if (ds <= 38) {
      c = t.bad;
    } else {
      c = t.warn;
    }

    final status = s.locked
        ? 'LOCK'
        : (s.showSignal
            ? (s.signalGrade.toUpperCase().contains('STRONG') ? 'STRONG' : 'WEAK')
            : 'WATCH');

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: t.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: t.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text('?µÌï© Î∏åÎ¶¨??, style: TextStyle(color: t.fg, fontSize: 12, fontWeight: FontWeight.w900)),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: c.withOpacity(0.14),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: c.withOpacity(0.55)),
                ),
                child: Text('$status ¬∑ $dir', style: TextStyle(color: c, fontSize: 11, fontWeight: FontWeight.w900)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Text('Î∞©Ìñ•?êÏàò ', style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w800)),
              Text('$ds/100', style: TextStyle(color: t.fg, fontSize: 12, fontWeight: FontWeight.w900)),
              const SizedBox(width: 10),
              Text('?©Ïùò ${(ev * 100).round()}%', style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w800)),
              const Spacer(),
              Text('?ÑÏû¨Í∞Ä ${livePrice.toStringAsFixed(1)}', style: TextStyle(color: t.fg, fontSize: 11, fontWeight: FontWeight.w900)),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 0.0, end: ds / 100.0),
              duration: const Duration(milliseconds: 650),
              curve: Curves.easeOutCubic,
              builder: (context, v, _) {
                return Container(
                  height: 10,
                  color: t.border.withOpacity(0.45),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: FractionallySizedBox(
                      widthFactor: v.clamp(0.0, 1.0).toDouble(),
                      child: Container(color: c.withOpacity(0.95)),
                    ),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 8),
          Text(why, style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w800, height: 1.15)),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(child: Text('ÏßÄÏßÄ ${s.s1.toStringAsFixed(1)}', style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w800))),
              Expanded(child: Text('VWAP ${s.vwap.toStringAsFixed(1)}', textAlign: TextAlign.center, style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w800))),
              Expanded(child: Text('?Ä??${s.r1.toStringAsFixed(1)}', textAlign: TextAlign.right, style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w800))),
            ],
          ),
        ],
      ),
    );
  }

  /// Íµ¨Ï°∞(CHOCH/BOS) ?åÌåå/?¥ÌÉà ??"?¥Îîî?êÏÑú Î∞òÏùë?¥Ïïº ?òÎäîÏßÄ"Î•??´Ïûê ?†Î°ú Í≥†Ï†ï ?úÏãú
  /// - RANGEÎ©??®Í?
  Widget _reactionBand(NeonTheme t, FuState s) {
    final tag = s.structureTag.toUpperCase();
    if (tag == 'RANGE' || s.reactLow <= 0 || s.reactHigh <= 0) {
      return const SizedBox.shrink();
    }

    final bool isUp = tag.contains('UP');
    final Color c = isUp ? t.good : t.bad;
    final rs = ReactionStrengthEngine.build(s);
    final title = tag.startsWith('CHOCH') ? 'Íµ¨Ï°∞?ÑÌôò(CHOCH)' : 'Íµ¨Ï°∞?åÌåå/?¥ÌÉà(BOS)';
    final action = isUp ? '?òÎèåÎ¶ºÏóê????Íµ¨Í∞Ñ ÏßÄÏßÄÎ©?LONG ?†Î¶¨' : '?òÎèåÎ¶ºÏóê????Íµ¨Í∞Ñ ?Ä??ù¥Î©?SHORT ?†Î¶¨';

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: t.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: t.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text('Î∞òÏùëÍµ¨Í∞Ñ', style: TextStyle(color: t.fg, fontSize: 12, fontWeight: FontWeight.w900)),
              const Spacer(),
              // Í∞ïÎèÑ(??Ï§?Í∞??ïÏ†ïÍ∏?
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: t.border.withOpacity(0.35),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: t.border),
                ),
                child: Text('${rs.gradeKo} ${rs.score}%', style: TextStyle(color: t.fg, fontSize: 11, fontWeight: FontWeight.w900)),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: c.withOpacity(0.14),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: c.withOpacity(0.55)),
                ),
                child: Text(tag, style: TextStyle(color: c, fontSize: 11, fontWeight: FontWeight.w900)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(title, style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: Container(
              height: 12,
              color: t.border.withOpacity(0.45),
              child: Align(
                alignment: Alignment.centerLeft,
                child: FractionallySizedBox(
                  widthFactor: 1,
                  child: Container(color: c.withOpacity(0.9)),
                ),
              ),
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Text('${s.reactLow.toStringAsFixed(1)}', style: TextStyle(color: t.fg, fontSize: 11, fontWeight: FontWeight.w900)),
              const Spacer(),
              Text('Î∞òÏùëÍ∞ÄÍ≤?${s.reactLevel.toStringAsFixed(1)}', style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w800)),
              const Spacer(),
              Text('${s.reactHigh.toStringAsFixed(1)}', style: TextStyle(color: t.fg, fontSize: 11, fontWeight: FontWeight.w900)),
            ],
          ),
          const SizedBox(height: 6),
          Text(action, style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w800, height: 1.15)),
          const SizedBox(height: 6),
          // ?¥ÎîîÍπåÏ?(Î™©Ìëú)
          if (rs.targets.isNotEmpty && rs.targets[0] > 0) ...[
            Text(
              isUp
                  ? 'Î∞òÎì± Î™©Ìëú ${rs.targets[0].toStringAsFixed(1)} / ${rs.targets[1].toStringAsFixed(1)} / ${rs.targets[2].toStringAsFixed(1)}'
                  : '?åÎ¶º Î™©Ìëú ${rs.targets[0].toStringAsFixed(1)} / ${rs.targets[1].toStringAsFixed(1)} / ${rs.targets[2].toStringAsFixed(1)}',
              style: TextStyle(color: t.fg, fontSize: 11, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 2),
            Text(rs.hint, style: TextStyle(color: t.muted, fontSize: 10.5, fontWeight: FontWeight.w800)),
          ],
        ],
      ),
    );
  }

  /// TYRON ???úÍ∑∏?? ?•Î?Î¥?Í∏∞Ï? ?§Ïùå 1/3/5Î¥??ÅÏäπ ?ïÎ•†. LONG/SHORT/WAIT + %.
  _TyronQuickRes _tyronQuick(List<FuCandle> cs) {
    try {
      if (cs.length < 40) return const _TyronQuickRes('WAIT', 50, Color(0xFFFFC04D)); // WAIT amber

      double tr(FuCandle c, double prevClose) {
        final a = c.high - c.low;
        final b = (c.high - prevClose).abs();
        final d = (c.low - prevClose).abs();
        return [a, b, d].reduce((x, y) => x > y ? x : y);
      }

      double atrAt(int idx, {int period = 14}) {
        final start = (idx - period + 1).clamp(1, idx);
        double sum = 0;
        int n = 0;
        for (int i = start; i <= idx; i++) {
          sum += tr(cs[i], cs[i - 1].close);
          n++;
        }
        return n == 0 ? 0 : sum / n;
      }

      const bigTh = 1.2;
      int samples = 0, up1 = 0, up3 = 0, up5 = 0;

      for (int i = 20; i < cs.length - 6; i++) {
        final c = cs[i];
        final a = atrAt(i);
        if (a <= 0) continue;
        final b = (c.close - c.open).abs();
        if (b < bigTh * a) continue;

        samples++;
        if (cs[i + 1].close > c.close) up1++;
        if (cs[i + 3].close > c.close) up3++;
        if (cs[i + 5].close > c.close) up5++;
      }

      double p(int up) => samples == 0 ? 0.5 : up / samples;
      final avgUp = (p(up1) + p(up3) + p(up5)) / 3.0;
      final int pctUp = (avgUp * 100).round().clamp(0, 100);

      if (avgUp >= 0.62) return _TyronQuickRes('LONG', pctUp, const Color(0xFF7CFFB2));
      if (avgUp <= 0.38) return _TyronQuickRes('SHORT', (100 - pctUp).clamp(0, 100), const Color(0xFFFF5C7A));
      return const _TyronQuickRes('WAIT', 50, Color(0xFFFFC04D)); // WAIT amber
    } catch (_) {
      return const _TyronQuickRes('WAIT', 50, Color(0xFFFFC04D)); // WAIT amber
    }
  }

  void _openHelp() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => HelpSheetV1(
        symbol: symbol,
        tf: tf,
        safeMode: safeMode,
        lastError: null,
      ),
    );
  }

  
void _openTyronBoltSheet(BuildContext context) {
    if (!mounted) return;
    final theme = NeonTheme.of(context);

    // ??FINAL?Ä 4?úÍ∞Ñ(4h) Í∏∞Ï??ºÎ°ú Í≥ÑÏÇ∞
    final FuState src = tfSnap['4h'] ?? _s;

    // FuCandle ??rt.Candle (TyronProEngine / _atr14 / _structureStop use data Candle)
    final rtCandles = src.candles.map((fc) => rt.Candle(
      t: DateTime.fromMillisecondsSinceEpoch(fc.ts),
      o: fc.open,
      h: fc.high,
      l: fc.low,
      c: fc.close,
      v: fc.volume,
    )).toList();

    // ??Tyron PRO decision (LONG/SHORT/NO TRADE + ?ïÏã§%)
    final pro = TyronProEngine.analyze(rtCandles);
    int confirm = pro.confidence;
    String decision = pro.bias; // LONG/SHORT/NEUTRAL
    if (decision == 'NEUTRAL') decision = 'NO TRADE';
    if (confirm < AppSettings.signalMinProb) decision = 'NO TRADE';

    // Ï¥àÎ≥¥???®Ïñ¥
    String decisionKo(String d) {
      final u = d.toUpperCase();
      if (u == 'LONG') return '?§Î•¥??Ï™?;
      if (u == 'SHORT') return '?¥Î¶¨??Ï™?;
      return '?¨Í∏∞';
    }

    Color c = const Color(0xFF9CA3AF);
    if (decision == 'LONG') c = const Color(0xFF3BC6FF);
    if (decision == 'SHORT') c = const Color(0xFFFF4D6D);

    // ??TradePlan (entry/sl/tp/size/lev) : Íµ¨Ï°∞(?§Ïúô) Í∏∞Î∞ò + Î¶¨Ïä§??Í≥†Ï†ï
    final last = rtCandles.isNotEmpty ? rtCandles.last : null;
    final entry = (last?.c ?? 0.0);
    final atr = _atr14(rtCandles);
    final stop = _structureStop(rtCandles, decision, entry, atr);
    final stopDist = (entry - stop).abs();
    final stopPct = (entry > 0) ? (stopDist / entry * 100.0) : 0.0;

    final riskUsd = AppSettings.accountUsdt * (AppSettings.riskPct / 100.0);
    final qty = (stopDist > 0) ? (riskUsd / stopDist) : 0.0; // BTC ?òÎüâ(Í∑ºÏÇ¨)
    final notional = qty * entry;
    double lev = (AppSettings.accountUsdt > 0) ? (notional / AppSettings.accountUsdt) : 0.0;
    if (AppSettings.leverageOverride > 0) lev = AppSettings.leverageOverride;
    lev = lev.clamp(0.0, AppSettings.leverageCap);

    final tp = _targetByRR(decision, entry, stop, rr: 2.0);

    // ?úÏãú??Í∑ºÍ±∞(ÏµúÎ? 4Ï§?
    final reasons = pro.reasons.take(4).toList();

    showModalBottomSheet(
      context: context,
      backgroundColor: theme.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Icon(Icons.bolt, color: c, size: 18),
                  const SizedBox(width: 8),
                  Text('?ïÏ†ï ?†Ìò∏(4?úÍ∞Ñ)', style: TextStyle(color: theme.fg, fontSize: 16, fontWeight: FontWeight.w900)),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: c.withOpacity(0.14),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: c.withOpacity(0.55)),
                    ),
                    child: Text('${decisionKo(decision)} ¬∑ $confirm%', style: TextStyle(color: c, fontWeight: FontWeight.w900)),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Plan card
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.28),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: c.withOpacity(0.35)),
                ),
                child: Column(
                  children: [
                    _planRow(theme, 'ÏßÑÏûÖÍ∞?, entry),
                    _planRow(theme, '?êÏ†àÍ∞?, stop),
                    _planRow(theme, '?µÏ†àÍ∞?, tp),
                    const Divider(height: 16, color: Color(0x22FFFFFF)),
                    Row(
                      children: [
                        Expanded(child: Text('?êÏ†à??, style: TextStyle(color: theme.muted, fontSize: 11, fontWeight: FontWeight.w900))),
                        Text('${stopPct.toStringAsFixed(2)}%', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Expanded(child: Text('?òÎüâ', style: TextStyle(color: theme.muted, fontSize: 11, fontWeight: FontWeight.w900))),
                        Text('${qty.toStringAsFixed(3)} BTC', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Expanded(child: Text('?àÎ≤Ñ', style: TextStyle(color: theme.muted, fontSize: 11, fontWeight: FontWeight.w900))),
                        Text('${lev.toStringAsFixed(2)}x', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Expanded(child: Text('?ÑÌóò', style: TextStyle(color: theme.muted, fontSize: 11, fontWeight: FontWeight.w900))),
                        Text('${AppSettings.riskPct.toStringAsFixed(1)}%', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
                      ],
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 10),
              Text('Í∑ºÍ±∞', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
              const SizedBox(height: 6),
              ...reasons.map((e) => Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text('??$e', style: TextStyle(color: theme.muted, fontSize: 12)),
                  )),
              const SizedBox(height: 8),
              Text('??4?úÍ∞Ñ Î¥?ÎßàÍ∞ê Í∏∞Ï? ?êÎèô Í≥ÑÏÇ∞(?êÏ†à/?µÏ†à/?àÎ≤Ñ ?êÎèô).', style: TextStyle(color: theme.muted, fontSize: 11)),
            ],
          ),
        ),
      ),
    );
  }

  // ===== TYRON helper =====
  double _atr14(List<rt.Candle> c) {
    if (c.length < 16) return 0.0;
    const len = 14;
    double sum = 0.0;
    for (int i = c.length - len; i < c.length; i++) {
      final cur = c[i];
      final prevClose = c[i - 1].c;
      final tr = math.max(cur.h - cur.l, math.max((cur.h - prevClose).abs(), (cur.l - prevClose).abs()));
      sum += tr;
    }
    return sum / len;
  }

  double _structureStop(List<rt.Candle> c, String decision, double entry, double atr) {
    if (c.isEmpty || entry <= 0) return entry;
    final lookback = math.min(40, c.length);
    if (decision == 'LONG') {
      double lo = double.infinity;
      for (int i = c.length - lookback; i < c.length; i++) {
        lo = math.min(lo, c[i].l);
      }
      // ?àÎ¨¥ ?Ä?¥Ìä∏?òÎ©¥ ATR Í∏∞Ï? ?ÑÌôî
      if (atr > 0 && (entry - lo) < atr * 0.55) lo = entry - atr * 0.55;
      return lo.isFinite ? lo : entry;
    }
    if (decision == 'SHORT') {
      double hi = -double.infinity;
      for (int i = c.length - lookback; i < c.length; i++) {
        hi = math.max(hi, c[i].h);
      }
      if (atr > 0 && (hi - entry) < atr * 0.55) hi = entry + atr * 0.55;
      return hi.isFinite ? hi : entry;
    }
    return entry;
  }

  double _targetByRR(String decision, double entry, double stop, {double rr = 2.0}) {
    final dist = (entry - stop).abs();
    if (dist <= 0) return entry;
    if (decision == 'LONG') return entry + dist * rr;
    if (decision == 'SHORT') return entry - dist * rr;
    return entry;
  }

  Widget _planRow(NeonTheme theme, String label, double v) {
    return Row(
      children: [
        Expanded(child: Text(label, style: TextStyle(color: theme.muted, fontSize: 11, fontWeight: FontWeight.w900))),
        Text(v.isFinite ? v.toStringAsFixed(0) : '-', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
      ],
    );
  }
void _openSettings() {
    final theme = NeonTheme.of(context);
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: theme.card,
        title: Text('?§Ï†ï', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SwitchListTile(
              value: safeMode,
              onChanged: (v) => setState(() => safeMode = v),
              title: Text('SAFE Î™®Îìú', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
              subtitle: Text('Î≥¥Ïàò?ÅÏúºÎ°??êÎã®(Ï¥àÎ≥¥??', style: TextStyle(color: theme.muted)),
            ),
            SwitchListTile(
              value: enableApiSync,
              onChanged: (v) => setState(() => enableApiSync = v),
              title: Text('?§ÏãúÍ∞?Í∞ÄÍ≤?, style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
              subtitle: Text('Í∞Ä?•ÌïòÎ©?Í±∞Îûò??Í∞ÄÍ≤??¨Ïö©', style: TextStyle(color: theme.muted)),
            ),
            SwitchListTile(
              value: enableLogging,
              onChanged: (v) => setState(() => enableLogging = v),
              title: Text('Í∏∞Î°ù ?Ä??, style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
              subtitle: Text('?†Ìò∏/?êÎã® Î°úÍ∑∏ ?Ä??, style: TextStyle(color: theme.muted)),
            ),
            SwitchListTile(
              value: enableNoTradeLock,
              onChanged: (v) => setState(() => enableNoTradeLock = v),
              title: Text('Í±∞ÎûòÍ∏àÏ? ?†Í∏à', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
              subtitle: Text('Ï°∞Í±¥ ?òÏÅòÎ©??úÍ?Îß?Í±∞ÎûòÍ∏àÏ???, style: TextStyle(color: theme.muted)),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Text('FX ??Î™®Îìú', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
                const Spacer(),
                Switch(
                  value: FxConfig.showMode,
                  onChanged: (v) => setState(() => FxConfig.showMode = v),
                ),
              ],
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text('?´Í∏∞', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(context).pop();
              _refresh();
            },
            child: Text('?ÅÏö©/?àÎ°úÍ≥†Ïπ®', style: TextStyle(color: theme.good, fontWeight: FontWeight.w900)),
          ),
        ],
      ),
    );
  }



  


  // v10.2 SAFE: "ÏßÑÏûÖ Ï∞?ENTRY WINDOW)" Î∞∞ÎÑà
  // - Sliver Íµ¨Ï°∞Î•?Í±¥ÎìúÎ¶¨Ï? ?äÍ≥† ÎØ∏ÎãàÏ∞®Ìä∏(Stack) ?ÑÏóêÎß??πÎäî??
  // - FuState???ÜÎäî ?ÑÎìú(inReaction ?????¨Ïö©?òÏ? ?äÎäî??
  Widget _entryWindowBanner(NeonTheme t, FuState s) {
    final String dir = (s.signalDir).toString();
    final bool isLong = dir == 'LONG';
    final bool isShort = dir == 'SHORT';

    // Î∞òÏùëÍµ¨Í∞Ñ ?êÎã®(?ÑÏû¨ TF): reactLevel ?êÎäî reactLow~HighÍ∞Ä ?†Ìö®?òÎ©¥ "Î∞òÏùë Ï§??ºÎ°ú Í∞ÑÏ£º
    final bool hasReact = (s.reactLevel != 0) || (s.reactLow != 0 && s.reactHigh != 0);

    // ÏßÑÏûÖ Ï∞??§Ìîà Ï°∞Í±¥: ?îÏßÑ ?ïÏ†ï(showSignal) + ?†Í∏à ?¥Ï†ú + Í∏∞Î? ROI 25% + Î∞òÏùëÍµ¨Í∞Ñ
    final bool open = s.showSignal && (s.confidence >= 75) && !s.locked && (s.expectedRoiPct >= 25.0) && (isLong || isShort) && hasReact;
    if (!open) return const SizedBox.shrink();

    final Color accent = isShort ? Colors.redAccent : Colors.greenAccent;
    final String title = isLong ? 'ÏßÑÏûÖ Ï∞??¥Î¶º ¬∑ Î°? : 'ÏßÑÏûÖ Ï∞??¥Î¶º ¬∑ ??;

    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: accent.withOpacity(0.12),
          border: Border.all(color: accent.withOpacity(0.65), width: 1.2),
          boxShadow: [BoxShadow(color: accent.withOpacity(0.22), blurRadius: 16, spreadRadius: 1)],
        ),
        child: Row(
          children: [
            Container(
              width: 10,
              height: 10,
              decoration: BoxDecoration(color: accent, shape: BoxShape.circle),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                title,
                style: TextStyle(color: t.fg, fontWeight: FontWeight.w900, fontSize: 12),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 10),
            Text(
              'Í∏∞Î??òÏùµ ${s.expectedRoiPct.toStringAsFixed(0)}% ¬∑ ?ïÎ•† ${s.signalProb.toStringAsFixed(0)}%',
              style: TextStyle(color: t.muted, fontWeight: FontWeight.w800, fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }

  // ??v10.5 PROCION: ÎØ∏ÎãàÏ∞®Ìä∏ ?ÅÎã® ?îÏïΩ(?ÑÏû¨ ?ÑÏπò/?∏Î†•/?âÎèô)
  // - ?´Ïûê/?ÅÎ¨∏ ÏµúÏÜå?? ?ÑÍµ¨???¥Ìï¥?òÎäî ?úÍ? ?®Ïñ¥Î°úÎßå
  Widget _miniTopSummaryBar(NeonTheme t, double livePrice, Map<String, int> radar) {
    // 1) ?ÑÏû¨ ?ÑÏπò: ÏßÄÏßÄ/?Ä??Ï§ëÍ∞Ñ
    String pos;
    final s1 = _s.s1;
    final r1 = _s.r1;
    if (s1 > 0 && livePrice <= s1 * 1.002) {
      pos = 'ÏßÄÏßÄ Í∑ºÏ≤ò';
    } else if (r1 > 0 && livePrice >= r1 * 0.998) {
      pos = '?Ä??Í∑ºÏ≤ò';
    } else {
      pos = 'Ï§ëÍ∞Ñ Íµ¨Í∞Ñ';
    }

    // 2) ?∏Î†• ?ÅÌÉú: Í≥†Îûò/Í∏∞Í?/?°Ïàò ?îÏïΩ(Í∞ÑÎã®)
    final whale = radar['whale'] ?? 50;
    final whaleBuy = radar['whaleBuy'] ?? 50;
    final inst = radar['inst'] ?? 50;
    final buy = radar['buy'] ?? 50;
    final sell = radar['sell'] ?? 50;
    String flow;
    if (whale >= 60 && whaleBuy >= 55 && inst >= 55) {
      flow = '?∏Î†• ?†ÏûÖ';
    } else if (whale <= 40 && sell > buy + 6) {
      flow = '?∏Î†• ?¥ÌÉà';
    } else {
      flow = '?ºÏ°∞';
    }

    // 3) ?âÎèô ÏßÄÏπ? ???®Ïñ¥(Î∂ÑÌï†/?ÄÍ∏?Í¥ÄÎß?Í∏àÏ?/?ïÏù∏)
    String act;
    if (_s.locked) {
      act = 'ÏßÄÍ∏àÏ? Í∏àÏ?';
    } else if (_showSig && _s.expectedRoiPct >= 25) {
      act = 'Î∂ÑÌï† ÏßÑÏûÖ Í∞Ä??;
    } else if (pos == '?Ä??Í∑ºÏ≤ò') {
      act = '?åÌåå ?ïÏù∏';
    } else if (pos == 'ÏßÄÏßÄ Í∑ºÏ≤ò') {
      act = '?åÎ¶º ?ÄÍ∏?;
    } else {
      act = 'Í¥ÄÎß??†Ï?';
    }

    Color cPos;
    if (pos.contains('ÏßÄÏßÄ')) {
      cPos = t.good;
    } else if (pos.contains('?Ä??)) {
      cPos = t.warn;
    } else {
      cPos = t.stroke;
    }
    final cFlow = (flow == '?∏Î†• ?†ÏûÖ') ? t.good : (flow == '?∏Î†• ?¥ÌÉà' ? t.bad : t.warn);
    final cAct = (act == 'ÏßÄÍ∏àÏ? Í∏àÏ?') ? t.bad : (act == 'Î∂ÑÌï† ÏßÑÏûÖ Í∞Ä?? ? t.good : t.warn);

    Widget pill(String text, Color c) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: c.withOpacity(0.14),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: c.withOpacity(0.55)),
        ),
        child: Text(text, style: TextStyle(color: t.text, fontSize: 11, fontWeight: FontWeight.w900)),
      );
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        color: t.card.withOpacity(0.72),
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              pill(pos, cPos),
              const SizedBox(width: 8),
              pill(flow, cFlow),
              const SizedBox(width: 8),
              pill(act, cAct),
            ],
          ),
        ),
      ),
    );
  }

  // ??v10.5 PROCION: AI Îß§Îãà?Ä ?§ÏãúÍ∞?ÏΩîÎ©ò??3Î¨∏Ïû•: ?ÅÌÉú/?¥Ïú†/?âÎèô)
  Widget _aiManagerCard(NeonTheme t, double livePrice, Map<String, int> radar) {
    // ?ÑÏπò
    String pos;
    final s1 = _s.s1;
    final r1 = _s.r1;
    if (s1 > 0 && livePrice <= s1 * 1.002) {
      pos = 'ÏßÄÏßÄ Íµ¨Í∞Ñ';
    } else if (r1 > 0 && livePrice >= r1 * 0.998) {
      pos = '?Ä??Íµ¨Í∞Ñ';
    } else {
      pos = 'Ï§ëÍ∞Ñ Íµ¨Í∞Ñ';
    }

    // ?∏Î†•/Í≥†Îûò/Í∏∞Í? Í∞ÑÏù¥ ?¥ÏÑù
    final whale = radar['whale'] ?? 50;
    final whaleBuy = radar['whaleBuy'] ?? 50;
    final inst = radar['inst'] ?? 50;
    final buy = radar['buy'] ?? 50;
    final sell = radar['sell'] ?? 50;
    String flow;
    if (whale >= 60 && whaleBuy >= 55 && inst >= 55) {
      flow = '?∏Î†• ?†ÏûÖ';
    } else if (whale <= 40 && sell > buy + 6) {
      flow = '?∏Î†• ?¥ÌÉà';
    } else {
      flow = '?ºÏ°∞';
    }

    // ?ÅÏúÑ TF(1h/4h/1D) Ï∂©Îèå Í∞úÏàò
    int conflict = 0;
    final pulse = _s.mtfPulse;
    String _dirOf(String tfLabel) {
      if (pulse.isNotEmpty && pulse.containsKey(tfLabel)) return pulse[tfLabel]!.dir.toUpperCase();
      final st = tfSnap[tfLabel];
      return (st == null) ? 'NEUTRAL' : st.direction.toUpperCase();
    }

    final curDir = (_showSig ? _s.finalDir : _s.signalDir).toUpperCase();
    bool _isOpp(String d) {
      if (curDir.contains('LONG')) return d.contains('SHORT');
      if (curDir.contains('SHORT')) return d.contains('LONG');
      return false;
    }

    for (final h in const ['1h', '4h', '1D']) {
      if (_isOpp(_dirOf(h))) conflict++;
    }

    String act;
    if (_s.locked || conflict >= 2) {
      act = 'ÏßÄÍ∏àÏ? Í∏àÏ?';
    } else if (_showSig && _s.expectedRoiPct >= 25) {
      act = 'Î∂ÑÌï† ÏßÑÏûÖ Í∞Ä??;
    } else if (pos == '?Ä??Íµ¨Í∞Ñ') {
      act = '?åÌåå ?ïÏù∏';
    } else if (pos == 'ÏßÄÏßÄ Íµ¨Í∞Ñ') {
      act = '?åÎ¶º ?ÄÍ∏?;
    } else {
      act = 'Í¥ÄÎß??†Ï?';
    }

    final agreeText = (conflict == 0) ? '?ÅÏúÑ ?úÍ∞ÑÎ¥âÎèÑ Í∞ôÏ? Î∞©Ìñ•' : (conflict == 1 ? '?ÅÏúÑ ?úÍ∞ÑÎ¥âÏù¥ ?ºÎ? ?áÍ∞àÎ¶? : '?ÅÏúÑ ?úÍ∞ÑÎ¥âÍ≥º Ï∂©Îèå');

    final s1Line = 'ÏßÄÍ∏àÏ? $pos?¥Îã§.';
    final s2Line = '$agreeText ¬∑ $flow ?ÅÌÉú??';
    final s3Line = '?âÎèô: $act.';
// v10.6.6: ÎßàÍ∞ê(Ï¢ÖÍ?) ?úÎàà ?îÏïΩ + ?µÏã¨ Íµ¨Í∞Ñ
String _icon(String dLabel) {
  if (dLabel == '?ÅÏäπ') return '??;
  if (dLabel == '?òÎùΩ') return '??;
  return '??;
}
final h1p = pulse.h1;
final h4p = pulse.h4;
final d1p = pulse.d1;
final closeLine = 'ÎßàÍ∞ê: 1?úÍ∞Ñ ${h1p.closeState}${_icon(h1p.dirLabel)} ¬∑ 4?úÍ∞Ñ ${h4p.closeState}${_icon(h4p.dirLabel)} ¬∑ ?òÎ£® ${d1p.closeState}${_icon(d1p.dirLabel)}';
final levelLine = (s1 > 0 || r1 > 0) ? 'Íµ¨Í∞Ñ: ÏßÄÏßÄ ${((s1) <= 0 ? '-' : (s1).round().toString())} ¬∑ ?Ä??${((r1) <= 0 ? '-' : (r1).round().toString())}' : '';

    // Î∞òÏùëÍµ¨Í∞Ñ Í∞ïÎèÑ/Î™©Ìëú (??Ï§?Í∞??ïÏ†ïÍ∏?+ ?¥ÎîîÍπåÏ?)
    final rs = ReactionStrengthEngine.build(_s, livePrice: livePrice);
    final String rsLine = (rs.targets.isNotEmpty && rs.targets[0] > 0)
        ? 'Î∞òÏùë: ${rs.gradeKo} ${rs.score}% ¬∑ ${rs.isBull ? 'Î™©Ìëú' : 'Î™©Ìëú'} ${rs.targets[0].round()}/${rs.targets[1].round()}/${rs.targets[2].round()}'
        : 'Î∞òÏùë: ${rs.gradeKo} ${rs.score}%';

    Color accent;
    if (act == 'Î∂ÑÌï† ÏßÑÏûÖ Í∞Ä??) {
      accent = t.good;
    } else if (act == 'ÏßÄÍ∏àÏ? Í∏àÏ?') {
      accent = t.bad;
    } else {
      accent = t.warn;
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: t.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: accent.withOpacity(0.55)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(width: 8, height: 8, decoration: BoxDecoration(color: accent, shape: BoxShape.circle)),
              const SizedBox(width: 8),
              Text('?ÑÏ†Ñ AI ?ÑÏûê??, style: TextStyle(color: t.text, fontWeight: FontWeight.w900, fontSize: 12)),
              const Spacer(),
              Text('?§ÏãúÍ∞?, style: TextStyle(color: t.muted, fontWeight: FontWeight.w800, fontSize: 11)),
            ],
          ),
          const SizedBox(height: 6),
          Text(s1Line, style: TextStyle(color: t.text, fontSize: 12, fontWeight: FontWeight.w900)),
          const SizedBox(height: 2),
          Text(s2Line, style: TextStyle(color: t.textSecondary, fontSize: 12, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          
Text(s3Line, style: TextStyle(color: t.text, fontSize: 12, fontWeight: FontWeight.w900)),
const SizedBox(height: 6),
Text(closeLine, style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w800)),
if (levelLine.isNotEmpty) ...[
  const SizedBox(height: 2),
  Text(levelLine, style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w800)),
],
const SizedBox(height: 4),
// Î∞òÏùë Í∞ïÎèÑ + ?¥ÎîîÍπåÏ?(Î™©Ìëú)
Text(rsLine, style: TextStyle(color: t.text, fontSize: 11, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }

  // ???ÅÎã® ÎØ∏ÎãàÏ∞®Ìä∏ + ?úÏ§Ñ Îß§Îãà?Ä(Í≤πÏπ®/?§ÌÅ¨Î°?Î∂àÌé∏ Í∞úÏÑ†)
  Widget _topMiniChartPanel(
    NeonTheme t,
    String symbol,
    String tf,
    double livePrice,
    Map<String, int> radar,
    dynamic ds,
  ) {
    final h = MediaQuery.of(context).size.height;
    // ?????îÎ©¥??'Ï∞®Ìä∏ + AI Îß§Îãà?Ä'Í∞Ä Í∞ôÏù¥ Î≥¥Ïù¥Í≤?Ï¢åÏö∞?§ÌÅ¨Î°??ÜÏù¥)
    //    Ï∞®Ìä∏ ?íÏù¥Î•?Í≥ºÌïòÍ≤??§Ïö∞Î©??ÑÎûò Ïπ¥ÎìúÍ∞Ä Î∞Ä?§ÏÑú Îπ??¨Î∞±Ï≤òÎüº Ï≤¥Í∞ê??
    final maxH = (h * 0.34).clamp(260.0, 360.0);

    String oneLine() {
      final buy = radar['buy'] ?? 0;
      final sell = radar['sell'] ?? 0;
      final whales = radar['whales'] ?? (radar['whale'] ?? 0);
      if (buy >= 70 && whales >= 60) return '?∏Î†•¬∑Í≥†Îûò Îß§Ïàò ?∞ÏÑ∏ ???åÎ¶ºÎß?Ï£ºÏùò';
      if (sell >= 70) return 'Îß§ÎèÑ ?∞ÏÑ∏ ??Î¨¥Î¶¨ ÏßÑÏûÖ Í∏àÏ?';
      if (buy <= 35 && sell <= 35) return '??Î™®Ïúº??Ï§???Íµ¨Í∞Ñ ?ïÏ†ï Í∏∞Îã§Î¶?;
      return 'Í¥ÄÎß??†Ï? ??ÏßÄÏßÄ/?Ä??Î∞òÏùë ?ïÏù∏';
    }

    return Container(
      margin: const EdgeInsets.fromLTRB(14, 10, 14, 8),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Stack(
        children: [
          // ÎØ∏ÎãàÏ∞®Ìä∏ Ïπ¥Îìú(?∏Îùº?? - ?∏Î? ?ÑÏ†Ø ?òÏ°¥ ?úÍ±∞(Ïª¥Ìåå??ÎßÅÌÅ¨ ?§Ïàò Î∞©Ï?)
          Container(
            height: maxH,
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
            decoration: BoxDecoration(
              // NeonTheme does not expose panel/line/shadow in this project baseline.
              // Map them to existing tokens.
              color: t.card,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: t.border.withOpacity(0.22)),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.25),
                  blurRadius: 18,
                  offset: const Offset(0, 10),
                ),
              ],
            ),
            child: MiniChartV4(
              // ?îÎ©¥ ?ÅÌÉú??_s(FuState)?êÏÑú Í¥ÄÎ¶¨Ìï©?àÎã§.
              candles: _s.candles,
              obZones: _s.obZones,
              mbZones: _s.mbZones,
              fvgZones: _s.fvgZones,
              bprZones: _s.bprZones,
              // MiniChartV4???¨Ïö©???§Ï†ï(AppSettings) Í∏∞Î∞ò?ºÎ°ú MB/CHOCH/BOSÎ•??úÏãú?©Îãà??
              title: '$symbol ¬∑ $tf',
              price: livePrice,
              s1: _s.s1,
              r1: _s.r1,
            ),
          ),

          // (NEW v4) Ï∞®Ìä∏ ?ÑÏ≤¥?îÎ©¥(Ï¢?Ï∫îÎì§/Ï°?+ ??ÎØ∏Îûò?åÎèô)
          Positioned(
            right: 14,
            bottom: 14,
            child: InkWell(
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => ChartFullScreenPage(
                      symbol: symbol,
                      tfLabel: tf,
                      candles: _s.candles,
                      obZones: _s.obZones,
                      mbZones: _s.mbZones,
                      fvgZones: _s.fvgZones,
                      bprZones: _s.bprZones,
                      reactLow: _s.reactLow,
                      reactHigh: _s.reactHigh,
                    ),
                  ),
                );
              },
              borderRadius: BorderRadius.circular(999),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.55),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: Colors.white.withOpacity(0.18), width: 1),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.auto_graph, size: 16, color: Colors.white.withOpacity(0.9)),
                    const SizedBox(width: 6),
                    Text('Ï∞®Ìä∏', style: TextStyle(color: Colors.white.withOpacity(0.92), fontSize: 11, fontWeight: FontWeight.w900)),
                  ],
                ),
              ),
            ),
          ),

          // Ï∞®Ìä∏ ?ÅÎã® ?§Î≤Ñ?àÏù¥(?§ÏãúÍ∞?Í∞ÄÍ≤?Í∞ÄÎ¶?Î∞©Ï?)
          // - ?ºÏ™Ω: ?êÎã®/?ÅÌÉú
          // - ?§Î•∏Ï™? ?∏Î†•/Í≥†Îûò/Í∏∞Í?/Î¶¨Ïä§??Í∑ºÍ±∞/?©Ïùò (?îÏ≤≠: ?∞Ï∏°?ºÎ°ú)
          Positioned(
            left: 12,
            right: 12,
            top: 12,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // (L) ?êÎã®
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  decoration: BoxDecoration(
                    color: t.card.withOpacity(0.72),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: t.border.withOpacity(0.45)),
                  ),
                  child: DefaultTextStyle(
                    style: TextStyle(color: t.text, fontSize: 11, height: 1.25),
                    child: Text(
                      '?êÎã®: ${_s.decisionLabel} ¬∑ ${_s.statusLabel}',
                      style: TextStyle(color: t.text, fontWeight: FontWeight.w800),
                    ),
                  ),
                ),
                const Spacer(),
                // (R) ?∏Î†•/Í≥†Îûò/Í∏∞Í?/Î¶¨Ïä§??Í∑ºÍ±∞/?©Ïùò
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  decoration: BoxDecoration(
                    color: t.card.withOpacity(0.72),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: t.border.withOpacity(0.45)),
                  ),
                  child: DefaultTextStyle(
                    style: TextStyle(color: t.text, fontSize: 11, height: 1.25),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          '?∏Î†• ${_s.forceScore}/100 ¬∑ Í≥†Îûò ${_s.whaleScore}/100 ¬∑ Í∏∞Í? ${_s.instBias}/100',
                          style: TextStyle(color: t.muted),
                        ),
                        Text(
                          'Î¶¨Ïä§??${_s.riskPct}% ¬∑ Í∑ºÍ±∞ ${_s.evidenceHit}/${_s.evidenceTotal} ¬∑ ?©Ïùò ${_s.consensusOk ? 'Ï∂©Ï°±' : 'Î∂ÄÏ°?}',
                          style: TextStyle(color: t.muted),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),

          // (?îÏ≤≠ Î∞òÏòÅ) Ï∞®Ìä∏ ??AI Îß§Îãà?Ä ?§Î≤Ñ?àÏù¥???úÍ±∞.
          // - ?ÑÎûò Sliver??_aiManagerCard?êÏÑú ??Î≤àÎßå Î≥¥Ïó¨Ï§Ä??
        ],
          ),
          const SizedBox(height: 8),
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => BriefingFullScreenPage(symbol: symbol, tfLabel: tf, s: _s),
                ),
              );
            },
            child: DecisionDockV1(s: _s),
          ),
        ],
      ),
    );
  }


  String _tfLabel(String tf) {
    final k = tf.trim();
    switch (k) {
      case '1m': return '1Î∂?;
      case '5m': return '5Î∂?;
      case '15m': return '15Î∂?;
      case '1h': return '1?úÍ∞Ñ';
      case '4h': return '4?úÍ∞Ñ';
      case '1D': case '1d': return '?òÎ£®';
      case '1W': case '1w': return '1Ï£?;
      case '1M': return '1??;
      default: return k;
    }
  }

  Widget _futurePathCard(NeonTheme theme) {
    final tf = _tf;
    final candles = _s.candles;
    final zones = <FuZone>[..._s.obZones, ..._s.mbZones, ..._s.fvgZones, ..._s.bprZones];
    final reactLow = _s.reactLow;
    final reactHigh = _s.reactHigh;
    final price = livePrice;

    // Í≤∞Ï†ï?? Î°????ïÎ•† Ï§???Í∞?0~1)
    final conf01 = (([_s.longPct, _s.shortPct].map((e) => e.abs()).reduce((a,b)=>a>b?a:b)) / 100.0).clamp(0.0, 1.0);

    return GlassCard(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.auto_graph, size: 16),
              const SizedBox(width: 6),
              Text('ÎØ∏ÎûòÍ≤ΩÎ°ú ¬∑ ${_tfLabel(tf)}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: theme.fg)),
              const Spacer(),
              Text('Í≤∞Ï†ï??, style: TextStyle(fontSize: 11, color: theme.muted)),
              const SizedBox(width: 8),
              SizedBox(
                width: 110,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(999),
                  child: LinearProgressIndicator(
                    value: conf01,
                    minHeight: 10,
                    backgroundColor: theme.line,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 240,
            child: FutureWavePanel(
              symbol: symbol,
              candles: candles,
              zones: zones,
              reactLow: reactLow,
              reactHigh: reactHigh,
              tfLabel: _tfLabel(tf),
            ),
          ),
        ],
      ),
    );
  }

  Widget _signalDock(NeonTheme t, FuState s) {
    final double pctEvidence = (s.evidencePct).clamp(0.0, 100.0).toDouble();
    final double pctRoi = (s.roiPotential).clamp(0.0, 100.0).toDouble();
    final double pctProb = (s.signalProb).clamp(0.0, 100.0).toDouble();

    final String dir = s.signalDir;
    final bool isLong = dir == 'LONG';
    final bool isShort = dir == 'SHORT';
    final bool confirmed = s.showSignal && (s.confidence >= 75) && (isLong || isShort) && s.signalProb >= 70;

    final bool blink = confirmed && ((DateTime.now().millisecondsSinceEpoch ~/ 500) % 2 == 0);
    final Color accent = isShort ? Colors.redAccent : Colors.greenAccent;

    Widget ring(String label, double pct) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Stack(
            alignment: Alignment.center,
            children: [
              SizedBox(
                width: 52,
                height: 52,
                child: CircularProgressIndicator(
                  value: pct / 100.0,
                  strokeWidth: 6,
                  backgroundColor: t.border.withOpacity(0.30),
                  valueColor: AlwaysStoppedAnimation<Color>(
                    pct >= 70 ? Colors.greenAccent : (pct >= 40 ? Colors.amberAccent : Colors.redAccent),
                  ),
                ),
              ),
              Text('${pct.toStringAsFixed(0)}%', style: TextStyle(color: t.fg, fontWeight: FontWeight.w700, fontSize: 12)),
            ],
          ),
          const SizedBox(height: 4),
          Text(label, style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w600)),
        ],
      );
    }

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: t.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: t.border.withOpacity(0.60)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'ÏßÑÏûÖ ?îÏïΩ',
                  style: TextStyle(color: t.fg, fontWeight: FontWeight.w800, fontSize: 16),
                ),
              ),
              AnimatedContainer(
                duration: const Duration(milliseconds: 250),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: confirmed
                      ? (blink ? accent.withOpacity(0.28) : accent.withOpacity(0.14))
                      : t.border.withOpacity(0.18),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: confirmed ? accent.withOpacity(blink ? 1.0 : 0.55) : t.border.withOpacity(0.40)),
                  boxShadow: confirmed && blink
                      ? [BoxShadow(color: accent.withOpacity(0.55), blurRadius: 16, spreadRadius: 1)]
                      : const [],
                ),
                child: Text(
                  confirmed ? (isLong ? 'B LONG' : 'S SHORT') : 'WATCH',
                  style: TextStyle(color: confirmed ? accent : t.muted, fontWeight: FontWeight.w900, fontSize: 12),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              ring('Í∑ºÍ±∞', pctEvidence),
              ring('ROI', pctRoi),
              ring('?ïÎ•†', pctProb),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: t.border.withOpacity(0.10),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: t.border.withOpacity(0.35)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'ÏßÑÏûÖ ${s.entry.toStringAsFixed(0)}  /  ?êÏ†à ${s.sl.toStringAsFixed(0)}  /  Î™©Ìëú ${s.tp.toStringAsFixed(0)}',
                    style: TextStyle(color: t.fg, fontWeight: FontWeight.w700, fontSize: 12),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

Widget _pulseBars(BuildContext context, NeonTheme t, FuState s) {
    final liveOk = BitgetLiveStore.I.ticker.value != null;
    final double evRatio = (s.evidenceTotal <= 0) ? 0.0 : (s.evidenceHit / s.evidenceTotal).clamp(0.0, 1.0).toDouble();
    final double conf = (s.confidence / 100.0).clamp(0.0, 1.0).toDouble();
    final double risk = (s.risk / 100.0).clamp(0.0, 1.0).toDouble();
    final collect = (_loading ? 0.65 : (liveOk ? 0.95 : 0.25));


    Color pick(double v) {
      if (v >= 0.75) return t.good;
      if (v >= 0.45) return t.warn;
      return t.bad;
    }

    Widget bar(String label, double v) {
      final double vv = v.clamp(0.0, 1.0).toDouble();
      final c = pick(vv);
      return Row(
        children: [
          SizedBox(width: 64, child: Text(label, style: TextStyle(color: t.muted, fontSize: 11))),
          Expanded(
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: vv),
              duration: const Duration(milliseconds: 450),
              curve: Curves.easeOutCubic,
              builder: (context, val, _) {
                return ClipRRect(
                  borderRadius: BorderRadius.circular(999),
                  child: Container(
                    height: 9,
                    color: t.border.withOpacity(0.45),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: FractionallySizedBox(
                        widthFactor: val,
                        child: Container(color: c.withOpacity(0.95)),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
          const SizedBox(width: 10),
          SizedBox(
            width: 40,
            child: Text('${(vv * 100).round()}%', textAlign: TextAlign.right, style: TextStyle(color: t.fg, fontSize: 11)),
          ),
        ],
      );
    }

    // ?ÅÎã® HUD: ÎπàÍ≥µÍ∞?Ï§ÑÏù¥Í≥??úÏã§?úÍ∞Ñ ?òÏßë/?©Ïùò/?†Î¢∞/?ÑÌóò?ùÏùÑ ?úÎàà??    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: t.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: t.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('?∞Ïù¥???òÏßë/Í≤åÏù¥ÏßÄ', style: TextStyle(color: t.fg, fontSize: 12, fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          bar('?òÏßë ?ÅÌÉú', collect),
          const SizedBox(height: 8),
          bar('?§ÏãúÍ∞?Í∞ÄÍ≤?, liveOk ? 1.0 : 0.0),
          const SizedBox(height: 8),
          bar('Í∑ºÍ±∞ ?©Ïùò', evRatio),
          const SizedBox(height: 8),
          bar('?†Î¢∞', conf),
          const SizedBox(height: 8),
          bar('?ÑÌóò', risk),
        ],
      ),
    );
  }
  @override
  // ?±Í∏â ?úÏãú(?úÍ?). ?îÎ©¥??Î≥Ä???®Ïàò: ?îÏßÑ Î°úÏßÅ?Ä Í±¥ÎìúÎ¶¨Ï? ?äÏùå.
  String _gradeKo(dynamic grade) {
    final g = (grade ?? '').toString().trim().toUpperCase();
    if (g.isEmpty) return 'Î≥¥ÌÜµ';
    switch (g) {
      case 'SSS':
      case 'SSS+':
      case 'SSS++':
      case 'SSS+++':
        return 'ÏµúÏÉÅ';
      case 'SS':
      case 'SS+':
      case 'SS++':
        return 'Îß§Ïö∞Ï¢ãÏùå';
      case 'S':
      case 'S+':
        return 'Ï¢ãÏùå';
      case 'A':
        return '?ëÌò∏';
      case 'B':
        return 'Î≥¥ÌÜµ';
      case 'C':
        return '??ùå';
      case 'D':
        return 'Îß§Ïö∞??ùå';
      default:
        // ?´Ïûê ?êÏàò/?ºÏÑº???±Ïù¥ ?§Ïñ¥?Ä??ÏµúÎ???ÏßÅÍ??ÅÏúºÎ°?        final n = num.tryParse(g.replaceAll('%', ''));
        if (n != null) {
          if (n >= 85) return 'ÏµúÏÉÅ';
          if (n >= 70) return 'Îß§Ïö∞Ï¢ãÏùå';
          if (n >= 55) return 'Ï¢ãÏùå';
          if (n >= 40) return 'Î≥¥ÌÜµ';
          return '??ùå';
        }
        return 'Î≥¥ÌÜµ';
    }
  }


  Widget build(BuildContext context) {
    final theme = NeonTheme.of(context);

    final pass25 = (_s.expectedRoiPct >= 25.0) && (_s.evidenceHit >= 4);
    final liveP = BitgetLiveStore.I.livePrice;
    final livePrice = (liveP > 0 ? liveP : _s.price);
    final radar = _calcFlowRadar(_s);
    final ds = _directionScore(_s, radar);
    return Scaffold(
      backgroundColor: theme.bg,
      appBar: UltraTopBarV1(
        title: 'Fulink Pro',
        symbol: symbol,
        tf: tf,
        onOpenPattern: () => _openPatternSheet(theme),
        onOpenSignals: () => EngineSignalSheetV1.open(context),
        onOpenTradeChart: () {
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => TradeChartOnlyScreen(
                symbol: symbol,
                initialTf: tf,
                tfs: tfs,
                tfSnap: tfSnap,
                livePrice: livePrice,
              ),
            ),
          );
        },
        onOpenSettings: () => _openTradingSettingsSheet(theme),
        onOpenGlossary: () {
          Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const IndicatorGlossaryScreen()),
          );
        },
        onChangeSymbol: (v) {
          setState(() => symbol = v);
          _startRealtimeCandles();
          _startAutoRefresh();
          _refresh();
        },
      ),
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [theme.bg, theme.card.withOpacity(0.88), theme.bg],
          ),
        ),
        child: Stack(
          children: [
            RefreshIndicator(
              onRefresh: () async => _refresh(),
              child: CustomScrollView(
                controller: _scrollCtrl,
                slivers: [
            // ???Ä?ÑÌîÑ?àÏûÑ ??+ Î©Ä?∞TF ?†Ìò∏ ?îÏïΩ: ?îÎ©¥ ÏµúÏÉÅ??Í≥†Ï†ï
            SliverPersistentHeader(
              pinned: true,
              delegate: _TfHeaderDelegate(
                // overflow Î∞©Ï?: ?ΩÍ∞Ñ ???íÍ≤å
                // Wrap Í∏∞Î∞ò?ºÎ°ú 2Ï§ÑÍπåÏßÄ ?êÏó∞?§ÎüΩÍ≤?Î∞∞Ïπò (?§ÌÅ¨Î°??§Î≤Ñ?åÎ°ú??Î∞©Ï?)
                height: 204,
                child: Container(
                  color: theme.bg,
                  padding: const EdgeInsets.fromLTRB(14, 8, 14, 10),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      // ??(1) Î©Ä?∞TF ?úÎàà??Î∞?(Í≤πÏπ®/?§Î≤Ñ?åÎ°ú??Î∞©Ï?)
                      _mtfOneGlanceBar(theme),
                      const SizedBox(height: 8),
                      TFStripV1(
                        items: tfs,
                        selected: tf,
                        onSelect: (v) {
                          setState(() => tf = v);
                          _startRealtimeCandles();
                          _startAutoRefresh();
                          _refresh();
                        },
                      ),
                    ],
                  ),
                ),
              ),
            ),

            // ??(NEW) ÎØ∏ÎãàÏ∞®Ìä∏: ?îÎ©¥ ?ÅÎã®???¨Í≤å Í≥†Ï†ï ?êÎÇå?ºÎ°ú Î∞∞Ïπò
            // - ?¨Ïö©?êÍ? "ÎØ∏ÎãàÏ∞®Ìä∏ 40~50% + ?òÎ®∏ÏßÄ AI Îß§Îãà?Ä"Î•??êÌï®
            // - ?ÅÎã®?êÏÑú Î∞îÎ°ú Ï∞®Ìä∏ + ?µÏã¨ ?úÏ§Ñ Î∏åÎ¶¨?ëÏùÑ Í∞ôÏù¥ Î≥¥Í≤å ??            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                child: _topMiniChartPanel(theme, symbol, tf, livePrice, radar, ds),
              ),
            ),

            // ??PROCION A Ïπ¥Îìú: Í≤∞Î°† Ïπ¥Îìú(Í∏∞Î≥∏ ?ëÌûò ???ÑÎûò ?¥Ïö©????Î≥¥Ïù¥Í≤?
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
                child: Column(
                  children: [
                    // ?ºÏπ®/?ëÍ∏∞ Î≤ÑÌäº
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: () => setState(() => _aExpanded = !_aExpanded),
                        style: TextButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          minimumSize: const Size(0, 0),
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        child: Text(
                          _aExpanded ? '?ëÍ∏∞' : '?êÏÑ∏??,
                          style: TextStyle(color: theme.muted, fontWeight: FontWeight.w900, fontSize: 11),
                        ),
                      ),
                    ),
                    AnimatedSize(
                      duration: const Duration(milliseconds: 180),
                      curve: Curves.easeOut,
                      child: ProcionACardV1(
                        s: _s,
                        livePrice: livePrice,
                        tf: tf,
                        compact: !_aExpanded,
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // ??v10.5 PROCION: AI Îß§Îãà?Ä ?§ÏãúÍ∞??úÏ§Ñ Í≤∞Î°†(?§ÌÅ¨Î°??ÜÏù¥ ??ÉÅ Î∞îÎ°ú Î≥¥Ïù¥Í≤?
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
                child: _futurePathCard(theme),
              ),
            ),

            // ??ÎØ∏ÎãàÏ∞®Ìä∏ Î∞îÎ°ú Î∞? "Îß§Îãà?Ä" (?úÎìú/5%Î¶¨Ïä§??Î©Ä?∞TF ÏßÑÏûÖ¬∑?êÏ†à¬∑Î™©Ìëú¬∑?àÎ≤Ñ)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
                child: ManagerTradePanel(
                  symbol: symbol,
                  currentTf: tf,
                  tfSnap: tfSnap,
                  onSeedChanged: () {
                    setState(() {});
                    _refresh();
                    _refreshOtherTfs();
                  },
                ),
              ),
            ),

            // ??ÎØ∏ÎãàÏ∞®Ìä∏ Î∞îÎ°ú Î∞? ?úÍ≥ºÍ±??ÑÏû¨ ÎπÑÍµê Ïπ??§Î™®)??            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
                child: CsvChipRowV1(
                  t: theme,
                  candles: _s.candles,
                  dir: _s.signalDir,
                  prob: _s.signalProb,
                  sweepRisk: _s.sweepRisk,
                ),
              ),
            ),

            // (PROCION Í∞úÌé∏) Í∏∞Ï°¥ '?úÎ∞© ?êÎã® Ïπ¥Îìú'??A Ïπ¥ÎìúÎ°??ÄÏ≤?
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                child: Column(
                  children: [
                    // ??v13: ?Ä?ÑÌîÑ?àÏûÑ ?ÅÌÉú(B/S/W) + ÎßàÍ∞ê Î∏åÎ¶¨??Ïπ¥Îìú
                    TfStripStatusV3(tfSnap: tfSnap, selectedTf: tf, onSelectTf: _setTf),
                    const SizedBox(height: 10),
                    TfBriefingCardsV2(tfSnap: tfSnap, selectedTf: tf, onSelectTf: _setTf),
                    const SizedBox(height: 10),
                    // ???µÌï© Î°±Ïàè Í≤∞Ï†ï ?ïÏ†ï Í∏∞Îä•??(??Î©îÏù∏ ?ÑÏ≤¥ Í∏∞Îä• ???îÎ©¥??
                    UnifiedDecisionPanel(state: _s, livePrice: livePrice, symbol: symbol),
                    const SizedBox(height: 10),
					// (1) ?µÌï© Î∏åÎ¶¨??(Î∞©Ìñ•?êÏàò + ?úÏ§Ñ ?¥Ïú† + S/R Í∞ÄÍ≤?
					_decisionBriefCard(theme, _s, radar, ds, livePrice),
					const SizedBox(height: 6),
					// (1-1) Íµ¨Ï°∞ Î∞òÏùëÍµ¨Í∞Ñ(CHOCH/BOS) ??					_reactionBand(theme, _s),
					const SizedBox(height: 8),
	                    // (2) ?µÏã¨ Î∏åÎ¶¨??Ïπ¥Îìú
	                    SignalCardV1(
	                      direction: _s.signalDir,
	                      probability: _s.signalProb,
	                      grade: _s.signalGrade,
	                      evidenceHit: _s.evidenceHit,
	                      evidenceTotal: _s.evidenceTotal,
	                      bullets: _s.signalBullets,
	                    ),
					const SizedBox(height: 8),
					// ???†Ìò∏ Î∞îÎ°ú ?ÑÎûò: Ï¥àÎ≥¥??Î∞îÎ°ú Í≤∞Ï†ï?????àÍ≤å ?úÏßÑ???êÏ†à/Î™©Ìëú/?àÎ≤Ñ/?òÎüâ/RR?ùÎ? Î∂ôÏó¨??Î≥¥Ïó¨Ï§?					if (_showSig) ...[
					  quickPlanInlineStrip(theme),
					  const SizedBox(height: 8),
					  entryAlertCard(theme),
					  const SizedBox(height: 8),
					],
                    // (2-1) ?∏Î†•/Í≥†Îûò/Í∏∞Í? HUD (50 Í≥†Ï†ï Î∞©Ï? Í≥ÑÏÇ∞ ?ÅÏö©)
                    FlowRadarHud(
                      buyStrength: radar['buy']!,
                      sellStrength: radar['sell']!,
                      obImbalance: radar['ob']!,
                      absorption: radar['abs']!,
                      instBias: radar['inst']!,
                      whaleScore: radar['whale']!,
                      whaleBuyPct: radar['whaleBuy']!,
                      sweepRisk: radar['sweep']!,
                      cvd: null,
                      note: 'Í≥†Îûò ${radar['whale']}% (Îß§Ïàò ${radar['whaleBuy']}%)  ¬∑  ?∞ÏÜêÎ∞©Ìñ• ${radar['inst']}%  ¬∑  ${_s.flowHint}',
                    ),
                    const SizedBox(height: 8),

                    // v10.4 SAFE: ?êÎèô Î≥µÍ∏∞(?òÏù¥???Ä?? Ïπ¥Îìú
                    _paperJournalCard(theme),
                    const SizedBox(height: 8),

                    _pulseBars(context, theme, _s),
                    const SizedBox(height: 8),

                    Row(
                      children: [
                        Expanded(
                          child: InkWell(
                            onTap: _showSig ? _paperEnter : null,
                            borderRadius: BorderRadius.circular(14),
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 10),
                              decoration: BoxDecoration(
                                color: theme.card,
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(color: theme.border),
                              ),
                              child: Center(
	                                child: Text('?òÏù¥??ÏßÑÏûÖ', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
	                              ),
	                            ),
	                          ),
	                        ),
	                        const SizedBox(width: 10),
	                        Expanded(
	                          child: InkWell(
	                            onTap: PaperTradeStore.position != null ? _paperExit : null,
	                            borderRadius: BorderRadius.circular(14),
	                            child: Container(
	                              padding: const EdgeInsets.symmetric(vertical: 10),
	                              decoration: BoxDecoration(
	                                color: theme.card,
	                                borderRadius: BorderRadius.circular(14),
	                                border: Border.all(color: theme.border),
	                              ),
	                              child: Center(
	                                child: Text('?òÏù¥??Ï¢ÖÎ£å', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
	                              ),
	                            ),
	                          ),
	                        ),
	                      ],
	                    ),
                    const SizedBox(height: 10),
                    // (3) Ï§ëÏïô ?àÎ∏å(ÏßÑÏûÖ/Í¥ÄÎß??µÏã¨)
                    RepaintBoundary(
                      child: FxPulse(
                        // ??ROI 25% Í≤åÏù¥??+ ?©Ïùò + NO-TRADE + Íµ¨Í∞Ñ??Í≥ºÎß§Îß?Î∞©Ï?ÍπåÏ?
                        // ?îÏßÑ?êÏÑú ÏµúÏ¢Ö ?ïÏ†ï ?†Ìò∏Î°??êÎã®??Í≤ΩÏö∞?êÎßå ?ÑÏä§ ?úÏÑ±??                        active: _showSig,
                        child: CenterHubV1(
                          symbol: symbol,
                          tfLabel: tf,
                          price: livePrice,
                          decisionTitle: _s.decisionTitle,
                          locked: _s.locked,
                          lockedReason: _s.lockedReason,
                          evidenceHit: _s.evidenceHit,
                          evidenceTotal: _s.evidenceTotal,
                          score: _s.score,
                          confidence: _s.confidence,
                          risk: _s.risk,
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                  ],
                ),
              ),
            ),

            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
                child: Column(
                  children: [

                    // ??Î©Ä?∞TF ?ïÎ†• ?îÏïΩ(?úÎàà??: ?ÑÏû¨ TF Í∏∞Ï? ???òÏúÑ TFÍ∞Ä ?¥ÎîîÎ°?ÎØ∏ÎäîÏßÄ
                    _pressureSummaryCard(theme),
                    const SizedBox(height: 8),

                    // ??Í≤∞Ï†ï ?†Î¢∞??0~100): ?©Ïùò/ROI/Î¶¨Ïä§??Ï¶ùÍ±∞ Í∏∞Î∞ò
                    _decisionConfidenceCard(theme),
                    const SizedBox(height: 8),

                    // ??NO-TRADE ?ÅÏÑ∏ ?¨Ïú†(?úÎàà??: ?†Í∏à ?êÏù∏/Í≤åÏù¥???§Ìå® ?êÏù∏
                    _noTradeReasonsCard(theme),
                    const SizedBox(height: 8),

                    // ??Í≤∞Ï†ï Í≤åÏù¥???©Ïùò/ROI/NO-TRADE) + ?§Ï†Ñ ?òÏπò ?úÎàà??                    _decisionGateCard(theme),
                    const SizedBox(height: 8),
		                    SRLineV1(
	                      s1: _s.s1,
	                      vwap: _s.vwap,
	                      r1: _s.r1,
		                      riskPct: _s.risk,
	                      note: 'ÏßÄÏßÄ${(_s.s1).toStringAsFixed(0)} / ?Ä??{(_s.r1).toStringAsFixed(0)}',
	                    ),
                    const SizedBox(height: 8),
                    CandleCloseBadgesV1(
                      infos: [
                        CandleCloseUtil.evaluate(tfLabel: '4H', price: livePrice, vwap: _s.vwap, score: _s.score, confidence: _s.confidence, risk: _s.risk),
                        CandleCloseUtil.evaluate(tfLabel: '1D', price: livePrice, vwap: _s.vwap, score: _s.score, confidence: _s.confidence, risk: _s.risk),
                        CandleCloseUtil.evaluate(tfLabel: '1W', price: livePrice, vwap: _s.vwap, score: _s.score, confidence: _s.confidence, risk: _s.risk),
                        CandleCloseUtil.evaluate(tfLabel: '1M', price: livePrice, vwap: _s.vwap, score: _s.score, confidence: _s.confidence, risk: _s.risk),
                      ],
                    ),
                    const SizedBox(height: 10),
	                    entryGaugeCard(theme),
                    const SizedBox(height: 10),
	                    entryAlertCard(theme),
	                    const SizedBox(height: 10),
	                    quickPlanCard(theme),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: InkWell(
                            onTap: _loading ? null : _refresh,
                            borderRadius: BorderRadius.circular(16),
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              decoration: BoxDecoration(
                                color: theme.card,
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(color: theme.border),
                              ),
                              child: Center(
                                child: Text(_loading ? 'Í∞±Ïã† Ï§ë‚Ä? : '?àÎ°úÍ≥†Ïπ®', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: InkWell(
                            onTap: () => Navigator.of(context)
                                .push(fxRoute(PositionScreen(currentMark: livePrice, symbol: symbol))),
                            borderRadius: BorderRadius.circular(16),
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              decoration: BoxDecoration(
                                color: theme.card,
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(color: theme.border),
                              ),
                              child: Center(child: Text('?¨Ï???, style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900))),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: InkWell(
                            onTap: () => Navigator.of(context).push(fxRoute(const TuneScreen())),
                            borderRadius: BorderRadius.circular(16),
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              decoration: BoxDecoration(
                                color: theme.card,
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(color: theme.border),
                              ),
                              child: Center(child: Text('?êÏú®Î≥¥Ï†ï', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900))),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    if (PaperTradeStore.position != null)
                      FxPulse(active: true, child: Text('?òÏù¥???¨Ï???ÏßÑÌñâ Ï§?, style: TextStyle(color: theme.warn, fontWeight: FontWeight.w900))),
                  ],
                ),
              ),
            ),
                ],
              ),
            ),

            
// ??Î©îÏù∏ ?∞Ï∏°?òÎã® [?Ä?¥Î°±] Î≤àÍ∞ú Î≤ÑÌäº(???úÍ∑∏??
Positioned(
  right: 14,
  bottom: 78,
  child: SafeArea(
    child: _TyronBoltFab(
      onTap: () => _openTyronBoltSheet(context),
    ),
  ),
),

// ??Î©îÏù∏ ?∞Ï∏°?òÎã® [Ï∞®Ìä∏] Î≤ÑÌäº(Î©îÏù∏ ?àÏù¥?ÑÏõÉ ?†Ï?)
            Positioned(
              right: 14,
              bottom: 14,
              child: SafeArea(
                child: _ChartFab(
                  label: 'Ï∞®Ìä∏',
                  onTap: () => _openFullChart(livePrice),
                ),
              ),
            ),

            // v10 SAFE: ÎØ∏Îãà Í≤∞Î°† Î∞??¨Î¶¨Î≤?Íµ¨Ï°∞ Î∂àÎ?). TF ?§Îçî(170px) ?ÑÎûò??Í≥†Ï†ï.
            Positioned(
              left: 0,
              right: 0,
              top: 170,
              child: ValueListenableBuilder<double>(
                valueListenable: _scrollY,
                builder: (_, y, __) {
                  // AÏπ¥ÎìúÍ∞Ä ?îÎ©¥???àÏùÑ ?åÎäî ?®Í∏∞Í≥? ?¥Î†§Í∞îÏùÑ ?åÎßå ?úÏãú
                  final show = y > 240;
                  return IgnorePointer(
                    ignoring: !show,
                    child: AnimatedOpacity(
                      duration: const Duration(milliseconds: 160),
                      opacity: show ? 1.0 : 0.0,
                      child: _stickyDecisionBar(theme, livePrice),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
    ),
    );
  }

  // ===== Paper trading actions =====
  void _paperEnter() {
    // ?†Ìò∏ Í≤åÏù¥???µÍ≥º + ?åÎûú Í∞íÏù¥ ?àÏñ¥??ÏßÑÏûÖ
    if (!_showSig) return;
    final isLong = _s.signalDir.toUpperCase().contains('LONG');
    final qty = (_s.qty <= 0) ? 0.001 : _s.qty;
    PaperTradeStore.open(
      symbol: symbol,
      isLong: isLong,
      qty: qty,
      entry: _s.entry > 0 ? _s.entry : _s.price,
      mark: _s.price,
      leverage: (_s.leverage <= 0) ? 1 : _s.leverage,
      riskPct: 5,
      sl: _s.stop > 0 ? _s.stop : null,
      tp: _s.target > 0 ? _s.target : null,
    );
    setState(() {});
  }

  void _paperExit() {
    PaperTradeStore.close();
    setState(() {});
  }

  // ===== Cards (missing in some patches) =====
  Widget entryGaugeCard(NeonTheme theme) {
    // Í∞ÑÎã® Í≤åÏù¥ÏßÄ: ?©Ïùò/ROI/?ïÎ•†
    // clamp()??num??Î∞òÌôò?òÎ?Î°?doubleÎ°??ïÏ†ï Ï∫êÏä§??    final double ev = (_s.evidenceTotal <= 0
            ? 0.0
            : (_s.evidenceHit / _s.evidenceTotal).clamp(0.0, 1.0).toDouble())
        .toDouble();
    final double roi = (_s.expectedRoiPct / 100.0).clamp(0.0, 1.0).toDouble();
    final double prob = (_s.signalProb / 100.0).clamp(0.0, 1.0).toDouble();

    Widget bar(String label, double v) {
      return Row(
        children: [
          SizedBox(width: 76, child: Text(label, style: TextStyle(color: theme.muted, fontSize: 11, fontWeight: FontWeight.w900))),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: v,
                minHeight: 10,
                backgroundColor: theme.stroke.withOpacity(0.25),
                valueColor: AlwaysStoppedAnimation<Color>(theme.good.withOpacity(0.85)),
              ),
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(width: 44, child: Text('${(v * 100).round()}%', style: TextStyle(color: theme.fg, fontSize: 11, fontWeight: FontWeight.w900))),
        ],
      );
    }

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: theme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('ÏßÑÏûÖ Í≤åÏù¥ÏßÄ', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
          const SizedBox(height: 10),
          bar('Í∑ºÍ±∞', ev),
          const SizedBox(height: 8),
          bar('ROI', roi),
          const SizedBox(height: 8),
          bar('?ïÎ•†', prob),
        ],
      ),
    );
  }

  // ?†Ìò∏ Î∂ÄÍ∑ºÏóê ?®Îäî "?åÎ¶º" Ïπ¥Îìú (Î∞òÏßù + ?¥Î¶≠ ???ÅÏÑ∏)
  Widget entryAlertCard(NeonTheme theme) {
    // ?ïÏ†ï ?†Ìò∏Îß??úÏãú (WATCH/LOCK/ROI<25/Í¥ÄÎß??úÏô∏)
    if (!_showSig) return const SizedBox.shrink();
    final g = _s.grade.toUpperCase();
    if (g == 'WATCH' || g == 'LOCK') return const SizedBox.shrink();
    if (_s.expectedRoiPct < 25) return const SizedBox.shrink();
    final d = _s.finalDir.toUpperCase();
    if (d != 'LONG' && d != 'SHORT') return const SizedBox.shrink();

    final dir = _s.finalDir.toUpperCase();
    final dirKo = dir == 'LONG'
        ? 'Î°?
        : dir == 'SHORT'
            ? '??
            : 'Í¥ÄÎß?;

    final title = '$dirKo ?†Ìò∏(?¥Î¶≠)';

    void openDetail() {
      showDialog(
        context: context,
        barrierDismissible: true,
        builder: (_) {
          return AlertDialog(
            backgroundColor: const Color(0xFF0B1020),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            title: Text('ÏßÑÏûÖ ?åÎ¶º', style: TextStyle(color: theme.textPrimary)),
            content: SingleChildScrollView(
              child: DefaultTextStyle(
                style: TextStyle(color: theme.textSecondary, fontSize: 13),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Î∞©Ìñ•: $dirKo  / ?±Í∏â: ${_s.grade}'),
                    const SizedBox(height: 8),
                    Text('ÏßÑÏûÖ: ${_s.entry.toStringAsFixed(0)}'),
                    Text('?êÏ†à: ${_s.stop.toStringAsFixed(0)}'),
                    Text('Î™©Ìëú: ${_s.target.toStringAsFixed(0)}'),
                    const SizedBox(height: 8),
                    Text('?àÎ≤ÑÎ¶¨Ï?: ${_s.leverage.toStringAsFixed(1)}x'),
                    Text('?òÎüâ: ${_s.qty.toStringAsFixed(4)}'),
                    Text('RR: ${_s.rr.toStringAsFixed(2)}  / Î¶¨Ïä§?? 5%'),
                    const SizedBox(height: 10),
                    Text('?§Ïùå ?°ÏÖò(Íµ¨Ï°∞/Î∞òÏùë):', style: TextStyle(color: theme.textPrimary)),
                    const SizedBox(height: 6),
                    ..._s.signalBullets
                        .where((b) => b.contains('Íµ¨Ï°∞') || b.contains('?åÌåå') || b.contains('Î∞òÏùë'))
                        .take(4)
                        .map((b) => Padding(
                              padding: const EdgeInsets.only(bottom: 2),
                              child: Text('??$b'),
                            )),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: Text('?´Í∏∞', style: TextStyle(color: theme.accent)),
              ),
            ],
          );
        },
      );
    }

    return GestureDetector(
      onTap: openDetail,
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: 0.0, end: 1.0),
        duration: const Duration(milliseconds: 900),
        curve: Curves.easeInOut,
        builder: (context, t, child) {
          final glow = 8.0 + (t * 10.0);
          return Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: const Color(0xFF0F1630),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: theme.accent.withOpacity(0.35)),
              boxShadow: [
                BoxShadow(
                  color: theme.accent.withOpacity(0.18),
                  blurRadius: glow,
                  spreadRadius: 1,
                ),
              ],
            ),
            child: Row(
              children: [
                Icon(Icons.notifications_active, color: theme.accent, size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: TextStyle(color: theme.textPrimary, fontSize: 14, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 2),
                      Text(
                        'ÏßÑÏûÖ ${_s.entry.toStringAsFixed(0)} / ?êÏ†à ${_s.stop.toStringAsFixed(0)} / Î™©Ìëú ${_s.target.toStringAsFixed(0)}',
                        style: TextStyle(color: theme.textSecondary, fontSize: 12),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Icon(Icons.chevron_right, color: theme.textSecondary, size: 18),
              ],
            ),
          );
        },
      ),
    );
  }

  void _showEntryDialog(NeonTheme theme, String dirKo) {
    final entry = _s.entry;
    final stop = _s.stop;
    final target = _s.target;
    final lev = _s.leverage;
    final qty = _s.qty;
    final rr = (entry > 0 && (entry - stop).abs() > 0)
        ? ((target - entry).abs() / (entry - stop).abs())
        : 0.0;
    const riskPct = 5.0;

    final structTag = (_s.structureTag ?? '').trim();
    final breakLv = _s.breakLevel;
    final rLow = _s.reactLow;
    final rHigh = _s.reactHigh;

    final levelLines = <String>[];
    if (structTag.isNotEmpty) levelLines.add('Íµ¨Ï°∞: $structTag');
    if (breakLv > 0) levelLines.add('Íµ¨Ï°∞ ?åÌååÍ∞Ä: ${breakLv.toStringAsFixed(0)}');
    if (rLow > 0 && rHigh > 0) {
      levelLines.add('?òÎèåÎ¶?Î∞òÏùëÍµ¨Í∞Ñ: ${rLow.toStringAsFixed(0)} ~ ${rHigh.toStringAsFixed(0)}');
    }

    showDialog(
      context: context,
      builder: (_) {
        return Dialog(
          backgroundColor: const Color(0xFF0B0F17),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text('ÏßÑÏûÖ ?åÎ¶º', style: TextStyle(color: theme.text, fontSize: 16, fontWeight: FontWeight.w800)),
                    const Spacer(),
                    IconButton(
                      icon: Icon(Icons.close, color: theme.text.withOpacity(.75)),
                      onPressed: () => Navigator.of(context).pop(),
                    )
                  ],
                ),
                const SizedBox(height: 8),
                Text('$dirKo ?ïÏ†ï(Í≥†ÌôïÎ•?', style: TextStyle(color: theme.accent, fontSize: 14, fontWeight: FontWeight.w700)),
                const SizedBox(height: 12),
                _kv('ÏßÑÏûÖ', entry.toStringAsFixed(0), theme),
                _kv('?êÏ†à', stop.toStringAsFixed(0), theme),
                _kv('Î™©Ìëú', target.toStringAsFixed(0), theme),
                const SizedBox(height: 10),
                _kv('?àÎ≤ÑÎ¶¨Ï?', lev.toStringAsFixed(1) + 'x', theme),
                _kv('?òÎüâ', qty.toStringAsFixed(4), theme),
                _kv('RR', rr.toStringAsFixed(2), theme),
                _kv('Î¶¨Ïä§??, riskPct.toStringAsFixed(0) + '%', theme),
                if (levelLines.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text('?§Ïùå ?ïÏù∏ Í∞ÄÍ≤?, style: TextStyle(color: theme.text, fontSize: 13, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  for (final l in levelLines)
                    Text('??$l', style: TextStyle(color: theme.text.withOpacity(.85), fontSize: 12)),
                ],
                const SizedBox(height: 10),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: Text('?ïÏù∏', style: TextStyle(color: theme.accent)),
                  ),
                )
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _kv(String k, String v, NeonTheme theme) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          SizedBox(width: 72, child: Text(k, style: TextStyle(color: theme.text.withOpacity(.7), fontSize: 12))),
          Text(v, style: TextStyle(color: theme.text, fontSize: 12, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }

  // ?†Ìò∏ Ïπ¥Îìú Î∞îÎ°ú ?ÑÎûò??Î∂ôÎäî ?úÏ¥àÍ∞ÑÎã® ÏßÑÏûÖ ?åÎûú??(??ÉÅ ?†Ìò∏ Í∑ºÏ≤ò?êÏÑú Î≥¥Ïù¥Í≤?
  Widget quickPlanInlineStrip(NeonTheme theme) {
    if (!_showSig) return const SizedBox.shrink();
    final dir = _s.finalDir.toUpperCase();
    final c = (dir == 'LONG') ? theme.good : (dir == 'SHORT') ? theme.bad : theme.warn;

    final e = _s.entry;
    final sl = _s.stop;
    final tp = _s.target;
    final lev = _s.leverage;
    final qty = _s.qty;
    final rr = _s.rr;

    String fmt(num v) => v.toStringAsFixed(0);

    return InkWell(
      onTap: () => _openEntryDetail(theme),
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        decoration: BoxDecoration(
          color: theme.card,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: c.withOpacity(0.55)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Text('?§Ïùå ?°ÏÖò', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900, fontSize: 12)),
                const Spacer(),
                Text('${_s.grade}', style: TextStyle(color: c, fontWeight: FontWeight.w900, fontSize: 12)),
              ],
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _chip('ÏßÑÏûÖ', fmt(e), theme, c),
                _chip('?êÏ†à', fmt(sl), theme, c),
                _chip('Î™©Ìëú', fmt(tp), theme, c),
                _chip('?àÎ≤Ñ', lev.toStringAsFixed(1) + 'x', theme, c),
                _chip('?òÎüâ', qty.toStringAsFixed(4), theme, c),
                _chip('RR', rr.toStringAsFixed(2), theme, c),
              ],
            ),
            const SizedBox(height: 6),
            if (_s.structureTag.isNotEmpty && _s.reactLow > 0 && _s.reactHigh > 0)
              Text(
                'Î∞òÏùëÍµ¨Í∞Ñ ${_s.reactLow.toStringAsFixed(1)} ~ ${_s.reactHigh.toStringAsFixed(1)}',
                style: TextStyle(color: theme.muted, fontWeight: FontWeight.w800, fontSize: 11),
                overflow: TextOverflow.ellipsis,
              ),
          ],
        ),
      ),
    );
  }

  Widget _chip(String k, String v, NeonTheme theme, Color c) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: c.withOpacity(0.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: c.withOpacity(0.45)),
      ),
      child: Text('$k $v', style: TextStyle(color: theme.fg, fontSize: 11, fontWeight: FontWeight.w900)),
    );
  }

  Widget quickPlanCard(NeonTheme theme) {
    final hasPlan = _s.entry > 0 && _s.stop > 0 && _s.target > 0;
    final dirKo = _biasText(_s.signalDir);
    final lev = _s.leverage.toStringAsFixed(1);
    final qty = _s.qty.toStringAsFixed(4);
    final rr = (hasPlan && (_s.entry - _s.stop).abs() > 0)
        ? ((_s.target - _s.entry).abs() / (_s.entry - _s.stop).abs()).toStringAsFixed(2)
        : '--';

    String line(String k, String v) => '$k  $v';

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: theme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('???åÎûú', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
              const Spacer(),
              Text(dirKo, style: TextStyle(color: theme.good, fontWeight: FontWeight.w900)),
            ],
          ),
          const SizedBox(height: 10),
          Text(line('ÏßÑÏûÖ', hasPlan ? _s.entry.toStringAsFixed(0) : '--'), style: TextStyle(color: theme.fg, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text(line('?êÏ†à', hasPlan ? _s.stop.toStringAsFixed(0) : '--'), style: TextStyle(color: theme.fg, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text(line('Î™©Ìëú', hasPlan ? _s.target.toStringAsFixed(0) : '--'), style: TextStyle(color: theme.fg, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Text('?àÎ≤ÑÎ¶¨Ï? $lev  ¬∑  ?òÎüâ $qty  ¬∑  RR $rr  ¬∑  5% Î¶¨Ïä§??, style: TextStyle(color: theme.muted, fontSize: 12, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }

  // === Í≤∞Ï†ï Í≤åÏù¥??Ïπ¥Îìú ===
  // - ?©Ïùò(consensusOk), ROI(25% Í≤åÏù¥??, NO-TRADE(locked), ÏµúÏ¢Ö ?†Ìò∏(showSignal)
  // - Í∑∏Î¶¨Í≥??§Ï†Ñ ?åÎûú(ÏßÑÏûÖ/?êÏ†à/TP/?àÎ≤Ñ/?òÎüâ)???úÎàà??Î≥¥Ïó¨Ï§Ä??
  
  Widget _decisionConfidenceCard(NeonTheme theme) {
    // Î©Ä?∞TF ?©Ïùò??NEUTRAL ?úÏô∏, ?ÑÏû¨ ?†Ìò∏ Î∞©Ìñ• Í∏∞Ï?)
    final dir = _s.signalDir.toUpperCase();
    int total = 0;
    int agree = 0;
    if (_s.mtfPulse.isNotEmpty) {
      for (final e in _s.mtfPulse.entries) {
        final d = e.value.dir.toUpperCase();
        if (d.contains('NEUTRAL')) continue;
        total++;
        if (dir.contains('LONG') && d.contains('LONG')) agree++;
        if (dir.contains('SHORT') && d.contains('SHORT')) agree++;
      }
    }
    final consensusPct = total == 0 ? 0 : ((agree / total) * 100).round();

    final evPct = _s.evidenceTotal <= 0
        ? 0
        : ((_s.evidenceHit / _s.evidenceTotal) * 100).round();

    final roiPct = (_s.roiPotential * 100).clamp(0, 999).toDouble(); // 0~999%
    final roiGate = (roiPct / 25.0 * 100.0).clamp(0.0, 120.0); // 25%Î©?100??
    // ?†Î¢∞???êÏàò(?úÏãú??: ?îÏßÑ confidence + ?©Ïùò/ROI/Ï¶ùÍ±∞/Î¶¨Ïä§?¨Î? Í∞ÄÎ≥çÍ≤å Î≥¥Ï†ï
    double trust = 0;
    trust += (_s.confidence.toDouble().clamp(0, 100)) * 0.45;
    trust += consensusPct.toDouble().clamp(0, 100) * 0.25;
    trust += roiGate * 0.20;
    trust += evPct.toDouble().clamp(0, 100) * 0.15;
    trust -= (_s.risk.toDouble().clamp(0, 100)) * 0.15;
    trust = trust.clamp(0.0, 100.0);

    String grade;
    if (trust >= 80) {
      grade = 'S';
    } else if (trust >= 65) {
      grade = 'A';
    } else if (trust >= 50) {
      grade = 'B';
    } else {
      grade = 'C';
    }

    final locked = _s.locked;
    final lockReason = _s.lockedReason.isEmpty ? '?†Í∏à ?ÜÏùå' : _s.lockedReason;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.card.withOpacity(0.92),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: theme.border.withOpacity(0.55)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                'Í≤∞Ï†ï ?†Î¢∞??,
                style: TextStyle(
                  color: theme.fg,
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: (trust >= 65 ? theme.good : theme.warn).withOpacity(0.18),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: theme.border.withOpacity(0.35)),
                ),
                child: Text(
                  '$grade  ${(trust).toStringAsFixed(0)}/100',
                  style: TextStyle(
                    color: trust >= 65 ? theme.good : theme.warn,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              value: trust / 100.0,
              minHeight: 10,
              backgroundColor: theme.border.withOpacity(0.25),
              valueColor: AlwaysStoppedAnimation<Color>(
                trust >= 80 ? theme.good : (trust >= 50 ? theme.warn : theme.bad),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _kvBox(theme, '?©Ïùò', '${consensusPct}%'),
              _kvBox(theme, 'ROI', '${roiPct.toStringAsFixed(0)}%'),
              _kvBox(theme, 'Ï¶ùÍ±∞', '${_s.evidenceHit}/${_s.evidenceTotal}'),
              _kvBox(theme, 'Î¶¨Ïä§??, '${_s.risk}%'),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Icon(
                locked ? Icons.lock : Icons.lock_open_rounded,
                size: 16,
                color: locked ? theme.bad : theme.good,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  locked ? 'Îß§Îß§Í∏àÏ?: $lockReason' : 'Í±∞Îûò Í∞Ä?? Ï°∞Í±¥ Ï∂©Ï°± ?úÎßå ÏßÑÏûÖ',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: locked ? theme.bad : theme.muted,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // === NO-TRADE ?ÅÏÑ∏ ?¨Ïú† Ïπ¥Îìú ===
  // - lockedReasonÍ∞Ä ?àÏúºÎ©??∞ÏÑ† ?úÏãú
  // - ?ÜÏúºÎ©??êÎäî Î∂ÄÏ°±ÌïòÎ©? Í≤åÏù¥???§Ìå®/?ÑÌóò ?†Ìò∏Î•??ÅÌÉúÍ∞íÏóê??Ï∂îÎ°†??Î≥¥Í∞ï
  Widget _noTradeReasonsCard(NeonTheme theme) {
    final locked = _s.locked;
    final raw = _s.lockedReason.trim();

    List<String> reasons = [];
    if (raw.isNotEmpty) {
      // Íµ¨Î∂Ñ???§Ïñë?òÍ≤å ?Ä?? Ï§ÑÎ∞îÍø?/ | / , / ¬∑ / /
      final normalized = raw
          .replaceAll('¬∑', '|')
          .replaceAll('/', '|')
          .replaceAll(',', '|')
          .replaceAll('\n', '|');
      reasons = normalized
          .split('|')
          .map((e) => e.trim())
          .where((e) => e.isNotEmpty)
          .toList();
    }

    // Î∂ÄÏ°±ÌïòÎ©?Î≥¥Í∞ï(?îÏßÑ ?ÑÎìú Í∏∞Î∞ò)
    void addIf(bool cond, String msg) {
      if (!cond) return;
      if (reasons.contains(msg)) return;
      reasons.add(msg);
    }

    // Í≤åÏù¥???§Ìå®???†Í∏à ?†Î¨¥?Ä Î¨¥Í??òÍ≤å Î≥¥Ïó¨Ï£ºÎ©¥ ?¥Ìï¥Í∞Ä Îπ†Î¶Ñ
    addIf(!_s.consensusOk, '?§Ï§ëTF ?©Ïùò Î∂ÄÏ°?);
    addIf(!_s.roiOk, '?àÏÉÅ ROI 25% ÎØ∏Îã¨');
    addIf(_s.risk >= 70, 'Î¶¨Ïä§??Í≥ºÎã§');
    addIf(_s.lossStreak >= 3, '?∞ÏÜç ?êÏã§(${_s.lossStreak})');

    // Íµ¨Ï°∞ Í≤ΩÍ≥†(Î≥¥Ïàò?ÅÏúºÎ°?
    final tag = _s.structureTag.toUpperCase();
    if (tag.contains('CHOCH')) {
      addIf(true, 'Íµ¨Ï°∞ ?ÑÌôò(CHOCH) Íµ¨Í∞Ñ');
    }

    // ?àÎ¨¥ Í∏∏Î©¥ ?ÅÏúÑ 5Í∞úÎßå
    if (reasons.length > 5) {
      reasons = reasons.take(5).toList();
    }

    final title = locked ? 'Îß§Îß§Í∏àÏ? ?¨Ïú†' : 'ÏßÑÏûÖ ?úÌïú ?¨Ïú†(Í≤åÏù¥??';
    final subtitle = locked
        ? '?†Í∏à ?ÅÌÉú: ?ÑÎûò Ï°∞Í±¥???¥Ï†ú?òÎ©¥ Í±∞Îûò Í∞Ä??
        : '?†Ìò∏Í∞Ä ?ïÏ†ï?òÎ†§Î©??ÑÎûò Ï°∞Í±¥???µÍ≥º?¥Ïïº ??;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.card.withOpacity(0.92),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: theme.border.withOpacity(0.55)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                locked ? Icons.block_rounded : Icons.info_outline_rounded,
                size: 16,
                color: locked ? theme.bad : theme.muted,
              ),
              const SizedBox(width: 6),
              Text(
                title,
                style: TextStyle(
                  color: theme.fg,
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: (locked ? theme.bad : theme.warn).withOpacity(0.14),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: theme.border.withOpacity(0.35)),
                ),
                child: Text(
                  locked ? 'LOCK' : 'GATE',
                  style: TextStyle(
                    color: locked ? theme.bad : theme.warn,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            subtitle,
            style: TextStyle(
              color: theme.muted,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 10),
          if (reasons.isEmpty)
            Text(
              '?ÑÏû¨ ?úÌïú ?¨Ïú† ?ÜÏùå',
              style: TextStyle(
                color: theme.good,
                fontSize: 12,
                fontWeight: FontWeight.w800,
              ),
            )
          else
            Column(
              children: reasons
                  .map(
                    (r) => Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('??', style: TextStyle(color: locked ? theme.bad : theme.warn, fontSize: 12, fontWeight: FontWeight.w900)),
                          Expanded(
                            child: Text(
                              r,
                              style: TextStyle(
                                color: theme.fg,
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  )
                  .toList(),
            ),
        ],
      ),
    );
  }

Widget _decisionGateCard(NeonTheme theme) {
    final dir = _s.signalDir.toUpperCase();
    final hasPlan = _s.entry > 0 && _s.stop > 0 && _s.target > 0;

    // Î©Ä?∞TF ?©Ïùò??NEUTRAL ?úÏô∏)
    int total = 0;
    int agree = 0;
    if (_s.mtfPulse.isNotEmpty) {
      for (final e in _s.mtfPulse.entries) {
        final d = e.value.dir.toUpperCase();
        if (d.contains('NEUTRAL')) continue;
        total++;
        if (dir.contains('LONG') && d.contains('LONG')) agree++;
        if (dir.contains('SHORT') && d.contains('SHORT')) agree++;
      }
    }
    final consensusPct = total == 0 ? 0 : ((agree / total) * 100).round();

    final roiPct = (_s.roiPotential * 100).clamp(0, 999).toStringAsFixed(0);

    // TP Î∂ÑÌï† ?àÎ≤®(?úÏãú??: 40/70/100%
    double tp1 = 0, tp2 = 0, tp3 = 0;
    if (hasPlan) {
      final move = (_s.target - _s.entry);
      tp1 = _s.entry + move * 0.40;
      tp2 = _s.entry + move * 0.70;
      tp3 = _s.target;
    }

    Widget badge(String t, bool ok, {String? sub}) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: ok ? theme.good.withOpacity(0.18) : theme.bad.withOpacity(0.16),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: ok ? theme.good.withOpacity(0.55) : theme.bad.withOpacity(0.45)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(t, style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900, fontSize: 12)),
            if (sub != null) ...[
              const SizedBox(width: 6),
              Text(sub, style: TextStyle(color: theme.muted, fontWeight: FontWeight.w900, fontSize: 11)),
            ]
          ],
        ),
      );
    }

    String fmt(double v) => v == 0 ? '--' : v.toStringAsFixed(0);
    String fmt4(double v) => v == 0 ? '--' : v.toStringAsFixed(4);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: theme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('Í≤∞Ï†ï Í≤åÏù¥??, style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
              const Spacer(),
              Text(_biasText(_s.signalDir), style: TextStyle(color: theme.good, fontWeight: FontWeight.w900)),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              badge('?©Ïùò', _s.consensusOk, sub: '${consensusPct}%'),
              badge('ROI', _s.roiOk, sub: '${roiPct}%'),
              badge('?†Í∏à', !_s.locked, sub: _s.locked ? 'Îß§Îß§Í∏àÏ?' : '?ïÏÉÅ'),
              badge('?ïÏ†ï', _showSig, sub: _showSig ? 'SIGNAL' : 'WATCH'),
            ],
          ),
          if (_s.locked && _s.lockedReason.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('?¨Ïú†: ${_s.lockedReason}', style: TextStyle(color: theme.muted, fontWeight: FontWeight.w800, fontSize: 12)),
          ],
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _kvBox(theme, 'ÏßÑÏûÖ', fmt(_s.entry)),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _kvBox(theme, '?êÏ†à', fmt(_s.stop)),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _kvBox(theme, 'TP3', fmt(tp3)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(child: _kvBox(theme, 'TP1', fmt(tp1))),
              const SizedBox(width: 8),
              Expanded(child: _kvBox(theme, 'TP2', fmt(tp2))),
              const SizedBox(width: 8),
              Expanded(child: _kvBox(theme, '?òÎüâ', fmt4(_s.qty))),
            ],
          ),
          const SizedBox(height: 8),
          Text('?àÎ≤ÑÎ¶¨Ï? ${_s.leverage.toStringAsFixed(1)}  ¬∑  5% Î¶¨Ïä§?? ¬∑  TP Î∂ÑÌï† 40/35/25',
              style: TextStyle(color: theme.muted, fontSize: 12, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }

  Widget _kvBox(NeonTheme theme, String k, String v) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        color: theme.bg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: theme.border.withOpacity(0.85)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(k, style: TextStyle(color: theme.muted, fontSize: 11, fontWeight: FontWeight.w900)),
          const SizedBox(height: 4),
          Text(v, style: TextStyle(color: theme.fg, fontSize: 13, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }

  // === Î©Ä?∞TF ?ïÎ†• ?îÏïΩ Ïπ¥Îìú ===
  // ?ÑÏû¨ TFÎß?Î≥¥Í≥† ?àÏñ¥?????òÏúÑ TFÍ∞Ä ?¥Îäê Î∞©Ìñ•?ºÎ°ú ÎØ∏ÎäîÏßÄ ?úÌïú?àÏóê??Î≥¥Ïó¨Ï£ºÍ∏∞ ?ÑÌïú ?ïÏ∂ï Î∑?  // - ?îÏßÑ(mtfPulse)???àÏúºÎ©?Í∑∏Í≤É???¨Ïö©
  // - ?ÜÏúºÎ©?tfSnap?ºÎ°ú fallback
  Widget _pressureSummaryCard(NeonTheme theme) {
    final rankNow = _tfRank(tf);

    // ÏßëÍ≥Ñ
    int upHigher = 0, dnHigher = 0, nuHigher = 0;
    int upLower = 0, dnLower = 0, nuLower = 0;

    void add(bool isHigher, String dir) {
      final d = dir.toUpperCase();
      if (d.contains('LONG')) {
        if (isHigher) upHigher++; else upLower++;
      } else if (d.contains('SHORT')) {
        if (isHigher) dnHigher++; else dnLower++;
      } else {
        if (isHigher) nuHigher++; else nuLower++;
      }
    }

    // pulse ?∞ÏÑ†
    if (_s.mtfPulse.isNotEmpty) {
      for (final e in _s.mtfPulse.entries) {
        final r = _tfRank(e.key);
        if (r == rankNow) continue;
        add(r > rankNow, e.value.dir);
      }
    } else {
      // fallback: tfSnap
      for (final e in tfSnap.entries) {
        final r = _tfRank(e.key);
        if (r == rankNow) continue;
        add(r > rankNow, e.value.direction);
      }
    }

    int netHigher = upHigher - dnHigher;
    int netLower = upLower - dnLower;

    String arrows(int net) {
      if (net >= 3) return '‚¨Ü‚¨Ü‚¨?;
      if (net == 2) return '‚¨Ü‚¨Ü';
      if (net == 1) return '‚¨?;
      if (net <= -3) return '‚¨á‚¨á‚¨?;
      if (net == -2) return '‚¨á‚¨á';
      if (net == -1) return '‚¨?;
      return '??;
    }

    Color cByNet(int net) {
      if (net > 0) return theme.good;
      if (net < 0) return theme.bad;
      return theme.stroke;
    }

    final higherTxt = '?ÅÏúÑTF ${arrows(netHigher)}  (L$upHigher / S$dnHigher)';
    final lowerTxt = '?òÏúÑTF ${arrows(netLower)}  (L$upLower / S$dnLower)';

    // ?ÑÏû¨ TF(ÏßÄÍ∏?Î≥¥Í≥† ?àÎäî TF)??Íµ¨Ï°∞ ?úÍ∑∏Î°?Í∞ÑÎã® ?úÏãú
    final st = _s.structureTag.toUpperCase();
    final nowBadge = st.contains('CHOCH')
        ? 'CHOCH'
        : (st.contains('BOS') ? 'BOS' : 'RANGE');

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: theme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('?ïÎ†• ?îÏïΩ', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: theme.bg,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: theme.border.withOpacity(0.6)),
                ),
                child: Text('?ÑÏû¨ $tf ¬∑ $nowBadge', style: TextStyle(color: theme.fg, fontSize: 12, fontWeight: FontWeight.w900)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(higherTxt, style: TextStyle(color: cByNet(netHigher), fontSize: 12, fontWeight: FontWeight.w900)),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(lowerTxt, textAlign: TextAlign.right, style: TextStyle(color: cByNet(netLower), fontSize: 12, fontWeight: FontWeight.w900)),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            '?¥ÏÑù: ?ÅÏúÑTF?Ä Í∞ôÏ? Î∞©Ìñ•?êÏÑú Î∞òÏùëÍµ¨Í∞Ñ ?ïÏ†ïÎ¥?+ ROI??5%???åÎßå ÏßÑÏûÖ',
            style: TextStyle(color: theme.muted, fontSize: 11, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }

  int _tfRank(String tfLabel) {
    switch (tfLabel) {
      case '1m':
        return 1;
      case '5m':
        return 2;
      case '15m':
        return 3;
      case '1h':
        return 4;
      case '4h':
        return 5;
      case '1D':
        return 6;
      case '1W':
        return 7;
      case '1M':
        return 8;
      default:
        return 0;
    }
  }

  String _tfKo(String tfLabel) {
    switch (tfLabel) {
      case '1m':
        return '1Î∂?;
      case '5m':
        return '5Î∂?;
      case '15m':
        return '15Î∂?;
      case '1h':
        return '1?úÍ∞Ñ';
      case '4h':
        return '4?úÍ∞Ñ';
      case '1D':
        return '?òÎ£®';
      case '1W':
        return 'Ï£?;
      case '1M':
        return '??;
      default:
        return tfLabel;
    }
  }

  // ??(1) Î©Ä??TF Ï¢ÖÍ?/ÎßàÍ∞ê ?ÅÌÉú Î∞? Ï¢ãÏùå/?ÄÍ∏??òÏÅ®
  Widget _mtfCloseBar(NeonTheme theme) {
    final pulse = _s.mtfPulse;

    // ?ÅÌÉú Í≤∞Ï†ï: ?ÑÌóò???íÏúºÎ©??òÏÅ®, Í∞ïÎèÑÍ∞Ä Ï∂©Î∂Ñ?òÎ©¥ Ï¢ãÏùå, Í∑????ÄÍ∏?    ({String word, Color color}) _statusFromPulse(FuTfPulse p) {
      final risk = p.risk.clamp(0, 100);
      final strength = p.strength.clamp(0, 100);
      final dirU = p.dir.toUpperCase();
      if (risk >= 65) return (word: '?òÏÅ®', color: theme.bad);
      if (dirU.contains('LONG') || dirU.contains('SHORT')) {
        if (strength >= 60) return (word: 'Ï¢ãÏùå', color: theme.good);
      }
      return (word: '?ÄÍ∏?, color: theme.warn);
    }

    ({String word, Color color}) _statusFromSnap(FuState? st) {
      if (st == null) return (word: '?ÄÍ∏?, color: theme.stroke);
      final dirU = st.direction.toUpperCase();
      // risk/score Í∏∞Î∞ò Í∞ÑÏù¥ ?êÏ†ï
      if (st.locked) return (word: '?òÏÅ®', color: theme.bad);
      if (dirU.contains('LONG') || dirU.contains('SHORT')) {
        if (st.prob >= 60) return (word: 'Ï¢ãÏùå', color: theme.good);
        return (word: '?ÄÍ∏?, color: theme.warn);
      }
      return (word: '?ÄÍ∏?, color: theme.warn);
    }

    Widget chip(String tfLabel) {
      final active = tfLabel == tf;
      final hasPulse = pulse.isNotEmpty && pulse.containsKey(tfLabel);
      final st = hasPulse ? _statusFromPulse(pulse[tfLabel]!) : _statusFromSnap(tfSnap[tfLabel]);
      final bg = st.color.withOpacity(active ? 0.18 : 0.12);
      final bd = st.color.withOpacity(active ? 0.75 : 0.45);
      return GestureDetector(
        onTap: () {
          setState(() => tf = tfLabel);
          _startRealtimeCandles();
          _startAutoRefresh();
          _refresh();
        },
        child: Container(
          margin: const EdgeInsets.only(right: 6),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: bd, width: active ? 1.2 : 1.0),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_tfKo(tfLabel), style: TextStyle(color: theme.text.withOpacity(0.9), fontSize: 11, fontWeight: FontWeight.w800)),
              const SizedBox(width: 6),
              Text(st.word, style: TextStyle(color: theme.text, fontSize: 11, fontWeight: FontWeight.w900)),
            ],
          ),
        ),
      );
    }

    return SizedBox(
      height: 34,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(children: tfs.map(chip).toList()),
      ),
    );
  }

  // ??(NEW) Î©Ä?∞TF ?úÎàà??Î∞?(Ï¢ÖÍ??ÅÌÉú+Î∞©Ìñ•????Ïπ©Ïóê ?©ÏπòÍ∏?
  // - ?ÅÎã®??1Ï§ÑÎßå ?êÍ≥†, Í≤πÏπ®/?§Î≤Ñ?åÎ°ú??Î∞©Ï?
  // - ??ïòÎ©?TF ?ÑÌôò
  Widget _mtfOneGlanceBar(NeonTheme theme) {
    final pulse = _s.mtfPulse;

    ({String word, Color color}) _statusFromPulse(FuTfPulse p) {
      final s = (p.closeState ?? '').toString().toLowerCase();
      if (s.contains('good') || s.contains('up') || s.contains('ok')) {
        return (word: 'Ï¢ãÏùå', color: const Color(0xFF2FE6A5));
      }
      if (s.contains('bad') || s.contains('down') || s.contains('weak')) {
        return (word: '?òÏÅ®', color: const Color(0xFFFF5B7A));
      }
      return (word: '?ÄÍ∏?, color: const Color(0xFFFFD36E));
    }

    IconData _dirIcon(String? d) {
      final s = (d ?? '').toLowerCase();
      if (s.contains('long') || s.contains('up') || s.contains('bull')) return Icons.arrow_upward_rounded;
      if (s.contains('short') || s.contains('down') || s.contains('bear')) return Icons.arrow_downward_rounded;
      return Icons.more_horiz_rounded;
    }

    String _dirWord(String? d) {
      final s = (d ?? '').toLowerCase();
      if (s.contains('long') || s.contains('up') || s.contains('bull')) return '?ÅÏäπ';
      if (s.contains('short') || s.contains('down') || s.contains('bear')) return '?òÎùΩ';
      return 'Ï§ëÎ¶Ω';
    }

    Widget chip(String tf, FuTfPulse p, {bool selected = false}) {
      final st = _statusFromPulse(p);
      final dirW = _dirWord(p.dirLabel);
      final dirI = _dirIcon(p.dirLabel);
      final pct = (p.dirProb ?? 0).clamp(0, 100);

      return InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => _setTf(tf),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: theme.card,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: selected ? const Color(0xFF2FE6A5) : theme.border,
              width: selected ? 1.2 : 1,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(tf, style: TextStyle(color: theme.textStrong, fontWeight: FontWeight.w700)),
              const SizedBox(width: 8),
              Icon(dirI, size: 14, color: st.color),
              const SizedBox(width: 2),
              Text(dirW, style: TextStyle(color: st.color, fontWeight: FontWeight.w700, fontSize: 12)),
              const SizedBox(width: 6),
              Text('${pct.toStringAsFixed(0)}%', style: TextStyle(color: theme.text, fontSize: 12)),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: st.color.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: st.color.withOpacity(0.35)),
                ),
                child: Text(st.word, style: TextStyle(color: st.color, fontWeight: FontWeight.w700, fontSize: 11)),
              ),
            ],
          ),
        ),
      );
    }

    final entries = <({String tf, FuTfPulse p})>[
      (tf: '1m', p: pulse.m1),
      (tf: '5m', p: pulse.m5),
      (tf: '15m', p: pulse.m15),
      (tf: '1h', p: pulse.h1),
      (tf: '4h', p: pulse.h4),
      (tf: '1D', p: pulse.d1),
      (tf: '1W', p: pulse.w1),
      (tf: '1M', p: pulse.mo1),
    ];

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: theme.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: theme.border),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            Text('?úÎàà??, style: TextStyle(color: theme.textStrong, fontWeight: FontWeight.w800)),
            const SizedBox(width: 10),
            for (final e in entries) ...[
              chip(e.tf, e.p, selected: _tf == e.tf),
              const SizedBox(width: 8),
            ],
          ],
        ),
      ),
    );
  }

  // ??(2) Î©Ä??TF Î∞©Ìñ•/?©Ïùò Î∞? ???ÅÏäπ) ??Ï§ëÎ¶Ω) ???òÎùΩ)
  Widget _mtfDirBar(NeonTheme theme) {
    final pulse = _s.mtfPulse;

    ({String icon, Color color}) _dirFromPulse(FuTfPulse p) {
      final dirU = p.dir.toUpperCase();
      if (dirU.contains('LONG')) return (icon: '??, color: theme.good);
      if (dirU.contains('SHORT')) return (icon: '??, color: theme.bad);
      return (icon: '??, color: theme.warn);
    }

    ({String icon, Color color}) _dirFromSnap(FuState? st) {
      if (st == null) return (icon: '??, color: theme.stroke);
      final dirU = st.direction.toUpperCase();
      if (dirU.contains('LONG')) return (icon: '??, color: theme.good);
      if (dirU.contains('SHORT')) return (icon: '??, color: theme.bad);
      return (icon: '??, color: theme.warn);
    }

    Widget chip(String tfLabel) {
      final active = tfLabel == tf;
      final d = (pulse.isNotEmpty && pulse.containsKey(tfLabel)) ? _dirFromPulse(pulse[tfLabel]!) : _dirFromSnap(tfSnap[tfLabel]);
      final bg = d.color.withOpacity(active ? 0.16 : 0.10);
      final bd = d.color.withOpacity(active ? 0.7 : 0.4);
      return Container(
        margin: const EdgeInsets.only(right: 6),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: bd, width: active ? 1.2 : 1.0),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_tfKo(tfLabel), style: TextStyle(color: theme.text.withOpacity(0.85), fontSize: 11, fontWeight: FontWeight.w800)),
            const SizedBox(width: 6),
            Text(d.icon, style: TextStyle(color: d.color, fontSize: 12, fontWeight: FontWeight.w900)),
          ],
        ),
      );
    }

    return SizedBox(
      height: 32,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(children: tfs.map(chip).toList()),
      ),
    );
  }



  // Pinned multi-TF signal row (shows all TF signals while viewing one TF)
  Widget _multiTfRow(BuildContext context, NeonTheme theme) {
    // ??Î©Ä?∞TF ?ïÏ∂ï ?§Ìä∏Î¶? tfSnap(Í∏∞Ï°¥) + mtfPulse(?†Í∑ú) ????ÏßÄ??    // - mtfPulseÍ∞Ä ?àÏúºÎ©? Î∞©Ìñ•/Íµ¨Ï°∞/?ÑÌóò/Î∞òÏùë/Í∞ïÎèÑ Í∏∞Î∞ò?ºÎ°ú ?úÌïú?àÏóê??    // - ?ÜÏúºÎ©? Í∏∞Ï°¥ tfSnap ?ïÎ≥¥Î°?fallback
    final pulse = _s.mtfPulse;

    Color _pickByPulse(FuTfPulse p) {
      final st = p.structure.toUpperCase();
      if (st.contains('CHOCH')) return theme.warn;
      if (p.dir.toUpperCase().contains('LONG')) return theme.good;
      if (p.dir.toUpperCase().contains('SHORT')) return theme.bad;
      return theme.stroke;
    }

    Widget chip(String tfLabel) {
      final active = tfLabel == tf;

      if (pulse.isNotEmpty && pulse.containsKey(tfLabel)) {
        final p = pulse[tfLabel]!;
        final c = _pickByPulse(p);
        final dir = p.dir.toUpperCase().contains('LONG')
            ? 'L'
            : (p.dir.toUpperCase().contains('SHORT') ? 'S' : '--');
        final strength = p.strength.clamp(0, 100);
        final risk = p.risk.clamp(0, 100);
        final inRx = p.inReaction;

        // ?ÑÌóò???íÏùÑ?òÎ°ù ?êÎ¶¨Í≤? Î∞òÏùëÍµ¨Í∞Ñ?¥Î©¥ ?åÎëêÎ¶?Í∞ïÏ°∞
        final bg = c.withOpacity(0.14 + (inRx ? 0.06 : 0.0));
        final border = c.withOpacity(active ? 0.85 : 0.55);

        return GestureDetector(
          onTap: () {
            setState(() => tf = tfLabel);
            _startRealtimeCandles();
            _startAutoRefresh();
            _refresh();
          },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            margin: const EdgeInsets.only(right: 8),
            decoration: BoxDecoration(
              color: bg,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: border,
                width: active ? 1.4 : (inRx ? 1.2 : 1.0),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                // ?ëÏ? ?? ?ÑÌóò/Î∞òÏùë ?êÎÇå
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: c.withOpacity(1.0 - (risk / 160.0)),
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 6),
                Text(tfLabel, style: TextStyle(color: theme.text.withOpacity(0.9), fontSize: 12, fontWeight: FontWeight.w700)),
                const SizedBox(width: 6),
                Text(dir, style: TextStyle(color: theme.text, fontSize: 12, fontWeight: FontWeight.w900)),
                const SizedBox(width: 6),
                Text(
                  (strength <= 0) ? '--' : '$strength%',
                  style: TextStyle(color: theme.text.withOpacity(0.9), fontSize: 12, fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
        );
      }

      // === fallback: Í∏∞Ï°¥ tfSnap ===
      final st = tfSnap[tfLabel];
      final dirStr = (st == null) ? 'NEUTRAL' : st.direction.toUpperCase();
      final dir = (dirStr.contains('LONG'))
          ? 'L'
          : (dirStr.contains('SHORT') ? 'S' : '--');
      final prob = (st == null) ? -1 : st.prob;
      final grade = (st == null) ? '...' : st.gradeLabel;
      final isLong = dirStr.contains('LONG');
      final isShort = dirStr.contains('SHORT');
      final bg = (st == null)
          ? theme.card.withOpacity(0.5)
          : (isLong ? theme.good.withOpacity(0.18) : (isShort ? theme.bad.withOpacity(0.18) : theme.card.withOpacity(0.5)));
      final border = (st == null)
          ? theme.stroke.withOpacity(0.3)
          : (isLong ? theme.good.withOpacity(0.55) : (isShort ? theme.bad.withOpacity(0.55) : theme.stroke.withOpacity(0.4)));

      return GestureDetector(
        onTap: () {
          setState(() => tf = tfLabel);
          _startRealtimeCandles();
          _startAutoRefresh();
          _refresh();
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          margin: const EdgeInsets.only(right: 8),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: active ? border : border.withOpacity(0.45), width: active ? 1.2 : 1),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(tfLabel, style: TextStyle(color: theme.text.withOpacity(0.85), fontSize: 12, fontWeight: FontWeight.w600)),
              const SizedBox(width: 6),
              Text(dir, style: TextStyle(color: theme.text, fontSize: 12, fontWeight: FontWeight.w900)),
              const SizedBox(width: 6),
              Text((prob < 0 ? '--' : '$prob%'), style: TextStyle(color: theme.text.withOpacity(0.9), fontSize: 12, fontWeight: FontWeight.w700)),
              const SizedBox(width: 6),
              Text(grade, style: TextStyle(color: theme.text.withOpacity(0.7), fontSize: 11, fontWeight: FontWeight.w600)),
            ],
          ),
        ),
      );
    }

    return SizedBox(
      height: 34,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(children: tfs.map(chip).toList()),
      ),
    );
  }

  // v10.4 SAFE: ?êÎèô Î≥µÍ∏∞(?òÏù¥???Ä?? - UI ÏµúÏÜå??  Widget _paperJournalCard(NeonTheme theme) {
    final recs = PaperTradeJournal.records;
    final last = recs.length <= 6 ? recs : recs.sublist(recs.length - 6);
    final w = PaperTradeJournal.wins();
    final l = PaperTradeJournal.losses();
    final wr = (PaperTradeJournal.winRate01(lastN: 50) * 100.0);
    String _fmt(int ms) {
      final dt = DateTime.fromMillisecondsSinceEpoch(ms);
      String two(int v) => v < 10 ? '0$v' : '$v';
      return '${two(dt.month)}-${two(dt.day)} ${two(dt.hour)}:${two(dt.minute)}';
    }
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: theme.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('?êÎèô Î≥µÍ∏∞', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900, fontSize: 12)),
              const Spacer(),
              Text('??$w ¬∑ ??$l ¬∑ ?πÎ•† ${wr.toStringAsFixed(0)}%', style: TextStyle(color: theme.muted, fontSize: 11, fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 8),
          if (last.isEmpty)
            Text('ÏµúÍ∑º Í∏∞Î°ù ?ÜÏùå', style: TextStyle(color: theme.muted, fontSize: 11, fontWeight: FontWeight.w700))
          else
            Column(
              children: [
                for (final r in last.reversed)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Row(
                      children: [
                        Text(_fmt(r.closedAt), style: TextStyle(color: theme.muted, fontSize: 10, fontWeight: FontWeight.w700)),
                        const SizedBox(width: 8),
                        Text(r.dir, style: TextStyle(color: r.dir == 'LONG' ? theme.good : theme.bad, fontSize: 10, fontWeight: FontWeight.w900)),
                        const SizedBox(width: 6),
                        Text(r.result, style: TextStyle(color: r.result == 'WIN' ? theme.good : (r.result == 'LOSS' ? theme.bad : theme.warn), fontSize: 10, fontWeight: FontWeight.w900)),
                        const Spacer(),
                        Text('${r.roiPct.toStringAsFixed(1)}%', style: TextStyle(color: theme.fg, fontSize: 10, fontWeight: FontWeight.w900)),
                      ],
                    ),
                  ),
              ],
            ),
        ],
      ),
    );
  }

  Widget _riskBrakePanel(FuState s) {
    if (!_rbReady) return const SizedBox.shrink();
    final conf = s.confidence.round().clamp(0, 100);
    final k = _rb.bucketKey(conf);
    final wr = _rb.winrateForBucket(k);
    final b = _rb.buckets[k]!;
    final w = b['w'] ?? 0;
    final l = b['l'] ?? 0;
    String cd = '';
    if (_rb.inCooldown) {
      final until = DateTime.fromMillisecondsSinceEpoch(_rb.cooldownUntilMs);
      cd = ' ¬∑ NO-TRADE ${until.hour.toString().padLeft(2, '0')}:${until.minute.toString().padLeft(2, '0')}';
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0x22FFFFFF)),
        color: const Color(0x11000000),
      ),
      child: Wrap(
        spacing: 10,
        runSpacing: 8,
        children: [
          Text('Î∏åÎ†à?¥ÌÅ¨: ${_rb.lossStreak}?∞Ìå®$cd',
              style: const TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w900)),
          Text('Íµ¨Í∞Ñ?πÎ•†[$k] ${wr.toStringAsFixed(1)}% (W/L $w/$l)',
              style: const TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }

  Future<void> _openTradeSettings() async {
    if (!_rbReady) return;
    await showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF0E0F14),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('?¥ÏòÅ ?§Ï†ï', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w900)),
                const SizedBox(height: 14),
                _settingTile(
                  title: 'Í∞ïÏ†úÍ≤∞Ï†ï',
                  subtitle: '??ÉÅ LONG/SHORT ?ïÏ†ï Ï∂úÎ†•',
                  value: _rb.forceDecisionOn,
                  onTap: () async {
                    await _rb.toggleForceDecision();
                    if (mounted) setState(() {});
                  },
                ),
                const SizedBox(height: 10),
                _settingTile(
                  title: 'Î¶¨Ïä§??Î∏åÎ†à?¥ÌÅ¨',
                  subtitle: '3?∞Ìå® R 0.25 / 5?∞Ìå® NO-TRADE',
                  value: _rb.brakeOn,
                  onTap: () async {
                    await _rb.toggleBrake();
                    if (mounted) setState(() {});
                  },
                ),
                const SizedBox(height: 10),
                _settingButton(
                  label: '?µÍ≥Ñ Î¶¨ÏÖã',
                  onTap: () async {
                    await _rb.resetStats();
                    if (mounted) setState(() {});
                    Navigator.pop(context);
                  },
                ),
                const SizedBox(height: 8),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _settingTile({required String title, required String subtitle, required bool value, required VoidCallback onTap}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0x22FFFFFF)),
          color: const Color(0x11000000),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 4),
                  Text(subtitle, style: const TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w700)),
                ],
              ),
            ),
            Container(
              width: 44,
              height: 28,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: const Color(0x22FFFFFF)),
                color: value ? const Color(0x221EEA6A) : const Color(0x11FFFFFF),
              ),
              child: Text(value ? 'ON' : 'OFF',
                  style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w900)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _settingButton({required String label, required VoidCallback onTap}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0x22FFFFFF)),
          color: const Color(0x11000000),
        ),
        child: Text(label, textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w900)),
      ),
    );
  }
}

class _TfHeaderDelegate extends SliverPersistentHeaderDelegate {
  final double height;
  final Widget child;
  _TfHeaderDelegate({required this.height, required this.child});

  @override
  double get minExtent => height;

  @override
  double get maxExtent => height;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Material(
      color: Colors.transparent,
      child: child,
    );
  }

  @override
  bool shouldRebuild(covariant _TfHeaderDelegate oldDelegate) {
    return height != oldDelegate.height || child != oldDelegate.child;
  }
}

class _ChartOverlaySettingsCard extends StatelessWidget {
  const _ChartOverlaySettingsCard();

  @override
  Widget build(BuildContext context) {
    final s = AppSettings.I;
    Widget sw(ValueNotifier<bool> v, String label) {
      return ValueListenableBuilder<bool>(
        valueListenable: v,
        builder: (context, on, _) {
          return Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(color: Colors.white70, fontSize: 12),
                ),
              ),
              Switch(
                value: on,
                onChanged: (x) => v.value = x,
              ),
            ],
          );
        },
      );
    }

    Widget slider(ValueNotifier<double> v, String label, {double min = 0.05, double max = 0.6}) {
      return ValueListenableBuilder<double>(
        valueListenable: v,
        builder: (context, val, _) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '$label ${(val * 100).round()}%'.replaceAll('%%', '%'),
                style: const TextStyle(color: Colors.white70, fontSize: 12),
              ),
              Slider(
                value: val,
                min: min,
                max: max,
                onChanged: (x) => v.value = x,
              ),
            ],
          );
        },
      );
    }

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF0E1424).withOpacity(0.6),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Ï∞®Ìä∏ ?úÏãú ?§Ï†ï', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          sw(s.showOB, 'OB(?§ÎçîÎ∏îÎ°ù)'),
          sw(s.showFVG, 'FVG'),
          sw(s.showBPR, 'BPR'),
          sw(s.showMB, 'MB'),
          sw(s.showBOS, 'BOS'),
          sw(s.showCHoCH, 'CHoCH'),
          const SizedBox(height: 10),
          slider(s.zoneOpacity, 'Íµ¨Í∞Ñ ?¨Î™Ö??, min: 0.05, max: 0.5),
          slider(s.labelOpacity, '?ºÎ≤® ?¨Î™Ö??, min: 0.3, max: 1.0),
        ],
      ),
    );
  }
}

// v10.6.5: MTF Ïπ??úÎàà???ºÎ≤®(?úÍ?)
String _kCloseLabel(String v) {
  switch (v) {
    case 'good': return 'Ï¢ãÏùå';
    case 'wait': return '?ÄÍ∏?;
    case 'bad': return '?òÏÅ®';
    case 'Î∞òÏùë': return 'Î∞òÏùë';
    case 'Ï¢ãÏùå': return 'Ï¢ãÏùå';
    case '?ÄÍ∏?: return '?ÄÍ∏?;
    case '?òÏÅ®': return '?òÏÅ®';
    case 'Ï£ºÏùò': return 'Ï£ºÏùò';
    default: return v.isEmpty ? '?ÄÍ∏? : v;
  }
}

String _kDirLabel(String v) {
  switch (v) {
    case 'up': return '?ÅÏäπ';
    case 'down': return '?òÎùΩ';
    case 'flat': return 'Ï§ëÎ¶Ω';
    case '?ÅÏäπ': return '?ÅÏäπ';
    case '?òÎùΩ': return '?òÎùΩ';
    case 'Í¥ÄÎß?: return 'Ï§ëÎ¶Ω';
    case 'Ï§ëÎ¶Ω': return 'Ï§ëÎ¶Ω';
    default: return v.isEmpty ? 'Ï§ëÎ¶Ω' : v;
  }
}

String _kDirIcon(String v) {
  final k = _kDirLabel(v);
  if (k == '?ÅÏäπ') return '??;
  if (k == '?òÎùΩ') return '??;
  return '??;
}

// ------------------------------------------------------------
// UI: Î©îÏù∏ ?∞Ï∏°?òÎã® Ï∞®Ìä∏ Î≤ÑÌäº (Î©îÏù∏ ?àÏù¥?ÑÏõÉ Î∂àÎ?)
// ------------------------------------------------------------

class _TyronBoltFab extends StatelessWidget {
  final VoidCallback onTap;
  const _TyronBoltFab({required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: t.card.withOpacity(0.86),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: t.accent.withOpacity(0.35), width: 1),
          boxShadow: [
            BoxShadow(
              color: t.accent.withOpacity(0.18),
              blurRadius: 18,
              spreadRadius: 0,
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.bolt, size: 18, color: t.accent),
            const SizedBox(width: 8),
            Text('?Ä?¥Î°±', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: t.fg)),
          ],
        ),
      ),
    );
  }
}

class _ChartFab extends StatelessWidget {

  final String label;
  final VoidCallback onTap;

  const _ChartFab({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: t.card.withOpacity(0.86),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: t.accent.withOpacity(0.35), width: 1),
          boxShadow: [
            BoxShadow(
              color: t.accent.withOpacity(0.18),
              blurRadius: 18,
              spreadRadius: 0,
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.show_chart, size: 18, color: t.accent),
            const SizedBox(width: 8),
            Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: t.fg)),
          ],
        ),
      ),
    );
  }
}