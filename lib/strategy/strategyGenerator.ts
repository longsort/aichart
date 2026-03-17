export type Strategy = {
  name: string;
  entryCondition: string;
  stopRule: string;
  tpRule: string;
  riskReward: number;
  tags: string[];
};

export function generateStrategies(): Strategy[] {
  return [
    { name: 'BOS 추종', entryCondition: 'BOS 발생 후 FVG 터치', stopRule: 'CHOCH 반대편', tpRule: '1.5R ~ 2R', riskReward: 1.5, tags: ['bos', 'fvg'] },
    { name: 'EQH/EQL 반등', entryCondition: '등가선 터치 후 스윕', stopRule: 'EQ 반대편', tpRule: '다음 EQ', riskReward: 1.2, tags: ['eqh', 'eql'] },
    { name: 'OB 반등', entryCondition: 'OB 존 터치', stopRule: 'OB 아래/위', tpRule: '2R', riskReward: 2, tags: ['ob'] },
  ];
}
