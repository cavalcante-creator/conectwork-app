/* Teste de tela da análise de cadastros pela equipe Conectwork (Etapa 1, parte 2):
   lista por situação, abrir, conferir documentos, plano sugerindo módulos, aprovar só com tudo conferido,
   pedir ajuste e recusar com motivo, histórico, e o que a empresa vê depois. Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('analise');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const docs = { contrato: { nome: 'contrato-social.pdf', tam: 204800 }, cartao: { nome: 'cartao-cnpj.pdf', tam: 51200 }, endereco: { nome: 'conta-luz.jpg', tam: 81920 }, identidade: { nome: 'rg.png', tam: 40960 } };
  const priv = { dados: { abertura: '2019-03-10', porte: 'Microempresa (ME)', regime: 'Simples Nacional', cnae: '3314-7/10 Manutenção', im: '123', ie: '' },
    end: { cep: '94000-000', logradouro: 'Rua das Flores', numero: '100', bairro: 'Centro', cidade: 'Gravataí', uf: 'RS' },
    resp: { nome: 'Gil Prado', cpf: '529.982.247-25', cargo: 'Sócio', cel: '(51) 99876-5432', email: 'gil@gama.com.br' },
    banco: { banco: '341 · Itaú Unibanco', tipoConta: 'Corrente', agencia: '1234', conta: '56789-0', pixTipo: 'E-mail', pix: 'fin@gama.com.br' }, docs };
  const { d } = H.seed(d => {
    Object.assign(d.docs['empresas/gama'], { razao: 'Gama Logística Ltda', cnpj: '11.444.777/0001-61', cidade: 'Gravataí', uf: 'RS', protocolo: 'CW-2026-0007', enviadoEm: '2026-11-05T10:00:00.000Z' });
    d.docs['empresas/gama/privado/cadastro'] = JSON.parse(JSON.stringify(priv));
    d.docs['empresas/delta'] = { nome: 'Delta', razao: 'Delta Serviços Ltda', cnpj: '04.252.011/0001-10', status: 'analise', tipo: 'prestador', criadoPor: 'uDELTA', protocolo: 'CW-2026-0008', enviadoEm: '2026-11-06T10:00:00.000Z' };
    d.docs['empresas/delta/privado/cadastro'] = JSON.parse(JSON.stringify(priv));
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  const toast = () => page.evaluate(() => document.getElementById('toast').innerText);

  // A1 equipe Conectwork: menu com Cadastros; lista começa em "Em análise" com contadores
  await H.preparar(page, d); await page.goto(H.BASE);
  await H.entrar(page, 'iasmyn@conectwork.com.br', 'senha123'); await page.waitForSelector('#menu', { timeout: 8000 });
  const menu = await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod));
  await page.evaluate(() => { location.hash = '#cadastros'; }); await page.waitForSelector('#cm-lista [data-abrir]', { timeout: 6000 });
  const a1 = await page.evaluate(() => ({ chips: Array.from(document.querySelectorAll('[data-filtro]')).map(b => b.innerText.replace(/\s+/g, ' ')), linhas: Array.from(document.querySelectorAll('#cm-lista tbody tr')).map(r => r.querySelector('strong').innerText) }));
  ok('A1 equipe Conectwork: menu com Cadastros; lista "Em análise" com contadores, mais recente primeiro', menu.includes('cadastros') && /Em análise\s*2/.test(a1.chips[0]) && /Aprovadas\s*2/.test(a1.chips[2]) && JSON.stringify(a1.linhas) === '["Delta","Gama Logística"]', JSON.stringify({ menu, a1 }));

  // A2 empresa NÃO vê a tela de cadastros
  // (conferido mais abaixo, com a Ana)

  // A3 abre a análise: dados, documentos e decisão; aprovar travado até conferir e escolher o plano
  await page.click('tr[data-abrir="gama"]'); await page.waitForSelector('#cm-decisao', { timeout: 6000 });
  const a3 = await page.evaluate(() => ({ nome: document.getElementById('cm-nome').innerText, prot: document.getElementById('cm-protocolo').innerText, conf: document.getElementById('cm-conf').innerText,
    aprovar: document.getElementById('cm-aprovar').disabled, falta: document.getElementById('cm-falta').innerText, cpf: document.body.innerText.includes('529.982.247-25'), hash: location.hash }));
  ok('A3 análise: dados do cadastro, protocolo, 0 de 4 conferidos e "Aprovar" travado', a3.nome === 'Gama Logística' && /CW-2026-0007/.test(a3.prot) && a3.conf === '0 de 4 conferidos' && a3.aprovar && /Faltam conferir 4/.test(a3.falta) && a3.cpf && a3.hash === '#cadastros/analise/gama', JSON.stringify(a3));

  // A4 pedir ajuste exige motivo
  await page.click('#cm-ajuste'); const a4 = await page.$eval('#cm-motivo-erro', e => e.innerText);
  ok('A4 "Pedir ajuste" sem motivo não grava e pede o motivo', /Escreva o motivo/.test(a4) && (await srv())['empresas/gama'].status === 'analise', a4);

  // A5 conferir os documentos (grava o nome do arquivo conferido e o histórico)
  for (const k of ['contrato', 'cartao', 'endereco', 'identidade']) { await page.check(`[data-conf="${k}"]`); await page.waitForFunction(k => document.querySelector(`[data-conf="${k}"]`) && document.querySelector(`[data-conf="${k}"]`).checked && !document.querySelector(`[data-conf="${k}"]`).disabled, k, { timeout: 5000 }); }
  const s5 = await srv(), pv5 = s5['empresas/gama/privado/cadastro'];
  const a5 = { conf: await page.$eval('#cm-conf', e => e.innerText), aprovar: await page.$eval('#cm-aprovar', e => e.disabled), falta: await page.$eval('#cm-falta', e => e.innerText),
    nomes: Object.keys(pv5.conferidos || {}).map(k => pv5.conferidos[k].nome), logs: Object.values(s5).filter(x => x.acao === 'cadastro.conferir' && x.empresaId === 'gama').length };
  ok('A5 conferiu os 4 documentos: grava o arquivo conferido e o histórico; ainda falta escolher o plano', a5.conf === '4 de 4 conferidos' && a5.aprovar && /Escolha o plano/.test(a5.falta) && a5.nomes.length === 4 && a5.logs === 4, JSON.stringify(a5));

  // A6 o plano sugere os módulos; dá para ajustar um a um
  await page.selectOption('#cm-plano', 'essencial');
  const a6 = await page.evaluate(() => ({ mods: Array.from(document.querySelectorAll('[data-mod]')).filter(c => c.checked).map(c => c.dataset.mod), aprovar: document.getElementById('cm-aprovar').disabled, desc: document.getElementById('cm-plano-desc').innerText }));
  await page.check('[data-mod="contratos"]');
  ok('A6 plano Essencial marca usuários, cobranças e integração com o RH; libera o "Aprovar"', JSON.stringify(a6.mods) === '["equipe","cobrancas","integracao"]' && !a6.aprovar && /integração com o RH/.test(a6.desc), JSON.stringify(a6));

  // A7 aprovar: status, plano, módulos, quem e quando; histórico; aviso pelo WhatsApp
  await page.click('#cm-aprovar'); await page.waitForSelector('#cm-salvar', { timeout: 6000 });
  const s7 = await srv(), e7 = s7['empresas/gama'], log7 = Object.values(s7).filter(x => x.acao === 'empresa.aprovar' && x.empresaId === 'gama');
  const zap = await page.$eval('#cm-zap', a => a.href).catch(() => '');
  ok('A7 aprovou: status aprovado, plano e módulos escolhidos, quem aprovou; histórico; botão para avisar pelo WhatsApp',
    e7.status === 'aprovado' && e7.plano === 'essencial' && JSON.stringify(e7.modulos) === '["equipe","cobrancas","contratos","integracao"]' && e7.avaliadoPor === 'Iasmyn' && !!e7.avaliadoEm
    && log7.length === 1 && /plano Essencial/.test(log7[0].texto) && !/529\.982/.test(log7[0].texto) && /wa\.me\/5551998765432\?text=.*aprovado/.test(zap) && /aprovada/.test(await toast()), JSON.stringify({ st: e7.status, mods: e7.modulos, log: log7.length, zap: zap.slice(0, 60) }));

  // A8 depois de aprovada: muda plano e módulos
  await page.uncheck('[data-mod="contratos"]'); await page.click('#cm-salvar'); await H.dorme(400);
  const e8 = (await srv())['empresas/gama'];
  ok('A8 empresa aprovada: plano e módulos podem ser ajustados depois (com histórico)', JSON.stringify(e8.modulos) === '["equipe","cobrancas","integracao"]' && Object.values(await srv()).some(x => x.acao === 'empresa.plano'), JSON.stringify(e8.modulos));

  // A9 pedir ajuste em outra empresa (com motivo); recusar pede confirmação
  await page.click('#cm-voltar'); await page.waitForSelector('tr[data-abrir="delta"]'); await page.click('tr[data-abrir="delta"]'); await page.waitForSelector('#cm-motivo');
  await page.fill('#cm-motivo', 'O comprovante de endereço está ilegível. Envie uma cópia mais nítida.'); await page.click('#cm-ajuste'); await page.waitForSelector('#cm-decisao .banner.warn', { timeout: 6000 });
  const e9 = (await srv())['empresas/delta'];
  await page.fill('#cm-motivo', 'Atividade fora do escopo da plataforma.'); await page.click('#cm-recusar'); await page.waitForSelector('dialog[open]');
  const dlg = await page.$eval('dialog[open]', e => e.innerText); await page.click('dialog[open] [data-dlg-b="0"]'); await H.dorme(200);
  const e9b = (await srv())['empresas/delta'];
  ok('A9 ajuste pedido com motivo (aparece "Esperando a correção"); recusar pede confirmação e "Voltar" não recusa',
    e9.status === 'pendencia' && /ilegível/.test(e9.motivo) && /Recusar o cadastro/.test(dlg) && e9b.status === 'pendencia', JSON.stringify({ s: e9.status, dlg: dlg.slice(0, 40) }));

  // A10 recusar de verdade
  await page.click('#cm-recusar'); await page.waitForSelector('dialog[open]'); await page.click('dialog[open] [data-dlg-b="1"]'); await page.waitForSelector('#cm-decisao .banner.danger', { timeout: 6000 });
  const s10 = await srv(), e10 = s10['empresas/delta'];
  const a10 = { st: e10.status, motivo: e10.motivo, semBotoes: !(await page.$('#cm-aprovar')) && !(await page.$('[data-conf]')), hist: await page.$$eval('#cm-hist li', x => x.length) };
  ok('A10 recusou: motivo gravado, sem botões de decisão nem conferência; histórico mostra ajuste e recusa', a10.st === 'recusado' && /fora do escopo/.test(a10.motivo) && a10.semBotoes && a10.hist >= 2, JSON.stringify(a10));

  // A11 a lista se atualiza sozinha
  await page.click('#cm-voltar'); await page.waitForSelector('[data-filtro="recusado"]');
  await page.click('[data-filtro="recusado"]'); const a11 = await page.$$eval('#cm-lista tbody tr strong', x => x.map(e => e.innerText));
  ok('A11 lista por situação: "Recusadas" mostra a Delta', JSON.stringify(a11) === '["Delta"]', JSON.stringify(a11));

  // A12 a empresa aprovada (Gil) entra e vê os módulos liberados; "Meu cadastro" some; empresa não vê "Cadastros"
  await page.click('#sair'); await page.waitForSelector('#lg-email');
  await H.entrar(page, 'gil@gama.com.br', 'senha123'); await page.waitForSelector('#menu', { timeout: 8000 });
  const m12 = await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod));
  await page.evaluate(() => { location.hash = '#cadastros'; }); await H.dorme(400);
  const h12 = await page.evaluate(() => location.hash);
  ok('A12 empresa aprovada: entra sem "Meu cadastro" e NÃO abre "Cadastros" (só a equipe Conectwork)', !m12.includes('meucadastro') && !m12.includes('cadastros') && h12 !== '#cadastros', JSON.stringify({ m12, h12 }));

  // A13 celular: a análise cabe sem rolagem para o lado
  await page.click('#sair'); await page.waitForSelector('#lg-email');
  await H.entrar(page, 'iasmyn@conectwork.com.br', 'senha123'); await page.waitForSelector('#menu', { timeout: 8000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { location.hash = '#cadastros/analise/gama'; }); await page.waitForSelector('#cm-decisao', { timeout: 6000 }); await H.dorme(300);
  const lado = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  ok('A13 celular: a análise do cadastro cabe na tela, sem rolagem para o lado', !lado);

  ok('Sem erros de JavaScript na página', !erros.length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
