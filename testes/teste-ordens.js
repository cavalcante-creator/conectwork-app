/* Teste do serviço por entrega (contrato "os" e ordens de serviço) com um profissional MEI: contrato com triagem própria,
   OS com escopo/prazo/valor (sem horas), aceite ou recusa sem punição, entrega com evidência, divergência, aceite parcial
   por outra pessoa (funções separadas) e o espelho da nota com o valor aceito. Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('ordens');
const futuro = d => { const x = new Date(); x.setDate(x.getDate() + d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    delete d.docs['acessos/beta_uBRUNO'];
    Object.assign(d.docs['empresas/alfa'], { modulos: ['equipe', 'cobrancas', 'contratos'], cnpj: '11.444.777/0001-61', razao: 'Alfa Serviços Ltda', tipo: 'contratante' });
    d.docs['empresas/alfa/privado/cadastro'] = { end: { logradouro: 'Rua A', numero: '1', cidade: 'Gravataí', uf: 'RS' } };
    const pessoa = (uid, email, nome, emp, cargo) => { d.users[email] = { uid, pass: 'senha123' }; d.docs['usuarios/' + uid] = { nome, email }; d.docs[`acessos/${emp}_${uid}`] = { uid, empresaId: emp, nome, email, cargo, extras: [], sem: [], ativo: true }; };
    pessoa('uSOL', 'sol@alfa.com.br', 'Sol Pires', 'alfa', 'solicitante');
    pessoa('uALDO', 'aldo@alfa.com.br', 'Aldo Reis', 'alfa', 'aprovador');
    pessoa('uLIA', 'lia@lia.com.br', 'Lia Lima', 'lia', 'admin');
    d.docs['empresas/lia'] = { nome: 'Lia Lima Elétrica', razao: 'Lia Lima 12345678000', cnpj: '33.000.167/0001-01', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas'], criadoPor: 'uLIA' };
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  const col = async c => Object.entries(await srv()).filter(([k]) => new RegExp('^' + c + '/[^/]+$').test(k)).map(([k, v]) => Object.assign({ _id: k.split('/')[1] }, v));
  const logs = async a => Object.values(await srv()).filter(x => x.acao === a);
  const entrarComo = async email => { if (await page.$('#sair')) await page.click('#sair'); await page.waitForSelector('#lg-email'); await H.entrar(page, email, 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 }); };
  const dlgOk = () => page.click('dialog[open] [data-dlg-b="1"]');
  const vai = async h => { await page.evaluate(x => { location.hash = x; }, h); };
  await H.preparar(page, d); await page.goto(H.BASE);

  // O1 o admin cria o contrato "Serviço por entrega" (sem medição por período) e faz a triagem do profissional
  await entrarComo('ana@alfa.com.br');
  await vai('#contratos'); await page.waitForSelector('#ct-novo', { timeout: 8000 }); await page.click('#ct-novo'); await page.waitForSelector('#ct-prest');
  await page.check('[name="ct-mod"][value="os"]'); const perEsc = await page.$eval('#ct-per-l', e => e.hidden);
  await page.selectOption('#ct-prest', 'lia'); await page.fill('#ct-obj', 'Manutenção elétrica sob demanda, por ordem de serviço.'); await page.fill('#ct-ini', futuro(0)); await dlgOk();
  await page.waitForSelector('#tr-fazer', { timeout: 8000 }); await page.click('#tr-fazer'); await page.waitForSelector('.tr-q');
  const perg = await page.$eval('dialog[open]', e => e.innerText);
  for (const [k, v] of Object.entries({ entrega: 'sim', supervisor: 'sim', ordens: 'nao', jornada: 'nao', exclusiv: 'nao', exempregado: 'nao', socio: 'nao' })) await page.click(`.tr-q[data-k="${k}"] .tr-b[data-v="${v}"]`);
  await dlgOk(); await page.waitForSelector('#ct-assinar', { timeout: 8000 }); await page.check('#ct-li'); await page.click('#ct-assinar'); await H.dorme(600);
  let c = (await col('contratos'))[0];
  ok('O1 contrato "Serviço por entrega" sem medição por período; a triagem pergunta sobre ponto, ex-empregado e troca de carteira por PJ',
    perEsc && c.modalidade === 'os' && c.periodicidade === '' && /controle de ponto/.test(perg) && /empregado \(com carteira\)/.test(perg) && /voltar como PJ/.test(perg) && c.triagem.resultado === 'compativel' && c.assinaturas.tomador, JSON.stringify({ mod: c.modalidade }));

  // O2 o profissional assina (contato opcional) e o contrato fica ativo, com o cartão das OS
  await entrarComo('lia@lia.com.br');
  await vai('#contratos/ver/' + c._id); await page.waitForSelector('#ct-li', { timeout: 8000 }); await page.check('#ct-li'); await page.click('#ct-assinar'); await H.dorme(600);
  c = (await col('contratos'))[0];
  ok('O2 o profissional assina sem precisar indicar interlocutor e o contrato fica ativo', c.status === 'ativo', c.status);

  // O3 o solicitante cria a OS: texto com "horas" é barrado; escopo, prazo e valor da entrega
  await entrarComo('sol@alfa.com.br');
  await vai('#ordens'); await page.waitForSelector('#os-nova', { timeout: 8000 }); await page.click('#os-nova'); await page.waitForSelector('#os-tit');
  await page.fill('#os-tit', 'Plantão de 8 horas na linha 2'); await page.fill('#os-esc', 'Ficar disponível no horário da fábrica.'); await page.fill('#os-prazo', futuro(10)); await page.type('#os-valor', '300000'); await dlgOk();
  const e3 = await page.$eval('#os-erro', e => e.innerText);
  await page.fill('#os-tit', 'Revisão do quadro elétrico da linha 2'); await page.fill('#os-esc', 'Trocar os disjuntores com defeito, testar e entregar relatório com fotos.'); await dlgOk(); await page.waitForSelector('#os-dados', { timeout: 8000 });
  let o = (await col('ordens'))[0];
  ok('O3 o solicitante cria a OS por entrega; pedido com horário/horas é barrado', /sem horário, jornada ou horas/.test(e3) && o.numero === 1 && o.valorCentavos === 300000 && o.status === 'proposta' && (await logs('os.criar')).length === 1, e3);

  // O4 o profissional vê no Início, entende que pode recusar sem punição e aceita
  await entrarComo('lia@lia.com.br');
  await page.waitForSelector('#ini-pv .pv-it', { timeout: 8000 }); await H.dorme(500);
  const pv4 = await page.$$eval('#ini-pv .pv-it strong', x => x.map(e => e.innerText));
  await vai('#ordens/ver/' + o._id); await page.waitForSelector('#os-aceitar', { timeout: 8000 });
  const livre = await page.$eval('#os-livre', e => e.innerText);
  await page.click('#os-aceitar'); await page.waitForSelector('dialog[open]'); await dlgOk(); await page.waitForSelector('#os-entregar', { timeout: 8000 });
  ok('O4 o profissional vê "Responder a ordem de serviço", o aviso de que recusar não tem punição, e aceita', pv4.includes('Responder a ordem de serviço') && /não tem punição/.test(livre) && (await col('ordens'))[0].status === 'aceita', JSON.stringify(pv4));

  // O5 entrega com evidência (arquivo)
  await page.click('#os-entregar'); await page.waitForSelector('#en-desc'); await page.fill('#en-desc', 'Disjuntores trocados e testados. Relatório em anexo.');
  await page.setInputFiles('#en-arq', { name: 'relatorio.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 relatorio', 'utf8') }); await dlgOk(); await page.waitForSelector('#os-entrega', { timeout: 8000 });
  o = (await col('ordens'))[0]; let db = await srv();
  ok('O5 o profissional registra a entrega com o arquivo de evidência', o.status === 'entregue' && o.entrega.arquivo && db[`ordens/${o._id}/arquivos/${o.entrega.arquivo.envio}-0`] && o.entregas.length === 1, o.status);

  // O6 quem pediu não aceita; o aprovador aponta divergência; nova entrega; aceite em parte
  await entrarComo('sol@alfa.com.br'); await vai('#ordens/ver/' + o._id); await page.waitForSelector('#os-entrega', { timeout: 8000 });
  const a6 = (await page.$('#os-ok')) ? 'pode' : 'Outra pessoa confere';
  await entrarComo('aldo@alfa.com.br'); await vai('#ordens/ver/' + o._id); await page.waitForSelector('#os-div', { timeout: 8000 });
  await page.click('#os-div'); await page.waitForSelector('#dl-txt'); await page.fill('#dl-txt', 'Faltaram as fotos do teste no relatório.'); await dlgOk(); await H.dorme(600);
  await entrarComo('lia@lia.com.br'); await vai('#ordens/ver/' + o._id); await page.waitForSelector('#os-div-b', { timeout: 8000 });
  await page.click('#os-entregar'); await page.waitForSelector('#en-desc'); await page.fill('#en-desc', 'Relatório refeito com as fotos do teste.'); await dlgOk(); await H.dorme(600);
  await entrarComo('aldo@alfa.com.br'); await vai('#ordens/ver/' + o._id); await page.waitForSelector('#os-parcial', { timeout: 8000 });
  await page.click('#os-parcial'); await page.waitForSelector('#pa-v'); await page.type('#pa-v', '250000'); await page.fill('#pa-m', 'Um disjuntor ficou para a próxima OS.'); await dlgOk(); await H.dorme(600);
  o = (await col('ordens'))[0];
  ok('O6 o solicitante (quem pediu) não aceita a entrega; o aprovador aponta divergência, o profissional entrega de novo e o aprovador aceita em parte com motivo',
    /Outra pessoa confere/.test(a6) && o.status === 'aceita_parcial' && o.aceite.valorAceito === 250000 && o.entregas.length === 2 && (await logs('os.divergencia')).length === 1, JSON.stringify({ a6: a6.slice(0, 40), st: o.status }));

  // O7 o financeiro prepara o espelho com o valor aceito
  await entrarComo('bruno@alfa.com.br');
  await vai('#espelhos'); await page.waitForSelector('#es-preparar', { timeout: 8000 });
  const lp = await page.$eval('#es-preparar', e => e.innerText);
  await page.click(`[data-preparar="${o._id}"]`); await page.waitForSelector('#es-form', { timeout: 8000 });
  const desc = await page.$eval('#es-desc', e => e.value);
  await page.click('#es-salvar'); await page.waitForSelector('#es-valores', { timeout: 8000 });
  const esp = (await srv())['espelhos/' + o._id];
  ok('O7 a OS aceita aparece em "Espelhos para preparar"; o espelho usa o valor aceito e a descrição cita a OS',
    /OS 1 · Revisão do quadro/.test(lp) && /ordem de serviço nº 1/.test(desc) && esp && esp.origem === 'os' && esp.valorCentavos === 250000 && esp.osNumero === 1 && /^\d{4}-\d{2}$/.test(esp.periodo), JSON.stringify(esp && { v: esp.valorCentavos, p: esp.periodo }));

  // O8 celular
  await page.setViewportSize({ width: 390, height: 844 }); await vai('#ordens/ver/' + o._id); await page.waitForSelector('#os-dados'); await H.dorme(300);
  ok('O8 celular: OS sem rolagem para o lado', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));

  ok('Sem erros de JavaScript na página', !erros.length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
