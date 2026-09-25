
export function detectCHOCH(candles){
  const r=[]
  for(let i=2;i<candles.length;i++){
    if(candles[i].low<candles[i-1].low && candles[i].low<candles[i-2].low){
      r.push({type:'CHOCH',price:candles[i].low})
    }
  }
  return r
}
