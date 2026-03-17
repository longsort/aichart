export function matchReferences(engine: Record<string, any>) {
  const tags: string[] = [];
  if ((engine.bos || []).length) tags.push('bos');
  if ((engine.choch || []).length) tags.push('choch');
  if ((engine.fvg || []).length) tags.push('fvg');
  if ((engine.obs || []).length) tags.push('ob');
  if ((engine.sweeps || []).length) tags.push('liquidity');
  if ((engine.eqh || []).length || (engine.eql || []).length) tags.push('eqh-eql');
  if ((engine.patterns || []).length) tags.push('pattern');

  const labels = (engine.patterns || []).map((p: any) => String(p.label || '').toLowerCase()).join(' ');
  if (labels.includes('triangle')) tags.push('triangle');
  if (labels.includes('flag')) tags.push('flag');
  if (labels.includes('wedge')) tags.push('wedge');
  if (engine.trend === 'bullish') tags.push('bull');
  if (engine.trend === 'bearish') tags.push('bear');

  const library = [
    { id: 'ref_smc_001', tags: ['bos', 'fvg', 'ob', 'bull'] },
    { id: 'ref_smc_002', tags: ['choch', 'liquidity', 'fvg', 'bear'] },
    { id: 'ref_smc_003', tags: ['eqh-eql', 'liquidity', 'bos'] },
    { id: 'ref_pattern_004', tags: ['pattern', 'triangle', 'bos'] },
    { id: 'ref_pattern_005', tags: ['pattern', 'flag', 'bull'] },
    { id: 'ref_pattern_006', tags: ['pattern', 'wedge', 'bear'] }
  ];

  return library.map(item => ({
    id: item.id,
    tags: item.tags,
    score: item.tags.filter(tag => tags.includes(tag)).length / Math.max(1, item.tags.length)
  })).sort((a, b) => b.score - a.score).slice(0, 3);
}
