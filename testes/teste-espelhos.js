/* Teste de tela do espelho da nota (Etapa 2, parte 4): o financeiro do tomador vê a medição aprovada em "Espelhos para
   preparar", confere os dados do tomador, informa retenções (líquido calculado), o vencimento vem do contrato; a prestadora
   vê em "Notas a emitir" com os botões de copiar; correção sobe a versão e grava no histórico. Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('espelhos');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    Object.assign(d.docs['empresas/alfa'], { modulos: ['equipe', 'cobrancas'], cnpj: '11.444.777/0001-61', razao: 'Alfa Serviços Ltda', tipo: 'contratante' });
    delete d.docs['acessos/beta_uBRUNO'];
    d.docs['empresas/alfa/privado/cadastro'] = { dados: { im: '12345' }, end: { logradouro: 'Rua das Flores', numero: '100', bairro: 'Centro', cep: '94000-000', cidade: 'Gravataí', uf: 'RS' } };
    const pessoa = (uid, email, nome, emp, cargo) => { d.users[email] = { uid, pass: 'senha123' }; d.docs['usuarios/' + uid] = { nome, email }; d.docs[`acessos/${emp}_${uid}`] = { uid, empresaId: emp, nome, email, cargo, extras: [], sem: [], ativo: true }; };
    pessoa('uRITA', 'rita@alfa.com.br', 'Rita Prado', 'alfa', 'rh');
    pessoa('uZECA', 'zeca@zeta.com.br', 'Zeca Moura', 'zeta', 'admin');
    d.docs['empresas/zeta'] = { nome: 'Zeta Manutenção', cnpj: '04.252.011/0001-10', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas'], criadoPor: 'uZECA' };
    d.docs['contratos/cz'] = { modalidade: 'continua', tomadorId: 'alfa', prestadorId: 'zeta', partes: ['alfa', 'zeta'], tomadorNome: 'Alfa Serviços', tomadorCnpj: '11.444.777/0001-61', prestadorNome: 'Zeta Manutenção', prestadorCnpj: '04.252.011/0001-10',
      objeto: 'Equipe de manutenção industrial.', periodicidade: 'quinzena', vencimentoDias: 1, inicio: '2026-01-01', fim: '', status: 'ativo', assinaturas: {}, interlocutor: null, proposta: null };
    d.docs['medicoes/cz_2026-10-2'] = { contratoId: 'cz', tomadorId: 'alfa', prestadorId: 'zeta', partes: ['alfa', 'zeta'], tomadorNome: 'Alfa Serviços', prestadorNome: 'Zeta Manutenção', periodicidade: 'quinzena', periodo: '2026-10-2',
      valorCentavos: 712050, memoria: [{ nome: 'Pedro Lima', horas: 96.8, valorCentavos: 352000 }, { nome: 'Joana Dias', horas: 99, valorCentavos: 360050 }], obs: '', origem: 'integracao', ref: '2026-10-2:ZETA',
      status: 'aprovada', divergencia: null, confirmacao: { uid: 'uZECA', nome: 'Zeca Moura' }, aprovacao: { uid: 'uALDO', nome: 'Aldo Reis' }, criadoPor: 'uRITA', criadoPorNome: 'Rita Prado' };
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  const esp = async () => (await srv())['espelhos/cz_2026-10-2'];
  const logs = async a => Object.values(await srv()).filter(x => x.acao === a);
  const entrarComo = async email => { if (await page.$('#sair')) await page.click('#sair'); await page.waitForSelector('#lg-email'); await H.entrar(page, email, 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 }); };
  const valor = async (sel, v) => { await page.fill(sel, ''); await page.type(sel, v); };

  // E1 RH não vê espelhos; a medição aprovada mostra "o financeiro prepara"
  await H.preparar(page, d); await page.goto(H.BASE);
  await entrarComo('rita@alfa.com.br');
  const menuRita = await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod));
  await page.evaluate(() => { location.hash = '#medicoes/ver/cz_2026-10-2'; }); await page.waitForSelector('#md-espelho', { timeout: 8000 }); await H.dorme(400);
  const blocoRita = await page.$eval('#md-espelho', e => e.innerText);
  ok('E1 o RH não vê "Espelhos" no menu; na medição aprovada aparece que o financeiro prepara', !menuRita.includes('espelhos') && /financeiro/.test(blocoRita) && !(await page.$('#md-espelho-prep')), JSON.stringify({ menuRita, blocoRita }));

  // E2 financeiro: "Espelhos para preparar", dados do tomador e descrição sugerida
  await entrarComo('bruno@alfa.com.br');
  const menuB = await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod));
  await page.evaluate(() => { location.hash = '#espelhos'; }); await page.waitForSelector('#es-preparar', { timeout: 8000 });
  await page.click('[data-preparar="cz_2026-10-2"]'); await page.waitForSelector('#es-form', { timeout: 8000 });
  const tela = await page.evaluate(() => ({ tom: document.getElementById('es-tomador').innerText, desc: document.getElementById('es-desc').value, venc: document.getElementById('es-venc').innerText, liq: document.getElementById('es-liq').innerText }));
  ok('E2 financeiro: medição aprovada em "Espelhos para preparar"; dados do tomador vêm do cadastro; descrição sugerida; vencimento do contrato',
    menuB.includes('espelhos') && /Alfa Serviços Ltda/.test(tela.tom) && /11\.444\.777\/0001-61/.test(tela.tom) && /12345/.test(tela.tom) && /Rua das Flores, 100/.test(tela.tom) && /Gravataí\/RS/.test(tela.tom)
    && /manutenção industrial/.test(tela.desc) && /2ª quinzena/.test(tela.desc) && /1 dia depois da nota válida/.test(tela.venc) && tela.liq === 'R$ 7.120,50', JSON.stringify(tela));

  // E3 retenções maiores que o valor são barradas; líquido calculado
  await valor('#es-r-iss', '800000'); await page.click('#es-salvar'); await H.dorme(200);
  const e3 = await page.$eval('#es-erro', e => e.innerText);
  await valor('#es-r-iss', '35603'); await valor('#es-r-ir', '10681');
  const liq = await page.$eval('#es-liq', e => e.innerText);
  ok('E3 retenções acima do valor são barradas; o líquido é calculado na hora', /somam mais/.test(e3) && liq === 'R$ 6.657,66', JSON.stringify({ e3, liq }));

  // E4 enviar: grava o espelho com o valor da medição, o vencimento do contrato e o histórico
  await page.click('#es-salvar'); await page.waitForSelector('#es-valores', { timeout: 8000 });
  let e = await esp();
  ok('E4 enviar grava o espelho (valor da medição, retenções, líquido, vencimento do contrato) e o histórico',
    e && e.status === 'aguardando_nota' && e.valorCentavos === 712050 && e.retencoes.iss === 35603 && e.retencoes.ir === 10681 && e.retencoes.inss === 0 && e.liquidoCentavos === 665766
    && e.vencimentoDias === 1 && e.competencia === '2026-10' && e.tomador.cnpj === '11.444.777/0001-61' && e.versao === 1 && (await logs('espelho.preparar')).length === 1, JSON.stringify(e));

  // E5 correção: sobe a versão e grava no histórico
  await page.click('#es-corrigir'); await page.waitForSelector('#es-form'); await valor('#es-r-ir', ''); await page.click('#es-salvar'); await page.waitForSelector('#es-valores', { timeout: 8000 });
  e = await esp();
  ok('E5 o financeiro corrige antes da nota: versão 2 e registro no histórico', e.versao === 2 && e.retencoes.ir === 0 && e.liquidoCentavos === 676447 && (await logs('espelho.corrigir')).length === 1, JSON.stringify({ v: e.versao, liq: e.liquidoCentavos }));

  // E6 a medição aprovada agora leva ao espelho
  await page.evaluate(() => { location.hash = '#medicoes/ver/cz_2026-10-2'; }); await page.waitForSelector('#md-espelho-ver', { timeout: 8000 });
  ok('E6 na medição aprovada aparece "Ver o espelho da nota"', true);

  // E7 prestadora: "Notas a emitir" com o aviso, dados e copiar
  await entrarComo('zeca@zeta.com.br');
  await page.evaluate(() => { location.hash = '#espelhos'; }); await page.waitForSelector('#es-emitir', { timeout: 8000 });
  const emitir = await page.$eval('#es-emitir', x => x.innerText);
  await page.click('#es-tab-emitir tbody tr'); await page.waitForSelector('#es-aviso', { timeout: 8000 });
  await page.evaluate(() => { window.__cop = []; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__cop.push(t); return Promise.resolve(); } } }); });
  await page.click('[data-copiar="cnpj"]'); await page.click('[data-copiar="desc"]'); await H.dorme(200);
  const ver = await page.evaluate(() => ({ aviso: document.getElementById('es-aviso').innerText, cop: window.__cop, corrigir: !!document.getElementById('es-corrigir'), liq: document.getElementById('es-liq').innerText }));
  ok('E7 prestadora: "Serviço aprovado: confira os dados e envie sua nota fiscal"; copia CNPJ (só números) e descrição; não corrige',
    /Serviço aprovado/.test(emitir) && /Serviço aprovado/.test(ver.aviso) && ver.cop[0] === '11444777000161' && /manutenção industrial/.test(ver.cop[1]) && !ver.corrigir && ver.liq === 'R$ 6.764,47', JSON.stringify(ver));

  // E8 celular: espelho sem rolagem para o lado
  await page.setViewportSize({ width: 390, height: 844 }); await H.dorme(300);
  const lado = await page.evaluate(() => { const w = innerWidth; return Array.from(document.querySelectorAll('#view *')).filter(e => e.getBoundingClientRect().right > w + 1).slice(0, 3).map(e => e.tagName + '.' + e.className); });
  ok('E8 celular: espelho sem rolagem para o lado', !lado.length && !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), JSON.stringify(lado));

  ok('Sem erros de JavaScript na página', !erros.length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
