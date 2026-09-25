/// STEP 5: AI 결정문 자동 생성(엔진/오더북/구조 점수 기반)
/// - 외부 API 미연동 상태에서도 dto(Map/Object)만으로 최대한 추론
/// - 선물 시그널은 20% 미만이면 관망/주의로 낮춤
class AiDecisionService {
  static dynamic _pick(Object? dto, String key) {
    if (dto == null) return null;
    if (dto is Map) return dto[key];
    try {
      final d = dto as dynamic;
      return d[key];
    } catch (_) {}
    try {
      final d = dto as dynamic;
      return d.toJson()[key];
    } catch (_) {}
    return null;
  }

  static int _asInt(dynamic v, int fb) {
    if (v == null) return fb;
    if (v is int) return v;
    if (v is num) return v.round();
    if (v is String) return int.tryParse(v) ?? fb;
    return fb;
  }

  static bool _asBool(dynamic v) {
    if (v == null) return false;
    if (v is bool) return v;
    if (v is num) return v != 0;
    if (v is String) {
      final s = v.toLowerCase();
      return s == 'true' || s == '1' || s == 'yes' || s == 'y';
    }
    return false;
  }

  static String _asStr(dynamic v, String fb) =>
      (v is String && v.isNotEmpty) ? v : fb;

  /// 반환: {decisionLabel, reason, confidence, longP, shortP, neutralP}
  /// weights: 구조/패턴/오더북/유동성 가중치 (합이 1이 아니어도 OK)
  static Map<String, Object> build(Object? dto, {Map<String, double>? weights}) {
    final structureScore =
        _asInt(_pick(dto, 'structureScore') ?? _pick(dto, 'structScore'), 50)
            .clamp(0, 100);
    final patternSim =
        _asInt(_pick(dto, 'patternSim') ?? _pick(dto, 'similarity'), 60)
            .clamp(0, 100);
    final obBias = _asStr(
        _pick(dto, 'orderbookBias') ?? _pick(dto, 'obBias'), '중립'); // 매수우위/매도우위/중립
    final liqRisk = _asStr(
        _pick(dto, 'liquidityRisk') ?? _pick(dto, 'stopHuntRisk'), '보통'); // 높음/보통/낮음

    final choch = _asBool(_pick(dto, 'choch') ?? _pick(dto, 'CHoCH'));
    final bos = _asBool(_pick(dto, 'bos') ?? _pick(dto, 'BOS'));
    final msb = _asBool(_pick(dto, 'msb') ?? _pick(dto, 'MSB'));

    int longP = 33, shortP = 33, neutralP = 34;

    final dirHint = _asStr(_pick(dto, 'dir') ?? _pick(dto, 'direction'), '');
    if (dirHint.contains('LONG') ||
        dirHint.contains('롱') ||
        dirHint.contains('상승')) {
      longP += 12;
      shortP -= 6;
      neutralP -= 6;
    } else if (dirHint.contains('SHORT') ||
        dirHint.contains('숏') ||
        dirHint.contains('하락')) {
      shortP += 12;
      longP -= 6;
      neutralP -= 6;
    }

    if (obBias.contains('매수') ||
        obBias.contains('롱') ||
        obBias.toLowerCase().contains('buy')) {
      longP += 15;
      shortP -= 8;
      neutralP -= 7;
    } else if (obBias.contains('매도') ||
        obBias.contains('숏') ||
        obBias.toLowerCase().contains('sell')) {
      shortP += 15;
      longP -= 8;
      neutralP -= 7;
    }

    int structBoost = 0;
    if (bos) structBoost += 8;
    if (choch) structBoost += 6;
    if (msb) structBoost += 6;

    if (structureScore >= 65) {
      neutralP -= 10;
      final halfBoost = (structBoost / 2).floor();
      if (longP >= shortP) {
        longP += 5 + halfBoost;
      } else {
        shortP += 5 + halfBoost;
      }
    } else if (structureScore <= 40) {
      neutralP += 10;
      longP -= 5;
      shortP -= 5;
    }

    if (liqRisk.contains('높')) {
      neutralP += 10;
      longP -= 5;
      shortP -= 5;
    } else if (liqRisk.contains('낮')) {
      neutralP -= 6;
      if (longP >= shortP) {
        longP += 3;
      } else {
        shortP += 3;
      }
    }

    // 오더북을 점수로 변환(대충)
    int obScore = 50;
    if (obBias.contains('매수') || obBias.toLowerCase().contains('buy')) {
      obScore = 70;
    } else if (obBias.contains('매도') || obBias.toLowerCase().contains('sell')) {
      obScore = 30;
    }
    int liqScore = 100 - (liqRisk.contains('높') ? 25 : (liqRisk.contains('낮') ? 5 : 10));

    final w = weights ?? const {
      'structure': 0.45,
      'pattern': 0.35,
      'orderbook': 0.10,
      'liquidity': 0.10,
    };
    final ws = (w['structure'] ?? 0.45);
    final wp = (w['pattern'] ?? 0.35);
    final wob = (w['orderbook'] ?? 0.10);
    final wl = (w['liquidity'] ?? 0.10);
    final wSum = (ws + wp + wob + wl);
    final denom = wSum == 0 ? 1.0 : wSum;

    int confidence = (((structureScore * ws) +
                (patternSim * wp) +
                (obScore * wob) +
                (liqScore * wl)) /
            denom)
        .round();
    confidence = confidence.clamp(0, 100);

    longP = longP.clamp(0, 100);
    shortP = shortP.clamp(0, 100);
    neutralP = neutralP.clamp(0, 100);
    final sum = longP + shortP + neutralP;
    if (sum != 100) {
      final diff = 100 - sum;
      neutralP = (neutralP + diff).clamp(0, 100);
    }

    final maxDir = longP > shortP ? longP : shortP;
    String decisionLabel;
    if (maxDir < 20) {
      decisionLabel = '관망';
      confidence = (confidence * 0.85).round();
    } else {
      decisionLabel = (longP >= shortP) ? '단기 매수' : '단기 매도';
    }

    final parts = <String>[];
    parts.add('구조 ${structureScore}%');
    parts.add('패턴 ${patternSim}%');
    parts.add('오더북 $obBias');
    parts.add('유동성 $liqRisk');
    if (bos) parts.add('BOS');
    if (choch) parts.add('CHoCH');
    if (msb) parts.add('MSB');

    final reason = parts.join(' · ');

    return {
      'decisionLabel': decisionLabel,
      'reason': reason,
      'confidence': confidence,
      'longP': longP,
      'shortP': shortP,
      'neutralP': neutralP,
    };
  }
}
