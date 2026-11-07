/* Conectwork · componentes de tela e utilidades: ícones, aviso rápido (toast), diálogo, painel lateral,
   máscaras, validações (CNPJ, CPF, e-mail, celular, data) e formatação (dinheiro, data).
   Tudo fica em window.CW.ui. Não depende do Firebase, então pode ser testado sozinho. */
(function () {
  const CW = window.CW = window.CW || {};

  /* ---------- básicos ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const dig = v => String(v == null ? '' : v).replace(/\D/g, '');

  /* ---------- ícones e marca (mesmo desenho do protótipo) ---------- */
  const I = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    wallet: '<path d="M4 7h15a1 1 0 0 1 1 1v11H5a1 1 0 0 1-1-1z"/><path d="M4 7l11-3v3"/><circle cx="16" cy="13.5" r="1.2"/>',
    inbox: '<path d="M4 13 6.5 5h11L20 13v6H4z"/><path d="M4 13h4.5l1.5 2.5h4l1.5-2.5H20"/>',
    plug: '<path d="M9 3v5M15 3v5"/><path d="M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v4"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6 6 0 0 1 3.5 5.5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r=".8"/><circle cx="3.5" cy="12" r=".8"/><circle cx="3.5" cy="18" r=".8"/>',
    logout: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h11"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="M5 12.5 10 17 19 7"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    file: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h4"/>',
    bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
    shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    hand: '<path d="M7 11 10 8l3 1 4-3 4 4-5 5"/><path d="M3 12l4-1 6 6a1.5 1.5 0 0 1-2 2l-5-4H3"/>',
    net: '<circle cx="12" cy="5" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><circle cx="12" cy="12" r="2"/><path d="M12 7v3M10.5 13.5 6.5 16.5M13.5 13.5l4 3"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>', alert: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17v.5"/>',
    send: '<path d="M21 3 10 14"/><path d="M21 3 14 21l-4-7-7-4z"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
    bank: '<path d="M3 10 12 4l9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.1 4M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>', chev: '<path d="m9 6 6 6-6 6"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    building: '<path d="M4 21V5l8-2v18M12 21V9l8 2v10"/><path d="M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2M2 21h20"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
    more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.8v.5M12 16.6v.4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'
  };
  const ic = (n, c) => `<svg class="i ${c || ''}" viewBox="0 0 24 24" aria-hidden="true">${I[n] || I.grid}</svg>`;
  const LOGO = (w = 34) => `<svg width="${w}" height="${Math.round(w * .76)}" viewBox="0 0 34 26" aria-hidden="true"><defs><linearGradient id="lg${w}" x1="0" x2="1"><stop offset="0" stop-color="#1452D4"/><stop offset=".55" stop-color="#1E74F0"/><stop offset="1" stop-color="#18C5F0"/></linearGradient></defs><path d="M12 3 4 13l8 10" fill="none" stroke="url(#lg${w})" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 10l5 11 5-9 4 8 6-15" fill="none" stroke="url(#lg${w})" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const CURVES = `<svg class="curves" viewBox="0 0 400 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g fill="none" stroke="#2F6BEA" stroke-opacity=".25" stroke-width="1"><path d="M-40 420C80 380 160 300 220 200S380 40 460 20"/><path d="M-40 470C90 430 180 350 240 250S390 90 470 70"/><path d="M-40 520C100 480 200 400 260 300S400 140 480 120"/><circle cx="420" cy="580" r="160"/><circle cx="420" cy="580" r="230"/></g></svg>`;
  const GRADS = ['linear-gradient(135deg,#1452D4,#18C5F0)', 'linear-gradient(135deg,#0D2152,#2F7BFF)', 'linear-gradient(135deg,#0E7FA8,#18C5F0)', 'linear-gradient(135deg,#3B3FD8,#2F7BFF)', 'linear-gradient(135deg,#0A5E8E,#1763E6)'];
  const iniciais = n => String(n || '?').replace(/\b(MEI|Ltda|S\.?A\.?)\b/gi, '').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
  const avatar = (nome, cls) => { let h = 0; for (const ch of String(nome || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return `<span class="avatar ${cls || ''}" style="background:${GRADS[h % GRADS.length]}" aria-hidden="true">${esc(iniciais(nome))}</span>`; };

  /* ---------- aviso rápido ---------- */
  function toast(msg, tipo) {
    const t = $('#toast'); if (!t) return;
    t.className = 'toast' + (tipo === 'erro' ? ' erro' : '');
    t.innerHTML = ic(tipo === 'erro' ? 'alert' : 'check') + '<span>' + esc(msg) + '</span>';
    t.classList.add('show'); clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), tipo === 'erro' ? 5000 : 2800);
  }

  /* ---------- diálogo e painel lateral ----------
     dialogo({ titulo, sub, corpo (HTML), botoes: [{ texto, valor, classe }], lateral, aoAbrir(el) }) → Promise com o valor do botão
     (ou null se fechou no X / Esc). Botão sem valor só fecha. */
  function dialogo(op) {
    op = op || {};
    return new Promise(resolve => {
      const d = document.createElement('dialog');
      if (op.lateral) d.classList.add('drawer');
      const botoes = op.botoes || [{ texto: 'Fechar', valor: null, classe: 'sec' }];
      d.innerHTML = `<div class="dlg-in"><div class="dlg-h"><div><h2>${esc(op.titulo || '')}</h2>${op.sub ? `<p class="sub">${esc(op.sub)}</p>` : ''}</div>
        <button class="x" data-dlg-x aria-label="Fechar">${ic('x')}</button></div>
        <div class="dlg-b">${op.corpo || ''}</div>
        ${botoes.length ? `<div class="dlg-f">${botoes.map((b, i) => `<button class="btn ${b.classe || ''}" data-dlg-b="${i}">${b.icone ? ic(b.icone) : ''}${esc(b.texto)}</button>`).join('')}</div>` : ''}</div>`;
      let valor = null;
      d.addEventListener('close', () => { d.remove(); resolve(valor); });
      d.addEventListener('click', e => {
        if (e.target === d && op.lateral) d.close();                       /* clique fora fecha o painel lateral */
        if (e.target.closest('[data-dlg-x]')) d.close();
        const b = e.target.closest('[data-dlg-b]'); if (!b) return;
        const def = botoes[+b.dataset.dlgB];
        if (def.antes && def.antes(d) === false) return;                   /* validação antes de fechar */
        valor = def.valor === undefined ? null : def.valor; d.close();
      });
      document.body.appendChild(d); d.showModal();
      if (op.aoAbrir) op.aoAbrir(d);
    });
  }
  const confirmar = (titulo, texto, sim) => dialogo({ titulo, corpo: `<p style="margin:0">${esc(texto)}</p>`,
    botoes: [{ texto: 'Voltar', valor: false, classe: 'sec' }, { texto: sim || 'Confirmar', valor: true }] }).then(v => v === true);
  const painelLateral = op => dialogo(Object.assign({}, op, { lateral: true }));

  /* ---------- máscaras ---------- */
  const mascara = {
    cnpj: v => dig(v).slice(0, 14).replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2'),
    cpf: v => dig(v).slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'),
    cep: v => dig(v).slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2'),
    celular: v => { const d = dig(v).slice(0, 11); return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4,5})(\d{4})$/, '$1-$2'); },
    data: v => dig(v).slice(0, 8).replace(/^(\d{2})(\d)/, '$1/$2').replace(/^(\d{2})\/(\d{2})(\d)/, '$1/$2/$3'),
    /* dinheiro: digita só números, a vírgula anda sozinha (ex.: 123456 → 1.234,56) */
    dinheiro: v => { const d = dig(v).replace(/^0+(?=\d)/, '').slice(0, 13); if (!d) return ''; return formatarDinheiro(Number(d), false); }
  };
  /* liga a máscara em todo input com data-mascara="cnpj|cpf|cep|celular|data|dinheiro" dentro de el */
  function aplicarMascaras(el) {
    $$('input[data-mascara]', el).forEach(inp => {
      if (inp._mascara) return; inp._mascara = true;
      const f = mascara[inp.dataset.mascara]; if (!f) return;
      if (!inp.inputMode) inp.inputMode = 'numeric';
      inp.addEventListener('input', () => { inp.value = f(inp.value); });
      if (inp.value) inp.value = f(inp.value);
    });
  }

  /* ---------- validações ---------- */
  function validarCNPJ(v) {
    const c = dig(v); if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
    const calc = n => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += +c[i] * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
    return calc(12) === +c[12] && calc(13) === +c[13];
  }
  function validarCPF(v) {
    const c = dig(v); if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
    const calc = n => { let s = 0; for (let i = 0; i < n; i++) s += +c[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return calc(9) === +c[9] && calc(10) === +c[10];
  }
  const validarEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim()) && !/\.\./.test(String(v));
  /* DDDs em uso no Brasil (Anatel) */
  const DDDS = [11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,41,42,43,44,45,46,47,48,49,51,53,54,55,61,62,63,64,65,66,67,68,69,71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99];
  /* celular com DDD: 11 dígitos, DDD existente e começando com 9 */
  function validarCelular(v) { const d = dig(v); return d.length === 11 && DDDS.includes(+d.slice(0, 2)) && d[2] === '9'; }
  /* data em dd/mm/aaaa ou aaaa-mm-dd; confere se o dia existe (31/02 não passa) */
  function lerData(v) {
    const s = String(v || '').trim(); let d, m, a, x;
    if ((x = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s))) { d = +x[1]; m = +x[2]; a = +x[3]; }
    else if ((x = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) { a = +x[1]; m = +x[2]; d = +x[3]; }
    else return null;
    if (a < 1900 || a > 2100) return null;
    const dt = new Date(a, m - 1, d);
    return dt.getFullYear() === a && dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
  }
  const validarData = v => !!lerData(v);
  const dataISO = v => { const d = lerData(v); return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : ''; };

  /* ---------- dinheiro (sempre em centavos inteiros, como no modelo de dados) ---------- */
  function formatarDinheiro(centavos, comSimbolo) {
    const n = Math.round(Number(centavos) || 0), neg = n < 0, a = Math.abs(n);
    const s = Math.floor(a / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + String(a % 100).padStart(2, '0');
    return (neg ? '-' : '') + (comSimbolo === false ? '' : 'R$ ') + s;
  }
  /* "R$ 1.234,56" → 123456; aceita "1234,5", "1.234", "10". Texto inválido → null */
  function lerDinheiro(v) {
    const s = String(v == null ? '' : v).replace(/R\$\s?/i, '').replace(/\s/g, '').trim();
    if (!s || !/^-?[\d.]*(,\d{0,2})?$/.test(s) || !/\d/.test(s)) return null;
    const [int, dec] = s.replace(/\./g, '').split(',');
    const neg = int.startsWith('-'); const i = Number(int.replace('-', '') || 0), c = Number((dec || '').padEnd(2, '0'));
    return (neg ? -1 : 1) * (i * 100 + c);
  }

  /* ---------- datas ---------- */
  const paraDate = v => { if (!v) return null; if (v instanceof Date) return v; if (typeof v.toDate === 'function') return v.toDate();
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return lerData(v); const d = new Date(v); return isNaN(d) ? null : d; };
  const p2 = n => String(n).padStart(2, '0');
  const formatarData = v => { const d = paraDate(v); return d ? `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}` : ''; };
  const formatarDataHora = v => { const d = paraDate(v); return d ? `${formatarData(d)} ${p2(d.getHours())}:${p2(d.getMinutes())}` : ''; };

  /* ---------- tema claro / escuro ---------- */
  function tema() { return document.documentElement.dataset.theme || 'auto'; }
  function trocarTema() {
    const ord = ['auto', 'light', 'dark'], prox = ord[(ord.indexOf(tema()) + 1) % 3];
    if (prox === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = prox;
    try { if (prox === 'auto') localStorage.removeItem('cw.tema'); else localStorage.setItem('cw.tema', prox); } catch (e) { /* sem armazenamento: vale só nesta visita */ }
    return prox;
  }

  /* símbolos dos provedores de login (padrão de cada um para o botão "Entrar com…") */
  const MARCA = {
    google: '<svg class="mk" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"/></svg>',
    microsoft: '<svg class="mk" viewBox="0 0 24 24" aria-hidden="true"><path fill="#F25022" d="M1 1h10.5v10.5H1z"/><path fill="#7FBA00" d="M12.5 1H23v10.5H12.5z"/><path fill="#00A4EF" d="M1 12.5h10.5V23H1z"/><path fill="#FFB900" d="M12.5 12.5H23V23H12.5z"/></svg>'
  };

  CW.ui = { MARCA, esc, $, $$, dig, ic, LOGO, CURVES, avatar, iniciais, toast, dialogo, confirmar, painelLateral,
    mascara, aplicarMascaras, validarCNPJ, validarCPF, validarEmail, validarCelular, validarData, lerData, dataISO,
    formatarDinheiro, lerDinheiro, formatarData, formatarDataHora, tema, trocarTema };
})();
