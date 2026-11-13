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
  await page.evaluate(() => { location.hash = '#inicio'; }); await page.waitForSelector('#mei-servicos', { timeout: 8000 }); await H.dorme(500);
  const serv = await page.$eval('#mei-servicos', e => e.innerText);
  ok('A5 o botão "Dúvidas" saiu de "Serviços pra você"', !/Dúvidas/.test(serv) && /Check-up/.test(serv), serv);
  const larg = () => page.evaluate(() => Math.round(document.querySelector('.shell .side').getBoundingClientRect().width));
  const w0 = await larg(); await page.click('#menu-recolher'); await H.dorme(400); const w1 = await larg();
  const mini = await page.evaluate(() => ({ cls: document.documentElement.classList.contains('menu-mini'), tit: document.querySelector('#menu [data-mod="agenda"]').title, txt: getComputedStyle(document.querySelector('#menu [data-mod="agenda"] span')).display }));
  if (process.env.SHOT) await page.screenshot({ path: '/tmp/menu-mini.png' });
  await page.reload(); await page.waitForSelector('.shell', { timeout: 10000 }); await H.dorme(800); const w2 = await larg();
  await page.click('#menu-recolher'); await H.dorme(400); const w3 = await larg();
  ok('A6 "Recolher o menu" deixa só os ícones (com o nome ao passar o mouse), lembra depois de recarregar e abre de novo', w0 > 200 && w1 < 90 && mini.cls && mini.tit === 'Agenda e lembretes' && mini.txt === 'none' && w2 < 90 && w3 > 200, JSON.stringify({ w0, w1, w2, w3, mini }));
  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
