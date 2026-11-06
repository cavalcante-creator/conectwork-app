/* Testes das regras do Firestore (firestore.rules) no emulador, com @firebase/rules-unit-testing.
   Rodar (de dentro de testes/):  npm run regras
   Precisa de Java 11+ instalado (o emulador do Firestore roda em Java). */
const fs = require('fs'), path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, getDocs, serverTimestamp, setLogLevel } = require('firebase/firestore');
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
  await deve('Admin NÃO aprova a própria empresa (status só a equipe master muda)', false, () => updateDoc(doc(db('ana'), 'empresas', 'alfa'), { status: 'aprovado' }));
  await deve('Equipe master aprova empresa', true, () => updateDoc(doc(db('master'), 'empresas', 'alfa'), { status: 'aprovado' }));
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
  await deve('Convite usado NÃO serve de novo', false, () => setDoc(doc(db('edu'), 'acessos', 'beta_' + P.edu), aceite('edu', { empresaId: 'beta' })));
  await semear();
  await deve('Convite: e-mail em maiúsculas no login também vale (comparação em minúsculas)', true,
    () => setDoc(doc(env.authenticatedContext(P.edu, { email: 'EDU@Alfa.com.br' }).firestore(), 'acessos', 'alfa_' + P.edu), aceite('edu')));
  await semear();
  await deve('Admin cria convite da própria empresa', true, () => setDoc(doc(db('ana'), 'convites', 'tokNovo'), { email: 'nova@alfa.com.br', empresaId: 'alfa', cargo: 'rh', nome: 'Nova', criadoPor: P.ana, usado: false }));
  await deve('Financeiro NÃO cria convite', false, () => setDoc(doc(db('bruno'), 'convites', 'tokX'), { email: 'x@alfa.com.br', empresaId: 'alfa', cargo: 'admin', nome: 'X', criadoPor: P.bruno, usado: false }));

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
  await deve('Equipe master grava no histórico como "master"', true, () => addDoc(collection(db('master'), 'log'), reg('master', { empresaId: 'master' })));

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
