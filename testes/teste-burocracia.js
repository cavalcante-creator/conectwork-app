/* Teste do que tira burocracia de quem emite a nota: assistente de emissão (passo a passo com campos para copiar e o
   "meu modelo de nota") e a "Empresa em dia" do MEI (DAS do mês, relatório mensal das receitas brutas em PDF e
   declaração anual DASN-SIMEI, com avisos no Início). Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('burocracia');
const hoje = new Date(), iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const mes = n => { const d = new Date(hoje.getFullYear(), hoje.getMonth() - n, 1); return iso(d); };
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const txtMes = m => MESES[+m.slice(5, 7) - 1] + '/' + m.slice(0, 4);

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    delete d.docs['acessos/beta_uBRUNO'];
    Object.assign(d.docs['empresas/alfa'], { modulos: ['equipe', 'cobrancas', 'contratos'], cnpj: '11.444.777/0001-61', tipo: 'contratante' });
    d.users['lia@lia.com.br'] = { uid: 'uLIA', pass: 'senha123' }; d.docs['usuarios/uLIA'] = { nome: 'Lia Lima', email: 'lia@lia.com.br' };
    d.docs['acessos/lia_uLIA'] = { uid: 'uLIA', empresaId: 'lia', nome: 'Lia Lima', email: 'lia@lia.com.br', cargo: 'admin', extras: [], sem: [], ativo: true };
    d.docs['empresas/lia'] = { nome: 'Lia Lima Elétrica', razao: 'Lia Lima 12345678000', cnpj: '33.000.167/0001-01', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas'], criadoPor: 'uLIA' };
    d.docs['empresas/lia/privado/cadastro'] = { dados: { porte: 'MEI', regime: 'MEI (SIMEI)' } };
    const base = { tomadorId: 'alfa', prestadorId: 'lia', partes: ['alfa', 'lia'], tomadorNome: 'Alfa Serviços', prestadorNome: 'Lia Lima Elétrica', prestadorCnpj: '33.000.167/0001-01', contratoId: 'co' };
    d.docs['espelhos/e1'] = Object.assign({ medicaoId: 'e1', origem: 'medicao', periodo: '2026-10-2', competencia: '2026-10', valorCentavos: 300000, liquidoCentavos: 285000, retencoes: { iss: 15000, inss: 0, ir: 0, pcc: 0 }, vencimentoDias: 1, status: 'aguardando_nota',
      descricao: 'Prestação de serviços: manutenção elétrica. Período: 2ª quinzena de outubro.', tomador: { razao: 'Alfa Serviços Ltda', cnpj: '11.444.777/0001-61', cidade: 'Gravataí', uf: 'RS' }, versao: 1 }, base);
    d.docs['espelhos/e2'] = Object.assign({}, d.docs['espelhos/e1'], { medicaoId: 'e2', periodo: mes(1), competencia: mes(1), valorCentavos: 450000, status: 'nota_ok', nota: { numero: '77' } });
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  await H.preparar(page, d);
  await page.addInitScript(() => {
    window.__cop = []; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__cop.push(t); return Promise.resolve(); } } });
    class P { constructor() { this.txt = []; } setFontSize() {} setFont() {} splitTextToSize(t) { return [t]; } text(t) { this.txt.push(String(t)); } save(n) { window.__pdf = { nome: n, txt: this.txt }; } }
    window.jspdf = { jsPDF: P };
  });
  await page.goto(H.BASE); await H.entrar(page, 'lia@lia.com.br', 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 });

  // B1 assistente: passo a passo com data de competência, CNPJ, descrição, valor e ISS retido
  await page.evaluate(() => { location.hash = '#espelhos/ver/e1'; }); await page.waitForSelector('#as-card', { timeout: 8000 });
  await page.evaluate(() => document.querySelectorAll('#as-card details').forEach(x => { x.open = true; }));
  const as = await page.$eval('#as-card', e => e.innerText);
  await page.click('#as-card [data-cp="31/10/2026"]'); await page.click('#as-card [data-cp="11444777000161"]');
  const cop = await page.evaluate(() => window.__cop);
  ok('B1 o assistente segue as telas do emissor e deixa cada campo pronto para copiar (competência 31/10, CNPJ, valor, ISS retido)',
    /Pessoas: competência e tomador/.test(as) && /31\/10\/2026/.test(as) && /Valores e retenções/.test(as) && /3\.000,00/.test(as) && /ISS retido pelo tomador[\s\S]*150,00/.test(as) && cop.join() === '31/10/2026,11444777000161' && /Salve o seu modelo de nota/.test(as), as.slice(0, 200));

  // B2 meu modelo de nota: salva uma vez e aparece no passo do serviço
  await page.click('#as-modelo'); await page.waitForSelector('#mn-cod'); await page.fill('#mn-cod', '1401'); await page.click('dialog[open] [data-dlg-b="1"]');
  const e2 = await page.$eval('#mn-erro', e => e.innerText);
  await page.fill('#mn-cod', '140101'); await page.fill('#mn-desc', 'Lubrificação, limpeza e revisão de máquinas'); await page.fill('#mn-mun', 'Gravataí/RS'); await page.click('dialog[open] [data-dlg-b="1"]'); await H.dorme(800);
  await page.evaluate(() => document.querySelectorAll('#as-card details').forEach(x => { x.open = true; }));
  const as2 = await page.$eval('#as-card', e => e.innerText), mod = (await srv())['notamodelo/lia'];
  ok('B2 "meu modelo de nota": código com formato conferido, salvo uma vez e já aparece no passo do serviço', /6 números/.test(e2) && mod && mod.codigo === '14.01.01' && /14\.01\.01 · Lubrificação/.test(as2) && !/Salve o seu modelo/.test(as2), e2);

  // B3 empresa em dia: DAS dos 3 meses anteriores; o mais antigo já venceu e aparece no Início
  await page.evaluate(() => { location.hash = '#inicio'; }); await page.waitForSelector('#ini-pv', { timeout: 8000 }); await H.dorme(800);
  const pv = await page.$$eval('#ini-pv .pv-it strong', x => x.map(e => e.innerText));
  await page.evaluate(() => { location.hash = '#negocio'; }); await page.waitForSelector('#ng-agenda', { timeout: 8000 });
  const ag = await page.$eval('#ng-agenda', e => e.innerText);
  ok('B3 a agenda do MEI mostra o DAS dos meses anteriores (vence dia 20) e o vencido entra no "Precisa de você"',
    new RegExp('DAS de ' + txtMes(mes(3))).test(ag) && new RegExp('DAS de ' + txtMes(mes(1))).test(ag) && /Vencido/.test(ag) && pv.includes(`DAS de ${txtMes(mes(3))} vencido`) && !!(await page.$('#ng-agenda a[href*="pgmei"]')), JSON.stringify(pv));

  // B4 "já paguei" tira o aviso
  await page.click(`[data-pagou="${mes(3)}"]`); await H.dorme(800);
  const fi = (await srv())['fiscal/lia'];
  await page.evaluate(() => { location.hash = '#inicio'; }); await page.waitForSelector('#ini-pv', { timeout: 8000 }); await H.dorme(800);
  const pv4 = await page.$$eval('#ini-pv .pv-it strong', x => x.map(e => e.innerText));
  ok('B4 "Já paguei" grava o DAS como pago e o aviso sai do Início', fi && fi.das[mes(3)].pago && !pv4.includes(`DAS de ${txtMes(mes(3))} vencido`), JSON.stringify(pv4));

  // B5 relatório mensal das receitas brutas em PDF, com as notas do mês
  await page.evaluate(() => { location.hash = '#negocio'; }); await page.waitForSelector('#ng-rel', { timeout: 8000 });
  await page.selectOption('#ng-rel-mes', mes(1)); await page.click('#ng-rel'); await H.dorme(500);
  const p = await page.evaluate(() => window.__pdf);
  ok('B5 o relatório mensal das receitas brutas sai em PDF no modelo oficial, com as notas do mês (serviços com nota = R$ 4.500,00)',
    p && p.nome === `Relatorio-receitas-brutas-${mes(1)}.pdf` && p.txt.includes('RELATÓRIO MENSAL DAS RECEITAS BRUTAS') && p.txt.some(t => /^R\$ 4\.500,00$/.test(t)) && p.txt.some(t => /Nota 77/.test(t)), JSON.stringify(p && p.txt.slice(0, 8)));

  // B6 DASN-SIMEI: valor do ano para copiar e "já entreguei"
  const dn = await page.$eval('#ng-dasn', e => e.innerText);
  await page.click('#ng-dasn-ok'); await page.waitForSelector('dialog[open]'); await page.click('dialog[open] [data-dlg-b="1"]'); await H.dorme(800);
  const fi6 = (await srv())['fiscal/lia'], ano = hoje.getFullYear() - 1;
  ok('B6 a declaração anual (DASN-SIMEI) mostra o prazo e o valor do ano, e "já entreguei" fica registrado', new RegExp('DASN-SIMEI\\) de ' + ano).test(dn) && /31\/05/.test(dn) && fi6.dasn[ano] && fi6.dasn[ano].entregue, dn.slice(0, 120));

  // B7 celular
  await page.setViewportSize({ width: 390, height: 844 }); await H.dorme(300);
  ok('B7 celular: agenda do MEI sem rolagem para o lado', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));

  ok('Sem erros de JavaScript na página', !erros.length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
