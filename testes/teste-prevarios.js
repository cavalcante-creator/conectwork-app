/* Pré-cadastrar vários MEIs de uma vez (12/11/2026, "precisamos já cadastrar e deixar pronto quem está no painel"):
   a equipe cola a lista do painel do RH; cada MEI nasce aprovado (porte MEI, só presta), com convite de administrador(a)
   para o e-mail; CNPJ que já existe fica de fora; linha com problema é avisada. Depois o MEI entra pelo convite. Dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('prevarios');
(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => { d.docs['empresas/gama'].cnpj = '11.444.777/0001-61'; });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  await H.preparar(page, d); await page.goto(H.BASE);
  await H.entrar(page, 'iasmyn@conectwork.com.br', 'senha123'); await page.waitForSelector('#menu', { timeout: 8000 });
  await page.evaluate(() => { location.hash = '#cadastros'; }); await page.waitForSelector('#cm-prevarios', { timeout: 6000 });
  await page.click('#cm-prevarios'); await page.waitForSelector('dialog[open] #pv-txt');
  const lista = ['Nome;CNPJ;Prestadora;Celular;E-mail', 'Joao da Silva Teste;04.252.011/0001-10;Zenith;(51) 99999-0000;joao@teste.com', 'Ana Souza Teste;12345678000195;Nexus;;', 'Gama Repetida;11.444.777/0001-61;Zenith;;', 'Rui Errado;11.111.111/1111-11;Zenith;;'].join('\n');
  await page.fill('#pv-txt', lista); await page.dispatchEvent('#pv-txt', 'input');
  const pv = await page.$eval('#pv-prev', e => e.innerText);
  ok('V1 a prévia conta: 2 para pré-cadastrar, 1 já está, 1 com e-mail, 1 com problema', /2 para pré-cadastrar/.test(pv) && /1 já estão/.test(pv) && /1 com e-mail/.test(pv) && /1 com problema/.test(pv), pv);
  await page.click('dialog[open] [data-dlg-b="1"]'); await page.waitForSelector('dialog[open] #pv-res', { timeout: 10000 });
  const D = await srv(), emps = Object.entries(D).filter(([k, v]) => /^empresas\/[^/]+$/.test(k) && v.preCadastro);
  const jo = emps.find(([, v]) => v.cnpjNum === '04252011000110'), an = emps.find(([, v]) => v.cnpjNum === '12345678000195');
  ok('V2 os dois MEIs nascem aprovados, só prestam, plano gratuito, porte MEI', jo && an && jo[1].status === 'aprovado' && jo[1].tipo === 'prestador' && jo[1].plano === 'gratuito'
    && D[jo[0] + '/privado/cadastro'].dados.porte === 'MEI' && !!D['cnpjs/04252011000110'], JSON.stringify(jo && jo[1]));
  const cv = Object.entries(D).filter(([k]) => /^convites\//.test(k));
  ok('V3 só quem tem e-mail ganha convite de administrador(a) do MEI dele', cv.length === 1 && cv[0][1].email === 'joao@teste.com' && cv[0][1].cargo === 'admin' && cv[0][1].empresaId === jo[0].split('/')[1], JSON.stringify(cv));
  const res = await page.$eval('dialog[open] #pv-res', e => e.innerText), zap = await page.$eval('dialog[open] #pv-res a', a => a.href);
  ok('V4 o resultado mostra WhatsApp para o Joao (com o link do convite) e "sem e-mail" para a Ana', /Joao/.test(res) && /Sem e-mail/.test(res) && /wa\.me\/5551999990000/.test(zap) && /convite%2F%3Fc%3D/.test(zap), zap.slice(0, 200));
  ok('V5 nada foi cadastrado para o CNPJ repetido nem para o inválido', emps.length === 2, String(emps.length));
  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
