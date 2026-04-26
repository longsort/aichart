import 'package:flutter/material.dart';

import '../../core/app_settings.dart';
import '../../core/models/fu_state.dart';
import '../../core_ai/super_agi_v6/ev_calculator_v6.dart';
import '../../core_ai/super_agi_v6/position_sizer_v6.dart';
import '../../core_ai/super_agi_v6/stop_hunt_calculator_v6.dart';

/// ë¯¸ë‹ˆì°¨íŠ¸ ë°”ë¡œ ?„ë˜??ë¶™ëŠ” "ë§¤ë‹ˆ?€" ?¨ë„.
/// - ?œë“œ(USDT) ?…ë ¥
/// - 5% ë¦¬ìŠ¤??ê¸°ì? (?”ì§„??ê³„ì‚°??entry/stop/target/leverage/qty) ?œì‹œ
/// - ë©€???€?„í”„?ˆì„(5m~1M) ?”ì•½?????”ë©´?ì„œ
class ManagerTradePanel extends StatefulWidget {
  final String symbol;

  /// ?„ì¬ ?”ë©´?ì„œ ? íƒ???€?„í”„?ˆì„ (?ë‹¨ ??³¼ ?™ì¼)
  final String currentTf;

  /// { '5m': FuState, '15m': FuState, ... }
  final Map<String, FuState> tfSnap;

  /// ?œë“œ ë³€ê²??? ë¶€ëª¨ì—???”ì§„ ?¬ê³„???¸ë¦¬ê±?  final VoidCallback onSeedChanged;

  const ManagerTradePanel({
    super.key,
    required this.symbol,
    required this.currentTf,
    required this.tfSnap,
    required this.onSeedChanged,
  });

  @override
  State<ManagerTradePanel> createState() => _ManagerTradePanelState();
}

class _AgiGateResult {
  /// ?”ë©´ ?œì‹œ???¨ê³„(?œê?)
  /// - ?•ì •: ì§„ì… ê°€??ê·¼ê±° ì¶©ë¶„)
  /// - ì£¼ì˜: ì¤€ë¹?ê´€ë§?ê·¼ê±° ë¶€ì¡?
  /// - ? ê¸ˆ: ê±°ë˜ ê¸ˆì?(?„í—˜)
  final String level; // '?•ì •' / 'ì£¼ì˜' / '? ê¸ˆ'
  final String message;
  final Color color;
  const _AgiGateResult(this.level, this.message, this.color);
}

class _ManagerTradePanelState extends State<ManagerTradePanel> {
  late final TextEditingController _seedCtrl;

  // ============================
  // Step4: ?•ì • ? í˜¸ ê²Œì´???¨ë°œ ë°©ì?)
  // - CONFIRM: EV??+ ?ŒíŒ…?„í—˜??+ ?ˆë²„ ê³¼ë„X + ë°©í–¥ ëª…í™•
  // - CAUTION: ì¡°ê±´ ?¼ë? ë¶€ì¡?ê´€ë§?ì£¼ì˜)
  // - LOCK: NO-TRADE/?„í—˜ ê³¼ë‹¤
  // ============================
  _AgiGateResult _agiGate({
    required FuState f,
    required int dir,
    required double evR,
    required double huntRisk,
    required double leverage,
  }) {
    if (f.noTrade) {
      return const _AgiGateResult('? ê¸ˆ', 'ê±°ë˜ ê¸ˆì?', Color(0xFFFF7E7E));
    }

    // ì¹˜ëª… ì¡°ê±´
    if (evR < 0 || huntRisk >= 70 || leverage >= 80) {
      return const _AgiGateResult('? ê¸ˆ', '?„í—˜ ?’ìŒ', Color(0xFFFF7E7E));
    }

    // ì£¼ì˜ ì¡°ê±´
    final caution = (evR < 0.10) || (huntRisk >= 50) || (leverage >= 40) || (dir == 0);
    if (caution) {
      final why = (huntRisk >= 50)
          ? '?ŒíŒ… ?„í—˜'
          : (evR < 0.10)
              ? 'EV ?½í•¨'
              : (leverage >= 40)
                  ? '?ˆë²„ ê³¼ë‹¤'
                  : 'ë°©í–¥ ë¶ˆëª…??;
      return _AgiGateResult('ì£¼ì˜', why, const Color(0xFFA8B4D6));
    }

    // ?•ì •
    final dirKo = (dir == 1) ? 'ë¡??„ìª½)' : '???„ë˜ìª?';
    final col = (dir == 1) ? const Color(0xFF33D18C) : const Color(0xFFFF5B5B);
    return _AgiGateResult('?•ì •', '$dirKo ì§„ì… ê°€??, col);
  }

  static const _order = <String>['5m', '15m', '1h', '4h', '1D', '1W', '1M'];

  @override
  void initState() {
    super.initState();
    _seedCtrl = TextEditingController(text: AppSettings.accountUsdt.toStringAsFixed(0));
  }

  @override
  void dispose() {
    _seedCtrl.dispose();
    super.dispose();
  }

  void _applySeed() {
    final raw = _seedCtrl.text.trim().replaceAll(',', '');
    final v = double.tryParse(raw);
    if (v == null || v <= 0) return;
    AppSettings.accountUsdt = v;
    widget.onSeedChanged();
    setState(() {});
  }

  // ============================
  // ?œê? ë§¤ë‹ˆ?€ ë¸Œë¦¬??ê·¼ê±° ê¸°ë°˜)
  // - ?ì–´/?„ë¬¸?©ì–´ ìµœì†Œ??  // - ?”ì§„???´ë? ê³„ì‚°??ê°’ë§Œ ?¬ìš©(?†ëŠ” ë§?ê¸ˆì?)
  // ============================
  String _koSituation({required FuState f, required int dir, required bool hasZone}) {
    final trend = switch (f.structureTag) {
      'BOS_UP' || 'CHOCH_UP' || 'MSB_UP' => '?ìŠ¹ ?ë¦„',
      'BOS_DN' || 'CHOCH_DN' || 'MSB_DN' => '?˜ë½ ?ë¦„',
      _ => 'ë°•ìŠ¤ ?ë¦„',
    };
    final dirKo = (dir == 1)
        ? 'ë¡?ìª??°ì„¸'
        : (dir == -1)
            ? '??ìª??°ì„¸'
            : 'ë°©í–¥ ? ë§¤';
    if (!hasZone || f.reactLow <= 0 || f.reactHigh <= 0) {
      return '$trend Â· $dirKo';
    }
    final px = f.price;
    final inBand = (px >= f.reactLow && px <= f.reactHigh);
    final bandTxt = inBand ? 'ë°˜ì‘ êµ¬ê°„ ?? : 'ë°˜ì‘ êµ¬ê°„ ë°?;
    return '$trend Â· $dirKo Â· $bandTxt';
  }

  String _koReason({required FuState f, required double evR, required double huntRisk}) {
    final why = f.signalWhy.trim();
    if (why.isNotEmpty) return why;
    final flow = f.flowHint.trim();
    if (flow.isNotEmpty) return flow;
    if (evR < 0) return 'ê¸°ë?ê°’ì´ ??•„ ì¡°ì‹¬';
    if (huntRisk >= 50) return '?”ë“¤ê¸??„í—˜???ˆì–´ ?€ê¸?;
    return 'ê·¼ê±°ê°€ ???“ì´ë©??ˆë‚´';
  }

  List<String> _evidenceBullets({required FuState f, required double evR, required double huntRisk}) {
    // 1) ?”ì§„??ë§Œë“  bullet???ˆìœ¼ë©?ìµœìš°??    final base = f.signalBullets.map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
    if (base.isNotEmpty) return base.take(6).toList();

    // 2) ?†ìœ¼ë©? FuState ?«ìë§Œìœ¼ë¡?ê°„ë‹¨ ê·¼ê±° ?ì„±
    final out = <String>[];
    if (f.s1 > 0 && f.r1 > 0) out.add('ê°€ê²?êµ¬ê°„: ?„ë˜ ${f.s1.toStringAsFixed(0)} / ??${f.r1.toStringAsFixed(0)}');
    if (f.vwap > 0) out.add('?‰ê· ?? ${f.vwap.toStringAsFixed(0)}');
    out.add('?¸ê? ?? ë§¤ìˆ˜ ${f.obImbalance}% / ë§¤ë„ ${100 - f.obImbalance}%');
    out.add('ì²´ê²° ?? ë§¤ìˆ˜ ${f.tapeBuyPct}% / ë§¤ë„ ${100 - f.tapeBuyPct}%');
    out.add('???ê¸ˆ ?? ${f.forceScore}/100');
    out.add('?”ë“¤ê¸??„í—˜: ${f.sweepRisk}/100');
    out.add('ê¸°ë?ê°? ${evR >= 0 ? '+' : ''}${evR.toStringAsFixed(2)}??);
    out.add('ë¦¬ìŠ¤??? í˜¸: ${huntRisk.toStringAsFixed(0)}/100');
    return out.take(6).toList();
  }

  List<String> _nextActions({required String gateLevel, required int dir, required bool hasZone}) {
    final dirKo = (dir == 1)
        ? 'ë¡?
        : (dir == -1)
            ? '??
            : 'ë°©í–¥';
    if (gateLevel == '?•ì •') {
      return <String>[
        '$dirKo ì§„ì… ì¤€ë¹?,
        '?ì ˆ ë¨¼ì?',
        '?µì ˆ 1Â·2Â·3 ?˜ëˆ”',
      ];
    }
    if (gateLevel == '? ê¸ˆ') {
      return <String>[
        'ê´€ë§?,
        '?œê°„?€ ë°”ê¾¸ê¸?,
        hasZone ? 'ë°˜ì‘ êµ¬ê°„ ?¬í™•?? : 'êµ¬ê°„ ?¤ì‹œ ?¡ê¸°',
      ];
    }
    // ì£¼ì˜
    return <String>[
      hasZone ? 'ë°˜ì‘ êµ¬ê°„ ?€ê¸? : 'êµ¬ê°„ ?•ì„± ?€ê¸?,
      '?ŒíŒŒ/?´íƒˆ ?•ì¸',
      '?”ë“¤ê¸?ê²½ê³„',
    ];
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final seed = AppSettings.accountUsdt;
    // AppSettings.riskPct??5.0(%) ?•íƒœë¡??€?¥ë¨ ??ê³„ì‚°?ëŠ” 0.05ë¡?ë³€??    final riskPct = (AppSettings.riskPct / 100.0);
    final risk = seed * riskPct;

    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFF2B3755).withOpacity(0.9)),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF0D1220),
            Color(0xFF0B1326),
          ],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('ë§¤ë‹ˆ?€ ?ë™ ë¸Œë¦¬??, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
              const Spacer(),
              _pill(
                'ë¦¬ìŠ¤??5%: ${risk.toStringAsFixed(0)} USDT',
                bg: const Color(0xFF151B2C),
                fg: const Color(0xFFA8B4D6),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _seedBox(theme),
              ),
              const SizedBox(width: 10),
              SizedBox(
                height: 42,
                child: ElevatedButton(
                  onPressed: _applySeed,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF1E2A4A),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    elevation: 0,
                  ),
                  child: const Text('?ìš©'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _legend(theme),
          const SizedBox(height: 10),
          // ??Step3: ë¯¸ë‹ˆì°¨íŠ¸ ?„ë˜ '?¤ì‹œê°?2ì¤?ë§¤ë‹ˆ?€ ?¤íŠ¸ë¦? (?”ì§„ ?„ì²´ ê¸°ëŠ¥ ?”ì•½)
          _superAgiStrip(theme, widget.currentTf, widget.tfSnap[widget.currentTf]),
          const SizedBox(height: 10),
          // ???„ì¬ ? íƒ??TF ?”ì•½ (?¬ìš©?ê? ë¯¸ë‹ˆì°¨íŠ¸ë§?ë´ë„ ë°”ë¡œ ?ë‹¨)
          _currentTfSummary(theme, widget.currentTf, widget.tfSnap[widget.currentTf]),
          const SizedBox(height: 10),
          ..._order.map((tf) => _tfRow(theme, tf, widget.tfSnap[tf])).toList(),
        ],
      ),
    );
  }

  Widget _currentTfSummary(ThemeData theme, String tf, FuState? f) {
    if (f == null) {
      return _pill('?„ì¬ TF($tf) ?°ì´???†ìŒ', bg: const Color(0xFF151B2C), fg: const Color(0xFFA8B4D6));
    }
    final dir = _dirKorean(f);
    final dirClr = _dirColor(f, theme);
final p = (f.probFinal * 100).round();
    final noTrade = f.noTrade;

    final title = noTrade ? 'ì§€ê¸ˆì? ì§€ì¼œë³´ê¸? : 'ì§„ì… ?„ë³´';
    final subtitle = noTrade ? (f.noTradeReason.isNotEmpty ? f.noTradeReason : 'ì¡°ê±´ ë¶€ì¡?) : '?€??${p}%';

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF2B3755).withOpacity(0.8)),
        color: const Color(0xFF0A1224),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _pill('?„ì¬ ${_tfLabel(tf)}', bg: const Color(0xFF151B2C), fg: const Color(0xFFA8B4D6)),
              const SizedBox(width: 8),
              _pill(dir, bg: dirClr.withOpacity(0.18), fg: dirClr),
              const Spacer(),
              _pill('?€??$p%', bg: const Color(0xFF151B2C), fg: const Color(0xFFA8B4D6)),
            ],
          ),
          const SizedBox(height: 8),
          Text(title, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 2),
          Text(subtitle, style: theme.textTheme.bodySmall?.copyWith(color: const Color(0xFF97A6C7))),
          const SizedBox(height: 10),
          // ê°€ê²??ì ˆ/ëª©í‘œ/?ˆë²„ë¦¬ì? (?ˆëŠ” ê°’ë§Œ)
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (f.entry > 0) _kv(theme, 'ì§„ì…', f.entry.toStringAsFixed(0)),
              if (f.sl > 0) _kv(theme, '?ì ˆ', f.sl.toStringAsFixed(0), danger: true),
              if (f.tp1 > 0) _kv(theme, '1ì°?, f.tp1.toStringAsFixed(0)),
              if (f.tp2 > 0) _kv(theme, '2ì°?, f.tp2.toStringAsFixed(0)),
              if (f.tp3 > 0) _kv(theme, '3ì°?, f.tp3.toStringAsFixed(0)),
              if (f.levNeed > 0) _kv(theme, '?ˆë²„', '${f.levNeed.toStringAsFixed(1)}x'),
            ],
          ),
        ],
      ),
    );
  }

  // ============================
  // Step3: SUPER AGI 2ì¤??¤ì‹œê°?ë¸Œë¦¬???˜ë‹¨ ?¤íŠ¸ë¦?
  // - EV(+0.32R)
  // - ?ŒíŒ…?„í—˜/ì¶”ì²œSL
  // - 5% ë¦¬ìŠ¤??ê¸°ì? ?¬ì????ˆë²„/?ˆìƒ?˜ìµ(USDT)
  // ============================
  Widget _superAgiStrip(ThemeData theme, String tf, FuState? f) {
    if (f == null) {
      return _pill('ë§¤ë‹ˆ?€: ?°ì´???†ìŒ', bg: const Color(0xFF151B2C), fg: const Color(0xFFA8B4D6));
    }

    final seed = AppSettings.accountUsdt;
    // AppSettings.riskPct??% ê°??? 5.0)
    final riskPct = (AppSettings.riskPct / 100.0);

    // ë°˜ì‘êµ¬ê°„???†ìœ¼ë©? ?”ì§„ ê°’ë§Œ ê°„ë‹¨??    final hasZone = (f.reactHigh > f.reactLow) && f.reactLow > 0;
    final dir = f.dir; // 1=ë¡???, -1=???„ë˜), 0=ê´€ë§?    final dirTxt = (dir == 1)
        ? '?Ÿ¢ ë¡??„ìª½)'
        : (dir == -1)
            ? '?”´ ???„ë˜ìª?'
            : '??ê´€ë§?;
    final dirCol = (dir == 1)
        ? const Color(0xFF33D18C)
        : (dir == -1)
            ? const Color(0xFFFF5B5B)
            : const Color(0xFFA8B4D6);

    // ATR ê·¼ì‚¬(ìµœê·¼ 30ë´??‰ê·  range)
    double atrApprox = 0.0;
    if (f.candles.isNotEmpty) {
      final n = f.candles.length < 30 ? f.candles.length : 30;
      double sum = 0;
      for (int i = f.candles.length - n; i < f.candles.length; i++) {
        sum += (f.candles[i].high - f.candles[i].low).abs();
      }
      atrApprox = (n > 0) ? (sum / n) : 0.0;
    }

    // ì¶”ì²œ SL(?ŒíŒ…ë°´ë“œ ë°”ê¹¥)
    StopHuntResult? sh;
    double suggestedSl = 0.0;
    double huntRisk = 0.0;
    if (hasZone) {
      // swingLow/high??ìµœê·¼ Në´?ê¸°ì?(ê³¼ë„?œì‹œ ë°©ì?)
      final c = f.candles;
      double? recentLow;
      double? recentHigh;
      if (c.isNotEmpty) {
        final recentN = c.length < 60 ? c.length : 60;
        recentLow = c[c.length - recentN].low;
        recentHigh = c[c.length - recentN].high;
        for (int i = c.length - recentN; i < c.length; i++) {
          if (c[i].low < recentLow!) recentLow = c[i].low;
          if (c[i].high > recentHigh!) recentHigh = c[i].high;
        }
      }
      sh = StopHuntCalculatorV6.compute(
        zoneLow: f.reactLow,
        zoneHigh: f.reactHigh,
        atr: atrApprox,
        k1: 1.0,
        k2: 0.20,
        swingLow: recentLow,
        swingHigh: recentHigh,
        entry: (f.entry > 0 ? f.entry : f.price),
      );
      huntRisk = sh.riskScore;
      if (dir == 1) {
        suggestedSl = sh.suggestedSlLong;
      } else if (dir == -1) {
        suggestedSl = sh.suggestedSlShort;
      } else {
        // ì¤‘ë¦½?´ë©´ ê°€ê²?ê¸°ì??¼ë¡œ ê°€ê¹Œìš´ ìª?        final dLong = ((f.entry > 0 ? f.entry : f.price) - sh.suggestedSlLong).abs();
        final dShort = (sh.suggestedSlShort - (f.entry > 0 ? f.entry : f.price)).abs();
        suggestedSl = (dLong <= dShort) ? sh.suggestedSlLong : sh.suggestedSlShort;
      }
    }

    // ?¬ì????¬ì´ì§?5% ë¦¬ìŠ¤??
    final entry = (f.entry > 0) ? f.entry : (f.price > 0 ? f.price : 0.0);
    final sl = (f.sl > 0) ? f.sl : (suggestedSl > 0 ? suggestedSl : 0.0);
    final ps = (entry > 0 && sl > 0)
        ? PositionSizerV6.compute(seed: seed, riskPct: riskPct, entry: entry, sl: sl)
        : PositionSizingResult(
            seed: seed,
            riskPct: riskPct,
            riskMoney: seed * riskPct,
            entry: entry,
            sl: sl,
            stopDist: 0,
            qty: 0,
            notional: 0,
            leverage: 0,
          );

    // EV (+0.32R)
    final rr = f.rr;
    final ev = EVCalculatorV6.compute(
      pWin: f.finalProb,
      rewardR: (rr > 0 ? rr : 1.0),
      riskR: 1.0,
    );

    // 25% ëª©í‘œ???„ìš”???ˆë²„(ë°˜ì‘êµ¬ê°„/ë¸Œë ˆ?´í¬ ??ê¸°ì?)
    double movePct = 0.0;
    if (hasZone && entry > 0) {
      movePct = ((f.reactHigh - f.reactLow).abs() / entry) * 100.0;
    }
    final levFor25 = (movePct > 0) ? (25.0 / movePct) : 0.0;

    // ?ˆìƒ ?˜ìµ(USDT) ???”ì§„ ëª©í‘œ(target)ê°€ ?ˆìœ¼ë©?ê¸°ì? ê³„ì‚°
    double profit = 0.0;
    if (f.tp > 0 && entry > 0 && ps.qty > 0) {
      final raw = (f.tp - entry).abs() * ps.qty;
      profit = raw.isFinite ? raw : 0.0;
    }

    final gate = _agiGate(f: f, dir: dir, evR: ev.evR, huntRisk: huntRisk, leverage: ps.leverage);

    // === ?œê? ë¸Œë¦¬??ê·¼ê±° ê¸°ë°˜) ===
    final situation = _koSituation(f: f, dir: dir, hasZone: hasZone);
    final reason = _koReason(f: f, evR: ev.evR, huntRisk: huntRisk);
    final bullets = _evidenceBullets(f: f, evR: ev.evR, huntRisk: huntRisk);
    final actions = _nextActions(gateLevel: gate.level, dir: dir, hasZone: hasZone);

    final lineStats = hasZone
        ? 'ë°˜ì‘êµ¬ê°„ ${f.reactLow.toStringAsFixed(0)}~${f.reactHigh.toStringAsFixed(0)} Â· ê·¼ê±° ${f.evidenceHit}/${f.evidenceTotal} Â· ê¸°ë?ê°?${ev.evR >= 0 ? '+' : ''}${ev.evR.toStringAsFixed(2)}??
        : 'ê·¼ê±° ${f.evidenceHit}/${f.evidenceTotal} Â· ê¸°ë?ê°?${ev.evR >= 0 ? '+' : ''}${ev.evR.toStringAsFixed(2)}??Â· ?•ë¥  ${(f.finalProb * 100).round()}%';

    final linePlan = '?ì ˆ ${sl > 0 ? sl.toStringAsFixed(0) : '--'} Â· ?ˆë²„ ${ps.leverage > 0 ? ps.leverage.toStringAsFixed(1) : '--'}ë°?Â· ?ˆìƒ?˜ìµ ${profit > 0 ? '+${profit.toStringAsFixed(0)}' : '--'} Â· 25%ëª©í‘œ?ˆë²„ ${levFor25 > 0 ? levFor25.toStringAsFixed(1) : '--'}ë°?;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF2B3755).withOpacity(0.8)),
        color: const Color(0xFF0A1224),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _pill('AI ë§¤ë‹ˆ?€', bg: const Color(0xFF151B2C), fg: const Color(0xFFA8B4D6)),
              const SizedBox(width: 8),
              _pill('${_tfLabel(tf)}', bg: const Color(0xFF151B2C), fg: const Color(0xFFA8B4D6)),
              const SizedBox(width: 8),
              _pill(dirTxt, bg: dirCol.withOpacity(0.16), fg: dirCol),
              const SizedBox(width: 8),
              _pill(gate.message, bg: gate.color.withOpacity(0.16), fg: gate.color),
              const SizedBox(width: 8),
              _pill('?„ì¬ê°€ ${f.price > 0 ? f.price.toStringAsFixed(0) : '--'}', bg: const Color(0xFF151B2C), fg: const Color(0xFFA8B4D6)),
              const Spacer(),
              _pill('5% ë¦¬ìŠ¤??, bg: const Color(0xFF151B2C), fg: const Color(0xFFA8B4D6)),
            ],
          ),
          const SizedBox(height: 8),
          Text('?í™©: $situation', style: theme.textTheme.bodySmall?.copyWith(color: const Color(0xFFE9ECFF), fontWeight: FontWeight.w800, height: 1.15)),
          const SizedBox(height: 4),
          Text('?´ìœ : $reason', style: theme.textTheme.bodySmall?.copyWith(color: const Color(0xFFB7C2E2), fontWeight: FontWeight.w700, height: 1.15)),
          const SizedBox(height: 6),
          Text('ê·¼ê±°', style: theme.textTheme.bodySmall?.copyWith(color: const Color(0xFFA8B4D6), fontWeight: FontWeight.w800, height: 1.15)),
          const SizedBox(height: 4),
          ...bullets.map((e) => Padding(
                padding: const EdgeInsets.only(bottom: 2),
                child: Text('??$e', style: theme.textTheme.bodySmall?.copyWith(color: const Color(0xFF97A6C7), fontWeight: FontWeight.w600, height: 1.12)),
              )),
          const SizedBox(height: 6),
          Text(lineStats, style: theme.textTheme.bodySmall?.copyWith(color: const Color(0xFF97A6C7), fontWeight: FontWeight.w700, height: 1.15)),
          const SizedBox(height: 4),
          Text(linePlan, style: theme.textTheme.bodySmall?.copyWith(color: const Color(0xFF7F8DB8), fontWeight: FontWeight.w600, height: 1.15)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: actions
                .take(3)
                .map((t) => _pill(t, bg: const Color(0xFF151B2C), fg: const Color(0xFFA8B4D6)))
                .toList(),
          ),
        ],
      ),
    );
  }


  String _tfLabel(String tf) {
    // UI ?œì‹œ???¼ë²¨ (?„ë? ?œê?)
    final k = tf.trim();
    switch (k) {
      case '1m':
        return '1ë¶?;
      case '3m':
        return '3ë¶?;
      case '5m':
        return '5ë¶?;
      case '15m':
        return '15ë¶?;
      case '1h':
        return '1?œê°„';
      case '4h':
        return '4?œê°„';
      case '1D':
      case '1d':
        return '?˜ë£¨';
      case '1W':
      case '1w':
        return '1ì£?;
      case '1M':
        return '1??;
      default:
        return k;
    }
  }

Widget _seedBox(ThemeData theme) {
    return Container(
      height: 42,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF0F162B),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF2B3755).withOpacity(0.8)),
      ),
      child: Row(
        children: [
          Text('?œë“œ', style: theme.textTheme.bodyMedium?.copyWith(color: const Color(0xFFB7C2E2))),
          const SizedBox(width: 10),
          Expanded(
            child: TextField(
              controller: _seedCtrl,
              keyboardType: TextInputType.number,
              style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
              decoration: const InputDecoration(
                border: InputBorder.none,
                isDense: true,
                hintText: '?? 1000',
                hintStyle: TextStyle(color: Color(0xFF64719A)),
              ),
              onSubmitted: (_) => _applySeed(),
            ),
          ),
          const Text('USDT', style: TextStyle(color: Color(0xFF7F8DB8), fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }

  Widget _legend(ThemeData theme) {
    return Row(
      children: [
        _pill('ì§„ì…', bg: const Color(0xFF13201A), fg: const Color(0xFF67F2B1)),
        const SizedBox(width: 6),
        _pill('?ì ˆ', bg: const Color(0xFF241416), fg: const Color(0xFFFF7E7E)),
        const SizedBox(width: 6),
        _pill('?µì ˆ', bg: const Color(0xFF161B2A), fg: const Color(0xFFA8B4D6)),
        const Spacer(),
        Text('?œì‹œ???”ì§„ ê³„ì‚°ê°?5% ë¦¬ìŠ¤?? ê·¸ë?ë¡?,
            style: theme.textTheme.bodySmall?.copyWith(color: const Color(0xFF7F8DB8))),
      ],
    );
  }

  Widget _kv(ThemeData theme, String k, String v, {bool danger = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          SizedBox(
            width: 44,
            child: Text(k, style: theme.textTheme.bodySmall?.copyWith(color: theme.hintColor)),
          ),
          Expanded(child: Text(v, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600, color: danger ? const Color(0xFFFF7E7E) : null))),
        ],
      ),
    );
  }

  String _dirKorean(FuState s) {
    if (s.noTrade) return 'ê´€ë§?;
    // FuState.dir ??int(+1/-1/0) ?¸í™˜ ê²Œí„°?¼ì„œ toUpperCase ë¶ˆê?.
    // ?¤ì œ ë°©í–¥ ë¬¸ì?´ì? signalDir ???¬ìš©.
    final d = s.signalDir.toUpperCase();
    if (d.contains('LONG') || d.contains('BUY') || d == 'UP') return 'ë¡?;
    if (d.contains('SHORT') || d.contains('SELL') || d == 'DN' || d == 'DOWN') return '??;
    return 'ê´€ë§?;
  }

  Color _dirColor(FuState s, ThemeData theme) {
    if (s.noTrade) return theme.hintColor;
    final d = s.signalDir.toUpperCase();
    if (d.contains('LONG') || d.contains('BUY') || d == 'UP') return const Color(0xFF29D3A6);
    if (d.contains('SHORT') || d.contains('SELL') || d == 'DN' || d == 'DOWN') return const Color(0xFFFF5B7A);
    return theme.hintColor;
  }

  Widget _tfRow(ThemeData theme, String tf, FuState? s) {
    if (s == null) {
      return _rowShell(
        tf: tf,
        left: Text('?°ì´???†ìŒ', style: theme.textTheme.bodySmall?.copyWith(color: const Color(0xFF64719A))),
        right: const SizedBox.shrink(),
      );
    }

    final prob = (s.finalProb * 100).clamp(0, 100).toStringAsFixed(0);
    final status = _statusLabel(s);
    final dir = _dirLabel(s);

    final entry = s.entry > 0 ? s.entry.toStringAsFixed(0) : '-';
    final stop = s.stop > 0 ? s.stop.toStringAsFixed(0) : '-';
    final target = s.target > 0 ? s.target.toStringAsFixed(0) : '-';
    final lev = s.leverage > 0 ? '${s.leverage.toStringAsFixed(1)}x' : '-';
    final qty = s.qty > 0 ? s.qty.toStringAsFixed(4) : '-';

    final react = (s.reactLow > 0 && s.reactHigh > 0) ? '${s.reactLow.toStringAsFixed(0)}~${s.reactHigh.toStringAsFixed(0)}' : '-';

    final badge = _badgeColor(s);

    return _rowShell(
      tf: tf,
      left: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _pill('$dir Â· $status', bg: badge.$1, fg: badge.$2),
              const SizedBox(width: 8),
              Text('?•ë¥  $prob%', style: theme.textTheme.bodySmall?.copyWith(color: const Color(0xFFB7C2E2))),
              const Spacer(),
              Text('ë°˜ì‘êµ¬ê°„ $react', style: theme.textTheme.bodySmall?.copyWith(color: const Color(0xFF7F8DB8))),
            ],
          ),
          const SizedBox(height: 6),
          Text('ì§„ì… $entry Â· ?ì ˆ $stop Â· ?µì ˆ $target Â· ?ˆë²„ $lev Â· ?˜ëŸ‰ $qty',
              style: theme.textTheme.bodySmall?.copyWith(color: const Color(0xFFA8B4D6), fontWeight: FontWeight.w600)),
        ],
      ),
      right: const SizedBox.shrink(),
    );
  }

  (Color, Color) _badgeColor(FuState s) {
    // ?•ë¥ /ë¦¬ìŠ¤??ê¸°ì??¼ë¡œ "ê°?ì¤??? ?ë‚Œë§?
    final p = s.finalProb;
    final r = s.risk;
    if (p >= 0.7 && r <= 0.35) return (const Color(0xFF13201A), const Color(0xFF67F2B1));
    if (p >= 0.55 && r <= 0.55) return (const Color(0xFF1B2032), const Color(0xFFA8B4D6));
    return (const Color(0xFF241416), const Color(0xFFFF7E7E));
  }

  String _statusLabel(FuState s) {
    if (s.tradeLock) return '? ê¸ˆ';
    if (s.tradeOk) return 'ì§„ì…';
    if (s.watch) return 'ê´€ë§?;
    return '?€ê¸?;
  }

  String _dirLabel(FuState s) {
    // 0: ì¤‘ë¦½, 1: ë¡? -1: ??    if (s.dir > 0) return 'ë¡?;
    if (s.dir < 0) return '??;
    return 'ì¤‘ë¦½';
  }

  Widget _rowShell({required String tf, required Widget left, required Widget right}) {
    final isCurrent = tf == widget.currentTf;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: isCurrent ? const Color(0xFF121C36) : const Color(0xFF0F162B),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: (isCurrent ? const Color(0xFF67F2B1) : const Color(0xFF2B3755)).withOpacity(0.65),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 44,
            child: Text(tf,
                textAlign: TextAlign.left,
                style: const TextStyle(color: Color(0xFFB7C2E2), fontWeight: FontWeight.w900)),
          ),
          const SizedBox(width: 6),
          Expanded(child: left),
          right,
        ],
      ),
    );
  }

  Widget _pill(String text, {required Color bg, required Color fg}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: fg.withOpacity(0.25)),
      ),
      child: Text(text, style: TextStyle(color: fg, fontWeight: FontWeight.w800, fontSize: 12)),
    );
  }
}
