/* Teste de tela do login com Google e Microsoft: botões no login, no cadastro e no convite; aviso quando ainda
   não foi ligado no console; primeiro acesso cria o perfil com o nome da conta; e-mail que já entra com senha
   liga os dois jeitos de entrar. Firebase simulado; só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('social');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    d.docs['convites/tokEDU1234567890abcd'] = { email: 'edu@alfa.com.br', nome: 'Edu Martins', empresaId: 'alfa', empresaNome: 'Alfa Serviços', cargo: 'operacional', criadoPorNome: 'Ana Souza', usado: false };
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')));
  const log = () => page.evaluate(() => window.__mockLog);
  const erro = () => page.$eval('#lg-erro', e => e.innerText).catch(() => '');

  // S1 botões no login (com as marcas), e o login continua cabendo na tela do celular
  await H.preparar(page, d); await page.goto(H.BASE); await page.waitForSelector('#lg-google');
  const s1 = await page.evaluate(() => ({ g: document.getElementById('lg-google').getAttribute('aria-label'), m: document.getElementById('lg-microsoft').getAttribute('aria-label'), t: document.getElementById('lg-microsoft').innerText, ou: document.querySelector('.lg-ou').innerText, svg: document.querySelectorAll('.lg-social svg').length,
    corta: Array.from(document.querySelectorAll('.lg-social .btn')).some(b => b.scrollWidth > b.clientWidth) }));
  await page.setViewportSize({ width: 375, height: 667 }); await H.dorme(200);
  const cabe = await page.evaluate(() => document.querySelector('.login').scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth);
  await page.setViewportSize({ width: 1280, height: 900 });
  ok('S1 login: botões Google e Microsoft com os símbolos ("Entrar com…" para leitor de tela), texto sem cortar; continua cabendo no celular sem rolar', s1.g === 'Entrar com Google' && s1.m === 'Entrar com Microsoft' && s1.t === 'Microsoft' && /ou entrar com/.test(s1.ou) && s1.svg === 2 && !s1.corta && cabe, JSON.stringify({ s1, cabe }));

  // S2 ainda não ligado no console: aviso claro, sem erro técnico
  await page.click('#lg-google'); await H.dorme(250);
  const s2 = await erro();
  ok('S2 provedor ainda não ligado no console: "ainda não foi ligado… entre com e-mail e senha"', /ainda não foi ligado/.test(s2) && /e-mail e senha/.test(s2), s2);

  // S3 fechar a janela da conta não mostra erro
  await H.ctlSet(page, { social: { 'google.com': { erro: 'auth/popup-closed-by-user' } } });
  await page.click('#lg-google'); await H.dorme(250);
  ok('S3 fechar a janela do Google não mostra erro e os botões voltam a funcionar', await erro() === '' && !(await page.$eval('#lg-google', b => b.disabled)));

  // S4 primeiro acesso pelo Google: perfil nasce com o nome da conta; sem empresa → "Cadastrar minha empresa" / convite
  await H.ctlSet(page, { social: { 'google.com': { email: 'Nova.Pessoa@delta.com.br', nome: 'Nova Pessoa' } } });
  await page.click('#lg-google'); await page.waitForSelector('#sem-acesso', { timeout: 8000 });
  const s4 = await srv(), uid4 = s4.users['nova.pessoa@delta.com.br'].uid, pf4 = s4.docs['usuarios/' + uid4];
  ok('S4 primeiro acesso pelo Google: cria o perfil com nome e e-mail da conta e mostra as opções de quem ainda não tem empresa',
    pf4 && pf4.nome === 'Nova Pessoa' && pf4.email === 'nova.pessoa@delta.com.br' && (await log()).some(x => x[0] === 'persist' && x[1] === 'local'), JSON.stringify(pf4));

  // S5 cadastro: "Continuar com Google" pula o "Crie seu acesso" e já preenche o responsável
  await page.click('#sa-sair'); await page.waitForSelector('#lg-cadastrar');
  await page.click('#lg-cadastrar'); await page.waitForSelector('#cad-google');
  const t5a = await page.$eval('#cad-google', b => b.innerText);
  await page.click('#cad-google'); await page.waitForSelector('#cad-dados-cnpj', { timeout: 8000 });
  await page.click('[data-tipo="contratante"]');
  ok('S5 cadastro: "Continuar com Google" no "Crie seu acesso" leva direto para a Etapa 1', t5a === 'Continuar com Google' && await page.$eval('#cad-titulo', e => e.innerText) === 'Tipo e empresa', t5a);
  const resp = await page.evaluate(() => { const r = JSON.parse(Object.entries(localStorage).find(([k]) => /^cw\.cad\.u/.test(k))[1]); return r.d.resp; });
  ok('S5b o responsável já vem com o nome e o e-mail da conta Google', resp.nome === 'Nova Pessoa' && resp.email === 'nova.pessoa@delta.com.br', JSON.stringify(resp));
  await page.click('#cad-sair'); await page.waitForSelector('dialog[open]'); await page.click('dialog[open] [data-dlg-b="1"]'); await page.waitForSelector('#sa-sair', { timeout: 6000 });
  await page.click('#sa-sair'); await page.waitForSelector('#lg-email');

  // S6 Microsoft com e-mail que já entra com senha: pede a senha uma vez e liga os dois
  await H.ctlSet(page, { social: { 'microsoft.com': { email: 'ana@alfa.com.br', conflito: true } } });
  await page.click('#lg-microsoft'); await page.waitForSelector('#lg-email'); await H.dorme(200);
  const s6 = { msg: await erro(), email: await page.$eval('#lg-email', e => e.value) };
  await page.fill('#lg-senha', 'senha123'); await page.click('#lg-entrar'); await page.waitForSelector('#menu', { timeout: 8000 });
  const vinc = (await log()).find(x => x[0] === 'vincula');
  ok('S6 Microsoft com e-mail que já tem senha: explica, preenche o e-mail, entra com a senha e liga o login da Microsoft',
    /já entra no Conectwork com senha/.test(s6.msg) && /Microsoft/.test(s6.msg) && s6.email === 'ana@alfa.com.br' && vinc && vinc[1] === 'ana@alfa.com.br' && vinc[2] === 'microsoft.com', JSON.stringify({ s6, vinc }));

  // S7 convite: "Entrar com Google" no link do convite leva ao convite já logado
  await page.click('#sair'); await page.waitForSelector('#lg-email');
  await H.ctlSet(page, { social: { 'google.com': { email: 'edu@alfa.com.br', nome: 'Edu Martins' } } });
  await page.evaluate(() => { location.hash = '#convite/tokEDU1234567890abcd'; }); await page.waitForSelector('#cv-google', { timeout: 8000 });
  await page.click('#cv-google'); await page.waitForSelector('#cv-card', { timeout: 8000 });
  ok('S7 convite: "Entrar com Google" leva direto ao convite para aceitar', await page.$eval('.loginside h2', e => e.innerText) === 'Convite para Alfa Serviços' && await page.$eval('#cv-nome2', e => e.value) === 'Edu Martins');

  // S8 celular: no "Crie seu acesso" do cadastro, os botões Google e Microsoft ficam um embaixo do outro e o texto não vaza
  await page.setViewportSize({ width: 390, height: 844 }); await H.preparar(page, d); await page.goto(H.BASE);
  await page.waitForSelector('#lg-cadastrar'); await page.click('#lg-cadastrar'); await page.waitForSelector('#cad-google');
  const s8 = await page.evaluate(() => { const [g, m] = Array.from(document.querySelectorAll('#cad-social .btn')), a = g.getBoundingClientRect(), b = m.getBoundingClientRect();
    return { emPe: b.top >= a.bottom - 1, vaza: [g, m].some(x => x.scrollWidth > x.clientWidth + 1), fonte: parseFloat(getComputedStyle(document.getElementById('cad-acesso-nome')).fontSize), lado: document.documentElement.scrollWidth > innerWidth }; });
  ok('S8 celular: "Continuar com Google/Microsoft" um embaixo do outro, sem vazar; campos com letra 16px (sem zoom)', s8.emPe && !s8.vaza && s8.fonte >= 16 && !s8.lado, JSON.stringify(s8));

  // S9 com loginMicrosoft desligado no config.js (como está no ar): só o Google, na largura toda, no login e no cadastro
  const b2 = await H.abrir({ microsoft: false });
  await H.preparar(b2.page, d); await b2.page.goto(H.BASE); await b2.page.waitForSelector('#lg-google', { timeout: 8000 });
  const s9 = await b2.page.evaluate(() => { const g = document.getElementById('lg-google'), c = g.parentElement; return { ms: !!document.getElementById('lg-microsoft'), larg: Math.round(g.getBoundingClientRect().width), caixa: Math.round(c.getBoundingClientRect().width) }; });
  ok('S9 sem a Microsoft ligada: só o botão Google, ocupando a largura toda', !s9.ms && s9.larg >= s9.caixa - 2, JSON.stringify(s9));
  await b2.browser.close();

  ok('Sem erros de JavaScript na página', !erros.length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
