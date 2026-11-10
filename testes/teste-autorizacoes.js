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
  ok('M1 profissional MEI vê o menu enxuto: Início, Agenda, Demandas, A receber, Meu negócio, Notas a emitir, Assistente, Contratos, Documentos e Minha empresa',
    m2.map(x => x.split(':')[0]).join() === 'inicio,agenda,ordens,titulos,negocio,espelhos,assistentemei,contratos,documentos,empresa' && m2.includes('ordens:Demandas') && m2.includes('espelhos:Notas a emitir') && m2.includes('titulos:A receber'), JSON.stringify(m2));

  // M1b quem só presta serviço não abre ordem de serviço: recebe as da empresa que contrata
  await page.evaluate(() => { location.hash = '#ordens'; }); await page.waitForSelector('#os-lista', { timeout: 8000 });
  const m1b = await page.evaluate(() => ({ nova: !!document.getElementById('os-nova'), tit: document.getElementById('titulo').innerText, vazio: (document.getElementById('os-vazio-presta') || {}).innerText || '' }));
  ok('M1b MEI que só presta: tela "Demandas", sem "Nova ordem de serviço"; explica que quem abre a demanda é a empresa que contrata', !m1b.nova && m1b.tit === 'Demandas' && /empresa que contrata/.test(m1b.vazio), JSON.stringify(m1b));
  await page.evaluate(() => { location.hash = '#contratos'; }); await H.dorme(600);
  const m1c = await page.evaluate(() => ({ novo: !!document.getElementById('ct-novo'), txt: document.getElementById('view').innerText }));
  ok('M1c MEI que só presta: sem "Novo contrato"; a tela explica que o contrato vem da empresa que contrata', !m1c.novo && /empresa que contrata você/.test(m1c.txt), JSON.stringify({ novo: m1c.novo, txt: m1c.txt.slice(0, 200) }));
  await page.evaluate(() => { location.hash = '#inicio'; }); await page.waitForSelector('#menu-alt');

  // M2 "Ver todas as telas" e "Menu simples"
  await page.click('#menu-alt'); await page.waitForSelector('#menu [data-mod="usuarios"]', { timeout: 8000 });
  const m3 = await menu();
  await page.click('#menu-alt'); await page.waitForFunction(() => !document.querySelector('#menu [data-mod="usuarios"]'), null, { timeout: 8000 });
  ok('M2 "Ver todas as telas" mostra o menu completo (com Usuários e Histórico) e "Menu simples" volta', m3.some(x => x.startsWith('usuarios')) && m3.some(x => x.startsWith('historico')) && m3.length > 8, JSON.stringify(m3.length));

  // M3 celular: a barra de baixo segue o menu enxuto
  await page.setViewportSize({ width: 390, height: 844 }); await H.dorme(400);
  const bn = await page.$$eval('#bnav button', x => x.map(b => b.innerText.trim().split('\n')[0]));
  ok('M3 celular: a barra de baixo usa o menu enxuto (Início, Agenda, Demandas, A receber e Mais)', bn.join() === 'Início,Agenda,Demandas,A receber,Mais', JSON.stringify(bn));

  // M4 celular: com a tela ainda vazia (carregando), a barra de cima fica no alto e do tamanho dela (antes ia para o meio da tela)
  const m4 = await page.evaluate(() => { document.getElementById('view').innerHTML = ''; const r = document.querySelector('.side').getBoundingClientRect(), a = document.querySelector('.appbar').getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height), ap: Math.round(a.top) }; });
  ok('M4 celular: a barra de cima não estica quando a tela está vazia', m4.top <= 1 && m4.h < 90 && m4.ap <= m4.h + 1, JSON.stringify(m4));

  // M5 celular: só o conteúdo rola; a barra de cima (logo, nome, tema, autorizações e sair) fica no alto, a barra de baixo encosta no fim da tela
  const m5 = await page.evaluate(() => { const ap = document.getElementById('app'); document.getElementById('view').insertAdjacentHTML('beforeend', '<div style="height:1500px"></div>'); ap.scrollTop = 200;
    const vis = s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; };
    return { cls: document.documentElement.classList.contains('casca'), app: ap.scrollTop, win: window.scrollY, side: Math.round(document.querySelector('.side').getBoundingClientRect().top), bg: getComputedStyle(document.documentElement).backgroundColor,
      nome: getComputedStyle(document.querySelector('.side .logo')).fontSize !== '0px', tema: vis('#tema-cel'), sair: vis('#sair'), appbar: vis('.appbar'), baixo: Math.round(document.getElementById('bnav').getBoundingClientRect().bottom) === innerHeight }; });
  ok('M5 celular: só o conteúdo rola; barra de cima fixa com logo, nome, tema e sair (sem a barra de "Conectwork › tela"); barra de baixo no fim da tela', m5.cls && m5.app > 0 && m5.win === 0 && m5.side === 0 && m5.bg === 'rgb(8, 22, 56)' && m5.nome && m5.tema && m5.sair && !m5.appbar && m5.baixo, JSON.stringify(m5));
  // M6 iPhone (app instalado, iOS 26): quando a área do app vem mais curta que a tela (--cw-gap), a barra de baixo fica no fim da área do app,
  //    inteira, e não reserva a margem da barrinha do iPhone (que já ficou fora do app); sem diferença, a margem continua
  const m6 = await page.evaluate(async () => { const st = document.documentElement.style, r0 = st.getPropertyValue('--cw-gap'), nav = document.getElementById('bnav'), espera = () => new Promise(r => setTimeout(r, 50));
    st.setProperty('--sa-b', '34px'); await espera(); const semGap = getComputedStyle(nav).paddingBottom;
    st.setProperty('--cw-gap', '60px'); await espera(); const comGap = getComputedStyle(nav).paddingBottom, fim = Math.round(nav.getBoundingClientRect().bottom);
    st.removeProperty('--sa-b'); st.setProperty('--cw-gap', '0px');
    return { r0, semGap, comGap, fim, h: innerHeight, letra: getComputedStyle(document.documentElement).webkitTextSizeAdjust }; });
  ok('M6 app instalado no iPhone: barra de baixo inteira no fim da área do app, sem margem sobrando (e a letra não aumenta sozinha)', m6.r0 === '0px' && m6.semGap === '40px' && m6.comGap === '6px' && m6.fim === m6.h && m6.letra === '100%', JSON.stringify(m6));

  ok('Sem erros de JavaScript na página', !erros.length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
