/* Aprovação automática (14/11/2026, "pode aprovar sozinho"): com os 4 documentos obrigatórios, a empresa que manda o
   cadastro completo entra aprovada no plano de entrada; a equipe confere depois em Cadastros › Aprovadas sozinhas. Dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('autoaprova');
(async () => {
  const { browser, page, erros } = await H.abrir();
  const docs = { contrato: { nome: 'a.pdf' }, cartao: { nome: 'b.pdf' }, endereco: { nome: 'c.pdf' }, identidade: { nome: 'd.pdf' } };
  const { d } = H.seed(d => {
    const pessoa = (uid, email, nome, emp) => { d.users[email] = { uid, pass: 'senha123' }; d.docs['usuarios/' + uid] = { nome, email }; d.docs[`acessos/${emp}_${uid}`] = { uid, empresaId: emp, nome, email, cargo: 'admin', extras: [], sem: [], ativo: true }; };
    pessoa('uLUA', 'lua@luar.com.br', 'Lua Campos', 'luar');
    d.docs['empresas/luar'] = { nome: 'Luar Serviços', cnpj: '11.444.777/0001-61', status: 'analise', tipo: 'prestador', criadoPor: 'uLUA', criadoEm: '2026-11-10T10:00:00Z' };
    d.docs['empresas/luar/privado/cadastro'] = { dados: { porte: 'ME' }, docs, resp: { nome: 'Lua Campos', cel: '(51) 98888-0000' } };
    d.docs['empresas/sola'] = { nome: 'Sola Obras', cnpj: '04.252.011/0001-10', status: 'analise', tipo: 'prestador', criadoPor: 'uX', avaliadoEm: '2026-11-01T00:00:00Z', motivo: 'Ajuste' };
    d.docs['empresas/sola/privado/cadastro'] = { dados: { porte: 'ME' }, docs };
  });
  await H.preparar(page, d); await page.goto(H.BASE);
  await H.entrar(page, 'lua@luar.com.br', 'senha123'); await page.waitForSelector('.shell, #sa-convite, .login', { timeout: 8000 }).catch(() => null); await H.dorme(1200);
  const r = await page.evaluate(async () => ({ luar: await CW.cadastro.autoAprovar('luar', { docs: { contrato: 1, cartao: 1, endereco: 1, identidade: 1 }, dados: { porte: 'ME' } }, 'Lua'),
    sola: await CW.cadastro.autoAprovar('sola', { docs: { contrato: 1, cartao: 1, endereco: 1, identidade: 1 }, dados: { porte: 'ME' } }, 'Lua') }));
  const S = await page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs), e = S['empresas/luar'];
  ok('A1 com os 4 documentos, a empresa em análise entra aprovada no plano Profissional, marcada "aprovada sozinha"', r.luar && e.status === 'aprovado' && e.plano === 'profissional' && e.autoAprovado === true && e.modulos.includes('contratos') && Object.values(S).some(x => x && x.acao === 'empresa.autoaprovar'), JSON.stringify(e));
  ok('A2 quem já teve ajuste pedido pela equipe continua esperando a equipe', !r.sola && S['empresas/sola'].status === 'analise');
  await page.click('#sair').catch(() => null); await page.waitForSelector('#lg-email');
  await H.entrar(page, 'iasmyn@conectwork.com.br', 'senha123'); await page.waitForSelector('#menu', { timeout: 8000 });
  await page.evaluate(() => { location.hash = '#cadastros'; }); await page.waitForSelector('[data-filtro="conferir"]', { timeout: 8000 });
  const chip = await page.$eval('[data-filtro="conferir"]', b => b.innerText);
  await page.click('[data-filtro="conferir"]'); await H.dorme(300);
  const l = await page.$$eval('#cm-lista tbody tr', xs => xs.map(t => t.innerText.replace(/\s+/g, ' ')));
  ok('A3 Cadastros › "Aprovadas sozinhas (1)" lista a empresa para conferir', /Aprovadas sozinhas\s*1/.test(chip) && l.length === 1 && /Luar/.test(l[0]) && /Aprovada sozinha · conferir/.test(l[0]), JSON.stringify({ chip, l }));
  const pv = await page.evaluate(() => (CW.app.pendencias() || []).map(p => p.txt).join(' | '));
  ok('A4 a equipe vê a pendência "Conferir os documentos de 1 empresa aprovada sozinha"', /aprovada sozinha/.test(pv), pv);
  await page.click('[data-abrir="luar"]'); await page.waitForSelector('#cm-conferido', { timeout: 8000 });
  await page.click('#cm-conferido'); await H.dorme(900);
  const e2 = (await page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs))['empresas/luar'];
  ok('A5 "Documentos conferidos" grava quem conferiu e a empresa sai da lista', !!e2.conferidoEm && /Iasmyn/.test(e2.conferidoPor || ''), JSON.stringify(e2));
  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED|404/.test(x)).length, erros.join(' | '));
  await browser.close(); process.exit(fim());
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
