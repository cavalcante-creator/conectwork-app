/* Prestadora fora do Conectwork ao registrar o contrato (12/11/2026, foto "A prestadora ainda não está no Conectwork"):
   quem é da equipe Conectwork pré-cadastra ali mesmo e segue para o contrato; quem não é vê o aviso. Dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('contratoprecad');
const b64url = o => Buffer.from(JSON.stringify(o), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    Object.assign(d.docs['empresas/alfa'], { modulos: ['equipe', 'cobrancas', 'contratos'], cnpj: '11.444.777/0001-61', tipo: 'contratante' });
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
  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
