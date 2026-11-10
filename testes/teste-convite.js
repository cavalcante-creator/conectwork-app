/* Teste de tela do primeiro acesso pelo convite (Etapa 1, parte 4): link sem login, criar acesso com o e-mail
   certo e errado, aceitar com login que já existe, convite usado, "Tenho um convite" e link aberto por outra pessoa.
   Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('convite');

const T = { edu: 'tokEDU1234567890abcd', carla: 'tokCARLA1234567890ab', usado: 'tokUSADO1234567890ab' };

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    d.docs['convites/' + T.edu] = { email: 'edu@alfa.com.br', nome: 'Edu Martins', empresaId: 'alfa', empresaNome: 'Alfa Serviços', cargo: 'operacional', criadoPor: 'uANA', criadoPorNome: 'Ana Souza', usado: false };
    d.docs['convites/' + T.carla] = { email: 'carla@outra.com.br', nome: 'Carla Nunes', empresaId: 'beta', empresaNome: 'Beta Indústria', cargo: 'financeiro', criadoPor: 'uX', criadoPorNome: 'Beto Alves', usado: false };
    d.docs['convites/' + T.usado] = { email: 'carla@outra.com.br', nome: 'Carla Nunes', empresaId: 'alfa', empresaNome: 'Alfa Serviços', cargo: 'rh', criadoPor: 'uANA', usado: true };
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  const h2 = () => page.$eval('.loginside h2', e => e.innerText).catch(() => null);
  const abrir = async tk => { await page.goto(H.BASE + 'vazio.html'); await page.goto(H.BASE + '#convite/' + tk); };

  // V1 link sem login: "Você recebeu um convite"
  await H.preparar(page, d); await abrir(T.edu); await page.waitForSelector('#cv-boasvindas', { timeout: 8000 });
  ok('V1 link do convite sem login: "Você recebeu um convite" com "Criar meu acesso" e "Já tenho login"', await h2() === 'Você recebeu um convite' && !!(await page.$('#cv-criar')) && !!(await page.$('#cv-tenho')));

  // V2 criar acesso: validações (termos e autorizações obrigatórias; cursos e ofertas desmarcados)
  await page.click('#cv-criar'); await page.waitForSelector('#cv-form');
  const cons0 = await page.$$eval('[data-ca]', x => x.map(c => c.dataset.ca + ':' + c.checked));
  await page.fill('#cv-nome', 'Edu Martins'); await page.fill('#cv-email', 'outro@alfa.com.br'); await page.fill('#cv-senha', 'Alfa2026x'); await page.fill('#cv-senha2', 'Alfa2026x');
  await page.click('#cv-ok'); const e1 = await page.$eval('#cv-erro', e => e.innerText);
  await page.check('#cv-termos'); await page.click('#cv-ok'); const e2 = await page.$eval('#cv-erro', e => e.innerText);
  ok('V2 criar acesso pede termos e as autorizações obrigatórias; cursos e ofertas vêm desmarcados',
    /Termos de uso/.test(e1) && /autorizações obrigatórias/.test(e2) && cons0.includes('cursos:false') && cons0.includes('ofertas:false') && cons0.includes('whatsapp:true') && !(await page.evaluate(() => window.__mockLog.some(x => x[0] === 'criaConta'))), JSON.stringify({ e1, e2, cons0 }));

  // V3 e-mail diferente do convite: a conta é criada, mas o convite não abre
  for (const k of ['operacional', 'contrato', 'cobranca']) await page.check(`[data-ca="${k}"]`);
  await page.click('#cv-ok'); await page.waitForSelector('#cv-problema', { timeout: 8000 });
  const v3 = { t: await h2(), txt: await page.$eval('#cv-problema .sub', e => e.innerText), acesso: Object.keys(await srv()).some(k => /^acessos\/alfa_/.test(k) && !/uANA|uBRUNO|uDUDA/.test(k)) };
  ok('V3 e-mail diferente do convite: avisa que o convite não está disponível para esse login (e não entra na empresa)', v3.t === 'Este convite não está disponível para você' && /outro@alfa\.com\.br/.test(v3.txt) && !v3.acesso, JSON.stringify(v3));

  // V4 "Sair e entrar com outro e-mail" volta para o convite; criar com o e-mail certo aceita sozinho e entra na empresa
  await page.click('#cv-outro'); await page.waitForSelector('#cv-boasvindas', { timeout: 8000 });
  await page.click('#cv-criar'); await page.waitForSelector('#cv-form');
  await page.fill('#cv-nome', 'Edu  Martins'); await page.fill('#cv-email', 'Edu@Alfa.com.br'); await page.fill('#cv-senha', 'Alfa2026x'); await page.fill('#cv-senha2', 'Alfa2026x');
  await page.check('#cv-termos'); for (const k of ['operacional', 'contrato', 'cobranca']) await page.check(`[data-ca="${k}"]`); await page.uncheck('[data-ca="email"]');
  await page.click('#cv-ok'); await page.waitForSelector('#menu', { timeout: 10000 }); await H.dorme(300);
  const s4 = await srv(), uid = Object.keys(s4).find(k => /^usuarios\//.test(k) && s4[k].email === 'edu@alfa.com.br').split('/')[1];
  const a4 = s4['acessos/alfa_' + uid] || {}, c4 = s4['convites/' + T.edu], l4 = Object.values(s4).filter(x => x.acao === 'convite.aceitar');
  const v4 = { cargo: await page.$eval('#ini-cargo', e => e.innerText).catch(() => ''), emp: await page.$eval('#ini-empresa', e => e.innerText).catch(() => ''), hash: await page.evaluate(() => location.hash),
    cons: ['cursos', 'email', 'operacional'].map(k => [k, (s4['consentimentos/' + uid + '_' + k] || {}).aceite, (s4['consentimentos/' + uid + '_' + k] || {}).canal]) };
  ok('V4 e-mail certo: cria o acesso com o cargo do convite (sem telas a mais), marca o convite como usado, grava perfil, autorizações e histórico, e entra na empresa',
    a4.cargo === 'operacional' && a4.convite === T.edu && a4.ativo === true && JSON.stringify(a4.extras) === '[]' && a4.email === 'edu@alfa.com.br' && c4.usado === true && c4.usadoPor === uid
    && s4['usuarios/' + uid].nome === 'Edu Martins' && JSON.stringify(v4.cons) === '[["cursos",false,"convite"],["email",false,"convite"],["operacional",true,"convite"]]'
    && l4.length === 1 && l4[0].empresaId === 'alfa' && v4.cargo === 'Operacional' && v4.emp === 'Alfa Serviços' && !/convite/.test(v4.hash) && (await page.evaluate(() => window.__mockLog.some(x => x[0] === 'verificacao'))), JSON.stringify(v4));

  // V5 login que já existe (Carla, sem empresa): abre o link já logada, vê o convite e aceita
  await page.click('#sair'); await page.waitForSelector('#lg-email');
  await H.entrar(page, 'carla@outra.com.br', 'senha123'); await page.waitForSelector('#sem-acesso', { timeout: 8000 });
  await page.evaluate(t => { location.hash = '#convite/' + t; }, T.carla); await page.waitForSelector('#cv-card', { timeout: 8000 });
  const v5a = { t: await h2(), sub: await page.$eval('#cv-card .sub', e => e.innerText), nome: await page.$eval('#cv-nome2', e => e.value) };
  await page.click('#cv-aceitar'); const e5 = await page.$eval('#cv-erro2', e => e.innerText);
  await page.check('#cv-termos2'); for (const k of ['operacional', 'contrato', 'cobranca']) await page.check(`[data-cb="${k}"]`);
  await page.click('#cv-aceitar'); await page.waitForSelector('#menu', { timeout: 10000 }); await H.dorme(200);
  const v5 = { emp: await page.$eval('#ini-empresa', e => e.innerText).catch(() => ''), cargo: await page.$eval('#ini-cargo', e => e.innerText).catch(() => ''), acesso: (await srv())['acessos/beta_uCARLA'] };
  ok('V5 já logada: "Convite para Beta Indústria", quem convidou e o cargo; pede os termos; aceita e entra na Beta como Financeiro',
    v5a.t === 'Convite para Beta Indústria' && /Beto Alves convidou você para entrar como Financeiro/.test(v5a.sub) && v5a.nome === 'Carla Nunes' && /Termos de uso/.test(e5)
    && v5.emp === 'Beta Indústria' && v5.cargo === 'Financeiro' && v5.acesso && v5.acesso.cargo === 'financeiro', JSON.stringify({ v5a, e5, v5: { emp: v5.emp, cargo: v5.cargo } }));

  // V6 convite já usado e convite de uma empresa onde já tem acesso
  await page.evaluate(t => { location.hash = '#convite/' + t; }, T.usado); await page.waitForSelector('#cv-problema', { timeout: 8000 });
  const v6a = await h2(); await page.click('#cv-continuar'); await page.waitForSelector('#menu', { timeout: 8000 });
  await page.evaluate(t => { location.hash = '#convite/' + t; }, T.carla); await page.waitForSelector('#cv-problema', { timeout: 8000 });
  const v6b = await h2(); await page.click('#cv-entrar'); await page.waitForSelector('#menu', { timeout: 8000 });
  ok('V6 convite já usado avisa; convite de uma empresa onde já tem acesso leva direto para dentro', v6a === 'Este convite já foi usado' && v6b === 'Você já tem acesso a esta empresa', JSON.stringify([v6a, v6b]));

  // V7 "Tenho um convite" na tela de login: cola o link
  await page.click('#sair'); await page.waitForSelector('#lg-email');
  await page.evaluate(() => CW.entrada.abrirConvite()); await page.waitForSelector('#tc-link');   /* o botão saiu da tela de entrar; continua em "sem acesso" */
  await page.fill('#tc-link', 'https://exemplo.com/qualquer'); await page.click('dialog[open] [data-dlg-b="1"]'); const e7 = await page.$eval('#tc-erro', e => e.innerText);
  await page.fill('#tc-link', 'Oi! Abra o link: https://app.exemplo/#convite/' + T.edu); await page.click('dialog[open] [data-dlg-b="1"]');
  await page.waitForSelector('#cv-boasvindas', { timeout: 8000 });
  ok('V7 "Tenho um convite": recusa o que não é convite e abre o convite colado (mesmo no meio da mensagem)', /não parece um convite/.test(e7) && await h2() === 'Você recebeu um convite', e7);

  // V8 "Já tenho login" com o link aberto: depois de entrar, o convite aparece (aqui, para outra pessoa)
  await page.click('#cv-tenho'); await page.waitForSelector('#lg-email');
  await H.entrar(page, 'ana@alfa.com.br', 'senha123'); await page.waitForSelector('#cv-problema', { timeout: 8000 });
  const v8 = await h2(); await page.click('#cv-continuar'); await page.waitForSelector('#menu', { timeout: 8000 });
  ok('V8 "Já tenho login": depois de entrar abre o convite; sendo de outra pessoa, avisa e deixa continuar no app', v8 === 'Este convite não está disponível para você' && !/convite/.test(await page.evaluate(() => location.hash)), v8);

  // V9 celular: tela do convite cabe sem rolagem para o lado
  await page.setViewportSize({ width: 375, height: 667 }); await page.click('#sair'); await page.waitForSelector('#lg-email');
  await page.evaluate(t => { location.hash = '#convite/' + t; }, T.carla); await page.waitForSelector('#cv-boasvindas', { timeout: 8000 }); await page.click('#cv-criar'); await page.waitForSelector('#cv-form');
  ok('V9 celular: criar acesso pelo convite sem rolagem para o lado', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.querySelector('.login').scrollWidth > innerWidth)));

  ok('Sem erros de JavaScript na página', !erros.length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
