/* VeriSeal — cena 3D dentro do quadro: garrafa de whisky, líquido e lacre inteligente com a marca VeriSeal.
   Script clássico que importa o Three.js dinamicamente, para funcionar tanto em file:// quanto em servidor.
   Capítulos, botões e "pular animação" ficam em site.js; aqui ficam a cena, a física e os balões do lacre. */
(async () => {
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('scene');
  const track = document.getElementById('track');
  const trackPin = document.getElementById('trackPin');
  const hud = document.getElementById('hud');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // logos da marca: os mesmos paths do sprite SVG da página, desenhados no canvas das texturas
  const logoPath = (id, part) => new Path2D(document.querySelector(`#${id} .lg-${part}`).getAttribute('d'));
  const WM = { w: 833.41, h: 100, ink: logoPath('vs-wordmark', 'ink'), acc: logoPath('vs-wordmark', 'accent') };
  const MK = { w: 668, h: 359, ink: logoPath('vs-mark', 'ink'), acc: logoPath('vs-mark', 'accent') };
  function drawLogo(g, L, x, y, w, ink, acc) {
    const s = w / L.w; g.save(); g.translate(x, y); g.scale(s, s);
    g.fillStyle = ink; g.fill(L.ink); g.fillStyle = acc; g.fill(L.acc); g.restore();
  }
  // símbolo de aproximação, o mesmo do lacre em site.js (#vs-nfc no sprite): o oval com as ondas e a mão com o celular.
  // (x, y) é o centro do desenho e h a altura
  const NFC = (() => {
    const sym = document.getElementById('vs-nfc'), [, , w, h] = sym.getAttribute('viewBox').split(' ').map(Number);
    return { w, h, path: new Path2D([...sym.querySelectorAll('path')].map(p => p.getAttribute('d')).join('')) };
  })();
  function drawNfc(g, x, y, h, color) {
    const s = h / NFC.h;
    g.save(); g.translate(x - NFC.w * s / 2, y - h / 2); g.scale(s, s); g.fillStyle = color; g.fill(NFC.path, 'evenodd'); g.restore();
  }
  const SANS = 'Inter, "Segoe UI", Roboto, sans-serif', MONO = '"JetBrains Mono", Consolas, monospace';

  let THREE;
  try {
    THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js');
  } catch (err) {
    console.error('Three.js não carregou', err);
    stage.classList.add('is-nogl');
    hud.style.display = 'none';
    return;
  }
  // o trabalho pesado (texturas, shaders) só começa depois que a página carregou, em momentos ociosos
  if (document.readyState !== 'complete') await new Promise(r => addEventListener('load', r, { once: true }));
  const idle = () => new Promise(r => window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 600 }) : setTimeout(r, 16));
  await idle();

  /* ---------- helpers ---------- */
  const PI = Math.PI;
  const V2 = (x, y) => new THREE.Vector2(x, y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  // piecewise-linear keyframe track: [[progress, value], ...]
  const kf = pts => p => {
    if (p <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (p <= pts[i][0]) { const [p0, v0] = pts[i - 1], [p1, v1] = pts[i]; return lerp(v0, v1, (p - p0) / (p1 - p0)); }
    }
    return pts[pts.length - 1][1];
  };

  /* ---------- bottle: square section with chamfered corners (the classic 700 ml whisky bottle) ----------
     half width 0.85 → 1.7 wide, 5.95 tall to the top of the cap (width/height ≈ 0.29) */
  const HW = 0.85, C = 0.24, WALL = 0.07, RN = 0.30;      // half width, corner chamfer, glass wall, neck radius
  const Y0 = 3.5, Y1 = 4.6;                                // shoulder from body top to neck base
  // tampa alta, na proporção do lacre que passa por cima dela (lateral de 35 mm e Ø 31 mm para uma tira de 15 mm):
  // o topo do lacre (612 no desenho) vai de uma borda à outra e a lateral reta tem a altura da arte até a ruptura (655)
  const CAP_R = 0.35, CAP_RIM = 0.045, YJ = 5.1;                       // raio, borda arredondada, junção tampa/gargalo
  const SEAL_K = (2 * (CAP_R - CAP_RIM) + PI * CAP_RIM) / 612;          // unidades do mundo por unidade do desenho do lacre
  const YS = YJ + 655 * SEAL_K, YT = YS + CAP_RIM;                      // fim da lateral reta e topo da tampa
  const HWI = HW - WALL - 0.005, RNI = RN - WALL - 0.005;  // liquid cavity
  const CI = C + 0.586 * (WALL + 0.005);                   // chamfer of the inward-offset octagon
  const FILL = 3.62;                                       // fill line just into the shoulder, like a sealed bottle
  const ease = t => 0.5 - 0.5 * Math.cos(PI * t);
  const qOf = t => 1 - smoothstep(0.1, 0.85, t);           // squareness: 1 in the body, 0 at the neck
  // polar radius of a chamfered square (hw = half width, c = chamfer length along the side)
  const octRho = (th, hw, c) => {
    let x = Math.abs(Math.cos(th)), z = Math.abs(Math.sin(th));
    if (z > x) { const s = x; x = z; z = s; }
    return Math.min(hw / Math.max(x, 1e-4), (2 * hw - c) / (x + z));
  };
  const rho = (th, rg) => lerp(rg.rc, octRho(th, rg.hw, rg.c), rg.q);
  // angular samples with the octagon corners duplicated, so the chamfer edges stay crisp
  const th1 = Math.atan2(HW - C, HW), th2 = Math.atan2(HW, HW - C);
  const corners = []; for (let k = 0; k < 4; k++) corners.push(th1 + k * PI / 2, th2 + k * PI / 2);
  const thetas = [], edgeEnd = [];
  for (let e = 0; e < 8; e++) {
    const a = corners[e], b = e < 7 ? corners[e + 1] : corners[0] + 2 * PI, n = e % 2 === 0 ? 6 : 18;
    for (let s = 0; s <= n; s++) { thetas.push(lerp(a, b, s / n)); edgeEnd.push(s === n); }
  }
  const pole = y => ({ y, hw: 0, c: 0, q: 0, rc: 0 });
  const sq = (y, hw, c = C) => ({ y, hw, c, q: 1, rc: hw });
  const rd = (y, r) => ({ y, hw: r, c: 0, q: 0, rc: r });
  const shoulderRings = (hwBody, hwNeck, cBase, up) => {
    const out = [];
    for (let k = 1; k < 26; k++) {
      const t = up ? k / 26 : 1 - k / 26, hw = lerp(hwBody, hwNeck, ease(t));
      out.push({ y: Y0 + (Y1 - Y0) * t, hw, c: Math.min(cBase, hw * 0.8), q: qOf(t), rc: hw });
    }
    return out;
  };
  function ringMesh(rings) {
    const n = thetas.length, pos = [], uv = [], idx = [];
    rings.forEach((rg, i) => {
      for (let j = 0; j < n; j++) { const th = thetas[j], r = rho(th, rg); pos.push(r * Math.cos(th), rg.y, r * Math.sin(th)); uv.push(j / (n - 1), i / (rings.length - 1)); }
    });
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < n - 1; j++) {
      if (edgeEnd[j]) continue;
      const a = i * n + j, b = a + n;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }

  /* ---------- scroll choreography (p = 0..1 along the track) ---------- */
  const K = {
    // o lacre fica só na frente: no fim a garrafa gira pouco, para ele continuar à vista
    rot: kf([[0, 0], [0.12, 0.25 * PI], [0.5, 2.4 * PI], [0.72, 3.7 * PI], [0.85, 4 * PI], [0.93, 4.06 * PI], [1, 4.13 * PI]]),
    // no fim, a câmera enquadra o lacre inteiro (do gargalo ao topo da tampa) e sobe o bastante para ver o holograma no topo
    dist: kf([[0, 13.5], [0.14, 13.2], [0.2, 12.5], [0.4, 12.5], [0.48, 7.8], [0.64, 6.7], [0.72, 4.9], [0.85, 3.55], [1, 3.4]]),
    ty: kf([[0, 2.95], [0.4, 2.95], [0.48, 3.95], [0.64, 4.42], [0.72, 4.85], [0.85, 5.3], [1, 5.32]]),
    el: kf([[0, 0.08], [0.5, 0.12], [0.72, 0.28], [0.85, 0.5], [1, 0.55]]),
    // lateral lens shift in world units at the target depth (negative = bottle to the right of the text)
    offx: kf([[0, -1.6], [0.14, -1.6], [0.2, 1.8], [0.4, 1.8], [0.46, -1.3], [0.64, -1.1], [0.72, 0], [0.88, 0], [1, -0.3]]),
    hud: kf([[0, 0], [0.79, 0], [0.83, 1], [0.88, 1], [0.905, 0], [1, 0]]),   // balões só no capítulo "Lacre"
  };

  /* ---------- liquid model: one height field shared by the volume, its surface, the glass and the shadow ----------
     h(x,z) in the bottle's own frame = fill level + tilt (gravity + sloshing) + first symmetric mode + ripples + meniscus. */
  const liquidUniforms = {
    uH0: { value: FILL },
    uTilt: { value: new THREE.Vector2(0, 0) },
    uSym: { value: 0 },
    uRip: { value: 0 },
    uSwirl: { value: 0 },
    uTime: { value: 0 },
    uR: { value: 0.9 },
  };
  const f = v => v.toFixed(4);
  const LIQUID_GLSL = /* glsl */`
    uniform float uH0; uniform vec2 uTilt; uniform float uSym; uniform float uRip; uniform float uSwirl; uniform float uTime; uniform float uR;
    const vec2 K1 = vec2(12.0, 5.0); const vec2 K2 = vec2(-7.0, 15.0); const vec2 K3 = vec2(18.0, -9.0);
    float octRho(float th, float hw, float c) {
      float x = abs(cos(th)), z = abs(sin(th));
      if (z > x) { float s = x; x = z; z = s; }
      return min(hw / max(x, 1e-4), (2.0 * hw - c) / (x + z));
    }
    float cavRho(float th, float y) {           // radius of the liquid cavity in direction th at height y
      float t = clamp((y - ${f(Y0)}) / ${f(Y1 - Y0)}, 0.0, 1.0);
      float e = 0.5 - 0.5 * cos(3.14159265 * t);
      float hw = mix(${f(HWI)}, ${f(RNI)}, e);
      float q = 1.0 - smoothstep(0.1, 0.85, t);
      float c = min(${f(CI)}, hw * 0.8);
      return mix(hw, octRho(th, hw, c), q);
    }
    float liquidH(vec2 p) {
      float r = length(p);
      float h = uH0 + dot(uTilt, p);
      h += uSwirl * (r * r - 0.5 * uR * uR);       // paraboloid of a swirling liquid (volume preserving)
      h += uSym * cos(3.8317 * r / uR);
      h += uRip * (0.5 * sin(dot(p, K1) - uTime * 5.0) + 0.35 * sin(dot(p, K2) - uTime * 6.3) + 0.25 * sin(dot(p, K3) + uTime * 7.1));
      float rw = cavRho(atan(p.y, p.x), uH0);
      h += 0.008 * smoothstep(rw - 0.06, rw, r);   // meniscus climbing the wall
      return h;
    }
    vec2 liquidGrad(vec2 p) {
      float r = max(length(p), 1e-4);
      vec2 g = uTilt;
      g += 2.0 * uSwirl * p;
      g += uSym * (-sin(3.8317 * r / uR)) * (3.8317 / uR) * (p / r);
      g += uRip * (0.5 * cos(dot(p, K1) - uTime * 5.0) * K1 + 0.35 * cos(dot(p, K2) - uTime * 6.3) * K2 + 0.25 * cos(dot(p, K3) + uTime * 7.1) * K3);
      float rw = cavRho(atan(p.y, p.x), uH0);
      float t = clamp((r - (rw - 0.06)) / 0.06, 0.0, 1.0);
      g += (0.008 * 6.0 * t * (1.0 - t) / 0.06) * (p / r);
      return g;
    }
  `;
  // per-fragment thickness: for a convex body the path through the liquid shrinks toward the silhouette (≈ 2R·N·V),
  // which is what makes the edges glow gold while the centre stays deep amber
  const thicknessChunk = THREE.ShaderChunk.transmission_fragment.replace(
    /material\.thickness\s*=\s*thickness;/,
    'material.thickness = thickness * clamp(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.2, 1.0);'
  );
  if (thicknessChunk === THREE.ShaderChunk.transmission_fragment) console.warn('VeriSeal: espessura por fragmento não aplicada');

  function injectLiquid(mat, mode) {
    mat.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, liquidUniforms);
      shader.vertexShader = LIQUID_GLSL + 'varying vec3 vLocal;\n' + shader.vertexShader;
      shader.fragmentShader = LIQUID_GLSL + 'varying vec3 vLocal;\n' + shader.fragmentShader;
      if (mode === 'surface') {
        shader.vertexShader = shader.vertexShader
          .replace('#include <beginnormal_vertex>', 'vec2 lg = liquidGrad(position.xz);\nvec3 objectNormal = normalize(vec3(-lg.x, 1.0, -lg.y));\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(tangent.xyz);\n#endif')
          .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position.x, liquidH(position.xz), position.z);\nvLocal = transformed;');
        shader.fragmentShader = shader.fragmentShader
          .replace('void main() {', 'void main() {\nif (length(vLocal.xz) > cavRho(atan(vLocal.z, vLocal.x), vLocal.y) + 0.003) discard;')
          // an interface, not a lid: see-through when looked at straight on, reflective at grazing angles
          .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n{ float fr = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.5); gl_FragColor.a = clamp(0.22 + 0.78 * fr, 0.0, 1.0); }');
      } else {
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;');
      }
      if (mode === 'volume' || mode === 'depth') {
        shader.fragmentShader = shader.fragmentShader
          .replace('void main() {', 'void main() {\nfloat lh = liquidH(vLocal.xz);\nif (vLocal.y > lh) discard;\nfloat ldepth = lh - vLocal.y;');
      }
      if (mode === 'volume') {
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <transmission_fragment>', thicknessChunk)
          // a touch lighter right under the surface where light enters
          .replace('#include <color_fragment>', '#include <color_fragment>\n{ float k = 1.0 - exp(-ldepth * 3.0); diffuseColor.rgb = mix(vec3(1.0, 0.93, 0.78), diffuseColor.rgb, k); }');
      }
      if (mode === 'glass') {
        shader.fragmentShader = shader.fragmentShader
          // the wet line where the liquid meets the glass
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ float lh = liquidH(vLocal.xz); float band = 1.0 - smoothstep(0.0, 0.022, abs(vLocal.y - lh)); band *= step(0.5, length(vLocal.xz)); totalEmissiveRadiance += vec3(0.95, 0.66, 0.30) * band * 0.45; }')
          // Fresnel opacity: clear glass is nearly invisible face-on and reads at its edges
          .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n{ float fr = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 4.0); gl_FragColor.a = clamp(0.035 + 0.965 * fr, 0.0, 1.0); }');
      }
    };
    mat.customProgramCacheKey = () => 'veriseal-liquid-' + mode;
    return mat;
  }
  // polar grid disk lying in the XZ plane (dense enough for the ripples)
  function diskGrid(radius, rings, segs) {
    const pos = [], nrm = [], uv = [], idx = [];
    for (let i = 0; i <= rings; i++) {
      const r = radius * i / rings;
      for (let j = 0; j <= segs; j++) {
        const a = j / segs * PI * 2;
        pos.push(r * Math.cos(a), 0, r * Math.sin(a)); nrm.push(0, 1, 0);
        uv.push(0.5 + 0.5 * (r / radius) * Math.cos(a), 0.5 + 0.5 * (r / radius) * Math.sin(a));
      }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j, a1 = a + 1, b = a + segs + 1, b1 = b + 1;
      idx.push(a, a1, b, a1, b1, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  /* ---------- textures drawn on canvas (no external assets) ---------- */
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.redraw = () => { draw(c); t.needsUpdate = true; };
    return t;
  }
  const lsOf = g => v => { if ('letterSpacing' in g) g.letterSpacing = v; };
  const rrectOf = g => (x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };
  // medalhão holográfico com o monograma: o mesmo holograma do lacre na tampa, para os dois conversarem
  function drawHolo(g, cx, cy, R, ring) {
    g.save();
    g.shadowColor = 'rgba(3,173,249,.45)'; g.shadowBlur = R * 0.22;
    let holo;
    if (g.createConicGradient) {
      holo = g.createConicGradient(0.5, cx, cy);
      ['#cfe9ff', '#e6d8ff', '#ffe0f0', '#fff6d6', '#dcfff0', '#cfe9ff', '#e9ddff', '#ffe6d2', '#cfe9ff'].forEach((c2, i, arr) => holo.addColorStop(i / (arr.length - 1), c2));
    } else { holo = g.createRadialGradient(cx, cy, 0, cx, cy, R); holo.addColorStop(0, '#f2f6ff'); holo.addColorStop(1, '#cfe0ff'); }
    g.fillStyle = holo; g.beginPath(); g.arc(cx, cy, R, 0, PI * 2); g.fill();
    g.restore();
    // brilho especular
    const sh = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, 0, cx - R * 0.35, cy - R * 0.4, R * 1.1);
    sh.addColorStop(0, 'rgba(255,255,255,.75)'); sh.addColorStop(0.35, 'rgba(255,255,255,.08)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sh; g.beginPath(); g.arc(cx, cy, R, 0, PI * 2); g.fill();
    // roseta de segurança
    g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = R * 0.006;
    for (let i = 0; i < 9; i++) { g.beginPath(); for (let j = 0; j <= 200; j++) { const t = j / 200 * PI * 2, r = R * (0.52 + 0.17 * Math.sin(8 * t + i * 0.5)); const x = cx + r * Math.cos(t), y = cy + r * Math.sin(t); j ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); g.stroke(); }
    // aros
    g.strokeStyle = 'rgba(6,42,99,.5)'; g.lineWidth = R * 0.012; g.beginPath(); g.arc(cx, cy, R * 0.97, 0, PI * 2); g.stroke();
    g.strokeStyle = 'rgba(6,42,99,.35)'; g.lineWidth = R * 0.006; g.beginPath(); g.arc(cx, cy, R * 0.72, 0, PI * 2); g.stroke();
    // microtexto em volta
    if (ring) {
      g.fillStyle = 'rgba(6,42,99,.8)'; g.font = `600 ${Math.round(R * 0.075)}px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const txt = ring, rr = R * 0.845;
      for (let i = 0; i < txt.length; i++) { const ang = -PI / 2 + i / txt.length * PI * 2; g.save(); g.translate(cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)); g.rotate(ang + PI / 2); g.fillText(txt[i], 0, 0); g.restore(); }
    }
    const mw = R * 1.08;
    drawLogo(g, MK, cx - mw / 2, cy - mw * MK.h / MK.w / 2, mw, '#062a63', '#0a76c4');
  }
  // moldura e fundo comuns aos rótulos VeriSeal
  function labelBase(g, Wd, Hd) {
    const rr = rrectOf(g);
    const bg = g.createLinearGradient(0, 0, Wd * 0.6, Hd); bg.addColorStop(0, '#0f3d84'); bg.addColorStop(0.5, '#072c66'); bg.addColorStop(1, '#021838');
    g.fillStyle = bg; g.fillRect(0, 0, Wd, Hd);
    g.lineWidth = 1.4;
    for (let i = 0; i < 12; i++) {
      g.strokeStyle = 'rgba(120,200,255,.055)'; g.beginPath();
      for (let y = 0; y <= Hd; y += 10) { const x = Wd / 2 + Wd * 0.42 * Math.sin(y * 0.0075 + i * 0.45) * (0.6 + 0.4 * Math.sin(y * 0.0028 - i * 0.6)); y ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
    const vg = g.createRadialGradient(Wd / 2, Hd * 0.4, 0, Wd / 2, Hd * 0.4, Wd * 0.75); vg.addColorStop(0, 'rgba(3,173,249,.16)'); vg.addColorStop(1, 'rgba(3,173,249,0)');
    g.fillStyle = vg; g.fillRect(0, 0, Wd, Hd);
    g.strokeStyle = 'rgba(3,173,249,.85)'; g.lineWidth = 5; rr(30, 30, Wd - 60, Hd - 60, 30); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1.6; rr(48, 48, Wd - 96, Hd - 96, 20); g.stroke();
  }
  // título em versalete com fios ciano dos dois lados
  function capsTitle(g, text, cx, y, size, spacing, color) {
    const ls = lsOf(g);
    ls(spacing + 'px'); g.font = `600 ${size}px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = g.measureText(text).width;
    g.fillStyle = color; g.fillText(text, cx + spacing / 2, y);
    g.fillStyle = '#03adf9'; g.fillRect(cx - w / 2 - 110, y - 1.5, 80, 3); g.fillRect(cx + w / 2 + 30, y - 1.5, 80, 3);
    ls('0px');
  }
  function drawLabel(c) {
    // rótulo frontal 100% VeriSeal, 1000 x 1545 (plano de 1,1 x 1,7): medalhão, logo, chamada
    const g = c.getContext('2d'), s = c.width / 1000, ls = lsOf(g);
    g.setTransform(s, 0, 0, s, 0, 0);
    labelBase(g, 1000, 1545);
    capsTitle(g, 'IDENTIDADE DIGITAL', 500, 150, 24, 10, 'rgba(255,255,255,.82)');
    drawHolo(g, 500, 505, 245, 'VERISEAL • PRODUTO ORIGINAL • VERISEAL • PRODUTO ORIGINAL • ');
    drawLogo(g, WM, 150, 873 - 700 * WM.h / WM.w / 2, 700, '#ffffff', '#03adf9');
    g.fillStyle = '#03adf9'; g.fillRect(460, 975, 80, 4);
    g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = '#ffffff';
    ls('16px'); g.font = `700 34px ${SANS}`; g.fillText('PRODUTO ORIGINAL', 508, 1068);
    // chamada: símbolo + frase numa linha só
    ls('3px'); g.font = `500 26px ${SANS}`; g.fillStyle = 'rgba(255,255,255,.88)';
    const t = 'Aproxime o celular do lacre', tw = g.measureText(t).width, sh = 70, sw = sh * NFC.w / NFC.h, gx = 500 - (sw + 20 + tw) / 2;
    drawNfc(g, gx + sw / 2, 1192, sh, '#ffffff');
    g.textAlign = 'left'; g.fillText(t, gx + sw + 20, 1201);
    g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(380, 1290, 240, 1.5);
    ls('8px'); g.font = `600 32px ${MONO}`; g.fillStyle = 'rgba(255,255,255,.9)'; g.fillText('Nº A7F3K9B21', 504, 1392);
    ls('0px');
  }
  function drawBackLabel(c) {
    // contrarrótulo VeriSeal, 800 x 900 — mesma linguagem do frontal
    const g = c.getContext('2d'), s = c.width / 800, ls = lsOf(g);
    g.setTransform(s, 0, 0, s, 0, 0);
    labelBase(g, 800, 900);
    drawLogo(g, WM, 170, 137 - 460 * WM.h / WM.w / 2, 460, '#ffffff', '#03adf9');
    capsTitle(g, 'COMO VERIFICAR', 400, 262, 20, 8, 'rgba(255,255,255,.8)');
    g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = '#ffffff'; ls('0px'); g.font = `700 42px ${SANS}`;
    g.fillText('Esta garrafa tem', 400, 360); g.fillText('identidade digital.', 400, 410);
    drawNfc(g, 400, 535, 150, '#03adf9');
    g.font = `500 30px ${SANS}`; g.fillStyle = 'rgba(255,255,255,.86)';
    g.fillText('Aproxime o celular do lacre', 400, 670); g.fillText('para confirmar a autenticidade.', 400, 712);
    g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(300, 760, 200, 1.5);
    ls('6px'); g.font = `600 26px ${MONO}`; g.fillStyle = 'rgba(255,255,255,.9)'; g.fillText('Nº A7F3K9B21', 403, 815);
    ls('0px');
  }
  // as texturas usam Inter e JetBrains Mono: desenha uma vez só, depois que os pesos usados no canvas carregaram.
  // Se as fontes demorarem mais de 3 s, desenha com a fonte do sistema e redesenha quando elas chegarem.
  const fontsReady = document.fonts ? Promise.all([`500 42px Inter`, `600 26px Inter`, `700 42px Inter`, `400 26px "JetBrains Mono"`, `500 26px "JetBrains Mono"`, `600 26px "JetBrains Mono"`].map(f => document.fonts.load(f))).catch(() => { }) : Promise.resolve();
  const fontsLoaded = await Promise.race([fontsReady.then(() => true), new Promise(r => setTimeout(() => r(false), 3000))]);
  // 1024 px de largura já sobram para o maior tamanho em que o rótulo aparece (o de 1400 custava o dobro para desenhar e enviar)
  const labelTex = canvasTex(1024, 1582, drawLabel);
  const backTex = canvasTex(768, 864, drawBackLabel);
  const lateRedraw = [labelTex, backTex];
  if (!fontsLoaded) fontsReady.then(() => lateRedraw.forEach(t => t.userData.redraw()));
  const gradientTex = (w, h, draw) => canvasTex(w, h, draw);
  await idle();

  /* ---------- renderer ---------- */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (err) { stage.classList.add('is-nogl'); return; }
  // em produção não confere erros de shader: a conferência força a compilação a terminar na hora, travando a página
  renderer.debug.checkShaderErrors = false;
  // o líquido refrata o estúdio atrás dele (degradê, piso e sombra, tudo suave): a imagem que ele refrata pode ter metade
  // da resolução, o que corta o passe extra de cada quadro a 1/4. Nesta versão do Three.js só esse passe lê o tamanho.
  const drawingBufferSize = renderer.getDrawingBufferSize.bind(renderer);
  renderer.getDrawingBufferSize = target => drawingBufferSize(target).multiplyScalar(0.5).floor();
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.shadowMap.autoUpdate = false;   // a sombra só é refeita quando a garrafa gira ou inclina (syncShadow)
  renderer.shadowMap.needsUpdate = true;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  labelTex.anisotropy = maxAniso; backTex.anisotropy = maxAniso;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9ecf1);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);

  /* environment: a bright studio with big softboxes and black flags at the sides, baked to PMREM.
     The flags are what give clear glass its dark edges. */
  {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(24, 24, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xd8dce4).multiplyScalar(0.9), side: THREE.BackSide })));
    const panel = (w, h, hex, k, x, y, z) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
    };
    panel(6, 10, 0xfff1dc, 7, -7, 6, 5);     // warm key softbox, upper left
    panel(2, 10, 0xe8f0ff, 5, 7, 4, -3);     // cool strip, right/back
    panel(10, 2, 0xffffff, 4, 0, 10, 2);     // top light
    panel(4, 12, 0x000000, 1, -9, 2, -1);    // black flag left
    panel(4, 12, 0x000000, 1, 9, 2, 2);      // black flag right
    panel(20, 4, 0x1a1815, 1, 0, -6, 0);     // dark floor
    await idle();   // criar o contexto WebGL já foi uma tarefa longa: deixa a página respirar antes da próxima
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.02).texture;
    pm.dispose();
  }
  await idle();

  /* lights */
  scene.add(new THREE.AmbientLight(0xfff4e6, 0.25));
  // key light high and to the left, slightly in front: a short warm shadow that falls to the right where it can be seen
  const key = new THREE.DirectionalLight(0xfff0dc, 2.6); key.position.set(-6.5, 9, 2.5); key.target.position.set(0, 3, 0); scene.add(key, key.target);
  // sombra bem difusa: 512 px com metade do raio dá o mesmo desfoque de 1024 px, com 1/8 do custo
  key.castShadow = true; key.shadow.mapSize.set(512, 512); key.shadow.bias = -0.0002; key.shadow.normalBias = 0.02; key.shadow.radius = 7; key.shadow.blurSamples = 12;
  Object.assign(key.shadow.camera, { left: -3.5, right: 3.5, top: 4.5, bottom: -4.5, near: 1, far: 30 });
  const rim = new THREE.DirectionalLight(0xdfe9ff, 1.2); rim.position.set(6, 5, -5); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xfff0dc, 0.5); fill.position.set(4, 2, 7); scene.add(fill);

  /* studio sweep behind the bottle (in 3D so the liquid refracts it) and a floor that only receives the shadow */
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 40),
    new THREE.MeshBasicMaterial({
      map: gradientTex(64, 512, c => {
        const g = c.getContext('2d'), grd = g.createLinearGradient(0, 0, 0, 512);
        grd.addColorStop(0, '#f7f8fa'); grd.addColorStop(0.55, '#eceff3'); grd.addColorStop(1, '#cdd3dc');
        g.fillStyle = grd; g.fillRect(0, 0, 64, 512);
      }), toneMapped: false
    })
  );
  backdrop.position.set(0, 4, -9); scene.add(backdrop);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.ShadowMaterial({ color: 0x2c2a2a, opacity: 0.3 }));
  floor.rotation.x = -PI / 2; floor.receiveShadow = true; scene.add(floor);
  let causticPivot = null;
  // light that crosses the whisky is focused into a warm patch inside the shadow (the caustic every bottle casts)
  {
    const toLight = key.position.clone().sub(key.target.position).normalize();
    const spread = Math.hypot(toLight.x, toLight.z) / toLight.y;   // floor offset per unit of height
    const len = 3.3 * spread * 1.25, wid = 1.45;
    const pivot = new THREE.Group(); pivot.rotation.y = Math.atan2(toLight.x, toLight.z); pivot.position.y = 0.004;
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(wid, len), new THREE.MeshBasicMaterial({
      map: canvasTex(256, 256, c => { const g = c.getContext('2d'), grd = g.createRadialGradient(128, 128, 0, 128, 128, 128); grd.addColorStop(0, 'rgba(238,164,62,0.55)'); grd.addColorStop(0.45, 'rgba(238,164,62,0.22)'); grd.addColorStop(1, 'rgba(238,164,62,0)'); g.fillStyle = grd; g.fillRect(0, 0, 256, 256); }),
      transparent: true, depthWrite: false, toneMapped: false,
    }));
    patch.rotation.x = -PI / 2; patch.position.z = -(len / 2 - 0.35); patch.renderOrder = 1;
    pivot.add(patch); scene.add(pivot); causticPivot = pivot;
  }
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({
    map: canvasTex(256, 256, c => { const g = c.getContext('2d'), grd = g.createRadialGradient(128, 128, 0, 128, 128, 128); grd.addColorStop(0, 'rgba(30,32,44,0.32)'); grd.addColorStop(0.5, 'rgba(30,32,44,0.1)'); grd.addColorStop(1, 'rgba(30,32,44,0)'); g.fillStyle = grd; g.fillRect(0, 0, 256, 256); }),
    transparent: true, depthWrite: false, toneMapped: false,
  }));
  contact.rotation.x = -PI / 2; contact.position.y = 0.003; scene.add(contact);

  /* ---------- the bottle ---------- */
  const bottle = new THREE.Group(); scene.add(bottle);

  // hollow glass shell: chamfered base, square body, sloped shoulder, round neck; then back down the inside to a punt
  const glassRings = [
    pole(0), sq(0, HW - 0.12), sq(0.06, HW - 0.03), sq(0.16, HW), sq(Y0, HW),
    ...shoulderRings(HW, RN, C, true),
    rd(Y1, RN), rd(5.16, RN), rd(5.2, RN + 0.025), rd(5.3, RN + 0.025), rd(5.34, RN), rd(5.5, RN), rd(5.5, RN - WALL), // neck; its glass bead hides under the cap
    rd(Y1, RN - WALL), ...shoulderRings(HW - WALL, RN - WALL, C + 0.586 * WALL, false),
    sq(Y0, HW - WALL, C + 0.586 * WALL), sq(0.42, HW - WALL, C + 0.586 * WALL), sq(0.36, HW - WALL - 0.06, C + 0.586 * WALL), rd(0.40, 0.35), pole(0.55),
  ];
  const glass = new THREE.Mesh(ringMesh(glassRings), injectLiquid(new THREE.MeshPhysicalMaterial({
    color: 0x0c0b0a, metalness: 0, roughness: 0.02, ior: 1.5, specularIntensity: 1,
    clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.3,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }), 'glass'));
  glass.renderOrder = 2; // drawn after the liquid surface: the front wall is the nearest layer
  bottle.add(glass);

  // the whisky: a transmissive volume that refracts the studio behind it and absorbs light along its thickness
  const liquidRings = [
    pole(0.56), rd(0.41, 0.35), sq(0.37, HWI - 0.06, CI), sq(0.43, HWI, CI), sq(Y0, HWI, CI),
    ...shoulderRings(HWI, RNI, CI, true), rd(Y1, RNI), rd(5.2, RNI), pole(5.2),
  ];
  const liquid = new THREE.Mesh(ringMesh(liquidRings), injectLiquid(new THREE.MeshPhysicalMaterial({
    color: 0xfff3e0, roughness: 0.06, metalness: 0, ior: 1.36,
    // thickness also sets how far the refracted ray wanders; 0.9 keeps it on the backdrop instead of the floor,
    // and attenuationDistance is scaled with it so the absorption (the colour) stays the same
    transmission: 1, thickness: 0.9, attenuationColor: new THREE.Color(0xe6a247), attenuationDistance: 0.6,
    specularIntensity: 1, envMapIntensity: 1.0, side: THREE.DoubleSide, // inner walls show through the surface
  }), 'volume'));
  bottle.add(liquid);

  // shadow-only silhouette of the whole bottle: it writes neither colour nor depth, so the camera never shows it, but
  // it casts, so the shadow is one continuous shape instead of a cut-out of the liquid with the cap floating apart
  const silhouette = new THREE.Mesh(ringMesh([
    pole(0.04), sq(0.04, HW - 0.1), sq(0.16, HW), sq(Y0, HW), ...shoulderRings(HW, RN, C, true), rd(Y1, RN),
    rd(YJ, RN), rd(YJ, CAP_R), rd(YS, CAP_R), rd(YT, CAP_R - CAP_RIM), pole(YT),
  ]), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  silhouette.castShadow = true; silhouette.renderOrder = -1; bottle.add(silhouette);

  const surface = new THREE.Mesh(diskGrid(1.15, 56, 160), injectLiquid(new THREE.MeshPhysicalMaterial({
    color: 0xd9863a, roughness: 0.03, metalness: 0, ior: 1.36, specularIntensity: 1,
    clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.5, emissive: 0x3a1a06, emissiveIntensity: 0.35, side: THREE.DoubleSide,
    transparent: true,
  }), 'surface'));
  surface.frustumCulled = false; surface.renderOrder = 1;
  bottle.add(surface);

  // rótulo VeriSeal na face frontal (grande); um traço de transmissão o mantém fora do buffer de refração, sem fantasma
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.7),
    new THREE.MeshPhysicalMaterial({ map: labelTex, roughness: 0.5, metalness: 0, envMapIntensity: 0.7, clearcoat: 0.45, clearcoatRoughness: 0.22, transmission: 0.001, thickness: 0 }));
  label.position.set(0, 1.86, HW + 0.004); bottle.add(label);
  // contrarrótulo VeriSeal na face de trás: aparece quando a garrafa gira
  const backLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.97),
    new THREE.MeshPhysicalMaterial({ map: backTex, roughness: 0.5, metalness: 0, envMapIntensity: 0.6, clearcoat: 0.4, clearcoatRoughness: 0.25, transmission: 0.001, thickness: 0 }));
  backLabel.position.set(0, 2.0, -(HW + 0.004)); backLabel.rotation.y = PI; bottle.add(backLabel);

  // tampa de rosca alta, azul-marinho quase preto, com frisos e um filete ciano acima da saia.
  // Fica num grupo próprio: no modo "lacre adulterado" ela gira e sobe, levando junto a parte de cima do lacre.
  const capGroup = new THREE.Group(); bottle.add(capGroup);
  const capProfile = [V2(0, YJ), V2(CAP_R, YJ), V2(CAP_R, YS)];
  for (let i = 1; i <= 8; i++) { const a = i / 8 * PI / 2; capProfile.push(V2(CAP_R - CAP_RIM + CAP_RIM * Math.cos(a), YS + CAP_RIM * Math.sin(a))); }
  capProfile.push(V2(0, YT));
  const capBody = new THREE.Mesh(new THREE.LatheGeometry(capProfile, 128),
    new THREE.MeshPhysicalMaterial({ color: 0x07142e, roughness: 0.34, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 1.0 }));
  capGroup.add(capBody);
  const capSkinTex = canvasTex(64, 1024, c => {
    const g = c.getContext('2d'); g.fillStyle = '#0a1a3a'; g.fillRect(0, 0, 64, 1024);
    for (let y = 2; y < 952; y += 4) { g.fillStyle = (y >> 2) % 2 ? '#050d20' : '#163066'; g.fillRect(0, y, 64, 1.5); }
    g.fillStyle = '#03adf9'; g.fillRect(0, 960, 64, 9);
    g.fillStyle = '#061128'; g.fillRect(0, 976, 64, 48);
  });
  capSkinTex.anisotropy = maxAniso;
  const capSkin = new THREE.Mesh(new THREE.CylinderGeometry(CAP_R + 0.002, CAP_R + 0.002, YS - YJ, 128, 1, true),
    new THREE.MeshPhysicalMaterial({ map: capSkinTex, roughness: 0.4, metalness: 0.2, clearcoat: 0.5, clearcoatRoughness: 0.25, envMapIntensity: 1.0 }));
  capSkin.position.y = (YJ + YS) / 2; capGroup.add(capSkin); // a lateral reta, embaixo da borda arredondada

  /* o lacre inteligente: uma tira só, exatamente o lacre do topo da página (printSVG em site.js, 2612 x 280):
     verso (1000) + topo da tampa (612) + frente (1000). Sobe pelo gargalo atrás, cruza a junção tampa/gargalo (a ruptura
     do verso), sobe a lateral da tampa, passa por cima dela com o holograma no centro, desce a lateral da frente e cruza a
     junção de novo até o gargalo. Abrir a tampa rasga a tira nas duas linhas de ruptura; o chip NFC e a antena ficam
     laminados na ponta da frente. */
  const SEAL_LEN = 2612, SEAL_MID = 1306, SEAL_FX = 1612, SEAL_NB = 345, SEAL_NF = 2267;   // como SW, MID, FX, NB e NF em site.js
  const LIFT = 0.006;                                                  // a tira fica um fio acima da tampa e do vidro
  // caminho do eixo da tira no perfil, medido a partir do centro do topo (s ≥ 0; igual na frente e no verso):
  // topo plano → borda arredondada → lateral reta → degrau da tampa até o vidro do gargalo.
  // Devolve o raio e a altura do eixo e quanto a tira já abraça o cilindro (b: 0 no topo, 1 na lateral)
  const A0 = CAP_R - CAP_RIM, A1 = A0 + PI * CAP_RIM / 2, A2 = A1 + 655 * SEAL_K;
  function sealPath(s, lift) {
    const L = LIFT + lift;
    if (s <= A0) return { r: s, y: YT + L, b: 0 };
    if (s <= A1) { const a = (s - A0) / CAP_RIM; return { r: A0 + (CAP_RIM + L) * Math.sin(a), y: YS + (CAP_RIM + L) * Math.cos(a), b: smoothstep(0, PI / 2, a) }; }
    if (s <= A2) return { r: CAP_R + L, y: YS - (s - A1), b: 1 };
    const d = s - A2;
    return { r: lerp(CAP_R + L, RN + L - 0.002, smoothstep(0, 0.06, d)), y: YJ - d, b: 1 };
  }
  // um ponto do desenho (x ao longo da tira, y atravessado, como no SVG) na garrafa; lift afasta da superfície.
  // A borda de cima do desenho (y = 0) fica do lado +x, na frente e no verso
  function sealPoint(x, y, lift = 0) {
    const L = LIFT + lift, { r, y: h, b } = sealPath(Math.abs(x - SEAL_MID) * SEAL_K, lift), u = (140 - y) * SEAL_K;
    let px = u, pz = r, py = h;
    if (b > 0) { px = lerp(u, r * Math.sin(u / r), b); pz = lerp(r, r * Math.cos(u / r), b); }   // enrolada no cilindro
    if (b < 1) {                                       // no topo e na borda, os cantos da tira assentam na curva da tampa
      let rr = Math.hypot(px, pz);
      if (rr > CAP_R + L) { px *= (CAP_R + L) / rr; pz *= (CAP_R + L) / rr; rr = CAP_R + L; }
      if (rr > A0) py = Math.min(py, YS + Math.sqrt(Math.max(0, (CAP_RIM + L) ** 2 - (rr - A0) ** 2)));
    }
    return new THREE.Vector3(px, py, x >= SEAL_MID ? pz : -pz);
  }
  function buildSeal() {
    const nA = 560, nW = 14, pos = [], uv = [], idx = [];
    for (let i = 0; i <= nA; i++) {
      for (let j = 0; j <= nW; j++) { const p = sealPoint(i / nA * SEAL_LEN, 280 * (1 - j / nW)); pos.push(p.x, p.y, p.z); uv.push(i / nA, j / nW); }
    }
    for (let i = 0; i < nA; i++) for (let j = 0; j < nW; j++) { const a = i * (nW + 1) + j, b = a + nW + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  const sealGeo = buildSeal();
  const NFC_AT = sealPoint(SEAL_FX + 767.3, 183.3, 0.008);   // centro do oval do símbolo da frente (NFC_PING em site.js): os balões e as ondas da demonstração saem dali
  // a arte, desenhada como o printSVG de site.js. Cada ponta: logo VeriSeal deitada, aviso da ruptura e o símbolo de
  // aproximação com a chamada, de pé na garrafa (girados no desenho); o verso é a frente girada 180°.
  // No topo, o holograma com o VS deitado ao longo da tira
  const notch = x => [`H${x - 11}L${x} 13L${x + 11} 0`, `H${x + 11}L${x} 267L${x - 11} 280`];
  const SEAL_OUTLINE = new Path2D(`M24 0${notch(SEAL_NB)[0]}${notch(SEAL_NF)[0]}H${SEAL_LEN - 24}A24 24 0 0 1 ${SEAL_LEN} 24V256A24 24 0 0 1 ${SEAL_LEN - 24} 280${notch(SEAL_NF)[1]}${notch(SEAL_NB)[1]}H24A24 24 0 0 1 0 256V24A24 24 0 0 1 24 0Z`);
  const HX = 142, HY = 140, HR = 94, HK = 1.12;              // holograma no desenho de origem, ampliado HK no topo (como em site.js)
  const atHolo = g => { g.translate(SEAL_MID, HY); g.scale(HK, HK); g.translate(-HX, -HY); };
  function drawSealEnd(g, ls) {
    drawLogo(g, WM, 20, 140 - 598 * WM.h / WM.w / 2, 598, '#ffffff', '#03adf9');   // como WMX/WMW em site.js
    g.save(); g.translate(641, 140); g.rotate(-PI / 2); g.fillStyle = 'rgba(255,255,255,.55)'; g.font = `400 9px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    ls('2px'); g.fillText('ROMPE AO ABRIR', 0, 0); g.restore();
    g.save(); g.translate(0, 280); g.rotate(-PI / 2);
    drawNfc(g, 140, 770, 112, '#ffffff');                   // como CTA_V/NFC_H em site.js
    g.fillStyle = '#fff'; g.font = `700 34px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; ls('0.7px');
    g.fillText('APROXIME', 140, 885); g.fillText('O CELULAR', 140, 926);
    g.restore();
  }
  function drawSeal(c, orm) {
    const g = c.getContext('2d'), s = c.width / SEAL_LEN, ls = lsOf(g), rr = rrectOf(g);
    g.setTransform(s, 0, 0, s, 0, 0); g.clearRect(0, 0, SEAL_LEN, 280);
    if (orm) {                                               // R = iridescência, G = rugosidade, B = metal
      g.fillStyle = 'rgb(0,115,0)'; g.fill(SEAL_OUTLINE);
      g.save(); atHolo(g);
      g.fillStyle = 'rgb(255,58,255)'; g.beginPath(); g.arc(HX, HY, HR, 0, PI * 2); g.fill();
      drawLogo(g, MK, HX - 46, HY - 24.7, 92, 'rgb(40,110,0)', 'rgb(40,110,0)'); g.restore();
      return;
    }
    // azul-marinho mais claro no meio (o topo da tampa), escurecendo para as duas pontas
    const navy = g.createLinearGradient(0, 0, SEAL_LEN, 0);
    [[0, '#021a42'], [0.275, '#062a63'], [0.5, '#0d3a80'], [0.725, '#062a63'], [1, '#021a42']].forEach(([o, col]) => navy.addColorStop(o, col));
    g.fillStyle = navy; g.fill(SEAL_OUTLINE);
    // guilhoché
    g.save(); g.clip(SEAL_OUTLINE); g.lineWidth = 1;
    [[14, 108, 0.0115, 0.0042, 0, 'rgba(95,208,255,.1)'], [10, 70, 0.019, 0.006, 1.3, 'rgba(159,181,255,.08)']].forEach(([n, amp, f1, f2, ph0, col]) => {
      g.strokeStyle = col; g.beginPath();
      for (let i = 0; i < n; i++) {
        const ph = ph0 + i * 0.42;
        for (let x = -10; x <= SEAL_LEN + 10; x += 8) { const y = 140 + amp * Math.sin(x * f1 + ph) * (0.62 + 0.38 * Math.sin(x * f2 - ph * 0.7)); x < 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
      }
      g.stroke();
    });
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 2; g.stroke(SEAL_OUTLINE);
    g.strokeStyle = 'rgba(3,173,249,.38)'; g.lineWidth = 1.2; rr(12, 12, SEAL_LEN - 24, 256, 15); g.stroke();
    // holograma no topo: degradê, roseta de segurança, brilho, aro, microtexto e monograma deitado
    g.save(); atHolo(g);
    const holo = g.createLinearGradient(HX - HR, HY - HR, HX + HR, HY + HR);
    [[0, '#8fe3ff'], [0.18, '#b9a9ff'], [0.36, '#ffc4e5'], [0.52, '#fff1b0'], [0.7, '#b3ffd8'], [0.86, '#8fe3ff'], [1, '#c8b8ff']].forEach(([o, col]) => holo.addColorStop(o, col));
    g.fillStyle = holo; g.beginPath(); g.arc(HX, HY, HR, 0, PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.38)'; g.lineWidth = 0.8; g.beginPath();
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j <= 160; j++) { const t = j / 160 * PI * 2, r = 50 + 20 * Math.sin(7 * t + i * 0.55); j ? g.lineTo(HX + r * Math.cos(t), HY + r * Math.sin(t)) : g.moveTo(HX + r * Math.cos(t), HY + r * Math.sin(t)); }
      g.closePath();
    }
    g.stroke();
    const sh = g.createRadialGradient(HX - 0.3 * HR, HY - 0.4 * HR, 0, HX - 0.3 * HR, HY - 0.4 * HR, 1.4 * HR);
    sh.addColorStop(0, 'rgba(255,255,255,.85)'); sh.addColorStop(0.35, 'rgba(255,255,255,.1)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
    g.save(); g.globalAlpha = 0.5; g.fillStyle = sh; g.beginPath(); g.arc(HX, HY, HR, 0, PI * 2); g.fill(); g.restore();
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1.5; g.beginPath(); g.arc(HX, HY, HR, 0, PI * 2); g.stroke();
    g.translate(HX, HY);
    g.fillStyle = 'rgba(6,42,99,.72)'; g.font = `600 10.5px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    let d = 0;
    for (const ch of 'VERISEAL • PRODUTO ORIGINAL • VERISEAL • PRODUTO ORIGINAL •') {
      const cw = g.measureText(ch).width, a = PI + (d + cw / 2) / 80;
      g.save(); g.translate(80 * Math.cos(a), 80 * Math.sin(a)); g.rotate(a + PI / 2); g.fillText(ch, 0, 0); g.restore();
      d += cw + 2.1;
    }
    drawLogo(g, MK, -46, -24.7, 92, '#062a63', '#0a76c4');
    g.restore();
    // linhas de ruptura
    g.save(); g.setLineDash([5, 6]); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.6; g.beginPath();
    [SEAL_NB, SEAL_NF].forEach(x => { g.moveTo(x, 18); g.lineTo(x, 262); }); g.stroke(); g.restore();
    // as duas pontas: a frente como está, o verso girado 180°
    g.save(); g.translate(SEAL_FX, 0); drawSealEnd(g, ls); g.restore();
    g.save(); g.translate(1000, 280); g.rotate(PI); drawSealEnd(g, ls); g.restore();
  }
  await idle();
  const sealTex = canvasTex(4096, 439, c => drawSeal(c, false));
  const sealOrm = canvasTex(2048, 220, c => drawSeal(c, true));
  await idle();
  sealOrm.colorSpace = THREE.NoColorSpace;
  sealTex.anisotropy = maxAniso; lateRedraw.push(sealTex);
  const sealMat = new THREE.MeshPhysicalMaterial({
    map: sealTex, roughness: 1, metalness: 1, roughnessMap: sealOrm, metalnessMap: sealOrm,
    iridescence: 1, iridescenceMap: sealOrm, iridescenceIOR: 1.8, iridescenceThicknessRange: [180, 640],
    clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 1.1, side: THREE.DoubleSide, alphaTest: 0.5,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, // the seal always wins the depth tie against the cap it sits on
  });
  // o lacre é uma peça só, desenhada duas vezes com planos de corte na junção: a parte de cima (laterais e topo) vai com
  // a tampa, as duas pontas ficam no gargalo. Girar a tampa ("lacre adulterado") separa as partes nas duas linhas de ruptura.
  // O corte é feito no próprio shader (e não com clippingPlanes) para o programa poder ser pré-compilado em segundo plano.
  const SPLIT_Y = YJ + 0.002;
  const clipTop = new THREE.Plane(), clipBot = new THREE.Plane();
  const localUp = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SPLIT_Y), localDown = new THREE.Plane(new THREE.Vector3(0, -1, 0), SPLIT_Y);
  const cutTop = new THREE.Vector4(), cutBot = new THREE.Vector4();
  function cutBy(mat, cut) {
    mat.onBeforeCompile = shader => {
      shader.uniforms.uCut = { value: cut };
      shader.vertexShader = 'varying vec3 vCutW;\n' + shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvCutW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = 'uniform vec4 uCut;\nvarying vec3 vCutW;\n' + shader.fragmentShader.replace('void main() {', 'void main() {\nif (dot(vCutW, uCut.xyz) + uCut.w < 0.0) discard;');
    };
    mat.customProgramCacheKey = () => 'veriseal-strip-cut';
    return mat;
  }
  const sealTopMat = cutBy(sealMat.clone(), cutTop);
  cutBy(sealMat, cutBot);
  bottle.add(new THREE.Mesh(sealGeo, sealMat));
  capGroup.add(new THREE.Mesh(sealGeo, sealTopMat));
  function setCuts() {
    bottle.updateMatrixWorld(true);
    clipTop.copy(localUp).applyMatrix4(capGroup.matrixWorld);
    clipBot.copy(localDown).applyMatrix4(bottle.matrixWorld);
    cutTop.set(clipTop.normal.x, clipTop.normal.y, clipTop.normal.z, clipTop.constant);
    cutBot.set(clipBot.normal.x, clipBot.normal.y, clipBot.normal.z, clipBot.constant);
  }
  let tear = 0, tearT = 0;
  function updateTear(dt) {
    tear += (tearT - tear) * (1 - Math.exp(-dt * (tearT > tear ? 3.2 : 4)));
    capGroup.rotation.y = 0.62 * tear; capGroup.position.y = 0.04 * tear;
    setCuts();
  }
  // a sombra é refeita só quando a garrafa se mexe de verdade (a silhueta que projeta a sombra é dela, não da tampa)
  const shadowAt = { y: 1e9, x: 1e9 };
  function syncShadow() {
    if (Math.abs(bottle.rotation.y - shadowAt.y) > 0.004 || Math.abs(bottle.rotation.x - shadowAt.x) > 0.002) {
      shadowAt.y = bottle.rotation.y; shadowAt.x = bottle.rotation.x; renderer.shadowMap.needsUpdate = true;
    }
  }

  /* ---------- overlay: chapters and the callouts anchored to the seal ---------- */
  const hudSvg = document.getElementById('hud-svg');
  // os pontos ficam nas bordas do lacre, do lado do balão: as linhas não cruzam o lacre e nada da arte fica coberto
  const callouts = {
    tear: { pos: sealPoint(SEAL_NF, 268, 0.008) },          // borda esquerda, na linha de ruptura da frente
    nfc: { pos: sealPoint(SEAL_FX + 805, 268, 0.008) },     // borda esquerda, junto do símbolo (a antena fica embaixo dele)
    cta: { pos: sealPoint(SEAL_FX + 770, 12, 0.008) },      // borda direita, ao lado do símbolo de aproximação
    top: { pos: sealPoint(SEAL_MID, 12, 0.01), up: true },  // borda direita, ao lado do holograma, em cima da tampa
  };
  for (const id in callouts) {
    const c = callouts[id];
    c.box = hud.querySelector(`[data-cal="${id}"]`);
    c.dot = hud.querySelector(`[data-dot="${id}"]`);
    c.line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    hudSvg.appendChild(c.line);
  }

  /* ---------- state ---------- */
  let W = 1, H = 1, aspect = 1;
  let pS = 0, visible = false;   // o IntersectionObserver liga a cena quando o quadro ou a demonstração aparecem
  let px = 0, py = 0, pxS = 0, pyS = 0; // pointer parallax
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const nav = document.getElementById('nav');
  const howHost = document.getElementById('howGL'), howScene = document.getElementById('howScene');
  let mode = 'frame', host = stage, turnBase = 0;
  const vis = { frame: false, how: false };
  function setMode(m) {
    if (m === mode) return;
    mode = m; host = m === 'how' ? howHost : stage;
    host.prepend(canvas); resize();
    scene.background.set(m === 'how' ? 0xffffff : 0xe9ecf1);
    backdrop.visible = m !== 'how';
    if (m === 'how') turnBase = Math.round(dyn.spin / (2 * PI)) * 2 * PI;
    else pS = progress();
    hud.style.opacity = 0;
  }

  // progresso da animação = quanto o quadro fixo (sticky) já percorreu da sua trilha.
  // site.js já mede isso uma vez por quadro com posições em cache; ler o layout aqui forçaria um reflow a cada quadro
  function progress() {
    if (window.VeriSeal && window.VeriSeal.frameProgress) return window.VeriSeal.frameProgress();
    const total = track.offsetHeight - trackPin.offsetHeight;
    return total > 0 ? clamp(((nav ? nav.offsetHeight : 0) - track.getBoundingClientRect().top) / total, 0, 1) : 0;
  }

  /* arrastar para girar: a garrafa gira na mão (e o líquido responde); ao soltar, ela continua com inércia
     e volta a se alinhar com a coreografia na volta inteira mais próxima */
  let dragSpin = 0, dragV = 0, dragging = false, lastX = 0, lastMoveT = 0;
  canvas.addEventListener('pointerdown', e => {
    dragging = true; lastX = e.clientX; lastMoveT = performance.now(); dragV = 0;
    canvas.setPointerCapture?.(e.pointerId); canvas.classList.add('is-grabbing');
  });
  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    const now = performance.now(), d = (e.clientX - lastX) / Math.max(W, 1) * PI * 1.8;
    dragSpin += d; dragV = d / Math.max((now - lastMoveT) / 1000, 1 / 120); lastX = e.clientX; lastMoveT = now;
  });
  const endDrag = () => { dragging = false; canvas.classList.remove('is-grabbing'); };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  // resolução adaptativa: no máximo 1,5x (acima disso a diferença não aparece e o custo dobra);
  // se os quadros ficarem lentos por alguns instantes, a resolução baixa sozinha até 0,8x
  const PR_MAX = Math.min(devicePixelRatio || 1, 1.5), PR_MIN = Math.min(PR_MAX, 0.8);
  let pr = PR_MAX, slowSum = 0, slowN = 0, prHold = 1;
  function resize() {
    W = host.clientWidth || 1; H = host.clientHeight || 1; aspect = W / H;
    renderer.setPixelRatio(pr);
    renderer.setSize(W, H, false);
    camera.aspect = aspect; camera.updateProjectionMatrix();
  }
  function adaptResolution(raw) {
    if (prHold > 0) { prHold -= raw; slowSum = slowN = 0; return; }
    slowSum += Math.min(raw, 0.1); slowN++;
    if (slowN < 45) return;
    const avg = slowSum / slowN; slowSum = slowN = 0;
    if (avg > 1 / 40 && pr > PR_MIN) { pr = Math.max(PR_MIN, pr - 0.2); resize(); prHold = 1.5; }
  }

  /* ---------- physics ----------
     Units: the bottle is 5.7 units tall ≈ 24 cm, so 1 unit ≈ 4.2 cm and g ≈ 233 units/s².
     The scroll moves the bottle the way a hand would: it tips (lean) in proportion to the scroll speed and spins with
     the choreography, both as second-order systems with a little inertia. The liquid answers to the ACCELERATIONS of
     that motion, as a real fluid does:
       - the lean's angular acceleration is a lateral push on the liquid, which excites the first sloshing mode
         (≈3.3 Hz for this bottle, lightly damped, so it keeps ringing after the scroll stops);
       - the spin drags the liquid into a swirl through the walls (spin-up time TAU_SWIRL); the swirl dishes the
         surface into a paraboloid and carries the sloshing wave around;
       - hard changes shake loose the symmetric "bobbing" mode and short capillary ripples, which die out quickly. */
  const G = 233, W0 = 21, ZETA = 0.05, WS = 30, ZS = 0.08, H_PIVOT = 1.6, TAU_SWIRL = 1.4;
  const dyn = { spin: 0, spinV: 0, lean: 0, leanV: 0, aW: 0, aWV: 0, bW: 0, bWV: reduceMotion ? 0 : 1.6, sym: 0, symV: 0, swirl: 0, rip: 0 };

  function stepPhysics(h, spinTarget, vP, calm, t) {
    const d = dyn;
    // the hand: spin and lean follow their targets with inertia (slightly under-damped)
    const wc = 9, zc = 0.85;
    const spinA = wc * wc * (spinTarget - d.spin) - 2 * zc * wc * d.spinV;
    d.spinV += spinA * h; d.spin += d.spinV * h;
    const leanT = reduceMotion ? 0 : clamp(vP * 0.3, -0.14, 0.14) * calm;
    const wh = 12;
    const leanA = wh * wh * (leanT - d.lean) - 2 * wh * d.leanV;
    d.leanV += leanA * h; d.lean += d.leanV * h;
    // liquid swirl, spun up by the walls
    d.swirl += ((d.spinV - d.swirl) / TAU_SWIRL) * h;
    // first sloshing mode in the world frame (pendulum analogue): forced by the lateral acceleration of the
    // pivoting bottle (H_PIVOT above the hand) and by a small sideways kick when the spin jerks
    const fB = -(W0 * W0 / G) * H_PIVOT * leanA;
    const fA = -(W0 * W0 / G) * 0.15 * spinA;
    const amb = reduceMotion ? 0 : 0.004;
    d.bWV += (W0 * W0 * (amb * Math.sin(t * 1.3) - d.bW) - 2 * ZETA * W0 * d.bWV + fB) * h;
    d.aWV += (W0 * W0 * (amb * Math.sin(t * 0.9 + 1.7) - d.aW) - 2 * ZETA * W0 * d.aWV + fA) * h;
    d.bW += d.bWV * h; d.aW += d.aWV * h;
    // the swirl carries the wave around
    const rot = d.swirl * 0.35 * h, ca = Math.cos(rot), sa = Math.sin(rot);
    let x = d.aW, z = d.bW; d.aW = x * ca - z * sa; d.bW = x * sa + z * ca;
    x = d.aWV; z = d.bWV; d.aWV = x * ca - z * sa; d.bWV = x * sa + z * ca;
    // symmetric mode, shaken loose by the slosh and by spin jerks
    const symF = 18 * (d.bWV + d.aWV) + 0.25 * spinA;
    d.symV += (-WS * WS * d.sym - 2 * ZS * WS * d.symV + symF) * h; d.sym += d.symV * h;
  }
  function updatePhysics(dt, t, spinTarget, vP, calm) {
    const n = Math.min(16, Math.ceil(dt / (1 / 240))), h = dt / n;
    for (let i = 0; i < n; i++) stepPhysics(h, spinTarget, vP, calm, t);
    const d = dyn, cs = Math.cos(d.spin), sn = Math.sin(d.spin);
    // sloshing lives in the world frame; gravity tilts with the lean; both expressed in the bottle's own frame
    const tl = Math.tan(d.lean);
    let ax = d.aW * cs - d.bW * sn - tl * sn;
    let bz = d.aW * sn + d.bW * cs + tl * cs;
    const m = Math.hypot(ax, bz);
    if (m > 1e-6) { const k = Math.tanh(m / 0.18) * 0.18 / m; ax *= k; bz *= k; } // the wall is the limit
    liquidUniforms.uTilt.value.set(ax, bz);
    liquidUniforms.uSym.value = Math.tanh(d.sym / 0.04) * 0.04;
    liquidUniforms.uSwirl.value = 1.3 * d.swirl * d.swirl / (2 * G);
    const agitation = clamp(Math.abs(d.bWV) * 0.5 + Math.abs(d.aWV) * 0.5 + Math.abs(d.symV) * 2 + Math.abs(d.leanV) * 2, 0, 1);
    const ripT = (reduceMotion ? 0 : 0.0004) + 0.003 * agitation;
    d.rip += (ripT - d.rip) * (1 - Math.exp(-dt * (ripT > d.rip ? 12 : 2.5))); // ripples appear fast, fade slower
    liquidUniforms.uRip.value = d.rip;
    liquidUniforms.uTime.value = t;
    bottle.rotation.y = d.spin;
    bottle.rotation.x = d.lean;
  }

  function updateHud(p) {
    const v = K.hud(p);
    if (v <= 0.001) { hud.style.opacity = 0; return; }
    // todas as leituras de layout antes de qualquer escrita (evita um reflow por balão)
    const s = stage.getBoundingClientRect(), boxes = {};
    for (const id in callouts) boxes[id] = callouts[id].box.getBoundingClientRect();
    hud.style.opacity = v.toFixed(3);
    for (const id in callouts) {
      const c = callouts[id];
      bottle.localToWorld(tmp.copy(c.pos));
      let show;
      if (c.up) show = camera.position.y > tmp.y + 0.05;
      else { const nl = Math.hypot(tmp.x, tmp.z) || 1; tmp2.copy(camera.position).sub(tmp).normalize(); show = (tmp.x / nl) * tmp2.x + (tmp.z / nl) * tmp2.z > 0.12; }
      tmp.project(camera);
      const ax = (tmp.x * 0.5 + 0.5) * W, ay = (-tmp.y * 0.5 + 0.5) * H;
      c.dot.style.left = ax + 'px'; c.dot.style.top = ay + 'px';
      c.dot.style.opacity = c.box.style.opacity = c.line.style.opacity = show ? 1 : 0;
      const r = boxes[id], isLeft = c.box.classList.contains('left');
      const y0 = r.top - s.top + 8, x0 = isLeft ? r.right - s.left + 10 : r.left - s.left - 10, dir = isLeft ? 1 : -1;
      const elbowX = ax - dir * Math.max(26, Math.abs(ay - y0) * 0.6);
      c.line.setAttribute('points', (dir > 0 ? elbowX > x0 : elbowX < x0) ? `${x0},${y0} ${elbowX},${y0} ${ax},${ay}` : `${x0},${y0} ${ax},${ay}`);
    }
  }

  /* parada (sem rolar, arrastar nem mexer o ponteiro) e com a garrafa assentada, a cena é redesenhada a 30 quadros por
     segundo: o que ainda se move (o balanço leve e as ondinhas do líquido) é lento, e a GPU trabalha pela metade */
  let lastProg = -1, lastPx = 0, lastPy = 0, skipNext = false;
  function calm() {
    const p = mode === 'frame' ? progress() : 0;
    const still = !dragging && p === lastProg && px === lastPx && py === lastPy;
    lastProg = p; lastPx = px; lastPy = py;
    return still && (mode !== 'frame' || Math.abs(p - pS) < 1e-4) && Math.abs(dyn.spinV) < 0.05 && Math.abs(dyn.leanV) < 0.02 && Math.abs(dragV) < 0.05
      && Math.abs(tear - tearT) < 0.002 && Math.abs(px - pxS) + Math.abs(py - pyS) < 0.004;
  }
  let last = performance.now(), wasVisible = false;
  function frame(now) {
    if (!visible) { wasVisible = false; last = now; return; }     // fora da tela: nada de física nem de render
    const quiet = wasVisible && calm();
    if (quiet) { skipNext = !skipNext; if (skipNext) return; } else skipNext = false;
    const raw = (now - last) / 1000, dt = clamp(raw, 0.001, 0.05); last = now;
    const t = now / 1000;
    if (!wasVisible) { wasVisible = true; prHold = 1; if (mode === 'frame') pS = progress(); }
    else if (!quiet) adaptResolution(raw);
    if (mode === 'how') { howFrame(dt, t); return; }
    const p = progress(), pPrev = pS;
    pS += (p - pS) * (1 - Math.exp(-dt * 4.5));
    const vP = (pS - pPrev) / dt;
    tearT = 0;

    if (!dragging) {
      dragSpin += dragV * dt; dragV *= Math.exp(-dt * 2.5);
      if (Math.abs(dragV) < 0.4) dragSpin += (Math.round(dragSpin / (2 * PI)) * 2 * PI - dragSpin) * (1 - Math.exp(-dt * 1.4));
    }
    const spinTarget = K.rot(pS) + dragSpin + (reduceMotion ? 0 : 0.02 * Math.sin(t * 0.45));
    updatePhysics(dt, t, spinTarget, vP, 1 - 0.6 * K.hud(pS));

    // camera: a dolly toward the cap. The bottle is moved across the frame with a lens shift (no keystone), and on
    // narrow screens it is kept whole in frame and lifted above the text.
    const distScale = aspect < 1 ? Math.pow(clamp(1 / aspect, 1, 2.4), 0.8) * (1 + (W >= 700 ? 0.5 : 0.14) * smoothstep(0.72, 0.85, pS)) : (aspect < 1.4 ? 1.1 : 1);   // em tela em pé, o close final afasta: no celular a tampa alta não encosta no botão de pular; no tablet ela cabe entre os balões
    const offFactor = aspect < 1 ? 0.1 : (aspect < 1.4 ? 0.55 : 1);
    const dist = K.dist(pS) * distScale, ty = K.ty(pS), el = K.el(pS), ox = K.offx(pS) * offFactor;
    pxS += (px - pxS) * (1 - Math.exp(-dt * 3)); pyS += (py - pyS) * (1 - Math.exp(-dt * 3));
    const par = reduceMotion ? 0 : dist / 13;
    camera.position.set(pxS * 0.45 * par, ty + dist * Math.sin(el) - pyS * 0.25 * par, dist * Math.cos(el));
    camera.lookAt(0, ty, 0);
    const visW = 2 * dist * Math.tan(camera.fov * PI / 360) * aspect;
    const lift = aspect < 1 ? 0.21 * H : 0;   // no celular a garrafa fica sempre acima dos textos
    camera.setViewOffset(W, H, (ox / visW) * W, lift, W, H);
    backdrop.position.y = ty;

    updateTear(dt);
    syncShadow();
    renderer.render(scene, camera);
    updateHud(pS);
  }

  /* "Como funciona": close no gargalo, o lacre vira para o celular; site.js informa a etapa e o modo adulterado */
  function howFrame(dt, t) {
    const st = (window.VeriSeal && window.VeriSeal.how) || { step: 0, bad: false };
    tearT = st.bad ? 1 : 0;
    if (!dragging) {
      dragSpin += dragV * dt; dragV *= Math.exp(-dt * 2.5);
      if (Math.abs(dragV) < 0.4) dragSpin += (Math.round(dragSpin / (2 * PI)) * 2 * PI - dragSpin) * (1 - Math.exp(-dt * 1.4));
    }
    const look = st.step === 0 ? 0.3 : st.step === 1 ? 0.5 : 0.2;   // gira o lacre na direção do celular
    const spinTarget = turnBase + look + dragSpin + (reduceMotion ? 0 : 0.07 * Math.sin(t * 0.6));
    updatePhysics(dt, t, spinTarget, 0, 1);
    const narrow = aspect < 0.9;
    const dist = narrow ? 7.6 : 6.3, ty = narrow ? 4.6 : 4.82, el = 0.12, ox = narrow ? 0.35 : 1.1;
    pxS += (px - pxS) * (1 - Math.exp(-dt * 3)); pyS += (py - pyS) * (1 - Math.exp(-dt * 3));
    const par = reduceMotion ? 0 : 0.18;
    camera.position.set(pxS * par, ty + dist * Math.sin(el) - pyS * 0.1, dist * Math.cos(el));
    camera.lookAt(0, ty, 0);
    const visW = 2 * dist * Math.tan(camera.fov * PI / 360) * aspect;
    camera.setViewOffset(W, H, (ox / visW) * W, narrow ? 0.14 * H : 0, W, H);
    updateTear(dt);
    syncShadow();
    renderer.render(scene, camera);
    // onde o símbolo de aproximação do lacre está na tela (as ondas saem dali)
    bottle.localToWorld(tmp.copy(NFC_AT)); tmp.project(camera);
    howScene.style.setProperty('--nfc-x', ((tmp.x * 0.5 + 0.5) * W).toFixed(1) + 'px');
    howScene.style.setProperty('--nfc-y', ((-tmp.y * 0.5 + 0.5) * H).toFixed(1) + 'px');
  }

  /* fotos da garrafa renderizadas pela própria cena: as do jogo "qual delas é original?" (fundo escuro) e as do card da
     demonstração (fundo claro). bad = true só gira a tampa, rompendo o lacre (a bebida tem a mesma cor: por fora, as duas
     são idênticas). Saem todas de uma vez, com um único redimensionamento do canvas (redimensionar é o que mais custava) e
     no tamanho em que aparecem na página. Cada foto é copiada para um canvas 2D e o PNG é codificado fora da thread principal. */
  const glowPlanes = {};
  function glowFor(bg) {
    // uma luz de fundo atrás da garrafa: o líquido a refrata (e a cor da bebida aparece) e a borda some no fundo da seção
    if (!glowPlanes[bg]) {
      const hex = '#' + new THREE.Color(bg).getHexString(), light = new THREE.Color(bg).getHSL({}).l > 0.5;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 8), new THREE.MeshBasicMaterial({
        toneMapped: false, map: canvasTex(256, 256, c => {
          const g = c.getContext('2d'), grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
          if (light) { grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.5, '#ffffff'); grd.addColorStop(0.86, hex); grd.addColorStop(1, hex); }
          else { grd.addColorStop(0, '#8fb0e6'); grd.addColorStop(0.3, '#3a64a8'); grd.addColorStop(0.62, '#0e2349'); grd.addColorStop(0.86, hex); grd.addColorStop(1, hex); }
          g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
        })
      }));
      plane.position.set(0, 3.5, -6); plane.visible = false; scene.add(plane); glowPlanes[bg] = plane;
    }
    return glowPlanes[bg];
  }
  function renderBottles(list) {
    const prev = {
      pr: renderer.getPixelRatio(), size: renderer.getSize(new THREE.Vector2()), bg: scene.background.clone(), bd: backdrop.visible,
      rot: bottle.rotation.clone(), cap: capGroup.rotation.y, capY: capGroup.position.y, aspect: camera.aspect,
      tilt: liquidUniforms.uTilt.value.clone(), sym: liquidUniforms.uSym.value, rip: liquidUniforms.uRip.value, swirl: liquidUniforms.uSwirl.value,
    };
    const sizes = list.map(o => [Math.round(o.w * o.pr), Math.round(o.h * o.pr)]);
    const bw = Math.max(...sizes.map(s => s[0])), bh = Math.max(...sizes.map(s => s[1]));
    renderer.setDrawingBufferSize(bw, bh, 1);
    backdrop.visible = false; causticPivot.visible = false;
    bottle.rotation.set(0, 0.42, 0);
    liquidUniforms.uTilt.value.set(0, 0); liquidUniforms.uSym.value = 0; liquidUniforms.uRip.value = 0.0004; liquidUniforms.uSwirl.value = 0;
    camera.clearViewOffset();
    const d = 13.4; camera.position.set(0, 2.98 + d * Math.sin(0.05), d * Math.cos(0.05)); camera.lookAt(0, 2.98, 0);
    const urls = list.map((o, i) => {
      const [w, h] = sizes[i];
      renderer.setViewport(0, 0, w, h);
      scene.background.set(o.bg);
      for (const k in glowPlanes) glowPlanes[k].visible = false;
      glowFor(o.bg).visible = true;
      capGroup.rotation.y = o.bad ? 0.8 : 0; capGroup.position.y = o.bad ? 0.05 : 0;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      setCuts();
      renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, camera);
      // a foto fica no canto de baixo do buffer (no canvas, embaixo à esquerda): copia só essa região
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(renderer.domElement, 0, bh - h, w, h, 0, 0, w, h);
      return new Promise(res => c.toBlob(b => res(b ? URL.createObjectURL(b) : null), 'image/png'));
    });
    renderer.setDrawingBufferSize(prev.size.x, prev.size.y, prev.pr);
    shadowAt.y = 1e9;   // a próxima cena refaz a sombra na pose dela
    scene.background.copy(prev.bg); backdrop.visible = prev.bd; causticPivot.visible = true;
    for (const k in glowPlanes) glowPlanes[k].visible = false;
    bottle.rotation.copy(prev.rot); capGroup.rotation.y = prev.cap; capGroup.position.y = prev.capY;
    liquidUniforms.uTilt.value.copy(prev.tilt); liquidUniforms.uSym.value = prev.sym; liquidUniforms.uRip.value = prev.rip; liquidUniforms.uSwirl.value = prev.swirl;
    camera.aspect = prev.aspect; camera.updateProjectionMatrix();
    return Promise.all(urls);
  }
  // as quatro fotos, feitas uma vez só (na primeira vez em que alguém pede) e compartilhadas pelo jogo e pela demonstração
  let shots = null;
  const bottleShots = () => shots || (shots = renderBottles([
    { bad: false, w: 380, h: 760, pr: 1.5, bg: 0x030b1c }, { bad: true, w: 380, h: 760, pr: 1.5, bg: 0x030b1c },
    { bad: false, w: 130, h: 260, pr: 2, bg: 0xf1f5fb }, { bad: true, w: 130, h: 260, pr: 2, bg: 0xf1f5fb },
  ]).then(([gameOk, gameBad, howOk, howBad]) => ({ game: { ok: gameOk, bad: gameBad }, how: { ok: howOk, bad: howBad } })));

  /* ---------- boot ---------- */
  pS = progress();
  dyn.spin = K.rot(pS) - 0.3; // a small settle on load
  resize();
  addEventListener('resize', resize);
  if ('ResizeObserver' in window) { const ro = new ResizeObserver(resize); ro.observe(stage); ro.observe(howHost); }
  const io = new IntersectionObserver(entries => {
    // as duas cenas agora são vizinhas: a garrafa vai para a que estiver mais visível
    entries.forEach(e => { vis[e.target === howHost ? 'how' : 'frame'] = e.isIntersecting ? e.intersectionRect.height : 0; });
    visible = vis.frame > 0 || vis.how > 0;
    if (visible) setMode(vis.how > vis.frame ? 'how' : 'frame');
  }, { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] });
  io.observe(stage); io.observe(howHost);
  addEventListener('pointermove', e => { px = (e.clientX / innerWidth) * 2 - 1; py = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });

  /* pré-compilação: sem isto, todos os shaders eram compilados de uma vez no primeiro quadro, travando a página.
     Aqui eles são enviados ao driver em paralelo (KHR_parallel_shader_compile) e a página segue rodando.
     Além da passagem normal, a de transmissão desenha os opacos sem tone mapping num alvo linear, e o verso do líquido. */
  async function precompile() {
    camera.position.set(0, 3, 13); camera.lookAt(0, 3, 0);
    const jobs = [renderer.compileAsync(scene, camera)];
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    renderer.setRenderTarget(rt);
    scene.traverse(o => { if (o.isMesh && !o.material.transparent && !(o.material.transmission > 0)) jobs.push(renderer.compileAsync(o, camera, scene)); });
    liquid.material.side = THREE.BackSide;
    jobs.push(renderer.compileAsync(liquid, camera, scene));
    liquid.material.side = THREE.DoubleSide; liquid.material.needsUpdate = true;
    renderer.setRenderTarget(null);
    await idle();
    [labelTex, backTex, sealTex, sealOrm, capSkinTex].forEach(t => renderer.initTexture(t));   // envia as texturas à GPU antes
    await Promise.race([Promise.all(jobs), new Promise(r => setTimeout(r, 10000))]);
    rt.dispose();
  }
  const compiled = precompile().catch(err => console.warn('VeriSeal: pré-compilação', err));
  renderer.setAnimationLoop(frame);
  await compiled;
  // aquecimento fora da tela: um quadro completo compila o que a pré-compilação não alcança (sombra, refração) e aloca os
  // alvos de renderização agora, para o primeiro quadro visível não travar a rolagem
  await idle();
  if (!visible) { renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera); shadowAt.y = 1e9; }
  window.VeriSeal3D = { bottleShots };
  await (document.fonts ? document.fonts.ready : Promise.resolve());
  dispatchEvent(new Event('veriseal:3d'));
  // as fotos da garrafa ficam prontas num momento ocioso, antes de a pessoa chegar ao jogo e à demonstração
  await idle();
  bottleShots();
})();
