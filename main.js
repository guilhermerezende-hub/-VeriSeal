/* VeriSeal — cena de rolagem: garrafa de whisky, líquido e lacre inteligente.
   Script clássico que importa o Three.js dinamicamente, para funcionar tanto em file:// quanto em servidor. */
(async () => {
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('scene');
  const track = document.getElementById('track');
  const hud = document.getElementById('hud');
  const hint = document.getElementById('hint');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let THREE;
  try {
    THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
  } catch (err) {
    console.error('Three.js não carregou', err);
    stage.classList.add('is-nogl');
    return;
  }

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
    rot:  kf([[0, 0], [0.12, 0.25 * PI], [0.5, 2.4 * PI], [0.72, 3.7 * PI], [0.85, 4 * PI], [0.93, 4.08 * PI], [1, 4.25 * PI]]),
    dist: kf([[0, 13.5], [0.14, 13.2], [0.2, 12.5], [0.4, 12.5], [0.48, 7.8], [0.64, 6.4], [0.72, 4.4], [0.85, 2.6], [1, 2.35]]),
    ty:   kf([[0, 2.95], [0.4, 2.95], [0.48, 3.4], [0.64, 3.9], [0.72, 4.7], [0.85, 5.16], [1, 5.18]]),
    el:   kf([[0, 0.08], [0.5, 0.12], [0.72, 0.24], [0.85, 0.36], [1, 0.42]]),
    // lateral lens shift in world units at the target depth (negative = bottle to the right of the text)
    offx: kf([[0, -1.6], [0.14, -1.6], [0.2, 1.8], [0.4, 1.8], [0.46, -1.3], [0.64, -1.1], [0.72, 0], [0.88, 0], [1, -0.3]]),
    hud:  kf([[0, 0], [0.8, 0], [0.84, 1], [1, 1]]),
    hint: kf([[0, 1], [0.06, 0]]),
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
  function drawLabel(c) {
    // black label for the flat front face, drawn in a 1000 x 1180 design space
    const g = c.getContext('2d'), s = c.width / 1000;
    g.setTransform(s, 0, 0, s, 0, 0);
    g.fillStyle = '#121010'; g.fillRect(0, 0, 1000, 1180);
    for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(255,240,210,${Math.random() * 0.05})`; g.fillRect(Math.random() * 1000, Math.random() * 1180, 1.5, 1.5); }
    g.strokeStyle = '#c9a45c'; g.lineWidth = 4; g.strokeRect(34, 34, 932, 1112);
    g.lineWidth = 1.2; g.strokeRect(50, 50, 900, 1080);
    g.fillStyle = '#eadfc6'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const ls = v => { if ('letterSpacing' in g) g.letterSpacing = v; };
    ls('10px'); g.font = '500 24px "IBM Plex Mono", monospace'; g.fillText('SINGLE MALT', 500, 150);
    g.fillStyle = '#c9a45c'; g.fillRect(430, 176, 140, 1.5); g.fillStyle = '#eadfc6';
    ls('0px'); g.font = '300 390px "Fraunces", Georgia, serif'; g.fillText('12', 500, 565);
    g.font = 'italic 300 66px "Fraunces", Georgia, serif'; g.fillText('anos', 500, 650);
    ls('16px'); g.font = '500 42px "IBM Plex Mono", monospace'; g.fillText('WHISKY', 508, 795);
    g.fillStyle = '#c9a45c'; g.fillRect(430, 835, 140, 1.5); g.fillStyle = '#eadfc6';
    ls('4px'); g.font = '400 22px "IBM Plex Mono", monospace'; g.fillText('ENVELHECIDO EM CARVALHO', 500, 905);
    g.fillText('40% vol   ·   700 ml', 500, 1050);
    ls('0px');
    g.save(); g.translate(500, 982);
    g.strokeStyle = '#c9a45c'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 28, 0, PI * 2); g.stroke();
    g.fillStyle = '#c9a45c'; g.font = 'italic 400 22px "Fraunces", Georgia, serif'; g.fillText('VS', 0, 8);
    g.restore();
  }
  const labelTex = canvasTex(1600, 1888, drawLabel);
  const lateRedraw = [labelTex];
  document.fonts?.ready.then(() => lateRedraw.forEach(t => t.userData.redraw()));
  const gradientTex = (w, h, draw) => canvasTex(w, h, draw);

  /* ---------- renderer ---------- */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (err) { stage.classList.add('is-nogl'); return; }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  labelTex.anisotropy = maxAniso;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe4e1da);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);

  /* environment: a bright studio with big softboxes and black flags at the sides, baked to PMREM.
     The flags are what give clear glass its dark edges. */
  {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(24, 24, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xd9d5cd).multiplyScalar(0.9), side: THREE.BackSide })));
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
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.02).texture;
    pm.dispose();
  }

  /* lights */
  scene.add(new THREE.AmbientLight(0xfff4e6, 0.25));
  // key light high and to the left, slightly in front: a short warm shadow that falls to the right where it can be seen
  const key = new THREE.DirectionalLight(0xfff0dc, 2.6); key.position.set(-6.5, 9, 2.5); key.target.position.set(0, 3, 0); scene.add(key, key.target);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0002; key.shadow.normalBias = 0.02; key.shadow.radius = 14; key.shadow.blurSamples = 25;
  Object.assign(key.shadow.camera, { left: -3.5, right: 3.5, top: 4.5, bottom: -4.5, near: 1, far: 30 });
  const rim = new THREE.DirectionalLight(0xdfe9ff, 1.2); rim.position.set(6, 5, -5); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xfff0dc, 0.5); fill.position.set(4, 2, 7); scene.add(fill);

  /* studio sweep behind the bottle (in 3D so the liquid refracts it) and a floor that only receives the shadow */
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 40),
    new THREE.MeshBasicMaterial({ map: gradientTex(64, 512, c => {
      const g = c.getContext('2d'), grd = g.createLinearGradient(0, 0, 0, 512);
      grd.addColorStop(0, '#f4f2ec'); grd.addColorStop(0.55, '#ece9e2'); grd.addColorStop(1, '#cfcbc2');
      g.fillStyle = grd; g.fillRect(0, 0, 64, 512);
    }), toneMapped: false })
  );
  backdrop.position.set(0, 4, -9); scene.add(backdrop);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.ShadowMaterial({ color: 0x5a3a18, opacity: 0.3 }));
  floor.rotation.x = -PI / 2; floor.receiveShadow = true; scene.add(floor);
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
    pivot.add(patch); scene.add(pivot);
  }
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({
    map: canvasTex(256, 256, c => { const g = c.getContext('2d'), grd = g.createRadialGradient(128, 128, 0, 128, 128, 128); grd.addColorStop(0, 'rgba(60,40,20,0.32)'); grd.addColorStop(0.5, 'rgba(60,40,20,0.1)'); grd.addColorStop(1, 'rgba(60,40,20,0)'); g.fillStyle = grd; g.fillRect(0, 0, 256, 256); }),
    transparent: true, depthWrite: false, toneMapped: false,
  }));
  contact.rotation.x = -PI / 2; contact.position.y = 0.003; scene.add(contact);

  /* ---------- the bottle ---------- */
  const bottle = new THREE.Group(); scene.add(bottle);

  // hollow glass shell: chamfered base, square body, sloped shoulder, round neck; then back down the inside to a punt
  const glassRings = [
    pole(0), sq(0, HW - 0.12), sq(0.06, HW - 0.03), sq(0.16, HW), sq(Y0, HW),
    ...shoulderRings(HW, RN, C, true),
    rd(Y1, RN), rd(4.98, RN), rd(5.02, RN + 0.025), rd(5.12, RN + 0.025), rd(5.16, RN), rd(5.36, RN), rd(5.36, RN - WALL), // neck with its glass bead
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
    rd(5.02, RN), rd(5.02, RN + 0.025), rd(5.12, RN + 0.025), rd(5.16, RN), rd(5.22, RN), rd(5.22, 0.35), rd(5.575, 0.35), rd(5.62, 0.30), pole(5.62),
  ]), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  silhouette.castShadow = true; silhouette.renderOrder = -1; bottle.add(silhouette);

  const surface = new THREE.Mesh(diskGrid(1.15, 56, 160), injectLiquid(new THREE.MeshPhysicalMaterial({
    color: 0xd9863a, roughness: 0.03, metalness: 0, ior: 1.36, specularIntensity: 1,
    clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.5, emissive: 0x3a1a06, emissiveIntensity: 0.35, side: THREE.DoubleSide,
    transparent: true,
  }), 'surface'));
  surface.frustumCulled = false; surface.renderOrder = 1;
  bottle.add(surface);

  // black label on the flat front face; a trace of transmission keeps it out of the refraction buffer so it never ghosts
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 1.27),
    new THREE.MeshPhysicalMaterial({ map: labelTex, roughness: 0.55, metalness: 0, envMapIntensity: 0.6, clearcoat: 0.3, clearcoatRoughness: 0.3, transmission: 0.001, thickness: 0 }));
  label.position.set(0, 1.82, HW + 0.004); bottle.add(label);

  // a plain screw cap: short, black, finely ribbed, with a thin gold line above its skirt
  const capBody = new THREE.Mesh(new THREE.LatheGeometry([V2(0, 5.22), V2(0.35, 5.22), V2(0.35, 5.575), V2(0.335, 5.61), V2(0.30, 5.62), V2(0, 5.62)], 128),
    new THREE.MeshPhysicalMaterial({ color: 0x0f0d0b, roughness: 0.38, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.25, envMapIntensity: 0.9 }));
  bottle.add(capBody);
  const capSkinTex = canvasTex(64, 512, c => {
    const g = c.getContext('2d'); g.fillStyle = '#16120f'; g.fillRect(0, 0, 64, 512);
    for (let y = 2; y < 440; y += 4) { g.fillStyle = (y >> 2) % 2 ? '#0b0907' : '#2b241f'; g.fillRect(0, y, 64, 1.5); }
    g.fillStyle = '#c9a45c'; g.fillRect(0, 446, 64, 9);
    g.fillStyle = '#0c0a08'; g.fillRect(0, 462, 64, 50);
  });
  capSkinTex.anisotropy = maxAniso;
  const capSkin = new THREE.Mesh(new THREE.CylinderGeometry(0.352, 0.352, 0.35, 128, 1, true),
    new THREE.MeshPhysicalMaterial({ map: capSkinTex, roughness: 0.42, metalness: 0.15, clearcoat: 0.4, clearcoatRoughness: 0.3, envMapIntensity: 0.9 }));
  capSkin.position.y = 5.395; bottle.add(capSkin); // 5.22 → 5.57, below the rounded rim

  /* the smart seal, as on the reference: a tamper strip that crosses the cap, runs down its side and bonds to the neck.
     Opening the cap tears it; the NFC inlay is laminated inside the strip. */
  const STRIP_W = 0.28, RC = 0.357;
  function buildStrip() {
    // path: up the back of the neck and cap, over the rim, across the top, over the front rim, down the front
    const rows = [];
    const yTop = 5.624, zB = 0.30, re = 0.05, cy = yTop - re, yJ = 5.22, yEnd = 4.70;
    const nTop = 14, nArc = 6, nSide = 7, nNeck = 16;
    const neckR = y => y > 5.02 ? lerp(0.336, RC, (y - 5.02) / (yJ - 5.02)) : 0.336 - (5.02 - y) * 0.03;
    const cyl = (rr, y, s) => u => [Math.sin(u / rr) * rr, y, s * Math.cos(u / rr) * rr];
    const arcLen = (PI / 2) * (re + (RC - zB)) / 2;
    const side = s => {   // one side, from the neck end up to the rim; s = -1 back, +1 front
      const out = [];
      let prevY = yEnd, prevR = neckR(yEnd);
      out.push({ fn: cyl(prevR, yEnd, s), len: 0 });
      for (let i = 1; i <= nNeck; i++) { const y = lerp(yEnd, yJ, i / nNeck), rr = neckR(y); out.push({ fn: cyl(rr, y, s), len: Math.hypot(y - prevY, rr - prevR) }); prevY = y; prevR = rr; }
      for (let i = 1; i <= nSide; i++) { const y = lerp(yJ, cy, i / nSide); out.push({ fn: cyl(RC, y, s), len: (cy - yJ) / nSide }); }
      for (let i = 1; i <= nArc; i++) { const a = (1 - i / nArc) * PI / 2, rr = zB + Math.sin(a) * (RC - zB), y = cy + Math.cos(a) * re; out.push({ fn: cyl(rr, y, s), len: arcLen / nArc }); }
      return out;
    };
    const back = side(-1), front = side(1).reverse();
    const neckLen = back.slice(0, nNeck + 1).reduce((s, r) => s + r.len, 0);
    rows.push(...back);
    for (let i = 1; i < nTop; i++) { const z = lerp(-zB, zB, i / nTop); rows.push({ fn: u => [u, yTop, z], len: (2 * zB) / nTop }); }
    front.forEach((r, i) => rows.push({ fn: r.fn, len: i === 0 ? (2 * zB) / nTop : front[i - 1].len }));
    const nW = 8, pos = [], uv = [], idx = [];
    const total = rows.reduce((s, r) => s + r.len, 0);
    let cum = 0;
    rows.forEach(r => {
      cum += r.len;
      for (let j = 0; j <= nW; j++) { const p = r.fn(-STRIP_W / 2 + STRIP_W * j / nW); pos.push(p[0], p[1], p[2]); uv.push(j / nW, 1 - cum / total); }
    });
    for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < nW; j++) { const a = i * (nW + 1) + j, b = a + nW + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return { geometry: g, total, neck: neckLen };
  }
  const strip = buildStrip();
  const stripTex = canvasTex(256, Math.round(256 * strip.total / STRIP_W), c => {
    const g = c.getContext('2d'), W = c.width, H = c.height, yAt = len => len / strip.total * H;
    const rrect = (x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#151211'; rrect(0, 0, W, H, 26); g.fill();
    g.strokeStyle = '#c9a45c'; g.lineWidth = 3; rrect(10, 10, W - 20, H - 20, 18); g.stroke();
    g.lineWidth = 1; rrect(18, 18, W - 36, H - 36, 12); g.stroke();
    const ls = v => { if ('letterSpacing' in g) g.letterSpacing = v; };
    g.textAlign = 'center'; g.textBaseline = 'middle';
    // the neck part, drawn for the front; the canvas is symmetric about its centre, so the same drawing rotated
    // by 180° lands on the back half reading upright from behind
    const half = () => {
      const yN = yAt(strip.total - strip.neck);
      g.fillStyle = '#e2cf9c'; ls('4px'); g.font = '500 20px "IBM Plex Mono", monospace';
      g.fillText('LACRE', W / 2, yN + 44); g.fillText('INTELIGENTE', W / 2, yN + 70);
      const cx = W / 2, cyc = yN + 176, R = 58;
      g.strokeStyle = '#c9a45c'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cyc, R, 0, PI * 2); g.stroke();
      g.fillStyle = '#c9a45c'; g.beginPath(); g.arc(cx - 18, cyc - 12, 4.5, 0, PI * 2); g.fill();
      g.lineWidth = 3.5; g.lineCap = 'round';
      for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(cx - 18, cyc - 12, 4 + k * 9, -0.72, 0.72); g.stroke(); }
      g.fillStyle = '#e2cf9c'; ls('3px'); g.font = '500 19px "IBM Plex Mono", monospace'; g.fillText('NFC', cx, cyc + 30);
      ls('2px'); g.font = '400 13.5px "IBM Plex Mono", monospace'; g.fillText('VERIFIQUE', W / 2, cyc + R + 40); g.fillText('A AUTENTICIDADE', W / 2, cyc + R + 60);
      ls('3px'); g.font = '500 20px "IBM Plex Mono", monospace'; g.fillText('A7F3K9B21', W / 2, H - 58);
    };
    half();
    g.save(); g.translate(W / 2, H / 2); g.rotate(PI); g.translate(-W / 2, -H / 2); half(); g.restore();
    // over the cap, read from the front
    const yMid = H / 2;
    g.fillStyle = '#e2cf9c'; ls('4px'); g.font = '500 21px "IBM Plex Mono", monospace';
    g.fillRect(W / 2 - 14, yMid - 46, 28, 1.5); g.fillText('ORIGINAL', W / 2, yMid - 14); g.fillText('PRODUTO', W / 2, yMid + 14); g.fillRect(W / 2 - 14, yMid + 46, 28, 1.5);
    ls('0px');
  });
  stripTex.anisotropy = maxAniso; lateRedraw.push(stripTex);
  const stripMesh = new THREE.Mesh(strip.geometry, new THREE.MeshPhysicalMaterial({
    map: stripTex, roughness: 0.45, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.25, envMapIntensity: 0.9, side: THREE.DoubleSide, alphaTest: 0.5,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, // the strip always wins the depth tie against the cap it sits on
  }));
  bottle.add(stripMesh);

  /* ---------- overlay: chapters and the callouts anchored to the seal ---------- */
  const chapters = [...document.querySelectorAll('[data-from]')].map(el => ({ el, a: +el.dataset.from, b: +el.dataset.to }));
  const hudSvg = document.getElementById('hud-svg');
  const callouts = {
    tear: { pos: new THREE.Vector3(0.0, 5.22, 0.365) },
    nfc:  { pos: new THREE.Vector3(0.0, 4.98, 0.345) },
    code: { pos: new THREE.Vector3(0.0, 4.75, 0.34) },
    top:  { pos: new THREE.Vector3(0.0, 5.63, -0.02), up: true },
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
  let pS = 0, visible = true;
  let px = 0, py = 0, pxS = 0, pyS = 0; // pointer parallax
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const forcedP = /[#&]p=([\d.]+)/.exec(location.hash); // index.html#p=0.9 jumps to a point of the choreography

  function progress() {
    if (forcedP) return clamp(+forcedP[1], 0, 1);
    const total = track.offsetHeight - innerHeight;
    return total > 0 ? clamp(-track.getBoundingClientRect().top / total, 0, 1) : 0;
  }
  function resize() {
    W = stage.clientWidth || 1; H = stage.clientHeight || 1; aspect = W / H;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, W < 760 ? 1.75 : 2));
    renderer.setSize(W, H, false);
    camera.aspect = aspect; camera.updateProjectionMatrix();
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

  function chapterVisibility(p) {
    const f = 0.035;
    for (const { el, a, b } of chapters) {
      const fin = a <= 0 ? 1 : clamp((p - a) / f, 0, 1), fout = b >= 1 ? 1 : clamp((b - p) / f, 0, 1);
      const v = smoothstep(0, 1, Math.min(fin, fout));
      el.style.opacity = v.toFixed(3);
      el.style.translate = `0 ${((1 - v) * 26).toFixed(1)}px`;
      el.classList.toggle('is-on', v > 0.5);
    }
  }

  function updateHud(p) {
    const v = K.hud(p);
    hud.style.opacity = v.toFixed(3);
    if (v <= 0.001) return;
    const s = stage.getBoundingClientRect();
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
      const r = c.box.getBoundingClientRect(), isLeft = c.box.classList.contains('left');
      const y0 = r.top - s.top + 8, x0 = isLeft ? r.right - s.left + 10 : r.left - s.left - 10, dir = isLeft ? 1 : -1;
      const elbowX = ax - dir * Math.max(26, Math.abs(ay - y0) * 0.6);
      c.line.setAttribute('points', (dir > 0 ? elbowX > x0 : elbowX < x0) ? `${x0},${y0} ${elbowX},${y0} ${ax},${ay}` : `${x0},${y0} ${ax},${ay}`);
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = clamp((now - last) / 1000, 0.001, 0.05); last = now;
    const t = now / 1000;
    const p = progress(), pPrev = pS;
    pS += (p - pS) * (1 - Math.exp(-dt * 4.5));
    const vP = (pS - pPrev) / dt;
    hint.style.opacity = K.hint(pS).toFixed(3);
    chapterVisibility(pS);
    if (!visible) return;

    const spinTarget = K.rot(pS) + (reduceMotion ? 0 : 0.02 * Math.sin(t * 0.45));
    updatePhysics(dt, t, spinTarget, vP, 1 - 0.6 * K.hud(pS));

    // camera: a dolly toward the cap. The bottle is moved across the frame with a lens shift (no keystone), and on
    // narrow screens it is kept whole in frame and lifted above the text.
    const distScale = aspect < 1 ? Math.pow(clamp(1 / aspect, 1, 2.4), 0.8) : (aspect < 1.4 ? 1.1 : 1);
    const offFactor = aspect < 1 ? 0.1 : (aspect < 1.4 ? 0.55 : 1);
    const dist = K.dist(pS) * distScale, ty = K.ty(pS), el = K.el(pS), ox = K.offx(pS) * offFactor;
    pxS += (px - pxS) * (1 - Math.exp(-dt * 3)); pyS += (py - pyS) * (1 - Math.exp(-dt * 3));
    const par = reduceMotion ? 0 : dist / 13;
    camera.position.set(pxS * 0.45 * par, ty + dist * Math.sin(el) - pyS * 0.25 * par, dist * Math.cos(el));
    camera.lookAt(0, ty, 0);
    const visW = 2 * dist * Math.tan(camera.fov * PI / 360) * aspect;
    const lift = aspect < 1 ? 0.16 * H * clamp((0.7 - pS) / 0.15, 0, 1) : 0;
    camera.setViewOffset(W, H, (ox / visW) * W, lift, W, H);
    backdrop.position.y = ty;

    renderer.render(scene, camera);
    updateHud(pS);
  }

  /* ---------- boot ---------- */
  pS = progress();
  dyn.spin = K.rot(pS) - 0.3; // a small settle on load
  resize();
  addEventListener('resize', resize);
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; }, { threshold: 0 }).observe(stage);
  addEventListener('pointermove', e => { px = (e.clientX / innerWidth) * 2 - 1; py = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });
  chapterVisibility(pS);
  renderer.setAnimationLoop(frame);
})();
