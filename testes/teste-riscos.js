/* Termômetro de risco (14/11/2026): quem contrata vê, por prestadora, os sinais nos contratos, medições e documentos.
   Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('riscos');
(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    const pessoa = (uid, email, nome, emp, cargo) => { d.users[email] = d.users[email] || { uid, pass: 'senha123' }; d.docs['usuarios/' + uid] = { nome, email }; d.docs[`acessos/${emp}_${uid}`] = { uid, empresaId: emp, nome, email, cargo, extras: [], sem: [], ativo: true }; };
    pessoa('uRITA', 'rita@col.com.br', 'Rita Prado', 'col', 'admin');
    pessoa('uSOL', 'sol@col.com.br', 'Sol Lima', 'col', 'solicitante');
    pessoa('uDONO', 'dono@nexo.com.br', 'Davi Nunes', 'nexo', 'admin');
    d.docs['empresas/col'] = { nome: 'Colina Indústria', status: 'aprovado', tipo: 'contratante', modulos: ['cobrancas', 'contratos'], criadoPor: 'uRITA' };
    d.docs['empresas/nexo'] = { nome: 'Nexo Serviços', cnpj: '04.252.011/0001-10', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas', 'contratos'], criadoPor: 'uDONO' };
    d.docs['empresas/beta'] = { nome: 'Beta Limpeza', cnpj: '11.444.777/0001-61', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas', 'contratos'], criadoPor: 'uX' };
    const ct = (id, prest, nome, extra) => Object.assign({ modalidade: 'continua', tomadorId: 'col', prestadorId: prest, partes: ['col', prest], tomadorNome: 'Colina Indústria', prestadorNome: nome, objeto: 'Serviço.', periodicidade: 'quinzena', vencimentoDias: 3, inicio: '2025-01-01', status: 'ativo', assinaturas: {}, interlocutor: { nome: 'Supervisor' } }, extra);
    d.docs['contratos/cn'] = ct('cn', 'nexo', 'Nexo Serviços', { triagem: null, interlocutor: null });
    d.docs['contratos/cb'] = ct('cb', 'beta', 'Beta Limpeza', { triagem: { resultado: 'compativel', r: {} } });
    /* Nexo: Carlos em 26 quinzenas seguidas (13 meses), sempre 88 h; Bia só nas 3 últimas, horas variando */
    const per = []; let y = 2025, m = 10, q = 1; for (let i = 0; i < 26; i++) { per.push(`${y}-${String(m).padStart(2, '0')}-${q}`); if (q === 2) { q = 1; m++; if (m > 12) { m = 1; y++; } } else q = 2; }
    per.forEach((p, i) => { const mem = [{ nome: 'Carlos Ramos', horas: 88, valorCentavos: 300000, cnpj: '33000167000101' }]; if (i >= 23) mem.push({ nome: 'Bia Costa', horas: 60 + i, valorCentavos: 200000, cnpj: '11222333000181' });
      d.docs['medicoes/cn_' + p] = { contratoId: 'cn', tomadorId: 'col', prestadorId: 'nexo', partes: ['col', 'nexo'], tomadorNome: 'Colina Indústria', prestadorNome: 'Nexo Serviços', periodicidade: 'quinzena', periodo: p, valorCentavos: 300000, memoria: mem, status: 'aprovada', origem: 'integracao', criadoPor: 'uRITA' }; });
    ['cnd_federal', 'crf_fgts', 'cndt', 'cnd_municipal', 'pgr', 'pcmso'].forEach((t, i) => { d.docs['documentos/b' + i] = { empresaId: 'beta', tipo: t, nome: t, status: 'vigente', compartilhar: true, validade: '2030-12-31', criadoEm: '2026-11-01T00:00:00Z', arquivo: { nome: 'x.pdf', tam: 1 } }; });
    d.docs['medicoes/cb_2026-10-1'] = { contratoId: 'cb', tomadorId: 'col', prestadorId: 'beta', partes: ['col', 'beta'], tomadorNome: 'Colina Indústria', prestadorNome: 'Beta Limpeza', periodicidade: 'quinzena', periodo: '2026-10-1', valorCentavos: 100000, memoria: [{ nome: 'Ana Dias', horas: 40, valorCentavos: 100000 }], status: 'aprovada', criadoPor: 'uRITA' };
  });
  const entrarComo = async email => { if (await page.$('#sair')) await page.click('#sair'); await page.waitForSelector('#lg-email'); await H.entrar(page, email, 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 }).catch(() => null); await H.dorme(800); };
  await H.preparar(page, d); await page.goto(H.BASE);

  await entrarComo('rita@col.com.br');
  const menu = await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod));
  await page.evaluate(() => { location.hash = '#riscos'; }); await page.waitForSelector('#rk-nums', { timeout: 10000 }); await H.dorme(400);
  const nx = await page.$eval('#rk-nexo', e => e.innerText), bt = await page.$eval('#rk-beta', e => e.innerText), nums = await page.$eval('#rk-nums', e => e.innerText.replace(/\s+/g, ' '));
  ok('R1 "Termômetro de risco" no menu de quem contrata (admin)', menu.includes('riscos'), menu.join(','));
  ok('R2 Nexo em risco alto: sem triagem, sem interlocutor, horas do ponto de vocês', /Risco alto/.test(nx) && /Contrato sem triagem/.test(nx) && /Sem interlocutor/.test(nx) && /controle de ponto de vocês/.test(nx), nx.slice(0, 400));
  ok('R3 Carlos: 13 meses seguidos (alto) e horas quase iguais; Bia não aparece (poucos períodos)', /Carlos Ramos/.test(nx) && /13 meses seguidos/.test(nx) && /Horas quase iguais/.test(nx) && !/Bia Costa/.test(nx) && /há 12 meses ou mais/.test(nx), nx.slice(0, 900));
  ok('R4 Beta com triagem compatível e interlocutor: sem alerta; números no topo; o aviso padrão no fim', /Sem alerta/.test(bt) && /Prestadoras 2/.test(nums) && /Risco alto 1/.test(nums) && /A validade da relação depende da operação real/.test(await page.$eval('#rk-aviso', e => e.innerText)), JSON.stringify({ bt: bt.slice(0, 200), nums }));
  ok('R5 a ordem: quem tem risco alto vem primeiro', await page.evaluate(() => { const c = [...document.querySelectorAll('.rk-p')].map(e => e.id); return c[0] === 'rk-nexo'; }));
  await entrarComo('sol@col.com.br');
  const m2 = await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod));
  await entrarComo('dono@nexo.com.br');
  const m3 = await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod));
  ok('R6 não aparece para o solicitante nem para quem só presta', !m2.includes('riscos') && !m3.includes('riscos'), JSON.stringify({ m2, m3 }));
  await browser.close(); fim(erros);
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
