/* Primeiros passos por tipo de empresa (14/11/2026): prestadora com equipe e MEI. Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('passos');
(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    const pessoa = (uid, email, nome, emp, cargo) => { d.users[email] = { uid, pass: 'senha123' }; d.docs['usuarios/' + uid] = { nome, email }; d.docs[`acessos/${emp}_${uid}`] = { uid, empresaId: emp, nome, email, cargo, extras: [], sem: [], ativo: true }; };
    pessoa('uLEO', 'leo@nexo.com.br', 'Leo Matos', 'nexo', 'admin');
    d.docs['empresas/nexo'] = { nome: 'Nexo Serviços', cnpj: '04.252.011/0001-10', status: 'aprovado', tipo: 'prestador', modulos: ['equipe', 'cobrancas', 'contratos'], criadoPor: 'uLEO' };
    d.docs['equipe/nexo_33000167000101'] = { prestadoraId: 'nexo', prestadoraNome: 'Nexo Serviços', cnpj: '33.000.167/0001-01', cnpjNum: '33000167000101', nome: 'Carlos Ramos', funcao: 'Eletricista', ativo: true, publico: true };
    pessoa('uCARL', 'carl@carl.com.br', 'Carlos Ramos', 'meic', 'admin');
    d.docs['empresas/meic'] = { nome: 'Carlos Ramos', razao: 'Carlos Ramos 33000167000101', cnpj: '33.000.167/0001-01', status: 'mei', tipo: 'prestador', modulos: [], criadoPor: 'uCARL' };
    d.docs['empresas/meic/privado/cadastro'] = { dados: { porte: 'MEI' } };
    d.docs['fiscal/meic'] = { das: { '2026-10': { pago: true, data: '2026-10-20' } }, dasn: {} };
  });
  await H.preparar(page, d); await page.goto(H.BASE);
  const lista = () => page.evaluate(() => Array.from(document.querySelectorAll('.ini-ps-l li')).map(l => l.dataset.passo + ':' + (l.classList.contains('ok') ? 'ok' : '-')));
  const textos = () => page.evaluate(() => Array.from(document.querySelectorAll('.ini-ps-l li strong')).map(s => s.textContent));

  await H.entrar(page, 'leo@nexo.com.br', 'senha123'); await page.waitForSelector('.shell');
  await page.waitForSelector('#ini-passos:not([hidden]) .ini-ps-l', { timeout: 8000 }); await H.dorme(800);
  const l1 = await lista(), t1 = await textos();
  ok('P1 prestadora: passos próprios (logo, documentos, assinar o contrato), sem "Cadastre o primeiro contrato"', l1.some(x => /^docs:/.test(x)) && t1.some(t => /Confira e assine o primeiro contrato/.test(t)) && !t1.some(t => /Cadastre o primeiro contrato/.test(t)), JSON.stringify({ l1, t1 }));
  const temProfs = l1.find(x => /^profs:/.test(x)), temServ = l1.find(x => /^servicos:/.test(x));
  ok('P2 prestadora: "Cadastre os profissionais" já feito (tem equipe) e "Marque os serviços" aparece quando o catálogo está ligado', temProfs === 'profs:ok' && temServ === 'servicos:-', JSON.stringify(l1));

  await page.click('#sair'); await page.waitForSelector('#lg-email'); await H.entrar(page, 'carl@carl.com.br', 'senha123');
  await page.waitForSelector('#mei-home', { timeout: 10000 });
  const tem = await page.waitForSelector('#mei-home #ini-passos:not([hidden]) .ini-ps-l', { timeout: 8000 }).then(() => true).catch(() => false); await H.dorme(600);
  const l3 = await lista(), t3 = await textos();
  ok('P3 MEI: Primeiros passos no Início do MEI, com DAS (já feito: marcou um pago) e check-up', tem && l3.includes('das:ok') && l3.includes('checkup:-') && t3.some(t => /check-up do seu MEI/.test(t)), JSON.stringify({ l3, t3 }));
  await page.evaluate(() => { location.hash = '#mei/checkup'; }); await H.dorme(1200);
  await page.evaluate(() => { location.hash = '#inicio'; }); await page.waitForSelector('#mei-home #ini-passos .ini-ps-l', { timeout: 8000 }); await H.dorme(600);
  ok('P4 MEI: depois de abrir o check-up, o passo fica feito', (await lista()).includes('checkup:ok'), JSON.stringify(await lista()));
  if (process.env.SHOT) await page.screenshot({ path: '/tmp/passos-mei.png', fullPage: true });
  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED|404/.test(x)).length, erros.join(' | '));
  await browser.close(); process.exit(fim());
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
