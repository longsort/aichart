import '../db/outcome_dao.dart';
import '../db/tuning_dao.dart';
import 'tuning_bus.dart';
import 'tuning_params.dart';

class AutoTune {
  final OutcomeDao _out = OutcomeDao();
  final TuningDao _td = TuningDao();

  Future<TuningParams> run() async {
    final cur = await _td.loadOrCreate();
    final wr30 = await _out.winrateLastN(30);

    double thr = cur.thrConfirm;
    String note = 'HOLD';

    if (wr30 > 0 && wr30 < 50) {
      thr = (thr + 0.01).clamp(0.55, 0.75);
      note = 'WINRATE_LOW -> thrConfirm +0.01';
    } else if (wr30 >= 58) {
      thr = (thr - 0.01).clamp(0.55, 0.75);
      note = 'WINRATE_HIGH -> thrConfirm -0.01';
    }

    final next = cur.copyWith(thrConfirm: thr, updatedTs: DateTime.now().millisecondsSinceEpoch);

    if (next.thrConfirm != cur.thrConfirm) {
      await _td.save(next);
      await _td.logChange(note: note, diff: {
        'thrConfirm': '${cur.thrConfirm} -> ${next.thrConfirm}',
        'wr30': wr30.toStringAsFixed(1),
      });
      TuningBus.inject(next);
      return next;
    }

    TuningBus.inject(cur);
    return cur;
  }
}
