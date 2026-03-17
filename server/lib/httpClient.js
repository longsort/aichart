/**
 * Railway 451/403 지역 차단 회피: PROXY_URL 설정 시 모든 HTTP/HTTPS 요청을 프록시 경유.
 * 사용: const client = getHttpClient(); await client.get(url, { timeout: 15000 });
 */
const axios = require('axios');

let cachedAgent = null;

function getProxyAgent() {
  const proxyUrl = process.env.PROXY_URL;
  if (!proxyUrl || typeof proxyUrl !== 'string' || !proxyUrl.startsWith('http')) return null;
  if (cachedAgent) return cachedAgent;
  try {
    const { HttpsProxyAgent } = require('https-proxy-agent');
    cachedAgent = new HttpsProxyAgent(proxyUrl);
    return cachedAgent;
  } catch (e) {
    console.warn('[httpClient] https-proxy-agent not installed. PROXY_URL ignored. npm install https-proxy-agent');
    return null;
  }
}

/**
 * @returns axios instance: proxy 적용 시 해당 인스턴스로 요청하면 프록시 경유
 */
function getHttpClient() {
  const agent = getProxyAgent();
  if (agent) {
    return axios.create({
      httpAgent: agent,
      httpsAgent: agent,
      proxy: false,
    });
  }
  return axios;
}

module.exports = { getHttpClient, getProxyAgent };
