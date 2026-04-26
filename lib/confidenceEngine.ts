export type ConfidenceInput = {
  mtfAlignmentScore?: number;
  regimeConsistency?: boolean;
  signalConflict?: boolean;
  dataQuality?: 'full' | 'partial' | 'minimal';
  patternStrength?: number;
  liquidityAlignment?: boolean;
  volumeConfirmation?: boolean;
  longScore?: number;
  shortScore?: number;
  /** AI·고래 모드: 정렬·스프레드 가중 강화 */
  aiModeMax?: boolean;
};

export type ConfidenceResult = {
  confidence: number;
  confidenceGrade: string;
  riskFlags: string[];
  conflicts: string[];
};

const GRADE_MAP: Array<{ min: number; grade: string }> = [
  { min: 85, grade: 'A' },
  { min: 75, grade: 'B' },
  { min: 65, grade: 'C' },
  { min: 55, grade: 'D' },
  { min: 0, grade: 'F' },
];

export function computeConfidence(input: ConfidenceInput): ConfidenceResult {
  const riskFlags: string[] = [];
  const conflicts: string[] = [];
  const mx = input.aiModeMax === true;
  let confidence = mx ? 58 : 55;

  if (input.mtfAlignmentScore != null) {
    if (input.mtfAlignmentScore >= 70) confidence += mx ? 16 : 12;
    else if (input.mtfAlignmentScore >= 50) confidence += mx ? 8 : 5;
    else if (input.mtfAlignmentScore < 40) {
      confidence -= mx ? 12 : 8;
      conflicts.push('MTF 불일치');
    }
  }

  if (input.regimeConsistency === true) confidence += mx ? 6 : 5;
  if (input.signalConflict === true) {
    confidence -= mx ? 12 : 10;
    conflicts.push('신호 충돌');
  }

  if (input.dataQuality === 'full') confidence += mx ? 6 : 5;
  else if (input.dataQuality === 'minimal') confidence -= mx ? 6 : 5;

  if (input.patternStrength != null && input.patternStrength > 0.6) confidence += mx ? 6 : 5;
  if (input.liquidityAlignment === true) confidence += mx ? 5 : 4;
  if (input.volumeConfirmation === true) confidence += mx ? 4 : 3;

  const spread = Math.abs((input.longScore ?? 50) - (input.shortScore ?? 50));
  if (spread >= 25) confidence += mx ? 7 : 5;
  else if (spread < 10) {
    confidence -= mx ? 7 : 5;
    riskFlags.push('롱/숏 점수 근접');
  }

  confidence = Math.max(mx ? 28 : 30, Math.min(mx ? 97 : 95, confidence));

  const grade = GRADE_MAP.find(g => confidence >= g.min)?.grade ?? 'F';

  return {
    confidence,
    confidenceGrade: grade,
    riskFlags,
    conflicts,
  };
}
