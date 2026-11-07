/* Teste de tela do Histórico de alterações e de Minha empresa (Etapa 1, partes 5 e 6). Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('historico');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const dia = (d, h) => `2026-11-0${d}T${String(h).padStart(2, '0')}:00:00.000Z`;
  const { d } = H.seed(d => {
    const L = (id, em, uid, quem, emp, acao, texto) => { d.docs['log/' + id] = { em, uid, quem, empresaId: emp, acao, texto, ref: '' }; };
    L('a1', dia(3, 12), 'uANA', 'Ana Souza', 'alfa', 'convite.criar', 'Convite criado para Edu Martins (edu@alfa.com.br) como Operacional.');
    L('a2', dia(5, 13), 'uANA', 'Ana Souza', 'alfa', 'acesso.cargo', 'Cargo de Bruno Lima (bruno@alfa.com.br) mudou de Financeiro para Tesouraria.');
    L('a3', dia(4, 9), 'uIASMYN', 'Iasmyn', 'alfa', 'empresa.aprovar', 'Cadastro de Alfa Serviços aprovado no plano Essencial.');
    L('a4', dia(6, 15), 'uANA', 'Ana Souza', 'alfa', 'acesso.bloquear', 'Acesso de Duda Reis (duda@alfa.com.br) bloqueado.');
    L('b1', dia(6, 10), 'uX', 'Beto Alves', 'beta', 'convite.criar', 'Convite criado para Caio (caio@beta.com.br) como RH.');
    for (let i = 0; i < 110; i++) L('v' + i, `2026-10-01T${String(10 + (i % 10)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00.000Z`, 'uANA', 'Ana Souza', 'alfa', 'cadastro.conferir', `Registro antigo ${i}.`);
    Object.assign(d.docs['empresas/alfa'], { razao: 'Alfa Serviços Ltda', cnpj: '11.444.777/0001-61', plano: 'essencial', modulos: ['equipe', 'cobrancas'], protocolo: 'CW-2026-0001', avaliadoEm: dia(4, 9) });
    d.docs['empresas/alfa/privado/cadastro'] = { dados: { porte: 'Microempresa (ME)', regime: 'Simples Nacional', cnae: '3314-7/10' }, end: { cidade: 'Gravataí', uf: 'RS', logradouro: 'Rua das Flores', numero: '100' },
      resp: { nome: 'Ana Souza', cargo: 'Sócia', email: 'ana@alfa.com.br' }, banco: { banco: '341 · Itaú Unibanco', agencia: '1234', conta: '56789-0', tipoConta: 'Corrente', pixTipo: 'CNPJ', pix: '11.444.777/0001-61' },
      docs: { contrato: { nome: 'contrato.pdf', tam: 1000 }, cartao: { nome: 'cartao.pdf', tam: 1000 } }, conferidos: { contrato: { nome: 'contrato.pdf' }, cartao: { nome: 'outro.pdf' } } };
  });
  const textos = () => page.$$eval('#hs-lista .hs-reg p', x => x.map(e => e.innerText));

  // H1 admin: histórico da própria empresa, mais recente primeiro, agrupado por dia; nada de outra empresa
  await H.preparar(page, d); await page.goto(H.BASE);
  await H.entrar(page, 'ana@alfa.com.br', 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 });
  await page.evaluate(() => { location.hash = '#historico'; }); await page.waitForSelector('#hs-lista', { timeout: 8000 });
  const h1 = { t: await textos(), dias: await page.$$eval('#hs-lista .hs-dia', x => x.length), conta: await page.$eval('#hs-conta', e => e.innerText) };
  ok('H1 admin: histórico da empresa, mais recente primeiro e separado por dia; sem registros de outra empresa',
    /Duda Reis/.test(h1.t[0]) && /Tesouraria/.test(h1.t[1]) && /aprovado/.test(h1.t[2]) && !h1.t.some(x => /Caio/.test(x)) && h1.dias >= 4 && /100 de 100/.test(h1.conta), JSON.stringify({ t: h1.t.slice(0, 4), dias: h1.dias, conta: h1.conta }));

  // H2 "Mostrar mais antigos"
  await page.click('#hs-mais'); await page.waitForFunction(() => /114 de 114/.test((document.getElementById('hs-conta') || {}).innerText || ''), null, { timeout: 6000 }).catch(() => {});
  ok('H2 "Mostrar mais antigos" carrega os registros seguintes', /114 de 114/.test(await page.$eval('#hs-conta', e => e.innerText)), await page.$eval('#hs-conta', e => e.innerText));

  // H3 filtros: pessoa, assunto e busca (sem acento, várias palavras)
  await page.selectOption('#hs-pessoa', 'uIASMYN'); const f1 = await textos();
  await page.selectOption('#hs-pessoa', ''); await page.selectOption('#hs-assunto', 'acesso'); const f2 = await textos();
  await page.selectOption('#hs-assunto', ''); await page.fill('#hs-busca', 'convite edu'); await H.dorme(400); const f3 = await textos();
  await page.fill('#hs-busca', 'ninguem assim'); await H.dorme(400); const vazio = await page.$eval('#hs .empty', e => e.innerText).catch(() => '');
  ok('H3 filtros: por pessoa, por assunto (acessos) e busca por palavras; sem resultado explica',
    f1.length === 1 && /aprovado/.test(f1[0]) && f2.length === 2 && f2.every(x => /Cargo|bloqueado/.test(x)) && f3.length === 1 && /Edu Martins/.test(f3[0]) && /Nada encontrado/.test(vazio), JSON.stringify({ f1, f2, f3 }));

  // H4 Minha empresa (admin): dados, plano, módulos, documentos (o trocado volta a "em conferência") e dados bancários
  await page.evaluate(() => { location.hash = '#empresa'; }); await page.waitForSelector('#me-modulos', { timeout: 8000 });
  const h4 = await page.evaluate(() => ({ nome: document.getElementById('me-nome').innerText, plano: (document.getElementById('me-plano') || {}).innerText, banco: !!document.getElementById('me-banco'),
    mods: Array.from(document.querySelectorAll('#me-modulos .pill.ok')).length, docs: Array.from(document.querySelectorAll('#me-docs .pill')).map(p => p.innerText) }));
  ok('H4 Minha empresa (admin): nome, plano Essencial, 2 módulos contratados, dados bancários; documento trocado aparece "Em conferência"',
    h4.nome === 'Alfa Serviços' && h4.plano === 'Plano Essencial' && h4.banco && h4.mods === 2 && JSON.stringify(h4.docs) === '["Conferido","Em conferência"]', JSON.stringify(h4));

  // H5 financeiro: vê Minha empresa (com banco) e não vê o histórico; consulta-like (operacional) não vê o banco
  await page.click('#sair'); await page.waitForSelector('#lg-email');
  await H.entrar(page, 'bruno@alfa.com.br', 'senha123'); await page.waitForSelector('[data-ctx="empresa:alfa"]', { timeout: 8000 }); await page.click('[data-ctx="empresa:alfa"]'); await page.waitForSelector('.shell');
  const m5 = await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod));
  await page.evaluate(() => { location.hash = '#empresa'; }); await page.waitForSelector('#me-modulos', { timeout: 8000 });
  const banco5 = !!(await page.$('#me-banco'));
  await page.evaluate(() => { const a = CW.sessao.estado().contexto.acesso; a.cargo = 'consulta'; CW.app.montar(); location.hash = '#empresa'; CW.app.desenhar(); }); await page.waitForSelector('#me-modulos', { timeout: 8000 }); await H.dorme(200);
  const banco6 = !!(await page.$('#me-banco'));
  ok('H5 financeiro vê Minha empresa com os dados bancários e não vê o histórico; quem só consulta não vê os dados bancários', m5.includes('empresa') && !m5.includes('historico') && banco5 && !banco6, JSON.stringify({ m5, banco5, banco6 }));

  // H6 equipe Conectwork: todas as empresas, com o nome da empresa; filtra por empresa
  await page.click('#sair'); await page.waitForSelector('#lg-email');
  await H.entrar(page, 'iasmyn@conectwork.com.br', 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 });
  await page.evaluate(() => { location.hash = '#historico'; }); await page.waitForSelector('#hs-lista', { timeout: 8000 });
  const t6 = await page.$$eval('#hs-lista .hs-reg small', x => x.map(e => e.innerText));
  await page.selectOption('#hs-emp', 'beta'); await page.waitForFunction(() => document.querySelectorAll('#hs-lista .hs-reg').length === 1, null, { timeout: 6000 }).catch(() => {});
  const t6b = await textos();
  ok('H6 equipe Conectwork: vê todas as empresas com o nome de cada uma e filtra por empresa', t6.some(x => /Beta Indústria/.test(x)) && t6.some(x => /Alfa Serviços/.test(x)) && t6b.length === 1 && /Caio/.test(t6b[0]), JSON.stringify({ t6: t6.slice(0, 3), t6b }));

  // H7 celular: sem rolagem para o lado
  await page.setViewportSize({ width: 390, height: 844 }); await H.dorme(300);
  ok('H7 celular: histórico sem rolagem para o lado', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));

  ok('Sem erros de JavaScript na página', !erros.length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
