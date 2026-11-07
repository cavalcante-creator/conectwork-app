/* Teste de tela da nota fiscal no espelho: a prestadora abre o emissor, volta e o app pede a nota; XML que não bate é
   barrado; XML certo vai com a conferência; o financeiro recusa com motivo; a prestadora manda o PDF (lido pelo texto);
   a mesma nota não serve para outro espelho; o financeiro marca a nota conferida. Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('notas');

const CH1 = '4311111111111111111111111111111111111111111111111111'.slice(0, 50), CH2 = '43' + '2'.repeat(48);
const xml = (valor, chave) => `<?xml version="1.0" encoding="UTF-8"?><NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS${chave}"><nNFSe>12</nNFSe>
  <emit><CNPJ>04252011000110</CNPJ><xNome>Zeta Manutencao</xNome></emit><DPS><infDPS><dhEmi>2026-11-03T10:00:00-03:00</dhEmi><dCompet>2026-10-31</dCompet>
  <prest><CNPJ>04252011000110</CNPJ></prest><toma><CNPJ>11444777000161</CNPJ><xNome>Alfa</xNome></toma><serv><cServ><xDescServ>Servicos de manutencao</xDescServ></cServ></serv>
  <valores><vServPrest><vServ>${valor}</vServ></vServPrest></valores></infDPS></DPS></infNFSe></NFSe>`;
const TEXTO_PDF = `DANFSe v1.0 Documento Auxiliar da NFS-e\nChave de Acesso da NFS-e ${CH2}\nNúmero da NFS-e 13 Competência da NFS-e 31/10/2026\nEMITENTE DA NFS-e CNPJ 04.252.011/0001-10 Zeta Manutenção\nTOMADOR DO SERVIÇO CNPJ 11.444.777/0001-61 Alfa Serviços Ltda\nValor do Serviço R$ 7.120,50 Valor Líquido da NFS-e R$ 6.657,66`;

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    delete d.docs['acessos/beta_uBRUNO'];
    Object.assign(d.docs['empresas/alfa'], { modulos: ['equipe', 'cobrancas'], cnpj: '11.444.777/0001-61', razao: 'Alfa Serviços Ltda', tipo: 'contratante' });
    d.users['zeca@zeta.com.br'] = { uid: 'uZECA', pass: 'senha123' }; d.docs['usuarios/uZECA'] = { nome: 'Zeca Moura', email: 'zeca@zeta.com.br' };
    d.docs['acessos/zeta_uZECA'] = { uid: 'uZECA', empresaId: 'zeta', nome: 'Zeca Moura', email: 'zeca@zeta.com.br', cargo: 'admin', extras: [], sem: [], ativo: true };
    d.docs['empresas/zeta/privado/cadastro'] = { end: { cidade: 'Gravataí', uf: 'RS' } };
    d.docs['config/emissores'] = { cidades: { 'RS|GRAVATAI': { cidade: 'Gravataí', url: 'https://nfse.exemplo-prefeitura.gov.br/' } } };
    d.docs['empresas/zeta'] = { nome: 'Zeta Manutenção', cnpj: '04.252.011/0001-10', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas'], criadoPor: 'uZECA' };
    const esp = per => ({ medicaoId: 'cz_' + per, contratoId: 'cz', tomadorId: 'alfa', prestadorId: 'zeta', partes: ['alfa', 'zeta'], tomadorNome: 'Alfa Serviços', prestadorNome: 'Zeta Manutenção', prestadorCnpj: '04.252.011/0001-10',
      tomador: { razao: 'Alfa Serviços Ltda', cnpj: '11.444.777/0001-61', im: '', endereco: 'Rua A, 1', cidade: 'Gravataí', uf: 'RS' }, periodo: per, competencia: per.slice(0, 7), descricao: 'Prestação de serviços de manutenção.',
      valorCentavos: 712050, retencoes: { iss: 35603, inss: 0, ir: 10681, pcc: 0 }, liquidoCentavos: 665766, vencimentoDias: 1, obs: '', status: 'aguardando_nota', versao: 1, criadoPor: 'uBRUNO', criadoPorNome: 'Bruno Lima' });
    d.docs['espelhos/cz_2026-10-2'] = esp('2026-10-2');
    d.docs['espelhos/cz_2026-10-1'] = esp('2026-10-1');
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  const espDoc = async id => (await srv())['espelhos/' + id];
  const logs = async a => Object.values(await srv()).filter(x => x.acao === a);
  const entrarComo = async email => { if (await page.$('#sair')) await page.click('#sair'); await page.waitForSelector('#lg-email'); await H.entrar(page, email, 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 }); };
  const abrirEsp = async id => { await page.evaluate(id => { location.hash = '#espelhos/ver/' + id; }, id); await page.waitForSelector('#es-valores', { timeout: 8000 }); };
  const arquivo = (name, mimeType, txt) => page.setInputFiles('#an-arq', { name, mimeType, buffer: Buffer.from(txt, 'utf8') });
  const estado = () => page.evaluate(() => ({ res: (document.getElementById('an-res') || {}).innerText || '', env: !(document.querySelector('dialog[open] [data-dlg-b="1"]') || {}).disabled, num: !(document.getElementById('an-num-l') || { hidden: true }).hidden }));

  await H.preparar(page, d); await page.goto(H.BASE);
  await entrarComo('zeca@zeta.com.br');
  await page.evaluate(() => { window.__abriu = []; window.open = u => { window.__abriu.push(u); return null; }; });

  // N1 emitir: o site vem sozinho pela cidade da empresa; registra e, na volta, pede a nota
  await abrirEsp('cz_2026-10-2');
  const bt = await page.$eval('#es-emitir-bt', e => e.innerText), porque = await page.$eval('#es-site', e => e.innerText);
  await page.click('#es-emitir-bt'); await page.waitForSelector('#es-voltou', { timeout: 8000 });
  await page.evaluate(() => { const v = JSON.parse(sessionStorage.getItem('cw.emissao')); v.em -= 10000; sessionStorage.setItem('cw.emissao', JSON.stringify(v)); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForSelector('#an-arq', { state: 'attached', timeout: 8000 });
  const sub = await page.$eval('dialog[open]', e => e.innerText);
  let e = await espDoc('cz_2026-10-2');
  ok('N1 "Emitir a nota" escolhe sozinho o site pela cidade da empresa (Gravataí/RS na tabela), registra quem abriu e, ao voltar, pede a nota',
    /site da prefeitura/.test(bt) && /Gravataí\/RS/.test(porque) && (await page.evaluate(() => window.__abriu[0])) === 'https://nfse.exemplo-prefeitura.gov.br/' && e.emissao && e.emissao.uid === 'uZECA' && /Voltou do emissor/.test(sub) && (await logs('espelho.emissao')).length === 1, JSON.stringify({ bt, emissao: e.emissao }));

  // N10 o admin define o site da empresa (vale para todos) e depois volta ao automático
  await page.click('dialog[open] [data-dlg-b="0"]'); await H.dorme(200);
  await page.click('#es-outro-site'); await page.waitForSelector('#eo-url'); await page.fill('#eo-url', 'https://emissor.minha-cidade.gov.br'); await page.click('dialog[open] [data-dlg-b="1"]');
  await page.waitForSelector('#es-site', { timeout: 8000 }); await H.dorme(300);
  const p10 = await page.$eval('#es-site', e => e.innerText); await page.click('#es-emitir-bt'); await H.dorme(300);
  const u10 = await page.evaluate(() => window.__abriu[window.__abriu.length - 1]);
  const pv = (await srv())['empresas/zeta/privado/cadastro'];
  await page.click('#es-outro-site'); await page.waitForSelector('#eo-url'); await page.click('dialog[open] [data-dlg-b="1"]'); await H.dorme(600);
  const p10b = await page.$eval('#es-site', e => e.innerText);
  ok('N10 o admin da prestadora define o site da empresa (vale para todos) e volta ao automático pela cidade',
    /definido pela sua empresa/.test(p10) && u10 === 'https://emissor.minha-cidade.gov.br' && pv.emissor && pv.emissor.url === u10 && /Gravataí\/RS/.test(p10b) && (await logs('empresa.emissor')).length === 2, JSON.stringify({ p10, u10, p10b }));
  await page.click('#es-anexar'); await page.waitForSelector('#an-arq', { state: 'attached' });

  // N2 XML com valor errado é barrado
  await arquivo('nota.xml', 'application/xml', xml('7000.00', CH1)); await page.waitForSelector('#an-bloq', { timeout: 8000 });
  const s2 = await estado();
  ok('N2 XML com valor diferente do espelho: mostra o problema e não deixa enviar', !s2.env && /R\$ 7\.000,00/.test(s2.res) && /não bate/.test(s2.res), JSON.stringify(s2));

  // N3 XML certo: tudo conferido e enviado
  await arquivo('nota.xml', 'application/xml', xml('7120.50', CH1)); await page.waitForSelector('#an-okmsg', { timeout: 8000 });
  const s3 = await estado();
  await page.click('dialog[open] [data-dlg-b="1"]'); await page.waitForSelector('#es-nf', { timeout: 8000 });
  e = await espDoc('cz_2026-10-2'); let db = await srv();
  ok('N3 XML certo: emitente, tomador, valor e competência conferidos; grava a nota, o arquivo e a chave (nota só vale uma vez)',
    s3.env && /Emitida pela prestadora/.test(s3.res) && /Tomador certo/.test(s3.res) && e.status === 'nota_enviada' && e.nota.chave === CH1 && e.nota.numero === '12' && e.nota.conferencia.ok
    && db['notaschave/' + CH1] && db['notaschave/' + CH1].espelhoId === 'cz_2026-10-2' && db[`espelhos/cz_2026-10-2/arquivos/${e.nota.envio}-0`] && (await logs('nota.enviar')).length === 1, JSON.stringify({ st: e.status, n: e.nota && e.nota.numero }));

  // N4 a mesma nota não serve para outro espelho
  await abrirEsp('cz_2026-10-1'); await page.click('#es-anexar'); await page.waitForSelector('#an-arq', { state: 'attached' });
  await arquivo('nota.xml', 'application/xml', xml('7120.50', CH1)); await page.waitForSelector('#an-okmsg', { timeout: 8000 });
  await page.click('dialog[open] [data-dlg-b="1"]'); await H.dorme(800);
  const t4 = await page.evaluate(() => document.getElementById('toast').innerText);
  ok('N4 a mesma nota NÃO entra em outro espelho', (await espDoc('cz_2026-10-1')).status === 'aguardando_nota' && /já foi enviada/.test(t4), t4);

  // N5 financeiro do tomador: "Notas para conferir" e recusa com motivo
  await entrarComo('bruno@alfa.com.br');
  await page.evaluate(() => { location.hash = '#espelhos'; }); await page.waitForSelector('#es-conferir', { timeout: 8000 });
  await page.click('#es-tab-conferir tbody tr'); await page.waitForSelector('#es-nf-recusar', { timeout: 8000 });
  const tripla = await page.$eval('#es-tripla', x => x.innerText);
  await page.click('#es-nf-recusar'); await page.waitForSelector('#rn-mot'); await page.fill('#rn-mot', 'A competência deve ser outubro, confira a data.'); await page.click('dialog[open] [data-dlg-b="1"]'); await page.waitForSelector('#es-recusa', { timeout: 8000 });
  e = await espDoc('cz_2026-10-2');
  ok('N5 financeiro vê "Notas para conferir" com a validação tripla e recusa com motivo (a recusa fica guardada)',
    /Contrato ativo/.test(tripla) && /Medição aprovada/.test(tripla) && /bate com o espelho/.test(tripla) && e.status === 'aguardando_nota' && e.nota === null && e.recusadas.length === 1 && /competência/.test(e.recusadas[0].motivo) && (await logs('nota.recusar')).length === 1, JSON.stringify({ st: e.status }));

  // N6 prestadora vê a recusa e manda o PDF (lido pelo texto)
  await entrarComo('zeca@zeta.com.br');
  await page.evaluate(t => { window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({ getTextContent: async () => ({ items: t.split('\n').map(str => ({ str })) }) }) }) }) }; }, TEXTO_PDF);
  await abrirEsp('cz_2026-10-2');
  const rec = await page.$eval('#es-recusa', x => x.innerText);
  await page.click('#es-anexar'); await page.waitForSelector('#an-arq', { state: 'attached' });
  await arquivo('nota.pdf', 'application/pdf', '%PDF-1.4 teste'); await page.waitForSelector('#an-okmsg', { timeout: 8000 });
  const s6 = await estado();
  await page.click('dialog[open] [data-dlg-b="1"]'); await page.waitForSelector('#es-nf', { timeout: 8000 });
  e = await espDoc('cz_2026-10-2');
  ok('N6 a prestadora vê o motivo da recusa; o PDF da nota é lido (CNPJs, valor, competência, chave) e enviado',
    /recusou/.test(rec) && /competência/.test(rec) && s6.env && /no PDF/.test(s6.res) && e.status === 'nota_enviada' && e.nota.tipo === 'pdf' && e.nota.chave === CH2 && e.nota.numero === '13' && e.nota.conferencia.ok, JSON.stringify({ res: s6.res.slice(0, 200), st: e.status }));

  // N7 PDF escaneado (sem texto): pede o número e vai para conferência à mão
  await abrirEsp('cz_2026-10-1'); await page.click('#es-anexar'); await page.waitForSelector('#an-arq', { state: 'attached' });
  await page.evaluate(() => { window.pdfjsLib.getDocument = () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({ getTextContent: async () => ({ items: [] }) }) }) }); });
  await arquivo('foto.pdf', 'application/pdf', '%PDF-1.4 foto'); await page.waitForSelector('#an-manual', { timeout: 8000 });
  const s7 = await estado();
  await page.click('dialog[open] [data-dlg-b="1"]'); await H.dorme(200); const er7 = await page.$eval('#an-erro', x => x.innerText);
  await page.fill('#an-num', '0099'); await page.click('dialog[open] [data-dlg-b="1"]'); await page.waitForSelector('#es-nf', { timeout: 8000 });
  e = await espDoc('cz_2026-10-1');
  ok('N7 PDF escaneado: pede o número da nota e envia para conferência à mão', s7.num && /número/.test(er7) && e.status === 'nota_enviada' && e.nota.conferencia.manual && e.nota.chaveUnica === '04252011000110_99', JSON.stringify({ s7, er7, cu: e.nota && e.nota.chaveUnica }));

  // N8 financeiro marca conferida; na manual, precisa marcar que abriu o arquivo
  await entrarComo('bruno@alfa.com.br');
  await abrirEsp('cz_2026-10-2'); await page.click('#es-nf-ok'); await page.waitForSelector('dialog[open]'); await page.click('dialog[open] [data-dlg-b="1"]'); await page.waitForSelector('#es-aviso', { timeout: 8000 }); await H.dorme(300);
  await abrirEsp('cz_2026-10-1'); await page.click('#es-nf-ok'); await page.waitForSelector('#nc-chk'); await page.click('dialog[open] [data-dlg-b="1"]'); const er8 = await page.$eval('#nc-erro', x => x.innerText);
  await page.check('#nc-chk'); await page.click('dialog[open] [data-dlg-b="1"]'); await H.dorme(600);
  const a = await espDoc('cz_2026-10-2'), b = await espDoc('cz_2026-10-1');
  ok('N8 o financeiro marca a nota conferida (a conferida à mão pede a confirmação de que abriu o arquivo)',
    a.status === 'nota_ok' && a.conferenciaNota.uid === 'uBRUNO' && !a.conferenciaNota.manual && /Marque/.test(er8) && b.status === 'nota_ok' && b.conferenciaNota.manual && (await logs('nota.conferir')).length === 2, JSON.stringify({ a: a.status, b: b.status, er8 }));

  // N9 celular sem rolagem para o lado
  await page.setViewportSize({ width: 390, height: 844 }); await abrirEsp('cz_2026-10-2'); await H.dorme(300);
  const lado = await page.evaluate(() => { const w = innerWidth; return Array.from(document.querySelectorAll('#view *')).filter(e => e.getBoundingClientRect().right > w + 1).slice(0, 3).map(e => e.tagName + '.' + e.className); });
  ok('N9 celular: espelho com a nota sem rolagem para o lado', !lado.length, JSON.stringify(lado));

  ok('Sem erros de JavaScript na página', !erros.length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
