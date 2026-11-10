/* Teste das telas da equipe Conectwork: Painel da rede (Início), Empresas (suspender, reativar, ver como a empresa),
   Mensalidades (planos e valores, gerar, receber, desfazer, atrasadas), Equipe Conectwork (convidar, aceitar pelo link, tirar)
   e Avisos para a rede (publicar, aparecer no Início das empresas certas, "Entendi"). Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('rede');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const p2 = n => String(n).padStart(2, '0'), d0 = new Date(), hoje = `${d0.getFullYear()}-${p2(d0.getMonth() + 1)}-${p2(d0.getDate())}`, comp = hoje.slice(0, 7);
  const { d } = H.seed(d => {
    Object.assign(d.docs['empresas/alfa'], { plano: 'essencial', tipo: 'prestador' });
    Object.assign(d.docs['empresas/beta'], { plano: 'gratuito', tipo: 'contratante' });
    d.users['beto@beta.com.br'] = { uid: 'uBETO', pass: 'senha123' };
    d.docs['usuarios/uBETO'] = { nome: 'Beto Alves', email: 'beto@beta.com.br' };
    d.docs['acessos/beta_uBETO'] = { uid: 'uBETO', empresaId: 'beta', nome: 'Beto Alves', email: 'beto@beta.com.br', cargo: 'admin', extras: [], sem: [], ativo: true };
    delete d.docs['acessos/beta_uBRUNO'];
    /* mensalidade antiga em aberto e vencida: atrasada */
    d.docs['mensalidades/alfa_2026-01'] = { empresaId: 'alfa', empresaNome: 'Alfa Serviços', comp: '2026-01', plano: 'essencial', valorCentavos: 15000, venc: '2026-01-10', status: 'aberta', criadoEm: '2026-01-01T12:00:00.000Z', criadoPor: 'uIASMYN' };
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  const txt = sel => page.$eval(sel, e => e.innerText).catch(() => '');
  const dlgOk = () => page.click('dialog[open] [data-dlg-b="1"]');
  const ir = async (h, sel) => { await page.evaluate(h => { location.hash = h; }, h); if (sel) await page.waitForSelector(sel, { timeout: 8000 }); await H.dorme(300); };
  const sair = async () => { await page.click('#sair'); await page.waitForSelector('#lg-email', { timeout: 8000 }); };
  const entrar = async (email, sel) => { await H.entrar(page, email, 'senha123'); await page.waitForSelector(sel || '.shell', { timeout: 10000 }); await H.dorme(500); };
  await H.preparar(page, d); await page.goto(H.BASE);

  // R1 o Início da equipe é o Painel da rede
  await entrar('iasmyn@conectwork.com.br', '#rd-numeros');
  const r1 = { cad: await txt('#rd-k-cad b'), emp: await txt('#rd-k-emp b'), atr: await txt('#rd-k-atr b'), precisa: await txt('#rd-precisa'), menu: await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod).join()) };
  ok('R1 Início da equipe = Painel da rede: cadastros esperando, empresas ativas, atrasadas e "Precisa de você" (cadastro e valores dos planos)',
    r1.cad === '1' && r1.emp === '2' && r1.atr === '1' && /1 cadastro esperando a sua análise/.test(r1.precisa) && /Gama Logística/.test(r1.precisa) && /Defina o valor da mensalidade dos planos/.test(r1.precisa) && /1 mensalidade atrasada/.test(r1.precisa), JSON.stringify(r1));
  ok('R2 menu da equipe: Início, Cadastros, Empresas, Mensalidades, Sites de emissão, Painel da cidade, Avisos, Equipe e Histórico', r1.menu === 'inicio,cadastros,redeempresas,mensalidades,emissores,painelcidade,avisos,equipecw,historico', r1.menu);

  // R3 sem valores: não dá para gerar; Planos e valores: grava valores e o dia do vencimento (com histórico)
  await ir('#mensalidades', '#mn-lista');
  const r3a = { aviso: !!(await page.$('#mn-falta-plano')), gerar: !!(await page.$('#mn-gerar')) };
  await page.click('#mn-planos'); await page.waitForSelector('#pl-form');
  await page.fill('[data-plano="essencial"]', '19900'); await page.fill('[data-plano="profissional"]', '39900');
  await page.click('#pl-salvar'); const e3 = await txt('#pl-erro');
  await page.selectOption('#pl-dia', '10'); await page.click('#pl-salvar'); await H.dorme(600);
  const s3 = await srv(), cfg = s3['config/planos'] || {};
  ok('R3 Planos e valores: sem o dia pede o dia; salva os valores em centavos e o vencimento, com histórico (antes disso não dava para gerar)',
    r3a.aviso && !r3a.gerar && /dia do vencimento/.test(e3) && cfg.valores && cfg.valores.essencial === 19900 && cfg.valores.profissional === 39900 && cfg.valores.rede === 0 && cfg.diaVenc === 10
    && Object.values(s3).some(x => x.acao === 'planos.valores' && x.empresaId === 'master'), JSON.stringify({ r3a, e3, cfg }));

  // R4 gerar as mensalidades do mês: uma por empresa ativa, com o valor do plano; gratuito nasce isenta
  await page.click('#pl-voltar'); await page.waitForSelector('#mn-gerar', { timeout: 8000 });
  const g4 = await txt('#mn-gerar');
  await page.click('#mn-gerar'); await page.waitForSelector('dialog[open]'); const c4 = await txt('dialog[open]'); await dlgOk(); await H.dorme(700);
  const s4 = await srv(), ma = s4['mensalidades/alfa_' + comp] || {}, mb = s4['mensalidades/beta_' + comp] || {};
  ok('R4 "Gerar as que faltam": a Alfa recebe a do plano Essencial (R$ 199,00, vence dia 10) e a Beta (gratuito) nasce isenta, com histórico',
    /Gerar as 2 que faltam/.test(g4) && /Vai gerar 2 mensalidades/.test(c4) && ma.valorCentavos === 19900 && ma.status === 'aberta' && ma.venc === comp + '-10' && mb.status === 'isenta' && mb.valorCentavos === 0
    && Object.values(s4).filter(x => x.acao === 'mensalidade.gerar').length === 2 && !(await page.$('#mn-gerar')), JSON.stringify({ g4, ma, mb }));

  // R5 receber (com a data em que o dinheiro entrou) e desfazer
  await page.click(`[data-receber="alfa_${comp}"]`); await page.waitForSelector('dialog[open] #mn-dia');
  const fut = new Date(Date.now() + 5 * 864e5); await page.fill('dialog[open] #mn-dia', `${p2(fut.getDate())}/${p2(fut.getMonth() + 1)}/${fut.getFullYear()}`); await dlgOk(); const e5 = await txt('dialog[open] #mn-dia-erro');
  await page.fill('dialog[open] #mn-dia', hoje.split('-').reverse().join('/')); await page.fill('dialog[open] #mn-obs', 'Pix recebido'); await dlgOk(); await H.dorme(600);
  const m5 = (await srv())['mensalidades/alfa_' + comp], rec5 = await txt('#mn-recebido');
  await page.click(`[data-desfazer="alfa_${comp}"]`); await page.waitForSelector('dialog[open]'); await dlgOk(); await H.dorme(600);
  const m5b = (await srv())['mensalidades/alfa_' + comp];
  ok('R5 "Recebi" pede o dia (não aceita data no futuro), dá baixa com a data e a observação; "Desfazer" volta para em aberto',
    /depois de hoje/.test(e5) && m5.status === 'paga' && m5.pagoNoDia === hoje && m5.obs === 'Pix recebido' && /199,00/.test(rec5) && m5b.status === 'aberta' && m5b.pagoNoDia === null, JSON.stringify({ e5, m5, rec5, m5b: m5b.status }));

  // R6 atrasadas de todos os meses (e o contador no menu)
  await ir('#mensalidades/mes/atrasadas', '#mn-lista');
  const r6 = { linhas: await page.$$eval('#mn-lista tbody tr', x => x.map(t => t.dataset.mens)), badge: await txt('#menu [data-mod="mensalidades"] .badge') };
  ok('R6 filtro "Atrasadas" mostra as de todos os meses e o menu mostra quantas', r6.linhas.join() === 'alfa_2026-01' && r6.badge === '1', JSON.stringify(r6));

  // R7 Empresas: lista, busca e a ficha da empresa (plano, pessoas, mensalidades)
  await ir('#redeempresas', '#re-lista');
  const l7 = await page.$$eval('#re-lista tbody tr', x => x.map(t => t.dataset.ver));
  await page.fill('#re-busca', 'beta'); await H.dorme(200);
  const l7b = await page.$$eval('#re-lista tbody tr', x => x.map(t => t.dataset.ver)), foco = await page.evaluate(() => document.activeElement.id);
  await ir('#redeempresas/ver/alfa', '#re-acoes');
  const r7 = { plano: await txt('#re-plano'), pessoas: await txt('#re-pessoas .count'), mens: await txt('#re-mens') };
  ok('R7 Empresas: lista as ativas, a busca filtra sem perder o cursor, e a ficha mostra plano com o valor, pessoas e mensalidades',
    l7.join() === 'alfa,beta' && l7b.join() === 'beta' && foco === 're-busca' && /Essencial/.test(r7.plano) && /199,00/.test(r7.plano) && r7.pessoas === '3' && /Atrasada/.test(r7.mens), JSON.stringify({ l7, l7b, foco, r7 }));

  // R8 Ver como a empresa (só consulta) e voltar para a equipe
  await page.click('#re-vercomo'); await page.waitForSelector('#vercomo', { timeout: 8000 }); await H.dorme(400);
  const r8 = { faixa: await txt('#vercomo'), menu: await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod).join()), leitura: !!(await page.$('#ini-leitura')), emp: await txt('#ini-empresa') };
  await page.click('#vercomo-sair'); await page.waitForSelector('#re-acoes', { timeout: 8000 }); await H.dorme(300);
  const r8b = { hash: await page.evaluate(() => location.hash), menu: await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod).join()) };
  ok('R8 "Ver como a empresa": abre como a Alfa vê, só consulta (faixa e aviso de leitura); "Voltar para a equipe" volta para a ficha da empresa',
    /Vendo como Alfa Serviços · só consulta/.test(r8.faixa) && /contratos|espelhos|titulos|negocio/.test(r8.menu) && !/redeempresas/.test(r8.menu) && r8.leitura && r8.emp === 'Alfa Serviços'
    && r8b.hash === '#redeempresas/ver/alfa' && /redeempresas/.test(r8b.menu), JSON.stringify({ r8, r8b }));

  // R9 suspender (motivo obrigatório) e reativar
  await ir('#redeempresas/ver/beta', '#re-suspender');
  await page.click('#re-suspender'); await page.waitForSelector('dialog[open] #re-motivo'); await dlgOk(); const e9 = await txt('dialog[open] #re-motivo-erro');
  await page.fill('dialog[open] #re-motivo', 'Mensalidade em atraso. Fale com a equipe.'); await dlgOk(); await page.waitForSelector('#re-suspensa', { timeout: 8000 });
  const s9 = await srv();
  ok('R9 Suspender o acesso pede o motivo e grava a situação "suspenso" com o histórico',
    /pelo menos 10 letras/.test(e9) && s9['empresas/beta'].status === 'suspenso' && s9['empresas/beta'].motivo === 'Mensalidade em atraso. Fale com a equipe.' && Object.values(s9).some(x => x.acao === 'empresa.suspender' && x.empresaId === 'beta'), e9);

  // R10 avisos: publicar para quem presta serviço e para quem contrata
  await ir('#avisos', '#av-vivos');
  for (const [t, para] of [['Novidade para prestadores', 'prestadores'], ['Só para quem contrata', 'tomadores']]) {
    await page.click('#av-novo'); await page.waitForSelector('dialog[open] #av-titulo');
    await page.fill('dialog[open] #av-titulo', t); await page.fill('dialog[open] #av-texto', 'Texto do aviso.'); await page.selectOption('dialog[open] #av-para', para);
    await dlgOk(); await H.dorme(500);
  }
  const s10 = await srv(), avs = Object.keys(s10).filter(k => k.startsWith('avisos/')).map(k => s10[k]);
  await page.click('#av-novo'); await page.waitForSelector('dialog[open] #av-titulo'); await page.fill('dialog[open] #av-titulo', 'Vencido'); await page.fill('dialog[open] #av-ate', '01/01/2020'); await dlgOk();
  const e10 = await txt('dialog[open] #av-erro'); await page.click('dialog[open] [data-dlg-b="0"]');
  ok('R10 Avisos: publica com público e tipo (no ar, com histórico) e não aceita data que já passou',
    avs.length === 2 && avs.every(a => a.ativo && a.criadoPorNome === 'Iasmyn') && avs.some(a => a.para === 'prestadores') && (await page.$$('#av-vivos .av-it')).length === 2
    && Object.values(s10).filter(x => x.acao === 'aviso.publicar').length === 2 && /já passou/.test(e10), JSON.stringify({ n: avs.length, e10 }));

  // R11 Equipe: convidar (o link vai pelo WhatsApp ou copiar)
  await ir('#equipecw', '#eq-lista');
  await page.click('#eq-convidar'); await page.waitForSelector('dialog[open] #eq-nome');
  await page.fill('dialog[open] #eq-nome', 'Nina Rocha'); await page.fill('dialog[open] #eq-email', 'nina@conectwork.com.br'); await dlgOk();
  await page.waitForSelector('dialog[open] #eq-link', { timeout: 8000 });
  const link = await page.$eval('dialog[open] #eq-link', e => e.value), tk = link.split('convite/?c=')[1];
  await page.click('dialog[open] [data-dlg-b="0"]'); await H.dorme(400);
  const s11 = await srv(), cv = s11['convites/' + tk] || {};
  ok('R11 Equipe: convida com nome e e-mail; cria o convite da equipe (tipo master) e mostra o link; aparece em "Convites esperando"',
    cv.tipo === 'master' && cv.email === 'nina@conectwork.com.br' && cv.usado === false && /Nina Rocha/.test(await txt('#eq-convites')) && Object.values(s11).some(x => x.acao === 'equipe.convidar'), JSON.stringify({ tk, cv }));

  // R12 a pessoa abre o link, cria o acesso e entra na equipe
  await sair();
  await page.goto(H.BASE + 'vazio.html'); await page.goto(H.BASE + 'convite/?c=' + tk); await page.waitForSelector('#cv-criar', { timeout: 8000 });   /* a página do convite (prévia no WhatsApp) leva para #convite/<token> */
  await page.click('#cv-criar'); await page.waitForSelector('#cv-nome');
  await page.fill('#cv-nome', 'Nina Rocha'); await page.fill('#cv-email', 'nina@conectwork.com.br'); await page.fill('#cv-senha', 'senha1234'); await page.fill('#cv-senha2', 'senha1234');
  await page.check('#cv-termos'); for (const k of ['operacional', 'contrato', 'cobranca']) await page.check(`[data-ca="${k}"]`).catch(() => {});
  await page.click('#cv-ok'); await page.waitForSelector('#rd-numeros', { timeout: 12000 }); await H.dorme(300);
  const s12 = await srv(), uid = (JSON.parse(await page.evaluate(() => localStorage.getItem('__srv'))).users['nina@conectwork.com.br'] || {}).uid;
  ok('R12 quem recebeu o convite da equipe cria o acesso e entra direto no Painel da rede (master/{uid}, convite usado, histórico)',
    !!uid && s12['master/' + uid] && s12['master/' + uid].nome === 'Nina Rocha' && s12['convites/' + tk].usado === true && Object.values(s12).some(x => x.acao === 'equipe.entrar' && x.empresaId === 'master'), JSON.stringify({ uid }));

  // R13 a equipe tira a pessoa (ninguém tira a si mesmo)
  await sair(); await entrar('iasmyn@conectwork.com.br', '#rd-numeros');
  await ir('#equipecw', '#eq-lista');
  const btsEu = await page.$$eval('#eq-lista tbody tr', x => x.map(t => t.dataset.pessoa + ':' + !!t.querySelector('[data-tirar]')));
  await page.click(`[data-tirar="${uid}"]`); await page.waitForSelector('dialog[open]'); await dlgOk(); await H.dorme(600);
  const s13 = await srv();
  ok('R13 "Tirar da equipe" (não aparece para si mesma) apaga o master/{uid} e grava no histórico',
    btsEu.includes('uIASMYN:false') && btsEu.includes(uid + ':true') && !s13['master/' + uid] && Object.values(s13).some(x => x.acao === 'equipe.tirar'), JSON.stringify(btsEu));

  // R14 empresa prestadora: vê o aviso para prestadores (não o de quem contrata) e esconde com "Entendi"; vê a mensalidade em Minha empresa
  await sair(); await entrar('ana@alfa.com.br'); await page.waitForSelector('#ini-avisos .av-ban', { timeout: 8000 });
  const r14 = await txt('#ini-avisos');
  await page.click('#ini-avisos [data-visto]'); await H.dorme(200);
  const r14b = (await page.$$('#ini-avisos .av-ban')).length;
  await ir('#empresa', '#me-mens'); await page.waitForSelector('#me-mens .docrow', { timeout: 8000 });
  const r14c = await txt('#me-mens');
  ok('R14 empresa: aviso da equipe no Início só para o público certo, some com "Entendi"; Minha empresa mostra as mensalidades (com a atrasada)',
    /Novidade para prestadores/.test(r14) && !/Só para quem contrata/.test(r14) && r14b === 0 && /Atrasada/.test(r14c) && /199,00/.test(r14c), JSON.stringify({ r14, r14b, r14c }));

  // R15 empresa suspensa: vê só o Início (com o motivo) e Meu cadastro
  await sair(); await entrar('beto@beta.com.br', '#ini-suspensa');
  const r15 = { msg: await txt('#ini-suspensa'), menu: await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod).join()) };
  await ir('#meucadastro', '#mc-motivo'); const r15b = await txt('#mc-motivo');
  ok('R15 empresa suspensa vê o motivo no Início e em Meu cadastro, e só essas telas e Documentos (para regularizar)', /suspenso/.test(r15.msg) && /Mensalidade em atraso/.test(r15.msg) && r15.menu === 'inicio,meucadastro,documentos' && /suspenso/.test(r15b), JSON.stringify({ r15, r15b }));

  // R16 a equipe reativa
  await sair(); await entrar('iasmyn@conectwork.com.br', '#rd-numeros');
  await ir('#redeempresas/ver/beta', '#re-reativar'); await page.click('#re-reativar'); await page.waitForSelector('dialog[open]'); await dlgOk(); await H.dorme(600);
  const s16 = await srv();
  ok('R16 "Reativar o acesso" volta a empresa para aprovada (com histórico)', s16['empresas/beta'].status === 'aprovado' && Object.values(s16).some(x => x.acao === 'empresa.reativar'));

  // R17 celular: o painel cabe na tela (números em 2 colunas, sem rolagem para o lado)
  await page.setViewportSize({ width: 390, height: 844 }); await ir('#inicio', '#rd-numeros'); await H.dorme(300);
  const r17 = await page.evaluate(() => ({ lado: document.getElementById('app').scrollWidth <= innerWidth + 1, col: getComputedStyle(document.getElementById('rd-numeros')).gridTemplateColumns.split(' ').length }));
  ok('R17 celular: o Painel da rede cabe na largura (números em 2 colunas)', r17.lado && r17.col === 2, JSON.stringify(r17));

  const code = fim(erros); await browser.close(); process.exit(code);
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
