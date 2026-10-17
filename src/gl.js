const VERTEX = `attribute vec2 a_position;
varying highp vec2 v_uv;
void main(){
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

export class DehazeGL {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true, depth: false, stencil: false, powerPreference: 'high-performance' });
    if (!this.gl) throw new Error('WebGL не підтримується браузером або вимкнений.');
    this.maxTextureSize = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE);
    this.program = null;
  }
  compile(type, text) {
    const gl=this.gl, sh=gl.createShader(type);
    gl.shaderSource(sh,text); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh,gl.COMPILE_STATUS)) {
      const error=gl.getShaderInfoLog(sh);gl.deleteShader(sh);throw new Error('Помилка GLSL: '+error);
    }
    return sh;
  }
  async initialize() {
    const res = await fetch('./src/shaders/dehaze-webgl.frag', {cache:'no-store'});
    if(!res.ok) throw new Error('Не вдалося завантажити GLSL-файл ('+res.status+').');
    const frag=await res.text(), gl=this.gl;
    const v=this.compile(gl.VERTEX_SHADER,VERTEX), f=this.compile(gl.FRAGMENT_SHADER,frag);
    const p=gl.createProgram(); gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);
    gl.deleteShader(v);gl.deleteShader(f);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error('Помилка лінкування GLSL: '+gl.getProgramInfoLog(p));
    this.program=p;
    const a=gl.getAttribLocation(p,'a_position');
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
    this.uniforms={};
    ['source','mode','strength','autoBlend','u_off','u_haze','u_brightness','u_contrast','u_saturation','u_skyProtect','u_detail','u_night','u_fogDensity','u_fogConfidence','u_texel'].forEach(name=>{this.uniforms[name]=gl.getUniformLocation(p,name)});
    this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.useProgram(p);gl.uniform1i(this.uniforms.source,0);
    gl.clearColor(0,0,0,1);
  }
  draw(sourceCanvas,settings,mode,night,fog3=null) {
    if(!this.program)return;
    const gl=this.gl, u=this.uniforms;
    if(this.canvas.width!==sourceCanvas.width||this.canvas.height!==sourceCanvas.height){
      this.canvas.width=sourceCanvas.width;this.canvas.height=sourceCanvas.height;
    }
    gl.viewport(0,0,this.canvas.width,this.canvas.height);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,sourceCanvas);
    const isAuto3=settings.processing==='auto3';
    const fog=isAuto3 && fog3?.valid ? Math.max(0,Math.min(1,fog3.density)) : 0.15;
    // AUTO 3.0 uses a conservative fog estimate to adjust strength. The user
    // strength slider acts as sensitivity, not a forced haze category.
    const strength=isAuto3 ? Math.max(.08,Math.min(.92,(.16+.77*fog)*(.45+.55*settings.strength/65))) : settings.strength/100;
    const haze=isAuto3 ? Math.max(.22,Math.min(.96,.24+.70*fog)) : settings.haze/100;
    const values={mode, strength,autoBlend:settings.processing==='auto1'||settings.processing==='auto2'?1:0,
      u_off:settings.processing==='off'||(isAuto3&&fog3?.valid&&fog<.13)?1:0,u_haze:haze,
      u_brightness:settings.brightness/50,u_contrast:settings.contrast/50,
      u_saturation:settings.saturation/100,u_skyProtect:settings.sky/100,
      u_detail:settings.detail/100,u_night:night?1:0,
      u_fogDensity:isAuto3&&fog3?.valid?fog:0,
      u_fogConfidence:isAuto3&&fog3?.valid?fog3.confidence:0};
    for(const [name,value] of Object.entries(values)) if(u[name]!==null) gl.uniform1f(u[name],value);
    if(u.u_texel!==null) gl.uniform2f(u.u_texel,1/Math.max(1,this.canvas.width),1/Math.max(1,this.canvas.height));
    gl.drawArrays(gl.TRIANGLES,0,6);
  }
}
