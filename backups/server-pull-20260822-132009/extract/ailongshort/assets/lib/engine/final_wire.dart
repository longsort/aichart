
import 'central_engine.dart';

// 기존 엔진 결과 나오는 곳에서 이것만 호출
void wireResult(double score){
  CentralEngine.pushEvidence(score);
}
