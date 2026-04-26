/// 레벨선: EQH/EQL — y(가격), t0,t1(시간), score
enum LevelType { EQH, EQL }

class LevelLine {
  final LevelType type;
  final double y;
  final int t0;
  final int t1;
  final int score;

  LevelLine({required this.type, required this.y, required this.t0, required this.t1, required this.score});
}
