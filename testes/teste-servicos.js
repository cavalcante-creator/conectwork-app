/* Teste do catálogo de serviços (12/11/2026): serviços gerais por categoria, busca, serviços específicos da empresa,
   a prestadora marca o que oferece, "Quem faz" e "Pedir" abrindo a ordem de serviço com o nome do serviço. Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('servicos');
const futuro = d => { const x = new Date(); x.setDate(x.getDate() + d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    delete d.docs['acessos/beta_uBRUNO'];
    Object.assign(d.docs['empresas/alfa'], { modulos: ['equipe', 'cobrancas', 'contratos'], tipo: 'contratante' });
    const pessoa = (uid, email, nome, emp, cargo) => { d.users[email] = { uid, pass: 'senha123' }; d.docs['usuarios/' + uid] = { nome, email }; d.docs[`acessos/${emp}_${uid}`] = { uid, empresaId: emp, nome, email, cargo, extras: [], sem: [], ativo: true }; };
    pessoa('uLIA', 'lia@lia.com.br', 'Lia Lima', 'lia', 'admin');
    d.docs['empresas/lia'] = { nome: 'Lia Lima Elétrica', razao: 'Lia Lima 12345678000', cidade: 'Gravataí', uf: 'RS', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas'], criadoPor: 'uLIA' };
    d.docs['contratos/c1'] = { tomadorId: 'alfa', prestadorId: 'lia', partes: ['alfa', 'lia'], tomadorNome: 'Alfa Serviços', prestadorNome: 'Lia Lima Elétrica', modalidade: 'os', status: 'ativo', objeto: 'Manutenção elétrica sob demanda.' };
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  const col = async c => Object.entries(await srv()).filter(([k]) => new RegExp('^' + c + '/[^/]+$').test(k)).map(([k, v]) => Object.assign({ _id: k.split('/')[1] }, v));
  const logs = async a => Object.values(await srv()).filter(x => x.acao === a);
  const entrarComo = async email => { if (await page.$('#sair')) await page.click('#sair'); await page.waitForSelector('#lg-email'); await H.entrar(page, email, 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 }); await H.dorme(300); };
  const abrir = async () => { await page.evaluate(() => { location.hash = '#servicos'; }); await page.waitForSelector('#sv-gerais', { timeout: 8000 }); };
  const dlgOk = () => page.click('dialog[open] [data-dlg-b="1"]');
  await H.preparar(page, d); await page.goto(H.BASE);

  // S1 quem contrata vê o catálogo no menu (Contratação), os serviços gerais por categoria, com "Pedir" e sem "Oferecemos"
  await entrarComo('ana@alfa.com.br');
  const menu = await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod));
  await abrir();
  const s1 = await page.evaluate(() => ({ n: document.querySelectorAll('#sv-gerais .sv-it').length, pedir: document.querySelectorAll('#sv-gerais [data-pedir]').length, of: document.querySelectorAll('[data-of]').length, cats: document.querySelectorAll('#sv-gerais .sv-cat').length }));
  ok('S1 quem contrata: "Catálogo de serviços" no menu, serviços gerais por categoria com "Pedir" e "Quem faz", sem "Oferecemos"', menu.includes('servicos') && s1.n >= 40 && s1.pedir === s1.n && s1.of === 0 && s1.cats >= 9, JSON.stringify(s1));

  // S2 procurar e filtrar por categoria
  await page.fill('#sv-q', 'eletrica'); await H.dorme(200);
  const s2a = await page.$$eval('#sv-gerais .sv-it strong', x => x.map(e => e.innerText));
  await page.fill('#sv-q', ''); await H.dorme(150); await page.click('[data-cat="Tecnologia"]'); await H.dorme(150);
  const s2b = await page.$$eval('#sv-gerais .sv-it strong', x => x.map(e => e.innerText));
  await page.click('[data-cat=""]'); await H.dorme(150);
  ok('S2 a busca acha sem acento ("eletrica" → Manutenção elétrica) e a categoria filtra', s2a.includes('Manutenção elétrica') && s2a.every(t => /elétric/i.test(t)) && s2b.length === 4 && s2b.includes('Suporte de informática'), JSON.stringify({ s2a, s2b }));

  // S3 serviço específico da empresa (nome repetido não entra)
  await page.click('#sv-novo'); await page.waitForSelector('#se-nome');
  await page.fill('#se-nome', 'Calibração da balança da linha 2'); await page.selectOption('#se-cat', 'Manutenção industrial'); await page.fill('#se-desc', 'Com certificado.'); await dlgOk(); await page.waitForSelector('#sv-esp .sv-it', { timeout: 8000 });
  await page.click('#sv-novo'); await page.waitForSelector('#se-nome'); await page.fill('#se-nome', 'calibracao da balanca da linha 2'); await page.selectOption('#se-cat', 'Outra'); await dlgOk(); await H.dorme(150);
  const er3 = await page.$eval('#se-erro', e => e.innerText); await page.click('dialog[open] [data-dlg-b="0"]');
  const esp = await col('servicosesp');
  ok('S3 a empresa cadastra um serviço específico (fica no catálogo dela, vai para o histórico); nome repetido não entra',
    esp.length === 1 && esp[0].empresaId === 'alfa' && esp[0].cat === 'Manutenção industrial' && (await logs('servicos.criar')).length === 1 && /Já existe/.test(er3), JSON.stringify({ n: esp.length, er3 }));

  // S4 a prestadora marca o que oferece e escreve um serviço que não está na lista
  await entrarComo('lia@lia.com.br'); await abrir();
  const s4a = await page.evaluate(() => ({ pedir: document.querySelectorAll('[data-pedir]').length, of: document.querySelectorAll('[data-of]').length }));
  await page.check('[data-of="manutencao-eletrica"]'); await H.dorme(400);
  await page.fill('#sv-ofesp-in', 'Pintura epóxi de piso industrial'); await page.click('#sv-ofesp-add'); await H.dorme(400);
  const o4 = (await srv())['ofertaserv/lia'] || {};
  ok('S4 a prestadora vê "Oferecemos" (sem "Pedir"), marca Manutenção elétrica e acrescenta um serviço próprio',
    s4a.pedir === 0 && s4a.of >= 40 && o4.gerais && o4.gerais.includes('manutencao-eletrica') && o4.especificos[0] === 'Pintura epóxi de piso industrial' && (await logs('servicos.oferta')).length === 2, JSON.stringify({ s4a, o4 }));

  // S5 quem contrata vê "Quem faz"
  await entrarComo('ana@alfa.com.br'); await abrir();
  await page.click('[data-quem="manutencao-eletrica"]'); await page.waitForSelector('#sv-quem, #sv-quem-vazio', { timeout: 8000 });
  const q5 = await page.$eval('dialog[open]', e => e.innerText); await page.click('dialog[open] [data-dlg-x]');
  await page.click('[data-quem="pintura"]'); await page.waitForSelector('#sv-quem, #sv-quem-vazio', { timeout: 8000 });
  const q5b = await page.$eval('dialog[open]', e => e.innerText); await page.click('dialog[open] [data-dlg-x]');
  ok('S5 "Quem faz" mostra a prestadora aprovada que oferece (com a cidade) e avisa quando ninguém oferece', /Lia Lima Elétrica/.test(q5) && /Gravataí/.test(q5) && /Nenhuma empresa/.test(q5b), JSON.stringify({ q5, q5b }));

  // S6 "Pedir" abre a ordem de serviço já com o nome do serviço
  await page.click('[data-pedir="Manutenção elétrica"]'); await page.waitForSelector('#os-tit', { timeout: 8000 });
  const t6 = await page.$eval('#os-tit', e => e.value);
  await page.fill('#os-esc', 'Trocar os disjuntores do quadro da linha 2 e entregar o relatório com fotos.'); await page.fill('#os-prazo', futuro(5)); await page.fill('#os-valor', '80000');
  await dlgOk(); await H.dorme(600);
  const os6 = await col('ordens');
  ok('S6 "Pedir" abre a nova ordem de serviço com o nome do serviço e envia ao prestador', t6 === 'Manutenção elétrica' && os6.length === 1 && os6[0].titulo === 'Manutenção elétrica' && os6[0].prestadorId === 'lia', JSON.stringify({ t6, n: os6.length }));

  // S7 celular sem rolagem para o lado
  await page.setViewportSize({ width: 390, height: 844 }); await abrir(); await H.dorme(200);
  ok('S7 celular: o catálogo cabe sem rolar para o lado', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));

  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
