/// Layer priority preset for zones (OB/FVG/BPR/SR)
/// - TF별로 우선순위를 바꿔서 '한눈에' 보이게 정리
enum ZoneLayer { sr, ob, fvg, bpr }

class LayerPriority {
  /// Return ordered priority list (high -> low)
  static List<ZoneLayer> order(String tf) {
    final t = tf.toLowerCase();
    // 하위 TF: 더 많은 레이어를 보여주되 우선순위는 SR/OB 중심
    if (t == '15m' || t == '15' || t == '1h' || t == '60m' || t == '60') {
      return const [ZoneLayer.sr, ZoneLayer.ob, ZoneLayer.fvg, ZoneLayer.bpr];
    }
    // 중간 TF: OB/FVG가 더 중요
    if (t == '4h' || t == '240m' || t == '240' || t == '1d') {
      return const [ZoneLayer.ob, ZoneLayer.fvg, ZoneLayer.sr, ZoneLayer.bpr];
    }
    // 상위 TF: SR + Major OB만 깔끔하게
    if (t == '1w' || t == '1m' || t == '1y' || t == 'year') {
      return const [ZoneLayer.sr, ZoneLayer.ob];
    }
    return const [ZoneLayer.sr, ZoneLayer.ob, ZoneLayer.fvg, ZoneLayer.bpr];
  }

  /// Max visible layers by TF for cleanliness
  static int maxLayers(String tf) {
    final t = tf.toLowerCase();
    if (t == '15m' || t == '15') return 4;
    if (t == '1h' || t == '60m' || t == '60') return 4;
    if (t == '4h' || t == '240m' || t == '240') return 3;
    if (t == '1d') return 3;
    if (t == '1w') return 2;
    if (t == '1m') return 2;
    if (t == '1y' || t == 'year') return 2;
    return 3;
  }
}