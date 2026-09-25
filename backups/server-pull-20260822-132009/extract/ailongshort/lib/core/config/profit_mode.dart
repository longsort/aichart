enum ProfitMode { off, safe, profit }

class ProfitConfig {
  static ProfitMode mode = ProfitMode.profit;

  // ?˜ìµëª¨ë“œ: WAIT ê¸ˆì? -> ìµœì†Œ ? í˜¸ ë¹ˆë„ ê°€??  static int minSignalsPerDay = 3;

  // ?•ì • ìµœì†Œ RR
  static double minRR = 1.5;

  // ?€?•ì‹  ì§„ì… ?¬ì´ì¦?ë¹„ìœ¨)
  static double lowSize = 0.30;

  // ê³ í™•??ì§„ì… ?¬ì´ì¦?ë¹„ìœ¨)
  static double highSize = 1.00;

  // ?ˆë²„ë¦¬ì? ìº?  static int maxLev = 20;

  // ê°•ì œ ? í˜¸: ì¡??ˆíŠ¸ë©?ë¬´ì¡°ê±??„ë³´
  static bool forceOnZoneHit = true;
}
