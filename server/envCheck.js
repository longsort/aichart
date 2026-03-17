/**
 * 서버 시작 시 process.env에서 API Key 및 필수 변수 검증.
 * 누락 시 로그로 경고, 앱은 계속 기동 (캔들 수집은 가능).
 */
function runEnvCheck() {
  const vars = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    PROXY_URL: process.env.PROXY_URL,
  };
  const missing = [];
  const ok = [];
  for (const [key, value] of Object.entries(vars)) {
    if (value && String(value).trim().length > 0) ok.push(key);
    else if (key !== 'PROXY_URL') missing.push(key);
  }
  console.log('[envCheck] Loaded:', ok.length ? ok.join(', ') : 'none');
  if (missing.length) console.warn('[envCheck] Missing (optional for candles):', missing.join(', '));
  if (vars.PROXY_URL) console.log('[envCheck] PROXY_URL set (451 bypass enabled)');
}

module.exports = { runEnvCheck };
