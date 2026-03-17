import 'dart:async';

import 'package:flutter/material.dart';

import 'ai_decision_line.dart';
import 'ai_gauges.dart';
import 'ai_reasons_panel.dart';
import 'ai_risk_badges.dart';
import 'ai_orderbook_detail.dart';
import 'ai_comment_line.dart';
import '../../core/services/ai_decision_service.dart';
import '../../core/services/bitget_orderflow_service.dart';
import '../../core/services/ai_risk_break_service.dart';
import '../../core/services/ai_action_service.dart';
import '../../core/services/ai_mode_service.dart';

import 'ai_action_card.dart';

class AiCardsPanel extends StatefulWidget {
  final ValueNotifier<Object?> dtoVN;
  final String? tfLabel;

  const AiCardsPanel({
    super.key,
    required this.dtoVN,
    this.tfLabel,
  });

  @override
  State<AiCardsPanel> createState() => _AiCardsPanelState();
}

class _AiCardsPanelState extends State<AiCardsPanel> {

  AiMode _mode = AiMode.auto;

  Widget _modeSelector() {
    Widget chip(AiMode m) {
      final sel = _mode == m;
      return ChoiceChip(
        label: Text(AiModeService.label(m), style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900)),
        selected: sel,
        onSelected: (_) => setState(() => _mode = m),
        visualDensity: VisualDensity.compact,
      );
    }

    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        chip(AiMode.a),
        chip(AiMode.b),
        chip(AiMode.c),
        chip(AiMode.auto),
      ],
    );
  }

  String _buildOneLine(Map<String, dynamic> dto) {
    // 안전한 1줄 요약 (서비스/모델 변경에 영향 덜 받게)
    final String decision = (dto['decisionText'] ?? dto['decision'] ?? '판단 없음').toString();
    final num conf = (dto['confidencePct'] ?? dto['confidence'] ?? 0) is num
        ? (dto['confidencePct'] ?? dto['confidence'] ?? 0) as num
        : num.tryParse((dto['confidencePct'] ?? dto['confidence'] ?? '0').toString()) ?? 0;
    final num risk = (dto['riskPct'] ?? dto['risk'] ?? 0) is num
        ? (dto['riskPct'] ?? dto['risk'] ?? 0) as num
        : num.tryParse((dto['riskPct'] ?? dto['risk'] ?? '0').toString()) ?? 0;

    final num struct = (dto['structureScore'] ?? dto['structure'] ?? 0) is num
        ? (dto['structureScore'] ?? dto['structure'] ?? 0) as num
        : num.tryParse((dto['structureScore'] ?? dto['structure'] ?? '0').toString()) ?? 0;

    final num pat = (dto['patternSim'] ?? dto['pattern'] ?? 0) is num
        ? (dto['patternSim'] ?? dto['pattern'] ?? 0) as num
        : num.tryParse((dto['patternSim'] ?? dto['pattern'] ?? '0').toString()) ?? 0;

    final String flow = (dto['orderFlowSummary'] ?? dto['orderflow'] ?? '').toString();
    final String liq = (dto['liquiditySummary'] ?? dto['liquidity'] ?? '').toString();

    final parts = <String>[
      'AI: $decision',
      '확신 ${conf.toStringAsFixed(0)}%',
      '리스크 ${risk.toStringAsFixed(0)}%',
      '구조 ${struct.toStringAsFixed(0)}%',
      '패턴 ${pat.toStringAsFixed(0)}%',
    ];
    if (flow.isNotEmpty) parts.add(flow);
    if (liq.isNotEmpty) parts.add(liq);
    return parts.join(' · ');
  }

  int _step = 0;
  bool _openStats = false;
  bool _openHist = true;
  bool _openOrderbook = true;
  bool _openComment = false;
  bool _openActions = false;

  final List<Map<String, Object>> _hist = [];
  String _lastDecision = '';
  int _lastConf = -1;

  String _lastComment = '';
  List<String> _lastTriggers = const [];

  Timer? _orderflowTimer;

  @override
  void initState() {
    super.initState();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      Future.doWhile(() async {
        if (!mounted) return false;
        setState(() => _step = (_step + 1) % 16);
        await Future.delayed(const Duration(milliseconds: 450));
        return mounted;
      });
    });

    widget.dtoVN.addListener(_onDtoChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) => _onDtoChanged());

    _orderflowTimer =
        Timer.periodic(const Duration(seconds: 2), (_) => _injectOrderflow());
    WidgetsBinding.instance.addPostFrameCallback((_) => _injectOrderflow());
  }

  @override
  void dispose() {
    widget.dtoVN.removeListener(_onDtoChanged);
    _orderflowTimer?.cancel();
    super.dispose();
  }

  Future<void> _injectOrderflow() async {
    final v = widget.dtoVN.value;
    if (v is! Map<String, dynamic>) return;

    try {
      await BitgetOrderflowService.injectToDto(v);
      AiRiskBreakService.inject(v);
      widget.dtoVN.value = Map<String, dynamic>.from(v);
    } catch (_) {}
  }

  static dynamic _pick(Object? dto, String key) {
    if (dto == null) return null;
    if (dto is Map) return dto[key];
    try {
      final d = dto as dynamic;
      return d[key];
    } catch (_) {}
    try {
      final d = dto as dynamic;
      return d.toJson()[key];
    } catch (_) {}
    return null;
  }

  static int _asInt(dynamic v, int fb) {
    if (v == null) return fb;
    if (v is int) return v;
    if (v is num) return v.round();
    if (v is String) return int.tryParse(v) ?? fb;
    return fb;
  }

  static double _asDouble(dynamic v, double fb) {
    if (v == null) return fb;
    if (v is double) return v;
    if (v is int) return v.toDouble();
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v) ?? fb;
    return fb;
  }

  static Map<String, dynamic> _asMap(Object? dto) {
    if (dto is Map<String, dynamic>) return dto;
    if (dto is Map) return Map<String, dynamic>.from(dto);
    return <String, dynamic>{};
  }

  void _onDtoChanged() {
    final dto = widget.dtoVN.value;
    final dtoMap = _asMap(dto);
    final auto = AiDecisionService.build(dto);
    final d = (auto['decisionLabel'] as String?) ?? '관망';
    final c = (auto['confidence'] as int?) ?? 0;

    // Step11/12: 코멘트 + 액션 트리거 (UI 주입용)
    _lastComment = _buildOneLine({
      ...dtoMap,
      'decisionText': d,
      'confidencePct': c,
      'riskPct': (auto['risk'] as int?) ?? _asInt(dtoMap['riskPct'], 0),
      'mode': _mode.name,
    });
    _lastTriggers = AiActionService.buildTriggers({
      ...dtoMap,
      'decisionText': d,
      'confidencePct': c,
      'riskPct': (auto['risk'] as int?) ?? _asInt(dtoMap['riskPct'], 0),
      'mode': _mode.name,
    });

    final changed = (d != _lastDecision) || (c != _lastConf);
    if (!changed) return;

    _lastDecision = d;
    _lastConf = c;

    final now = DateTime.now();
    final ts =
        '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}:${now.second.toString().padLeft(2, '0')}';

    _hist.insert(0, {'ts': ts, 'd': d, 'c': c});
    if (_hist.length > 12) _hist.removeRange(12, _hist.length);

    if (mounted) setState(() {});
  }

  String _summaryLine(int conf) {
    final c = conf.clamp(0, 100);
    final samples = (c * 3).clamp(30, 300);
    final win = (c / 100.0 * 0.9 + 0.05).clamp(0.45, 0.85);
    return 'AI 검증: 과거 유사 ${samples.round()}회 · 승률 ${(win * 100).round()}%';
  }

  int _lvl(int idx) {
    final t = (_step - idx * 4);
    if (t <= 0) return 1;
    if (t == 1) return 2;
    if (t == 2) return 3;
    if (t == 3) return 4;
    return 5;
  }

  Widget _bars(String name, int lv) {
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

  Widget _card({required String title, required Widget child}) {
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
          Text(title,
              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
          const SizedBox(height: 6),
          child,
        ],
      ),
    );
  }

  Widget _histBadge(String decision) {
    Color c;
    if (decision.contains('매수')) {
      c = const Color(0xFF1EEA6A);
    } else if (decision.contains('매도')) {
      c = const Color(0xFFEA2A2A);
    } else {
      c = const Color(0xFF4DA3FF);
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        color: c.withOpacity(0.15),
        border: Border.all(color: c.withOpacity(0.4)),
      ),
      child: Text(decision,
          style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: c)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final tf =
        (widget.tfLabel == null || widget.tfLabel!.isEmpty) ? '현재 TF' : widget.tfLabel!;

    return ValueListenableBuilder<Object?>(
      valueListenable: widget.dtoVN,
      builder: (context, dto, _) {
        final auto = AiDecisionService.build(dto);

        final conf =
            (auto['confidence'] as int?) ?? _asInt(_pick(dto, 'confidence'), 58);
        final decision = (auto['decisionLabel'] as String?) ?? '관망';
        final reason = (auto['reason'] as String?) ?? '구조 미확정 · 체결 우위 없음';
        final lp = (auto['longP'] as int?) ?? 40;
        final sp = (auto['shortP'] as int?) ?? 35;
        final np = (auto['neutralP'] as int?) ?? 25;

        int supportP = _asInt(_pick(dto, 'supportP'), 55);
        int breakoutP = _asInt(_pick(dto, 'breakoutP'), 50);
        int huntP = _asInt(_pick(dto, 'stopHuntRiskP'), 30);
        final badge = (_pick(dto, 'riskBadgeKR') as String?) ?? '평시';

        // STEP9: 오더북 상세
        final bias = (_pick(dto, 'orderbookBias') as String?) ?? '중립';
        final liq = (_pick(dto, 'liquidityRisk') as String?) ?? '보통';
        final spreadBp = _asInt(_pick(dto, 'spreadBp'), 0);
        final imb = _asInt(_pick(dto, 'orderbookImbalance'), 0);
        final bidVol = _asDouble(_pick(dto, 'orderbookBidVol'), 0);
        final askVol = _asDouble(_pick(dto, 'orderbookAskVol'), 0);
        final fillsBuyP = _asInt(_pick(dto, 'fillsBuyP'), -1);
        final fillsSellP = _asInt(_pick(dto, 'fillsSellP'), -1);

        final summary = _summaryLine(conf);

        return SingleChildScrollView(
          physics: const BouncingScrollPhysics(),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
            AiDecisionLine(decision: decision, reason: reason),
            const SizedBox(height: 8),

            // 모드 선택: A 보수 / B 균형 / C 공격 / 자동
            _modeSelector(),
            const SizedBox(height: 8),

            AiGauges(confidence: conf, longP: lp, shortP: sp, neutralP: np),
            const SizedBox(height: 8),

            AiRiskBadges(
              supportP: supportP,
              breakoutP: breakoutP,
              stopHuntP: huntP,
              badge: badge,
            ),
            const SizedBox(height: 8),

            GestureDetector(
              onTap: () => setState(() => _openOrderbook = !_openOrderbook),
              child: Row(
                children: [
                  const Text('오더북 상세', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900)),
                  const Spacer(),
                  Text(_openOrderbook ? '닫기' : '보기', style: const TextStyle(fontSize: 10)),
                ],
              ),
            ),
            const SizedBox(height: 6),
            if (_openOrderbook) ...[
              AiOrderbookDetail(
                bias: bias,
                liq: liq,
                spreadBp: spreadBp,
                imbalanceP: imb,
                bidVol: bidVol,
                askVol: askVol,
                fillsBuyP: fillsBuyP,
                fillsSellP: fillsSellP,
              ),
              const SizedBox(height: 8),
            ],

            AiReasonsPanel(dto: dto),
            const SizedBox(height: 8),

            _card(
              title: 'AI 분석 흐름 · $tf',
              child: Column(
                children: [
                  _bars('구조 인식', _lvl(0)),
                  const SizedBox(height: 4),
                  _bars('오더북 해석', _lvl(1)),
                  const SizedBox(height: 4),
                  _bars('패턴 유사도', _lvl(2)),
                  const SizedBox(height: 4),
                  _bars('결론 생성', _lvl(3)),
                ],
              ),
            ),
            const SizedBox(height: 8),

            _card(
              title: 'AI 과거 통계',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  GestureDetector(
                    onTap: () => setState(() => _openStats = !_openStats),
                    child: Row(
                      children: [
                        Text(summary, style: const TextStyle(fontSize: 10)),
                        const Spacer(),
                        Text(_openStats ? '닫기' : '보기',
                            style: const TextStyle(fontSize: 10)),
                      ],
                    ),
                  ),
                  if (_openStats) ...[
                    const SizedBox(height: 6),
                    const Text('구조/오더북/유동성/패턴 기반 요약',
                        style: TextStyle(fontSize: 10)),
                    const SizedBox(height: 2),
                    Text('결론: $decision · 확신 ${conf.clamp(0, 100)}%',
                        style: const TextStyle(
                            fontSize: 10, fontWeight: FontWeight.w800)),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 8),

            // Step11: AI 코멘트 (스크롤/접기)
            _card(
              title: 'AI 코멘트',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  GestureDetector(
                    onTap: () => setState(() => _openComment = !_openComment),
                    child: Row(
                      children: [
                        Text(
                          _lastComment.isEmpty ? '코멘트 없음' : _lastComment,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 10),
                        ),
                        const Spacer(),
                        Text(_openComment ? '닫기' : '보기',
                            style: const TextStyle(fontSize: 10)),
                      ],
                    ),
                  ),
                  if (_openComment) ...[
                    const SizedBox(height: 6),
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxHeight: 90),
                      child: SingleChildScrollView(
                        child: AiCommentLine(text: _lastComment),
                      ),
                    ),
                  ]
                ],
              ),
            ),
            const SizedBox(height: 8),

            // Step12: 자동 액션 트리거 (진입/관망/주의 등)
            AiActionCard(
              triggers: _lastTriggers,
              expanded: _openActions,
              onToggle: () => setState(() => _openActions = !_openActions),
            ),
            const SizedBox(height: 8),

            _card(
              title: '판단 변화 히스토리',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  GestureDetector(
                    onTap: () => setState(() => _openHist = !_openHist),
                    child: Row(
                      children: [
                        const Text('변화 감지 자동 기록', style: TextStyle(fontSize: 10)),
                        const Spacer(),
                        Text(_openHist ? '닫기' : '보기',
                            style: const TextStyle(fontSize: 10)),
                      ],
                    ),
                  ),
                  if (_openHist) ...[
                    const SizedBox(height: 8),
                    if (_hist.isEmpty)
                      const Text('기록 없음', style: TextStyle(fontSize: 10)),
                    ..._hist.take(8).map((e) {
                      final ts = e['ts'] as String? ?? '';
                      final d = e['d'] as String? ?? '';
                      final c = e['c'] as int? ?? 0;
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          children: [
                            Text(ts, style: const TextStyle(fontSize: 10)),
                            const SizedBox(width: 8),
                            _histBadge(d),
                            const SizedBox(width: 8),
                            Text('확신 $c%',
                                style: const TextStyle(
                                    fontSize: 10, fontWeight: FontWeight.w900)),
                          ],
                        ),
                      );
                    }),
                  ]
                ],
              ),
            ),
            ],
          ),
        );
      },
    );
  }
}
