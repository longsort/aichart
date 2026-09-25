
import 'dart:async';import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
class BitgetWsPrice{
 final _c=StreamController<double>.broadcast();
 Stream<double> get stream=>_c.stream;
 late WebSocketChannel ch;
 void connect(){
  ch=WebSocketChannel.connect(Uri.parse('wss://ws.bitget.com/v2/ws/public'));
  ch.sink.add(jsonEncode({"op":"subscribe","args":[{"instType":"SPOT","channel":"ticker","instId":"BTCUSDT"}]}));
  ch.stream.listen((e){
    final d=jsonDecode(e);
    if(d['data']!=null){_c.add(double.parse(d['data'][0]['last']));}
  });
 }
}
