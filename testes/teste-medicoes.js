/* Teste de tela das medições do período (Etapa 2, parte 2): lançar com a memória, período sem repetir, divergência e
   correção, confirmação da prestadora, aprovação por outra pessoa (funções separadas) e o link vindo do painel do RH.
   Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('medicoes');

const b64url = o => Buffer.from(JSON.stringify(o), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    Object.assign(d.docs['empresas/alfa'], { modulos: ['equipe', 'cobrancas'], cnpj: '11.444.777/0001-61', tipo: 'contratante' });
    const pessoa = (uid, email, nome, emp, cargo) => { d.users[email] = { uid, pass: 'senha123' }; d.docs['usuarios/' + uid] = { nome, email }; d.docs[`acessos/${emp}_${uid}`] = { uid, empresaId: emp, nome, email, cargo, extras: [], sem: [], ativo: true }; };
    pessoa('uRITA', 'rita@alfa.com.br', 'Rita Prado', 'alfa', 'rh');
    pessoa('uALDO', 'aldo@alfa.com.br', 'Aldo Reis', 'alfa', 'aprovador');
    pessoa('uZECA', 'zeca@zeta.com.br', 'Zeca Moura', 'zeta', 'admin');
    d.docs['empresas/zeta'] = { nome: 'Zeta Manutenção', cnpj: '04.252.011/0001-10', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas'], criadoPor: 'uZECA' };
    d.docs['contratos/cz'] = { modalidade: 'continua', tomadorId: 'alfa', prestadorId: 'zeta', partes: ['alfa', 'zeta'], tomadorNome: 'Alfa Serviços', tomadorCnpj: '11.444.777/0001-61', prestadorNome: 'Zeta Manutenção', prestadorCnpj: '04.252.011/0001-10',
      objeto: 'Equipe de manutenção industrial.', periodicidade: 'quinzena', vencimentoDias: 1, inicio: '2026-01-01', fim: '', status: 'ativo', assinaturas: { tomador: { uid: 'uANA' }, prestador: { uid: 'uZECA' } }, interlocutor: { nome: 'Zeca Moura', email: 'zeca@zeta.com.br' }, proposta: null };
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  const meds = async () => Object.entries(await srv()).filter(([k]) => /^medicoes\//.test(k)).map(([k, v]) => Object.assign({ _id: k.split('/')[1] }, v));
  const logs = async a => Object.values(await srv()).filter(x => x.acao === a);
  const dlgOk = () => page.click('dialog[open] [data-dlg-b="1"]');
  const er = () => page.$eval('#md-erro', e => e.innerText);
  const entrarComo = async email => { if (await page.$('#sair')) await page.click('#sair'); await page.waitForSelector('#lg-email'); await H.entrar(page, email, 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 }); };
  const linha = async (i, nome, horas, valor) => { const r = `#md-its .md-it:nth-child(${i})`; await page.fill(r + ' .md-it-nome', nome); await page.fill(r + ' .md-it-horas', horas); await page.fill(r + ' .md-it-valor', ''); await page.type(r + ' .md-it-valor', valor); };

  // M1 RH lança: contrato já escolhido, quinzenas, memória com total automático e validações
  await H.preparar(page, d); await page.goto(H.BASE);
  await entrarComo('rita@alfa.com.br');
  const menu = await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod));
  await page.evaluate(() => { location.hash = '#medicoes'; }); await page.waitForSelector('#md-nova', { timeout: 8000 });
  await page.click('#md-nova'); await page.waitForSelector('#md-per');
  const per = await page.$$eval('#md-per option', x => x.map(o => o.value).filter(Boolean));
  await page.selectOption('#md-per', per[1]);
  await linha(1, 'Pedro', '80', '400000'); await dlgOk(); const e1 = await er();
  await linha(1, 'Pedro Lima', '80', '400000'); await page.click('#md-mais'); await linha(2, 'Joana Dias', '72,5', '362500');
  const total = await page.$eval('#md-total', e => e.innerText);
  await dlgOk(); await page.waitForSelector('#md-passos', { timeout: 8000 });
  let m = (await meds())[0];
  ok('M1 RH lança: contrato já escolhido, quinzenas, total somado sozinho; pede nome e sobrenome; grava contrato_período com a memória',
    menu.includes('medicoes') && /^\d{4}-\d{2}-[12]$/.test(per[0]) && /sobrenome/.test(e1) && total === 'R$ 7.625,00' && m._id === 'cz_' + per[1] && m.valorCentavos === 762500
    && m.memoria.length === 2 && m.memoria[1].horas === 72.5 && m.status === 'enviada' && m.origem === 'manual' && (await logs('medicao.enviar')).length === 1, JSON.stringify({ per: per.slice(0, 3), e1, total, id: m._id }));
  const PER = per[1];

  // M2 o mesmo período não entra duas vezes
  await page.evaluate(() => { location.hash = '#medicoes'; }); await page.waitForSelector('#md-nova'); await page.click('#md-nova'); await page.waitForSelector('#md-per');
  await page.selectOption('#md-per', PER); await linha(1, 'Pedro Lima', '1', '100'); await dlgOk(); await page.waitForSelector('#md-passos', { timeout: 8000 }); await H.dorme(200);
  ok('M2 o mesmo período não entra duas vezes: avisa e abre a medição que já existe', (await meds()).length === 1 && /Já existe medição/.test(await page.evaluate(() => document.getElementById('toast').innerText)));

  // M3 prestadora: "Precisa de você" e divergência com motivo
  await entrarComo('zeca@zeta.com.br');
  await page.evaluate(() => { location.hash = '#medicoes'; }); await page.waitForSelector('#md-minhas', { timeout: 8000 });
  const minhas = await page.$$eval('#md-tab-minhas tbody tr', x => x.length);
  await page.click('#md-tab-minhas tbody tr'); await page.waitForSelector('#md-divergir');
  const memoriaVe = await page.$eval('#md-memoria', e => e.innerText);
  await page.click('#md-divergir'); await page.waitForSelector('#dv-mot'); await page.fill('#dv-mot', 'As horas da Joana somam 76 h, não 72,5 h.'); await dlgOk(); await page.waitForSelector('#md-div', { timeout: 6000 });
  m = (await meds())[0];
  ok('M3 prestadora: a medição aparece em "Precisa de você", com a memória (nomes, horas e valores); aponta divergência com motivo',
    minhas === 1 && /Joana Dias/.test(memoriaVe) && /72,5 h/.test(memoriaVe) && m.status === 'divergencia' && /76 h/.test(m.divergencia.motivo) && (await logs('medicao.divergencia')).length === 1, JSON.stringify({ minhas, st: m.status }));

  // M4 RH vê a divergência, corrige e reenvia
  await entrarComo('rita@alfa.com.br');
  await page.evaluate(id => { location.hash = '#medicoes/ver/' + id; }, m._id); await page.waitForSelector('#md-corrigir', { timeout: 8000 });
  const div = await page.$eval('#md-div', e => e.innerText);
  await page.click('#md-corrigir'); await page.waitForSelector('#md-its'); await linha(2, 'Joana Dias', '76', '380000'); await dlgOk(); await H.dorme(500);
  m = (await meds())[0];
  ok('M4 o RH vê o motivo da divergência, corrige e a medição volta para a prestadora', /76 h/.test(div) && m.status === 'enviada' && m.valorCentavos === 780000 && m.divergencia === null && (await logs('medicao.corrigir')).length === 1, JSON.stringify({ st: m.status, v: m.valorCentavos }));

  // M5 prestadora confirma
  await entrarComo('zeca@zeta.com.br');
  await page.evaluate(id => { location.hash = '#medicoes/ver/' + id; }, m._id); await page.waitForSelector('#md-confirmar', { timeout: 8000 });
  await page.click('#md-confirmar'); await page.waitForSelector('dialog[open]'); await dlgOk(); await H.dorme(500);
  m = (await meds())[0];
  ok('M5 a prestadora confirma a medição', m.status === 'confirmada_prestadora' && m.confirmacao.uid === 'uZECA', m.status);

  // M6 quem lançou não aprova (funções separadas)
  await entrarComo('rita@alfa.com.br');
  const menuRita = await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod));
  await page.evaluate(() => { const a = CW.sessao.estado().contexto.acesso; a.cargo = 'admin'; CW.app.montar(); });
  await page.evaluate(id => { location.hash = '#medicoes/ver/' + id; CW.app.desenhar(); }, m._id); await page.waitForSelector('#md-acoes', { timeout: 8000 });
  const m6 = { aprovar: !!(await page.$('#md-aprovar')), aviso: await page.$eval('#md-acoes', e => e.innerText) };
  ok('M6 quem lançou a medição não aprova sozinho, mesmo sendo administrador (funções separadas)', !m6.aprovar && /Outra pessoa aprova/.test(m6.aviso), JSON.stringify(m6));

  // M7 aprovador técnico aprova
  await entrarComo('aldo@alfa.com.br');
  await page.evaluate(() => { location.hash = '#medicoes'; }); await page.waitForSelector('#md-minhas', { timeout: 8000 });
  await page.click('#md-tab-minhas tbody tr'); await page.waitForSelector('#md-aprovar'); await page.click('#md-aprovar'); await page.waitForSelector('dialog[open]'); await dlgOk(); await H.dorme(500);
  m = (await meds())[0];
  ok('M7 o aprovador técnico vê em "Precisa de você" e aprova', m.status === 'aprovada' && m.aprovacao.uid === 'uALDO' && (await logs('medicao.aprovar')).length === 1, m.status);

  // M8 link do painel do RH: confere o total, preenche tudo e grava como "integração"
  const resumo = { v: 1, origem: 'painel-colafix', periodo: '2026-10-1', cnpj: '04252011000110', nome: 'ZETA', ref: '2026-10-1:ZETA',
    total: 712050, itens: [{ n: 'Pedro Lima', h: 96.8, v: 352000 }, { n: 'Joana Dias', h: 99, v: 360050 }] };
  await entrarComo('rita@alfa.com.br');
  await page.evaluate(p => { location.hash = '#medicoes/importar/' + p; }, b64url(Object.assign({}, resumo, { total: 1 }))); await page.waitForSelector('#md-its', { timeout: 8000 });
  await dlgOk(); const e8 = await er(); await page.click('dialog[open] [data-dlg-b="0"]');
  await page.evaluate(p => { location.hash = '#medicoes'; setTimeout(() => { location.hash = '#medicoes/importar/' + p; }, 50); }, b64url(resumo)); await page.waitForSelector('#md-its .md-it:nth-child(2)', { timeout: 8000 });
  const pre = await page.evaluate(() => ({ per: document.getElementById('md-per').value, travado: document.getElementById('md-per').disabled, n: document.querySelectorAll('#md-its .md-it').length, total: document.getElementById('md-total').innerText }));
  await dlgOk(); await page.waitForSelector('#md-passos', { timeout: 8000 });
  const mi = (await meds()).find(x => x.periodo === '2026-10-1');
  ok('M8 link do painel do RH: soma diferente do total é barrada; o certo vem preenchido (período travado) e grava como "veio do painel"',
    /não bate com o total/.test(e8) && pre.per === '2026-10-1' && pre.travado && pre.n === 2 && pre.total === 'R$ 7.120,50' && mi && mi.origem === 'integracao' && mi.ref === '2026-10-1:ZETA' && mi.memoria[0].horas === 96.8,
    JSON.stringify({ e8, pre, origem: mi && mi.origem }));

  // M8b o painel manda de novo (mais um PJ junto): a medição da quinzena é atualizada; e uma "nota separada" vira outra medição
  const r2 = Object.assign({}, resumo, { total: 712050 + 150000, itens: resumo.itens.concat([{ n: 'Caio Reis', h: 40, v: 150000 }]) });
  await page.evaluate(p => { location.hash = '#medicoes'; setTimeout(() => { location.hash = '#medicoes/importar/' + p; }, 50); }, b64url(r2)); await page.waitForSelector('#md-its .md-it:nth-child(3)', { timeout: 8000 });
  const b8 = await page.$eval('#mi-msg', e => e.innerText);
  await dlgOk(); await page.waitForSelector('#md-passos', { timeout: 8000 });
  const ms8 = (await meds()).filter(x => x.periodo === '2026-10-1');
  const sep = { v: 1, periodo: '2026-10-1', cnpj: '04252011000110', nome: 'ZETA', ref: '2026-10-1:ZETA:pjx01', parte: 'pjx01', total: 90000, itens: [{ n: 'Lia Souza', h: 24, v: 90000 }] };
  await page.evaluate(p => { location.hash = '#medicoes'; setTimeout(() => { location.hash = '#medicoes/importar/' + p; }, 50); }, b64url(sep)); await page.waitForSelector('#md-its .md-it', { timeout: 8000 });
  const b8s = await page.$eval('#mi-msg', e => e.innerText);
  await dlgOk(); await page.waitForSelector('#md-passos', { timeout: 8000 });
  const srv8 = await page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  const ids8 = Object.keys(srv8).filter(k => /^medicoes\/[^/]*2026-10-1/.test(k));
  const sp = Object.entries(srv8).find(([k]) => /_pjx01$/.test(k));
  ok('M8b mandar de novo atualiza a medição da quinzena (3 profissionais, mesma medição); a nota separada vira outra medição só com o PJ',
    /Atualização/.test(b8) && ms8.length === 1 && ms8[0].memoria.length === 3 && ms8[0].valorCentavos === 862050 && /nota separada/.test(b8s) && sp && sp[1].parte === 'pjx01' && sp[1].memoria.length === 1 && sp[1].valorCentavos === 90000 && ids8.length === 2,
    JSON.stringify({ b8: b8.slice(0, 120), b8s: b8s.slice(0, 160), ids8 }));

  // M9 link quebrado e quem não pode lançar
  await page.evaluate(() => { location.hash = '#medicoes/importar/xyz'; }); await page.waitForSelector('#mi-msg', { timeout: 8000 });
  const m9a = await page.$eval('#mi-msg', e => e.innerText);
  await entrarComo('aldo@alfa.com.br');
  await page.evaluate(p => { location.hash = '#medicoes/importar/' + p; }, b64url(Object.assign({}, resumo, { periodo: '2026-09-1' }))); await page.waitForSelector('#mi-msg', { timeout: 8000 });
  const m9b = await page.$eval('#mi-msg', e => e.innerText);
  ok('M9 link cortado avisa para enviar de novo; aprovador (que não lança) é avisado de quem pode', /não é válido/.test(m9a) && /não pode lançar/.test(m9b), JSON.stringify([m9a.slice(0, 50), m9b.slice(0, 50)]));

  // M10 celular: detalhe e formulário sem rolagem para o lado
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(id => { location.hash = '#medicoes/ver/' + id; }, m._id); await page.waitForSelector('#md-memoria'); await H.dorme(300);
  const lado = await page.evaluate(() => { const w = innerWidth; return Array.from(document.querySelectorAll('#view *')).filter(e => e.getBoundingClientRect().right > w + 1).slice(0, 3).map(e => e.tagName + '.' + e.className); });
  ok('M10 celular: medição sem rolagem para o lado', !lado.length && !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), JSON.stringify(lado));

  ok('Sem erros de JavaScript na página', !erros.length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
