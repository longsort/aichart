import 'package:flutter/material.dart';
import '../../core/timeframe.dart';
import '../../core/result.dart';
import '../../data/repo/market_repo.dart';
import '../../data/exchange/dto/candle_dto.dart';
import '../../engine/models/candle.dart';
import '../../engine/analyzer/engine_runner.dart';
import '../../engine/models/engine_output.dart';
import '../../engine/models/briefing_output.dart';
import '../../engine/models/evidence_matrix.dart';
import '../../engine/briefing/briefing_engine.dart';
import '../../engine/self_tune/self_tune_engine.dart';
import '../chart/chart_view.dart';
import '../widgets/tf_selector.dart';
import '../widgets/symbol_selector.dart';
import '../widgets/briefing_panel.dart';
import '../widgets/evidence_table.dart';
import '../../engine/notify/notify_service.dart';
import 'log_screen.dart';
import 'settings_screen.dart';

/// PHASE A/B: 차트 ?�면 ??UI??Repo�??�출
class ChartScreen extends StatefulWidget {
  final String symbol;
  final Timeframe tf;

  const ChartScreen({super.key, required this.symbol, required this.tf});

  @override
  State<ChartScreen> createState() => _ChartScreenState();
}

class _ChartScreenState extends State<ChartScreen> {
  late String _symbol;
  late Timeframe _tf;
  final MarketRepo _repo = MarketRepo();
  final EngineRunner _engine = EngineRunner();
  final BriefingEngine _briefingEngine = BriefingEngine();
  final SelfTuneEngine _selfTune = SelfTuneEngine();
  bool _loading = false;
  String? _error;
  int _candleCount = 0;
  EngineOutput? _engineOutput;
  BriefingOutput? _briefingOutput;
  List<Candle> _candles = [];
  double _equity = 10000;
  double _lastPrice = 0;
  int _lossStreak = 0;

  static List<Candle> _dtosToCandles(List<CandleDto> list) {
    return list.map((d) => Candle(t: d.t, o: d.o, h: d.h, l: d.l, c: d.c, v: d.v)).toList();
  }

  @override
  void initState() {
    super.initState();
    _symbol = widget.symbol;
    _tf = widget.tf;
    _load();
  }

  Future<void> _load() async {
    setState(() { _error = null; });
    try {
      final list = await _repo.getCandles(_symbol, _tf, 100);
      final candles = _dtosToCandles(list);
      final output = _engine.run(candles, _symbol, _tf.code);
      final lastPrice = (await _repo.getLastPrice(_symbol))?.lastPrice ?? (candles.isNotEmpty ? candles.last.c : 0);
      final lossStreak = await _selfTune.getLossStreak();
      final briefing = _briefingEngine.run(output, lastPrice, equity: _equity, lossStreak: lossStreak);
      setState(() {
        _candleCount = list.length;
        _candles = candles;
        _engineOutput = output;
        _briefingOutput = briefing;
        _lastPrice = lastPrice;
        _lossStreak = lossStreak;
      });
      if (NotifyService().enabled && briefing != null) {
        NotifyService().notifyFromBriefing(briefing);
      }
    } catch (e) {
      setState(() => _error = e.toString());
    }
  }

  Future<void> _sync() async {
    setState(() { _loading = true; _error = null; });
    final r = await _repo.syncCandles(_symbol, _tf, 100);
    if (r is Err<String>) {
      setState(() => _error = (r as Err<String>).message);
    } else {
      await _load();
    }
    setState(() => _loading = false);
  }

  void _onSymbolOrTfChanged() => _load();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('비트코인 분석'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).pop(),
        ),
        actions: [
          IconButton(icon: const Icon(Icons.list), onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LogScreen()))),
          IconButton(icon: const Icon(Icons.settings), onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SettingsScreen()))),
          IconButton(
            icon: _loading ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.refresh),
            onPressed: _loading ? null : _sync,
            tooltip: '?�기??,
          ),
        ],
      ),
      body: Column(
        children: [
          if (_error != null)
            Padding(
              padding: const EdgeInsets.all(8),
              child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                SymbolSelector(value: _symbol, onChanged: (v) => setState(() { _symbol = v ?? _symbol; _onSymbolOrTfChanged(); })),
                const SizedBox(width: 16),
                TfSelector(value: _tf, onChanged: (v) => setState(() { _tf = v ?? _tf; _onSymbolOrTfChanged(); })),
              ],
            ),
          ),
          Expanded(
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(
                border: Border.all(color: Colors.grey.shade700),
                borderRadius: BorderRadius.circular(8),
              ),
              child: _candleCount > 0
                  ? ChartView(candles: _candles, engineOutput: _engineOutput)
                  : const Center(child: Text('차트 ?�역 (?�기?????�시)')),
            ),
          ),
          EvidenceTable(matrix: _engineOutput != null ? EvidenceMatrix.fromEngineOutput(_engineOutput!) : null),
          BriefingPanel(
            briefingOutput: _briefingOutput,
            equity: _equity,
            onEquityChanged: (v) {
              setState(() {
                _equity = v;
                if (_engineOutput != null) {
                  _briefingOutput = _briefingEngine.run(_engineOutput!, _lastPrice, equity: _equity, lossStreak: _lossStreak);
                }
              });
            },
          ),
        ],
      ),
    );
  }
}
