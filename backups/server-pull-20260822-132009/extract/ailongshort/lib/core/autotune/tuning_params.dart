class TuningParams {
  final double wSupport;
  final double wResist;
  final double wStructure;
  final double thrConfirm;
  final int updatedTs;

  const TuningParams({
    required this.wSupport,
    required this.wResist,
    required this.wStructure,
    required this.thrConfirm,
    required this.updatedTs,
  });

  factory TuningParams.defaults() => TuningParams(
        wSupport: 0.40,
        wResist: 0.40,
        wStructure: 0.25,
        thrConfirm: 0.60,
        updatedTs: DateTime.now().millisecondsSinceEpoch,
      );

  Map<String, Object?> toMap() => {
        'id': 1,
        'updated_ts': updatedTs,
        'w_support': wSupport,
        'w_resist': wResist,
        'w_structure': wStructure,
        'thr_confirm': thrConfirm,
      };

  factory TuningParams.fromMap(Map<String, Object?> m) => TuningParams(
        wSupport: (m['w_support'] as num?)?.toDouble() ?? 0.40,
        wResist: (m['w_resist'] as num?)?.toDouble() ?? 0.40,
        wStructure: (m['w_structure'] as num?)?.toDouble() ?? 0.25,
        thrConfirm: (m['thr_confirm'] as num?)?.toDouble() ?? 0.60,
        updatedTs: (m['updated_ts'] as int?) ?? DateTime.now().millisecondsSinceEpoch,
      );

  TuningParams copyWith({
    double? wSupport,
    double? wResist,
    double? wStructure,
    double? thrConfirm,
    int? updatedTs,
  }) =>
      TuningParams(
        wSupport: wSupport ?? this.wSupport,
        wResist: wResist ?? this.wResist,
        wStructure: wStructure ?? this.wStructure,
        thrConfirm: thrConfirm ?? this.thrConfirm,
        updatedTs: updatedTs ?? this.updatedTs,
      );
}
