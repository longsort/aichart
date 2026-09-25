/**
 * assets 353 이미지 카탈로그 — 구조 특징·작도 템플릿.
 */
import catalogJson from '@/data/assets-image-catalog.json';
import type { StructureFeatures } from '@/types/reference';

export type AssetsDrawElement =
  | {
      type: 'zone';
      role: string;
      pricePctTop: number;
      pricePctBot: number;
      timePctStart: number;
      timePctEnd: number;
    }
  | {
      type: 'hline';
      role: string;
      pricePct?: number;
      price?: number;
      label?: string;
    }
  | {
      type: 'trend';
      role: string;
      pricePctStart: number;
      pricePctEnd: number;
      timePctStart: number;
      timePctEnd: number;
      label?: string;
    };

export type AssetsDrawTemplate = {
  mode: 'relative' | 'absolute_prices';
  elements: AssetsDrawElement[];
};

export type AssetsImageCatalogEntry = {
  id: string;
  path: string;
  category: string;
  chartable: boolean;
  titleKo: string;
  tags: string[];
  structureFeatures: StructureFeatures;
  drawTemplate: AssetsDrawTemplate | null;
};

export type AssetsImageCatalog = {
  version: number;
  total: number;
  chartable: number;
  generatedAt: string;
  entries: AssetsImageCatalogEntry[];
};

const catalog = catalogJson as AssetsImageCatalog;

export function getAssetsImageCatalog(): AssetsImageCatalog {
  return catalog;
}

export function getChartableAssetsEntries(): AssetsImageCatalogEntry[] {
  return catalog.entries.filter((e) => e.chartable && e.drawTemplate?.elements?.length);
}

export function getAssetsCatalogEntryById(id: string): AssetsImageCatalogEntry | undefined {
  return catalog.entries.find((e) => e.id === id);
}
