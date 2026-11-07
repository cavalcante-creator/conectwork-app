/* Teste de tela dos contratos de equipe contínua (Etapa 2, parte 1): criar com prestadora aprovada, assinar dos dois
   lados (interlocutor da prestadora), vencimento que só muda com o aceite da outra empresa, encerrar, corrigir e
   cancelar antes de assinar. Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('contratos');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    Object.assign(d.docs['empresas/alfa'], { modulos: ['equipe', 'cobrancas'], cnpj: '11.444.777/0001-61', razao: 'Alfa Serviços Ltda', tipo: 'contratante' });
    d.users['zeca@zeta.com.br'] = { uid: 'uZECA', pass: 'senha123' };
    d.docs['usuarios/uZECA'] = { nome: 'Zeca Moura', email: 'zeca@zeta.com.br' };
    d.docs['empresas/zeta'] = { nome: 'Zeta Manutenção', razao: 'Zeta Manutenção Ltda', cnpj: '04.252.011/0001-10', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas'], criadoPor: 'uZECA' };
    d.docs['acessos/zeta_uZECA'] = { uid: 'uZECA', empresaId: 'zeta', nome: 'Zeca Moura', email: 'zeca@zeta.com.br', cargo: 'admin', extras: [], sem: [], ativo: true };
    d.docs['empresas/omega'] = { nome: 'Ômega em análise', status: 'analise', tipo: 'prestador', criadoPor: 'uX' };
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  const contratos = async () => Object.entries(await srv()).filter(([k]) => /^contratos\//.test(k)).map(([k, v]) => Object.assign({ _id: k.split('/')[1] }, v));
  const logs = async a => Object.values(await srv()).filter(x => x.acao === a);
  const dlgOk = () => page.click('dialog[open] [data-dlg-b="1"]');
  const entrarComo = async (email) => { if (await page.$('#sair')) { await page.click('#sair'); } await page.waitForSelector('#lg-email'); await H.entrar(page, email, 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 }); };

  // K1 tomador: menu Contratos; "Novo contrato" só lista prestadoras aprovadas; validações
  await H.preparar(page, d); await page.goto(H.BASE);
  await entrarComo('ana@alfa.com.br');
  const menu = await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod));
  await page.evaluate(() => { location.hash = '#contratos'; }); await page.waitForSelector('#ct-novo', { timeout: 8000 });
  await page.click('#ct-novo'); await page.waitForSelector('#ct-prest');
  const opcoes = await page.$$eval('#ct-prest option', x => x.map(o => o.textContent));
  const er = () => page.$eval('#ct-erro', e => e.innerText);
  await dlgOk(); const e1 = await er();
  await page.selectOption('#ct-prest', 'zeta'); await page.fill('#ct-obj', 'Equipe'); await dlgOk(); const e2 = await er();
  await page.fill('#ct-obj', 'Equipe de manutenção industrial com supervisor próprio.'); await page.fill('#ct-venc', '91'); await dlgOk(); const e3 = await er();
  const vPadrao = await page.evaluate(() => '1');
  await page.fill('#ct-venc', '1'); await dlgOk(); const e4 = await er();
  ok('K1 tomador: menu Contratos; só prestadoras aprovadas na lista; pede prestadora, objeto, vencimento de 0 a 90 e início',
    menu.includes('contratos') && opcoes.length === 2 && /Zeta/.test(opcoes[1]) && !opcoes.some(o => /Ômega|Beta/.test(o))
    && /Escolha a prestadora/.test(e1) && /objeto/.test(e2) && /0 a 90/.test(e3) && /início/.test(e4), JSON.stringify({ opcoes, e1, e2, e3, e4 }));

  // K2 cria (vencimento padrão 1 dia), abre o detalhe e o tomador assina
  await page.fill('#ct-ini', '2026-11-01'); await dlgOk(); await page.waitForSelector('#ct-assinaturas', { timeout: 8000 });
  let c = (await contratos())[0];
  const k2 = { st: await page.$eval('#ct-dados .pill', e => e.innerText), venc: await page.$eval('#ct-venc-v', e => e.innerText) };
  const semBotao = !(await page.$('#ct-assinar')) && /triagem/i.test(await page.$eval('#ct-sem-triagem', e => e.innerText));
  /* triagem: jornada controlada = requer análise jurídica; com o parecer registrado, libera a assinatura */
  await page.click('#tr-fazer'); await page.waitForSelector('.tr-q');
  await dlgOk(); const eTri = await page.$eval('#tr-erro', e => e.innerText);
  for (const [k, v] of Object.entries({ entrega: 'sim', supervisor: 'sim', ordens: 'nao', jornada: 'sim', exclusiv: 'nao', exempregado: 'nao', socio: 'nao' })) await page.click(`.tr-q[data-k="${k}"] .tr-b[data-v="${v}"]`);
  await dlgOk(); await page.waitForSelector('#tr-parecer', { timeout: 8000 });
  const res1 = await page.$eval('#tr-res', e => e.innerText), aindaSem = !(await page.$('#ct-assinar'));
  await page.click('#tr-parecer'); await page.waitForSelector('#pj-obs'); await page.fill('#pj-obs', 'Escritório Exemplo: pode contratar com o supervisor da prestadora no local.'); await page.check('#pj-ok'); await dlgOk();
  await page.waitForSelector('#ct-assinar', { timeout: 8000 });
  c = (await contratos())[0];
  ok('K1b sem triagem não assina; jornada controlada dá "Requer análise jurídica"; com o parecer favorável registrado, a assinatura é liberada',
    semBotao && /Responda a pergunta 1/.test(eTri) && res1 === 'Requer análise jurídica' && aindaSem && c.triagem.resultado === 'analise_juridica' && c.triagem.r.jornada === 'sim' && c.triagem.parecer.ok && (await logs('contrato.triagem')).length === 1 && (await logs('contrato.parecer')).length === 1, JSON.stringify({ semBotao, eTri, res1 }));
  await page.click('#ct-assinar'); const e5 = await page.$eval('#ct-erro2', e => e.innerText);
  await page.check('#ct-li'); await page.click('#ct-assinar'); await H.dorme(500);
  c = (await contratos())[0];
  ok('K2 cria o contrato (equipe contínua, 1 dia depois da nota válida) e o tomador assina depois de "Li e concordo"',
    c.modalidade === 'continua' && c.tomadorId === 'alfa' && c.prestadorId === 'zeta' && c.vencimentoDias === 1 && c.periodicidade === 'quinzena' && JSON.stringify(c.partes) === '["alfa","zeta"]'
    && k2.st === 'Esperando assinatura' && /1 dia depois da nota válida/.test(k2.venc) && /Li e concordo/.test(e5) && c.assinaturas.tomador && c.assinaturas.tomador.uid === 'uANA' && c.status === 'assinatura'
    && (await logs('contrato.criar')).length === 1, JSON.stringify({ k2, st: c.status, as: Object.keys(c.assinaturas) }));

  // K3 prestadora: vê "falta a sua assinatura", informa o interlocutor e assina → Ativo
  await entrarComo('zeca@zeta.com.br');
  const m3 = await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod));
  await page.evaluate(() => { location.hash = '#contratos'; }); await page.waitForSelector('#ct-lista tbody tr', { timeout: 8000 });
  const aviso = await page.$eval('#ct-lista tbody tr', r => r.innerText);
  await page.click('#ct-lista tbody tr'); await page.waitForSelector('#ct-int-nome');
  await page.check('#ct-li'); await page.click('#ct-assinar'); const e6 = await page.$eval('#ct-erro2', e => e.innerText);
  await page.fill('#ct-int-nome', 'Zeca Moura'); await page.fill('#ct-int-email', 'zeca@zeta.com.br'); await page.click('#ct-assinar'); await page.waitForFunction(() => /Ativo/.test((document.querySelector('#ct-dados .pill') || {}).innerText || ''), null, { timeout: 6000 }).catch(() => {});
  c = (await contratos())[0];
  ok('K3 prestadora: vê o contrato com "falta a sua assinatura", precisa informar o interlocutor e, ao assinar, o contrato fica Ativo',
    m3.includes('contratos') && /Você presta o serviço/.test(aviso) && /falta a sua assinatura/.test(aviso) && /interlocutor/.test(e6) && c.status === 'ativo' && c.interlocutor.nome === 'Zeca Moura' && c.assinaturas.prestador.uid === 'uZECA',
    JSON.stringify({ st: c.status, e6, aviso: aviso.slice(0, 80) }));

  // K4 vencimento: a prestadora propõe 5 dias; o tomador vê o pedido e aceita (só então vale)
  await page.click('#ct-propor'); await page.waitForSelector('#pv-dias'); await page.fill('#pv-dias', '5'); await page.fill('#pv-mot', 'Fluxo de caixa'); await dlgOk(); await page.waitForSelector('#ct-prop', { timeout: 6000 });
  c = (await contratos())[0]; const venc4a = c.vencimentoDias;
  await entrarComo('ana@alfa.com.br'); await page.evaluate(id => { location.hash = '#contratos/ver/' + id; }, c._id); await page.waitForSelector('#ct-prop-aceitar', { timeout: 8000 });
  const banner = await page.$eval('#ct-prop', e => e.innerText);
  await page.click('#ct-prop-aceitar'); await page.waitForFunction(() => /5 dias/.test((document.getElementById('ct-venc-v') || {}).innerText || ''), null, { timeout: 6000 }).catch(() => {});
  c = (await contratos())[0];
  ok('K4 vencimento: a proposta da prestadora não vale sozinha; o tomador vê o pedido com o motivo, aceita e passa a valer 5 dias',
    venc4a === 1 && /propôs mudar o vencimento/.test(banner) && /Fluxo de caixa/.test(banner) && c.vencimentoDias === 5 && c.proposta === null && (await logs('contrato.vencimento')).length === 1, JSON.stringify({ venc4a, v: c.vencimentoDias }));

  // K5 encerrar o serviço (com último dia e motivo)
  await page.click('#ct-encerrar'); await page.waitForSelector('#en-data'); await dlgOk(); const e7 = await page.$eval('#en-erro', e => e.innerText);
  await page.fill('#en-data', '2026-12-31'); await page.fill('#en-mot', 'Fim do projeto de manutenção.'); await dlgOk(); await page.waitForFunction(() => /Encerrado/.test((document.querySelector('#ct-dados .pill') || {}).innerText || ''), null, { timeout: 6000 }).catch(() => {});
  c = (await contratos())[0];
  ok('K5 encerrar o serviço pede o último dia e o motivo; o contrato fica Encerrado', /último dia/.test(e7) && c.status === 'encerrado' && c.encerramento.motivo === 'Fim do projeto de manutenção.' && c.encerramento.lado === 'tomador', JSON.stringify({ st: c.status }));

  // K6 corrigir antes de assinado (assinaturas recomeçam) e cancelar
  await page.evaluate(() => { location.hash = '#contratos'; }); await page.waitForSelector('#ct-novo');
  await page.click('#ct-novo'); await page.waitForSelector('#ct-prest'); await page.selectOption('#ct-prest', 'zeta'); await page.fill('#ct-obj', 'Equipe de limpeza com supervisor próprio.'); await page.fill('#ct-ini', '2026-12-01'); await dlgOk();
  await page.waitForSelector('#tr-fazer'); await page.click('#tr-fazer'); await page.waitForSelector('.tr-q');
  for (const [k, v] of Object.entries({ entrega: 'sim', supervisor: 'sim', ordens: 'nao', jornada: 'nao', exclusiv: 'nao', exempregado: 'nao', socio: 'nao' })) await page.click(`.tr-q[data-k="${k}"] .tr-b[data-v="${v}"]`);
  await dlgOk(); await page.waitForSelector('#ct-assinar', { timeout: 8000 });
  const compat = await page.$eval('#tr-res', e => e.innerText);
  await page.check('#ct-li'); await page.click('#ct-assinar'); await page.waitForSelector('#ct-corrigir', { timeout: 6000 }); await H.dorme(300);
  await page.click('#ct-corrigir'); await page.waitForSelector('#ct-obj'); await page.fill('#ct-obj', 'Equipe de limpeza e conservação com supervisor próprio.'); await dlgOk(); await H.dorme(600);
  let c2 = (await contratos()).find(x => /limpeza/.test(x.objeto));
  const k6a = { obj: c2.objeto, as: Object.keys(c2.assinaturas || {}) };
  await page.waitForSelector('#ct-cancelar'); await page.click('#ct-cancelar'); await page.waitForSelector('dialog[open]'); await dlgOk(); await H.dorme(500);
  c2 = (await contratos()).find(x => /limpeza/.test(x.objeto));
  ok('K6 (triagem compatível libera direto) antes das assinaturas o tomador corrige (as assinaturas recomeçam) e pode cancelar', compat === 'Compatível' && /conservação/.test(k6a.obj) && k6a.as.length === 0 && c2.status === 'cancelado' && (await logs('contrato.corrigir')).length === 1, JSON.stringify({ k6a, st: c2.status }));

  // K7 quem não é admin vê mas não muda (financeiro não tem Contratos no menu; solicitante vê sem botões)
  await page.evaluate(() => { const a = CW.sessao.estado().contexto.acesso; a.cargo = 'solicitante'; CW.app.montar(); });
  await page.evaluate(id => { location.hash = '#contratos/ver/' + id; CW.app.desenhar(); }, c._id); await page.waitForSelector('#ct-assinaturas', { timeout: 8000 }); await H.dorme(300);
  const k7 = { botoes: await page.$$eval('#ct-assinaturas button', x => x.length), novo: await page.evaluate(() => { location.hash = '#contratos'; return true; }) };
  await page.waitForSelector('#ct-lista'); const novo = await page.$('#ct-novo');
  ok('K7 solicitante vê o contrato sem botões de assinar ou mudar, e sem "Novo contrato"', k7.botoes === 0 && !novo, JSON.stringify(k7));

  // K8 celular: lista e detalhe sem rolagem para o lado
  await page.setViewportSize({ width: 390, height: 844 }); await H.dorme(300);
  const lado1 = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  await page.evaluate(id => { location.hash = '#contratos/ver/' + id; }, c._id); await page.waitForSelector('#ct-dados'); await H.dorme(300);
  const lado2 = await page.evaluate(() => { const w = innerWidth; return Array.from(document.querySelectorAll('#view *')).filter(e => e.getBoundingClientRect().right > w + 1).slice(0, 4).map(e => e.tagName + '.' + e.className + ':' + Math.round(e.getBoundingClientRect().right)); });
  ok('K8 celular: contratos sem rolagem para o lado', !lado1 && !lado2.length, JSON.stringify({ lado1, lado2 }));

  ok('Sem erros de JavaScript na página', !erros.length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
