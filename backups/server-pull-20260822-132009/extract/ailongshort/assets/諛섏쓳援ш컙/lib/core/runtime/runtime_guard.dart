
class RuntimeGuard {
  int wsFailures = 0;
  bool liveMode = true;

  void onWsFail(){
    wsFailures++;
    if(wsFailures >= 3){
      liveMode = false;
    }
  }

  void onWsRecover(){
    wsFailures = 0;
    liveMode = true;
  }
}
