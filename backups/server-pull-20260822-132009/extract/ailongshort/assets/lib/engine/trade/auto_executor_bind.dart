
import 'auto_executor.dart';
import 'trade_state.dart';
import 'no_trade_lock.dart';
import '../hub/central_hub.dart';

class AutoExecutorBind {
  final AutoExecutor exec = AutoExecutor();
  TradeState state = TradeState.idle;

  void onHub(HubTick tick, double price){
    final active = tick.evidence.values.where((v)=>v>0).length;
    state = NoTradeLock.eval(consensus: tick.longScore, activeEvidence: active);

    if(state==TradeState.longReady && !exec.inPosition){
      exec.tryLong(price);
    }
    if(state==TradeState.shortReady && !exec.inPosition){
      exec.tryShort(price);
    }
  }
}
