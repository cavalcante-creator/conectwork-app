/* Conferir pelo extrato do banco (14/11/2026): a tesouraria importa o OFX (ou CSV) e confirma de uma vez os pagamentos
   agendados que aparecem no extrato. Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('extrato');
(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    Object.assign(d.docs['empresas/alfa'], { modulos: ['equipe', 'cobrancas'], tipo: 'contratante' });
    const pessoa = (uid, email, nome, emp, cargo) => { d.users[email] = { uid, pass: 'senha123' }; d.docs['usuarios/' + uid] = { nome, email }; d.docs[`acessos/${emp}_${uid}`] = { uid, empresaId: emp, nome, email, cargo, extras: [], sem: [], ativo: true }; };
    pessoa('uTITO', 'tito@alfa.com.br', 'Tito Ramos', 'alfa', 'tesouraria');
    const t = (id, nome, v, extra) => Object.assign({ espelhoId: id, contratoId: 'cz', tomadorId: 'alfa', prestadorId: 'zeta', partes: ['alfa', 'zeta'], tomadorNome: 'Alfa Serviços', prestadorNome: nome, periodo: '2026-10-2', competencia: '2026-10',
      valorCentavos: v, liquidoCentavos: v, retencoes: { iss: 0, inss: 0, ir: 0, pcc: 0 }, vencimentoDias: 1, base: '2026-11-05T00:00:00Z', status: 'agendado', conta: { ok: true },
      aprovacao: { uid: 'uX', nome: 'X' }, liberacao: { uid: 'uANA', nome: 'Ana' }, agendamento: { uid: 'uTITO', nome: 'Tito', data: '2026-11-10' }, criadoEm: '2026-11-05T00:00:00Z' }, extra || {});
    d.docs['titulos/t1'] = t('t1', 'Zeta Manutenção', 350000);
    d.docs['titulos/t2'] = t('t2', 'Bia Costa', 120000);
    d.docs['titulos/t3'] = t('t3', 'Caio Nunes', 99900);
  });
  await H.preparar(page, d); await page.goto(H.BASE);
  await H.entrar(page, 'tito@alfa.com.br', 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 }); await H.dorme(600);
  await page.evaluate(() => { location.hash = '#titulos'; }); await page.waitForSelector('#tt-extrato', { timeout: 10000 });
  ok('X1 a tesouraria vê "Conferir pelo extrato" com pagamentos agendados', true);
  const ofx = `OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261110120000<TRNAMT>-3500.00<FITID>A1<NAME>PIX ZETA MANUTENCAO LTDA</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261111<TRNAMT>-1200,00<FITID>A2<MEMO>PIX BIA COSTA</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261111<TRNAMT>999.00<FITID>A3<MEMO>RECEBIMENTO</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  await page.setInputFiles('#tt-ext-arq', { name: 'extrato.ofx', mimeType: 'application/x-ofx', buffer: Buffer.from(ofx) });
  await page.waitForSelector('dialog[open] #tt-ex-lista', { timeout: 8000 });
  const r = await page.evaluate(() => Array.from(document.querySelectorAll('dialog[open] [data-ex]')).map(i => ({ c: i.checked, d: i.disabled, t: i.closest('label').innerText.replace(/\s+/g, ' ') })));
  ok('X2 acha no extrato os dois pagamentos (valor e nome) e marca; o que não está no extrato fica sem marcar', r.length === 3 && r.filter(x => x.c).length === 2 && r.some(x => /Caio Nunes/.test(x.t) && x.d && /Não achei/.test(x.t)) && r.some(x => /Zeta/.test(x.t) && /10\/11\/2026/.test(x.t)), JSON.stringify(r));
  await page.click('dialog[open] [data-dlg-b="1"]'); await H.dorme(1500);
  const S = await page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  ok('X3 os dois ficam pagos com a data do extrato e o trecho do extrato como comprovante; o terceiro continua agendado', S['titulos/t1'].status === 'liquidado' && S['titulos/t1'].liquidacao.data === '2026-11-10' && S['titulos/t1'].liquidacao.comprovante.tipo === 'text/plain'
    && S['titulos/t2'].status === 'liquidado' && S['titulos/t3'].status === 'agendado' && Object.keys(S).some(k => /^titulos\/t1\/arquivos\//.test(k)) && Object.values(S).filter(x => x && x.acao === 'titulo.liquidar').length === 2, JSON.stringify(S['titulos/t1'].liquidacao));
  const csv = await page.evaluate(() => { const m = CW.titulos.lerCsvExtrato('Data;Histórico;Valor\n10/11/2026;PIX ENVIADO CAIO NUNES;-999,00\n11/11/2026;TARIFA;-12,50\n'); return CW.titulos.casarExtrato(m, [{ prestadorNome: 'Caio Nunes', liquidoCentavos: 99900, agendamento: { data: '2026-11-10' } }]); });
  ok('X4 também lê planilha (CSV) do banco: Data, Histórico e Valor', csv[0].certo && csv[0].m.data === '2026-11-10', JSON.stringify(csv));
  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED|404/.test(x)).length, erros.join(' | '));
  await browser.close(); process.exit(fim());
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
