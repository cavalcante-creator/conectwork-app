/* Teste de tela do "Pedir nota" (12/11/2026): sem medição, quem contrata diz à prestadora o que faturar (tarifa × quantidade,
   extra, desconto, prazo para emitir e lote); guarda para enviar depois; a prestadora vê o espelho com o prazo. Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('pedirnota');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    delete d.docs['acessos/beta_uBRUNO'];
    Object.assign(d.docs['empresas/alfa'], { modulos: ['equipe', 'cobrancas', 'contratos'], cnpj: '11.444.777/0001-61', razao: 'Alfa Serviços Ltda', tipo: 'contratante' });
    d.users['zeca@zeta.com.br'] = { uid: 'uZECA', pass: 'senha123' }; d.docs['usuarios/uZECA'] = { nome: 'Zeca Moura', email: 'zeca@zeta.com.br' };
    d.docs['acessos/zeta_uZECA'] = { uid: 'uZECA', empresaId: 'zeta', nome: 'Zeca Moura', email: 'zeca@zeta.com.br', cargo: 'admin', extras: [], sem: [], ativo: true };
    d.docs['empresas/zeta'] = { nome: 'Zeta Manutenção', cnpj: '04.252.011/0001-10', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas'], criadoPor: 'uZECA' };
    d.docs['contratos/cz'] = { tomadorId: 'alfa', prestadorId: 'zeta', partes: ['alfa', 'zeta'], tomadorNome: 'Alfa Serviços', prestadorNome: 'Zeta Manutenção', prestadorCnpj: '04.252.011/0001-10',
      modalidade: 'continua', objeto: 'Manutenção elétrica das linhas de produção.', periodicidade: 'mes', vencimentoDias: 5, inicio: '2026-01-01', fim: '', status: 'ativo' };
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  const col = async c => Object.entries(await srv()).filter(([k]) => new RegExp('^' + c + '/[^/]+$').test(k)).map(([k, v]) => Object.assign({ _id: k.split('/')[1] }, v));
  const logs = async a => Object.values(await srv()).filter(x => x.acao === a);
  const entrarComo = async email => { if (await page.$('#sair')) await page.click('#sair'); await page.waitForSelector('#lg-email'); await H.entrar(page, email, 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 }); await H.dorme(300); };
  const abrirLista = async () => { await page.evaluate(() => { location.hash = '#espelhos'; }); await page.waitForSelector('#es-lista', { timeout: 8000 }); };
  const abrirNova = async () => { await abrirLista(); await page.click('#es-pedir'); await page.waitForSelector('#sg-form', { timeout: 8000 }); };
  const erro = () => page.$eval('#sg-erro', e => e.innerText);
  await H.preparar(page, d); await page.goto(H.BASE);

  // P1 o financeiro de quem contrata vê "Pedir nota"; o formulário pede a prestadora e calcula tarifa × quantidade + extra − desconto
  await entrarComo('bruno@alfa.com.br');
  await abrirNova();
  await page.click('#sg-enviar'); const e0 = await erro();
  await page.selectOption('#sg-ct', 'cz'); await page.check('#sg-tarifa');
  await page.fill('#sg-tar', '4000'); await page.fill('#sg-qtd', '160'); await page.fill('#sg-extra', '10000'); await page.fill('#sg-desc', '100000'); await H.dorme(150);
  const p1 = { tot: await page.$eval('#sg-total', e => e.innerText), venc: await page.$eval('#sg-venc', e => e.innerText), desc: await page.$eval('#sg-txt', e => e.value), valorEsc: await page.$eval('#sg-b-valor', e => e.hidden) };
  ok('P1 "Pedir nota" pede a prestadora; tarifa × quantidade + extra − desconto = valor da nota; vencimento vem do contrato; descrição sugerida',
    /prestadora/i.test(e0) && /5\.500,00/.test(p1.tot) && /160 hora × R\$\s?40,00/.test(p1.tot) && /5 dias/.test(p1.venc) && /Manutenção elétrica/.test(p1.desc) && p1.valorEsc, JSON.stringify({ e0, p1 }));

  // P2 guardar para enviar depois: a prestadora não vê; aparece em "Pedidos de nota guardados"
  await page.fill('#sg-lote', 'Folha do dia 15'); await page.click('#sg-guardar'); await page.waitForSelector('#es-guardados', { timeout: 8000 });
  const g2 = await col('pedidosnota'), esp2 = await col('espelhos');
  ok('P2 "Salvar para enviar depois" guarda o pedido (rascunho, com histórico) e não cria o espelho',
    g2.length === 1 && g2[0].status === 'rascunho' && g2[0].dados.lote === 'Folha do dia 15' && g2[0].dados.qtd100 === 16000 && esp2.length === 0 && (await logs('pedidonota.guardar')).length === 1, JSON.stringify({ g2, n: esp2.length }));

  // P3 abrir o guardado, pôr o prazo e enviar: vira o espelho (origem avulso) com o mesmo id
  await page.click('[data-guardado]'); await page.waitForSelector('#sg-form');
  const val3 = { qtd: await page.$eval('#sg-qtd', e => e.value), lote: await page.$eval('#sg-lote', e => e.value), ct: await page.$eval('#sg-ct', e => e.value) };
  await page.fill('#sg-prazo', '2000-01-10'); await page.click('#sg-enviar'); await page.waitForSelector('#es-valores', { timeout: 8000 });
  const id = g2[0]._id, e3 = (await srv())['espelhos/' + id], g3 = (await srv())['pedidosnota/' + id];
  const v3 = await page.$eval('#es-valores', e => e.innerText);
  ok('P3 o pedido guardado volta preenchido; "Salvar e enviar" cria o espelho (sem medição) e marca o pedido como enviado',
    val3.qtd === '160' && val3.lote === 'Folha do dia 15' && val3.ct === 'cz' && e3 && e3.origem === 'avulso' && e3.valorCentavos === 550000 && e3.calc.base === 640000 && e3.vencimentoDias === 5 && e3.prazoEmissao === '2000-01-10'
      && e3.lote === 'Folha do dia 15' && g3.status === 'enviada' && g3.espelhoId === id && /160 hora/.test(v3) && /Desconto/.test(v3) && (await logs('espelho.pedido')).length === 1, JSON.stringify({ val3, e3: e3 && e3.calc, v3 }));

  // P4 valor direto, sem prazo: validações e envio direto
  await abrirNova(); await page.selectOption('#sg-ct', 'cz'); await page.fill('#sg-valor', '120000'); await page.fill('#sg-desc', '200000'); await page.click('#sg-enviar'); const e4 = await erro();
  await page.fill('#sg-desc', ''); await page.click('#sg-enviar'); await page.waitForSelector('#es-valores', { timeout: 8000 });
  const esps = await col('espelhos');
  ok('P4 desconto maior que o valor não passa; com valor direto envia na hora', /desconto/i.test(e4) && esps.length === 2 && esps.some(x => x.calc && x.calc.modo === 'valor' && x.valorCentavos === 120000 && x.prazoEmissao === null), JSON.stringify({ e4, n: esps.length }));

  // P5 na lista: lote e filtro por lote; a nota com prazo vencido aparece como atrasada
  await abrirLista();
  const l5 = await page.$eval('#es-lista', e => e.innerText);
  await page.selectOption('#es-flote', 'Folha do dia 15'); await H.dorme(200);
  const n5 = await page.$$eval('#es-tab tbody tr', x => x.length);
  ok('P5 a lista mostra o lote e "nota atrasada"; o filtro de lote mostra só os do lote', /Folha do dia 15/.test(l5) && /nota atrasada/.test(l5) && n5 === 1, JSON.stringify({ l5, n5 }));

  // P6 a prestadora vê o pedido com o prazo e a pendência; não vê o pedido guardado nem o botão
  await entrarComo('zeca@zeta.com.br');
  await page.evaluate(id => { location.hash = '#espelhos/ver/' + id; }, id); await page.waitForSelector('#es-aviso', { timeout: 8000 });
  const p6 = { av: await page.$eval('#es-aviso', e => e.innerText), and: await page.$eval('#es-andamento', e => e.innerText) };
  await abrirLista(); const semBt = !(await page.$('#es-pedir')) && !(await page.$('#es-guardados'));
  ok('P6 a prestadora vê "A Alfa pediu a nota … até 10/01/2000", o prazo passado e "Nota pedida"; sem "Pedir nota"',
    /pediu a nota/.test(p6.av) && /10\/01\/2000/.test(p6.av) && /prazo para emitir já passou/i.test(p6.av) && /Nota pedida/.test(p6.and) && semBt, JSON.stringify(p6));

  // P7 celular: o formulário cabe sem rolar para o lado
  await entrarComo('bruno@alfa.com.br'); await page.setViewportSize({ width: 390, height: 844 }); await abrirNova(); await H.dorme(200);
  ok('P7 celular: "Pedir nota" cabe sem rolar para o lado', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));

  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
