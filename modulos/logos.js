/* Conectwork · logo de cada empresa (logos/{empresaId}). Não é módulo de menu.
   O administrador envia em Minha empresa; a imagem é reduzida no aparelho (até 256 px) e guardada como PNG/JPEG.
   Em todo o app, os avatares com data-logo="<empresaId>" trocam as iniciais pela logo, se a empresa tiver uma. */
(function () {
  const CW = window.CW = window.CW || {};
  const cache = {};   /* empresaId -> Promise<dataURL|''> */
  function buscar(id) {
    if (!id) return Promise.resolve('');
    if (!cache[id]) cache[id] = (CW.fb && CW.fb.db ? CW.fb.db().doc('logos/' + id).get().then(s => ((CW.fb.dados(s) || {}).d || '')) : Promise.resolve('')).catch(() => '');
    return cache[id];
  }
  function aplicar(el, url) {
    if (!url || el.dataset.logoOk === url.length + '') return;
    el.dataset.logoOk = url.length + '';
    el.classList.add('com-logo'); el.style.background = '#fff';
    el.innerHTML = ''; const img = document.createElement('img'); img.src = url; img.alt = ''; el.appendChild(img);
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
  CW.logos = { buscar, preencher, limpar, reduzir };
})();
