/**
 * 브라우저에만 저장되는 AI 관련 값 (OpenAI 키는 사용자 본인 키만).
 * 앱 로그인(APP_BRIEFING_LOGIN_*)은 서버 .env와 대조됩니다.
 */
import { isValidOpenAIKeyFormat } from '@/lib/openaiKeyFormat';

export const LS_OPENAI_KEY = 'ailongshort-openai-api-key';
export const LS_BRIEFING_USER = 'ailongshort-briefing-user';
export const LS_BRIEFING_PASS = 'ailongshort-briefing-password';
export const LS_AI_COST_TOTAL = 'ailongshort-ai-estimated-cost-usd';
export const SS_BRIEFING_LOGGED_IN = 'ailongshort-briefing-logged-in';

export function getStoredOpenAIKey(): string {
  if (typeof window === 'undefined') return '';
  return (localStorage.getItem(LS_OPENAI_KEY) || '').trim();
}

export function setStoredOpenAIKey(v: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LS_OPENAI_KEY, v.trim());
}

export function getStoredBriefingUser(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(LS_BRIEFING_USER) || '';
}

export function getStoredBriefingPassword(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(LS_BRIEFING_PASS) || '';
}

export function setStoredBriefingCredentials(user: string, password: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LS_BRIEFING_USER, user);
  localStorage.setItem(LS_BRIEFING_PASS, password);
}

export function getTotalEstimatedCostUsd(): number {
  if (typeof window === 'undefined') return 0;
  const n = parseFloat(localStorage.getItem(LS_AI_COST_TOTAL) || '0');
  return Number.isFinite(n) ? n : 0;
}

export function addEstimatedCostUsd(amt: number): void {
  if (typeof window === 'undefined' || !Number.isFinite(amt) || amt <= 0) return;
  const cur = getTotalEstimatedCostUsd();
  localStorage.setItem(LS_AI_COST_TOTAL, String(cur + amt));
}

export function hasUsableOpenAIKey(serverHasOpenAI: boolean): boolean {
  return serverHasOpenAI || isValidOpenAIKeyFormat(getStoredOpenAIKey());
}

/** 탭을 닫으면 초기화됨 (sessionStorage) */
export function getBriefingLoggedIn(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(SS_BRIEFING_LOGGED_IN) === '1';
}

export function setBriefingLoggedIn(value: boolean): void {
  if (typeof window === 'undefined') return;
  if (value) sessionStorage.setItem(SS_BRIEFING_LOGGED_IN, '1');
  else sessionStorage.removeItem(SS_BRIEFING_LOGGED_IN);
}
