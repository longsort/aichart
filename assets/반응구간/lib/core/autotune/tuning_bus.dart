import 'tuning_params.dart';

class TuningBus {
  static TuningParams _p = TuningParams.defaults();
  static TuningParams get p => _p;
  static void inject(TuningParams p) => _p = p;
}
