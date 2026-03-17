import 'fu_state.dart';

/// FuturePathDTO v2 (Fulink Pro)
/// - UI(차트)는 poly/확률/레벨만 렌더링한다.
/// - structureScore(0~100)는 "구조 신뢰도" 점수(확률 가중/표시용).
class FuturePathDTO {
  final String symbol;
  final String tf;
  final DateTime generatedAt;

  /// 0 MAIN, 1 ALT, 2 FAIL
  final int selected;

  /// sum=100
  final int probMain;
  final int probAlt;
  final int probFail;

  /// 0~100
  final int structureScore;

  /// 구조 점수 분해(디버그/설명/로그)
  final Map<String, int> structureParts;

  final FutureLevels levels;

  final FuturePath main;
  final FuturePath alt;
  final FuturePath fail;

  const FuturePathDTO({
    required this.symbol,
    required this.tf,
    required this.generatedAt,
    required this.selected,
    required this.probMain,
    required this.probAlt,
    required this.probFail,
    this.structureScore = 0,
    this.structureParts = const {},
    required this.levels,
    required this.main,
    required this.alt,
    required this.fail,
  });

  List<FuturePath> get paths => [main, alt, fail];

  FuturePathDTO copyWith({
    String? symbol,
    String? tf,
    DateTime? generatedAt,
    int? selected,
    int? probMain,
    int? probAlt,
    int? probFail,
    int? structureScore,
    Map<String, int>? structureParts,
    FutureLevels? levels,
    FuturePath? main,
    FuturePath? alt,
    FuturePath? fail,
  }) {
    return FuturePathDTO(
      symbol: symbol ?? this.symbol,
      tf: tf ?? this.tf,
      generatedAt: generatedAt ?? this.generatedAt,
      selected: selected ?? this.selected,
      probMain: probMain ?? this.probMain,
      probAlt: probAlt ?? this.probAlt,
      probFail: probFail ?? this.probFail,
      structureScore: structureScore ?? this.structureScore,
      structureParts: structureParts ?? this.structureParts,
      levels: levels ?? this.levels,
      main: main ?? this.main,
      alt: alt ?? this.alt,
      fail: fail ?? this.fail,
    );
  }

  Map<String, Object?> toJson() => {
        'symbol': symbol,
        'tf': tf,
        'generatedAt': generatedAt.millisecondsSinceEpoch,
        'selected': selected,
        'probMain': probMain,
        'probAlt': probAlt,
        'probFail': probFail,
        'structureScore': structureScore,
        'structureParts': structureParts,
        'levels': levels.toJson(),
        'main': main.toJson(),
        'alt': alt.toJson(),
        'fail': fail.toJson(),
      };
}

class FutureLevels {
  final double inv;
  final double t1;
  final double t2;
  final double reactLow;
  final double reactHigh;

  const FutureLevels({
    required this.inv,
    required this.t1,
    required this.t2,
    required this.reactLow,
    required this.reactHigh,
  });

  Map<String, Object?> toJson() => {
        'inv': inv,
        't1': t1,
        't2': t2,
        'reactLow': reactLow,
        'reactHigh': reactHigh,
      };
}

class FuturePath {
  final String name;
  final List<FuturePolyPoint> poly;
  final double inv;
  final double t1;
  final double t2;

  const FuturePath({
    required this.name,
    required this.poly,
    required this.inv,
    required this.t1,
    required this.t2,
  });

  Map<String, Object?> toJson() => {
        'name': name,
        'poly': poly.map((e) => e.toJson()).toList(),
        'inv': inv,
        't1': t1,
        't2': t2,
      };
}

class FuturePolyPoint {
  final double x; // 0..1 normalized
  final double price;

  const FuturePolyPoint(this.x, this.price);

  Map<String, Object?> toJson() => {'x': x, 'price': price};
}

/// convenience alias to reduce imports in painters
typedef Candle = FuCandle;
