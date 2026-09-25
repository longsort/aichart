/**
 * 현재 Cursor 대화 1건만 D: 프로젝트 폴더로 백업 (재설치용).
 * 사용: node scripts/export-current-chat-backup.mjs
 */
import fs from 'fs';
import path from 'path';

const SRC =
  'C:\\Users\\USER\\.cursor\\projects\\d-apps-ailongshort\\agent-transcripts\\ecc09207-6502-4cc8-9139-bc115f052861\\ecc09207-6502-4cc8-9139-bc115f052861.jsonl';
const DEST_DIR = 'd:\\apps\\ailongshort\\cursor-chat-backup\\2026-08-20-재설치백업';

function extractUserQuery(text) {
  const m = String(text || '').match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/);
  return m ? m[1].trim() : '';
}

function flattenText(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((p) => p && p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('\n')
    .replace(/\[REDACTED\]/g, '')
    .trim();
}

fs.mkdirSync(DEST_DIR, { recursive: true });
if (!fs.existsSync(SRC)) {
  console.error('원본 대화 파일을 못 찾음:', SRC);
  process.exit(1);
}

const rawDest = path.join(DEST_DIR, '현재대화-원본.jsonl');
fs.copyFileSync(SRC, rawDest);

const lines = fs.readFileSync(SRC, 'utf8').split(/\r?\n/).filter(Boolean);
const turns = [];
let nUser = 0;
let nAsst = 0;
for (const line of lines) {
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    continue;
  }
  const role = row.role || row.type || '';
  const text = flattenText(row.message?.content ?? row.content);
  if (!text) continue;
  if (role === 'user') {
    nUser += 1;
    const q = extractUserQuery(text) || text.slice(0, 4000);
    turns.push({ role: 'user', text: q });
  } else if (role === 'assistant') {
    nAsst += 1;
    const cleaned = text
      .replace(/```[\s\S]*?```/g, '[코드블록 생략]')
      .slice(0, 6000);
    if (cleaned.length > 40) turns.push({ role: 'assistant', text: cleaned });
  }
}

const md = [];
md.push('# ailongshort Cursor 대화 백업 (재설치용)');
md.push('');
md.push('- 저장일: 2026-08-20');
md.push('- 프로젝트: `d:\\apps\\ailongshort`');
md.push('- 대화 ID: `ecc09207-6502-4cc8-9139-bc115f052861`');
md.push(`- 사용자 메시지 ${nUser}개 / 어시스턴트 텍스트 ${nAsst}개`);
md.push('- 원본: `현재대화-원본.jsonl` (이 파일이 가장 완전함)');
md.push('');
md.push('## 재설치 후 쓰는 법');
md.push('');
md.push('1. Cursor를 D:에 다시 설치하고 `d:\\apps\\ailongshort` 폴더를 연다.');
md.push('2. 새 채팅에서 이 폴더의 `현재대화-원본.jsonl` 또는 이 md 파일을 **첨부/공유**한다.');
md.push('3. 한 줄로 말한다: 「이 백업 읽고 이전 작업 이어서. 삭제 금지. 파랑빨강띠·통합분석 유지.»');
md.push('');
md.push('## 반드시 기억할 규칙');
md.push('');
md.push('- 사용자 지시 없이 기능/엔진/작도 삭제 금지');
md.push('- 서버 반영 경로: `/root/ailongshort`만');
md.push('- 고래 DNA 카드/HUD 금지 (캔들·거래량·가격축만)');
md.push('- 고정 승률·확정 수익 문구 금지');
md.push('- 통합분석 기본. E/SL/TP는 전폭 가격선');
md.push('- 파랑빨강띠: 마지막 캔들까지, 라벨은 띠 위 한글 롱구간/숏구간, RES 멀리 금지, 위아래 동시 신호 금지');
md.push('- 엔진 버전: eagle1-core-0.23.1');
md.push('');
md.push('## 대화 본문 (사용자 질문 + 텍스트 답)');
md.push('');

let i = 0;
for (const t of turns) {
  i += 1;
  if (t.role === 'user') {
    md.push(`### 사용자 ${i}`);
    md.push('');
    md.push(t.text);
    md.push('');
  } else {
    md.push(`### 어시스턴트 ${i}`);
    md.push('');
    md.push(t.text);
    md.push('');
  }
}

const mdPath = path.join(DEST_DIR, '현재대화-읽기용.md');
fs.writeFileSync(mdPath, md.join('\n'), 'utf8');

const st = fs.statSync(rawDest);
console.log('OK');
console.log('jsonl', rawDest, st.size);
console.log('md', mdPath, fs.statSync(mdPath).size);
console.log('user', nUser, 'assistant_text', nAsst, 'turns', turns.length);
