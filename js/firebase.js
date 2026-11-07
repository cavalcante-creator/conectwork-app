/* Conectwork · inicialização do Firebase (Auth e Firestore) e helpers de banco.
   Lê a configuração de window.CONECTWORK_CONFIG (config.js). Usa o SDK "compat" 10.14.1 carregado no index.html. */
(function () {
  const CW = window.CW = window.CW || {};
  let app = null, auth = null, db = null;

  /* config.js ausente ou ainda com "COLE_AQUI" → não liga o Firebase e a tela explica o que fazer */
  function configOk() {
    const c = window.CONECTWORK_CONFIG, f = c && c.firebase;
    return !!(f && f.apiKey && f.projectId && !/COLE_AQUI/.test(JSON.stringify(f)));
  }

  function iniciar() {
    if (app) return true;
    if (!window.firebase || !configOk()) return false;
    app = firebase.initializeApp(window.CONECTWORK_CONFIG.firebase);
    auth = app.auth();
    auth.languageCode = 'pt-BR';                    /* e-mails do Firebase (redefinir senha) em português */
    db = app.firestore();
    /* emuladores locais, só para desenvolvimento: abra http://localhost:PORTA/?emulador=1 */
    const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    if (local && new URLSearchParams(location.search).get('emulador') === '1') {
      auth.useEmulator('http://127.0.0.1:9099');
      db.useEmulator('127.0.0.1', 8080);
    }
    return true;
  }

  /* login com Google ou Microsoft (cada um precisa estar ligado no console: Authentication → Método de login).
     Abre a janela da conta; se o navegador bloquear a janela, vai pela página inteira (redirect). */
  function provedor(qual) {
    const p = qual === 'google' ? new firebase.auth.GoogleAuthProvider() : new firebase.auth.OAuthProvider('microsoft.com');
    p.setCustomParameters({ prompt: 'select_account' });
    return p;
  }
  async function entrarCom(qual) {
    const p = provedor(qual);
    try { return await auth.signInWithPopup(p); }
    catch (e) { if (/popup-blocked/.test(e && e.code || '')) { await auth.signInWithRedirect(p); return null; } throw e; }
  }

  const agora = () => firebase.firestore.FieldValue.serverTimestamp();   /* datas sempre do servidor */
  const dados = snap => snap && snap.exists ? Object.assign({ _id: snap.id }, snap.data()) : null;
  const lista = snap => snap.docs.map(d => Object.assign({ _id: d.id }, d.data()));

  /* erro do Firestore → frase que a pessoa entende */
  function mensagemErro(e) {
    const c = e && e.code || '';
    if (/permission-denied/.test(c)) return 'Você não tem permissão para fazer isso. Se acha que deveria ter, fale com o administrador da sua empresa.';
    if (/unavailable|network/.test(c)) return 'Sem conexão com o servidor. Confira sua internet e tente de novo.';
    if (/resource-exhausted/.test(c)) return 'O sistema está com muitos acessos agora. Espere alguns minutos e tente de novo.';
    if (/not-found/.test(c)) return 'Esse registro não existe mais. Atualize a página.';
    return 'Algo deu errado ao falar com o servidor' + (c ? ' (' + c + ')' : '') + '. Tente de novo em instantes.';
  }

  CW.fb = { iniciar, configOk, auth: () => auth, db: () => db, agora, dados, lista, mensagemErro, entrarCom,
    ambiente: () => (window.CONECTWORK_CONFIG && window.CONECTWORK_CONFIG.ambiente) || 'producao' };
})();
