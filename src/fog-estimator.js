// AUTO 3.0: lightweight, untrained haze-severity estimator for client-side use.
// Inspired by Dark Channel Prior, local contrast, and saturation cues.
// NOT the published FADE model and NOT a calibrated meteorological fog sensor.
export class HazeEstimator {
  constructor() { this.score=null; this.level='unknown'; }
  analyze(imageData, night=false, instant=false) {
    const {data,width:w,height:h}=imageData;
    let ws=0, dark=0, grad=0, saturation=0, brightness=0, count=0;
    const pixel=(x,y) => {
      const i=4*(y*w+x),r=data[i]/255,g=data[i+1]/255,b=data[i+2]/255;
      return [r,g,b,0.2126*r+0.7152*g+0.0722*b];
    };
    // Skip much of the upper image: sky and overexposed regions mimic haze.
    for(let y=Math.floor(h*.20); y<h-3; y+=3) {
      for(let x=3; x<w-3; x+=3) {
        const p=pixel(x,y),q=pixel(x+3,y),t=pixel(x,y+3);
        const lum=p[3],sat=Math.max(p[0],p[1],p[2])-Math.min(p[0],p[1],p[2]);
        const weight=Math.max(0.1,Math.min(1,(lum-.06)*6))*(lum>.91?.32:1);
        const d=Math.min(p[0],p[1],p[2],q[0],q[1],q[2],t[0],t[1],t[2]);
        const edge=Math.min(1,(Math.abs(lum-q[3])+Math.abs(lum-t[3]))*5.0);
        dark+=weight*d;
        grad+=weight*edge;
        saturation+=weight*sat;
        brightness+=weight*lum;
        ws+=weight;count++;
      }
    }
    if(!ws||count<20) return null;
    const darkMean=dark/ws, edgeMean=grad/ws, satMean=saturation/ws, luma=brightness/ws;
    // Robustness: the score is a heuristic, not a validated haze-density percentage.
    const darkCue=Math.max(0,Math.min(1,(darkMean-.055)/.41));
    const flatCue=Math.max(0,Math.min(1,(.37-edgeMean)/.37));
    const satCue=Math.max(0,Math.min(1,(.31-satMean)/.31));
    let raw=Math.max(0,Math.min(1,.60*darkCue+.27*flatCue+.13*satCue));
    if(night || luma<.19) raw=Math.min(raw,.65); // Night/underexposure: lower confidence.
    const alpha=instant||this.score===null?1:Math.abs(raw-this.score)>.42?.45:.20;
    this.score=this.score===null?raw:(1-alpha)*this.score+alpha*raw;
    const bounds=[.26,.47,.70], levels=['clear','light','medium','dense'];
    let idx=0;while(idx<bounds.length&&this.score>=bounds[idx])idx++;
    const old=levels.indexOf(this.level);
    if(old>=0 && Math.abs(old-idx)===1) {
      const boundary=bounds[Math.min(old,idx)];
      if(Math.abs(this.score-boundary)<.035)idx=old;
    }
    this.level=levels[idx];
    const labels={clear:'Серпанок не виявлено',light:'Легкий серпанок',medium:'Середній серпанок',dense:'Сильний серпанок / туман'};
    return {level:this.level,label:labels[this.level],score:this.score,percent:Math.round(this.score*100),
      lowConfidence:night||luma<.19, metrics:{darkMean,edgeMean,satMean,luma}};
  }
}
