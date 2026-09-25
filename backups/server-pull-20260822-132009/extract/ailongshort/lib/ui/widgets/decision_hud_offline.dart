
import 'package:flutter/material.dart';

class OfflineBanner extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      color: Colors.black87,
      child: const Text(
        'OFFLINE / DEMO\n?¤ì‹œê°??°ì´???°ê²° ?€ê¸?,
        style: TextStyle(color: Colors.orangeAccent),
        textAlign: TextAlign.center,
      ),
    );
  }
}
