import '../decision_spine/engine.dart';
import '../tf_engine/models.dart';
import '../tf_engine/engine.dart';
import '../risk_engine/models.dart';
import '../risk_engine/engine.dart';
import '../signal_engine/models.dart';
import '../signal_engine/engine.dart';
import '../whale_engine/models.dart';
import '../whale_engine/engine.dart';
import '../fusion_engine/models.dart';
import '../fusion_engine/engine.dart';

class DecisionController {
  FusionResult run({
    required String spineState,
    required TfBias daily,
    required TfBias weekly,
    required TfBias monthly,
    required RiskInput riskInput,
    required SignalInput signalInput,
    required WhaleInput whaleInput,
  }) {
    final tf = mergeBias(
      daily: daily,
      weekly: weekly,
      monthly: monthly,
    );

    final risk = calcRisk(riskInput);
    final signal = decideSignal(signalInput);
    final whale = analyzeWhale(whaleInput);

    return fuse(FusionInput(
      spineState: spineState,
      tfScore: tf.score,
      riskPct: risk.riskPct,
      signalState: signal.state,
      whaleState: whale.state,
    ));
  }
}
