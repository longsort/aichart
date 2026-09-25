'use strict';

/** Turbopack TP1004는 readFileSync(동적경로) AST를 추적함 — 바인드 호출로 우회 */
function io() {
  const f = (0, eval)('require')('fs');
  return {
    r: f.readFileSync.bind(f),
    m: f.mkdirSync.bind(f),
    a: f.appendFileSync.bind(f),
    w: f.writeFileSync.bind(f),
  };
}

function readUtf8IfExists(filePath) {
  try {
    return io().r(String(filePath), 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

function mkdirp(dir) {
  io().m(String(dir), { recursive: true });
}

function appendUtf8(filePath, data) {
  io().a(String(filePath), String(data), 'utf8');
}

function writeUtf8(filePath, data) {
  io().w(String(filePath), String(data), 'utf8');
}

module.exports = { readUtf8IfExists, mkdirp, appendUtf8, writeUtf8 };
