import 'package:flutter/material.dart';
import '../../core/utils/ai_safe.dart';

/// dtoMap?�서 min/max/count�?최�???찾아??반환
class ChartBoundsFromDto {
  static Map<String, dynamic> read(Map<String, dynamic> dto) {
    final minP = AiSafe.asDouble(dto['minPrice'] ?? dto['lowMin'] ?? dto['min'], 0);
    final maxP = AiSafe.asDouble(dto['maxPrice'] ?? dto['highMax'] ?? dto['max'], 0);
    final n = AiSafe.asInt(dto['count'] ?? dto['candles'] ?? dto['n'], 200);
    return {'min': minP, 'max': maxP, 'n': n};
  }
}
