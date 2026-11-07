/* Teste de tela de Usuários e acessos (Etapa 1, parte 3): só o admin vê; lista de pessoas; trocar cargo;
   ajustar acesso; bloquear e liberar; convidar (validações, link, WhatsApp, copiar); reenviar e cancelar convite;
   tudo no histórico. Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('usuarios');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    d.docs['empresas/alfa'].modulos = ['equipe', 'cobrancas'];
    Object.assign(d.docs['acessos/alfa_uANA'], { nome: 'Ana Souza', email: 'ana@alfa.com.br' });
    Object.assign(d.docs['acessos/alfa_uBRUNO'], { nome: 'Bruno Lima', email: 'bruno@alfa.com.br' });
    Object.assign(d.docs['acessos/alfa_uDUDA'], { nome: 'Duda Reis', email: 'duda@alfa.com.br' });
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  const toast = () => page.evaluate(() => document.getElementById('toast').innerText);
  const logs = async acao => Object.values(await srv()).filter(x => x.acao === acao);
  const dlgOk = async () => { await page.click('dialog[open] [data-dlg-b="1"]'); };

  // U1 admin vê "Usuários e acessos"; financeiro não
  await H.preparar(page, d); await page.goto(H.BASE);
  await H.entrar(page, 'bruno@alfa.com.br', 'senha123'); await page.waitForSelector('#escolher [data-ctx="empresa:alfa"]', { timeout: 8000 }); await page.click('[data-ctx="empresa:alfa"]'); await page.waitForSelector('#menu');
  const mBruno = await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod));
  await page.click('#sair'); await page.waitForSelector('#lg-email');
  await H.entrar(page, 'ana@alfa.com.br', 'senha123'); await page.waitForSelector('#menu', { timeout: 8000 });
  const mAna = await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod));
  ok('U1 só o administrador vê "Usuários e acessos" (o financeiro não)', mAna.includes('usuarios') && !mBruno.includes('usuarios'), JSON.stringify({ mAna, mBruno }));

  // U2 lista: a própria pessoa sem botões; bloqueada aparece como Bloqueado
  await page.evaluate(() => { location.hash = '#usuarios'; }); await page.waitForSelector('#us-pessoas tbody tr', { timeout: 6000 });
  const u2 = await page.evaluate(() => Array.from(document.querySelectorAll('#us-pessoas tbody tr')).map(r => ({ n: r.querySelector('strong').innerText, sel: !!r.querySelector('select'), bt: r.querySelectorAll('button').length, st: r.querySelector('.pill').innerText })));
  ok('U2 pessoas: você primeiro, sem como mudar o próprio acesso; quem está bloqueado aparece "Bloqueado"',
    /^Ana Souza/.test(u2[0].n) && /você/.test(u2[0].n) && !u2[0].sel && u2[0].bt === 0 && u2.find(x => /Duda/.test(x.n)).st === 'Bloqueado' && u2.find(x => /Bruno/.test(x.n)).sel, JSON.stringify(u2));

  // U3 trocar o cargo
  await page.selectOption('[data-cargo="alfa_uBRUNO"]', 'tesouraria'); await H.dorme(400);
  const a3 = (await srv())['acessos/alfa_uBRUNO'], l3 = await logs('acesso.cargo');
  ok('U3 trocar o cargo grava e registra no histórico (com nome e e-mail, de/para)', a3.cargo === 'tesouraria' && l3.length === 1 && /Bruno Lima \(bruno@alfa\.com\.br\).*Financeiro para Tesouraria/.test(l3[0].texto), l3[0] && l3[0].texto);

  // U4 ajustar acesso: sem telas da empresa no ar ainda, explica
  await page.click('[data-ajustar="alfa_uBRUNO"]'); await page.waitForSelector('dialog[open] #aj-lista');
  const u4 = await page.$eval('dialog[open]', e => e.innerText); await page.click('dialog[open] [data-dlg-b="0"]');
  ok('U4 "Ajustar acesso" abre; sem telas de empresa no ar ainda, explica (Usuários e acessos é só do admin)', /Ajustar acesso/.test(u4) && /Ainda não há telas/.test(u4), u4.slice(0, 120));

  // U5 bloquear (com confirmação) e liberar
  await page.click('[data-bloq="alfa_uBRUNO"]'); await page.waitForSelector('dialog[open]'); const dlg5 = await page.$eval('dialog[open]', e => e.innerText);
  await dlgOk(); await H.dorme(400);
  const b5 = (await srv())['acessos/alfa_uBRUNO'].ativo;
  await page.waitForSelector('[data-bloq="alfa_uDUDA"]'); await page.click('[data-bloq="alfa_uDUDA"]'); await H.dorme(400);
  const d5 = (await srv())['acessos/alfa_uDUDA'].ativo;
  ok('U5 bloquear pede confirmação; liberar volta o acesso; os dois no histórico', /Bloquear acesso/.test(dlg5) && b5 === false && d5 === true && (await logs('acesso.bloquear')).length === 1 && (await logs('acesso.liberar')).length === 1, JSON.stringify({ b5, d5 }));

  // U6 convidar: validações
  await page.click('#us-convidar'); await page.waitForSelector('#cv-nome');
  const er = () => page.$eval('#cv-erro', e => e.innerText);
  await page.fill('#cv-nome', 'Edu'); await dlgOk(); const e1 = await er();
  await page.fill('#cv-nome', 'Edu Martins'); await page.fill('#cv-email', 'edu@'); await dlgOk(); const e2 = await er();
  await page.fill('#cv-email', 'BRUNO@alfa.com.br'); await dlgOk(); const e3 = await er();
  await page.fill('#cv-email', 'Edu@Alfa.com.br'); await page.fill('#cv-tel', '(51) 3333-4444'); await dlgOk(); const e4 = await er();
  ok('U6 convite: pede nome e sobrenome, e-mail válido, WhatsApp com DDD e não convida quem já tem acesso', /sobrenome/.test(e1) && /não parece válido/.test(e2) && /já tem acesso/.test(e3) && /WhatsApp inválido/.test(e4), JSON.stringify([e1, e2, e3, e4]));

  // U7 cria o convite: link, WhatsApp com a mensagem pronta, copiar
  await page.fill('#cv-tel', '(51) 99876-1111'); await page.selectOption('#cv-cargo', 'operacional'); await dlgOk();
  await page.waitForSelector('dialog[open] #cv-link', { timeout: 6000 });
  const docs7 = await srv(), ck = Object.keys(docs7).find(k => /^convites\//.test(k) && docs7[k].email === 'edu@alfa.com.br'), cv = docs7[ck] || {}, tok = ck && ck.split('/')[1];
  const u7 = await page.evaluate(() => ({ link: document.getElementById('cv-link').value, zap: document.getElementById('cv-zap').href }));
  const zapTxt = decodeURIComponent(u7.zap.split('text=')[1] || '');
  await page.click('#cv-copiar'); await H.dorme(200); const t7 = await toast();
  await page.click('dialog[open] [data-dlg-b="0"]');
  ok('U7 convite criado (e-mail em minúsculas, cargo, quem convidou); link #convite/<token>; WhatsApp com a mensagem pronta; copiar link',
    cv.cargo === 'operacional' && cv.usado === false && cv.criadoPor === 'uANA' && cv.empresaNome === 'Alfa Serviços' && u7.link.endsWith('#convite/' + tok)
    && /^https:\/\/wa\.me\/5551998761111\?text=/.test(u7.zap) && /Olá, Edu! Ana Souza convidou você para acessar a empresa Alfa Serviços no Conectwork, como Operacional/.test(zapTxt) && zapTxt.includes('#convite/' + tok) && zapTxt.includes('edu@alfa.com.br')
    && /Link copiado/.test(t7) && (await logs('convite.criar')).length === 1 && !/99876/.test(JSON.stringify(await logs('convite.criar'))), JSON.stringify({ cv: { cargo: cv.cargo, email: cv.email }, link: u7.link, zap: zapTxt.slice(0, 80) }));

  // U8 convite aparece na lista; convidar de novo o mesmo e-mail é barrado; reenviar abre o link de novo
  await page.waitForSelector('#us-convites [data-reenviar]', { timeout: 6000 });
  const lista8 = await page.$$eval('#us-convites tbody tr strong', x => x.map(e => e.innerText));
  await page.click('#us-convidar'); await page.waitForSelector('#cv-nome'); await page.fill('#cv-nome', 'Edu Martins'); await page.fill('#cv-email', 'edu@alfa.com.br'); await dlgOk(); const e8 = await er(); await page.click('dialog[open] [data-dlg-b="0"]');
  await page.click(`[data-reenviar="${tok}"]`); await page.waitForSelector('dialog[open] #cv-link'); const t8 = await page.$eval('dialog[open] h2', e => e.innerText); await page.click('dialog[open] [data-dlg-b="0"]'); await H.dorme(300);
  ok('U8 convite na lista "esperando resposta"; o mesmo e-mail não recebe dois convites; "Reenviar" abre o link de novo e registra',
    JSON.stringify(lista8) === '["Edu Martins"]' && /Já existe um convite/.test(e8) && t8 === 'Reenviar convite' && !!(await srv())['convites/' + tok].reenviadoEm && (await logs('convite.reenviar')).length === 1, JSON.stringify({ lista8, e8 }));

  // U9 cancelar convite (com confirmação): some da lista e do banco
  await page.click(`[data-cancelar="${tok}"]`); await page.waitForSelector('dialog[open]'); await dlgOk(); await H.dorme(500);
  const u9 = { banco: !!(await srv())['convites/' + tok], lista: await page.$$eval('#us-convites tbody tr', x => x.length) };
  ok('U9 cancelar convite: o link deixa de existir; registrado no histórico', !u9.banco && u9.lista === 0 && (await logs('convite.cancelar')).length === 1, JSON.stringify(u9));

  // U10 celular: sem rolagem para o lado
  await page.setViewportSize({ width: 390, height: 844 }); await H.dorme(300);
  ok('U10 celular: a tela cabe sem rolagem para o lado', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));

  ok('Sem erros de JavaScript na página', !erros.length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
