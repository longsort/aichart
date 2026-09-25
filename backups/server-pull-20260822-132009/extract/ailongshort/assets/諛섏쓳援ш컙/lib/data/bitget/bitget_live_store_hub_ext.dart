
import '../../engine/ai/ai_decision_hub_ext.dart';

void pushVolume(double volScore) {
  pushEvidence('거래량', volScore);
}

void pushFunding(double fundScore) {
  pushEvidence('펀딩', fundScore);
}
