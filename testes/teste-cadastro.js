/* Teste de tela do cadastro de empresa: "Crie seu acesso", o essencial (cadastro simplificado, 12/11/2026), "Completar o cadastro" (as 6 etapas) com validações reais,
   rascunho só no navegador, CNPJ repetido, envio (empresa, área privada, CNPJ reservado, acesso admin,
   autorizações e histórico), protocolo, "Meu cadastro" e "Corrigir cadastro". Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('cadastro');

const CNPJ = '11.444.777/0001-61', CNPJ_USADO = '04.252.011/0001-10', CPF = '529.982.247-25', CEL = '(51) 99876-5432';

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed((d) => { d.docs['cnpjs/04252011000110'] = { empresaId: 'beta' }; });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  const log = () => page.evaluate(() => window.__mockLog);
  const titulo = () => page.$eval('#cad-titulo', e => e.innerText).catch(() => null);
  const erro = sel => page.$eval(sel, e => { const l = e.closest('label.f'); const m = l && l.querySelector('.ferr'); return m ? m.innerText : ''; }).catch(() => null);
  const preenche = async (pares) => { for (const [id, v] of pares) { const el = await page.$('#' + id); const tag = await el.evaluate(e => e.tagName); if (tag === 'SELECT') await page.selectOption('#' + id, v); else await page.fill('#' + id, v); } };
  const continuar = async () => { await page.click('#cad-proximo'); await H.dorme(250); };

  // C1 do login, "Cadastrar empresa" abre "Crie seu acesso"
  await H.preparar(page, d); await page.goto(H.BASE);
  await page.waitForSelector('#lg-cadastrar'); await page.click('#lg-cadastrar'); await page.waitForSelector('#cad-titulo');
  ok('C1 "Cadastrar empresa" no login abre "Crie seu acesso" (antes do essencial da empresa)', await titulo() === 'Crie seu acesso');

  // C2 validações do acesso
  await continuar();
  const c2a = [await erro('#cad-acesso-nome'), await erro('#cad-acesso-email'), await erro('#cad-acesso-senha')];
  await preenche([['cad-acesso-nome', 'Carla'], ['cad-acesso-email', 'carla@'], ['cad-acesso-senha', 'abcdefgh']]); await continuar();
  const c2b = [await erro('#cad-acesso-nome'), await erro('#cad-acesso-email'), await erro('#cad-acesso-senha')];
  await preenche([['cad-acesso-nome', 'Carla Nunes'], ['cad-acesso-email', 'carla.nova@delta.com.br'], ['cad-acesso-senha', 'Delta2026'], ['cad-acesso-senha2', 'Delta2027']]); await continuar();
  const c2c = await erro('#cad-acesso-senha2');
  ok('C2 acesso: pede nome e sobrenome, e-mail válido, senha forte (8+, letras e números) e as duas senhas iguais',
    c2a.every(Boolean) && /sobrenome/.test(c2b[0]) && /não parece válido/.test(c2b[1]) && /letras e números/.test(c2b[2]) && /não estão iguais/.test(c2c) && !(await log()).some(x => x[0] === 'criaConta'), JSON.stringify([c2a, c2b, c2c]));

  // C3 e-mail que já tem acesso
  await preenche([['cad-acesso-email', 'ana@alfa.com.br'], ['cad-acesso-senha2', 'Delta2026']]); await continuar(); await H.dorme(200);
  ok('C3 e-mail que já tem acesso: avisa no campo e sugere entrar', /já tem um acesso/.test(await erro('#cad-acesso-email')), await erro('#cad-acesso-email'));

  // C4 cria a conta, manda a confirmação do e-mail, grava o perfil e vai para "Sua empresa" (cadastro simplificado: 2 etapas)
  await page.fill('#cad-acesso-email', 'carla.nova@delta.com.br'); await continuar(); await page.waitForSelector('#cad-dados-cnpj', { timeout: 6000 }); await H.dorme(300);
  const l4 = await log(), docs4 = await srv();
  const uid = Object.keys(docs4).find(k => /^usuarios\//.test(k) && docs4[k].email === 'carla.nova@delta.com.br');
  ok('C4 cria a conta, envia a confirmação do e-mail, grava o perfil e abre "Sua empresa" (Etapa 1 de 2)',
    l4.some(x => x[0] === 'criaConta') && l4.some(x => x[0] === 'verificacao') && !!uid && docs4[uid].nome === 'Carla Nunes' && await titulo() === 'Sua empresa'
    && await page.$eval('.stepno', e => e.innerText) === 'Etapa 1 de 2' && !(await page.$('#cad-end-cep')) && !(await page.$('#cad-dados-cnae')), JSON.stringify({ uid, t: await titulo() }));
  const UID = uid.split('/')[1];

  // C5 o essencial: tipo, CNPJ pelo dígito, razão social, responsável (já vem do login) e celular; CNPJ que já existe
  await page.fill('#cad-resp-nome', ''); await continuar();
  const c5a = await page.$$eval('#cad .has-err', x => x.length);
  await page.click('[data-tipo="ambos"]');
  await preenche([['cad-dados-cnpj', '11.111.111/1111-11'], ['cad-dados-razao', 'Delta Manutenção Ltda'], ['cad-dados-fantasia', 'Delta'], ['cad-resp-nome', 'Carla'], ['cad-resp-cel', '(51) 3333-4444']]);
  await continuar();
  const c5b = [await erro('#cad-dados-cnpj'), await erro('#cad-resp-nome'), await erro('#cad-resp-cel')];
  await preenche([['cad-dados-cnpj', CNPJ_USADO], ['cad-resp-nome', 'Carla Nunes'], ['cad-resp-cel', CEL]]); await continuar(); await H.dorme(200);
  const c5c = await erro('#cad-dados-cnpj');
  ok('C5 o essencial: campos obrigatórios, CNPJ pelo dígito, nome e sobrenome, celular real e CNPJ que já tem cadastro', c5a >= 4 && /CNPJ inválido/.test(c5b[0]) && /sobrenome/.test(c5b[1]) && /Celular inválido/.test(c5b[2]) && /já tem cadastro/.test(c5c), JSON.stringify({ c5a, c5b, c5c }));

  // C6 certo → Confirmar (com o resumo); a máscara do CNPJ funciona
  await page.fill('#cad-dados-cnpj', ''); await page.type('#cad-dados-cnpj', '11444777000161'); const mascara = await page.$eval('#cad-dados-cnpj', e => e.value);
  await continuar(); await page.waitForSelector('#cad-resumo');
  const res6 = await page.$eval('#cad-resumo', e => e.innerText);
  ok('C6 o essencial certo vai para Confirmar, com o resumo e o aviso de que o resto fica para depois', mascara === CNPJ && await titulo() === 'Confirmar' && /Delta Manutenção Ltda/.test(res6) && /Contrata e presta/.test(res6) && !!(await page.$('#cad-depois')), mascara);

  // C7 recarregar no meio: continua de onde parou; nada foi para o banco ainda
  await page.reload(); await page.waitForSelector('#cad-titulo', { timeout: 8000 }); await H.dorme(200);
  const c7 = { t: await titulo(), banco: Object.keys(await srv()).filter(k => /empresas\/|cnpjs\/11444/.test(k) && !/alfa|beta|gama/.test(k)), rasc: await page.evaluate(u => !!localStorage.getItem('cw.cad.' + u), UID) };
  ok('C7 recarregou: continua em Confirmar; nada foi para o banco ainda', c7.t === 'Confirmar' && c7.rasc && !c7.banco.length, JSON.stringify(c7));

  // C10 Confirmar: declarações e autorizações separadas (cursos e ofertas desmarcados por padrão)
  const c10a = await page.$$eval('[data-cons]', x => x.map(c => [c.dataset.cons, c.checked]));
  await continuar(); const c10b = await page.$eval('#cad-erro', e => e.innerText).catch(() => '');
  await page.click('[data-texto="termos"]'); await page.waitForSelector('dialog[open]'); const c10c = await page.$eval('dialog[open]', e => e.innerText); await page.click('dialog[open] [data-dlg-b="0"]');
  ok('C10 confirmar: autorizações separadas; WhatsApp e e-mail marcados, cursos e ofertas DESMARCADOS; sem marcar as obrigatórias não envia',
    JSON.stringify(c10a) === JSON.stringify([['operacional', false], ['contrato', false], ['cobranca', false], ['whatsapp', true], ['email', true], ['cursos', false], ['ofertas', false]]) && /declarações e as autorizações obrigatórias/.test(c10b) && /Termos de uso/.test(c10c),
    JSON.stringify({ c10a, c10b }));

  // C11 envio: tudo numa transação; empresa entra com o essencial (status basico); protocolo; rascunho apagado
  for (const k of ['verdade', 'termos']) await page.check(`[data-aceite="${k}"]`);
  for (const k of ['operacional', 'contrato', 'cobranca']) await page.check(`[data-cons="${k}"]`);
  await page.uncheck('[data-cons="whatsapp"]');
  await continuar(); await page.waitForSelector('#cad-protocolo', { timeout: 6000 });
  const prot = await page.$eval('#cad-protocolo', e => e.innerText), docs = await srv(), ano = new Date().getFullYear(), fim11 = await page.$eval('#cad-fim', e => e.innerText);
  const empK = Object.keys(docs).find(k => /^empresas\/[^/]+$/.test(k) && docs[k].cnpjNum === '11444777000161'), EMP = empK && empK.split('/')[1];
  const e11 = docs[empK] || {}, p11 = docs['empresas/' + EMP + '/privado/cadastro'] || {}, a11 = docs['acessos/' + EMP + '_' + UID] || {};
  const cons = ['operacional', 'contrato', 'cobranca', 'whatsapp', 'email', 'cursos', 'ofertas'].map(k => [k, (docs['consentimentos/' + UID + '_' + k] || {}).aceite]);
  const logs = Object.values(docs).filter(x => x.acao === 'empresa.cadastrar' && x.empresaId === EMP);
  const rascunho = await page.evaluate(u => localStorage.getItem('cw.cad.' + u), UID);
  ok('C11 envio: protocolo CW-AAAA-0001, empresa com o essencial (Falta completar) sem plano nem módulos, CNPJ reservado, acesso admin, 7 autorizações, histórico; rascunho apagado',
    prot === `CW-${ano}-0001` && e11.status === 'basico' && e11.tipo === 'ambos' && e11.nome === 'Delta' && e11.razao === 'Delta Manutenção Ltda' && e11.cnpj === CNPJ && !('modulos' in e11) && !('plano' in e11)
    && p11.resp && p11.resp.cel === CEL && p11.resp.nome === 'Carla Nunes' && p11.cadastroRapido === true && !p11.banco && (docs['cnpjs/11444777000161'] || {}).empresaId === EMP
    && a11.cargo === 'admin' && a11.ativo === true && JSON.stringify(cons) === JSON.stringify([['operacional', true], ['contrato', true], ['cobranca', true], ['whatsapp', false], ['email', true], ['cursos', false], ['ofertas', false]])
    && logs.length === 1 && /Falta completar/.test(logs[0].texto) && rascunho === null && /complete o cadastro/.test(fim11) && (await log()).some(x => x[0] === 'transacao'),
    JSON.stringify({ prot, st: e11.status, cons, logs: logs.length, rascunho }));

  // C12 entra no app: Início com "Completar o cadastro", Meu cadastro com a lista do que falta e o botão
  await page.click('#cad-entrar'); await page.waitForSelector('#menu', { timeout: 8000 }); await H.dorme(300);
  const menu = await page.$$eval('#menu [data-mod]', x => x.map(b => b.dataset.mod));
  const ini12 = !!(await page.$('#ini-completar'));
  await page.evaluate(() => { location.hash = '#meucadastro'; }); await page.waitForSelector('#mc-protocolo'); await H.dorme(200);
  const c12 = { menu, ini12, prot: await page.$eval('#mc-protocolo', e => e.innerText), bt: await page.$eval('#mc-corrigir', e => e.innerText).catch(() => ''), pill: await page.$eval('#mc-situacao .pill', e => e.innerText), falta: await page.$eval('#mc-falta', e => e.innerText).catch(() => '') };
  ok('C12 entra no app com a empresa cadastrada: menu Início + Meu cadastro + Documentos; Início e Meu cadastro mostram o que falta e "Completar o cadastro"',
    JSON.stringify(menu) === '["inicio","meucadastro","documentos"]' && c12.ini12 && c12.prot === prot && /Completar o cadastro/.test(c12.bt) && c12.pill === 'Falta completar' && /Endereço/.test(c12.falta) && /Documentos/.test(c12.falta), JSON.stringify(c12));

  // C8 "Completar o cadastro" abre as 6 etapas com o CNPJ travado: dados fiscais, endereço, responsável (CPF real), banco (Pix CNPJ)
  await page.click('#mc-corrigir'); await page.waitForSelector('#cad-dados-razao');
  const t8 = await titulo(), trava8 = await page.$eval('#cad-dados-cnpj', e => e.disabled), razao8 = await page.$eval('#cad-dados-razao', e => e.value);
  await continuar(); const c8z = await page.$$eval('#cad .has-err', x => x.length);
  await preenche([['cad-dados-abertura', '2019-03-10'], ['cad-dados-porte', 'Microempresa (ME)'], ['cad-dados-regime', 'Simples Nacional'], ['cad-dados-cnae', '3314-7/10 Manutenção de máquinas'], ['cad-dados-im', '12345']]);
  await continuar(); await page.waitForSelector('#cad-end-cep');
  await page.fill('#cad-end-cep', '94000'); await continuar(); const c8a = await erro('#cad-end-cep');
  await preenche([['cad-end-cep', '94000-000'], ['cad-end-logradouro', 'Rua das Flores'], ['cad-end-numero', '100'], ['cad-end-bairro', 'Centro'], ['cad-end-cidade', 'Gravataí'], ['cad-end-uf', 'RS']]);
  await continuar(); await page.waitForSelector('#cad-resp-cpf');
  const nomeResp = await page.$eval('#cad-resp-nome', e => e.value), celResp = await page.$eval('#cad-resp-cel', e => e.value);
  await preenche([['cad-resp-cpf', '123.456.789-00'], ['cad-resp-cargo', 'Sócia']]); await continuar();
  const c8b = await erro('#cad-resp-cpf');
  await preenche([['cad-resp-cpf', CPF]]); await continuar(); await page.waitForSelector('#cad-banco-banco');
  await preenche([['cad-banco-banco', '341 · Itaú Unibanco'], ['cad-banco-tipoConta', 'Corrente'], ['cad-banco-agencia', '1234'], ['cad-banco-conta', '56789-0'], ['cad-banco-pixTipo', 'CNPJ'], ['cad-banco-pix', '00.000.000/0001-91']]);
  await continuar(); const c8c = await erro('#cad-banco-pix');
  await page.fill('#cad-banco-pix', CNPJ); await continuar(); await page.waitForSelector('[data-doc]');
  ok('C8 "Completar o cadastro": as 6 etapas com o CNPJ travado e o que já tinha; dados fiscais, CEP com 8 números, responsável e celular já vêm, CPF real, Pix CNPJ = CNPJ da empresa',
    t8 === 'Completar o cadastro · Tipo e empresa' && trava8 && razao8 === 'Delta Manutenção Ltda' && c8z >= 4 && /8 números/.test(c8a) && nomeResp === 'Carla Nunes' && celResp === CEL && /CPF inválido/.test(c8b) && /CNPJ da empresa/.test(c8c) && await titulo() === 'Completar o cadastro · Documentos',
    JSON.stringify({ t8, trava8, c8z, c8a, nomeResp, c8b, c8c }));

  // C9 Documentos: podem ficar para depois; recusa arquivo de mais de 10 MB e formato errado; não pede certificado digital
  const c9a = !!(await page.$('#cad-docs-depois'));
  await page.setInputFiles('[data-doc="contrato"]', { name: 'grande.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(11 * 1024 * 1024) }); await H.dorme(150);
  const c9b = await page.$eval('#cad-doc-contrato', e => e.innerText);
  await page.setInputFiles('[data-doc="cartao"]', { name: 'planilha.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('x') }); await H.dorme(150);
  const c9c = await page.$eval('#cad-doc-cartao', e => e.innerText);
  await page.setInputFiles('[data-doc="endereco"]', { name: 'conta-luz.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(2048) }); await H.dorme(150);
  const c9d = { certificado: await page.$('[data-doc="certificado"]'), nome: await page.$eval('#cad-doc-endereco', e => e.innerText) };
  await continuar();
  ok('C9 documentos: podem ficar para depois (segue com 1 de 4), recusa arquivo de mais de 10 MB e formato errado, guarda nome e tamanho; não pede certificado digital',
    c9a && /10 MB/.test(c9b) && /PDF, JPG ou PNG/.test(c9c) && !c9d.certificado && /conta-luz\.jpg · 2 KB/.test(c9d.nome) && await titulo() === 'Completar o cadastro · Revisão', JSON.stringify({ c9a, c9b, c9c, nome: c9d.nome }));
  await page.check('[data-aceite="verdade"]'); await continuar(); await page.waitForSelector('#cad-fim', { timeout: 6000 });
  const d9 = await srv(), e9 = d9['empresas/' + EMP], p9 = d9['empresas/' + EMP + '/privado/cadastro'], log9 = Object.values(d9).filter(x => x.acao === 'empresa.completar');
  ok('C9b completar envia para aprovação: empresa em análise, área privada completa, cidade e histórico',
    e9.status === 'analise' && e9.cidade === 'Gravataí' && p9.resp.cpf === CPF && p9.banco.agencia === '1234' && p9.docs.endereco.nome === 'conta-luz.jpg' && log9.length === 1 && /Cadastro completo enviado/.test(await page.$eval('#cad-fim', e => e.innerText)),
    JSON.stringify({ st: e9.status, log: log9.length }));
  await page.click('#cad-entrar'); await page.waitForSelector('#menu', { timeout: 8000 });

  // C13 equipe pede ajuste → "Corrigir cadastro" com o motivo; CNPJ travado; reenvia em análise e grava no histórico
  await page.evaluate(id => { const s = JSON.parse(localStorage.getItem('__srv')); Object.assign(s.docs['empresas/' + id], { status: 'pendencia', motivo: 'O comprovante de endereço está ilegível.' }); localStorage.setItem('__srv', JSON.stringify(s)); }, EMP);
  await page.reload(); await page.waitForSelector('#menu', { timeout: 8000 }); await page.evaluate(() => { location.hash = '#meucadastro'; }); await page.waitForSelector('#mc-corrigir', { timeout: 6000 });
  const motivo = await page.$eval('#mc-motivo', e => e.innerText);
  await page.click('#mc-corrigir'); await page.waitForSelector('#cad-dados-razao');
  const c13 = { motivo, t: await titulo(), cnpjTrava: await page.$eval('#cad-dados-cnpj', e => e.disabled), razao: await page.$eval('#cad-dados-razao', e => e.value), banner: await page.$eval('#cad .banner.warn', e => e.innerText).catch(() => '') };
  await page.fill('#cad-dados-razao', 'Delta Manutenção Industrial Ltda');
  for (let i = 0; i < 5; i++) { await continuar(); await page.waitForSelector('#cad-titulo'); }
  await page.check('[data-aceite="verdade"]'); await continuar(); await page.waitForSelector('#cad-fim', { timeout: 6000 });
  const d13 = await srv(), e13 = d13['empresas/' + EMP], log13 = Object.values(d13).filter(x => x.acao === 'empresa.corrigir');
  ok('C13 ajuste pedido: mostra o motivo, "Corrigir cadastro" abre as etapas com tudo preenchido e o CNPJ travado; reenvia em análise e registra no histórico',
    /ilegível/.test(c13.motivo) && c13.t === 'Corrigir cadastro · Tipo e empresa' && c13.cnpjTrava && c13.razao === 'Delta Manutenção Ltda' && /ilegível/.test(c13.banner)
    && e13.status === 'analise' && e13.razao === 'Delta Manutenção Industrial Ltda' && e13.cnpj === CNPJ && log13.length === 1, JSON.stringify({ c13, st: e13.status, log: log13.length }));
  await page.click('#cad-entrar'); await page.waitForSelector('#menu', { timeout: 8000 });

  // C14 pessoa já logada e sem empresa: pula "Crie seu acesso" e já vem com o e-mail do login
  await page.click('#sair'); await page.waitForSelector('#lg-email');
  await H.entrar(page, 'carla@outra.com.br', 'senha123'); await page.waitForSelector('#sa-cadastrar', { timeout: 8000 });
  await page.click('#sa-cadastrar'); await page.waitForSelector('#cad-titulo');
  const c14 = { t: await titulo(), passos: await page.$$eval('.wsteps li', x => x.length) };
  ok('C14 já logada sem empresa: "Cadastrar minha empresa" começa direto em "Sua empresa"', c14.t === 'Sua empresa', JSON.stringify(c14));

  // C15 celular: barra de cima com a etapa, sem rolagem para o lado
  await page.setViewportSize({ width: 390, height: 844 }); await H.dorme(250);
  const c15 = await page.evaluate(() => ({ barra: document.querySelector('.wiz-side .mbar').innerText.replace(/\s+/g, ' '), lado: document.documentElement.scrollWidth > innerWidth, passosVis: getComputedStyle(document.querySelector('.wsteps')).display }));
  const c15b = await page.evaluate(() => { document.documentElement.style.setProperty('--sa-t', '47px');
    const r = { fonte: Math.min(...Array.from(document.querySelectorAll('#cad input:not([type=checkbox]):not([type=file]), #cad select')).map(i => parseFloat(getComputedStyle(i).fontSize))),
      htmlTopo: getComputedStyle(document.documentElement).paddingTop, barraTopo: getComputedStyle(document.querySelector('.wiz-side')).paddingTop };
    document.documentElement.style.removeProperty('--sa-t'); return r; });
  ok('C15b celular: campos com letra 16px (o iPhone não dá zoom) e a área da ilha entra uma vez só no topo', c15b.fonte >= 16 && c15b.htmlTopo === '0px' && c15b.barraTopo === '59px', JSON.stringify(c15b));
  ok('C15 celular: barra de cima "Etapa 1 de 2", lista de etapas escondida, sem rolagem para o lado', /Etapa 1 de 2/.test(c15.barra) && !c15.lado && c15.passosVis === 'none', JSON.stringify(c15));
  await page.setViewportSize({ width: 1280, height: 900 });

  // C16 Sair do cadastro: pergunta e volta para a tela de antes; o rascunho fica
  await page.click('[data-tipo="contratante"]'); await page.click('#cad-sair'); await page.waitForSelector('dialog[open]');
  await page.click('dialog[open] [data-dlg-b="1"]'); await page.waitForSelector('#sa-cadastrar', { timeout: 6000 });
  const c16 = await page.evaluate(() => { const r = JSON.parse(localStorage.getItem('cw.cad.uCARLA') || 'null'); return r && r.d.tipo; });
  await page.click('#sa-cadastrar'); await page.waitForSelector('#cad-titulo');
  const c16b = await page.$eval('[data-tipo="contratante"]', e => e.getAttribute('aria-checked'));
  ok('C16 "Sair" pergunta, volta para a tela anterior e guarda o rascunho; ao voltar continua de onde parou', c16 === 'contratante' && c16b === 'true', JSON.stringify({ c16, c16b }));

  ok('Sem erros de JavaScript na página', !erros.length, erros.join(' | '));
  await browser.close(); fim();
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
