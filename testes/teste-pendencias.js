/* Teste do "Precisa de você": o Início junta o que cada pessoa tem para fazer (contrato, medição, espelho, nota, pagamento,
   avaliação), os itens do menu mostram quantos, o ícone do app instalado ganha o número e o botão "Avisar no WhatsApp"
   abre a mensagem pronta (com o celular do interlocutor quando é para a prestadora). Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('pendencias');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    delete d.docs['acessos/beta_uBRUNO'];
    Object.assign(d.docs['empresas/alfa'], { modulos: ['equipe', 'cobrancas'], cnpj: '11.444.777/0001-61', tipo: 'contratante' });
    d.users['zeca@zeta.com.br'] = { uid: 'uZECA', pass: 'senha123' }; d.docs['usuarios/uZECA'] = { nome: 'Zeca Moura', email: 'zeca@zeta.com.br' };
    d.docs['acessos/zeta_uZECA'] = { uid: 'uZECA', empresaId: 'zeta', nome: 'Zeca Moura', email: 'zeca@zeta.com.br', cargo: 'admin', extras: [], sem: [], ativo: true };
    d.docs['empresas/zeta'] = { nome: 'Zeta Manutenção', cnpj: '04.252.011/0001-10', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas'], criadoPor: 'uZECA' };
    const base = { tomadorId: 'alfa', prestadorId: 'zeta', partes: ['alfa', 'zeta'], tomadorNome: 'Alfa Serviços', prestadorNome: 'Zeta Manutenção' };
    d.docs['contratos/cz'] = Object.assign({ modalidade: 'continua', tomadorCnpj: '11.444.777/0001-61', prestadorCnpj: '04.252.011/0001-10', objeto: 'Equipe de manutenção.', periodicidade: 'quinzena', vencimentoDias: 1, inicio: '2026-01-01', fim: '',
      status: 'ativo', assinaturas: { tomador: { uid: 'uANA' }, prestador: { uid: 'uZECA' } }, interlocutor: { nome: 'Zeca Moura', email: 'zeca@zeta.com.br', cel: '(51) 99876-5432' }, proposta: null }, base);
    d.docs['contratos/cn'] = Object.assign({}, d.docs['contratos/cz'], { status: 'assinatura', assinaturas: { prestador: { uid: 'uZECA' } }, interlocutor: null, objeto: 'Equipe de limpeza.' });
    const med = (per, st, x) => Object.assign({ contratoId: 'cz', periodicidade: 'quinzena', periodo: per, valorCentavos: 500000, memoria: [{ nome: 'Pedro Lima', horas: 80, valorCentavos: 500000 }], obs: '', origem: 'manual', ref: '', status: st,
      divergencia: null, confirmacao: null, aprovacao: null, criadoPor: 'uRITA', criadoPorNome: 'Rita Prado' }, base, x || {});
    d.docs['medicoes/cz_2026-10-1'] = med('2026-10-1', 'enviada');
    d.docs['medicoes/cz_2026-09-2'] = med('2026-09-2', 'confirmada_prestadora');
    const esp = (per, st, x) => Object.assign({ medicaoId: 'cz_' + per, contratoId: 'cz', prestadorCnpj: '04.252.011/0001-10', tomador: { razao: 'Alfa', cnpj: '11.444.777/0001-61' }, periodo: per, competencia: per.slice(0, 7), descricao: 'Serviços de manutenção.',
      valorCentavos: 500000, retencoes: { iss: 0, inss: 0, ir: 0, pcc: 0 }, liquidoCentavos: 500000, vencimentoDias: 1, obs: '', status: st, versao: 1 }, base, x || {});
    d.docs['espelhos/cz_2026-09-1'] = esp('2026-09-1', 'aguardando_nota');
    d.docs['espelhos/cz_2026-08-2'] = esp('2026-08-2', 'nota_enviada', { nota: { tipo: 'pdf', numero: '5', nomeArquivo: 'n.pdf', tam: 10, conferencia: { ok: true, itens: [] } } });
    const tit = (id, per, st, x) => Object.assign({ espelhoId: id, contratoId: 'cz', periodo: per, notaNumero: '4', valorCentavos: 500000, liquidoCentavos: 500000, vencimentoDias: 1, base: '2026-08-10T12:00:00.000Z', status: st,
      aprovacao: { uid: 'uBRUNO', nome: 'Bruno Lima' }, liberacao: null, agendamento: null, liquidacao: null, baixa: null, conta: { ok: false, revisao: false, versao: 0 } }, base, x || {});
    d.docs['titulos/cz_2026-08-1'] = tit('cz_2026-08-1', '2026-08-1', 'aprovado');
    d.docs['titulos/cz_2026-07-2'] = tit('cz_2026-07-2', '2026-07-2', 'liquidado', { liberacao: { uid: 'uANA' }, liquidacao: { uid: 'uTITO', data: '2026-08-11', comprovante: { envio: 'a', partes: 1 } } });
  });
  const entrarComo = async email => { if (await page.$('#sair')) await page.click('#sair'); await page.waitForSelector('#lg-email'); await H.entrar(page, email, 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 }); };
  await H.preparar(page, d);
  await page.addInitScript(() => { window.__badge = null; navigator.setAppBadge = n => { window.__badge = n; return Promise.resolve(); }; navigator.clearAppBadge = () => { window.__badge = 0; return Promise.resolve(); }; window.__abriu = []; window.open = u => { window.__abriu.push(u); return null; }; });
  await page.goto(H.BASE);

  // P1 admin do tomador: tudo junto no Início
  await entrarComo('ana@alfa.com.br');
  await page.waitForSelector('#ini-pv .pv-it', { timeout: 8000 }); await H.dorme(800);
  const pv = await page.$$eval('#ini-pv .pv-it', x => x.map(e => e.querySelector('strong').innerText));
  const esperado = ['Fazer a triagem do contrato', 'Avaliar o serviço do período', 'Aprovar a medição', 'Conferir a nota fiscal', 'Liberar para pagamento'];
  ok('P1 o Início do admin junta: triagem do contrato, avaliar o serviço, aprovar medição, conferir nota e liberar pagamento',
    esperado.every(t => pv.includes(t)) && !pv.includes('Conferir a medição'), JSON.stringify(pv));

  // P2 contadores no menu, no título da aba e no ícone do app
  const badges = await page.$$eval('#menu [data-mod]', x => Object.fromEntries(x.map(b => [b.dataset.mod, (b.querySelector('.badge') || {}).textContent || ''])));
  const titulo = await page.title(), badge = await page.evaluate(() => window.__badge);
  ok('P2 cada item do menu mostra quantas pendências tem; o título da aba e o ícone do app mostram o total',
    badges.contratos === '3' && badges.medicoes === '1' && badges.espelhos === '1' && badges.titulos === '1' && !badges.inicio && badge === pv.length && titulo.startsWith(`(${pv.length})`), JSON.stringify({ badges, titulo, badge }));

  // P3 tocar no item abre a tela certa
  await page.click('#ini-pv .pv-it:has-text("Aprovar a medição")'); await page.waitForSelector('#md-aprovar', { timeout: 8000 });
  ok('P3 tocar no item abre a tela para fazer', (await page.evaluate(() => location.hash)) === '#medicoes/ver/cz_2026-09-2');

  // P4 resolver tira do "Precisa de você"
  await page.click('#md-aprovar'); await page.waitForSelector('dialog[open]'); await page.click('dialog[open] [data-dlg-b="1"]'); await H.dorme(800);
  await page.evaluate(() => { location.hash = '#inicio'; }); await page.waitForSelector('#ini-pv', { timeout: 8000 }); await H.dorme(500);
  const pv4 = await page.$$eval('#ini-pv .pv-it', x => x.map(e => e.querySelector('strong').innerText));
  const b4 = await page.$eval('#menu [data-mod="medicoes"]', b => !!b.querySelector('.badge'));
  ok('P4 depois de aprovar, a medição sai do "Precisa de você" e o contador some; o espelho para preparar entra', !pv4.includes('Aprovar a medição') && !pv4.includes('Assinar o contrato') && !b4 && pv4.includes('Preparar o espelho da nota'), JSON.stringify(pv4));

  // P5 WhatsApp para a prestadora: com o celular do interlocutor e o link da tela
  await page.evaluate(() => { location.hash = '#espelhos/ver/cz_2026-09-1'; }); await page.waitForSelector('#es-zap [data-zap]', { timeout: 8000 });
  await page.click('#es-zap [data-zap]'); await H.dorme(500);
  const url = decodeURIComponent(await page.evaluate(() => window.__abriu[window.__abriu.length - 1] || ''));
  ok('P5 "Avisar no WhatsApp" abre a conversa com o interlocutor da prestadora, com a mensagem e o link da tela',
    url.startsWith('https://wa.me/5551998765432?text=') && /Alfa Serviços/.test(url) && /espelho da nota/.test(url) && /#espelhos\/ver\/cz_2026-09-1/.test(url), url.slice(0, 200));

  // P6 prestadora: as dela, e tem o botão para avisar quem contrata
  await entrarComo('zeca@zeta.com.br');
  await page.waitForSelector('#ini-pv .pv-it', { timeout: 8000 }); await H.dorme(800);
  const pv6 = await page.$$eval('#ini-pv .pv-it', x => x.map(e => e.querySelector('strong').innerText));
  await page.evaluate(() => { location.hash = '#espelhos/ver/cz_2026-08-2'; }); await page.waitForSelector('#es-nf', { timeout: 8000 });
  const comZap = /Avisar no WhatsApp/.test(await page.$eval('#es-zap', e => e.innerText).catch(() => ''));
  await page.evaluate(() => { location.hash = '#medicoes/ver/cz_2026-10-1'; }); await page.waitForSelector('#md-confirmar', { timeout: 8000 });
  ok('P6 prestadora vê: conferir a medição, emitir a nota, informar a conta e confirmar o recebimento',
    ['Conferir a medição', 'Emitir e enviar a nota fiscal', 'Informe a conta para receber', 'Confirme que o dinheiro chegou'].every(t => pv6.includes(t)) && !pv6.includes('Assinar o contrato') && !pv6.includes('Fazer a triagem do contrato') && comZap, JSON.stringify(pv6));

  // P7 celular: contador na barra de baixo
  await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => { location.hash = '#inicio'; }); await page.waitForSelector('#ini-pv'); await H.dorme(500);
  const bn = await page.$$eval('#bnav button', x => x.map(b => (b.querySelector('.badge') || {}).textContent || ''));
  const lado = await page.evaluate(() => { const w = innerWidth; return Array.from(document.querySelectorAll('body *')).filter(e => e.getBoundingClientRect().right > w + 1).slice(0, 4).map(e => e.tagName + '.' + e.className + '#' + e.id); });
  ok('P7 celular: a barra de baixo mostra os contadores e o Início não rola para o lado', bn.some(Boolean) && !lado.length, JSON.stringify({ bn, lado }));

  ok('Sem erros de JavaScript na página', !erros.length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
