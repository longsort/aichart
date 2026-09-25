
enum TradeMode {
  safe,   // 실전 보호(확정만)
  normal, // 기본
}

extension TradeModeX on TradeMode {
  String get label => this == TradeMode.safe ? "실전 보호" : "기본";
}
