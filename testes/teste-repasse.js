/* Teste das notas dos profissionais MEI (repasse, 10/11/2026): a medição aprovada da prestadora traz o CNPJ do MEI de cada
   pessoa; o dono da prestadora prepara a nota de cada MEI pela linha dele (com o prazo que escolher); quem ainda não tem conta
   recebe o convite; o MEI vê em "Notas a emitir" e abre o emissor. Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('repasse');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    const pessoa = (uid, email, nome, emp, cargo) => { d.users[email] = { uid, pass: 'senha123' }; d.docs['usuarios/' + uid] = { nome, email }; d.docs[`acessos/${emp}_${uid}`] = { uid, empresaId: emp, nome, email, cargo, extras: [], sem: [], ativo: true }; };
    pessoa('uDONO', 'dono@nexo.com.br', 'Davi Nunes', 'nexo', 'admin');
    pessoa('uJU', 'ju@nexo.com.br', 'Julia Prado', 'nexo', 'operacional');
    pessoa('uCARL', 'carl@carl.com.br', 'Carlos Ramos', 'meic', 'admin');
    d.docs['empresas/col'] = { nome: 'Colina Indústria', status: 'aprovado', tipo: 'contratante', modulos: ['cobrancas'], criadoPor: 'uX' };
    d.docs['empresas/nexo'] = { nome: 'Nexo Serviços', razao: 'Nexo Serviços Ltda', cnpj: '04.252.011/0001-10', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas'], criadoPor: 'uDONO' };
    d.docs['empresas/nexo/privado/cadastro'] = { dados: { im: '777' }, end: { logradouro: 'Rua Um', numero: '10', bairro: 'Centro', cep: '94000-000', cidade: 'Gravataí', uf: 'RS' } };
    d.docs['empresas/meic'] = { nome: 'Carlos Ramos Elétrica', razao: 'Carlos Ramos 33000167000101', cnpj: '33.000.167/0001-01', status: 'mei', tipo: 'prestador', modulos: [], criadoPor: 'uCARL' };
    d.docs['empresas/meic/privado/cadastro'] = { dados: { porte: 'MEI', atividade: 'Eletricista' } };
    d.docs['cnpjs/33000167000101'] = { empresaId: 'meic' };
    d.docs['contratos/cn'] = { modalidade: 'continua', tomadorId: 'col', prestadorId: 'nexo', partes: ['col', 'nexo'], tomadorNome: 'Colina Indústria', prestadorNome: 'Nexo Serviços', prestadorCnpj: '04.252.011/0001-10',
      objeto: 'Equipe de manutenção.', periodicidade: 'quinzena', vencimentoDias: 3, inicio: '2026-01-01', fim: '', status: 'ativo', assinaturas: {}, interlocutor: null, proposta: null };
    d.docs['medicoes/cn_2026-10-2'] = { contratoId: 'cn', tomadorId: 'col', prestadorId: 'nexo', partes: ['col', 'nexo'], tomadorNome: 'Colina Indústria', prestadorNome: 'Nexo Serviços', periodicidade: 'quinzena', periodo: '2026-10-2',
      valorCentavos: 800000, memoria: [{ nome: 'Carlos Ramos', horas: 96.8, valorCentavos: 350000, cnpj: '33000167000101' }, { nome: 'Bia Costa', horas: 90, valorCentavos: 300000, cnpj: '11222333000181' }, { nome: 'Leo Dias', horas: 40, valorCentavos: 150000 }],
      obs: '', origem: 'integracao', ref: 'painel-rh:2026-10-2:NEXO', status: 'aprovada', divergencia: null, confirmacao: { uid: 'uDONO', nome: 'Davi Nunes' }, aprovacao: { uid: 'uALDO', nome: 'Aldo Reis' }, criadoPor: 'uRH', criadoPorNome: 'Rita' };
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  const RID = 'espelhos/cn_2026-10-2_33000167000101';
  const entrarComo = async email => { if (await page.$('#sair')) await page.click('#sair'); await page.waitForSelector('#lg-email'); await H.entrar(page, email, 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 }); await H.dorme(800); };

  // R1 o dono da prestadora: "Preparar as notas dos profissionais MEI" no Precisa de você e o botão na medição aprovada
  await H.preparar(page, d); await page.goto(H.BASE);
  await entrarComo('dono@nexo.com.br');
  await page.evaluate(() => { location.hash = '#inicio'; }); await H.dorme(1500);
  const pv = await page.evaluate(() => document.body.textContent);
  await page.evaluate(() => { location.hash = '#medicoes/ver/cn_2026-10-2'; }); await page.waitForSelector('#md-repasse', { timeout: 8000 });
  await page.click('#md-repasse'); await page.waitForSelector('#rp-tab-its', { timeout: 8000 }); await H.dorme(300);
  const r1 = await page.evaluate(() => ({ linhas: Array.from(document.querySelectorAll('#rp-tab-its tbody tr')).map(t => t.innerText.replace(/\s+/g, ' ')), venc: (document.getElementById('rp-venc') || {}).value, sem: document.querySelector('#rp-its').innerText }));
  ok('R1 o dono da prestadora vê "Preparar as notas dos profissionais MEI"; na medição: Carlos pronto, Bia sem conta (com convite), Leo sem CNPJ; prazo padrão = o do contrato',
    /Preparar as notas dos profissionais MEI/.test(pv) && r1.linhas.length === 2 && /Carlos Ramos.*33\.000\.167\/0001-01.*96,8 h.*R\$ 3\.500,00.*Pronto para preparar/.test(r1.linhas[0])
    && /Bia Costa.*Ainda sem conta.*Copiar convite/.test(r1.linhas[1]) && /Leo Dias/.test(r1.sem) && r1.venc === '3', JSON.stringify(r1));

  // R2 convite para quem não tem conta
  await page.evaluate(() => { window.__cp = null; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__cp = t; return Promise.resolve(); } } }); });
  await page.click('[data-conv="1"]'); await H.dorme(200);
  const conv = await page.evaluate(() => window.__cp || '');
  ok('R2 "Copiar convite": Sou MEI, o CNPJ e o valor da nota de Bia', /Olá, Bia!/.test(conv) && /Sou MEI/.test(conv) && /11\.222\.333\/0001-81/.test(conv) && /R\$ 3\.000,00/.test(conv), conv);

  // R3 preparar: espelho do Carlos (tomador = a prestadora, valor da linha, prazo escolhido) e histórico
  await page.fill('#rp-venc', '5'); await page.click('#rp-preparar'); await H.dorme(1500);
  const S3 = await srv(), e = S3[RID];
  ok('R3 prepara a nota do Carlos: tomador = a prestadora (razão, CNPJ, endereço), prestador = o MEI, valor da linha, prazo de 5 dias, sem retenções, e o histórico',
    e && e.origem === 'repasse' && e.tomadorId === 'nexo' && e.prestadorId === 'meic' && e.valorCentavos === 350000 && e.liquidoCentavos === 350000 && e.vencimentoDias === 5 && e.contratoId === null
    && e.tomador.razao === 'Nexo Serviços Ltda' && e.tomador.cnpj === '04.252.011/0001-10' && /Rua Um, 10/.test(e.tomador.endereco) && e.prestadorCnpj === '33.000.167/0001-01' && e.item === 0 && /96,8 horas/.test(e.descricao)
    && !S3['espelhos/cn_2026-10-2_11222333000181'] && Object.values(S3).some(x => x.acao === 'espelho.repasse' && /Carlos Ramos/.test(x.texto)), JSON.stringify(e));
  const r3 = await page.evaluate(() => document.querySelector('#rp-tab-its tbody tr').innerText);
  ok('R3b depois de preparar, a linha mostra "Esperando a nota"', /Esperando a nota/.test(r3), r3);

  // R4 o Carlos (MEI do cadastro rápido) vê "Notas a emitir" com a nota para a prestadora
  await entrarComo('carl@carl.com.br');
  const menu = await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod));
  await page.evaluate(() => { location.hash = '#espelhos'; }); await page.waitForSelector('#es-emitir', { timeout: 8000 });
  const lista = await page.$eval('#es-emitir', x => x.innerText);
  await page.click('#es-tab-emitir [data-abrir]'); await page.waitForSelector('#es-tom', { timeout: 8000 }); await H.dorme(400);
  const ver = await page.evaluate(() => ({ tom: document.getElementById('es-tom').innerText, nota: document.getElementById('es-nota').innerText, and: document.getElementById('es-andamento').innerText, val: document.getElementById('es-valores').innerText, emitir: !!document.getElementById('es-emitir-bt'), linkMed: !!document.querySelector('#es-andamento a[href^="#medicoes"]') }));
  ok('R4 o MEI vê "Notas a emitir" e o espelho: tomador = a prestadora, valor, horas aprovadas, prazo da prestadora e o botão "Emitir a nota"',
    menu.includes('espelhos') && menu.includes('titulos') && /Nexo Serviços/.test(lista) && /Nexo Serviços Ltda/.test(ver.tom) && /04\.252\.011\/0001-10/.test(ver.tom) && /R\$ 3\.500,00/.test(ver.nota)
    && /Horas aprovadas: 96,8 h/.test(ver.and) && /5 dias depois/.test(ver.val) && /direto para você/.test(ver.val) && ver.emitir && !ver.linkMed, JSON.stringify(ver));

  // R5 o MEI abre o emissor: fica registrado
  await page.evaluate(() => { window.open = () => null; }); await page.click('#es-emitir-bt'); await H.dorme(800);
  const e5 = (await srv())[RID];
  ok('R5 "Emitir a nota" registra que o MEI abriu o emissor', e5.emissao && e5.emissao.uid === 'uCARL', JSON.stringify(e5.emissao));

  // R5b o emissor abre numa janela por cima (como o login do Google); fechar a janela já pede a nota
  await page.evaluate(() => { window.__jan = { closed: false, opener: 1, location: {}, focus() {} }; window.open = (u, n, f) => { window.__janArgs = [u, n, f]; return window.__jan; }; });
  await page.click('#es-emitir-bt'); await page.waitForSelector('#es-jan-frente', { timeout: 8000 });
  const r5b = await page.evaluate(() => ({ args: window.__janArgs, href: window.__jan.location.href, opener: window.__jan.opener, txt: document.getElementById('es-voltou').innerText }));
  await page.evaluate(() => { window.__jan.closed = true; }); await page.waitForSelector('dialog[open] #an-arq', { state: 'attached', timeout: 8000 });
  ok('R5b "Emitir a nota" abre o emissor numa janela por cima (sem acesso de volta ao Conectwork) e, ao fechar a janela, pede a nota',
    r5b.args[0] === 'about:blank' && /popup=yes/.test(r5b.args[2]) && /width=/.test(r5b.args[2]) && /nfse\.gov\.br/.test(r5b.href) && r5b.opener === null && /janela por cima/.test(r5b.txt), JSON.stringify(r5b));
  await page.click('dialog[open] [data-dlg-b="0"]').catch(() => {}); await H.dorme(200);

  // R6 celular: a tela das notas dos profissionais cabe sem rolar para o lado
  await entrarComo('dono@nexo.com.br');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { location.hash = '#repasse/ver/cn_2026-10-2'; }); await page.waitForSelector('#rp-tab-its', { timeout: 8000 }); await H.dorme(400);
  ok('R6 celular: as notas dos profissionais cabem sem rolar para o lado', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));

  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
