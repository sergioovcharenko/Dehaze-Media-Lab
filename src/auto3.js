// AUTO 3.0 — lightweight DCP-inspired heuristic, NOT the published FADE model.
// Operates only on a downsampled original image. No camera upload / ML weights.
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));

export function estimateFog(imageData){
  const {width:w,height:h,data:d}=imageData;
  if(w<5||h<5)return {valid:false,density:0,confidence:0};
  const L=new Float32Array(w*h),D=new Float32Array(w*h),S=new Float32Array(w*h);
  let sumY=0;
  for(let i=0;i<w*h;i++){
    const r=d[i*4]/255,g=d[i*4+1]/255,b=d[i*4+2]/255;
    const max=Math.max(r,g,b),min=Math.min(r,g,b);
    L[i]=.2126*r+.7152*g+.0722*b;
    D[i]=min;
    S[i]=(max-min)/Math.max(.08,max);
    sumY+=L[i];
  }
  const overall=sumY/(w*h);
  let n=0,candidates=0,sd=0,sc=0,ss=0,sy=0,sy2=0,sky=0;
  for(let y=1;y<h-1;y+=2)for(let x=1;x<w-1;x+=2){
    candidates++;
    const i=y*w+x, lum=L[i], sat=S[i];
    // Ignore likely bright clear sky and clipped highlights: low-information regions.
    if((y<h*.50&&lum>.73&&sat<.14)||(lum>.97&&sat<.06)){sky++;continue;}
    if(lum<.08)continue; // Very dark regions are unreliable for a dark-channel estimate.
    const dark=Math.min(D[i],D[i-1],D[i+1],D[i-w],D[i+w]);
    const edge=(Math.abs(lum-L[i+1])+Math.abs(lum-L[i-1])+
      Math.abs(lum-L[i+w])+Math.abs(lum-L[i-w]))*.25;
    sd+=dark;sc+=edge;ss+=sat;sy+=lum;sy2+=lum*lum;n++;
  }
  if(n<Math.max(14,candidates*.12))return {
    valid:false,density:0,confidence:0,brightness:overall,reason:'Надто мало інформативних ділянок'};
  const dcp=sd/n,contrast=sc/n,saturation=ss/n,mean=sy/n;
  const deviation=Math.sqrt(Math.max(0,sy2/n-mean*mean));
  // Calibrated only as a conservative starting heuristic; percentages are NOT
  // a physical measurement of meteorological visibility or fog density.
  const darkScore=clamp((dcp-.13)/.56);
  const lowContrast=clamp((.085-contrast)/.085);
  const lowSaturation=clamp((.42-saturation)/.42);
  let density=.73*darkScore+.19*lowContrast+.08*lowSaturation;
  if(overall<.30)density*=clamp(.6+overall*.9,.65,.90); // Night ambiguity.
  density=clamp(density);
  const coverage=n/Math.max(1,candidates);
  const texture=clamp((deviation-.017)/.095);
  const confidence=clamp((.25+.75*texture)*clamp(coverage/.75)*.98);
  return {valid:true,density,confidence,brightness:overall,
    darkChannel:dcp,localContrast:contrast,saturation,coverage,skyFraction:sky/Math.max(1,candidates)};
}
export function fogLabel(fog){
  if(fog<.19)return 'Туман не виявлено';
  if(fog<.40)return 'Легкий серпанок';
  if(fog<.67)return 'Середній серпанок';
  return 'Густий серпанок';
}
