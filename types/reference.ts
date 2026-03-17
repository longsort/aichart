export type StructureFeatures = {
  bos?: boolean;
  choch?: boolean;
  fvg?: number;
  ob?: number;
  sweep?: boolean;
  pattern?: string;
  bias?: 'bullish' | 'bearish' | 'neutral';
  eqh?: boolean;
  eql?: boolean;
};

export type ReferenceItem = {
  id: string;
  title: string;
  tags: string[];
  description?: string;
  patternType?: string;
  structureFeatures: StructureFeatures;
  exampleBriefing?: string;
  outcome?: string;
  imagePath?: string;
  imageMeta?: { width?: number; height?: number; mime?: string };
};

/** 학습된 패턴 레퍼런스 (이미지/설명/자료 기반). 패턴 기억 AI용 */
export type Pattern = {
  id: string;
  title: string;
  tags: string[];
  features: StructureFeatures;
  outcome: string;
  briefing: string;
};
