/* Pacote do mês para o contador (14/11/2026): um .zip com o relatório (PDF e Excel), as notas fiscais da competência e os
   comprovantes dos pagamentos. Usa as bibliotecas de verdade do node_modules (jszip, jspdf, autotable, xlsx). Só dados inventados. */
const H = require('./harness'), fs = require('fs'), path = require('path');
const { ok, fim } = H.placar('pacote');
(async () => {
  const { browser, page, erros } = await H.abrir();
  const b64 = t => Buffer.from(t).toString('base64');
  const { d } = H.seed(d => {
    delete d.docs['acessos/beta_uBRUNO'];
    Object.assign(d.docs['empresas/alfa'], { modulos: ['equipe', 'cobrancas'], cnpj: '11.444.777/0001-61', tipo: 'contratante' });
    d.docs['empresas/zeta'] = { nome: 'Zeta Manutenção', cnpj: '04.252.011/0001-10', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas'], criadoPor: 'uZECA' };
    const base = { tomadorId: 'alfa', prestadorId: 'zeta', partes: ['alfa', 'zeta'], tomadorNome: 'Alfa Serviços', prestadorNome: 'Zeta Manutenção', contratoId: 'cz' };
    d.docs['espelhos/cz_2026-10-1'] = Object.assign({ medicaoId: 'cz_2026-10-1', periodo: '2026-10-1', competencia: '2026-10', valorCentavos: 712050, retencoes: { iss: 0, inss: 0, ir: 0, pcc: 0 }, liquidoCentavos: 712050, vencimentoDias: 1, status: 'nota_ok', versao: 1,
      nota: { numero: '12', chave: '4'.repeat(50), tipo: 'xml', nomeArquivo: 'nota12.xml', envio: 'nx', partes: 1 } }, base);
    d.docs['espelhos/cz_2026-10-1/arquivos/nx-0'] = { d: b64('<NFSe><Numero>12</Numero></NFSe>'), k: 0, envio: 'nx' };
    d.docs['titulos/cz_2026-10-1'] = Object.assign({ espelhoId: 'cz_2026-10-1', periodo: '2026-10-1', notaNumero: '12', valorCentavos: 712050, liquidoCentavos: 712050, vencimentoDias: 1, base: '2026-10-18T12:00:00.000Z', status: 'liquidado',
      liquidacao: { data: '2026-10-19', nome: 'Tito Ramos', comprovante: { envio: 'cp', partes: 1, tipo: 'application/pdf', nome: 'comp.pdf' } }, conta: { ok: true } }, base);
    d.docs['titulos/cz_2026-10-1/arquivos/cp-0'] = { d: b64('%PDF-1.4 comprovante de teste'), k: 0, envio: 'cp' };
  });
  await H.preparar(page, d);
  const mapa = { 'jszip.min.js': 'jszip/dist/jszip.min.js', 'xlsx.full.min.js': 'xlsx/dist/xlsx.full.min.js', 'jspdf.umd.min.js': 'jspdf/dist/jspdf.umd.min.js', 'jspdf.plugin.autotable.min.js': 'jspdf-autotable/dist/jspdf.plugin.autotable.min.js' };
  await page.context().route('https://cdnjs.cloudflare.com/**', r => { const f = Object.keys(mapa).find(k => r.request().url().endsWith(k)); return f ? r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(__dirname, 'node_modules', mapa[f]), 'utf8') }) : r.abort(); });
  await page.goto(H.BASE); await H.entrar(page, 'bruno@alfa.com.br', 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 });
  await page.evaluate(() => { location.hash = '#relatorios/mes/2026-10'; }); await page.waitForSelector('#rl-pacote', { timeout: 8000 });
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#rl-pacote')]);
  const buf = fs.readFileSync(await dl.path()), JSZip = require('jszip'), z = await JSZip.loadAsync(buf), nomes = Object.keys(z.files).filter(n => !z.files[n].dir).sort();
  ok('P1 baixa um .zip com o relatório em PDF e Excel, a nota fiscal, o comprovante e o LEIA-ME', /\.zip$/.test(dl.suggestedFilename()) && nomes.includes('Relatorio-2026-10.pdf') && nomes.includes('Relatorio-2026-10.xlsx')
    && nomes.some(n => /^Notas fiscais\/A pagar\/Zeta Manutencao - nota 12\.xml$/.test(n)) && nomes.some(n => /^Comprovantes de pagamento\/Pagos\/2026-10-19 - Zeta Manutencao\.pdf$/.test(n)) && nomes.includes('LEIA-ME.txt'), JSON.stringify(nomes));
  const xml = await z.file(nomes.find(n => /\.xml$/.test(n))).async('string'), leia = await z.file('LEIA-ME.txt').async('string');
  ok('P2 a nota vai como veio (o XML) e o LEIA-ME conta o que tem', /<Numero>12<\/Numero>/.test(xml) && /Notas fiscais: 1/.test(leia) && /Comprovantes de pagamento: 1/.test(leia), leia.slice(0, 300));
  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED|404|ERR_FAILED/.test(x)).length, erros.join(' | '));
  await browser.close(); process.exit(fim());
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
