/* Teste do Painel da cidade e do selo "Prestador em dia" (10/11/2026, piloto com a Prefeitura): a equipe Conectwork vê os
   números juntados dos MEIs de uma cidade (sem nome nem CNPJ), ramos pequenos vão para "Outros", baixa o PDF; o MEI em dia
   vê o selo no Início e no Check-up, e o MEI com DAS vencido não vê. Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('painelcidade');

const pad = n => String(n).padStart(2, '0');
const hoje = new Date(), ANO = hoje.getFullYear(), MES = `${ANO}-${pad(hoje.getMonth() + 1)}`, HOJE = `${MES}-${pad(hoje.getDate())}`;
/* meses de janeiro até o mês atual; o DAS do mês m vence dia 20 do mês seguinte */
const meses = []; for (let i = 1; i <= hoje.getMonth() + 1; i++) meses.push(`${ANO}-${pad(i)}`);
const venc = m => { const d = new Date(+m.slice(0, 4), +m.slice(5, 7), 20); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-20`; };
const devidos = meses.filter(m => venc(m) < HOJE);   /* os que já venceram */
const pago = (m, data) => ({ pago: true, data: data || venc(m).slice(0, 8) + '10' });
const tudoPago = () => Object.fromEntries(devidos.map(m => [m, pago(m)]));

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    const mei = (id, cidade, ramo, das, extra) => {
      d.docs['empresas/' + id] = Object.assign({ nome: 'MEI ' + id, cnpj: '', status: 'mei', tipo: 'prestador', modulos: [], cidade, uf: 'RS', criadoPor: 'u' + id, criadoEm: `${ANO}-01-10T12:00:00Z` }, extra || {});
      d.docs['empresas/' + id + '/privado/cadastro'] = { dados: { porte: 'MEI', segmento: ramo, abertura: `${ANO}-01-05` } };
      d.docs['fiscal/' + id] = { das, dasn: {} };
    };
    mei('m1', 'Gravataí', 'Serviços', tudoPago(), { status: 'aprovado' });
    mei('m2', 'GRAVATAI', 'Serviços', tudoPago());
    mei('m3', 'Gravataí', 'Serviços', tudoPago());
    const quase = tudoPago(); delete quase[devidos[0]]; delete quase[devidos[1]]; mei('m4', 'Gravataí', 'Serviços', quase);
    const atrasado = tudoPago(); atrasado[devidos[0]] = pago(devidos[0], HOJE); mei('m5', 'Gravataí', 'Serviços', atrasado);
    mei('m6', 'Gravataí', 'Beleza', {});
    mei('poa', 'Porto Alegre', 'Serviços', {});
    d.docs['empresas/me1'] = { nome: 'Empresa ME', status: 'aprovado', tipo: 'prestador', modulos: [], cidade: 'Gravataí', criadoPor: 'uX', criadoEm: `${ANO}-01-10T12:00:00Z` };
    d.docs['empresas/me1/privado/cadastro'] = { dados: { porte: 'ME' } };
    d.docs['espelhos/n1'] = { origem: 'repasse', tomadorId: 'nexo', prestadorId: 'm1', partes: ['nexo', 'm1'], valorCentavos: 350000, status: 'nota_enviada', nota: { enviadoEm: `${HOJE}T13:00:00Z`, numero: '7' } };
    d.docs['espelhos/n2'] = { origem: 'repasse', tomadorId: 'nexo', prestadorId: 'poa', partes: ['nexo', 'poa'], valorCentavos: 990000, status: 'nota_enviada', nota: { enviadoEm: `${HOJE}T13:00:00Z`, numero: '8' } };
    const pessoa = (uid, email, emp) => { d.users[email] = { uid, pass: 'senha123' }; d.docs['usuarios/' + uid] = { nome: 'Pessoa ' + emp, email }; d.docs[`acessos/${emp}_${uid}`] = { uid, empresaId: emp, nome: 'Pessoa ' + emp, email, cargo: 'admin', extras: [], sem: [], ativo: true }; };
    pessoa('uM1', 'm1@m1.com.br', 'm1'); pessoa('uM6', 'm6@m6.com.br', 'm6');
  });
  const entrarComo = async email => { if (await page.$('#sair')) await page.click('#sair'); await page.waitForSelector('#lg-email'); await H.entrar(page, email, 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 }); await H.dorme(800); };
  await H.preparar(page, d); await page.goto(H.BASE);

  // P1 a equipe Conectwork abre o Painel da cidade: números de Gravataí (6 MEIs; a ME e Porto Alegre não entram)
  await entrarComo('iasmyn@conectwork.com.br');
  const menu = await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod));
  await page.evaluate(() => { location.hash = '#painelcidade'; }); await page.waitForSelector('#pc-nums', { timeout: 10000 });
  const p1 = await page.evaluate(() => Object.fromEntries(['pc-total', 'pc-selo', 'pc-venc', 'pc-pagos', 'pc-notas', 'pc-rede'].map(id => [id, document.getElementById(id).innerText.replace(/\s+/g, ' ')])));
  ok('P1 Painel da cidade no menu da equipe; Gravataí: 6 MEIs (sem a ME e sem Porto Alegre), 4 em dia (67%), 2 com DAS vencido, 1 atrasado regularizado no mês, 1 nota de R$ 3.500, 1 na rede',
    menu.includes('painelcidade') && / 6 /.test(' ' + p1['pc-total'] + ' ') && /67%/.test(p1['pc-selo']) && /4 de 6/.test(p1['pc-selo']) && /Com DAS vencido 2/.test(p1['pc-venc'])
    && /1 estava atrasado/.test(p1['pc-pagos']) && /Notas fiscais pelo Conectwork 1/.test(p1['pc-notas']) && /3\.500/.test(p1['pc-notas']) && /rede 1/.test(p1['pc-rede']), JSON.stringify(p1));

  // P2 sem identificar ninguém: ramos com menos de 5 vão para "Outros"; sem nomes nem CNPJ na tela
  const p2 = await page.evaluate(() => ({ ramos: document.getElementById('pc-ramos').innerText, tudo: document.getElementById('view').innerText }));
  ok('P2 por ramo: Serviços 5 e "Outros" com o ramo de 1 só; nenhum nome de MEI na tela', /Serviços\s*5/.test(p2.ramos) && /Outros[^\n]*\s*1/.test(p2.ramos) && !/Beleza/.test(p2.ramos) && !/MEI m1|MEI m6/.test(p2.tudo), p2.ramos);

  // P3 outra cidade: Porto Alegre tem só 1 MEI → aviso de "poucos" para não mandar
  await page.selectOption('#pc-cidade', 'Porto Alegre'); await page.waitForSelector('#pc-poucos', { timeout: 6000 });
  const p3 = await page.$eval('#pc-total', e => e.innerText);
  ok('P3 Porto Alegre: 1 MEI e o aviso de que com menos de 5 os números podem identificar alguém', / 1\b/.test(' ' + p3.replace(/\s+/g, ' ')), p3);

  // P4 PDF do relatório (só números juntados) e histórico
  await page.selectOption('#pc-cidade', 'Gravataí'); await page.waitForSelector('#pc-nums');
  await page.evaluate(() => { window.__pdfTxt = []; window.jspdf = { jsPDF: function () { return { setFont() {}, setFontSize() {}, splitTextToSize: t => [t], text: t => window.__pdfTxt.push(t), addPage() {}, save: n => { window.__pdfNome = n; } }; } }; });
  await page.click('#pc-pdf'); await H.dorme(800);
  const p4 = await page.evaluate(() => ({ nome: window.__pdfNome, txt: window.__pdfTxt.join(' | '), log: Object.values(JSON.parse(localStorage.getItem('__srv')).docs).some(x => x.acao === 'painel.cidade') }));
  ok('P4 baixa o PDF da cidade com os números e o aviso de LGPD, sem nome de MEI, e grava no histórico', /Conectwork-gravatai-\d{4}-\d{2}\.pdf/.test(p4.nome || '') && /MEIs de Gravataí/.test(p4.txt) && /Prestadores em dia \(selo\): 67%/.test(p4.txt) && /LGPD/.test(p4.txt) && !/MEI m1/.test(p4.txt) && p4.log, JSON.stringify(p4).slice(0, 400));

  // P5 o MEI em dia vê o selo no Início e no Check-up
  await entrarComo('m1@m1.com.br');
  await page.waitForFunction(() => { const s = document.getElementById('mh-selo'); return s && !s.hidden; }, null, { timeout: 8000 }).catch(() => {});
  const s1 = await page.evaluate(() => { const s = document.getElementById('mh-selo'); return !!s && !s.hidden; });
  await page.evaluate(() => { location.hash = '#mei/checkup'; }); await page.waitForSelector('#ck-res', { timeout: 8000 });
  const s1c = await page.evaluate(() => !!document.getElementById('ck-selo'));
  ok('P5 MEI com DAS em dia: selo "Prestador em dia" no Início e no Check-up', s1 && s1c, JSON.stringify({ s1, s1c }));

  // P6 o MEI com DAS vencido não vê o selo
  await entrarComo('m6@m6.com.br'); await page.waitForSelector('#mh-alerta:not([hidden])', { timeout: 8000 }).catch(() => {});
  const s6 = await page.evaluate(() => { const s = document.getElementById('mh-selo'); return !!s && !s.hidden; });
  ok('P6 MEI com DAS vencido: sem o selo', !s6, String(s6));

  // P7 celular: o painel cabe sem rolar para o lado
  await entrarComo('iasmyn@conectwork.com.br'); await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { location.hash = '#painelcidade'; }); await page.waitForSelector('#pc-nums', { timeout: 10000 });
  ok('P7 celular: o Painel da cidade cabe sem rolar para o lado', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));

  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
