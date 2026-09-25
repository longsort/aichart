/**
 * 텔레그램 차트 PNG — 통합·분석 UI 캡처 우선, SVG 폴백.
 * 캡션 1024 제한 → 사진은 요약, 전문 브리핑은 이어 전송.
 * 이미지는 Buffer 메모리만 사용 · 전송 후 즉시 GC (디스크 저장 없음).
 */
import type { Candle } from '@/types';
import type { UserSettings } from '@/lib/settings';
import { sendTelegramHtmlCaptionToEnvChat, sendTelegramPhotoPngHtmlCaption } from '@/lib/telegramBotSendHtml';
import { telegramAlertChartSvgToPng } from '@/lib/telegramAlertChartImage';
import {
  captureMergedDeskUiPngBuffer,
  isTelegramMergedDeskUiCaptureAvailable,
} from '@/lib/telegramMergedDeskUiCapture';
import { trimTelegramHtmlCaption } from '@/lib/telegramFormatHtml';

export type TelegramDeskPhotoSendParams = {
  captionHtml: string;
  /** 있으면 사진에는 이 짧은 결론만 (없으면 captionHtml에서 추출) */
  photoCaptionHtml?: string;
  captionPlainFallback?: string;
  /** true면 사진 후 전문을 길이 무관하게 항상 이어 전송 */
  forceFullFollowUp?: boolean;
  symbol: string;
  timeframe: string;
  candles: Candle[];
  settings: UserSettings;
  apiBase: string;
  buildSvg: () => string;
};

/** 사진 캡션용 짧은 요약 — 전문은 별도 메시지로 */
function shortPhotoCaption(fullHtml: string): string {
  const plain = String(fullHtml || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  const coreMatch = plain.match(/핵심\s+(.{12,120}?)(?:\s+의미:|\s+지금\s|\s+할 일|$)/);
  if (coreMatch?.[1]) {
    const core = coreMatch[1].replace(/\s+/g, ' ').trim().slice(0, 120);
    return trimTelegramHtmlCaption(
      `<b>${escapeHtmlLite(core)}</b>\n<i>▼ 상세</i>`,
      1024
    );
  }
  const resultIdx = plain.search(/결과:\s*(롱|숏|관찰)/);
  const start = resultIdx >= 0 ? resultIdx : 0;
  const head = plain.slice(start, start + 160).trim() || plain.slice(0, 160);
  return trimTelegramHtmlCaption(
    `<b>${escapeHtmlLite(head)}${plain.length > 160 ? '…' : ''}</b>\n<i>▼ 상세</i>`,
    1024
  );
}

function escapeHtmlLite(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function sendTelegramDeskAlertPhoto(
  params: TelegramDeskPhotoSendParams
): Promise<{ ok: boolean; photo: boolean; mode: 'ui' | 'svg' | 'text' }> {
  const chartOn = params.settings.telegramConfirmChartImageEnabled !== false;
  const uiCaptureOn = params.settings.telegramMergedDeskUiCaptureEnabled !== false;

  if (!chartOn) {
    const r = await sendTelegramHtmlCaptionToEnvChat(params.captionHtml);
    return { ok: r.ok, photo: false, mode: 'text' };
  }

  let png: Buffer | null = null;
  let mode: 'ui' | 'svg' = 'svg';

  if (uiCaptureOn && isTelegramMergedDeskUiCaptureAvailable() && params.candles.length >= 4) {
    png = await captureMergedDeskUiPngBuffer({
      baseUrl: params.apiBase,
      symbol: params.symbol,
      timeframe: params.timeframe,
    });
    if (png?.length) mode = 'ui';
  }

  if (!png?.length && params.candles.length >= 4) {
    try {
      const svg = params.buildSvg();
      png = await telegramAlertChartSvgToPng(svg);
      mode = 'svg';
    } catch {
      png = null;
    }
  }

  if (png?.length) {
    const caption = params.photoCaptionHtml
      ? trimTelegramHtmlCaption(params.photoCaptionHtml, 1024)
      : shortPhotoCaption(params.captionHtml);
    const sent = await sendTelegramPhotoPngHtmlCaption(caption, png);
    if (sent.ok) {
      png = null;
      /** 전문 브리핑 — 독수리전황은 항상 이어 전송, 그 외는 400자 초과 시 */
      if (params.forceFullFollowUp || params.captionHtml.length > 400) {
        await sendTelegramHtmlCaptionToEnvChat(params.captionHtml);
      }
      return { ok: true, photo: true, mode };
    }
  }

  const r = await sendTelegramHtmlCaptionToEnvChat(params.captionHtml);
  return { ok: r.ok, photo: false, mode: 'text' };
}
