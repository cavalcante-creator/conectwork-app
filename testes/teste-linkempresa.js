/* Link que já diz a empresa (12/11/2026, "direcionar para o login da Colafix no Conectwork"): ?empresa=<CNPJ> entra direto
   na empresa certa depois do login (quem tem várias não precisa escolher) e o CNPJ sai do endereço; sem acesso, avisa. Dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('linkempresa');
(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    Object.assign(d.docs['empresas/alfa'], { cnpj: '11.444.777/0001-61' });
    Object.assign(d.docs['empresas/beta'], { cnpj: '04.252.011/0001-10', modulos: ['cobrancas', 'contratos'] });
    Object.assign(Object.values(d.docs).find(x => x && x.empresaId === 'beta' && x.cargo === 'contador') || {}, { cargo: 'rh' });
  });
  await H.preparar(page, d);
  // E1 Bruno tem Alfa e Beta: o link com o CNPJ da Beta entra direto na Beta (sem a tela de escolher) e mantém a rota
  await page.goto(H.BASE + '?empresa=04252011000110#inicio');
  await H.entrar(page, 'bruno@alfa.com.br', 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 }); await H.dorme(400);
  const e1 = await page.evaluate(() => ({ emp: (CW.sessao.contexto() || {}).empresaId, escolher: !!document.getElementById('escolher'), url: location.search }));
  ok('E1 link com ?empresa= entra direto na empresa do CNPJ (Beta) e o CNPJ sai do endereço', e1.emp === 'beta' && !e1.escolher && e1.url === '', JSON.stringify(e1));
  // E2 sem acesso à empresa do link: avisa e segue o caminho de sempre
  await page.click('#sair'); await page.waitForSelector('#lg-email');
  await page.goto(H.BASE + '?empresa=11222333000181');
  await H.entrar(page, 'bruno@alfa.com.br', 'senha123'); await page.waitForSelector('#escolher', { timeout: 8000 }); await H.dorme(900);
  const t2 = await page.evaluate(() => (document.getElementById('toast') || {}).textContent || '');
  ok('E2 sem acesso à empresa do link: avisa ("este login não tem acesso") e mostra a escolha de sempre', /não tem acesso/.test(t2) && /11\.222\.333\/0001-81/.test(t2), t2);
  // E3 link da medição sem estar logado: depois do login cai na tela da medição (a rota não se perde no login)
  await page.evaluate(() => CW.sessao.sair()); await page.waitForSelector('#lg-email');
  await page.goto(H.BASE + '?empresa=04252011000110#medicoes/importar/xyz');
  await H.entrar(page, 'bruno@alfa.com.br', 'senha123'); await page.waitForSelector('#mi-msg', { timeout: 8000 }).catch(() => null);
  const e3 = await page.evaluate(() => ({ h: location.hash, msg: (document.getElementById('mi-msg') || {}).textContent || '', emp: (CW.sessao.contexto() || {}).empresaId, mods: (CW.sessao.contexto()||{}).empresa && CW.sessao.contexto().empresa.modulos, t: (document.getElementById('toast') || {}).textContent }));
  ok('E3 link da medição sem login: depois de entrar abre a medição do link', /importar/.test(e3.h) && /não é válido/.test(e3.msg), JSON.stringify(e3));
  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
