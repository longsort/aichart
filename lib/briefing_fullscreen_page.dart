import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/engines/decision_engine_v1.dart';
import '../../core/services/fu_engine.dart';
import '../../core/services/euro_pass_service.dart';
import '../../core/models/fu_state.dart';
import '../../core/models/trade_verdict.dart';
import '../widgets/mini_chart_v4.dart';
import '../widgets/neon_theme.dart';
import '../widgets/ai_wave_summary_card_v59.dart';

/// ?�체?�면 브리???�펙 E)
/// - ?�단: 결론/무효조건
/// - 중앙: 차트 + ?�버?�이(기존 MiniChartV4)
/// - ?�단: S/R ?�률 + 목표/?�절 ?�약
class BriefingFullScreenPage extends StatefulWidget {
  final String symbol;
  final String tfLabel;
  final FuState s;

  const BriefingFullScreenPage({
    super.key,
    required this.symbol,
    required this.tfLabel,
    required this.s,
  });

  @override
  State<BriefingFullScreenPage> createState() => _BriefingFullScreenPageState();
}

class _BriefingFullScreenPageState extends State<BriefingFullScreenPage> {
  final FuEngine _engine = FuEngine();
  late FuState _s;
  Timer? _timer;
  bool _refreshing = false;

  @override
  void initState() {
    super.initState();
    _s = widget.s;
    // ??Fullscreen?�서??캔들/�?결론??계속 갱신?�도�??�체 리프?�시 루프�??�다.
    // ???�면??_refresh()??Navigator push ?�후 ???�이지??반영?��? ?�기 ?�문??    // (Stateless snapshot 문제) ?�기??직접 갱신?�다.
    _timer = Timer.periodic(const Duration(seconds: 8), (_) => _tick());
    // �?진입 즉시 1??갱신
    WidgetsBinding.instance.addPostFrameCallback((_) => _tick());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _tick() async {
    if (!mounted || _refreshing) return;
    _refreshing = true;
    try {
      final st = await _engine.fetch(
        symbol: widget.symbol,
        tf: widget.tfLabel,
        allowNetwork: true,
        safeMode: true,
      );
      if (!mounted) return;
      setState(() {
        // ???�시�?갱신 �?"비어?�는 �? ?�냅?�이 ?�어?�는 경우 기존 값을 ?��???flicker 방�?
        _s = st.copyWith(
          fvgZones: st.fvgZones.isNotEmpty ? st.fvgZones : _s.fvgZones,
          obZones: st.obZones.isNotEmpty ? st.obZones : _s.obZones,
          bprZones: st.bprZones.isNotEmpty ? st.bprZones : _s.bprZones,
          mbZones: st.mbZones.isNotEmpty ? st.mbZones : _s.mbZones,
          structureTag: (st.structureTag.isNotEmpty && st.structureTag != 'NONE') ? st.structureTag : _s.structureTag,
          breakLevel: st.breakLevel > 0 ? st.breakLevel : _s.breakLevel,
          reactLevel: st.reactLevel > 0 ? st.reactLevel : _s.reactLevel,
          reactLow: st.reactLow > 0 ? st.reactLow : _s.reactLow,
          reactHigh: st.reactHigh > 0 ? st.reactHigh : _s.reactHigh,
        );
      });
    } catch (_) {
      // keep last state
    } finally {
      _refreshing = false;
    }
  }

  Widget _buildEuroPassGate(NeonTheme t) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.lock_outline, size: 56, color: t.muted),
            const SizedBox(height: 16),
            Text(
              '?�리미엄 브리??(?�로 ?�스)',
              style: TextStyle(color: t.fg, fontSize: 18, fontWeight: FontWeight.w900),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              '?�체?�면 브리?��? ?�로 ?�스 구독 ???�용?????�습?�다.',
              style: TextStyle(color: t.textSecondary, fontSize: 13),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: () async {
                final ok = await EuroPassService.I.purchaseProduct('euro_pass_monthly');
                if (ok && mounted) setState(() {});
              },
              icon: const Icon(Icons.shopping_cart_outlined, size: 20),
              label: const Text('?�스???�성??(?�텁)'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);
    if (!EuroPassService.I.hasAccess) {
      return Scaffold(
        backgroundColor: t.bg,
        appBar: AppBar(
          backgroundColor: t.bg,
          foregroundColor: t.fg,
          elevation: 0,
          title: Text('${widget.symbol} · ${widget.tfLabel}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900)),
        ),
        body: SafeArea(child: _buildEuroPassGate(t)),
      );
    }
    final s = _s;
    final TradeVerdict v = const DecisionEngineV1().verdict(s);

    final invalid = <String>[];
    if (s.zoneValidInt < 60) invalid.add('구간 ?�함(${s.zoneValidInt})');
    if (!s.hasStructure) invalid.add('구조 ?�음');
    if (!s.tfAgree) invalid.add('TF ?�의 부�?);
    if (s.noTrade) invalid.add('NO-TRADE');

    final sr = s.sr;
    final double s1 = (sr['s1'] is num) ? (sr['s1'] as num).toDouble() : 0;
    final double r1 = (sr['r1'] is num) ? (sr['r1'] as num).toDouble() : 0;
    final int sProb = (sr['sProb'] is num) ? (sr['sProb'] as num).toInt() : 0;
    final int rProb = (sr['rProb'] is num) ? (sr['rProb'] as num).toInt() : 0;

    final Color accent = switch (v.action) {
      TradeAction.LONG => const Color(0xFF33D18C),
      TradeAction.SHORT => const Color(0xFFFF5B5B),
      TradeAction.NO_TRADE => const Color(0xFFFF7E7E),
      _ => const Color(0xFFA8B4D6),
    };

    return Scaffold(
      backgroundColor: t.bg,
      appBar: AppBar(
        backgroundColor: t.bg,
        foregroundColor: t.fg,
        elevation: 0,
        title: Text('${widget.symbol} · ${widget.tfLabel}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900)),
      ),
      body: SafeArea(
        child: Column(
          children: [
            // ?�단: 결론/무효조건
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: t.card,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: t.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(999),
                            color: accent.withOpacity(0.14),
                            border: Border.all(color: accent.withOpacity(0.55)),
                          ),
                          child: Text(v.title, style: TextStyle(color: accent, fontWeight: FontWeight.w900, fontSize: 13)),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            v.reason,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: t.textSecondary, fontSize: 12, fontWeight: FontWeight.w700),
                          ),
                        ),
                      ],
                    ),
                    if (invalid.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(
                        '무효조건: ${invalid.join(' · ')}',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: t.muted, fontSize: 12, height: 1.2, fontWeight: FontWeight.w700),
                      ),
                    ],
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        _chip('?�재가', s.livePrice > 0 ? s.livePrice.toStringAsFixed(0) : '0', t),
                        const SizedBox(width: 8),
                        _chip('?�률', '${s.signalProb}%', t),
                        const SizedBox(width: 8),
                        _chip('근거', '${s.evidenceHit}/${s.evidenceTotal}', t),
                        const SizedBox(width: 8),
                        Expanded(child: _chip('구조', s.structureType, t, full: true)),
                      ],
                    ),
                  ],
                ),
              ),
            ),

            // 중앙: 차트
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.black,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: t.border.withOpacity(0.55)),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(18),
                    child: MiniChartV4(
                      candles: s.candles,
                      fvgZones: s.fvgZones,
                      title: '${widget.symbol} · ${widget.tfLabel}',
                      price: s.candles.isNotEmpty ? s.candles.last.close : s.livePrice,
                      s1: s1,
                      r1: r1,
                      reactLow: s.reactLow,
                      reactHigh: s.reactHigh,
                      obZones: s.obZones,
                      bprZones: s.bprZones,
                      mbZones: s.mbZones,
                      structureTag: s.structureTag,
                      showBOS: s.showBos,
                      showCHoCH: s.showChoch,
                    ),
                  ),
                ),
              ),
            ),

            const SizedBox(height: 10),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
              child: Column(
                children: [
                  AiWaveSummaryCardV59(
                    headline: '?�전 AI ?�자??· ?�동(메인) ${v.title}',
                    longPct: (s.signalDir == 'LONG' ? s.signalProb : (100 - s.signalProb) ~/ 2).clamp(0, 100),
                    shortPct: (s.signalDir == 'SHORT' ? s.signalProb : (100 - s.signalProb) ~/ 2).clamp(0, 100),
                    noTradePct: (s.noTrade ? 80 : (100 - s.signalProb)).clamp(0, 100),
                    confidence: s.signalProb.clamp(0, 100),
                    risk: (100 - s.zoneValidInt).clamp(0, 100),
                    evidenceHit: s.evidenceHit,
                    evidenceTotal: s.evidenceTotal,
                    reasons: [
                      if (s.zoneValidInt >= 60) '구간 ?�효(${s.zoneValidInt})',
                      if (s.hasStructure) '구조 ?�음(${s.structureType})',
                      if (s.tfAgree) 'TF ?�의',
                      if (s.noTrade) 'NO-TRADE 조건',
                    ],
                  ),
                  const SizedBox(height: 10),
                  AiWaveSummaryCardV59(
                    headline: '?�전 AI ?�자??· ?�동(?��? 구조 ${s.structureScore}',
                    longPct: (s.structureScore + (s.signalDir == 'LONG' ? 10 : 0)).clamp(0, 100),
                    shortPct: (s.structureScore + (s.signalDir == 'SHORT' ? 10 : 0)).clamp(0, 100),
                    noTradePct: (s.noTrade ? 85 : (100 - s.structureScore)).clamp(0, 100),
                    confidence: ((s.signalProb + s.structureScore) ~/ 2).clamp(0, 100),
                    risk: (100 - ((s.zoneValidInt + s.structureScore) ~/ 2)).clamp(0, 100),
                    evidenceHit: s.evidenceHit,
                    evidenceTotal: s.evidenceTotal,
                    reasons: [
                      if (s.flags['hasFvg'] == true) 'FVG',
                      if (s.flags['hasOb'] == true) 'OB',
                      if (s.flags['hasBpr'] == true) 'BPR',
                      if (s.flags['hasChoch'] == true) 'CHOCH',
                      if (s.flags['hasBos'] == true) 'BOS',
                    ],
                  ),
                ],
              ),
            ),


            // ?�단: SR/?��????�약
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: t.card,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: t.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(child: _line('지지', s1 > 0 ? '${s1.toStringAsFixed(0)} ($sProb%)' : '-', t)),
                        const SizedBox(width: 10),
                        Expanded(child: _line('?�??, r1 > 0 ? '${r1.toStringAsFixed(0)} ($rProb%)' : '-', t)),
                      ],
                    ),
                    const SizedBox(height: 8),
                    _line('?�절', s.stop > 0 ? s.stop.toStringAsFixed(0) : '-', t),
                    _line('목표', s.target > 0 ? s.target.toStringAsFixed(0) : '-', t),
                    _line('RR', s.rr > 0 ? s.rr.toStringAsFixed(2) : '-', t),
                    const SizedBox(height: 8),
                    Text(
                      '체결·?�동?? ?��? 매수 ${s.obImbalance}% / 체결 매수 ${s.tapeBuyPct}% · ?�들�?${s.sweepRisk}/100',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: t.muted, fontSize: 12, height: 1.2, fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  static Widget _chip(String k, String v, NeonTheme t, {bool full = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: t.card.withOpacity(0.55),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: t.border.withOpacity(0.75)),
      ),
      child: Row(
        mainAxisSize: full ? MainAxisSize.max : MainAxisSize.min,
        children: [
          Text(k, style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w800)),
          const SizedBox(width: 8),
          Flexible(child: Text(v, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: t.fg, fontSize: 12, fontWeight: FontWeight.w900))),
        ],
      ),
    );
  }

  static Widget _line(String k, String v, NeonTheme t) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          SizedBox(width: 54, child: Text(k, style: TextStyle(color: t.muted, fontSize: 12, fontWeight: FontWeight.w800))),
          Expanded(child: Text(v, style: TextStyle(color: t.fg, fontSize: 12, fontWeight: FontWeight.w900))),
        ],
      ),
    );
  }
}

/// NOTE
/// 기존 구현?� Stateless + FuState ?�냅?�만 받아???�더링했?�니??
/// ???�체?�면???�어?�면 ?�의 ?�토리프?�시가 계속 ?�아?? ???�면?� ?�태�?갱신?��? ?�아
///   "캔들??멈춘 것처?? 보이???�상??발생?�니??
///
/// ?�결:
/// - ?�체?�면 ?�체가 FuEngine???�용??주기?�으�??�태�?갱신(가벼운 ?�링)
/// - dispose?�서 ?�?�머 ?�리
class LiveBriefingFullScreenPage extends StatefulWidget {
  final String symbol;
  final String tfLabel;
  final FuState initial;
  final bool allowNetwork;

  const LiveBriefingFullScreenPage({
    super.key,
    required this.symbol,
    required this.tfLabel,
    required this.initial,
    this.allowNetwork = true,
  });

  @override
  State<LiveBriefingFullScreenPage> createState() => _LiveBriefingFullScreenPageState();
}

class _LiveBriefingFullScreenPageState extends State<LiveBriefingFullScreenPage> {
  final _engine = FuEngine();
  FuState _s = FuState.initial();
  Timer? _tm;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _s = widget.initial;
    // 즉시 1??갱신 ??주기 ?�링
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _tick();
      _tm = Timer.periodic(const Duration(seconds: 10), (_) => _tick());
    });
  }

  Future<void> _tick() async {
    if (!mounted || _loading) return;
    _loading = true;
    try {
      final st = await _engine.fetch(
        symbol: widget.symbol,
        tf: widget.tfLabel,
        allowNetwork: widget.allowNetwork,
        safeMode: true,
      );

      // ?�면?�서 "존이 비었?��? ?�라지?? ?�상 방�?: 비면 기존 ?��?
      final prev = _s;
      final st2 = st.copyWith(
        fvgZones: st.fvgZones.isNotEmpty ? st.fvgZones : prev.fvgZones,
        obZones: st.obZones.isNotEmpty ? st.obZones : prev.obZones,
        bprZones: st.bprZones.isNotEmpty ? st.bprZones : prev.bprZones,
        mbZones: st.mbZones.isNotEmpty ? st.mbZones : prev.mbZones,
        structureTag: (st.structureTag.isNotEmpty && st.structureTag != 'NONE') ? st.structureTag : prev.structureTag,
        breakLevel: st.breakLevel > 0 ? st.breakLevel : prev.breakLevel,
        reactLevel: st.reactLevel > 0 ? st.reactLevel : prev.reactLevel,
        reactLow: st.reactLow > 0 ? st.reactLow : prev.reactLow,
        reactHigh: st.reactHigh > 0 ? st.reactHigh : prev.reactHigh,
      );

      if (mounted) {
        setState(() => _s = st2);
      }
    } catch (_) {
      // keep last
    } finally {
      _loading = false;
    }
  }

  @override
  void dispose() {
    _tm?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // 기존 BriefingFullScreenPage ?�이?�웃???�사?�하�??�해 ?�일??build 로직???�라??처리
    final t = NeonTheme.of(context);
    final s = _s;
    final TradeVerdict v = const DecisionEngineV1().verdict(s);

    final invalid = <String>[];
    if (s.zoneValidInt < 60) invalid.add('구간 ?�함(${s.zoneValidInt})');
    if (!s.hasStructure) invalid.add('구조 ?�음');
    if (!s.tfAgree) invalid.add('TF ?�의 부�?);
    if (s.noTrade) invalid.add('NO-TRADE');

    final sr = s.sr;
    final double s1 = (sr['s1'] is num) ? (sr['s1'] as num).toDouble() : 0;
    final double r1 = (sr['r1'] is num) ? (sr['r1'] as num).toDouble() : 0;
    final int sProb = (sr['sProb'] is num) ? (sr['sProb'] as num).toInt() : 0;
    final int rProb = (sr['rProb'] is num) ? (sr['rProb'] as num).toInt() : 0;

    final Color accent = switch (v.action) {
      TradeAction.LONG => const Color(0xFF33D18C),
      TradeAction.SHORT => const Color(0xFFFF5B5B),
      TradeAction.NO_TRADE => const Color(0xFFFF7E7E),
      _ => const Color(0xFFA8B4D6),
    };

    return Scaffold(
      backgroundColor: t.bg,
      appBar: AppBar(
        backgroundColor: t.bg,
        foregroundColor: t.fg,
        elevation: 0,
        title: Text('${widget.symbol} · ${widget.tfLabel}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900)),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 10),
            child: Center(
              child: Text(
                _loading ? 'SYNC?? : 'LIVE',
                style: TextStyle(color: _loading ? t.muted : t.good, fontSize: 11, fontWeight: FontWeight.w900),
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: t.card,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: t.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(999),
                            color: accent.withOpacity(0.14),
                            border: Border.all(color: accent.withOpacity(0.55)),
                          ),
                          child: Text(v.title, style: TextStyle(color: accent, fontWeight: FontWeight.w900, fontSize: 13)),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            v.reason,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: t.textSecondary, fontSize: 12, fontWeight: FontWeight.w700),
                          ),
                        ),
                      ],
                    ),
                    if (invalid.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(
                        '무효조건: ${invalid.join(' · ')}',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: t.muted, fontSize: 12, height: 1.2, fontWeight: FontWeight.w700),
                      ),
                    ],
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        _chip('?�재가', s.livePrice > 0 ? s.livePrice.toStringAsFixed(0) : (s.price > 0 ? s.price.toStringAsFixed(0) : '0'), t),
                        const SizedBox(width: 8),
                        _chip('?�률', '${s.signalProb}%', t),
                        const SizedBox(width: 8),
                        _chip('근거', '${s.evidenceHit}/${s.evidenceTotal}', t),
                        const SizedBox(width: 8),
                        Expanded(child: _chip('구조', s.structureType, t, full: true)),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.black,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: t.border.withOpacity(0.55)),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(18),
                    child: RepaintBoundary(
                      child: MiniChartV4(
                        candles: s.candles,
                        fvgZones: s.fvgZones,
                        title: '${widget.symbol} · ${widget.tfLabel}',
                        price: s.candles.isNotEmpty ? s.candles.last.close : (s.livePrice > 0 ? s.livePrice : s.price),
                        s1: s1,
                        r1: r1,
                        reactLow: s.reactLow,
                        reactHigh: s.reactHigh,
                        obZones: s.obZones,
                        bprZones: s.bprZones,
                        mbZones: s.mbZones,
                        structureTag: s.structureTag,
                        showBOS: s.showBos,
                        showCHoCH: s.showChoch,
                      ),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
              child: Column(
                children: [
                  AiWaveSummaryCardV59(
                    headline: '?�전 AI ?�자??· ?�동(메인) ${v.title}',
                    longPct: (s.signalDir == 'LONG' ? s.signalProb : (100 - s.signalProb) ~/ 2).clamp(0, 100),
                    shortPct: (s.signalDir == 'SHORT' ? s.signalProb : (100 - s.signalProb) ~/ 2).clamp(0, 100),
                    noTradePct: (s.noTrade ? 80 : (100 - s.signalProb)).clamp(0, 100),
                    confidence: s.signalProb.clamp(0, 100),
                    risk: (100 - s.zoneValidInt).clamp(0, 100),
                    evidenceHit: s.evidenceHit,
                    evidenceTotal: s.evidenceTotal,
                    reasons: [
                      if (s.zoneValidInt >= 60) '구간 ?�효(${s.zoneValidInt})',
                      if (s.hasStructure) '구조 ?�음(${s.structureType})',
                      if (s.tfAgree) 'TF ?�의',
                      if (s.noTrade) 'NO-TRADE 조건',
                    ],
                  ),
                  const SizedBox(height: 10),
                  AiWaveSummaryCardV59(
                    headline: '?�전 AI ?�자??· ?�동(?��? 구조 ${s.structureScore}',
                    longPct: (s.structureScore + (s.signalDir == 'LONG' ? 10 : 0)).clamp(0, 100),
                    shortPct: (s.structureScore + (s.signalDir == 'SHORT' ? 10 : 0)).clamp(0, 100),
                    noTradePct: (s.noTrade ? 85 : (100 - s.structureScore)).clamp(0, 100),
                    confidence: ((s.signalProb + s.structureScore) ~/ 2).clamp(0, 100),
                    risk: (100 - ((s.zoneValidInt + s.structureScore) ~/ 2)).clamp(0, 100),
                    evidenceHit: s.evidenceHit,
                    evidenceTotal: s.evidenceTotal,
                    reasons: [
                      if (s.flags['hasFvg'] == true) 'FVG',
                      if (s.flags['hasOb'] == true) 'OB',
                      if (s.flags['hasBpr'] == true) 'BPR',
                      if (s.flags['hasChoch'] == true) 'CHOCH',
                      if (s.flags['hasBos'] == true) 'BOS',
                    ],
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: t.card,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: t.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(child: _line('지지', s1 > 0 ? '${s1.toStringAsFixed(0)} ($sProb%)' : '-', t)),
                        const SizedBox(width: 10),
                        Expanded(child: _line('?�??, r1 > 0 ? '${r1.toStringAsFixed(0)} ($rProb%)' : '-', t)),
                      ],
                    ),
                    const SizedBox(height: 8),
                    _line('?�절', s.stop > 0 ? s.stop.toStringAsFixed(0) : '-', t),
                    _line('목표', s.target > 0 ? s.target.toStringAsFixed(0) : '-', t),
                    _line('RR', s.rr > 0 ? s.rr.toStringAsFixed(2) : '-', t),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
