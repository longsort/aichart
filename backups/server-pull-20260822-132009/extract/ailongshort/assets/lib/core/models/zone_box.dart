
class ZoneBox {
  final double low;
  final double high;
  final String type; // OB, FVG, BPR
  final int strength; // 0~100
  ZoneBox({required this.low, required this.high, required this.type, required this.strength});
}
