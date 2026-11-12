/* Teste da Agenda e lembretes e do Assistente do MEI (10/11/2026): menu do MEI, prazos automáticos (DAS), compromisso
   e lembrete com repetição, "Precisa de você", aviso na hora com o app aberto, tirar da agenda, perguntas ao assistente
   com os números da pessoa, e o celular sem rolar para o lado. Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('agenda');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    d.users['lia@lia.com.br'] = { uid: 'uLIA', pass: 'senha123' }; d.docs['usuarios/uLIA'] = { nome: 'Lia Lima', email: 'lia@lia.com.br' };
    d.docs['acessos/lia_uLIA'] = { uid: 'uLIA', empresaId: 'lia', nome: 'Lia Lima', email: 'lia@lia.com.br', cargo: 'admin', extras: [], sem: [], ativo: true };
    d.docs['empresas/lia'] = { nome: 'Lia Lima Elétrica', cnpj: '33.000.167/0001-01', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas', 'contratos', 'equipe'], criadoPor: 'uLIA' };
    d.docs['empresas/lia/privado/cadastro'] = { dados: { porte: 'MEI' } };
    d.docs['faturamento/lia'] = { anos: { [String(new Date().getFullYear())]: { '01': 1500000, '02': 2000000 } }, clientes: [] };
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  const iso = dt => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const hoje = iso(new Date());
  await H.preparar(page, d); await page.goto(H.BASE);
  await H.entrar(page, 'lia@lia.com.br', 'senha123'); await page.waitForSelector('#menu-alt', { timeout: 8000 }); await H.dorme(400);

  // A1 menu do MEI: Agenda e Assistente aparecem; no celular a barra de baixo começa por Início, Agenda, Demandas, A receber
  const m1 = await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod));
  ok('A1 menu do MEI tem Agenda e lembretes e Assistente', m1.join() === 'inicio,agenda,ordens,titulos,nacidade,negocio,espelhos,assistentemei,contratos,servicos,cursos,documentos,empresa', m1.join());

  // A2 prazos automáticos: o DAS entra sozinho (marcado "automático") e o que venceu aparece em "Ficou para trás"
  await page.evaluate(() => { location.hash = '#agenda'; }); await page.waitForSelector('#ag-lista', { timeout: 8000 }); await H.dorme(400);
  const a2 = await page.evaluate(() => ({ auto: Array.from(document.querySelectorAll('.ag-auto strong')).map(e => e.innerText), atras: !!document.getElementById('ag-atras') }));
  ok('A2 DAS entra sozinho na agenda como automático; o vencido vai para "Ficou para trás"', a2.auto.some(t => /Pagar o DAS/.test(t)) && a2.atras, JSON.stringify(a2));

  // A3 novo compromisso: valida o título, grava com cliente e hora, aparece em "Hoje" e vai para o histórico
  await page.click('#ag-novo'); await page.waitForSelector('dialog[open] #ag-tit');
  await page.fill('#ag-tit', 'x'); await page.click('dialog[open] [data-dlg-b="1"]'); const e3 = await page.$eval('dialog[open] #ag-erro', e => e.innerText);
  await page.fill('#ag-tit', 'Visita técnica'); await page.fill('#ag-data', hoje); await page.fill('#ag-hora', '23:59'); await page.fill('#ag-cli', 'Cliente Beta');
  await page.click('dialog[open] [data-dlg-b="1"]'); await H.dorme(500);
  const s3 = await srv(), c3 = Object.entries(s3).find(([k, v]) => k.startsWith('agenda/') && v.titulo === 'Visita técnica');
  const l3 = await page.$eval('#ag-lista', e => e.innerText);
  ok('A3 novo compromisso: pede o que é, grava com cliente e hora, aparece em Hoje e no histórico',
    /Escreva o que é/.test(e3) && c3 && c3[1].empresaId === 'lia' && c3[1].hora === '23:59' && c3[1].avisar === 60 && /Hoje/.test(l3) && /Visita técnica/.test(l3)
    && Object.values(s3).some(x => x.acao === 'agenda.criar' && /Visita técnica/.test(x.texto)), JSON.stringify({ e3, c: c3 && c3[1] }));

  // A4 "Precisa de você" no Início mostra o compromisso de hoje
  await page.evaluate(() => { location.hash = '#inicio'; }); await page.waitForSelector('#mei-servicos .mh-serv', { timeout: 8000 }); await H.dorme(400);
  const pv = await page.evaluate(() => document.getElementById('view').textContent);
  ok('A4 o compromisso de hoje entra em "Para fazer" do Início', /Hoje: Visita técnica/.test(pv), pv.slice(0, 200));

  // A5 lembrete que repete todo mês: aparece no calendário do mês que vem; marcar feito hoje não some do próximo mês
  await page.evaluate(() => { location.hash = '#agenda'; }); await page.waitForSelector('#ag-novo-lem');
  await page.click('#ag-novo-lem'); await page.waitForSelector('dialog[open] #ag-tit');
  await page.fill('#ag-tit', 'Conferir o extrato'); await page.fill('#ag-data', hoje); await page.selectOption('#ag-rep', 'mes'); await page.selectOption('#ag-av', '');
  await page.click('dialog[open] [data-dlg-b="1"]'); await H.dorme(500);
  const id5 = Object.entries(await srv()).find(([k, v]) => k.startsWith('agenda/') && v.titulo === 'Conferir o extrato')[0].split('/')[1];
  await page.click(`[data-feito="${id5}"][data-dia="${hoje}"]`); await H.dorme(500);
  const s5 = (await srv())['agenda/' + id5];
  await page.click('#ag-mes-prox'); await H.dorme(200);
  const dia5 = hoje.slice(8, 10) > '28' ? null : await page.evaluate(h => { const d = new Date(+h.slice(0, 4), +h.slice(5, 7), +h.slice(8, 10)); const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const b = document.querySelector(`.ag-dia[data-dia="${s}"] i`); return b ? b.innerText : ''; }, hoje);
  ok('A5 lembrete que repete todo mês: marcar feito vale só para hoje; no mês que vem ele aparece de novo',
    s5.repete === 'mes' && s5.feitos.includes(hoje) && s5.feito === false && (dia5 === null || +dia5 >= 1), JSON.stringify({ feitos: s5.feitos, dia5 }));
  await page.click('#ag-mes-ant'); await H.dorme(200);

  // A6 aviso na hora com o app aberto: compromisso de agora, aviso "na hora"
  const agora = new Date(Date.now() - 60000), hh = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
  if (iso(agora) === hoje) {
    await page.click('#ag-novo'); await page.waitForSelector('dialog[open] #ag-tit');
    await page.fill('#ag-tit', 'Ligar para o cliente'); await page.fill('#ag-data', hoje); await page.fill('#ag-hora', hh); await page.selectOption('#ag-av', '0');
    await page.click('dialog[open] [data-dlg-b="1"]');
    const t6 = await page.waitForFunction(() => /Compromisso: Ligar para o cliente/.test((document.getElementById('toast') || {}).textContent || ''), null, { timeout: 6000 }).then(() => true).catch(() => false);
    ok('A6 com o app aberto, o aviso aparece na hora marcada', t6);
  } else ok('A6 com o app aberto, o aviso aparece na hora marcada (pulado: virada do dia)', true);

  // A7 tirar da agenda: não apaga (removido:true) e some da lista
  const id7 = Object.entries(await srv()).find(([k, v]) => k.startsWith('agenda/') && v.titulo === 'Visita técnica')[0].split('/')[1];
  await page.click(`[data-editar="${id7}"]`); await page.waitForSelector('dialog[open] #ag-tit');
  await page.click('dialog[open] [data-dlg-b="0"]'); await page.waitForSelector('dialog[open]'); await H.dorme(200);
  await page.click('dialog[open] [data-dlg-b="1"]'); await H.dorme(500);
  const s7 = (await srv())['agenda/' + id7], l7 = await page.$eval('#ag-lista', e => e.innerText);
  ok('A7 "Tirar da agenda" não apaga (fica removido) e some da lista', s7 && s7.removido === true && !/Visita técnica/.test(l7), JSON.stringify({ removido: s7 && s7.removido }));

  // A8 assistente: respostas com os números da pessoa, perguntas escritas sem acento, e quando não sabe responder
  await page.evaluate(() => { location.hash = '#assistentemei'; }); await page.waitForSelector('#as-form', { timeout: 8000 });
  const pergunta = async q => { await page.fill('#as-q', q); await page.press('#as-q', 'Enter'); await H.dorme(500); return page.$$eval('.as-m:not(.eu)', ms => { const m = ms[ms.length - 1]; return { id: m.dataset.resp || '', t: m.innerText }; }); };
  const r1 = await pergunta('quanto faturei esse ano'), r2 = await pergunta('quando vence o das?'), r3 = await pergunta('qual a capital da frança');
  await page.click('.as-chip[data-p="Quanto falta para o limite do MEI?"]'); await H.dorme(500);
  const r4 = await page.$$eval('.as-m:not(.eu)', ms => { const m = ms[ms.length - 1]; return { id: m.dataset.resp || '', t: m.innerText }; });
  ok('A8 assistente: faturamento com o número da pessoa (R$ 35.000,00), DAS, limite pela sugestão e explica quando não sabe',
    r1.id === 'faturei' && /35\.000,00/.test(r1.t) && r2.id === 'das' && /dia 20/.test(r2.t) && r3.id === 'nao' && r4.id === 'limite' && /Faltam R\$\s?46\.000,00/.test(r4.t), JSON.stringify({ r1, r2: r2.id, r3: r3.id, r4 }));

  // A10 Início do MEI (opção A): saudação, o que tem hoje, botões grandes que abrem cada tela e o limite do MEI
  await page.evaluate(() => { location.hash = '#inicio'; }); await page.waitForSelector('#mei-servicos .mh-serv', { timeout: 8000 }); await page.waitForSelector('#mei-lim:not([hidden])', { timeout: 6000 }).catch(() => {});
  const a10 = await page.evaluate(() => ({ ola: document.getElementById('mh-ola').innerText, topo: document.querySelector('.topbar').hidden, mei: document.documentElement.classList.contains('mei'),
    tiles: Array.from(document.querySelectorAll('.mh-serv')).map(t => t.dataset.tile), hoje: document.getElementById('mei-hoje').innerText, lim: (document.getElementById('mei-lim') || {}).innerText || '' }));
  await page.click('.mh-serv[data-tile="agenda"]'); await H.dorme(300); const h10 = await page.evaluate(() => location.hash);
  ok('A10 Início do MEI: "Olá, Lia", o que tem hoje, "Serviços pra você" (abrem a tela) e o limite do MEI',
    a10.ola === 'Olá, Lia' && a10.topo && a10.mei && a10.tiles.join() === 'das,checkup,negocio,agenda,espelhos,nacidade,assistentemei' && /Hoje/.test(a10.hoje) && /R\$ 35\.000 de R\$ 81\.000/.test(a10.lim) && h10 === '#agenda'
    && !(await page.evaluate(() => document.querySelector('.topbar').hidden)), JSON.stringify(a10));

  // A9 celular: agenda e assistente cabem sem rolar para o lado
  await page.setViewportSize({ width: 390, height: 844 }); await H.dorme(300);
  const lado1 = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || (document.getElementById('app') || document.body).scrollWidth > innerWidth);
  await page.evaluate(() => { location.hash = '#agenda'; }); await page.waitForSelector('#ag-lista'); await H.dorme(300);
  const lado2 = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || (document.getElementById('app') || document.body).scrollWidth > innerWidth);
  await page.evaluate(() => { location.hash = '#inicio'; }); await page.waitForSelector('#mei-servicos .mh-serv'); await H.dorme(300);
  const lado3 = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || (document.getElementById('app') || document.body).scrollWidth > innerWidth);
  ok('A9 celular: assistente, agenda e Início do MEI cabem sem rolar para o lado', !lado1 && !lado2 && !lado3, JSON.stringify({ lado1, lado2, lado3 }));

  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
