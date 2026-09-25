
import '../models/fu_state.dart';

class CandleEventResult {
  final String typeKo; // 장대양봉/장대음봉/없음
  final int sample;
  final int up1, down1;
  final int up3, down3;
  final int up5, down5;

  const CandleEventResult({
    required this.typeKo,
    required this.sample,
    required this.up1,
    required this.down1,
    required this.up3,
    required this.down3,
    required this.up5,
    required this.down5,
  });

  int pct(int up, int down) {
    final t = up + down;
    if (t <= 0) return 0;
    return ((up / t) * 100).round().clamp(0, 100);
  }

  int get pUp1 => pct(up1, down1);
  int get pUp3 => pct(up3, down3);
  int get pUp5 => pct(up5, down5);
}

class CandleEventAnalyzer {
  /// 막형(장대) 캔들 감지 + 이후 확률(1/3/5캔들)
  /// - 현재 보유한 candles 리스트에서 통계 계산(데이터가 쌓일수록 정확도↑)
  static CandleEventResult analyze(List<FuCandle> candles) {
    if (candles.length < 12) {
      return const CandleEventResult(typeKo: '없음', sample: 0, up1: 0, down1: 0, up3: 0, down3: 0, up5: 0, down5: 0);
    }

    final last = candles.last;
    final bodies = <double>[];
    final n = candles.length;
    final look = n < 30 ? n : 30;
    for (int i = n - look; i < n; i++) {
      final x = candles[i];
      bodies.add((x.close - x.open).abs());
    }
    final avgBody = bodies.reduce((a,b)=>a+b) / bodies.length;
    final body = (last.close - last.open).abs();
    final range = (last.high - last.low).abs();
    final bodyRatio = range <= 0 ? 0.0 : (body / range);

    final isBig = body >= avgBody * 2.0 && bodyRatio >= 0.55;
    if (!isBig) {
      return const CandleEventResult(typeKo: '없음', sample: 0, up1: 0, down1: 0, up3: 0, down3: 0, up5: 0, down5: 0);
    }

    final bullish = last.close >= last.open;
    final typeKo = bullish ? '장대양봉' : '장대음봉';

    // 과거 동일 타입(양/음) 장대 캔들 찾아서 이후 결과 집계
    int up1=0, down1=0, up3=0, down3=0, up5=0, down5=0;
    int sample=0;

    // 동일 기준을 과거에도 적용하기 위해, 과거 구간별 평균 body를 같이 계산 (간단 버전)
    for (int i = 10; i < n - 6; i++) {
      final x = candles[i];
      final b = (x.close - x.open).abs();
      final r = (x.high - x.low).abs();
      final br = r <= 0 ? 0.0 : (b / r);

      // 주변 20개 평균 body로 비교
      final s = (i - 20) < 0 ? 0 : (i - 20);
      final e = i;
      double sum=0; int cnt=0;
      for (int k=s;k<e;k++){
        sum += (candles[k].close - candles[k].open).abs();
        cnt++;
      }
      if (cnt < 10) continue;
      final avg = sum / cnt;

      final big = b >= avg * 2.0 && br >= 0.55;
      if (!big) continue;

      final bull = x.close >= x.open;
      if (bull != bullish) continue;

      sample++;

      // next1
      final n1 = candles[i+1];
      if (n1.close >= n1.open) up1++; else down1++;

      // next3: close at i+3 vs close at i
      final c3 = candles[i+3].close - candles[i].close;
      if (c3 >= 0) up3++; else down3++;

      // next5
      final c5 = candles[i+5].close - candles[i].close;
      if (c5 >= 0) up5++; else down5++;
    }

    return CandleEventResult(
      typeKo: typeKo,
      sample: sample,
      up1: up1,
      down1: down1,
      up3: up3,
      down3: down3,
      up5: up5,
      down5: down5,
    );
  }
}
