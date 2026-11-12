/* Teste dos Primeiros passos no Início e da Ajuda (12/11/2026). Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('ajuda');

(async () => {
  const cfgSup = 'window.CONECTWORK_CONFIG.suporteEmail = "suporte@exemplo.example"; window.CONECTWORK_CONFIG.suporteWhatsapp = "5551999990000";';
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    Object.assign(d.docs['empresas/alfa'], { modulos: ['equipe', 'cobrancas', 'contratos'], tipo: 'contratante' });
    d.docs['empresas/zeta'] = { nome: 'Zeta Manutenção', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas', 'contratos'], criadoPor: 'uZECA' };
    d.users['zeca@zeta.com.br'] = { uid: 'uZECA', pass: 'senha123' }; d.docs['usuarios/uZECA'] = { nome: 'Zeca Moura', email: 'zeca@zeta.com.br' };
    d.docs['acessos/zeta_uZECA'] = { uid: 'uZECA', empresaId: 'zeta', nome: 'Zeca Moura', email: 'zeca@zeta.com.br', cargo: 'admin', extras: [], sem: [], ativo: true };
    d.users['fabi@alfa.com.br'] = { uid: 'uFABI', pass: 'senha123' }; d.docs['usuarios/uFABI'] = { nome: 'Fabi Rocha', email: 'fabi@alfa.com.br' };
    d.docs['acessos/alfa_uFABI'] = { uid: 'uFABI', empresaId: 'alfa', nome: 'Fabi Rocha', email: 'fabi@alfa.com.br', cargo: 'financeiro', extras: [], sem: [], ativo: true };
  });
  await H.preparar(page, d); await page.goto(H.BASE);
  await H.entrar(page, 'ana@alfa.com.br', 'senha123'); await page.waitForSelector('.shell'); await H.dorme(1200);

  // A1 admin de empresa nova vê os Primeiros passos, com a equipe já feita (Bruno tem acesso)
  await page.waitForSelector('#ini-passos:not([hidden]) .ini-ps-l', { timeout: 8000 }); await H.dorme(800);
  const a1 = await page.evaluate(() => ({ n: document.getElementById('ini-ps-n').textContent, itens: Array.from(document.querySelectorAll('.ini-ps-l li')).map(l => l.dataset.passo + ':' + (l.classList.contains('ok') ? 'ok' : l.classList.contains('agora') ? 'agora' : '-')) }));
  ok('A1 Primeiros passos: logo, documentos (quem só contrata não tem obrigatório), equipe (feito), contrato e ajuda', a1.itens.join() === 'logo:agora,docs:ok,equipe:ok,contrato:-,ajuda:-' && a1.n === '2 de 5', JSON.stringify(a1));

  // A2 o botão do passo leva para a tela certa
  await page.click('[data-passo="contrato"] [data-ir]'); await H.dorme(500);
  ok('A2 "Cadastrar" leva para Contratos', await page.evaluate(() => location.hash === '#contratos'));

  // A3 Ajuda pelo "?" do topo: assuntos na ordem de quem contrata, busca sem acento
  await page.click('#ajuda-btn'); await page.waitForSelector('#aj-q');
  const ord = await page.$$eval('.aj-ass', x => x.map(s => s.dataset.ass));
  await page.fill('#aj-q', 'medicao planilha'); await H.dorme(200);
  const vis = await page.$$eval('.aj-p:not([hidden]) summary', x => x.map(s => s.textContent));
  ok('A3 Ajuda: ordem para quem contrata e busca sem acento', ord.slice(0, 3).join() === 'comeco,contratos,medicoes' && vis.length === 1 && /planilha/.test(vis[0]), JSON.stringify({ ord, vis }));
  await page.fill('#aj-q', 'palavrainexistente'); await H.dorme(200);
  ok('A4 busca sem resultado mostra o aviso', await page.$eval('#aj-nada', e => !e.hidden));

  // A5 sem contato configurado: não inventa e-mail
  ok('A5 sem contato no config: pede para falar com quem apresentou', !!(await page.$('#aj-sem-contato')) && !(await page.$('#aj-email')));

  // A6 voltar ao Início: o passo da Ajuda ficou feito
  await page.evaluate(() => { location.hash = '#inicio'; }); await page.waitForSelector('#ini-passos:not([hidden]) .ini-ps-l'); await H.dorme(400);
  ok('A6 depois de abrir a Ajuda, o passo fica feito', await page.$eval('[data-passo="ajuda"]', e => e.classList.contains('ok')) && (await page.$eval('#ini-ps-n', e => e.textContent)) === '3 de 5');

  // A7 Esconder some e não volta
  await page.click('#ini-ps-x'); await H.dorme(300);
  await page.evaluate(() => { location.hash = '#contratos'; }); await H.dorme(400); await page.evaluate(() => { location.hash = '#inicio'; }); await H.dorme(900);
  ok('A7 "Esconder" tira os Primeiros passos', await page.$eval('#ini-passos', e => e.hidden));

  // A8 quem não é admin não vê os Primeiros passos
  await page.click('#sair'); await page.waitForSelector('#lg-email'); await H.entrar(page, 'fabi@alfa.com.br', 'senha123'); await page.waitForSelector('.shell'); await H.dorme(1000);
  ok('A8 cargo financeiro não vê os Primeiros passos', await page.evaluate(() => { const e = document.getElementById('ini-passos'); return !e || e.hidden; }));

  // A8b prestadora: o passo dos documentos espera os documentos obrigatórios; o do contrato fala em assinar
  await page.click('#sair'); await page.waitForSelector('#lg-email'); await H.entrar(page, 'zeca@zeta.com.br', 'senha123'); await page.waitForSelector('.shell');
  await page.waitForSelector('#ini-passos:not([hidden]) .ini-ps-l', { timeout: 8000 }); await H.dorme(800);
  const b8 = await page.evaluate(() => ({ docs: document.querySelector('[data-passo="docs"]').className, ct: document.querySelector('[data-passo="contrato"] strong').textContent }));
  ok('A8b prestadora: documentos pendentes e "Assine o primeiro contrato"', !/ok/.test(b8.docs) && /Assine o primeiro contrato/.test(b8.ct), JSON.stringify(b8));

  // A9 busca do topo acha uma pergunta da Ajuda
  const achou = await page.evaluate(() => { const r = (CW.app.visiveis().find(m => m.id === 'ajuda') || {}).buscar(); return r.some(x => /nota recusada/i.test(x.t) || /recusada/.test(x.t)); });
  ok('A9 a busca do topo conhece as perguntas da Ajuda', achou);
  await browser.close();

  // A10 com o suporte configurado: WhatsApp e e-mail com a mensagem pronta
  const b2 = await H.abrir({ config: require('fs').readFileSync(require('path').join(__dirname, '..', 'config.js'), 'utf8') + '\nwindow.CONECTWORK_CONFIG.loginMicrosoft = true;\n' + cfgSup });
  await H.preparar(b2.page, d); await b2.page.goto(H.BASE); await H.entrar(b2.page, 'ana@alfa.com.br', 'senha123'); await b2.page.waitForSelector('.shell'); await H.dorme(800);
  await b2.page.evaluate(() => { location.hash = '#ajuda'; }); await b2.page.waitForSelector('#aj-suporte');
  const a10 = await b2.page.evaluate(() => ({ z: (document.getElementById('aj-zap') || {}).href || '', e: (document.getElementById('aj-email') || {}).href || '' }));
  ok('A10 suporte configurado: WhatsApp e e-mail com a mensagem pronta', /wa\.me\/5551999990000\?text=Ol/.test(a10.z) && /^mailto:suporte@exemplo\.example\?subject=/.test(a10.e), JSON.stringify(a10));
  await b2.browser.close();

  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
