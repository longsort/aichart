
import 'package:flutter/material.dart';
import '../../core/update/patch_manager.dart';
import '../../core/update/remote_patch_fetcher.dart';

/// PATCH-9: update panel with URL fetch + apply.
class UpdatePanelV2 extends StatefulWidget {
  const UpdatePanelV2({super.key});

  @override
  State<UpdatePanelV2> createState() => _UpdatePanelV2State();
}

class _UpdatePanelV2State extends State<UpdatePanelV2> {
  final _pm = PatchManager();
  final _fetcher = RemotePatchFetcher();
  final _url = TextEditingController(text: 'https://example.com/patch.json');

  String _status = '';
  String _log = '';
  bool _busy = false;

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
              Icon(Icons.system_update, size: 16, color: Colors.white70),
              SizedBox(width: 8),
              Text('원격 업데이트', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _url,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              hintText: 'https://.../patch.json',
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
                  onPressed: _busy ? null : () async {
                    setState(() { _busy = true; _status=''; });
                    try{
                      final json = await _fetcher.fetch(_url.text.trim());
                      await _pm.applyPatchJsonString(json);
                      _status = '적용 완료';
                    }catch(e){
                      _status = '실패 → 롤백 처리: $e';
                    }finally{
                      _busy = false;
                      setState((){});
                      await _refreshLog();
                    }
                  },
                  child: Text(_busy ? '받는 중...' : '다운로드+적용'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton(
                  onPressed: _busy ? null : () async {
                    final ok = await _pm.rollback();
                    setState(() => _status = ok ? '롤백 완료' : '백업 없음');
                    await _refreshLog();
                  },
                  child: const Text('롤백'),
                ),
              ),
            ],
          ),
          if (_status.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(_status, style: const TextStyle(color: Colors.orangeAccent, fontSize: 12)),
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
