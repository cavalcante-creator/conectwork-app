/* Teste de "Minhas autorizações" (ver, dar e retirar as opcionais, com histórico; necessárias não se desligam aqui) e do
   menu enxuto do profissional MEI (com "Ver todas as telas"). Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('autorizacoes');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    delete d.docs['acessos/beta_uBRUNO'];
    Object.assign(d.docs['empresas/alfa'], { modulos: ['equipe', 'cobrancas', 'contratos'], tipo: 'contratante' });
    const cons = (uid, k, aceite) => { d.docs[`consentimentos/${uid}_${k}`] = { uid, finalidade: k, aceite, texto: k, textoVersao: '2026-10', canal: 'cadastro', em: '2026-10-01T12:00:00.000Z' }; d.docs['consentimentos_log/' + uid + k] = d.docs[`consentimentos/${uid}_${k}`]; };
    [['operacional', true], ['contrato', true], ['cobranca', true], ['whatsapp', true], ['email', true], ['cursos', false], ['ofertas', false]].forEach(([k, a]) => cons('uANA', k, a));
    d.users['lia@lia.com.br'] = { uid: 'uLIA', pass: 'senha123' }; d.docs['usuarios/uLIA'] = { nome: 'Lia Lima', email: 'lia@lia.com.br' };
    d.docs['acessos/lia_uLIA'] = { uid: 'uLIA', empresaId: 'lia', nome: 'Lia Lima', email: 'lia@lia.com.br', cargo: 'admin', extras: [], sem: [], ativo: true };
    d.docs['empresas/lia'] = { nome: 'Lia Lima Elétrica', cnpj: '33.000.167/0001-01', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas', 'contratos', 'equipe'], criadoPor: 'uLIA' };
    d.docs['empresas/lia/privado/cadastro'] = { dados: { porte: 'MEI' } };
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  const entrarComo = async email => { if (await page.$('#sair')) await page.click('#sair'); await page.waitForSelector('#lg-email'); await H.entrar(page, email, 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 }); };
  const menu = () => page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod + ':' + b.innerText.trim()));
  await H.preparar(page, d); await page.goto(H.BASE);

  // A1 abre pelo escudo ao lado do nome; necessárias sem botão, opcionais com chave; fora do menu
  await entrarComo('ana@alfa.com.br');
  const m1 = await menu();
  await page.click('#minhas-aut'); await page.waitForSelector('#aut-opc', { timeout: 8000 });
  const nec = await page.$eval('#aut-nec', e => e.innerText), chaves = await page.$$eval('[data-aut]', x => x.map(i => i.dataset.aut + ':' + i.checked));
  ok('A1 "Minhas autorizações" abre pelo escudo, não ocupa o menu; as necessárias não se desligam aqui e as opcionais têm chave',
    !m1.some(x => x.startsWith('autorizacoes')) && /Necessária/.test(nec) && /encerramento da sua conta/.test(nec) && chaves.join() === 'whatsapp:true,email:true,cursos:false,ofertas:false', JSON.stringify(chaves));

  // A2 dar uma opcional e retirar outra: registro novo no histórico, retirada com data
  await page.check('[data-aut="ofertas"]'); await page.waitForSelector('[data-aut="ofertas"]:checked', { timeout: 8000 }); await H.dorme(400);
  await page.uncheck('[data-aut="whatsapp"]'); await H.dorme(800);
  const db = await srv(), logs = Object.values(db).filter(x => x.canal === 'minhas-autorizacoes');
  const wpp = db['consentimentos/uANA_whatsapp'], of = db['consentimentos/uANA_ofertas'];
  const hist = await page.$eval('#aut-hist', e => e.innerText);
  ok('A2 mudar uma opcional vale na hora, registra versão e data (a retirada com revogadoEm) e aparece no histórico',
    of.aceite === true && wpp.aceite === false && !!wpp.revogadoEm && logs.length === 4 && /Não autorizou/.test(hist), JSON.stringify({ n: logs.length }));

  // A3 Início tem o atalho
  await page.evaluate(() => { location.hash = '#inicio'; }); await page.waitForSelector('#ini-aut', { timeout: 8000 });
  ok('A3 o Início tem o atalho "Minhas autorizações"', (await page.$eval('#ini-aut', e => e.getAttribute('href'))) === '#autorizacoes');

  // M1 profissional MEI: menu enxuto com os nomes do dia a dia
  await entrarComo('lia@lia.com.br'); await page.waitForFunction(() => !!document.getElementById('menu-alt'), null, { timeout: 8000 });
  const m2 = await menu();
  ok('M1 profissional MEI vê o menu enxuto: Início, Meu negócio, Ordens de serviço, Notas a emitir, A receber, Contratos, Documentos e Minha empresa',
    m2.map(x => x.split(':')[0]).join() === 'inicio,negocio,ordens,espelhos,titulos,contratos,documentos,empresa' && m2.includes('espelhos:Notas a emitir') && m2.includes('titulos:A receber'), JSON.stringify(m2));

  // M2 "Ver todas as telas" e "Menu simples"
  await page.click('#menu-alt'); await page.waitForSelector('#menu [data-mod="usuarios"]', { timeout: 8000 });
  const m3 = await menu();
  await page.click('#menu-alt'); await page.waitForFunction(() => !document.querySelector('#menu [data-mod="usuarios"]'), null, { timeout: 8000 });
  ok('M2 "Ver todas as telas" mostra o menu completo (com Usuários e Histórico) e "Menu simples" volta', m3.some(x => x.startsWith('usuarios')) && m3.some(x => x.startsWith('historico')) && m3.length > 8, JSON.stringify(m3.length));

  // M3 celular: a barra de baixo segue o menu enxuto
  await page.setViewportSize({ width: 390, height: 844 }); await H.dorme(400);
  const bn = await page.$$eval('#bnav button', x => x.map(b => b.innerText.trim().split('\n')[0]));
  ok('M3 celular: a barra de baixo usa o menu enxuto', bn[0] === 'Início' && bn[1] === 'Negócio' && bn.includes('Mais'), JSON.stringify(bn));

  // M4 celular: com a tela ainda vazia (carregando), a barra de cima fica no alto e do tamanho dela (antes ia para o meio da tela)
  const m4 = await page.evaluate(() => { document.getElementById('view').innerHTML = ''; const r = document.querySelector('.side').getBoundingClientRect(), a = document.querySelector('.appbar').getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height), ap: Math.round(a.top) }; });
  ok('M4 celular: a barra de cima não estica quando a tela está vazia', m4.top <= 1 && m4.h < 90 && m4.ap <= m4.h + 1, JSON.stringify(m4));

  // M5 celular: só o conteúdo rola; a barra de cima sobe junto e o alto da página (área da hora) fica azul-marinho
  const m5 = await page.evaluate(() => { const ap = document.getElementById('app'); document.getElementById('view').insertAdjacentHTML('beforeend', '<div style="height:1500px"></div>'); ap.scrollTop = 200; return { cls: document.documentElement.classList.contains('casca'), app: ap.scrollTop, win: window.scrollY, side: Math.round(document.querySelector('.side').getBoundingClientRect().top), bg: getComputedStyle(document.documentElement).backgroundColor }; });
  ok('M5 celular: só o conteúdo rola, a barra de cima sobe junto e o fundo do alto fica azul-marinho', m5.cls && m5.app > 0 && m5.win === 0 && m5.side < 0 && m5.bg === 'rgb(8, 22, 56)', JSON.stringify(m5));

  ok('Sem erros de JavaScript na página', !erros.length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
