/* Fila de MEIs do painel do RH (12/11/2026, "assim que o RH faz o cadastro no painel já pré-cadastra no Conectwork"):
   com a equipe Conectwork logada, o que está pendente em filamei vira MEI pré-cadastrado com convite; CNPJ que já existe fica "ja";
   e-mail completado depois ganha convite novo. Dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('filamei');
(async () => {
  const { browser, page, erros } = await H.abrir();
  const fm = (num, cnpj, extra) => Object.assign({ cnpj, cnpjNum: num, nome: 'Joao Teste Silva', email: 'joao@teste.com', tel: '51999990000', prestadora: 'Zenith', prestCnpj: '04252011000110', empresaId: 'beta', enviadoPor: 'uX', enviadoPorNome: 'RH', em: '2026-11-12T10:00:00Z', st: 'pendente' }, extra || {});
  const { d } = H.seed(d => {
    d.docs['empresas/gama'].cnpj = '11.444.777/0001-61';
    d.docs['filamei/04252011000110'] = fm('04252011000110', '04.252.011/0001-10');
    d.docs['filamei/12345678000195'] = fm('12345678000195', '12.345.678/0001-95', { nome: 'Ana Souza Teste', email: '' });
    d.docs['filamei/11444777000161'] = fm('11444777000161', '11.444.777/0001-61', { nome: 'Gama Ja Tem' });
    d.docs['cnpjs/11444777000161'] = { empresaId: 'gama' };
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  await H.preparar(page, d); await page.goto(H.BASE);
  await H.entrar(page, 'iasmyn@conectwork.com.br', 'senha123'); await page.waitForSelector('#menu', { timeout: 8000 }); await H.dorme(3500);
  let D = await srv();
  const j = D['filamei/04252011000110'], a = D['filamei/12345678000195'], g = D['filamei/11444777000161'];
  ok('F1 com a equipe logada, o MEI da fila é pré-cadastrado sozinho, com convite para o e-mail', j.st === 'feito' && j.res && j.res.empresaMei && j.res.convite && D['convites/' + j.res.convite].email === 'joao@teste.com'
    && D['empresas/' + j.res.empresaMei].status === 'aprovado' && D['empresas/' + j.res.empresaMei + '/privado/cadastro'].dados.porte === 'MEI', JSON.stringify(j));
  ok('F2 sem e-mail: cadastrado, sem convite', a.st === 'feito' && a.res.empresaMei && !a.res.convite, JSON.stringify(a));
  ok('F3 CNPJ que já tinha cadastro fica "ja", sem convite', g.st === 'ja' && g.res.empresaMei === 'gama' && !g.res.convite, JSON.stringify(g));
  // o RH completou o e-mail da Ana: volta pendente e ganha convite (sem cadastrar de novo)
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('__srv')); Object.assign(s.docs['filamei/12345678000195'], { email: 'ana@teste.com', st: 'pendente' }); localStorage.setItem('__srv', JSON.stringify(s)); });
  await page.reload(); await page.waitForSelector('#menu', { timeout: 8000 }).catch(() => null); if (await page.$('#lg-email')) await H.entrar(page, 'iasmyn@conectwork.com.br', 'senha123'); await H.dorme(3500);
  D = await srv(); const a2 = D['filamei/12345678000195'], nEmp = Object.keys(D).filter(k => /^empresas\/[^/]+$/.test(k) && D[k].cnpjNum === '12345678000195').length;
  ok('F4 e-mail completado depois: ganha convite, sem cadastrar o MEI de novo', a2.st === 'feito' && a2.res.convite && D['convites/' + a2.res.convite].email === 'ana@teste.com' && a2.res.empresaMei === a.res.empresaMei && nEmp === 1, JSON.stringify(a2));
  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
