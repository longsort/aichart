package com.fulink.pro.service

import android.app.*
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat

class ForegroundTradeService : Service() {
  override fun onCreate() {
    super.onCreate()
    val channelId = "FULINK_TRADE_CHANNEL"
    val nm = getSystemService(NotificationManager::class.java)
    val ch = NotificationChannel(channelId, "Fulink Trade Engine", NotificationManager.IMPORTANCE_LOW)
    nm.createNotificationChannel(ch)

    val notification = NotificationCompat.Builder(this, channelId)
      .setContentTitle("Fulink Pro 실행중")
      .setContentText("자동 분석/자율보정 유지")
      .setSmallIcon(android.R.drawable.ic_media_play)
      .build()

    startForeground(1001, notification)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // TODO: 여기서 가격 체크(15s) + OPEN 신호 TP/SL 판정 -> Flutter(MethodChannel)로 전달
    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
