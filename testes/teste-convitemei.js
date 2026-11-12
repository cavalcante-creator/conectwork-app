/* Convite do MEI vindo do painel do RH (12/11/2026, "nenhum dos PJ do painel está cadastrado"): o link ?mei=<CNPJ>&nome=<nome>
   abre direto o cadastro rápido "Sou MEI" com o CNPJ e o nome preenchidos, e tira os dados do endereço. Dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('convitemei');
(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed();
  await H.preparar(page, d);
  await page.goto(H.BASE + '?mei=04252011000110&nome=Joao');
  await page.waitForSelector('#mc-cnpj', { timeout: 8000 }).catch(() => null);
  const v = await page.evaluate(() => ({ cnpj: (document.getElementById('mc-cnpj') || {}).value, nome: (document.getElementById('mc-nome') || {}).value, url: location.search }));
  ok('M1 o link do convite abre o "Sou MEI" com o CNPJ e o nome preenchidos', v.cnpj === '04.252.011/0001-10' && v.nome === 'Joao', JSON.stringify(v));
  ok('M2 o CNPJ e o nome saem do endereço', v.url === '', v.url);
  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
