
class PerfTuner {
  int frameSkip = 0;
  void tune(double fps){
    if(fps < 45){
      frameSkip = 1;
    }else{
      frameSkip = 0;
    }
  }
}
