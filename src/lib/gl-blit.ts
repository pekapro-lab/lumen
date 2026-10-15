type Gl = WebGL2RenderingContext | WebGLRenderingContext;

type Gpu = {
  canvas: HTMLCanvasElement;
  gl: Gl;
  blit: WebGLProgram;
  cubic: WebGLProgram;
  grain: WebGLProgram;
  tex: WebGLTexture;
  blitTex: WebGLUniformLocation | null;
  cubicTex: WebGLUniformLocation | null;
  cubicTexel: WebGLUniformLocation | null;
  is2: boolean;
};

let gpu: Gpu | null = null;
let failed = false;
let grainCss: string | null = null;

function vertSrc(es3: boolean) {
  return es3
    ? `#version 300 es
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * vec2(0.5, -0.5) + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`
    : `attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * vec2(0.5, -0.5) + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;
}

function blitFrag(es3: boolean) {
  return es3
    ? `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
out vec4 fragColor;
void main() {
  fragColor = texture(u_tex, v_uv);
}`
    : `precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
void main() {
  gl_FragColor = texture2D(u_tex, v_uv);
}`;
}

/** 4 bilinear taps ≈ bicubic Catmull-Rom, without 16 dependent fetches. */
function cubicFrag(es3: boolean) {
  const head = es3
    ? `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;
out vec4 fragColor;
#define SAMPLE(t, uv) texture(t, uv)`
    : `precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;
#define SAMPLE(t, uv) texture2D(t, uv)`;
  const body = `
vec4 cubic(float v) {
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
  vec4 s = n * n * n;
  float x = s.x;
  float y = s.y - 4.0 * s.x;
  float z = s.z - 4.0 * s.y + 6.0 * s.x;
  float w = 6.0 - x - y - z;
  return vec4(x, y, z, w) * 0.16666667;
}
void main() {
  vec2 texSize = 1.0 / u_texel;
  vec2 coord = v_uv * texSize - 0.5;
  vec2 fom = floor(coord);
  vec2 f = coord - fom;
  vec4 xw = cubic(f.x);
  vec4 yw = cubic(f.y);
  vec4 c = fom.xxyy + vec4(-0.5, 1.5, -0.5, 1.5);
  vec4 s = vec4(xw.xz + xw.yw, yw.xz + yw.yw);
  vec4 o = (c + vec4(xw.yw, yw.yw) / s) * u_texel.xxyy;
  vec4 s0 = SAMPLE(u_tex, o.xz);
  vec4 s1 = SAMPLE(u_tex, o.yz);
  vec4 s2 = SAMPLE(u_tex, o.xw);
  vec4 s3 = SAMPLE(u_tex, o.yw);
  float sx = s.x / (s.x + s.y);
  float sy = s.z / (s.z + s.w);
  vec4 color = mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
  ${es3 ? "fragColor" : "gl_FragColor"} = color;
}`;
  return head + body;
}

function grainFrag(es3: boolean) {
  return es3
    ? `#version 300 es
precision lowp float;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  vec2 p = v_uv * 63.0;
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  float n = fract((p3.x + p3.y) * p3.z);
  fragColor = vec4(n, n, n, 1.0);
}`
    : `precision lowp float;
varying vec2 v_uv;
void main() {
  vec2 p = v_uv * 63.0;
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  float n = fract((p3.x + p3.y) * p3.z);
  gl_FragColor = vec4(n, n, n, 1.0);
}`;
}

function compile(gl: Gl, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function link(gl: Gl, vsSrc: string, fsSrc: string): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.bindAttribLocation(program, 0, "a_pos");
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function preferPower(): WebGLPowerPreference {
  if (typeof window === "undefined") return "default";
  return window.matchMedia("(pointer: coarse)").matches ? "low-power" : "high-performance";
}

function bindQuad(gl: Gl, is2: boolean) {
  const buf = gl.createBuffer();
  if (!buf) return false;
  if (is2) {
    const gl2 = gl as WebGL2RenderingContext;
    const vao = gl2.createVertexArray();
    if (vao) gl2.bindVertexArray(vao);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  return true;
}

function createGpu(): Gpu | null {
  const canvas = document.createElement("canvas");
  const attrs: WebGLContextAttributes = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
    premultipliedAlpha: false,
    powerPreference: preferPower(),
    failIfMajorPerformanceCaveat: false,
    desynchronized: true,
  };
  const gl2 = canvas.getContext("webgl2", attrs) as WebGL2RenderingContext | null;
  const gl = gl2 || (canvas.getContext("webgl", attrs) as WebGLRenderingContext | null);
  if (!gl) return null;
  const is2 = Boolean(gl2);
  const es3 = is2;

  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.DITHER);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);

  const vSrc = vertSrc(es3);
  let blit = link(gl, vSrc, blitFrag(es3));
  let cubic = link(gl, vSrc, cubicFrag(es3));
  let grain = link(gl, vSrc, grainFrag(es3));
  if ((!blit || !cubic || !grain) && es3) {
    const v1 = vertSrc(false);
    blit = blit || link(gl, v1, blitFrag(false));
    cubic = cubic || link(gl, v1, cubicFrag(false));
    grain = grain || link(gl, v1, grainFrag(false));
  }
  if (!blit || !cubic || !grain) return null;
  if (!bindQuad(gl, is2)) return null;

  const tex = gl.createTexture();
  if (!tex) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

  canvas.addEventListener(
    "webglcontextlost",
    (event) => {
      event.preventDefault();
      gpu = null;
    },
    false,
  );
  canvas.addEventListener("webglcontextrestored", () => {
    failed = false;
  });

  return {
    canvas,
    gl,
    blit,
    cubic,
    grain,
    tex,
    blitTex: gl.getUniformLocation(blit, "u_tex"),
    cubicTex: gl.getUniformLocation(cubic, "u_tex"),
    cubicTexel: gl.getUniformLocation(cubic, "u_texel"),
    is2,
  };
}

function getGpu(): Gpu | null {
  if (failed || typeof document === "undefined") return null;
  if (gpu) return gpu;
  gpu = createGpu();
  if (!gpu) failed = true;
  return gpu;
}

export function blitImage(
  source: TexImageSource,
  width: number,
  height: number,
  quality = 0.88,
): string | null {
  const gpuNow = getGpu();
  if (!gpuNow) return null;
  const { gl, canvas, blit, cubic, tex, blitTex, cubicTex, cubicTexel, is2 } = gpuNow;
  const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  if (width < 1 || height < 1 || width > max || height > max) return null;

  const srcW = "width" in source ? Number(source.width) : 0;
  const srcH = "height" in source ? Number(source.height) : 0;
  if (srcW > max || srcH > max) return null;

  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  gl.viewport(0, 0, width, height);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  } catch {
    return null;
  }

  const upscale = srcW > 0 && srcH > 0 && width * height > srcW * srcH;
  const downscale = srcW > 0 && srcH > 0 && width * height < srcW * srcH && is2 && srcW >= 1024;

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  if (downscale) {
    gl.hint(gl.GENERATE_MIPMAP_HINT, gl.FASTEST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.useProgram(blit);
    gl.uniform1i(blitTex, 0);
  } else if (upscale) {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.useProgram(cubic);
    gl.uniform1i(cubicTex, 0);
    gl.uniform2f(cubicTexel, 1 / Math.max(1, srcW), 1 / Math.max(1, srcH));
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.useProgram(blit);
    gl.uniform1i(blitTex, 0);
  }

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  try {
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  }
}

export function grainBackground(): string | null {
  if (grainCss) return grainCss;
  const gpuNow = getGpu();
  if (!gpuNow) return null;
  const { gl, canvas, grain } = gpuNow;
  const size = 64;
  canvas.width = size;
  canvas.height = size;
  gl.viewport(0, 0, size, size);
  gl.useProgram(grain);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  try {
    grainCss = `url("${canvas.toDataURL("image/jpeg", 0.55)}")`;
  } catch {
    return null;
  }
  return grainCss;
}

export function initGpu() {
  if (typeof document === "undefined") return;
  const tile = grainBackground();
  if (tile) document.documentElement.style.setProperty("--lumen-grain-image", tile);
}
