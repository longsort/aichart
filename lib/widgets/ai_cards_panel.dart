import 'package:flutter/material.dart';

import '../ui/widgets/ai_decision_line.dart';
import 'ai_gauges.dart';

/// ?∞Ï∏° ?®ÎÑê ?ÅÎã® Í≥†Ï†ï AI Ïπ¥Îìú(?êÎ¶Ñ/?µÍ≥Ñ/?àÏä§?†Î¶¨/?îÏïΩ)
/// - DTO ?Ä?ÖÏóê ÏßÅÏ†ë ?òÏ°¥?òÏ? ?äÏùå (Object/Map/dynamic Î™®Îëê ?àÏ†Ñ Ï≤òÎ¶¨)
class AiCardsPanel extends StatefulWidget {
  final ValueNotifier<Object?> dtoVN;
  final String tfLabel;

  const AiCardsPanel({
    super.key,
    required this.dtoVN,
    required this.tfLabel,
  });

  @override
  State<AiCardsPanel> createState() => _AiCardsPanelState();
}

class _AiCardsPanelState extends State<AiCardsPanel> {
  int _step = 0;
  bool _openStats = false;
  bool _openHist = false;
  final List<Map<String, Object>> _hist = [];

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
  }

  int _i(dynamic v, int fb) {
    if (v == null) return fb;
    if (v is int) return v;
    if (v is num) return v.round();
    if (v is String) {
      final n = int.tryParse(v);
      if (n != null) return n;
    }
    return fb;
  }

  String _s(dynamic v, String fb) => (v is String && v.isNotEmpty) ? v : fb;

  dynamic _field(dynamic dto, String name) {
    if (dto == null) return null;
    if (dto is Map) return dto[name];
    try {
      return (dto as dynamic).__getattr__(name);
    } catch (_) {}
    try {
      return (dto as dynamic)[name];
    } catch (_) {}
    try {
      return (dto as dynamic).toJson()[name];
    } catch (_) {}
    try {
      return (dto as dynamic).runtimeType.toString();
    } catch (_) {}
    // ÎßàÏ?Îß??òÎã®: dynamic property access
    try {
      return (dto as dynamic).${''}; // noop
    } catch (_) {}
    try {
      return (dto as dynamic).confidence;
    } catch (_) {}
    return null;
  }

  /// ?∞ÏÑ†?úÏúÑ: Map/field -> Í∏∞Î≥∏Í∞?  int _conf(dynamic dto) => _i(_field(dto, 'confidence') ?? _field(dto, 'conf'), 58);
  String _decision(dynamic dto) =>
      _s(_field(dto, 'decisionLabel') ?? _field(dto, 'decision'), 'Í¥ÄÎß?);
  String _reason(dynamic dto) =>
      _s(_field(dto, 'reason') ?? _field(dto, 'summary'), 'Íµ¨Ï°∞ ÎØ∏Ìôï??¬∑ Ï≤¥Í≤∞ ?∞ÏúÑ ?ÜÏùå');

  int _longP(dynamic dto) => _i(_field(dto, 'longP') ?? _field(dto, 'long'), 40);
  int _shortP(dynamic dto) => _i(_field(dto, 'shortP') ?? _field(dto, 'short'), 35);
  int _neutralP(dynamic dto) => _i(_field(dto, 'neutralP') ?? _field(dto, 'neutral'), 25);

  String _summaryLine(int conf) {
    final c = conf.clamp(0, 100);
    final samples = (c * 3).clamp(30, 300);
    final win = (c / 100.0 * 0.9 + 0.05).clamp(0.45, 0.85);
    return 'AI Í≤ÄÏ¶? Í≥ºÍ±∞ ?†ÏÇ¨ ${samples.round()}??¬∑ ?πÎ•† ${(win * 100).round()}%';
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

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<Object?>(
      valueListenable: widget.dtoVN,
      builder: (context, dto, _) {
        final conf = _conf(dto);
        final decision = _decision(dto);
        final reason = _reason(dto);
        final lp = _longP(dto);
        final sp = _shortP(dto);
        final np = _neutralP(dto);

        final summary = _summaryLine(conf);

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // STEP 1: ?êÎã® 1Ï§?            AiDecisionLine(decision: decision, reason: reason),
            const SizedBox(height: 8),

            // STEP 2: Í≤åÏù¥ÏßÄ
            AiGauges(confidence: conf, longP: lp, shortP: sp, neutralP: np),
            const SizedBox(height: 8),

            _card(
              title: 'AI Î∂ÑÏÑù ?êÎ¶Ñ ¬∑ ${widget.tfLabel}',
              child: Column(
                children: [
                  _bars('Íµ¨Ï°∞ ?∏Ïãù', _lvl(0)),
                  const SizedBox(height: 4),
                  _bars('?§ÎçîÎ∂??¥ÏÑù', _lvl(1)),
                  const SizedBox(height: 4),
                  _bars('?®ÌÑ¥ ?†ÏÇ¨??, _lvl(2)),
                  const SizedBox(height: 4),
                  _bars('Í≤∞Î°† ?ùÏÑ±', _lvl(3)),
                ],
              ),
            ),
            const SizedBox(height: 8),

            _card(
              title: 'AI Í≥ºÍ±∞ ?µÍ≥Ñ',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  GestureDetector(
                    onTap: () => setState(() => _openStats = !_openStats),
                    child: Row(
                      children: [
                        Text(summary, style: const TextStyle(fontSize: 10)),
                        const Spacer(),
                        Text(_openStats ? '?´Í∏∞' : 'Î≥¥Í∏∞',
                            style: const TextStyle(fontSize: 10)),
                      ],
                    ),
                  ),
                  if (_openStats) ...[
                    const SizedBox(height: 6),
                    const Text('Íµ¨Ï°∞/?§ÎçîÎ∂??†Îèô???®ÌÑ¥ Í∏∞Î∞ò ?îÏïΩ',
                        style: TextStyle(fontSize: 10)),
                    const SizedBox(height: 2),
                    Text('Í≤∞Î°†: $decision ¬∑ ?ïÏã† ${conf.clamp(0, 100)}%',
                        style: const TextStyle(
                            fontSize: 10, fontWeight: FontWeight.w800)),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 8),

            _card(
              title: '?úÎÇòÎ¶¨Ïò§ ?àÏä§?†Î¶¨',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  GestureDetector(
                    onTap: () => setState(() => _openHist = !_openHist),
                    child: Row(
                      children: [
                        const Text('ÏµúÍ∑º ?êÎã® Í∏∞Î°ù', style: TextStyle(fontSize: 10)),
                        const Spacer(),
                        Text(_openHist ? '?´Í∏∞' : 'Î≥¥Í∏∞',
                            style: const TextStyle(fontSize: 10)),
                      ],
                    ),
                  ),
                  if (_openHist) ...[
                    const SizedBox(height: 6),
                    if (_hist.isEmpty)
                      const Text('Í∏∞Î°ù ?ÜÏùå', style: TextStyle(fontSize: 10)),
                    ..._hist.take(6).map((e) {
                      final ts = e['ts'] as String? ?? '';
                      final d = e['d'] as String? ?? '';
                      final c = e['c'] as int? ?? 0;
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          children: [
                            Text(ts, style: const TextStyle(fontSize: 10)),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text('$d ¬∑ ?ïÏã† $c%',
                                  style: const TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w800)),
                            ),
                          ],
                        ),
                      );
                    }),
                  ]
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}
