// AUTO 3.1: cautious, single-frame DCP-inspired severity estimator.
// Relative image heuristic. It is NOT FADE, a visibility sensor or a calibrated fog measurement.
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const quantile=(sorted,p)=>sorted[Math.max(0,Math.min(sorted.length-1,Math.floor((sorted.length-1)*p)))];

export function estimateFog(imageData){
  const {width:w,height:h,data}=imageData;
  if(!data||w<24||h<20||data.length<w*h*4)
    return {valid:false,density:0,confidence:0,reason:'Немає кадру для аналізу'};
  const len=w*h, Y=new Float32Array(len), D=new Float32Array(len), S=new Float32Array(len);
  let black=0,white=0,meanAll=0;
  const lumi=[];
  for(let i=0;i<len;i++){
    const j=i*4,r=data[j]/255,g=data[j+1]/255,b=data[j+2]/255;
    const mx=Math.max(r,g,b),mn=Math.min(r,g,b),v=.2126*r+.7152*g+.0722*b;
    Y[i]=v;D[i]=mn;S[i]=(mx-mn)/Math.max(.1,mx);
    meanAll+=v;
    if(v<.065)black++;
    if(v>.97)white++;
    if(i%3===0)lumi.push(v);
  }
  meanAll/=len;
  if(black/len>.74) return {valid:false,density:0,confidence:0,brightness:meanAll,reason:'Кадр майже чорний — недостатньо інформації'};
  if(white/len>.83) return {valid:false,density:0,confidence:0,brightness:meanAll,reason:'Кадр пересвічений — недостатньо інформації'};
  lumi.sort((a,b)=>a-b);
  const span=quantile(lumi,.90)-quantile(lumi,.10);
  const dark=[],saturation=[],edges=[];
  let eligible=0,considered=0,sky=0;
  // Sample the image below the likely sky, excluding saturated highlights and deep shadows.
  for(let y=2;y<h-2;y+=2){for(let x=2;x<w-2;x+=2){
    considered++;
    const i=y*w+x,lum=Y[i],sat=S[i];
    const skyCandidate=y<h*.52 && lum>.71 && sat<.17;
    if(skyCandidate){sky++;continue;}
    if(lum<.075||lum>.97)continue;
    const d=Math.min(D[i],D[i-1],D[i+1],D[i-w],D[i+w]);
    const edge=(Math.abs(lum-Y[i-1])+Math.abs(lum-Y[i+1])+
                 Math.abs(lum-Y[i-w])+Math.abs(lum-Y[i+w]))/4;
    dark.push(d);
    saturation.push(sat);
    edges.push(edge);
    eligible++;
  }}
  const coverage=eligible/Math.max(1,considered);
  if(eligible<Math.max(55,considered*.21))return {
    valid:false,density:0,confidence:0,brightness:meanAll,reason:'Замало інформативних ділянок'};
  const edgeMean=edges.reduce((a,b)=>a+b,0)/eligible;
  if(span<.085 && edgeMean<.016) return {
    valid:false,density:0,confidence:0,brightness:meanAll,reason:'Однорідний кадр: туман неможливо відрізнити від фону'};
  dark.sort((a,b)=>a-b);
  saturation.sort((a,b)=>a-b);
  const dc=quantile(dark,.30),sat=quantile(saturation,.50);
  const darkScore=clamp((dc-.07)/.48);
  const flatScore=clamp((.072-edgeMean)/.064);
  const lowSatScore=clamp((.40-sat)/.40);
  let density=clamp(.67*darkScore+.22*flatScore+.11*lowSatScore);
  if(meanAll<.27)density*=clamp(.57+meanAll,.62,.86);
  // Confidence describes how much visual evidence is available, NOT a probability of correctness.
  const information=clamp((span-.06)/.27);
  const texture=clamp(edgeMean/.047);
  const confidence=clamp((.16+.52*information+.32*texture)*clamp(coverage/.72)*(.55+.45*clamp((meanAll-.07)/.23)));
  if(confidence<.22)return {
    valid:false,density:0,confidence,brightness:meanAll,reason:'Оцінка ненадійна для цього кадру'};
  return {valid:true,density,confidence,brightness:meanAll,darkChannel:dc,
    localContrast:edgeMean,saturation:sat,coverage,skyFraction:sky/Math.max(1,considered),dynamicRange:span};
}
export function fogLabel(fog){
  if(fog<.19)return 'Туман не виявлено';
  if(fog<.40)return 'Легкий серпанок';
  if(fog<.67)return 'Середній серпанок';
  return 'Густий серпанок';
}
