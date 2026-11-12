/* Contrato que já existe antes do Conectwork (12/11/2026, "os contratos foram feitos antes do Conectwork, então não tem como"):
   a medição vinda do painel do RH, sem contrato no Conectwork, oferece "Registrar o contrato que já existe" com a prestadora e a
   medição preenchidas; o contrato fica "esperando" (triagem e confirmação das duas) e, ativo, mostra "Voltar para a medição".
   Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('contratoexistente');
const b64url = o => Buffer.from(JSON.stringify(o), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    Object.assign(d.docs['empresas/alfa'], { modulos: ['equipe', 'cobrancas'], cnpj: '11.444.777/0001-61', tipo: 'contratante' });
    d.users['zeca@zeta.com.br'] = { uid: 'uZECA', pass: 'senha123' };
    d.docs['empresas/zeta'] = { nome: 'Zeta Manutenção', cnpj: '04.252.011/0001-10', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas'], criadoPor: 'uZECA' };
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  const resumo = { v: 1, periodo: '2026-10-2', cnpj: '04252011000110', nome: 'ZETA', total: 180000, ref: 'painel-rh:2026-10-2:ZETA', itens: [{ n: 'Joao Teste', h: 80, v: 180000 }] };
  const rota = '#medicoes/importar/' + b64url(resumo);
  await H.preparar(page, d); await page.goto(H.BASE + rota);
  await H.entrar(page, 'ana@alfa.com.br', 'senha123'); await page.waitForSelector('#mi-msg', { timeout: 8000 });
  const t1 = await page.$eval('#mi-msg', e => e.innerText);
  ok('C1 sem contrato no Conectwork: explica que pode registrar o que já existe e mostra o botão', /Falta registrar no Conectwork o contrato/.test(t1) && /antes do Conectwork/.test(t1) && !!(await page.$('#mi-regcont')), t1);
  await page.click('#mi-regcont'); await page.waitForSelector('#ct-form', { timeout: 8000 });
  const f = await page.evaluate(() => ({ prest: document.getElementById('ct-prest').value, per: document.getElementById('ct-per').value, ex: document.getElementById('ct-exist').checked, dl: !document.getElementById('ct-exist-dl').hidden }));
  ok('C2 o formulário já vem com a prestadora do CNPJ, por quinzena e "já existe" marcado', f.prest === 'zeta' && f.per === 'quinzena' && f.ex && f.dl, JSON.stringify(f));
  await page.fill('#ct-obj', 'Equipe de limpeza industrial com supervisor da prestadora.');
  await page.fill('#ct-exist-d', '2025-03-10'); await page.dispatchEvent('#ct-exist-d', 'input');
  await page.click('dialog[open] [data-dlg-b="1"]'); await page.waitForSelector('#ct-medespera', { timeout: 8000 });
  const c = Object.entries(await srv()).filter(([k]) => /^contratos\//.test(k)).map(([, v]) => v)[0] || {};
  ok('C3 contrato registrado: objeto com "já existente, assinado em 10/03/2025", início = a data, esperando assinatura', /já existente, assinado em 10\/03\/2025/.test(c.objeto) && c.inicio === '2025-03-10' && c.status === 'assinatura' && c.prestadorId === 'zeta', JSON.stringify(c));
  ok('C4 no contrato aparece que a medição do painel do RH espera por ele', /A medição do painel do RH espera este contrato/.test(await page.$eval('#ct-medespera', e => e.innerText)));
  // C4b contrato antigo: a prestadora (aqui a Ana, admin das duas) só confirma; com "pelas duas" confirma os dois lados
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('__srv')); s.docs['acessos/zeta_uANA'] = { uid: 'uANA', empresaId: 'zeta', cargo: 'admin', extras: [], sem: [], ativo: true };
    const k = Object.keys(s.docs).find(x => /^contratos\//.test(x)); s.docs[k].triagem = { resultado: 'compativel', r: {}, uid: 'uANA', nome: 'Ana', em: '2026-11-12T00:00:00Z', parecer: null }; localStorage.setItem('__srv', JSON.stringify(s)); });
  const cid0 = Object.keys(await srv()).find(x => /^contratos\//.test(x)).split('/')[1];
  await page.reload(); await page.waitForSelector('.shell', { timeout: 8000 }).catch(() => null); if (await page.$('#lg-email')) await H.entrar(page, 'ana@alfa.com.br', 'senha123');
  await page.waitForSelector('.shell', { timeout: 8000 }).catch(() => null); await H.dorme(500);
  await page.evaluate(id => { location.hash = '#contratos/ver/' + id; }, cid0); await page.waitForSelector('#ct-papel', { timeout: 8000 });
  const pap = await page.$eval('#ct-assinar-box', e => e.innerText);
  ok('C4b contrato antigo: "já foi assinado no papel", sem "Li e concordo", com "Confirmar também pela" a outra', /já foi assinado no papel em 10\/03\/2025/.test(pap) && !/Li e concordo/.test(pap) && /Confirmar também pela Zeta/.test(pap), pap.slice(0, 300));
  await page.check('#ct-li'); await page.click('#ct-assinar'); await H.dorme(1800);
  const cc = (await srv())['contratos/' + cid0];
  ok('C4c confirmado pelas duas: ativo, assinaturas com papel:true', cc.status === 'ativo' && cc.assinaturas.tomador.papel === true && cc.assinaturas.prestador.papel === true, JSON.stringify(cc.assinaturas));
  // contrato ativo (triagem e assinaturas feitas): aparece "Voltar para a medição"
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('__srv')); const k = Object.keys(s.docs).find(x => /^contratos\//.test(x)); s.docs[k].status = 'ativo'; localStorage.setItem('__srv', JSON.stringify(s)); });
  const cid = Object.keys(await srv()).find(x => /^contratos\//.test(x)).split('/')[1];
  await page.reload(); await page.waitForSelector('.shell', { timeout: 8000 }).catch(() => null);
  if (await page.$('#lg-email')) await H.entrar(page, 'ana@alfa.com.br', 'senha123');
  await page.evaluate(id => { location.hash = '#contratos/ver/' + id; }, cid); await page.waitForSelector('#ct-medvolta-bt', { timeout: 8000 });
  await page.click('#ct-medvolta-bt'); await page.waitForSelector('#md-its', { timeout: 8000 }).catch(() => null);
  const h = await page.evaluate(() => location.hash);
  ok('C5 com o contrato ativo, "Voltar para a medição" abre a medição do painel do RH', /medicoes\/importar\//.test(h) && !!(await page.$('#md-its')), h);
  // o RH (sem ser admin) vê que quem registra é o administrador
  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
