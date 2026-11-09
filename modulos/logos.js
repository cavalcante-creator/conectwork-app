/* Conectwork · logo de cada empresa (logos/{empresaId}). Não é módulo de menu.
   O administrador envia em Minha empresa; a imagem é reduzida no aparelho (até 256 px) e guardada como PNG/JPEG.
   Em todo o app, os avatares com data-logo="<empresaId>" trocam as iniciais pela logo, se a empresa tiver uma.
   Encaixe automático (10/11/2026): antes de mostrar, organizar() corta as bordas vazias (transparentes ou da cor do
   fundo), usa a cor de fundo da própria logo no quadradinho (logo com fundo preto fica num quadrado preto, sem moldura
   branca), põe um fundo azul-marinho quando a logo é clara sobre transparente e deixa a mesma margem em todas.
   Vale para as logos já guardadas: nada muda no banco. */
(function () {
  const CW = window.CW = window.CW || {};
  const cache = {};   /* empresaId -> Promise<dataURL|''> */
  const prontas = {}; /* dataURL original -> Promise<{ url, fundo }> */
  function buscar(id) {
    if (!id) return Promise.resolve('');
    if (!cache[id]) cache[id] = (CW.fb && CW.fb.db ? CW.fb.db().doc('logos/' + id).get().then(s => ((CW.fb.dados(s) || {}).d || '')) : Promise.resolve('')).catch(() => '');
    return cache[id];
  }

  const LADO = 160;   /* tamanho do quadradinho gerado (fica nítido até em avatares grandes) */
  const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  /* analisa a imagem: cor de fundo (pelas bordas), caixa do desenho e se o desenho é claro */
  function analisar(img) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;   /* aceita imagem ou canvas */
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
    const px = x.getImageData(0, 0, w, h).data, at = (i, j) => (j * w + i) * 4;
    /* bordas: transparentes ou de uma cor só? */
    let n = 0, transp = 0, r = 0, g = 0, b = 0;
    const borda = [];
    for (let i = 0; i < w; i++) { borda.push([i, 0], [i, h - 1]); }
    for (let j = 0; j < h; j++) { borda.push([0, j], [w - 1, j]); }
    borda.forEach(([i, j]) => { const k = at(i, j); n++; if (px[k + 3] < 40) { transp++; return; } r += px[k]; g += px[k + 1]; b += px[k + 2]; });
    const opacas = n - transp, fundo = transp > n * 0.5 || !opacas ? null : [r / opacas, g / opacas, b / opacas].map(Math.round);
    let unif = 0;
    if (fundo) borda.forEach(([i, j]) => { const k = at(i, j); if (px[k + 3] >= 40 && Math.abs(px[k] - fundo[0]) + Math.abs(px[k + 1] - fundo[1]) + Math.abs(px[k + 2] - fundo[2]) < 60) unif++; });
    let fundoOk = null;
    if (fundo && unif > opacas * 0.8) {   /* média só dos pixels parecidos (sem o borrado das letras que encostam na borda) */
      let rr = 0, gg = 0, bb = 0, q = 0;
      borda.forEach(([i, j]) => { const k = at(i, j); if (px[k + 3] >= 40 && Math.abs(px[k] - fundo[0]) + Math.abs(px[k + 1] - fundo[1]) + Math.abs(px[k + 2] - fundo[2]) < 60) { rr += px[k]; gg += px[k + 1]; bb += px[k + 2]; q++; } });
      fundoOk = [rr / q, gg / q, bb / q].map(Math.round);
    }
    /* caixa do desenho: o que não é transparente e não é da cor do fundo */
    let x0 = w, y0 = h, x1 = -1, y1 = -1, soma = 0, qt = 0;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = at(i, j); if (px[k + 3] < 40) continue;
      if (fundoOk && Math.abs(px[k] - fundoOk[0]) + Math.abs(px[k + 1] - fundoOk[1]) + Math.abs(px[k + 2] - fundoOk[2]) < 60) continue;
      if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j;
      soma += lum(px[k], px[k + 1], px[k + 2]); qt++;
    }
    if (x1 < 0) return { w, h, caixa: [0, 0, w, h], fundo: fundoOk, claro: false };
    return { w, h, caixa: [x0, y0, x1 - x0 + 1, y1 - y0 + 1], fundo: fundoOk, claro: soma / qt > 0.82 };
  }
  /* monta o quadradinho: fundo da logo, desenho centralizado com margem igual para todas */
  function organizar(url) {
    if (!url) return Promise.resolve(null);
    if (prontas[url]) return prontas[url];
    prontas[url] = new Promise(ok => {
      const img = new Image();
      img.onload = () => {
        try {
          let a = analisar(img), fonte = img;
          /* selo: depois de cortar a margem, a borda do desenho é de uma cor só (ex.: retângulo preto com o nome
             em branco dentro de uma margem branca): o quadradinho todo fica na cor do selo */
          const [bx, by, bw, bh] = a.caixa;
          if (bw < a.w || bh < a.h) {
            const cc = document.createElement('canvas'); cc.width = bw; cc.height = bh; cc.getContext('2d').drawImage(img, bx, by, bw, bh, 0, 0, bw, bh);
            const b2 = analisar(cc);
            const longe = (p, q) => !p || !q || Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) > 90;
            if (b2.fundo && longe(b2.fundo, a.fundo) && b2.caixa[2] * b2.caixa[3] < bw * bh * 0.9) { a = b2; fonte = cc; }
          }
          const [cx, cy, cw, ch] = a.caixa;
          const fundo = a.fundo ? `rgb(${a.fundo.join(',')})` : a.claro ? '#0B1A45' : '#FFFFFF';
          const c = document.createElement('canvas'); c.width = c.height = LADO; const x = c.getContext('2d');
          x.fillStyle = fundo; x.fillRect(0, 0, LADO, LADO);
          /* margem: 14% nas logos quadradas, 8% nas compridas (letreiro), para o nome não ficar minúsculo */
          const prop = cw / ch, mg = prop > 2.2 ? 0.08 : prop > 1.4 ? 0.11 : 0.14, util = LADO * (1 - mg * 2);
          const k = Math.min(util / cw, util / ch), dw = cw * k, dh = ch * k;
          x.imageSmoothingQuality = 'high';
          x.drawImage(fonte, cx, cy, cw, ch, (LADO - dw) / 2, (LADO - dh) / 2, dw, dh);
          ok({ url: c.toDataURL('image/png'), fundo, escuro: lum(...(a.fundo || (a.claro ? [11, 26, 69] : [255, 255, 255]))) < 0.5 });
        } catch (e) { ok({ url, fundo: '#FFFFFF', escuro: false }); }   /* imagem que não dá para ler: mostra como veio */
      };
      img.onerror = () => ok(null);
      img.src = url;
    });
    return prontas[url];
  }
  function aplicar(el, url) {
    if (!url || el.dataset.logoOk === url.length + '') return;
    el.dataset.logoOk = url.length + '';
    organizar(url).then(o => {
      if (!o) return;
      el.classList.add('com-logo'); el.classList.toggle('logo-escura', !!o.escuro); el.style.background = o.fundo;
      el.innerHTML = ''; const img = document.createElement('img'); img.src = o.url; img.alt = ''; el.appendChild(img);
    });
  }
  function preencher(raiz) {
    (raiz || document).querySelectorAll('[data-logo]').forEach(el => { if (el.dataset.logoOk) return; buscar(el.dataset.logo).then(u => aplicar(el, u)); });
  }
  function limpar(id) { delete cache[id]; document.querySelectorAll(`[data-logo="${id}"]`).forEach(el => { delete el.dataset.logoOk; }); }
  const obs = new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches && n.matches('[data-logo]')) preencher(n.parentNode); else if (n.querySelector && n.querySelector('[data-logo]')) preencher(n); } });
  const ligar = () => { obs.observe(document.body, { childList: true, subtree: true }); preencher(document); };
  if (document.body) ligar(); else document.addEventListener('DOMContentLoaded', ligar);

  /* reduz a imagem escolhida para no máximo `lado` px e devolve um dataURL (PNG mantém o fundo transparente) */
  function reduzir(arquivo, lado) {
    lado = lado || 256;
    return new Promise((ok, erro) => {
      if (!/^image\/(png|jpeg|webp)$/.test(arquivo.type)) return erro(new Error('Envie a logo em PNG, JPG ou WEBP.'));
      if (arquivo.size > 8 * 1024 * 1024) return erro(new Error('A imagem passa de 8 MB. Escolha uma menor.'));
      const url = URL.createObjectURL(arquivo), img = new Image();
      img.onload = () => {
        const k = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
        const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url);
        let d = c.toDataURL('image/png'); if (d.length > 150000) d = c.toDataURL('image/jpeg', 0.88);
        if (d.length > 190000) return erro(new Error('A logo ficou grande demais. Tente uma imagem mais simples.'));
        ok(d);
      };
      img.onerror = () => { URL.revokeObjectURL(url); erro(new Error('Não foi possível abrir a imagem.')); };
      img.src = url;
    });
  }
  CW.logos = { buscar, preencher, limpar, reduzir, organizar };
})();
