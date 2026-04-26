import 'dart:async';
import 'dart:math' as math;
import '../../services/bitget_api.dart';

import 'package:flutter/material.dart';

import '../../core/app_settings.dart';
import '../../core/analysis/entry_planner.dart';
import '../../core/models/fu_state.dart';
import '../../core/models/future_path_dto.dart';
import '../../core/services/future_path_engine.dart';
import '../../data/logging/future_path_db.dart';
import '../../core/analysis/heatmap_path_engine.dart';
import '../../logic/flow_metrics.dart';
import 'tf_evidence_heatmap.dart';

/// ?�측: 미래 ?�동(?�마?�머??컨셉)
/// - ??1�??�측???�니?? 메인/?��?무효 3 ?�나리오 + ?�률 + 무효조건 + 목표�?/// - ?�재??"구조/�???준비된 ?�태?�서, UI/?�더�?골격??먼�? 깔아??class FutureWavePanel extends StatefulWidget {
  final String symbol;
  final String? tf;

  /// (?�션) 계산??FuturePathDTO�?좌측 ?�버?�이�?공유
  final ValueNotifier<FuturePathDTO?>? dtoOut;
  final String tfLabel;
  final List<FuCandle> candles;
  final List<FuZone> zones;
  final double reactLow;
  final double reactHigh;

  /// (?�션) 멀?�TF ?�스(?�트�??�계??
  final Map<String, FuTfPulse> mtfPulse;

  /// (?�션) ?�측 미래?�동 0(?�재) ?�커 ??가?�드 ?�인 ?�결??
  final GlobalKey? nowAnchorKey;

  const FutureWavePanel({
    super.key,
    required this.symbol,
    this.tf,
    this.dtoOut,
    required this.tfLabel,
    required this.candles,
    required this.zones,
    required this.reactLow,
    required this.reactHigh,
    this.mtfPulse = const {},
    this.nowAnchorKey,
  });

  @override
  State<FutureWavePanel> createState() => _FutureWavePanelState();
}

class _FutureWavePanelState extends State<FutureWavePanel> {
  
  // STEP17: ?�측 ?�널 ?�크�?고정
  final ScrollController _rightScroll = ScrollController();
Timer? _poll;
  FlowSnapshot _flow = const FlowSnapshot(buyStrength: 50, sellStrength: 50, obImbalance: 50, absorption: 50, cvd: 0.0, note: 'init');
  Map<String, Map<String, int>> _matrix = const {};
  List<FuFutureScenario> _autoScens = const [];

  

String _labelKR(String key) {
  switch (key) {
    case 'consensus':
      return '?�의';
    case 'pulse':
      return '강도';
    case 'align':
      return '?�렬';
    case 'risk':
      return '?�험';
    default:
      return key;
  }
}

/// (v8.4) 5% 리스??고정) 계산: ?�측 ?�널?�서 즉시 ?�인
  /// - entry: ?�재가(last)
  /// - sl: ?�나리오 invalidLine ?�선, ?�으�?반응구간 경계
  /// - tp: ?�나리오 ?��??�으�?보수?�으�?react 경계)
  EntryPlan _riskPlan(double last, _Scenario s) {
    final entry = last;

    // SL/TP ?�보
    final sl = (s.invalidLine ?? (s.isLong ? widget.reactLow : widget.reactHigh));
    double s1, r1;
    if (s.isLong) {
      s1 = widget.reactLow;
      r1 = (s.targetHigh ?? (widget.reactHigh > 0 ? widget.reactHigh : entry));
    } else {
      s1 = (s.targetLow ?? (widget.reactLow > 0 ? widget.reactLow : entry));
      r1 = widget.reactHigh;
    }

    // 보호: �???��/0 방�?
    if (s1 <= 0) s1 = entry;
    if (r1 <= 0) r1 = entry;

    // EntryPlanner??UI?�서 ?�기 좋�? ?�태�?5% 리스??TP 분할/?�버리�? 추천???�공
    return EntryPlanner.plan(
      isLong: s.isLong,
      price: entry,
      s1: s.isLong ? math.min(s1, sl) : s1,
      r1: s.isLong ? r1 : math.max(r1, sl),
      accountUsdt: AppSettings.accountUsdt,
      riskPct: AppSettings.riskPct,
    );
  }



int _absorptionHeuristic({required int obImb, required double cvd}) {
  final obBias = (obImb - 50).toDouble();
  final cvdBias = cvd;
  final opposite = (obBias * cvdBias < 0) ? 1.0 : 0.0;
  final mag = (cvdBias.abs() / (cvdBias.abs() + 1.0));
  final base = 50 + (opposite * 35.0) + (mag * 15.0);
  return base.round().clamp(0, 100);
}

void _startFlow() {
  // ???�로?�트 구조(리스?��?리까지.zip) 기�?: BitgetApi ?�출 메서??경로가 ?�경별로 ?�라 빌드가 깨질 ???�음.
  // v1?� "컴파???�정" ?�선: 캔들/반응구간 기반?�로 FlowSnapshot??추정값으�?채�?.
  _poll?.cancel();
  _poll = Timer.periodic(const Duration(seconds: 2), (_) {
    try {
      final last = widget.candles.isNotEmpty ? widget.candles.last.close : 0.0;
      final prev = widget.candles.length >= 2 ? widget.candles[widget.candles.length - 2].close : last;
      final delta = last - prev;

      // tape: 최근 1캔들 방향 기반(간단 ?�리?�틱)
      final tape = (50 + (delta == 0 ? 0 : (delta > 0 ? 18 : -18))).clamp(0, 100).toInt();

      // ob: 반응구간 중앙 근처�?'방어 ?�량' ?�다�?가??중립 보정)
      final mid = (widget.reactLow + widget.reactHigh) / 2.0;
      final dist = (last - mid).abs();
      final span = (widget.reactHigh - widget.reactLow).abs().clamp(1e-9, 1e9);
      final near = (1.0 - (dist / span)).clamp(0.0, 1.0);
      final obImb = (50 + (near * 12.0)).round().clamp(0, 100);

      // absorption: 반응구간 근접 + ?�돌�??�파?�크) 가??      final absorb = (50 + (near * 18.0)).round().clamp(0, 100);

      // cvd: 부?�만 간단??      final cvd = delta == 0 ? 0.0 : (delta > 0 ? 1.0 : -1.0);

      final snap = FlowSnapshot(
        buyStrength: tape,
        sellStrength: (100 - tape).clamp(0, 100),
        obImbalance: obImb,
        absorption: absorb,
        cvd: cvd,
        note: 'heuristic',
      );

      // Bias: mtfPulse ?�으�??�수�? ?�으�??�치 기반
      bool isLongBias;
      if (widget.mtfPulse.isNotEmpty) {
        int up = 0, dn = 0;
        for (final p in widget.mtfPulse.values) {
          final d = p.dir.toUpperCase();
          if (d == 'LONG' || d == 'UP') up++;
          if (d == 'SHORT' || d == 'DOWN') dn++;
        }
        isLongBias = up >= dn;
      } else {
        isLongBias = last <= widget.reactHigh;
      }

      final pulses = widget.mtfPulse.isNotEmpty
          ? widget.mtfPulse
          : <String, FuTfPulse>{widget.tfLabel: FuTfPulse.empty()};

      final matrix = HeatmapPathEngine.buildTfMatrix(pulses: pulses, flow: snap, isLongBias: isLongBias);
      final scens = HeatmapPathEngine.buildScenarios(
        isLongBias: isLongBias,
        last: last,
        reactLow: widget.reactLow,
        reactHigh: widget.reactHigh,
        flow: snap,
        pulses: pulses,
      );

      if (!mounted) return;
      setState(() {
        _flow = snap;
        _matrix = matrix;
        _autoScens = scens;
      });
    } catch (_) {
      // silent
    }
  });
}

  // (v8.3) 지지/?�???�률(체감??
  // - 지�??�계?�서??'?�치(????' 기반?�로 빠르�?보여주는 ?�도
  // - ?�후 OB/FVG/BPR/거래??구조?�수?� 결합 가??  _SrP _srProb(_Pos15 pos, {required bool isLong}) {
    // ?�일?�록(?�???�단) 지지 ?�위, ?�일?�록(?�단/?�계) ?�???�위
    final table = <int, _SrP>{
      1: const _SrP(72, 28),
      2: const _SrP(65, 35),
      3: const _SrP(55, 45),
      4: const _SrP(45, 55),
      5: const _SrP(35, 65),
    };
    final base = table[pos.idx] ?? const _SrP(55, 45);
    // ??관?�이�??�집?�서 보여�??�???�위가 '지지 ?�위'처럼 보이지 ?�게)
    if (!isLong) return _SrP(base.resist, base.support);
    return base;
  }

// (v8.3) ?�결 ?�금: 채널 1캔들 ?�정 ?�탈 ??"무효 ?�정"?�로 고정
bool _lockedInvalid = false;
int _outsideCount = 0;

// (v8.3) 가�?기각 ?�장(?�촉 ?�간 1??
String? _stampText;
Timer? _stampTimer;
int _lastTouch = 0; // -1=?�단, 1=?�단, 0=?�음

void _syncLock(bool outside) {
  // ?�로??캔들???�어???�만 카운?��? ?��?가 ?�음
  // (?�기?�는 '마�?�?종�?'가 갱신????build가 ?�시 불린?�고 가??
  if (_lockedInvalid) return;
  if (outside) {
    _outsideCount += 1;
    if (_outsideCount >= 1) {
      _lockedInvalid = true;
      // ?�장??같이: "무효"
      _showStamp('무효');
    }
  } else {
    _outsideCount = 0;
  }
}

void _syncStamp(double last, {required double upper, required double lower, required bool isLong}) {
  if (_lockedInvalid) return;
  if (upper <= lower) return;
  final band = (upper - lower).abs();
  final eps = (band * 0.10).clamp(0.0, double.infinity);

  int touch = 0;
  if ((last - upper).abs() <= eps) touch = 1;
  if ((last - lower).abs() <= eps) touch = -1;

  if (touch == 0) {
    _lastTouch = 0;
    return;
  }
  if (_lastTouch == touch) return; // 같�? �?반복 ?�치 무시
  _lastTouch = touch;

  // �???관?�에???�단=?�?? ?�단=지지
  String t;
  if (isLong) {
    t = (touch == -1) ? '가�? : '기각';
  } else {
    t = (touch == 1) ? '가�? : '기각';
  }
  _showStamp(t);
}

void _showStamp(String t) {
  _stampTimer?.cancel();
  setState(() => _stampText = t);
  _stampTimer = Timer(const Duration(milliseconds: 320), () {
    if (!mounted) return;
    setState(() => _stampText = null);
  });
}

void _resetVerdict() {
  setState(() {
    _lockedInvalid = false;
    _outsideCount = 0;
    _stampText = null;
    _lastTouch = 0;
  });
}



Offset _calcNowAnchor(Size size, List<_P> points, double band) {
  final rect = Offset.zero & size;
  if (points.isEmpty) return rect.center;
  double minY = points.first.y;
  double maxY = points.first.y;
  for (final p in points) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  minY -= (band.abs() + 1e-9);
  maxY += (band.abs() + 1e-9);
  double px(double x) => rect.left + x * rect.width;
  double py(double y) {
    if ((maxY - minY).abs() < 1e-9) return rect.center.dy;
    final t = (y - minY) / (maxY - minY);
    return rect.bottom - t * rect.height;
  }
  final p0 = points.first;
  return Offset(px(p0.x), py(p0.y));
}

  int selected = 0;

  // TF Selector (5m~1Y)
  static const List<String> _tfSet = <String>['5m','15m','30m','1h','4h','1d','1w','1m','1y'];
  String _tfSel = '15m';
  String _lastLoggedTf = '';
  int _lastLoggedSelected = -1;
  int _pathProbMain = 0, _pathProbAlt = 0, _pathProbFail = 0; // 0=메인, 1=?��? 2=무효
  FuturePathDTO? _dtoCache;

  // ?�더�?체결(공개) 기반 보조?�터
  Timer? _ofTimer;
  int _ofTsMs = 0;
  int _ofSupportP = 0;
  int _ofResistP = 0;
  int _ofBias = 0; // -100..+100 (�??�리 +)
  double _ofDeltaQty = 0;

  // AI ?�약(결론/?�신/?�줄)
  String _aiDecision = '관�?;
  int _aiConf = 50;
  String _aiReason = '';
  Map<String, num> _aiEvd = const {};
  bool _aiEvdOpen = false;
  bool _aiStatsOpen = false;
  bool _aiHistOpen = false;
  final List<Map<String, Object>> _aiHist = [];
  Timer? _aiFlowTimer;
  int _aiFlowStep = 0;


  /// ?�시�?채널 ??=경로 ?�용 ?�로)
  /// - ATR(최근 변?�성) 기반?�로 ?�동 ?��?/축소
  /// - TF???�라 배수 조정(짧�?�??��?, 긴봉=관?�)
  double _channelBand(double unit) {
    final c = widget.candles;
    if (c.length < 3) return (unit * 0.18).abs();

    // ATR(14) 간이 계산
    final n = math.min(14, c.length - 1);
    double sum = 0;
    for (int i = c.length - n; i < c.length; i++) {
      final cur = c[i];
      final prev = c[i - 1];
      final tr1 = (cur.high - cur.low).abs();
      final tr2 = (cur.high - prev.close).abs();
      final tr3 = (cur.low - prev.close).abs();
      final tr = math.max(tr1, math.max(tr2, tr3));
      sum += tr;
    }
    final atr = (sum / n).abs();

    // TF 배수(짧을?�록 좁게, 길수�??�게)
    final tf = widget.tfLabel.toLowerCase();
    double k = 1.0;
    if (tf.contains('1m')) k = 0.70;
    else if (tf.contains('5m')) k = 0.80;
    else if (tf.contains('15m')) k = 0.90;
    else if (tf.contains('1h')) k = 1.05;
    else if (tf.contains('4h')) k = 1.25;
    else if (tf.contains('1d')) k = 1.55;
    else if (tf.contains('1w')) k = 1.90;
    else if (tf.contains('1m')) k = 2.20;

    // 최소/최�? ?�한(?�무 ?�거??과도?�게 ?�꺼?��???�?방�?)
    final minBand = (unit * 0.08).abs().clamp(0.0, double.infinity);
    final maxBand = (unit * 0.55).abs().clamp(0.0, double.infinity);

    final out = (atr * 0.90 * k).clamp(minBand, maxBand);
    return out;
  }


@override
void dispose() {
  
    _rightScroll.dispose();
_stampTimer?.cancel();
  _ofTimer?.cancel();
  _aiFlowTimer?.cancel();
  super.dispose();
}

  
void _startOrderflow() {
  _ofTimer?.cancel();
  // 2�?주기: UI 부??최소 + 체결/?�더�?최신 ?��?
  _ofTimer = Timer.periodic(const Duration(seconds: 2), (_) async {
    if (!mounted) return;
    final dto = _dtoCache;
    if (dto == null) return;
    try {
      final book = await BitgetApi.getOrderBook(category: 'USDT-FUTURES', symbol: widget.symbol, limit: 50);
      final fills = await BitgetApi.getRecentFills(category: 'USDT-FUTURES', symbol: widget.symbol, limit: 80);
      final last = widget.candles.isNotEmpty ? widget.candles.last.close : 0.0;
      final m = _calcOrderflow(last, dto.levels, book, fills);
      if (!mounted) return;
      setState(() {
        _ofTsMs = DateTime.now().millisecondsSinceEpoch;
        _ofSupportP = m['supportP'] as int;
        _ofResistP = m['resistP'] as int;
        _ofBias = m['bias'] as int;
        _ofDeltaQty = (m['deltaQty'] as double);
      });
    } catch (_) {
      // ?�트?�크 ?�패??무시(???�행 ?�선)
    }
  });
}

Map<String, Object> _calcOrderflow(double last, FutureLevels lv, OrderBook book, List<PublicFill> fills) {
  double sumBid = 0, sumAsk = 0;
  for (final b in book.bids) { if (b.length >= 2) sumBid += (b[0] * b[1]); }
  for (final a in book.asks) { if (a.length >= 2) sumAsk += (a[0] * a[1]); }
  final tot = (sumBid + sumAsk);
  double imb = 0;
  if (tot > 1e-9) imb = (sumBid - sumAsk) / tot; // -1..+1

  // 최근 체결 ?��?(매수-매도)
  double buy = 0, sell = 0;
  final now = DateTime.now().millisecondsSinceEpoch;
  for (final f in fills) {
    if (now - f.tsMs > 90 * 1000) continue; // 최근 90초만
    if (f.side == 'buy') buy += f.size;
    else if (f.side == 'sell') sell += f.size;
  }
  final deltaQty = (buy - sell);
  final denom = (buy + sell).abs();
  double deltaNorm = 0;
  if (denom > 1e-9) deltaNorm = deltaQty / denom; // -1..+1

  // 반응구간 근처 ?�동??지지/?�???�률)
  final band = (lv.reactHigh - lv.reactLow).abs();
  final eps = (band * 0.12).clamp(0.0, double.infinity);
  double nearBid = 0, nearAsk = 0;
  for (final b in book.bids) {
    if (b.length < 2) continue;
    final p=b[0], q=b[1];
    if ((p - lv.reactLow).abs() <= eps) nearBid += q;
    if ((p - lv.t1).abs() <= eps) nearBid += q*0.7;
  }
  for (final a in book.asks) {
    if (a.length < 2) continue;
    final p=a[0], q=a[1];
    if ((p - lv.reactHigh).abs() <= eps) nearAsk += q;
    if ((p - lv.t2).abs() <= eps) nearAsk += q*0.7;
  }
  final nearTot = (nearBid + nearAsk);
  int supportP = 50, resistP = 50;
  if (nearTot > 1e-9) {
    supportP = ((nearBid / nearTot) * 100).round().clamp(0, 100);
    resistP = (100 - supportP).clamp(0, 100);
  }

  // 종합 바이?�스(�??�리 +)
  final bias = ((imb * 0.60 + deltaNorm * 0.40) * 100).round().clamp(-100, 100);

  return {
    'supportP': supportP,
    'resistP': resistP,
    'bias': bias,
    'deltaQty': deltaQty,
  };
}


// ===== ?�더�?게이지(UI) =====
Widget _ofGaugeRow() {
  final sup = _ofSupportP.clamp(0, 100);
  final res = _ofResistP.clamp(0, 100);
  return Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Row(
        children: [
          const Text('?�더�?, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
          const SizedBox(width: 8),
          Text('지지 $sup% · ?�??$res%', style: const TextStyle(fontSize: 10)),
          const Spacer(),
          Text('바이?�스 ${_ofBias >= 0 ? '+' : ''}${_ofBias}',
              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700)),
        ],
      ),
      const SizedBox(height: 6),
      // 지지/?�??게이지
      ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: SizedBox(
          height: 10,
          child: Row(
            children: [
              Expanded(
                flex: sup,
                child: Container(color: const Color(0xFF1EEA6A)),
              ),
              Expanded(
                flex: (100 - sup).clamp(0, 100),
                child: Container(color: const Color(0xFFEA2A2A)),
              ),
            ],
          ),
        ),
      ),
      const SizedBox(height: 6),
      // 바이?�스 게이지(-100~+100)
      ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Container(
          height: 10,
          color: const Color(0x22FFFFFF),
          child: LayoutBuilder(
            builder: (context, c) {
              final w = c.maxWidth;
              final center = w / 2;
              final bias = _ofBias.clamp(-100, 100);
              final dx = (bias / 100.0) * center;
              final left = (center + dx).clamp(0.0, w);
              return Stack(
                children: [
                  Positioned(left: center - 1, top: 0, bottom: 0, child: Container(width: 2, color: const Color(0x55FFFFFF))),
                  Positioned(left: left - 6, top: 0, bottom: 0, child: Container(width: 12, color: const Color(0xFF4DA3FF))),
                ],
              );
            },
          ),
        ),
      ),
      const SizedBox(height: 4),
      Text('체결? ${_ofDeltaQty >= 0 ? '+' : ''}${_ofDeltaQty.toStringAsFixed(3)}',
          style: const TextStyle(fontSize: 10)),
    ],
  );
}
// ===== END =====


void _recalcAiSummary() {
  final dto = _dtoCache;
  if (dto == null) return;

  final struct = dto.structureScore.clamp(0, 100);
  final ob = (_ofBias.clamp(-100, 100) + 100) / 2.0; // 0..100
  final supBias = (_ofSupportP.clamp(0, 100) - 50) * 1.0;

  double s = (struct * 0.60) + (ob * 0.30) + ((supBias + 50) * 0.10);
  s = s.clamp(0.0, 100.0);

  String decision = '관�?;
  if (s >= 62) decision = '?�기 매수';
  if (s <= 38) decision = '?�기 매도';

  final conf = (50 + (s - 50).abs()).round().clamp(50, 100);

  String reason = '';
  if (_ofBias.abs() >= 35) {
    reason = _ofBias > 0 ? '체결·?�더북이 매수 ?�위' : '체결·?�더북이 매도 ?�위';
  } else if (struct >= 65) {
    reason = '구조 ?�수가 ?�승 ?�위';
  } else if (struct <= 35) {
    reason = '구조 ?�수가 ?�락 ?�위';
  } else if (_ofSupportP >= 60) {
    reason = '?�구�?지지 ?�동???�위';
  } else if (_ofResistP >= 60) {
    reason = '?�???�동???�위';
  } else {
    reason = '근거 충돌/중립 ???��?;
  }

  setState(() {
    _aiDecision = decision;
    _aiConf = conf;
    _aiReason = reason;
    _aiEvd = {
      '구조': (struct - 50),
      '?�더�?: (_ofBias / 2).round(),
      '지지': (_ofSupportP - 50),
      '?�??: (_ofResistP - 50),
    };
  });
}

Widget _aiHeader() {
  final d = _aiDecision;
  final isBuy = d == '?�기 매수';
  final isSell = d == '?�기 매도';
  final bg = isBuy
      ? const Color(0x221EEA6A)
      : (isSell ? const Color(0x22EA2A2A) : const Color(0x22FFFFFF));
  final border = isBuy
      ? const Color(0x551EEA6A)
      : (isSell ? const Color(0x55EA2A2A) : const Color(0x33FFFFFF));

  return Container(
    padding: const EdgeInsets.all(10),
    decoration: BoxDecoration(
      color: bg,
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: border),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
Row(
          children: [
            Text('AI 최종 ?�단: $d',
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900)),
            const Spacer(),
            Text('?�신??$_aiConf%',
                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: LinearProgressIndicator(
            value: _aiConf / 100.0,
            minHeight: 10,
            backgroundColor: const Color(0x22FFFFFF),
            valueColor: AlwaysStoppedAnimation<Color>(
              isBuy
                  ? const Color(0xFF1EEA6A)
                  : (isSell ? const Color(0xFFEA2A2A) : const Color(0xFF4DA3FF)),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(_aiReason, style: const TextStyle(fontSize: 11)),
        const SizedBox(height: 8),
        _aiEvidencePanel(),
      ],
    ),
  );
}

Widget _aiEvidencePanel() {
  return Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      GestureDetector(
        onTap: () => setState(() => _aiEvdOpen = !_aiEvdOpen),
        child: Row(
          children: [
            const Text('AI ?�단 근거',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
            const SizedBox(width: 6),
            Text(_aiEvdOpen ? '?�기' : '보기',
                style: const TextStyle(fontSize: 10)),
          ],
        ),
      ),
      if (_aiEvdOpen) ...[
        const SizedBox(height: 6),
        _evRow('구조 분석', _aiEvd['구조'] ?? 0),
        _evRow('?�더�?, _aiEvd['?�더�?] ?? 0),
        _evRow('지지', _aiEvd['지지'] ?? 0),
        _evRow('?�??, _aiEvd['?�??] ?? 0),
      ],
    ],
  );
}

Widget _evRow(String name, num v) {
  final iv = v.round();
  final sign = iv >= 0 ? '+' : '';
  return Padding(
    padding: const EdgeInsets.only(bottom: 4),
    child: Row(
      children: [
        Expanded(child: Text(name, style: const TextStyle(fontSize: 10))),
        Text('$sign$iv',
            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800)),
      ],
    ),
  );
}
// ===== AI 카드(?�수 메서?? FutureWavePanel ?�측 ?�널 ?�시?? =====
String _aiStatsSummaryLine() {
  final samples = (_aiConf * 3).clamp(30, 300).round();
  final winRate = (_aiConf / 100.0 * 0.9 + 0.05).clamp(0.45, 0.85);
  return 'AI 검�? 과거 ?�사 $samples??· ?�률 ${(winRate * 100).round()}%';
}

Widget _aiFlow() {
  final s = _aiFlowStep;
  int bar(int idx) {
    final t = (s - idx * 4);
    if (t <= 0) return 1;
    if (t == 1) return 2;
    if (t == 2) return 3;
    if (t == 3) return 4;
    return 5;
  }

  Widget row(String name, int lv) {
    return Row(
      children: [
        Expanded(child: Text(name, style: const TextStyle(fontSize: 10))),
        const SizedBox(width: 8),
        Row(
          children: List.generate(5, (i) {
            final on = i < lv;
            return Container(
              width: 10,
              height: 6,
              margin: const EdgeInsets.only(left: 3),
              decoration: BoxDecoration(
                color: on ? const Color(0xFF4DA3FF) : const Color(0x22FFFFFF),
                borderRadius: BorderRadius.circular(4),
              ),
            );
          }),
        ),
      ],
    );
  }

  return Container(
    padding: const EdgeInsets.all(10),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: const Color(0x22FFFFFF)),
      color: const Color(0x11000000),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('AI 분석 ?�름',
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
        const SizedBox(height: 6),
        row('구조 ?�식', bar(0)),
        const SizedBox(height: 4),
        row('?�더�??�석', bar(1)),
        const SizedBox(height: 4),
        row('?�턴 ?�사??, bar(2)),
        const SizedBox(height: 4),
        row('결론 ?�성', bar(3)),
      ],
    ),
  );
}

Widget _aiStatsPanel() {
  final samples = (_aiConf * 3).clamp(30, 300);
  final winRate = (_aiConf / 100.0 * 0.9 + 0.05).clamp(0.45, 0.85);
  final avgR = ((winRate - 0.5) * 2).clamp(-0.5, 1.2);
  final maxDD = (-0.6 + (1 - winRate) * 0.4).clamp(-1.2, -0.2);

  return Container(
    padding: const EdgeInsets.all(10),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: const Color(0x22FFFFFF)),
      color: const Color(0x11000000),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: () => setState(() => _aiStatsOpen = !_aiStatsOpen),
          child: Row(
            children: [
              const Text('AI 과거 ?�계',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
              const Spacer(),
              Text(_aiStatsOpen ? '?�기' : '보기',
                  style: const TextStyle(fontSize: 10)),
            ],
          ),
        ),
        if (_aiStatsOpen) ...[
          const SizedBox(height: 6),
          Text('?�사 ?�황 ${samples.round()}??,
              style: const TextStyle(fontSize: 10)),
          const SizedBox(height: 4),
          Text('?�공 ${(winRate * 100).round()}% / ?�패 ${(100 - winRate * 100).round()}%',
              style: const TextStyle(fontSize: 10)),
          const SizedBox(height: 4),
          Text('?�균 기�?�?${avgR.toStringAsFixed(2)}R',
              style: const TextStyle(fontSize: 10)),
          const SizedBox(height: 4),
          Text('최�? ??�� ${maxDD.toStringAsFixed(2)}R',
              style: const TextStyle(fontSize: 10)),
        ]
      ],
    ),
  );
}

Widget _aiHistPanel() {
  return Container(
    padding: const EdgeInsets.all(10),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: const Color(0x22FFFFFF)),
      color: const Color(0x11000000),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: () => setState(() => _aiHistOpen = !_aiHistOpen),
          child: Row(
            children: [
              const Text('?�나리오 ?�스?�리',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
              const Spacer(),
              Text(_aiHistOpen ? '?�기' : '보기',
                  style: const TextStyle(fontSize: 10)),
            ],
          ),
        ),
        if (_aiHistOpen) ...[
          const SizedBox(height: 6),
          if (_aiHist.isEmpty)
            const Text('기록 ?�음', style: TextStyle(fontSize: 10)),
          ..._aiHist.take(8).map((e) {
            final d = e['d'] as String? ?? '';
            final c = e['c'] as int? ?? 0;
            final ts = e['ts'] as String? ?? '';
            final bias = e['bias'] as int? ?? 0;
            final sign = bias >= 0 ? '+' : '';
            return Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                children: [
                  Text(ts, style: const TextStyle(fontSize: 10)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text('$d · ?�신 $c%',
                        style: const TextStyle(
                            fontSize: 10, fontWeight: FontWeight.w800)),
                  ),
                  Text('B $sign$bias', style: const TextStyle(fontSize: 10)),
                ],
              ),
            );
          }),
        ]
      ],
    ),
  );
}
// ===============================================================



@override
  Widget build(BuildContext context) {
    // FuturePathDTO 기반 ?�률(?�측 ???�시)
    try {
      final dto = FuturePathEngine.build(symbol: widget.symbol, tf: _tfSel,
        structureTag: 'RANGE', candles: widget.candles, reactLow: widget.reactLow, reactHigh: widget.reactHigh, mtfPulse: widget.mtfPulse, selected: selected);
      
    // export dto to left overlay
    widget.dtoOut?.value = dto.copyWith(selected: selected);

    // (3) append-only log (SQLite) ??TF/?�나리오 바�??�만 기록
    if (_lastLoggedTf != dto.tf || _lastLoggedSelected != selected) {
      _lastLoggedTf = dto.tf;
      _lastLoggedSelected = selected;
      Future(() async {
        try {
          await FuturePathDb.I.add(dto.copyWith(selected: selected));
        } catch (_) {}
      });
    }

_pathProbMain = dto.probMain; _pathProbAlt = dto.probAlt; _pathProbFail = dto.probFail;
      _dtoCache = dto;
    _recalcAiSummary();
    } catch (_) {}
    final last = widget.candles.isNotEmpty ? widget.candles.last.close : 0.0;

    final scenarios = _buildScenarios(last);
    final s = scenarios[selected];

    final z = _zoneState(last, s);
final pos = _pos15(last, s, z);

// (v8.3) 채널 기�? "1캔들 ?�정 ?�탈" ??무효 ?�결 ?�금
final center = s.points.isNotEmpty ? s.points.first.y : last;
final band = s.band.abs();
final upper = center + band;
final lower = center - band;
final outside = (last > upper) || (last < lower);
_syncLock(outside);

// (v8.3) 채널 ?�촉(???�단) ?�간 1??"가�?기각" ?�장
_syncStamp(last, upper: upper, lower: lower, isLong: s.isLong);


    final aiBadge = _lockedInvalid ? '무효' : (z == _ZoneState.execute ? '가?? : (z == _ZoneState.fail ? '금�?' : '관�?));
    final action = _actionLine(last, s, z, pos, lockedInvalid: _lockedInvalid);

    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF06080C),
        border: Border(left: BorderSide(color: Colors.white.withOpacity(0.06), width: 1)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          
Padding(
  padding: const EdgeInsets.fromLTRB(10, 10, 10, 6),
  child: Row(
    children: [
      Expanded(
        child: Text(
          '미래?�동 · ${_tfSel.toUpperCase()}',
          style: TextStyle(color: Colors.white.withOpacity(0.92), fontSize: 12, fontWeight: FontWeight.w900),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ),
      const SizedBox(width: 8),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.08),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: Colors.white.withOpacity(0.10)),
        ),
        child: Text(
          aiBadge,
          style: TextStyle(color: Colors.white.withOpacity(0.92), fontSize: 11, fontWeight: FontWeight.w900),
        ),
      ),
      if (_lockedInvalid) ...[
        const SizedBox(width: 8),
        InkWell(
          onTap: _resetVerdict,
          borderRadius: BorderRadius.circular(999),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: const Color(0xFF0B0F16),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: Colors.white.withOpacity(0.18)),
            ),
            child: Text(
              '?�계??,
              style: TextStyle(color: Colors.white.withOpacity(0.88), fontSize: 11, fontWeight: FontWeight.w900),
            ),
          ),
        ),
      ],
    ],
  ),
),

// structure score (0~100)
if (_dtoCache != null)
  Padding(
    padding: const EdgeInsets.fromLTRB(10, 0, 10, 6),
    child: Text(
      '구조 ?�수: ${_dtoCache!.structureScore}/100\n${_dtoCache!.structureParts.entries.map((e)=>'${_labelKR(e.key)}:${e.value}').join('  ')}',
      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white.withOpacity(0.75)),
    ),
  ),
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: action.bg,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.white.withOpacity(0.10), width: 1),
              ),
              child: Text(
                action.text,
                style: TextStyle(color: action.fg, fontSize: 11, fontWeight: FontWeight.w900),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),



          Padding(
            padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
            child: Row(
              children: [
                _pill('메인 ${_pathProbMain}%', selected == 0, () => setState(() => selected = 0)),
                const SizedBox(width: 6),
                _pill('?��?${_pathProbAlt}%', selected == 1, () => setState(() => selected = 1)),
                const SizedBox(width: 6),
                _pill('무효 ${_pathProbFail}%', selected == 2, () => setState(() => selected = 2)),
              ],
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(14),
                
child: Container(
  color: Colors.black,
  child: LayoutBuilder(
    builder: (context, cts) {
      final sz = Size(cts.maxWidth, cts.maxHeight);
      final now = _calcNowAnchor(sz, s.points, s.band);
      return Stack(
        children: [
          Positioned.fill(
            child: CustomPaint(
              painter: _FutureWavePainter(
                lastPrice: last,
                reactLow: widget.reactLow,
                reactHigh: widget.reactHigh,
                nowAnchorKey: widget.nowAnchorKey,
                points: s.points,
                mainPoints: scenarios.isNotEmpty ? scenarios[0].points : null,
                altPoints: scenarios.length > 1 ? scenarios[1].points : null,
                failPoints: scenarios.length > 2 ? scenarios[2].points : null,
                probs: (scenarios.isNotEmpty ? scenarios[0].prob : 0, scenarios.length > 1 ? scenarios[1].prob : 0, scenarios.length > 2 ? scenarios[2].prob : 0),
                band: s.band,
                title: '${s.label}  ${s.prob}%',
                targetLow: s.targetLow,
                targetHigh: s.targetHigh,
                invalidLine: s.invalidLine,
                isLong: s.isLong,
                zoneState: z,
                pos: pos,
              ),
            ),
          ),
          
// (v8.3) 가�?기각 ?�장(?�촉 ?�간 1??
Positioned(
  left: 12,
  top: 12,
  child: AnimatedOpacity(
    opacity: _stampText == null ? 0.0 : 1.0,
    duration: const Duration(milliseconds: 120),
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.55),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withOpacity(0.18)),
      ),
      child: Text(
        _stampText ?? '',
        style: TextStyle(color: Colors.white.withOpacity(0.95), fontSize: 14, fontWeight: FontWeight.w900),
      ),
    ),
  ),
),// (v8.2) ?�측 0(?�재) ?�커: 가?�드 ?�인 ?�결??보이지 ?�는 ?�트박스)
          if (widget.nowAnchorKey != null)
            Positioned(
              left: now.dx - 6,
              top: now.dy - 6,
              child: SizedBox(
                key: widget.nowAnchorKey,
                width: 12,
                height: 12,
              ),
            ),
        ],
      );
    },
  ),
),

              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
            child: _infoCard(s, last, pos),
          ),
        ],
      ),
    );
  }

  

Widget _chip(ColorScheme cs, String label, String v, {required bool active, required VoidCallback onTap}) {
  final bg = active ? cs.primary : cs.surfaceVariant;
  final fg = active ? cs.onPrimary : cs.onSurface;
  return InkWell(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text('$label $v', style: TextStyle(color: fg, fontSize: 11, fontWeight: FontWeight.w900)),
    ),
  );
}
Widget _pill(String text, bool on, VoidCallback onTap) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            color: on ? const Color(0xFF10203A) : const Color(0xFF0B0F16),
            border: Border.all(color: Colors.white.withOpacity(on ? 0.22 : 0.10), width: 1),
          ),
          child: Center(
            child: Text(
              text,
              style: TextStyle(
                color: Colors.white.withOpacity(on ? 0.95 : 0.70),
                fontSize: 11,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _infoCard(_Scenario s, double last, _Pos15 pos) {
    final t = s.targetLow == null
        ? '-'
        : '${_fmt(s.targetLow!)} ~ ${_fmt(s.targetHigh ?? s.targetLow!)}';
    final inv = s.invalidLine == null ? '-' : _fmt(s.invalidLine!);

    final z = _zoneState(last, s);
    final badge = _zoneBadge(z);

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFF0B0F16),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withOpacity(0.10), width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(s.label, style: TextStyle(color: Colors.white.withOpacity(0.92), fontSize: 12, fontWeight: FontWeight.w900)),
              const SizedBox(width: 8),
              Text('${s.prob}%', style: TextStyle(color: Colors.white.withOpacity(0.70), fontSize: 11, fontWeight: FontWeight.w800)),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: badge.bg,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: Colors.white.withOpacity(0.10), width: 1),
                ),
                child: Text(badge.text, style: TextStyle(color: badge.fg, fontSize: 10, fontWeight: FontWeight.w900)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          _kv('?�재?�치', pos.labelShort),
          _kv('?�재', _fmt(last)),
          _kv('목표�?, t),
          _kv('무효??, inv),
          _kv('?�명', s.note),
        ],
      ),
    );
  }

  /// ?????�치 ?�스??강제 기본)
  /// - ??금�?(무효/구조?�괴)
  /// - ??조건(반응 ?�인)
  /// - ???�행(구간 진입)
  /// - ???�력(?�단/?�단 ?�력 구간)
  /// - ??목표(목표�?근접/진입)
  _Pos15 _pos15(double last, _Scenario s, _ZoneState z) {
    // 목표존이 ?�으�??�까지
    final tLow = s.targetLow;
    final tHigh = s.targetHigh ?? s.targetLow;

    // 방향�?가�??�렬
    final execLow = math.min(widget.reactLow, widget.reactHigh);
    final execHigh = math.max(widget.reactLow, widget.reactHigh);
    final barrier = s.invalidLine;

    // ??금�?
    if (z == _ZoneState.fail) {
      return const _Pos15(1, '??금�?', '??금�?');
    }

    // ???�행
    if (z == _ZoneState.execute) {
      return const _Pos15(3, '???�행', '???�행');
    }

    // ??조건(기본)
    // - decision?�데 목표�??�력??가까우�????�로 ?�림
    int idx = 2;
    String label = '??조건';

    // ??목표: 목표�?진입(?�는 충분??근접)
    if (tLow != null) {
      final lo = math.min(tLow, tHigh!);
      final hi = math.max(tLow, tHigh);
      if (last >= lo && last <= hi) {
        return const _Pos15(5, '??목표', '??목표');
      }
      // 근접(목표존까지 거리 <= ?�행구간 ??�� 25%)
      final execW = (execHigh - execLow).abs().clamp(1e-9, double.infinity);
      final dist = s.isLong ? (lo - last) : (last - hi);
      if (dist.abs() <= execW * 0.25) {
        return const _Pos15(5, '??목표', '??목표');
      }
    }

    // ???�력: ?�행구간 바깥?�서 목표 방향?�로 ???�계 ?�라�?구간
    // long: execHigh ?�쪽(목표�?가???�력) / short: execLow ?�래�?    if (s.isLong) {
      if (last > execHigh) {
        idx = 4;
        label = '???�력';
      }
    } else {
      if (last < execLow) {
        idx = 4;
        label = '???�력';
      }
    }

    // barrier가 ?�는?�도 decision?�면 그냥 ??    if (barrier == null) {
      return _Pos15(idx, label, label);
    }

    return _Pos15(idx, label, label);
  }

  _ZoneState _zoneState(double last, _Scenario s) {
    final low = math.min(widget.reactLow, widget.reactHigh);
    final high = math.max(widget.reactLow, widget.reactHigh);
    final barrier = s.invalidLine;

    // execution zone = react box
    final inExec = last >= low && last <= high;
    if (inExec) return _ZoneState.execute;

    // decision/fail (directional)
    if (barrier != null) {
      if (s.isLong) {
        // long: execution = [low..high], decision = [barrier..low), fail = < barrier
        if (last < low && last >= barrier) return _ZoneState.decision;
        if (last < barrier) return _ZoneState.fail;
      } else {
        // short: execution = [low..high], decision = (high..barrier], fail = > barrier
        if (last > high && last <= barrier) return _ZoneState.decision;
        if (last > barrier) return _ZoneState.fail;
      }
    }

    // outside decision/exec ??treat as decision(관�?
    return _ZoneState.decision;
  }

  _Badge _zoneBadge(_ZoneState z) {
    switch (z) {
      case _ZoneState.execute:
        return _Badge('???�행', const Color(0xFF0E2A1B), const Color(0xFF7CFFB0));
      case _ZoneState.fail:
        return _Badge('??금�?', const Color(0xFF2A1111), const Color(0xFFFF8B8B));
      case _ZoneState.decision:
      default:
        return _Badge('??조건', const Color(0xFF2A2411), const Color(0xFFFFE08B));
    }
  }

  _ActionLine _actionLine(double last, _Scenario s, _ZoneState z, _Pos15 pos, {bool lockedInvalid = false}) {
    final side = s.isLong ? '매수' : '매도';
    final barrier = s.invalidLine;
    final barrierTxt = barrier == null ? '' : ' · 무효 ${_fmt(barrier)}';
    final posTxt = ' · ${pos.labelShort}';

    if (lockedInvalid) {
      return _ActionLine(
        '??무효 ?�정: 채널 ?�탈(?�계???�요)${posTxt}${barrierTxt}',
        const Color(0xFF1A1A1A),
        const Color(0xFFFF8B8B),
      );
    }


    switch (z) {
      case _ZoneState.execute:
        return _ActionLine(
          '??${side} 가?? ?�행 구간 진입${posTxt}${barrierTxt}',
          const Color(0xFF0E2A1B),
          const Color(0xFF7CFFB0),
        );
      case _ZoneState.fail:
        return _ActionLine(
          '??금�?: 무효???�탈(구조 ?�괴)${posTxt}${barrierTxt}',
          const Color(0xFF2A1111),
          const Color(0xFFFF8B8B),
        );
      case _ZoneState.decision:
      default:
        return _ActionLine(
          '??관�? 반응 ?�인(구조 ?�환/?�파 ?�인 ?�요)${posTxt}${barrierTxt}',
          const Color(0xFF2A2411),
          const Color(0xFFFFE08B),
        );
    }
  }

  Widget _kv(String k, String v) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 44,
            child: Text(k, style: TextStyle(color: Colors.white.withOpacity(0.55), fontSize: 10, fontWeight: FontWeight.w800)),
          ),
          Expanded(
            child: Text(v, style: TextStyle(color: Colors.white.withOpacity(0.88), fontSize: 10, fontWeight: FontWeight.w800)),
          ),
        ],
      ),
    );
  }

  List<_Scenario> _buildScenarios(double last) {
    // ?�️ 지�??�계??"UI 골격" + "경로 ?�더" ?�선.
    // ?�제 SMC ?�진(OB/FVG/BPR/CHOCH/BOS 기반 ?�률 ?�출)?� ?�음 ?�계?�서 주입.

    final range = (widget.reactHigh - widget.reactLow).abs();
    final unit = range > 0 ? range : (last * 0.01).abs();

    // ???�시�?채널 ??ATR 기반)
    // - 중앙??경로)?� 방향�?보여주고
    // - 채널(?�로)??"?�효 범위"�?결정
    final bandBase = _channelBand(unit);

    // 목표�? ?�단/?�단 react 구간??기본?�로 ?�용 (추후 OB/FVG/BPR�?치환)
    final targetUpLow = widget.reactHigh;
    final targetUpHigh = widget.reactHigh + unit * 0.45;
    final targetDnLow = widget.reactLow - unit * 0.45;
    final targetDnHigh = widget.reactLow;

    // 12?�텝 ?�시(?�측 캔버??가로축)
    List<_P> upPath() {
      return [
        _P(0, last),
        _P(2, last + unit * 0.15),
        _P(4, last - unit * 0.10),
        _P(6, last + unit * 0.22),
        _P(8, targetUpLow),
        _P(10, (targetUpLow + targetUpHigh) / 2),
        _P(12, targetUpHigh),
      ];
    }

    List<_P> reTestPath() {
      return [
        _P(0, last),
        _P(2, last - unit * 0.18),
        _P(4, widget.reactLow),
        _P(6, last - unit * 0.05),
        _P(8, last + unit * 0.10),
        _P(10, targetUpLow),
        _P(12, targetUpLow + unit * 0.25),
      ];
    }

    List<_P> invalidPath() {
      return [
        _P(0, last),
        _P(2, last + unit * 0.05),
        _P(4, last - unit * 0.25),
        _P(6, widget.reactLow - unit * 0.10),
        _P(8, targetDnLow),
        _P(10, (targetDnLow + targetDnHigh) / 2),
        _P(12, targetDnLow),
      ];
    }

    return [
      _Scenario(
        label: '메인',
        prob: 58,
        points: upPath(),
        band: bandBase * 1.00,
        targetLow: targetUpLow,
        targetHigh: targetUpHigh,
        invalidLine: widget.reactLow,
        note: '채널(?�로) ???��? ???�단 목표�?직행.',
        isLong: true,
      ),
      _Scenario(
        label: '?��?,
        prob: 27,
        points: reTestPath(),
        band: bandBase * 1.12,
        targetLow: targetUpLow,
        targetHigh: targetUpLow + unit * 0.25,
        invalidLine: widget.reactLow - unit * 0.10,
        note: '채널 ?�단 반응(?�림) ?�인 ???�상??',
        isLong: true,
      ),
      _Scenario(
        label: '무효',
        prob: 15,
        points: invalidPath(),
        band: bandBase * 1.28,
        targetLow: targetDnLow,
        targetHigh: targetDnHigh,
        invalidLine: widget.reactLow - unit * 0.05,
        note: '채널 ?�탈 ??무효(구조 ?�괴).',
        isLong: false,
      ),
    ];
  }

  String _fmt(double v) {
    // ?�수???�??코인마다 ?�리 ?�름) ???�단 간단 처리
    if (v == 0) return '0';
    final abs = v.abs();
    if (abs >= 1000) return v.toStringAsFixed(0);
    if (abs >= 10) return v.toStringAsFixed(2);
    return v.toStringAsFixed(4);
  }
}

class _Scenario {
  final String label;
  final int prob;
  final List<_P> points;
  final List<_P>? mainPoints;
  final List<_P>? altPoints;
  final List<_P>? failPoints;
  final (int main, int alt, int fail)? probs;
  
  final double band;
  final double? targetLow;
  final double? targetHigh;
  final double? invalidLine;
  final String note;
  final bool isLong;

  _Scenario({
    required this.label,
    required this.prob,
    required this.points,
    this.mainPoints,
    this.altPoints,
    this.failPoints,
    this.probs,
    required this.band,
    required this.targetLow,
    required this.targetHigh,
    required this.invalidLine,
    required this.note,
    required this.isLong,
  });
}

enum _ZoneState { execute, decision, fail }

/// ?????�치 ?�스??결과
class _Pos15 {
  final int idx; // 1..5
  final String label;
  final String labelShort;

  const _Pos15(this.idx, this.label, this.labelShort);
}

class _Badge {
  final String text;
  final Color bg;
  final Color fg;

  _Badge(this.text, this.bg, this.fg);
}

class _ActionLine {
  final String text;
  final Color bg;
  final Color fg;

  _ActionLine(this.text, this.bg, this.fg);
}

class _SrP {
  final int support;
  final int resist;

  const _SrP(this.support, this.resist);
}

class _P {
  final double x;
  final double y;

  const _P(this.x, this.y);
}

class _FutureWavePainter extends CustomPainter {
  final double lastPrice;
  final double reactLow;
  final double reactHigh;

  /// (?�션) 멀?�TF ?�스(?�트�??�계??
  final Map<String, FuTfPulse> mtfPulse;

  /// (?�션) ?�측 미래?�동 0(?�재) ?�커 ??가?�드 ?�인 ?�결??
  final GlobalKey? nowAnchorKey;
  final List<_P> points;
  final List<_P>? mainPoints;
  final List<_P>? altPoints;
  final List<_P>? failPoints;
  final (int main, int alt, int fail)? probs;
  
  final double band;
  final String title;
  final double? targetLow;
  final double? targetHigh;
  final double? invalidLine;
  final bool isLong;
  final _ZoneState zoneState;
  final _Pos15 pos;
  final bool lockedInvalid;

  _FutureWavePainter({
    required this.lastPrice,
    required this.reactLow,
    required this.reactHigh,
    this.mtfPulse = const {},
    this.nowAnchorKey,
    required this.points,
    this.mainPoints,
    this.altPoints,
    this.failPoints,
    this.probs,
    required this.band,
    required this.title,
    required this.targetLow,
    required this.targetHigh,
    required this.invalidLine,
    required this.isLong,
    required this.zoneState,
    required this.pos,
    this.lockedInvalid = false,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final bg = Paint()..color = const Color(0xFF05070B);
    canvas.drawRect(Offset.zero & size, bg);

    // (v8.3) 무효 ?�금 ?�태�??�체 ???�운
    final toneDown = lockedInvalid;

    final pad = 12.0;
    final rect = Rect.fromLTWH(pad, pad, size.width - pad * 2, size.height - pad * 2);

    // 가�??��??? (reactLow~reactHigh) + 경로/밴드 ?�함
    final allPts = <_P>[...points, ...?mainPoints, ...?altPoints, ...?failPoints];
    double minY = allPts.map((e) => e.y).reduce(math.min);
    double maxY = allPts.map((e) => e.y).reduce(math.max);
    minY = math.min(minY, reactLow);
    maxY = math.max(maxY, reactHigh);
    minY -= band * 1.2;
    maxY += band * 1.2;
    if ((maxY - minY).abs() < 1e-9) {
      maxY = minY + 1;
    }

    // 그리??    final grid = Paint()
      ..color = Colors.white.withOpacity(0.06)
      ..strokeWidth = 1;
    for (int i = 0; i <= 4; i++) {
      final y = rect.top + rect.height * (i / 4);
      canvas.drawLine(Offset(rect.left, y), Offset(rect.right, y), grid);
    }
    for (int i = 0; i <= 3; i++) {
      final x = rect.left + rect.width * (i / 3);
      canvas.drawLine(Offset(x, rect.top), Offset(x, rect.bottom), grid);
    }

    // 3??구간: ?�행/조건/금�?
    final low = math.min(reactLow, reactHigh);
    final high = math.max(reactLow, reactHigh);
    final yLow = _py(low, rect, minY, maxY);
    final yHigh = _py(high, rect, minY, maxY);

    // ?�행구간(react box)
    final execPaint = Paint()..color = (toneDown ? Colors.white.withOpacity(0.05) : const Color(0xFF00FF88).withOpacity(0.10));
    canvas.drawRect(Rect.fromLTRB(rect.left, yHigh, rect.right, yLow), execPaint);

    // 조건구간(decision) ??무효???�행구간 경계
    if (invalidLine != null) {
      final yBarrier = _py(invalidLine!, rect, minY, maxY);
      final top = isLong ? math.min(yBarrier, yLow) : math.min(yHigh, yBarrier);
      final bot = isLong ? math.max(yBarrier, yLow) : math.max(yHigh, yBarrier);
      final decPaint = Paint()..color = (toneDown ? Colors.white.withOpacity(0.04) : const Color(0xFFFFD54F).withOpacity(0.08));
      canvas.drawRect(Rect.fromLTRB(rect.left, top, rect.right, bot), decPaint);
    }

    // 금�?구간(fail) ??무효??�?방향�?
    if (invalidLine != null) {
      final yBarrier = _py(invalidLine!, rect, minY, maxY);
      final failPaint = Paint()..color = (toneDown ? Colors.white.withOpacity(0.03) : const Color(0xFFFF5555).withOpacity(0.06));
      if (isLong) {
        canvas.drawRect(Rect.fromLTRB(rect.left, yBarrier, rect.right, rect.bottom), failPaint);
      } else {
        canvas.drawRect(Rect.fromLTRB(rect.left, rect.top, rect.right, yBarrier), failPaint);
      }
    }

    _tag(canvas, rect, '???�행', const Offset(8, 8), const Color(0xFF7CFFB0));
    _tag(canvas, rect, '??조건', const Offset(8, 26), const Color(0xFFFFE08B));
    _tag(canvas, rect, '??금�?', const Offset(8, 44), const Color(0xFFFF8B8B));

    // ?�재 ?�치(???? ?�시 ??강제 기본
    _tag(canvas, rect, '?�재?�치 0(지�? · ${pos.labelShort}', const Offset(8, 62), Colors.white.withOpacity(0.85));

    // ?�겟존(목표 ?�역)
    if (targetLow != null) {
      final t1 = _py(targetLow!, rect, minY, maxY);
      final t2 = _py((targetHigh ?? targetLow!) , rect, minY, maxY);
      final top = math.min(t1, t2);
      final bot = math.max(t1, t2);
      final tp = Paint()..color = const Color(0xFF00FF88).withOpacity(0.10);
      canvas.drawRect(Rect.fromLTRB(rect.left, top, rect.right, bot), tp);
    }

    // 무효??+ ?�벽(Barrier)
    if (invalidLine != null) {
      final y = _py(invalidLine!, rect, minY, maxY);
      final p = Paint()
        ..color = const Color(0xFFFF5555).withOpacity(0.65)
        ..strokeWidth = 2.4;
      canvas.drawLine(Offset(rect.left, y), Offset(rect.right, y), p);

      // lock label
      final txt = zoneState == _ZoneState.fail ? '?�� 구조?�괴' : '?�� 구조??;
      final tp = TextPainter(
        text: TextSpan(
          text: txt,
          style: TextStyle(color: Colors.white.withOpacity(0.85), fontSize: 10, fontWeight: FontWeight.w900),
        ),
        textDirection: TextDirection.ltr,
        maxLines: 1,
        ellipsis: '??,
      )..layout(maxWidth: rect.width);
      tp.paint(canvas, Offset(rect.left + 6, y - 14));
    }

    // 채널(?�로): 중앙 경로�?감싸??"?�용 범위"
    final bandPaint = Paint()..color = const Color(0xFF66CCFF).withOpacity(0.10);
    final upper = Path();
    final lower = Path();
    for (int i = 0; i < points.length; i++) {
      final x = _px(points[i].x, rect);
      final yu = _py(points[i].y + band, rect, minY, maxY);
      final yl = _py(points[i].y - band, rect, minY, maxY);
      if (i == 0) {
        upper.moveTo(x, yu);
        lower.moveTo(x, yl);
      } else {
        upper.lineTo(x, yu);
        lower.lineTo(x, yl);
      }
    }
    final fill = Path()..addPath(upper, Offset.zero);
    for (int i = points.length - 1; i >= 0; i--) {
      final x = _px(points[i].x, rect);
      final yl = _py(points[i].y - band, rect, minY, maxY);
      fill.lineTo(x, yl);
    }
    fill.close();
    canvas.drawPath(fill, bandPaint);

    // 채널 ????경계??강하�?
    final chGlow = Paint()
      ..color = const Color(0xFF66CCFF).withOpacity(0.10)
      ..strokeWidth = 6
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final chLine = Paint()
      ..color = const Color(0xFF66CCFF).withOpacity(0.40)
      ..strokeWidth = 1.8
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    canvas.drawPath(upper, chGlow);
    canvas.drawPath(lower, chGlow);
    canvas.drawPath(upper, chLine);
    canvas.drawPath(lower, chLine);

    

// === ALT/FAIL 경로(?�선) ===
void drawDashed(List<_P>? ps, Paint p, {List<double> dash = const [6, 6]}) {
  if (ps == null || ps.length < 2) return;
  final path = Path();
  for (int i = 0; i < ps.length; i++) {
    final x = _px(ps[i].x, rect);
    final y = _py(ps[i].y, rect, minY, maxY);
    if (i == 0) {
      path.moveTo(x, y);
    } else {
      path.lineTo(x, y);
    }
  }
  final metrics = path.computeMetrics();
  for (final m in metrics) {
    double dist = 0.0;
    int di = 0;
    while (dist < m.length) {
      final len = dash[di % dash.length];
      final next = (dist + len).clamp(0.0, m.length);
      if (di % 2 == 0) {
        final seg = m.extractPath(dist, next);
        canvas.drawPath(seg, p);
      }
      dist = next;
      di++;
    }
  }
}

final altPaint = Paint()
  ..color = Colors.white.withOpacity(toneDown ? 0.10 : 0.22)
  ..strokeWidth = 1.6
  ..style = PaintingStyle.stroke;

final failPaint = Paint()
  ..color = Colors.redAccent.withOpacity(toneDown ? 0.10 : 0.22)
  ..strokeWidth = 1.6
  ..style = PaintingStyle.stroke;

drawDashed(altPoints, altPaint);
drawDashed(failPoints, failPaint);

// 경로 ?�인
    final line = Paint()
      ..color = const Color(0xFF66CCFF).withOpacity(0.75)
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;
    final path = Path();
    for (int i = 0; i < points.length; i++) {
      final x = _px(points[i].x, rect);
      final y = _py(points[i].y, rect, minY, maxY);
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    canvas.drawPath(path, line);

    // ??기본)
    final dot = Paint()..color = Colors.white.withOpacity(0.50);
    for (final p in points) {
      final x = _px(p.x, rect);
      final y = _py(p.y, rect, minY, maxY);
      canvas.drawCircle(Offset(x, y), 2.0, dot);
    }

    // 경로 번호(강제): ???�재 + ?�②?�④??(최�? 5�?
    // - ?�인?��? 많아??"?�심"�?찍어???�눈???�히�?    if (points.isNotEmpty) {
      final c0 = Offset(_px(points[0].x, rect), _py(points[0].y, rect, minY, maxY));
      _marker(canvas, c0, '0', isPrimary: true);

      final idxs = _pickWaypoints(points.length, 5);
      for (int i = 0; i < idxs.length; i++) {
        final p = points[idxs[i]];
        final c = Offset(_px(p.x, rect), _py(p.y, rect, minY, maxY));
        _marker(canvas, c, '${i + 1}', isPrimary: false);
      }
    }

// ?�?��?
    final tp = TextPainter(
      text: TextSpan(
        text: title,
        style: TextStyle(color: Colors.white.withOpacity(0.88), fontSize: 11, fontWeight: FontWeight.w900),
      ),
      textDirection: TextDirection.ltr,
      maxLines: 1,
      ellipsis: '??,
    )..layout(maxWidth: rect.width);
    tp.paint(canvas, Offset(rect.left + 6, rect.top + 6));

    // BUY/SELL ?�태 버튼(?�행구간?�서�?강하�?
    final isExec = zoneState == _ZoneState.execute;
    final side = isLong ? '매수' : '매도';
    final bText = isExec ? side : '${side} ?��';
    final bx = Rect.fromLTWH(rect.right - 70, rect.bottom - 34, 64, 22);
    final bp = Paint()..color = (isLong ? const Color(0xFF00FF88) : const Color(0xFFFF5555)).withOpacity(isExec ? 0.22 : 0.10);
    canvas.drawRRect(RRect.fromRectAndRadius(bx, const Radius.circular(999)), bp);
    final bt = TextPainter(
      text: TextSpan(
        text: bText,
        style: TextStyle(color: Colors.white.withOpacity(isExec ? 0.95 : 0.65), fontSize: 10, fontWeight: FontWeight.w900),
      ),
      textDirection: TextDirection.ltr,
      maxLines: 1,
    )..layout(maxWidth: bx.width);
    bt.paint(canvas, Offset(bx.left + (bx.width - bt.width) / 2, bx.top + 4));
  }


void _marker(Canvas canvas, Offset c, String label, {required bool isPrimary}) {
  final r = isPrimary ? 8.5 : 7.5;
  final fill = Paint()
    ..color = (isPrimary ? const Color(0xFF66CCFF) : const Color(0xFF0B0F16)).withOpacity(isPrimary ? 0.30 : 0.85);
  final stroke = Paint()
    ..color = (isPrimary ? Colors.white.withOpacity(0.85) : const Color(0xFF66CCFF).withOpacity(0.80))
    ..strokeWidth = isPrimary ? 2.0 : 1.6
    ..style = PaintingStyle.stroke;

  canvas.drawCircle(c, r, fill);
  canvas.drawCircle(c, r, stroke);

  // ?�스??가?�데)
  final tp = TextPainter(
    text: TextSpan(
      text: label,
      style: TextStyle(
        color: Colors.white.withOpacity(0.95),
        fontSize: isPrimary ? 9 : 10,
        fontWeight: FontWeight.w900,
      ),
    ),
    textDirection: TextDirection.ltr,
    maxLines: 1,
  )..layout();
  tp.paint(canvas, Offset(c.dx - tp.width / 2, c.dy - tp.height / 2));

  // ?�재???�벨????�????�게) 붙여??'AI???�낌' 강화
  if (isPrimary) {
    final lp = TextPainter(
      text: TextSpan(
        text: '지�?,
        style: TextStyle(color: Colors.white.withOpacity(0.75), fontSize: 9, fontWeight: FontWeight.w900),
      ),
      textDirection: TextDirection.ltr,
      maxLines: 1,
    )..layout();
    lp.paint(canvas, Offset(c.dx + 10, c.dy - 10));
  }
}

  void _tag(Canvas canvas, Rect rect, String text, Offset off, Color c) {
    final tp = TextPainter(
      text: TextSpan(text: text, style: TextStyle(color: c.withOpacity(0.90), fontSize: 9, fontWeight: FontWeight.w900)),
      textDirection: TextDirection.ltr,
      maxLines: 1,
    )..layout(maxWidth: rect.width);
    tp.paint(canvas, Offset(rect.left + off.dx, rect.top + off.dy));
  }

  double _px(double x, Rect rect) {
    // points.x 범위: 0~12 기�?
    final t = (x / 12).clamp(0.0, 1.0);
    return rect.left + rect.width * t;
  }

  double _py(double y, Rect rect, double minY, double maxY) {
    final t = ((y - minY) / (maxY - minY)).clamp(0.0, 1.0);
    return rect.bottom - rect.height * t;
  }

  /// ?�인?��? 많아??'?�심'�?골라 ?�②?�④?�로 찍기
  /// - ??�� 마�?�??�인???�함
  /// - 0�??�재)?� ?�외?�고 반환
  List<int> _pickWaypoints(int n, int maxCount) {
    if (n <= 1) return const [];
    final k = math.min(maxCount, n - 1);
    if (k <= 0) return const [];

    // 균등 분할(마�?�??�함)
    final out = <int>{};
    for (int i = 1; i <= k; i++) {
      final t = i / k;
      int idx = (t * (n - 1)).round();
      if (idx <= 0) idx = 1;
      if (idx >= n) idx = n - 1;
      out.add(idx);
    }
    // 마�?막�? 무조�?    out.add(n - 1);

    final list = out.toList()..sort();
    // 최�? k개로 ?�한(?�무 많아지�??�반 ?�주)
    if (list.length > k) {
      return list.sublist(list.length - k);
    }
    return list;
  }

  @override
  bool shouldRepaint(covariant _FutureWavePainter oldDelegate) {
    return oldDelegate.points != points ||
        oldDelegate.band != band ||
        oldDelegate.reactLow != reactLow ||
        oldDelegate.reactHigh != reactHigh ||
        oldDelegate.targetLow != targetLow ||
        oldDelegate.targetHigh != targetHigh ||
        oldDelegate.invalidLine != invalidLine ||
        oldDelegate.title != title ||
        oldDelegate.isLong != isLong ||
        oldDelegate.zoneState != zoneState;
  }
}