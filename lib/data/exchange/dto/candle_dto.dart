/// 거래??캔들 ?�답 DTO
class CandleDto {
  final int t;
  final double o, h, l, c, v;

  CandleDto({
    required this.t,
    required this.o,
    required this.h,
    required this.l,
    required this.c,
    required this.v,
  });
}
