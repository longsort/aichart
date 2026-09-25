import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');

const expected = [
  'schematics/wyckoff/accumulation-1.png',
  'schematics/wyckoff/accumulation-2.png',
  'schematics/wyckoff/distribution-1.png',
  'schematics/wyckoff/distribution-2.png',
  'schematics/wyckoff/price-cycle.png',
  'schematics/elliott/fig-8-1.png',
  'schematics/elliott/fig-8-2.png',
  'schematics/elliott/fig-8-3.png',
  'schematics/elliott/fig-8-4.png',
  'schematics/elliott/fig-8-5.svg',
  'schematics/dow/hh-hl.svg',
  'schematics/dow/lh-ll.svg',
  'schematics/dow/reversal-123.svg',
  'schematics/classical/hs.svg',
  'schematics/classical/ihs.svg',
  'schematics/classical/dt.svg',
  'schematics/classical/db.svg',
  'schematics/classical/tri-asc.svg',
  'schematics/classical/tri-desc.svg',
  'schematics/classical/tri-sym.svg',
  'schematics/classical/wedge-rise.svg',
  'schematics/classical/wedge-fall.svg',
  'schematics/classical/flag-bull.svg',
  'schematics/classical/flag-bear.svg',
  'schematics/classical/cup.svg',
  'schematics/harmonic/gartley.svg',
  'schematics/harmonic/bat.svg',
  'schematics/harmonic/butterfly.svg',
  'schematics/harmonic/crab.svg',
  'schematics/harmonic/shark.svg',
  'schematics/harmonic/cypher.svg',
  'schematics/harmonic/abcd.svg',
  'schematics/vsa/effort.svg',
  'schematics/ichimoku/cloud.svg',
  'schematics/chan/zs-123.svg',
  'schematics/smc/map.svg',
  'schematics/brooks/pa.svg',
  'schematics/fib/retrace.svg',
  'schematics/fib/extend.svg',
  'schematics/wolfe/wave.svg',
  'schematics/pitchfork/andrews.svg',
  'schematics/profile/tpo.svg',
  'schematics/pnf/xo.svg',
  'schematics/nison/candles.svg',
  'schematics/turtle/donchian.svg',
  'schematics/macro/hurst.svg',
];

let miss = 0;
for (const rel of expected) {
  const p = path.join(pub, rel);
  if (!fs.existsSync(p) || fs.statSync(p).size < 200) {
    console.error('MISSING', rel);
    miss++;
  }
}
if (miss) {
  console.error(`fail: ${miss} missing`);
  process.exit(1);
}
console.log(`ok: ${expected.length} schematic files present`);
