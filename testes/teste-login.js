/* Teste de tela do login (padrão do painel da Colafix): entrar, erros, "Esqueci minha senha", F5, sair. */
const H = require('./harness');
const { ok, fim } = H.placar('login');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d, uid } = H.seed();
  const erro = () => page.evaluate(() => ({ er: (document.getElementById('lg-erro') || {}).textContent || '', dis: (document.getElementById('lg-entrar') || {}).disabled }));
  const log = () => page.evaluate(() => window.__mockLog);

  // L1 sem sessão: tela de login no visual do protótipo
  await H.preparar(page, d); await page.goto(H.BASE); await page.waitForSelector('#lg-email', { timeout: 8000 });
  const l1 = await page.evaluate(() => ({ marca: !!document.querySelector('.brandpanel h1') && document.querySelector('.brandpanel h1').innerText,
    titulo: (document.querySelector('.loginside h2') || {}).innerText, senha: (document.getElementById('lg-senha') || {}).type, esq: !!document.getElementById('lg-esqueci'),
    shell: !!document.querySelector('.shell'), fonte: getComputedStyle(document.body).fontFamily }));
  ok('L1 sem login abre a tela de entrar (marca, e-mail, senha e "Esqueci minha senha"), sem o app por trás', l1.marca === 'Conectwork' && l1.titulo === 'Entrar' && l1.senha === 'password' && l1.esq && !l1.shell && /Sora/.test(l1.fonte), JSON.stringify(l1));

  // L2 campos vazios
  await page.click('#lg-entrar'); let e = await erro();
  ok('L2 campos vazios: pede para preencher e nem tenta entrar', e.er === 'Preencha o e-mail e a senha.' && !(await log()).some(x => x[0] === 'signIn'), e.er);

  // L3 e-mail inválido
  await H.entrar(page, 'ana@', 'senha123'); e = await erro();
  ok('L3 e-mail inválido: avisa antes de ir ao servidor', /não parece válido/.test(e.er) && !(await log()).some(x => x[0] === 'signIn'), e.er);

  // L4 senha errada
  await H.entrar(page, 'ana@alfa.com.br', 'errada'); await H.dorme(300); e = await erro();
  const senhaLimpa = await page.$eval('#lg-senha', i => i.value === '' && document.activeElement === i);
  ok('L4 senha errada: mensagem clara, botão liberado e senha limpa', /^E-mail ou senha incorretos/.test(e.er) && !e.dis && senhaLimpa, JSON.stringify(e));

  // L5 e-mail que não existe (proteção contra descobrir e-mails ligada no Firebase = mesma mensagem)
  await H.entrar(page, 'naoexiste@alfa.com.br', 'qualquer1'); await H.dorme(300); e = await erro();
  ok('L5 e-mail sem conta: mesma mensagem da senha errada (não revela quem tem conta)', /^E-mail ou senha incorretos/.test(e.er), e.er);
  await H.ctlSet(page, { enumProt: false });
  await H.entrar(page, 'naoexiste@alfa.com.br', 'qualquer1'); await H.dorme(300); e = await erro();
  ok('L5b mesmo com a proteção desligada no Firebase, não revela', /^E-mail ou senha incorretos/.test(e.er), e.er);

  // L6 login desativado, sem internet, muitas tentativas
  await H.ctlSet(page, {});
  await H.entrar(page, 'parado@alfa.com.br', 'senha123'); await H.dorme(300); e = await erro();
  ok('L6 login desativado no Firebase', /desativado/.test(e.er) && !e.dis, e.er);
  await H.ctlSet(page, { offline: true });
  await H.entrar(page, 'ana@alfa.com.br', 'senha123'); await H.dorme(300); e = await erro();
  ok('L7 sem internet: diz o que aconteceu e o que fazer, botão liberado', /Não foi possível conectar.*internet/.test(e.er) && !e.dis, e.er);
  await H.ctlSet(page, { tooMany: true });
  await H.entrar(page, 'ana@alfa.com.br', 'senha123'); await H.dorme(300); e = await erro();
  ok('L8 muitas tentativas: pede para esperar ou redefinir', /Muitas tentativas/.test(e.er) && !e.dis, e.er);
  await H.ctlSet(page, {});

  // L9 Esqueci minha senha
  await page.fill('#lg-email', 'ana@alfa.com.br');
  await page.click('#lg-esqueci'); await page.waitForSelector('#lg-esq-email');
  const pre = await page.$eval('#lg-esq-email', i => i.value);
  await page.fill('#lg-esq-email', 'ana@'); await page.click('#lg-esq-enviar'); await H.dorme(200);
  const e9a = await page.evaluate(() => document.getElementById('lg-erro').textContent);
  ok('L9 "Esqueci minha senha" abre com o e-mail já digitado e recusa e-mail inválido', pre === 'ana@alfa.com.br' && /e-mail válido/.test(e9a) && !(await log()).some(x => x[0] === 'reset'), e9a);
  await page.fill('#lg-esq-email', ' Ana@Alfa.com.br '); await page.click('#lg-esq-enviar'); await H.dorme(300);
  const e9 = await page.evaluate(() => ({ ok: document.getElementById('lg-ok').hidden ? '' : document.getElementById('lg-ok').textContent, er: document.getElementById('lg-erro').textContent, reset: window.__mockLog.filter(x => x[0] === 'reset') }));
  const r = e9.reset[0] || [];
  ok('L10 envia o e-mail de redefinição (sendPasswordResetEmail) em português, com o endereço do app, e confirma', r[1] === 'ana@alfa.com.br' && r[2] && r[2].url === 'https://cavalcante-creator.github.io/conectwork-app/' && r[3] === 'pt-BR' && /enviamos um link/.test(e9.ok) && !e9.er, JSON.stringify(e9));
  await H.ctlSet(page, { enumProt: false });
  await page.fill('#lg-esq-email', 'ninguem@alfa.com.br'); await page.click('#lg-esq-enviar'); await H.dorme(300);
  const e11 = await page.evaluate(() => ({ ok: document.getElementById('lg-ok').hidden ? '' : document.getElementById('lg-ok').textContent, er: document.getElementById('lg-erro').textContent }));
  ok('L11 e-mail sem conta no "Esqueci": mesma resposta neutra (não revela quem tem conta)', /enviamos um link/.test(e11.ok) && !e11.er, JSON.stringify(e11));
  await H.ctlSet(page, { offline: true });
  await page.click('#lg-esq-enviar'); await H.dorme(300);
  const e12 = await page.evaluate(() => document.getElementById('lg-erro').textContent);
  ok('L12 "Esqueci" sem internet: avisa', /internet/.test(e12), e12);
  await H.ctlSet(page, {});
  await page.click('[data-lg-modo="login"]'); await page.waitForSelector('#lg-email');
  ok('L13 "Voltar para o login" volta ao formulário', await page.$eval('#lg-email', i => !!i));

  // L14 login certo (e-mail com maiúsculas e espaços)
  await H.entrar(page, '  ANA@alfa.com.br ', 'senha123');
  await page.waitForSelector('#ini-nome', { timeout: 8000 });
  const l14 = await page.evaluate(() => ({ nome: document.getElementById('ini-nome').innerText, lg: !!document.getElementById('lg-email'), hash: location.hash, sig: window.__mockLog.filter(x => x[0] === 'signIn').pop() }));
  ok('L14 login certo entra no app (e-mail vai em minúsculas e sem espaços)', l14.nome === 'Ana Souza' && !l14.lg && l14.hash === '#inicio' && l14.sig[1] === 'ana@alfa.com.br', JSON.stringify(l14));

  // L15 F5 continua logado
  await page.reload(); await page.waitForSelector('#ini-nome', { timeout: 8000 });
  ok('L15 F5 continua logado', await page.evaluate(() => !document.getElementById('lg-email') && CW.sessao.estado().usuario.uid === 'uANA'));

  // L16 sair
  await page.click('#sair'); await page.waitForSelector('#lg-email', { timeout: 8000 });
  const l16 = await page.evaluate(() => ({ shell: !!document.querySelector('.shell'), uid: CW.sessao.estado().usuario, sess: localStorage.getItem('__sess'), ctx: Object.keys(sessionStorage).filter(k => k.startsWith('cw.contexto')) }));
  ok('L16 sair volta para o login e limpa a sessão', !l16.shell && !l16.uid && !l16.sess && !l16.ctx.length, JSON.stringify(l16));

  // L17 depois de sair, um link interno não mostra nada do app
  await page.goto(H.BASE + '#inicio'); await page.waitForSelector('#lg-email', { timeout: 8000 });
  ok('L17 sem login, link interno (#inicio) cai no login', await page.evaluate(() => !document.querySelector('.shell') && !document.getElementById('ini-nome')));

  const nAuth = await page.evaluate(() => window.__mockLog.filter(x => x[0] === 'onAuthStateChanged').length);
  ok('L18 onAuthStateChanged registrado uma única vez por carregamento', nAuth === 1, 'registros=' + nAuth);

  // L19 config.js sem configurar
  const B2 = await H.abrir({ config: 'window.CONECTWORK_CONFIG={firebase:{apiKey:"COLE_AQUI",projectId:"COLE_AQUI"}};' });
  await H.preparar(B2.page, d); await B2.page.goto(H.BASE); await H.dorme(800);
  const l19 = await B2.page.evaluate(() => ({ t: (document.getElementById('cfg-erro') || {}).innerText || '', init: window.__mockLog.some(x => x[0] === 'init') }));
  ok('L19 config.js com "COLE_AQUI": explica o que fazer e não liga o Firebase', /config\.example\.js/.test(l19.t) && !l19.init, l19.t.slice(0, 80));
  await B2.browser.close();

  const code = fim(erros); await browser.close(); process.exit(code);
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
