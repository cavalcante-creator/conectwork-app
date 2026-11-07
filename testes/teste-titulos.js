/* Teste de tela de Pagar e receber (Etapa 2, parte 6): o título nasce com a nota conferida, vencimento pelo contrato,
   funções separadas (quem conferiu não libera; quem liberou não confirma o pagamento), conta da prestadora com revisão
   reforçada na troca, agendamento, pagamento com comprovante, baixa pela prestadora e calendário. Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('titulos');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    delete d.docs['acessos/beta_uBRUNO'];
    Object.assign(d.docs['empresas/alfa'], { modulos: ['equipe', 'cobrancas'], cnpj: '11.444.777/0001-61', razao: 'Alfa Serviços Ltda', tipo: 'contratante' });
    const pessoa = (uid, email, nome, emp, cargo) => { d.users[email] = { uid, pass: 'senha123' }; d.docs['usuarios/' + uid] = { nome, email }; d.docs[`acessos/${emp}_${uid}`] = { uid, empresaId: emp, nome, email, cargo, extras: [], sem: [], ativo: true }; };
    pessoa('uALDO', 'aldo@alfa.com.br', 'Aldo Reis', 'alfa', 'aprovador');
    d.docs['contratos/cz'] = { modalidade: 'continua', tomadorId: 'alfa', prestadorId: 'zeta', partes: ['alfa', 'zeta'], tomadorNome: 'Alfa Serviços', tomadorCnpj: '11.444.777/0001-61', prestadorNome: 'Zeta Manutenção', prestadorCnpj: '04.252.011/0001-10',
      objeto: 'Equipe de manutenção industrial.', periodicidade: 'quinzena', vencimentoDias: 1, inicio: '2026-01-01', fim: '', status: 'ativo', assinaturas: { tomador: { uid: 'uANA', nome: 'Ana Souza' }, prestador: { uid: 'uZECA', nome: 'Zeca Moura' } }, interlocutor: null, proposta: null };
    pessoa('uTITO', 'tito@alfa.com.br', 'Tito Ramos', 'alfa', 'tesouraria');
    pessoa('uZECA', 'zeca@zeta.com.br', 'Zeca Moura', 'zeta', 'admin');
    d.docs['empresas/zeta'] = { nome: 'Zeta Manutenção', razao: 'Zeta Manutenção Ltda', cnpj: '04.252.011/0001-10', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas'], criadoPor: 'uZECA' };
    d.docs['empresas/zeta/privado/cadastro'] = { banco: { banco: '341 · Itaú Unibanco', agencia: '1234', conta: '56789-0', tipoConta: 'Corrente', pix: '04252011000110' } };
    d.docs['espelhos/cz_2026-10-2'] = { medicaoId: 'cz_2026-10-2', contratoId: 'cz', tomadorId: 'alfa', prestadorId: 'zeta', partes: ['alfa', 'zeta'], tomadorNome: 'Alfa Serviços', prestadorNome: 'Zeta Manutenção', prestadorCnpj: '04.252.011/0001-10',
      tomador: { razao: 'Alfa Serviços Ltda', cnpj: '11.444.777/0001-61' }, periodo: '2026-10-2', competencia: '2026-10', descricao: 'Prestação de serviços de manutenção.', valorCentavos: 712050,
      retencoes: { iss: 35603, inss: 0, ir: 10681, pcc: 0 }, liquidoCentavos: 665766, vencimentoDias: 1, obs: '', status: 'nota_enviada', versao: 1,
      nota: { tipo: 'pdf', nomeArquivo: 'nota.pdf', tam: 1000, envio: 'ab', partes: 1, chaveUnica: '4'.repeat(50), chave: '4'.repeat(50), numero: '12', conferencia: { ok: true, manual: false, itens: [] }, enviadoPor: 'uZECA', enviadoPorNome: 'Zeca Moura' } };
  });
  const ID = 'cz_2026-10-2';
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  const tit = async () => (await srv())['titulos/' + ID];
  const logs = async a => Object.values(await srv()).filter(x => x.acao === a);
  const entrarComo = async email => { if (await page.$('#sair')) await page.click('#sair'); await page.waitForSelector('#lg-email'); await H.entrar(page, email, 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 }); };
  const abrir = async () => { await page.evaluate(id => { location.hash = '#titulos/ver/' + id; }, ID); await page.waitForSelector('#tt-passos', { timeout: 8000 }); };
  const dlgOk = () => page.click('dialog[open] [data-dlg-b="1"]');
  const acoes = () => page.evaluate(() => (document.getElementById('tt-acoes') || {}).innerText || '');
  const amanha = (() => { const x = new Date(); x.setDate(x.getDate() + 1); return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}/${x.getFullYear()}`; })();

  // T1 a nota conferida vira título "aprovado", com vencimento = hoje + dias do contrato
  await H.preparar(page, d); await page.goto(H.BASE);
  await entrarComo('bruno@alfa.com.br');
  await page.evaluate(id => { location.hash = '#espelhos/ver/' + id; }, ID); await page.waitForSelector('#es-nf-ok', { timeout: 8000 });
  await page.click('#es-nf-ok'); await page.waitForSelector('dialog[open]'); await dlgOk(); await page.waitForSelector('#es-titulo', { timeout: 8000 });
  let t = await tit();
  await page.click('#es-titulo'); await page.waitForSelector('#tt-passos', { timeout: 8000 });
  const venc = await page.$eval('#tt-vencimento', e => e.innerText), a1 = await acoes();
  ok('T1 nota conferida vira título a pagar (aprovado), vencimento = dia da nota válida + 1 dia; quem conferiu não libera',
    t && t.status === 'aprovado' && t.liquidoCentavos === 665766 && t.aprovacao.uid === 'uBRUNO' && venc === amanha && /Outra pessoa libera/.test(a1) && (await logs('titulo.criar')).length === 1, JSON.stringify({ venc, amanha, a1 }));

  // T2 o admin libera
  await entrarComo('ana@alfa.com.br');
  await page.evaluate(() => { location.hash = '#titulos'; }); await page.waitForSelector('#tt-minhas', { timeout: 8000 });
  const vez2 = await page.$eval('#tt-minhas', e => e.innerText);
  await page.click('#tt-tab-minhas tbody tr'); await page.waitForSelector('#tt-liberar'); await page.click('#tt-liberar'); await page.waitForSelector('dialog[open]'); await dlgOk(); await H.dorme(500);
  t = await tit();
  ok('T2 outra pessoa do financeiro vê "Liberar para pagamento" e libera', /Liberar para pagamento/.test(vez2) && t.status === 'liberado' && t.liberacao.uid === 'uANA', t.status);

  // T3 tesouraria ainda não agenda sem a conta da prestadora
  await entrarComo('tito@alfa.com.br'); await abrir();
  const a3 = await acoes();
  ok('T3 a tesouraria não agenda enquanto a prestadora não informa a conta', /Esperando a prestadora informar a conta/.test(a3) && !(await page.$('#tt-agendar')), a3);

  // T4 prestadora informa a conta (vem do cadastro) e depois troca (revisão reforçada)
  await entrarComo('zeca@zeta.com.br');
  await page.evaluate(() => { location.hash = '#titulos'; }); await page.waitForSelector('#tt-minhas', { timeout: 8000 });
  const vez4 = await page.$eval('#tt-minhas', e => e.innerText);
  await page.click('#tt-tab-minhas tbody tr'); await page.waitForSelector('#tt-conta'); await page.click('#tt-conta'); await page.waitForSelector('#fc-ag');
  const pre = await page.evaluate(() => ({ ag: document.getElementById('fc-ag').value, ct: document.getElementById('fc-ct').value }));
  await dlgOk(); await page.waitForSelector('#tt-conta-txt', { timeout: 8000 }); await H.dorme(300);
  let db = await srv(); t = db['titulos/' + ID];
  ok('T4 a prestadora vê "Informe a conta", a conta vem do cadastro e fica na área privada do título',
    /Informe a conta/.test(vez4) && pre.ag === '1234' && pre.ct === '56789-0' && t.conta.ok && !t.conta.revisao && db[`titulos/${ID}/privado/conta`].conta === '56789-0' && /56789-0/.test(await page.$eval('#tt-conta-txt', e => e.innerText)), JSON.stringify(pre));
  await page.click('#tt-conta'); await page.waitForSelector('#fc-ct'); await page.fill('#fc-ct', '99999-1'); await dlgOk(); await page.waitForSelector('#tt-rev', { timeout: 8000 });
  t = await tit();
  ok('T5 trocar a conta coloca o título em revisão reforçada', t.conta.revisao === true && t.conta.versao === 2 && (await logs('titulo.conta_trocar')).length === 1, JSON.stringify(t.conta));

  // T6 tesouraria não agenda com troca sem revisão; financeiro revisa (confirmou por telefone)
  await entrarComo('tito@alfa.com.br'); await abrir();
  const a6 = await acoes();
  await entrarComo('ana@alfa.com.br'); await abrir();
  await page.click('#tt-revisar'); await page.waitForSelector('#rv-chk'); await dlgOk(); const er6 = await page.$eval('#rv-erro', e => e.innerText);
  await page.check('#rv-chk'); await dlgOk(); await H.dorme(600);
  t = await tit();
  ok('T6 com a troca sem revisão a tesouraria não agenda; o financeiro só aprova a conta nova confirmando por telefone',
    /financeiro precisa revisar/.test(a6) && /telefone/.test(er6) && t.conta.revisao === false && t.conta.revisadoPor === 'uANA', JSON.stringify({ a6, er6 }));

  // T7 tesouraria agenda (agendado não é pago)
  await entrarComo('tito@alfa.com.br'); await abrir();
  await page.click('#tt-agendar'); await page.waitForSelector('#ag-data'); await dlgOk(); await H.dorme(600);
  t = await tit();
  ok('T7 a tesouraria agenda o pagamento (continua não pago)', t.status === 'agendado' && t.agendamento.uid === 'uTITO' && /^\d{4}-\d{2}-\d{2}$/.test(t.agendamento.data), t.status);

  // T8 quem liberou não confirma; pagamento só com comprovante
  await entrarComo('ana@alfa.com.br'); await abrir();
  const a8 = await acoes();
  await entrarComo('tito@alfa.com.br'); await abrir();
  await page.click('#tt-liquidar'); await page.waitForSelector('#lq-data'); await dlgOk(); const er8 = await page.$eval('#lq-erro', e => e.innerText);
  await page.setInputFiles('#lq-arq', { name: 'comprovante.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 comprovante', 'utf8') }); await dlgOk(); await H.dorme(700);
  db = await srv(); t = db['titulos/' + ID];
  ok('T8 quem liberou não confirma o pagamento; sem comprovante não fica pago; com comprovante, fica pago',
    /Outra pessoa confirma/.test(a8) && /comprovante/.test(er8) && t.status === 'liquidado' && t.liquidacao.comprovante.partes === 1 && db[`titulos/${ID}/arquivos/${t.liquidacao.comprovante.envio}-0`] && (await logs('titulo.liquidar')).length === 1, JSON.stringify({ a8, er8, st: t.status }));

  // T9 prestadora dá baixa; vai para "Pagos"
  await entrarComo('zeca@zeta.com.br'); await abrir();
  const comp = !!(await page.$('#tt-comp'));
  await page.click('#tt-baixar'); await page.waitForSelector('dialog[open]'); await dlgOk(); await H.dorme(600);
  t = await tit();
  await page.evaluate(() => { location.hash = '#titulos'; }); await page.waitForSelector('#tt-pagos', { timeout: 8000 });
  ok('T9 a prestadora vê o comprovante, confirma que o dinheiro chegou e o título vai para "Pagos"', comp && t.status === 'baixado' && t.baixa.uid === 'uZECA', t.status);

  // T12 avaliação do serviço depois do pagamento (no contrato); a prestadora responde
  await entrarComo('aldo@alfa.com.br');
  await page.evaluate(() => { location.hash = '#contratos/ver/cz'; }); await page.waitForSelector('[data-avaliar]', { timeout: 8000 });
  await page.click('[data-avaliar]'); await page.waitForSelector('.av-notas');
  await page.click('.av-notas[data-k="qualidade"] [data-v="5"]'); await page.click('.av-notas[data-k="prazo"] [data-v="4"]'); await page.click('.av-notas[data-k="comunicacao"] [data-v="4"]');
  await dlgOk(); const er12 = await page.$eval('#av-erro', e => e.innerText);
  await page.click('.av-notas[data-k="escopo"] [data-v="5"]'); await page.fill('#av-com', 'Equipe pontual e organizada.'); await dlgOk(); await page.waitForSelector('#av-media', { timeout: 8000 });
  const av = (await srv())['avaliacoes/' + ID], med = await page.$eval('#av-media', e => e.innerText);
  await entrarComo('zeca@zeta.com.br');
  await page.evaluate(() => { location.hash = '#contratos/ver/cz'; }); await page.waitForSelector('[data-responder]', { timeout: 8000 });
  await page.click('[data-responder]'); await page.waitForSelector('#rs-txt'); await page.fill('#rs-txt', 'Obrigado pelo retorno!'); await dlgOk(); await page.waitForSelector('.av-resp', { timeout: 8000 });
  const av2 = (await srv())['avaliacoes/' + ID];
  ok('T12 depois do pagamento o aprovador técnico avalia o serviço no contrato (pede todas as notas); a prestadora vê e responde',
    /Fez o que foi combinado/.test(er12) && av && av.notas.qualidade === 5 && av.notas.prazo === 4 && av.notas.escopo === 5 && /4,5/.test(med) && av2.resposta && av2.resposta.uid === 'uZECA', JSON.stringify({ er12, med, notas: av && av.notas }));

  // T10 calendário e vencidos (título de outro período, vencido)
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('__srv')); const t = Object.assign({}, s.docs['titulos/cz_2026-10-2'], { status: 'liberado', base: '2026-10-01T12:00:00.000Z', periodo: '2026-09-2', liquidacao: null, baixa: null, agendamento: null }); s.docs['titulos/velho'] = t;
    const t2 = Object.assign({}, t, { base: new Date(Date.now() + 5 * 864e5).toISOString(), periodo: '2026-11-1' }); s.docs['titulos/novo'] = t2; localStorage.setItem('__srv', JSON.stringify(s)); });
  await page.reload(); await page.waitForSelector('.shell', { timeout: 8000 });
  await page.evaluate(() => { location.hash = '#titulos'; }); await page.waitForSelector('#tt-cal', { timeout: 8000 }); await H.dorme(300);
  const cal = await page.evaluate(() => ({ venc: (document.getElementById('tt-vencidos') || {}).innerText || '', cal: document.getElementById('tt-cal').innerText, rec: (document.getElementById('tt-receber') || {}).innerText || '' }));
  ok('T10 calendário de vencimentos por dia e a lista de vencidos', /Vencido/.test(cal.venc) && /Alfa Serviços/.test(cal.cal) && /a receber/.test(cal.cal) && /R\$ 13\.315,32/.test(cal.rec), JSON.stringify(cal));

  // T11 celular
  await page.setViewportSize({ width: 390, height: 844 }); await abrir(); await H.dorme(300);
  const lado = await page.evaluate(() => { const w = innerWidth; return Array.from(document.querySelectorAll('#view *')).filter(e => e.getBoundingClientRect().right > w + 1).slice(0, 3).map(e => e.tagName + '.' + e.className); });
  ok('T11 celular: título sem rolagem para o lado', !lado.length, JSON.stringify(lado));

  ok('Sem erros de JavaScript na página', !erros.length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
