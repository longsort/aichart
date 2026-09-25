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

/// ?°ì¸¡: ë¯¸ë˜ ?Œë™(?¤ë§ˆ?¸ë¨¸??ì»¨ì…‰)
/// - ??1ê°??ˆì¸¡???„ë‹ˆ?? ë©”ì¸/?€ì²?ë¬´íš¨ 3 ?œë‚˜ë¦¬ì˜¤ + ?•ë¥  + ë¬´íš¨ì¡°ê±´ + ëª©í‘œì¡?/// - ?„ì¬??"êµ¬ì¡°/ì¡???ì¤€ë¹„ëœ ?íƒœ?ì„œ, UI/?Œë”ë§?ê³¨ê²©??ë¨¼ì? ê¹”ì•„??class FutureWavePanel extends StatefulWidget {
  final String symbol;
  final String? tf;

  /// (?µì…˜) ê³„ì‚°??FuturePathDTOë¥?ì¢Œì¸¡ ?¤ë²„?ˆì´ë¡?ê³µìœ 
  final ValueNotifier<FuturePathDTO?>? dtoOut;
  final String tfLabel;
  final List<FuCandle> candles;
  final List<FuZone> zones;
  final double reactLow;
  final double reactHigh;

  /// (?µì…˜) ?°ì¸¡ ë¯¸ë˜?Œë™ 0(?„ì¬) ?µì»¤ ??ê°€?´ë“œ ?¼ì¸ ?°ê²°??
  final GlobalKey? nowAnchorKey;

  /// (v9 PATCH) ? íƒ???œë‚˜ë¦¬ì˜¤ ?”ì•½???ìœ„ë¡??„ë‹¬(ì»¤ì„œ ?œë?/ê²°ì •?¨ë„ ?°ë™??
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

/// (v9 PATCH) ?°ì¸¡ ë¯¸ë˜?Œë™?ì„œ ?„ì¬ ? íƒ???œë‚˜ë¦¬ì˜¤ë¥?/// ?ìœ„(ì°¨íŠ¸ ?„ì²´?”ë©´)ë¡?ê³µìœ ?˜ê¸° ?„í•œ ìµœì†Œ ?”ì•½ ëª¨ë¸
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


  // STEP17: ?°ì¸¡ ?¨ë„ ?¤í¬ë¡?ê³ ì •
  final ScrollController _rightScroll = ScrollController();
String _labelKR(String key) {
  switch (key) {
    case 'consensus':
      return '?©ì˜';
    case 'pulse':
      return 'ê°•ë„';
    case 'align':
      return '?•ë ¬';
    case 'risk':
      return '?„í—˜';
    default:
      return key;
  }
}



  /// (v8.4) 5% ë¦¬ìŠ¤??ê³ ì •) ê³„ì‚°: ?°ì¸¡ ?¨ë„?ì„œ ì¦‰ì‹œ ?•ì¸
  /// - entry: ?„ì¬ê°€(last)
  /// - sl: ?œë‚˜ë¦¬ì˜¤ invalidLine ?°ì„ , ?†ìœ¼ë©?ë°˜ì‘êµ¬ê°„ ê²½ê³„
  /// - tp: ?œë‚˜ë¦¬ì˜¤ ?€ê²??†ìœ¼ë©?ë³´ìˆ˜?ìœ¼ë¡?react ê²½ê³„)
  EntryPlan _riskPlan(double last, _Scenario s) {
    final entry = last;

    // SL/TP ?„ë³´
    final sl = (s.invalidLine ?? (s.isLong ? widget.reactLow : widget.reactHigh));
    double s1, r1;
    if (s.isLong) {
      s1 = widget.reactLow;
      r1 = (s.targetHigh ?? (widget.reactHigh > 0 ? widget.reactHigh : entry));
    } else {
      s1 = (s.targetLow ?? (widget.reactLow > 0 ? widget.reactLow : entry));
      r1 = widget.reactHigh;
    }

    // ë³´í˜¸: ê°??? „/0 ë°©ì?
    if (s1 <= 0) s1 = entry;
    if (r1 <= 0) r1 = entry;

    // EntryPlanner??UI?ì„œ ?°ê¸° ì¢‹ì? ?•íƒœë¡?5% ë¦¬ìŠ¤??TP ë¶„í• /?ˆë²„ë¦¬ì? ì¶”ì²œ???œê³µ
    return EntryPlanner.plan(
      isLong: s.isLong,
      price: entry,
      s1: s.isLong ? math.min(s1, sl) : s1,
      r1: s.isLong ? r1 : math.max(r1, sl),
      accountUsdt: AppSettings.accountUsdt,
      riskPct: AppSettings.riskPct,
    );
  }

  // (v8.3) ì§€ì§€/?€???•ë¥ (ì²´ê°??
  // - ì§€ê¸??¨ê³„?ì„œ??'?„ì¹˜(????' ê¸°ë°˜?¼ë¡œ ë¹ ë¥´ê²?ë³´ì—¬ì£¼ëŠ” ?©ë„
  // - ?´í›„ OB/FVG/BPR/ê±°ë˜??êµ¬ì¡°?ìˆ˜?€ ê²°í•© ê°€??  _SrP _srProb(_Pos15 pos, {required bool isLong}) {
    // ? ì¼?˜ë¡(?€???˜ë‹¨) ì§€ì§€ ?°ìœ„, ?¤ì¼?˜ë¡(?ë‹¨/?œê³„) ?€???°ìœ„
    final table = <int, _SrP>{
      1: const _SrP(72, 28),
      2: const _SrP(65, 35),
      3: const _SrP(55, 45),
      4: const _SrP(45, 55),
      5: const _SrP(35, 65),
    };
    final base = table[pos.idx] ?? const _SrP(55, 45);
    // ??ê´€?ì´ë©??¤ì§‘?´ì„œ ë³´ì—¬ì¤??€???°ìœ„ê°€ 'ì§€ì§€ ?°ìœ„'ì²˜ëŸ¼ ë³´ì´ì§€ ?Šê²Œ)
    if (!isLong) return _SrP(base.resist, base.support);
    return base;
  }

// (v8.3) ?ê²° ? ê¸ˆ: ì±„ë„ 1ìº”ë“¤ ?•ì • ?´íƒˆ ??"ë¬´íš¨ ?•ì •"?¼ë¡œ ê³ ì •
bool _lockedInvalid = false;
int _outsideCount = 0;

// (v8.3) ê°€ê²?ê¸°ê° ?„ì¥(?‘ì´‰ ?œê°„ 1??
String? _stampText;
Timer? _stampTimer;
int _lastTouch = 0; // -1=?˜ë‹¨, 1=?ë‹¨, 0=?†ìŒ

void _syncLock(bool outside) {
  // ?ˆë¡œ??ìº”ë“¤???¤ì–´???Œë§Œ ì¹´ìš´?¸ê? ?˜ë?ê°€ ?ˆìŒ
  // (?¬ê¸°?œëŠ” 'ë§ˆì?ë§?ì¢…ê?'ê°€ ê°±ì‹ ????buildê°€ ?¤ì‹œ ë¶ˆë¦°?¤ê³  ê°€??
  if (_lockedInvalid) return;
  if (outside) {
    _outsideCount += 1;
    if (_outsideCount >= 1) {
      _lockedInvalid = true;
      // ?„ì¥??ê°™ì´: "ë¬´íš¨"
      _showStamp('ë¬´íš¨');
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
  if (_lastTouch == touch) return; // ê°™ì? ë©?ë°˜ë³µ ?°ì¹˜ ë¬´ì‹œ
  _lastTouch = touch;

  // ë¡???ê´€?ì—???ë‹¨=?€?? ?˜ë‹¨=ì§€ì§€
  String t;
  if (isLong) {
    t = (touch == -1) ? 'ê°€ê²? : 'ê¸°ê°';
  } else {
    t = (touch == 1) ? 'ê°€ê²? : 'ê¸°ê°';
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
  int _pathProbMain = 0, _pathProbAlt = 0, _pathProbFail = 0; // 0=ë©”ì¸, 1=?€ì²? 2=ë¬´íš¨
  FuturePathDTO? _dtoCache;

  // ?¤ë”ë¶?ì²´ê²°(ê³µê°œ) ê¸°ë°˜ ë³´ì¡°?„í„°
  Timer? _ofTimer;
  int _ofTsMs = 0;
  int _ofSupportP = 0;
  int _ofResistP = 0;
  int _ofBias = 0; // -100..+100 (ë¡?? ë¦¬ +)
  double _ofDeltaQty = 0;

  // AI ?”ì•½(ê²°ë¡ /?•ì‹ /?œì¤„)
  String _aiDecision = 'ê´€ë§?;
  int _aiConf = 50;
  String _aiReason = '';
  Map<String, num> _aiEvd = const {};
  bool _aiEvdOpen = false;
  bool _aiStatsOpen = false;
  bool _aiHistOpen = false;
  final List<Map<String, Object>> _aiHist = [];
  Timer? _aiFlowTimer;
  int _aiFlowStep = 0;


  /// ?¤ì‹œê°?ì±„ë„ ??=ê²½ë¡œ ?ˆìš© ?µë¡œ)
  /// - ATR(ìµœê·¼ ë³€?™ì„±) ê¸°ë°˜?¼ë¡œ ?ë™ ?•ë?/ì¶•ì†Œ
  /// - TF???°ë¼ ë°°ìˆ˜ ì¡°ì •(ì§§ì?ë´??•ë?, ê¸´ë´‰=ê´€?€)
  double _channelBand(double unit) {
    final c = widget.candles;
    if (c.length < 3) return (unit * 0.18).abs();

    // ATR(14) ê°„ì´ ê³„ì‚°
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

    // TF ë°°ìˆ˜(ì§§ì„?˜ë¡ ì¢ê²Œ, ê¸¸ìˆ˜ë¡??“ê²Œ)
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

    // ìµœì†Œ/ìµœë? ?œí•œ(?ˆë¬´ ?‡ê±°??ê³¼ë„?˜ê²Œ ?êº¼?Œì???ê²?ë°©ì?)
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
  // 2ì´?ì£¼ê¸°: UI ë¶€??ìµœì†Œ + ì²´ê²°/?¤ë”ë¶?ìµœì‹  ? ì?
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
      // ?¤íŠ¸?Œí¬ ?¤íŒ¨??ë¬´ì‹œ(???¤í–‰ ?°ì„ )
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

  // ìµœê·¼ ì²´ê²° ?¸í?(ë§¤ìˆ˜-ë§¤ë„)
  double buy = 0, sell = 0;
  final now = DateTime.now().millisecondsSinceEpoch;
  for (final f in fills) {
    if (now - f.tsMs > 90 * 1000) continue; // ìµœê·¼ 90ì´ˆë§Œ
    if (f.side == 'buy') buy += f.size;
    else if (f.side == 'sell') sell += f.size;
  }
  final deltaQty = (buy - sell);
  final denom = (buy + sell).abs();
  double deltaNorm = 0;
  if (denom > 1e-9) deltaNorm = deltaQty / denom; // -1..+1

  // ë°˜ì‘êµ¬ê°„ ê·¼ì²˜ ? ë™??ì§€ì§€/?€???•ë¥ )
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

  // ì¢…í•© ë°”ì´?´ìŠ¤(ë¡?? ë¦¬ +)
  final bias = ((imb * 0.60 + deltaNorm * 0.40) * 100).round().clamp(-100, 100);

  return {
    'supportP': supportP,
    'resistP': resistP,
    'bias': bias,
    'deltaQty': deltaQty,
  };
}


// ===== ?¤ë”ë¶?ê²Œì´ì§€(UI) =====
Widget _ofGaugeRow() {
  final sup = _ofSupportP.clamp(0, 100);
  final res = _ofResistP.clamp(0, 100);
  return Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Row(
        children: [
          const Text('?¤ë”ë¶?, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
          const SizedBox(width: 8),
          Text('ì§€ì§€ $sup% Â· ?€??$res%', style: const TextStyle(fontSize: 10)),
          const Spacer(),
          Text('ë°”ì´?´ìŠ¤ ${_ofBias >= 0 ? '+' : ''}${_ofBias}',
              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700)),
        ],
      ),
      const SizedBox(height: 6),
      // ì§€ì§€/?€??ê²Œì´ì§€
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
      // ë°”ì´?´ìŠ¤ ê²Œì´ì§€(-100~+100)
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
      Text('ì²´ê²°? ${_ofDeltaQty >= 0 ? '+' : ''}${_ofDeltaQty.toStringAsFixed(3)}',
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

  String decision = 'ê´€ë§?;
  if (s >= 62) decision = '?¨ê¸° ë§¤ìˆ˜';
  if (s <= 38) decision = '?¨ê¸° ë§¤ë„';

  final conf = (50 + (s - 50).abs()).round().clamp(50, 100);

  String reason = '';
  if (_ofBias.abs() >= 35) {
    reason = _ofBias > 0 ? 'ì²´ê²°Â·?¤ë”ë¶ì´ ë§¤ìˆ˜ ?°ìœ„' : 'ì²´ê²°Â·?¤ë”ë¶ì´ ë§¤ë„ ?°ìœ„';
  } else if (struct >= 65) {
    reason = 'êµ¬ì¡° ?ìˆ˜ê°€ ?ìŠ¹ ?°ìœ„';
  } else if (struct <= 35) {
    reason = 'êµ¬ì¡° ?ìˆ˜ê°€ ?˜ë½ ?°ìœ„';
  } else if (_ofSupportP >= 60) {
    reason = '?”êµ¬ê°?ì§€ì§€ ? ë™???°ìœ„';
  } else if (_ofResistP >= 60) {
    reason = '?€??? ë™???°ìœ„';
  } else {
    reason = 'ê·¼ê±° ì¶©ëŒ/ì¤‘ë¦½ ???€ê¸?;
  }

  setState(() {
    _aiDecision = decision;
    _aiConf = conf;
    _aiReason = reason;
    _aiEvd = {
      'êµ¬ì¡°': (struct - 50),
      '?¤ë”ë¶?: (_ofBias / 2).round(),
      'ì§€ì§€': (_ofSupportP - 50),
      '?€??: (_ofResistP - 50),
    };
  });
}

Widget _aiHeader() {
  final d = _aiDecision;
  final isBuy = d == '?¨ê¸° ë§¤ìˆ˜';
  final isSell = d == '?¨ê¸° ë§¤ë„';
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
        // ===== AI ì¹´ë“œ(??ƒ ?œì‹œ) =====
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
            Text('AI ìµœì¢… ?ë‹¨: $d',
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900)),
            const Spacer(),
            Text('?•ì‹ ??$_aiConf%',
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
            const Text('AI ?ë‹¨ ê·¼ê±°',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
            const SizedBox(width: 6),
            Text(_aiEvdOpen ? '?«ê¸°' : 'ë³´ê¸°',
                style: const TextStyle(fontSize: 10)),
          ],
        ),
      ),
      if (_aiEvdOpen) ...[
        const SizedBox(height: 6),
        _evRow('êµ¬ì¡° ë¶„ì„', _aiEvd['êµ¬ì¡°'] ?? 0),
        _evRow('?¤ë”ë¶?, _aiEvd['?¤ë”ë¶?] ?? 0),
        _evRow('ì§€ì§€', _aiEvd['ì§€ì§€'] ?? 0),
        _evRow('?€??, _aiEvd['?€??] ?? 0),
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
// ===== AI ì¹´ë“œ(?„ìˆ˜ ë©”ì„œ?? FutureWavePanel ?°ì¸¡ ?¨ë„ ?œì‹œ?? =====
String _aiStatsSummaryLine() {
  final samples = (_aiConf * 3).clamp(30, 300).round();
  final winRate = (_aiConf / 100.0 * 0.9 + 0.05).clamp(0.45, 0.85);
  return 'AI ê²€ì¦? ê³¼ê±° ? ì‚¬ $samples??Â· ?¹ë¥  ${(winRate * 100).round()}%';
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
        const Text('AI ë¶„ì„ ?ë¦„',
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
        const SizedBox(height: 6),
        row('êµ¬ì¡° ?¸ì‹', bar(0)),
        const SizedBox(height: 4),
        row('?¤ë”ë¶??´ì„', bar(1)),
        const SizedBox(height: 4),
        row('?¨í„´ ? ì‚¬??, bar(2)),
        const SizedBox(height: 4),
        row('ê²°ë¡  ?ì„±', bar(3)),
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
              const Text('AI ê³¼ê±° ?µê³„',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
              const Spacer(),
              Text(_aiStatsOpen ? '?«ê¸°' : 'ë³´ê¸°',
                  style: const TextStyle(fontSize: 10)),
            ],
          ),
        ),
        if (_aiStatsOpen) ...[
          const SizedBox(height: 6),
          Text('? ì‚¬ ?í™© ${samples.round()}??,
              style: const TextStyle(fontSize: 10)),
          const SizedBox(height: 4),
          Text('?±ê³µ ${(winRate * 100).round()}% / ?¤íŒ¨ ${(100 - winRate * 100).round()}%',
              style: const TextStyle(fontSize: 10)),
          const SizedBox(height: 4),
          Text('?‰ê·  ê¸°ë?ê°?${avgR.toStringAsFixed(2)}R',
              style: const TextStyle(fontSize: 10)),
          const SizedBox(height: 4),
          Text('ìµœë? ??–‰ ${maxDD.toStringAsFixed(2)}R',
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
              const Text('?œë‚˜ë¦¬ì˜¤ ?ˆìŠ¤? ë¦¬',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
              const Spacer(),
              Text(_aiHistOpen ? '?«ê¸°' : 'ë³´ê¸°',
                  style: const TextStyle(fontSize: 10)),
            ],
          ),
        ),
        if (_aiHistOpen) ...[
          const SizedBox(height: 6),
          if (_aiHist.isEmpty)
            const Text('ê¸°ë¡ ?†ìŒ', style: TextStyle(fontSize: 10)),
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
                    child: Text('$d Â· ?•ì‹  $c%',
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
    // FuturePathDTO ê¸°ë°˜ ?•ë¥ (?°ì¸¡ ???œì‹œ)
    try {
      final dto = FuturePathEngine.build(symbol: widget.symbol, tf: _tfSel,
        structureTag: \'RANGE\', candles: widget.candles, reactLow: widget.reactLow, reactHigh: widget.reactHigh, mtfPulse: widget.mtfPulse, selected: selected);
      
    // export dto to left overlay
    widget.dtoOut?.value = dto.copyWith(selected: selected);

    // (3) append-only log (SQLite) ??TF/?œë‚˜ë¦¬ì˜¤ ë°”ë€??Œë§Œ ê¸°ë¡
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

    // (v9 PATCH) ?ìœ„??? íƒ ?œë‚˜ë¦¬ì˜¤ ê³µìœ 
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

// (v8.3) ì±„ë„ ê¸°ì? "1ìº”ë“¤ ?•ì • ?´íƒˆ" ??ë¬´íš¨ ?ê²° ? ê¸ˆ
final center = s.points.isNotEmpty ? s.points.first.y : last;
final band = s.band.abs();
final upper = center + band;
final lower = center - band;
final outside = (last > upper) || (last < lower);
_syncLock(outside);

// (v8.3) ì±„ë„ ?‘ì´‰(???˜ë‹¨) ?œê°„ 1??"ê°€ê²?ê¸°ê°" ?„ì¥
_syncStamp(last, upper: upper, lower: lower, isLong: s.isLong);


    final aiBadge = _lockedInvalid ? 'ë¬´íš¨' : (z == _ZoneState.execute ? 'ê°€?? : (z == _ZoneState.fail ? 'ê¸ˆì?' : 'ê´€ë§?));
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
          'ë¯¸ë˜?Œë™ Â· ${_tfSel.toUpperCase()}',
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
              '?¬ê³„??,
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
      'êµ¬ì¡° ?ìˆ˜: ${_dtoCache!.structureScore}/100\n${_dtoCache!.structureParts.entries.map((e)=>'${_labelKR(e.key)}:${e.value}').join('  ')}',
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

// (v8.2) ì§€ì§€/?€???•ë¥  ë°°ì?(?«ì ê³ ì • ?œê³µ)
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
          Expanded(child: chip('ì§€ì§€ ${p.support}%', const Color(0xFF00FF88))),
          const SizedBox(width: 8),
          Expanded(child: chip('?€??${p.resist}%', const Color(0xFFFF5555))),
        ],
      );
    },
  ),
),

// (v8.4) ë¦¬ìŠ¤??5% ?ë™ ê³„ì‚°(?„ë¬¼/? ë¬¼)
Padding(
  padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
  child: Builder(
    builder: (_) {
      final plan = _riskPlan(last, s);
      final entry = plan.entry;
      final sl = plan.sl;
      final tp = plan.tp3; // ë³´ìˆ˜?ìœ¼ë¡?ë§ˆì?ë§?ëª©í‘œë¥?ë©”ì¸ ëª©í‘œë¡??¬ìš©

      double pctTo(double a, double b) {
        if (a == 0) return 0;
        return ((b - a) / a).abs() * 100.0;
      }

      final slPct = pctTo(entry, sl);
      final tpPct = pctTo(entry, tp);

      // ë°©í–¥??ë§ì¶˜ ?œê¸°(?„ë¬¼ ê¸°ë? ?˜ìµ%)
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
                    'ë¦¬ìŠ¤??${AppSettings.riskPct.toStringAsFixed(0)}% Â· ê³„ì¢Œ ${AppSettings.accountUsdt.toStringAsFixed(0)} USDT',
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
            row2('ì§„ì…', fmt(entry, f: 2)),
            const SizedBox(height: 4),
            row2('?ì ˆ', '${fmt(sl, f: 2)}  (??${fmt(slPct, f: 2)}%)'),
            const SizedBox(height: 4),
            row2('ëª©í‘œ', '${fmt(tp, f: 2)}  (?„ë¬¼ ${fmt(spotPct, f: 2)}%)'),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(child: row2('?¬ì???BTC)', fmt(plan.qtyBtc, f: 4))),
              ],
            ),
            const SizedBox(height: 4),
            row2('ê¶Œì¥ ?ˆë²„ë¦¬ì?', 'x${fmt(plan.leverageRec, f: 1)}  (ROI ${fmt(futRoiPct, f: 1)}%)'),
            const SizedBox(height: 4),
            row2('ì¦ê±°ê¸?, '${fmt(plan.marginUsdt, f: 1)} USDT'),
            const SizedBox(height: 6),
            Text(
              '???˜ìµ/?ˆë²„ë¦¬ì? ê³„ì‚°?€ ë³´ìˆ˜??ëª©í‘œ3 ê¸°ì?). ?ì ˆ?€ êµ¬ì¡° ë¬´íš¨(Invalid) ?°ì„ .',
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
                _pill('ë©”ì¸ ${_pathProbMain}%', selected == 0, () => setState(() => selected = 0)),
                const SizedBox(width: 6),
                _pill('?€ì²?${_pathProbAlt}%', selected == 1, () => setState(() => selected = 1)),
                const SizedBox(width: 6),
                _pill('ë¬´íš¨ ${_pathProbFail}%', selected == 2, () => setState(() => selected = 2)),
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
          
// (v8.3) ê°€ê²?ê¸°ê° ?„ì¥(?‘ì´‰ ?œê°„ 1??
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
),// (v8.2) ?°ì¸¡ 0(?„ì¬) ?µì»¤: ê°€?´ë“œ ?¼ì¸ ?°ê²°??ë³´ì´ì§€ ?ŠëŠ” ?ˆíŠ¸ë°•ìŠ¤)
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
          _kv('?„ì¬?„ì¹˜', pos.labelShort),
          _kv('?„ì¬', _fmt(last)),
          _kv('ëª©í‘œì¡?, t),
          _kv('ë¬´íš¨??, inv),
          _kv('?¤ëª…', s.note),
        ],
      ),
    );
  }

  /// ?????„ì¹˜ ?œìŠ¤??ê°•ì œ ê¸°ë³¸)
  /// - ??ê¸ˆì?(ë¬´íš¨/êµ¬ì¡°?Œê´´)
  /// - ??ì¡°ê±´(ë°˜ì‘ ?•ì¸)
  /// - ???¤í–‰(êµ¬ê°„ ì§„ì…)
  /// - ???•ë ¥(?ë‹¨/?˜ë‹¨ ?•ë ¥ êµ¬ê°„)
  /// - ??ëª©í‘œ(ëª©í‘œì¡?ê·¼ì ‘/ì§„ì…)
  _Pos15 _pos15(double last, _Scenario s, _ZoneState z) {
    // ëª©í‘œì¡´ì´ ?†ìœ¼ë©??£ê¹Œì§€
    final tLow = s.targetLow;
    final tHigh = s.targetHigh ?? s.targetLow;

    // ë°©í–¥ë³?ê°€ê²??•ë ¬
    final execLow = math.min(widget.reactLow, widget.reactHigh);
    final execHigh = math.max(widget.reactLow, widget.reactHigh);
    final barrier = s.invalidLine;

    // ??ê¸ˆì?
    if (z == _ZoneState.fail) {
      return const _Pos15(1, '??ê¸ˆì?', '??ê¸ˆì?');
    }

    // ???¤í–‰
    if (z == _ZoneState.execute) {
      return const _Pos15(3, '???¤í–‰', '???¤í–‰');
    }

    // ??ì¡°ê±´(ê¸°ë³¸)
    // - decision?¸ë° ëª©í‘œì¡??•ë ¥??ê°€ê¹Œìš°ë©????¤ë¡œ ?¬ë¦¼
    int idx = 2;
    String label = '??ì¡°ê±´';

    // ??ëª©í‘œ: ëª©í‘œì¡?ì§„ì…(?ëŠ” ì¶©ë¶„??ê·¼ì ‘)
    if (tLow != null) {
      final lo = math.min(tLow, tHigh!);
      final hi = math.max(tLow, tHigh);
      if (last >= lo && last <= hi) {
        return const _Pos15(5, '??ëª©í‘œ', '??ëª©í‘œ');
      }
      // ê·¼ì ‘(ëª©í‘œì¡´ê¹Œì§€ ê±°ë¦¬ <= ?¤í–‰êµ¬ê°„ ??˜ 25%)
      final execW = (execHigh - execLow).abs().clamp(1e-9, double.infinity);
      final dist = s.isLong ? (lo - last) : (last - hi);
      if (dist.abs() <= execW * 0.25) {
        return const _Pos15(5, '??ëª©í‘œ', '??ëª©í‘œ');
      }
    }

    // ???•ë ¥: ?¤í–‰êµ¬ê°„ ë°”ê¹¥?ì„œ ëª©í‘œ ë°©í–¥?¼ë¡œ ???¨ê³„ ?¬ë¼ê°?êµ¬ê°„
    // long: execHigh ?„ìª½(ëª©í‘œë¡?ê°€???•ë ¥) / short: execLow ?„ë˜ìª?    if (s.isLong) {
      if (last > execHigh) {
        idx = 4;
        label = '???•ë ¥';
      }
    } else {
      if (last < execLow) {
        idx = 4;
        label = '???•ë ¥';
      }
    }

    // barrierê°€ ?†ëŠ”?°ë„ decision?´ë©´ ê·¸ëƒ¥ ??    if (barrier == null) {
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

    // outside decision/exec ??treat as decision(ê´€ë§?
    return _ZoneState.decision;
  }

  _Badge _zoneBadge(_ZoneState z) {
    switch (z) {
      case _ZoneState.execute:
        return _Badge('???¤í–‰', const Color(0xFF0E2A1B), const Color(0xFF7CFFB0));
      case _ZoneState.fail:
        return _Badge('??ê¸ˆì?', const Color(0xFF2A1111), const Color(0xFFFF8B8B));
      case _ZoneState.decision:
      default:
        return _Badge('??ì¡°ê±´', const Color(0xFF2A2411), const Color(0xFFFFE08B));
    }
  }

  _ActionLine _actionLine(double last, _Scenario s, _ZoneState z, _Pos15 pos, {bool lockedInvalid = false}) {
    final side = s.isLong ? 'ë§¤ìˆ˜' : 'ë§¤ë„';
    final barrier = s.invalidLine;
    final barrierTxt = barrier == null ? '' : ' Â· ë¬´íš¨ ${_fmt(barrier)}';
    final posTxt = ' Â· ${pos.labelShort}';

    if (lockedInvalid) {
      return _ActionLine(
        '??ë¬´íš¨ ?•ì •: ì±„ë„ ?´íƒˆ(?¬ê³„???„ìš”)${posTxt}${barrierTxt}',
        const Color(0xFF1A1A1A),
        const Color(0xFFFF8B8B),
      );
    }


    switch (z) {
      case _ZoneState.execute:
        return _ActionLine(
          '??${side} ê°€?? ?¤í–‰ êµ¬ê°„ ì§„ì…${posTxt}${barrierTxt}',
          const Color(0xFF0E2A1B),
          const Color(0xFF7CFFB0),
        );
      case _ZoneState.fail:
        return _ActionLine(
          '??ê¸ˆì?: ë¬´íš¨???´íƒˆ(êµ¬ì¡° ?Œê´´)${posTxt}${barrierTxt}',
          const Color(0xFF2A1111),
          const Color(0xFFFF8B8B),
        );
      case _ZoneState.decision:
      default:
        return _ActionLine(
          '??ê´€ë§? ë°˜ì‘ ?•ì¸(êµ¬ì¡° ?„í™˜/?ŒíŒŒ ?•ì¸ ?„ìš”)${posTxt}${barrierTxt}',
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
    // ? ï¸ ì§€ê¸??¨ê³„??"UI ê³¨ê²©" + "ê²½ë¡œ ?Œë”" ?°ì„ .
    // ?¤ì œ SMC ?”ì§„(OB/FVG/BPR/CHOCH/BOS ê¸°ë°˜ ?•ë¥  ?°ì¶œ)?€ ?¤ìŒ ?¨ê³„?ì„œ ì£¼ì….

    final range = (widget.reactHigh - widget.reactLow).abs();
    final unit = range > 0 ? range : (last * 0.01).abs();

    // ???¤ì‹œê°?ì±„ë„ ??ATR ê¸°ë°˜)
    // - ì¤‘ì•™??ê²½ë¡œ)?€ ë°©í–¥ë§?ë³´ì—¬ì£¼ê³ 
    // - ì±„ë„(?µë¡œ)??"? íš¨ ë²”ìœ„"ë¥?ê²°ì •
    final bandBase = _channelBand(unit);

    // ëª©í‘œì¡? ?ë‹¨/?˜ë‹¨ react êµ¬ê°„??ê¸°ë³¸?¼ë¡œ ?¬ìš© (ì¶”í›„ OB/FVG/BPRë¡?ì¹˜í™˜)
    final targetUpLow = widget.reactHigh;
    final targetUpHigh = widget.reactHigh + unit * 0.45;
    final targetDnLow = widget.reactLow - unit * 0.45;
    final targetDnHigh = widget.reactLow;

    // 12?¤í… ?ˆì‹œ(?°ì¸¡ ìº”ë²„??ê°€ë¡œì¶•)
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
        label: 'ë©”ì¸',
        prob: 58,
        points: upPath(),
        band: bandBase * 1.00,
        targetLow: targetUpLow,
        targetHigh: targetUpHigh,
        invalidLine: widget.reactLow,
        note: 'ì±„ë„(?µë¡œ) ??? ì? ???ë‹¨ ëª©í‘œë¡?ì§í–‰.',
        isLong: true,
      ),
      _Scenario(
        label: '?€ì²?,
        prob: 27,
        points: reTestPath(),
        band: bandBase * 1.12,
        targetLow: targetUpLow,
        targetHigh: targetUpLow + unit * 0.25,
        invalidLine: widget.reactLow - unit * 0.10,
        note: 'ì±„ë„ ?˜ë‹¨ ë°˜ì‘(?Œë¦¼) ?•ì¸ ???¬ìƒ??',
        isLong: true,
      ),
      _Scenario(
        label: 'ë¬´íš¨',
        prob: 15,
        points: invalidPath(),
        band: bandBase * 1.28,
        targetLow: targetDnLow,
        targetHigh: targetDnHigh,
        invalidLine: widget.reactLow - unit * 0.05,
        note: 'ì±„ë„ ?´íƒˆ ??ë¬´íš¨(êµ¬ì¡° ?Œê´´).',
        isLong: false,
      ),
    ];
  }

  String _fmt(double v) {
    // ?Œìˆ˜???€??ì½”ì¸ë§ˆë‹¤ ?ë¦¬ ?¤ë¦„) ???¼ë‹¨ ê°„ë‹¨ ì²˜ë¦¬
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

/// ?????„ì¹˜ ?œìŠ¤??ê²°ê³¼
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

  /// (?µì…˜) ?°ì¸¡ ë¯¸ë˜?Œë™ 0(?„ì¬) ?µì»¤ ??ê°€?´ë“œ ?¼ì¸ ?°ê²°??
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

    // (v8.3) ë¬´íš¨ ? ê¸ˆ ?íƒœë©??„ì²´ ???¤ìš´
    final toneDown = lockedInvalid;

    final pad = 12.0;
    final rect = Rect.fromLTWH(pad, pad, size.width - pad * 2, size.height - pad * 2);

    // ê°€ê²??¤ì??? (reactLow~reactHigh) + ê²½ë¡œ/ë°´ë“œ ?¬í•¨
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

    // ê·¸ë¦¬??    final grid = Paint()
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

    // 3??êµ¬ê°„: ?¤í–‰/ì¡°ê±´/ê¸ˆì?
    final low = math.min(reactLow, reactHigh);
    final high = math.max(reactLow, reactHigh);
    final yLow = _py(low, rect, minY, maxY);
    final yHigh = _py(high, rect, minY, maxY);

    // ?¤í–‰êµ¬ê°„(react box)
    final execPaint = Paint()..color = (toneDown ? Colors.white.withOpacity(0.05) : const Color(0xFF00FF88).withOpacity(0.10));
    canvas.drawRect(Rect.fromLTRB(rect.left, yHigh, rect.right, yLow), execPaint);

    // ì¡°ê±´êµ¬ê°„(decision) ??ë¬´íš¨???¤í–‰êµ¬ê°„ ê²½ê³„
    if (invalidLine != null) {
      final yBarrier = _py(invalidLine!, rect, minY, maxY);
      final top = isLong ? math.min(yBarrier, yLow) : math.min(yHigh, yBarrier);
      final bot = isLong ? math.max(yBarrier, yLow) : math.max(yHigh, yBarrier);
      final decPaint = Paint()..color = (toneDown ? Colors.white.withOpacity(0.04) : const Color(0xFFFFD54F).withOpacity(0.08));
      canvas.drawRect(Rect.fromLTRB(rect.left, top, rect.right, bot), decPaint);
    }

    // ê¸ˆì?êµ¬ê°„(fail) ??ë¬´íš¨??ë°?ë°©í–¥ë³?
    if (invalidLine != null) {
      final yBarrier = _py(invalidLine!, rect, minY, maxY);
      final failPaint = Paint()..color = (toneDown ? Colors.white.withOpacity(0.03) : const Color(0xFFFF5555).withOpacity(0.06));
      if (isLong) {
        canvas.drawRect(Rect.fromLTRB(rect.left, yBarrier, rect.right, rect.bottom), failPaint);
      } else {
        canvas.drawRect(Rect.fromLTRB(rect.left, rect.top, rect.right, yBarrier), failPaint);
      }
    }

    _tag(canvas, rect, '???¤í–‰', const Offset(8, 8), const Color(0xFF7CFFB0));
    _tag(canvas, rect, '??ì¡°ê±´', const Offset(8, 26), const Color(0xFFFFE08B));
    _tag(canvas, rect, '??ê¸ˆì?', const Offset(8, 44), const Color(0xFFFF8B8B));

    // ?„ì¬ ?„ì¹˜(???? ?œì‹œ ??ê°•ì œ ê¸°ë³¸
    _tag(canvas, rect, '?„ì¬?„ì¹˜ 0(ì§€ê¸? Â· ${pos.labelShort}', const Offset(8, 62), Colors.white.withOpacity(0.85));

    // ?€ê²Ÿì¡´(ëª©í‘œ ?ì—­)
    if (targetLow != null) {
      final t1 = _py(targetLow!, rect, minY, maxY);
      final t2 = _py((targetHigh ?? targetLow!) , rect, minY, maxY);
      final top = math.min(t1, t2);
      final bot = math.max(t1, t2);
      final tp = Paint()..color = const Color(0xFF00FF88).withOpacity(0.10);
      canvas.drawRect(Rect.fromLTRB(rect.left, top, rect.right, bot), tp);
    }

    // ë¬´íš¨??+ ?¥ë²½(Barrier)
    if (invalidLine != null) {
      final y = _py(invalidLine!, rect, minY, maxY);
      final p = Paint()
        ..color = const Color(0xFFFF5555).withOpacity(0.65)
        ..strokeWidth = 2.4;
      canvas.drawLine(Offset(rect.left, y), Offset(rect.right, y), p);

      // lock label
      final txt = zoneState == _ZoneState.fail ? '?”“ êµ¬ì¡°?Œê´´' : '?”’ êµ¬ì¡°??;
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

    // ì±„ë„(?µë¡œ): ì¤‘ì•™ ê²½ë¡œë¥?ê°ì‹¸??"?ˆìš© ë²”ìœ„"
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

    // ì±„ë„ ????ê²½ê³„??ê°•í•˜ê²?
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

    

// === ALT/FAIL ê²½ë¡œ(?ì„ ) ===
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

// ê²½ë¡œ ?¼ì¸
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

    // ??ê¸°ë³¸)
    final dot = Paint()..color = Colors.white.withOpacity(0.50);
    for (final p in points) {
      final x = _px(p.x, rect);
      final y = _py(p.y, rect, minY, maxY);
      canvas.drawCircle(Offset(x, y), 2.0, dot);
    }

    // ê²½ë¡œ ë²ˆí˜¸(ê°•ì œ): ???„ì¬ + ? â‘¡?¢â‘£??(ìµœë? 5ê°?
    // - ?¬ì¸?¸ê? ë§ì•„??"?µì‹¬"ë§?ì°ì–´???œëˆˆ???½íˆê²?    if (points.isNotEmpty) {
      final c0 = Offset(_px(points[0].x, rect), _py(points[0].y, rect, minY, maxY));
      _marker(canvas, c0, '0', isPrimary: true);

      final idxs = _pickWaypoints(points.length, 5);
      for (int i = 0; i < idxs.length; i++) {
        final p = points[idxs[i]];
        final c = Offset(_px(p.x, rect), _py(p.y, rect, minY, maxY));
        _marker(canvas, c, '${i + 1}', isPrimary: false);
      }
    }

// ?€?´í?
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

    // BUY/SELL ?íƒœ ë²„íŠ¼(?¤í–‰êµ¬ê°„?ì„œë§?ê°•í•˜ê²?
    final isExec = zoneState == _ZoneState.execute;
    final side = isLong ? 'ë§¤ìˆ˜' : 'ë§¤ë„';
    final bText = isExec ? side : '${side} ?”’';
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

  // ?ìŠ¤??ê°€?´ë°)
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

  // ?„ì¬???¼ë²¨????ë²????‘ê²Œ) ë¶™ì—¬??'AI???ë‚Œ' ê°•í™”
  if (isPrimary) {
    final lp = TextPainter(
      text: TextSpan(
        text: 'ì§€ê¸?,
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
    // points.x ë²”ìœ„: 0~12 ê¸°ì?
    final t = (x / 12).clamp(0.0, 1.0);
    return rect.left + rect.width * t;
  }

  double _py(double y, Rect rect, double minY, double maxY) {
    final t = ((y - minY) / (maxY - minY)).clamp(0.0, 1.0);
    return rect.bottom - rect.height * t;
  }

  /// ?¬ì¸?¸ê? ë§ì•„??'?µì‹¬'ë§?ê³¨ë¼ ? â‘¡?¢â‘£?¤ë¡œ ì°ê¸°
  /// - ??ƒ ë§ˆì?ë§??¬ì¸???¬í•¨
  /// - 0ë²??„ì¬)?€ ?œì™¸?˜ê³  ë°˜í™˜
  List<int> _pickWaypoints(int n, int maxCount) {
    if (n <= 1) return const [];
    final k = math.min(maxCount, n - 1);
    if (k <= 0) return const [];

    // ê· ë“± ë¶„í• (ë§ˆì?ë§??¬í•¨)
    final out = <int>{};
    for (int i = 1; i <= k; i++) {
      final t = i / k;
      int idx = (t * (n - 1)).round();
      if (idx <= 0) idx = 1;
      if (idx >= n) idx = n - 1;
      out.add(idx);
    }
    // ë§ˆì?ë§‰ì? ë¬´ì¡°ê±?    out.add(n - 1);

    final list = out.toList()..sort();
    // ìµœë? kê°œë¡œ ?œí•œ(?ˆë¬´ ë§ì•„ì§€ë©??„ë°˜ ?„ì£¼)
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