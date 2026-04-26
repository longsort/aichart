
import '../connectors/engine_result_bridge.dart';

double calcAiScore(double raw){
  final score = raw.clamp(0.0,1.0);
  EngineResultBridge.push('AI오차', score);
  return score;
}
