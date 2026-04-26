/** AI 압축→장대: 한 번에 켜기 쉬운 프리셋 (ATR 배수 + 거래량 필터) */

export type AiCompressionPresetId = 'sensitive' | 'balanced' | 'strict' | 'custom';

export type AiCompressionPresetValues = {
  aiCompressionAvgRangeAtr: number;
  aiCompressionMaxRangeAtr: number;
  aiImpulseRangeAtr: number;
  aiImpulseBodyAtr: number;
  aiCompressionVolumeFilter: boolean;
};

export const AI_COMPRESSION_PRESETS: Record<
  Exclude<AiCompressionPresetId, 'custom'>,
  { label: string; hint: string; values: AiCompressionPresetValues }
> = {
  sensitive: {
    label: '민감',
    hint: '횡보·큰 봉을 넓게 잡음. 박스·불릿이 자주 뜸.',
    values: {
      aiCompressionAvgRangeAtr: 0.56,
      aiCompressionMaxRangeAtr: 0.74,
      aiImpulseRangeAtr: 1.02,
      aiImpulseBodyAtr: 0.4,
      aiCompressionVolumeFilter: false,
    },
  },
  balanced: {
    label: '균형',
    hint: '기본값. 너무 잦지도 드물지도 않게.',
    values: {
      aiCompressionAvgRangeAtr: 0.5,
      aiCompressionMaxRangeAtr: 0.65,
      aiImpulseRangeAtr: 1.12,
      aiImpulseBodyAtr: 0.48,
      aiCompressionVolumeFilter: false,
    },
  },
  strict: {
    label: '보수',
    hint: '좁은 횡보 + 큰 봉만 인정. 거래량 축소까지 요구.',
    values: {
      aiCompressionAvgRangeAtr: 0.42,
      aiCompressionMaxRangeAtr: 0.58,
      aiImpulseRangeAtr: 1.22,
      aiImpulseBodyAtr: 0.54,
      aiCompressionVolumeFilter: true,
    },
  },
};

export function patchForAiCompressionPreset(
  id: Exclude<AiCompressionPresetId, 'custom'>
): AiCompressionPresetValues & { aiCompressionPreset: AiCompressionPresetId } {
  return {
    aiCompressionPreset: id,
    ...AI_COMPRESSION_PRESETS[id].values,
  };
}
