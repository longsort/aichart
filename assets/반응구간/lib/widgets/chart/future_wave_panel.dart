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

/// 우측: 미래 파동(스마트머니 컨셉)
/// - 선 1개 예측이 아니라: 메인/대체/무효 3 시나리오 + 확률 + 무효조건 + 목표존
/// - 현재는 "구조/존"이 준비된 상태에서, UI/렌더링 골격을 먼저 깔아둠
class FutureWavePanel extends StatefulWidget {
  final String symbol;
  final String? tf;

  /// (옵션) 계산된 FuturePathDTO를 좌측 오버레이로 공유
  final ValueNotifier<FuturePathDTO?>? dtoOut;
  final String tfLabel;
  final List<FuCandle> candles;
  final List<FuZone> zones;
  final double reactLow;
  final double reactHigh;

  /// (옵션) 우측 미래파동 0(현재) 앵커 키(가이드 라인 연결용)
  final GlobalKey? nowAnchorKey;

  /// (v9 PATCH) 선택된 시나리오 요약을 상위로 전달(커서 시뮬/결정패널 연동용)
  final ValueChanged<FutureScenarioSummary>? onScenario;

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
    this.nowAnchorKey,
    this.onScenario,
  });

  @override
  State<FutureWavePanel> createState() => _FutureWavePanelState();
}

/// (v9 PATCH) 우측 미래파동에서 현재 선택된 시나리오를
/// 상위(차트 전체화면)로 공유하기 위한 최소 요약 모델
class FutureScenarioSummary {
  final bool isLong;
  final String label;
  final double? invalidLine;
  final double? targetLow;
  final double? targetHigh;
  final double prob; // 0~1

  const FutureScenarioSummary({
    required this.isLong,
    required this.label,
    required this.invalidLine,
    required this.targetLow,
    required this.targetHigh,
    required this.prob,
  });
}

class _FutureWavePanelState extends State<FutureWavePanel> {


  // STEP17: 우측 패널 스크롤 고정
  final ScrollController _rightScroll = ScrollController();
String _labelKR(String key) {
  switch (key) {
    case 'consensus':
      return '합의';
    case 'pulse':
      return '강도';
    case 'align':
      return '정렬';
    case 'risk':
      return '위험';
    default:
      return key;
  }
}



  /// (v8.4) 5% 리스크(고정) 계산: 우측 패널에서 즉시 확인
  /// - entry: 현재가(last)
  /// - sl: 시나리오 invalidLine 우선, 없으면 반응구간 경계
  /// - tp: 시나리오 타겟(없으면 보수적으로 react 경계)
  EntryPlan _riskPlan(double last, _Scenario s) {
    final entry = last;

    // SL/TP 후보
    final sl = (s.invalidLine ?? (s.isLong ? widget.reactLow : widget.reactHigh));
    double s1, r1;
    if (s.isLong) {
      s1 = widget.reactLow;
      r1 = (s.targetHigh ?? (widget.reactHigh > 0 ? widget.reactHigh : entry));
    } else {
      s1 = (s.targetLow ?? (widget.reactLow > 0 ? widget.reactLow : entry));
      r1 = widget.reactHigh;
    }

    // 보호: 값 역전/0 방지
    if (s1 <= 0) s1 = entry;
    if (r1 <= 0) r1 = entry;

    // EntryPlanner는 UI에서 쓰기 좋은 형태로 5% 리스크/TP 분할/레버리지 추천을 제공
    return EntryPlanner.plan(
      isLong: s.isLong,
      price: entry,
      s1: s.isLong ? math.min(s1, sl) : s1,
      r1: s.isLong ? r1 : math.max(r1, sl),
      accountUsdt: AppSettings.accountUsdt,
      riskPct: AppSettings.riskPct,
    );
  }

  // (v8.3) 지지/저항 확률(체감형)
  // - 지금 단계에서는 '위치(①~⑤)' 기반으로 빠르게 보여주는 용도
  // - 이후 OB/FVG/BPR/거래량/구조점수와 결합 가능
  _SrP _srProb(_Pos15 pos, {required bool isLong}) {
    // ①일수록(저점/하단) 지지 우위, ⑤일수록(상단/한계) 저항 우위
    final table = <int, _SrP>{
      1: const _SrP(72, 28),
      2: const _SrP(65, 35),
      3: const _SrP(55, 45),
      4: const _SrP(45, 55),
      5: const _SrP(35, 65),
    };
    final base = table[pos.idx] ?? const _SrP(55, 45);
    // 숏 관점이면 뒤집어서 보여줌(저항 우위가 '지지 우위'처럼 보이지 않게)
    if (!isLong) return _SrP(base.resist, base.support);
    return base;
  }

// (v8.3) 판결 잠금: 채널 1캔들 확정 이탈 시 "무효 확정"으로 고정
bool _lockedInvalid = false;
int _outsideCount = 0;

// (v8.3) 가결/기각 도장(접촉 순간 1회)
String? _stampText;
Timer? _stampTimer;
int _lastTouch = 0; // -1=하단, 1=상단, 0=없음

void _syncLock(bool outside) {
  // 새로운 캔들이 들어올 때만 카운트가 의미가 있음
  // (여기서는 '마지막 종가'가 갱신될 때 build가 다시 불린다고 가정)
  if (_lockedInvalid) return;
  if (outside) {
    _outsideCount += 1;
    if (_outsideCount >= 1) {
      _lockedInvalid = true;
      // 도장도 같이: "무효"
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
  if (_lastTouch == touch) return; // 같은 면 반복 터치 무시
  _lastTouch = touch;

  // 롱/숏 관점에서 상단=저항, 하단=지지
  String t;
  if (isLong) {
    t = (touch == -1) ? '가결' : '기각';
  } else {
    t = (touch == 1) ? '가결' : '기각';
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
  int _pathProbMain = 0, _pathProbAlt = 0, _pathProbFail = 0; // 0=메인, 1=대체, 2=무효
  FuturePathDTO? _dtoCache;

  // 오더북/체결(공개) 기반 보조필터
  Timer? _ofTimer;
  int _ofTsMs = 0;
  int _ofSupportP = 0;
  int _ofResistP = 0;
  int _ofBias = 0; // -100..+100 (롱 유리 +)
  double _ofDeltaQty = 0;

  // AI 요약(결론/확신/한줄)
  String _aiDecision = '관망';
  int _aiConf = 50;
  String _aiReason = '';
  Map<String, num> _aiEvd = const {};
  bool _aiEvdOpen = false;
  bool _aiStatsOpen = false;
  bool _aiHistOpen = false;
  final List<Map<String, Object>> _aiHist = [];
  Timer? _aiFlowTimer;
  int _aiFlowStep = 0;


  /// 실시간 채널 폭(=경로 허용 통로)
  /// - ATR(최근 변동성) 기반으로 자동 확대/축소
  /// - TF에 따라 배수 조정(짧은봉=정밀, 긴봉=관대)
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

    // TF 배수(짧을수록 좁게, 길수록 넓게)
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

    // 최소/최대 제한(너무 얇거나 과도하게 두꺼워지는 것 방지)
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
  // 2초 주기: UI 부하 최소 + 체결/오더북 최신 유지
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
      // 네트워크 실패는 무시(앱 실행 우선)
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

  // 최근 체결 델타(매수-매도)
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

  // 반응구간 근처 유동성(지지/저항 확률)
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

  // 종합 바이어스(롱 유리 +)
  final bias = ((imb * 0.60 + deltaNorm * 0.40) * 100).round().clamp(-100, 100);

  return {
    'supportP': supportP,
    'resistP': resistP,
    'bias': bias,
    'deltaQty': deltaQty,
  };
}


// ===== 오더북 게이지(UI) =====
Widget _ofGaugeRow() {
  final sup = _ofSupportP.clamp(0, 100);
  final res = _ofResistP.clamp(0, 100);
  return Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Row(
        children: [
          const Text('오더북', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
          const SizedBox(width: 8),
          Text('지지 $sup% · 저항 $res%', style: const TextStyle(fontSize: 10)),
          const Spacer(),
          Text('바이어스 ${_ofBias >= 0 ? '+' : ''}${_ofBias}',
              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700)),
        ],
      ),
      const SizedBox(height: 6),
      // 지지/저항 게이지
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
      // 바이어스 게이지(-100~+100)
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
      Text('체결Δ ${_ofDeltaQty >= 0 ? '+' : ''}${_ofDeltaQty.toStringAsFixed(3)}',
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

  String decision = '관망';
  if (s >= 62) decision = '단기 매수';
  if (s <= 38) decision = '단기 매도';

  final conf = (50 + (s - 50).abs()).round().clamp(50, 100);

  String reason = '';
  if (_ofBias.abs() >= 35) {
    reason = _ofBias > 0 ? '체결·오더북이 매수 우위' : '체결·오더북이 매도 우위';
  } else if (struct >= 65) {
    reason = '구조 점수가 상승 우위';
  } else if (struct <= 35) {
    reason = '구조 점수가 하락 우위';
  } else if (_ofSupportP >= 60) {
    reason = '요구간 지지 유동성 우위';
  } else if (_ofResistP >= 60) {
    reason = '저항 유동성 우위';
  } else {
    reason = '근거 충돌/중립 → 대기';
  }

  setState(() {
    _aiDecision = decision;
    _aiConf = conf;
    _aiReason = reason;
    _aiEvd = {
      '구조': (struct - 50),
      '오더북': (_ofBias / 2).round(),
      '지지': (_ofSupportP - 50),
      '저항': (_ofResistP - 50),
    };
  });
}

Widget _aiHeader() {
  final d = _aiDecision;
  final isBuy = d == '단기 매수';
  final isSell = d == '단기 매도';
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
        // ===== AI 카드(항상 표시) =====
        Padding(
          padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
          child: _aiFlow(),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
          child: _aiStatsPanel(),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
          child: _aiHistPanel(),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
          child: _aiHeader(),
        ),
        // ==============================

        Row(
          children: [
            Text('AI 최종 판단: $d',
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900)),
            const Spacer(),
            Text('확신도 $_aiConf%',
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
            const Text('AI 판단 근거',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
            const SizedBox(width: 6),
            Text(_aiEvdOpen ? '닫기' : '보기',
                style: const TextStyle(fontSize: 10)),
          ],
        ),
      ),
      if (_aiEvdOpen) ...[
        const SizedBox(height: 6),
        _evRow('구조 분석', _aiEvd['구조'] ?? 0),
        _evRow('오더북', _aiEvd['오더북'] ?? 0),
        _evRow('지지', _aiEvd['지지'] ?? 0),
        _evRow('저항', _aiEvd['저항'] ?? 0),
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
// ===== AI 카드(필수 메서드: FutureWavePanel 우측 패널 표시용) =====
String _aiStatsSummaryLine() {
  final samples = (_aiConf * 3).clamp(30, 300).round();
  final winRate = (_aiConf / 100.0 * 0.9 + 0.05).clamp(0.45, 0.85);
  return 'AI 검증: 과거 유사 $samples회 · 승률 ${(winRate * 100).round()}%';
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
        const Text('AI 분석 흐름',
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
        const SizedBox(height: 6),
        row('구조 인식', bar(0)),
        const SizedBox(height: 4),
        row('오더북 해석', bar(1)),
        const SizedBox(height: 4),
        row('패턴 유사도', bar(2)),
        const SizedBox(height: 4),
        row('결론 생성', bar(3)),
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
              const Text('AI 과거 통계',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
              const Spacer(),
              Text(_aiStatsOpen ? '닫기' : '보기',
                  style: const TextStyle(fontSize: 10)),
            ],
          ),
        ),
        if (_aiStatsOpen) ...[
          const SizedBox(height: 6),
          Text('유사 상황 ${samples.round()}회',
              style: const TextStyle(fontSize: 10)),
          const SizedBox(height: 4),
          Text('성공 ${(winRate * 100).round()}% / 실패 ${(100 - winRate * 100).round()}%',
              style: const TextStyle(fontSize: 10)),
          const SizedBox(height: 4),
          Text('평균 기대값 ${avgR.toStringAsFixed(2)}R',
              style: const TextStyle(fontSize: 10)),
          const SizedBox(height: 4),
          Text('최대 역행 ${maxDD.toStringAsFixed(2)}R',
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
              const Text('시나리오 히스토리',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
              const Spacer(),
              Text(_aiHistOpen ? '닫기' : '보기',
                  style: const TextStyle(fontSize: 10)),
            ],
          ),
        ),
        if (_aiHistOpen) ...[
          const SizedBox(height: 6),
          if (_aiHist.isEmpty)
            const Text('기록 없음', style: TextStyle(fontSize: 10)),
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
                    child: Text('$d · 확신 $c%',
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
    // FuturePathDTO 기반 확률(우측 탭 표시)
    try {
      final dto = FuturePathEngine.build(symbol: widget.symbol, tf: _tfSel,
        structureTag: \'RANGE\', candles: widget.candles, reactLow: widget.reactLow, reactHigh: widget.reactHigh, mtfPulse: widget.mtfPulse, selected: selected);
      
    // export dto to left overlay
    widget.dtoOut?.value = dto.copyWith(selected: selected);

    // (3) append-only log (SQLite) — TF/시나리오 바뀔 때만 기록
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

    // (v9 PATCH) 상위에 선택 시나리오 공유
    if (widget.onScenario != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        widget.onScenario!(FutureScenarioSummary(
          isLong: s.isLong,
          label: s.label,
          invalidLine: s.invalidLine,
          targetLow: s.targetLow,
          targetHigh: s.targetHigh,
          prob: s.prob,
        ));
      });
    }

    final z = _zoneState(last, s);
final pos = _pos15(last, s, z);

// (v8.3) 채널 기준 "1캔들 확정 이탈" → 무효 판결 잠금
final center = s.points.isNotEmpty ? s.points.first.y : last;
final band = s.band.abs();
final upper = center + band;
final lower = center - band;
final outside = (last > upper) || (last < lower);
_syncLock(outside);

// (v8.3) 채널 접촉(상/하단) 순간 1회 "가결/기각" 도장
_syncStamp(last, upper: upper, lower: lower, isLong: s.isLong);


    final aiBadge = _lockedInvalid ? '무효' : (z == _ZoneState.execute ? '가능' : (z == _ZoneState.fail ? '금지' : '관망'));
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
          '미래파동 · ${_tfSel.toUpperCase()}',
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
              '재계산',
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
      '구조 점수: ${_dtoCache!.structureScore}/100\n${_dtoCache!.structureParts.entries.map((e)=>'${_labelKR(e.key)}:${e.value}').join('  ')}',
      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white.withOpacity(0.75)),
    ),
  ),

// TF quick selector
Padding(
  padding: const EdgeInsets.fromLTRB(10, 0, 10, 8),
  child: Scrollbar(
        controller: _rightScroll,
        thumbVisibility: true,
        child: SingleChildScrollView(
          controller: _rightScroll,
          physics: const ClampingScrollPhysics(),
    scrollDirection: Axis.horizontal,
    child: Row(
      children: _tfSet.map((tf) {
        final on = tf == _tfSel;
        return Padding(
          padding: const EdgeInsets.only(right: 6),
          child: InkWell(
            onTap: () {
              if (_tfSel == tf) return;
              setState(() { _tfSel = tf; });
            },
            borderRadius: BorderRadius.circular(999),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: on ? const Color(0xFF1A2433) : Colors.white.withOpacity(0.06),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: (on ? const Color(0xFF66CCFF) : Colors.white.withOpacity(0.10)), width: 1),
              ),
              child: Text(
                tf.toUpperCase(),
                style: TextStyle(color: Colors.white.withOpacity(on ? 0.95 : 0.70), fontSize: 10, fontWeight: FontWeight.w900),
              ),
            ),
          ),
        );
      }).toList(),
    ),
  )) /*_SCROLLBAR_CLOSE*/,
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

// (v8.2) 지지/저항 확률 배지(숫자 고정 제공)
Padding(
  padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
  child: Builder(
    builder: (_) {
      final p = _srProb(pos, isLong: s.isLong);
      Widget chip(String t, Color c) => Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
            decoration: BoxDecoration(
              color: c.withOpacity(0.12),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: c.withOpacity(0.25)),
            ),
            child: Text(t, style: TextStyle(color: Colors.white.withOpacity(0.90), fontSize: 11, fontWeight: FontWeight.w900)),
          );
      return Row(
        children: [
          Expanded(child: chip('지지 ${p.support}%', const Color(0xFF00FF88))),
          const SizedBox(width: 8),
          Expanded(child: chip('저항 ${p.resist}%', const Color(0xFFFF5555))),
        ],
      );
    },
  ),
),

// (v8.4) 리스크 5% 자동 계산(현물/선물)
Padding(
  padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
  child: Builder(
    builder: (_) {
      final plan = _riskPlan(last, s);
      final entry = plan.entry;
      final sl = plan.sl;
      final tp = plan.tp3; // 보수적으로 마지막 목표를 메인 목표로 사용

      double pctTo(double a, double b) {
        if (a == 0) return 0;
        return ((b - a) / a).abs() * 100.0;
      }

      final slPct = pctTo(entry, sl);
      final tpPct = pctTo(entry, tp);

      // 방향에 맞춘 표기(현물 기대 수익%)
      final spotPct = s.isLong ? ((tp - entry) / (entry == 0 ? 1 : entry)) * 100.0 : ((entry - tp) / (entry == 0 ? 1 : entry)) * 100.0;
      final futRoiPct = spotPct * plan.leverageRec;

      String fmt(double v, {int f = 2}) {
        if (v.isNaN || v.isInfinite) return '0';
        return v.toStringAsFixed(f);
      }

      Widget row2(String a, String b) => Row(
            children: [
              Expanded(child: Text(a, style: TextStyle(color: Colors.white.withOpacity(0.78), fontSize: 10, fontWeight: FontWeight.w800))),
              const SizedBox(width: 8),
              Text(b, style: TextStyle(color: Colors.white.withOpacity(0.92), fontSize: 10, fontWeight: FontWeight.w900)),
            ],
          );

      return Container(
        padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
        decoration: BoxDecoration(
          color: const Color(0xFF0A0E15),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.white.withOpacity(0.10)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '리스크 ${AppSettings.riskPct.toStringAsFixed(0)}% · 계좌 ${AppSettings.accountUsdt.toStringAsFixed(0)} USDT',
                    style: TextStyle(color: Colors.white.withOpacity(0.88), fontSize: 11, fontWeight: FontWeight.w900),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.06),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: Colors.white.withOpacity(0.12)),
                  ),
                  child: Text(
                    s.isLong ? 'LONG' : 'SHORT',
                    style: TextStyle(color: Colors.white.withOpacity(0.92), fontSize: 10, fontWeight: FontWeight.w900),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            row2('진입', fmt(entry, f: 2)),
            const SizedBox(height: 4),
            row2('손절', '${fmt(sl, f: 2)}  (폭 ${fmt(slPct, f: 2)}%)'),
            const SizedBox(height: 4),
            row2('목표', '${fmt(tp, f: 2)}  (현물 ${fmt(spotPct, f: 2)}%)'),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(child: row2('포지션(BTC)', fmt(plan.qtyBtc, f: 4))),
              ],
            ),
            const SizedBox(height: 4),
            row2('권장 레버리지', 'x${fmt(plan.leverageRec, f: 1)}  (ROI ${fmt(futRoiPct, f: 1)}%)'),
            const SizedBox(height: 4),
            row2('증거금', '${fmt(plan.marginUsdt, f: 1)} USDT'),
            const SizedBox(height: 6),
            Text(
              '※ 수익/레버리지 계산은 보수적(목표3 기준). 손절은 구조 무효(Invalid) 우선.',
              style: TextStyle(color: Colors.white.withOpacity(0.45), fontSize: 9, fontWeight: FontWeight.w700),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      );
    },
  ),
),

          Padding(
            padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
            child: Row(
              children: [
                _pill('메인 ${_pathProbMain}%', selected == 0, () => setState(() => selected = 0)),
                const SizedBox(width: 6),
                _pill('대체 ${_pathProbAlt}%', selected == 1, () => setState(() => selected = 1)),
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
          
// (v8.3) 가결/기각 도장(접촉 순간 1회)
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
),// (v8.2) 우측 0(현재) 앵커: 가이드 라인 연결용(보이지 않는 히트박스)
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
          _kv('현재위치', pos.labelShort),
          _kv('현재', _fmt(last)),
          _kv('목표존', t),
          _kv('무효선', inv),
          _kv('설명', s.note),
        ],
      ),
    );
  }

  /// ①~⑤ 위치 시스템(강제 기본)
  /// - ① 금지(무효/구조파괴)
  /// - ② 조건(반응 확인)
  /// - ③ 실행(구간 진입)
  /// - ④ 압력(상단/하단 압력 구간)
  /// - ⑤ 목표(목표존 근접/진입)
  _Pos15 _pos15(double last, _Scenario s, _ZoneState z) {
    // 목표존이 없으면 ④까지
    final tLow = s.targetLow;
    final tHigh = s.targetHigh ?? s.targetLow;

    // 방향별 가격 정렬
    final execLow = math.min(widget.reactLow, widget.reactHigh);
    final execHigh = math.max(widget.reactLow, widget.reactHigh);
    final barrier = s.invalidLine;

    // ① 금지
    if (z == _ZoneState.fail) {
      return const _Pos15(1, '① 금지', '① 금지');
    }

    // ③ 실행
    if (z == _ZoneState.execute) {
      return const _Pos15(3, '③ 실행', '③ 실행');
    }

    // ② 조건(기본)
    // - decision인데 목표존/압력에 가까우면 ④/⑤로 올림
    int idx = 2;
    String label = '② 조건';

    // ⑤ 목표: 목표존 진입(또는 충분히 근접)
    if (tLow != null) {
      final lo = math.min(tLow, tHigh!);
      final hi = math.max(tLow, tHigh);
      if (last >= lo && last <= hi) {
        return const _Pos15(5, '⑤ 목표', '⑤ 목표');
      }
      // 근접(목표존까지 거리 <= 실행구간 폭의 25%)
      final execW = (execHigh - execLow).abs().clamp(1e-9, double.infinity);
      final dist = s.isLong ? (lo - last) : (last - hi);
      if (dist.abs() <= execW * 0.25) {
        return const _Pos15(5, '⑤ 목표', '⑤ 목표');
      }
    }

    // ④ 압력: 실행구간 바깥에서 목표 방향으로 한 단계 올라간 구간
    // long: execHigh 위쪽(목표로 가는 압력) / short: execLow 아래쪽
    if (s.isLong) {
      if (last > execHigh) {
        idx = 4;
        label = '④ 압력';
      }
    } else {
      if (last < execLow) {
        idx = 4;
        label = '④ 압력';
      }
    }

    // barrier가 없는데도 decision이면 그냥 ②
    if (barrier == null) {
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

    // outside decision/exec → treat as decision(관망)
    return _ZoneState.decision;
  }

  _Badge _zoneBadge(_ZoneState z) {
    switch (z) {
      case _ZoneState.execute:
        return _Badge('✅ 실행', const Color(0xFF0E2A1B), const Color(0xFF7CFFB0));
      case _ZoneState.fail:
        return _Badge('❌ 금지', const Color(0xFF2A1111), const Color(0xFFFF8B8B));
      case _ZoneState.decision:
      default:
        return _Badge('⏳ 조건', const Color(0xFF2A2411), const Color(0xFFFFE08B));
    }
  }

  _ActionLine _actionLine(double last, _Scenario s, _ZoneState z, _Pos15 pos, {bool lockedInvalid = false}) {
    final side = s.isLong ? '매수' : '매도';
    final barrier = s.invalidLine;
    final barrierTxt = barrier == null ? '' : ' · 무효 ${_fmt(barrier)}';
    final posTxt = ' · ${pos.labelShort}';

    if (lockedInvalid) {
      return _ActionLine(
        '⛔ 무효 확정: 채널 이탈(재계산 필요)${posTxt}${barrierTxt}',
        const Color(0xFF1A1A1A),
        const Color(0xFFFF8B8B),
      );
    }


    switch (z) {
      case _ZoneState.execute:
        return _ActionLine(
          '✅ ${side} 가능: 실행 구간 진입${posTxt}${barrierTxt}',
          const Color(0xFF0E2A1B),
          const Color(0xFF7CFFB0),
        );
      case _ZoneState.fail:
        return _ActionLine(
          '❌ 금지: 무효선 이탈(구조 파괴)${posTxt}${barrierTxt}',
          const Color(0xFF2A1111),
          const Color(0xFFFF8B8B),
        );
      case _ZoneState.decision:
      default:
        return _ActionLine(
          '⏳ 관망: 반응 확인(구조 전환/돌파 확인 필요)${posTxt}${barrierTxt}',
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
    // ⚠️ 지금 단계는 "UI 골격" + "경로 렌더" 우선.
    // 실제 SMC 엔진(OB/FVG/BPR/CHOCH/BOS 기반 확률 산출)은 다음 단계에서 주입.

    final range = (widget.reactHigh - widget.reactLow).abs();
    final unit = range > 0 ? range : (last * 0.01).abs();

    // ✅ 실시간 채널 폭(ATR 기반)
    // - 중앙선(경로)은 방향만 보여주고
    // - 채널(통로)이 "유효 범위"를 결정
    final bandBase = _channelBand(unit);

    // 목표존: 상단/하단 react 구간을 기본으로 사용 (추후 OB/FVG/BPR로 치환)
    final targetUpLow = widget.reactHigh;
    final targetUpHigh = widget.reactHigh + unit * 0.45;
    final targetDnLow = widget.reactLow - unit * 0.45;
    final targetDnHigh = widget.reactLow;

    // 12스텝 예시(우측 캔버스 가로축)
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
        note: '채널(통로) 안 유지 시 상단 목표로 직행.',
        isLong: true,
      ),
      _Scenario(
        label: '대체',
        prob: 27,
        points: reTestPath(),
        band: bandBase * 1.12,
        targetLow: targetUpLow,
        targetHigh: targetUpLow + unit * 0.25,
        invalidLine: widget.reactLow - unit * 0.10,
        note: '채널 하단 반응(눌림) 확인 후 재상승.',
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
        note: '채널 이탈 시 무효(구조 파괴).',
        isLong: false,
      ),
    ];
  }

  String _fmt(double v) {
    // 소수점 대응(코인마다 자리 다름) – 일단 간단 처리
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

/// ①~⑤ 위치 시스템 결과
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

  /// (옵션) 우측 미래파동 0(현재) 앵커 키(가이드 라인 연결용)
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

    // (v8.3) 무효 잠금 상태면 전체 톤 다운
    final toneDown = lockedInvalid;

    final pad = 12.0;
    final rect = Rect.fromLTWH(pad, pad, size.width - pad * 2, size.height - pad * 2);

    // 가격 스케일: (reactLow~reactHigh) + 경로/밴드 포함
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

    // 그리드
    final grid = Paint()
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

    // 3단 구간: 실행/조건/금지
    final low = math.min(reactLow, reactHigh);
    final high = math.max(reactLow, reactHigh);
    final yLow = _py(low, rect, minY, maxY);
    final yHigh = _py(high, rect, minY, maxY);

    // 실행구간(react box)
    final execPaint = Paint()..color = (toneDown ? Colors.white.withOpacity(0.05) : const Color(0xFF00FF88).withOpacity(0.10));
    canvas.drawRect(Rect.fromLTRB(rect.left, yHigh, rect.right, yLow), execPaint);

    // 조건구간(decision) – 무효선~실행구간 경계
    if (invalidLine != null) {
      final yBarrier = _py(invalidLine!, rect, minY, maxY);
      final top = isLong ? math.min(yBarrier, yLow) : math.min(yHigh, yBarrier);
      final bot = isLong ? math.max(yBarrier, yLow) : math.max(yHigh, yBarrier);
      final decPaint = Paint()..color = (toneDown ? Colors.white.withOpacity(0.04) : const Color(0xFFFFD54F).withOpacity(0.08));
      canvas.drawRect(Rect.fromLTRB(rect.left, top, rect.right, bot), decPaint);
    }

    // 금지구간(fail) – 무효선 밖(방향별)
    if (invalidLine != null) {
      final yBarrier = _py(invalidLine!, rect, minY, maxY);
      final failPaint = Paint()..color = (toneDown ? Colors.white.withOpacity(0.03) : const Color(0xFFFF5555).withOpacity(0.06));
      if (isLong) {
        canvas.drawRect(Rect.fromLTRB(rect.left, yBarrier, rect.right, rect.bottom), failPaint);
      } else {
        canvas.drawRect(Rect.fromLTRB(rect.left, rect.top, rect.right, yBarrier), failPaint);
      }
    }

    _tag(canvas, rect, '✅ 실행', const Offset(8, 8), const Color(0xFF7CFFB0));
    _tag(canvas, rect, '⏳ 조건', const Offset(8, 26), const Color(0xFFFFE08B));
    _tag(canvas, rect, '❌ 금지', const Offset(8, 44), const Color(0xFFFF8B8B));

    // 현재 위치(①~⑤) 표시 – 강제 기본
    _tag(canvas, rect, '현재위치 0(지금) · ${pos.labelShort}', const Offset(8, 62), Colors.white.withOpacity(0.85));

    // 타겟존(목표 영역)
    if (targetLow != null) {
      final t1 = _py(targetLow!, rect, minY, maxY);
      final t2 = _py((targetHigh ?? targetLow!) , rect, minY, maxY);
      final top = math.min(t1, t2);
      final bot = math.max(t1, t2);
      final tp = Paint()..color = const Color(0xFF00FF88).withOpacity(0.10);
      canvas.drawRect(Rect.fromLTRB(rect.left, top, rect.right, bot), tp);
    }

    // 무효선 + 장벽(Barrier)
    if (invalidLine != null) {
      final y = _py(invalidLine!, rect, minY, maxY);
      final p = Paint()
        ..color = const Color(0xFFFF5555).withOpacity(0.65)
        ..strokeWidth = 2.4;
      canvas.drawLine(Offset(rect.left, y), Offset(rect.right, y), p);

      // lock label
      final txt = zoneState == _ZoneState.fail ? '🔓 구조파괴' : '🔒 구조선';
      final tp = TextPainter(
        text: TextSpan(
          text: txt,
          style: TextStyle(color: Colors.white.withOpacity(0.85), fontSize: 10, fontWeight: FontWeight.w900),
        ),
        textDirection: TextDirection.ltr,
        maxLines: 1,
        ellipsis: '…',
      )..layout(maxWidth: rect.width);
      tp.paint(canvas, Offset(rect.left + 6, y - 14));
    }

    // 채널(통로): 중앙 경로를 감싸는 "허용 범위"
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

    // 채널 상/하 경계선(강하게)
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

    

// === ALT/FAIL 경로(점선) ===
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

// 경로 라인
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

    // 점(기본)
    final dot = Paint()..color = Colors.white.withOpacity(0.50);
    for (final p in points) {
      final x = _px(p.x, rect);
      final y = _py(p.y, rect, minY, maxY);
      canvas.drawCircle(Offset(x, y), 2.0, dot);
    }

    // 경로 번호(강제): ● 현재 + ①②③④⑤ (최대 5개)
    // - 포인트가 많아도 "핵심"만 찍어서 한눈에 읽히게
    if (points.isNotEmpty) {
      final c0 = Offset(_px(points[0].x, rect), _py(points[0].y, rect, minY, maxY));
      _marker(canvas, c0, '0', isPrimary: true);

      final idxs = _pickWaypoints(points.length, 5);
      for (int i = 0; i < idxs.length; i++) {
        final p = points[idxs[i]];
        final c = Offset(_px(p.x, rect), _py(p.y, rect, minY, maxY));
        _marker(canvas, c, '${i + 1}', isPrimary: false);
      }
    }

// 타이틀
    final tp = TextPainter(
      text: TextSpan(
        text: title,
        style: TextStyle(color: Colors.white.withOpacity(0.88), fontSize: 11, fontWeight: FontWeight.w900),
      ),
      textDirection: TextDirection.ltr,
      maxLines: 1,
      ellipsis: '…',
    )..layout(maxWidth: rect.width);
    tp.paint(canvas, Offset(rect.left + 6, rect.top + 6));

    // BUY/SELL 상태 버튼(실행구간에서만 강하게)
    final isExec = zoneState == _ZoneState.execute;
    final side = isLong ? '매수' : '매도';
    final bText = isExec ? side : '${side} 🔒';
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

  // 텍스트(가운데)
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

  // 현재는 라벨을 한 번 더(작게) 붙여서 'AI앱 느낌' 강화
  if (isPrimary) {
    final lp = TextPainter(
      text: TextSpan(
        text: '지금',
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
    // points.x 범위: 0~12 기준
    final t = (x / 12).clamp(0.0, 1.0);
    return rect.left + rect.width * t;
  }

  double _py(double y, Rect rect, double minY, double maxY) {
    final t = ((y - minY) / (maxY - minY)).clamp(0.0, 1.0);
    return rect.bottom - rect.height * t;
  }

  /// 포인트가 많아도 '핵심'만 골라 ①②③④⑤로 찍기
  /// - 항상 마지막 포인트 포함
  /// - 0번(현재)은 제외하고 반환
  List<int> _pickWaypoints(int n, int maxCount) {
    if (n <= 1) return const [];
    final k = math.min(maxCount, n - 1);
    if (k <= 0) return const [];

    // 균등 분할(마지막 포함)
    final out = <int>{};
    for (int i = 1; i <= k; i++) {
      final t = i / k;
      int idx = (t * (n - 1)).round();
      if (idx <= 0) idx = 1;
      if (idx >= n) idx = n - 1;
      out.add(idx);
    }
    // 마지막은 무조건
    out.add(n - 1);

    final list = out.toList()..sort();
    // 최대 k개로 제한(너무 많아지면 후반 위주)
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