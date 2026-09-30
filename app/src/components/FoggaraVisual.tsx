import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

const vertexSource = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const fragmentSource = `
precision mediump float;
varying vec2 v_uv;
uniform float u_time;
void main() {
  float fan = 1.0 - smoothstep(0.16, 0.82, v_uv.x);
  float water = 0.0;
  float shimmer = 0.0;
  for (int i = 0; i < 5; i++) {
    float n = float(i);
    float end_y = 0.14 + n * 0.18;
    float center = mix(0.5, end_y, fan);
    float wave = sin(v_uv.x * 24.0 - u_time * (1.15 + n * 0.08) + n * 1.7) * 0.004;
    wave += sin(v_uv.x * 51.0 + u_time * 0.48 + n) * 0.0018;
    float d = abs(v_uv.y - center - wave);
    float channel = 1.0 - smoothstep(0.010, 0.018, d);
    float flow = 1.0 - smoothstep(0.003, 0.0075, d);
    float glint = flow * (0.5 + 0.5 * sin(v_uv.x * 92.0 - u_time * 3.2 + n * 5.0));
    water = max(water, max(channel * 0.42, flow));
    shimmer = max(shimmer, glint * flow);
  }
  vec3 deep = vec3(0.035, 0.34, 0.40);
  vec3 light = vec3(0.25, 0.84, 0.79);
  vec3 color = mix(deep, light, shimmer * 0.55);
  gl_FragColor = vec4(color, water * 0.92);
}`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function WaterShader() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl", { alpha: true, antialias: false, powerPreference: "low-power" });
    if (!canvas || !gl) return;

    const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertex || !fragment) return;
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const timeLocation = gl.getUniformLocation(program, "u_time");

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const started = performance.now();
    let frame = 0;
    const draw = (now: number) => {
      resize();
      gl.uniform1f(timeLocation, reducedMotion.matches ? 0 : (now - started) / 1000);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (!reducedMotion.matches) frame = requestAnimationFrame(draw);
    };
    draw(started);
    const onMotionChange = () => {
      cancelAnimationFrame(frame);
      if (reducedMotion.matches) draw(performance.now());
      else frame = requestAnimationFrame(draw);
    };
    reducedMotion.addEventListener("change", onMotionChange);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      reducedMotion.removeEventListener("change", onMotionChange);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}

export function FoggaraVisual() {
  const { t } = useTranslation();
  return (
    <section className="overflow-hidden rounded-2xl border border-ink/10 bg-paper shadow-sm" aria-labelledby="foggara-visual-title">
      <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5 sm:px-7 sm:pt-7">
        <div>
          <h2 id="foggara-visual-title" className="t-section text-ink">{t("foggaraVisual.title")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("foggaraVisual.description")}</p>
        </div>
        <span className="rounded-full border border-sand/70 bg-sand/15 px-3 py-1 text-xs font-medium text-ink">
          {t("foggaraVisual.illustrative")}
        </span>
      </div>

      <div className="relative mx-4 my-4 h-56 overflow-hidden rounded-xl border border-ink/10 bg-gradient-to-b from-[#e8efe4] via-[#dce8d8] to-[#ead9b8] sm:mx-7 sm:h-72">
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#c8a979]/60 to-transparent" />
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 360" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 95 Q180 45 360 92 T720 76 T1000 93" fill="none" stroke="#9eaa8e" strokeOpacity=".22" strokeWidth="3" />
          <path d="M0 265 Q180 218 360 258 T720 238 T1000 250" fill="none" stroke="#9eaa8e" strokeOpacity=".2" strokeWidth="4" />
          <path d="M0 318 Q190 276 370 314 T720 297 T1000 310" fill="none" stroke="#ffffff" strokeOpacity=".35" strokeWidth="2" />
          <ellipse cx="765" cy="184" rx="112" ry="122" fill="#8f7657" fillOpacity=".08" />
        </svg>
        <WaterShader />
        <svg className="absolute inset-0 h-full w-full drop-shadow-[0_12px_10px_rgb(54_57_41/0.2)]" viewBox="0 0 1000 360" preserveAspectRatio="none" aria-hidden="true">
          <path d="M700 205 L770 134 L840 205 Z" fill="#8b7151" />
          <path d="M716 194 L770 143 L824 194 Z" fill="#b59970" />
          <path d="M730 190 L770 153 L810 190 Z" fill="#d3bd91" />
          <path d="M692 205 H848 V221 H692 Z" fill="#786344" />
          <path d="M709 223 H831 V235 H709 Z" fill="#a38b65" />
          <path d="M733 205 H807 V217 H733 Z" fill="#315f59" />
          <path d="M746 207 H794 V214 H746 Z" fill="#86c8b5" />
        </svg>
        <div className="absolute inset-x-3 bottom-3 flex flex-wrap justify-between gap-1 sm:inset-x-6 sm:bottom-4" dir="ltr">
          {(["water", "energy", "food", "ecosystem", "health"] as const).map((domain) => (
            <span key={domain} className="rounded-full border border-white/50 bg-white/75 px-2.5 py-1 text-[10px] font-semibold text-ink shadow-sm sm:px-3 sm:text-xs">
              {t(`landing.${domain}`)}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
