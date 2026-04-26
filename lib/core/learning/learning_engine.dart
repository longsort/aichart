
class LearningEngine {
  double obWeight = 1.0;
  double fvgWeight = 1.0;
  double flowWeight = 1.0;

  void update(bool win) {
    final k = win ? 1.05 : 0.95;
    obWeight *= k;
    fvgWeight *= k;
    flowWeight *= k;
  }
}
