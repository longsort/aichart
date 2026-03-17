class SmcPoint {
  final int idx;
  final double price;
  const SmcPoint(this.idx, this.price);
}

class SmcResult {
  final String structure; // CHOCH_UP/CHOCH_DN/RANGE
  final SmcPoint? breakPoint;

  final double? reactionTop;
  final double? reactionBot;
  final String reactionLabel; // OB/FVG

  final int structureScore; // 0~100
  final int reactionScore;  // 0~100

  SmcResult({
    required this.structure,
    required this.structureScore,
    required this.reactionScore,
    this.breakPoint,
    this.reactionTop,
    this.reactionBot,
    this.reactionLabel = '',
  });
}
