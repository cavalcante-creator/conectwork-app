/* Teste do Dossiê da relação: junta contrato, triagem, documentos, medições, notas, pagamentos, avaliações e o
   histórico (só para o admin), mostra o que os registros indicam e os pontos de atenção, e gera o PDF. Dados inventados.
   LIBS=<pasta com node_modules de jspdf e jspdf-autotable> usa as bibliotecas de verdade e grava /tmp/dossie.pdf. */
const H = require('./harness');
const { ok, fim } = H.placar('dossie');
const futuro = d => { const x = new Date(); x.setDate(x.getDate() + d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    delete d.docs['acessos/beta_uBRUNO'];
    Object.assign(d.docs['empresas/alfa'], { modulos: ['equipe', 'cobrancas'], cnpj: '11.444.777/0001-61', tipo: 'contratante' });
    d.users['zeca@zeta.com.br'] = { uid: 'uZECA', pass: 'senha123' }; d.docs['usuarios/uZECA'] = { nome: 'Zeca Moura', email: 'zeca@zeta.com.br' };
    d.docs['acessos/zeta_uZECA'] = { uid: 'uZECA', empresaId: 'zeta', nome: 'Zeca Moura', email: 'zeca@zeta.com.br', cargo: 'admin', extras: [], sem: [], ativo: true };
    d.docs['empresas/zeta'] = { nome: 'Zeta Manutenção', cnpj: '04.252.011/0001-10', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas'], criadoPor: 'uZECA' };
    const base = { tomadorId: 'alfa', prestadorId: 'zeta', partes: ['alfa', 'zeta'], tomadorNome: 'Alfa Serviços', prestadorNome: 'Zeta Manutenção', contratoId: 'cz' };
    d.docs['contratos/cz'] = Object.assign({ modalidade: 'continua', tomadorCnpj: '11.444.777/0001-61', prestadorCnpj: '04.252.011/0001-10', objeto: 'Equipe de manutenção industrial com supervisor próprio.', periodicidade: 'quinzena', vencimentoDias: 1, inicio: '2026-08-01', fim: '', status: 'ativo',
      assinaturas: { tomador: { uid: 'uANA', nome: 'Ana Souza', em: '2026-07-30T12:00:00.000Z' }, prestador: { uid: 'uZECA', nome: 'Zeca Moura', em: '2026-07-31T12:00:00.000Z' } }, interlocutor: { nome: 'Zeca Moura', email: 'zeca@zeta.com.br' }, proposta: null,
      triagem: { r: { entrega: 'sim', supervisor: 'sim', ordens: 'nao', jornada: 'nao', exclusiv: 'nao', exempregado: 'nao', socio: 'nao' }, resultado: 'compativel', parecer: null, uid: 'uANA', nome: 'Ana Souza', em: '2026-07-29T12:00:00.000Z' } }, base);
    const med = (per, v, nomes) => Object.assign({ periodicidade: 'quinzena', periodo: per, valorCentavos: v, memoria: nomes.map(n => ({ nome: n, valorCentavos: Math.round(v / nomes.length) })), status: 'aprovada',
      confirmacao: { uid: 'uZECA', nome: 'Zeca Moura', em: '2026-09-02T12:00:00.000Z' }, aprovacao: { uid: 'uALDO', nome: 'Aldo Reis', em: '2026-09-03T12:00:00.000Z' }, criadoPor: 'uRITA' }, base);
    d.docs['medicoes/cz_2026-08-1'] = med('2026-08-1', 700000, ['Pedro Lima', 'Joana Dias']);
    d.docs['medicoes/cz_2026-08-2'] = med('2026-08-2', 712050, ['Pedro Lima', 'Caio Nunes']);
    d.docs['medicoes/cz_2026-09-1'] = Object.assign(med('2026-09-1', 690000, ['Pedro Lima', 'Joana Dias']), { divergencia: { motivo: 'Horas da Joana erradas.' } });
    d.docs['espelhos/cz_2026-08-1'] = Object.assign({ medicaoId: 'cz_2026-08-1', periodo: '2026-08-1', competencia: '2026-08', valorCentavos: 700000, liquidoCentavos: 700000, status: 'nota_ok', nota: { numero: '101', enviadoEm: '2026-09-05T12:00:00.000Z' }, recusadas: [{ numero: '100', motivo: 'Competência errada.' }] }, base);
    d.docs['titulos/cz_2026-08-1'] = Object.assign({ espelhoId: 'cz_2026-08-1', periodo: '2026-08-1', liquidoCentavos: 700000, vencimentoDias: 1, base: '2026-09-06T12:00:00.000Z', status: 'baixado', liquidacao: { data: '2026-09-07', nome: 'Tito Ramos', comprovante: { envio: 'a', partes: 1 } } }, base);
    d.docs['avaliacoes/cz_2026-08-1'] = Object.assign({ tituloId: 'cz_2026-08-1', periodo: '2026-08-1', notas: { qualidade: 5, prazo: 4, comunicacao: 5, escopo: 4 }, comentario: 'Equipe organizada.', resposta: { texto: 'Obrigado!' } }, base);
    ['cnd_federal', 'crf_fgts', 'cndt', 'cnd_municipal', 'pgr'].forEach((t, i) => { d.docs['documentos/d' + i] = { empresaId: 'zeta', tipo: t, nome: t, validade: futuro(90), compartilhar: true, status: 'vigente', arquivo: { envio: 'x', partes: 1, nome: t + '.pdf' }, criadoEm: '2026-10-01T12:00:00.000Z' }; });
    d.docs['log/l1'] = { em: '2026-07-29T12:00:00.000Z', uid: 'uANA', quem: 'Ana Souza', empresaId: 'alfa', acao: 'contrato.triagem', texto: 'Triagem do contrato com Zeta Manutenção: compatível.', ref: 'cz' };
    d.docs['log/l2'] = { em: '2026-09-03T12:00:00.000Z', uid: 'uALDO', quem: 'Aldo Reis', empresaId: 'alfa', acao: 'medicao.aprovar', texto: 'Medição aprovada.', ref: 'cz_2026-08-1' };
    d.docs['log/l3'] = { em: '2026-09-03T12:00:00.000Z', uid: 'uANA', quem: 'Ana Souza', empresaId: 'alfa', acao: 'outro', texto: 'Algo de outro contrato.', ref: 'outro' };
  });
  const LIBS = process.env.LIBS;
  if (LIBS) { const fs = require('fs'), mapa = { 'jspdf.umd.min.js': 'jspdf/dist/jspdf.umd.min.js', 'jspdf.plugin.autotable.min.js': 'jspdf-autotable/dist/jspdf.plugin.autotable.min.js' };
    await page.context().route('https://cdnjs.cloudflare.com/**', r => { const f = Object.keys(mapa).find(k => r.request().url().endsWith(k)); return f ? r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(LIBS + '/node_modules/' + mapa[f], 'utf8') }) : r.abort(); }); }
  else await page.addInitScript(() => {
    class P { constructor() { this.txt = []; this.tabs = []; this.lastAutoTable = { finalY: 40 }; } setFillColor() {} rect() {} setTextColor() {} setFontSize() {} setFont() {} addPage() {} setPage() {} getNumberOfPages() { return 1; } splitTextToSize(t) { return [t]; }
      text(t) { this.txt.push(String(t)); } autoTable(o) { this.tabs.push({ head: o.head[0], body: o.body }); } save(n) { window.__pdf = { nome: n, txt: this.txt, tabs: this.tabs }; } }
    P.API = { autoTable: true }; window.jspdf = { jsPDF: P };
  });
  const entrarComo = async email => { if (await page.$('#sair')) await page.click('#sair'); await page.waitForSelector('#lg-email'); await H.entrar(page, email, 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 }); };
  await H.preparar(page, d); await page.goto(H.BASE);

  // X1 admin de quem contrata abre o dossiê pelo contrato
  await entrarComo('ana@alfa.com.br');
  await page.evaluate(() => { location.hash = '#contratos/ver/cz'; }); await page.waitForSelector('#ct-dossie', { timeout: 8000 });
  await page.click('#ct-dossie'); await page.waitForSelector('#ds-favor', { timeout: 8000 });
  const t = await page.evaluate(() => Object.fromEntries(['ds-favor', 'ds-atencao', 'ds-triagem', 'ds-med', 'ds-notas', 'ds-pag', 'ds-av', 'ds-hist', 'ds-docs'].map(i => [i, (document.getElementById(i) || {}).innerText || ''])));
  ok('X1 o dossiê mostra o que os registros indicam: interlocutor, triagem compatível, medições conferidas e com divergência negociada, valor que varia, equipe que muda, notas, pagamentos com comprovante',
    /interlocutor \(Zeca Moura\)/.test(t['ds-favor']) && /Triagem "compatível"/.test(t['ds-favor']) && /3 medição\(ões\) aprovada\(s\), 3 conferida\(s\)/.test(t['ds-favor']) && /divergência apontada/.test(t['ds-favor'])
    && /de R\$ 6\.900,00 a R\$ 7\.120,50/.test(t['ds-favor']) && /3 profissionais diferentes/.test(t['ds-favor']) && /1 nota\(s\) fiscal/.test(t['ds-favor']) && /1 nota\(s\) recusada/.test(t['ds-favor']) && /1 com comprovante/.test(t['ds-favor']), t['ds-favor'].slice(0, 400));
  ok('X2 pontos de atenção honestos (o PCMSO da prestadora falta) e as seções: triagem, documentos, medições, notas, pagamentos e avaliações',
    /PCMSO/.test(t['ds-atencao']) && /Sim|Não/.test(t['ds-triagem']) && /Joana|Aldo Reis/.test(t['ds-med']) && /101/.test(t['ds-notas']) && /07\/09\/2026/.test(t['ds-pag']) && /Equipe organizada/.test(t['ds-av']) && /PCMSO[\s\S]*Falta enviar/.test(t['ds-docs']), t['ds-atencao']);
  ok('X3 o admin vê o histórico só deste contrato (que ninguém edita nem apaga)', /Triagem do contrato/.test(t['ds-hist']) && /Medição aprovada/.test(t['ds-hist']) && !/outro contrato/.test(t['ds-hist']), t['ds-hist'].slice(0, 200));

  // X4 PDF
  if (LIBS) {
    const fs = require('fs'), [dl] = await Promise.all([page.waitForEvent('download'), page.click('#ds-pdf')]); await dl.saveAs('/tmp/dossie.pdf');
    ok('X4 (biblioteca de verdade) PDF do dossiê gerado', fs.readFileSync('/tmp/dossie.pdf').slice(0, 5).toString() === '%PDF-' && fs.statSync('/tmp/dossie.pdf').size > 4000, String(fs.statSync('/tmp/dossie.pdf').size));
  } else {
    await page.click('#ds-pdf'); await H.dorme(400);
    const p = await page.evaluate(() => window.__pdf);
    ok('X4 PDF do dossiê com as mesmas partes (contrato, indicadores, atenção, triagem, documentos, medições, notas, pagamentos, avaliações, histórico)', p && /Conectwork-dossie-Zeta-Manutencao/.test(p.nome) && p.tabs.length === 10 && p.tabs[1].body.length === A1(p), JSON.stringify(p && { n: p.nome, t: p.tabs.length }));
  }
  function A1(p) { return p.tabs[1].body.length; }

  // X5 a prestadora também abre (sem o histórico de quem contrata)
  await entrarComo('zeca@zeta.com.br');
  await page.evaluate(() => { location.hash = '#contratos/dossie/cz'; }); await page.waitForSelector('#ds-favor', { timeout: 8000 });
  const h5 = await page.$('#ds-hist'), vis = await page.$eval('#view', e => e.innerText);
  ok('X5 a prestadora também abre o dossiê; o histórico que aparece é só o da empresa dela (a da outra não)', !/Triagem do contrato com Zeta Manutenção: compatível/.test(vis) && !!(await page.$('#ds-favor')), String(!!h5));

  // X6 celular
  await page.setViewportSize({ width: 390, height: 844 }); await H.dorme(300);
  ok('X6 celular: dossiê sem rolagem para o lado', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));

  ok('Sem erros de JavaScript na página', !erros.length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
