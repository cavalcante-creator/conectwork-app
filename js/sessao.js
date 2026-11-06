/* Conectwork · sessão: login, "Esqueci minha senha", logout, carregamento do perfil e dos acessos,
   escolha e troca de empresa.
   Depois do login carrega: usuarios/{uid}, acessos (where uid == meu uid) e se existe master/{uid}.
   - sem acesso ativo e não é master → tela "Você ainda não tem acesso a nenhuma empresa";
   - uma opção → entra direto;
   - várias → escolhe a empresa (e pode trocar depois pelo botão no topo). */
(function () {
  const CW = window.CW = window.CW || {};
  const U = () => CW.ui;
  const app = () => document.getElementById('app');

  let st = vazio();
  let geracao = 0;                    /* descarta carregamentos antigos se a pessoa sair/entrar rápido */
  function vazio() { return { usuario: null, perfil: null, master: false, acessos: [], bloqueados: [], empresas: {}, opcoes: [], contexto: null }; }

  /* ganchos que a Etapa 1 preenche (cadastro de empresa e convite) */
  CW.entrada = CW.entrada || { cadastrarEmpresa: null, abrirConvite: null };

  /* ---------- mensagens de erro do login ---------- */
  function erroLogin(e) {
    const c = e && e.code || '';
    if (/invalid-credential|wrong-password|user-not-found|invalid-login-credentials/.test(c)) return 'E-mail ou senha incorretos. Confira e tente de novo, ou use "Esqueci minha senha".';
    if (/invalid-email/.test(c)) return 'Esse e-mail não parece válido. Confira se digitou certo.';
    if (/user-disabled/.test(c)) return 'Este login foi desativado. Fale com a equipe Conectwork.';
    if (/too-many-requests/.test(c)) return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo, ou use "Esqueci minha senha".';
    if (/network-request-failed/.test(c)) return 'Não foi possível conectar ao servidor. Confira sua internet e tente de novo.';
    return 'Não foi possível entrar agora' + (c ? ' (' + c + ')' : '') + '. Tente de novo em instantes.';
  }

  /* ---------- telas de entrada (antes do app) ---------- */
  function moldura(conteudo) {
    const { ic, LOGO, CURVES } = U();
    app().innerHTML = `<div class="login">${CURVES}
      <section class="brandpanel">
        <div class="bp-topo">${LOGO(120)}<div><h1>Conect<span>work</span></h1><div class="slogan">PLATAFORMA MAIS COMPLETA EM OUTSOURCING</div></div></div>
        <p class="tagline">Toda papelada e burocracia em um só lugar, na palma da sua mão.</p>
        <ul class="beneficios">
          <li>${ic('file')}<span>Contratos, entregas e notas organizados</span></li>
          <li>${ic('wallet')}<span>Pagamentos com data e comprovante</span></li>
          <li>${ic('shield')}<span>Documentos e conformidade em dia</span></li>
        </ul>
        <div class="selos"><span>Empresas que contratam</span><span>Prestadoras</span><span>Profissionais MEI</span></div>
      </section>
      <section class="loginside">${conteudo}</section></div>`;
  }

  /* "Cadastrar empresa" e "Tenho um convite": a Etapa 1 liga CW.entrada; até lá, um aviso */
  const naoPronto = () => U().toast('Essa opção chega na próxima etapa do Conectwork. Por enquanto, fale com a equipe Conectwork.');
  const cadastrarEmpresa = () => (CW.entrada.cadastrarEmpresa || naoPronto)();
  const abrirConvite = () => (CW.entrada.abrirConvite || naoPronto)();

  function telaCarregando(msg) {
    app().innerHTML = `<div class="carregando"><div class="box"><div class="giro"></div><span>${U().esc(msg || 'Carregando…')}</span></div></div>`;
  }

  function telaConfig() {
    moldura(`<div class="logincard card"><div class="card-b"><div class="lform" id="cfg-erro">
      <h3>Configuração do Firebase não encontrada</h3>
      <p class="sub">O arquivo <b>config.js</b> está faltando ou ainda tem "COLE_AQUI". Copie o <b>config.example.js</b> para <b>config.js</b> e cole o firebaseConfig do projeto conectwork.</p></div></div></div>`);
  }

  function telaLogin(modo, msg) {
    const { ic, esc } = U();
    const email = (document.getElementById('lg-email') || {}).value || '';
    let card;
    if (modo === 'esqueci') {
      card = `<form class="lform" id="lg-form-esq" novalidate>
        <div class="lg-cab"><h2>Recuperar senha</h2>
        <p class="sub">Informe o e-mail de acesso. Enviamos um link para você criar uma senha nova.</p></div>
        <label class="f"><span>E-mail</span><input id="lg-esq-email" type="email" autocomplete="username" placeholder="voce@empresa.com.br" value="${esc(email)}"></label>
        <p class="err" id="lg-erro" role="alert"></p><p class="okmsg" id="lg-ok" role="status" hidden></p>
        <button class="btn" id="lg-esq-enviar" type="submit">${ic('send')}Enviar link</button>
        <button class="linkbtn" type="button" data-lg-modo="login" style="align-self:center">Voltar para o login</button></form>`;
    } else {
      card = `<form class="lform" id="lg-form" novalidate>
        <div class="lg-cab"><h2>Acesse sua conta</h2><p class="sub">Que bom ter você de volta.</p></div>
        <label class="f"><span>E-mail</span><input id="lg-email" type="email" autocomplete="username" placeholder="voce@empresa.com.br" value="${esc(email)}"></label>
        <label class="f"><span>Senha</span><input id="lg-senha" type="password" autocomplete="current-password"></label>
        <p class="err" id="lg-erro" role="alert">${esc(msg || '')}</p>
        <button class="btn" id="lg-entrar" type="submit">${ic('lock')}Entrar</button>
        <button class="linkbtn" type="button" id="lg-esqueci" data-lg-modo="esqueci" style="align-self:center">Esqueci minha senha</button></form>
        <div class="divisoria" id="lg-novo"><span>Ainda não usa o Conectwork?</span></div>
        <div class="lg-novos">
          <button class="btn sec" type="button" id="lg-cadastrar">${ic('building')}Cadastrar empresa</button>
          <button class="btn sec" type="button" id="lg-convite">${ic('mail')}Tenho um convite</button>
        </div>`;
    }
    moldura(`<div class="logincard card" id="lg"><div class="card-b">${card}
      <p class="lg-termos" id="lg-termos">Ao entrar, você concorda com os <b>Termos de uso</b> e a <b>Política de privacidade</b>.</p></div></div>`);
    const bc = document.getElementById('lg-cadastrar'); if (bc) bc.onclick = cadastrarEmpresa;
    const bv = document.getElementById('lg-convite'); if (bv) bv.onclick = abrirConvite;
    app().querySelectorAll('[data-lg-modo]').forEach(b => b.onclick = () => telaLogin(b.dataset.lgModo === 'esqueci' ? 'esqueci' : 'login'));
    const f = document.getElementById('lg-form'); if (f) f.onsubmit = ev => { ev.preventDefault(); entrar(); };
    const fe = document.getElementById('lg-form-esq'); if (fe) fe.onsubmit = ev => { ev.preventDefault(); esqueci(); };
    const foco = document.getElementById(modo === 'esqueci' ? 'lg-esq-email' : (email ? 'lg-senha' : 'lg-email')); if (foco) foco.focus();
  }

  async function entrar() {
    const em = document.getElementById('lg-email'), se = document.getElementById('lg-senha'), er = document.getElementById('lg-erro'), bt = document.getElementById('lg-entrar');
    const email = em.value.trim().toLowerCase(), senha = se.value;
    er.textContent = '';
    if (!email || !senha) { er.textContent = 'Preencha o e-mail e a senha.'; (email ? se : em).focus(); return; }
    if (!U().validarEmail(email)) { er.textContent = 'Esse e-mail não parece válido. Confira se digitou certo.'; em.focus(); return; }
    bt.disabled = true; bt.lastChild.textContent = 'Entrando…';
    try {
      await CW.fb.auth().signInWithEmailAndPassword(email, senha);
      /* o resto acontece no onAuthStateChanged */
    } catch (e) {
      if (!document.getElementById('lg-erro')) return;
      er.textContent = erroLogin(e); bt.disabled = false; bt.lastChild.textContent = 'Entrar';
      if (/invalid-credential|wrong-password|invalid-login/.test(e && e.code)) { se.value = ''; se.focus(); }
    }
  }

  async function esqueci() {
    const em = document.getElementById('lg-esq-email'), er = document.getElementById('lg-erro'), ok = document.getElementById('lg-ok'), bt = document.getElementById('lg-esq-enviar');
    const email = em.value.trim().toLowerCase();
    er.textContent = ''; ok.hidden = true;
    if (!U().validarEmail(email)) { er.textContent = 'Informe um e-mail válido, o mesmo que você usa para entrar.'; em.focus(); return; }
    bt.disabled = true;
    try {
      const cfg = window.CONECTWORK_CONFIG || {};
      await CW.fb.auth().sendPasswordResetEmail(email, cfg.urlApp ? { url: cfg.urlApp } : undefined);
      mostrarEnviado();
    } catch (e) {
      const c = e && e.code || '';
      /* não contamos se o e-mail existe ou não (protege contra quem tenta descobrir e-mails) */
      if (/user-not-found/.test(c)) mostrarEnviado();
      else if (/invalid-email/.test(c)) er.textContent = 'Esse e-mail não parece válido. Confira se digitou certo.';
      else if (/too-many-requests/.test(c)) er.textContent = 'Muitos pedidos seguidos. Espere alguns minutos e tente de novo.';
      else if (/network-request-failed/.test(c)) er.textContent = 'Não foi possível conectar ao servidor. Confira sua internet e tente de novo.';
      else if (/unauthorized-continue-uri|invalid-continue-uri/.test(c)) er.textContent = 'O endereço do app não está liberado no Firebase. Avise a equipe Conectwork.';
      else er.textContent = 'Não foi possível enviar o link agora' + (c ? ' (' + c + ')' : '') + '. Tente de novo em instantes.';
    } finally { bt.disabled = false; }
    function mostrarEnviado() {
      ok.hidden = false;
      ok.textContent = 'Se houver um acesso com esse e-mail, enviamos um link para criar uma senha nova. Confira também a caixa de spam. O link vale por 1 hora.';
    }
  }

  function telaErro(msg) {
    const { esc, ic } = U();
    moldura(`<div class="logincard card"><div class="card-b"><div class="lform" id="sess-erro">
      <h3>Não foi possível abrir seus acessos</h3><p class="sub">${esc(msg)}</p>
      <button class="btn" id="sess-tentar">${ic('arrow')}Tentar de novo</button>
      <button class="linkbtn" id="sess-sair" style="align-self:center">Sair</button></div></div></div>`);
    document.getElementById('sess-tentar').onclick = () => aoMudarLogin(st.usuario || CW.fb.auth().currentUser);
    document.getElementById('sess-sair').onclick = sair;
  }

  function telaSemAcesso() {
    const { esc, ic } = U();
    const bloq = st.bloqueados.length ? `<div class="banner warn" id="sess-bloq">${ic('alert')}<span><strong>Acesso bloqueado</strong>Seu acesso a ${st.bloqueados.map(b => esc(nomeEmpresa(b.empresaId))).join(', ')} está bloqueado. Fale com o administrador dessa empresa.</span></div>` : '';
    moldura(`<div id="sem-acesso"><h2>Você ainda não tem acesso a nenhuma empresa</h2>
        <p class="sub">Você entrou como <b>${esc(st.usuario.email)}</b>. Para usar o Conectwork, cadastre a sua empresa ou abra o convite que recebeu.</p></div>
      ${bloq}
      <div class="escolhas">
        <button class="maisbtn" id="sa-cadastrar">${ic('building')}<span>Cadastrar minha empresa<br><small>O cadastro leva cerca de 10 minutos. Tenha em mãos o contrato social, o cartão CNPJ e os dados bancários.</small></span>${ic('chev')}</button>
        <button class="maisbtn" id="sa-convite">${ic('mail')}<span>Tenho um convite<br><small>Recebeu um link de convite por WhatsApp ou e-mail? Use-o para entrar na empresa que te convidou.</small></span>${ic('chev')}</button>
      </div>
      <div><button class="linkbtn" id="sa-sair">${ic('logout')}Sair</button></div>`);
    document.getElementById('sa-cadastrar').onclick = cadastrarEmpresa;
    document.getElementById('sa-convite').onclick = abrirConvite;
    document.getElementById('sa-sair').onclick = sair;
  }

  function botoesOpcoes(atual) {
    const { esc, ic, avatar, LOGO } = U();
    return st.opcoes.map(o => {
      const status = o.tipo === 'empresa' && o.empresa.status !== 'aprovado' ? ' ' + pillStatus(o.empresa.status) : '';
      const av = o.tipo === 'master' ? `<span class="avatar sm" style="background:var(--grad)">CW</span>` : avatar(o.nome, 'sm');
      const sub = o.tipo === 'master' ? 'Equipe Conectwork' : CW.permissoes.nomeCargo(o.acesso.cargo);
      const eh = atual && atual.chave === o.chave;
      return `<button class="maisbtn" data-ctx="${esc(o.chave)}" ${eh ? 'aria-current="true"' : ''}>${av}<span>${esc(o.nome)}${status}<br><small>${esc(sub)}</small></span>${eh ? '<span class="pill ok">Atual</span>' : ic('chev')}</button>`;
    }).join('');
  }

  function telaEscolher() {
    const { esc, ic } = U();
    moldura(`<div><h2>Escolha a empresa</h2><p class="sub">Olá, ${esc(primeiroNome())}. Você tem acesso a ${st.opcoes.length} empresas. Depois dá para trocar pelo botão no topo.</p></div>
      <div class="escolhas" id="escolher">${botoesOpcoes(null)}</div>
      <div><button class="linkbtn" id="esc-sair">${ic('logout')}Sair</button></div>`);
    app().querySelectorAll('[data-ctx]').forEach(b => b.onclick = () => entrarEm(b.dataset.ctx));
    document.getElementById('esc-sair').onclick = sair;
  }

  /* troca pelo topo, já dentro do app */
  function trocar() {
    let escolha = null;
    return U().dialogo({ titulo: 'Trocar de empresa', sub: `Você tem acesso a ${st.opcoes.length} empresas.`,
      corpo: `<div class="escolhas" id="trocar-lista">${botoesOpcoes(st.contexto)}</div>`, botoes: [],
      aoAbrir: d => d.querySelectorAll('[data-ctx]').forEach(b => b.onclick = () => { escolha = b.dataset.ctx; d.close(); })
    }).then(() => { if (escolha && (!st.contexto || escolha !== st.contexto.chave)) { entrarEm(escolha); U().toast('Agora você está em ' + st.contexto.nome + '.'); } });
  }

  /* ---------- dados ---------- */
  const STATUS = { analise: ['warn', 'Em análise'], pendencia: ['warn', 'Ajuste pedido'], aprovado: ['ok', 'Aprovada'], recusado: ['danger', 'Recusada'] };
  const pillStatus = s => { const x = STATUS[s] || ['info', s || 'Sem situação']; return `<span class="pill ${x[0]}">${U().esc(x[1])}</span>`; };
  const nomeEmpresa = id => { const e = st.empresas[id]; return (e && (e.nome || e.razao)) || 'uma empresa'; };
  const primeiroNome = () => String((st.perfil && st.perfil.nome) || st.usuario.email || '').split(/[\s@]/)[0];
  const chaveGuardada = () => 'cw.contexto.' + (st.usuario && st.usuario.uid);

  async function carregar(u) {
    const db = CW.fb.db(), dados = CW.fb.dados;
    const [pf, acs, ms] = await Promise.all([
      db.doc('usuarios/' + u.uid).get(),
      db.collection('acessos').where('uid', '==', u.uid).get(),
      db.doc('master/' + u.uid).get()
    ]);
    const s = vazio();
    s.usuario = { uid: u.uid, email: (u.email || '').toLowerCase() };
    s.perfil = dados(pf);
    s.master = !!(ms && ms.exists);
    const todos = CW.fb.lista(acs);
    s.acessos = todos.filter(a => a.ativo === true);
    s.bloqueados = todos.filter(a => a.ativo !== true);
    /* empresa de cada acesso (o membro ativo pode ler; a bloqueada só se estiver aprovada) */
    const ids = Array.from(new Set(todos.map(a => a.empresaId).filter(Boolean)));
    const docs = await Promise.all(ids.map(id => db.doc('empresas/' + id).get().then(dados).catch(() => null)));
    ids.forEach((id, i) => { if (docs[i]) s.empresas[id] = docs[i]; });
    if (s.master) s.opcoes.push({ chave: 'master', tipo: 'master', nome: 'Equipe Conectwork' });
    s.acessos.forEach(a => { const e = s.empresas[a.empresaId]; if (!e) return;
      s.opcoes.push({ chave: 'empresa:' + a.empresaId, tipo: 'empresa', empresaId: a.empresaId, acesso: a, empresa: e, nome: e.nome || e.razao || 'Empresa' }); });
    s.opcoes.sort((a, b) => a.tipo === b.tipo ? a.nome.localeCompare(b.nome, 'pt-BR') : a.tipo === 'master' ? -1 : 1);
    return s;
  }

  async function aoMudarLogin(u) {
    const minha = ++geracao;
    if (!u) {
      st = vazio(); if (CW.app) CW.app.desmontar();
      telaLogin('login'); return;
    }
    telaCarregando('Abrindo seus acessos…');
    let s;
    try { s = await carregar(u); }
    catch (e) { if (minha !== geracao) return; st = vazio(); st.usuario = { uid: u.uid, email: u.email }; telaErro(CW.fb.mensagemErro(e)); return; }
    if (minha !== geracao) return;
    st = s;
    if (!st.opcoes.length) { telaSemAcesso(); return; }
    if (st.opcoes.length === 1) { entrarEm(st.opcoes[0].chave); return; }
    let guardada = null; try { guardada = sessionStorage.getItem(chaveGuardada()); } catch (e) { /* sem armazenamento */ }
    if (guardada && st.opcoes.some(o => o.chave === guardada)) { entrarEm(guardada); return; }   /* F5 não pergunta de novo */
    telaEscolher();
  }

  const limparRota = () => { if (location.hash) history.replaceState(null, '', location.pathname + location.search); };

  function entrarEm(chave) {
    const o = st.opcoes.find(x => x.chave === chave); if (!o) return;
    if (st.contexto && st.contexto.chave !== chave) limparRota();   /* trocou de empresa: começa pelo início */
    st.contexto = o;
    try { sessionStorage.setItem(chaveGuardada(), chave); } catch (e) { /* sem armazenamento */ }
    CW.app.montar();
  }

  async function sair() {
    try { sessionStorage.removeItem(chaveGuardada()); } catch (e) { /* sem armazenamento */ }
    if (CW.app) CW.app.desmontar();
    limparRota();                     /* quem entrar depois não cai na tela de quem saiu */
    await CW.fb.auth().signOut();
  }

  /* o Firebase vem da internet (nunca fica guardado no aparelho): sem ele, explica e tenta de novo sozinho */
  function telaSemConexao() {
    const { ic } = U(), off = navigator.onLine === false;
    moldura(`<div class="logincard card"><div class="card-b"><div class="lform" id="sem-conexao">
      <h3>${off ? 'Sem conexão com a internet' : 'Não foi possível carregar o Conectwork'}</h3>
      <p class="sub">${off ? 'O Conectwork precisa da internet para entrar e mostrar seus dados. Quando a conexão voltar, esta tela carrega sozinha.'
        : 'Uma parte do app não chegou. Confira sua internet e tente de novo.'}</p>
      <button class="btn" id="sc-tentar">${ic('arrow')}Tentar de novo</button></div></div></div>`);
    document.getElementById('sc-tentar').onclick = () => location.reload();
    window.addEventListener('online', () => location.reload(), { once: true });
  }

  function iniciar() {
    if (!window.firebase) { telaSemConexao(); return; }
    if (!CW.fb.iniciar()) { telaConfig(); return; }
    CW.fb.auth().onAuthStateChanged(aoMudarLogin);
  }

  CW.sessao = {
    iniciar, sair, trocar, entrarEm,
    estado: () => st,
    contexto: () => st.contexto,
    podeTrocar: () => st.opcoes.length > 1,
    pillStatus
  };
})();
