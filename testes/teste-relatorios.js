/* Teste dos relatórios do mês (notas, retenções, pagamentos, em aberto, medições; Excel e PDF) e da logo da empresa
   (o admin envia em Minha empresa; a outra empresa vê a logo no lugar das iniciais). Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('relatorios');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8Dwn4GBgYGJAQoAAGGYAQdk5CUWAAAAAElFTkSuQmCC', 'base64');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    delete d.docs['acessos/beta_uBRUNO'];
    Object.assign(d.docs['empresas/alfa'], { modulos: ['equipe', 'cobrancas'], cnpj: '11.444.777/0001-61', tipo: 'contratante' });
    d.users['zeca@zeta.com.br'] = { uid: 'uZECA', pass: 'senha123' }; d.docs['usuarios/uZECA'] = { nome: 'Zeca Moura', email: 'zeca@zeta.com.br' };
    d.docs['acessos/zeta_uZECA'] = { uid: 'uZECA', empresaId: 'zeta', nome: 'Zeca Moura', email: 'zeca@zeta.com.br', cargo: 'admin', extras: [], sem: [], ativo: true };
    d.docs['empresas/zeta'] = { nome: 'Zeta Manutenção', cnpj: '04.252.011/0001-10', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas'], criadoPor: 'uZECA' };
    const base = { tomadorId: 'alfa', prestadorId: 'zeta', partes: ['alfa', 'zeta'], tomadorNome: 'Alfa Serviços', prestadorNome: 'Zeta Manutenção', contratoId: 'cz' };
    d.docs['contratos/cz'] = Object.assign({ modalidade: 'continua', objeto: 'Equipe de manutenção.', periodicidade: 'quinzena', vencimentoDias: 1, inicio: '2026-01-01', status: 'ativo', assinaturas: { tomador: {}, prestador: {} }, interlocutor: null, proposta: null }, base);
    const esp = (per, st, x) => Object.assign({ medicaoId: 'cz_' + per, periodo: per, competencia: per.slice(0, 7), valorCentavos: 712050, retencoes: { iss: 35603, inss: 0, ir: 10681, pcc: 0 }, liquidoCentavos: 665766, vencimentoDias: 1, status: st, versao: 1 }, base, x || {});
    d.docs['espelhos/cz_2026-10-1'] = esp('2026-10-1', 'nota_ok', { nota: { numero: '12', chave: '4'.repeat(50) } });
    d.docs['espelhos/cz_2026-10-2'] = esp('2026-10-2', 'aguardando_nota', { valorCentavos: 300000, liquidoCentavos: 300000, retencoes: { iss: 0, inss: 0, ir: 0, pcc: 0 } });
    d.docs['titulos/cz_2026-10-1'] = Object.assign({ espelhoId: 'cz_2026-10-1', periodo: '2026-10-1', notaNumero: '12', valorCentavos: 712050, liquidoCentavos: 665766, vencimentoDias: 1, base: '2026-10-18T12:00:00.000Z', status: 'baixado',
      liquidacao: { data: '2026-10-19', nome: 'Tito Ramos', comprovante: { envio: 'a', partes: 1 } }, conta: { ok: true } }, base);
    d.docs['titulos/cz_2026-09-2'] = Object.assign({}, d.docs['titulos/cz_2026-10-1'], { espelhoId: 'cz_2026-09-2', periodo: '2026-09-2', notaNumero: '9', status: 'liberado', liquidacao: null, base: '2026-10-02T12:00:00.000Z', liquidoCentavos: 400000 });
    d.docs['medicoes/cz_2026-10-2'] = Object.assign({ periodicidade: 'quinzena', periodo: '2026-10-2', valorCentavos: 300000, memoria: [{ nome: 'Pedro Lima', valorCentavos: 300000 }], status: 'aprovada' }, base);
  });
  const entrarComo = async email => { if (await page.$('#sair')) await page.click('#sair'); await page.waitForSelector('#lg-email'); await H.entrar(page, email, 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 }); };
  await H.preparar(page, d);
  const LIBS = process.env.LIBS;   /* LIBS=<pasta com node_modules de xlsx, jspdf e jspdf-autotable>: usa as bibliotecas de verdade */
  if (LIBS) { const fs = require('fs'), mapa = { 'xlsx.full.min.js': 'xlsx/dist/xlsx.full.min.js', 'jspdf.umd.min.js': 'jspdf/dist/jspdf.umd.min.js', 'jspdf.plugin.autotable.min.js': 'jspdf-autotable/dist/jspdf.plugin.autotable.min.js' };
    await page.context().route('https://cdnjs.cloudflare.com/**', r => { const f = Object.keys(mapa).find(k => r.request().url().endsWith(k)); return f ? r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(LIBS + '/node_modules/' + mapa[f], 'utf8') }) : r.abort(); }); }
  if (!LIBS) await page.addInitScript(() => {
    window.XLSX = { utils: { book_new: () => ({ abas: [] }), aoa_to_sheet: aoa => ({ aoa }), book_append_sheet: (wb, ws, n) => wb.abas.push({ n, aoa: ws.aoa }) }, writeFile: (wb, nome) => { window.__xls = { nome, abas: wb.abas }; } };
    class P { constructor() { this.txt = []; this.tabs = []; this.lastAutoTable = { finalY: 40 }; } setFillColor() {} rect() {} setTextColor() {} setFontSize() {} setFont() {} addPage() {} setPage() {} getNumberOfPages() { return 1; }
      text(t) { this.txt.push(String(t)); } autoTable(o) { this.tabs.push({ head: o.head[0], body: o.body }); } save(n) { window.__pdf = { nome: n, txt: this.txt, tabs: this.tabs }; } }
    P.API = { autoTable: true }; window.jspdf = { jsPDF: P };
  });
  await page.goto(H.BASE);

  // R1 financeiro: relatório do mês na tela
  await entrarComo('bruno@alfa.com.br');
  const menu = await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod));
  await page.evaluate(() => { location.hash = '#relatorios/mes/2026-10'; }); await page.waitForSelector('#rl-resumo', { timeout: 8000 });
  const t = await page.evaluate(() => Object.fromEntries(['rl-resumo', 'rl-notas', 'rl-ret', 'rl-pagos', 'rl-abertos', 'rl-med'].map(i => [i, document.getElementById(i).innerText])));
  ok('R1 o financeiro vê o relatório do mês: resumo, notas com retenções, total das retenções, pagos, em aberto e medições',
    menu.includes('relatorios') && /R\$ 7\.120,50/.test(t['rl-notas']) && /R\$ 356,03/.test(t['rl-notas']) && /12/.test(t['rl-notas']) && /Esperando a nota/.test(t['rl-notas'])
    && /ISS\s+R\$ 356,03/.test(t['rl-ret']) && /IR\s+R\$ 106,81/.test(t['rl-ret']) && /19\/10\/2026/.test(t['rl-pagos']) && /Tito Ramos/.test(t['rl-pagos'])
    && /03\/10\/2026/.test(t['rl-abertos']) && /vencido/.test(t['rl-abertos']) && /R\$ 3\.000,00/.test(t['rl-med']) && /Pago no mês\s+R\$ 6\.657,66/.test(t['rl-resumo']), JSON.stringify(t).slice(0, 600));

  // R2 trocar o mês
  await page.selectOption('#rl-mes', '2026-09'); await page.waitForFunction(() => location.hash === '#relatorios/mes/2026-09'); await page.waitForSelector('#rl-resumo', { timeout: 8000 }); await H.dorme(300);
  const n2 = await page.$eval('#rl-notas', e => e.innerText);
  ok('R2 escolher outro mês mostra só a competência dele', /Nenhuma nota fiscal desta competência/.test(n2), n2.slice(0, 120));

  // R3 Excel e PDF
  await page.evaluate(() => { location.hash = '#relatorios/mes/2026-10'; }); await page.waitForSelector('#rl-resumo', { timeout: 8000 });
  if (LIBS) {
    const fs = require('fs'), [dx] = await Promise.all([page.waitForEvent('download'), page.click('#rl-xls')]), px = '/tmp/rel.xlsx'; await dx.saveAs(px);
    const [dp] = await Promise.all([page.waitForEvent('download'), page.click('#rl-pdf')]), pp = '/tmp/rel.pdf'; await dp.saveAs(pp);
    const X = require(LIBS + '/node_modules/xlsx'), wb = X.readFile(px), lin = X.utils.sheet_to_json(wb.Sheets['Notas'], { header: 1 });
    const pdfOk = fs.readFileSync(pp).slice(0, 5).toString() === '%PDF-' && fs.statSync(pp).size > 3000;
    ok('R3 (bibliotecas de verdade) Excel abre com as 6 abas e os valores; PDF gerado', wb.SheetNames.join() === 'Resumo,Notas,Retenções,Pagamentos,Em aberto,Medições' && lin[1][5] === 7120.5 && pdfOk, JSON.stringify({ abas: wb.SheetNames, l: lin[1], pdf: fs.statSync(pp).size }));
  } else {
  await page.click('#rl-xls'); await H.dorme(300); await page.click('#rl-pdf'); await H.dorme(300);
  const arq = await page.evaluate(() => ({ xls: window.__xls, pdf: window.__pdf }));
  const notasXls = (arq.xls.abas.find(a => a.n === 'Notas') || {}).aoa || [];
  ok('R3 Excel com uma aba por parte (valores em reais) e PDF com as mesmas partes',
    /Conectwork-relatorio-2026-10-Alfa-Servicos\.xlsx/.test(arq.xls.nome) && arq.xls.abas.map(a => a.n).join() === 'Resumo,Notas,Retenções,Pagamentos,Em aberto,Medições' && notasXls[1][5] === 7120.5 && notasXls[1][6] === 356.03
    && /\.pdf$/.test(arq.pdf.nome) && arq.pdf.tabs.length === 6 && arq.pdf.txt.some(x => /Outubro\/2026/.test(x)), JSON.stringify({ x: arq.xls.nome, abas: arq.xls.abas.map(a => a.n), l: notasXls[1], p: arq.pdf && arq.pdf.tabs.length }));
  }

  // L1 logo: o admin envia em Minha empresa
  await entrarComo('ana@alfa.com.br');
  await page.evaluate(() => { location.hash = '#empresa'; }); await page.waitForSelector('#me-logo', { timeout: 8000 });
  await page.setInputFiles('#me-logo-arq', { name: 'logo.png', mimeType: 'image/png', buffer: PNG }); await page.waitForSelector('#me-logo .avatar.com-logo img', { timeout: 8000 });
  const lg = JSON.parse(await page.evaluate(() => localStorage.getItem('__srv'))).docs['logos/alfa'];
  ok('L1 o admin envia a logo em Minha empresa: fica guardada (imagem reduzida) e aparece no lugar das iniciais', lg && /^data:image\/png;base64,/.test(lg.d) && lg.por === 'uANA', lg && lg.d.slice(0, 40));

  // L2 a outra empresa vê a logo
  await entrarComo('zeca@zeta.com.br');
  await page.evaluate(() => { location.hash = '#contratos'; }); await page.waitForSelector('#ct-lista', { timeout: 8000 }); await H.dorme(800);
  const img = await page.$('#ct-lista .avatar.com-logo img');
  ok('L2 a prestadora vê a logo da empresa que contrata na lista de contratos', !!img);

  // L3 financeiro não troca a logo
  await entrarComo('bruno@alfa.com.br');
  await page.evaluate(() => { location.hash = '#empresa'; }); await page.waitForSelector('#me-logo', { timeout: 8000 });
  ok('L3 quem não é administrador não troca a logo', !(await page.$('#me-logo-arq')) && /Só o administrador/.test(await page.$eval('#me-logo', e => e.innerText)));

  // R4 celular
  await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => { location.hash = '#relatorios/mes/2026-10'; }); await page.waitForSelector('#rl-resumo'); await H.dorme(300);
  ok('R4 celular: o relatório não rola a página para o lado', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));

  ok('Sem erros de JavaScript na página', !erros.length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
