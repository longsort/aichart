
import 'package:flutter/material.dart';

class BtcLiveHeader extends StatelessWidget{
  final double price;
  final bool connected;
  const BtcLiveHeader({super.key, required this.price, required this.connected});

  @override
  Widget build(BuildContext context){
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children:[
        const Text('BTCUSDT', style: TextStyle(color:Colors.white,fontWeight:FontWeight.bold)),
        Row(children:[
          Icon(Icons.circle, size:10, color: connected?Colors.green:Colors.red),
          const SizedBox(width:6),
          Text(price.toStringAsFixed(1), style: const TextStyle(color:Colors.white)),
        ])
      ],
    );
  }
}
