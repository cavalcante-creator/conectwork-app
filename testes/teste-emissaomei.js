/* Notas dos MEIs numa tela só (13/11/2026, "uma funcionária da Zenith vai fazer a emissão das notas; teria que ter um login para
   fazer todos de uma vez"): a equipe Conectwork dá a uma pessoa da prestadora acesso aos MEIs da medição; ela vê todas as notas em
   "Notas dos MEIs", entra em cada uma, confere, emite e volta. Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('emissaomei');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    const pessoa = (uid, email, nome, emp, cargo) => { d.users[email] = d.users[email] || { uid, pass: 'senha123' }; d.docs['usuarios/' + uid] = { nome, email }; d.docs[`acessos/${emp}_${uid}`] = { uid, empresaId: emp, nome, email, cargo, extras: [], sem: [], ativo: true }; };
    pessoa('uJU', 'ju@nexo.com.br', 'Julia Prado', 'nexo', 'operacional');
    pessoa('uIASMYN', 'iasmyn@conectwork.com.br', 'Iasmyn', 'nexo', 'admin');
    pessoa('uCARL', 'carl@carl.com.br', 'Carlos Ramos', 'meic', 'admin');
    d.docs['empresas/col'] = { nome: 'Colina Indústria', status: 'aprovado', tipo: 'contratante', modulos: ['cobrancas'], criadoPor: 'uX' };
    d.docs['empresas/nexo'] = { nome: 'Nexo Serviços', razao: 'Nexo Serviços Ltda', cnpj: '04.252.011/0001-10', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas'], criadoPor: 'uX' };
    d.docs['empresas/meic'] = { nome: 'Carlos Ramos', razao: 'Carlos Ramos 33000167000101', cnpj: '33.000.167/0001-01', status: 'aprovado', preCadastro: true, tipo: 'prestador', modulos: [], criadoPor: 'uX' };
    d.docs['empresas/meic/privado/cadastro'] = { dados: { porte: 'MEI' } };
    d.docs['empresas/meib'] = { nome: 'Bia Costa', razao: 'Bia Costa 11222333000181', cnpj: '11.222.333/0001-81', status: 'aprovado', preCadastro: true, tipo: 'prestador', modulos: [], criadoPor: 'uX' };
    d.docs['empresas/meib/privado/cadastro'] = { dados: { porte: 'MEI' } };
    d.docs['cnpjs/33000167000101'] = { empresaId: 'meic' }; d.docs['cnpjs/11222333000181'] = { empresaId: 'meib' };
    d.docs['medicoes/cn_2026-10-2'] = { contratoId: 'cn', tomadorId: 'col', prestadorId: 'nexo', partes: ['col', 'nexo'], tomadorNome: 'Colina Indústria', prestadorNome: 'Nexo Serviços', periodicidade: 'quinzena', periodo: '2026-10-2',
      valorCentavos: 650000, memoria: [{ nome: 'Carlos Ramos', horas: 96.8, valorCentavos: 350000, cnpj: '33000167000101' }, { nome: 'Bia Costa', horas: 90, valorCentavos: 300000, cnpj: '11222333000181' }],
      obs: '', origem: 'integracao', ref: 'painel-rh:2026-10-2:NEXO', status: 'aprovada', divergencia: null, confirmacao: { uid: 'uX', nome: 'X' }, aprovacao: { uid: 'uRH', nome: 'Rita', painel: true }, criadoPor: 'uRH', criadoPorNome: 'Rita' };
    const esp = (cnpj, emp, nome, horas, v) => ({ medicaoId: 'cn_2026-10-2', contratoId: null, tomadorId: 'nexo', prestadorId: emp, partes: ['nexo', emp], tomadorNome: 'Nexo Serviços', prestadorNome: nome, prestadorCnpj: cnpj, prestadorCnpjNum: cnpj.replace(/\D/g, ''),
      tomador: { razao: 'Nexo Serviços Ltda', cnpj: '04.252.011/0001-10', im: '', endereco: '', cidade: '', uf: '' }, item: 0, horas, periodo: '2026-10-2', competencia: '2026-10', descricao: 'Serviços.', origem: 'repasse', osNumero: null,
      valorCentavos: v, retencoes: { iss: 0, inss: 0, ir: 0, pcc: 0 }, liquidoCentavos: v, vencimentoDias: 5, obs: '', status: 'aguardando_nota', versao: 1, criadoPor: 'uX', criadoEm: '2026-11-01T00:00:00Z' });
    d.docs['espelhos/cn_2026-10-2_33000167000101'] = esp('33.000.167/0001-01', 'meic', 'Carlos Ramos', 96.8, 350000);
    d.docs['espelhos/cn_2026-10-2_11222333000181'] = esp('11.222.333/0001-81', 'meib', 'Bia Costa', 90, 300000);
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  const entrarComo = async email => { if (await page.$('#sair')) await page.click('#sair'); await page.waitForSelector('#lg-email'); await H.entrar(page, email, 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 }).catch(() => null); await H.dorme(800); };
  const escolher = async nome => { const b = await page.$(`[data-ctx]:has-text("${nome}")`); if (b) { await b.click(); await H.dorme(800); } };

  await H.preparar(page, d); await page.goto(H.BASE);
  await entrarComo('iasmyn@conectwork.com.br'); await escolher('Nexo');
  await page.evaluate(() => { location.hash = '#repasse/ver/cn_2026-10-2'; }); await page.waitForSelector('#rp-em-dar', { timeout: 10000 });
  const e1 = await page.$eval('#rp-emissor', e => e.innerText);
  ok('E1 a equipe Conectwork vê "Quem emite as notas dos MEIs" com a equipe da prestadora', /Quem emite as notas dos MEIs/.test(e1) && /Julia Prado/.test(e1) && /Dar acesso aos 2 MEIs/.test(e1), e1.slice(0, 300));
  await page.selectOption('#rp-em-quem', 'uJU'); await page.click('#rp-em-dar'); await page.waitForSelector('#rp-em-lista', { timeout: 8000 });
  const S = await srv(), a1 = S['acessos/meic_uJU'], a2 = S['acessos/meib_uJU'];
  ok('E2 dá à Julia acesso "operacional" nos 2 MEIs, marcado como emissora pela prestadora', a1 && a2 && a1.cargo === 'operacional' && a1.emissorPor === 'nexo' && a2.emissorPor === 'nexo' && a1.ativo === true, JSON.stringify(a1));

  await entrarComo('ju@nexo.com.br'); await escolher('Nexo');
  await page.evaluate(() => { location.hash = '#emissaomei'; }); await page.waitForSelector('#em-tab', { timeout: 10000 });
  const lst = await page.$$eval('#em-tab tbody tr', x => x.map(t => t.innerText.replace(/\s+/g, ' ')));
  const menu = await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod));
  ok('E3 a Julia vê "Notas dos MEIs" no menu e as notas dos 2 MEIs numa lista só', menu.includes('emissaomei') && lst.length === 2 && lst.some(t => /Carlos Ramos.*R\$ 3\.500,00.*Conferir as horas/.test(t)) && lst.some(t => /Bia Costa.*R\$ 3\.000,00/.test(t)), JSON.stringify(lst));
  await page.click('button[data-em-abrir="cn_2026-10-2_33000167000101"]'); await page.waitForSelector('#es-mei-aceite', { timeout: 10000 }); await H.dorme(400);
  const v = await page.evaluate(() => ({ faixa: (document.getElementById('em-volta-faixa') || {}).innerText || '', box: document.getElementById('es-mei-aceite').innerText }));
  ok('E4 "Emitir" entra na empresa do Carlos e abre a nota dele, com a faixa para voltar e "confira com o profissional"', /emitindo pela empresa de Carlos Ramos/.test(v.faixa) && /confira as horas e o valor com o profissional/.test(v.box), JSON.stringify(v));
  await page.click('#es-mei-ok'); await page.waitForSelector('#es-emitir-bt', { timeout: 8000 });
  ok('E5 ela concorda e aparece "Emitir a nota"', ((await srv())['espelhos/cn_2026-10-2_33000167000101'].aceiteMei || {}).uid === 'uJU');
  await page.click('#em-volta'); await page.waitForSelector('#em-tab', { timeout: 10000 });
  const lst2 = await page.$$eval('#em-tab tbody tr', x => x.map(t => t.innerText.replace(/\s+/g, ' ')));
  ok('E6 "Voltar para as notas dos MEIs" volta para a lista na prestadora (Carlos agora "Emitir a nota")', lst2.some(t => /Carlos Ramos.*Emitir a nota/.test(t)), JSON.stringify(lst2));
  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
