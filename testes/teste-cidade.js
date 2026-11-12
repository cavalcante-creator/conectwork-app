/* Teste de "Na sua cidade" (11/11/2026, piloto com a Prefeitura): a equipe pré-cadastra a parceira com a cidade; a parceira
   publica curso, licitação e aviso; o MEI da cidade vê (o de outra cidade não), "Para você" liga o curso ao DAS vencido,
   ele se inscreve com a autorização, a parceira vê a lista e marca que concluiu, o MEI vê o certificado, cancela/volta,
   e abre o comprovante de recebimentos. Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('cidade');
const pad = n => String(n).padStart(2, '0'), hj = new Date(), ANO = hj.getFullYear();
const mais = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    d.docs['empresas/pref'] = { nome: 'Prefeitura de Vila Nova', cnpj: '', status: 'aprovado', tipo: 'contratante', modulos: ['equipe', 'cidade'], plano: 'cidade', cidade: 'Vila Nova', uf: 'RS', criadoPor: 'uX' };
    d.docs['empresas/pref/privado/cadastro'] = { dados: {} };
    const mei = (id, cidade, das) => { d.docs['empresas/' + id] = { nome: 'Negócio ' + id, cnpj: '', status: 'mei', tipo: 'prestador', modulos: [], cidade, uf: 'RS', criadoPor: 'u' + id, criadoEm: `${ANO - 1}-01-10T12:00:00Z` };
      d.docs['empresas/' + id + '/privado/cadastro'] = { dados: { porte: 'MEI', segmento: 'Serviços', abertura: `${ANO - 1}-01-05` } }; d.docs['fiscal/' + id] = { das: das || {}, dasn: {} }; };
    mei('m1', 'Vila Nova'); mei('m2', 'Outra Cidade');
    const pessoa = (uid, email, emp, nome, cargo) => { d.users[email] = { uid, pass: 'senha123' }; d.docs['usuarios/' + uid] = { nome, email }; d.docs[`acessos/${emp}_${uid}`] = { uid, empresaId: emp, nome, email, cargo: cargo || 'admin', extras: [], sem: [], ativo: true }; };
    pessoa('uPIA', 'pia@cidade.example', 'pref', 'Pia Gestora'); pessoa('uM1', 'caio@m1.example', 'm1', 'Caio Prestador'); pessoa('uM2', 'lia@m2.example', 'm2', 'Lia Prestadora');
    const op = (id, x) => { d.docs['oportunidades/' + id] = Object.assign({ origemId: 'pref', origemNome: 'Prefeitura de Vila Nova', cidade: 'Vila Nova', uf: 'RS', cidadeKey: 'vila-nova-rs', texto: '', data: '', hora: '', local: '', link: '', ate: '', inscricao: false, vagas: 0, gatilho: '', ramos: [], docs: [], valorCentavos: 0, status: 'publicado', criadoPor: 'uPIA', criadoPorNome: 'Pia Gestora', criadoEm: `${ANO}-01-10T12:00:00Z` }, x); };
    op('oDas', { tipo: 'curso', titulo: 'Oficina: como regularizar o DAS', data: mais(10), hora: '19:00', local: 'Sala do Empreendedor', inscricao: true, vagas: 30, gatilho: 'das' });
    op('oVelho', { tipo: 'aviso', titulo: 'Aviso que já passou', ate: mais(-3) });
    op('oServ', { tipo: 'servico', titulo: 'Emitir alvará', link: 'https://exemplo.example/alvara' });
  });
  const entrarComo = async email => { if (await page.$('#sair')) await page.click('#sair'); await page.waitForSelector('#lg-email'); await H.entrar(page, email, 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 }); await H.dorme(900); };
  const ir = async (rota, sel) => { await page.evaluate(r => { location.hash = '#' + r; }, rota); await page.waitForSelector(sel, { timeout: 10000 }); await H.dorme(300); };
  await H.preparar(page, d); await page.goto(H.BASE);

  // C1 a equipe pré-cadastra a parceira: o plano "Parceiro da cidade" pede cidade e UF
  await entrarComo('iasmyn@conectwork.com.br');
  await ir('cadastros', '#cm-pre'); await page.click('#cm-pre'); await page.waitForSelector('#pc-plano');
  const antes = await page.$eval('#pc-cidade-bloco', e => e.hidden);
  await page.selectOption('#pc-plano', 'cidade');
  const depois = await page.$eval('#pc-cidade-bloco', e => e.hidden);
  await page.fill('#pc-cnpj', '11.222.333/0001-81'); await page.fill('#pc-nome', 'Prefeitura de Campo Belo'); await page.uncheck('#pc-admin');
  await page.click('dialog[open] .btn:not(.sec)'); await H.dorme(300);
  const erro = await page.$eval('#pc-erro', e => e.textContent);
  await page.fill('#pc-cidade', 'Campo Belo'); await page.fill('#pc-uf', 'rs'); await page.click('dialog[open] .btn:not(.sec)'); await H.dorme(1200);
  const nova = await page.evaluate(() => Object.entries(JSON.parse(localStorage.getItem('__srv')).docs).filter(([k, v]) => /^empresas\/[^/]+$/.test(k) && v.nome === 'Prefeitura de Campo Belo').map(([, v]) => v)[0]);
  ok('C1 pré-cadastro: o plano Parceiro da cidade pede cidade e UF e grava com o módulo', antes === true && depois === false && /cidade e a UF/.test(erro) && nova && nova.cidade === 'Campo Belo' && nova.uf === 'RS' && nova.modulos.includes('cidade'), JSON.stringify({ antes, depois, erro, nova: nova && [nova.cidade, nova.uf, nova.modulos] }));

  // C2 a parceira abre "Oportunidades da cidade" e publica uma licitação
  await entrarComo('pia@cidade.example');
  const menuP = await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod));
  await ir('cidadegestao', '#cg-nums');
  await page.click('#cg-nova'); await page.waitForSelector('#cf-tit');
  await page.selectOption('#cf-tipo', 'licitacao'); await page.fill('#cf-tit', 'Pregão: pintura de escolas');
  await page.fill('#cf-docs', 'Certidão de débitos municipais\nCertificado do MEI'); await page.click('#cf-ramos label:has(input[value="Serviços"])');
  const inscEscondido = await page.$eval('#cf-insc', e => e.closest('[data-so]').hidden);
  await page.click('dialog[open] .btn:not(.sec)'); await H.dorme(900);
  const lic = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('__srv')).docs).find(v => v.titulo === 'Pregão: pintura de escolas'));
  const logs = () => page.evaluate(() => Object.entries(JSON.parse(localStorage.getItem('__srv')).docs).filter(([k]) => k.startsWith('log/')).map(([, v]) => v.acao));
  ok('C2 a parceira vê a tela dela (sem "Na sua cidade") e publica a licitação com histórico', menuP.includes('cidadegestao') && !menuP.includes('nacidade') && inscEscondido && lic && lic.status === 'publicado' && lic.cidadeKey === 'vila-nova-rs' && lic.docs.length === 2 && lic.inscricao === false && (await logs()).includes('cidade.criar'), JSON.stringify({ menuP, inscEscondido, lic }));
  const nAr = await page.$eval('#cg-n-ar b', e => e.textContent);
  ok('C3 no ar: só o que está valendo (o aviso que já passou vai para Encerradas)', nAr === '3' && /1/.test(await page.$eval('#cg-n-fora b', e => e.textContent)), nAr);

  // C4 o MEI de outra cidade não vê nada de Vila Nova
  await entrarComo('lia@m2.example'); await ir('nacidade', '#nc-vazio');
  ok('C4 MEI de outra cidade: nada publicado para ele', /Outra Cidade/.test(await page.$eval('#nc-vazio', e => e.textContent)));

  // C5 o MEI da cidade: com DAS vencido, "Para você" mostra a oficina com o motivo
  await entrarComo('caio@m1.example');
  const menuM = await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod));
  const tile = await page.$('[data-tile="nacidade"]');
  await ir('nacidade', '#nc-abas'); await H.dorme(600);
  await page.click('#nc-abas [data-aba="voce"]'); await H.dorme(300);
  const voce = await page.$eval('#view', e => e.textContent);
  ok('C5 "Na sua cidade" no menu e no Início do MEI; Para você liga a oficina ao DAS vencido', menuM.includes('nacidade') && !!tile && /Oficina: como regularizar o DAS/.test(voce) && /DAS vencido/.test(voce) && /Pregão: pintura/.test(voce) && !/Aviso que já passou/.test(voce), JSON.stringify({ menuM: menuM.join(','), tile: !!tile, voce: voce.slice(0, 300) }));

  // C6 quero participar: sem marcar a autorização não inscreve; marcando, grava com o texto
  await page.click('[data-quero="oDas"]'); await page.waitForSelector('#np-aceite');
  await page.click('dialog[open] .btn:not(.sec)'); await H.dorme(200);
  const e6 = await page.$eval('#np-erro', e => e.textContent);
  await page.check('#np-aceite'); await page.click('dialog[open] .btn:not(.sec)'); await H.dorme(900);
  const ins = await page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs['inscricoes/oDas_m1']);
  ok('C6 inscrição só com a autorização; guarda o texto e os dados mínimos', /autorização/.test(e6) && ins && ins.status === 'inscrito' && /só para a inscrição/.test(ins.consentimento.texto) && ins.negocio === 'Negócio m1' && ins.email === 'caio@m1.example' && !('cnpj' in ins) && (await logs()).includes('cidade.inscrever'), JSON.stringify({ e6, ins }));
  ok('C7 o cartão mostra "Você está inscrito" e a lista "Meus cursos e eventos"', /Você está inscrito/.test(await page.$eval('#view', e => e.textContent)) && !!(await page.$('#nc-meus')));

  // C8 licitações com os documentos pedidos e o atalho de serviço
  await page.click('#nc-abas [data-aba="licitacao"]'); await H.dorme(300);
  const licT = await page.$eval('#view', e => e.textContent);
  await page.click('#nc-abas [data-aba="servico"]'); await H.dorme(300);
  const href = await page.$eval('#nc-servicos a', a => a.href + '|' + a.rel);
  ok('C8 licitação mostra os documentos; serviço abre a página oficial em outra aba', /Certidão de débitos municipais/.test(licT) && /alvara\|noopener noreferrer/.test(href), href);

  // C9 crédito: comprovante de recebimentos (sem pagamentos confirmados, explica e não baixa)
  await ir('nacidade/renda', '#nr-pdf');
  const r9 = await page.evaluate(() => ({ dis: document.getElementById('nr-pdf').disabled, txt: document.getElementById('view').textContent }));
  ok('C9 comprovante de recebimentos: você baixa e leva; sem pagamentos, botão desligado', r9.dis && /não manda os seus dados/.test(r9.txt) && !!(await page.$('#nr-vazio')), r9.txt.slice(0, 200));

  // C10 a parceira vê o inscrito, marca que concluiu
  await entrarComo('pia@cidade.example'); await ir('cidadegestao', '#cg-nums');
  const nInsc = await page.$eval('#cg-n-insc b', e => e.textContent);
  await page.click('[data-insc="oDas"]'); await page.waitForSelector('#ci-lista tbody tr');
  const linha = await page.$eval('#ci-lista tbody tr', e => e.textContent);
  await page.click('[data-concluiu="oDas_m1"]'); await H.dorme(900);
  const conc = await page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs['inscricoes/oDas_m1'].concluiu);
  ok('C10 a parceira vê o inscrito (negócio, pessoa, contato) e marca que concluiu', nInsc === '1' && /Negócio m1/.test(linha) && /Caio Prestador/.test(linha) && conc && conc.por === 'Pia Gestora', JSON.stringify({ nInsc, linha, conc }));

  // C11 o MEI vê o certificado; cancela outra? (cancelar e voltar a se inscrever)
  await entrarComo('caio@m1.example'); await ir('nacidade', '#nc-meus');
  const meus = await page.$eval('#nc-meus', e => e.textContent);
  await page.click('#nc-abas [data-aba="cursos"]'); await H.dorme(300);
  await page.click('[data-sair="oDas"]'); await page.waitForSelector('dialog[open]'); await page.click('dialog[open] .btn:not(.sec)'); await H.dorme(900);
  const st1 = await page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs['inscricoes/oDas_m1'].status);
  await page.click('[data-quero="oDas"]'); await page.waitForSelector('#np-aceite'); await page.check('#np-aceite'); await page.click('dialog[open] .btn:not(.sec)'); await H.dorme(900);
  const st2 = await page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs['inscricoes/oDas_m1'].status);
  ok('C11 certificado no perfil; cancelar e voltar a se inscrever', /Certificado/.test(meus) && /Concluído em/.test(meus) && st1 === 'cancelado' && st2 === 'inscrito', JSON.stringify({ meus, st1, st2 }));

  // C12 a parceira encerra: sai da tela do MEI
  await entrarComo('pia@cidade.example'); await ir('cidadegestao', '#cg-nums');
  await page.click('[data-encerrar="oServ"]'); await page.waitForSelector('dialog[open]'); await page.click('dialog[open] .btn:not(.sec)'); await H.dorme(900);
  const enc = await page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs['oportunidades/oServ'].status);
  ok('C12 encerrar não apaga: fica guardada como encerrada', enc === 'encerrado' && (await logs()).includes('cidade.encerrar'), enc);

  ok('Sem erros de script', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
