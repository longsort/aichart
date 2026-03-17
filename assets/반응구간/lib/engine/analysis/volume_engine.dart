
import '../connectors/engine_result_bridge.dart';

double calcVolumeScore(double raw){
  final score = raw.clamp(0.0,1.0);
  EngineResultBridge.push('거래량', score);
  return score;
}
