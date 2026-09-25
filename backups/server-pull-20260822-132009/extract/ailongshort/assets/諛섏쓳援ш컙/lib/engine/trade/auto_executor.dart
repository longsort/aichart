
class AutoExecutor {
  bool inPosition = false;

  void tryLong(double price){ inPosition = true; }
  void tryShort(double price){ inPosition = true; }
  void exit(){ inPosition = false; }
}
