class FuSettings {
  double riskPct; // 기본 5%
  int leverage;   // 기본 5
  int minRoiConfirm; // 25%
  FuSettings({
    this.riskPct = 5,
    this.leverage = 5,
    this.minRoiConfirm = 25,
  });
}
