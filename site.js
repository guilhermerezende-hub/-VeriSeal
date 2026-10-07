/* VeriSeal — animações da página.
   Um único laço de quadros lê a rolagem uma vez e entrega o progresso (0..1) de cada sequência fixa:
   hero (lacre com raio-x e vista explodida), quadro 3D (capítulos e controles), ciclo da fraude, ideia, como funciona.
   A cena WebGL da garrafa vive em main.js. */
(() => {
  'use strict';
  document.documentElement.classList.add('js');

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const damp = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const narrowMQ = matchMedia('(max-width: 719px)');
  const fmt = n => Math.round(n).toLocaleString('pt-BR');
  let vw = innerWidth, vh = innerHeight, navH = 56;

  /* ============================================================
     O LACRE EM SVG — gerado aqui para ser reutilizado nas camadas, na lupa e no lacre 3D da chamada final
     espaço de desenho 1000 x 280; a linha de ruptura fica em x = 655
     ============================================================ */
  const SW = 1000, SH = 280, R = 24, NX = 655;
  const OUTLINE = `M${R} 0H${NX - 11}L${NX} 13L${NX + 11} 0H${SW - R}A${R} ${R} 0 0 1 ${SW} ${R}V${SH - R}A${R} ${R} 0 0 1 ${SW - R} ${SH}H${NX + 11}L${NX} ${SH - 13}L${NX - 11} ${SH}H${R}A${R} ${R} 0 0 1 0 ${SH - R}V${R}A${R} ${R} 0 0 1 ${R} 0Z`;
  const SANS = `Inter, -apple-system, 'Segoe UI', Roboto, sans-serif`;
  const MONO = `'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace`;

  // guilhoché: ondas sobrepostas, como na impressão de segurança de documentos
  function guilloche(n, amp, f1, f2, ph0) {
    let d = '';
    for (let i = 0; i < n; i++) {
      const ph = ph0 + i * 0.42;
      for (let x = -10, first = true; x <= SW + 10; x += 8, first = false) {
        const y = SH / 2 + amp * Math.sin(x * f1 + ph) * (0.62 + 0.38 * Math.sin(x * f2 - ph * 0.7));
        d += (first ? 'M' : 'L') + x + ' ' + y.toFixed(1);
      }
    }
    return d;
  }
  function rosette(cx, cy, r0, a, k, n) {
    let d = '';
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= 160; j++) {
        const t = j / 160 * Math.PI * 2, r = r0 + a * Math.sin(k * t + i * 0.55);
        d += (j ? 'L' : 'M') + (cx + r * Math.cos(t)).toFixed(1) + ' ' + (cy + r * Math.sin(t)).toFixed(1);
      }
      d += 'Z';
    }
    return d;
  }
  // símbolo de aproximação (quatro arcos)
  function contactless(x, y, s, stroke, w) {
    let d = '';
    [0.22, 0.47, 0.72, 0.97].forEach(f => {
      const r = s * f * 0.62, a = 52 * Math.PI / 180;
      d += `M${(x + r * Math.cos(-a)).toFixed(1)} ${(y + r * Math.sin(-a)).toFixed(1)}A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${(x + r * Math.cos(a)).toFixed(1)} ${(y + r * Math.sin(a)).toFixed(1)}`;
    });
    return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`;
  }
  // antena: espiral retangular em volta da zona do celular
  function spiral(x0, y0, x1, y1, n, p) {
    const mid = (y0 + y1) / 2;
    let d = `M${x0} ${mid}`;
    for (let t = 0; t < n; t++) { const o = t * p; d += `V${y0 + o}H${x1 - o}V${y1 - o}H${x0 + o + p}V${mid}`; }
    return d;
  }
  const COIL = spiral(718, 34, 968, 246, 6, 10);
  const LOOP = 'M684 128H600C584 128 576 120 576 104V64C576 50 568 42 554 42H66C52 42 44 50 44 64V216C44 230 52 238 66 238H554C568 238 576 230 576 216V176C576 160 584 152 600 152H684';
  function dieCuts() {
    let d = '';
    for (let y = 26, row = 0; y < SH - 10; y += 30, row++) for (let x = 24 + (row % 2) * 15; x < SW - 10; x += 30) {
      const flip = (x + y) % 60 < 30 ? 1 : -1;
      d += `M${x - 5} ${y}a5 5 0 0 ${flip > 0 ? 1 : 0} 10 0`;
    }
    return d;
  }
  const DIECUTS = dieCuts();

  const coilMarkup = (bright, anim) => `
    <path d="${COIL}M702 140H718" fill="none" stroke="#03adf9" stroke-opacity="${bright ? .28 : .16}" stroke-width="8" stroke-linejoin="round"/>
    <path class="${anim ? 'trace' : ''}" style="--td:.5s" pathLength="1" d="${COIL}" fill="none" stroke="${bright ? '#9fe6ff' : '#6fd3ff'}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M702 140H718M778 140V156H700" fill="none" stroke="${bright ? '#9fe6ff' : '#6fd3ff'}" stroke-width="2.4" stroke-linejoin="round"/>
    <rect x="712" y="150" width="72" height="11" rx="3" fill="#06142c" stroke="#03adf9" stroke-opacity=".6"/>`;
  const chipMarkup = () => `
    <g class="chip">
      <rect x="664" y="122" width="38" height="38" rx="5" fill="#081a36" stroke="#9fe6ff" stroke-width="1.6"/>
      <rect x="672" y="130" width="22" height="22" rx="2" fill="#03adf9" fill-opacity=".25" stroke="#03adf9" stroke-opacity=".8"/>
      <path d="M668 122v-5M676 122v-5M684 122v-5M692 122v-5M698 122v-5M668 160v5M676 160v5M684 160v5M692 160v5M698 160v5" stroke="#9fe6ff" stroke-width="1.4"/>
    </g>`;
  const loopMarkup = (bright, anim) => `
    <path d="${LOOP}" fill="none" stroke="#03adf9" stroke-opacity="${bright ? .3 : .16}" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/>
    <path class="${anim ? 'trace' : ''}" style="--td:.2s" pathLength="1" d="${LOOP}" fill="none" stroke="${bright ? '#9fe6ff' : '#6fd3ff'}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="684" cy="128" r="4" fill="#9fe6ff"/><circle cx="684" cy="152" r="4" fill="#9fe6ff"/>
    <g fill="none" stroke="#ff7a70" stroke-width="2"><circle cx="${NX}" cy="128" r="8"/><circle cx="${NX}" cy="152" r="8"/></g>`;
  const tearMarkup = (op) => `<path d="M${NX} 18V262" stroke="#fff" stroke-opacity="${op}" stroke-width="1.6" stroke-dasharray="5 6"/>`;

  // camada impressa (a face do lacre)
  function printSVG(id) {
    return `<svg viewBox="0 0 ${SW} ${SH}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="${id}-clip"><path d="${OUTLINE}"/></clipPath>
        <linearGradient id="${id}-navy" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d3a80"/><stop offset=".45" stop-color="#062a63"/><stop offset="1" stop-color="#021a42"/></linearGradient>
        <linearGradient id="${id}-holo" class="holo-grad" gradientUnits="userSpaceOnUse" x1="56" y1="46" x2="244" y2="234">
          <stop offset="0" stop-color="#8fe3ff"/><stop offset=".18" stop-color="#b9a9ff"/><stop offset=".36" stop-color="#ffc4e5"/><stop offset=".52" stop-color="#fff1b0"/><stop offset=".7" stop-color="#b3ffd8"/><stop offset=".86" stop-color="#8fe3ff"/><stop offset="1" stop-color="#c8b8ff"/>
        </linearGradient>
        <radialGradient id="${id}-shine" cx=".35" cy=".3" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".35" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
        <path id="${id}-ring" d="M150 140m-80 0a80 80 0 1 1 160 0a80 80 0 1 1-160 0"/>
      </defs>
      <g clip-path="url(#${id}-clip)">
        <rect width="${SW}" height="${SH}" fill="url(#${id}-navy)"/>
        <path d="${guilloche(14, 108, .0115, .0042, 0)}" fill="none" stroke="#5fd0ff" stroke-opacity=".1" stroke-width="1"/>
        <path d="${guilloche(10, 70, .019, .006, 1.3)}" fill="none" stroke="#9fb5ff" stroke-opacity=".08" stroke-width="1"/>
        <text x="30" y="266" font-family="${MONO}" font-size="7" letter-spacing="1.2" fill="#fff" fill-opacity=".28">${'VERISEAL · ORIGINAL · '.repeat(12)}</text>
      </g>
      <path d="${OUTLINE}" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="2"/>
      <rect x="12" y="12" width="976" height="256" rx="15" fill="none" stroke="#03adf9" stroke-opacity=".38" stroke-width="1.2"/>
      <g class="holo">
        <circle cx="150" cy="140" r="94" fill="url(#${id}-holo)"/>
        <path d="${rosette(150, 140, 50, 20, 7, 8)}" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width=".8"/>
        <circle class="holo-shine" cx="150" cy="140" r="94" fill="url(#${id}-shine)" opacity=".5"/>
        <circle cx="150" cy="140" r="94" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.5"/>
        <text font-family="${MONO}" font-size="10.5" font-weight="600" letter-spacing="2.1" fill="#062a63" fill-opacity=".72"><textPath href="#${id}-ring">VERISEAL • PRODUTO ORIGINAL • VERISEAL • PRODUTO ORIGINAL •</textPath></text>
        <use href="#vs-mark" x="104" y="115" width="92" height="49.4" style="--lg-ink:#062a63;--lg-accent:#0a76c4"/>
      </g>
      <use href="#vs-wordmark" x="290" y="74" width="330" height="54.4" style="--lg-ink:#fff;--lg-accent:#03adf9"/>
      <rect x="290" y="156" width="40" height="2.5" rx="1" fill="#03adf9"/>
      <text x="290" y="193" font-family="${MONO}" font-size="15" font-weight="500" letter-spacing="3.2" fill="#fff" fill-opacity=".8">PRODUTO ORIGINAL</text>
      <text x="290" y="220" font-family="${MONO}" font-size="12" letter-spacing="2.4" fill="#fff" fill-opacity=".5">LACRE INTELIGENTE · NFC</text>
      ${tearMarkup(.55)}
      <text transform="translate(641 140) rotate(-90)" text-anchor="middle" font-family="${MONO}" font-size="9" letter-spacing="2" fill="#fff" fill-opacity=".55">ROMPE AO ABRIR</text>
      ${contactless(706, 94, 66, '#fff', 5)}
      <text x="774" y="88" font-family="${SANS}" font-size="22" font-weight="700" letter-spacing=".3" fill="#fff">APROXIME O</text>
      <text x="774" y="114" font-family="${SANS}" font-size="22" font-weight="700" letter-spacing=".3" fill="#fff">CELULAR</text>
      <rect x="700" y="144" width="262" height="1" fill="#fff" fill-opacity=".18"/>
      <text x="700" y="176" font-family="${MONO}" font-size="12" letter-spacing="2.4" fill="#fff" fill-opacity=".55">Nº DE SÉRIE</text>
      <text class="serial" x="700" y="212" font-family="${MONO}" font-size="30" font-weight="600" letter-spacing="3" fill="#fff">A7F3K9B21</text>
      <text x="700" y="245" font-family="${SANS}" font-size="13" letter-spacing=".2" fill="#fff" fill-opacity=".62">Verifique a autenticidade</text>
    </svg>`;
  }
  function filmSVG(inner, fill, stroke) {
    return `<svg viewBox="0 0 ${SW} ${SH}" xmlns="http://www.w3.org/2000/svg"><path d="${OUTLINE}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>${inner}</svg>`;
  }
  const inlaySVG = () => filmSVG(coilMarkup(false, true) + chipMarkup(), 'rgba(4,16,38,.88)', 'rgba(95,208,255,.4)');
  const tamperSVG = () => filmSVG(`<path d="${DIECUTS}" fill="none" stroke="#fff" stroke-opacity=".13" stroke-width="1.1"/>${loopMarkup(false, true)}${tearMarkup(.4)}`, 'rgba(6,22,50,.82)', 'rgba(95,208,255,.3)');
  const adhesiveSVG = id => `<svg viewBox="0 0 ${SW} ${SH}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="${id}-dots" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.3" fill="#fff" fill-opacity=".16"/></pattern></defs><path d="${OUTLINE}" fill="rgba(190,215,250,.12)" stroke="rgba(255,255,255,.3)" stroke-width="1.5"/><path d="${OUTLINE}" fill="url(#${id}-dots)"/></svg>`;
  // o que a lupa de raio-x mostra: o interior do lacre, com anotações
  function xraySVG() {
    let grid = '';
    for (let x = 20; x < SW; x += 20) grid += `M${x} 0V${SH}`;
    for (let y = 20; y < SH; y += 20) grid += `M0 ${y}H${SW}`;
    const label = (x, y, t, rot) => `<text ${rot ? `transform="translate(${x} ${y}) rotate(-90)" text-anchor="middle"` : `x="${x}" y="${y}"`} font-family="${MONO}" font-size="11" font-weight="600" letter-spacing="1.6" fill="#9fe6ff">${t}</text>`;
    return `<svg viewBox="0 0 ${SW} ${SH}" xmlns="http://www.w3.org/2000/svg">
      <defs><clipPath id="xr-clip"><path d="${OUTLINE}"/></clipPath></defs>
      <path d="${OUTLINE}" fill="#020c1d"/>
      <g clip-path="url(#xr-clip)"><path d="${grid}" stroke="#03adf9" stroke-opacity=".08" stroke-width="1"/></g>
      <path d="${OUTLINE}" fill="none" stroke="#03adf9" stroke-opacity=".45" stroke-width="1.5"/>
      <circle cx="150" cy="140" r="94" fill="none" stroke="#5fd0ff" stroke-opacity=".22" stroke-dasharray="3 5"/>
      <use href="#vs-wordmark" x="290" y="74" width="330" height="54.4" style="--lg-ink:rgba(95,208,255,.13);--lg-accent:rgba(95,208,255,.2)"/>
      <path d="${DIECUTS}" fill="none" stroke="#9fe6ff" stroke-opacity=".12" stroke-width="1.1"/>
      ${loopMarkup(true, false)}${tearMarkup(.5)}${coilMarkup(true, false)}${chipMarkup()}
      ${label(70, 66, 'CIRCUITO DE RUPTURA')}${label(632, 140, 'LINHA DE RUPTURA', true)}${label(796, 130, 'ANTENA NFC')}${label(664, 182, 'CHIP')}
      ${label(70, 222, 'ROMPE AO ABRIR A TAMPA')}
    </svg>`;
  }

  /* ============================================================
     MOTOR DE ROLAGEM: sequências fixas (sticky) recebem p = 0..1
     ============================================================ */
  const seqs = [];
  function addSeq(el, update, pinSel, pinOffset = 0) {
    const s = { el, update, pin: el.querySelector(pinSel), pinOffset, top: 0, len: 1, h: 1, p: -1, vis: false };
    seqs.push(s); return s;
  }
  function measure() {
    vw = innerWidth; vh = innerHeight;
    navH = $('#nav').offsetHeight || 56;
    for (const s of seqs) {
      const r = s.el.getBoundingClientRect();
      s.top = r.top + scrollY; s.h = s.el.offsetHeight;
      s.len = Math.max(1, s.h - (s.pin ? s.pin.offsetHeight : vh));
      if (s.el.id === 'track') s.pinOffset = navH;   // o quadro gruda logo abaixo da nav
    }
    sections.forEach(o => { const r = o.el.getBoundingClientRect(); o.top = r.top + scrollY; o.bottom = o.top + o.el.offsetHeight; });
    hero.layout();
  }
  const sections = $$('[data-theme]').filter(el => el.matches('section, footer, .track')).map(el => ({ el, theme: el.dataset.theme, top: 0, bottom: 0 }));

  /* ============================================================
     NAV: tema conforme a seção embaixo dela, progresso, link atual, menu
     ============================================================ */
  const nav = $('#nav'), navProgress = $('#navProgress');
  const navLinks = $$('.nav-links a');
  const navMenu = $('#navMenu'), navSheet = $('#navSheet');
  function updateNav(y) {
    nav.classList.toggle('at-top', y < 8);
    const probe = y + navH * 0.5;
    let theme = 'dark';
    for (const o of sections) if (probe >= o.top && probe < o.bottom) theme = o.theme;
    nav.classList.toggle('on-light', theme === 'light');
    const max = document.documentElement.scrollHeight - vh;
    navProgress.style.setProperty('--np', max > 0 ? (y / max).toFixed(4) : 0);
    const mid = y + vh * 0.4;
    let cur = null;
    for (const a of navLinks) { const t = $(a.getAttribute('href')); if (t) { const top = t.getBoundingClientRect().top + y; if (top <= mid) cur = a; } }
    navLinks.forEach(a => a.toggleAttribute('aria-current', a === cur) || (a === cur && a.setAttribute('aria-current', 'true')));
  }
  function setMenu(open) {
    navMenu.setAttribute('aria-expanded', open); navSheet.hidden = !open;
    navMenu.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    navMenu.querySelector('use').setAttribute('href', open ? '#i-close' : '#i-menu');
  }
  navMenu.addEventListener('click', () => setMenu(navMenu.getAttribute('aria-expanded') !== 'true'));
  navSheet.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !navSheet.hidden) { setMenu(false); navMenu.focus(); } });

  /* ============================================================
     1 · HERO — lacre em tela cheia, lupa de raio-x, inclinação 3D e vista explodida
     ============================================================ */
  const hero = (() => {
    const section = $('#lacre'), stage = $('#sealStage'), seal = $('#seal');
    const layers = {}; $$('.seal-layer', seal).forEach(l => { layers[l.dataset.layer] = l; });
    layers.adhesive.insertAdjacentHTML('beforeend', adhesiveSVG('ad'));
    layers.tamper.insertAdjacentHTML('beforeend', tamperSVG());
    layers.inlay.insertAdjacentHTML('beforeend', inlaySVG());
    layers.print.insertAdjacentHTML('afterbegin', printSVG('pr'));
    const order = ['adhesive', 'tamper', 'inlay', 'print'];
    // marcadores: um ponto na ponta direita (rótulos no desktop) e um no topo (rótulos no celular)
    order.forEach(k => layers[k].insertAdjacentHTML('beforeend', '<i class="mk" style="position:absolute;left:100%;top:50%;width:0;height:0"></i><i class="mk-t" style="position:absolute;left:50%;top:0;width:0;height:0"></i>'));
    const holoGrad = $('.holo-grad', layers.print), holoShine = $('.holo-shine', layers.print), glare = $('.seal-glare', layers.print);
    const serial = $('.serial', layers.print);
    const loupe = $('#loupe'), loupeView = $('.loupe-view', loupe);
    loupeView.insertAdjacentHTML('afterbegin', xraySVG());
    const xsvg = loupeView.querySelector('svg');
    const heroCopy = $('#heroCopy'), anatomy = $('#anatomyCopy'), foot = $('#heroFoot'), next = $('#heroNext');
    const labels = $$('#layerLabels li'), lines = $('#layerLines');
    const linePaths = labels.map(() => { const g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.innerHTML = '<path/><circle r="3.5"/>'; lines.appendChild(g); return g; });

    // palavras do título com atraso escalonado
    $$('.h-hero .w', section).forEach((w, i) => w.style.setProperty('--i', i));

    let sw = 1000, sh = 280, zoom = 1.8, ld = 220, narrow = false;
    let tx = 0, ty = 0, tiltX = 0, tiltY = 0;                 // inclinação suavizada
    let pX = 0, pY = 0, hover = false, dragging = false, lastInput = -1e9;
    let lu = 0.73, lv = 0.42, tu = 0.73, tv = 0.42;           // posição da lupa (normalizada no lacre)
    let pings = 0, nextPing = 3.2;

    function layout() {
      narrow = narrowMQ.matches;
      sw = stage.offsetWidth; sh = stage.offsetHeight;
      ld = narrow ? Math.max(120, Math.min(160, sw * 0.42)) : clamp(sw * 0.22, 170, 240);
      zoom = narrow ? 2.3 : 1.8;
      loupe.style.setProperty('--ld', ld + 'px');
      xsvg.setAttribute('width', sw * zoom); xsvg.setAttribute('height', sh * zoom);
    }

    // entrada orquestrada
    if (!reduce) {
      section.classList.add('is-intro');
      setTimeout(() => scramble(serial, 'A7F3K9B21', 900), 1900);
      setTimeout(() => section.classList.remove('is-intro'), 4200);
    }
    function scramble(el, final, ms) {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789', t0 = performance.now();
      const step = now => {
        const k = clamp((now - t0) / ms, 0, 1), lock = Math.floor(k * final.length);
        el.textContent = final.split('').map((c, i) => i < lock ? c : chars[(Math.random() * chars.length) | 0]).join('');
        if (k < 1) requestAnimationFrame(step); else el.textContent = final;
      };
      requestAnimationFrame(step);
    }
    function ping() {
      const p = document.createElement('i'); p.className = 'nfc-ping';
      p.style.left = '70.6%'; p.style.top = '33.6%';
      layers.print.appendChild(p);
      const a = p.animate([{ transform: 'translate(-50%,-50%) scale(.2)', opacity: .9 }, { transform: 'translate(-50%,-50%) scale(2.6)', opacity: 0 }], { duration: 1700, easing: 'cubic-bezier(.22,.61,.36,1)' });
      a.onfinish = () => p.remove();
    }

    // ponteiro: inclinação no hero inteiro, lupa sobre o lacre
    const pin = $('.hero-pin', section);
    const sealUV = e => { const r = stage.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
    pin.addEventListener('pointermove', e => {
      if (e.pointerType === 'mouse' || dragging) {
        pX = clamp((e.clientX / vw) * 2 - 1, -1, 1); pY = clamp((e.clientY / vh) * 2 - 1, -1, 1);
        const [u, v] = sealUV(e);
        hover = u > -0.03 && u < 1.03 && v > -0.2 && v < 1.2;
        if (hover || dragging) { tu = clamp(u, 0.02, 0.98); tv = clamp(v, 0.04, 0.96); lastInput = performance.now(); }
      }
    }, { passive: true });
    pin.addEventListener('pointerleave', () => { hover = false; pX = pY = 0; });
    stage.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') return;
      dragging = true; const [u, v] = sealUV(e); tu = clamp(u, 0.02, 0.98); tv = clamp(v, 0.04, 0.96); lastInput = performance.now();
    });
    addEventListener('pointerup', () => { dragging = false; });
    addEventListener('pointercancel', () => { dragging = false; });
    stage.style.touchAction = 'pan-y';

    function update(p, dt, t) {
      // explosão: as camadas se separam entre 10% e 42% da rolagem e voltam entre 74% e 90%
      const k = reduce ? 0 : sstep(0.1, 0.42, p);   // termina aberto: as camadas não voltam
      const settle = 0;
      heroCopy.style.opacity = (1 - sstep(0.03, 0.14, p)).toFixed(3);
      heroCopy.style.transform = `translateY(${(-sstep(0, 0.2, p) * 60).toFixed(1)}px)`;
      foot.style.opacity = (1 - sstep(0.02, 0.09, p)).toFixed(3);
      foot.style.pointerEvents = p > 0.06 ? 'none' : '';
      const an = sstep(0.22, 0.34, p);
      anatomy.style.opacity = an.toFixed(3);
      anatomy.style.transform = `translateY(${((1 - an) * 24).toFixed(1)}px)`;
      next.style.opacity = settle.toFixed(3);

      // inclinação: segue o ponteiro; parado, flutua devagar
      const idle = reduce ? 0 : 1;
      const targX = (fine ? -pY * 7 : 0) + idle * Math.sin(t * 0.5) * 2.2;
      const targY = (fine ? pX * 11 : 0) + idle * Math.sin(t * 0.37 + 1) * 3.5;
      tiltX = damp(tiltX, reduce ? 0 : targX, 5, dt); tiltY = damp(tiltY, reduce ? 0 : targY, 5, dt);
      const ex = narrow ? 58 : 57, ez = narrow ? 0 : -24, es = narrow ? 0.94 : 0.64;
      const ox = narrow ? 0 : sw * 0.03, oy = narrow ? sh * 0.62 : sh * 0.55;
      tx = ox * k; ty = oy * k;
      const s = lerp(1, es, k) * (1 - 0.06 * settle);
      seal.style.transform = `translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,0) rotateX(${lerp(tiltX, ex, k).toFixed(2)}deg) rotateY(${lerp(tiltY, 0, k).toFixed(2)}deg) rotateZ(${(ez * k).toFixed(2)}deg) scale(${s.toFixed(4)})`;
      const gap = sw * (narrow ? 0.34 : 0.2);
      order.forEach((key, i) => { layers[key].style.transform = `translateZ(${((i - 1.5) * gap * k + i * 0.8).toFixed(1)}px)`; });

      // reflexo e holograma respondem à inclinação
      glare.style.setProperty('--gx', (50 + tiltY * 4).toFixed(1) + '%');
      glare.style.setProperty('--gy', (30 - tiltX * 5).toFixed(1) + '%');
      holoGrad.setAttribute('gradientTransform', `rotate(${(tiltY * 9 - tiltX * 6 + t * 6).toFixed(1)} 150 140)`);
      holoShine.setAttribute('opacity', (0.35 + 0.3 * Math.abs(Math.sin(tiltY * 0.25 + t * 0.3))).toFixed(3));

      // lupa de raio-x
      const lo = (1 - sstep(0.02, 0.08, p)) * (1 - k);
      loupe.style.setProperty('--lo', lo.toFixed(3));
      if (lo > 0.001) {
        const now = performance.now(), active = hover || dragging || now - lastInput < 2500;
        if (!active) { if (reduce) { tu = 0.73; tv = 0.42; } else { tu = 0.5 + 0.42 * Math.sin(t * 0.33); tv = 0.5 + 0.2 * Math.sin(t * 0.71); } }
        lu = damp(lu, tu, active ? 10 : 2.4, dt); lv = damp(lv, tv, active ? 10 : 2.4, dt);
        const x = lu * sw, y = lv * sh;
        loupe.style.setProperty('--lx', x.toFixed(1) + 'px'); loupe.style.setProperty('--ly', y.toFixed(1) + 'px');
        xsvg.style.transform = `translate(${(ld / 2 - x * zoom).toFixed(1)}px,${(ld / 2 - y * zoom).toFixed(1)}px)`;
      }

      // ondas de aproximação saindo do símbolo do celular (algumas vezes, e quando a lupa passa por ali)
      if (!reduce && p < 0.05) {
        nextPing -= dt;
        const nearNfc = Math.abs(lu - 0.72) < 0.1 && Math.abs(lv - 0.33) < 0.25;
        if (nextPing <= 0 && (pings < 3 || nearNfc)) { ping(); pings++; nextPing = nearNfc ? 1.2 : 2.6; }
      }

      // rótulos das camadas, presos às pontas projetadas de cada camada
      const stageR = stage.getBoundingClientRect();
      labels.forEach((li, i) => {
        const a = sstep(0.2 + i * 0.035, 0.3 + i * 0.035, p);
        li.style.opacity = a.toFixed(3);
        linePaths[i].style.opacity = narrow ? 0 : a.toFixed(3);
        if (a <= 0.001) return;
        const lay = layers[li.dataset.for];
        if (narrow) {
          const m = lay.querySelector('.mk-t').getBoundingClientRect();
          li.style.transform = `translate(${(m.left - stageR.left).toFixed(1)}px,${(m.top - stageR.top - 30).toFixed(1)}px) translateX(-50%)`;
        } else {
          const m = lay.querySelector('.mk').getBoundingClientRect();
          const mx = m.left - stageR.left, my = m.top - stageR.top;
          const lx = Math.min(mx + 56, vw - stageR.left - li.offsetWidth - 20), ly = my - 18 - (3 - i) * 6;
          li.style.transform = `translate(${lx.toFixed(1)}px,${(ly - 10).toFixed(1)}px)`;
          linePaths[i].firstChild.setAttribute('d', `M${mx.toFixed(1)} ${my.toFixed(1)}L${(mx + 22).toFixed(1)} ${ly.toFixed(1)}H${(lx - 6).toFixed(1)}`);
          linePaths[i].lastChild.setAttribute('cx', mx.toFixed(1)); linePaths[i].lastChild.setAttribute('cy', my.toFixed(1));
        }
      });
    }
    return { layout, update };
  })();
  addSeq($('#lacre'), (p, dt, t) => hero.update(p, dt, t), '.hero-pin');

  /* ============================================================
     2 · QUADRO 3D — capítulos, botões de capítulo, reproduzir e pular
     ============================================================ */
  const frame = (() => {
    const track = $('#track'), stageEl = $('#stage');
    const chapters = $$('[data-from]', stageEl).map(el => ({ el, a: +el.dataset.from, b: +el.dataset.to }));
    const chips = $$('#fcChips button'), play = $('#fcPlay'), hint = $('#hint');
    const ranges = [[0, 0.17], [0.17, 0.43], [0.43, 0.7], [0.7, 0.93], [0.93, 1.0001]];
    let pS = 0, playing = false, seq = null;
    function trackY(p) { return seq.top - seq.pinOffset + p * seq.len; }
    function go(p, smooth = true) { stopPlay(); scrollTo({ top: trackY(p), behavior: smooth && !reduce ? 'smooth' : 'auto' }); }
    chips.forEach(b => b.addEventListener('click', () => go(+b.dataset.go)));
    function stopPlay() { if (!playing) return; playing = false; play.classList.remove('is-playing'); play.setAttribute('aria-label', 'Reproduzir animação'); }
    play.addEventListener('click', () => {
      if (playing) return stopPlay();
      if (seq.p >= 0.995 || seq.p <= 0) scrollTo({ top: trackY(0.001), behavior: 'auto' });
      playing = true; play.classList.add('is-playing'); play.setAttribute('aria-label', 'Pausar animação');
    });
    ['wheel', 'touchstart', 'keydown'].forEach(ev => addEventListener(ev, e => { if (playing && !(ev === 'keydown' && e.target === play)) stopPlay(); }, { passive: true }));
    $('#skipAnim').addEventListener('click', e => { e.preventDefault(); stopPlay(); const t = $('#como-funciona'); scrollTo({ top: t.getBoundingClientRect().top + scrollY, behavior: 'auto' }); t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); });

    function update(p, dt) {
      if (playing) {
        scrollBy(0, (seq.len / 15) * dt);
        if (p >= 0.999) stopPlay();
      }
      pS = damp(pS, p, 4.5, dt);
      hint.style.opacity = (1 - sstep(0.01, 0.05, pS)).toFixed(3);
      const f = 0.035;
      for (const { el, a, b } of chapters) {
        const fin = a <= 0 ? 1 : clamp((pS - a) / f, 0, 1), fout = b >= 1 ? 1 : clamp((b - pS) / f, 0, 1);
        const v = sstep(0, 1, Math.min(fin, fout));
        el.style.opacity = v.toFixed(3);
        el.style.translate = `0 ${((1 - v) * 26).toFixed(1)}px`;
        el.classList.toggle('is-on', v > 0.5);
      }
      chips.forEach((c, i) => {
        const [a, b] = ranges[i], on = pS >= a && pS < b;
        c.toggleAttribute('aria-current', on); if (on) c.setAttribute('aria-current', 'true');
        c.style.setProperty('--cp', clamp((pS - a) / (b - a), 0, 1).toFixed(3));
      });
    }
    return { update, bind(s) { seq = s; } };
  })();
  const frameSeq = addSeq($('#track'), (p, dt) => frame.update(p, dt), '.track-pin', 0);
  frame.bind(frameSeq);

  /* ============================================================
     3 · O PROBLEMA — "qual delas é original?": duas garrafas idênticas (renderizadas pela cena 3D);
     começa sozinho quando aparece, revela em alguns segundos ou quando a pessoa escolhe
     ============================================================ */
  const game = (() => {
    const root = $('#game'), btns = $$('.gb', root), msg = $('#gameMsg'), again = $('#gameAgain'), timer = $('#gameTimer');
    const AUTO = 6;
    let fake = Math.random() < 0.5 ? 0 : 1, state = 'idle', clock = 0, inView = false, hasImg = false, considering = false;
    btns.forEach(b => {
      b.addEventListener('pointerenter', () => { considering = true; }); b.addEventListener('pointerleave', () => { considering = false; });
      b.addEventListener('focus', () => { considering = true; }); b.addEventListener('blur', () => { considering = false; });
    });
    function fallback(bad) {
      const liq = '#d98a2b';
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 190 380">'
        + '<path d="M80 44h30v56c0 12 40 22 40 50v196a10 10 0 0 1-10 10H50a10 10 0 0 1-10-10V150c0-28 40-38 40-50z" fill="' + liq + '" fill-opacity=".85"/>'
        + '<path d="M80 44h30v56c0 12 40 22 40 50v196a10 10 0 0 1-10 10H50a10 10 0 0 1-10-10V150c0-28 40-38 40-50z" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2"/>'
        + '<rect x="56" y="186" width="78" height="120" rx="6" fill="#062a63" stroke="#03adf9" stroke-width="2"/>'
        + '<rect x="74" y="16" width="42" height="30" rx="5" fill="#0a1a3a"' + (bad ? ' transform="rotate(-14 95 31)"' : '') + '/></svg>';
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }
    function setImages() {
      let ok = null, bad = null;
      try { if (window.VeriSeal3D) { ok = window.VeriSeal3D.renderBottle({ bad: false }); bad = window.VeriSeal3D.renderBottle({ bad: true }); } } catch (e) { ok = null; }
      if (!ok) { ok = fallback(false); bad = fallback(true); }
      btns.forEach(b => { $('.gb-a', b).src = ok; $('.gb-b', b).src = bad; });
      hasImg = true;
    }
    // as fotos 3D só são geradas quando o jogo se aproxima da tela (evita travar o carregamento)
    let near = false, ready3d = false;
    const tryImages = () => { if (near && ready3d && !hasImg) setImages(); };
    addEventListener('veriseal:3d', () => { ready3d = true; tryImages(); });
    new IntersectionObserver((es, o) => es.forEach(e => {
      if (!e.isIntersecting) return;
      near = true; o.disconnect(); tryImages();
      setTimeout(() => { if (!hasImg) setImages(); }, 2500);   // sem 3D: desenho em SVG
    }), { rootMargin: '120% 0px' }).observe(root);
    function reset() {
      fake = Math.random() < 0.5 ? 0 : 1; state = 'idle'; clock = 0;
      root.classList.remove('is-done', 'is-scanning');
      btns.forEach(b => { b.className = 'gb'; b.disabled = false; $('.gb-badge', b).textContent = ''; });
      msg.textContent = ''; again.hidden = true; timer.style.setProperty('--gt', 0);
    }
    function reveal(choice) {
      if (state !== 'idle') return;
      state = 'revealing';
      root.classList.add('is-done'); btns.forEach(b => { b.disabled = true; });
      if (choice != null) btns[choice].classList.add('chosen');
      root.classList.remove('is-scanning'); void root.offsetWidth; root.classList.add('is-scanning');
      [0, 1].forEach((i, k) => setTimeout(() => {
        const b = btns[i], isFake = i === fake;
        b.classList.add(isFake ? 'is-fake' : 'is-real', 'revealed');
        $('.gb-badge', b).textContent = isFake ? '✕ Lacre rompido' : '✓ Original';
      }, reduce ? 0 : 420 + k * 640));
      setTimeout(() => {
        state = 'done';
        const side = fake === 0 ? 'da esquerda' : 'da direita';
        const tail = ' A garrafa ' + side + ' estava com o lacre rompido. Por fora, são idênticas.';
        msg.innerHTML = choice == null ? '<b>Impossível saber só de olhar.</b> A garrafa ' + side + ' estava com o lacre rompido.'
          : choice === fake ? '<b>Errou.</b>' + tail : '<b>Acertou, mas foi sorte.</b>' + tail;
        again.hidden = false;
      }, reduce ? 0 : 1700);
    }
    btns.forEach((b, i) => b.addEventListener('click', () => reveal(i)));
    again.addEventListener('click', () => { reset(); btns[0].focus(); });
    new IntersectionObserver(es => es.forEach(e => { inView = e.isIntersecting; }), { threshold: 0.5 }).observe(root);
    function update(dt) {
      if (!inView || state !== 'idle' || !hasImg || considering) return;
      clock += dt;
      timer.style.setProperty('--gt', clamp(clock / AUTO, 0, 1).toFixed(3));
      if (clock >= AUTO) reveal(null);
    }
    return { update, fallback };
  })();

  /* ============================================================
     5 · A IDEIA — a frase acende palavra por palavra sozinha quando aparece (a rolagem fica livre)
     ============================================================ */
  (() => {
    const sec = $('#ideia'), text = $('#ideaText'), sub = $('#ideaSub');
    const words = text.textContent.trim().split(/\s+/);
    const full = text.textContent.trim();
    text.innerHTML = '<span class="sr-only">' + full + '</span>' + words.map((w, i) => '<span class="iw' + (i >= words.length - 2 ? ' hl' : '') + '" aria-hidden="true" style="--i:' + i + '">' + w + '</span>').join(' ');
    sub.style.setProperty('--sd', (words.length * 0.085 + 0.5).toFixed(2) + 's');
    new IntersectionObserver((es, o) => es.forEach(e => { if (e.isIntersecting) { sec.classList.add('is-on'); o.disconnect(); } }), { threshold: 0.4 }).observe(sec);
  })();

  /* ============================================================
     6 · COMO FUNCIONA — demonstração que roda sozinha quando aparece; etapas clicáveis, pausa e modo violado.
     A garrafa é a cena 3D real (main.js lê window.VeriSeal.how para girar o lacre e romper a tampa).
     ============================================================ */
  const howState = { step: 0, bad: false };
  const how = (() => {
    const scene = $('#howScene'), steps = $$('#steps li'), stepBtns = $$('#steps button');
    const scrRead = $('.ap-read', scene), scrOk = $('.ap-ok', scene), scrBad = $('.ap-bad', scene), apChecks = $$('.ap-checks li', scene);
    const seg = $('#como-funciona .seg'), segBtns = $$('button', seg), playBtn = $('#howPlay');
    const DUR = [1.8, 1.1, 3.2];   // aproxima (o app abre sozinho), lê em ~1 s, mostra o resultado
    let local = 0, playing = !reduce, inView = false, started = false;
    function render() {
      const st = howState.step;
      ['st-0', 'st-1', 'st-2'].forEach((c, i) => scene.classList.toggle(c, started && st === i));
      steps.forEach((li, i) => {
        li.classList.toggle('is-on', i === st); li.classList.toggle('is-done', i < st);
        li.style.setProperty('--sp', i < st ? 1 : i === st ? clamp(local, 0, 1).toFixed(3) : 0);
        stepBtns[i].setAttribute('aria-current', i === st ? 'step' : 'false');
      });
      scene.classList.toggle('ph-detect', started && st === 0 && local > 0.62);
      scene.classList.toggle('ph-open', started && st >= 1);
      scrRead.classList.toggle('is-on', st === 1);
      scrOk.classList.toggle('is-on', st === 2 && !howState.bad); scrBad.classList.toggle('is-on', st === 2 && howState.bad);
      apChecks.forEach(c => c.classList.toggle('is-on', st > 1 || (st === 1 && local >= +c.dataset.at)));
      scene.classList.toggle('is-reading', started && ((st === 0 && local > 0.5) || st === 1));
    }
    function go(i) { howState.step = i; local = 0; render(); }
    stepBtns.forEach((b, i) => b.addEventListener('click', () => { started = true; go(i); }));
    function setPlaying(v) { playing = v; scene.classList.toggle('is-paused', !v); playBtn.classList.toggle('is-playing', v); playBtn.setAttribute('aria-label', v ? 'Pausar demonstração' : 'Reproduzir demonstração'); }
    setPlaying(playing);
    playBtn.addEventListener('click', () => setPlaying(!playing));
    segBtns.forEach(b => b.addEventListener('click', () => {
      howState.bad = b.dataset.mode === 'bad';
      segBtns.forEach(x => x.setAttribute('aria-checked', x === b));
      seg.classList.toggle('is-bad', howState.bad); scene.classList.toggle('is-bad', howState.bad);
      started = true; go(2);
    }));
    seg.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const i = segBtns.findIndex(x => x.getAttribute('aria-checked') === 'true'), j = (i + 1) % 2;
      segBtns[j].click(); segBtns[j].focus(); e.preventDefault();
    });
    new IntersectionObserver(es => es.forEach(e => { inView = e.isIntersecting; if (inView && !started) { started = true; go(0); } }), { threshold: 0.35 }).observe(scene);
    let shots = false;
    const takeShots = () => {
      if (shots) return; shots = true;
      let ok = null, bad = null;
      try { if (window.VeriSeal3D) { ok = window.VeriSeal3D.renderBottle({ w: 260, h: 520, bg: 0xf1f5fb }); bad = window.VeriSeal3D.renderBottle({ bad: true, w: 260, h: 520, bg: 0xf1f5fb }); } } catch (e) { ok = null; }
      if (!ok) { ok = game.fallback(false); bad = game.fallback(true); }
      $$('.ap-bottle', scene).forEach(img => { img.src = img.classList.contains('bad') ? bad : ok; });
    };
    let near3d = false, ready3d = !!window.VeriSeal3D;
    addEventListener('veriseal:3d', () => { ready3d = true; if (near3d) takeShots(); });
    new IntersectionObserver((es, o) => es.forEach(e => { if (!e.isIntersecting) return; near3d = true; o.disconnect(); if (ready3d) takeShots(); setTimeout(() => { if (!shots) takeShots(); }, 2500); }), { rootMargin: '120% 0px' }).observe(scene);
    function update(dt) {
      if (!started || !inView) return;
      if (playing) {
        local += dt / DUR[howState.step];
        if (local >= 1) { go((howState.step + 1) % 3); return; }
      }
      render();
    }
    render();
    return { update };
  })();

  /* ============================================================
     7 · BENEFÍCIOS — abas com controle segmentado
     ============================================================ */
  (() => {
    const tabs = $$('.tabs [role="tab"]'), wrap = $('.tabs');
    function select(i, focus) {
      tabs.forEach((t, j) => {
        const on = i === j; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
        const panel = $('#' + t.getAttribute('aria-controls'));
        panel.hidden = !on;
        if (on && !reduce) {
          $$('.tile', panel).forEach((tile, k) => tile.style.setProperty('--k', k));
          panel.classList.remove('is-entering'); void panel.offsetWidth; panel.classList.add('is-entering');
          setTimeout(() => panel.classList.remove('is-entering'), 1100);
        }
      });
      wrap.classList.toggle('is-second', i === 1);
      if (focus) tabs[i].focus();
    }
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(i));
      t.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); select((i + 1) % tabs.length, true); }
      });
    });
  })();

  /* ============================================================
     8 · IDENTIDADE DIGITAL — cartão 3D que entra em perspectiva, vira sozinho uma vez para mostrar a jornada,
     e depois vira com um toque; inclina com o ponteiro
     ============================================================ */
  const passport = (() => {
    const box = $('#pass'), card = $('#passCard'), flipBtn = $('#passFlip'), holo = $('.pc-holo', card), sec = $('#identidade');
    $$('.journey li', card).forEach((li, k) => li.style.setProperty('--k', k));
    let shown = false, enter = 0, flip = 0, flipT = 0, rx = 0, ry = 0, mx = 0, my = 0, autoT = 0, auto = reduce ? 2 : 0;
    function setFlip(back) { flipT = back ? 180 : 0; card.classList.toggle('is-back', back); flipBtn.textContent = back ? 'Ver a identidade' : 'Ver a jornada'; }
    const toggle = () => { auto = 2; setFlip(flipT === 0); };
    flipBtn.addEventListener('click', toggle);
    card.addEventListener('click', toggle);
    if (fine) box.addEventListener('pointermove', e => { const r = card.getBoundingClientRect(); mx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1); my = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1); });
    box.addEventListener('pointerleave', () => { mx = my = 0; });
    new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) shown = true; }), { threshold: 0.35 }).observe(box);
    card.style.opacity = 0;
    function update(dt, t) {
      if (!shown) return;
      enter = reduce ? 1 : damp(enter, 1, 2.4, dt);
      if (auto === 0) { autoT += dt; if (autoT > 2.6) { setFlip(true); auto = 1; autoT = 0; } }
      else if (auto === 1) { autoT += dt; if (autoT > 6.5) { setFlip(false); auto = 2; } }
      flip = reduce ? flipT : damp(flip, flipT, 4, dt);
      const idle = reduce ? 0 : 1;
      rx = damp(rx, -my * 8 + idle * Math.sin(t * 0.7) * 2, 5, dt); ry = damp(ry, mx * 12 + idle * Math.sin(t * 0.5) * 4, 5, dt);
      card.style.opacity = Math.min(1, enter * 1.4).toFixed(3);
      card.style.transform = 'translateY(' + ((1 - enter) * 70).toFixed(1) + 'px) rotateX(' + (rx + (1 - enter) * 40).toFixed(2) + 'deg) rotateY(' + (ry + flip).toFixed(2) + 'deg)';
      holo.style.setProperty('--ha', (ry * 6 + t * 18).toFixed(1) + 'deg');
      card.style.setProperty('--gx', (50 + ry * 3).toFixed(1) + '%'); card.style.setProperty('--gy', (25 - rx * 3).toFixed(1) + '%');
    }
    return { update, sec };
  })();

  /* ============================================================
     9 · HISTÓRIA — monograma VS extrudado em 3D, girando com a rolagem
     ============================================================ */
  const story = (() => {
    const box = $('#storyMark'), front = box.querySelector('svg');
    const rig = document.createElement('div'); rig.className = 'sm-rig';
    const N = 16;
    for (let i = N; i >= 1; i--) {
      const k = i / N;
      const ink = `rgb(${Math.round(lerp(8, 1, k))},${Math.round(lerp(40, 12, k))},${Math.round(lerp(96, 34, k))})`;
      const acc = `rgb(${Math.round(lerp(3, 1, k))},${Math.round(lerp(130, 50, k))},${Math.round(lerp(196, 84, k))})`;
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', '0 0 668 359'); s.classList.add('back');
      s.innerHTML = `<use href="#vs-mark" style="--lg-ink:${ink};--lg-accent:${acc}"/>`;
      s.style.transform = `translateZ(${(-i * 2.4).toFixed(1)}px)`;
      rig.appendChild(s);
    }
    front.style.transform = 'translateZ(1px)';
    rig.appendChild(front); box.appendChild(rig);
    let top0 = 0, mx = 0, my = 0, rx = 8, ry = -24;
    if (fine) box.parentElement.addEventListener('pointermove', e => { const r = box.getBoundingClientRect(); mx = clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1); my = clamp((e.clientY - r.top) / r.height * 2 - 1, -1, 1); });
    function update(y, dt) {
      if (!top0) top0 = box.getBoundingClientRect().top + scrollY;
      const p = clamp((y + vh - top0) / (vh + box.offsetHeight), 0, 1);
      const try_ = reduce ? -14 : lerp(-34, 30, p) + mx * 12, trx = reduce ? 6 : lerp(14, -8, p) + my * -8;
      ry = damp(ry, try_, 5, dt); rx = damp(rx, trx, 5, dt);
      rig.style.setProperty('--sry', ry.toFixed(2) + 'deg'); rig.style.setProperty('--srx', rx.toFixed(2) + 'deg');
    }
    return { update, reset() { top0 = 0; } };
  })();

  /* ============================================================
     10 · CHAMADA — lacre 3D flutuante que gira com a rolagem e o ponteiro
     ============================================================ */
  const ctaSeal = (() => {
    const box = $('#ctaSeal');
    $('.cs-front', box).innerHTML = printSVG('cs');
    $('.cs-back', box).innerHTML = adhesiveSVG('csb');
    const rig = $('.cs-rig', box), shadow = $('.cs-shadow', box);
    let top0 = 0, mx = 0, my = 0, ry = -24, rx = 16;
    if (fine) $('#contato').addEventListener('pointermove', e => { mx = (e.clientX / vw) * 2 - 1; my = (e.clientY / vh) * 2 - 1; });
    function update(y, dt, t) {
      if (!top0) top0 = box.getBoundingClientRect().top + scrollY;
      const p = clamp((y + vh - top0) / (vh + box.offsetHeight), 0, 1);
      const try_ = reduce ? -12 : lerp(-38, 22, p) + mx * 14 + Math.sin(t * 0.6) * 3;
      const trx = reduce ? 12 : lerp(24, 6, p) - my * 8 + Math.sin(t * 0.8) * 2;
      ry = damp(ry, try_, 4, dt); rx = damp(rx, trx, 4, dt);
      rig.style.setProperty('--cry', ry.toFixed(2) + 'deg'); rig.style.setProperty('--crx', rx.toFixed(2) + 'deg');
      shadow.style.setProperty('--css', (0.8 + 0.2 * Math.cos(ry * Math.PI / 180)).toFixed(3));
    }
    return { update, reset() { top0 = 0; } };
  })();

  /* ============================================================
     revelação ao rolar, cartões com inclinação 3D, botões magnéticos
     ============================================================ */
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add('is-in'); io.unobserve(e.target);
    if (e.target.classList.contains('tile')) setTimeout(() => e.target.classList.add('tilt-ready'), 1300);
  }), { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
  $$('[data-reveal], #storyMark').forEach(el => io.observe(el));
  $$('.panel .tile').forEach(t => t.classList.add('tilt-ready'));

  if (fine && !reduce) {
    $$('.tile').forEach(tile => {
      tile.addEventListener('pointermove', e => {
        const r = tile.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        tile.style.setProperty('--mx', (x * 100).toFixed(1) + '%'); tile.style.setProperty('--my', (y * 100).toFixed(1) + '%');
        if (tile.classList.contains('tilt-ready')) tile.style.transform = `perspective(900px) rotateX(${((0.5 - y) * 7).toFixed(2)}deg) rotateY(${((x - 0.5) * 9).toFixed(2)}deg) translateZ(0)`;
      });
      tile.addEventListener('pointerleave', () => { tile.style.transform = ''; });
    });
    $$('.magnetic').forEach(b => {
      b.addEventListener('pointermove', e => { const r = b.getBoundingClientRect(); b.style.translate = `${((e.clientX - r.left - r.width / 2) * 0.22).toFixed(1)}px ${((e.clientY - r.top - r.height / 2) * 0.35).toFixed(1)}px`; });
      b.addEventListener('pointerleave', () => { b.style.translate = ''; });
    });
  }

  /* ============================================================
     CONVERSÃO — formulário de contato e chamada fixa no celular
     Envio: se data-endpoint estiver preenchido (ex.: Formspree), envia por POST;
     senão, abre o e-mail com a mensagem pronta para data-mailto.
     ============================================================ */
  (() => {
    const form = $('#leadForm'), msg = $('#formMsg');
    const say = (text, cls) => { msg.textContent = text; msg.className = 'f-msg' + (cls ? ' ' + cls : ''); };
    form.addEventListener('input', e => { if (e.target.matches('input')) e.target.removeAttribute('aria-invalid'); });
    const email = form.querySelector('input[type="email"]');
    email.addEventListener('blur', () => {
      const v = email.value.trim();
      if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { email.setAttribute('aria-invalid', 'true'); say('Confira o e-mail: ele parece incompleto.', 'err'); }
      else if (msg.classList.contains('err')) say('');
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const fields = $$('input[required]', form);
      let firstBad = null;
      fields.forEach(f => {
        const ok = f.value.trim() && (f.type !== 'email' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.value.trim()));
        f.toggleAttribute('aria-invalid', !ok); if (!ok) { f.setAttribute('aria-invalid', 'true'); firstBad = firstBad || f; }
      });
      if (firstBad) { say(firstBad.type === 'email' && firstBad.value ? 'Confira o e-mail: ele parece incompleto.' : 'Preencha nome, empresa e e-mail para continuar.', 'err'); firstBad.focus(); return; }
      const data = Object.fromEntries(new FormData(form).entries());
      const endpoint = form.dataset.endpoint;
      const btn = $('.f-submit', form);
      if (endpoint) {
        btn.disabled = true; say('Enviando…');
        try {
          const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) });
          if (!r.ok) throw new Error(r.status);
          form.classList.add('is-sent'); btn.textContent = 'Recebemos seu contato'; say('Obrigado! Nossa equipe vai falar com você em breve.', 'ok');
        } catch (err) { btn.disabled = false; say('Não foi possível enviar agora. Tente de novo em instantes.', 'err'); }
        return;
      }
      const body = `Nome: ${data.nome}\nEmpresa: ${data.empresa}\nE-mail: ${data.email}\nWhatsApp: ${data.whatsapp || '-'}\nGarrafas por mês: ${data.volume || '-'}`;
      location.href = `mailto:${form.dataset.mailto}?subject=${encodeURIComponent('Quero proteger minha marca com a VeriSeal')}&body=${encodeURIComponent(body)}`;
      form.classList.add('is-sent'); say('Abrimos seu e-mail com a mensagem pronta. É só enviar.', 'ok');
    });
  })();
  const mcta = $('#mcta');
  function updateMcta(y) {
    const heroEnd = $('#lacre').offsetHeight - vh * 0.5;
    const tr = frameSeq, inTrack = y + vh > tr.top && y < tr.top + tr.h;
    const ct = $('#contato'), nearForm = y + vh > ct.offsetTop + 120;
    const hs = $('#howScene').getBoundingClientRect(), overDemo = hs.top < vh && hs.bottom > 0;   // não cobrir o celular da demonstração
    mcta.classList.toggle('is-on', y > heroEnd && !inTrack && !nearForm && !overDemo);
  }

  /* ============================================================
     laço principal
     ============================================================ */
  let lastT = performance.now();
  function tick(now) {
    const dt = clamp((now - lastT) / 1000, 0.001, 0.05); lastT = now;
    const t = now / 1000, y = scrollY;
    for (const s of seqs) {
      const vis = y + vh > s.top - 50 && y < s.top + s.h + 50;
      if (!vis && !s.vis) continue;
      s.vis = vis;
      const p = clamp((y + s.pinOffset - s.top) / s.len, 0, 1);
      s.p = p;
      s.update(p, dt, t);
    }
    updateNav(y);
    updateMcta(y);
    game.update(dt);
    how.update(dt);
    const ps = passport.sec;
    if (y + vh > ps.offsetTop && y < ps.offsetTop + ps.offsetHeight) passport.update(dt, t);
    const st = $('#historia');
    if (y + vh > st.offsetTop && y < st.offsetTop + st.offsetHeight) story.update(y, dt);
    const ct = $('#contato');
    if (y + vh > ct.offsetTop && y < ct.offsetTop + ct.offsetHeight) ctaSeal.update(y, dt, t);
    requestAnimationFrame(tick);
  }

  function remeasure() { measure(); story.reset(); ctaSeal.reset(); }
  addEventListener('resize', remeasure);
  addEventListener('load', remeasure);
  document.fonts?.ready.then(remeasure);
  narrowMQ.addEventListener?.('change', remeasure);
  measure();

  // #p=0.86 leva direto a um ponto da animação do quadro (útil para revisar a cena)
  const forcedP = /[#&]p=([\d.]+)/.exec(location.hash);
  if (forcedP) addEventListener('load', () => { measure(); scrollTo({ top: frameSeq.top + clamp(+forcedP[1], 0, 1) * frameSeq.len, behavior: 'auto' }); });

  requestAnimationFrame(tick);
  window.VeriSeal = Object.assign(window.VeriSeal || {}, { frameProgress: () => Math.max(0, frameSeq.p), measure, how: howState });
})();
