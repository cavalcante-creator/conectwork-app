/* Teste dos cursos dos parceiros (12/11/2026): o parceiro publica um curso, a rede vê e se interessa (a inscrição é no
   site do parceiro), a equipe Conectwork registra a porcentagem combinada (só o registro) e o parceiro pausa o curso.
   Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('cursos');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    delete d.docs['acessos/beta_uBRUNO'];
    Object.assign(d.docs['empresas/alfa'], { tipo: 'contratante' });
    const pessoa = (uid, email, nome, emp, cargo) => { d.users[email] = { uid, pass: 'senha123' }; d.docs['usuarios/' + uid] = { nome, email }; d.docs[`acessos/${emp}_${uid}`] = { uid, empresaId: emp, nome, email, cargo, extras: [], sem: [], ativo: true }; };
    pessoa('uLIA', 'lia@lia.com.br', 'Lia Lima', 'lia', 'admin');
    d.docs['empresas/lia'] = { nome: 'Escola Lia', razao: 'Lia Lima Treinamentos Ltda', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas', 'cursos'], criadoPor: 'uLIA' };
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  const col = async c => Object.entries(await srv()).filter(([k]) => new RegExp('^' + c + '/[^/]+$').test(k)).map(([k, v]) => Object.assign({ _id: k.split('/')[1] }, v));
  const logs = async a => Object.values(await srv()).filter(x => x.acao === a);
  const entrarComo = async email => { if (await page.$('#sair')) await page.click('#sair'); await page.waitForSelector('#lg-email'); await H.entrar(page, email, 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 }); await H.dorme(300); };
  const abrir = async () => { await page.evaluate(() => { location.hash = '#cursos'; }); await page.waitForSelector('#cu-lista, #cu-parceiros', { timeout: 8000 }); };
  const dlgOk = () => page.click('dialog[open] [data-dlg-b="1"]');
  await H.preparar(page, d); await page.goto(H.BASE);

  // K1 o parceiro publica um curso (o site da inscrição precisa começar com https://)
  await entrarComo('lia@lia.com.br');
  const menu = await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod));
  await abrir(); await page.click('[data-aba="meus"]'); await page.waitForSelector('#cu-meus');
  const pct0 = await page.$eval('#cu-pct', e => e.innerText);
  await page.click('#cu-novo'); await page.waitForSelector('#cu-tit');
  await page.fill('#cu-tit', 'NR-10 Básico'); await page.fill('#cu-desc', 'Segurança em instalações elétricas.'); await page.fill('#cu-ch', '40'); await page.fill('#cu-preco', '45000'); await page.fill('#cu-link', 'http://escola.exemplo.com.br');
  await dlgOk(); await H.dorme(150); const er1 = await page.$eval('#cu-erro', e => e.innerText);
  await page.fill('#cu-link', 'https://escola.exemplo.com.br/nr10'); await dlgOk(); await page.waitForSelector('#cu-meus .cu-it', { timeout: 8000 });
  const cs = await col('cursos');
  ok('K1 o parceiro (módulo "cursos" ligado) publica um curso; o site da inscrição precisa de https://; vai para o histórico',
    menu.includes('cursos') && /Ainda não registrada/.test(pct0) && /https/.test(er1) && cs.length === 1 && cs[0].empresaId === 'lia' && cs[0].precoCentavos === 45000 && cs[0].status === 'publicado' && (await logs('cursos.publicar')).length === 1, JSON.stringify({ pct0, er1, n: cs.length }));
  const ID = cs[0]._id;

  // K2 a rede vê o curso e se interessa: abre o site do parceiro e conta 1 interessado (sem dados da pessoa)
  await entrarComo('ana@alfa.com.br');
  await page.evaluate(() => { window.__abriu = []; window.open = (u) => { window.__abriu.push(u); return {}; }; });
  await abrir(); const k2 = await page.$eval('#cu-lista', e => e.innerText);
  const semMeus = !(await page.$('[data-aba="meus"]')) && !(await page.$('#cu-novo'));
  await page.click(`[data-inscr="${ID}"]`); await H.dorme(400);
  const abriu = await page.evaluate(() => window.__abriu), it = (await srv())[`cursos/${ID}/interesses/uANA`];
  ok('K2 quem não é parceiro vê os cursos abertos (sem "Publicar"); "Quero me inscrever" abre o site do parceiro e conta 1 interessado sem dados pessoais',
    /NR-10 Básico/.test(k2) && /Escola Lia/.test(k2) && /450,00/.test(k2) && semMeus && abriu[0] === 'https://escola.exemplo.com.br/nr10' && it && Object.keys(it).sort().join() === 'em,empresaId,uid', JSON.stringify({ abriu, it }));

  // K3 a equipe Conectwork registra a porcentagem combinada (só o registro)
  await entrarComo('iasmyn@conectwork.com.br');
  await abrir(); await page.waitForSelector('#cu-parceiros');
  const k3a = await page.$eval('#cu-parceiros', e => e.innerText);
  await page.click('[data-pct="lia"]'); await page.waitForSelector('#pc-v'); await page.fill('#pc-v', '120'); await dlgOk(); await H.dorme(150);
  const er3 = await page.$eval('#pc-erro', e => e.innerText);
  await page.fill('#pc-v', '10'); await page.fill('#pc-obs', 'Sobre cada inscrição.'); await dlgOk(); await H.dorme(500);
  const p3 = (await srv())['parcerias/lia'] || {}, k3b = await page.$eval('#cu-parceiros', e => e.innerText);
  ok('K3 a equipe vê o parceiro (1 curso, 1 interessado) e registra a porcentagem (0 a 100%); fica no histórico',
    /Escola Lia/.test(k3a) && /não registrada/.test(k3a) && /entre 0 e 100/.test(er3) && p3.pctBp === 1000 && /10%/.test(k3b) && (await logs('cursos.porcentagem')).length === 1, JSON.stringify({ k3a, er3, p3 }));

  // K4 o parceiro vê a porcentagem e os interessados, e pausa o curso (some para a rede)
  await entrarComo('lia@lia.com.br');
  await abrir(); await page.click('[data-aba="meus"]'); await page.waitForSelector('#cu-meus .cu-it');
  const k4 = { pct: await page.$eval('#cu-pct', e => e.innerText), card: await page.$eval('#cu-meus', e => e.innerText) };
  await page.click(`[data-ed="${ID}"]`); await page.waitForSelector('#cu-pausa'); await page.check('#cu-pausa'); await page.click('dialog[open] [data-dlg-b="2"]'); await H.dorme(500);
  await entrarComo('ana@alfa.com.br'); await abrir(); const k4b = await page.$eval('#cu-lista', e => e.innerText);
  ok('K4 o parceiro vê "10%" e "1 interessado"; pausado, o curso some da lista da rede',
    /10%/.test(k4.pct) && /1 interessado/.test(k4.card) && (await srv())['cursos/' + ID].status === 'pausado' && /Nenhum curso aberto/.test(k4b), JSON.stringify({ k4, k4b }));

  // K5 celular sem rolagem para o lado
  await page.setViewportSize({ width: 390, height: 844 }); await abrir(); await H.dorme(200);
  ok('K5 celular: a tela de cursos cabe sem rolar para o lado', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));

  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
