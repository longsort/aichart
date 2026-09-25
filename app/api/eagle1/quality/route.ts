import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

function readQualityReport(): unknown | null {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'data', 'eagle1', 'phase1-quality-report.json'), 'utf8')
    );
  } catch {
    return null;
  }
}

function readCoverageManifest(): unknown | null {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'data', 'eagle1', 'coverage-manifest.json'), 'utf8')
    );
  } catch {
    return null;
  }
}

function readRepaintAudit(): unknown | null {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'data', 'eagle1', 'repaint-audit.json'), 'utf8')
    );
  } catch {
    return null;
  }
}

/** Eagle1 coverage + quality reports. 가짜 숫자 없음. */
export async function GET() {
  const quality = readQualityReport();
  const coverage = readCoverageManifest();
  const repaint = readRepaintAudit();
  return NextResponse.json({
    quality,
    coverage,
    repaint,
    note: quality ? undefined : '데이터 없음',
  });
}
