/* Atalhos do MEI (13/11/2026): "cartão CNPJ" já copia o CNPJ e o Assistente fica num botão redondo no canto de baixo, à direita. Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('meiatalhos');
(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    d.users['carl@carl.com.br'] = { uid: 'uCARL', pass: 'senha123' }; d.docs['usuarios/uCARL'] = { nome: 'Carlos Ramos', email: 'carl@carl.com.br' };
    d.docs['acessos/meic_uCARL'] = { uid: 'uCARL', empresaId: 'meic', nome: 'Carlos Ramos', email: 'carl@carl.com.br', cargo: 'admin', extras: [], sem: [], ativo: true };
    d.docs['empresas/meic'] = { nome: 'Carlos Ramos', razao: 'Carlos Ramos 33000167000101', cnpj: '33.000.167/0001-01', status: 'mei', tipo: 'prestador', modulos: [], criadoPor: 'uCARL' };
    d.docs['empresas/meic/privado/cadastro'] = { dados: { porte: 'MEI' } };
  });
  await H.preparar(page, d); await page.goto(H.BASE); await H.entrar(page, 'carl@carl.com.br', 'senha123');
  await page.waitForSelector('#mh-cartao', { timeout: 10000 }); await H.dorme(600);
  await page.evaluate(() => { window.__cp = null; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__cp = t; return Promise.resolve(); } } }); });
  const [pop] = await Promise.all([page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null), page.click('#mh-cartao')]); await H.dorme(400);
  if (pop) await pop.close().catch(() => {});
  const cp = await page.evaluate(() => window.__cp); const t1 = await page.evaluate(() => document.getElementById('toast').innerText);
  ok('A1 "cartão CNPJ" copia o CNPJ (só números) e avisa que é só colar', cp === '33000167000101' && /CNPJ copiado/.test(t1), JSON.stringify({ cp, t1 }));
  const fab = await page.evaluate(() => { const b = document.getElementById('mei-assist'); if (!b) return null; const r = b.getBoundingClientRect(); return { vis: !b.hidden, direita: innerWidth - r.right < 40, embaixo: innerHeight - r.bottom < 120 }; });
  ok('A2 o Assistente aparece num botão redondo no canto de baixo, à direita', fab && fab.vis && fab.direita && fab.embaixo, JSON.stringify(fab));
  await page.click('#mei-assist'); await H.dorme(800);
  const h = await page.evaluate(() => ({ hash: location.hash, esc: document.getElementById('mei-assist').hidden }));
  ok('A3 tocar no botão abre o Assistente e o botão some na própria conversa', /assistentemei/.test(h.hash) && h.esc, JSON.stringify(h));
  await page.evaluate(() => { location.hash = '#agenda'; }); await H.dorme(600);
  ok('A4 nas outras telas o botão volta', await page.evaluate(() => !document.getElementById('mei-assist').hidden));
  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
