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
// 알림/수수료/계좌/레버리지 등 트레이딩 설정
// (패키지명 변경에 영향받지 않도록 상대경로 import 사용)
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

    // 브레이크 규칙
    // 3연패: R 0.25 강제(엔진에서 recommendR clamp)
    // 5연패: 쿨다운 30분 (NO-TRADE)
    if (lossStreak >= 5) {
      cooldownUntilMs = DateTime.now().add(const Duration(minutes: 30)).millisecondsSinceEpoch;
      lossStreak = 0; // 쿨다운 들어가면 streak 리셋
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

/// TYRON 퀵 결과 (LONG/SHORT/WAIT + % + 색상). _TyronChip 및 _tyronQuick에서 사용.
class _TyronQuickRes {
  final String dir;
  final int pct;
  final Color color;
  const _TyronQuickRes(this.dir, this.pct, this.color);
}

/// TYRON 칩 위젯. 상위에서 _tyronQuick 결과를 넘겨 표시.
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

// v10.7: 미니 토글 칩(표시만, 엔진 토글 연결은 다음 단계에서)
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

  bool _aExpanded = false; // A카드 펼침/접기

  // v10 SAFE: 스크롤 기반 미니 헤더(결론 요약) - Sliver 구조를 건드리지 않고 Stack으로 고정
  final ScrollController _scrollCtrl = ScrollController();
  final ValueNotifier<double> _scrollY = ValueNotifier<double>(0);

  final _engine = FuEngine();
  // 실시간 가격은 BitgetLiveStore에서 가져오며, 로컬 캐시 변수를 두지 않습니다.
  // (중복 선언/스코프 충돌 방지)
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


  // PROCION 개편: 1분 포함(고정)
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

  // v10.3 SAFE: 신뢰도 필터(UI 단독)
  // - confidence < 60 이면 '확정(showSignal)' 관련 UI를 WATCH로 다운그레이드
  // 트레이더 모드: 확정 신호는 더 보수적으로(남발 방지)
  bool get _confOk => _s.confidence >= 75;
  bool get _showSig => _s.showSignal && _confOk;

  // AI 패턴 모드(8종/15종) + 차트 오버레이
  PatternSetMode _patternMode = PatternSetMode.pro8;
  PatternPick? _pendingPick;
  List<MiniChartLine> _patternLines = const [];
  String _patternLabel = '';

  // 신호 변화(롱/숏/관망/LOCK) 시 상단 알림(토스트) 트리거용
  String _lastSignalToastKey = '';
  DateTime? _lastSignalToastAt;
  // "타점 구간"(진입 준비/도달) 알림 스팸 방지 키
  String _lastApproachToastKey = '';
  DateTime? _lastApproachToastAt;

  // 4H 확정 신호 알림(별도)
  String _lastH4ToastKey = '';
  DateTime? _lastH4ToastAt;

  void _openEntryDetail(NeonTheme theme) {
    final dir = _s.finalDir.toUpperCase();
    final dirKo = dir == 'LONG'
        ? '롱'
        : dir == 'SHORT'
            ? '숏'
            : '관망';

    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (_) {
        return AlertDialog(
          backgroundColor: const Color(0xFF0B1020),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: Text('진입 알림', style: TextStyle(color: theme.textPrimary)),
          content: SingleChildScrollView(
            child: DefaultTextStyle(
              style: TextStyle(color: theme.textSecondary, fontSize: 13),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('방향: $dirKo  / 등급: ${_s.grade}'),
                  const SizedBox(height: 8),
                  Text('진입: ${_s.entry.toStringAsFixed(0)}'),
                  Text('손절: ${_s.stop.toStringAsFixed(0)}'),
                  Text('목표: ${_s.target.toStringAsFixed(0)}'),
                  const SizedBox(height: 8),
                  Text('레버리지: ${_s.leverage.toStringAsFixed(1)}x'),
                  Text('수량: ${_s.qty.toStringAsFixed(4)}'),
                  Text('RR: ${_s.rr.toStringAsFixed(2)}  / 리스크: 5%'),
                  const SizedBox(height: 10),
                  Text('다음 액션(구조/반응):', style: TextStyle(color: theme.textPrimary)),
                  const SizedBox(height: 6),
                  ..._s.signalBullets
                      .where((b) => b.contains('구조') || b.contains('돌파') || b.contains('반응'))
                      .take(5)
                      .map((b) => Padding(
                            padding: const EdgeInsets.only(bottom: 2),
                            child: Text('• $b'),
                          )),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text('닫기', style: TextStyle(color: theme.accent)),
            ),
          ],
        );
      },
    );
  }

  // ✅ 메인 우측하단 [차트] 버튼 → 전체화면(좌 차트 / 우 미래경로)
  void _openFullChart(double livePrice) {
    if (!mounted) return;
    if (_s.candles.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('차트 데이터 로딩 중… 잠시 후 다시 시도')),
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

  // v10 SAFE: 스크롤 시에도 항상 보이는 '결론 요약' 미니 헤더
  Widget _stickyDecisionBar(NeonTheme theme, double livePrice) {
    final dir = _s.finalDir.toUpperCase();
    final dirKo = dir.contains('LONG')
        ? '롱'
        : dir.contains('SHORT')
            ? '숏'
            : '관망';

    final locked = _s.locked || !_showSig;
    final lockLabel = locked ? (_s.noTradeReason.isNotEmpty ? _s.noTradeReason : '매매금지') : '정상';
    final probPct = (_s.probFinal * 100).round();
    final roi = _s.expectedRoiPct;

    // v10.1: 실전 플랜 요약(5% 리스크 기반 산출값)
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
          // NeonTheme 호환: line/ok/danger가 없는 테마가 있어 border/good/bad로 매핑
          border: Border.all(color: theme.border.withOpacity(0.55)),
        ),
        child: Row(
          children: [
            _miniBadge(theme, '결론', dirKo),
            const SizedBox(width: 6),
            _miniBadge(theme, '확률', '$probPct%'),
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
        // TF를 바꿔서 보고 싶어 하니, 선택한 TF로 이동 후 데이터 갱신
        setState(() {
          _patternMode = mode;
          _pendingPick = pick;
          tf = pickTf;
          _patternLabel = _modeName(mode) + ' · ' + pick.name;
        });
        _startRealtimeCandles();
        _startAutoRefresh();
        _refresh();
      },
    );
  }

  String _modeName(PatternSetMode m) => (m == PatternSetMode.pro8) ? '실전 8종' : '타이롱 15종';

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

    // 최근 구간만 사용(너무 길면 노이즈)
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

    // 앞/뒤 두 구간으로 극값 추출
    final mid = start + (win ~/ 2);
    final hi1 = maxHigh(start, mid);
    final hi2 = maxHigh(mid, n - 1);
    final lo1 = minLow(start, mid);
    final lo2 = minLow(mid, n - 1);

    // 기본 2라인(상단/하단)
    MiniChartLine upper(Color col, {double w = 2.0}) => MiniChartLine(i1: start, i2: n - 1, p1: hi1, p2: hi2, color: col, width: w);
    MiniChartLine lower(Color col, {double w = 2.0}) => MiniChartLine(i1: start, i2: n - 1, p1: lo1, p2: lo2, color: col, width: w);

    switch (key) {
      case 'triangle':
        return [upper(Colors.white), lower(Colors.white)];
      case 'wedge_up':
        // 상승쐐기: 두 라인 상승 + 수렴
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
        // 간단: 하단 지지선 + 짧은 채널
        return [lower(Colors.white, w: 2.2)];
      case 'bear_flag':
        return [upper(Colors.white, w: 2.2)];
      case 'hs':
        // 목선(중간 저점)
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

    // NOTE: 이 함수는 BuildContext/Theme에 직접 접근하지 않음.
    // 라인 색상은 MiniChartPainter에서 기본(앱의 accent)로 처리하도록 null 유지.

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
        // 타이롱 확장 패턴은 기본적으로 삼각/채널 스타일로 안전하게 표현
        return [
          MiniChartLine(i1: a1, i2: b2, p1: sh1, p2: sh2, color: null, width: 1.6),
          MiniChartLine(i1: a1, i2: b2, p1: sl1, p2: sl2, color: null, width: 1.6),
        ];
    }
  }

  void _openTradingSettingsSheet(NeonTheme theme) {
    final accCtl = TextEditingController(text: AppSettings.accountUsdt.toStringAsFixed(0));
    // feeRoundTrip은 소수(0.0008)로 저장하므로 UI는 퍼센트(0.08)로 보여줌
    final feeCtl = TextEditingController(text: (AppSettings.feeRoundTrip * 100).toStringAsFixed(3));
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
                  Text('트레이딩 설정', style: TextStyle(color: theme.textPrimary, fontSize: 16, fontWeight: FontWeight.w900)),
                  const Spacer(),
                  IconButton(
                    onPressed: () => Navigator.pop(ctx),
                    icon: Icon(Icons.close, color: theme.textSecondary),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text('리스크는 5% 고정(자동 계산)', style: TextStyle(color: theme.textSecondary, fontSize: 12, fontWeight: FontWeight.w700)),
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
                          Text('알림', style: TextStyle(color: theme.textPrimary, fontWeight: FontWeight.w900)),
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
              field('계좌(USDT)', accCtl, hint: '예: 1000'),
              field('왕복 수수료(%)', feeCtl, hint: '예: 0.08'),
              field('레버리지(0=자동)', levCtl, hint: '예: 10'),
              field('확정 최소확률', sigProbCtl, hint: '예: 65'),
              field('알림 최소확률', notiProbCtl, hint: '예: 70'),
              field('알림 쿨다운(분)', cdCtl, hint: '예: 10'),
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
                      child: const Text('적용', style: TextStyle(fontWeight: FontWeight.w900)),
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

    // 상단 알림(클릭 시 상세)
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final dir = st.finalDir.toUpperCase();
      final dirKo = dir == 'LONG'
          ? '롱'
          : dir == 'SHORT'
              ? '숏'
              : '관망';
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
                '$dirKo 신호 · 진입 ${st.entry.toStringAsFixed(0)} / SL ${st.stop.toStringAsFixed(0)} / TP ${st.target.toStringAsFixed(0)}',
                style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900, fontSize: 12),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        action: SnackBarAction(
          label: '보기',
          textColor: theme.accent,
          onPressed: () => _openEntryDetail(theme),
        ),
      );
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(bar);

      // 폰 진동(가벼운 햅틱) - 확정 신호 발생 시 1회
      // (플러그인 추가 없이 기본 햅틱만 사용)
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
    // 타점 구간 도달 알림 (확정 전 단계)
    if (!mounted) return;
    if (!AppSettings.notifyEnabled) return;
    if (st.locked) return;
    if (!st.showSignal) return;
    if (st.expectedRoiPct < 25) return;
    final p = st.signalProb.clamp(0, 100);
    if (p < 65) return;
    // 접근 알림은 확정보다 낮은 컷을 허용하되, 최소 확률 옵션을 존중
    if (p < (AppSettings.notifyMinProb - 5).clamp(60, 100)) return;

    final g = st.grade.toUpperCase();
    // 확정/강한 신호는 _maybeShowSignalToast에서 처리하므로 여기서는 WATCH/준비 단계만
    if (g != 'WATCH' && g != 'LOCK') return;

    final dir = st.finalDir.toUpperCase();
    final dirKo = (dir == 'LONG') ? '롱' : (dir == 'SHORT') ? '숏' : '관망';
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
                '타점 도달(준비) · $dirKo · 확률 $p% · 근거 ${st.evidenceHit}/${st.evidenceTotal}',
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

  // ✅ 4H(4시간) 확정 신호 알림: 사용자가 5분을 보고 있어도 4H 확정은 바로 알 수 있게.
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

    final dirKo = (dir == 'LONG') ? '오르는 쪽' : '내리는 쪽';
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
                '4시간 확정 · $dirKo · 확률 $p% · 진입 ${st.entry.toStringAsFixed(0)} / 손절 ${st.stop.toStringAsFixed(0)} / 익절 ${st.target.toStringAsFixed(0)}',
                style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900, fontSize: 12),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        action: SnackBarAction(
          label: '보기',
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

  // BitgetLiveStore ValueNotifier listener (실시간 가격/온라인 상태 UI 갱신)
  VoidCallback? _liveListener;

  double get livePrice => BitgetLiveStore.I.livePrice;

  // switches
  bool safeMode = false;
  bool enableApiSync = true;

  // ✅ 헤더 높이(오버플로우 방지): 화면 높이에 따라 자동 조절
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

    // v10 SAFE: 미니 헤더 표시를 위한 스크롤 추적
    _scrollCtrl.addListener(() {
      if (!_scrollY.hasListeners) return;
      _scrollY.value = _scrollCtrl.hasClients ? _scrollCtrl.offset : 0.0;
    });
    // 엔진 작동 신호 패널(디버그/사용자 확인용)
    EngineSignalHub.I.start();
    EngineSignalHub.I.ensureKey('price');
    EngineSignalHub.I.ensureKey('candle');
    EngineSignalHub.I.ensureKey('analysis');
    EngineSignalHub.I.ensureKey('pattern');
    EngineSignalHub.I.ensureKey('db');

    // 실시간 가격 스트림 시작
    BitgetLiveStore.I.start(symbol: symbol);

    // ticker가 갱신될 때마다 UI를 갱신(새로고침 없이도 가격 텍스트/차트가 움직이게)
    _liveListener = () {
      if (!mounted) return;
      final on = BitgetLiveStore.I.online.value;
      if (on) {
        EngineSignalHub.I.mark('price', detail: 'Bitget ticker');
      } else {
        // online=false인 상태가 계속되면 STALE로 보이게 됨
      }
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
    // resume 시 DB/튜닝 재주입 + 엔진 재가동
    Future.microtask(() async {
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

    // v10 SAFE: 스크롤/노티파이어 정리
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
        // 1분봉은 체감상 "실시간"이 핵심이라 더 자주 갱신
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

  /// TF별로 OB/FVG/BPR/구조 계산이 잘 잡히도록 캔들 수를 넉넉하게 확보.
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
        // 2019-07 ~ 현재(약 79봉) 기준, 넉넉하게
        return 220;
      default:
        return 400;
    }
  }

  void _startAutoRefresh() {
    _autoRefreshTimer?.cancel();
    // 분석/게이지는 너무 자주 돌릴 필요 없음 (네트워크/배터리 방어)
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
      EngineSignalHub.I.mark('candle', detail: '${tf} 캔들 ${list.length}개');
      // 실시간 캔들을 FuCandle로 변환해서 미니차트에 즉시 반영
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
      tfSnap[tf] = next; // 현재 TF 스냅샷 저장(매니저 패널/멀티TF 요약)
      tfSnapAt[tf] = DateTime.now();

    });



    _candleBus!.start();
  }

  
  Future<void> _refreshOtherTfs() async {
    // 선택 TF는 이미 _refresh()에서 갱신됨.
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

        // ✅ 4H FINAL: 자동 기록/승패 판정(가벼운 JSONL)
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
            _s = _s.copyWith(showSignal: false, decisionTitle: 'WATCH', finalDecisionReason: '강제결정 OFF');
          }
          if (_rbReady && _rb.brakeOn && _rb.inCooldown) {
            final until = DateTime.fromMillisecondsSinceEpoch(_rb.cooldownUntilMs);
            _s = _s.copyWith(
              locked: true,
              lockedReason: 'NO-TRADE(연속손실) · ${until.hour.toString().padLeft(2, '0')}:${until.minute.toString().padLeft(2, '0')}까지',
              showSignal: false,
              decisionTitle: 'NO-TRADE',
              finalDecisionReason: '연속 손실로 자동 차단(쿨다운)',
            );
          } else if (_rbReady && _rb.brakeOn && _rb.lossStreak >= 3) {
            _s = _s.copyWith(recommendR: 0.25, finalDecisionReason: '브레이크: 3연패 → R 0.25 고정 · ' + _s.finalDecisionReason);
          }
          setState(() {});
        }
      } catch (_) {
        // 조용히 무시(네트워크/파싱)
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

      // NO-TRADE 적용
      final locked = enableNoTradeLock ? st.locked : false;
      final lockedReason = enableNoTradeLock ? st.lockedReason : '';

      final prev = _s;
      final lp = livePrice;
      final mergedPrice = (lp > 0) ? lp : st.price;

      // ✅ 실시간 스트림/오토리프레시가 겹칠 때, "존(FVG/OB 등)"이 비워진 스냅샷이 들어오면
      // 기존 존을 유지해서 "보였다가 사라짐" 현상을 막는다.
      FuState st2 = st.copyWith(
        price: mergedPrice,
        locked: locked,
        lockedReason: lockedReason,
      );

      st2 = st2.copyWith(
        // 존은 누적/유지(비어있으면 prev 유지)
        fvgZones: st2.fvgZones.isNotEmpty ? st2.fvgZones : prev.fvgZones,
        obZones: st2.obZones.isNotEmpty ? st2.obZones : prev.obZones,
        bprZones: st2.bprZones.isNotEmpty ? st2.bprZones : prev.bprZones,
        mbZones: st2.mbZones.isNotEmpty ? st2.mbZones : prev.mbZones,

        // 구조/반응 구간도 간헐적 0으로 떨어지면 prev 유지
        structureTag: (st2.structureTag.isNotEmpty && st2.structureTag != 'NONE') ? st2.structureTag : prev.structureTag,
        breakLevel: (st2.breakLevel > 0) ? st2.breakLevel : prev.breakLevel,
        reactLevel: (st2.reactLevel > 0) ? st2.reactLevel : prev.reactLevel,
        reactLow: (st2.reactLow > 0) ? st2.reactLow : prev.reactLow,
        reactHigh: (st2.reactHigh > 0) ? st2.reactHigh : prev.reactHigh,
      );

      // 패턴 오버레이가 켜져있다면 패턴 신호도 점등
      if (_patternLabel.trim().isNotEmpty || _patternLines.isNotEmpty) {
        EngineSignalHub.I.mark('pattern', detail: _patternLabel.isEmpty ? 'overlay on' : _patternLabel);
      }

      if (mounted) {
        setState(() {
          _s = st2;
          tfSnap[tf] = st2;
          tfSnapAt[tf] = DateTime.now();
        });

        // 신호가 확정(4/5 합의 + ROI 게이트 등)으로 바뀌는 순간을 상단 알림으로 노출
        _maybeShowSignalToast(NeonTheme.of(context), st2);
        // 확정 전 "타점 구간" 도달 알림(준비 단계)
        _maybeShowApproachToast(NeonTheme.of(context), st2);

        // 패턴 선택이 대기 중이면(다른 TF로 이동 포함) 최신 캔들 기준으로 작도 갱신
        _applyPendingPatternIfAny(st2);
      }

      // Update other TF snapshots (throttled) so the user can see 5m/1h/4h/1D/1W/1M signals while staying on one TF.
      _refreshOtherTfs();

      if (enableLogging) {
        FuLogStore.append(st2);
        // SQLite: 신호/결과/자율보정 자동 기록
        unawaited(SqliteTradeRecorder.I.onState(st2));
      }
    } catch (_) {
      // keep last state
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _srNote(FuState s) {
    if (s.locked) return '거래금지';
    final range = (s.r1 - s.s1).abs().clamp(1.0, 1e18);
    final distToS = (s.price - s.s1).clamp(0.0, range);
    final distToR = (s.r1 - s.price).clamp(0.0, range);

    final base = (0.55 * s.confidence + 0.45 * s.score);
    final riskPenalty = (s.risk * 0.35);

    double hold = base - riskPenalty + (1 - (distToS / range)) * 18;
    double brk = base - riskPenalty + (1 - (distToR / range)) * 18;

    // NOTE: 프로젝트마다 signalDir 타입이 enum/String 등으로 달라질 수 있어서
    // (SignalDir enum 미존재로 컴파일 에러가 나는 경우가 있음)
    // 문자열 기반으로 안전하게 판별한다.
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
    return '지지방어 $holdPct% · 돌파 $brkPct%';
  }

  /// 미니차트 방향(편향) 텍스트 - 초보도 바로 이해하는 한글
  /// signalDir 타입이 int/enum/string 어떤 형태여도 안전하게 동작
  String _biasText(dynamic signalDir) {
    final v = signalDir;
    if (v is num) {
      if (v > 0) return '상승';
      if (v < 0) return '하락';
      return '중립';
    }
    final s = v.toString().toLowerCase();
    if (s.contains('long') || s.contains('up') || s.contains('bull')) return '상승';
    if (s.contains('short') || s.contains('down') || s.contains('bear')) return '하락';
    return '중립';
  }

  // =========================
  // Flow Radar 계산 (50/100 고정 방지)
  // - 엔진 값이 비어있으면 score/confidence/risk/evidence/signalDir로 대체 산출
  // =========================
  Map<String, int> _calcFlowRadar(FuState s) {
    int clampInt(num v) => (v.isNaN ? 0 : v.round()).clamp(0, 100);

    // 1) 원천값(엔진에서 들어오면 우선 사용)
    final int buyRaw = clampInt(s.tapeBuyPct);
    final int obRaw = clampInt(s.obImbalance);
    final int absRaw = clampInt(s.absorptionScore);
    final int instRaw = clampInt(s.instBias);
    final int whaleRaw = clampInt(s.whaleScore);
    final int whaleBuyRaw = clampInt(s.whaleBuyPct);
    final int sweepRaw = clampInt(s.sweepRisk);

    // 값이 “의미있게 들어온 것”으로 판단할 최소 조건
    bool hasReal =
        (buyRaw != 0 && buyRaw != 50) ||
        (obRaw != 0 && obRaw != 50) ||
        (absRaw != 0 && absRaw != 50) ||
        (instRaw != 0 && instRaw != 50) ||
        (whaleRaw != 0 && whaleRaw != 50) ||
        (whaleBuyRaw != 0 && whaleBuyRaw != 50) ||
        (sweepRaw != 0 && sweepRaw != 50);

    // 2) 실데이터가 없으면: UI용 “대체 계산”
    final double evRatio = (s.evidenceTotal <= 0)
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
  // 통합 방향 점수(0~100) + 초보 한줄 요약
  // - Flow Radar + 근거합의 + 신뢰/위험을 하나로 압축
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

    // 기본 50에서 시작해 가중치로 이동
    double score = 50.0;
    score += (buy - sell) * 0.22;        // 체결/힘 방향
    score += (inst - 50.0) * 0.16;       // 큰손 방향
    score += (whale - 50.0) * 0.14;      // 고래 영향
    score += (ob - 50.0) * 0.10;         // 호가 쏠림
    score += ev * 16.0;                  // 근거 합의
    score += (conf - 0.5) * 18.0;        // 신뢰
    score -= risk * 28.0;                // 위험

    if (s.locked) score -= 12.0;         // LOCK이면 추가 감점
    return score.round().clamp(0, 100);
  }

  String _dirKoFromScore(int ds) {
    if (ds >= 62) return '상승 우위';
    if (ds <= 38) return '하락 우위';
    return '관망';
  }

  String _oneLineWhy(FuState s, Map<String, int> radar, int ds) {
    if (s.locked && s.lockedReason.isNotEmpty) return s.lockedReason;
    // radar 기반 한줄
    final buy = radar['buy'] ?? 50;
    final inst = radar['inst'] ?? 50;
    final whale = radar['whale'] ?? 50;
    final sweep = radar['sweep'] ?? 50;
    final ev = (s.evidenceTotal <= 0) ? 0 : ((s.evidenceHit * 100) ~/ s.evidenceTotal);

    final parts = <String>[];
    parts.add('근거 ${s.evidenceHit}/${s.evidenceTotal}(${ev}%)');
    if (ds >= 62) {
      if (buy >= 55) parts.add('매수 힘');
      if (inst >= 58) parts.add('큰손 ↑');
      if (whale >= 62) parts.add('고래 ↑');
    } else if (ds <= 38) {
      if (buy <= 45) parts.add('매도 우세');
      if (inst <= 42) parts.add('큰손 ↓');
      if (whale <= 45) parts.add('고래 ↓');
    } else {
      parts.add('방향 불확실');
    }

    if (sweep >= 70) parts.add('쓸림주의');
    if (s.expectedRoiPct < 25) parts.add('25%조건 미달');

    return parts.take(4).join(' · ');
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
              Text('통합 브리핑', style: TextStyle(color: t.fg, fontSize: 12, fontWeight: FontWeight.w900)),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: c.withOpacity(0.14),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: c.withOpacity(0.55)),
                ),
                child: Text('$status · $dir', style: TextStyle(color: c, fontSize: 11, fontWeight: FontWeight.w900)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Text('방향점수 ', style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w800)),
              Text('$ds/100', style: TextStyle(color: t.fg, fontSize: 12, fontWeight: FontWeight.w900)),
              const SizedBox(width: 10),
              Text('합의 ${(ev * 100).round()}%', style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w800)),
              const Spacer(),
              Text('현재가 ${livePrice.toStringAsFixed(1)}', style: TextStyle(color: t.fg, fontSize: 11, fontWeight: FontWeight.w900)),
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
              Expanded(child: Text('지지 ${s.s1.toStringAsFixed(1)}', style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w800))),
              Expanded(child: Text('VWAP ${s.vwap.toStringAsFixed(1)}', textAlign: TextAlign.center, style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w800))),
              Expanded(child: Text('저항 ${s.r1.toStringAsFixed(1)}', textAlign: TextAlign.right, style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w800))),
            ],
          ),
        ],
      ),
    );
  }

  /// 구조(CHOCH/BOS) 돌파/이탈 후 "어디에서 반응해야 하는지"를 숫자 띠로 고정 표시
  /// - RANGE면 숨김
  Widget _reactionBand(NeonTheme t, FuState s) {
    final tag = s.structureTag.toUpperCase();
    if (tag == 'RANGE' || s.reactLow <= 0 || s.reactHigh <= 0) {
      return const SizedBox.shrink();
    }

    final bool isUp = tag.contains('UP');
    final Color c = isUp ? t.good : t.bad;
    final rs = ReactionStrengthEngine.build(s);
    final title = tag.startsWith('CHOCH') ? '구조전환(CHOCH)' : '구조돌파/이탈(BOS)';
    final action = isUp ? '되돌림에서 이 구간 지지면 LONG 유리' : '되돌림에서 이 구간 저항이면 SHORT 유리';

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
              Text('반응구간', style: TextStyle(color: t.fg, fontSize: 12, fontWeight: FontWeight.w900)),
              const Spacer(),
              // 강도(약/중/강/확정급)
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
              Text('반응가격 ${s.reactLevel.toStringAsFixed(1)}', style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w800)),
              const Spacer(),
              Text('${s.reactHigh.toStringAsFixed(1)}', style: TextStyle(color: t.fg, fontSize: 11, fontWeight: FontWeight.w900)),
            ],
          ),
          const SizedBox(height: 6),
          Text(action, style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w800, height: 1.15)),
          const SizedBox(height: 6),
          // 어디까지(목표)
          if (rs.targets.isNotEmpty && rs.targets[0] > 0) ...[
            Text(
              isUp
                  ? '반등 목표 ${rs.targets[0].toStringAsFixed(1)} / ${rs.targets[1].toStringAsFixed(1)} / ${rs.targets[2].toStringAsFixed(1)}'
                  : '눌림 목표 ${rs.targets[0].toStringAsFixed(1)} / ${rs.targets[1].toStringAsFixed(1)} / ${rs.targets[2].toStringAsFixed(1)}',
              style: TextStyle(color: t.fg, fontSize: 11, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 2),
            Text(rs.hint, style: TextStyle(color: t.muted, fontSize: 10.5, fontWeight: FontWeight.w800)),
          ],
        ],
      ),
    );
  }

  /// TYRON 퀵 시그널: 장대봉 기준 다음 1/3/5봉 상승 확률. LONG/SHORT/WAIT + %.
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

    // ✅ FINAL은 4시간(4h) 기준으로 계산
    final FuState src = tfSnap['4h'] ?? _s;

    // FuCandle → rt.Candle (TyronProEngine / _atr14 / _structureStop use data Candle)
    final rtCandles = src.candles.map((fc) => rt.Candle(
      t: DateTime.fromMillisecondsSinceEpoch(fc.ts),
      o: fc.open,
      h: fc.high,
      l: fc.low,
      c: fc.close,
      v: fc.volume,
    )).toList();

    // ✅ Tyron PRO decision (LONG/SHORT/NO TRADE + 확실%)
    final pro = TyronProEngine.analyze(rtCandles);
    int confirm = pro.confidence;
    String decision = pro.bias; // LONG/SHORT/NEUTRAL
    if (decision == 'NEUTRAL') decision = 'NO TRADE';
    if (confirm < AppSettings.signalMinProb) decision = 'NO TRADE';

    // 초보용 단어
    String decisionKo(String d) {
      final u = d.toUpperCase();
      if (u == 'LONG') return '오르는 쪽';
      if (u == 'SHORT') return '내리는 쪽';
      return '쉬기';
    }

    Color c = const Color(0xFF9CA3AF);
    if (decision == 'LONG') c = const Color(0xFF3BC6FF);
    if (decision == 'SHORT') c = const Color(0xFFFF4D6D);

    // ✅ TradePlan (entry/sl/tp/size/lev) : 구조(스윙) 기반 + 리스크 고정
    final last = rtCandles.isNotEmpty ? rtCandles.last : null;
    final entry = (last?.c ?? 0.0);
    final atr = _atr14(rtCandles);
    final stop = _structureStop(rtCandles, decision, entry, atr);
    final stopDist = (entry - stop).abs();
    final stopPct = (entry > 0) ? (stopDist / entry * 100.0) : 0.0;

    final riskUsd = AppSettings.accountUsdt * (AppSettings.riskPct / 100.0);
    final qty = (stopDist > 0) ? (riskUsd / stopDist) : 0.0; // BTC 수량(근사)
    final notional = qty * entry;
    double lev = (AppSettings.accountUsdt > 0) ? (notional / AppSettings.accountUsdt) : 0.0;
    if (AppSettings.leverageOverride > 0) lev = AppSettings.leverageOverride;
    lev = lev.clamp(0.0, AppSettings.leverageCap);

    final tp = _targetByRR(decision, entry, stop, rr: 2.0);

    // 표시용 근거(최대 4줄)
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
                  Text('확정 신호(4시간)', style: TextStyle(color: theme.fg, fontSize: 16, fontWeight: FontWeight.w900)),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: c.withOpacity(0.14),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: c.withOpacity(0.55)),
                    ),
                    child: Text('${decisionKo(decision)} · $confirm%', style: TextStyle(color: c, fontWeight: FontWeight.w900)),
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
                    _planRow(theme, '진입값', entry),
                    _planRow(theme, '손절값', stop),
                    _planRow(theme, '익절값', tp),
                    const Divider(height: 16, color: Color(0x22FFFFFF)),
                    Row(
                      children: [
                        Expanded(child: Text('손절폭', style: TextStyle(color: theme.muted, fontSize: 11, fontWeight: FontWeight.w900))),
                        Text('${stopPct.toStringAsFixed(2)}%', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Expanded(child: Text('수량', style: TextStyle(color: theme.muted, fontSize: 11, fontWeight: FontWeight.w900))),
                        Text('${qty.toStringAsFixed(3)} BTC', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Expanded(child: Text('레버', style: TextStyle(color: theme.muted, fontSize: 11, fontWeight: FontWeight.w900))),
                        Text('${lev.toStringAsFixed(2)}x', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Expanded(child: Text('위험', style: TextStyle(color: theme.muted, fontSize: 11, fontWeight: FontWeight.w900))),
                        Text('${AppSettings.riskPct.toStringAsFixed(1)}%', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
                      ],
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 10),
              Text('근거', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
              const SizedBox(height: 6),
              ...reasons.map((e) => Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text('• $e', style: TextStyle(color: theme.muted, fontSize: 12)),
                  )),
              const SizedBox(height: 8),
              Text('※ 4시간 봉 마감 기준 자동 계산(손절/익절/레버 자동).', style: TextStyle(color: theme.muted, fontSize: 11)),
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
      // 너무 타이트하면 ATR 기준 완화
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
        title: Text('설정', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SwitchListTile(
              value: safeMode,
              onChanged: (v) => setState(() => safeMode = v),
              title: Text('SAFE 모드', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
              subtitle: Text('보수적으로 판단(초보용)', style: TextStyle(color: theme.muted)),
            ),
            SwitchListTile(
              value: enableApiSync,
              onChanged: (v) => setState(() => enableApiSync = v),
              title: Text('실시간 가격', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
              subtitle: Text('가능하면 거래소 가격 사용', style: TextStyle(color: theme.muted)),
            ),
            SwitchListTile(
              value: enableLogging,
              onChanged: (v) => setState(() => enableLogging = v),
              title: Text('기록 저장', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
              subtitle: Text('신호/판단 로그 저장', style: TextStyle(color: theme.muted)),
            ),
            SwitchListTile(
              value: enableNoTradeLock,
              onChanged: (v) => setState(() => enableNoTradeLock = v),
              title: Text('거래금지 잠금', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
              subtitle: Text('조건 나쁘면 “관망/거래금지”', style: TextStyle(color: theme.muted)),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Text('FX 쇼 모드', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
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
            child: Text('닫기', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(context).pop();
              _refresh();
            },
            child: Text('적용/새로고침', style: TextStyle(color: theme.good, fontWeight: FontWeight.w900)),
          ),
        ],
      ),
    );
  }



  


  // v10.2 SAFE: "진입 창(ENTRY WINDOW)" 배너
  // - Sliver 구조를 건드리지 않고 미니차트(Stack) 위에만 얹는다.
  // - FuState에 없는 필드(inReaction 등)는 사용하지 않는다.
  Widget _entryWindowBanner(NeonTheme t, FuState s) {
    final String dir = (s.signalDir).toString();
    final bool isLong = dir == 'LONG';
    final bool isShort = dir == 'SHORT';

    // 반응구간 판단(현재 TF): reactLevel 또는 reactLow~High가 유효하면 "반응 중"으로 간주
    final bool hasReact = (s.reactLevel != 0) || (s.reactLow != 0 && s.reactHigh != 0);

    // 진입 창 오픈 조건: 엔진 확정(showSignal) + 잠금 해제 + 기대 ROI 25% + 반응구간
    final bool open = s.showSignal && (s.confidence >= 75) && !s.locked && (s.expectedRoiPct >= 25.0) && (isLong || isShort) && hasReact;
    if (!open) return const SizedBox.shrink();

    final Color accent = isShort ? Colors.redAccent : Colors.greenAccent;
    final String title = isLong ? '진입 창 열림 · 롱' : '진입 창 열림 · 숏';

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
              '기대수익 ${s.expectedRoiPct.toStringAsFixed(0)}% · 확률 ${s.signalProb.toStringAsFixed(0)}%',
              style: TextStyle(color: t.muted, fontWeight: FontWeight.w800, fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }

  // ✅ v10.5 PROCION: 미니차트 상단 요약(현재 위치/세력/행동)
  // - 숫자/영문 최소화, 누구나 이해되는 한글 단어로만
  Widget _miniTopSummaryBar(NeonTheme t, double livePrice, Map<String, int> radar) {
    // 1) 현재 위치: 지지/저항/중간
    String pos;
    final s1 = _s.s1;
    final r1 = _s.r1;
    if (s1 > 0 && livePrice <= s1 * 1.002) {
      pos = '지지 근처';
    } else if (r1 > 0 && livePrice >= r1 * 0.998) {
      pos = '저항 근처';
    } else {
      pos = '중간 구간';
    }

    // 2) 세력 상태: 고래/기관/흡수 요약(간단)
    final whale = radar['whale'] ?? 50;
    final whaleBuy = radar['whaleBuy'] ?? 50;
    final inst = radar['inst'] ?? 50;
    final buy = radar['buy'] ?? 50;
    final sell = radar['sell'] ?? 50;
    String flow;
    if (whale >= 60 && whaleBuy >= 55 && inst >= 55) {
      flow = '세력 유입';
    } else if (whale <= 40 && sell > buy + 6) {
      flow = '세력 이탈';
    } else {
      flow = '혼조';
    }

    // 3) 행동 지침: 한 단어(분할/대기/관망/금지/확인)
    String act;
    if (_s.locked) {
      act = '지금은 금지';
    } else if (_showSig && _s.expectedRoiPct >= 25) {
      act = '분할 진입 가능';
    } else if (pos == '저항 근처') {
      act = '돌파 확인';
    } else if (pos == '지지 근처') {
      act = '눌림 대기';
    } else {
      act = '관망 유지';
    }

    Color cPos;
    if (pos.contains('지지')) {
      cPos = t.good;
    } else if (pos.contains('저항')) {
      cPos = t.warn;
    } else {
      cPos = t.stroke;
    }
    final cFlow = (flow == '세력 유입') ? t.good : (flow == '세력 이탈' ? t.bad : t.warn);
    final cAct = (act == '지금은 금지') ? t.bad : (act == '분할 진입 가능' ? t.good : t.warn);

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

  // ✅ v10.5 PROCION: AI 매니저 실시간 코멘트(3문장: 상태/이유/행동)
  Widget _aiManagerCard(NeonTheme t, double livePrice, Map<String, int> radar) {
    // 위치
    String pos;
    final s1 = _s.s1;
    final r1 = _s.r1;
    if (s1 > 0 && livePrice <= s1 * 1.002) {
      pos = '지지 구간';
    } else if (r1 > 0 && livePrice >= r1 * 0.998) {
      pos = '저항 구간';
    } else {
      pos = '중간 구간';
    }

    // 세력/고래/기관 간이 해석
    final whale = radar['whale'] ?? 50;
    final whaleBuy = radar['whaleBuy'] ?? 50;
    final inst = radar['inst'] ?? 50;
    final buy = radar['buy'] ?? 50;
    final sell = radar['sell'] ?? 50;
    String flow;
    if (whale >= 60 && whaleBuy >= 55 && inst >= 55) {
      flow = '세력 유입';
    } else if (whale <= 40 && sell > buy + 6) {
      flow = '세력 이탈';
    } else {
      flow = '혼조';
    }

    // 상위 TF(1h/4h/1D) 충돌 개수
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
      act = '지금은 금지';
    } else if (_showSig && _s.expectedRoiPct >= 25) {
      act = '분할 진입 가능';
    } else if (pos == '저항 구간') {
      act = '돌파 확인';
    } else if (pos == '지지 구간') {
      act = '눌림 대기';
    } else {
      act = '관망 유지';
    }

    final agreeText = (conflict == 0) ? '상위 시간봉도 같은 방향' : (conflict == 1 ? '상위 시간봉이 일부 엇갈림' : '상위 시간봉과 충돌');

    final s1Line = '지금은 $pos이다.';
    final s2Line = '$agreeText · $flow 상태다.';
    final s3Line = '행동: $act.';
// v10.6.6: 마감(종가) 한눈 요약 + 핵심 구간
String _icon(String dLabel) {
  if (dLabel == '상승') return '▲';
  if (dLabel == '하락') return '▼';
  return '■';
}
final h1p = pulse.h1;
final h4p = pulse.h4;
final d1p = pulse.d1;
final closeLine = '마감: 1시간 ${h1p.closeState}${_icon(h1p.dirLabel)} · 4시간 ${h4p.closeState}${_icon(h4p.dirLabel)} · 하루 ${d1p.closeState}${_icon(d1p.dirLabel)}';
final levelLine = (s1 > 0 || r1 > 0) ? '구간: 지지 ${((s1) <= 0 ? '-' : (s1).round().toString())} · 저항 ${((r1) <= 0 ? '-' : (r1).round().toString())}' : '';

    // 반응구간 강도/목표 (약/중/강/확정급 + 어디까지)
    final rs = ReactionStrengthEngine.build(_s, livePrice: livePrice);
    final String rsLine = (rs.targets.isNotEmpty && rs.targets[0] > 0)
        ? '반응: ${rs.gradeKo} ${rs.score}% · ${rs.isBull ? '목표' : '목표'} ${rs.targets[0].round()}/${rs.targets[1].round()}/${rs.targets[2].round()}'
        : '반응: ${rs.gradeKo} ${rs.score}%';

    Color accent;
    if (act == '분할 진입 가능') {
      accent = t.good;
    } else if (act == '지금은 금지') {
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
              Text('완전 AI 완자동', style: TextStyle(color: t.text, fontWeight: FontWeight.w900, fontSize: 12)),
              const Spacer(),
              Text('실시간', style: TextStyle(color: t.muted, fontWeight: FontWeight.w800, fontSize: 11)),
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
// 반응 강도 + 어디까지(목표)
Text(rsLine, style: TextStyle(color: t.text, fontSize: 11, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }

  // ✅ 상단 미니차트 + 한줄 매니저(겹침/스크롤 불편 개선)
  Widget _topMiniChartPanel(
    NeonTheme t,
    String symbol,
    String tf,
    double livePrice,
    Map<String, int> radar,
    dynamic ds,
  ) {
    final h = MediaQuery.of(context).size.height;
    // ✅ 한 화면에 '차트 + AI 매니저'가 같이 보이게(좌우스크롤 없이)
    //    차트 높이를 과하게 키우면 아래 카드가 밀려서 빈 여백처럼 체감됨.
    final maxH = (h * 0.34).clamp(260.0, 360.0);

    String oneLine() {
      final buy = radar['buy'] ?? 0;
      final sell = radar['sell'] ?? 0;
      final whales = radar['whales'] ?? (radar['whale'] ?? 0);
      if (buy >= 70 && whales >= 60) return '세력·고래 매수 우세 → 눌림만 주의';
      if (sell >= 70) return '매도 우세 → 무리 진입 금지';
      if (buy <= 35 && sell <= 35) return '힘 모으는 중 → 구간 확정 기다림';
      return '관망 유지 → 지지/저항 반응 확인';
    }

    return Container(
      margin: const EdgeInsets.fromLTRB(14, 10, 14, 8),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Stack(
        children: [
          // 미니차트 카드(인라인) - 외부 위젯 의존 제거(컴파일/링크 실수 방지)
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
              // 화면 상태는 _s(FuState)에서 관리합니다.
              candles: _s.candles,
              obZones: _s.obZones,
              mbZones: _s.mbZones,
              fvgZones: _s.fvgZones,
              bprZones: _s.bprZones,
              // MiniChartV4는 사용자 설정(AppSettings) 기반으로 MB/CHOCH/BOS를 표시합니다.
              title: '$symbol · $tf',
              price: livePrice,
              s1: _s.s1,
              r1: _s.r1,
            ),
          ),

          // (NEW v4) 차트 전체화면(좌 캔들/존 + 우 미래파동)
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
                    Text('차트', style: TextStyle(color: Colors.white.withOpacity(0.92), fontSize: 11, fontWeight: FontWeight.w900)),
                  ],
                ),
              ),
            ),
          ),

          // 차트 상단 오버레이(실시간 가격 가림 방지)
          // - 왼쪽: 판단/상태
          // - 오른쪽: 세력/고래/기관/리스크/근거/합의 (요청: 우측으로)
          Positioned(
            left: 12,
            right: 12,
            top: 12,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // (L) 판단
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
                      '판단: ${_s.decisionLabel} · ${_s.statusLabel}',
                      style: TextStyle(color: t.text, fontWeight: FontWeight.w800),
                    ),
                  ),
                ),
                const Spacer(),
                // (R) 세력/고래/기관/리스크/근거/합의
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
                          '세력 ${_s.forceScore}/100 · 고래 ${_s.whaleScore}/100 · 기관 ${_s.instBias}/100',
                          style: TextStyle(color: t.muted),
                        ),
                        Text(
                          '리스크 ${_s.riskPct}% · 근거 ${_s.evidenceHit}/${_s.evidenceTotal} · 합의 ${_s.consensusOk ? '충족' : '부족'}',
                          style: TextStyle(color: t.muted),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),

          // (요청 반영) 차트 위 AI 매니저 오버레이는 제거.
          // - 아래 Sliver의 _aiManagerCard에서 한 번만 보여준다.
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
      case '1m': return '1분';
      case '5m': return '5분';
      case '15m': return '15분';
      case '1h': return '1시간';
      case '4h': return '4시간';
      case '1D': case '1d': return '하루';
      case '1W': case '1w': return '1주';
      case '1M': return '1달';
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

    // 결정력: 롱/숏 확률 중 큰 값(0~1)
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
              Text('미래경로 · ${_tfLabel(tf)}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: theme.fg)),
              const Spacer(),
              Text('결정력', style: TextStyle(fontSize: 11, color: theme.muted)),
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
                  '진입 요약',
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
              ring('근거', pctEvidence),
              ring('ROI', pctRoi),
              ring('확률', pctProb),
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
                    '진입 ${s.entry.toStringAsFixed(0)}  /  손절 ${s.sl.toStringAsFixed(0)}  /  목표 ${s.tp.toStringAsFixed(0)}',
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

    // 상단 HUD: 빈공간 줄이고 “실시간 수집/합의/신뢰/위험”을 한눈에
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
          Text('데이터 수집/게이지', style: TextStyle(color: t.fg, fontSize: 12, fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          bar('수집 상태', collect),
          const SizedBox(height: 8),
          bar('실시간 가격', liveOk ? 1.0 : 0.0),
          const SizedBox(height: 8),
          bar('근거 합의', evRatio),
          const SizedBox(height: 8),
          bar('신뢰', conf),
          const SizedBox(height: 8),
          bar('위험', risk),
        ],
      ),
    );
  }
  @override
  // 등급 표시(한글). 화면용 변환 함수: 엔진 로직은 건드리지 않음.
  String _gradeKo(dynamic grade) {
    final g = (grade ?? '').toString().trim().toUpperCase();
    if (g.isEmpty) return '보통';
    switch (g) {
      case 'SSS':
      case 'SSS+':
      case 'SSS++':
      case 'SSS+++':
        return '최상';
      case 'SS':
      case 'SS+':
      case 'SS++':
        return '매우좋음';
      case 'S':
      case 'S+':
        return '좋음';
      case 'A':
        return '양호';
      case 'B':
        return '보통';
      case 'C':
        return '낮음';
      case 'D':
        return '매우낮음';
      default:
        // 숫자 점수/퍼센트 등이 들어와도 최대한 직관적으로
        final n = num.tryParse(g.replaceAll('%', ''));
        if (n != null) {
          if (n >= 85) return '최상';
          if (n >= 70) return '매우좋음';
          if (n >= 55) return '좋음';
          if (n >= 40) return '보통';
          return '낮음';
        }
        return '보통';
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
            // ✅ 타임프레임 탭 + 멀티TF 신호 요약: 화면 최상단 고정
            SliverPersistentHeader(
              pinned: true,
              delegate: _TfHeaderDelegate(
                // overflow 방지: 약간 더 높게
                // Wrap 기반으로 2줄까지 자연스럽게 배치 (스크롤/오버플로우 방지)
                height: 204,
                child: Container(
                  color: theme.bg,
                  padding: const EdgeInsets.fromLTRB(14, 8, 14, 10),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      // ✅ (1) 멀티TF 한눈에 바 (겹침/오버플로우 방지)
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

            // ✅ (NEW) 미니차트: 화면 상단에 크게 고정 느낌으로 배치
            // - 사용자가 "미니차트 40~50% + 나머지 AI 매니저"를 원함
            // - 상단에서 바로 차트 + 핵심 한줄 브리핑을 같이 보게 함
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                child: _topMiniChartPanel(theme, symbol, tf, livePrice, radar, ds),
              ),
            ),

            // ✅ PROCION A 카드: 결론 카드(기본 접힘 → 아래 내용이 잘 보이게)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
                child: Column(
                  children: [
                    // 펼침/접기 버튼
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
                          _aExpanded ? '접기' : '자세히',
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

            // ✅ v10.5 PROCION: AI 매니저 실시간 한줄 결론(스크롤 없이 항상 바로 보이게)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
                child: _futurePathCard(theme),
              ),
            ),

            // ✅ 미니차트 바로 밑: "매니저" (시드/5%리스크/멀티TF 진입·손절·목표·레버)
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

            // ✅ 미니차트 바로 밑: “과거+현재 비교 칩(네모)”
            SliverToBoxAdapter(
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

            // (PROCION 개편) 기존 '한방 판단 카드'는 A 카드로 대체

            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                child: Column(
                  children: [
                    // ✅ v13: 타임프레임 상태(B/S/W) + 마감 브리핑 카드
                    TfStripStatusV3(tfSnap: tfSnap, selectedTf: tf, onSelectTf: _setTf),
                    const SizedBox(height: 10),
                    TfBriefingCardsV2(tfSnap: tfSnap, selectedTf: tf, onSelectTf: _setTf),
                    const SizedBox(height: 10),
                    // ✅ 통합 롱숏 결정 확정 기능판 (앱 메인 전체 기능 한 화면에)
                    UnifiedDecisionPanel(state: _s, livePrice: livePrice, symbol: symbol),
                    const SizedBox(height: 10),
					// (1) 통합 브리핑 (방향점수 + 한줄 이유 + S/R 가격)
					_decisionBriefCard(theme, _s, radar, ds, livePrice),
					const SizedBox(height: 6),
					// (1-1) 구조 반응구간(CHOCH/BOS) 띠
					_reactionBand(theme, _s),
					const SizedBox(height: 8),
	                    // (2) 핵심 브리핑 카드
	                    SignalCardV1(
	                      direction: _s.signalDir,
	                      probability: _s.signalProb,
	                      grade: _s.signalGrade,
	                      evidenceHit: _s.evidenceHit,
	                      evidenceTotal: _s.evidenceTotal,
	                      bullets: _s.signalBullets,
	                    ),
					const SizedBox(height: 8),
					// ✅ 신호 바로 아래: 초보도 바로 결정할 수 있게 “진입/손절/목표/레버/수량/RR”를 붙여서 보여줌
					if (_showSig) ...[
					  quickPlanInlineStrip(theme),
					  const SizedBox(height: 8),
					  entryAlertCard(theme),
					  const SizedBox(height: 8),
					],
                    // (2-1) 세력/고래/기관 HUD (50 고정 방지 계산 적용)
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
                      note: '고래 ${radar['whale']}% (매수 ${radar['whaleBuy']}%)  ·  큰손방향 ${radar['inst']}%  ·  ${_s.flowHint}',
                    ),
                    const SizedBox(height: 8),

                    // v10.4 SAFE: 자동 복기(페이퍼 저널) 카드
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
	                                child: Text('페이퍼 진입', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
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
	                                child: Text('페이퍼 종료', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
	                              ),
	                            ),
	                          ),
	                        ),
	                      ],
	                    ),
                    const SizedBox(height: 10),
                    // (3) 중앙 허브(진입/관망 핵심)
                    RepaintBoundary(
                      child: FxPulse(
                        // ✅ ROI 25% 게이트 + 합의 + NO-TRADE + 구간내 과매매 방지까지
                        // 엔진에서 최종 확정 신호로 판단된 경우에만 펄스 활성화
                        active: _showSig,
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

                    // ✅ 멀티TF 압력 요약(한눈에): 현재 TF 기준 상/하위 TF가 어디로 미는지
                    _pressureSummaryCard(theme),
                    const SizedBox(height: 8),

                    // ✅ 결정 신뢰도(0~100): 합의/ROI/리스크/증거 기반
                    _decisionConfidenceCard(theme),
                    const SizedBox(height: 8),

                    // ✅ NO-TRADE 상세 사유(한눈에): 잠금 원인/게이트 실패 원인
                    _noTradeReasonsCard(theme),
                    const SizedBox(height: 8),

                    // ✅ 결정 게이트(합의/ROI/NO-TRADE) + 실전 수치 한눈에
                    _decisionGateCard(theme),
                    const SizedBox(height: 8),
		                    SRLineV1(
	                      s1: _s.s1,
	                      vwap: _s.vwap,
	                      r1: _s.r1,
		                      riskPct: _s.risk,
	                      note: '지지${(_s.s1).toStringAsFixed(0)} / 저항${(_s.r1).toStringAsFixed(0)}',
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
                                child: Text(_loading ? '갱신 중…' : '새로고침', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
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
                              child: Center(child: Text('포지션', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900))),
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
                              child: Center(child: Text('자율보정', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900))),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    if (PaperTradeStore.position != null)
                      FxPulse(active: true, child: Text('페이퍼 포지션 진행 중', style: TextStyle(color: theme.warn, fontWeight: FontWeight.w900))),
                  ],
                ),
              ),
            ),
                ],
              ),
            ),

            
// ✅ 메인 우측하단 [타이롱] 번개 버튼(퀵 시그널)
Positioned(
  right: 14,
  bottom: 78,
  child: SafeArea(
    child: _TyronBoltFab(
      onTap: () => _openTyronBoltSheet(context),
    ),
  ),
),

// ✅ 메인 우측하단 [차트] 버튼(메인 레이아웃 유지)
            Positioned(
              right: 14,
              bottom: 14,
              child: SafeArea(
                child: _ChartFab(
                  label: '차트',
                  onTap: () => _openFullChart(livePrice),
                ),
              ),
            ),

            // v10 SAFE: 미니 결론 바(슬리버 구조 불변). TF 헤더(170px) 아래에 고정.
            Positioned(
              left: 0,
              right: 0,
              top: 170,
              child: ValueListenableBuilder<double>(
                valueListenable: _scrollY,
                builder: (_, y, __) {
                  // A카드가 화면에 있을 때는 숨기고, 내려갔을 때만 표시
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
    // 신호 게이트 통과 + 플랜 값이 있어야 진입
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
    // 간단 게이지: 합의/ROI/확률
    // clamp()는 num을 반환하므로 double로 확정 캐스팅
    final double ev = (_s.evidenceTotal <= 0
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
          Text('진입 게이지', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
          const SizedBox(height: 10),
          bar('근거', ev),
          const SizedBox(height: 8),
          bar('ROI', roi),
          const SizedBox(height: 8),
          bar('확률', prob),
        ],
      ),
    );
  }

  // 신호 부근에 뜨는 "알림" 카드 (반짝 + 클릭 시 상세)
  Widget entryAlertCard(NeonTheme theme) {
    // 확정 신호만 표시 (WATCH/LOCK/ROI<25/관망 제외)
    if (!_showSig) return const SizedBox.shrink();
    final g = _s.grade.toUpperCase();
    if (g == 'WATCH' || g == 'LOCK') return const SizedBox.shrink();
    if (_s.expectedRoiPct < 25) return const SizedBox.shrink();
    final d = _s.finalDir.toUpperCase();
    if (d != 'LONG' && d != 'SHORT') return const SizedBox.shrink();

    final dir = _s.finalDir.toUpperCase();
    final dirKo = dir == 'LONG'
        ? '롱'
        : dir == 'SHORT'
            ? '숏'
            : '관망';

    final title = '$dirKo 신호(클릭)';

    void openDetail() {
      showDialog(
        context: context,
        barrierDismissible: true,
        builder: (_) {
          return AlertDialog(
            backgroundColor: const Color(0xFF0B1020),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            title: Text('진입 알림', style: TextStyle(color: theme.textPrimary)),
            content: SingleChildScrollView(
              child: DefaultTextStyle(
                style: TextStyle(color: theme.textSecondary, fontSize: 13),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('방향: $dirKo  / 등급: ${_s.grade}'),
                    const SizedBox(height: 8),
                    Text('진입: ${_s.entry.toStringAsFixed(0)}'),
                    Text('손절: ${_s.stop.toStringAsFixed(0)}'),
                    Text('목표: ${_s.target.toStringAsFixed(0)}'),
                    const SizedBox(height: 8),
                    Text('레버리지: ${_s.leverage.toStringAsFixed(1)}x'),
                    Text('수량: ${_s.qty.toStringAsFixed(4)}'),
                    Text('RR: ${_s.rr.toStringAsFixed(2)}  / 리스크: 5%'),
                    const SizedBox(height: 10),
                    Text('다음 액션(구조/반응):', style: TextStyle(color: theme.textPrimary)),
                    const SizedBox(height: 6),
                    ..._s.signalBullets
                        .where((b) => b.contains('구조') || b.contains('돌파') || b.contains('반응'))
                        .take(4)
                        .map((b) => Padding(
                              padding: const EdgeInsets.only(bottom: 2),
                              child: Text('• $b'),
                            )),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: Text('닫기', style: TextStyle(color: theme.accent)),
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
                        '진입 ${_s.entry.toStringAsFixed(0)} / 손절 ${_s.stop.toStringAsFixed(0)} / 목표 ${_s.target.toStringAsFixed(0)}',
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
    if (structTag.isNotEmpty) levelLines.add('구조: $structTag');
    if (breakLv > 0) levelLines.add('구조 돌파가: ${breakLv.toStringAsFixed(0)}');
    if (rLow > 0 && rHigh > 0) {
      levelLines.add('되돌림 반응구간: ${rLow.toStringAsFixed(0)} ~ ${rHigh.toStringAsFixed(0)}');
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
                    Text('진입 알림', style: TextStyle(color: theme.text, fontSize: 16, fontWeight: FontWeight.w800)),
                    const Spacer(),
                    IconButton(
                      icon: Icon(Icons.close, color: theme.text.withOpacity(.75)),
                      onPressed: () => Navigator.of(context).pop(),
                    )
                  ],
                ),
                const SizedBox(height: 8),
                Text('$dirKo 확정(고확률)', style: TextStyle(color: theme.accent, fontSize: 14, fontWeight: FontWeight.w700)),
                const SizedBox(height: 12),
                _kv('진입', entry.toStringAsFixed(0), theme),
                _kv('손절', stop.toStringAsFixed(0), theme),
                _kv('목표', target.toStringAsFixed(0), theme),
                const SizedBox(height: 10),
                _kv('레버리지', lev.toStringAsFixed(1) + 'x', theme),
                _kv('수량', qty.toStringAsFixed(4), theme),
                _kv('RR', rr.toStringAsFixed(2), theme),
                _kv('리스크', riskPct.toStringAsFixed(0) + '%', theme),
                if (levelLines.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text('다음 확인 가격', style: TextStyle(color: theme.text, fontSize: 13, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  for (final l in levelLines)
                    Text('• $l', style: TextStyle(color: theme.text.withOpacity(.85), fontSize: 12)),
                ],
                const SizedBox(height: 10),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: Text('확인', style: TextStyle(color: theme.accent)),
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

  // 신호 카드 바로 아래에 붙는 “초간단 진입 플랜” (항상 신호 근처에서 보이게)
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
                Text('다음 액션', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900, fontSize: 12)),
                const Spacer(),
                Text('${_s.grade}', style: TextStyle(color: c, fontWeight: FontWeight.w900, fontSize: 12)),
              ],
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _chip('진입', fmt(e), theme, c),
                _chip('손절', fmt(sl), theme, c),
                _chip('목표', fmt(tp), theme, c),
                _chip('레버', lev.toStringAsFixed(1) + 'x', theme, c),
                _chip('수량', qty.toStringAsFixed(4), theme, c),
                _chip('RR', rr.toStringAsFixed(2), theme, c),
              ],
            ),
            const SizedBox(height: 6),
            if (_s.structureTag.isNotEmpty && _s.reactLow > 0 && _s.reactHigh > 0)
              Text(
                '반응구간 ${_s.reactLow.toStringAsFixed(1)} ~ ${_s.reactHigh.toStringAsFixed(1)}',
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
              Text('퀵 플랜', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
              const Spacer(),
              Text(dirKo, style: TextStyle(color: theme.good, fontWeight: FontWeight.w900)),
            ],
          ),
          const SizedBox(height: 10),
          Text(line('진입', hasPlan ? _s.entry.toStringAsFixed(0) : '--'), style: TextStyle(color: theme.fg, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text(line('손절', hasPlan ? _s.stop.toStringAsFixed(0) : '--'), style: TextStyle(color: theme.fg, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text(line('목표', hasPlan ? _s.target.toStringAsFixed(0) : '--'), style: TextStyle(color: theme.fg, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Text('레버리지 $lev  ·  수량 $qty  ·  RR $rr  ·  5% 리스크', style: TextStyle(color: theme.muted, fontSize: 12, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }

  // === 결정 게이트 카드 ===
  // - 합의(consensusOk), ROI(25% 게이트), NO-TRADE(locked), 최종 신호(showSignal)
  // - 그리고 실전 플랜(진입/손절/TP/레버/수량)을 한눈에 보여준다.
  
  Widget _decisionConfidenceCard(NeonTheme theme) {
    // 멀티TF 합의율(NEUTRAL 제외, 현재 신호 방향 기준)
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
    final roiGate = (roiPct / 25.0 * 100.0).clamp(0.0, 120.0); // 25%면 100점

    // 신뢰도 점수(표시용): 엔진 confidence + 합의/ROI/증거/리스크를 가볍게 보정
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
    final lockReason = _s.lockedReason.isEmpty ? '잠금 없음' : _s.lockedReason;

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
                '결정 신뢰도',
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
              _kvBox(theme, '합의', '${consensusPct}%'),
              _kvBox(theme, 'ROI', '${roiPct.toStringAsFixed(0)}%'),
              _kvBox(theme, '증거', '${_s.evidenceHit}/${_s.evidenceTotal}'),
              _kvBox(theme, '리스크', '${_s.risk}%'),
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
                  locked ? '매매금지: $lockReason' : '거래 가능: 조건 충족 시만 진입',
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

  // === NO-TRADE 상세 사유 카드 ===
  // - lockedReason가 있으면 우선 표시
  // - 없으면(또는 부족하면) 게이트 실패/위험 신호를 상태값에서 추론해 보강
  Widget _noTradeReasonsCard(NeonTheme theme) {
    final locked = _s.locked;
    final raw = _s.lockedReason.trim();

    List<String> reasons = [];
    if (raw.isNotEmpty) {
      // 구분자 다양하게 대응: 줄바꿈 / | / , / · / /
      final normalized = raw
          .replaceAll('·', '|')
          .replaceAll('/', '|')
          .replaceAll(',', '|')
          .replaceAll('\n', '|');
      reasons = normalized
          .split('|')
          .map((e) => e.trim())
          .where((e) => e.isNotEmpty)
          .toList();
    }

    // 부족하면 보강(엔진 필드 기반)
    void addIf(bool cond, String msg) {
      if (!cond) return;
      if (reasons.contains(msg)) return;
      reasons.add(msg);
    }

    // 게이트 실패는 잠금 유무와 무관하게 보여주면 이해가 빠름
    addIf(!_s.consensusOk, '다중TF 합의 부족');
    addIf(!_s.roiOk, '예상 ROI 25% 미달');
    addIf(_s.risk >= 70, '리스크 과다');
    addIf(_s.lossStreak >= 3, '연속 손실(${_s.lossStreak})');

    // 구조 경고(보수적으로)
    final tag = _s.structureTag.toUpperCase();
    if (tag.contains('CHOCH')) {
      addIf(true, '구조 전환(CHOCH) 구간');
    }

    // 너무 길면 상위 5개만
    if (reasons.length > 5) {
      reasons = reasons.take(5).toList();
    }

    final title = locked ? '매매금지 사유' : '진입 제한 사유(게이트)';
    final subtitle = locked
        ? '잠금 상태: 아래 조건이 해제되면 거래 가능'
        : '신호가 확정되려면 아래 조건을 통과해야 함';

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
              '현재 제한 사유 없음',
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
                          Text('• ', style: TextStyle(color: locked ? theme.bad : theme.warn, fontSize: 12, fontWeight: FontWeight.w900)),
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

    // 멀티TF 합의율(NEUTRAL 제외)
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

    // TP 분할 레벨(표시용): 40/70/100%
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
              Text('결정 게이트', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
              const Spacer(),
              Text(_biasText(_s.signalDir), style: TextStyle(color: theme.good, fontWeight: FontWeight.w900)),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              badge('합의', _s.consensusOk, sub: '${consensusPct}%'),
              badge('ROI', _s.roiOk, sub: '${roiPct}%'),
              badge('잠금', !_s.locked, sub: _s.locked ? '매매금지' : '정상'),
              badge('확정', _showSig, sub: _showSig ? 'SIGNAL' : 'WATCH'),
            ],
          ),
          if (_s.locked && _s.lockedReason.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('사유: ${_s.lockedReason}', style: TextStyle(color: theme.muted, fontWeight: FontWeight.w800, fontSize: 12)),
          ],
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _kvBox(theme, '진입', fmt(_s.entry)),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _kvBox(theme, '손절', fmt(_s.stop)),
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
              Expanded(child: _kvBox(theme, '수량', fmt4(_s.qty))),
            ],
          ),
          const SizedBox(height: 8),
          Text('레버리지 ${_s.leverage.toStringAsFixed(1)}  ·  5% 리스크  ·  TP 분할 40/35/25',
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

  // === 멀티TF 압력 요약 카드 ===
  // 현재 TF만 보고 있어도 상/하위 TF가 어느 방향으로 미는지 “한눈에” 보여주기 위한 압축 뷰
  // - 엔진(mtfPulse)이 있으면 그것을 사용
  // - 없으면 tfSnap으로 fallback
  Widget _pressureSummaryCard(NeonTheme theme) {
    final rankNow = _tfRank(tf);

    // 집계
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

    // pulse 우선
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
      if (net >= 3) return '⬆⬆⬆';
      if (net == 2) return '⬆⬆';
      if (net == 1) return '⬆';
      if (net <= -3) return '⬇⬇⬇';
      if (net == -2) return '⬇⬇';
      if (net == -1) return '⬇';
      return '↔';
    }

    Color cByNet(int net) {
      if (net > 0) return theme.good;
      if (net < 0) return theme.bad;
      return theme.stroke;
    }

    final higherTxt = '상위TF ${arrows(netHigher)}  (L$upHigher / S$dnHigher)';
    final lowerTxt = '하위TF ${arrows(netLower)}  (L$upLower / S$dnLower)';

    // 현재 TF(지금 보고 있는 TF)는 구조 태그로 간단 표시
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
              Text('압력 요약', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: theme.bg,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: theme.border.withOpacity(0.6)),
                ),
                child: Text('현재 $tf · $nowBadge', style: TextStyle(color: theme.fg, fontSize: 12, fontWeight: FontWeight.w900)),
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
            '해석: 상위TF와 같은 방향에서 반응구간 확정봉 + ROI≥25%일 때만 진입',
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
        return '1분';
      case '5m':
        return '5분';
      case '15m':
        return '15분';
      case '1h':
        return '1시간';
      case '4h':
        return '4시간';
      case '1D':
        return '하루';
      case '1W':
        return '주';
      case '1M':
        return '달';
      default:
        return tfLabel;
    }
  }

  // ✅ (1) 멀티 TF 종가/마감 상태 바: 좋음/대기/나쁨
  Widget _mtfCloseBar(NeonTheme theme) {
    final pulse = _s.mtfPulse;

    // 상태 결정: 위험이 높으면 나쁨, 강도가 충분하면 좋음, 그 외 대기
    ({String word, Color color}) _statusFromPulse(FuTfPulse p) {
      final risk = p.risk.clamp(0, 100);
      final strength = p.strength.clamp(0, 100);
      final dirU = p.dir.toUpperCase();
      if (risk >= 65) return (word: '나쁨', color: theme.bad);
      if (dirU.contains('LONG') || dirU.contains('SHORT')) {
        if (strength >= 60) return (word: '좋음', color: theme.good);
      }
      return (word: '대기', color: theme.warn);
    }

    ({String word, Color color}) _statusFromSnap(FuState? st) {
      if (st == null) return (word: '대기', color: theme.stroke);
      final dirU = st.direction.toUpperCase();
      // risk/score 기반 간이 판정
      if (st.locked) return (word: '나쁨', color: theme.bad);
      if (dirU.contains('LONG') || dirU.contains('SHORT')) {
        if (st.prob >= 60) return (word: '좋음', color: theme.good);
        return (word: '대기', color: theme.warn);
      }
      return (word: '대기', color: theme.warn);
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

  // ✅ (NEW) 멀티TF 한눈에 바 (종가상태+방향을 한 칩에 합치기)
  // - 상단에 1줄만 두고, 겹침/오버플로우 방지
  // - 탭하면 TF 전환
  Widget _mtfOneGlanceBar(NeonTheme theme) {
    final pulse = _s.mtfPulse;

    ({String word, Color color}) _statusFromPulse(FuTfPulse p) {
      final s = (p.closeState ?? '').toString().toLowerCase();
      if (s.contains('good') || s.contains('up') || s.contains('ok')) {
        return (word: '좋음', color: const Color(0xFF2FE6A5));
      }
      if (s.contains('bad') || s.contains('down') || s.contains('weak')) {
        return (word: '나쁨', color: const Color(0xFFFF5B7A));
      }
      return (word: '대기', color: const Color(0xFFFFD36E));
    }

    IconData _dirIcon(String? d) {
      final s = (d ?? '').toLowerCase();
      if (s.contains('long') || s.contains('up') || s.contains('bull')) return Icons.arrow_upward_rounded;
      if (s.contains('short') || s.contains('down') || s.contains('bear')) return Icons.arrow_downward_rounded;
      return Icons.more_horiz_rounded;
    }

    String _dirWord(String? d) {
      final s = (d ?? '').toLowerCase();
      if (s.contains('long') || s.contains('up') || s.contains('bull')) return '상승';
      if (s.contains('short') || s.contains('down') || s.contains('bear')) return '하락';
      return '중립';
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
            Text('한눈에', style: TextStyle(color: theme.textStrong, fontWeight: FontWeight.w800)),
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

  // ✅ (2) 멀티 TF 방향/합의 바: ▲(상승) ■(중립) ▼(하락)
  Widget _mtfDirBar(NeonTheme theme) {
    final pulse = _s.mtfPulse;

    ({String icon, Color color}) _dirFromPulse(FuTfPulse p) {
      final dirU = p.dir.toUpperCase();
      if (dirU.contains('LONG')) return (icon: '▲', color: theme.good);
      if (dirU.contains('SHORT')) return (icon: '▼', color: theme.bad);
      return (icon: '■', color: theme.warn);
    }

    ({String icon, Color color}) _dirFromSnap(FuState? st) {
      if (st == null) return (icon: '■', color: theme.stroke);
      final dirU = st.direction.toUpperCase();
      if (dirU.contains('LONG')) return (icon: '▲', color: theme.good);
      if (dirU.contains('SHORT')) return (icon: '▼', color: theme.bad);
      return (icon: '■', color: theme.warn);
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
    // ✅ 멀티TF 압축 스트립: tfSnap(기존) + mtfPulse(신규) 둘 다 지원
    // - mtfPulse가 있으면: 방향/구조/위험/반응/강도 기반으로 “한눈에”
    // - 없으면: 기존 tfSnap 정보로 fallback
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

        // 위험이 높을수록 흐리게, 반응구간이면 테두리 강조
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
                // 작은 점: 위험/반응 느낌
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

      // === fallback: 기존 tfSnap ===
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

  // v10.4 SAFE: 자동 복기(페이퍼 저널) - UI 최소형
  Widget _paperJournalCard(NeonTheme theme) {
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
              Text('자동 복기', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900, fontSize: 12)),
              const Spacer(),
              Text('승 $w · 패 $l · 승률 ${wr.toStringAsFixed(0)}%', style: TextStyle(color: theme.muted, fontSize: 11, fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 8),
          if (last.isEmpty)
            Text('최근 기록 없음', style: TextStyle(color: theme.muted, fontSize: 11, fontWeight: FontWeight.w700))
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
      cd = ' · NO-TRADE ${until.hour.toString().padLeft(2, '0')}:${until.minute.toString().padLeft(2, '0')}';
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
          Text('브레이크: ${_rb.lossStreak}연패$cd',
              style: const TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w900)),
          Text('구간승률[$k] ${wr.toStringAsFixed(1)}% (W/L $w/$l)',
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
                const Text('운영 설정', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w900)),
                const SizedBox(height: 14),
                _settingTile(
                  title: '강제결정',
                  subtitle: '항상 LONG/SHORT 확정 출력',
                  value: _rb.forceDecisionOn,
                  onTap: () async {
                    await _rb.toggleForceDecision();
                    if (mounted) setState(() {});
                  },
                ),
                const SizedBox(height: 10),
                _settingTile(
                  title: '리스크 브레이크',
                  subtitle: '3연패 R 0.25 / 5연패 NO-TRADE',
                  value: _rb.brakeOn,
                  onTap: () async {
                    await _rb.toggleBrake();
                    if (mounted) setState(() {});
                  },
                ),
                const SizedBox(height: 10),
                _settingButton(
                  label: '통계 리셋',
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
          const Text('차트 표시 설정', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          sw(s.showOB, 'OB(오더블록)'),
          sw(s.showFVG, 'FVG'),
          sw(s.showBPR, 'BPR'),
          sw(s.showMB, 'MB'),
          sw(s.showBOS, 'BOS'),
          sw(s.showCHoCH, 'CHoCH'),
          const SizedBox(height: 10),
          slider(s.zoneOpacity, '구간 투명도', min: 0.05, max: 0.5),
          slider(s.labelOpacity, '라벨 투명도', min: 0.3, max: 1.0),
        ],
      ),
    );
  }
}

// v10.6.5: MTF 칩 한눈에 라벨(한글)
String _kCloseLabel(String v) {
  switch (v) {
    case 'good': return '좋음';
    case 'wait': return '대기';
    case 'bad': return '나쁨';
    case '반응': return '반응';
    case '좋음': return '좋음';
    case '대기': return '대기';
    case '나쁨': return '나쁨';
    case '주의': return '주의';
    default: return v.isEmpty ? '대기' : v;
  }
}

String _kDirLabel(String v) {
  switch (v) {
    case 'up': return '상승';
    case 'down': return '하락';
    case 'flat': return '중립';
    case '상승': return '상승';
    case '하락': return '하락';
    case '관망': return '중립';
    case '중립': return '중립';
    default: return v.isEmpty ? '중립' : v;
  }
}

String _kDirIcon(String v) {
  final k = _kDirLabel(v);
  if (k == '상승') return '▲';
  if (k == '하락') return '▼';
  return '■';
}

// ------------------------------------------------------------
// UI: 메인 우측하단 차트 버튼 (메인 레이아웃 불변)
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
            Text('타이롱', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: t.fg)),
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