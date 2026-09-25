
import 'package:flutter/material.dart';
import '../../core/update/patch_manager.dart';

/// PATCH-8: simple in-app patch panel (config swap + rollback).
class UpdatePanelV1 extends StatefulWidget {
  const UpdatePanelV1({super.key});

  @override
  State<UpdatePanelV1> createState() => _UpdatePanelV1State();
}

class _UpdatePanelV1State extends State<UpdatePanelV1> {
  final _pm = PatchManager();
  final _controller = TextEditingController();
  String _status = '';
  String _log = '';

  Future<void> _refreshLog() async {
    final l = await _pm.readLog();
    setState(() => _log = l);
  }

  @override
  void initState() {
    super.initState();
    _refreshLog();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.35),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Row(
            children: [
              Icon(Icons.system_update_alt, size: 16, color: Colors.white70),
              SizedBox(width: 8),
              Text('업데이트', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 8),
          const Text('patch.json 내용을 붙여넣고 적용 (오류 시 자동 롤백)', style: TextStyle(color: Colors.white54, fontSize: 12)),
          const SizedBox(height: 8),
          TextField(
            controller: _controller,
            maxLines: 6,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              hintText: '{ "version": "1.0.1", "signalCut": 60 }',
              hintStyle: TextStyle(color: Colors.white.withOpacity(0.35)),
              filled: true,
              fillColor: Colors.white.withOpacity(0.05),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.white.withOpacity(0.08))),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.white.withOpacity(0.08))),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.white.withOpacity(0.15))),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: ElevatedButton(
                  onPressed: () async {
                    try {
                      await _pm.applyPatchJsonString(_controller.text);
                      setState(() => _status = '적용 완료');
                    } catch (_) {
                      setState(() => _status = '적용 실패 → 롤백 처리');
                    }
                    await _refreshLog();
                  },
                  child: const Text('적용'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton(
                  onPressed: () async {
                    final ok = await _pm.rollback();
                    setState(() => _status = ok ? '롤백 완료' : '롤백할 백업 없음');
                    await _refreshLog();
                  },
                  child: const Text('롤백'),
                ),
              ),
            ],
          ),
          if (_status.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(_status, style: const TextStyle(color: Colors.orangeAccent)),
          ],
          if (_log.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(_log, style: const TextStyle(color: Colors.white38, fontSize: 11)),
          ],
        ],
      ),
    );
  }
}
