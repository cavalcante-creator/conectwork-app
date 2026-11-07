/* Teste de tela do login (padrão do painel de referência): entrar, erros, "Esqueci minha senha", F5, sair. */
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
    titulo: (document.querySelector('#lg h2') || {}).innerText, senha: (document.getElementById('lg-senha') || {}).type, esq: !!document.getElementById('lg-esqueci'),
    shell: !!document.querySelector('.shell'), fonte: getComputedStyle(document.body).fontFamily }));
  ok('L1 sem login abre a tela de entrar (marca, e-mail, senha e "Esqueci minha senha"), sem o app por trás', l1.marca === 'Conectwork' && l1.titulo === 'Acesse sua conta' && l1.senha === 'password' && l1.esq && !l1.shell && /Sora/.test(l1.fonte), JSON.stringify(l1));

  // L1b textos da página de entrada (produto para o cliente final)
  const l1b = await page.evaluate(() => {
    const txt = s => Array.from(document.querySelectorAll(s)).map(x => x.innerText.trim());
    const tudo = document.body.innerText;
    return { slogan: txt('.brandpanel .slogan')[0], tag: txt('.brandpanel .tagline')[0], ben: txt('.beneficios li'), selos: txt('.selos span'),
      sub: txt('#lg .lg-cab .sub')[0], ph: document.getElementById('lg-email').placeholder, div: txt('#lg-novo')[0],
      novos: txt('.lg-novos button'), termos: txt('#lg-termos')[0], pilares: document.querySelectorAll('.pillars,.pillar').length,
      velhos: /Cada pessoa entra com o próprio login|Integração que conecta empresas/i.test(tudo) };
  });
  ok('L1b painel: slogan, frase de destaque, 3 benefícios e 3 selos (sem os ícones antigos)',
    l1b.slogan === 'Conectando empresas, pessoas e oportunidades.' && l1b.tag === 'Toda papelada e burocracia em um só lugar, na palma da sua mão.'
    && JSON.stringify(l1b.ben) === JSON.stringify(['Contratos, entregas e notas organizados', 'Pagamentos com data e comprovante', 'Documentos e conformidade em dia'])
    && JSON.stringify(l1b.selos) === JSON.stringify(['Empresas que contratam', 'Prestadoras', 'Profissionais MEI']) && l1b.pilares === 0, JSON.stringify(l1b));
  ok('L1c cartão: subtítulo, placeholder, divisória, dois botões e aviso de termos; frases antigas removidas',
    l1b.sub === 'Que bom ter você de volta.' && l1b.ph === 'voce@empresa.com.br' && l1b.div === 'Ainda não usa o Conectwork?'
    && JSON.stringify(l1b.novos) === JSON.stringify(['Cadastrar empresa', 'Tenho um convite'])
    && l1b.termos === 'Ao entrar, você concorda com os Termos de uso e a Política de privacidade.' && !l1b.velhos, JSON.stringify(l1b));

  // L1d cartão centralizado na vertical; botões lado a lado
  const l1d = await page.evaluate(() => {
    const c = document.querySelector('.lg-bloco').getBoundingClientRect(), s = document.querySelector('.loginside').getBoundingClientRect();
    const [a, b] = Array.from(document.querySelectorAll('.lg-novos button')).map(x => x.getBoundingClientRect());
    return { cima: Math.round(c.top - s.top), baixo: Math.round(s.bottom - c.bottom), lado: Math.abs(a.top - b.top) < 2 && b.left > a.right };
  });
  ok('L1d cartão (com o aviso dos termos embaixo) centralizado na vertical; cadastro e convite lado a lado', Math.abs(l1d.cima - l1d.baixo) <= 4 && l1d.lado, JSON.stringify(l1d));

  // L1h fundo azul na tela inteira (sem lado claro) e cartão flutuando (escuro por padrão; branco no tema claro, ver L1g)
  const l1h = await page.evaluate(() => {
    const g = s => getComputedStyle(document.querySelector(s)), L = document.querySelector('.login').getBoundingClientRect(), c = document.getElementById('lg');
    return { fundo: g('.login').backgroundColor, ladoDir: g('.loginside').backgroundColor, painel: g('.brandpanel').backgroundColor,
      cheia: Math.round(L.width) === innerWidth && L.height >= innerHeight, curvas: !!document.querySelector('.login > .curves'),
      cartao: getComputedStyle(c).backgroundColor, raio: getComputedStyle(c).borderRadius, larg: Math.round(c.getBoundingClientRect().width), sombra: getComputedStyle(c).boxShadow !== 'none' };
  });
  const transp = v => v === 'rgba(0, 0, 0, 0)' || v === 'transparent';
  ok('L1h fundo azul e curvas na tela inteira, sem divisão; cartão de 440px (escuro por padrão), cantos de 20px e sombra',
    l1h.fundo === 'rgb(8, 22, 56)' && transp(l1h.ladoDir) && transp(l1h.painel) && l1h.cheia && l1h.curvas
    && l1h.cartao === 'rgb(19, 40, 90)' && l1h.raio === '20px' && l1h.larg === 440 && l1h.sombra, JSON.stringify(l1h));

  // L1e "Tenho um convite" avisa que chega na próxima parte; "Cadastrar empresa" abre o cadastro (testado em teste-cadastro.js)
  const toast = () => page.evaluate(() => document.getElementById('toast').classList.contains('show') ? document.getElementById('toast').innerText : '');
  await page.click('#lg-convite'); await page.waitForSelector('dialog[open] #tc-link', { timeout: 5000 }); const t2 = await page.$eval('dialog[open] h2', e => e.innerText); await page.click('dialog[open] [data-dlg-b="0"]');
  await page.click('#lg-cadastrar'); await page.waitForSelector('#cad-titulo', { timeout: 5000 }); const t1 = await page.$eval('#cad-titulo', e => e.innerText);
  await page.click('#cad-login'); await page.waitForSelector('#lg-email', { timeout: 5000 });
  ok('L1e "Cadastrar empresa" abre "Crie seu acesso" (e volta ao login); "Tenho um convite" pede o link recebido', t1 === 'Crie seu acesso' && t2 === 'Tenho um convite' && !(await log()).some(x => x[0] === 'signIn'), t1 + ' · ' + t2);

  // L1f celular: painel vira cabeçalho compacto e o cartão vem logo abaixo
  await page.setViewportSize({ width: 390, height: 800 }); await H.dorme(250);
  const l1f = await page.evaluate(() => {
    const bp = document.querySelector('.brandpanel').getBoundingClientRect(), c = document.getElementById('lg').getBoundingClientRect();
    const vis = s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; };
    return { alt: Math.round(bp.height), abaixo: c.top >= bp.bottom - 1, frase: vis('.brandpanel h1') && vis('.brandpanel .tagline'), escondidos: !vis('.beneficios') && !vis('.selos'),
      margens: [Math.round(c.left), Math.round(innerWidth - c.right)], fundo: getComputedStyle(document.querySelector('.login')).backgroundColor,
      rolagem: document.documentElement.scrollWidth > window.innerWidth };
  });
  ok('L1f celular: cabeçalho azul compacto (logo, nome e a frase do que o Conectwork faz), cartão abaixo dele com margens azuis de 24px dos lados, sem rolagem para o lado',
    l1f.alt < 150 && l1f.abaixo && l1f.frase && l1f.escondidos && l1f.margens[0] === 24 && l1f.margens[1] === 24 && l1f.fundo === 'rgb(8, 22, 56)' && !l1f.rolagem, JSON.stringify(l1f));
  // L1i fundo da página (html e body) também azul: é o que o Safari do iPhone pinta atrás da barra de cima e no "puxar"
  const l1i = await page.evaluate(() => ({ html: getComputedStyle(document.documentElement).backgroundColor, body: getComputedStyle(document.body).backgroundColor, cls: document.documentElement.classList.contains('entrada'),
    preso: getComputedStyle(document.body).position === 'fixed' && getComputedStyle(document.documentElement).overscrollBehaviorY === 'none',
    cheia: getComputedStyle(document.querySelector('.login')).height === getComputedStyle(document.body).height }));
  ok('L1i celular: fundo azul-marinho atrás da barra de cima e página presa na tela (sem o "elástico" do iPhone)', l1i.cls && l1i.preso && l1i.cheia && l1i.html === 'rgb(8, 22, 56)' && l1i.body === 'rgb(8, 22, 56)', JSON.stringify(l1i));
  // L1j a tela de entrada cabe inteira na tela do celular, sem rolar (iPhone grande, Safari com as barras, iPhone SE)
  const l1j = [];
  /* [largura, altura, ilha em cima, barrinha embaixo]: as 4 primeiras = app instalado no iPhone (tela inteira) */
  for (const [w, h, st, sb] of [[430, 932, 59, 34], [393, 852, 59, 34], [390, 844, 47, 34], [375, 812, 47, 34], [430, 932, 0, 0], [390, 844, 0, 0], [390, 664, 0, 0], [375, 667, 0, 0], [375, 553, 0, 0], [360, 640, 0, 0]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(([a, b]) => { const r = document.documentElement.style; r.setProperty('--sa-t', a + 'px'); r.setProperty('--sa-b', b + 'px'); CW.sessao.encaixar(); }, [st, sb]); await H.dorme(150);
    l1j.push(await page.evaluate(() => ({ t: innerWidth + 'x' + innerHeight + (getComputedStyle(document.documentElement).getPropertyValue('--sa-t').trim() !== '0px' ? ' ilha' : ''), pag: document.documentElement.scrollHeight - innerHeight, lg: document.querySelector('.login').scrollHeight - innerHeight,
      fim: Math.round(innerHeight - document.getElementById('lg-termos').getBoundingClientRect().bottom), logo: document.querySelector('.brandpanel h1').getBoundingClientRect().top >= 0 && getComputedStyle(document.querySelector('.brandpanel .tagline')).display !== 'none',
      nivel: getComputedStyle(document.querySelector('.login')).getPropertyValue('--k').trim() })));
  }
    await page.evaluate(() => { document.documentElement.style.removeProperty('--sa-t'); document.documentElement.style.removeProperty('--sa-b'); });
  // L1m tela alta com espaço sobrando: usa a versão com mais respiro (não compacta); cartão centralizado no espaço abaixo do logo
  await page.setViewportSize({ width: 430, height: 1000 }); await page.evaluate(() => CW.sessao.encaixar()); await H.dorme(150);
  const folga = await page.evaluate(() => { const bp = document.querySelector('.brandpanel').getBoundingClientRect(), b = document.querySelector('.lg-bloco').getBoundingClientRect();
    return { k: +getComputedStyle(document.querySelector('.login')).getPropertyValue('--k'), cima: Math.round(b.top - bp.bottom), baixo: Math.round(innerHeight - b.bottom) }; });
  await page.setViewportSize({ width: 1280, height: 900 });
  ok('L1m sobrando espaço: mais respiro (sem compactar) e o bloco no meio do espaço abaixo do logo', folga.k >= 1 && Math.abs(folga.cima - folga.baixo) < 60, JSON.stringify(folga));
  ok('L1j celular: login cabe inteiro sem rolar (logo e a frase em cima, aviso de privacidade embaixo) em 10 telas, inclusive o app instalado no iPhone com a ilha e a barrinha', l1j.every(x => x.pag <= 0 && x.lg <= 0 && x.fim >= 0 && x.logo), JSON.stringify(l1j));
  await page.setViewportSize({ width: 1280, height: 900 });

  // L1k2 hierarquia: título maior que os campos; "Entrar" o botão mais alto; campos com letra 16px (sem zoom no iPhone); termos fora do cartão
  const hi = await page.evaluate(() => { const fs = s => parseFloat(getComputedStyle(document.querySelector(s)).fontSize), h = s => document.querySelector(s).getBoundingClientRect().height;
    return { h2: fs('#lg h2'), campo: fs('#lg-email'), rot: fs('#lg label.f>span'), entrar: h('#lg-entrar'), google: h('#lg-google'), link: document.getElementById('lg-cadastrar').classList.contains('linkbtn'), termosFora: !document.getElementById('lg').contains(document.getElementById('lg-termos')) }; });
  ok('L1k2 hierarquia: título grande, campos com letra 16px, "Entrar" mais alto que Google/Microsoft, cadastro e convite como links, termos fora do cartão',
    hi.h2 >= 24 && hi.campo === 16 && hi.rot < hi.campo && hi.entrar > hi.google && hi.link && hi.termosFora, JSON.stringify(hi));

  // L1g escuro por padrão: cartão azul-escuro um tom acima do fundo (não preto), campos com borda visível; no tema claro, branco
  const cor = () => page.evaluate(() => ({ c: getComputedStyle(document.getElementById('lg')).backgroundColor, b: getComputedStyle(document.getElementById('lg-email')).borderColor }));
  const escuro = await cor(); await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; }); const claro = await cor(); await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  const rgb = v => (v.match(/\d+/g) || []).slice(0, 3).map(Number), soma = v => rgb(v).reduce((a, b) => a + b, 0);
  ok('L1g escuro por padrão: cartão azul-escuro mais claro que o fundo (não preto) e campos com borda visível; tema claro = cartão branco',
    claro.c === 'rgb(255, 255, 255)' && soma(escuro.c) > soma('rgb(8, 22, 56)') + 30 && rgb(escuro.c)[2] > rgb(escuro.c)[0] && soma(escuro.b) > soma(escuro.c) + 40, JSON.stringify({ claro, escuro }));

  // L1k olho da senha: mostra e esconde
  await page.fill('#lg-senha', 'abc123');
  const tipo = () => page.evaluate(() => ({ t: document.getElementById('lg-senha').type, a: document.getElementById('lg-ver').getAttribute('aria-label') }));
  const k0 = await tipo(); await page.click('#lg-ver'); const k1 = await tipo(); await page.click('#lg-ver'); const k2 = await tipo();
  ok('L1k "ver senha": o olho mostra e esconde a senha (com nome para leitor de tela)', k0.t === 'password' && k1.t === 'text' && k1.a === 'Esconder a senha' && k2.t === 'password' && k2.a === 'Mostrar a senha', JSON.stringify([k0, k1, k2]));
  await page.fill('#lg-senha', '');
  // L1l "Manter conectado" vem marcado e o botão Entrar é azul-marinho como o fundo
  const l1l = await page.evaluate(() => ({ m: document.getElementById('lg-manter').checked, txt: document.querySelector('.lg-manter').innerText.trim(), bt: getComputedStyle(document.getElementById('lg-entrar')).backgroundColor }));
  ok('L1l "Manter conectado" marcado por padrão e botão Entrar azul-marinho (#081638)', l1l.m && l1l.txt === 'Manter conectado' && l1l.bt === 'rgb(8, 22, 56)', JSON.stringify(l1l));

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

  // L4b "Manter conectado": marcado = continua logado (local); desmarcado = sai ao fechar (session); escolha guardada
  const pers = async () => (await log()).filter(x => x[0] === 'persist').map(x => x[1]);
  const p1 = await pers();
  await page.uncheck('#lg-manter'); await H.entrar(page, 'ana@alfa.com.br', 'errada'); await H.dorme(300);
  const p2 = await pers(), guard = await page.evaluate(() => localStorage.getItem('cw.manter'));
  await page.check('#lg-manter');
  ok('L4b "Manter conectado": marcado guarda o login no aparelho, desmarcado só até fechar; a escolha fica guardada', p1[p1.length - 1] === 'local' && p2[p2.length - 1] === 'session' && guard === '0', JSON.stringify({ p1, p2, guard }));

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
