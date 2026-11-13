/* Prestadora fora do Conectwork ao registrar o contrato (12/11/2026, foto "A prestadora ainda não está no Conectwork"):
   quem é da equipe Conectwork pré-cadastra ali mesmo e segue para o contrato; quem não é vê o aviso. Dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('contratoprecad');
const b64url = o => Buffer.from(JSON.stringify(o), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    Object.assign(d.docs['empresas/alfa'], { modulos: ['equipe', 'cobrancas', 'contratos'], cnpj: '11.444.777/0001-61', tipo: 'contratante' });
    d.docs['empresas/zeta'] = { nome: 'Zeta Teste', cnpj: '04.252.011/0001-10', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas'], criadoPor: 'uX' };
    d.docs['acessos/alfa_uIASMYN'] = { uid: 'uIASMYN', empresaId: 'alfa', cargo: 'admin', extras: [], sem: [], ativo: true };
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  const resumo = { v: 1, periodo: '2026-10-2', cnpj: '62944495000164', nome: 'ZENITH', total: 180000, ref: 'painel-rh:2026-10-2:ZENITH', itens: [{ n: 'Joao Teste', h: 80, v: 180000 }] };
  await H.preparar(page, d); await page.goto(H.BASE + '?empresa=11444777000161#medicoes/importar/' + b64url(resumo));
  await H.entrar(page, 'iasmyn@conectwork.com.br', 'senha123'); await page.waitForSelector('#mi-regcont', { timeout: 8000 });
  await page.click('#mi-regcont'); await page.waitForSelector('dialog[open] #ct-pcn', { timeout: 8000 });
  const nm = await page.$eval('#ct-pcn', e => e.value);
  ok('P1 equipe Conectwork: a prestadora fora do Conectwork pode ser pré-cadastrada ali, com o nome já preenchido', nm === 'Zenith', nm);
  await page.click('dialog[open] [data-dlg-b="1"]'); await page.waitForSelector('#ct-form', { timeout: 8000 });
  const D = await srv(), z = Object.entries(D).find(([k, v]) => /^empresas\/[^/]+$/.test(k) && v.cnpjNum === '62944495000164');
  const pr = await page.$eval('#ct-prest', e => e.value);
  ok('P2 a Zenith fica pré-cadastrada (aprovada, só presta) e o contrato já vem com ela escolhida', z && z[1].status === 'aprovado' && z[1].tipo === 'prestador' && z[1].preCadastro && pr === z[0].split('/')[1], JSON.stringify({ z: z && z[1], pr }));
  ok('P3 quem pré-cadastrou (equipe) já é administrador(a) da Zenith', z && !!D['acessos/' + z[0].split('/')[1] + '_uIASMYN'] && D['acessos/' + z[0].split('/')[1] + '_uIASMYN'].cargo === 'admin');
  // P4 na análise de uma empresa aprovada em que a equipe ainda não é admin: "Me colocar como administrador(a)"
  await page.keyboard.press('Escape').catch(() => null);
  await page.evaluate(() => CW.sessao.voltarEquipe('cadastros/analise/beta')); await page.waitForSelector('#cm-souadm', { timeout: 8000 });
  await page.click('#cm-souadm'); await H.dorme(1500);
  const D2 = await srv();
  ok('P4 "Me colocar como administrador(a)" cria o acesso de admin e entra na empresa', D2['acessos/beta_uIASMYN'] && D2['acessos/beta_uIASMYN'].cargo === 'admin' && await page.evaluate(() => (CW.sessao.contexto() || {}).empresaId) === 'beta');
  // P5 pela tela da Rede › Empresas também
  await page.evaluate(() => CW.sessao.voltarEquipe('redeempresas/ver/zeta')); await page.waitForSelector('#re-souadm', { timeout: 8000 });
  await page.click('#re-souadm'); await H.dorme(1500);
  ok('P5 na Rede › Empresas, "Me colocar como administrador(a)" também funciona', (await srv())['acessos/zeta_uIASMYN'] && await page.evaluate(() => (CW.sessao.contexto() || {}).empresaId) === 'zeta');
  // P6 sair da administração (13/11/2026): desativa o próprio acesso (não apaga), a empresa sai da lista e o botão volta a ser "Me colocar"
  await page.evaluate(() => CW.sessao.voltarEquipe('redeempresas/ver/zeta')); await page.waitForSelector('#re-sairadm', { timeout: 8000 });
  await page.click('#re-sairadm'); await page.waitForSelector('dialog[open]'); const t6 = await page.$eval('dialog[open]', e => e.innerText); await page.click('dialog[open] [data-dlg-b="1"]'); await H.dorme(1800);
  await page.waitForSelector('#re-souadm', { timeout: 8000 }).catch(() => null);
  const a6 = (await srv())['acessos/zeta_uIASMYN'], op6 = await page.evaluate(() => (CW.sessao.estado().opcoes || []).some(o => o.empresaId === 'zeta'));
  ok('P6 "Sair da administração": o acesso fica desativado (não apaga), a empresa sai da lista e aparece "Me colocar como administrador(a)" de novo', a6 && a6.ativo === false && !op6 && !!(await page.$('#re-souadm')) && /Sair da administração/.test(t6), JSON.stringify({ a6, op6, t6: t6.slice(0, 200) }));
  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
