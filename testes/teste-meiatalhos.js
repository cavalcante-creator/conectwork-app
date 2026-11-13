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
  await page.evaluate(() => { window.__jan = { location: {}, focus() {}, document: { write(h) { window.__escrito = h; }, close() {} } }; window.open = (u, n, f) => { window.__janArgs = [u, n, f]; return window.__jan; }; });
  await page.click('#mh-cartao'); await H.dorme(1600);
  const jan = await page.evaluate(() => ({ a: window.__janArgs, href: window.__jan.location.href, hash: location.hash }));
  ok('A1b o cartão CNPJ abre numa janela por cima (como o login do Google), sem sair do Conectwork', jan.a && /popup=yes/.test(jan.a[2]) && /receita\.fazenda\.gov\.br/.test(jan.href) && /inicio/.test(jan.hash), JSON.stringify(jan));
  const cp = await page.evaluate(() => window.__cp); const t1 = await page.evaluate(() => ({ av: (document.getElementById('mh-copiado') || {}).innerText || '', link: document.getElementById('mh-cartao').innerText, jan: window.__escrito || '' }));
  ok('A1 "cartão CNPJ" copia o CNPJ (só números) e avisa: aviso grande, o link vira "CNPJ copiado" e a janela por cima mostra o CNPJ antes de abrir a Receita', cp === '33000167000101' && /CNPJ copiado/.test(t1.av) && /33\.000\.167\/0001-01/.test(t1.av) && /CNPJ copiado/.test(t1.link) && /CNPJ copiado/.test(t1.jan), JSON.stringify(t1));
  const fab = await page.evaluate(() => { const b = document.getElementById('mei-assist'); if (!b) return null; const r = b.getBoundingClientRect(); return { vis: !b.hidden, direita: innerWidth - r.right < 40, embaixo: innerHeight - r.bottom < 120 }; });
  ok('A2 o Assistente aparece num botão redondo no canto de baixo, à direita', fab && fab.vis && fab.direita && fab.embaixo, JSON.stringify(fab));
  await page.click('#mei-assist'); await page.waitForSelector('#mei-chat #as-form', { timeout: 8000 });
  await page.fill('#as-q', 'quanto posso faturar'); await page.press('#as-q', 'Enter'); await H.dorme(1200);
  if (process.env.SHOT) await page.screenshot({ path: '/tmp/mei-chat.png' });
  const h = await page.evaluate(() => ({ hash: location.hash, msgs: document.querySelectorAll('#mei-chat .as-m').length, r: (() => { const r = document.getElementById('mei-chat').getBoundingClientRect(); return { d: innerWidth - r.right, w: r.width }; })() }));
  ok('A3 tocar no botão abre a conversa numa janelinha por cima da tela (a tela de trás não muda) e responde', /inicio|^$/.test(h.hash) && h.msgs >= 3 && h.r.d < 40 && h.r.w < 420, JSON.stringify(h));
  await page.keyboard.press('Escape'); await H.dorme(200);
  ok('A3b Esc fecha a janelinha', !(await page.$('#mei-chat')));
  await page.click('#mei-assist'); await page.waitForSelector('#mei-chat'); await page.click('#mei-chat-x'); await H.dorme(200);
  ok('A3c o ✕ fecha a janelinha', !(await page.$('#mei-chat')));
  await page.evaluate(() => { location.hash = '#assistentemei'; }); await H.dorme(700);
  ok('A3d na tela do Assistente o botão some', await page.evaluate(() => document.getElementById('mei-assist').hidden));
  await page.evaluate(() => { location.hash = '#agenda'; }); await H.dorme(600);
  ok('A4 nas outras telas o botão volta', await page.evaluate(() => !document.getElementById('mei-assist').hidden));
  await page.evaluate(() => { location.hash = '#inicio'; }); await page.waitForSelector('#mei-servicos', { timeout: 8000 }); await H.dorme(500);
  const serv = await page.$eval('#mei-servicos', e => e.innerText);
  ok('A5 o botão "Dúvidas" saiu de "Serviços pra você"', !/Dúvidas/.test(serv) && /Check-up/.test(serv), serv);
  const larg = () => page.evaluate(() => Math.round(document.querySelector('.shell .side').getBoundingClientRect().width));
  const w0 = await larg(); await page.click('#menu-recolher'); await H.dorme(400); const w1 = await larg(); if (process.env.SHOT) await page.screenshot({ path: '/tmp/menu-mini2.png', clip: { x: 0, y: 0, width: 300, height: 400 } });
  const mini = await page.evaluate(() => ({ logo: (() => { const g = document.querySelector('.shell .logo>svg'); return !!g && g.getBoundingClientRect().width > 20; })(), cls: document.documentElement.classList.contains('menu-mini'), tit: document.querySelector('#menu [data-mod="agenda"]').title, txt: getComputedStyle(document.querySelector('#menu [data-mod="agenda"] span')).display }));
  if (process.env.SHOT) await page.screenshot({ path: '/tmp/menu-mini.png' });
  await page.reload(); await page.waitForSelector('.shell', { timeout: 10000 }); await H.dorme(800); const w2 = await larg();
  await page.click('#menu-recolher'); await H.dorme(400); const w3 = await larg();
  ok('A6 "Recolher o menu" deixa só os ícones e a logo (com o nome ao passar o mouse), lembra depois de recarregar e abre de novo', w0 > 200 && w1 < 90 && mini.logo && mini.cls && mini.tit === 'Agenda e lembretes' && mini.txt === 'none' && w2 < 90 && w3 > 200, JSON.stringify({ w0, w1, w2, w3, mini }));
  // A8 "Gerar a guia" (DAS) e "Fazer a declaração" (DASN) seguem a mesma lógica do cartão CNPJ
  const testaReceita = async (rota, sel, site) => {
    await page.evaluate(r => { location.hash = r; }, rota); await page.waitForSelector(sel, { timeout: 10000 }); await H.dorme(400);
    await page.evaluate(() => { window.__cp = null; window.__escrito = ''; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__cp = t; return Promise.resolve(); } } }); window.__jan = { location: {}, focus() {}, document: { write(h) { window.__escrito = h; }, close() {} } }; window.open = (u, n, f) => { window.__janArgs = [u, n, f]; return window.__jan; }; });
    await page.click(sel); await H.dorme(1600);
    return page.evaluate(s => ({ cp: window.__cp, pop: (window.__janArgs || [])[2] || '', href: window.__jan.location.href || '', jan: /CNPJ copiado/.test(window.__escrito), av: (document.getElementById('mh-copiado') || {}).innerText || '', site: s }), site);
  };
  const g = await testaReceita('#mei/das', '#das-gerar', 'PGMEI');
  const dsel = 'a[data-receita*="DASN"]';
  const dc = await testaReceita('#negocio', dsel, 'DASN');
  const okR = r => r.cp === '33000167000101' && /popup=yes/.test(r.pop) && /receita\.fazenda\.gov\.br/.test(r.href) && r.jan && /CNPJ copiado/.test(r.av);
  ok('A8 "Gerar a guia" e "Fazer a declaração" copiam o CNPJ, avisam e abrem o site numa janela por cima', okR(g) && okR(dc) && /pgmei/.test(g.href) && /dasnsimei/.test(dc.href) && /PGMEI/.test(g.av) && /DASN/.test(dc.av), JSON.stringify({ g, dc }));
  // A9 Documentos: "Emitir" a certidão copia o CNPJ, abre por cima e, ao fechar a janela, já abre o envio do arquivo
  const ce = await testaReceita('#documentos', 'a[data-emitir="cnd_federal"]', 'certidão');
  const temCartao = !!(await page.$('a[data-emitir="cartao"]'));
  await page.evaluate(() => { window.__jan.closed = true; }); await page.waitForSelector('dialog[open] #dc-arq', { timeout: 5000 }).catch(() => null);
  const dl = await page.evaluate(() => (document.querySelector('dialog[open]') || {}).innerText || '');
  ok('A9 Documentos: "Emitir" copia o CNPJ e abre por cima; fechando a janela, abre "Enviar" da certidão (e o cartão CNPJ também tem "Emitir")', okR(ce) && /certidaointernet/.test(ce.href) && /certidão federal/.test(ce.av) && /Enviar · Certidão de débitos federais/.test(dl) && temCartao, JSON.stringify({ ce, dl: dl.slice(0, 80), temCartao }));
  await page.keyboard.press('Escape'); await H.dorme(300);
  const pos = await page.evaluate(() => { const t = document.getElementById('tema').getBoundingClientRect(), c = document.getElementById('crumbs').getBoundingClientRect(), b = document.getElementById('busca-abrir').getBoundingClientRect(); return { t: Math.round(t.left), c: Math.round(c.right), b: Math.round(b.left), y: Math.round(t.top) }; });
  if (process.env.SHOT) await page.screenshot({ path: '/tmp/tema-pos.png', clip: { x: 0, y: 0, width: 1280, height: 120 } });
  ok('A10 no computador, o botão do tema fica no espaço entre o nome da tela e a busca', pos.t > pos.c && pos.t < pos.b && pos.y < 64, JSON.stringify(pos));
  const temas = []; await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; try { localStorage.setItem('cw.tema', 'light'); } catch (e) {} });
  for (let i = 0; i < 3; i++) { await page.click('#tema'); await H.dorme(150); temas.push(await page.$eval('#tema', e => e.innerText.trim())); }
  ok('A7 o botão de tema segue a ordem Claro → Escuro → Automático → Claro', temas.join() === 'Escuro,Automático,Claro', temas.join());
  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
