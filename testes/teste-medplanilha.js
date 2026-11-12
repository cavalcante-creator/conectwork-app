/* Teste da medição por planilha (12/11/2026): qualquer cliente lança a medição a partir de um CSV ou Excel
   (Nome, Horas, Valor, CNPJ do MEI), sem depender do painel do RH. Só dados inventados. */
const H = require('./harness');
const fs = require('fs'), path = require('path');
const { ok, fim } = H.placar('medplanilha');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const xl = path.join(__dirname, 'node_modules/xlsx/dist/xlsx.full.min.js');
  if (fs.existsSync(xl)) await page.context().route('https://cdnjs.cloudflare.com/ajax/libs/xlsx/**', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(xl) }));
  const { d } = H.seed(d => {
    Object.assign(d.docs['empresas/alfa'], { modulos: ['equipe', 'cobrancas', 'contratos'], cnpj: '11.444.777/0001-61', razao: 'Alfa Serviços Ltda', tipo: 'contratante' });
    d.docs['empresas/zeta'] = { nome: 'Zeta Manutenção', cnpj: '04.252.011/0001-10', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas'], criadoPor: 'uZECA' };
    d.docs['contratos/cz'] = { modalidade: 'continua', tomadorId: 'alfa', prestadorId: 'zeta', partes: ['alfa', 'zeta'], tomadorNome: 'Alfa Serviços', tomadorCnpj: '11.444.777/0001-61', prestadorNome: 'Zeta Manutenção', prestadorCnpj: '04.252.011/0001-10',
      objeto: 'Equipe de manutenção industrial.', periodicidade: 'quinzena', vencimentoDias: 1, inicio: '2026-01-01', fim: '', status: 'ativo', assinaturas: { tomador: { uid: 'uANA' }, prestador: { uid: 'uZECA' } } };
  });
  await H.preparar(page, d); await page.goto(H.BASE);
  await H.entrar(page, 'ana@alfa.com.br', 'senha123'); await page.waitForSelector('.shell'); await H.dorme(800);
  const abrir = async () => { await page.evaluate(() => { location.hash = '#medicoes'; }); await page.waitForSelector('#md-nova'); await page.click('#md-nova'); await page.waitForSelector('#md-planilha'); };
  const linhas = () => page.$$eval('#md-its .md-it', xs => xs.map(r => [r.querySelector('.md-it-nome').value, r.querySelector('.md-it-horas').value, r.querySelector('.md-it-valor').value, r.dataset.cnpj]));

  // P1 o modelo baixa um CSV com as colunas certas
  await abrir();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#md-modelo')]);
  const modelo = fs.readFileSync(await dl.path(), 'utf8');
  ok('P1 o modelo da planilha tem Nome, Horas, Valor e CNPJ do MEI', /Nome;Horas;Valor;CNPJ do MEI/.test(modelo), modelo);

  // P2 CSV com ponto e vírgula, valores no jeito brasileiro, linha de total e linha sem valor
  const csv = 'Medição da quinzena\nNome;Horas;Valor (R$);CNPJ do MEI\nMaria Fernandes;80,5;1.200,00;\n"Joao Pereira";88;R$ 2.345,67;11.222.333/0001-81\nSem Valor Aqui;10;;\nTotal;168,5;3.545,67;\n';
  await page.setInputFiles('#md-arq', { name: 'medicao.csv', mimeType: 'text/csv', buffer: Buffer.from('﻿' + csv) }); await H.dorme(400);
  const l2 = await linhas(), m2 = await page.$eval('#md-plan-msg', e => e.textContent), t2 = await page.$eval('#md-total', e => e.textContent);
  ok('P2 CSV: preenche as linhas, valores no jeito brasileiro, CNPJ do MEI e ignora o total', l2.length === 2 && l2[0][0] === 'Maria Fernandes' && l2[0][1] === '80,5' && l2[0][2] === '1.200,00' && l2[1][3] === '11222333000181' && /3\.545,67/.test(t2) && /^2 profissionais da planilha/.test(m2) && /1 linha sem nome ou sem valor ficou de fora/.test(m2), JSON.stringify({ l2, m2, t2 }));

  // P3 enviar grava a medição com a memória da planilha
  await page.selectOption('#md-per', { index: 1 });
  await page.click('dialog[open] [data-dlg-b="1"]'); await H.dorme(1000);
  const med = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('__srv')).docs).find(x => x.contratoId === 'cz' && x.memoria));
  ok('P3 a medição é enviada com a memória da planilha', med && med.valorCentavos === 354567 && med.memoria.length === 2 && med.memoria[1].cnpj === '11222333000181' && med.memoria[0].horas === 80.5 && med.status === 'enviada', JSON.stringify(med && med.memoria));

  // P4 Excel (primeira aba), com números do próprio Excel
  await abrir();
  const xlsxBuf = await page.evaluate(async () => { await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
    const ws = XLSX.utils.aoa_to_sheet([['Profissional', 'Horas', 'Valor'], ['Ana Clara Lopes', 40, 980.5], ['Bruno Teixeira', 44.25, 1100]]); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Quinzena');
    return Array.from(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))); });
  await page.setInputFiles('#md-arq', { name: 'medicao.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(xlsxBuf) }); await H.dorme(600);
  const l4 = await linhas(), t4 = await page.$eval('#md-total', e => e.textContent), e4 = await page.$eval('#md-erro', e => e.textContent);
  ok('P4 Excel: lê a primeira aba (coluna "Profissional") com os números do Excel', l4.length === 2 && l4[1][0] === 'Bruno Teixeira' && l4[1][1] === '44,25' && /2\.080,50/.test(t4), JSON.stringify({ l4, t4, e4 }));

  // P5 planilha sem a coluna Valor explica o que fazer
  await page.setInputFiles('#md-arq', { name: 'errada.csv', mimeType: 'text/csv', buffer: Buffer.from('Nome;Horas\nAna Clara Lopes;10\n') }); await H.dorme(300);
  const e5 = await page.$eval('#md-erro', e => e.textContent);
  ok('P5 sem a coluna Valor: diz o que falta e não mexe nas linhas', /coluna "Valor"/.test(e5) && (await linhas()).length === 2, e5);

  // P6 números no jeito brasileiro e americano
  const n6 = await page.evaluate(() => ['1.200', '1.200,50', '1200,5', '1,200.50', '1200.5', 'R$ 3.000'].map(CW.medicoes.numero));
  ok('P6 números: 1.200 · 1.200,50 · 1200,5 · 1,200.50 · 1200.5 · R$ 3.000', JSON.stringify(n6) === JSON.stringify([1200, 1200.5, 1200.5, 1200.5, 1200.5, 3000]), JSON.stringify(n6));

  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED|404/.test(x)).length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
