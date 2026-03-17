class StructMark {
  final int index;
  final double price;
  final String label; // BOS/CHOCH/EQL/EQH/MSB etc
  final bool isUp;    // up/bullish tag for color
  const StructMark({
    required this.index,
    required this.price,
    required this.label,
    this.isUp = true,
  });
}
