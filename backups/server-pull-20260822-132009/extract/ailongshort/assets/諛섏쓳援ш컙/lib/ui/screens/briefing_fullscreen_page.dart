import 'package:flutter/material.dart';

import '../../core/app_settings.dart';
import '../../core/engines/decision_engine_v1.dart';
import '../../core/models/fu_state.dart';
import '../../core/models/trade_verdict.dart';
import '../../core/services/euro_pass_service.dart';
import '../widgets/mini_chart_v4.dart';
import '../widgets/neon_theme.dart';
import '../widgets/ai_wave_summary_card_v59.dart';

/// 전체화면 브리핑(스펙 E)
/// - 상단: 결론/무효조건
/// - 중앙: 차트 + 오버레이(기존 MiniChartV4)
/// - 하단: S/R 확률 + 목표/손절 요약
class BriefingFullScreenPage extends StatelessWidget {
  final String symbol;
  final String tfLabel;
  final FuState s;

  const BriefingFullScreenPage({
    super.key,
    required this.symbol,
    required this.tfLabel,
    required this.s,
  });

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
              '프리미엄 브리핑 (유로 패스)',
              style: TextStyle(color: t.fg, fontSize: 18, fontWeight: FontWeight.w900),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              '전체화면 브리핑은 유로 패스 구독 후 이용할 수 있습니다.',
              style: TextStyle(color: t.textSecondary, fontSize: 13),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: () async {
                await EuroPassService.I.purchaseProduct('euro_pass_monthly');
              },
              icon: const Icon(Icons.shopping_cart_outlined, size: 20),
              label: const Text('테스트 활성화 (스텁)'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);
    return ValueListenableBuilder<bool>(
      valueListenable: AppSettings.I.euroPassActive,
      builder: (context, active, _) {
        if (!EuroPassService.I.hasAccess) {
          return Scaffold(
            backgroundColor: t.bg,
            appBar: AppBar(
              backgroundColor: t.bg,
              foregroundColor: t.fg,
              elevation: 0,
              title: Text('$symbol · $tfLabel', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900)),
            ),
            body: SafeArea(child: _buildEuroPassGate(t)),
          );
        }
        return _buildContent(context, t);
      },
    );
  }

  Widget _buildContent(BuildContext context, NeonTheme t) {
    final TradeVerdict v = const DecisionEngineV1().verdict(s);

    final invalid = <String>[];
    if (s.zoneValidInt < 60) invalid.add('구간 약함(${s.zoneValidInt})');
    if (!s.hasStructure) invalid.add('구조 없음');
    if (!s.tfAgree) invalid.add('TF 합의 부족');
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
        title: Text('$symbol · $tfLabel', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900)),
      ),
      body: SafeArea(
        child: Column(
          children: [
            // 상단: 결론/무효조건
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
                        _chip('현재가', s.livePrice > 0 ? s.livePrice.toStringAsFixed(0) : '0', t),
                        const SizedBox(width: 8),
                        _chip('구간', '${s.zoneName.isNotEmpty ? s.zoneName : '—'}(${s.zoneStrength})', t),
                        const SizedBox(width: 8),
                        _chip('L/S/W', '${s.zoneLongP}/${s.zoneShortP}/${s.zoneWaitP}', t),
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
                      title: '$symbol · $tfLabel',
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
                    headline: '완전 AI 완자동 · 파동(메인) ${v.title}',
                    longPct: s.zoneLongP.clamp(0, 100),
                    shortPct: s.zoneShortP.clamp(0, 100),
                    noTradePct: s.zoneWaitP.clamp(0, 100),
                    confidence: s.signalProb.clamp(0, 100),
                    risk: (100 - s.zoneValidInt).clamp(0, 100),
                    evidenceHit: s.evidenceHit,
                    evidenceTotal: s.evidenceTotal,
                    reasons: [
                      if (s.zoneName.isNotEmpty) '구간: ${s.zoneName}(${s.zoneStrength})',
                      if (s.zoneTrigger.isNotEmpty) '트리거: ${s.zoneTrigger}',
                      ...s.zoneReasons.take(3),
                      if (s.zoneValidInt >= 60) '구간 유효(${s.zoneValidInt})',
                      if (s.hasStructure) '구조 있음(${s.structureType})',
                      if (s.tfAgree) 'TF 합의',
                      if (s.noTrade) 'NO-TRADE 조건',
                    ],
                  ),
                  const SizedBox(height: 10),
                  AiWaveSummaryCardV59(
                    headline: '완전 AI 완자동 · 파동(대체) 구조 ${s.structureScore}',
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


            // 하단: SR/포지션 요약
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
                        Expanded(child: _line('저항', r1 > 0 ? '${r1.toStringAsFixed(0)} ($rProb%)' : '-', t)),
                      ],
                    ),
                    const SizedBox(height: 8),
                    _line('손절', s.stop > 0 ? s.stop.toStringAsFixed(0) : '-', t),
                    _line('목표', s.target > 0 ? s.target.toStringAsFixed(0) : '-', t),
                    _line('RR', s.rr > 0 ? s.rr.toStringAsFixed(2) : '-', t),
                    const SizedBox(height: 8),
                    Text(
                      '체결·유동성: 호가 매수 ${s.obImbalance}% / 체결 매수 ${s.tapeBuyPct}% · 흔들기 ${s.sweepRisk}/100',
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
