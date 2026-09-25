/**
 * 통합·분석 — 파란/빨간 채널·게이트 라벨 설명 사전.
 * 차트 라벨 클릭·툴팁용 · 교육·참고(확정·승률 아님).
 */

export type MergedDeskRbLabelExplain = {
  title: string;
  body: string;
};

  const GUIDE: Record<string, MergedDeskRbLabelExplain> = {
  지지: {
    title: '지지',
    body:
      'LOCK 채널 하단(또는 현재 역할상 지지 레일)입니다. 테두리는 고정되고, 종가가 이 근처·위에 있으면 지지로 라벨이 자동 갱신됩니다. 심지 관통만으로는 바꾸지 않습니다.',
  },
  저항: {
    title: '저항',
    body:
      'LOCK 채널 상단(또는 현재 역할상 저항 레일)입니다. 종가 기준으로 저항 터치/거절을 관찰합니다. 확정 숏 신호가 아닙니다.',
  },
  돌파: {
    title: '돌파',
    body:
      '종가가 고정 채널 상단 위 또는 하단 아래로 나간 상태입니다. 아직 안착 전이면 확인 중이며, 진입 확정이 아닙니다.',
  },
  안파: {
    title: '안파',
    body:
      '채널 중선·내부 구간입니다. 가격이 통로 안에 있을 때 자동으로 붙는 라벨입니다.',
  },
  안착: {
    title: '안착',
    body:
      '돌파 후 종가가 채널 밖에서 유지되는 참고 단계입니다. 조건부 관찰이며 확정 수익·승률이 아닙니다.',
  },
  단기: {
    title: '단기 채널',
    body:
      '현재 차트 타임프레임 안에서 최근 스윙(짧은 lookback)으로 그린 평행 복도입니다. ‘차트 TF=일봉이니 장기’가 아니라, 같은 봉 시리즈 안의 짧은 구조 구간입니다. 최근 기울기·터치가 여기에 더 민감합니다.',
  },
  장기: {
    title: '장기 채널',
    body:
      '같은 차트 안에서 더 긴 lookback 스윙으로 그린 평행 복도입니다. 단기보다 완만하고 넓을 수 있으며, 상위 구조·확인용 윤곽으로 씁니다. 게이트 판정이 장기 엣지를 이길 때만 게이트 캡션이 장기 띠에 붙습니다.',
  },
  상승채널: {
    title: '상승 채널(파란 계열)',
    body:
      '고·저점이 우상향 평행선으로 묶인 구간입니다. 보통 하단=지지·상단=저항 후보로 봅니다. 파란 면/선은 상승 쪽 팔레트이며, 색만으로 매수 확정이 아닙니다.',
  },
  하락채널: {
    title: '하락 채널(빨간 계열)',
    body:
      '고·저점이 우하향 평행선으로 묶인 구간입니다. 보통 상단=저항·하단=지지 후보로 봅니다. 빨간 면/선은 하락 쪽 팔레트이며, 색만으로 매도 확정이 아닙니다.',
  },
  중착복도: {
    title: '중착복도(中着複道)',
    body:
      '단기 채널 tip(현재 끝 가격폭)과 장기 채널 tip이 겹치는 구간입니다. 두 복도가 ‘한 층에 겹쳐 앉은’ 가격대라서 중착(겹침)·복도(채널)라고 부릅니다. 가격이 이 안에 있으면 게이트 후보에 가점만 줄 수 있고, 진입·수익을 보장하지 않습니다.',
  },
  중착복도정렬: {
    title: '중착복도 · 정렬',
    body:
      '단기·장기 기울기(상승/하락)가 같은 방향일 때입니다. 겹침+방향 일치라 구조 정합이 상대적으로 낫다고 보지만, 여전히 조건부 참고입니다.',
  },
  중착복도혼조: {
    title: '중착복도 · 혼조',
    body:
      '가격폭은 겹치지만 단기·장기 방향이 어긋난 상태입니다. 혼조 중착은 가점이 작고, 돌파·이탈 시 어느 쪽이 남을지 더 불확실합니다.',
  },
  채널게이트: {
    title: '◆매수관점 / ◆매도관점 / ◆관망',
    body:
      '파란·빨간 띠에 묶인 기능(채널 기울기·기관밴드·거래량 수급·Hot/$$$$·로켓·사이클·패턴·분석 verdict·MTF·확정게이트·AI면)을 한 표결로 합친 마스터 방향입니다. 한 번에 매수 또는 매도 한쪽만 보이고, 증거가 갈리면 관망입니다. 봉마다 롱↔숏을 바꾸지 않으며, 반대 증거가 충분할 때만 전환합니다. 투자 지시·확정 신호가 아닙니다.',
  },
  매수관점: {
    title: '◆매수관점',
    body:
      '지금 띠 세트의 주 방향이 매수쪽입니다. 숏 게이트·숏 목표는 숨깁니다. 눌림·돌파 안착 전엔 대기고, 안착참고여도 본인 손절이 우선입니다.',
  },
  매도관점: {
    title: '◆매도관점',
    body:
      '지금 띠 세트의 주 방향이 매도쪽입니다. 롱 게이트·롱 목표는 숨깁니다. 반등 저항·하방 안착 전엔 대기고, 확정 매도가 아닙니다.',
  },
  관망: {
    title: '◆관망',
    body:
      '매수·매도 표결이 비슷하거나 단기·장기 채널이 엇갈려 방향을 정하지 못한 상태입니다. 이때는 게이트 목표가 양쪽으로 흔들리지 않게 끕니다. 관망도 판단입니다.',
  },
  돌파가능: {
    title: '돌파가능',
    body:
      '종가가 아직 확정 돌파 전이나, 고/저가·근접으로 채널 바깥을 위협하는 단계입니다. 대기 구간이며 진입 허용이 아닙니다.',
  },
  돌파: {
    title: '돌파',
    body:
      '종가가 채널 상단(롱) 또는 하단(숏) 바깥으로 나간 상태입니다. 아직 안착(다봉 유지·재테스트 홀드) 전이면 진입 금지입니다.',
  },
  안착확정: {
    title: '안착확정',
    body:
      '돌파 후 종가가 채널 밖에서 유지되거나 재테스트 후 홀드된 단계입니다. 이 상태에서만 채널게이트가 진입 허용(조건부)으로 바뀝니다. 확정 수익·승률이 아닙니다.',
  },
  돌파실패: {
    title: '돌파실패',
    body:
      '돌파처럼 보이다가 종가가 다시 채널 안으로 복귀한 상태입니다. 가짜 돌파로 보고 진입을 막습니다.',
  },
  지지가능: {
    title: '지지가능',
    body:
      '하단 근처에서 반응·홀드 후보입니다. 바로 롱 진입 신호가 아니라, 하단 엣지 반응을 관찰하라는 표시입니다.',
  },
  저항가능: {
    title: '저항가능',
    body:
      '상단 근처에서 반응·거절 후보입니다. 바로 숏 진입 신호가 아니라, 상단 엣지 반응을 관찰하라는 표시입니다.',
  },
  진입: {
    title: '진입(E)',
    body:
      '안착확정 시 참고 진입가(전체 가로 가격선). 본인 손절·포지션 규칙이 우선이며, 앱이 체결을 대신하지 않습니다.',
  },
  손절: {
    title: '손절(SL)',
    body:
      '채널·버퍼 기준 무효화/손절 참고가입니다. 깨지면 시나리오 무효로 보는 선입니다.',
  },
  목표가: {
    title: '◆게이트상승/하락목표',
    body:
      '마스터 매수/매도 관점과 같은 쪽만 그리는 목표입니다. 면 네모가 아니라 TP1·TP2·TP3 전폭 가격선(+마지막봉 핀)입니다. 바운스는 단기 중선·상/하단·장기 레일, 돌파는 채널폭 측정이동을 기본으로 한 뒤 중착·기관(ST)·Hot/$$$$·분석 지지·저항·OB에 스냅합니다. 반대 방향 목표는 숨깁니다. 도달·수익·승률을 보장하지 않습니다.',
  },
  채널면: {
    title: '1분면 / 15분면',
    body:
      '파란빨강 띠는 그대로 두고, 하위·상위 TF 최근 범위를 전폭 점선/파선 + 마지막봉 핀으로 표시합니다. 큰 세로 네모가 아닙니다. 상위면과 하위면이 어긋나면 대기 우선입니다.',
  },
  매수면: {
    title: '매수면 / 매도면',
    body:
      '채널 하단(매수강) 또는 상단(매도강) 수급이 붙을 때 그 엣지에 실선+핀을 붙입니다. 바로 진입 지시가 아닙니다.',
  },
  핵심돌파: {
    title: '핵심돌파',
    body:
      '파랑빨강띠(채널) 상단 또는 하단 레일을 종가가 바깥으로 나가려는 자리입니다. 대기→돌파→안착 순으로 바뀝니다. 확정 매매가 아닙니다.',
  },
  핵심안착: {
    title: '핵심안착',
    body:
      '상방: 상단 레일 밖 종가 유지. 하방: 하단 레일 밖 유지이거나, 하락 후 하단 존에 앉아 홀드되면 안착성공으로 봅니다. 조건부 참고이며 수익·승률 보장이 아닙니다.',
  },
  핵심실패: {
    title: '핵심돌파 실패',
    body:
      '파랑빨강띠 상·하단을 고/저가 또는 종가로 뚫은 뒤, 종가가 다시 띠 안으로 복귀한 가짜돌파입니다. 레일 테두리에 하얀 네모로 표시합니다. 진입을 막는 참고이며 승률·수익 보장이 아닙니다.',
  },
  무효: {
    title: '무효·게이트무효',
    body:
      '시나리오가 깨졌다고 보는 가격선입니다. 돌파실패·손절과 같은 맥락의 참고선입니다.',
  },
  파란띠: {
    title: '초록 띠(상승 통로)',
    body:
      '기울기가 위인 복도는 초록입니다. 상승 통로·롱 쪽 강조이지, 지금 매수 신호가 아닙니다. 옛 파란 팔레트와 같은 기능입니다.',
  },
  빨간띠: {
    title: '빨간 띠(하락 통로)',
    body:
      '기울기가 아래인 복도는 빨강입니다. 하락 통로·숏 쪽 강조이지, 지금 매도 신호가 아닙니다.',
  },
  상승가능: {
    title: '상승가능 / 횡보·상승가능',
    body:
      '복도 상단 근처이거나 횡보 중 매수수급이 붙을 때 점선+핀입니다. 돌파 대기·관찰이며 진입 허용이 아닙니다.',
  },
  횡보: {
    title: '횡보·수급',
    body:
      '복도 기울기가 평탄할 때입니다. 띠와 거래량 막대는 회색으로 멈추지 않고 매수/매도 비율로 초록↔빨강을 계속 섞습니다.',
  },
};

function pickKeys(raw: string): string[] {
  const t = String(raw || '');
  const keys: string[] = [];
  if (/중착복도.*정렬|정렬.*중착/.test(t) || (t.includes('중착') && t.includes('정렬'))) keys.push('중착복도정렬');
  else if (/중착복도.*혼조|혼조.*중착/.test(t) || (t.includes('중착') && t.includes('혼조'))) keys.push('중착복도혼조');
  else if (t.includes('중착')) keys.push('중착복도');
  if (t.includes('매수관점') || (t.includes('◆매수') && !t.includes('매도'))) keys.push('매수관점');
  if (t.includes('매도관점') || t.includes('◆매도')) keys.push('매도관점');
  if (t.includes('관망') || t.includes('매수매도불명')) keys.push('관망');
  if (t.includes('채널게이트') || t.includes('◆게이트') || /^◆/.test(t) && t.includes('게이트')) keys.push('채널게이트');
  if (t.includes('안착확정')) keys.push('안착확정');
  else if (t.includes('돌파실패')) keys.push('돌파실패');
  else if (t.includes('돌파가능') || t.includes('돌파전대기')) keys.push('돌파가능');
  else if (t.includes('돌파') || t.includes('안착대기')) keys.push('돌파');
  if (t.includes('지지가능')) keys.push('지지가능');
  if (t.includes('저항가능')) keys.push('저항가능');
  if (t.includes('장기')) keys.push('장기');
  if (t.includes('단기')) keys.push('단기');
  if (t.includes('상승')) keys.push('상승채널');
  if (t.includes('하락')) keys.push('하락채널');
  if (/진입|안착확정·.*진입|E\d/.test(t) && !t.includes('진입금지')) keys.push('진입');
  if (t.includes('손절') || /\bSL\b/.test(t)) keys.push('손절');
  if (t.includes('목표') || t.includes('TP') || t.includes('게이트상승') || t.includes('게이트하락')) keys.push('목표가');
  if (/\d분면|채널면/.test(t)) keys.push('채널면');
  if (t.includes('매수면') || t.includes('매도면')) keys.push('매수면');
  if (/핵심실패|핵심돌파\s*실패/.test(t)) keys.push('핵심실패');
  else if (t.includes('핵심안착')) keys.push('핵심안착');
  else if (t.includes('핵심돌파')) keys.push('핵심돌파');
  if (t.includes('무효')) keys.push('무효');
  if (t.includes('파란') || t.includes('초록') || /bull|상승채널|상승통로/.test(t)) keys.push('파란띠');
  if (t.includes('빨간') || /bear|하락채널|하락통로/.test(t)) keys.push('빨간띠');
  if (t.includes('상승가능')) keys.push('상승가능');
  if (t.includes('횡보')) keys.push('횡보');
  return [...new Set(keys)];
}

/** 라벨·기존 tooltip → 클릭 패널용 긴 설명 */
export function explainMergedDeskRbLabel(
  label: string,
  labelTooltip?: string | null
): string {
  const raw = `${label || ''} ${labelTooltip || ''}`.trim();
  const keys = pickKeys(raw);
  const parts: string[] = [];
  if (String(label || '').trim()) parts.push(`【${String(label).trim()}】`);
  if (keys.length) {
    for (const k of keys) {
      const g = GUIDE[k];
      if (!g) continue;
      parts.push(`${g.title}\n${g.body}`);
    }
  } else {
    parts.push(
      '파란·빨간 평행 채널/게이트 관련 표시입니다. 단기·장기는 같은 차트 안 lookback 길이 차이이며, 중착복도는 두 tip 폭이 겹친 구간입니다. 교육·참고용이며 확정 신호·수익 보장이 아닙니다.'
    );
  }
  if (String(labelTooltip || '').trim()) {
    parts.push(`요약: ${String(labelTooltip).trim()}`);
  }
  parts.push('※ 조건부 참고 · 확정 매매·승률 아님');
  return parts.join('\n\n');
}

/** overlay 생성 시 labelTooltip에 붙일 짧은+핵심 설명 */
export function mergedDeskRbTooltipLines(parts: string[]): string {
  return parts.filter(Boolean).join(' · ');
}

export function mergedDeskRbGuideSnippet(...keys: (keyof typeof GUIDE)[]): string {
  return keys
    .map((k) => GUIDE[k])
    .filter(Boolean)
    .map((g) => `${g!.title}: ${g!.body}`)
    .join(' ');
}
