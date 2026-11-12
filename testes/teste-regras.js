/* Testes das regras do Firestore (firestore.rules) no emulador, com @firebase/rules-unit-testing.
   Rodar (de dentro de testes/):  npm run regras
   Precisa de Java 11+ instalado (o emulador do Firestore roda em Java). */
const fs = require('fs'), path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, getDocs, serverTimestamp, setLogLevel, writeBatch, orderBy, limit } = require('firebase/firestore');
setLogLevel('silent');   /* as negações esperadas não poluem a saída */

const res = [];
const ok = (n, cond, det) => { res.push({ n, ok: !!cond, det }); console.log((cond ? 'PASSOU ' : 'FALHOU ') + n + (det ? ' — ' + det : '')); };
/* espera sucesso ou negação e registra o resultado */
async function deve(nome, permitido, op) {
  try { await (permitido ? assertSucceeds(op()) : assertFails(op())); ok(nome, true); }
  catch (e) { ok(nome, false, (permitido ? 'foi negado: ' : 'foi permitido: ') + String(e && e.message || e).split('\n')[0]); }
}

(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
  const env = await initializeTestEnvironment({
    projectId: 'demo-conectwork',
    firestore: { host, port: Number(port), rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') }
  });

  /* Pessoas: Ana (admin da Alfa, em análise), Bruno (financeiro da Alfa), Carla (sem acesso), Duda (bloqueada na Alfa),
     Edu (convidado da Alfa), Iasmyn (equipe Conectwork). Empresas: alfa (em análise), beta (aprovada). */
  const P = { ana: 'uANA', bruno: 'uBRUNO', carla: 'uCARLA', duda: 'uDUDA', edu: 'uEDU', master: 'uMASTER' };
  const EM = { ana: 'ana@alfa.com.br', bruno: 'bruno@alfa.com.br', carla: 'carla@outra.com.br', duda: 'duda@alfa.com.br', edu: 'edu@alfa.com.br', master: 'iasmyn@conectwork.com.br' };
  const db = k => env.authenticatedContext(P[k], { email: EM[k], email_verified: true }).firestore();
  const anon = () => env.unauthenticatedContext().firestore();

  async function semear() {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async c => {
      const d = c.firestore();
      await setDoc(doc(d, 'master', P.master), { nome: 'Iasmyn' });
      await setDoc(doc(d, 'empresas', 'alfa'), { nome: 'Alfa', razao: 'Alfa Serviços Ltda', cnpj: '11.222.333/0001-81', status: 'analise', tipo: 'prestador', criadoPor: P.ana });
      await setDoc(doc(d, 'empresas', 'beta'), { nome: 'Beta', razao: 'Beta Indústria Ltda', cnpj: '45.723.174/0001-10', status: 'aprovado', tipo: 'contratante', criadoPor: 'uOUTRO', modulos: ['cobrancas'] });
      await setDoc(doc(d, 'empresas', 'alfa', 'privado', 'cadastro'), { resp: { nome: 'Ana' }, banco: { banco: '001' } });
      await setDoc(doc(d, 'acessos', 'alfa_' + P.ana), { uid: P.ana, empresaId: 'alfa', nome: 'Ana', email: EM.ana, cargo: 'admin', extras: [], sem: [], ativo: true });
      await setDoc(doc(d, 'acessos', 'alfa_' + P.bruno), { uid: P.bruno, empresaId: 'alfa', nome: 'Bruno', email: EM.bruno, cargo: 'financeiro', extras: [], sem: [], ativo: true });
      await setDoc(doc(d, 'acessos', 'alfa_' + P.duda), { uid: P.duda, empresaId: 'alfa', nome: 'Duda', email: EM.duda, cargo: 'admin', extras: [], sem: [], ativo: false });
      await setDoc(doc(d, 'convites', 'tok123'), { email: EM.edu, empresaId: 'alfa', cargo: 'operacional', nome: 'Edu', criadoPor: P.ana, usado: false });
      await setDoc(doc(d, 'log', 'l1'), { em: new Date(), uid: P.ana, quem: 'Ana', empresaId: 'alfa', acao: 'teste', texto: 'Registro de teste.', ref: '' });
    });
  }
  await semear();

  /* ---------- empresas ---------- */
  await deve('Pessoa sem acesso NÃO lê empresa em análise de outra', false, () => getDoc(doc(db('carla'), 'empresas', 'alfa')));
  await deve('Pessoa sem acesso NÃO lê a área privada de outra empresa', false, () => getDoc(doc(db('carla'), 'empresas', 'alfa', 'privado', 'cadastro')));
  await deve('Pessoa logada lê empresa aprovada da rede', true, () => getDoc(doc(db('carla'), 'empresas', 'beta')));
  await deve('Sem login NÃO lê nem empresa aprovada', false, () => getDoc(doc(anon(), 'empresas', 'beta')));
  await deve('Membro lê a própria empresa (mesmo em análise)', true, () => getDoc(doc(db('bruno'), 'empresas', 'alfa')));
  await deve('Membro lê a área privada da própria empresa', true, () => getDoc(doc(db('bruno'), 'empresas', 'alfa', 'privado', 'cadastro')));
  await deve('Membro bloqueado (ativo=false) NÃO lê a empresa em análise', false, () => getDoc(doc(db('duda'), 'empresas', 'alfa')));
  /* cadastro novo (como o app grava, tudo numa operação só): empresa em análise + CNPJ reservado + área privada +
     acesso admin do fundador + autorizações + histórico. Plano e módulos só a equipe master define. */
  const CN = { a: '11444777000161', b: '04252011000110' };
  const cadastro = (k, emp, extra, op) => {
    op = op || {};
    const d = db(k), b = writeBatch(d), num = op.num || CN.a;
    b.set(doc(d, 'empresas', emp), Object.assign({ tipo: 'contratante', status: 'analise', nome: 'Nova', razao: 'Nova Ltda', cnpj: num, cnpjNum: num, cidade: 'Gravataí', uf: 'RS', protocolo: 'CW-2026-0001', criadoPor: P[k], criadoEm: serverTimestamp(), enviadoEm: serverTimestamp() }, extra || {}));
    if (!op.semCnpj) b.set(doc(d, 'cnpjs', num), { empresaId: op.cnpjPara || emp, criadoEm: serverTimestamp() });
    b.set(doc(d, 'empresas', emp, 'privado', 'cadastro'), { resp: { nome: 'Carla' }, banco: { banco: '001' } });
    b.set(doc(d, 'acessos', emp + '_' + P[k]), { uid: P[k], empresaId: emp, nome: 'Carla', email: EM[k], cargo: 'admin', extras: [], sem: [], ativo: true, criadoEm: serverTimestamp() });
    b.set(doc(d, 'consentimentos', P[k] + '_operacional'), { uid: P[k], finalidade: 'operacional', aceite: true, texto: 'Usar os dados.', textoVersao: 'v1', canal: 'cadastro', em: serverTimestamp() });
    b.set(doc(collection(d, 'log')), { em: serverTimestamp(), uid: P[k], quem: 'Carla', empresaId: emp, acao: 'empresa.cadastrar', texto: 'Cadastro enviado.', ref: emp });
    return b.commit();
  };
  await deve('Cadastro completo: empresa em análise, CNPJ reservado, área privada, acesso admin, autorização e histórico juntos', true, () => cadastro('carla', 'nova1'));
  await deve('CNPJ repetido NÃO entra (outra empresa com o mesmo CNPJ)', false, () => cadastro('edu', 'nova2'));
  await deve('Cadastro NÃO entra sem reservar o CNPJ', false, () => cadastro('edu', 'nova3', null, { num: CN.b, semCnpj: true }));
  await deve('Reserva de CNPJ NÃO aponta para empresa de outra pessoa', false, () => setDoc(doc(db('edu'), 'cnpjs', CN.b), { empresaId: 'alfa', criadoEm: serverTimestamp() }));
  await deve('CNPJ reservado NÃO pode ser apagado nem trocado', false, () => updateDoc(doc(db('carla'), 'cnpjs', CN.a), { empresaId: 'outra' }));
  await deve('Pessoa logada consulta se um CNPJ já tem cadastro', true, () => getDoc(doc(db('edu'), 'cnpjs', CN.a)));
  await deve('Cadastro novo NÃO escolhe o próprio plano', false, () => cadastro('edu', 'nova4', { plano: 'rede' }, { num: CN.b }));
  await deve('Cadastro novo NÃO liga módulos', false, () => cadastro('edu', 'nova5', { modulos: ['contratos'] }, { num: CN.b }));
  await deve('Cadastro novo NÃO nasce aprovado', false, () => cadastro('edu', 'nova6', { status: 'aprovado' }, { num: CN.b }));
  await deve('Cadastro NÃO é criado em nome de outra pessoa', false, () => cadastro('edu', 'nova7', { criadoPor: P.ana }, { num: CN.b }));
  await deve('Cadastro NÃO aceita data escolhida pelo aparelho', false, () => cadastro('edu', 'nova8', { criadoEm: new Date('2020-01-01') }, { num: CN.b }));
  await deve('Fundador NÃO cria acesso admin em empresa que não cadastrou', false, () => setDoc(doc(db('edu'), 'acessos', 'beta_' + P.edu), { uid: P.edu, empresaId: 'beta', cargo: 'admin', ativo: true }));
  /* contador do protocolo */
  await deve('Contador do protocolo começa em 1', true, () => setDoc(doc(db('carla'), 'contadores', 'protocolo'), { ano: 2026, n: 1 }));
  await deve('Contador do protocolo anda de 1 em 1', true, () => updateDoc(doc(db('carla'), 'contadores', 'protocolo'), { n: 2 }));
  await deve('Contador do protocolo NÃO pula números', false, () => updateDoc(doc(db('carla'), 'contadores', 'protocolo'), { n: 10 }));
  await deve('Contador do protocolo NÃO volta', false, () => updateDoc(doc(db('carla'), 'contadores', 'protocolo'), { n: 1 }));
  await deve('Contador do protocolo recomeça em 1 no ano novo', true, () => setDoc(doc(db('carla'), 'contadores', 'protocolo'), { ano: 2027, n: 1 }));
  /* autorizações */
  const cons = (k, extra) => Object.assign({ uid: P[k], finalidade: 'cursos', aceite: false, texto: 'Cursos.', textoVersao: 'v1', canal: 'cadastro', em: serverTimestamp() }, extra || {});
  await deve('Pessoa registra a própria autorização', true, () => setDoc(doc(db('edu'), 'consentimentos', P.edu + '_cursos'), cons('edu')));
  await deve('Autorização NÃO é registrada em nome de outra pessoa', false, () => setDoc(doc(db('edu'), 'consentimentos', P.ana + '_cursos'), cons('edu', { uid: P.ana })));
  await deve('Autorização NÃO aceita finalidade inventada', false, () => setDoc(doc(db('edu'), 'consentimentos', P.edu + '_venda'), cons('edu', { finalidade: 'venda' })));
  await deve('Autorização NÃO aceita data escolhida pelo aparelho', false, () => setDoc(doc(db('edu'), 'consentimentos', P.edu + '_cursos'), cons('edu', { em: new Date('2020-01-01') })));
  await deve('Histórico de autorizações grava', true, () => addDoc(collection(db('edu'), 'consentimentos_log'), cons('edu')));
  await deve('Pessoa NÃO lê autorizações de outra', false, () => getDoc(doc(db('carla'), 'consentimentos', P.edu + '_cursos')));
  /* correção do cadastro (ajuste pedido) */
  await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'empresas', 'nova1'), { status: 'pendencia', motivo: 'Comprovante de endereço ilegível.' }));
  await deve('Fundador reenvia o cadastro corrigido quando foi pedido ajuste', true, () => updateDoc(doc(db('carla'), 'empresas', 'nova1'), { status: 'analise', razao: 'Nova Serviços Ltda', enviadoEm: serverTimestamp() }));
  await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'empresas', 'nova1'), { status: 'pendencia' }));
  await deve('Na correção o CNPJ NÃO muda', false, () => updateDoc(doc(db('carla'), 'empresas', 'nova1'), { status: 'analise', cnpj: '04252011000110' }));
  await deve('Na correção a empresa NÃO se aprova sozinha', false, () => updateDoc(doc(db('carla'), 'empresas', 'nova1'), { status: 'aprovado' }));
  await deve('Admin NÃO aprova a própria empresa (status só a equipe master muda)', false, () => updateDoc(doc(db('ana'), 'empresas', 'alfa'), { status: 'aprovado' }));
  await deve('Admin NÃO escolhe o próprio plano nem liga módulos', false, () => updateDoc(doc(db('ana'), 'empresas', 'alfa'), { plano: 'rede', modulos: ['contratos'] }));
  await deve('Admin NÃO marca os próprios documentos como conferidos', false, () => updateDoc(doc(db('ana'), 'empresas', 'alfa', 'privado', 'cadastro'), { conferidos: { contrato: { nome: 'x.pdf' } } }));
  await deve('Equipe master marca documento como conferido', true, () => updateDoc(doc(db('master'), 'empresas', 'alfa', 'privado', 'cadastro'), { conferidos: { contrato: { nome: 'x.pdf', em: serverTimestamp(), por: 'Iasmyn' } } }));
  await deve('Equipe master grava a decisão no histórico da empresa analisada', true, () => addDoc(collection(db('master'), 'log'), { em: serverTimestamp(), uid: P.master, quem: 'Iasmyn', empresaId: 'alfa', acao: 'empresa.aprovar', texto: 'Cadastro aprovado.', ref: 'alfa' }));
  await deve('Equipe master pede ajuste com motivo', true, () => updateDoc(doc(db('master'), 'empresas', 'alfa'), { status: 'pendencia', motivo: 'Comprovante ilegível.' }));
  await deve('Equipe master aprova empresa com plano e módulos', true, () => updateDoc(doc(db('master'), 'empresas', 'alfa'), { status: 'aprovado', plano: 'essencial', modulos: ['equipe', 'cobrancas'], motivo: '' }));
  await deve('Equipe master lista os cadastros de todas as empresas', true, () => getDocs(collection(db('master'), 'empresas')));
  /* pré-cadastro pela equipe (09/11/2026): só CNPJ, já aprovada, documentos pendentes */
  const pre = { status: 'aprovado', preCadastro: true, plano: 'essencial', modulos: ['equipe', 'cobrancas'], avaliadoEm: serverTimestamp(), avaliadoPor: 'Iasmyn', razao: '', cidade: '', uf: '' };
  await deve('Equipe master pré-cadastra empresa já aprovada (CNPJ reservado, ela como admin e histórico)', true, () => cadastro('master', 'pre1', pre, { num: '12345678000195' }));
  await deve('Empresa comum NÃO se pré-cadastra aprovada', false, () => cadastro('edu', 'pre2', pre, { num: '60746948000112' }));
  await deve('Equipe master NÃO cria empresa aprovada sem marcar o pré-cadastro', false, () => cadastro('master', 'pre3', Object.assign({}, pre, { preCadastro: false }), { num: '60746948000112' }));
  await deve('Pré-cadastro NÃO entra sem reservar o CNPJ', false, () => cadastro('master', 'pre4', pre, { num: '60746948000112', semCnpj: true }));
  await deve('Empresa NÃO lista os cadastros das outras', false, () => getDocs(collection(db('ana'), 'empresas')));
  await semear();

  /* ---------- acessos ---------- */
  await deve('Admin NÃO altera o próprio cargo', false, () => updateDoc(doc(db('ana'), 'acessos', 'alfa_' + P.ana), { cargo: 'financeiro' }));
  await deve('Admin NÃO libera telas extras para si mesmo', false, () => updateDoc(doc(db('ana'), 'acessos', 'alfa_' + P.ana), { extras: ['tudo'] }));
  await deve('Admin altera o cargo de outra pessoa da empresa', true, () => updateDoc(doc(db('ana'), 'acessos', 'alfa_' + P.bruno), { cargo: 'rh' }));
  await deve('Admin NÃO troca a empresa (empresaId) de um acesso', false, () => updateDoc(doc(db('ana'), 'acessos', 'alfa_' + P.bruno), { empresaId: 'beta' }));
  await deve('Financeiro NÃO altera o cargo de ninguém', false, () => updateDoc(doc(db('bruno'), 'acessos', 'alfa_' + P.ana), { cargo: 'consulta' }));
  await deve('Financeiro NÃO se promove a admin', false, () => updateDoc(doc(db('bruno'), 'acessos', 'alfa_' + P.bruno), { cargo: 'admin' }));
  await deve('Pessoa lista os próprios acessos (consulta do login: where uid == meu uid)', true, () => getDocs(query(collection(db('bruno'), 'acessos'), where('uid', '==', P.bruno))));
  await deve('Pessoa NÃO lista acessos de outra pessoa', false, () => getDocs(query(collection(db('carla'), 'acessos'), where('uid', '==', P.bruno))));
  await deve('Pessoa NÃO cria acesso para si sem convite', false, () => setDoc(doc(db('carla'), 'acessos', 'alfa_' + P.carla), { uid: P.carla, empresaId: 'alfa', cargo: 'admin', ativo: true }));
  /* Meus dados (09/11/2026): a pessoa acerta nome e e-mail no próprio acesso; o e-mail tem que ser o do login */
  await deve('Pessoa acerta o próprio nome no acesso (Meus dados)', true, () => updateDoc(doc(db('bruno'), 'acessos', 'alfa_' + P.bruno), { nome: 'Bruno Lima', atualizadoEm: serverTimestamp() }));
  await deve('Pessoa grava no acesso o e-mail do próprio login', true, () => updateDoc(doc(db('bruno'), 'acessos', 'alfa_' + P.bruno), { email: EM.bruno }));
  await deve('Pessoa NÃO põe no acesso um e-mail que não é o do login', false, () => updateDoc(doc(db('bruno'), 'acessos', 'alfa_' + P.bruno), { email: 'outro@x.com.br' }));
  await deve('Pessoa NÃO muda o cargo junto com o nome', false, () => updateDoc(doc(db('bruno'), 'acessos', 'alfa_' + P.bruno), { nome: 'Bruno Lima', cargo: 'admin' }));
  await deve('Pessoa NÃO se reativa mudando o nome (acesso bloqueado)', false, () => updateDoc(doc(db('duda'), 'acessos', 'alfa_' + P.duda), { nome: 'Duda Reis', ativo: true }));
  await deve('Pessoa NÃO muda o nome no acesso de outra pessoa', false, () => updateDoc(doc(db('bruno'), 'acessos', 'alfa_' + P.ana), { nome: 'Outra' }));
  await deve('Ninguém apaga acesso (bloqueio é por ativo=false)', false, () => deleteDoc(doc(db('ana'), 'acessos', 'alfa_' + P.bruno)));

  /* ---------- convites ---------- */
  const aceite = (k, extra) => Object.assign({ uid: P[k], empresaId: 'alfa', nome: 'Edu', email: EM[k], cargo: 'operacional', extras: [], sem: [], ativo: true, convite: 'tok123' }, extra || {});
  await deve('Convite: e-mail errado NÃO aceita (não cria o acesso)', false, () => setDoc(doc(db('carla'), 'acessos', 'alfa_' + P.carla), aceite('carla')));
  await deve('Convite: e-mail errado NÃO lê o convite', false, () => getDoc(doc(db('carla'), 'convites', 'tok123')));
  await deve('Convite: e-mail errado NÃO marca o convite como usado', false, () => updateDoc(doc(db('carla'), 'convites', 'tok123'), { usado: true, usadoPor: P.carla, usadoEm: serverTimestamp() }));
  await deve('Convite: e-mail certo NÃO aceita com cargo diferente do convite', false, () => setDoc(doc(db('edu'), 'acessos', 'alfa_' + P.edu), aceite('edu', { cargo: 'admin' })));
  await deve('Convite: e-mail certo lê o convite', true, () => getDoc(doc(db('edu'), 'convites', 'tok123')));
  await deve('Convite: e-mail certo aceita (cria o próprio acesso)', true, () => setDoc(doc(db('edu'), 'acessos', 'alfa_' + P.edu), aceite('edu')));
  await deve('Convite: e-mail certo marca o convite como usado', true, () => updateDoc(doc(db('edu'), 'convites', 'tok123'), { usado: true, usadoPor: P.edu, usadoEm: serverTimestamp() }));
  await semear();
  await deve('Convite: quem aceita NÃO se dá telas a mais', false, () => setDoc(doc(db('edu'), 'acessos', 'alfa_' + P.edu), aceite('edu', { extras: ['pagar'] })));
  await deve('Convite: quem aceita NÃO usa e-mail de outra pessoa no acesso', false, () => setDoc(doc(db('edu'), 'acessos', 'alfa_' + P.edu), aceite('edu', { email: EM.ana })));
  await deve('Convite aceito como o app grava: acesso + convite usado + autorização + histórico juntos', true, () => {
    const d = db('edu'), b = writeBatch(d);
    b.set(doc(d, 'acessos', 'alfa_' + P.edu), aceite('edu', { criadoEm: serverTimestamp() }));
    b.update(doc(d, 'convites', 'tok123'), { usado: true, usadoEm: serverTimestamp(), usadoPor: P.edu });
    b.set(doc(d, 'usuarios', P.edu), { nome: 'Edu Martins', email: EM.edu, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() }, { merge: true });
    b.set(doc(d, 'consentimentos', P.edu + '_cursos'), { uid: P.edu, finalidade: 'cursos', aceite: false, texto: 'Cursos.', textoVersao: 'v1', canal: 'convite', em: serverTimestamp() });
    b.set(doc(collection(d, 'log')), { em: serverTimestamp(), uid: P.edu, quem: 'Edu Martins', empresaId: 'alfa', acao: 'convite.aceitar', texto: 'Edu aceitou o convite.', ref: 'tok123' });
    return b.commit();
  });
  await deve('Convite usado NÃO serve de novo', false, () => setDoc(doc(db('edu'), 'acessos', 'beta_' + P.edu), aceite('edu', { empresaId: 'beta' })));
  await semear();
  await deve('Convite: e-mail em maiúsculas no login também vale (comparação em minúsculas)', true,
    () => setDoc(doc(env.authenticatedContext(P.edu, { email: 'EDU@Alfa.com.br' }).firestore(), 'acessos', 'alfa_' + P.edu), aceite('edu')));
  await semear();
  await deve('Admin cria convite da própria empresa', true, () => setDoc(doc(db('ana'), 'convites', 'tokNovo'), { email: 'nova@alfa.com.br', empresaId: 'alfa', cargo: 'rh', nome: 'Nova', criadoPor: P.ana, usado: false }));
  await deve('Financeiro NÃO cria convite', false, () => setDoc(doc(db('bruno'), 'convites', 'tokX'), { email: 'x@alfa.com.br', empresaId: 'alfa', cargo: 'admin', nome: 'X', criadoPor: P.bruno, usado: false }));
  await deve('Convite NÃO aceita cargo inventado', false, () => setDoc(doc(db('ana'), 'convites', 'tokC'), { email: 'c@alfa.com.br', empresaId: 'alfa', cargo: 'dono', nome: 'C', criadoPor: P.ana, usado: false }));
  await deve('Convite NÃO aceita campo fora do modelo', false, () => setDoc(doc(db('ana'), 'convites', 'tokD'), { email: 'd@alfa.com.br', empresaId: 'alfa', cargo: 'rh', nome: 'D', criadoPor: P.ana, usado: false, ativo: true }));
  await deve('Admin NÃO cria convite para outra empresa', false, () => setDoc(doc(db('ana'), 'convites', 'tokE'), { email: 'e@beta.com.br', empresaId: 'beta', cargo: 'admin', nome: 'E', criadoPor: P.ana, usado: false }));
  await deve('Admin lista os convites da própria empresa', true, () => getDocs(query(collection(db('ana'), 'convites'), where('empresaId', '==', 'alfa'), where('usado', '==', false))));
  await deve('Financeiro NÃO lista os convites', false, () => getDocs(query(collection(db('bruno'), 'convites'), where('empresaId', '==', 'alfa'))));
  await deve('Admin marca o reenvio do convite', true, () => updateDoc(doc(db('ana'), 'convites', 'tokNovo'), { reenviadoEm: serverTimestamp() }));
  await deve('Admin NÃO marca o convite como usado nem troca o e-mail', false, () => updateDoc(doc(db('ana'), 'convites', 'tokNovo'), { email: 'outra@alfa.com.br' }));
  await deve('Admin cancela convite (apaga)', true, () => deleteDoc(doc(db('ana'), 'convites', 'tokNovo')));
  await deve('Admin lista os acessos da própria empresa', true, () => getDocs(query(collection(db('ana'), 'acessos'), where('empresaId', '==', 'alfa'))));
  await deve('Admin NÃO lista os acessos de outra empresa', false, () => getDocs(query(collection(db('ana'), 'acessos'), where('empresaId', '==', 'beta'))));
  await deve('Admin NÃO põe cargo inventado', false, () => updateDoc(doc(db('ana'), 'acessos', 'alfa_' + P.bruno), { cargo: 'dono' }));
  await deve('Admin bloqueia outra pessoa', true, () => updateDoc(doc(db('ana'), 'acessos', 'alfa_' + P.bruno), { ativo: false, atualizadoEm: serverTimestamp() }));
  await deve('Admin NÃO se bloqueia (nem se desbloqueia)', false, () => updateDoc(doc(db('ana'), 'acessos', 'alfa_' + P.ana), { ativo: false }));
  await deve('Admin ajusta o acesso de outra pessoa (extras e sem)', true, () => updateDoc(doc(db('ana'), 'acessos', 'alfa_' + P.bruno), { extras: ['usuarios'], sem: ['pagar'], atualizadoEm: serverTimestamp() }));
  await semear();

  /* ---------- histórico (log) ---------- */
  const reg = (k, extra) => Object.assign({ em: serverTimestamp(), uid: P[k], quem: k, empresaId: 'alfa', acao: 'teste', texto: 'Teste.', ref: '' }, extra || {});
  await deve('Membro grava no histórico da própria empresa', true, () => addDoc(collection(db('bruno'), 'log'), reg('bruno')));
  await deve('Histórico NÃO aceita data escolhida pelo aparelho (só a hora do servidor)', false, () => addDoc(collection(db('bruno'), 'log'), reg('bruno', { em: new Date('2020-01-01T10:00:00Z') })));
  await deve('Histórico NÃO aceita registro sem data', false, () => { const r = reg('bruno'); delete r.em; return addDoc(collection(db('bruno'), 'log'), r); });
  await deve('Histórico NÃO aceita registro em nome de outra pessoa', false, () => addDoc(collection(db('bruno'), 'log'), reg('bruno', { uid: P.ana })));
  await deve('Pessoa sem acesso NÃO grava no histórico de outra empresa', false, () => addDoc(collection(db('carla'), 'log'), reg('carla')));
  await deve('Log NÃO pode ser editado (nem pelo admin)', false, () => updateDoc(doc(db('ana'), 'log', 'l1'), { texto: 'Alterado.' }));
  await deve('Log NÃO pode ser editado (nem pela equipe master)', false, () => updateDoc(doc(db('master'), 'log', 'l1'), { texto: 'Alterado.' }));
  await deve('Log NÃO pode ser apagado', false, () => deleteDoc(doc(db('master'), 'log', 'l1')));
  await deve('Admin lê o histórico da empresa', true, () => getDoc(doc(db('ana'), 'log', 'l1')));
  await deve('Financeiro NÃO lê o histórico', false, () => getDoc(doc(db('bruno'), 'log', 'l1')));
  await deve('Admin lista o histórico da própria empresa (mais recente primeiro)', true, () => getDocs(query(collection(db('ana'), 'log'), where('empresaId', '==', 'alfa'), orderBy('em', 'desc'), limit(100))));
  await deve('Admin NÃO lista o histórico de outra empresa', false, () => getDocs(query(collection(db('ana'), 'log'), where('empresaId', '==', 'beta'))));
  await deve('Financeiro NÃO lista o histórico da empresa', false, () => getDocs(query(collection(db('bruno'), 'log'), where('empresaId', '==', 'alfa'))));
  await deve('Equipe master lista o histórico de todas as empresas', true, () => getDocs(query(collection(db('master'), 'log'), orderBy('em', 'desc'), limit(100))));
  await deve('Membro lê a área privada da própria empresa (Minha empresa)', true, () => getDoc(doc(db('ana'), 'empresas', 'alfa', 'privado', 'cadastro')));
  await deve('Equipe master grava no histórico como "master"', true, () => addDoc(collection(db('master'), 'log'), reg('master', { empresaId: 'master' })));

  /* ---------- cadastro rápido do MEI (10/11/2026) ---------- */
  await deve('MEI: cadastro rápido nasce com status mei (só presta serviço)', true, () => cadastro('edu', 'mei1', { status: 'mei', tipo: 'prestador' }, { num: '33000167000101' }));
  await deve('MEI: status mei NÃO para quem também contrata', false, () => cadastro('carla', 'mei2', { status: 'mei', tipo: 'ambos' }, { num: '11222333000181' }));
  await deve('MEI: NÃO nasce aprovado por conta própria', false, () => cadastro('carla', 'mei3', { status: 'aprovado', tipo: 'prestador' }, { num: '11222333000181' }));
  await deve('MEI: o dono completa o cadastro (mei → em análise)', true, () => updateDoc(doc(db('edu'), 'empresas', 'mei1'), { status: 'analise', enviadoEm: serverTimestamp() }));

  /* ---------- cadastro simplificado da empresa (12/11/2026) ---------- */
  await deve('Cadastro simples: empresa que contrata nasce com o essencial (status basico)', true, () => cadastro('carla', 'bas1', { status: 'basico', tipo: 'contratante' }, { num: '11222333000181' }));
  await deve('Cadastro simples: o dono completa e manda para análise (basico → em análise)', true, () => updateDoc(doc(db('carla'), 'empresas', 'bas1'), { status: 'analise', cidade: 'Gravataí', uf: 'RS', enviadoEm: serverTimestamp() }));
  await deve('Cadastro simples: NÃO se aprova sozinha', false, () => updateDoc(doc(db('carla'), 'empresas', 'bas1'), { status: 'aprovado' }));

  /* ---------- dinheiro do MEI (10/11/2026) ---------- */
  const mv = extra => Object.assign({ empresaId: 'alfa', tipo: 'entrada', valorCentavos: 20000, data: '2026-11-09', descricao: 'Venda de bolos', categoria: 'Venda', forma: 'pix', situacao: 'pago', vencimento: '', cliente: '',
    origem: 'manual', removido: false, pagoEm: '2026-11-09', criadoPor: P.ana, criadoPorNome: 'Ana', criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() }, extra || {});
  await deve('Dinheiro: admin registra uma entrada', true, () => setDoc(doc(db('ana'), 'movimentos', 'm1'), mv()));
  await deve('Dinheiro: financeiro lê', true, () => getDocs(query(collection(db('bruno'), 'movimentos'), where('empresaId', '==', 'alfa'))));
  await deve('Dinheiro: quem não é da empresa NÃO lê', false, () => getDoc(doc(db('carla'), 'movimentos', 'm1')));
  await deve('Dinheiro: NÃO com valor zero ou quebrado', false, () => setDoc(doc(db('ana'), 'movimentos', 'm2'), mv({ valorCentavos: 0 })));
  await deve('Dinheiro: NÃO com forma de pagamento inventada', false, () => setDoc(doc(db('ana'), 'movimentos', 'm3'), mv({ forma: 'cheque' })));
  await deve('Dinheiro: NÃO na empresa de outro', false, () => setDoc(doc(db('ana'), 'movimentos', 'm4'), mv({ empresaId: 'beta' })));
  await deve('Dinheiro: NÃO pago sem o dia do pagamento', false, () => setDoc(doc(db('ana'), 'movimentos', 'm5'), mv({ pagoEm: '' })));
  await deve('Dinheiro: em aberto sem dia de pagamento', true, () => setDoc(doc(db('ana'), 'movimentos', 'm6'), mv({ situacao: 'aberto', pagoEm: '', vencimento: '2026-11-20', tipo: 'saida', categoria: 'Material' })));
  await deve('Dinheiro: marca como pago', true, () => updateDoc(doc(db('ana'), 'movimentos', 'm6'), { situacao: 'pago', pagoEm: '2026-11-10', atualizadoEm: serverTimestamp() }));
  await deve('Dinheiro: tira (removido), sem apagar', true, () => updateDoc(doc(db('ana'), 'movimentos', 'm1'), { removido: true }));
  await deve('Dinheiro: NÃO troca a origem nem a empresa', false, () => updateDoc(doc(db('ana'), 'movimentos', 'm1'), { origem: 'assistente' }));
  await deve('Dinheiro: ninguém apaga', false, () => deleteDoc(doc(db('ana'), 'movimentos', 'm1')));

  /* ---------- agenda e lembretes (10/11/2026) ---------- */
  const ag = extra => Object.assign({ empresaId: 'alfa', tipo: 'compromisso', titulo: 'Visita técnica', data: '2026-11-20', hora: '09:00', cliente: 'Cliente X', local: '', obs: '', repete: '', avisar: 60,
    feito: false, feitos: [], removido: false, criadoPor: P.ana, criadoPorNome: 'Ana', criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() }, extra || {});
  await deve('Agenda: admin marca compromisso da própria empresa', true, () => setDoc(doc(db('ana'), 'agenda', 'a1'), ag()));
  await deve('Agenda: membro lê a agenda da empresa', true, () => getDocs(query(collection(db('bruno'), 'agenda'), where('empresaId', '==', 'alfa'))));
  await deve('Agenda: quem não é da empresa NÃO lê', false, () => getDoc(doc(db('carla'), 'agenda', 'a1')));
  await deve('Agenda: NÃO marca na agenda de outra empresa', false, () => setDoc(doc(db('ana'), 'agenda', 'a2'), ag({ empresaId: 'beta' })));
  await deve('Agenda: NÃO com campo a mais', false, () => setDoc(doc(db('ana'), 'agenda', 'a3'), ag({ cpf: '123' })));
  await deve('Agenda: NÃO com data inválida', false, () => setDoc(doc(db('ana'), 'agenda', 'a4'), ag({ data: '20/11/2026' })));
  await deve('Agenda: NÃO em nome de outra pessoa', false, () => setDoc(doc(db('ana'), 'agenda', 'a5'), ag({ criadoPor: P.bruno })));
  await deve('Agenda: marca como feito', true, () => updateDoc(doc(db('ana'), 'agenda', 'a1'), { feito: true, atualizadoEm: serverTimestamp() }));
  await deve('Agenda: tira da agenda (removido), sem apagar', true, () => updateDoc(doc(db('ana'), 'agenda', 'a1'), { removido: true }));
  await deve('Agenda: NÃO muda a empresa do item', false, () => updateDoc(doc(db('ana'), 'agenda', 'a1'), { empresaId: 'beta' }));
  await deve('Agenda: ninguém apaga', false, () => deleteDoc(doc(db('ana'), 'agenda', 'a1')));

  /* ---------- contratos (equipe contínua) ---------- */
  await semear();
  P.beto = 'uBETO'; EM.beto = 'beto@beta.com.br';
  await env.withSecurityRulesDisabled(async c => { const d = c.firestore();
    await setDoc(doc(d, 'acessos', 'beta_' + P.beto), { uid: P.beto, empresaId: 'beta', nome: 'Beto', email: EM.beto, cargo: 'admin', extras: [], sem: [], ativo: true });
    await setDoc(doc(d, 'empresas', 'alfa'), { nome: 'Alfa', status: 'aprovado', tipo: 'contratante', criadoPor: P.ana, cnpj: '11.222.333/0001-81' });
    await setDoc(doc(d, 'empresas', 'gama'), { nome: 'Gama', status: 'analise', tipo: 'prestador', criadoPor: 'uG' }); });
  const ct = (extra) => Object.assign({ modalidade: 'continua', tomadorId: 'alfa', prestadorId: 'beta', partes: ['alfa', 'beta'], tomadorNome: 'Alfa', tomadorCnpj: '', prestadorNome: 'Beta', prestadorCnpj: '',
    objeto: 'Equipe de manutenção.', periodicidade: 'quinzena', vencimentoDias: 1, inicio: '2026-11-01', fim: '', status: 'assinatura', assinaturas: {}, interlocutor: null, proposta: null,
    criadoPor: P.ana, criadoPorNome: 'Ana', criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() }, extra || {});
  await deve('Contrato: admin do tomador cria com prestadora aprovada', true, () => setDoc(doc(db('ana'), 'contratos', 'c1'), ct()));
  await deve('Contrato: financeiro NÃO cria', false, () => setDoc(doc(db('bruno'), 'contratos', 'c2'), ct({ criadoPor: P.bruno })));
  await deve('Contrato: NÃO com prestadora ainda em análise', false, () => setDoc(doc(db('ana'), 'contratos', 'c3'), ct({ prestadorId: 'gama', partes: ['alfa', 'gama'] })));
  await deve('Contrato: NÃO nasce assinado nem ativo', false, () => setDoc(doc(db('ana'), 'contratos', 'c4'), ct({ status: 'ativo', assinaturas: { tomador: { uid: P.ana } } })));
  await deve('Contrato: NÃO em nome de outra empresa (tomador que não é a minha)', false, () => setDoc(doc(db('ana'), 'contratos', 'c5'), ct({ tomadorId: 'beta', prestadorId: 'alfa', partes: ['beta', 'alfa'] })));
  await deve('Contrato: a prestadora lê', true, () => getDoc(doc(db('beto'), 'contratos', 'c1')));
  /* quem só presta serviço (ex.: MEI) não contrata ninguém (10/11/2026) */
  await env.withSecurityRulesDisabled(async c => { await updateDoc(doc(c.firestore(), 'empresas', 'alfa'), { tipo: 'prestador' }); });
  await deve('Contrato: empresa que só presta serviço NÃO cria contrato como contratante', false, () => setDoc(doc(db('ana'), 'contratos', 'c6'), ct()));
  await env.withSecurityRulesDisabled(async c => { await updateDoc(doc(c.firestore(), 'empresas', 'alfa'), { tipo: 'contratante' }); });
  await deve('Contrato: a prestadora lista os seus (prestadorId)', true, () => getDocs(query(collection(db('beto'), 'contratos'), where('prestadorId', '==', 'beta'))));
  await deve('Contrato: quem não é das duas empresas NÃO lê', false, () => getDoc(doc(db('carla'), 'contratos', 'c1')));
  const assina = (k, lado, extra) => updateDoc(doc(db(k), 'contratos', 'c1'), Object.assign({ ['assinaturas.' + lado]: { uid: P[k], nome: k, em: serverTimestamp() }, atualizadoEm: serverTimestamp() }, extra || {}));
  await deve('Contrato: o tomador NÃO assina pela prestadora', false, () => assina('ana', 'prestador'));
  const tri = (r, res, extra) => Object.assign({ r: Object.assign({ entrega: 'sim', supervisor: 'sim', ordens: 'nao', jornada: 'nao', exclusiv: 'nao', exempregado: 'nao', socio: 'nao' }, r || {}), resultado: res, parecer: null, uid: P.ana, nome: 'Ana', em: serverTimestamp() }, extra || {});
  const triagem = (k, t) => updateDoc(doc(db(k), 'contratos', 'c1'), { triagem: t, atualizadoEm: serverTimestamp() });
  await deve('Triagem: o tomador NÃO assina sem a triagem', false, () => assina('ana', 'tomador'));
  await deve('Triagem: NÃO aceita resultado escolhido à mão (respostas de risco com "compatível")', false, () => triagem('ana', tri({ jornada: 'sim' }, 'compativel')));
  await deve('Triagem: a prestadora NÃO faz a triagem', false, () => triagem('beto', tri({}, 'compativel', { uid: P.beto })));
  await deve('Triagem: ex-empregado há menos de 18 meses dá "não publicar"', true, () => triagem('ana', tri({ exempregado: 'sim' }, 'nao_publicar')));
  await deve('Triagem: com "não publicar" o tomador NÃO assina', false, () => assina('ana', 'tomador'));
  await deve('Triagem: NÃO registra parecer em "não publicar"', false, () => triagem('ana', tri({ exempregado: 'sim' }, 'nao_publicar', { parecer: { ok: true, obs: 'Parecer favorável do jurídico.', uid: P.ana } })));
  await deve('Triagem: jornada controlada dá "requer análise jurídica"', true, () => triagem('ana', tri({ jornada: 'sim' }, 'analise_juridica')));
  await deve('Triagem: com análise jurídica sem parecer o tomador NÃO assina', false, () => assina('ana', 'tomador'));
  await deve('Triagem: registra o parecer jurídico favorável', true, () => triagem('ana', tri({ jornada: 'sim' }, 'analise_juridica', { parecer: { ok: true, obs: 'Escritório X: pode contratar com supervisor no local.', uid: P.ana, nome: 'Ana', em: serverTimestamp() } })));
  await deve('Contrato: o tomador assina o seu lado', true, () => assina('ana', 'tomador'));
  await deve('Contrato: a prestadora NÃO assina deixando "esperando" quando o outro lado já assinou', false, () => assina('beto', 'prestador'));
  await deve('Contrato: a prestadora assina com o interlocutor e o contrato fica ativo', true, () => assina('beto', 'prestador', { status: 'ativo', ativadoEm: serverTimestamp(), interlocutor: { nome: 'Beto Alves', email: EM.beto, cel: '' } }));
  await deve('Contrato: depois de ativo, o tomador NÃO corrige o objeto', false, () => updateDoc(doc(db('ana'), 'contratos', 'c1'), { objeto: 'Outro objeto qualquer.', atualizadoEm: serverTimestamp() }));
  await deve('Contrato: vencimento NÃO muda por um lado só', false, () => updateDoc(doc(db('ana'), 'contratos', 'c1'), { vencimentoDias: 30, atualizadoEm: serverTimestamp() }));
  await deve('Contrato: o tomador propõe outro vencimento', true, () => updateDoc(doc(db('ana'), 'contratos', 'c1'), { proposta: { vencimentoDias: 5, motivo: '', lado: 'tomador', uid: P.ana, nome: 'Ana', em: serverTimestamp() }, atualizadoEm: serverTimestamp() }));
  await deve('Contrato: quem propôs NÃO aceita a própria proposta', false, () => updateDoc(doc(db('ana'), 'contratos', 'c1'), { vencimentoDias: 5, proposta: null, atualizadoEm: serverTimestamp() }));
  await deve('Contrato: a outra empresa NÃO aceita com um prazo diferente do proposto', false, () => updateDoc(doc(db('beto'), 'contratos', 'c1'), { vencimentoDias: 60, proposta: null, atualizadoEm: serverTimestamp() }));
  await deve('Contrato: a outra empresa aceita a proposta (vale o novo vencimento)', true, () => updateDoc(doc(db('beto'), 'contratos', 'c1'), { vencimentoDias: 5, proposta: null, atualizadoEm: serverTimestamp() }));
  await deve('Contrato: a prestadora encerra o serviço com motivo', true, () => updateDoc(doc(db('beto'), 'contratos', 'c1'), { status: 'encerrado', encerramento: { data: '2026-12-31', motivo: 'Fim do projeto.', lado: 'prestador', uid: P.beto, nome: 'Beto', em: serverTimestamp() }, proposta: null, atualizadoEm: serverTimestamp() }));
  await deve('Contrato: ninguém apaga', false, () => deleteDoc(doc(db('ana'), 'contratos', 'c1')));
  await deve('Contrato: o tomador cancela antes de assinar', true, async () => { await setDoc(doc(db('ana'), 'contratos', 'c6'), ct()); return updateDoc(doc(db('ana'), 'contratos', 'c6'), { status: 'cancelado', atualizadoEm: serverTimestamp() }); });

  /* ---------- medições do período ---------- */
  P.rita = 'uRITA'; EM.rita = 'rita@alfa.com.br'; P.aldo = 'uALDO'; EM.aldo = 'aldo@alfa.com.br';
  await env.withSecurityRulesDisabled(async c => { const d = c.firestore();
    await setDoc(doc(d, 'acessos', 'alfa_' + P.rita), { uid: P.rita, empresaId: 'alfa', nome: 'Rita', email: EM.rita, cargo: 'rh', extras: [], sem: [], ativo: true });
    await setDoc(doc(d, 'acessos', 'alfa_' + P.aldo), { uid: P.aldo, empresaId: 'alfa', nome: 'Aldo', email: EM.aldo, cargo: 'aprovador', extras: [], sem: [], ativo: true });
    await setDoc(doc(d, 'contratos', 'cm'), ct({ status: 'ativo', assinaturas: { tomador: { uid: P.ana }, prestador: { uid: P.beto } } }));
    await setDoc(doc(d, 'contratos', 'cx'), ct({ status: 'assinatura' })); });
  const med = (k, extra) => Object.assign({ contratoId: 'cm', tomadorId: 'alfa', prestadorId: 'beta', partes: ['alfa', 'beta'], tomadorNome: 'Alfa', prestadorNome: 'Beta', periodicidade: 'quinzena',
    periodo: '2026-11-1', valorCentavos: 500000, memoria: [{ nome: 'Pedro Lima', horas: 80, valorCentavos: 500000 }], obs: '', origem: 'manual', ref: '', status: 'enviada',
    divergencia: null, confirmacao: null, aprovacao: null, criadoPor: P[k], criadoPorNome: k, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() }, extra || {});
  await deve('Medição: o RH do tomador lança com contrato ativo', true, () => setDoc(doc(db('rita'), 'medicoes', 'cm_2026-11-1'), med('rita')));
  await deve('Medição: o financeiro do tomador NÃO lança', false, () => setDoc(doc(db('bruno'), 'medicoes', 'cm_2026-11-2'), med('bruno', { periodo: '2026-11-2' })));
  await deve('Medição: NÃO com contrato que ainda espera assinatura', false, () => setDoc(doc(db('rita'), 'medicoes', 'cx_2026-11-1'), med('rita', { contratoId: 'cx' })));
  await deve('Medição: o id é contrato_período (NÃO aceita outro)', false, () => setDoc(doc(db('rita'), 'medicoes', 'qualquer'), med('rita', { periodo: '2026-10-2' })));
  await deve('Medição: período mensal NÃO entra em contrato por quinzena', false, () => setDoc(doc(db('rita'), 'medicoes', 'cm_2026-10'), med('rita', { periodo: '2026-10' })));
  await deve('Medição: o mesmo período NÃO entra duas vezes', false, () => setDoc(doc(db('ana'), 'medicoes', 'cm_2026-11-1'), med('ana')));
  await deve('Medição: NÃO nasce aprovada', false, () => setDoc(doc(db('rita'), 'medicoes', 'cm_2026-09-1'), med('rita', { periodo: '2026-09-1', status: 'aprovada' })));
  await deve('Medição: quem lança consulta se o período já existe', true, () => getDoc(doc(db('rita'), 'medicoes', 'cm_2026-12-1')));
  await deve('Medição: a prestadora lê', true, () => getDoc(doc(db('beto'), 'medicoes', 'cm_2026-11-1')));
  await deve('Medição: quem não é das duas empresas NÃO lê', false, () => getDoc(doc(db('carla'), 'medicoes', 'cm_2026-11-1')));
  await deve('Medição: o aprovador NÃO aprova antes de a prestadora conferir', false, () => updateDoc(doc(db('aldo'), 'medicoes', 'cm_2026-11-1'), { status: 'aprovada', aprovacao: { uid: P.aldo }, atualizadoEm: serverTimestamp() }));
  await deve('Medição: o tomador NÃO confirma no lugar da prestadora', false, () => updateDoc(doc(db('ana'), 'medicoes', 'cm_2026-11-1'), { status: 'confirmada_prestadora', confirmacao: { uid: P.ana }, atualizadoEm: serverTimestamp() }));
  await deve('Medição: a prestadora NÃO aponta divergência sem motivo', false, () => updateDoc(doc(db('beto'), 'medicoes', 'cm_2026-11-1'), { status: 'divergencia', divergencia: { uid: P.beto, motivo: 'errado' }, atualizadoEm: serverTimestamp() }));
  await deve('Medição: a prestadora aponta divergência com motivo', true, () => updateDoc(doc(db('beto'), 'medicoes', 'cm_2026-11-1'), { status: 'divergencia', divergencia: { uid: P.beto, nome: 'Beto', motivo: 'As horas do Pedro somam 88, não 80.', em: serverTimestamp() }, atualizadoEm: serverTimestamp() }));
  await deve('Medição: o RH corrige e reenvia', true, () => updateDoc(doc(db('rita'), 'medicoes', 'cm_2026-11-1'), { memoria: [{ nome: 'Pedro Lima', horas: 88, valorCentavos: 550000 }], valorCentavos: 550000, status: 'enviada', divergencia: null, confirmacao: null, atualizadoEm: serverTimestamp() }));
  await deve('Medição: a prestadora confirma', true, () => updateDoc(doc(db('beto'), 'medicoes', 'cm_2026-11-1'), { status: 'confirmada_prestadora', confirmacao: { uid: P.beto, nome: 'Beto', em: serverTimestamp() }, atualizadoEm: serverTimestamp() }));
  await deve('Medição: o RH (quem lançou) NÃO aprova', false, () => updateDoc(doc(db('rita'), 'medicoes', 'cm_2026-11-1'), { status: 'aprovada', aprovacao: { uid: P.rita }, atualizadoEm: serverTimestamp() }));
  await deve('Medição: o aprovador NÃO muda o valor ao aprovar', false, () => updateDoc(doc(db('aldo'), 'medicoes', 'cm_2026-11-1'), { status: 'aprovada', valorCentavos: 1, aprovacao: { uid: P.aldo }, atualizadoEm: serverTimestamp() }));
  await deve('Medição: o aprovador técnico aprova', true, () => updateDoc(doc(db('aldo'), 'medicoes', 'cm_2026-11-1'), { status: 'aprovada', aprovacao: { uid: P.aldo, nome: 'Aldo', em: serverTimestamp() }, atualizadoEm: serverTimestamp() }));
  await deve('Medição: aprovada NÃO é cancelada', false, () => updateDoc(doc(db('rita'), 'medicoes', 'cm_2026-11-1'), { status: 'cancelada', atualizadoEm: serverTimestamp() }));
  await deve('Medição: ninguém apaga', false, () => deleteDoc(doc(db('ana'), 'medicoes', 'cm_2026-11-1')));

  /* ---------- espelho da nota ---------- */
  await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'medicoes', 'cm_2026-10-2'), med('rita', { periodo: '2026-10-2' })); });
  const esp = (k, extra) => Object.assign({ medicaoId: 'cm_2026-11-1', contratoId: 'cm', tomadorId: 'alfa', prestadorId: 'beta', partes: ['alfa', 'beta'], tomadorNome: 'Alfa', prestadorNome: 'Beta', prestadorCnpj: '',
    tomador: { razao: 'Alfa Serviços Ltda', cnpj: '11.222.333/0001-81', im: '', endereco: 'Rua A, 1', cidade: 'Gravataí', uf: 'RS' }, periodo: '2026-11-1', competencia: '2026-11',
    descricao: 'Prestação de serviços de manutenção.', valorCentavos: 550000, retencoes: { iss: 27500, inss: 0, ir: 8250, pcc: 0 }, liquidoCentavos: 514250, vencimentoDias: 1, obs: '',
    status: 'aguardando_nota', versao: 1, criadoPor: P[k], criadoPorNome: k, criadoEm: serverTimestamp(), atualizadoPor: P[k], atualizadoPorNome: k, atualizadoEm: serverTimestamp() }, extra || {});
  await deve('Espelho: o RH do tomador NÃO prepara (é o financeiro)', false, () => setDoc(doc(db('rita'), 'espelhos', 'cm_2026-11-1'), esp('rita')));
  await deve('Espelho: a prestadora NÃO prepara', false, () => setDoc(doc(db('beto'), 'espelhos', 'cm_2026-11-1'), esp('beto')));
  await deve('Espelho: NÃO com medição ainda não aprovada', false, () => setDoc(doc(db('bruno'), 'espelhos', 'cm_2026-10-2'), esp('bruno', { medicaoId: 'cm_2026-10-2', periodo: '2026-10-2', competencia: '2026-10' })));
  await deve('Espelho: NÃO com valor diferente da medição aprovada', false, () => setDoc(doc(db('bruno'), 'espelhos', 'cm_2026-11-1'), esp('bruno', { valorCentavos: 600000, liquidoCentavos: 564250 })));
  await deve('Espelho: NÃO com vencimento diferente do contrato', false, () => setDoc(doc(db('bruno'), 'espelhos', 'cm_2026-11-1'), esp('bruno', { vencimentoDias: 30 })));
  await deve('Espelho: NÃO com líquido que não fecha com as retenções', false, () => setDoc(doc(db('bruno'), 'espelhos', 'cm_2026-11-1'), esp('bruno', { liquidoCentavos: 550000 })));
  await deve('Espelho: NÃO com retenção negativa', false, () => setDoc(doc(db('bruno'), 'espelhos', 'cm_2026-11-1'), esp('bruno', { retencoes: { iss: -100, inss: 0, ir: 0, pcc: 0 }, liquidoCentavos: 550100 })));
  await deve('Espelho: o financeiro do tomador prepara com a medição aprovada', true, () => setDoc(doc(db('bruno'), 'espelhos', 'cm_2026-11-1'), esp('bruno')));
  await deve('Espelho: NÃO prepara duas vezes a mesma medição', false, () => setDoc(doc(db('ana'), 'espelhos', 'cm_2026-11-1'), esp('ana')));
  await deve('Espelho: a prestadora lê', true, () => getDoc(doc(db('beto'), 'espelhos', 'cm_2026-11-1')));
  await deve('Espelho: a prestadora lista os seus (prestadorId)', true, () => getDocs(query(collection(db('beto'), 'espelhos'), where('prestadorId', '==', 'beta'))));
  await deve('Espelho: quem não é das duas empresas NÃO lê', false, () => getDoc(doc(db('carla'), 'espelhos', 'cm_2026-11-1')));
  await deve('Espelho: a prestadora NÃO muda as retenções', false, () => updateDoc(doc(db('beto'), 'espelhos', 'cm_2026-11-1'), { retencoes: { iss: 0, inss: 0, ir: 0, pcc: 0 }, liquidoCentavos: 550000, versao: 2, atualizadoPor: P.beto, atualizadoEm: serverTimestamp() }));
  await deve('Espelho: o financeiro NÃO muda o vencimento', false, () => updateDoc(doc(db('bruno'), 'espelhos', 'cm_2026-11-1'), { vencimentoDias: 30, versao: 2, atualizadoPor: P.bruno, atualizadoEm: serverTimestamp() }));
  await deve('Espelho: o financeiro NÃO muda o valor aprovado', false, () => updateDoc(doc(db('bruno'), 'espelhos', 'cm_2026-11-1'), { valorCentavos: 600000, liquidoCentavos: 564250, versao: 2, atualizadoPor: P.bruno, atualizadoEm: serverTimestamp() }));
  await deve('Espelho: o financeiro corrige as retenções (versão nova)', true, () => updateDoc(doc(db('bruno'), 'espelhos', 'cm_2026-11-1'), { retencoes: { iss: 27500, inss: 0, ir: 0, pcc: 0 }, liquidoCentavos: 522500, versao: 2, atualizadoPor: P.bruno, atualizadoPorNome: 'Bruno', atualizadoEm: serverTimestamp() }));
  await deve('Espelho: NÃO corrige sem subir a versão', false, () => updateDoc(doc(db('bruno'), 'espelhos', 'cm_2026-11-1'), { obs: 'Outra observação.', versao: 2, atualizadoPor: P.bruno, atualizadoEm: serverTimestamp() }));
  await deve('Espelho: ninguém apaga', false, () => deleteDoc(doc(db('ana'), 'espelhos', 'cm_2026-11-1')));

  /* ---------- nota fiscal no espelho ---------- */
  await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'espelhos', 'e2'), esp('bruno', { medicaoId: 'e2' })); });
  const nota = (k, extra) => Object.assign({ tipo: 'pdf', nomeArquivo: 'nota.pdf', tam: 1000, envio: 'ab12', partes: 1, chaveUnica: '1'.repeat(50), chave: '1'.repeat(50), numero: '7',
    emitenteCnpj: '', valorCentavos: null, competencia: '2026-11', emissao: '', conferencia: { ok: true, manual: false, itens: [] }, enviadoPor: P[k], enviadoPorNome: k, enviadoEm: serverTimestamp() }, extra || {});
  const enviaNota = (k, espId, n, semArq, semChave) => { const f = db(k), b = writeBatch(f);
    if (!semArq) b.set(doc(f, 'espelhos', espId, 'arquivos', n.envio + '-0'), { d: 'JVBERi0x', k: 0, envio: n.envio, em: serverTimestamp() });
    if (!semChave) b.set(doc(f, 'notaschave', n.chaveUnica), { espelhoId: espId, prestadorId: 'beta', tomadorId: 'alfa', em: serverTimestamp() });
    b.update(doc(f, 'espelhos', espId), { status: 'nota_enviada', nota: n, atualizadoEm: serverTimestamp() }); return b.commit(); };
  await deve('Nota: a prestadora registra que abriu o emissor', true, () => updateDoc(doc(db('beto'), 'espelhos', 'cm_2026-11-1'), { emissao: { uid: P.beto, nome: 'Beto', em: serverTimestamp() }, atualizadoEm: serverTimestamp() }));
  await deve('Nota: o tomador NÃO registra emissão no lugar da prestadora', false, () => updateDoc(doc(db('bruno'), 'espelhos', 'cm_2026-11-1'), { emissao: { uid: P.bruno }, atualizadoEm: serverTimestamp() }));
  await deve('Nota: NÃO é enviada sem o arquivo', false, () => enviaNota('beto', 'cm_2026-11-1', nota('beto'), true));
  await deve('Nota: NÃO é enviada sem reservar a chave', false, () => enviaNota('beto', 'cm_2026-11-1', nota('beto'), false, true));
  await deve('Nota: XML com valor diferente do espelho NÃO entra', false, () => enviaNota('beto', 'cm_2026-11-1', nota('beto', { tipo: 'xml', valorCentavos: 1, envio: 'x1' })));
  await deve('Nota: o tomador NÃO envia a nota', false, () => enviaNota('bruno', 'cm_2026-11-1', nota('bruno', { envio: 'x2' })));
  await deve('Nota: a prestadora envia o PDF (arquivo + chave + espelho juntos)', true, () => enviaNota('beto', 'cm_2026-11-1', nota('beto')));
  await deve('Nota: a mesma nota NÃO serve para outro espelho', false, () => enviaNota('beto', 'e2', nota('beto', { envio: 'x3' })));
  await deve('Nota: o tomador abre o arquivo', true, () => getDoc(doc(db('bruno'), 'espelhos', 'cm_2026-11-1', 'arquivos', 'ab12-0')));
  await deve('Nota: quem não é das duas empresas NÃO abre o arquivo', false, () => getDoc(doc(db('carla'), 'espelhos', 'cm_2026-11-1', 'arquivos', 'ab12-0')));
  await deve('Nota: o arquivo NÃO é apagado', false, () => deleteDoc(doc(db('beto'), 'espelhos', 'cm_2026-11-1', 'arquivos', 'ab12-0')));
  await deve('Nota: arquivo NÃO entra depois que a nota foi enviada', false, () => setDoc(doc(db('beto'), 'espelhos', 'cm_2026-11-1', 'arquivos', 'zz-0'), { d: 'x', k: 0, envio: 'zz', em: serverTimestamp() }));
  await deve('Nota: a prestadora NÃO confere a própria nota', false, () => updateDoc(doc(db('beto'), 'espelhos', 'cm_2026-11-1'), { status: 'nota_ok', conferenciaNota: { uid: P.beto }, atualizadoEm: serverTimestamp() }));
  await deve('Nota: o RH do tomador NÃO recusa', false, () => updateDoc(doc(db('rita'), 'espelhos', 'cm_2026-11-1'), { status: 'aguardando_nota', nota: null, emissao: null, recusadas: [{ uid: P.rita, motivo: 'Competência errada na nota.', chaveUnica: '1'.repeat(50) }], atualizadoEm: serverTimestamp() }));
  await deve('Nota: o financeiro NÃO recusa sem motivo', false, () => updateDoc(doc(db('bruno'), 'espelhos', 'cm_2026-11-1'), { status: 'aguardando_nota', nota: null, emissao: null, recusadas: [{ uid: P.bruno, motivo: 'não', chaveUnica: '1'.repeat(50) }], atualizadoEm: serverTimestamp() }));
  await deve('Nota: o financeiro recusa com motivo (fica na lista de recusadas)', true, () => updateDoc(doc(db('bruno'), 'espelhos', 'cm_2026-11-1'), { status: 'aguardando_nota', nota: null, emissao: null, recusadas: [{ uid: P.bruno, nome: 'Bruno', motivo: 'Competência errada na nota.', chaveUnica: '1'.repeat(50) }], atualizadoEm: serverTimestamp() }));
  await deve('Nota: a nota recusada NÃO é enviada de novo', false, () => enviaNota('beto', 'cm_2026-11-1', nota('beto', { envio: 'x4' })));
  await deve('Nota: a prestadora envia outra nota', true, () => enviaNota('beto', 'cm_2026-11-1', nota('beto', { envio: 'x5', chaveUnica: '2'.repeat(50), chave: '2'.repeat(50) })));
  /* contestação da nota (12/11/2026) */
  const CH2 = '2'.repeat(50), E1 = 'cm_2026-11-1';
  const cont = (k, extra) => Object.assign({ motivos: ['Valor'], texto: 'O valor da nota não bate com a medição aprovada.', uid: P[k], nome: k, em: '2026-11-12T10:00:00Z', chaveUnica: CH2, msgs: [] }, extra || {});
  await deve('Contestação: a prestadora NÃO contesta a própria nota', false, () => updateDoc(doc(db('beto'), 'espelhos', E1), { status: 'nota_contestada', contestacao: cont('beto'), atualizadoEm: serverTimestamp() }));
  await deve('Contestação: o RH do tomador NÃO contesta', false, () => updateDoc(doc(db('rita'), 'espelhos', E1), { status: 'nota_contestada', contestacao: cont('rita'), atualizadoEm: serverTimestamp() }));
  await deve('Contestação: NÃO contesta sem motivo escrito', false, () => updateDoc(doc(db('bruno'), 'espelhos', E1), { status: 'nota_contestada', contestacao: cont('bruno', { texto: 'errado' }), atualizadoEm: serverTimestamp() }));
  await deve('Contestação: NÃO contesta sem escolher o tipo', false, () => updateDoc(doc(db('bruno'), 'espelhos', E1), { status: 'nota_contestada', contestacao: cont('bruno', { motivos: [] }), atualizadoEm: serverTimestamp() }));
  await deve('Contestação: o financeiro do tomador contesta a nota com o motivo', true, () => updateDoc(doc(db('bruno'), 'espelhos', E1), { status: 'nota_contestada', contestacao: cont('bruno'), atualizadoEm: serverTimestamp() }));
  await deve('Contestação: nota contestada NÃO vira conferida', false, () => { const f = db('bruno'), b = writeBatch(f); b.update(doc(f, 'espelhos', E1), { status: 'nota_ok', conferenciaNota: { uid: P.bruno, nome: 'Bruno', em: serverTimestamp(), manual: false }, atualizadoEm: serverTimestamp() }); return b.commit(); });
  await deve('Contestação: a prestadora responde', true, () => updateDoc(doc(db('beto'), 'espelhos', E1), { contestacao: cont('bruno', { msgs: [{ lado: 'prestador', t: 'O valor inclui as horas extras aprovadas na medição.', uid: P.beto, nome: 'Beto', em: '2026-11-12T11:00:00Z' }] }), atualizadoEm: serverTimestamp() }));
  await deve('Contestação: NÃO responde no nome da outra empresa', false, () => updateDoc(doc(db('beto'), 'espelhos', E1), { contestacao: cont('bruno', { msgs: [{ lado: 'prestador', t: 'O valor inclui as horas extras aprovadas na medição.', uid: P.beto, nome: 'Beto', em: '2026-11-12T11:00:00Z' }, { lado: 'tomador', t: 'Ok', uid: P.beto, nome: 'Beto', em: '2026-11-12T11:01:00Z' }] }), atualizadoEm: serverTimestamp() }));
  await deve('Contestação: NÃO muda o motivo depois de aberta', false, () => updateDoc(doc(db('beto'), 'espelhos', E1), { contestacao: cont('bruno', { texto: 'Outro texto, bem diferente do original.', msgs: [{ lado: 'prestador', t: 'O valor inclui as horas extras aprovadas na medição.', uid: P.beto, nome: 'Beto', em: '2026-11-12T11:00:00Z' }, { lado: 'prestador', t: 'mais', uid: P.beto, nome: 'Beto', em: '2026-11-12T11:02:00Z' }] }), atualizadoEm: serverTimestamp() }));
  const fechada = (k, como) => Object.assign(cont('bruno', { msgs: [{ lado: 'prestador', t: 'O valor inclui as horas extras aprovadas na medição.', uid: P.beto, nome: 'Beto', em: '2026-11-12T11:00:00Z' }] }), { fim: { como, uid: P[k], nome: k, em: '2026-11-12T12:00:00Z' } });
  await deve('Contestação: a prestadora NÃO aceita a própria explicação', false, () => updateDoc(doc(db('beto'), 'espelhos', E1), { status: 'nota_enviada', contestacao: null, contestacoes: [fechada('beto', 'aceita')], atualizadoEm: serverTimestamp() }));
  await deve('Contestação: o tomador aceita a explicação (a nota volta para conferir)', true, () => updateDoc(doc(db('bruno'), 'espelhos', E1), { status: 'nota_enviada', contestacao: null, contestacoes: [fechada('bruno', 'aceita')], atualizadoEm: serverTimestamp() }));
  /* outro espelho: contestada e a prestadora manda nota nova */
  await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'espelhos', 'e3'), esp('bruno', { medicaoId: 'e3' })); });
  const CH3 = '4'.repeat(50);
  await deve('Contestação: nota do 2º espelho enviada', true, () => enviaNota('beto', 'e3', nota('beto', { envio: 'e3a', chaveUnica: CH3, chave: CH3 })));
  await deve('Contestação: 2º espelho contestado', true, () => updateDoc(doc(db('bruno'), 'espelhos', 'e3'), { status: 'nota_contestada', contestacao: cont('bruno', { chaveUnica: CH3, motivos: ['Competência'] }), atualizadoEm: serverTimestamp() }));
  const nova = (k) => ({ status: 'aguardando_nota', nota: null, emissao: null, recusadas: [{ uid: P[k], nome: k, motivo: 'Contestada: o valor da nota não bate.', chaveUnica: CH3 }],
    contestacao: null, contestacoes: [Object.assign(cont('bruno', { chaveUnica: CH3, motivos: ['Competência'] }), { fim: { como: 'nova_nota', uid: P[k], nome: k, em: '2026-11-12T12:00:00Z' } })], atualizadoEm: serverTimestamp() });
  await deve('Contestação: quem não é das duas empresas NÃO pede nota nova', false, () => updateDoc(doc(db('carla'), 'espelhos', 'e3'), nova('carla')));
  await deve('Contestação: a prestadora vai mandar a nota corrigida (volta a esperar a nota)', true, () => updateDoc(doc(db('beto'), 'espelhos', 'e3'), nova('beto')));
  await deve('Contestação: a nota contestada NÃO é enviada de novo', false, () => enviaNota('beto', 'e3', nota('beto', { envio: 'e3b', chaveUnica: CH3, chave: CH3 })));
  await deve('Nota: NÃO fica conferida sem criar o título junto', false, () => updateDoc(doc(db('bruno'), 'espelhos', 'cm_2026-11-1'), { status: 'nota_ok', conferenciaNota: { uid: P.bruno, nome: 'Bruno', em: serverTimestamp(), manual: false }, atualizadoEm: serverTimestamp() }));
  await deve('Nota: o financeiro marca a nota conferida (com o título junto)', true, () => { const f = db('bruno'), b = writeBatch(f);
    b.update(doc(f, 'espelhos', 'cm_2026-11-1'), { status: 'nota_ok', conferenciaNota: { uid: P.bruno, nome: 'Bruno', em: serverTimestamp(), manual: false }, atualizadoEm: serverTimestamp() });
    b.set(doc(f, 'titulos', 'cm_2026-11-1'), { espelhoId: 'cm_2026-11-1', medicaoId: 'cm_2026-11-1', contratoId: 'cm', tomadorId: 'alfa', prestadorId: 'beta', partes: ['alfa', 'beta'], tomadorNome: 'Alfa', prestadorNome: 'Beta', periodo: '2026-11-1', notaNumero: '7',
      chaveUnica: '2'.repeat(50), valorCentavos: 550000, liquidoCentavos: 522500, retencoes: { iss: 27500, inss: 0, ir: 0, pcc: 0 }, vencimentoDias: 1, base: serverTimestamp(), status: 'aprovado', aprovacao: { uid: P.bruno, nome: 'Bruno', em: serverTimestamp() },
      liberacao: null, agendamento: null, liquidacao: null, baixa: null, conta: { ok: false, revisao: false, versao: 0 }, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() }); return b.commit(); });
  await deve('Nota: quem não é das duas empresas NÃO consulta a chave da nota', false, () => getDoc(doc(db('carla'), 'notaschave', '2'.repeat(50))));
  await deve('Nota: conferida, o espelho NÃO é mais corrigido', false, () => updateDoc(doc(db('bruno'), 'espelhos', 'cm_2026-11-1'), { obs: 'x', versao: 3, atualizadoPor: P.bruno, atualizadoEm: serverTimestamp() }));

  /* ---------- nota do profissional MEI para a prestadora (repasse, 10/11/2026) ---------- */
  P.zeca = 'uZECA'; EM.zeca = 'zeca@zeca.com.br';
  await env.withSecurityRulesDisabled(async c => { const d = c.firestore();
    await setDoc(doc(d, 'empresas', 'meiz'), { nome: 'Zeca Elétrica', razao: 'Zeca Souza 33000167000101', cnpj: '33.000.167/0001-01', status: 'mei', tipo: 'prestador', criadoPor: P.zeca, modulos: [] });
    await setDoc(doc(d, 'acessos', 'meiz_' + P.zeca), { uid: P.zeca, empresaId: 'meiz', nome: 'Zeca', email: EM.zeca, cargo: 'admin', extras: [], sem: [], ativo: true });
    await setDoc(doc(d, 'cnpjs', '33000167000101'), { empresaId: 'meiz', criadoEm: serverTimestamp() });
    await setDoc(doc(d, 'medicoes', 'cm_2026-12-1'), med('rita', { periodo: '2026-12-1', status: 'aprovada', valorCentavos: 300000,
      memoria: [{ nome: 'Zeca Souza', horas: 40, valorCentavos: 200000, cnpj: '33000167000101' }, { nome: 'Sem Conta Ainda', horas: 20, valorCentavos: 100000, cnpj: '44000000000144' }] })); });
  const rep = (k, extra) => Object.assign(esp(k, { medicaoId: 'cm_2026-12-1', contratoId: null, tomadorId: 'beta', prestadorId: 'meiz', partes: ['beta', 'meiz'], tomadorNome: 'Beta', prestadorNome: 'Zeca Souza',
    prestadorCnpj: '33.000.167/0001-01', prestadorCnpjNum: '33000167000101', item: 0, horas: 40, origem: 'repasse', osNumero: null,
    tomador: { razao: 'Beta Indústria Ltda', cnpj: '45.723.174/0001-10', im: '', endereco: '', cidade: '', uf: '' }, periodo: '2026-12-1', competencia: '2026-12',
    descricao: 'Prestação de serviços à Beta: 40 horas.', valorCentavos: 200000, retencoes: { iss: 0, inss: 0, ir: 0, pcc: 0 }, liquidoCentavos: 200000, vencimentoDias: 5 }), extra || {});
  const RID = 'cm_2026-12-1_33000167000101';
  await deve('Repasse: o tomador da medição NÃO prepara a nota do MEI (é a prestadora)', false, () => setDoc(doc(db('bruno'), 'espelhos', RID), rep('bruno')));
  await deve('Repasse: NÃO com valor diferente da linha da medição', false, () => setDoc(doc(db('beto'), 'espelhos', RID), rep('beto', { valorCentavos: 250000, liquidoCentavos: 250000 })));
  await deve('Repasse: NÃO para outra empresa que não é a do CNPJ da linha', false, () => setDoc(doc(db('beto'), 'espelhos', RID), rep('beto', { prestadorId: 'alfa', partes: ['beta', 'alfa'] })));
  await deve('Repasse: NÃO com id diferente de medição_CNPJ', false, () => setDoc(doc(db('beto'), 'espelhos', 'outro'), rep('beto')));
  await deve('Repasse: NÃO para CNPJ que ainda não tem conta no Conectwork', false, () => setDoc(doc(db('beto'), 'espelhos', 'cm_2026-12-1_44000000000144'), rep('beto', { item: 1, prestadorCnpjNum: '44000000000144', valorCentavos: 100000, liquidoCentavos: 100000 })));
  await deve('Repasse: NÃO com medição que não está aprovada', false, () => setDoc(doc(db('beto'), 'espelhos', 'cm_2026-10-2_33000167000101'), rep('beto', { medicaoId: 'cm_2026-10-2', periodo: '2026-10-2', competencia: '2026-10' })));
  await deve('Repasse: a prestadora (admin) prepara a nota do MEI pela linha da medição, com o prazo dela', true, () => setDoc(doc(db('beto'), 'espelhos', RID), rep('beto')));
  await deve('Repasse: o MEI lê a nota dele', true, () => getDoc(doc(db('zeca'), 'espelhos', RID)));
  await deve('Repasse: o MEI lista as notas dele (prestadorId)', true, () => getDocs(query(collection(db('zeca'), 'espelhos'), where('prestadorId', '==', 'meiz'))));
  await deve('Repasse: o MEI NÃO lê a medição (é das duas empresas)', false, () => getDoc(doc(db('zeca'), 'medicoes', 'cm_2026-12-1')));
  await deve('Repasse: a empresa que contrata NÃO lê a nota do MEI', false, () => getDoc(doc(db('bruno'), 'espelhos', RID)));
  await deve('Repasse: o MEI registra que abriu o emissor', true, () => updateDoc(doc(db('zeca'), 'espelhos', RID), { emissao: { uid: P.zeca, nome: 'Zeca', em: serverTimestamp() }, atualizadoEm: serverTimestamp() }));
  await deve('Repasse: o MEI NÃO muda o valor', false, () => updateDoc(doc(db('zeca'), 'espelhos', RID), { valorCentavos: 900000, liquidoCentavos: 900000, versao: 2, atualizadoPor: P.zeca, atualizadoEm: serverTimestamp() }));
  /* funções separadas entre as duas empresas: a mesma pessoa pode estar nas duas (ex.: RH da Colafix que também emite pela prestadora) */
  await env.withSecurityRulesDisabled(async c => { const d = c.firestore();
    await setDoc(doc(d, 'acessos', 'beta_' + P.rita), { uid: P.rita, empresaId: 'beta', nome: 'Rita', email: EM.rita, cargo: 'financeiro', extras: [], sem: [], ativo: true });
    await setDoc(doc(d, 'acessos', 'beta_' + P.aldo), { uid: P.aldo, empresaId: 'beta', nome: 'Aldo', email: EM.aldo, cargo: 'financeiro', extras: [], sem: [], ativo: true });
    await setDoc(doc(d, 'medicoes', 'cm_2027-01-1'), med('rita', { periodo: '2027-01-1' })); });
  await deve('Medição: quem lançou pelo tomador NÃO confirma pela prestadora', false, () => updateDoc(doc(db('rita'), 'medicoes', 'cm_2027-01-1'), { status: 'confirmada_prestadora', confirmacao: { uid: P.rita, nome: 'Rita', em: serverTimestamp() }, atualizadoEm: serverTimestamp() }));
  await deve('Medição: outra pessoa da prestadora confirma', true, () => updateDoc(doc(db('aldo'), 'medicoes', 'cm_2027-01-1'), { status: 'confirmada_prestadora', confirmacao: { uid: P.aldo, nome: 'Aldo', em: serverTimestamp() }, atualizadoEm: serverTimestamp() }));
  await deve('Medição: quem confirmou pela prestadora NÃO aprova pelo tomador', false, () => updateDoc(doc(db('aldo'), 'medicoes', 'cm_2027-01-1'), { status: 'aprovada', aprovacao: { uid: P.aldo, nome: 'Aldo', em: serverTimestamp() }, atualizadoEm: serverTimestamp() }));
  await env.withSecurityRulesDisabled(async c => { const d = c.firestore(); await deleteDoc(doc(d, 'acessos', 'beta_' + P.rita)); await deleteDoc(doc(d, 'acessos', 'beta_' + P.aldo)); });

  /* ---------- catálogo de serviços (12/11/2026) ---------- */
  const se = (k, extra) => Object.assign({ empresaId: 'alfa', nome: 'Calibração da balança', cat: 'Manutenção industrial', desc: '', removido: false, criadoPor: P[k], criadoPorNome: k, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() }, extra || {});
  await deve('Serviços: o admin cadastra um serviço específico', true, () => setDoc(doc(db('ana'), 'servicosesp', 's1'), se('ana')));
  await deve('Serviços: o financeiro NÃO cadastra serviço específico', false, () => setDoc(doc(db('bruno'), 'servicosesp', 's2'), se('bruno')));
  await deve('Serviços: NÃO cadastra na empresa de outro', false, () => setDoc(doc(db('ana'), 'servicosesp', 's3'), se('ana', { empresaId: 'beta' })));
  await deve('Serviços: membro da empresa lê', true, () => getDoc(doc(db('bruno'), 'servicosesp', 's1')));
  await deve('Serviços: quem é de outra empresa NÃO lê', false, () => getDoc(doc(db('beto'), 'servicosesp', 's1')));
  await deve('Serviços: o admin tira do catálogo (nada se apaga)', true, () => updateDoc(doc(db('ana'), 'servicosesp', 's1'), { removido: true, atualizadoEm: serverTimestamp() }));
  await deve('Serviços: ninguém apaga', false, () => deleteDoc(doc(db('ana'), 'servicosesp', 's1')));
  const of = (k, emp, extra) => Object.assign({ empresaId: emp, gerais: ['manutencao-eletrica'], especificos: ['Pintura epóxi'], atualizadoPor: P[k], atualizadoEm: serverTimestamp() }, extra || {});
  await deve('Serviços: a prestadora marca o que oferece', true, () => setDoc(doc(db('beto'), 'ofertaserv', 'beta'), of('beto', 'beta')));
  await deve('Serviços: NÃO marca no lugar de outra empresa', false, () => setDoc(doc(db('ana'), 'ofertaserv', 'beta'), of('ana', 'beta')));
  await deve('Serviços: quem contrata vê quem oferece', true, () => getDocs(query(collection(db('ana'), 'ofertaserv'), where('gerais', 'array-contains', 'manutencao-eletrica'))));

  /* ---------- cursos dos parceiros (12/11/2026) ---------- */
  await env.withSecurityRulesDisabled(async c => { await updateDoc(doc(c.firestore(), 'empresas', 'beta'), { modulos: ['cobrancas', 'cursos'] }); });
  const cu = (k, extra) => Object.assign({ empresaId: 'beta', parceiroNome: 'Beta', titulo: 'NR-10 Básico', desc: '', modalidade: 'online', cidade: '', cargaHoras: 40, inicio: '', precoCentavos: 45000, publico: 'todos',
    link: 'https://cursos.exemplo.com.br/nr10', status: 'publicado', removido: false, criadoPor: P[k], criadoPorNome: k, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() }, extra || {});
  await deve('Cursos: o admin do parceiro publica um curso', true, () => setDoc(doc(db('beto'), 'cursos', 'cu1'), cu('beto')));
  await deve('Cursos: empresa sem o módulo de cursos NÃO publica', false, () => setDoc(doc(db('ana'), 'cursos', 'cu2'), cu('ana', { empresaId: 'alfa' })));
  await deve('Cursos: NÃO publica sem o site da inscrição (https)', false, () => setDoc(doc(db('beto'), 'cursos', 'cu3'), cu('beto', { link: 'http://x.com' })));
  await deve('Cursos: quem está logado vê o curso publicado', true, () => getDoc(doc(db('carla'), 'cursos', 'cu1')));
  await deve('Cursos: quem se interessa marca uma vez (sem dados pessoais)', true, () => setDoc(doc(db('ana'), 'cursos', 'cu1', 'interesses', P.ana), { uid: P.ana, empresaId: 'alfa', em: serverTimestamp() }));
  await deve('Cursos: NÃO marca interesse no nome de outra pessoa', false, () => setDoc(doc(db('ana'), 'cursos', 'cu1', 'interesses', P.bruno), { uid: P.bruno, empresaId: 'alfa', em: serverTimestamp() }));
  await deve('Cursos: o parceiro vê quantos se interessaram', true, () => getDocs(collection(db('beto'), 'cursos', 'cu1', 'interesses')));
  await deve('Cursos: quem não é do parceiro NÃO vê os interessados', false, () => getDocs(collection(db('carla'), 'cursos', 'cu1', 'interesses')));
  await deve('Cursos: o parceiro pausa o curso', true, () => updateDoc(doc(db('beto'), 'cursos', 'cu1'), { status: 'pausado', atualizadoEm: serverTimestamp() }));
  await deve('Cursos: curso pausado NÃO aparece para quem é de fora', false, () => getDoc(doc(db('carla'), 'cursos', 'cu1')));
  await deve('Cursos: ninguém apaga', false, () => deleteDoc(doc(db('beto'), 'cursos', 'cu1')));
  await deve('Cursos: o parceiro NÃO registra a própria porcentagem', false, () => setDoc(doc(db('beto'), 'parcerias', 'beta'), { empresaId: 'beta', pctBp: 0, obs: '', em: serverTimestamp(), por: P.beto, porNome: 'Beto' }));
  await deve('Cursos: a equipe Conectwork registra a porcentagem combinada', true, () => setDoc(doc(db('master'), 'parcerias', 'beta'), { empresaId: 'beta', pctBp: 1000, obs: 'Sobre cada inscrição.', em: serverTimestamp(), por: P.master, porNome: 'Equipe' }));
  await deve('Cursos: o parceiro lê a porcentagem dele', true, () => getDoc(doc(db('beto'), 'parcerias', 'beta')));
  await deve('Cursos: outra empresa NÃO lê a porcentagem', false, () => getDoc(doc(db('ana'), 'parcerias', 'beta')));
  await deve('Cursos: NÃO registra porcentagem acima de 100%', false, () => setDoc(doc(db('master'), 'parcerias', 'beta'), { empresaId: 'beta', pctBp: 10001, obs: '', em: serverTimestamp(), por: P.master, porNome: 'Equipe' }));

  /* ---------- títulos (contas a pagar e a receber) ---------- */
  P.tito = 'uTITO'; EM.tito = 'tito@alfa.com.br';
  await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'acessos', 'alfa_' + P.tito), { uid: P.tito, empresaId: 'alfa', nome: 'Tito', email: EM.tito, cargo: 'tesouraria', extras: [], sem: [], ativo: true }); });
  await enviaNota('beto', 'e2', nota('beto', { envio: 't1', chaveUnica: '3'.repeat(50), chave: '3'.repeat(50) }));
  const tit = (k, extra) => Object.assign({ espelhoId: 'e2', medicaoId: 'e2', contratoId: 'cm', tomadorId: 'alfa', prestadorId: 'beta', partes: ['alfa', 'beta'], tomadorNome: 'Alfa', prestadorNome: 'Beta', periodo: '2026-11-1',
    notaNumero: '7', chaveUnica: '3'.repeat(50), valorCentavos: 550000, liquidoCentavos: 514250, retencoes: { iss: 27500, inss: 0, ir: 8250, pcc: 0 }, vencimentoDias: 1, base: serverTimestamp(),
    status: 'aprovado', aprovacao: { uid: P[k], nome: k, em: serverTimestamp() }, liberacao: null, agendamento: null, liquidacao: null, baixa: null, conta: { ok: false, revisao: false, versao: 0 }, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() }, extra || {});
  const conferirCom = (k, t) => { const f = db(k), b = writeBatch(f); b.update(doc(f, 'espelhos', 'e2'), { status: 'nota_ok', conferenciaNota: { uid: P[k], nome: k, em: serverTimestamp(), manual: false }, atualizadoEm: serverTimestamp() }); b.set(doc(f, 'titulos', 'e2'), t); return b.commit(); };
  await deve('Título: NÃO nasce com líquido diferente do espelho', false, () => conferirCom('bruno', tit('bruno', { liquidoCentavos: 550000 })));
  await deve('Título: nasce junto com a nota conferida (financeiro do tomador)', true, () => conferirCom('bruno', tit('bruno')));
  await deve('Título: quem não conferiu a nota NÃO cria título', false, () => setDoc(doc(db('ana'), 'titulos', 'e2'), tit('ana')));
  await deve('Título: a prestadora lê', true, () => getDoc(doc(db('beto'), 'titulos', 'e2')));
  await deve('Título: quem conferiu a nota NÃO libera (funções separadas)', false, () => updateDoc(doc(db('bruno'), 'titulos', 'e2'), { status: 'liberado', liberacao: { uid: P.bruno }, atualizadoEm: serverTimestamp() }));
  await deve('Título: a tesouraria NÃO libera', false, () => updateDoc(doc(db('tito'), 'titulos', 'e2'), { status: 'liberado', liberacao: { uid: P.tito }, atualizadoEm: serverTimestamp() }));
  await deve('Título: outra pessoa do financeiro (admin) libera', true, () => updateDoc(doc(db('ana'), 'titulos', 'e2'), { status: 'liberado', liberacao: { uid: P.ana, nome: 'Ana', em: serverTimestamp() }, atualizadoEm: serverTimestamp() }));
  await deve('Título: NÃO agenda sem a conta da prestadora', false, () => updateDoc(doc(db('tito'), 'titulos', 'e2'), { status: 'agendado', agendamento: { uid: P.tito, data: '2026-12-01' }, atualizadoEm: serverTimestamp() }));
  const contaB = (k, versao, revisao, extra) => { const f = db(k), b = writeBatch(f);
    b.set(doc(f, 'titulos', 'e2', 'privado', 'conta'), Object.assign({ banco: '341 · Itaú Unibanco', agencia: '1234', conta: '5678-9', tipo: 'Corrente', pix: '', titular: 'Beta', doc: '', versao, em: serverTimestamp(), por: P[k], porNome: k }, extra || {}));
    b.update(doc(f, 'titulos', 'e2'), { conta: { ok: true, revisao, versao, em: serverTimestamp(), nome: k }, atualizadoEm: serverTimestamp() }); return b.commit(); };
  await deve('Título: o tomador NÃO informa a conta no lugar da prestadora', false, () => contaB('bruno', 1, false));
  await deve('Título: a prestadora informa a conta para receber', true, () => contaB('beto', 1, false));
  await deve('Título: a tesouraria do tomador lê a conta', true, () => getDoc(doc(db('tito'), 'titulos', 'e2', 'privado', 'conta')));
  await deve('Título: o RH do tomador NÃO lê a conta (LGPD)', false, () => getDoc(doc(db('rita'), 'titulos', 'e2', 'privado', 'conta')));
  await deve('Título: troca de conta NÃO pode vir sem revisão', false, () => contaB('beto', 2, false, { conta: '9999-9' }));
  await deve('Título: a prestadora troca a conta (fica para revisão)', true, () => contaB('beto', 2, true, { conta: '9999-9' }));
  await deve('Título: com a troca sem revisão, a tesouraria NÃO agenda', false, () => updateDoc(doc(db('tito'), 'titulos', 'e2'), { status: 'agendado', agendamento: { uid: P.tito, data: '2026-12-01' }, atualizadoEm: serverTimestamp() }));
  await deve('Título: a prestadora NÃO revisa a própria troca', false, () => updateDoc(doc(db('beto'), 'titulos', 'e2'), { conta: { ok: true, revisao: false, versao: 2, revisadoPor: P.beto }, atualizadoEm: serverTimestamp() }));
  await deve('Título: o financeiro do tomador revisa a troca', true, () => updateDoc(doc(db('ana'), 'titulos', 'e2'), { conta: { ok: true, revisao: false, versao: 2, revisadoPor: P.ana, revisadoNome: 'Ana' }, atualizadoEm: serverTimestamp() }));
  await deve('Título: o financeiro NÃO agenda (é a tesouraria)', false, () => updateDoc(doc(db('bruno'), 'titulos', 'e2'), { status: 'agendado', agendamento: { uid: P.bruno, data: '2026-12-01' }, atualizadoEm: serverTimestamp() }));
  await deve('Título: a tesouraria agenda', true, () => updateDoc(doc(db('tito'), 'titulos', 'e2'), { status: 'agendado', agendamento: { uid: P.tito, nome: 'Tito', em: serverTimestamp(), data: '2026-12-01' }, atualizadoEm: serverTimestamp() }));
  await deve('Título: agendado, a prestadora NÃO troca mais a conta', false, () => contaB('beto', 3, true, { conta: '1111-1' }));
  const liquida = (k, semArq) => { const f = db(k), b = writeBatch(f);
    if (!semArq) b.set(doc(f, 'titulos', 'e2', 'arquivos', 'cp1-0'), { d: 'JVBERi0x', k: 0, envio: 'cp1', em: serverTimestamp() });
    b.update(doc(f, 'titulos', 'e2'), { status: 'liquidado', liquidacao: { uid: P[k], nome: k, em: serverTimestamp(), data: '2026-12-01', comprovante: { envio: 'cp1', partes: 1, nome: 'c.pdf', tipo: 'application/pdf', tam: 10 } }, atualizadoEm: serverTimestamp() }); return b.commit(); };
  await deve('Título: quem liberou NÃO confirma o pagamento (funções separadas)', false, () => liquida('ana'));
  await deve('Título: NÃO fica pago sem o comprovante', false, () => liquida('tito', true));
  await deve('Título: a tesouraria confirma o pagamento com o comprovante', true, () => liquida('tito'));
  await deve('Título: a prestadora abre o comprovante', true, () => getDoc(doc(db('beto'), 'titulos', 'e2', 'arquivos', 'cp1-0')));
  await deve('Título: o tomador NÃO dá baixa no lugar da prestadora', false, () => updateDoc(doc(db('bruno'), 'titulos', 'e2'), { status: 'baixado', baixa: { uid: P.bruno }, atualizadoEm: serverTimestamp() }));
  await deve('Título: a prestadora confirma o recebimento (baixa)', true, () => updateDoc(doc(db('beto'), 'titulos', 'e2'), { status: 'baixado', baixa: { uid: P.beto, nome: 'Beto', em: serverTimestamp() }, atualizadoEm: serverTimestamp() }));
  await deve('Título: ninguém apaga', false, () => deleteDoc(doc(db('ana'), 'titulos', 'e2')));

  /* ---------- avaliação do serviço ---------- */
  const av = (k, extra) => Object.assign({ tipo: 'servico_prestadora', tituloId: 'e2', contratoId: 'cm', tomadorId: 'alfa', prestadorId: 'beta', partes: ['alfa', 'beta'], periodo: '2026-11-1',
    notas: { qualidade: 5, prazo: 4, comunicacao: 4, escopo: 5 }, comentario: 'Equipe pontual.', por: P[k], porNome: k, em: serverTimestamp(), resposta: null }, extra || {});
  await deve('Avaliação: o financeiro do tomador NÃO avalia (é o aprovador técnico)', false, () => setDoc(doc(db('bruno'), 'avaliacoes', 'e2'), av('bruno')));
  await deve('Avaliação: a prestadora NÃO se avalia', false, () => setDoc(doc(db('beto'), 'avaliacoes', 'e2'), av('beto')));
  await deve('Avaliação: nota fora de 1 a 5 NÃO entra', false, () => setDoc(doc(db('aldo'), 'avaliacoes', 'e2'), av('aldo', { notas: { qualidade: 6, prazo: 4, comunicacao: 4, escopo: 5 } })));
  await deve('Avaliação: NÃO antes do pagamento', false, () => setDoc(doc(db('aldo'), 'avaliacoes', 'cm_2026-11-1'), av('aldo', { tituloId: 'cm_2026-11-1' })));
  await deve('Avaliação: o aprovador técnico avalia depois do pagamento', true, () => setDoc(doc(db('aldo'), 'avaliacoes', 'e2'), av('aldo')));
  await deve('Avaliação: NÃO avalia duas vezes o mesmo período', false, () => setDoc(doc(db('ana'), 'avaliacoes', 'e2'), av('ana')));
  await deve('Avaliação: o tomador NÃO muda a nota depois', false, () => updateDoc(doc(db('aldo'), 'avaliacoes', 'e2'), { notas: { qualidade: 1, prazo: 1, comunicacao: 1, escopo: 1 } }));
  await deve('Avaliação: a prestadora lê e responde', true, () => updateDoc(doc(db('beto'), 'avaliacoes', 'e2'), { resposta: { texto: 'Obrigado pelo retorno!', uid: P.beto, nome: 'Beto', em: serverTimestamp() } }));
  await deve('Avaliação: a resposta é uma só', false, () => updateDoc(doc(db('beto'), 'avaliacoes', 'e2'), { resposta: { texto: 'Outra resposta.', uid: P.beto } }));
  await deve('Avaliação: ninguém apaga', false, () => deleteDoc(doc(db('ana'), 'avaliacoes', 'e2')));

  /* ---------- sites para emitir a nota ---------- */
  await deve('Emissores: a equipe Conectwork cadastra o site de uma cidade', true, () => setDoc(doc(db('master'), 'config', 'emissores'), { cidades: { 'RS|GRAVATAI': { cidade: 'Gravataí', url: 'https://exemplo.gov.br' } }, em: serverTimestamp(), por: P.master }));
  await deve('Emissores: qualquer pessoa logada lê a tabela', true, () => getDoc(doc(db('beto'), 'config', 'emissores')));
  await deve('Emissores: empresa NÃO muda a tabela', false, () => setDoc(doc(db('ana'), 'config', 'emissores'), { cidades: {}, em: serverTimestamp(), por: P.ana }));
  await deve('Emissores: o admin define o site da própria empresa (área privada)', true, () => updateDoc(doc(db('ana'), 'empresas', 'alfa', 'privado', 'cadastro'), { emissor: { url: 'https://exemplo.gov.br', nome: 'site da prefeitura' } }));
  await deve('Emissores: o financeiro NÃO muda a área privada', false, () => updateDoc(doc(db('bruno'), 'empresas', 'alfa', 'privado', 'cadastro'), { emissor: null }));

  /* ---------- serviço por entrega: contrato "os" e ordens de serviço ---------- */
  P.sol = 'uSOL'; EM.sol = 'sol@alfa.com.br';
  await env.withSecurityRulesDisabled(async c => { const d = c.firestore();
    await setDoc(doc(d, 'acessos', 'alfa_' + P.sol), { uid: P.sol, empresaId: 'alfa', nome: 'Sol', email: EM.sol, cargo: 'solicitante', extras: [], sem: [], ativo: true });
    await setDoc(doc(d, 'contratos', 'co'), ct({ modalidade: 'os', periodicidade: '', status: 'ativo', assinaturas: { tomador: { uid: P.ana }, prestador: { uid: P.beto } } })); });
  await deve('OS: contrato por entrega NÃO tem medição por período', false, () => setDoc(doc(db('ana'), 'contratos', 'co2'), ct({ modalidade: 'os', periodicidade: 'quinzena' })));
  await deve('OS: o admin cria contrato de serviço por entrega', true, () => setDoc(doc(db('ana'), 'contratos', 'co2'), ct({ modalidade: 'os', periodicidade: '' })));
  const os = (k, extra) => Object.assign({ contratoId: 'co', tomadorId: 'alfa', prestadorId: 'beta', partes: ['alfa', 'beta'], tomadorNome: 'Alfa', prestadorNome: 'Beta', numero: 1, titulo: 'Revisão do quadro elétrico', escopo: 'Trocar disjuntores e entregar relatório.',
    prazo: '2026-12-10', valorCentavos: 300000, status: 'proposta', aceiteProf: null, recusa: null, entrega: null, entregas: [], divergencia: null, aceite: null, cancelamento: null, criadoPor: P[k], criadoPorNome: k, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() }, extra || {});
  await deve('OS: o financeiro NÃO cria OS', false, () => setDoc(doc(db('bruno'), 'ordens', 'o0'), os('bruno')));
  await deve('OS: NÃO cria OS em contrato de equipe contínua', false, () => setDoc(doc(db('sol'), 'ordens', 'o0'), os('sol', { contratoId: 'cm' })));
  await deve('OS: o solicitante cria a OS (escopo, prazo e valor da entrega)', true, () => setDoc(doc(db('sol'), 'ordens', 'o1'), os('sol')));
  await deve('OS: o tomador NÃO aceita a OS no lugar do profissional', false, () => updateDoc(doc(db('ana'), 'ordens', 'o1'), { status: 'aceita', aceiteProf: { uid: P.ana }, atualizadoEm: serverTimestamp() }));
  await deve('OS: o profissional recusa sem motivo (sem punição)', true, async () => { await setDoc(doc(db('sol'), 'ordens', 'o2'), os('sol', { numero: 2 })); return updateDoc(doc(db('beto'), 'ordens', 'o2'), { status: 'recusada', recusa: { uid: P.beto, nome: 'Beto', motivo: '', em: serverTimestamp() }, atualizadoEm: serverTimestamp() }); });
  await deve('OS: o profissional aceita', true, () => updateDoc(doc(db('beto'), 'ordens', 'o1'), { status: 'aceita', aceiteProf: { uid: P.beto, nome: 'Beto', em: serverTimestamp() }, atualizadoEm: serverTimestamp() }));
  await deve('OS: entrega sem descrição NÃO vale', false, () => updateDoc(doc(db('beto'), 'ordens', 'o1'), { status: 'entregue', entrega: { uid: P.beto, descricao: 'ok', arquivo: null }, entregas: [{ d: 1 }], atualizadoEm: serverTimestamp() }));
  await deve('OS: o profissional registra a entrega', true, () => updateDoc(doc(db('beto'), 'ordens', 'o1'), { status: 'entregue', entrega: { uid: P.beto, nome: 'Beto', descricao: 'Disjuntores trocados e relatório entregue.', arquivo: null, em: serverTimestamp() }, entregas: [{ d: 1 }], atualizadoEm: serverTimestamp() }));
  await deve('OS: quem pediu a OS NÃO aceita a entrega sozinho', false, () => updateDoc(doc(db('sol'), 'ordens', 'o1'), { status: 'aceita_total', aceite: { uid: P.sol, tipo: 'total', valorAceito: 300000 }, atualizadoEm: serverTimestamp() }));
  await deve('OS: aceite total NÃO pode mudar o valor', false, () => updateDoc(doc(db('aldo'), 'ordens', 'o1'), { status: 'aceita_total', aceite: { uid: P.aldo, tipo: 'total', valorAceito: 1 }, atualizadoEm: serverTimestamp() }));
  await deve('OS: aceite parcial sem motivo NÃO vale', false, () => updateDoc(doc(db('aldo'), 'ordens', 'o1'), { status: 'aceita_parcial', aceite: { uid: P.aldo, tipo: 'parcial', valorAceito: 200000, motivo: '' }, atualizadoEm: serverTimestamp() }));
  await deve('OS: o aprovador aponta divergência', true, () => updateDoc(doc(db('aldo'), 'ordens', 'o1'), { status: 'divergencia', divergencia: { uid: P.aldo, nome: 'Aldo', motivo: 'Faltou o relatório com fotos.', em: serverTimestamp() }, atualizadoEm: serverTimestamp() }));
  await deve('OS: o profissional entrega de novo', true, () => updateDoc(doc(db('beto'), 'ordens', 'o1'), { status: 'entregue', entrega: { uid: P.beto, nome: 'Beto', descricao: 'Relatório com fotos anexado.', arquivo: null, em: serverTimestamp() }, entregas: [{ d: 1 }, { d: 2 }], atualizadoEm: serverTimestamp() }));
  await deve('OS: o aprovador aceita em parte com motivo', true, () => updateDoc(doc(db('aldo'), 'ordens', 'o1'), { status: 'aceita_parcial', aceite: { uid: P.aldo, nome: 'Aldo', tipo: 'parcial', valorAceito: 250000, motivo: 'Um disjuntor ficou para a próxima OS.', em: serverTimestamp() }, atualizadoEm: serverTimestamp() }));
  const espOs = (extra) => Object.assign({ medicaoId: 'o1', origem: 'os', osNumero: 1, contratoId: 'co', tomadorId: 'alfa', prestadorId: 'beta', partes: ['alfa', 'beta'], tomadorNome: 'Alfa', prestadorNome: 'Beta', prestadorCnpj: '',
    tomador: { razao: 'Alfa Serviços Ltda', cnpj: '11.222.333/0001-81', im: '', endereco: '', cidade: '', uf: '' }, periodo: '2026-11', competencia: '2026-11', descricao: 'Prestação de serviços: OS 1.', valorCentavos: 250000,
    retencoes: { iss: 0, inss: 0, ir: 0, pcc: 0 }, liquidoCentavos: 250000, vencimentoDias: 1, obs: '', status: 'aguardando_nota', versao: 1, criadoPor: P.bruno, criadoPorNome: 'Bruno', criadoEm: serverTimestamp(), atualizadoPor: P.bruno, atualizadoPorNome: 'Bruno', atualizadoEm: serverTimestamp() }, extra || {});
  await deve('OS: espelho da OS NÃO pode ter o valor combinado (vale o aceito)', false, () => setDoc(doc(db('bruno'), 'espelhos', 'o1'), espOs({ valorCentavos: 300000, liquidoCentavos: 300000 })));
  await deve('OS: o financeiro prepara o espelho com o valor aceito', true, () => setDoc(doc(db('bruno'), 'espelhos', 'o1'), espOs()));
  await deve('OS: NÃO cancela OS já entregue e aceita', false, () => updateDoc(doc(db('sol'), 'ordens', 'o1'), { status: 'cancelada', cancelamento: { uid: P.sol, motivo: 'Não precisa mais.' }, atualizadoEm: serverTimestamp() }));
  await deve('OS: ninguém apaga', false, () => deleteDoc(doc(db('ana'), 'ordens', 'o1')));

  /* ---------- documentos e certidões ---------- */
  const docE = (k, extra) => Object.assign({ empresaId: 'alfa', tipo: 'cndt', grupo: 'certidao', nome: 'CNDT', validade: '2027-01-31', compartilhar: true, status: 'vigente',
    arquivo: { envio: 'e1', partes: 1, nome: 'cndt.pdf', tipo: 'application/pdf', tam: 9 }, enviadoPor: P[k], enviadoPorNome: k, criadoEm: serverTimestamp() }, extra || {});
  const enviaDoc = (k, id, dados, semArq) => { const f = db(k), b = writeBatch(f); b.set(doc(f, 'documentos', id), dados);
    if (!semArq) b.set(doc(f, 'documentos', id, 'arquivos', dados.arquivo.envio + '-0'), { d: 'JVBERi0x', k: 0, envio: dados.arquivo.envio, em: serverTimestamp() }); return b.commit(); };
  await deve('Documento: NÃO entra sem o arquivo', false, () => enviaDoc('ana', 'd0', docE('ana'), true));
  await deve('Documento: o aprovador NÃO envia documento da empresa', false, () => enviaDoc('aldo', 'd0', docE('aldo')));
  await deve('Documento: documento do responsável NÃO pode ser compartilhado', false, () => enviaDoc('ana', 'd0', docE('ana', { tipo: 'identidade', grupo: 'cadastro', validade: '' })));
  await deve('Documento: o admin envia a certidão com o arquivo', true, () => enviaDoc('ana', 'd1', docE('ana')));
  await deve('Documento: o RH envia o documento do cadastro (não compartilhado)', true, () => enviaDoc('rita', 'd2', docE('rita', { tipo: 'identidade', grupo: 'cadastro', nome: 'Documento do responsável', validade: '', compartilhar: false, arquivo: { envio: 'e2', partes: 1, nome: 'rg.pdf', tipo: 'application/pdf', tam: 9 } })));
  await deve('Documento: outra empresa lê a certidão compartilhada', true, () => getDoc(doc(db('beto'), 'documentos', 'd1')));
  await deve('Documento: outra empresa lista as certidões compartilhadas', true, () => getDocs(query(collection(db('beto'), 'documentos'), where('empresaId', '==', 'alfa'), where('compartilhar', '==', true))));
  await deve('Documento: outra empresa abre o arquivo da certidão compartilhada', true, () => getDoc(doc(db('beto'), 'documentos', 'd1', 'arquivos', 'e1-0')));
  await deve('Documento: outra empresa NÃO lê o documento do cadastro', false, () => getDoc(doc(db('beto'), 'documentos', 'd2')));
  await deve('Documento: outra empresa NÃO abre o arquivo do cadastro', false, () => getDoc(doc(db('beto'), 'documentos', 'd2', 'arquivos', 'e2-0')));
  await deve('Documento: a equipe Conectwork lê o documento do cadastro', true, () => getDoc(doc(db('master'), 'documentos', 'd2')));
  await deve('Documento: NÃO troca o arquivo de um documento já enviado', false, () => setDoc(doc(db('ana'), 'documentos', 'd1', 'arquivos', 'e1-1'), { d: 'x', k: 1, envio: 'e1', em: serverTimestamp() }));
  await deve('Documento: NÃO muda a validade depois de enviado', false, () => updateDoc(doc(db('ana'), 'documentos', 'd1'), { validade: '2030-01-01' }));
  await deve('Documento: enviar de novo marca o anterior como substituído', true, () => updateDoc(doc(db('ana'), 'documentos', 'd1'), { status: 'substituido', substituidoEm: serverTimestamp(), substituidoPor: 'd9' }));
  await deve('Documento: ninguém apaga', false, () => deleteDoc(doc(db('ana'), 'documentos', 'd1')));

  /* ---------- meu negócio ---------- */
  await deve('Negócio: o admin guarda o faturamento fora do Conectwork', true, () => setDoc(doc(db('ana'), 'faturamento', 'alfa'), { anos: { 2026: { '10': 100000 } }, clientes: [{ nome: 'Cliente X', desde: '01/2026' }], em: serverTimestamp(), por: P.ana }));
  await deve('Negócio: o RH NÃO vê o faturamento', false, () => getDoc(doc(db('rita'), 'faturamento', 'alfa')));
  await deve('Negócio: outra empresa NÃO vê o faturamento', false, () => getDoc(doc(db('beto'), 'faturamento', 'alfa')));
  await deve('Negócio: o financeiro mostra só o número de clientes', true, () => setDoc(doc(db('bruno'), 'independencia', 'alfa'), { nClientes: 3, compartilhar: true, em: serverTimestamp(), por: P.bruno }));
  await deve('Negócio: NÃO aceita nomes de clientes no documento compartilhado', false, () => setDoc(doc(db('bruno'), 'independencia', 'alfa'), { nClientes: 3, compartilhar: true, clientes: ['Cliente X'], em: serverTimestamp(), por: P.bruno }));
  await deve('Negócio: quem contrata lê o número de clientes', true, () => getDoc(doc(db('beto'), 'independencia', 'alfa')));

  /* ---------- modelo de nota e obrigações do MEI ---------- */
  await deve('Modelo de nota: o financeiro salva o código de tributação', true, () => setDoc(doc(db('bruno'), 'notamodelo', 'alfa'), { codigo: '14.01.01', codigoDesc: 'Revisão de máquinas', municipio: 'Gravataí/RS', complemento: '', em: serverTimestamp(), por: P.bruno }));
  await deve('Modelo de nota: código fora do formato NÃO entra', false, () => setDoc(doc(db('bruno'), 'notamodelo', 'alfa'), { codigo: '1401', em: serverTimestamp(), por: P.bruno }));
  await deve('Modelo de nota: outra empresa NÃO lê', false, () => getDoc(doc(db('beto'), 'notamodelo', 'alfa')));
  await deve('MEI: o admin marca o DAS como pago', true, () => setDoc(doc(db('ana'), 'fiscal', 'alfa'), { das: { '2026-10': { pago: true, data: '2026-11-07' } }, dasn: {}, em: serverTimestamp(), por: P.ana }));
  await deve('MEI: o RH NÃO vê as obrigações fiscais', false, () => getDoc(doc(db('rita'), 'fiscal', 'alfa')));

  /* ---------- minhas autorizações ---------- */
  const regC = (k, aceite, extra) => Object.assign({ uid: P.ana, finalidade: k, aceite, texto: 'Receber ofertas.', textoVersao: '2026-10', canal: 'minhas-autorizacoes', em: serverTimestamp() }, extra || {});
  await deve('Autorizações: a pessoa dá uma autorização opcional', true, () => setDoc(doc(db('ana'), 'consentimentos', P.ana + '_ofertas'), regC('ofertas', true)));
  await deve('Autorizações: a pessoa retira, com a data da retirada', true, () => setDoc(doc(db('ana'), 'consentimentos', P.ana + '_ofertas'), regC('ofertas', false, { revogadoEm: serverTimestamp() })));
  await deve('Autorizações: o histórico ganha um registro novo', true, () => addDoc(collection(db('ana'), 'consentimentos_log'), regC('ofertas', false, { revogadoEm: serverTimestamp() })));
  await deve('Autorizações: ninguém muda a autorização de outra pessoa', false, () => setDoc(doc(db('bruno'), 'consentimentos', P.ana + '_ofertas'), regC('ofertas', true, { uid: P.ana })));
  await deve('Autorizações: a pessoa lê o próprio histórico', true, () => getDocs(query(collection(db('ana'), 'consentimentos_log'), where('uid', '==', P.ana))));

  /* ---------- logo da empresa ---------- */
  const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  await deve('Logo: o admin envia a logo da empresa', true, () => setDoc(doc(db('ana'), 'logos', 'alfa'), { d: LOGO, nome: 'logo.png', em: serverTimestamp(), por: P.ana }));
  await deve('Logo: o financeiro NÃO troca a logo', false, () => setDoc(doc(db('bruno'), 'logos', 'alfa'), { d: LOGO, nome: 'x.png', em: serverTimestamp(), por: P.bruno }));
  await deve('Logo: NÃO troca a logo de outra empresa', false, () => setDoc(doc(db('ana'), 'logos', 'beta'), { d: LOGO, nome: 'x.png', em: serverTimestamp(), por: P.ana }));
  await deve('Logo: NÃO aceita SVG (pode ter código)', false, () => setDoc(doc(db('ana'), 'logos', 'alfa'), { d: 'data:image/svg+xml;base64,PHN2Zz4=', nome: 'x.svg', em: serverTimestamp(), por: P.ana }));
  await deve('Logo: outra empresa vê a logo', true, () => getDoc(doc(db('beto'), 'logos', 'alfa')));
  await deve('Logo: o admin tira a logo', true, () => deleteDoc(doc(db('ana'), 'logos', 'alfa')));

  /* ---------- master e perfil ---------- */
  await deve('Pessoa lê o próprio master/{uid} (para saber se é equipe)', true, () => getDoc(doc(db('master'), 'master', P.master)));
  await deve('Pessoa consulta master/{uid} próprio mesmo sem ser master (documento não existe)', true, () => getDoc(doc(db('carla'), 'master', P.carla)));
  await deve('Ninguém se coloca na equipe master pelo app', false, () => setDoc(doc(db('carla'), 'master', P.carla), { nome: 'Carla' }));
  await deve('Pessoa cria o próprio perfil com o e-mail do login', true, () => setDoc(doc(db('carla'), 'usuarios', P.carla), { nome: 'Carla', email: EM.carla, criadoEm: serverTimestamp() }));
  await deve('Pessoa NÃO cria perfil com e-mail de outra pessoa', false, () => setDoc(doc(db('carla'), 'usuarios', P.carla), { nome: 'Carla', email: EM.ana }));
  await deve('Pessoa NÃO lê o perfil de outra', false, () => getDoc(doc(db('carla'), 'usuarios', P.ana)));
  await deve('Coleção fora das regras é negada', false, () => getDoc(doc(db('ana'), 'qualquer', 'x')));

  /* ---------- painel da equipe Conectwork: equipe, planos, mensalidades e avisos ---------- */
  await semear();
  await env.withSecurityRulesDisabled(async c => { const d = c.firestore();
    await setDoc(doc(d, 'acessos', 'beta_' + P.beto), { uid: P.beto, empresaId: 'beta', nome: 'Beto', email: EM.beto, cargo: 'admin', extras: [], sem: [], ativo: true });
    await setDoc(doc(d, 'convites', 'tkm1'), { email: EM.carla, nome: 'Carla Dias', tipo: 'master', empresaId: 'conectwork', usado: false, criadoPor: P.master });
    await setDoc(doc(d, 'convites', 'tkm2'), { email: EM.edu, nome: 'Edu', tipo: 'master', empresaId: 'alfa', cargo: 'operacional', usado: false, criadoPor: P.master });
  });
  await deve('Equipe: a equipe Conectwork convida pelo link', true, () => setDoc(doc(db('master'), 'convites', 'tkm3'), { email: 'nova@conectwork.com.br', nome: 'Nova', tipo: 'master', empresaId: 'conectwork', usado: false, criadoPor: P.master, criadoEm: serverTimestamp() }));
  await deve('Equipe: admin de empresa NÃO cria convite da equipe Conectwork', false, () => setDoc(doc(db('ana'), 'convites', 'tkm4'), { email: 'x@x.com.br', nome: 'X', tipo: 'master', empresaId: 'alfa', cargo: 'admin', usado: false, criadoPor: P.ana, criadoEm: serverTimestamp() }));
  const entraEquipe = (k, tk) => { const d = db(k), b = writeBatch(d);
    b.set(doc(d, 'master', P[k]), { nome: 'Pessoa Nova', email: EM[k], convite: tk, criadoEm: serverTimestamp() });
    b.update(doc(d, 'convites', tk), { usado: true, usadoEm: serverTimestamp(), usadoPor: P[k] });
    b.set(doc(collection(d, 'log')), { em: serverTimestamp(), uid: P[k], quem: 'Pessoa Nova', empresaId: 'master', acao: 'equipe.entrar', texto: 'Entrou na equipe.', ref: tk });
    return b.commit(); };
  await deve('Equipe: outra pessoa NÃO usa o convite da equipe feito para outro e-mail', false, () => entraEquipe('bruno', 'tkm1'));
  await deve('Equipe: convite de empresa NÃO coloca ninguém na equipe', false, () => entraEquipe('edu', 'tok123'));
  await deve('Equipe: convite da equipe NÃO vira acesso de empresa', false, () => setDoc(doc(db('edu'), 'acessos', 'alfa_' + P.edu), { uid: P.edu, empresaId: 'alfa', nome: 'Edu', email: EM.edu, cargo: 'operacional', extras: [], sem: [], ativo: true, convite: 'tkm2', criadoEm: serverTimestamp() }));
  await deve('Equipe: quem recebeu o convite entra na equipe (com o histórico)', true, () => entraEquipe('carla', 'tkm1'));
  await deve('Equipe: o convite usado não serve de novo', false, () => setDoc(doc(db('carla'), 'master', P.carla), { nome: 'Carla Dias', email: EM.carla, convite: 'tkm1', criadoEm: serverTimestamp() }));
  await deve('Equipe: ninguém muda o próprio registro da equipe', false, () => updateDoc(doc(db('carla'), 'master', P.carla), { nome: 'Outra' }));
  await deve('Equipe: ninguém se tira da equipe sozinho', false, () => deleteDoc(doc(db('master'), 'master', P.master)));
  await deve('Equipe: quem não é da equipe NÃO tira ninguém', false, () => deleteDoc(doc(db('ana'), 'master', P.carla)));
  await deve('Equipe: outra pessoa da equipe tira alguém', true, () => deleteDoc(doc(db('master'), 'master', P.carla)));

  /* planos */
  const planos = (k, x) => setDoc(doc(db(k), 'config', 'planos'), Object.assign({ valores: { essencial: 19900, profissional: 39900, rede: 79900, gratuito: 0 }, diaVenc: 10, em: serverTimestamp(), por: 'Iasmyn' }, x || {}));
  await deve('Planos: a equipe define os valores e o dia do vencimento', true, () => planos('master'));
  await deve('Planos: o dia do vencimento vai de 1 a 28', false, () => planos('master', { diaVenc: 31 }));
  await deve('Planos: empresa NÃO muda os valores', false, () => planos('ana'));
  await deve('Planos: qualquer pessoa logada lê os valores', true, () => getDoc(doc(db('beto'), 'config', 'planos')));

  /* mensalidades */
  const mens = (k, id, x) => setDoc(doc(db(k), 'mensalidades', id), Object.assign({ empresaId: 'beta', empresaNome: 'Beta', comp: '2026-11', plano: 'essencial', valorCentavos: 19900, venc: '2026-11-10', status: 'aberta', criadoEm: serverTimestamp(), criadoPor: P.master }, x || {}));
  await deve('Mensalidade: a equipe gera a do mês', true, () => mens('master', 'beta_2026-11'));
  await deve('Mensalidade: o id é empresa_mês (não gera duas do mesmo mês com outro id)', false, () => mens('master', 'beta_x'));
  await deve('Mensalidade: NÃO nasce paga', false, () => mens('master', 'beta_2026-12', { comp: '2026-12', status: 'paga' }));
  await deve('Mensalidade: empresa NÃO cria mensalidade', false, () => mens('beto', 'beta_2026-10', { comp: '2026-10' }));
  await deve('Mensalidade: o admin da empresa lê a sua', true, () => getDoc(doc(db('beto'), 'mensalidades', 'beta_2026-11')));
  await deve('Mensalidade: outra empresa NÃO lê', false, () => getDoc(doc(db('ana'), 'mensalidades', 'beta_2026-11')));
  await deve('Mensalidade: o admin da empresa lista as suas', true, () => getDocs(query(collection(db('beto'), 'mensalidades'), where('empresaId', '==', 'beta'))));
  await deve('Mensalidade: a empresa NÃO dá baixa', false, () => updateDoc(doc(db('beto'), 'mensalidades', 'beta_2026-11'), { status: 'paga', pagoNoDia: '2026-11-08', pagoPor: 'Beto', atualizadoEm: serverTimestamp() }));
  await deve('Mensalidade: baixa sem a data em que o dinheiro entrou é negada', false, () => updateDoc(doc(db('master'), 'mensalidades', 'beta_2026-11'), { status: 'paga', pagoPor: 'Iasmyn', atualizadoEm: serverTimestamp() }));
  await deve('Mensalidade: a equipe dá baixa com a data do recebimento', true, () => updateDoc(doc(db('master'), 'mensalidades', 'beta_2026-11'), { status: 'paga', pagoNoDia: '2026-11-08', pagoPor: 'Iasmyn', pagoEm: serverTimestamp(), atualizadoEm: serverTimestamp() }));
  await deve('Mensalidade: depois de paga, o valor NÃO muda', false, () => updateDoc(doc(db('master'), 'mensalidades', 'beta_2026-11'), { valorCentavos: 100, atualizadoEm: serverTimestamp() }));
  await deve('Mensalidade: a equipe desfaz a baixa (volta para aberta)', true, () => updateDoc(doc(db('master'), 'mensalidades', 'beta_2026-11'), { status: 'aberta', pagoNoDia: null, pagoPor: null, pagoEm: null, atualizadoEm: serverTimestamp() }));
  await deve('Mensalidade: nada se apaga', false, () => deleteDoc(doc(db('master'), 'mensalidades', 'beta_2026-11')));

  /* avisos */
  const aviso = (k, id, x) => setDoc(doc(db(k), 'avisos', id), Object.assign({ titulo: 'Manutenção no sábado', texto: 'O Conectwork fica fora do ar das 8h às 10h.', tipo: 'info', para: 'todos', ate: '2026-12-31', ativo: true, criadoEm: serverTimestamp(), criadoPor: P[k], criadoPorNome: 'Iasmyn' }, x || {}));
  await deve('Avisos: a equipe publica um aviso para a rede', true, () => aviso('master', 'a1'));
  await deve('Avisos: empresa NÃO publica aviso', false, () => aviso('ana', 'a2'));
  await deve('Avisos: aviso com público fora da lista é negado', false, () => aviso('master', 'a3', { para: 'alguns' }));
  await deve('Avisos: qualquer pessoa logada lê', true, () => getDoc(doc(db('beto'), 'avisos', 'a1')));
  await deve('Avisos: sem login NÃO lê', false, () => getDoc(doc(anon(), 'avisos', 'a1')));
  await deve('Avisos: a equipe tira do ar', true, () => updateDoc(doc(db('master'), 'avisos', 'a1'), { ativo: false, atualizadoEm: serverTimestamp() }));
  await deve('Avisos: NÃO se troca quem publicou', false, () => updateDoc(doc(db('master'), 'avisos', 'a1'), { criadoPorNome: 'Outra' }));
  await deve('Avisos: nada se apaga', false, () => deleteDoc(doc(db('master'), 'avisos', 'a1')));

  /* suspender empresa */
  await deve('Empresa: a equipe suspende o acesso de uma empresa (com motivo)', true, () => updateDoc(doc(db('master'), 'empresas', 'beta'), { status: 'suspenso', motivo: 'Mensalidade em atraso.', avaliadoEm: serverTimestamp(), avaliadoPor: 'Iasmyn' }));
  await deve('Empresa: o admin NÃO tira a própria suspensão', false, () => updateDoc(doc(db('beto'), 'empresas', 'beta'), { status: 'aprovado' }));

  /* ---------- Na sua cidade (11/11/2026): a Prefeitura publica, o prestador se inscreve ---------- */
  Object.assign(P, { pia: 'uPIA', caio: 'uCAIO', olga: 'uOLGA', vera: 'uVERA' });
  Object.assign(EM, { pia: 'pia@cidade.example', caio: 'caio@mei.example', olga: 'olga@cidade.example', vera: 'vera@outra.example' });
  await env.withSecurityRulesDisabled(async c => { const d = c.firestore();
    await setDoc(doc(d, 'empresas', 'pref'), { nome: 'Prefeitura de Vila Nova', status: 'aprovado', tipo: 'contratante', cidade: 'Vila Nova', uf: 'RS', modulos: ['equipe', 'cidade'], criadoPor: 'uX' });
    await setDoc(doc(d, 'empresas', 'meic'), { nome: 'Caio Reparos', status: 'mei', tipo: 'prestador', cidade: 'Vila Nova', uf: 'RS', criadoPor: P.caio });
    await setDoc(doc(d, 'empresas', 'semmod'), { nome: 'Outra Ltda', status: 'aprovado', tipo: 'contratante', cidade: 'Vila Nova', uf: 'RS', modulos: ['equipe'], criadoPor: 'uX' });
    const ac = (emp, k, cargo) => setDoc(doc(d, 'acessos', emp + '_' + P[k]), { uid: P[k], empresaId: emp, nome: k, email: EM[k], cargo, extras: [], sem: [], ativo: true });
    await ac('pref', 'pia', 'admin'); await ac('pref', 'olga', 'consulta'); await ac('meic', 'caio', 'admin'); await ac('semmod', 'vera', 'admin'); });
  const op = extra => Object.assign({ origemId: 'pref', origemNome: 'Prefeitura de Vila Nova', cidade: 'Vila Nova', uf: 'RS', cidadeKey: 'vila-nova-rs', tipo: 'curso', titulo: 'Oficina de regularização do DAS', texto: '', data: '2026-12-01', hora: '19:00', local: 'Sala do Empreendedor', link: '', ate: '', inscricao: true, vagas: 30, gatilho: 'das', ramos: [], docs: [], valorCentavos: 0,
    status: 'publicado', criadoPor: P.pia, criadoPorNome: 'Pia', criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() }, extra || {});
  await deve('Cidade: a parceira publica para a própria cidade', true, () => setDoc(doc(db('pia'), 'oportunidades', 'o1'), op()));
  await deve('Cidade: guarda um rascunho', true, () => setDoc(doc(db('pia'), 'oportunidades', 'o2'), op({ status: 'rascunho', tipo: 'licitacao', titulo: 'Pregão de pintura', inscricao: false, vagas: 0, gatilho: '' })));
  await deve('Cidade: NÃO publica para outra cidade', false, () => setDoc(doc(db('pia'), 'oportunidades', 'o3'), op({ cidade: 'Outra Cidade', cidadeKey: 'outra-cidade-rs' })));
  await deve('Cidade: NÃO com campo a mais', false, () => setDoc(doc(db('pia'), 'oportunidades', 'o3'), op({ cpf: '1' })));
  await deve('Cidade: NÃO com link que não é https', false, () => setDoc(doc(db('pia'), 'oportunidades', 'o3'), op({ link: 'javascript:alert(1)' })));
  await deve('Cidade: NÃO em nome de outra pessoa', false, () => setDoc(doc(db('pia'), 'oportunidades', 'o3'), op({ criadoPor: P.olga })));
  await deve('Cidade: cargo de consulta da parceira NÃO publica', false, () => setDoc(doc(db('olga'), 'oportunidades', 'o3'), op({ criadoPor: P.olga })));
  await deve('Cidade: empresa sem o módulo NÃO publica', false, () => setDoc(doc(db('vera'), 'oportunidades', 'o3'), op({ origemId: 'semmod', criadoPor: P.vera })));
  await deve('Cidade: o prestador NÃO publica em nome da parceira', false, () => setDoc(doc(db('caio'), 'oportunidades', 'o3'), op({ criadoPor: P.caio })));
  await deve('Cidade: o prestador lê o que está publicado na cidade', true, () => getDocs(query(collection(db('caio'), 'oportunidades'), where('cidadeKey', '==', 'vila-nova-rs'), where('status', '==', 'publicado'))));
  await deve('Cidade: o prestador NÃO lê rascunho', false, () => getDoc(doc(db('caio'), 'oportunidades', 'o2')));
  await deve('Cidade: sem login NÃO lê', false, () => getDoc(doc(anon(), 'oportunidades', 'o1')));
  await deve('Cidade: a parceira lê todas as suas (rascunho também)', true, () => getDocs(query(collection(db('pia'), 'oportunidades'), where('origemId', '==', 'pref'))));
  await deve('Cidade: a parceira encerra', true, () => updateDoc(doc(db('pia'), 'oportunidades', 'o2'), { status: 'encerrado', atualizadoEm: serverTimestamp() }));
  await deve('Cidade: NÃO troca a cidade depois', false, () => updateDoc(doc(db('pia'), 'oportunidades', 'o1'), { cidade: 'Outra', cidadeKey: 'outra-rs' }));
  await deve('Cidade: ninguém apaga a publicação', false, () => deleteDoc(doc(db('pia'), 'oportunidades', 'o1')));
  const ins = extra => Object.assign({ oportunidadeId: 'o1', origemId: 'pref', origemNome: 'Prefeitura de Vila Nova', titulo: 'Oficina de regularização do DAS', tipo: 'curso', empresaId: 'meic', negocio: 'Caio Reparos', pessoa: 'Caio', email: EM.caio, tel: '',
    status: 'inscrito', concluiu: null, consentimento: { texto: 'Autorizo o envio do nome, e-mail e telefone só para esta inscrição.', versao: '2026-11-11', em: serverTimestamp() }, criadoPor: P.caio, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() }, extra || {});
  await deve('Inscrição: NÃO sem a autorização', false, () => setDoc(doc(db('caio'), 'inscricoes', 'o1_meic'), ins({ consentimento: null })));
  await deve('Inscrição: NÃO em publicação encerrada', false, () => setDoc(doc(db('caio'), 'inscricoes', 'o2_meic'), ins({ oportunidadeId: 'o2' })));
  await deve('Inscrição: NÃO em nome de outra empresa', false, () => setDoc(doc(db('caio'), 'inscricoes', 'o1_alfa'), ins({ empresaId: 'alfa' })));
  await deve('Inscrição: NÃO com outro identificador', false, () => setDoc(doc(db('caio'), 'inscricoes', 'qualquer'), ins()));
  await deve('Inscrição: NÃO já nasce como concluído', false, () => setDoc(doc(db('caio'), 'inscricoes', 'o1_meic'), ins({ concluiu: { em: '2026-12-01', por: 'Caio' } })));
  await deve('Inscrição: o MEI (cadastro rápido) se inscreve com a autorização', true, () => setDoc(doc(db('caio'), 'inscricoes', 'o1_meic'), ins()));
  await deve('Inscrição: o MEI lê as próprias', true, () => getDocs(query(collection(db('caio'), 'inscricoes'), where('empresaId', '==', 'meic'))));
  await deve('Inscrição: a parceira lê os inscritos das publicações dela', true, () => getDocs(query(collection(db('pia'), 'inscricoes'), where('origemId', '==', 'pref'))));
  await deve('Inscrição: outra empresa NÃO lê', false, () => getDoc(doc(db('vera'), 'inscricoes', 'o1_meic')));
  await deve('Inscrição: quem não é de nenhuma das duas NÃO lista', false, () => getDocs(query(collection(db('vera'), 'inscricoes'), where('origemId', '==', 'pref'))));
  await deve('Inscrição: o MEI NÃO marca que concluiu', false, () => updateDoc(doc(db('caio'), 'inscricoes', 'o1_meic'), { concluiu: { em: '2026-12-01', por: 'Caio' } }));
  await deve('Inscrição: a parceira marca que concluiu', true, () => updateDoc(doc(db('pia'), 'inscricoes', 'o1_meic'), { concluiu: { em: '2026-12-01', por: 'Pia' }, atualizadoEm: serverTimestamp() }));
  await deve('Inscrição: a parceira NÃO muda os dados do inscrito', false, () => updateDoc(doc(db('pia'), 'inscricoes', 'o1_meic'), { tel: '51999990000' }));
  await deve('Inscrição: consulta da parceira NÃO marca', false, () => updateDoc(doc(db('olga'), 'inscricoes', 'o1_meic'), { concluiu: null }));
  await deve('Inscrição: o MEI cancela', true, () => updateDoc(doc(db('caio'), 'inscricoes', 'o1_meic'), { status: 'cancelado', atualizadoEm: serverTimestamp() }));
  await deve('Inscrição: o MEI NÃO troca a publicação da inscrição', false, () => updateDoc(doc(db('caio'), 'inscricoes', 'o1_meic'), { oportunidadeId: 'o2' }));
  await deve('Inscrição: ninguém apaga', false, () => deleteDoc(doc(db('caio'), 'inscricoes', 'o1_meic')));
  await deve('Cidade: o MEI NÃO vira parceiro mudando a própria empresa', false, () => updateDoc(doc(db('caio'), 'empresas', 'meic'), { modulos: ['cidade'] }));

  await env.cleanup();
  const falhas = res.filter(r => !r.ok).length;
  console.log(`\n${res.length - falhas} de ${res.length} testes de regras passaram.`);
  fs.writeFileSync(path.join(__dirname, 'resultado-regras.json'), JSON.stringify(res, null, 1));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
