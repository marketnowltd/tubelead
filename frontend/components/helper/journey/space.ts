/**
 * WebGL renderer for the discovery journey's space: background gradient, layered nebulae, volumetric light, three
 * parallax star layers, floating dust, and three procedurally textured, lit planets with atmospheres. One full-screen
 * fragment shader (cheap enough for 60fps), driven entirely by uniforms from the Remotion frame.
 *
 * Every time-based motion uses `uPhase` (0..2π over one hold loop), so looping a hold window is seamless.
 */

const VERT = `attribute vec2 a; varying vec2 vUv; void main(){ vUv = a * .5 + .5; gl_Position = vec4(a, 0., 1.); }`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uPhase;
uniform vec2 uCam;
uniform float uZoom;
uniform vec3 uP0; uniform vec3 uP1; uniform vec3 uP2;   // planet x, y, radius (world units)
uniform vec3 uLit;      // how lit each planet is (0 = not reached yet)
uniform float uFail;    // 1 = interrupted: cooler, dimmer scene
uniform float uDone;    // 1 = complete: warmer light

const float TAU = 6.28318530718;

float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float h31(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1,0)), f.x), mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), f.x), f.y); }
float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm2(vec2 p){ float v = 0., a = .5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 5; i++){ v += a * n2(p); p = m * p; a *= .5; } return v; }
float fbm3(vec3 p){ float v = 0., a = .5; for (int i = 0; i < 5; i++){ v += a * n3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= .5; } return v; }

vec3 starLayer(vec2 p, float scale, float density, float size){
  vec2 g = p * scale; vec2 id = floor(g); vec2 f = fract(g) - .5;
  float h = h21(id);
  if (h > density) return vec3(0.);
  vec2 o = vec2(h21(id + 1.3), h21(id + 7.1)) - .5;
  float d = length(f - o * .7);
  float tw = .65 + .35 * sin(uPhase * (1. + floor(h * 4.)) + h * 40.);   // 1..4 cycles per loop: seamless
  vec3 tint = mix(vec3(1., .86, .96), vec3(.82, .86, 1.), fract(h * 13.));
  return tint * smoothstep(size, 0., d) * tw;
}

// planet: returns colour (rgb) and coverage (a); kind 0 = gas (pink/purple), 1 = gas (orange), 2 = metallic (green/violet)
vec4 planet(vec2 w, vec3 P, float kind, float lit, float spin, float px){
  vec2 q = (w - P.xy) / P.z;
  float d = length(q);
  vec4 outc = vec4(0.);
  // atmosphere outside the disc
  vec3 atm = kind < .5 ? vec3(1., .35, .75) : kind < 1.5 ? vec3(1., .62, .25) : vec3(.45, 1., .78);
  float glow = exp(-(d - 1.) * 7.) * smoothstep(1. - px, 1. + px, d) * (.35 + .45 * lit);
  outc.rgb += atm * glow; outc.a = max(outc.a, glow * .9);
  if (d < 1. + px){
    vec3 n = vec3(q, sqrt(max(0., 1. - d * d)));
    float lon = atan(n.x, n.z) + spin, lat = asin(clamp(n.y, -1., 1.));
    vec3 sp = vec3(cos(lon) * cos(lat), sin(lat), sin(lon) * cos(lat));        // seamless as spin wraps
    vec3 L = normalize(vec3(-.62, .48, .62));
    float diff = smoothstep(-.18, .9, dot(n, L));
    float fres = pow(1. - n.z, 2.6);
    vec3 col;
    if (kind < .5){                     // PLANET SEARCH: pink & purple gas giant
      float w1 = fbm3(sp * 2.4 + vec3(0., lat * 3., 0.));
      float bands = sin(lat * 9. + w1 * 5.) * .5 + .5;
      col = mix(vec3(.43, .12, .95), vec3(.96, .16, .52), bands);
      col = mix(col, vec3(1., .72, .88), smoothstep(.62, .9, fbm3(sp * 5. + 3.)) * .45);
    } else if (kind < 1.5){             // PLANET FILTER: orange & gold, storm bands
      float w1 = fbm3(sp * 2. + 7.);
      float bands = sin(lat * 12. + w1 * 6.) * .5 + .5;
      col = mix(vec3(.62, .18, .02), vec3(1., .55, .05), bands);
      col = mix(col, vec3(1., .86, .45), smoothstep(.55, .85, fbm3(sp * 4. + 11.)) * .5);
      float storm = smoothstep(.18, .0, length(vec2(lon - 1.2 - spin, lat + .35) * vec2(.8, 2.)));
      col = mix(col, vec3(1., .93, .75), storm * .6);
    } else {                            // PLANET CONTACT: dark metallic, green & violet
      float cr = fbm3(sp * 3.5 + 21.);
      col = mix(vec3(.05, .07, .09), vec3(.1, .45, .36), smoothstep(.35, .7, cr));
      col = mix(col, vec3(.42, .25, .85), smoothstep(.6, .85, fbm3(sp * 6. + 5.)) * .6);
      float grid = smoothstep(.97, 1., abs(sin(lon * 18.))) + smoothstep(.97, 1., abs(sin(lat * 14.)));
      col += vec3(.3, 1., .75) * grid * .08 * lit;
      vec3 R = reflect(-L, n);
      col += vec3(.85, .95, 1.) * pow(max(R.z, 0.), 28.) * .55;              // metallic sheen
    }
    col *= .12 + 1.05 * diff;
    col += atm * fres * (.45 + .35 * lit);
    // not reached yet: muted, as if in shadow
    float g = dot(col, vec3(.3, .55, .15));
    col = mix(vec3(g) * vec3(.55, .5, .7) * .5, col, .3 + .7 * lit);
    float a = smoothstep(1. + px, 1. - px, d);
    outc.rgb = mix(outc.rgb, col, a); outc.a = max(outc.a, a);
  }
  return outc;
}

void main(){
  vec2 uv = (vUv - .5) * vec2(uRes.x / uRes.y, 1.);
  vec2 w = uv / uZoom + uCam;
  vec2 drift = vec2(cos(uPhase), sin(uPhase)) * .03;                          // periodic: seamless loop

  // deep space gradient + nebulae (parallax: slower than the planets)
  vec3 col = mix(vec3(.035, .015, .075), vec3(.13, .045, .24), smoothstep(-.6, .7, uv.y + uv.x * .25));
  vec2 nb = uv * 1.1 + uCam * .18 + drift;
  float m1 = fbm2(nb * 1.3 + 2.);
  float m2 = fbm2(nb * 2.1 - 5. + drift * 2.);
  float m3 = fbm2(nb * 3.3 + 9.);
  col += vec3(.91, .12, .46) * pow(m1, 3.2) * .55;
  col += vec3(.48, .18, 1.) * pow(m2, 2.6) * .5;
  col += vec3(1., .48, .02) * pow(m3, 5.) * .22;

  // volumetric light from the upper left, with faint shafts
  vec2 lp = uv - vec2(-1.05, .62);
  float shaft = .55 + .45 * sin(atan(lp.y, lp.x) * 22. + m1 * 3.);
  col += vec3(.95, .82, 1.) * pow(max(0., 1. - length(lp) * .62), 2.6) * (.22 + .08 * shaft);

  // stars at three depths, and floating dust
  col += starLayer(uv + uCam * .05, 38., .32, .05) * .55;
  col += starLayer(uv + uCam * .12, 20., .22, .06) * .8;
  col += starLayer(uv + uCam * .28, 9., .12, .075);
  vec2 dp = uv * 3. + uCam * .6 + vec2(sin(uPhase), cos(uPhase)) * .08;
  col += vec3(1., .78, .9) * smoothstep(.993, 1., n2(dp * 6.)) * .35;

  // planets (farther = softer edge, a gentle depth-of-field)
  float px = 1.6 / (uRes.y * uZoom);
  vec4 p0 = planet(w, uP0, 0., uLit.x, uPhase, px / uP0.z * 1.4);
  vec4 p1 = planet(w, uP1, 1., uLit.y, uPhase, px / uP1.z * 1.4);
  vec4 p2 = planet(w, uP2, 2., uLit.z, -uPhase, px / uP2.z * 1.4);
  col = mix(col, p0.rgb, clamp(p0.a, 0., 1.)) + p0.rgb * (1. - p0.a) * .0;
  col = col * (1. - clamp(p1.a, 0., 1.)) + p1.rgb * clamp(p1.a, 0., 1.);
  col = col * (1. - clamp(p2.a, 0., 1.)) + p2.rgb * clamp(p2.a, 0., 1.);

  // grade: warm on completion, cool and dim on interruption; vignette; fine grain
  col = mix(col, col * vec3(1.08, .98, .9), uDone * .6);
  col = mix(col, vec3(dot(col, vec3(.3, .5, .2))) * vec3(.8, .78, .95), uFail * .55);
  col *= 1. - .55 * pow(length(uv * vec2(.75, 1.1)), 2.2);
  col += (h21(vUv * uRes) - .5) * .018;
  col = col / (1. + col * .35);                                                // soft highlight roll-off (bloom-ish)
  gl_FragColor = vec4(pow(col, vec3(.95)), 1.);
}`;

export interface SpaceUniforms {
  phase: number; cam: [number, number]; zoom: number;
  planets: [number, number, number][]; lit: [number, number, number]; fail: number; done: number;
}

export class SpaceRenderer {
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private loc: Record<string, WebGLUniformLocation | null> = {};

  static create(canvas: HTMLCanvasElement): SpaceRenderer | null {
    const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false, powerPreference: "low-power" });
    if (!gl) return null;
    try { return new SpaceRenderer(gl); } catch { return null; }
  }

  private constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link");
    this.prog = p;
    gl.useProgram(p);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(p, "a");
    gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    for (const n of ["uRes", "uPhase", "uCam", "uZoom", "uP0", "uP1", "uP2", "uLit", "uFail", "uDone"]) this.loc[n] = gl.getUniformLocation(p, n);
  }

  render(u: SpaceUniforms) {
    const gl = this.gl, c = gl.canvas as HTMLCanvasElement;
    gl.viewport(0, 0, c.width, c.height);
    gl.uniform2f(this.loc.uRes, c.width, c.height);
    gl.uniform1f(this.loc.uPhase, u.phase);
    gl.uniform2f(this.loc.uCam, u.cam[0], u.cam[1]);
    gl.uniform1f(this.loc.uZoom, u.zoom);
    gl.uniform3f(this.loc.uP0, ...u.planets[0]); gl.uniform3f(this.loc.uP1, ...u.planets[1]); gl.uniform3f(this.loc.uP2, ...u.planets[2]);
    gl.uniform3f(this.loc.uLit, ...u.lit);
    gl.uniform1f(this.loc.uFail, u.fail); gl.uniform1f(this.loc.uDone, u.done);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose() {
    this.gl.deleteProgram(this.prog);
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
