
import '../hub/central_hub.dart';

class EngineResultBridge {
  static void push(String k, double v){
    centralHub.push(k, v);
  }
}
