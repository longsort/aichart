
import '../hub/central_hub.dart';

final centralHub = CentralHub();

void pushEvidence(String name, double score) {
  centralHub.push(name, score.clamp(0.0, 1.0));
}
