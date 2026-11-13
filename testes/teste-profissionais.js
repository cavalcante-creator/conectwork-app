/* Meus profissionais e Equipes das prestadoras (13/11/2026): a prestadora monta o catálogo da equipe (trazendo das medições e à mão),
   quem contrata vê a equipe da prestadora com contrato (sem tratar direto com o MEI) e o MEI mostra o selo "Equipe <prestadora>". Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('profissionais');
(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    const pessoa = (uid, email, nome, emp, cargo) => { d.users[email] = d.users[email] || { uid, pass: 'senha123' }; d.docs['usuarios/' + uid] = { nome, email }; d.docs[`acessos/${emp}_${uid}`] = { uid, empresaId: emp, nome, email, cargo, extras: [], sem: [], ativo: true }; };
    pessoa('uDONO', 'dono@nexo.com.br', 'Davi Nunes', 'nexo', 'admin');
    pessoa('uRITA', 'rita@col.com.br', 'Rita Prado', 'col', 'admin');
    pessoa('uCARL', 'carl@carl.com.br', 'Carlos Ramos', 'meic', 'admin');
    d.docs['empresas/col'] = { nome: 'Colina Indústria', status: 'aprovado', tipo: 'contratante', modulos: ['cobrancas', 'contratos'], criadoPor: 'uRITA' };
    d.docs['empresas/nexo'] = { nome: 'Nexo Serviços', cnpj: '04.252.011/0001-10', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas', 'contratos', 'profissionais'], criadoPor: 'uDONO' };
    d.docs['empresas/meic'] = { nome: 'Carlos Ramos', cnpj: '33.000.167/0001-01', status: 'mei', tipo: 'prestador', modulos: [], criadoPor: 'uCARL' };
    d.docs['empresas/meic/privado/cadastro'] = { dados: { porte: 'MEI' } };
    d.docs['cnpjs/33000167000101'] = { empresaId: 'meic' };
    d.docs['contratos/cn'] = { modalidade: 'continua', tomadorId: 'col', prestadorId: 'nexo', partes: ['col', 'nexo'], tomadorNome: 'Colina Indústria', prestadorNome: 'Nexo Serviços', objeto: 'Equipe de manutenção.', periodicidade: 'quinzena', vencimentoDias: 3, inicio: '2026-01-01', status: 'ativo', assinaturas: {} };
    d.docs['medicoes/cn_2026-09-2'] = { contratoId: 'cn', tomadorId: 'col', prestadorId: 'nexo', partes: ['col', 'nexo'], tomadorNome: 'Colina Indústria', prestadorNome: 'Nexo Serviços', periodicidade: 'quinzena', periodo: '2026-09-2', valorCentavos: 650000,
      memoria: [{ nome: 'Carlos Ramos', horas: 96, valorCentavos: 350000, cnpj: '33000167000101' }, { nome: 'Bia Costa', horas: 90, valorCentavos: 300000, cnpj: '11222333000181' }, { nome: 'Sem Cnpj Teste', horas: 10, valorCentavos: 1000 }], status: 'aprovada', criadoPor: 'uRH' };
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  const entrarComo = async email => { if (await page.$('#sair')) await page.click('#sair'); await page.waitForSelector('#lg-email'); await H.entrar(page, email, 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 }).catch(() => null); await H.dorme(800); };
  const dlgOk = () => page.click('dialog[open] [data-dlg-b="1"]');
  await H.preparar(page, d); await page.goto(H.BASE);

  // P1 a prestadora: "Meus profissionais" no menu, equipe vazia, traz das medições (só quem tem CNPJ)
  await entrarComo('dono@nexo.com.br');
  const menu = await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod));
  await page.evaluate(() => { location.hash = '#profissionais'; }); await page.waitForSelector('#pf-topo, .empty', { timeout: 8000 }); await H.dorme(400);
  await page.click('#pf-trazer'); await page.waitForSelector('dialog[open]'); const dl = await page.$eval('dialog[open]', e => e.innerText); await dlgOk(); await H.dorme(1200);
  const S1 = await srv(), c1 = S1['equipe/nexo_33000167000101'], b1 = S1['equipe/nexo_11222333000181'];
  ok('P1 "Meus profissionais" no menu da prestadora; "Trazer das medições" coloca na equipe quem veio com CNPJ (com a conta do MEI ligada)', menu.includes('profissionais') && !menu.includes('equipes') && /2 profissionais/.test(dl) && c1 && c1.meiEmpresaId === 'meic' && c1.desde === '2026-09-16' && b1 && !b1.meiEmpresaId && c1.publico && c1.ativo && !Object.keys(S1).some(k => /Sem Cnpj/.test(JSON.stringify(S1[k])) && /^equipe\//.test(k)), JSON.stringify({ menu, dl: dl.slice(0, 200), c1 }));
  const cards = await page.$$eval('#pf-grade .pf-it', x => x.map(e => e.innerText.replace(/\s+/g, ' ')));
  ok('P2 o catálogo mostra cada profissional com os selos (conta no Conectwork ou CNPJ conferido, visível aos clientes) e "Convidar" para quem não tem conta', cards.length === 2 && cards.some(t => /Carlos Ramos.*MEI com conta no Conectwork.*Os clientes veem/.test(t)) && cards.some(t => /Bia Costa.*CNPJ do MEI conferido.*Convidar/.test(t)), JSON.stringify(cards));
  // P3 editar a função; adicionar à mão (CNPJ inválido barrado); encerrar o vínculo
  await page.click('[data-pf-ed="nexo_11222333000181"]'); await page.waitForSelector('#pf-fn'); await page.fill('#pf-fn', 'Eletricista'); await page.fill('#pf-cid', 'Gravataí'); await page.fill('#pf-uf', 'rs'); await dlgOk(); await H.dorme(1000);
  await page.click('#pf-novo'); await page.waitForSelector('#pf-nome'); await page.fill('#pf-nome', 'Davi Lopes'); await page.fill('#pf-cnpj', '11.111.111/1111-11'); await dlgOk(); await H.dorme(300);
  const er = await page.$eval('#pf-erro', e => e.innerText); await page.fill('#pf-cnpj', '45.723.174/0001-10'); await page.fill('#pf-fn', 'Soldador'); await dlgOk(); await H.dorme(1000);
  await page.click('[data-pf-enc="nexo_45723174000110"]'); await page.waitForSelector('#pf-dt'); await dlgOk(); await H.dorme(1000);
  const S3 = await srv();
  ok('P3 editar a função, adicionar à mão (CNPJ inválido avisa) e encerrar o vínculo (não apaga)', S3['equipe/nexo_11222333000181'].funcao === 'Eletricista' && S3['equipe/nexo_11222333000181'].uf === 'RS' && /não é válido/.test(er) && S3['equipe/nexo_45723174000110'] && S3['equipe/nexo_45723174000110'].ativo === false && !!S3['equipe/nexo_45723174000110'].encerradoEm && Object.values(S3).some(x => x.acao === 'equipe.encerrar'), er);

  // P4 quem contrata: "Equipes das prestadoras" com a equipe da Nexo (sem o encerrado), sem dados de gestão
  await entrarComo('rita@col.com.br');
  const menu2 = await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod));
  await page.evaluate(() => { location.hash = '#equipes'; }); await page.waitForSelector('.pf-emp', { timeout: 8000 }); await H.dorme(400);
  const eq = await page.$eval('.pf-emp', e => e.innerText.replace(/\s+/g, ' '));
  if (process.env.SHOT) await page.screenshot({ path: '/tmp/equipes.png', fullPage: true });
  ok('P4 quem contrata vê "Equipes das prestadoras": a equipe da Nexo (2 visíveis, sem o encerrado), com o selo da equipe, sem CNPJ nem botões de gestão', menu2.includes('equipes') && !menu2.includes('profissionais') && /Nexo Serviços/.test(eq) && /2 profissionais na equipe/.test(eq) && /Carlos Ramos/.test(eq) && /Bia Costa.*Eletricista/.test(eq) && !/Davi Lopes/.test(eq) && !/MEI 33/.test(eq) && !(await page.$('[data-pf-ed]')), eq.slice(0, 300));

  // P5 o MEI: selo "Equipe Nexo Serviços" no Início
  await entrarComo('carl@carl.com.br');
  await page.waitForSelector('#mh-equipes .mh-eq', { timeout: 8000 }).catch(() => null);
  const selo = await page.evaluate(() => (document.getElementById('mh-equipes') || {}).innerText || '');
  ok('P5 o MEI mostra o selo "Equipe Nexo Serviços" no Início', /Equipe Nexo Serviços/.test(selo), selo);
  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
