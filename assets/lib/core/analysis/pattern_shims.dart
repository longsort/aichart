
extension PatternShims on _Pattern {
  String get name => toString().split('.').last;
  double get confidence => 0.0;
}
