/* Quem ainda não entrou (14/11/2026): Cadastros › "Ainda não entraram" com "Mandar de novo" no WhatsApp, e o filtro em
   Meus profissionais. Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('naoentrou');
(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    d.docs['empresas/meix'] = { nome: 'Rui Prado', razao: 'Rui Prado 33000167000101', cnpj: '33.000.167/0001-01', status: 'aprovado', preCadastro: true, tipo: 'prestador', plano: 'gratuito', modulos: [], criadoPor: 'uMASTER', criadoEm: '2026-11-01T10:00:00Z' };
    d.docs['empresas/meix/privado/cadastro'] = { dados: { porte: 'MEI' }, resp: { nome: 'Rui Prado', celular: '(51) 98888-7777' } };
    d.docs['convites/tokrui123'] = { email: 'rui@exemplo.com', nome: 'Rui Prado', empresaId: 'meix', empresaNome: 'Rui Prado', cargo: 'admin', usado: false, criadoPor: 'uMASTER' };
    d.docs['empresas/meiy'] = { nome: 'Lia Souza', cnpj: '11.222.333/0001-81', status: 'aprovado', preCadastro: true, entrouEm: '2026-11-05T10:00:00Z', tipo: 'prestador', modulos: [], criadoPor: 'uMASTER' };
  });
  await H.preparar(page, d); await page.goto(H.BASE);
  await H.entrar(page, 'iasmyn@conectwork.com.br', 'senha123'); await page.waitForSelector('#menu', { timeout: 8000 });
  await page.evaluate(() => { location.hash = '#cadastros'; }); await page.waitForSelector('[data-filtro="naoentrou"]', { timeout: 8000 });
  await page.click('[data-filtro="naoentrou"]'); await H.dorme(400);
  const l = await page.$$eval('#cm-lista tbody tr', xs => xs.map(t => t.innerText.replace(/\s+/g, ' ')));
  ok('N1 "Ainda não entraram" mostra só a pré-cadastrada que nunca entrou, com há quantos dias', l.length === 1 && /Rui Prado/.test(l[0]) && /Há \d+ dias/.test(l[0]) && !l.some(x => /Lia Souza/.test(x)), JSON.stringify(l));
  await page.evaluate(() => { window.__jan = { location: {}, close() {} }; window.open = () => window.__jan; });
  await page.click('[data-lembrar="meix"]'); await H.dorme(1200);
  const u = await page.evaluate(() => window.__jan.location.href || '');
  ok('N2 "Mandar de novo" abre o WhatsApp do responsável com o convite que ainda vale', /^https:\/\/wa\.me\/5551988887777\?text=/.test(u) && /convite%2F%3Fc%3Dtokrui123/.test(u) && /rui%40exemplo\.com/.test(u), u.slice(0, 260));
  const S = await page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  ok('N3 grava no histórico e a linha mostra "lembrado em"', Object.values(S).some(x => x && x.acao === 'convite.lembrete') && /lembrado em/.test(await page.$eval('#cm-lista tbody', e => e.innerText)));
  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED|404/.test(x)).length, erros.join(' | '));
  await browser.close(); process.exit(fim());
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
