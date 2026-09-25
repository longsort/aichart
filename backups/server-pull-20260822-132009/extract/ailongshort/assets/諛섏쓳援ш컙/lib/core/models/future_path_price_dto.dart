class FuturePathPriceDTO {
  final String tf; // 5m/15m/1h/4h/1d/1w/1m/1y
  final double anchor; // 시작가
  final double target; // 목표가
  final double invalid; // 무효가(깨지면 시나리오 파기)
  final int pMain; // 메인 경로 확률(0~100)
  final int rrX10; // RR*10 (예: 24 = 2.4)
  final String dir; // 'LONG' / 'SHORT'
  final List<double> wavePrices; // 5파동 가격(anchor 포함/미포함 상관없음 - UI가 표시)

  const FuturePathPriceDTO({
    required this.tf,
    required this.anchor,
    required this.target,
    required this.invalid,
    required this.pMain,
    required this.rrX10,
    required this.dir,
    required this.wavePrices,
  });

  Map<String, dynamic> toJson() => {
        'tf': tf,
        'anchor': anchor,
        'target': target,
        'invalid': invalid,
        'pMain': pMain,
        'rrX10': rrX10,
        'dir': dir,
        'wavePrices': wavePrices,
      };
}
