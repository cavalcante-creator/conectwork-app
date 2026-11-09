/* Teste dos links que chegam por e-mail (09/11/2026): o link aponta para o próprio app (?mode=…&oobCode=…) e o
   Conectwork mostra a tela no visual da entrada: criar senha nova, confirmar e-mail, devolver e-mail e link vencido.
   Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('linkemail');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed();
  const log = () => page.evaluate(() => window.__mockLog);
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')));
  const abrir = async (mode, ctl) => { await H.preparar(page, d, ctl); await page.goto(H.BASE + '?mode=' + mode + '&oobCode=COD123&apiKey=x&lang=pt-BR'); };

  // E1 criar senha nova: tela do Conectwork com o e-mail do acesso, sem a tela de login por trás
  await abrir('resetPassword', { acao: { email: 'ana@alfa.com.br' } }); await page.waitForSelector('#ac-senha', { timeout: 8000 });
  const e1 = await page.evaluate(() => ({ h2: document.querySelector('#lg h2').innerText, sub: document.querySelector('#lg .sub').innerText, login: !!document.getElementById('lg-email'), fundo: !!document.querySelector('.login > .lg-fundo') }));
  ok('E1 link de senha abre "Crie uma senha nova" no visual da entrada, com o e-mail do acesso', e1.h2 === 'Crie uma senha nova' && /ana@alfa\.com\.br/.test(e1.sub) && !e1.login && e1.fundo, JSON.stringify(e1));

  // E2 validações: senha fraca e senhas diferentes
  await page.fill('#ac-senha', 'abc'); await page.click('#ac-salvar'); const v1 = await page.$eval('#ac-erro', e => e.innerText);
  await page.fill('#ac-senha', 'novaSenha9'); await page.fill('#ac-senha2', 'outraSenha9'); await page.click('#ac-salvar'); const v2 = await page.$eval('#ac-erro', e => e.innerText);
  ok('E2 recusa senha fraca e senhas diferentes, sem gravar', /8 ou mais/.test(v1) && /diferentes/.test(v2) && !(await log()).some(x => x[0] === 'confirmaReset'), JSON.stringify([v1, v2]));

  // E3 olho mostra as duas senhas
  await page.click('#ac-ver'); const t3 = await page.evaluate(() => [document.getElementById('ac-senha').type, document.getElementById('ac-senha2').type]);
  ok('E3 o olho mostra as duas senhas', t3[0] === 'text' && t3[1] === 'text', JSON.stringify(t3));

  // E4 salva a senha nova e entra direto no app; o endereço fica sem o código
  await page.fill('#ac-senha2', 'novaSenha9'); await page.click('#ac-salvar'); await page.waitForSelector('#ac-entrar', { timeout: 6000 });
  const msg = await page.$eval('#lg h2', e => e.innerText), senha = (await srv()).users['ana@alfa.com.br'].pass;
  await page.click('#ac-entrar'); await page.waitForSelector('.shell', { timeout: 8000 });
  const e4 = await page.evaluate(() => ({ url: location.search, hash: location.hash }));
  ok('E4 "Salvar senha nova" grava, mostra "Senha nova salva" e "Entrar no Conectwork" já entra no app; o código some do endereço',
    msg === 'Senha nova salva' && senha === 'novaSenha9' && e4.url === '' && (await log()).some(x => x[0] === 'signIn' && x[1] === 'ana@alfa.com.br'), JSON.stringify({ msg, senha, e4 }));

  // E5 link vencido: explica e oferece pedir outro (abre "Esqueci minha senha")
  await abrir('resetPassword', { acao: { erro: 'auth/expired-action-code' } }); await page.waitForSelector('#ac-novo', { timeout: 8000 });
  const e5 = await page.evaluate(() => ({ h2: document.querySelector('#lg h2').innerText, sub: document.querySelector('#lg .sub').innerText }));
  await page.click('#ac-novo'); await page.waitForSelector('#lg-esq-email', { timeout: 6000 });
  ok('E5 link vencido: "Link fora da validade" e "Pedir um link novo" abre o "Esqueci minha senha"', e5.h2 === 'Link fora da validade' && /venceu ou já foi usado/.test(e5.sub) && (await page.evaluate(() => location.search)) === '', JSON.stringify(e5));

  // E6 confirmar e-mail
  await abrir('verifyEmail', { acao: { email: 'ana@alfa.com.br' } }); await page.waitForSelector('#ac-entrar', { timeout: 8000 });
  const e6 = await page.$eval('#lg h2', e => e.innerText); await page.click('#ac-entrar'); await page.waitForSelector('#lg-email', { timeout: 6000 });
  ok('E6 link de confirmação: "E-mail confirmado" e "Continuar" leva ao login', e6 === 'E-mail confirmado' && (await log()).some(x => x[0] === 'aplicaCodigo'), e6);

  // E7 devolver o e-mail de acesso
  await abrir('recoverEmail', { acao: { email: 'ana@alfa.com.br' } }); await page.waitForSelector('#ac-senha-nova', { timeout: 8000 });
  const e7 = await page.evaluate(() => ({ h2: document.querySelector('#lg h2').innerText, sub: document.querySelector('#lg .sub').innerText }));
  ok('E7 link de devolver o e-mail: mostra o e-mail que voltou e oferece criar senha nova', e7.h2 === 'E-mail de acesso devolvido' && /ana@alfa\.com\.br/.test(e7.sub), JSON.stringify(e7));

  // E8 sem link: abre o login normal
  await H.preparar(page, d); await page.goto(H.BASE); await page.waitForSelector('#lg-email', { timeout: 8000 });
  ok('E8 sem link de e-mail: abre a tela de entrar de sempre', true);

  // E9 celular: a tela da senha nova cabe sem rolar para o lado
  await page.setViewportSize({ width: 390, height: 844 }); await abrir('resetPassword', { acao: { email: 'ana@alfa.com.br' } }); await page.waitForSelector('#ac-senha', { timeout: 8000 });
  ok('E9 celular: "Crie uma senha nova" cabe na tela', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));

  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
