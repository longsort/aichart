import 'central_evidence_hub.dart';

class EngineResultBridge {
  static void push(String name, double score) {
    CentralEvidenceHub.push(name, score.clamp(0.0, 1.0));
  }
}
