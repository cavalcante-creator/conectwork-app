/* Teste de "Meu negócio" (área do profissional PJ/MEI): limite do MEI, de quem vem o faturamento (dependência de um
   cliente), faturamento e clientes fora do Conectwork (privados), mostrar só o número de clientes, e o dossiê do contrato
   por entrega com as OS e esse número. Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('negocio');
const ANO = new Date().getFullYear(), MES = String(new Date().getMonth() + 1).padStart(2, '0');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    delete d.docs['acessos/beta_uBRUNO'];
    Object.assign(d.docs['empresas/alfa'], { modulos: ['equipe', 'cobrancas', 'contratos'], cnpj: '11.444.777/0001-61', tipo: 'contratante' });
    d.users['lia@lia.com.br'] = { uid: 'uLIA', pass: 'senha123' }; d.docs['usuarios/uLIA'] = { nome: 'Lia Lima', email: 'lia@lia.com.br' };
    d.docs['acessos/lia_uLIA'] = { uid: 'uLIA', empresaId: 'lia', nome: 'Lia Lima', email: 'lia@lia.com.br', cargo: 'admin', extras: [], sem: [], ativo: true };
    d.docs['empresas/lia'] = { nome: 'Lia Lima Elétrica', cnpj: '33.000.167/0001-01', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas'], criadoPor: 'uLIA' };
    d.docs['empresas/lia/privado/cadastro'] = { dados: { porte: 'MEI', regime: 'MEI (SIMEI)' } };
    const base = { tomadorId: 'alfa', prestadorId: 'lia', partes: ['alfa', 'lia'], tomadorNome: 'Alfa Serviços', prestadorNome: 'Lia Lima Elétrica', contratoId: 'co' };
    d.docs['contratos/co'] = Object.assign({ modalidade: 'os', periodicidade: '', objeto: 'Manutenção elétrica por OS.', vencimentoDias: 1, inicio: `${ANO}-01-01`, status: 'ativo', assinaturas: { tomador: {}, prestador: {} }, interlocutor: null, proposta: null,
      triagem: { r: { entrega: 'sim', supervisor: 'sim', ordens: 'nao', jornada: 'nao', exclusiv: 'nao', exempregado: 'nao', socio: 'nao' }, resultado: 'compativel', parecer: null, uid: 'uANA', nome: 'Ana Souza', em: `${ANO}-01-01T12:00:00.000Z` } }, base);
    const esp = (id, tom, nome, v) => { d.docs['espelhos/' + id] = Object.assign({}, base, { tomadorId: tom, tomadorNome: nome, medicaoId: id, origem: 'os', periodo: `${ANO}-${MES}`, competencia: `${ANO}-${MES}`, valorCentavos: v, liquidoCentavos: v, status: 'nota_ok', nota: { numero: id } }); };
    esp('e1', 'alfa', 'Alfa Serviços', 6000000); esp('e2', 'gama', 'Gama Logística', 600000);
    d.docs['ordens/o1'] = Object.assign({ numero: 1, titulo: 'Revisão do quadro elétrico', escopo: 'x', prazo: `${ANO}-12-20`, valorCentavos: 300000, status: 'aceita', entregas: [], criadoPor: 'uSOL' }, base);
    d.docs['ordens/o2'] = Object.assign({ numero: 2, titulo: 'Troca de iluminação', escopo: 'x', prazo: `${ANO}-12-22`, valorCentavos: 450000, status: 'recusada', recusa: { motivo: '' }, entregas: [], criadoPor: 'uSOL' }, base);
    d.docs['titulos/e1'] = Object.assign({ espelhoId: 'e1', periodo: `${ANO}-${MES}`, liquidoCentavos: 6000000, vencimentoDias: 1, base: new Date().toISOString(), status: 'liberado' }, base);
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  const entrarComo = async email => { if (await page.$('#sair')) await page.click('#sair'); await page.waitForSelector('#lg-email'); await H.entrar(page, email, 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 }); };
  await H.preparar(page, d); await page.goto(H.BASE);

  // N1 MEI: barra do limite e aviso de perto do limite (R$ 66.000 de R$ 81.000)
  await entrarComo('lia@lia.com.br');
  const menu = await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod));
  await page.evaluate(() => { location.hash = '#negocio'; }); await page.waitForSelector('#ng-mei', { timeout: 8000 });
  const mei = await page.$eval('#ng-mei', e => e.innerText);
  ok('N1 o profissional MEI vê "Meu negócio" com o limite do ano e o aviso de que está perto (81%)', menu.includes('negocio') && /R\$ 66\.000,00 de R\$ 81\.000,00/.test(mei) && /Perto do limite do MEI/.test(mei) && /81%/.test(mei), mei.slice(0, 160));

  // N2 de quem vem o faturamento: 91% de um cliente
  const dep = await page.$eval('#ng-dep', e => e.innerText);
  ok('N2 mostra que 91% do faturamento vem de um só cliente e explica por que isso importa', /91% do seu faturamento vem de Alfa Serviços/.test(dep) && /negócio independente/.test(dep), dep.slice(0, 120));

  // N3 faturamento fora do Conectwork entra no ano e dilui a concentração
  await page.fill(`[data-mes="${MES}"]`, ''); await page.type(`[data-mes="${MES}"]`, '1500000'); await page.click('#ng-salvar-fora'); await page.waitForSelector('#ng-mei', { timeout: 8000 }); await H.dorme(400);
  const mei3 = await page.$eval('#ng-mei', e => e.innerText), cli3 = await page.$eval('#ng-clientes', e => e.innerText);
  const fat = (await srv())['faturamento/lia'];
  ok('N3 o faturamento fora do Conectwork soma no ano (passa do limite) e aparece entre os clientes', fat && fat.anos[ANO][MES] === 1500000 && /Você passou do limite do MEI/.test(mei3) && /Fora do Conectwork/.test(cli3), JSON.stringify(fat && fat.anos));

  // N4 outros clientes privados; compartilhar só o número
  await page.fill('#ng-cli-n', 'Padaria do Bairro'); await page.fill('#ng-cli-d', `${ANO}-03`); await page.click('#ng-cli-add'); await page.waitForSelector('[data-tirar="0"]', { timeout: 8000 }); await H.dorme(400);
  await page.check('#ng-comp'); await H.dorme(600);
  const db4 = await srv(), ind = db4['independencia/lia'];
  ok('N4 o cliente de fora fica privado; ao marcar, as empresas que contratam veem só o número de clientes (3)', db4['faturamento/lia'].clientes[0].nome === 'Padaria do Bairro' && ind && ind.compartilhar === true && ind.nClientes === 3 && !('clientes' in ind), JSON.stringify(ind));

  // N5 OS em aberto e a receber
  const os = await page.$eval('#ng-os', e => e.innerText), rec = await page.$eval('#ng-receber', e => e.innerText);
  ok('N5 mostra as OS em aberto e o que tem a receber', /OS 1 · Revisão do quadro elétrico/.test(os) && !/Troca de iluminação/.test(os) && /R\$ 60\.000,00/.test(rec), os.slice(0, 100));

  // N6 o dossiê do contrato por entrega (visto por quem contrata) tem as OS, a recusa livre e o número de clientes
  await entrarComo('ana@alfa.com.br');
  await page.evaluate(() => { location.hash = '#contratos/dossie/co'; }); await page.waitForSelector('#ds-os', { timeout: 8000 });
  const fav = await page.$eval('#ds-favor', e => e.innerText), tos = await page.$eval('#ds-os', e => e.innerText);
  ok('N6 o dossiê do contrato por entrega mostra as OS, que o profissional recusou uma sem consequência e que atende 3 clientes',
    /2 ordem\(ns\) de serviço/.test(fav) && /recusou 1 OS, sem nenhuma consequência/.test(fav) && /atender 3 cliente/.test(fav) && /Recusada pelo profissional/.test(tos), fav.slice(0, 300));

  // N7 celular
  await entrarComo('lia@lia.com.br'); await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { location.hash = '#negocio'; }); await page.waitForSelector('#ng-mei'); await H.dorme(300);
  ok('N7 celular: Meu negócio sem rolagem para o lado', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));

  ok('Sem erros de JavaScript na página', !erros.length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
