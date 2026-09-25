#!/usr/bin/env node
/**
 * Capture HUD screenshot + run visual regression (needs npm run dev).
 *   npm run eagle1:visual:e2e
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.EAGLE1_E2E = '1';

const r = spawnSync(
  'npx',
  ['playwright', 'test', 'e2e/eagle1-structure-desk-layout.spec.ts'],
  { cwd: ROOT, stdio: 'inherit', shell: true, env: process.env }
);
process.exit(r.status ?? 1);
