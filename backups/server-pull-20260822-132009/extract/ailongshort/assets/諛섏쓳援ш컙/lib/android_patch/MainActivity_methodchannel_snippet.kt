/*
MainActivity (Kotlin) 에 추가:

private val CHANNEL = "fulink/foreground"

override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
  super.configureFlutterEngine(flutterEngine)
  MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
    if (call.method == "start") {
      val i = Intent(this, ForegroundTradeService::class.java)
      ContextCompat.startForegroundService(this, i)
      result.success(true)
    } else if (call.method == "stop") {
      stopService(Intent(this, ForegroundTradeService::class.java))
      result.success(true)
    } else {
      result.notImplemented()
    }
  }
}
*/
