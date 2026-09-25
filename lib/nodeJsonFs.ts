import fs from 'node:fs';
import path from 'node:path';

/**
 * 고정 폴더만 받는 JSON 헬퍼.
 * TP1004: 임의 filePath 인자를 readFileSync에 넘기지 않는다.
 */
type DataKind =
  | 'briefing-memory'
  | 'virtual-store'
  | 'confirmed-signals'
  | 'soft-signals'
  | 'alert-rules'
  | 'smart-workflow'
  | 'mtf-statistics-history'
  | 'telegram-confirm-phase'
  | 'whale-memory'
  | 'pre3-memory'
  | 'eagle1';

export function ensureDir(kind: DataKind): boolean {
  try {
    fs.mkdirSync(path.join(process.cwd(), 'data', kind), { recursive: true });
    return true;
  } catch {
    return false;
  }
}

export function readUtf8(kind: DataKind, fileName: string): string | null {
  try {
    if (kind === 'briefing-memory') {
      return fs.readFileSync(path.join(process.cwd(), 'data', 'briefing-memory', fileName), 'utf8');
    }
    if (kind === 'virtual-store') {
      return fs.readFileSync(path.join(process.cwd(), 'data', 'virtual-store', fileName), 'utf8');
    }
    if (kind === 'confirmed-signals') {
      return fs.readFileSync(path.join(process.cwd(), 'data', 'confirmed-signals', fileName), 'utf8');
    }
    if (kind === 'soft-signals') {
      return fs.readFileSync(path.join(process.cwd(), 'data', 'soft-signals', fileName), 'utf8');
    }
    if (kind === 'alert-rules') {
      return fs.readFileSync(path.join(process.cwd(), 'data', 'alert-rules', fileName), 'utf8');
    }
    if (kind === 'smart-workflow') {
      return fs.readFileSync(path.join(process.cwd(), 'data', 'smart-workflow', fileName), 'utf8');
    }
    if (kind === 'mtf-statistics-history') {
      return fs.readFileSync(path.join(process.cwd(), 'data', 'mtf-statistics-history', fileName), 'utf8');
    }
    if (kind === 'telegram-confirm-phase') {
      return fs.readFileSync(path.join(process.cwd(), 'data', 'telegram-confirm-phase', fileName), 'utf8');
    }
    if (kind === 'whale-memory') {
      return fs.readFileSync(path.join(process.cwd(), 'data', 'whale-memory', fileName), 'utf8');
    }
    if (kind === 'pre3-memory') {
      return fs.readFileSync(path.join(process.cwd(), 'data', 'pre3-memory', fileName), 'utf8');
    }
    return fs.readFileSync(path.join(process.cwd(), 'data', 'eagle1', fileName), 'utf8');
  } catch {
    return null;
  }
}

export function readJsonFile<T>(kind: DataKind, fileName: string, fallback: T): T {
  try {
    const raw = readUtf8(kind, fileName);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw || 'null');
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonFile(kind: DataKind, fileName: string, data: unknown): boolean {
  try {
    const body = JSON.stringify(data, null, 2);
    ensureDir(kind);
    if (kind === 'briefing-memory') {
      fs.writeFileSync(path.join(process.cwd(), 'data', 'briefing-memory', fileName), body, 'utf8');
    } else if (kind === 'virtual-store') {
      fs.writeFileSync(path.join(process.cwd(), 'data', 'virtual-store', fileName), body, 'utf8');
    } else if (kind === 'confirmed-signals') {
      fs.writeFileSync(path.join(process.cwd(), 'data', 'confirmed-signals', fileName), body, 'utf8');
    } else if (kind === 'soft-signals') {
      fs.writeFileSync(path.join(process.cwd(), 'data', 'soft-signals', fileName), body, 'utf8');
    } else if (kind === 'alert-rules') {
      fs.writeFileSync(path.join(process.cwd(), 'data', 'alert-rules', fileName), body, 'utf8');
    } else if (kind === 'smart-workflow') {
      fs.writeFileSync(path.join(process.cwd(), 'data', 'smart-workflow', fileName), body, 'utf8');
    } else if (kind === 'mtf-statistics-history') {
      fs.writeFileSync(path.join(process.cwd(), 'data', 'mtf-statistics-history', fileName), body, 'utf8');
    } else if (kind === 'telegram-confirm-phase') {
      fs.writeFileSync(path.join(process.cwd(), 'data', 'telegram-confirm-phase', fileName), body, 'utf8');
    } else if (kind === 'whale-memory') {
      fs.writeFileSync(path.join(process.cwd(), 'data', 'whale-memory', fileName), body, 'utf8');
    } else if (kind === 'pre3-memory') {
      fs.writeFileSync(path.join(process.cwd(), 'data', 'pre3-memory', fileName), body, 'utf8');
    } else {
      fs.writeFileSync(path.join(process.cwd(), 'data', 'eagle1', fileName), body, 'utf8');
    }
    return true;
  } catch {
    return false;
  }
}
