/* Teste de tela da sessão: sem acesso, um acesso, vários (escolher e trocar), master, empresa em análise,
   menu e barra de baixo montados pelas permissões, rota por hash e gravação no histórico. */
const H = require('./harness');
const { ok, fim } = H.placar('sessao');

/* módulos de mentira, só para provar o menu por permissão (não fazem parte do app) */
const MODS_TESTE = () => {
  if (CW.app.modulos().some(x => x.id === 'pagar')) { CW.app.montar(); return; }   /* já registrados nesta página */
  const t = id => ({ [id]: { nome: id, render: (el, ctx) => { el.innerHTML = `<p id="tela-${id}">${id}|${ctx.tela}|${ctx.params.join(',')}</p>`; } } });
  [['pagar', 'cobrancas'], ['receber', 'cobrancas'], ['conta', 'conta'], ['equipeteste'], ['profissionais']].forEach(([id, contrato], i) =>
    CW.registrarModulo({ id, nome: 'Mod ' + id, icone: 'list', ordem: 10 + i, contrato, telas: Object.assign(t(id), id === 'pagar' ? { detalhe: { nome: 'Detalhe', render: (el, ctx) => { el.innerHTML = `<p id="tela-detalhe">${ctx.params.join(',')}</p>`; } } } : {}) }));
  CW.app.montar();
};

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed();
  const menu = () => page.evaluate(() => Array.from(document.querySelectorAll('#menu [data-mod]')).map(b => b.dataset.mod));
  const toast = () => page.evaluate(() => document.getElementById('toast').classList.contains('show') ? document.getElementById('toast').innerText : '');
  const quem = () => page.evaluate(() => ({ nome: (document.getElementById('ini-nome') || {}).innerText, empresa: (document.getElementById('ini-empresa') || {}).innerText, cargo: (document.getElementById('ini-cargo') || {}).innerText,
    troca: !!document.getElementById('trocar-empresa'), leitura: !!document.getElementById('ini-leitura'), analise: !!document.getElementById('ini-analise') }));
  const sair = async () => { await page.click('#sair'); await page.waitForSelector('#lg-email', { timeout: 8000 }); };

  // S1 sem acesso
  await H.preparar(page, d); await page.goto(H.BASE);
  await H.entrar(page, 'carla@outra.com.br', 'senha123'); await page.waitForSelector('#sem-acesso', { timeout: 8000 });
  const s1 = await page.evaluate(() => ({ t: document.querySelector('#sem-acesso h2').innerText, cad: (document.getElementById('sa-cadastrar') || {}).innerText || '', conv: (document.getElementById('sa-convite') || {}).innerText || '', shell: !!document.querySelector('.shell'),
    consultas: window.__mockLog.filter(x => x[0] === 'consulta' || x[0] === 'le').map(x => x[0] === 'consulta' ? x[1] + ' where ' + JSON.stringify(x[2]) : x[1]) }));
  ok('S1 sem acesso: "Você ainda não tem acesso a nenhuma empresa" com "Cadastrar minha empresa" e "Tenho um convite"', s1.t === 'Você ainda não tem acesso a nenhuma empresa' && /^Cadastrar minha empresa/.test(s1.cad) && /^Tenho um convite/.test(s1.conv) && !s1.shell, s1.t);
  ok('S2 depois do login carrega usuarios/{uid}, acessos where uid == meu uid e master/{uid}', s1.consultas.includes('usuarios/uCARLA') && s1.consultas.includes('master/uCARLA') && s1.consultas.includes('acessos where [["uid","==","uCARLA"]]'), s1.consultas.join(' · '));
  await page.click('#sa-convite'); await page.waitForSelector('dialog[open] #tc-link', { timeout: 5000 });
  ok('S3 "Tenho um convite" pede o link recebido', await page.$eval('dialog[open] h2', e => e.innerText) === 'Tenho um convite');
  await page.click('dialog[open] [data-dlg-b="0"]'); await H.dorme(100);
  await page.evaluate(() => { window.__chamou = []; CW.entrada.cadastrarEmpresa = () => __chamou.push('cad'); CW.entrada.abrirConvite = () => __chamou.push('conv'); });
  await page.click('#sa-cadastrar'); await page.click('#sa-convite');
  ok('S4 os botões chamam os ganchos da Etapa 1 (cadastro e convite)', JSON.stringify(await page.evaluate(() => __chamou)) === '["cad","conv"]');
  await page.click('#sa-sair'); await page.waitForSelector('#lg-email', { timeout: 8000 });

  // S5 bloqueada
  await H.entrar(page, 'duda@alfa.com.br', 'senha123'); await page.waitForSelector('#sem-acesso', { timeout: 8000 });
  const s5 = await page.evaluate(() => (document.getElementById('sess-bloq') || {}).innerText || '');
  ok('S5 acesso bloqueado (ativo=false) não entra e explica', /Alfa Serviços está bloqueado/.test(s5), s5);
  await page.click('#sa-sair'); await page.waitForSelector('#lg-email');

  // S6 um acesso: entra direto
  await H.entrar(page, 'ana@alfa.com.br', 'senha123'); await page.waitForSelector('#ini-nome', { timeout: 8000 });
  let q = await quem();
  ok('S6 um acesso: entra direto e o Início mostra pessoa, empresa e cargo', q.nome === 'Ana Souza' && q.empresa === 'Alfa Serviços' && q.cargo === 'Administrador' && !q.troca && !q.leitura, JSON.stringify(q));
  const s6 = await page.evaluate(() => ({ quem: document.getElementById('quem-sub').innerText, titulo: document.getElementById('titulo').innerText }));
  ok('S7 cartão do usuário e saudação no topo', s6.quem === 'Administrador · Alfa Serviços' && /^(Bom dia|Boa tarde|Boa noite), Ana$/.test(s6.titulo), JSON.stringify(s6));

  // S8 menu por permissão (admin: tudo que a empresa contratou)
  const fx = await page.evaluate(() => ({ cls: document.documentElement.classList.contains('entrada'), body: getComputedStyle(document.body).backgroundColor }));
  ok('S-fundo dentro do app a página volta ao fundo normal (só as telas de entrada são azuis)', !fx.cls && fx.body !== 'rgb(8, 22, 56)', JSON.stringify(fx));
  await page.evaluate(MODS_TESTE); await H.dorme(200);
  let m = await menu();
  ok('S8 admin vê tudo o que a empresa contratou (não vê "conta", que a Alfa não contratou)', JSON.stringify(m) === JSON.stringify(['inicio', 'pagar', 'receber', 'equipeteste', 'profissionais', 'contratos', 'medicoes', 'espelhos', 'titulos', 'relatorios', 'documentos', 'empresa', 'historico']), m.join(','));

  // S9 rota por hash com tela e parâmetros
  await page.evaluate(() => { location.hash = '#pagar/detalhe/C-1001/x'; }); await page.waitForSelector('#tela-detalhe');
  const s9 = await page.evaluate(() => ({ p: document.getElementById('tela-detalhe').innerText, cur: document.querySelector('#menu [aria-current="page"]').dataset.mod, crumbs: document.getElementById('crumbs').innerText }));
  ok('S9 rota #modulo/tela/parametros abre a tela certa, marca o menu e o caminho', s9.p === 'C-1001,x' && s9.cur === 'pagar' && /Mod pagar.*Detalhe/.test(s9.crumbs.replace(/\n/g, ' ')), JSON.stringify(s9));
  await page.click('#menu [data-mod="receber"]'); await page.waitForSelector('#tela-receber');
  ok('S10 clique no menu muda o hash e a tela', await page.evaluate(() => location.hash === '#receber'));
  await page.evaluate(() => { location.hash = '#conta'; }); await H.dorme(300);
  const s11 = await page.evaluate(() => location.hash);
  ok('S11 tela sem permissão pelo link: avisa e volta para o início', s11 === '#inicio' && /não tem acesso/.test(await toast()), s11 + ' · ' + await toast());

  // S12 histórico
  const s12 = await page.evaluate(async () => { const r = await CW.registrarLog('teste.acao', 'Teste de gravação no histórico.', 'doc123');
    const x = JSON.parse(localStorage.getItem('__srv')).docs[r.path]; return { path: r.path, x }; });
  const x = s12.x || {};
  ok('S12 registrarLog grava em log/ com em, uid, quem, empresaId, acao, texto e ref', /^log\//.test(s12.path) && x.uid === 'uANA' && x.quem === 'Ana Souza' && x.empresaId === 'alfa' && x.acao === 'teste.acao' && x.texto === 'Teste de gravação no histórico.' && x.ref === 'doc123' && !isNaN(Date.parse(x.em)), JSON.stringify(x));
  await sair();

  // S13 vários acessos: escolhe, cargo de só leitura, troca no topo, F5 mantém
  await H.entrar(page, 'bruno@alfa.com.br', 'senha123'); await page.waitForSelector('#escolher', { timeout: 8000 });
  const ops = await page.evaluate(() => Array.from(document.querySelectorAll('#escolher [data-ctx]')).map(b => b.dataset.ctx + '=' + b.innerText.replace(/\n/g, ' ')));
  ok('S13 vários acessos: mostra a escolha de empresa com o cargo de cada uma', ops.length === 2 && /Alfa Serviços Financeiro/.test(ops.join('|')) && /Beta Indústria Contador \(só leitura\)/.test(ops.join('|')), ops.join(' | '));
  await page.click('[data-ctx="empresa:beta"]'); await page.waitForSelector('#ini-nome');
  q = await quem();
  ok('S14 entra na empresa escolhida; contador vê o aviso de só leitura e o botão de troca', q.empresa === 'Beta Indústria' && q.cargo === 'Contador (só leitura)' && q.leitura && q.troca, JSON.stringify(q));
  await page.evaluate(MODS_TESTE); await H.dorme(200); m = await menu();
  ok('S15 menu do contador: só pagar, receber, relatórios e espelhos (além do início)', JSON.stringify(m) === JSON.stringify(['inicio', 'pagar', 'receber', 'espelhos', 'titulos', 'relatorios', 'documentos']), m.join(','));
  await page.click('#trocar-empresa'); await page.waitForSelector('#trocar-lista');
  const atual = await page.evaluate(() => document.querySelector('#trocar-lista [aria-current="true"]').dataset.ctx);
  await page.click('#trocar-lista [data-ctx="empresa:alfa"]'); await H.dorme(400);
  q = await quem();
  ok('S16 troca de empresa pelo topo (marca a atual e troca cargo e menu)', atual === 'empresa:beta' && q.empresa === 'Alfa Serviços' && q.cargo === 'Financeiro' && !q.leitura && /Alfa Serviços/.test(await toast()), JSON.stringify(q));
  await page.reload(); await page.waitForSelector('#ini-nome', { timeout: 8000 }); q = await quem();
  ok('S17 F5 continua na empresa escolhida (não pergunta de novo)', q.empresa === 'Alfa Serviços', JSON.stringify(q));
  await page.evaluate(MODS_TESTE); await H.dorme(200); m = await menu();
  ok('S18 menu do financeiro: pagar, receber, relatórios, medições, espelhos e Minha empresa (conta não contratada; usuários e histórico são do admin)', JSON.stringify(m) === JSON.stringify(['inicio', 'pagar', 'receber', 'contratos', 'medicoes', 'espelhos', 'titulos', 'relatorios', 'documentos', 'empresa']), m.join(','));

  // S19 ajuste individual: extras e sem
  await page.evaluate(() => { const a = CW.sessao.estado().contexto.acesso; a.extras = ['profissionais']; a.sem = ['pagar']; CW.app.montar(); }); await H.dorme(200);
  m = await menu();
  ok('S19 ajuste por pessoa: "extras" acrescenta e "sem" tira telas do cargo', JSON.stringify(m) === JSON.stringify(['inicio', 'receber', 'profissionais', 'contratos', 'medicoes', 'espelhos', 'titulos', 'relatorios', 'documentos', 'empresa']), m.join(','));

  // S20 celular: barra de baixo com até 4 + Mais
  await page.evaluate(() => { const a = CW.sessao.estado().contexto.acesso; a.cargo = 'admin'; a.extras = []; a.sem = []; CW.app.montar(); });
  await page.setViewportSize({ width: 390, height: 800 }); await H.dorme(300);
  const s20 = await page.evaluate(() => ({ bnav: getComputedStyle(document.getElementById('bnav')).display, side: getComputedStyle(document.getElementById('menu')).display,
    itens: Array.from(document.querySelectorAll('#bnav button')).map(b => b.innerText.trim()), larg: document.documentElement.scrollWidth }));
  ok('S20 no celular: barra de navegação embaixo (4 + "Mais"), menu lateral escondido, sem rolagem lateral', s20.bnav === 'grid' && s20.side === 'none' && s20.itens.length === 5 && /^Mais/.test(s20.itens[4]) && s20.larg <= 390, JSON.stringify(s20));
  await page.click('#bnav-mais'); await page.waitForSelector('[data-mais]');
  await page.click('[data-mais="historico"]'); await page.waitForSelector('#hs', { timeout: 8000 });
  ok('S21 "Mais" abre as outras telas e navega', await page.evaluate(() => location.hash === '#historico' && document.getElementById('bnav-mais').getAttribute('aria-current') === 'page'));
  await page.setViewportSize({ width: 1280, height: 900 });
  await sair();

  // S22 master
  await H.entrar(page, 'iasmyn@conectwork.com.br', 'senha123'); await page.waitForSelector('#ini-nome', { timeout: 8000 });
  q = await quem();
  await page.evaluate(MODS_TESTE); await H.dorme(200); m = await menu();
  ok('S22 equipe Conectwork (master/{uid}): entra como "Equipe Conectwork" e vê só as telas da equipe (Início, Cadastros, Sites de emissão e Histórico), nenhuma de empresa', q.empresa === 'Equipe Conectwork' && q.cargo === 'Equipe Conectwork' && JSON.stringify(m) === '["inicio","cadastros","emissores","historico"]', JSON.stringify(q) + ' menu=' + m);
  const s23 = await page.evaluate(async () => { const r = await CW.registrarLog('teste', 'Teste master.'); return JSON.parse(localStorage.getItem('__srv')).docs[r.path].empresaId; });
  ok('S23 histórico gravado pela equipe master vai com empresaId "master"', s23 === 'master', s23);
  await sair();

  // S24 empresa em análise
  await H.entrar(page, 'gil@gama.com.br', 'senha123'); await page.waitForSelector('#ini-nome', { timeout: 8000 });
  q = await quem(); await page.evaluate(MODS_TESTE); await H.dorme(200); m = await menu();
  ok('S24 empresa em análise: entra, vê o aviso e só as telas liberadas antes da aprovação (Início, Meu cadastro e Documentos)', q.analise && q.empresa === 'Gama Logística' && JSON.stringify(m) === '["inicio","meucadastro","documentos"]', JSON.stringify(q) + ' menu=' + m);
  await sair();

  // S25 falha ao carregar os acessos → tela de erro com "Tentar de novo"
  await H.ctlSet(page, { negar: ['acessos'] });
  await H.entrar(page, 'ana@alfa.com.br', 'senha123'); await page.waitForSelector('#sess-erro', { timeout: 8000 });
  const s25 = await page.evaluate(() => document.getElementById('sess-erro').innerText);
  await H.ctlSet(page, {}); await page.click('#sess-tentar'); await page.waitForSelector('#ini-nome', { timeout: 8000 });
  ok('S25 erro ao carregar os acessos: explica, não expulsa, e "Tentar de novo" funciona', /permissão/.test(s25), s25.split('\n')[1]);

  const code = fim(erros); await browser.close(); process.exit(code);
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
