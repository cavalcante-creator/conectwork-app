/* Teste de tela de "Meus dados" e da busca do topo (09/11/2026): nome e celular, troca do e-mail de acesso com a senha
   (o link vai para o e-mail novo), troca de senha, quem entra pelo Google, acerto do nome e e-mail nos acessos depois do
   login; busca com Ctrl+K por tela, empresa, nota e valor, sem leitura nova. Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('meusdados');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    d.docs['contratos/ct1'] = { tomadorId: 'beta', prestadorId: 'alfa', partes: ['beta', 'alfa'], tomadorNome: 'Beta Indústria', prestadorNome: 'Alfa Serviços', objeto: 'Manutenção predial', modalidade: 'continua', status: 'ativo', inicio: '2026-10-01', vencimentoDias: 15 };
    d.docs['titulos/tt1'] = { tomadorId: 'beta', prestadorId: 'alfa', partes: ['beta', 'alfa'], tomadorNome: 'Beta Indústria', prestadorNome: 'Alfa Serviços', periodo: '2026-10', notaNumero: '4521', valorCentavos: 2140000, liquidoCentavos: 2140000, status: 'aprovado', vencimentoDias: 15, conta: { ok: false } };
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  const log = () => page.evaluate(() => window.__mockLog);

  await H.preparar(page, d); await page.goto(H.BASE);
  await H.entrar(page, 'ana@alfa.com.br', 'senha123'); await page.waitForSelector('#menu', { timeout: 8000 }); await H.dorme(400);

  // M1 depois do login, o acesso ganha o nome e o e-mail da pessoa (o administrador vê em Usuários e acessos) e o histórico registra
  const s1 = await srv(), a1 = s1['acessos/alfa_uANA'], lg1 = Object.values(s1).find(x => /^pessoa\./.test(x.acao || ''));
  ok('M1 login completa nome e e-mail no próprio acesso (só completar não vai para o histórico)', a1.email === 'ana@alfa.com.br' && a1.nome === 'Ana Souza' && !lg1, JSON.stringify({ a1, lg1: lg1 && lg1.texto }));

  // M2 tocar no nome abre "Meus dados" com o e-mail de acesso
  await page.click('#meus-dados'); await page.waitForSelector('#md-email-atual', { timeout: 6000 });
  const m2 = await page.evaluate(() => ({ h: location.hash, nome: document.getElementById('md-nome').value, em: document.getElementById('md-email-atual').innerText, t: document.getElementById('titulo').innerText }));
  ok('M2 tocar no nome abre "Meus dados" com nome e e-mail de acesso', m2.h === '#meusdados' && m2.nome === 'Ana Souza' && m2.em === 'ana@alfa.com.br' && m2.t === 'Meus dados', JSON.stringify(m2));

  // M3 salvar: recusa nome sem sobrenome e celular errado; grava nome e celular e o acesso acompanha
  await page.fill('#md-nome', 'Ana'); await page.click('#md-salvar'); const e3a = await page.$eval('#md-erro', e => e.innerText);
  await page.fill('#md-nome', 'Ana Souza Lima'); await page.fill('#md-tel', '51 1234'); await page.click('#md-salvar'); const e3b = await page.$eval('#md-erro', e => e.innerText);
  await page.fill('#md-tel', '51999998888'); await page.click('#md-salvar'); await H.dorme(400);
  const s3 = await srv();
  ok('M3 salva nome e celular (recusa nome sem sobrenome e celular inválido); o acesso, o topo e o histórico da empresa mostram o nome novo',
    /sobrenome/.test(e3a) && /Celular inválido/.test(e3b) && s3['usuarios/uANA'].nome === 'Ana Souza Lima' && s3['usuarios/uANA'].tel === '(51) 99999-8888'
    && s3['acessos/alfa_uANA'].nome === 'Ana Souza Lima' && (await page.$eval('#quem-nome', e => e.innerText)) === 'Ana Souza Lima'
    && Object.values(s3).some(x => x.acao === 'pessoa.nome' && x.empresaId === 'alfa' && /Ana Souza mudou para Ana Souza Lima/.test(x.texto)), JSON.stringify({ e3a, e3b, u: s3['usuarios/uANA'] }));

  // M4 trocar e-mail: senha errada, e-mail de outra conta, depois manda o link para o e-mail novo (o e-mail atual continua até abrir o link)
  const dlg = s => page.$eval('dialog[open] ' + s, e => e.innerText).catch(() => '');
  await page.click('#md-trocar-email'); await page.waitForSelector('dialog[open] #te-email');
  await page.fill('#te-email', 'ana.nova@alfa.com.br'); await page.fill('#te-senha', 'errada1'); await page.click('dialog[open] [data-dlg-b="1"]'); await H.dorme(300); const e4a = await dlg('#te-erro');
  await page.fill('#te-email', 'bruno@alfa.com.br'); await page.fill('#te-senha', 'senha123'); await page.click('dialog[open] [data-dlg-b="1"]'); await H.dorme(300); const e4b = await dlg('#te-erro');
  await page.fill('#te-email', 'ana.nova@alfa.com.br'); await page.click('dialog[open] [data-dlg-b="1"]');
  await page.waitForSelector('#md-pend', { timeout: 6000 });
  const l4 = (await log()).find(x => x[0] === 'trocaEmail' && x[2] === 'ana.nova@alfa.com.br'), p4 = await page.$eval('#md-pend', e => e.innerText);
  ok('M4 trocar o e-mail: confere a senha, recusa e-mail de outra conta e manda o link para o e-mail novo (com o endereço do app)',
    /senha atual não confere/.test(e4a) && /já é usado por outra conta/.test(e4b) && l4 && l4[3] && /^https:\/\//.test(l4[3].url) && /ana\.nova@alfa\.com\.br/.test(p4) && /continue entrando com ana@alfa\.com\.br/.test(p4),
    JSON.stringify({ e4a, e4b, l4, p4 }));

  // M5 trocar a senha: manda o link para o e-mail atual
  await page.click('#md-trocar-senha'); await page.waitForSelector('dialog[open]'); await page.click('dialog[open] [data-dlg-b="1"]'); await H.dorme(300);
  ok('M5 "Trocar a senha" manda o link para o e-mail de acesso', (await log()).some(x => x[0] === 'reset' && x[1] === 'ana@alfa.com.br'));

  // M6 busca: Ctrl+K abre; "nota 4521" acha o título e a nota; Enter abre o título
  await page.evaluate(() => { location.hash = '#inicio'; }); await H.dorme(300);
  await page.keyboard.press('Control+k'); await page.waitForSelector('#bq-q', { timeout: 4000 });
  const vazia = await page.$$eval('#bq-lista .bq-it', bs => bs.length);
  await page.fill('#bq-q', '4521'); await H.dorme(150);
  const r6 = await page.$$eval('#bq-lista .bq-it strong', bs => bs.map(b => b.innerText));
  await page.keyboard.press('Enter'); await H.dorme(400);
  const h6 = await page.evaluate(() => location.hash);
  ok('M6 Ctrl+K abre a busca (sem digitar mostra as telas); "4521" acha o título da nota e Enter abre', vazia > 0 && r6.some(t => /A receber · Beta Indústria/.test(t)) && h6 === '#titulos/ver/tt1', JSON.stringify({ vazia, r6, h6 }));

  // M7 busca por empresa sem acento e por tela; nada encontrado explica
  await page.click('#busca-abrir'); await page.waitForSelector('#bq-q');
  await page.fill('#bq-q', 'beta industria manutencao'); await H.dorme(150); const r7a = await page.$$eval('#bq-lista .bq-it strong', bs => bs.map(b => b.innerText));
  await page.fill('#bq-q', 'pagar'); await H.dorme(150); const r7b = await page.$$eval('#bq-lista .bq-it strong', bs => bs.map(b => b.innerText));
  await page.fill('#bq-q', 'zzz qualquer'); await H.dorme(150); const r7c = await page.$eval('#bq-vazio', e => e.innerText).catch(() => '');
  await page.keyboard.press('Escape'); await H.dorme(200);
  ok('M7 acha o contrato pela empresa sem acento, acha a tela "Pagar e receber" e explica quando não acha nada',
    r7a.includes('Beta Indústria') && r7b.includes('Pagar e receber') && /Nada encontrado/.test(r7c) && !(await page.$('#busca-dlg')), JSON.stringify({ r7a, r7b, r7c }));

  // M8 Bruno (duas empresas): a busca oferece trocar de empresa
  await page.click('#sair'); await page.waitForSelector('#lg-email', { timeout: 6000 });
  await H.entrar(page, 'bruno@alfa.com.br', 'senha123'); await page.waitForSelector('[data-ctx]', { timeout: 8000 }).catch(() => {});
  const esc = await page.$('[data-ctx]'); if (esc) await esc.click(); await page.waitForSelector('#menu', { timeout: 8000 }); await H.dorme(300);
  await page.keyboard.press('Control+k'); await page.waitForSelector('#bq-q'); await page.fill('#bq-q', 'beta'); await H.dorme(150);
  const r8 = await page.$$eval('#bq-lista .bq-g', gs => gs.map(g => g.innerText));
  await page.keyboard.press('Escape');
  ok('M8 quem tem duas empresas acha a outra na busca, em "Trocar de empresa"', r8.some(g => /Trocar de empresa/i.test(g)), JSON.stringify(r8));

  // M9 quem entra pelo Google não troca o e-mail aqui (é o da conta Google)
  await page.click('#sair'); await page.waitForSelector('#lg-email', { timeout: 6000 });
  await H.ctlSet(page, { social: { 'google.com': { email: 'ana@alfa.com.br', nome: 'Ana Souza' } } });
  await page.click('#lg-google'); await page.waitForSelector('#menu', { timeout: 8000 });
  await page.evaluate(() => { location.hash = '#meusdados'; }); await page.waitForSelector('#md-email-atual', { timeout: 6000 });
  const m9 = await page.evaluate(() => ({ bt: !!document.getElementById('md-trocar-email'), txt: (document.getElementById('md-social') || {}).innerText || '' }));
  ok('M9 quem entra pelo Google vê que o e-mail é o da conta Google (sem o botão de trocar)', !m9.bt && /conta Google/.test(m9.txt), JSON.stringify(m9));

  // M10 celular: a busca abre pela lupa da barra de cima e "Meus dados" pelo nome; nada passa da largura da tela
  await page.setViewportSize({ width: 390, height: 844 }); await H.dorme(300);
  const lupa = await page.evaluate(() => { const b = document.getElementById('busca-cel'); return !!b && b.offsetParent !== null; });
  await page.click('#busca-cel'); await page.waitForSelector('#bq-q'); const larg = await page.evaluate(() => document.getElementById('busca-dlg').getBoundingClientRect().width);
  await page.keyboard.press('Escape'); await H.dorme(200);
  const eu = await page.evaluate(() => { const b = document.getElementById('meus-dados'); return !!b && b.offsetParent !== null; });
  ok('M10 celular: lupa e nome na barra de cima, janela da busca cabe e a página não rola para o lado', lupa && eu && larg <= 390 && !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), JSON.stringify({ lupa, eu, larg }));

  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
