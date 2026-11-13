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
    /* a nota da Bia de outubro/1 já foi conferida (título esperando o Pix); a de setembro já teve o Pix anotado */
    d.docs['espelhos/cn_2026-10-1_11222333000181'] = Object.assign(esp('11.222.333/0001-81', 'meib', 'Bia Costa', 80, 280000), { periodo: '2026-10-1', medicaoId: 'cn_2026-10-1', status: 'nota_ok' });
    const tit = (id, per, v, extra) => Object.assign({ espelhoId: id, medicaoId: 'cn_' + per, contratoId: null, tomadorId: 'nexo', prestadorId: 'meib', partes: ['nexo', 'meib'], tomadorNome: 'Nexo Serviços', prestadorNome: 'Bia Costa', periodo: per, competencia: per.slice(0, 7),
      valorCentavos: v, liquidoCentavos: v, retencoes: { iss: 0, inss: 0, ir: 0, pcc: 0 }, vencimentoDias: 5, base: '2026-11-10T00:00:00Z', status: 'aprovado', aprovacao: { uid: 'uIASMYN', nome: 'Iasmyn', em: '2026-11-10T00:00:00Z' }, conta: null, criadoEm: '2026-11-10T00:00:00Z' }, extra || {});
    d.docs['titulos/cn_2026-10-1_11222333000181'] = tit('cn_2026-10-1_11222333000181', '2026-10-1', 280000);
    d.docs['titulos/cn_2026-09-2_11222333000181'] = tit('cn_2026-09-2_11222333000181', '2026-09-2', 250000, { status: 'liquidado', conta: { ok: true, revisao: false, versao: 1, em: '2026-10-05T00:00:00Z', nome: 'Bia' } });
    d.docs['titulos/cn_2026-09-2_11222333000181/privado/conta'] = { banco: '', agencia: '', conta: '', tipo: 'Corrente', pix: 'bia.costa@exemplo.com', titular: 'Bia Costa', doc: '11.222.333/0001-81', versao: 1, em: '2026-10-05T00:00:00Z', por: 'uX', porNome: 'Bia' };
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  const entrarComo = async email => { if (await page.$('#sair')) await page.click('#sair'); await page.waitForSelector('#lg-email'); await H.entrar(page, email, 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 }).catch(() => null); await H.dorme(800); };
  const escolher = async nome => { const b = await page.$(`[data-ctx]:has-text("${nome}")`); if (b) { await b.click(); await H.dorme(800); } };

  await H.preparar(page, d); await page.goto(H.BASE);
  await entrarComo('iasmyn@conectwork.com.br'); await escolher('Nexo');
  await page.evaluate(() => { location.hash = '#repasse/ver/cn_2026-10-2'; }); await page.waitForSelector('#rp-em-dar', { timeout: 10000 });
  const e1 = await page.$eval('#rp-emissor', e => e.innerText);
  ok('E1 a equipe Conectwork vê "Quem emite as notas dos MEIs" com a equipe da prestadora', /Quem emite as notas dos MEIs/.test(e1) && /Julia Prado/.test(e1) && /Dar acesso aos 2 MEIs/.test(e1), e1.slice(0, 300));
  await page.selectOption('#rp-em-quem', 'uJU'); await page.selectOption('#rp-em-oque', 'paga'); await page.click('#rp-em-dar'); await page.waitForSelector('#rp-em-lista', { timeout: 8000 });
  const S = await srv(), a1 = S['acessos/meic_uJU'], a2 = S['acessos/meib_uJU'];
  ok('E2 "emite e paga": dá à Julia acesso "financeiro" nos 2 MEIs, marcado como emissora pela prestadora', a1 && a2 && a1.cargo === 'financeiro' && a1.emissorPor === 'nexo' && a2.emissorPor === 'nexo' && a1.ativo === true, JSON.stringify(a1));

  await page.waitForSelector('[data-em-tes="uJU"]', { timeout: 8000 }); await page.click('[data-em-tes="uJU"]'); await page.waitForSelector('dialog[open]'); await page.click('dialog[open] [data-dlg-b="1"]'); await H.dorme(800);
  ok('E2b "mudar para Tesouraria": a Julia passa a pagar pela prestadora', (await srv())['acessos/nexo_uJU'].cargo === 'tesouraria');
  await entrarComo('ju@nexo.com.br'); await escolher('Nexo');
  await page.evaluate(() => { location.hash = '#emissaomei'; }); await page.waitForSelector('#em-tab', { timeout: 10000 });
  const lst = await page.$$eval('#em-tab tbody tr', x => x.map(t => t.innerText.replace(/\s+/g, ' ')));
  const menu = await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod));
  ok('E3 a Julia vê "Notas dos MEIs" no menu e as notas dos 2 MEIs numa lista só', menu.includes('emissaomei') && lst.length === 2 && lst.some(t => /Carlos Ramos.*R\$ 3\.500,00.*Conferir as horas/.test(t)) && lst.some(t => /Bia Costa.*R\$ 3\.000,00/.test(t)), JSON.stringify(lst));
  await page.click('button[data-em-abrir="cn_2026-10-2_33000167000101"]'); await page.waitForSelector('#es-emitir-bt', { timeout: 10000 }); await H.dorme(400);
  const v = await page.evaluate(() => ({ faixa: (document.getElementById('em-volta-faixa') || {}).innerText || '', box: !!document.getElementById('es-mei-aceite'), anexar: !!document.getElementById('es-anexar') }));
  ok('E4 "Emitir" entra na empresa do Carlos e abre a nota dele direto no "Emitir a nota" (sem o "Confira antes de emitir": quem emite pela prestadora confere)', /emitindo pela empresa de Carlos Ramos/.test(v.faixa) && !v.box && v.anexar, JSON.stringify(v));
  const pop = page.context().waitForEvent('page', { timeout: 4000 }).catch(() => null);
  await page.click('#es-emitir-bt'); await pop; await H.dorme(900);
  const ac5 = (await srv())['espelhos/cn_2026-10-2_33000167000101'].aceiteMei || {};
  ok('E5 ao tocar em "Emitir a nota", o "concordo" é gravado no nome dela (quem emite pela prestadora)', ac5.uid === 'uJU' && ac5.ok === true && ac5.emissor === true, JSON.stringify(ac5));
  await page.click('#em-volta'); await page.waitForSelector('#em-tab', { timeout: 10000 });
  const lst2 = await page.$$eval('#em-tab tbody tr', x => x.map(t => t.innerText.replace(/\s+/g, ' ')));
  ok('E6 "Voltar para as notas dos MEIs" volta para a lista na prestadora (Carlos agora "Emitir a nota")', lst2.some(t => /Carlos Ramos.*(Emitir a nota|Anexar)/.test(t)), JSON.stringify(lst2));
  // E6b (13/11/2026, "sem precisar entrar um por um"): em Espelhos da nota da prestadora, tocar na nota do MEI já abre na empresa dele
  const setCargo = c => page.evaluate(c => { const S = JSON.parse(localStorage.getItem('__srv')); S.docs['acessos/nexo_uJU'].cargo = c; localStorage.setItem('__srv', JSON.stringify(S)); }, c);
  await setCargo('financeiro'); await entrarComo('ju@nexo.com.br'); await escolher('Nexo');
  await page.evaluate(() => { location.hash = '#espelhos'; }); await H.dorme(1800);
  const e6b = await page.evaluate(() => ({ b: (document.getElementById('es-mei-emite') || {}).innerText || '', tem: !!document.querySelector('[data-abrir-mei][data-abrir="cn_2026-10-1_11222333000181"]') }));
  if (e6b.tem) { await page.click('[data-abrir-mei][data-abrir="cn_2026-10-1_11222333000181"]'); await H.dorme(1800); }
  const e6c = await page.evaluate(() => ({ h: location.hash, f: (document.getElementById('em-volta-faixa') || {}).innerText || '' }));
  ok('E6b em Espelhos da nota, a nota do MEI leva direto para a empresa dele ("toque para emitir")', /para você emitir/.test(e6b.b) && e6b.tem && /espelhos\/ver\/cn_2026-10-1_11222333000181/.test(e6c.h) && /Bia Costa/.test(e6c.f), JSON.stringify({ e6b, e6c }));
  await setCargo('tesouraria'); await entrarComo('ju@nexo.com.br'); await escolher('Nexo');
  await page.evaluate(() => { location.hash = '#emissaomei'; }); await page.waitForSelector('#em-tab', { timeout: 10000 });
  // E7 pagamento: a nota da Bia já conferida → "Anotar o Pix" (vem o Pix da quinzena anterior) → "Pagar" depois de liberado
  const t7 = await page.$eval('#em-tab2', e => e.innerText.replace(/\s+/g, ' '));
  await page.click('[data-em-pix="cn_2026-10-1_11222333000181"]'); await page.waitForSelector('#tt-conta', { timeout: 10000 });
  await page.click('#tt-conta'); await page.waitForSelector('#fc-pix'); const pix0 = await page.$eval('#fc-pix', e => e.value);
  await page.click('dialog[open] [data-dlg-b="1"]'); await H.dorme(800);
  const S7 = await srv(), c7 = S7['titulos/cn_2026-10-1_11222333000181/privado/conta'] || {};
  ok('E7 "Anotar o Pix" abre o título na empresa da Bia, já com o Pix da quinzena anterior, e grava só o Pix', /Esperando liberação.*sem Pix.*Anotar o Pix/.test(t7) && pix0 === 'bia.costa@exemplo.com' && c7.pix === 'bia.costa@exemplo.com' && !c7.banco && S7['titulos/cn_2026-10-1_11222333000181'].conta.ok === true, JSON.stringify({ t7: t7.slice(0, 300), pix0, c7 }));
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('__srv')); s.docs['titulos/cn_2026-10-1_11222333000181'].status = 'liberado'; s.docs['titulos/cn_2026-10-1_11222333000181'].liberacao = { uid: 'uIASMYN', nome: 'Iasmyn' }; localStorage.setItem('__srv', JSON.stringify(s)); });
  await page.click('#em-volta'); await page.waitForSelector('#em-tab2', { timeout: 10000 }); await H.dorme(400);
  const t8 = await page.$eval('#em-tab2', e => e.innerText.replace(/\s+/g, ' '));
  await page.click('[data-em-pagar="cn_2026-10-1_11222333000181"]'); await page.waitForSelector('#tt-dados', { timeout: 10000 }); await H.dorme(400);
  const v8 = await page.evaluate(() => ({ pix: (document.getElementById('tt-pix') || {}).innerText || '', agendar: !!document.getElementById('tt-agendar') || /Agendar/.test(document.body.innerText) }));
  ok('E8 com o pagamento liberado, a lista mostra o Pix e "Pagar"; "Pagar" abre o título da Nexo com o Pix para pagar', /Liberado para pagar.*Pix: bia\.costa@exemplo\.com.*Pagar/.test(t8) && v8.pix === 'bia.costa@exemplo.com' && v8.agendar, JSON.stringify({ t8: t8.slice(0, 300), v8 }));
  // E9 "Apagar (dados de teste)" (só a equipe Conectwork): apaga a medição, os espelhos dos MEIs, os títulos e os arquivos
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('__srv')); s.docs['espelhos/cn_2026-10-1_11222333000181'].medicaoId = 'cn_2026-10-2';
    s.docs['espelhos/cn_2026-10-1_11222333000181'].nota = { envio: 'ab1', partes: 1, chaveUnica: '9'.repeat(50) }; s.docs['espelhos/cn_2026-10-1_11222333000181/arquivos/ab1-0'] = { d: 'x' }; s.docs['notaschave/' + '9'.repeat(50)] = { espelhoId: 'cn_2026-10-1_11222333000181' };
    localStorage.setItem('__srv', JSON.stringify(s)); });
  const semBt = true;   /* quem não é da equipe Conectwork não vê o botão (ver teste-medicoes) */
  await entrarComo('iasmyn@conectwork.com.br'); await escolher('Nexo'); await page.evaluate(() => { location.hash = '#medicoes/ver/cn_2026-10-2'; }); await page.waitForSelector('#md-apagar', { timeout: 8000 });
  await page.click('#md-apagar'); await page.waitForSelector('dialog[open]'); const t9 = await page.$eval('dialog[open]', e => e.innerText); await page.click('dialog[open] [data-dlg-b="1"]'); await H.dorme(1500);
  const S9 = await srv(), sobrou = Object.keys(S9).filter(k => /cn_2026-10-2|cn_2026-10-1_11222333000181|^notaschave\//.test(k));
  ok('E9 "Apagar (dados de teste)": só a equipe vê; apaga a medição, os espelhos que saíram dela (com o arquivo da nota e a chave), os títulos, e o histórico registra', semBt && /3 espelhos/.test(t9) && /1 título/.test(t9) && !sobrou.length && Object.values(S9).some(x => x.acao === 'teste.apagar') && !!S9['espelhos/cn_2026-10-2_33000167000101'] === false, JSON.stringify({ semBt, t9: t9.slice(0, 200), sobrou }));
  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
