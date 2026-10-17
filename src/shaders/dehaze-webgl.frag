precision highp float;
varying highp vec2 v_uv;
uniform sampler2D source;
uniform float u_off;
uniform float u_haze;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_skyProtect;
uniform float u_detail;
uniform float u_night;
uniform highp float strength;
uniform highp float mode;
uniform highp float autoBlend;
uniform highp float u_fogDensity;
uniform highp float u_fogConfidence;
uniform highp vec2 u_texel;

highp float lum(highp vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
}
highp float darkAt(highp vec2 uv) {
    highp vec2 d = vec2(0.0017, 0.0017);
    highp vec3 c0 = texture2D(source, uv).rgb;
    highp vec3 c1 = texture2D(source, uv + vec2(d.x, 0.0)).rgb;
    highp vec3 c2 = texture2D(source, uv - vec2(d.x, 0.0)).rgb;
    highp vec3 c3 = texture2D(source, uv + vec2(0.0, d.y)).rgb;
    highp vec3 c4 = texture2D(source, uv - vec2(0.0, d.y)).rgb;
    highp float m0 = min(c0.r, min(c0.g, c0.b));
    highp float m1 = min(c1.r, min(c1.g, c1.b));
    highp float m2 = min(c2.r, min(c2.g, c2.b));
    highp float m3 = min(c3.r, min(c3.g, c3.b));
    highp float m4 = min(c4.r, min(c4.g, c4.b));
    return min(m0, min(m1, min(m2, min(m3, m4))));
}
highp vec3 recoverDcp(highp vec3 c, highp float power, highp float floorT) {
    highp float dc = darkAt(v_uv);
    highp float t = clamp(1.0 - power * dc, floorT, 1.0);
    highp vec3 A = vec3(0.94, 0.95, 0.97);
    return clamp((c - A) / t + A, 0.0, 1.0);
}

// Experimental per-pixel approximate edge-guided dark channel. NOT full guided filter.
highp float guidedDark(highp vec2 uv) {
    highp vec3 center=texture2D(source,uv).rgb;
    highp float yc=lum(center);
    highp float base=min(center.r,min(center.g,center.b));
    highp float total=1.0, acc=base;
    highp vec2 d=vec2(0.0030,0.0030);
    for(int k=0;k<4;k++) {
        highp vec2 dd=k==0?vec2(d.x,0.0):k==1?vec2(-d.x,0.0):k==2?vec2(0.0,d.y):vec2(0.0,-d.y);
        highp vec3 t=texture2D(source,clamp(uv+dd,vec2(0.0),vec2(1.0))).rgb;
        highp float w=1.0/(1.0+18.0*abs(lum(t)-yc));
        acc+=min(t.r,min(t.g,t.b))*w;total+=w;
    }
    return acc/total;
}
highp float localL(highp vec2 uv,highp vec2 d) {
    highp float center=lum(texture2D(source,uv).rgb);
    return (center*2.0+lum(texture2D(source,clamp(uv+vec2(d.x,0.0),vec2(0.0),vec2(1.0))).rgb)
            +lum(texture2D(source,clamp(uv-vec2(d.x,0.0),vec2(0.0),vec2(1.0))).rgb)
            +lum(texture2D(source,clamp(uv+vec2(0.0,d.y),vec2(0.0),vec2(1.0))).rgb)
            +lum(texture2D(source,clamp(uv-vec2(0.0,d.y),vec2(0.0),vec2(1.0))).rgb))/6.0;
}
// Spatial approximation of multiscale Retinex, without a costly multiscale Gaussian pyramid.
highp vec3 retinexMulti(highp vec2 uv, highp vec3 c,highp float s) {
    highp float y=lum(c);
    highp float a=localL(uv,vec2(0.0025));
    highp float b=localL(uv,vec2(0.011));
    highp float d=localL(uv,vec2(0.038));
    highp float base=(a+b+d)/3.0;
    highp float gain=clamp(pow((y+0.055)/(base+0.055),0.32+0.2*s),0.74,1.27);
    highp vec3 lifted=pow(c,vec3(0.92-0.12*s));
    return clamp(lifted*gain,0.0,1.0);
}

void main() {
    highp vec2 uv = v_uv;
    highp vec3 c = texture2D(source, uv).rgb;
    if (u_off > 0.5) {
        gl_FragColor = vec4(c, 1.0);
        return;
    }
    highp vec3 outc = c;
    highp float s = clamp(strength, 0.0, 1.0);
    if (autoBlend > 0.5) {
        highp vec2 d = vec2(0.005, 0.005);
        highp float l0 = lum(c);
        highp float l1 = lum(texture2D(source, clamp(uv+vec2(d.x,0.0), vec2(0.0), vec2(1.0))).rgb);
        highp float l2 = lum(texture2D(source, clamp(uv-vec2(d.x,0.0), vec2(0.0), vec2(1.0))).rgb);
        highp float l3 = lum(texture2D(source, clamp(uv+vec2(0.0,d.y), vec2(0.0), vec2(1.0))).rgb);
        highp float l4 = lum(texture2D(source, clamp(uv-vec2(0.0,d.y), vec2(0.0), vec2(1.0))).rgb);
        highp float contrast = max(max(abs(l1-l0),abs(l2-l0)),max(abs(l3-l0),abs(l4-l0)));
        highp float fog = clamp((darkAt(uv)-0.12)*2.2 - contrast*2.0, 0.0, 1.0);
        highp float autoS = mix(0.20, 0.92, smoothstep(0.08, 0.72, fog));
        s = mix(0.20, autoS, clamp(strength, 0.0, 1.0));
    }
    s = clamp(s * mix(0.60, 1.15, u_haze), 0.0, 1.0);
    highp float y = lum(c);
    highp float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
    highp float sky = smoothstep(0.72, 0.98, y) * (1.0 - smoothstep(0.10, 0.35, sat));
    highp float guard = 1.0 - u_skyProtect * 0.72 * sky;
    if (mode < 1.5) {
        highp vec3 dcp = recoverDcp(c, 0.72 + 0.20*s, 0.30 - 0.08*s);
        highp vec3 ctr = clamp((c - 0.5) * (1.08 + 0.22*s) + 0.5, 0.0, 1.0);
        outc = mix(c, mix(ctr, dcp, 0.60), (0.52 + 0.38*s) * guard);
    } else if (mode < 2.5) {
        outc = mix(c, recoverDcp(c, 0.70 + 0.15*s, 0.34 - 0.05*s), (0.55 + 0.30*s) * guard);
    } else if (mode < 3.5) {
        outc = mix(c, recoverDcp(c, 0.78 + 0.16*s, 0.30 - 0.05*s), (0.60 + 0.30*s) * guard);
    } else if (mode < 4.5) {
        highp vec3 classic = clamp((c - vec3(0.46)) * (1.10 + 0.24*s) + vec3(0.46), 0.0, 1.0);
        classic = pow(classic, vec3(0.94));
        outc = mix(c, classic, (0.55 + 0.34*s) * guard);
    } else if (mode < 5.5) {
        outc = mix(c, recoverDcp(c, 0.82 + 0.12*s, 0.27 - 0.04*s), (0.65 + 0.28*s) * guard);
    } else if (mode < 6.5) {
        outc = mix(c, recoverDcp(c, 0.91 + 0.07*s, 0.20 - 0.03*s), (0.75 + 0.22*s) * guard);
    } else if (mode < 7.5) {
        highp float mx = max(c.r, max(c.g, c.b));
        highp float mn = min(c.r, min(c.g, c.b));
        highp float saturation = mx > 0.001 ? (mx - mn) / mx : 0.0;
        highp float depth = max(0.0, 0.121779 + 0.959710 * mx - 0.780245 * saturation);
        highp float t = clamp(exp(-(0.85 + 0.45*s) * depth), 0.28, 1.0);
        highp vec3 A = vec3(0.94, 0.95, 0.97);
        highp vec3 cap = clamp((c - A) / t + A, 0.0, 1.0);
        outc = mix(c, cap, (0.58 + 0.32*s) * guard);
    } else if (mode < 8.5) {
        highp vec3 local = clamp((c - vec3(y)) * (1.20 + 0.45*s) + vec3(smoothstep(0.0, 1.0, y)), 0.0, 1.0);
        outc = mix(c, local, (0.50 + 0.38*s) * guard);
    } else if (mode < 9.5) {
        highp vec3 ret = log(vec3(1.0) + (4.0 + 3.0*s) * c) / log(5.0 + 3.0*s);
        ret = clamp((ret - 0.5) * (1.05 + 0.18*s) + 0.5, 0.0, 1.0);
        outc = mix(c, ret, (0.48 + 0.38*s) * guard);
    } else if(mode<10.5) { // 10 EDGE DCP: approximate guided DCP
        highp float dc=guidedDark(uv);
        highp float t=clamp(1.0-(0.62+0.17*s)*dc,0.38,1.0);
        highp vec3 A=vec3(0.89,0.90,0.92);
        highp vec3 rec=clamp((c-A)/t+A,0.0,1.0);
        outc=mix(c,rec,(0.40+0.34*s)*guard);
    } else if(mode<11.5) { // 11 MSR-LITE
        highp vec3 ret=retinexMulti(uv,c,s);
        outc=mix(c,ret,(0.45+0.35*s)*guard);
    } else if(mode<12.5) { // 12 LIME-LITE local illumination estimation
        highp float illumination=max(0.08,localL(uv,vec2(0.012)));
        highp float gain=clamp(pow(illumination,-0.15-0.21*s),1.0,1.7);
        highp float darkMask=1.0-smoothstep(0.35,0.82,y);
        outc=mix(c,clamp(c*gain,0.0,1.0),(0.48+0.4*s)*darkMask);
    } else if(mode<13.5) { // 13 LOCAL GAMMA (not histogram-based AGCWD)
        highp float gamma=mix(0.70-0.10*s,1.12,smoothstep(0.10,0.83,y));
        highp vec3 corrected=pow(max(c,vec3(0.0001)),vec3(gamma));
        outc=mix(c,corrected,(0.38+0.40*s)*guard);
    } else if(mode<14.5) { // 14 CLASSIC+DCP FUSION. AUTO chooses per-pixel strength above.
        highp vec3 classic=clamp((c-vec3(0.45))*(1.06+0.18*s)+vec3(0.45),0.0,1.0);
        highp float dc=guidedDark(uv);
        highp float t=clamp(1.0-(0.56+0.23*s)*dc,0.42,1.0);
        highp vec3 A=vec3(0.89,0.91,0.93);
        highp vec3 dcp=clamp((c-A)/t+A,0.0,1.0);
        highp float fog=clamp((dc-0.12)*2.0,0.0,1.0);
        highp float dcpW=mix(0.28,0.68,fog);
        highp vec3 fusion=mix(classic,dcp,dcpW);
        outc=mix(c,fusion,(0.48+0.30*s)*guard);
    } else if(mode<15.5) { // 15 LOCAL CONTRAST: not histogram CLAHE
        highp float local=localL(uv,vec2(0.010));
        highp float mult=0.26+0.46*s;
        highp float targetY=clamp(y+(y-local)*mult,0.0,1.0);
        outc=mix(c,clamp(c+vec3(targetY-y),0.0,1.0),(0.45+0.38*s)*guard);
    } else if(mode<16.5) { // 16 AUTO 2.0: protected classic+edge-DCP fusion (unchanged)
        highp float dc=guidedDark(uv);
        highp float base=localL(uv,vec2(0.010));
        highp float localContrast=clamp(abs(y-base)*5.0,0.0,1.0);
        highp float haze=clamp((dc-0.15)*2.0-localContrast*0.5,0.0,1.0);
        highp float hazeW=smoothstep(0.10,0.67,haze);
        highp float limitedS=min(s,0.82);
        highp float dcpPower=(0.47+0.25*hazeW)*(0.88+0.12*limitedS);
        highp float t=clamp(1.0-dcpPower*dc,0.50,1.0);
        highp vec3 A=vec3(0.89,0.91,0.93);
        highp vec3 dcp=clamp((c-A)/t+A,0.0,1.0);
        highp vec3 classic=clamp((c-vec3(0.47))*(1.06+0.16*limitedS)+vec3(0.47),0.0,1.0);
        highp float shadow=1.0-smoothstep(0.10,0.48,y);
        highp vec3 lifted=pow(max(classic,vec3(0.0001)),vec3(0.89));
        classic=mix(classic,lifted,0.20*shadow);
        highp float dcpW=mix(0.16,0.58,hazeW);
        highp vec3 fusion=mix(classic,dcp,dcpW);
        outc=mix(c,fusion,(0.40+0.32*limitedS)*guard);
    } else if(mode<17.5) { // 17 AUTO 3.0: independent three-stage, locally-adaptive restoration
        // The global estimate controls the blend; local cues modulate the effect.
        // These are approximations for a real-time WebGL1 tablet, not full DCP/FADE.
        highp float density=clamp(u_fogDensity,0.0,1.0);
        highp float reliability=clamp(u_fogConfidence,0.0,1.0);
        highp float control=clamp(strength,0.0,1.0);
        highp float dc=guidedDark(uv);
        highp float nearL=localL(uv,max(u_texel*6.0,vec2(0.003)));
        highp float texture=clamp(abs(y-nearL)*7.5,0.0,1.0);
        // Local contrast stops severe dark-channel corrections at sharp edges.
        highp float localFog=clamp((dc-0.08)*1.6-texture*0.48,0.0,1.0);
        highp float localWeight=clamp(0.72+0.36*localFog,0.40,1.0);
        highp float detailGuard=(1.0-0.33*texture)*(1.0-0.40*sky);
        highp float darkGuard=smoothstep(0.045,0.23,y);
        highp float motionSafe=0.85+0.15*reliability;

        // Stage 1 LIGHT: low-contrast enhancement and restrained color recovery.
        highp float mildContrast=(0.16+0.30*control)*localWeight;
        highp float targetY=clamp(y+(y-nearL)*mildContrast,0.0,1.0);
        highp vec3 light=clamp(c+vec3(targetY-y),0.0,1.0);
        highp float lowSat=1.0-smoothstep(0.16,0.50,sat);
        highp float colorGain=1.0+(0.07+0.09*control)*lowSat;
        light=clamp(vec3(lum(light))+(light-vec3(lum(light)))*colorGain,0.0,1.0);
        light=mix(c,light,0.54+0.30*control);

        // Stage 2 MEDIUM: edge-aware transmission restoration, not M16 fusion.
        highp float power=(0.70+0.19*control)*localWeight;
        highp float tMedium=clamp(1.0-power*dc,0.40,1.0);
        highp vec3 A=vec3(0.90,0.92,0.94);
        highp vec3 restoredMedium=clamp((c-A)/tMedium+A,0.0,1.0);
        highp float mediumContrast=(0.14+0.23*control)*(0.55+0.45*localFog);
        highp vec3 localMedium=clamp(c+vec3((y-nearL)*mediumContrast),0.0,1.0);
        highp vec3 medium=mix(localMedium,restoredMedium,0.56+0.27*control);
        medium=mix(c,medium,(0.63+0.23*control)*detailGuard*darkGuard*motionSafe);

        // Stage 3 DENSE: stronger capped transmission, denoise flat areas first.
        highp vec2 r=max(u_texel*2.0,vec2(0.0015));
        highp vec3 n=(texture2D(source,clamp(uv+vec2(r.x,0.0),vec2(0.0),vec2(1.0))).rgb
                    +texture2D(source,clamp(uv-vec2(r.x,0.0),vec2(0.0),vec2(1.0))).rgb
                    +texture2D(source,clamp(uv+vec2(0.0,r.y),vec2(0.0),vec2(1.0))).rgb
                    +texture2D(source,clamp(uv-vec2(0.0,r.y),vec2(0.0),vec2(1.0))).rgb)*0.25;
        highp float flat=1.0-smoothstep(0.02,0.11,abs(y-lum(n)));
        highp vec3 denoised=mix(c,n,(0.10+0.12*control)*flat*(1.0-texture));
        highp float tDense=clamp(1.0-(0.89+0.20*control)*dc,0.32,1.0);
        highp vec3 denseRec=clamp((denoised-A)/tDense+A,0.0,1.0);
        highp vec3 denseColor=clamp(vec3(lum(denseRec))+
                                   (denseRec-vec3(lum(denseRec)))*(1.07+0.10*control),0.0,1.0);
        highp vec3 dense=mix(medium,denseColor,(0.52+0.23*control)*detailGuard*darkGuard*motionSafe);

        // Smooth severity interpolation: no preset jump at 19/40/67% thresholds.
        highp float wMedium=smoothstep(0.17,0.50,density);
        highp float wDense=smoothstep(0.52,0.87,density);
        highp vec3 progressive=mix(light,medium,wMedium);
        progressive=mix(progressive,dense,wDense);
        highp float overall=smoothstep(0.09,0.44,density)*(0.55+0.45*control);
        // Low-confidence analysis limits rather than amplifies questionable corrections.
        overall*=mix(0.58,1.0,reliability);
        outc=mix(c,progressive,overall*guard);
    }
    highp float oy = lum(outc);
    if (oy > 0.94) outc *= 0.94 / max(oy, 0.001);
    // Additional display adjustments; original TEST16 mode math is above.
    outc = clamp((outc - vec3(0.5)) * (1.0 + u_contrast * 0.70) + vec3(0.5 + u_brightness * 0.30), 0.0, 1.0);
    highp float outY = lum(outc);
    outc = clamp(vec3(outY) + (outc - vec3(outY)) * u_saturation, 0.0, 1.0);
    if (u_night > 0.5) {
        highp float shadow = 1.0 - smoothstep(0.18, 0.65, outY);
        highp vec3 nightBoost = pow(max(outc, vec3(0.0001)), vec3(0.85));
        outc = mix(outc, nightBoost, 0.42 * shadow);
    }
    if (u_detail > 0.005) {
        highp vec2 d = vec2(0.0011, 0.0011);
        highp vec3 neighbors = (
            texture2D(source, clamp(uv + vec2(d.x, 0.0), vec2(0.0), vec2(1.0))).rgb +
            texture2D(source, clamp(uv - vec2(d.x, 0.0), vec2(0.0), vec2(1.0))).rgb +
            texture2D(source, clamp(uv + vec2(0.0, d.y), vec2(0.0), vec2(1.0))).rgb +
            texture2D(source, clamp(uv - vec2(0.0, d.y), vec2(0.0), vec2(1.0))).rgb
        ) * 0.25;
        outc = clamp(outc + (c - neighbors) * (u_detail * 0.35), 0.0, 1.0);
    }
    gl_FragColor = vec4(outc, 1.0);
}
