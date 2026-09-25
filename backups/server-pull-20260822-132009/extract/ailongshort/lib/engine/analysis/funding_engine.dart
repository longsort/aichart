
import '../connectors/engine_result_bridge.dart';

double calcFundingScore(double raw){
  final score = raw.clamp(0.0,1.0);
  EngineResultBridge.push('?€??, score);
  return score;
}
