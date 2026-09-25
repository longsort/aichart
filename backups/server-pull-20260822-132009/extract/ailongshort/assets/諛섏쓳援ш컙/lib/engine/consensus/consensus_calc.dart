
class ConsensusCalc {
  static double calc(Map<String,double> v){
    if(v.isEmpty) return 0.0;
    double sum=0;
    v.forEach((_,x)=>sum+=x);
    return sum / v.length;
  }
}
