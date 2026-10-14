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
     O LACRE EM SVG — gerado aqui para ser reutilizado nas camadas, na lupa e no lacre da chamada final.
     Uma tira só, que passa por cima da tampa: verso (880) + topo da tampa (612) + frente (880) = 2372 x 280,
     ou 127 x 15 mm ("Lacres png/Lacre VeriSeal esticado.svg"), feita para uma tampa de rosca comum (Ø 31 x 24 mm).
     Cada ponta: a logo VeriSeal na lateral da tampa, a linha de ruptura na junção com o gargalo e, abaixo dela, a ponta
     que fica colada no gargalo; o verso é a frente girada 180°, para ficar de pé depois de dobrado.
     No meio, em cima da tampa, fica o holograma, com o VS deitado ao longo da tira, como a logo.
     O símbolo de aproximação e a chamada das pontas ficam de pé para quem olha a garrafa (girados 90° aqui).
     ============================================================ */
  const PL = 880, SH = 280, R = 24, NX = 420;                         // uma ponta: x = 0 na borda da tampa, ruptura em 420
  const TOPW = 612, SW = 2 * PL + TOPW, MID = SW / 2;                 // a tira inteira e o meio dela (o centro do topo da tampa)
  const FX = PL + TOPW, NB = PL - NX, NF = FX + NX;                   // onde começa a frente; rupturas do verso e da frente
  const FRONT = `translate(${FX} 0)`, BACK = `translate(${PL} ${SH}) rotate(180)`;   // desenho de uma ponta → frente / verso
  const HX = 142, HY = 140, HR = 94, HK = 1.12;                       // holograma no desenho de origem, ampliado HK no topo
  const HOLO_AT = `translate(${MID} ${HY}) scale(${HK}) translate(${-HX} ${-HY})`;
  const WMX = -4, WMW = 380, WMH = WMW * 100 / 833.41, WMY = SH / 2 - WMH / 2;   // logo VeriSeal: começa um fio acima da lateral (na curva da borda da tampa) e termina antes de "ROMPE AO ABRIR"
  const CTA_V = 598, NFC_H = 112;                                      // símbolo de aproximação: centro ao longo da ponta e altura
  const UPRIGHT = `translate(0 ${SH}) rotate(-90)`;                    // (u atravessando a tira, v ao longo dela) → de pé na garrafa
  const notch = x => [`H${x - 11}L${x} 13L${x + 11} 0`, `H${x + 11}L${x} ${SH - 13}L${x - 11} ${SH}`];
  const OUTLINE = `M${R} 0${notch(NB)[0]}${notch(NF)[0]}H${SW - R}A${R} ${R} 0 0 1 ${SW} ${R}V${SH - R}A${R} ${R} 0 0 1 ${SW - R} ${SH}${notch(NF)[1]}${notch(NB)[1]}H${R}A${R} ${R} 0 0 1 0 ${SH - R}V${R}A${R} ${R} 0 0 1 ${R} 0Z`;
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
  // símbolo de aproximação: o oval com as ondas e a mão com o celular (#vs-nfc no sprite da página, também usado em main.js).
  // (x, y) é o centro do desenho e h a altura; as ondas ficam em paths próprios para acenderem uma a uma
  const NFC = (() => {
    const sym = $('#vs-nfc'), [, , w, h] = sym.getAttribute('viewBox').split(' ').map(Number);
    return { w, h, body: $('.nfc-body', sym).getAttribute('d'), waves: $$('.nfc-wave', sym).map(p => p.getAttribute('d')) };
  })();
  const NFC_OVAL = [0.292, 0.476];   // centro do oval (de onde saem as ondas), em fração da largura e da altura do símbolo
  // o mesmo ponto na tira deitada, na ponta da frente (a antena fica embaixo dela; o símbolo está girado: ao longo = x)
  const NFC_PING = [FX + CTA_V + (NFC_OVAL[1] - 0.5) * NFC_H, SH / 2 - (NFC_OVAL[0] - 0.5) * NFC_H * NFC.w / NFC.h];
  function nfcSymbol(x, y, h, fill) {
    const s = h / NFC.h, w = NFC.w * s;
    const waves = NFC.waves.map((d, i) => `<path class="cl-arc" style="--k:${i}" d="${d}"/>`).join('');
    return `<g transform="translate(${(x - w / 2).toFixed(1)} ${(y - h / 2).toFixed(1)}) scale(${s.toFixed(4)})" fill="${fill}" fill-rule="evenodd"><path d="${NFC.body}"/>${waves}</g>`;
  }
  /* o circuito, como no desenho técnico do lacre:
     - a antena NFC de cobre corre a tira inteira, em duas bobinas (uma de cada lado do chip): o celular lê em qualquer ponto;
     - o chip NTAG 424 DNA fica no meio da tira, embaixo do holograma (no topo da tampa);
     - ao lado dele, o circuito de ruptura (TagTamper), separado da antena: ele se rompe e a antena continua respondendo,
       para informar a adulteração */
  const CU = { line: '#e8894a', bright: '#ffb27a', glow: '#d9772f' };   // cobre
  const RED = { line: '#ff5b4f', bright: '#ff8a80', glow: '#ff3b30' };
  const MOD = { l: MID - 96, r: MID + 96, t: 102, b: 178 };              // módulo do chip (blocos de contato + chip)
  function antennaPath() {
    const n = 5, p = 13, x0 = 30, y0 = 30, y1 = 250;
    let d = '';
    for (const sd of [1, -1]) {                // 1 = bobina do verso (à esquerda), -1 = a da frente, espelhada no meio
      const X = x => +(sd > 0 ? x : SW - x).toFixed(1);
      for (let k = 0; k < n; k++) {
        // cada volta sai de um contato do módulo, sobe em 45°, contorna a ponta da tira e volta ao módulo por baixo;
        // as voltas de dentro saem mais perto do centro do módulo e dobram mais longe dele, para nenhuma cruzar a outra
        const top = y0 + k * p, bot = y1 - k * p, L = x0 + k * p, r = 16 - k * 2;
        const padT = 110 + k * 4.5, padB = 170 - k * 4.5, xj = MID - 104 - k * 22.5;
        d += `M${X(MOD.l)} ${padT}H${X(xj)}L${X(xj - (padT - top))} ${top}H${X(L + r)}`
          + `Q${X(L)} ${top} ${X(L)} ${top + r}V${bot - r}Q${X(L)} ${bot} ${X(L + r)} ${bot}`
          + `H${X(xj - (bot - padB))}L${X(xj)} ${padB}H${X(MOD.l)}`;
      }
    }
    return d;
  }
  const ANTENNA = antennaPath();
  // TagTamper: um meandro no bloco à direita do chip, ligado ao chip por dois contatos próprios (não passa pela antena)
  const TAMPER = `M${MID + 22} 126H${MID + 38}V160a5 5 0 0 0 10 0V120a5 5 0 0 1 10 0V160a5 5 0 0 0 10 0V120a5 5 0 0 1 10 0V160`
    + `V170H${MID + 30}V154H${MID + 22}`;
  function dieCuts() {
    let d = '';
    for (let y = 26, row = 0; y < SH - 10; y += 30, row++) for (let x = 24 + (row % 2) * 15; x < SW - 10; x += 30) {
      const flip = (x + y) % 60 < 30 ? 1 : -1;
      d += `M${x - 5} ${y}a5 5 0 0 ${flip > 0 ? 1 : 0} 10 0`;
    }
    return d;
  }
  const DIECUTS = dieCuts();

  const antennaMarkup = (bright, anim) => `
    <path d="${ANTENNA}" fill="none" stroke="${CU.glow}" stroke-opacity="${bright ? .3 : .2}" stroke-width="6" stroke-linejoin="round"/>
    <path class="${anim ? 'trace' : ''}" style="--td:.35s" pathLength="1" d="${ANTENNA}" fill="none" stroke="${bright ? CU.bright : CU.line}" stroke-width="2.2" stroke-linejoin="round"/>`;
  // o módulo: bloco de contatos, chip e o bloco do TagTamper. O grupo .chip tem uma animação de entrada com transform de CSS
  const moduleMarkup = bright => `
    <g class="chip">
      <rect x="${MOD.l}" y="${MOD.t}" width="48" height="76" rx="5" fill="#8f98a4" stroke="#c9d1db" stroke-width="1"/>
      <rect x="${MOD.l + 9}" y="${MOD.t + 13}" width="13" height="9" rx="1.5" fill="#5d6672"/><rect x="${MOD.l + 26}" y="${MOD.t + 40}" width="13" height="9" rx="1.5" fill="#5d6672"/>
      <circle cx="${MOD.l + 16}" cy="${MOD.t + 54}" r="4" fill="none" stroke="#5d6672" stroke-width="1.6"/>
      <rect x="${MID - 42}" y="108" width="64" height="64" rx="5" fill="#0b0d12" stroke="#2c3240" stroke-width="1.2"/>
      <rect x="${MID - 34}" y="116" width="48" height="48" rx="3" fill="none" stroke="#1f2531" stroke-width="1"/>
      <rect x="${MID + 28}" y="${MOD.t}" width="68" height="76" rx="5" fill="#8f98a4" stroke="#c9d1db" stroke-width="1"/>
      <path d="M${MID - 48} 126H${MID - 42}M${MID - 48} 154H${MID - 42}" stroke="${bright ? CU.bright : CU.line}" stroke-width="2.4"/>
    </g>`;
  const tamperMarkup = (bright, anim, box) => `
    <path d="${TAMPER}" fill="none" stroke="${RED.glow}" stroke-opacity="${bright ? .3 : .22}" stroke-width="6" stroke-linejoin="round"/>
    <path class="${anim ? 'trace' : ''}" style="--td:.9s" pathLength="1" d="${TAMPER}" fill="none" stroke="${bright ? RED.bright : RED.line}" stroke-width="2.2" stroke-linejoin="round"/>
    <circle cx="${MID + 22}" cy="126" r="3" fill="${RED.bright}"/><circle cx="${MID + 22}" cy="154" r="3" fill="${RED.bright}"/>
    ${box ? `<rect x="${MID + 30}" y="108" width="62" height="70" rx="4" fill="none" stroke="${RED.line}" stroke-opacity=".7" stroke-width="1.4" stroke-dasharray="4 4"/>` : ''}`;
  const tearMarkup = (op) => `<path d="M${NB} 18V262M${NF} 18V262" stroke="#fff" stroke-opacity="${op}" stroke-width="1.6" stroke-dasharray="5 6"/>`;

  // uma ponta impressa (no desenho da frente; o verso é a mesma, girada): logo VeriSeal, aviso da ruptura e a ponta de baixo
  const endMarkup = () => `
      <use href="#vs-wordmark" x="${WMX}" y="${WMY.toFixed(1)}" width="${WMW}" height="${WMH.toFixed(1)}" style="--lg-ink:#fff;--lg-accent:#03adf9"/>
      <text transform="translate(${NX - 14} 140) rotate(-90)" text-anchor="middle" font-family="${MONO}" font-size="9" letter-spacing="2" fill="#fff" fill-opacity=".55">ROMPE AO ABRIR</text>
      <g transform="${UPRIGHT}">
        ${nfcSymbol(SH / 2, CTA_V, NFC_H, '#fff')}
        <g text-anchor="middle" font-family="${SANS}" font-size="34" font-weight="700" letter-spacing=".7" fill="#fff">
          <text x="${SH / 2}" y="${CTA_V + 115}">APROXIME</text><text x="${SH / 2}" y="${CTA_V + 156}">O CELULAR</text>
        </g>
      </g>`;

  // camada impressa (a face do lacre)
  function printSVG(id) {
    return `<svg viewBox="0 0 ${SW} ${SH}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="${id}-clip"><path d="${OUTLINE}"/></clipPath>
        <linearGradient id="${id}-navy" gradientUnits="userSpaceOnUse" x1="${MID}" y1="0" x2="${SW}" y2="0" spreadMethod="reflect"><stop offset="0" stop-color="#0d3a80"/><stop offset=".45" stop-color="#062a63"/><stop offset="1" stop-color="#021a42"/></linearGradient>
        <linearGradient id="${id}-holo" class="holo-grad" gradientUnits="userSpaceOnUse" x1="${HX - HR}" y1="${HY - HR}" x2="${HX + HR}" y2="${HY + HR}">
          <stop offset="0" stop-color="#8fe3ff"/><stop offset=".18" stop-color="#b9a9ff"/><stop offset=".36" stop-color="#ffc4e5"/><stop offset=".52" stop-color="#fff1b0"/><stop offset=".7" stop-color="#b3ffd8"/><stop offset=".86" stop-color="#8fe3ff"/><stop offset="1" stop-color="#c8b8ff"/>
        </linearGradient>
        <radialGradient id="${id}-shine" cx=".35" cy=".3" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".35" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
        <path id="${id}-ring" d="M${HX} ${HY}m-80 0a80 80 0 1 1 160 0a80 80 0 1 1-160 0"/>
      </defs>
      <g clip-path="url(#${id}-clip)">
        <rect width="${SW}" height="${SH}" fill="url(#${id}-navy)"/>
        <path d="${guilloche(14, 108, .0115, .0042, 0)}" fill="none" stroke="#5fd0ff" stroke-opacity=".1" stroke-width="1"/>
        <path d="${guilloche(10, 70, .019, .006, 1.3)}" fill="none" stroke="#9fb5ff" stroke-opacity=".08" stroke-width="1"/>
      </g>
      <path d="${OUTLINE}" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="2"/>
      <rect x="12" y="12" width="${SW - 24}" height="${SH - 24}" rx="15" fill="none" stroke="#03adf9" stroke-opacity=".38" stroke-width="1.2"/>
      <g class="holo" transform="${HOLO_AT}">
        <circle cx="${HX}" cy="${HY}" r="${HR}" fill="url(#${id}-holo)"/>
        <path d="${rosette(HX, HY, 50, 20, 7, 8)}" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width=".8"/>
        <circle class="holo-shine" cx="${HX}" cy="${HY}" r="${HR}" fill="url(#${id}-shine)" opacity=".5"/>
        <circle cx="${HX}" cy="${HY}" r="${HR}" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.5"/>
        <text font-family="${MONO}" font-size="10.5" font-weight="600" letter-spacing="2.1" fill="#062a63" fill-opacity=".72"><textPath href="#${id}-ring">VERISEAL • PRODUTO ORIGINAL • VERISEAL • PRODUTO ORIGINAL •</textPath></text>
        <use href="#vs-mark" x="${HX - 46}" y="${HY - 24.7}" width="92" height="49.4" style="--lg-ink:#062a63;--lg-accent:#0a76c4"/>
      </g>
      ${tearMarkup(.55)}
      <g transform="${BACK}">${endMarkup()}</g>
      <g transform="${FRONT}">${endMarkup()}</g>
    </svg>`;
  }
  function filmSVG(inner, fill, stroke) {
    return `<svg viewBox="0 0 ${SW} ${SH}" xmlns="http://www.w3.org/2000/svg"><path d="${OUTLINE}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>${inner}</svg>`;
  }
  // camadas internas: a antena com o chip; o TagTamper sozinho (com o contorno do chip, para se ver onde ele fica)
  const inlaySVG = () => filmSVG(antennaMarkup(false, true) + moduleMarkup(false), 'rgba(4,16,38,.88)', 'rgba(232,137,74,.4)');
  const tamperSVG = () => filmSVG(`<path d="${DIECUTS}" fill="none" stroke="#fff" stroke-opacity=".13" stroke-width="1.1"/>${tearMarkup(.4)}
    <rect x="${MID - 42}" y="108" width="64" height="64" rx="5" fill="none" stroke="#fff" stroke-opacity=".28" stroke-dasharray="3 4"/>${tamperMarkup(false, true, true)}`, 'rgba(6,22,50,.82)', 'rgba(255,91,79,.3)');
  const adhesiveSVG = id => `<svg viewBox="0 0 ${SW} ${SH}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="${id}-dots" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.3" fill="#fff" fill-opacity=".16"/></pattern></defs><path d="${OUTLINE}" fill="rgba(190,215,250,.12)" stroke="rgba(255,255,255,.3)" stroke-width="1.5"/><path d="${OUTLINE}" fill="url(#${id}-dots)"/></svg>`;
  // o que a lupa de raio-x mostra: o interior do lacre, com anotações
  function xraySVG() {
    let grid = '';
    for (let x = 20; x < SW; x += 20) grid += `M${x} 0V${SH}`;
    for (let y = 20; y < SH; y += 20) grid += `M0 ${y}H${SW}`;
    const label = (x, y, t, rot, anchor = 'start', fill = '#9fe6ff') => `<text ${rot ? `transform="translate(${x} ${y}) rotate(-90)" text-anchor="middle"` : `x="${x}" y="${y}" text-anchor="${anchor}"`} font-family="${MONO}" font-size="11" font-weight="600" letter-spacing="1.6" fill="${fill}">${t}</text>`;
    const ghost = `<use href="#vs-wordmark" x="${WMX}" y="${WMY.toFixed(1)}" width="${WMW}" height="${WMH.toFixed(1)}" style="--lg-ink:rgba(95,208,255,.13);--lg-accent:rgba(95,208,255,.2)"/>`;
    return `<svg viewBox="0 0 ${SW} ${SH}" xmlns="http://www.w3.org/2000/svg">
      <defs><clipPath id="xr-clip"><path d="${OUTLINE}"/></clipPath></defs>
      <path d="${OUTLINE}" fill="#020c1d"/>
      <g clip-path="url(#xr-clip)"><path d="${grid}" stroke="#03adf9" stroke-opacity=".08" stroke-width="1"/></g>
      <path d="${OUTLINE}" fill="none" stroke="#03adf9" stroke-opacity=".45" stroke-width="1.5"/>
      <circle cx="${MID}" cy="${HY}" r="${HR * HK}" fill="none" stroke="#5fd0ff" stroke-opacity=".45" stroke-dasharray="3 5"/>
      <g transform="${BACK}">${ghost}</g><g transform="${FRONT}">${ghost}</g>
      <path d="${DIECUTS}" fill="none" stroke="#9fe6ff" stroke-opacity=".12" stroke-width="1.1"/>
      ${tearMarkup(.5)}${antennaMarkup(true, false)}${moduleMarkup(true)}${tamperMarkup(true, false, true)}
      <path d="M${PL} 14V266M${FX} 14V266" stroke="#5fd0ff" stroke-opacity=".35" stroke-width="1.2" stroke-dasharray="2 6"/>
      ${label(110, 145, 'ANTENA NFC · LEITURA EM QUALQUER PONTO')}${label(NF + 40, 145, 'ANTENA NFC · LEITURA EM QUALQUER PONTO')}
      ${label(MID, 94, 'CHIP NTAG 424 DNA', false, 'middle')}${label(MID + 61, 198, 'TAGTAMPER', false, 'middle', '#ff8a80')}
      ${label(NF - 23, 140, 'LINHA DE RUPTURA', true)}${label(NB + 34, 140, 'LINHA DE RUPTURA', true)}
      ${label(PL - 14, 140, 'BORDA DA TAMPA', true)}${label(FX + 26, 140, 'BORDA DA TAMPA', true)}
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
    // posições usadas a cada quadro: lidas só aqui, para o laço principal não forçar reflow
    for (const k in at) { const el = $(k), r = el.getBoundingClientRect(); at[k] = { top: r.top + scrollY, bottom: r.bottom + scrollY }; }
    navTargets.forEach(o => { o.top = o.el ? o.el.getBoundingClientRect().top + scrollY : Infinity; });
    docH = document.documentElement.scrollHeight;
    navY = -1;
    hero.layout();
  }
  const sections = $$('[data-theme]').filter(el => el.matches('section, footer, .track')).map(el => ({ el, theme: el.dataset.theme, top: 0, bottom: 0 }));
  const at = { '#lacre': null, '#howScene': null, '#identidade': null, '#historia': null, '#contato': null, '#storyMark': null, '#ctaSeal': null };
  let docH = 1;

  /* ============================================================
     NAV: tema conforme a seção embaixo dela, progresso, link atual, menu
     ============================================================ */
  const nav = $('#nav'), navProgress = $('#navProgress');
  const navLinks = $$('.nav-links a');
  const navTargets = navLinks.map(a => ({ a, el: $(a.getAttribute('href')), top: Infinity }));
  const navMenu = $('#navMenu'), navSheet = $('#navSheet');
  let navY = -1, navCur;
  function updateNav(y) {
    if (y === navY) return;   // nada mudou desde o último quadro
    navY = y;
    nav.classList.toggle('at-top', y < 8);
    const probe = y + navH * 0.5;
    let theme = 'dark';
    for (const o of sections) if (probe >= o.top && probe < o.bottom) theme = o.theme;
    nav.classList.toggle('on-light', theme === 'light');
    const max = docH - vh;
    navProgress.style.setProperty('--np', max > 0 ? (y / max).toFixed(4) : 0);
    const mid = y + vh * 0.4;
    let cur = null;
    for (const o of navTargets) if (o.top <= mid) cur = o.a;
    if (cur === navCur) return;
    navCur = cur;
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
    const loupe = $('#loupe'), loupeView = $('.loupe-view', loupe);
    loupeView.insertAdjacentHTML('afterbegin', xraySVG());
    const xsvg = loupeView.querySelector('svg');
    const heroCopy = $('#heroCopy'), anatomy = $('#anatomyCopy'), foot = $('#heroFoot'), next = $('#heroNext');
    const labels = $$('#layerLabels li'), lines = $('#layerLines');
    const linePaths = labels.map(() => { const g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.innerHTML = '<path/><circle r="3.5"/>'; lines.appendChild(g); return g; });
    const markEls = labels.map(li => { const lay = layers[li.dataset.for]; return [lay.querySelector('.mk'), lay.querySelector('.mk-t')]; });

    // palavras do título com atraso escalonado
    $$('.h-hero .w', section).forEach((w, i) => w.style.setProperty('--i', i));

    let sw = 1000, sh = 280, zoom = 1.8, ld = 220, narrow = false;
    let es = 0.64, ey = 0, ox = 0, ex = 50, ez = -20, gap = 160; // vista explodida: escala, deslocamento, giro e vão entre camadas
    let tx = 0, ty = 0, tiltX = 0, tiltY = 0;                 // inclinação suavizada
    let pX = 0, pY = 0, hover = false, dragging = false, lastInput = -1e9;
    const LU0 = (MID + 30) / SW, LV0 = 0.5;                         // parada, a lupa fica sobre o chip e o TagTamper
    let lu = LU0, lv = LV0, tu = LU0, tv = LV0;               // posição da lupa (normalizada no lacre)
    let pings = 0, nextPing = 3.2;

    function layout() {
      narrow = narrowMQ.matches;
      sw = stage.offsetWidth; sh = stage.offsetHeight;
      // a tira é fina (2372 x 280): a lente passa um pouco das bordas dela, e o aumento faz a altura inteira da tira caber
      // nela (o circuito de ruptura corre rente às bordas)
      ld = narrow ? clamp(sh * 2.9, 104, 136) : clamp(sh * 1.55, 150, 230);
      zoom = ld / (0.95 * sh);
      loupe.style.setProperty('--ld', ld + 'px');
      xsvg.setAttribute('width', sw * zoom); xsvg.setAttribute('height', sh * zoom);
      // vista explodida. A tira é comprida e fina: cada camada vira uma faixa diagonal (giro ez no plano, inclinada ex para
      // trás) e a pilha cabe entre o título e a borda de baixo, à esquerda dos rótulos. No celular as camadas ficam retas,
      // com o rótulo em cima de cada uma
      const rad = Math.PI / 180, aspect = sh / sw;
      if (narrow) {
        ex = 40; ez = 0; ox = 0; es = 0.82;                  // a camada de cima chega mais perto (perspectiva): sobra margem dos lados
        const top = navH + vh * 0.2, bottom = vh * 0.94, step = (bottom - top) / 4;
        gap = step / Math.sin(ex * rad);
        ey = (top + bottom) / 2 + step * 0.12 - vh * 0.55;  // o lacre parado fica a 55% da tela; o rótulo vai em cima de cada camada
      } else {
        ex = 50; ez = -20;
        const top = navH + vh * 0.2, bottom = vh * 0.965;
        const hx = Math.cos(ez * rad) + aspect * Math.sin(-ez * rad);                       // largura da faixa na tela / (escala x largura)
        const vy = (Math.sin(-ez * rad) + aspect * Math.cos(ez * rad)) * Math.cos(ex * rad); // altura de uma faixa na tela / (escala x largura)
        const spanW = Math.min(vw * 0.62, vw - 2 * 48 - 360);                             // à direita ficam os rótulos (~360 px)
        es = Math.min(0.8, spanW / (sw * hx), (bottom - top - 3 * 90) / (sw * vy));
        const stepY = clamp((bottom - top - es * sw * vy) / 3, 90, 170);
        gap = stepY / Math.sin(ex * rad);
        ey = (top + bottom) / 2 - (navH + vh * 0.56);       // o lacre parado fica centrado em nav + 56% da tela
        const w = es * sw * hx;                             // a camada de cima, mais perto da câmera, sai ~10% maior
        ox = Math.max(48 + w * 0.1, vw - 400 - w) + w / 2 - vw / 2;                        // pilha encostada nos rótulos
      }
    }

    // entrada orquestrada
    if (!reduce) {
      section.classList.add('is-intro');
      setTimeout(() => section.classList.remove('is-intro'), 4200);
    }
    function ping() {
      const p = document.createElement('i'); p.className = 'nfc-ping';
      p.style.left = (NFC_PING[0] / SW * 100) + '%'; p.style.top = (NFC_PING[1] / SH * 100) + '%';
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
      tx = ox * k; ty = ey * k;
      const s = lerp(1, es, k) * (1 - 0.06 * settle);
      seal.style.transform = `translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,0) rotateX(${lerp(tiltX, ex, k).toFixed(2)}deg) rotateY(${lerp(tiltY, 0, k).toFixed(2)}deg) rotateZ(${(ez * k).toFixed(2)}deg) scale(${s.toFixed(4)})`;
      // (scale() não encolhe o eixo Z: o vão já é medido na tela, em layout)
      order.forEach((key, i) => { layers[key].style.transform = `translateZ(${((i - 1.5) * gap * k + i * 0.8).toFixed(1)}px)`; });

      // reflexo e holograma respondem à inclinação. Cada mudança repinta o lacre inteiro: parado, a cada dois quadros basta
      if (!quiet || quietTick % 2 === 0) {
        glare.style.setProperty('--gx', (50 + tiltY * 4).toFixed(1) + '%');
        glare.style.setProperty('--gy', (30 - tiltX * 5).toFixed(1) + '%');
        holoGrad.setAttribute('gradientTransform', `rotate(${(tiltY * 9 - tiltX * 6 + t * 6).toFixed(1)} ${HX} ${HY})`);
        holoShine.setAttribute('opacity', (0.35 + 0.3 * Math.abs(Math.sin(tiltY * 0.25 + t * 0.3))).toFixed(3));
      }

      // lupa de raio-x
      const lo = (1 - sstep(0.02, 0.08, p)) * (1 - k);
      loupe.style.setProperty('--lo', lo.toFixed(3));
      if (lo > 0.001) {
        const now = performance.now(), active = hover || dragging || now - lastInput < 2500;
        if (!active) { if (reduce) { tu = LU0; tv = LV0; } else { tu = 0.5 + 0.42 * Math.sin(t * 0.33); tv = 0.5 + 0.2 * Math.sin(t * 0.71); } }
        lu = damp(lu, tu, active ? 10 : 2.4, dt); lv = damp(lv, tv, active ? 10 : 2.4, dt);
        const sl = (vw - sw) / 2, x = clamp(lu * sw, ld / 2 + 6 - sl, vw - ld / 2 - 6 - sl), y = lv * sh;   // a lente nunca sai da tela
        loupe.style.setProperty('--lx', x.toFixed(1) + 'px'); loupe.style.setProperty('--ly', y.toFixed(1) + 'px');
        xsvg.style.transform = `translate(${(ld / 2 - x * zoom).toFixed(1)}px,${(ld / 2 - y * zoom).toFixed(1)}px)`;
      }

      // ondas de aproximação saindo do símbolo do celular (algumas vezes, e quando a lupa passa por ali)
      if (!reduce && p < 0.05) {
        nextPing -= dt;
        const nearNfc = Math.abs(lu - NFC_PING[0] / SW) < 0.05 && Math.abs(lv - NFC_PING[1] / SH) < 0.3;
        if (nextPing <= 0 && (pings < 3 || nearNfc)) { ping(); pings++; nextPing = nearNfc ? 1.2 : 2.6; }
      }

      // rótulos das camadas, presos às pontas projetadas de cada camada.
      // Só lê o layout quando algum rótulo aparece, e lê tudo antes de escrever (um reflow por quadro, não um por rótulo)
      const alphas = labels.map((li, i) => sstep(0.2 + i * 0.035, 0.3 + i * 0.035, p));
      const anyOn = alphas.some(a => a > 0.001);
      const stageR = anyOn && stage.getBoundingClientRect();
      const marks = labels.map((li, i) => alphas[i] > 0.001 ? markEls[i][narrow ? 1 : 0].getBoundingClientRect() : null);
      const widths = labels.map((li, i) => alphas[i] > 0.001 && !narrow ? li.offsetWidth : 0);
      labels.forEach((li, i) => {
        const a = alphas[i];
        li.style.opacity = a.toFixed(3);
        linePaths[i].style.opacity = narrow ? 0 : a.toFixed(3);
        if (a <= 0.001) return;
        const m = marks[i];
        if (narrow) {
          li.style.transform = `translate(${(m.left - stageR.left).toFixed(1)}px,${(m.top - stageR.top - 30).toFixed(1)}px) translateX(-50%)`;
        } else {
          const mx = m.left - stageR.left, my = m.top - stageR.top;
          const lx = Math.min(mx + 56, vw - stageR.left - widths[i] - 20), ly = my - 18 - (3 - i) * 6;
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
    let img3d = false, rendering = false;
    async function setImages() {
      if (img3d || rendering) return;
      rendering = true;
      let ok = null, bad = null;
      try { if (window.VeriSeal3D) ({ ok, bad } = (await window.VeriSeal3D.bottleShots()).game); } catch (e) { ok = null; }
      rendering = false;
      if (ok && bad) img3d = true;
      else if (hasImg) return;   // o desenho em SVG já está lá
      else { ok = fallback(false); bad = fallback(true); }
      btns.forEach(b => { $('.gb-a', b).src = ok; $('.gb-b', b).src = bad; });
      hasImg = true;
    }
    // as fotos 3D só são geradas quando o jogo se aproxima da tela (evita travar o carregamento);
    // se a cena 3D ficar pronta depois do desenho em SVG, as fotos substituem o desenho
    let near = false, ready3d = false;
    const tryImages = () => { if (near && ready3d && !img3d) setImages(); };
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
    const HL = ['NFC', 'proteger', 'saúde', 'reputação'];   // palavras destacadas com o degradê, além de "da marca"
    text.innerHTML = '<span class="sr-only">' + full + '</span>' + words.map((w, i) => '<span class="iw' + (i >= words.length - 2 || HL.includes(w.replace(/[.,]/g, '')) ? ' hl' : '') + '" aria-hidden="true" style="--i:' + i + '">' + w + '</span>').join(' ');
    sub.style.setProperty('--sd', (words.length * 0.085 + 0.5).toFixed(2) + 's');
    new IntersectionObserver((es, o) => es.forEach(e => { if (e.isIntersecting) { sec.classList.add('is-on'); o.disconnect(); } }), { threshold: 0.4 }).observe(sec);
  })();

  /* ============================================================
     6 · COMO FUNCIONA — demonstração que roda sozinha quando aparece; etapas clicáveis, pausa e modo adulterado.
     Não existe app: o celular lê o lacre, o sistema mostra uma notificação e ela abre a página de verificação no
     navegador, já com o resultado (o traço contorna o círculo, a cor surge dentro dele e o símbolo se desenha).
     A garrafa é a cena 3D real (main.js lê window.VeriSeal.how para girar o lacre e romper a tampa).
     ============================================================ */
  const howState = { step: 0, bad: false };
  const how = (() => {
    const scene = $('#howScene'), steps = $$('#steps li'), stepBtns = $$('#steps button');
    const resOk = $('.wb-ok', scene), resBad = $('.wb-bad', scene);
    const seg = $('#como-funciona .seg'), segBtns = $$('button', seg), playBtn = $('#howPlay');
    const DUR = [1.8, 1.3, 3.6];   // aproxima e chega a notificação, toque nela, a página abre no resultado
    let local = 0, playing = !reduce, inView = false, started = false;
    function render() {
      const st = howState.step;
      ['st-0', 'st-1', 'st-2'].forEach((c, i) => scene.classList.toggle(c, started && st === i));
      steps.forEach((li, i) => {
        li.classList.toggle('is-on', i === st); li.classList.toggle('is-done', i < st);
        li.style.setProperty('--sp', i < st ? 1 : i === st ? clamp(local, 0, 1).toFixed(3) : 0);
        stepBtns[i].setAttribute('aria-current', i === st ? 'step' : 'false');
      });
      scene.classList.toggle('ph-detect', started && ((st === 0 && local > 0.62) || st === 1));
      scene.classList.toggle('ph-tapped', started && st === 1 && local > 0.4);
      scene.classList.toggle('ph-open', started && st === 2);
      resOk.classList.toggle('is-on', st === 2 && !howState.bad); resBad.classList.toggle('is-on', st === 2 && howState.bad);
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
    // o relógio do celular mostra a hora de quem está vendo o site (no formato de 12 ou 24 h do aparelho, sem AM/PM, como
    // na barra de status), e a saudação acompanha a hora. Atualiza na virada de cada minuto
    const clocks = $$('.ph-time', scene), greet = $('.ph-greet', scene);
    const h12 = /h1[12]/.test(new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle || '');
    function tickClock() {
      const d = new Date(), h = d.getHours(), hh = h12 ? (h % 12 || 12) : h;
      const t = `${hh}:${String(d.getMinutes()).padStart(2, '0')}`;
      clocks.forEach(el => { if (el.textContent !== t) el.textContent = t; });
      if (greet) greet.textContent = h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite';
      setTimeout(tickClock, 60000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 50);
    }
    tickClock();
    let shots = false, shots3d = false, shooting = false;
    const takeShots = async () => {
      if (shots3d || shooting) return;
      shooting = true;
      let ok = null, bad = null;
      try { if (window.VeriSeal3D) ({ ok, bad } = (await window.VeriSeal3D.bottleShots()).how); } catch (e) { ok = null; }
      shooting = false;
      if (ok && bad) shots3d = true;
      else if (shots) return;
      else { ok = game.fallback(false); bad = game.fallback(true); }
      shots = true;
      $$('.wb-bottle', scene).forEach(img => { img.src = img.classList.contains('bad') ? bad : ok; });
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
    let mx = 0, my = 0, rx = 8, ry = -24, last = '';
    if (fine) box.parentElement.addEventListener('pointermove', e => { const r = box.getBoundingClientRect(); mx = clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1); my = clamp((e.clientY - r.top) / r.height * 2 - 1, -1, 1); });
    function update(y, dt) {
      const b = at['#storyMark'], p = clamp((y + vh - b.top) / (vh + b.bottom - b.top), 0, 1);
      const try_ = reduce ? -14 : lerp(-34, 30, p) + mx * 12, trx = reduce ? 6 : lerp(14, -8, p) + my * -8;
      ry = damp(ry, try_, 5, dt); rx = damp(rx, trx, 5, dt);
      const tf = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      if (tf !== last) { rig.style.transform = tf; last = tf; }
    }
    return { update };
  })();

  /* ============================================================
     10 · CHAMADA — lacre 3D flutuante que gira com a rolagem e o ponteiro
     ============================================================ */
  const ctaSeal = (() => {
    const box = $('#ctaSeal');
    $('.cs-front', box).innerHTML = printSVG('cs');
    $('.cs-back', box).innerHTML = adhesiveSVG('csb');
    const rig = $('.cs-rig', box), shadow = $('.cs-shadow', box);
    let mx = 0, my = 0, ry = -24, rx = 16, last = '';
    if (fine) $('#contato').addEventListener('pointermove', e => { mx = (e.clientX / vw) * 2 - 1; my = (e.clientY / vh) * 2 - 1; });
    function update(y, dt, t) {
      const b = at['#ctaSeal'], p = clamp((y + vh - b.top) / (vh + b.bottom - b.top), 0, 1);
      // a tira é comprida: giros menores, para as pontas não subirem até o título
      const try_ = reduce ? -10 : lerp(-26, 16, p) + mx * 10 + Math.sin(t * 0.6) * 2.5;
      const trx = reduce ? 12 : lerp(24, 6, p) - my * 8 + Math.sin(t * 0.8) * 2;
      ry = damp(ry, try_, 4, dt); rx = damp(rx, trx, 4, dt);
      const tf = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotateZ(-4deg)`;
      if (tf === last) return;
      last = tf; rig.style.transform = tf;
      shadow.style.transform = `scaleX(${(0.8 + 0.2 * Math.cos(ry * Math.PI / 180)).toFixed(3)})`;
    }
    return { update };
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
    const L = at['#lacre'], heroEnd = L.bottom - L.top - vh * 0.5;
    const tr = frameSeq, inTrack = y + vh > tr.top && y < tr.top + tr.h;
    const nearForm = y + vh > at['#contato'].top + 120;
    const hs = at['#howScene'], overDemo = hs.top < y + vh && hs.bottom > y;   // não cobrir o celular da demonstração
    mcta.classList.toggle('is-on', y > heroEnd && !inTrack && !nearForm && !overDemo);
  }
  const inView = (k, y) => y + vh > at[k].top && y < at[k].bottom;

  /* ============================================================
     laço principal
     ============================================================ */
  let lastT = performance.now(), lastY = -1, lastInput = 0, skipNext = false, quiet = false, quietTick = 0;
  ['pointermove', 'pointerdown', 'wheel', 'touchmove', 'keydown'].forEach(ev => addEventListener(ev, () => { lastInput = performance.now(); }, { passive: true }));
  function tick(now) {
    const y = scrollY;
    if (y !== lastY) { lastY = y; lastInput = now; }
    // calmo (sem rolar nem mexer há 1 s): o que ainda anda sozinho (flutuação, hologramas, demonstração) anda a 30 quadros
    // por segundo, que para esses movimentos lentos não muda nada na tela e corta o trabalho pela metade.
    // O hero fica a 60: a lupa passeia sozinha e precisa de movimento contínuo (lá só o holograma vai a 30)
    quiet = now - lastInput > 1000;
    if (quiet) quietTick++;
    if (quiet && !seqs[0].vis) { skipNext = !skipNext; if (skipNext) { requestAnimationFrame(tick); return; } } else skipNext = false;
    const dt = clamp((now - lastT) / 1000, 0.001, 0.05); lastT = now;
    const t = now / 1000;
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
    if (inView('#identidade', y)) passport.update(dt, t);
    if (inView('#historia', y)) story.update(y, dt);
    if (inView('#contato', y)) ctaSeal.update(y, dt, t);
    requestAnimationFrame(tick);
  }

  // as posições ficam em cache; são medidas de novo quando algo muda de tamanho (janela, fontes, troca de abas…)
  let remeasureQueued = false;
  function remeasure() {
    if (remeasureQueued) return;
    remeasureQueued = true;
    requestAnimationFrame(() => { remeasureQueued = false; measure(); });
  }
  addEventListener('resize', remeasure);
  addEventListener('load', remeasure);
  document.fonts?.ready.then(remeasure);
  narrowMQ.addEventListener?.('change', remeasure);
  if ('ResizeObserver' in window) new ResizeObserver(remeasure).observe(document.body);
  measure();

  // #p=0.86 leva direto a um ponto da animação do quadro (útil para revisar a cena)
  const forcedP = /[#&]p=([\d.]+)/.exec(location.hash);
  if (forcedP) addEventListener('load', () => { measure(); scrollTo({ top: frameSeq.top + clamp(+forcedP[1], 0, 1) * frameSeq.len, behavior: 'auto' }); });

  requestAnimationFrame(tick);
  window.VeriSeal = Object.assign(window.VeriSeal || {}, { frameProgress: () => Math.max(0, frameSeq.p), measure, how: howState });
})();
