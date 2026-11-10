/* Teste do Início do MEI no layout novo, do DAS do ano e do Check-up do CNPJ (10/11/2026): faixa com nome e CNPJ,
   alerta de DAS vencido, "Serviços pra você", dados do MEI com copiar CNPJ, DAS mês a mês com "Paguei"/"Não paguei"
   (grava em fiscal/ com histórico) e o check-up dizendo o que falta. Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('meudas');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const ano = new Date().getFullYear();
  const { d } = H.seed(d => {
    d.users['lia@lia.com.br'] = { uid: 'uLIA', pass: 'senha123' }; d.docs['usuarios/uLIA'] = { nome: 'Lia Lima', email: 'lia@lia.com.br' };
    d.docs['acessos/lia_uLIA'] = { uid: 'uLIA', empresaId: 'lia', nome: 'Lia Lima', email: 'lia@lia.com.br', cargo: 'admin', extras: [], sem: [], ativo: true };
    d.docs['empresas/lia'] = { nome: 'Lia Lima Doces', razao: 'Lia Lima 33000167000101', cnpj: '33.000.167/0001-01', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas', 'contratos'], criadoPor: 'uLIA' };
    d.docs['empresas/lia/privado/cadastro'] = { dados: { porte: 'MEI', abertura: `${ano}-01-05` } };
    d.docs['fiscal/lia'] = { das: { [`${ano}-01`]: { pago: true, data: `${ano}-02-18` } }, dasn: {} };
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  await H.preparar(page, d); await page.goto(H.BASE);
  await H.entrar(page, 'lia@lia.com.br', 'senha123'); await page.waitForSelector('#mei-servicos .mh-serv', { timeout: 8000 }); await H.dorme(600);

  // M1 Início: "Olá, Lia", CNPJ, alerta de DAS vencido, serviços com o DAS em destaque e dados do MEI
  const m1 = await page.evaluate(() => ({ ola: document.getElementById('mh-ola').innerText, cnpj: (document.getElementById('mh-cnpj') || {}).innerText, alerta: document.getElementById('mh-alerta').hidden ? '' : document.getElementById('mh-alerta').innerText,
    prim: (document.querySelector('.mh-serv.prim') || {}).dataset ? document.querySelector('.mh-serv.prim').dataset.tile : '', dados: document.getElementById('mh-dados').innerText }));
  ok('M1 Início do MEI: "Olá, Lia" com o CNPJ, alerta com o mesmo número de DAS vencidos da tela DAS, DAS em destaque nos serviços e "Dados do seu MEI"',
    m1.ola === 'Olá, Lia' && m1.cnpj === '33.000.167/0001-01' && /DAS vencido/.test(m1.alerta) && /Regularize/.test(m1.alerta) && m1.prim === 'das' && /Lia Lima 33000167000101/.test(m1.dados) && /cartão CNPJ/.test(m1.dados), JSON.stringify(m1));

  // M2 copiar o CNPJ (só números)
  await page.evaluate(() => { window.__cp = null; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__cp = t; return Promise.resolve(); } } }); });
  await page.click('#mh-copiar'); await H.dorme(200);
  ok('M2 "Copiar o CNPJ" copia só os números', (await page.evaluate(() => window.__cp)) === '33000167000101');

  // M3 o alerta abre o DAS do ano: meses deste ano com Pago (janeiro) e Vencido (os outros que já venceram), troca de ano e link oficial
  await page.click('#mh-alerta'); await page.waitForSelector('#das-lista', { timeout: 6000 });
  const m3 = await page.evaluate(() => ({ h: location.hash, jan: (document.querySelector(`[data-mes$="-01"]`) || {}).innerText || '', venc: document.querySelectorAll('.das-it.vencido').length, link: document.getElementById('das-gerar').href, alerta: !!document.getElementById('das-alerta') }));
  const nAlerta = +((m1.alerta.match(/(\d+) DAS vencidos/) || [])[1] || 1);
  ok('M3b o alerta do Início conta os mesmos DAS vencidos da tela do DAS (desde a abertura)', nAlerta === m3.venc, JSON.stringify({ nAlerta, venc: m3.venc }));
  ok('M3 DAS do ano: janeiro "Pago" com a data, os vencidos marcados, aviso no alto e "Gerar a guia no site oficial"',
    m3.h === '#mei/das' && /Pago/.test(m3.jan) && /Pago em 18\/02/.test(m3.jan) && m3.venc >= 1 && /receita\.fazenda\.gov\.br/.test(m3.link) && m3.alerta, JSON.stringify(m3));

  // M4 "Paguei" grava em fiscal/ com o histórico; "Não paguei" volta
  const mes = await page.$eval('.das-it.vencido', e => e.dataset.mes);
  await page.click(`[data-paguei="${mes}"]`); await page.waitForSelector('dialog[open]'); await page.click('dialog[open] [data-dlg-b="1"]'); await H.dorme(500);
  const s4 = await srv(), pagou = s4['fiscal/lia'].das[mes] && s4['fiscal/lia'].das[mes].pago === true, log4 = Object.values(s4).some(x => x.acao === 'negocio.fiscal' && /marcado como pago/.test(x.texto));
  await page.click(`[data-naopaguei="${mes}"]`); await page.waitForSelector('dialog[open]'); await page.click('dialog[open] [data-dlg-b="1"]'); await H.dorme(500);
  const volta = (await srv())['fiscal/lia'].das[mes].pago === false;
  ok('M4 "Paguei" grava o pagamento com histórico; "Não paguei" desfaz', pagou && log4 && volta, JSON.stringify({ mes, pagou, log4, volta }));

  // M5 Check-up: aponta o DAS vencido como ponto a resolver e mostra o limite e a declaração
  await page.evaluate(() => { location.hash = '#mei/checkup'; }); await page.waitForSelector('#ck-lista', { timeout: 8000 });
  const m5 = await page.evaluate(() => ({ res: document.getElementById('ck-res').innerText, itens: Array.from(document.querySelectorAll('.ck-it')).map(x => x.dataset.ck + ':' + x.className.split(' ')[1]) }));
  ok('M5 Check-up: "pontos para resolver" com o DAS vencido; limite dentro; declaração e cadastro na rede',
    /para resolver/.test(m5.res) && m5.itens.includes('das:ruim') && m5.itens.includes('limite:bom') && m5.itens.some(x => x.startsWith('dasn:')) && m5.itens.includes('rede:bom'), JSON.stringify(m5));

  // M6 pagando tudo, o check-up diz que está em dia
  const venc = await page.evaluate(() => null);
  await page.evaluate(() => { location.hash = '#mei/das'; }); await page.waitForSelector('#das-lista');
  for (let i = 0; i < 12; i++) { const b = await page.$('[data-paguei]'); if (!b) break; await b.click(); await page.waitForSelector('dialog[open]'); await page.click('dialog[open] [data-dlg-b="1"]'); await H.dorme(350); }
  await page.evaluate(() => { location.hash = '#mei/checkup'; }); await page.waitForSelector('#ck-lista', { timeout: 8000 });
  const m6 = await page.$eval('#ck-res', e => e.innerText);
  ok('M6 com os DAS pagos, o check-up mostra "Seu MEI está em dia"', /Seu MEI está em dia/.test(m6), m6);

  // M7 celular: Início, DAS e Check-up cabem sem rolar para o lado
  await page.setViewportSize({ width: 390, height: 844 }); await H.dorme(300);
  const lado = async () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth || (document.getElementById('app') || document.body).scrollWidth > innerWidth);
  const l1 = await lado(); await page.evaluate(() => { location.hash = '#mei/das'; }); await page.waitForSelector('#das-lista'); const l2 = await lado();
  await page.evaluate(() => { location.hash = '#inicio'; }); await page.waitForSelector('#mei-servicos .mh-serv'); await H.dorme(300); const l3 = await lado();
  ok('M7 celular: Check-up, DAS e Início cabem sem rolar para o lado', !l1 && !l2 && !l3, JSON.stringify({ l1, l2, l3 }));

  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
