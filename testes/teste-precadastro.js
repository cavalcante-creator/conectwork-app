/* Teste de tela do pré-cadastro pela equipe Conectwork (09/11/2026): só CNPJ, empresa já aprovada com o plano,
   quem cadastrou vira administrador(a) e entra na empresa; documentos pendentes; depois pede para a empresa completar.
   Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('precadastro');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => { d.docs['empresas/gama'].cnpj = '11.444.777/0001-61'; });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  const erroDlg = () => page.$eval('dialog[open] #pc-erro', e => e.innerText);

  await H.preparar(page, d); await page.goto(H.BASE);
  await H.entrar(page, 'iasmyn@conectwork.com.br', 'senha123'); await page.waitForSelector('#menu', { timeout: 8000 });
  await page.evaluate(() => { location.hash = '#cadastros'; }); await page.waitForSelector('#cm-pre', { timeout: 6000 });

  // P1 abre a janela: CNPJ, nome, uso, plano (Profissional sugerido) e "me colocar como administrador(a)" marcado
  await page.click('#cm-pre'); await page.waitForSelector('dialog[open] #pc-cnpj');
  const p1 = await page.evaluate(() => ({ plano: document.getElementById('pc-plano').value, admin: document.getElementById('pc-admin').checked, tit: document.querySelector('dialog[open] h2').innerText }));
  ok('P1 "Pré-cadastrar empresa": pede só CNPJ, nome, uso e plano; já vem "me colocar como administrador(a)"', p1.tit === 'Pré-cadastrar empresa' && p1.plano === 'profissional' && p1.admin, JSON.stringify(p1));

  // P2 validações: CNPJ inválido, nome vazio, CNPJ que já existe
  const clicar = () => page.click('dialog[open] [data-dlg-b="1"]');
  await page.fill('#pc-cnpj', '11.111.111/1111-11'); await clicar(); const e1 = await erroDlg();
  await page.fill('#pc-cnpj', '04.252.011/0001-10'); await clicar(); const e2 = await erroDlg();
  await page.fill('#pc-cnpj', '11.444.777/0001-61'); await page.fill('#pc-nome', 'Outra'); await clicar(); const e3 = await erroDlg();
  ok('P2 recusa CNPJ inválido, nome vazio e CNPJ que já tem cadastro (sem gravar nada)', /CNPJ inválido/.test(e1) && /nome da empresa/.test(e2) && /já tem cadastro/.test(e3)
    && !Object.values(await srv()).some(x => x.preCadastro), JSON.stringify([e1, e2, e3]));

  // P3 grava: empresa aprovada no plano, módulos do plano, documentos pendentes, CNPJ reservado, acesso admin e histórico
  await page.fill('#pc-cnpj', '04.252.011/0001-10'); await page.fill('#pc-nome', 'Prestadora Delta'); await page.selectOption('#pc-tipo', 'prestador'); await clicar();
  await page.waitForFunction(() => document.querySelector('dialog[open]') && /pré-cadastrada/.test(document.querySelector('dialog[open] h2').innerText), null, { timeout: 6000 });
  const s3 = await srv(), id = Object.keys(s3).find(k => /^empresas\/[^/]+$/.test(k) && s3[k].preCadastro).split('/')[1], e = s3['empresas/' + id];
  const ac = s3['acessos/' + id + '_uIASMYN'], lg = Object.values(s3).find(x => x.acao === 'empresa.precadastro');
  ok('P3 empresa nasce aprovada no plano Profissional, com os módulos do plano, documentos pendentes, CNPJ reservado, Iasmyn como admin e histórico',
    e.status === 'aprovado' && e.plano === 'profissional' && e.tipo === 'prestador' && e.cnpjNum === '04252011000110' && JSON.stringify(e.modulos) === '["equipe","cobrancas","integracao","contratos","profissionais","emissao"]'
    && /^CW-\d{4}-\d{4}$/.test(e.protocolo) && s3['cnpjs/04252011000110'].empresaId === id && s3['empresas/' + id + '/privado/cadastro'].preCadastro === true
    && ac && ac.cargo === 'admin' && ac.ativo === true && lg && /Dados e documentos pendentes/.test(lg.texto), JSON.stringify({ e, ac: !!ac, lg: lg && lg.texto }));

  // P4 "Entrar na empresa": a Iasmyn entra na empresa nova como administradora e vê o menu dela
  await page.click('dialog[open] [data-dlg-b="1"]');
  await page.waitForFunction(() => { const t = document.querySelector('.empbloco') && document.querySelector('.empbloco').innerText; return t && /Prestadora Delta/.test(t); }, null, { timeout: 8000 });
  const p4 = await page.evaluate(() => ({ menu: Array.from(document.querySelectorAll('#menu [data-mod]')).map(b => b.dataset.mod), cad: !!document.querySelector('#menu [data-mod="cadastros"]') }));
  ok('P4 "Entrar na empresa" abre a empresa nova (menu da empresa, sem as telas da equipe)', p4.menu.length > 0 && !p4.cad, JSON.stringify(p4));

  // P5 de volta à equipe: a lista mostra "Documentos pendentes"; a análise avisa e oferece pedir para completar
  await page.evaluate(() => CW.sessao.entrarEm('master')); await page.waitForSelector('#menu [data-mod="cadastros"]', { timeout: 6000 });
  await page.evaluate(() => { location.hash = '#cadastros'; }); await page.waitForSelector('#cm-lista'); await page.click('[data-filtro="aprovado"]');
  const p5 = await page.evaluate(id => (document.querySelector(`tr[data-abrir="${id}"]`) || {}).innerText || '', id);
  await page.click(`tr[data-abrir="${id}"]`); await page.waitForSelector('#cm-pre-aviso', { timeout: 6000 });
  ok('P5 lista com "Documentos pendentes"; a análise avisa que é pré-cadastro', /Documentos pendentes/.test(p5), p5);

  // P6 pedir para a empresa completar: vira "ajuste pedido" com a mensagem (a empresa completa em "Meu cadastro")
  await page.click('#cm-ajuste'); await page.waitForSelector('#cm-decisao .banner.warn', { timeout: 6000 }); await H.dorme(200);
  const e6 = (await srv())['empresas/' + id];
  ok('P6 "Pedir para a empresa completar o cadastro": fica "ajuste pedido" com a mensagem', e6.status === 'pendencia' && /Complete os dados/.test(e6.motivo), JSON.stringify({ s: e6.status, m: e6.motivo }));

  // P7 sem marcar "administrador(a)": empresa criada sem acesso de ninguém
  await page.evaluate(() => { location.hash = '#cadastros'; }); await page.waitForSelector('#cm-pre'); await page.click('#cm-pre'); await page.waitForSelector('dialog[open] #pc-cnpj');
  await page.fill('#pc-cnpj', '45.723.174/0001-10'); await page.fill('#pc-nome', 'Tomadora Épsilon'); await page.uncheck('#pc-admin'); await clicar(); await H.dorme(600);
  const s7 = await srv(), id7 = Object.keys(s7).find(k => /^empresas\/[^/]+$/.test(k) && s7[k].nome === 'Tomadora Épsilon');
  ok('P7 sem "me colocar como administrador(a)": pré-cadastra sem criar acesso', !!id7 && !Object.keys(s7).some(k => k.startsWith('acessos/' + id7.split('/')[1] + '_')), id7);

  // P9 MEI: escolher o porte MEI já marca "Só presta serviços", grava o porte e a empresa abre no jeito do profissional
  await page.evaluate(() => { location.hash = '#cadastros'; }); await page.waitForSelector('#cm-pre'); await page.click('#cm-pre'); await page.waitForSelector('dialog[open] #pc-porte');
  await page.fill('#pc-cnpj', '11.222.333/0001-81'); await page.fill('#pc-nome', 'Profissional Zeta'); await page.selectOption('#pc-porte', 'MEI');
  const t9 = await page.$eval('#pc-tipo', e => e.value); await clicar();
  await page.waitForFunction(() => document.querySelector('dialog[open]') && /pré-cadastrada/.test(document.querySelector('dialog[open] h2').innerText), null, { timeout: 6000 });
  const s9 = await srv(), id9 = Object.keys(s9).find(k => /^empresas\/[^/]+$/.test(k) && s9[k].nome === 'Profissional Zeta').split('/')[1];
  await page.click('dialog[open] [data-dlg-b="1"]');
  await page.waitForSelector('#menu-alt', { timeout: 8000 });
  const m9 = await page.evaluate(() => ({ alt: document.getElementById('menu-alt').innerText, nomes: Array.from(document.querySelectorAll('#menu [data-mod] span')).map(x => x.innerText) }));
  ok('P9 porte MEI: marca "Só presta serviços", grava o porte e a empresa abre no menu simples do profissional (Notas a emitir, A receber)',
    t9 === 'prestador' && s9['empresas/' + id9].tipo === 'prestador' && s9['empresas/' + id9 + '/privado/cadastro'].dados.porte === 'MEI' && /Ver todas as telas/.test(m9.alt) && m9.nomes.includes('Notas a emitir'), JSON.stringify({ t9, m9 }));

  // P10 empresa pré-cadastrada sem porte abre no menu completo; a equipe muda para MEI na análise e o menu simples aparece
  await page.evaluate(() => CW.sessao.entrarEm('master')); await page.waitForSelector('#menu [data-mod="cadastros"]', { timeout: 6000 });
  await page.evaluate(() => { location.hash = '#cadastros'; }); await page.waitForSelector('#cm-pre'); await page.click('#cm-pre'); await page.waitForSelector('dialog[open] #pc-porte');
  await page.fill('#pc-cnpj', '33.000.167/0001-01'); await page.fill('#pc-nome', 'Profissional Eta'); await page.selectOption('#pc-tipo', 'prestador'); await clicar();
  await page.waitForFunction(() => document.querySelector('dialog[open]') && /pré-cadastrada/.test(document.querySelector('dialog[open] h2').innerText), null, { timeout: 6000 });
  const id10 = Object.entries(await srv()).find(([k, v]) => /^empresas\/[^/]+$/.test(k) && v.nome === 'Profissional Eta')[0].split('/')[1];
  await page.click('dialog[open] [data-dlg-b="1"]'); await page.waitForSelector('#menu [data-mod]', { timeout: 8000 }); await H.dorme(500);
  const antes10 = !!(await page.$('#menu-alt'));
  await page.evaluate(() => CW.sessao.entrarEm('master')); await page.waitForSelector('#menu [data-mod="cadastros"]', { timeout: 6000 });
  await page.evaluate(id => { location.hash = '#cadastros/analise/' + id; }, id10); await page.waitForSelector('#cm-porte', { timeout: 6000 });
  await page.selectOption('#cm-porte', 'MEI'); await page.click('#cm-salvar'); await H.dorme(500);
  const s10 = await srv();
  await page.evaluate(id => CW.sessao.entrarEm('empresa:' + id), id10); await page.waitForSelector('#menu-alt', { timeout: 8000 }).catch(() => {});
  ok('P10 sem porte abre no menu completo; a equipe põe MEI na análise e a empresa passa a abrir no menu simples (com histórico)',
    !antes10 && s10['empresas/' + id10 + '/privado/cadastro'].dados.porte === 'MEI' && !!(await page.$('#menu-alt')) && Object.values(s10).some(x => x.acao === 'empresa.plano' && /Porte: MEI/.test(x.texto)), JSON.stringify({ antes10, d: s10['empresas/' + id10 + '/privado/cadastro'].dados }));
  await page.evaluate(() => CW.sessao.entrarEm('master')); await page.waitForSelector('#menu [data-mod="cadastros"]', { timeout: 6000 });
  await page.evaluate(() => { location.hash = '#cadastros'; }); await page.waitForSelector('#cm-pre');

  // P8 celular: a janela cabe sem rolar para o lado
  await page.setViewportSize({ width: 390, height: 844 }); await page.click('#cm-pre'); await page.waitForSelector('dialog[open] #pc-cnpj'); await H.dorme(200);
  ok('P8 celular: a janela do pré-cadastro cabe na tela', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));

  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
