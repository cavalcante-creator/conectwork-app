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
  await deve('Contrato: a prestadora lista os seus (prestadorId)', true, () => getDocs(query(collection(db('beto'), 'contratos'), where('prestadorId', '==', 'beta'))));
  await deve('Contrato: quem não é das duas empresas NÃO lê', false, () => getDoc(doc(db('carla'), 'contratos', 'c1')));
  const assina = (k, lado, extra) => updateDoc(doc(db(k), 'contratos', 'c1'), Object.assign({ ['assinaturas.' + lado]: { uid: P[k], nome: k, em: serverTimestamp() }, atualizadoEm: serverTimestamp() }, extra || {}));
  await deve('Contrato: o tomador NÃO assina pela prestadora', false, () => assina('ana', 'prestador'));
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
  await deve('Nota: o financeiro marca a nota conferida', true, () => updateDoc(doc(db('bruno'), 'espelhos', 'cm_2026-11-1'), { status: 'nota_ok', conferenciaNota: { uid: P.bruno, nome: 'Bruno', em: serverTimestamp(), manual: false }, atualizadoEm: serverTimestamp() }));
  await deve('Nota: conferida, o espelho NÃO é mais corrigido', false, () => updateDoc(doc(db('bruno'), 'espelhos', 'cm_2026-11-1'), { obs: 'x', versao: 3, atualizadoPor: P.bruno, atualizadoEm: serverTimestamp() }));

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
  await deve('Título: quem não conferiu a nota NÃO cria título', false, () => setDoc(doc(db('ana'), 'titulos', 'cm_2026-11-1'), tit('ana', { espelhoId: 'cm_2026-11-1', chaveUnica: '2'.repeat(50), liquidoCentavos: 522500 })));
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

  /* ---------- master e perfil ---------- */
  await deve('Pessoa lê o próprio master/{uid} (para saber se é equipe)', true, () => getDoc(doc(db('master'), 'master', P.master)));
  await deve('Pessoa consulta master/{uid} próprio mesmo sem ser master (documento não existe)', true, () => getDoc(doc(db('carla'), 'master', P.carla)));
  await deve('Ninguém se coloca na equipe master pelo app', false, () => setDoc(doc(db('carla'), 'master', P.carla), { nome: 'Carla' }));
  await deve('Pessoa cria o próprio perfil com o e-mail do login', true, () => setDoc(doc(db('carla'), 'usuarios', P.carla), { nome: 'Carla', email: EM.carla, criadoEm: serverTimestamp() }));
  await deve('Pessoa NÃO cria perfil com e-mail de outra pessoa', false, () => setDoc(doc(db('carla'), 'usuarios', P.carla), { nome: 'Carla', email: EM.ana }));
  await deve('Pessoa NÃO lê o perfil de outra', false, () => getDoc(doc(db('carla'), 'usuarios', P.ana)));
  await deve('Coleção fora das regras é negada', false, () => getDoc(doc(db('ana'), 'qualquer', 'x')));

  await env.cleanup();
  const falhas = res.filter(r => !r.ok).length;
  console.log(`\n${res.length - falhas} de ${res.length} testes de regras passaram.`);
  fs.writeFileSync(path.join(__dirname, 'resultado-regras.json'), JSON.stringify(res, null, 1));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
