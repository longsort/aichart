/// ê³µí†µ ?ˆì „ ?Œì„œ(Null/?€??ê°€??
class AiSafe {
  static int asInt(dynamic v, [int fb = 0]) {
    if (v == null) return fb;
    if (v is int) return v;
    if (v is num) return v.round();
    if (v is String) return int.tryParse(v) ?? fb;
    return fb;
  }

  static double asDouble(dynamic v, [double fb = 0]) {
    if (v == null) return fb;
    if (v is double) return v;
    if (v is int) return v.toDouble();
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v) ?? fb;
    return fb;
  }

  static String asStr(dynamic v, [String fb = '']) {
    if (v == null) return fb;
    if (v is String) return v.isEmpty ? fb : v;
    return v.toString();
  }

  static bool asBool(dynamic v, [bool fb = false]) {
    if (v == null) return fb;
    if (v is bool) return v;
    if (v is String) return v.toLowerCase() == 'true';
    if (v is num) return v != 0;
    return fb;
  }

  static dynamic pick(Object? dto, String key) {
    if (dto == null) return null;
    if (dto is Map) return dto[key];
    try { final d = dto as dynamic; return d[key]; } catch (_) {}
    try { final d = dto as dynamic; return d.toJson()[key]; } catch (_) {}
    return null;
  }

  static Map<String, dynamic> asMap(Object? dto) {
    if (dto is Map<String, dynamic>) return dto;
    if (dto is Map) return Map<String, dynamic>.from(dto);
    return <String, dynamic>{};
  }
}
