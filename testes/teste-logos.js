/* Teste do encaixe automático das logos (10/11/2026): corta a margem vazia, usa a cor de fundo da logo (selo preto fica
   num quadrado preto), fundo azul-marinho para logo branca sobre transparente e mesma margem para todas. Só imagens inventadas. */
const H = require('./harness');
const { ok, fim } = H.placar('logos');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed();
  await H.preparar(page, d); await page.goto(H.BASE); await page.waitForSelector('#lg-email', { timeout: 8000 });
  const r = await page.evaluate(async () => {
    const mk = (w, h, f) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); f(x, w, h); return c.toDataURL('image/png'); };
    const caixa = async url => { const img = new Image(); await new Promise(ok => { img.onload = ok; img.src = url; }); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0); const px = x.getImageData(0, 0, c.width, c.height).data, f = [px[0], px[1], px[2]];
      let x0 = c.width, x1 = -1; for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) { const k = (j * c.width + i) * 4; if (Math.abs(px[k] - f[0]) + Math.abs(px[k + 1] - f[1]) + Math.abs(px[k + 2] - f[2]) > 60) { if (i < x0) x0 = i; if (i > x1) x1 = i; } }
      return { lado: c.width, larg: x1 - x0 + 1 }; };
    const out = {};
    const casos = {
      letreiro: mk(400, 300, (x, w, h) => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.font = 'bold 60px sans-serif'; x.fillStyle = '#C8102E'; x.fillText('Cola', 90, 170); x.fillStyle = '#222'; x.fillText('fix', 222, 170); }),
      selo: mk(300, 300, (x, w, h) => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.fillStyle = '#111'; x.fillRect(40, 120, 220, 60); x.font = 'bold 34px sans-serif'; x.fillStyle = '#fff'; x.fillText('NEXUS', 95, 163); }),
      branca: mk(300, 200, x => { x.font = 'bold 50px sans-serif'; x.fillStyle = '#fff'; x.fillText('ALFA', 80, 120); })
    };
    for (const [k, url] of Object.entries(casos)) { const o = await CW.logos.organizar(url); out[k] = Object.assign({ fundo: o.fundo, escuro: o.escuro }, await caixa(o.url)); }
    return out;
  });
  ok('G1 letreiro com margem branca: fundo branco e o nome ocupa a largura (margem cortada)', r.letreiro.fundo === 'rgb(255,255,255)' && r.letreiro.lado === 160 && r.letreiro.larg >= 120, JSON.stringify(r.letreiro));
  ok('G2 selo preto dentro de margem branca: o quadradinho todo fica preto, sem moldura branca', r.selo.fundo === 'rgb(17,17,17)' && r.selo.escuro, JSON.stringify(r.selo));
  ok('G3 logo branca sobre transparente: fundo azul-marinho para aparecer', r.branca.fundo === '#0B1A45' && r.branca.escuro, JSON.stringify(r.branca));
  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
