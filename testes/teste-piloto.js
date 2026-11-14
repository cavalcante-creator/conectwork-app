/* Chave do piloto (14/11/2026): com piloto:false no config.js, os atalhos do piloto somem para a equipe Conectwork.
   Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('piloto');
(async () => {
  const roda = async piloto => {
    const { browser, page, erros } = await H.abrir(piloto ? {} : { piloto: false });
    const { d } = H.seed(() => {});
    await H.preparar(page, d); await page.goto(H.BASE);
    await H.entrar(page, 'iasmyn@conectwork.com.br', 'senha123'); await page.waitForSelector('#menu', { timeout: 8000 });
    await page.evaluate(() => { location.hash = '#cadastros'; }); await page.waitForSelector('#cm-pre', { timeout: 8000 }); await H.dorme(300);
    const r = await page.evaluate(() => ({ cfg: CW.piloto(), varios: !!document.getElementById('cm-prevarios'), pre: !!document.getElementById('cm-pre') }));
    await browser.close(); return { r, erros };
  };
  const a = await roda(true), b = await roda(false);
  ok('K1 com o piloto ligado (padrão), a equipe vê "Pré-cadastrar vários MEIs"', a.r.cfg === true && a.r.varios && a.r.pre, JSON.stringify(a.r));
  ok('K2 com piloto:false, o atalho some e "Pré-cadastrar empresa" continua', b.r.cfg === false && !b.r.varios && b.r.pre, JSON.stringify(b.r));
  const src = ['medicoes', 'titulos', 'profissionais'].map(m => require('fs').readFileSync(require('path').join(__dirname, '..', 'modulos', m + '.js'), 'utf8'));
  ok('K3 exceção das funções separadas, "Apagar (dados de teste)" e "Colar lista" dependem da chave', /master && CW\.piloto\(\), excAv/.test(src[0]) && /master && CW\.piloto\(\) \? `<div id="md-teste"/.test(src[0]) && /master && CW\.piloto\(\), excAv/.test(src[1]) && /CW\.cadastrosMaster && CW\.piloto\(\)/.test(src[2]));
  ok('Sem erros de JavaScript na página', ![...a.erros, ...b.erros].filter(x => !/ERR_NAME_NOT_RESOLVED|404/.test(x)).length, [...a.erros, ...b.erros].join(' | '));
  process.exit(fim());
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
