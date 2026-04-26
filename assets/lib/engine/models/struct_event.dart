/// 구조 이벤트: BOS_UP, BOS_DN, MSB_UP, MSB_DN, EQH, EQL
enum StructEventType { BOS_UP, BOS_DN, MSB_UP, MSB_DN, EQH, EQL }

class StructEvent {
  final StructEventType type;
  final int t;
  final double price;
  final String tf;
  final int score;

  StructEvent({required this.type, required this.t, required this.price, required this.tf, required this.score});
}
