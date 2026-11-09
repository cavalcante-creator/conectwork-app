/* Teste de Documentos e certidões: a prestadora envia arquivos com validade (substitui o anterior), vê o que falta e o
   que vence; quem contrata vê a situação no contrato, no "Precisa de você" e no pagamento; a equipe Conectwork abre os
   arquivos na análise do cadastro. Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('documentos');
const PDF = Buffer.from('%PDF-1.4\n% certidão de teste\n', 'utf8');
const futuro = d => { const x = new Date(); x.setDate(x.getDate() + d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    delete d.docs['acessos/beta_uBRUNO'];
    Object.assign(d.docs['empresas/alfa'], { modulos: ['equipe', 'cobrancas'], cnpj: '11.444.777/0001-61', tipo: 'contratante' });
    d.users['zeca@zeta.com.br'] = { uid: 'uZECA', pass: 'senha123' }; d.docs['usuarios/uZECA'] = { nome: 'Zeca Moura', email: 'zeca@zeta.com.br' };
    d.docs['acessos/zeta_uZECA'] = { uid: 'uZECA', empresaId: 'zeta', nome: 'Zeca Moura', email: 'zeca@zeta.com.br', cargo: 'admin', extras: [], sem: [], ativo: true };
    d.docs['empresas/zeta'] = { nome: 'Zeta Manutenção', cnpj: '04.252.011/0001-10', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas'], criadoPor: 'uZECA' };
    const base = { tomadorId: 'alfa', prestadorId: 'zeta', partes: ['alfa', 'zeta'], tomadorNome: 'Alfa Serviços', prestadorNome: 'Zeta Manutenção' };
    d.docs['contratos/cz'] = Object.assign({ modalidade: 'continua', objeto: 'Equipe de manutenção.', periodicidade: 'quinzena', vencimentoDias: 1, inicio: '2026-01-01', status: 'ativo', assinaturas: { tomador: { uid: 'uANA' }, prestador: { uid: 'uZECA' } }, interlocutor: null, proposta: null }, base);
    d.docs['titulos/t1'] = Object.assign({ espelhoId: 't1', contratoId: 'cz', periodo: '2026-10-2', valorCentavos: 100000, liquidoCentavos: 100000, vencimentoDias: 1, base: new Date().toISOString(), status: 'aprovado',
      aprovacao: { uid: 'uANA', nome: 'Ana Souza' }, liberacao: null, agendamento: null, liquidacao: null, baixa: null, conta: { ok: false, revisao: false, versao: 0 } }, base);
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  const docs = async () => Object.entries(await srv()).filter(([k]) => /^documentos\/[^/]+$/.test(k)).map(([k, v]) => Object.assign({ _id: k.split('/')[1] }, v));
  const entrarComo = async email => { if (await page.$('#sair')) await page.click('#sair'); await page.waitForSelector('#lg-email'); await H.entrar(page, email, 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 }); };
  const dlgOk = () => page.click('dialog[open] [data-dlg-b="1"]');
  const envia = async (tipo, validade, nome) => { await page.click(`[data-enviar="${tipo}"]`); await page.waitForSelector('#dc-arq', { state: 'attached' });
    if (validade) await page.fill('#dc-val', validade);
    await page.setInputFiles('#dc-arq', { name: nome || tipo + '.pdf', mimeType: 'application/pdf', buffer: PDF }); await dlgOk(); };
  await H.preparar(page, d); await page.goto(H.BASE);

  // D1 prestadora: o que falta, no Documentos e no Início
  await entrarComo('zeca@zeta.com.br');
  await page.waitForSelector('#ini-pv .pv-it', { timeout: 8000, state: 'attached' }); await H.dorme(500);
  const pv1 = await page.$$eval('#ini-pv .pv-it strong', x => x.map(e => e.textContent));
  await page.evaluate(() => { location.hash = '#documentos'; }); await page.waitForSelector('#dc-certidao', { timeout: 8000 });
  const av1 = await page.$eval('#dc-aviso', e => e.innerText);
  ok('D1 a prestadora vê o que falta (cadastro, certidões, PGR e PCMSO) no Documentos e no "Precisa de você"',
    /6 documentos para resolver/.test(av1) && pv1.some(t => /Enviar: Certidão negativa de débitos trabalhistas/.test(t)) && pv1.some(t => /PCMSO/.test(t)) && !!(await page.$('#dc-certidao a[href*="tst.jus.br"]')), JSON.stringify({ av1: av1.slice(0, 80), n: pv1.length }));

  // D2 enviar a CNDT: certidão vencida é recusada; com validade, fica em dia e compartilhada
  await page.click('[data-enviar="cndt"]'); await page.waitForSelector('#dc-arq', { state: 'attached' });
  await page.evaluate(() => { document.getElementById('dc-val').removeAttribute('min'); }); await page.fill('#dc-val', '2020-01-01');
  await page.setInputFiles('#dc-arq', { name: 'cndt.pdf', mimeType: 'application/pdf', buffer: PDF }); await dlgOk(); const er2 = await page.$eval('#dc-erro', e => e.innerText);
  await page.fill('#dc-val', futuro(120)); await dlgOk(); await page.waitForSelector('[data-tipo="cndt"].ok', { timeout: 8000 });
  let ds = await docs(); const db = await srv(), d1 = ds.find(x => x.tipo === 'cndt');
  ok('D2 certidão vencida é recusada; com validade, fica "em dia", compartilhada, com o arquivo guardado e no histórico',
    /vencido/.test(er2) && d1 && d1.compartilhar && d1.status === 'vigente' && d1.validade === futuro(120) && db[`documentos/${d1._id}/arquivos/${d1.arquivo.envio}-0`] && Object.values(db).some(x => x.acao === 'documento.enviar'), er2);

  // D3 enviar de novo substitui; documento do cadastro não é compartilhado
  await envia('cndt', futuro(150), 'cndt-nova.pdf'); await H.dorme(600);
  await page.click('[data-enviar="identidade"]'); await page.waitForSelector('#dc-arq', { state: 'attached' });
  const semComp = await page.$eval('#dc-comp-l', e => e.hidden);
  await page.setInputFiles('#dc-arq', { name: 'rg.pdf', mimeType: 'application/pdf', buffer: PDF }); await dlgOk(); await H.dorme(600);
  ds = await docs();
  const cn = ds.filter(x => x.tipo === 'cndt'), idt = ds.find(x => x.tipo === 'identidade');
  ok('D3 enviar de novo marca o anterior como substituído; documento do responsável não é compartilhado',
    cn.length === 2 && cn.filter(x => x.status === 'vigente').length === 1 && cn.find(x => x.status === 'substituido') && semComp && idt && idt.compartilhar === false, JSON.stringify(cn.map(x => x.status)));

  // D4 vence logo: aviso 15 dias antes
  await envia('crf_fgts', futuro(5)); await page.waitForSelector('[data-tipo="crf_fgts"] .pill.warn', { timeout: 8000 });
  ok('D4 certidão que vence em até 15 dias aparece como "vence logo"', /Vence em/.test(await page.$eval('[data-tipo="crf_fgts"]', e => e.innerText)));

  // D5 quem contrata: situação no contrato, no Início e no pagamento
  await entrarComo('bruno@alfa.com.br');
  await page.waitForSelector('#ini-pv', { timeout: 8000 }); await H.dorme(1200);
  const pv5 = await page.$$eval('#ini-pv .pv-it strong', x => x.map(e => e.textContent));
  await page.evaluate(() => { location.hash = '#contratos/ver/cz'; }); await page.waitForSelector('#dc-prest', { timeout: 8000 });
  const ct = await page.$eval('#dc-prest', e => e.innerText);
  await page.evaluate(() => { location.hash = '#titulos/ver/t1'; }); await page.waitForSelector('#dc-alerta', { timeout: 8000 });
  const al = await page.$eval('#dc-alerta', e => e.innerText);
  ok('D5 quem contrata vê os documentos da prestadora no contrato (sem os do cadastro), a pendência no Início e o alerta no pagamento',
    pv5.includes('Documentos da Zeta Manutenção com pendência') && /CNDT\)[\s\S]*Válido até/.test(ct) && /Vence em/.test(ct) && /PGR[\s\S]*Falta enviar/.test(ct) && !/responsável/.test(ct) && /falta enviar/i.test(al), JSON.stringify({ pv5, ct, al: al.slice(0, 100) }));

  // D6 equipe Conectwork abre os arquivos na análise do cadastro
  await entrarComo('iasmyn@conectwork.com.br');
  await page.evaluate(() => { location.hash = '#cadastros/analise/zeta'; }); await page.waitForSelector('#dc-master', { timeout: 8000 });
  const ms = await page.$eval('#dc-master', e => e.innerText);
  ok('D6 a equipe Conectwork vê os arquivos enviados na análise do cadastro (inclusive os do cadastro)', /Documento com foto do responsável/.test(ms) && /CNDT/.test(ms) && !/cndt\.pdf/.test(ms), ms.slice(0, 160));

  // D7 celular
  await entrarComo('zeca@zeta.com.br'); await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { location.hash = '#documentos'; }); await page.waitForSelector('#dc-certidao'); await H.dorme(300);
  ok('D7 celular: Documentos sem rolagem para o lado', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));

  ok('Sem erros de JavaScript na página', !erros.length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
