/** 사용 거래소: bitget(기본, Mix API). Fallback 시에만 bybit/binance 참조 */
export const EXCHANGE = (process.env.EXCHANGE || 'bitget').toLowerCase() as 'bitget' | 'bybit' | 'binance';

export const BINANCE_BASE = process.env.BINANCE_API_BASE || 'https://api.binance.com';
export const BYBIT_BASE = process.env.BYBIT_API_BASE || 'https://api.bybit.com';
export const BITGET_BASE = process.env.BITGET_API_BASE || 'https://api.bitget.com';
export const GATEIO_BASE = process.env.GATEIO_API_BASE || 'https://api.gateio.ws/api/v4';
