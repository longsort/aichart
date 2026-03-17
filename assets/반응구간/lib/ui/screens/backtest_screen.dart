import 'package:flutter/material.dart';
import '../../engine/central/decision_logger.dart';
import '../../core/symbol_controller.dart';
import '../widgets/backtest_gauge.dart';

class BacktestScreen extends StatefulWidget {
  const BacktestScreen({super.key});

  @override
  State<BacktestScreen> createState() => _BacktestScreenState();
}

class _BacktestScreenState extends State<BacktestScreen> {
  int _idx = 0;

  Color _bg(String decision) {
    if (decision.contains('롱')) return const Color(0xFF00FF7A).withOpacity(0.10);
    if (decision.contains('숏')) return const Color(0xFFFF2D55).withOpacity(0.10);
    return Colors.transparent;
  }

  /// 저장된 항목이 최소정보만 있어서, 당시 느낌을 "재현"하기 위한 가벼운 매핑
  /// - decision(롱/숏) + 합의/신뢰 → 게이지/바늘 값 산출
  (double longPct, double shortPct, double needle) _map(DecisionLogEntry e) {
    final dir = e.decision.contains('롱') ? 1.0 : (e.decision.contains('숏') ? -1.0 : 0.0);
    final cons = (e.consensus).clamp(0.0, 1.0);
    final conf = (e.confidence).clamp(0.0, 1.0);

    // 중심 50/50에서 시작, 방향/합의/신뢰로 치우치게
    final bias = (dir * (0.35 + (conf - 0.5) * 0.4 + (cons - 0.5) * 0.3)).clamp(-1.0, 1.0);
    final longPct = (0.5 + bias * 0.35).clamp(0.0, 1.0);
    final shortPct = (1.0 - longPct).clamp(0.0, 1.0);
    return (longPct, shortPct, bias);
  }

  @override
  Widget build(BuildContext context) {
    final sym = SymbolController.I.symbol.value;
    final list = DecisionLogger.I.logs.value.where((e) => e.symbol == sym).toList();

    final total = list.length;
    final cur = total == 0 ? null : list[_idx.clamp(0, total - 1)];

    return Scaffold(
      appBar: AppBar(title: const Text('백테스트(재현)')),
      body: Container(
        decoration: BoxDecoration(
          gradient: RadialGradient(
            center: const Alignment(0.0, -0.85),
            radius: 1.6,
            colors: [
              cur == null ? Colors.transparent : _bg(cur.decision),
              Colors.black,
            ],
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              if (cur == null)
                const Expanded(child: Center(child: Text('기록이 없습니다')))
              else ...[
                // 게이지 재현
                AspectRatio(
                  aspectRatio: 2.2,
                  child: Builder(builder: (_) {
                    final m = _map(cur);
                    return BacktestHalfGauge(
                      longPct: m.$1,
                      shortPct: m.$2,
                      needleBias: m.$3,
                    );
                  }),
                ),
                const SizedBox(height: 12),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: Colors.white.withOpacity(0.10)),
                      color: Colors.white.withOpacity(0.04),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${cur.symbol} • ${cur.decision}',
                            style: TextStyle(
                              fontWeight: FontWeight.w900,
                              fontSize: 18,
                              color: cur.decision.contains('롱')
                                  ? const Color(0xFF00FF7A)
                                  : (cur.decision.contains('숏') ? const Color(0xFFFF2D55) : Colors.white),
                            )),
                        const SizedBox(height: 8),
                        Text('합의 ${(cur.consensus * 100).round()}% / 신뢰 ${(cur.confidence * 100).round()}%',
                            style: TextStyle(color: Colors.white.withOpacity(0.78), fontWeight: FontWeight.w700)),
                        const SizedBox(height: 8),
                        Text('결과: ${cur.result}',
                            style: TextStyle(color: Colors.white.withOpacity(0.78), fontWeight: FontWeight.w800)),
                        const Spacer(),
                        Text('(${_idx + 1} / $total)', style: TextStyle(color: Colors.white.withOpacity(0.55))),
                      ],
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _idx > 0 ? () => setState(() => _idx--) : null,
                      child: const Text('이전', style: TextStyle(fontWeight: FontWeight.w900)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _idx < total - 1 ? () => setState(() => _idx++) : null,
                      child: const Text('다음', style: TextStyle(fontWeight: FontWeight.w900)),
                    ),
                  ),
                ],
              )
            ],
          ),
        ),
      ),
    );
  }
}
