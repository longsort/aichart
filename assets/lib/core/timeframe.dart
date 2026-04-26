/// Timeframe: m5, m15, h1, h4, d1, w1, mo1
enum Timeframe { m5, m15, h1, h4, d1, w1, mo1 }

extension TimeframeExt on Timeframe {
  String get code => switch (this) {
        Timeframe.m5 => 'm5',
        Timeframe.m15 => 'm15',
        Timeframe.h1 => 'h1',
        Timeframe.h4 => 'h4',
        Timeframe.d1 => 'd1',
        Timeframe.w1 => 'w1',
        Timeframe.mo1 => 'mo1',
      };

  static Timeframe fromCode(String code) {
    return Timeframe.values.firstWhere(
      (e) => e.code == code.toLowerCase(),
      orElse: () => Timeframe.m15,
    );
  }
}
