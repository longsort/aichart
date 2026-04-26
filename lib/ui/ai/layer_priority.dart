/// Layer priority preset for zones (OB/FVG/BPR/SR)
/// - TFë³„ë¡œ ?°ì„ ?œìœ„ë¥?ë°”ê¿”??'?œëˆˆ?? ë³´ì´ê²??•ë¦¬
enum ZoneLayer { sr, ob, fvg, bpr }

class LayerPriority {
  /// Return ordered priority list (high -> low)
  static List<ZoneLayer> order(String tf) {
    final t = tf.toLowerCase();
    // ?˜ìœ„ TF: ??ë§ì? ?ˆì´?´ë? ë³´ì—¬ì£¼ë˜ ?°ì„ ?œìœ„??SR/OB ì¤‘ì‹¬
    if (t == '15m' || t == '15' || t == '1h' || t == '60m' || t == '60') {
      return const [ZoneLayer.sr, ZoneLayer.ob, ZoneLayer.fvg, ZoneLayer.bpr];
    }
    // ì¤‘ê°„ TF: OB/FVGê°€ ??ì¤‘ìš”
    if (t == '4h' || t == '240m' || t == '240' || t == '1d') {
      return const [ZoneLayer.ob, ZoneLayer.fvg, ZoneLayer.sr, ZoneLayer.bpr];
    }
    // ?ìœ„ TF: SR + Major OBë§?ê¹”ë”?˜ê²Œ
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