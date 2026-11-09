/* Teste do Dinheiro do MEI (10/11/2026): "Registrar" sempre à mão, contas do mês (entrou, saiu, sobrou), a receber e a
   pagar, o assistente entendendo frases ("vendi R$ 150 no pix") e só gravando depois do "Confirmar", o faturamento do
   ano somando as vendas, o Início do MEI e o relatório em Excel. Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('dinheiro');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    d.users['lia@lia.com.br'] = { uid: 'uLIA', pass: 'senha123' }; d.docs['usuarios/uLIA'] = { nome: 'Lia Lima', email: 'lia@lia.com.br' };
    d.docs['acessos/lia_uLIA'] = { uid: 'uLIA', empresaId: 'lia', nome: 'Lia Lima', email: 'lia@lia.com.br', cargo: 'admin', extras: [], sem: [], ativo: true };
    d.docs['empresas/lia'] = { nome: 'Lia Lima Doces', cnpj: '33.000.167/0001-01', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas', 'contratos'], criadoPor: 'uLIA' };
    d.docs['empresas/lia/privado/cadastro'] = { dados: { porte: 'MEI' } };
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  const movs = async () => Object.entries(await srv()).filter(([k]) => k.startsWith('movimentos/')).map(([k, v]) => Object.assign({ id: k.split('/')[1] }, v));
  const iso = dt => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const hoje = iso(new Date());
  await H.preparar(page, d); await page.goto(H.BASE);
  await H.entrar(page, 'lia@lia.com.br', 'senha123'); await page.waitForSelector('#mei-grade .mei-tile', { timeout: 8000 }); await H.dorme(400);

  // D1 menu do MEI com Dinheiro logo depois do Início, botão "Registrar" sempre à mão e botão Dinheiro no Início
  const d1 = await page.evaluate(() => ({ menu: Array.from(document.querySelectorAll('#menu [data-mod]')).map(b => b.dataset.mod).slice(0, 3).join(), fab: !!document.getElementById('mei-registrar'), tile: !!document.querySelector('.mei-tile[data-tile="dinheiro"]') }));
  ok('D1 menu do MEI começa por Início, Dinheiro, Agenda; botão "Registrar" à mão; botão Dinheiro no Início', d1.menu === 'inicio,dinheiro,agenda' && d1.fab && d1.tile, JSON.stringify(d1));

  // D2 "Registrar": pede o valor; grava a venda de hoje (já pago, Pix) com histórico
  await page.click('#mei-registrar'); await page.waitForSelector('dialog[open] #dn-valor');
  await page.click('dialog[open] [data-dlg-b="1"]'); const e2 = await page.$eval('dialog[open] #dn-erro', e => e.innerText);
  await page.type('#dn-valor', '20000'); await page.fill('#dn-desc', 'Venda de bolos'); await page.click('dialog[open] [data-dlg-b="1"]'); await H.dorme(500);
  const m2 = (await movs()).find(m => m.descricao === 'Venda de bolos'), s2 = await srv();
  ok('D2 "Registrar": pede o valor e grava a venda de hoje (já paga, Pix), com histórico',
    /Escreva o valor/.test(e2) && m2 && m2.tipo === 'entrada' && m2.valorCentavos === 20000 && m2.categoria === 'Venda' && m2.forma === 'pix' && m2.situacao === 'pago' && m2.pagoEm === hoje && m2.origem === 'manual'
    && Object.values(s2).some(x => x.acao === 'dinheiro.criar' && /Venda de bolos/.test(x.texto)), JSON.stringify({ e2, m2 }));

  // D3 tela Dinheiro: "Saiu" R$ 80 de material; o mês mostra entrou 200, saiu 80, sobrou 120
  await page.evaluate(() => { location.hash = '#dinheiro'; }); await page.waitForSelector('#dn-nums', { timeout: 8000 });
  await page.click('#dn-saiu'); await page.waitForSelector('dialog[open] #dn-valor'); await page.type('#dn-valor', '8000'); await page.selectOption('#dn-cat', 'Material'); await page.fill('#dn-desc', 'Farinha e açúcar');
  await page.click('dialog[open] [data-dlg-b="1"]'); await H.dorme(500);
  const d3 = await page.evaluate(() => ({ e: document.getElementById('dn-entrou-v').innerText, s: document.getElementById('dn-saiu-v').innerText, so: document.getElementById('dn-sobrou-v').innerText, n: document.querySelectorAll('#dn-lista .dn-it').length }));
  ok('D3 Dinheiro do mês: entrou R$ 200, saiu R$ 80, sobrou R$ 120, com os dois movimentos na lista', /200,00/.test(d3.e) && /80,00/.test(d3.s) && /120,00/.test(d3.so) && d3.n === 2, JSON.stringify(d3));

  // D4 conta em aberto que vence hoje: aparece em "A pagar" e em "Para fazer"; "Paguei" marca pago hoje e entra na conta
  await page.click('#dn-saiu'); await page.waitForSelector('dialog[open] #dn-valor'); await page.type('#dn-valor', '5000'); await page.selectOption('#dn-cat', 'Contas (luz, água, internet)'); await page.fill('#dn-desc', 'Conta de luz');
  await page.selectOption('#dn-sit', 'aberto'); await page.fill('#dn-data', hoje); await page.click('dialog[open] [data-dlg-b="1"]'); await H.dorme(500);
  const pag = await page.$eval('#dn-pagar', e => e.innerText), pend = await page.evaluate(() => CW.app.pendencias().map(p => p.txt));
  const id4 = (await movs()).find(m => m.descricao === 'Conta de luz').id;
  await page.click(`[data-quitar="${id4}"]`); await page.waitForSelector('dialog[open]'); await page.click('dialog[open] [data-dlg-b="1"]'); await H.dorme(500);
  const m4 = (await movs()).find(m => m.id === id4), so4 = await page.$eval('#dn-sobrou-v', e => e.innerText);
  ok('D4 conta em aberto: aparece em A pagar e em "Para fazer"; "Paguei" marca paga hoje e o sobrou vira R$ 70',
    /Conta de luz/.test(pag) && pend.includes('Pagar: Conta de luz') && m4.situacao === 'pago' && m4.pagoEm === hoje && /70,00/.test(so4), JSON.stringify({ pend, m4: { s: m4.situacao, p: m4.pagoEm }, so4 }));

  // D5 entender frases (sem IA): valor, tipo, categoria, forma, data e "em aberto"; pergunta não vira lançamento
  const d5 = await page.evaluate(() => { const f = t => { const x = CW.dinheiro.interpretar(t); return x ? [x.tipo, x.valorCentavos, x.categoria, x.forma, x.situacao].join('|') : null; };
    return { a: f('Vendi R$ 200 em produtos hoje e recebi via Pix'), b: f('Comprei R$ 80 de materiais'), c: f('Um cliente ainda está me devendo R$ 150'), d: f('paguei 1.250,50 de aluguel no boleto'),
      e: f('quanto faturei este ano?'), f: f('fiz um conserto e recebi 300 em dinheiro'), g: f('bom dia'), h: CW.dinheiro.interpretar('gastei 40 de gasolina ontem').data }; });
  const ontem = iso(new Date(Date.now() - 864e5));
  ok('D5 entende frases: venda no Pix, compra de material, cliente que deve (em aberto), aluguel no boleto, conserto em dinheiro, "ontem"; pergunta e conversa não viram lançamento',
    d5.a === 'entrada|20000|Venda|pix|pago' && d5.b === 'saida|8000|Material|outro|pago' && d5.c === 'entrada|15000|Outra entrada||aberto' && d5.d === 'saida|125050|Aluguel|boleto|pago'
    && d5.e === null && d5.f === 'entrada|30000|Serviço|dinheiro|pago' && d5.g === null && d5.h === ontem, JSON.stringify(d5));

  // D6 assistente: mostra como entendeu e só grava no "Confirmar"; "Cancelar" não grava nada
  await page.evaluate(() => { location.hash = '#assistentemei'; }); await page.waitForSelector('#as-form', { timeout: 8000 });
  const antes = (await movs()).length;
  await page.fill('#as-q', 'vendi R$ 150 hoje no pix'); await page.press('#as-q', 'Enter'); await page.waitForSelector('[data-lanc-ok]', { timeout: 4000 });
  const t6 = await page.$$eval('.as-m:not(.eu)', ms => ms[ms.length - 1].innerText), semGravar = (await movs()).length === antes;
  await page.click('[data-lanc-ok]'); await H.dorme(600);
  const m6 = (await movs()).find(m => m.origem === 'assistente');
  await page.fill('#as-q', 'comprei 30 de gasolina'); await page.press('#as-q', 'Enter'); await page.waitForSelector('[data-lanc-nao]', { timeout: 4000 });
  await page.click('[data-lanc-nao]'); await H.dorme(400);
  const total6 = (await movs()).length, ult6 = await page.$$eval('.as-m:not(.eu)', ms => ms[ms.length - 1].innerText);
  ok('D6 assistente: "Entendi assim: Entrou R$ 150,00 · Venda · Pix", nada gravado antes de confirmar; Confirmar grava; Cancelar não grava',
    /Entrou R\$\s?150,00 · Venda · Pix · hoje/.test(t6) && semGravar && m6 && m6.valorCentavos === 15000 && total6 === antes + 1 && /não registrei/.test(ult6), JSON.stringify({ t6, semGravar, total6, antes }));

  // D7 o faturamento do ano (limite do MEI) soma as vendas registradas: 200 + 150
  await page.fill('#as-q', 'quanto faturei este ano?'); await page.press('#as-q', 'Enter'); await H.dorme(700);
  const t7 = await page.$$eval('.as-m:not(.eu)', ms => ms[ms.length - 1].innerText);
  ok('D7 o faturamento do ano soma as vendas registradas (R$ 350,00)', /faturou R\$\s?350,00/.test(t7), t7);

  // D8 Início do MEI: "Este mês" com entrou, saiu e sobrou e o botão Dinheiro com o que sobrou
  await page.evaluate(() => { location.hash = '#inicio'; }); await page.waitForSelector('#mei-mes:not([hidden])', { timeout: 8000 });
  const d8 = await page.evaluate(() => ({ mes: document.getElementById('mei-mes').innerText, tile: document.querySelector('.mei-tile[data-tile="dinheiro"]').innerText }));
  ok('D8 Início do MEI: "Este mês" (entrou R$ 350, saiu R$ 130, sobrou R$ 220) e o botão Dinheiro com o que sobrou', /R\$\s?350/.test(d8.mes) && /R\$\s?130/.test(d8.mes) && /Sobrou[\s\S]*R\$\s?220/.test(d8.mes) && /Sobrou R\$\s?220,00 no mês/.test(d8.tile), JSON.stringify(d8));

  // D9 relatório do mês em Excel (com a biblioteca simulada aqui, sem internet)
  await page.evaluate(() => { window.__xls = null; window.XLSX = { utils: { aoa_to_sheet: a => ({ a }), book_new: () => ({ s: [] }), book_append_sheet: (wb, ws, n) => wb.s.push([n, ws]) }, writeFile: (wb, nome) => { window.__xls = { nome, linhas: wb.s[0][1].a }; } }; location.hash = '#dinheiro'; });
  await page.waitForSelector('#dn-xls', { timeout: 6000 }); await page.click('#dn-xls'); await H.dorme(400);
  const x9 = await page.evaluate(() => window.__xls);
  ok('D9 relatório do mês em Excel com os números do mês e os movimentos', x9 && /^Dinheiro-\d{4}-\d{2}\.xlsx$/.test(x9.nome) && x9.linhas.some(l => l[0] === 'Entrou' && l[1] === 350) && x9.linhas.filter(l => /\d{2}\/\d{2}\/\d{4}/.test(l[0] || '')).length === 4, JSON.stringify(x9 && x9.nome));

  // D10 celular: Dinheiro e o formulário cabem sem rolar para o lado; a barra de baixo é Início, Dinheiro, Agenda, Demandas, Mais
  await page.setViewportSize({ width: 390, height: 844 }); await H.dorme(400);
  const lado = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || (document.getElementById('app') || document.body).scrollWidth > innerWidth);
  const bn = await page.$$eval('#bnav button', x => x.map(b => b.innerText.trim().split('\n')[0]));
  await page.click('#mei-registrar'); await page.waitForSelector('dialog[open] #dn-valor'); const larg = await page.evaluate(() => document.querySelector('dialog[open]').getBoundingClientRect().width);
  await page.keyboard.press('Escape');
  ok('D10 celular: Dinheiro e "Registrar" cabem; barra de baixo Início, Dinheiro, Agenda, Demandas, Mais', !lado && larg <= 390 && bn.join() === 'Início,Dinheiro,Agenda,Demandas,Mais', JSON.stringify({ lado, larg, bn }));

  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
