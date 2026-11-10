/* Teste do cadastro rápido do MEI (10/11/2026): "Sou MEI" na tela de entrar, validações, criação da conta e do MEI
   numa tela só, entrada direta no Início do MEI com a gestão liberada (sem esperar análise), sem as telas da rede, e o
   convite para completar o cadastro. Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('cadastromei');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed();
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')));
  await H.preparar(page, d); await page.goto(H.BASE); await page.waitForSelector('#lg-mei', { timeout: 8000 });

  // C1 "Sou MEI" abre o cadastro rápido numa tela só
  await page.click('#lg-mei'); await page.waitForSelector('#mei-cad', { timeout: 6000 });
  const c1 = await page.evaluate(() => ({ h: document.querySelector('.mcad-head h1').innerText, campos: ['mc-nome', 'mc-email', 'mc-senha', 'mc-cnpj', 'mc-atividade', 'mc-cidade'].every(id => !!document.getElementById(id)), ramos: document.querySelectorAll('[data-seg]').length }));
  ok('C1 "Sou MEI" abre o cadastro rápido: acesso, CNPJ, o que faz, ramo e cidade numa tela só', /organizar o seu negócio/.test(c1.h) && c1.campos && c1.ramos === 9, JSON.stringify(c1));

  // C2 validações: nome sem sobrenome, CNPJ inválido, sem ramo, sem aceitar os termos
  await page.fill('#mc-nome', 'Zeca'); await page.fill('#mc-email', 'zeca@zeca.com.br'); await page.fill('#mc-senha', 'abc'); await page.fill('#mc-cnpj', '11.111.111/1111-11'); await page.click('#mc-enviar'); await H.dorme(300);
  const c2 = await page.$$eval('.ferr', x => x.map(e => e.innerText).join(' | '));
  ok('C2 recusa nome sem sobrenome, senha fraca, CNPJ inválido, sem atividade, sem ramo e sem aceitar os termos', /sobrenome/.test(c2) && /8 ou mais/.test(c2) && /CNPJ inválido/.test(c2) && /Conte o que você faz/.test(c2) && /ramo/.test(c2) && /aceite os termos/.test(c2), c2);

  // C3 preenche e começa: conta, MEI (status mei, porte MEI), acesso admin, autorizações e histórico; entra direto no Início do MEI
  await page.fill('#mc-nome', 'Zeca Souza'); await page.fill('#mc-senha', 'senhaBoa9'); await page.fill('#mc-cnpj', '33.000.167/0001-01'); await page.fill('#mc-negocio', 'Zeca Elétrica');
  await page.fill('#mc-atividade', 'Eletricista'); await page.click('[data-seg="Serviços"]'); await page.fill('#mc-cidade', 'Gravataí');
  await page.evaluate(() => document.querySelectorAll('[data-cons]').forEach(c => { if (['operacional', 'contrato', 'cobranca'].includes(c.dataset.cons)) c.checked = true; }));
  await page.check('#mc-termos'); await page.click('#mc-enviar');
  await page.waitForSelector('#mei-servicos .mh-serv', { timeout: 10000 });
  const S = await srv(), id = Object.keys(S.docs).find(k => /^empresas\/[^/]+$/.test(k) && S.docs[k].nome === 'Zeca Elétrica').split('/')[1], e = S.docs['empresas/' + id], uid = S.users['zeca@zeca.com.br'].uid;
  const pv = S.docs['empresas/' + id + '/privado/cadastro'], ac = S.docs['acessos/' + id + '_' + uid];
  ok('C3 cria a conta e o MEI (status "mei", só presta, porte MEI, atividade e ramo), acesso de administrador, autorizações e histórico; entra direto no Início do MEI',
    e.status === 'mei' && e.tipo === 'prestador' && e.cidade === 'Gravataí' && S.docs['cnpjs/33000167000101'].empresaId === id && pv.dados.porte === 'MEI' && pv.dados.atividade === 'Eletricista' && pv.dados.segmento === 'Serviços'
    && ac && ac.cargo === 'admin' && S.docs['consentimentos/' + uid + '_cursos'].aceite === false && Object.values(S.docs).some(x => x.acao === 'empresa.mei'), JSON.stringify({ e, dados: pv.dados }));

  // C4 a gestão está liberada sem esperar a análise; as telas da rede (demandas, contratos, notas) não aparecem; convite para completar
  const c4 = await page.evaluate(() => ({ menu: Array.from(document.querySelectorAll('#menu [data-mod]')).map(b => b.dataset.mod), convite: (document.getElementById('mei-rede') || {}).innerText || '', ola: document.getElementById('mh-ola').innerText }));
  ok('C4 "Olá, Zeca" com Agenda, Assistente e Meu negócio liberados (Dinheiro desligado), Notas a emitir e A receber (notas para a prestadora); sem Demandas e Contratos; convite para completar o cadastro',
    c4.ola === 'Olá, Zeca' && ['agenda', 'assistentemei', 'negocio', 'espelhos', 'titulos'].every(m => c4.menu.includes(m)) && !['dinheiro', 'ordens', 'contratos'].some(m => c4.menu.includes(m)) && /receber pedidos de empresas/.test(c4.convite), JSON.stringify(c4));

  // C5 o Dinheiro está desligado (pedido de 10/11/2026): sem o botão "Registrar" e sem o cartão "Este mês"
  await H.dorme(1200);
  const c5 = await page.evaluate(() => ({ fab: !!document.getElementById('mei-registrar'), mes: !(document.getElementById('mei-mes') || { hidden: true }).hidden }));
  ok('C5 sem o botão "Registrar" e sem o cartão "Este mês" (Dinheiro desligado)', !c5.fab && !c5.mes, JSON.stringify(c5));

  // C6 o convite abre "Meu cadastro" com "Completar cadastro para receber pedidos"
  await page.click('#mei-rede'); await page.waitForSelector('#mc-corrigir', { timeout: 6000 });
  const c6 = await page.evaluate(() => ({ bt: document.getElementById('mc-corrigir').innerText, txt: document.getElementById('mc-motivo').innerText }));
  ok('C6 o convite abre "Meu cadastro" com "Completar cadastro para receber pedidos"', /Completar cadastro para receber pedidos/.test(c6.bt) && /já usa o Conectwork/.test(c6.txt), JSON.stringify(c6));

  // C7 CNPJ que já tem cadastro: explica e não cria nada
  await page.click('#sair'); await page.waitForSelector('#lg-mei', { timeout: 6000 });
  await page.click('#lg-mei'); await page.waitForSelector('#mei-cad');
  await page.fill('#mc-nome', 'Outra Pessoa'); await page.fill('#mc-email', 'outra@outra.com.br'); await page.fill('#mc-senha', 'senhaBoa9'); await page.fill('#mc-cnpj', '33.000.167/0001-01');
  await page.fill('#mc-atividade', 'Pintor'); await page.click('[data-seg="Serviços"]'); await page.fill('#mc-cidade', 'Gravataí');
  await page.evaluate(() => document.querySelectorAll('[data-cons]').forEach(c => { if (['operacional', 'contrato', 'cobranca'].includes(c.dataset.cons)) c.checked = true; }));
  await page.check('#mc-termos'); await page.click('#mc-enviar'); await page.waitForSelector('#mc-e-cnpj', { timeout: 8000 });
  const c7 = await page.$eval('#mc-e-cnpj', x => x.innerText);
  ok('C7 CNPJ que já tem cadastro: explica e mantém o que foi preenchido', /já tem cadastro no Conectwork/.test(c7) && (await page.$eval('#mc-atividade', x => x.value)) === 'Pintor', c7);

  // C8 celular: a tela cabe sem rolar para o lado
  await page.setViewportSize({ width: 390, height: 844 }); await H.dorme(300);
  ok('C8 celular: o cadastro rápido cabe na tela', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));

  // C9 "Continuar com Google" no cadastro do MEI: o que já foi preenchido fica, a parte do acesso some e o MEI é criado na conta Google
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.click('#mc-sair'); await page.waitForSelector('#lg-mei', { timeout: 6000 }); await page.click('#lg-mei'); await page.waitForSelector('#mc-google', { timeout: 6000 });
  await page.fill('#mc-cnpj', '11.222.333/0001-81'); await page.fill('#mc-atividade', 'Pintor'); await page.click('[data-seg="Serviços"]'); await page.fill('#mc-cidade', 'Gravataí');
  await H.ctlSet(page, { social: { 'google.com': { email: 'Gui.Pinto@gmail.com', nome: 'Gui Pinto' } } });
  await page.click('#mc-google'); await page.waitForSelector('#mc-conta', { timeout: 10000 });
  const c9 = await page.evaluate(() => ({ conta: document.getElementById('mc-conta').innerText, semAcesso: !document.getElementById('mc-senha'), cnpj: document.getElementById('mc-cnpj').value, ativ: document.getElementById('mc-atividade').value }));
  await page.evaluate(() => document.querySelectorAll('[data-cons]').forEach(c => { if (['operacional', 'contrato', 'cobranca'].includes(c.dataset.cons)) c.checked = true; }));
  await page.check('#mc-termos'); await page.click('#mc-enviar'); await page.waitForSelector('#mei-servicos .mh-serv', { timeout: 10000 });
  const S9 = await srv(), uid9 = S9.users['gui.pinto@gmail.com'].uid, id9 = (S9.docs['cnpjs/11222333000181'] || {}).empresaId, ac9 = S9.docs['acessos/' + id9 + '_' + uid9];
  ok('C9 "Continuar com Google": guarda o que foi preenchido, some a parte da senha e cria o MEI na conta Google (admin), entrando no Início do MEI',
    /gui\.pinto@gmail\.com/.test(c9.conta) && c9.semAcesso && c9.cnpj === '11.222.333/0001-81' && c9.ativ === 'Pintor' && id9 && S9.docs['empresas/' + id9].status === 'mei' && ac9 && ac9.cargo === 'admin'
    && (await page.$eval('#mh-ola', e => e.innerText)) === 'Olá, Gui', JSON.stringify({ c9, id9 }));

  ok('Sem erros de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
