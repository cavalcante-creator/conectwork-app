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
  /* a tela de entrar tem que caber sem rolar: mede e, se não couber, compacta um nível por vez (css: .cmp1 a .cmp3) */
  /* Ajuste contínuo: --k vai de 0 (o mais compacto) a 1,6 (com folga). Procura o maior --k em que tudo cabe sem rolar,
     então a tela ocupa a altura disponível sem sobra e sem rolagem (css: bloco "Encaixe contínuo"). */
  function encaixar() {
    const L = app() && app().querySelector('.login'); if (!L) return;
    const cabe = () => L.scrollHeight <= L.clientHeight;
    const usa = k => { L.style.setProperty('--k', k.toFixed(3)); L.classList.toggle('semsub', k < 0.55); };
    L.classList.remove('folga', 'cmp1', 'cmp2', 'cmp3');
    usa(1.6); if (cabe()) return;
    usa(0); if (!cabe()) return;                         /* nem no mínimo cabe (celular deitado): o .login rola por dentro */
    let lo = 0, hi = 1.6;
    for (let i = 0; i < 8; i++) { const m = (lo + hi) / 2; usa(m); if (cabe()) lo = m; else hi = m; }
    usa(lo);
  }
  let encaixeLigado = false;
  function ligarEncaixe() {
    requestAnimationFrame(encaixar);
    if (encaixeLigado) return; encaixeLigado = true;
    window.addEventListener('resize', () => requestAnimationFrame(encaixar));
    window.addEventListener('orientationchange', () => setTimeout(encaixar, 300));
    /* no app instalado o iPhone pode informar a altura da tela só depois de abrir: mede de novo algumas vezes */
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => requestAnimationFrame(encaixar));
    window.addEventListener('pageshow', () => requestAnimationFrame(encaixar));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) requestAnimationFrame(encaixar); });
    [150, 500, 1200, 2500].forEach(ms => setTimeout(encaixar, ms));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => encaixar());   /* a letra Sora chega depois */
    /* mensagem de erro, troca para "Esqueci minha senha" etc. mudam a altura: encaixa de novo */
    let t = 0; new MutationObserver(() => { cancelAnimationFrame(t); t = requestAnimationFrame(encaixar); }).observe(app(), { childList: true, subtree: true, characterData: true });
  }

  function moldura(conteudo) {
    const { ic, LOGO, CURVES } = U();
    document.documentElement.classList.remove('wizpg');
    document.documentElement.classList.add('entrada');
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
    ligarEncaixe();
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
        <label class="f"><span>Senha</span><span class="lg-pw"><input id="lg-senha" type="password" autocomplete="current-password"><button type="button" class="lg-olho" id="lg-ver" aria-label="Mostrar a senha" aria-pressed="false">${ic('eye')}</button></span></label>
        <div class="lg-linha"><label class="lg-manter"><input type="checkbox" id="lg-manter" ${manterConectado() ? 'checked' : ''}><span>Manter conectado</span></label>
          <button class="linkbtn" type="button" id="lg-esqueci" data-lg-modo="esqueci">Esqueci minha senha</button></div>
        <p class="err" id="lg-erro" role="alert">${esc(msg || '')}</p>
        <button class="btn lg-principal" id="lg-entrar" type="submit">${ic('lock')}Entrar</button>
</form>
        ${botoesSociais('lg', 'Entrar')}
        <div class="lg-rodape"><p class="lg-novo-t" id="lg-novo">Ainda não usa o Conectwork?</p>
          <div class="lg-novos">
            <button class="linkbtn" type="button" id="lg-cadastrar">${ic('building')}Cadastrar empresa</button>
            <button class="linkbtn" type="button" id="lg-convite">${ic('mail')}Tenho um convite</button>
          </div></div>`;
    }
    moldura(`<div class="lg-bloco"><div class="logincard card" id="lg"><div class="card-b">${card}</div></div>
      <p class="lg-termos" id="lg-termos">Ao entrar, você concorda com os <b>Termos de uso</b> e a <b>Política de privacidade</b>.</p></div>`);
    const bc = document.getElementById('lg-cadastrar'); if (bc) bc.onclick = cadastrarEmpresa;
    const bv = document.getElementById('lg-convite'); if (bv) bv.onclick = abrirConvite;
    app().querySelectorAll('[data-lg-modo]').forEach(b => b.onclick = () => telaLogin(b.dataset.lgModo === 'esqueci' ? 'esqueci' : 'login'));
    const f = document.getElementById('lg-form'); if (f) f.onsubmit = ev => { ev.preventDefault(); entrar(); };
    ligarSociais('lg', m => { const er = document.getElementById('lg-erro'); if (er) er.textContent = m; });
    if (vincular && modo !== 'esqueci') { const er = document.getElementById('lg-erro'); if (er && !msg) er.textContent = `Esse e-mail já entra no Conectwork com senha. Entre com a senha uma vez para ligar também o login ${vincular.nome}.`; const em = document.getElementById('lg-email'); if (em && !em.value) em.value = vincular.email || ''; }
    const ver = document.getElementById('lg-ver');
    if (ver) ver.onclick = () => { const se = document.getElementById('lg-senha'), mostra = se.type === 'password';
      se.type = mostra ? 'text' : 'password'; ver.innerHTML = ic(mostra ? 'eyeoff' : 'eye');
      ver.setAttribute('aria-label', mostra ? 'Esconder a senha' : 'Mostrar a senha'); ver.setAttribute('aria-pressed', String(mostra)); se.focus(); };
    const fe = document.getElementById('lg-form-esq'); if (fe) fe.onsubmit = ev => { ev.preventDefault(); esqueci(); };
    const foco = document.getElementById(modo === 'esqueci' ? 'lg-esq-email' : (email ? 'lg-senha' : 'lg-email')); if (foco) foco.focus();
  }

  /* ---------- Google e Microsoft ---------- */
  const PROV = { google: 'Google', microsoft: 'Microsoft' };
  let vincular = null;                 /* login com Microsoft/Google de um e-mail que já entra com senha: liga depois da senha */
  function botoesSociais(prefixo, verbo) {
    const { MARCA } = U();
    return `<div class="lg-ou"><span>ou ${(verbo || 'Entrar').toLowerCase()} com</span></div>
      <div class="lg-social">${Object.keys(PROV).map(k => `<button class="btn sec" type="button" id="${prefixo}-${k}" data-social="${k}" aria-label="${verbo || 'Entrar'} com ${PROV[k]}">${MARCA[k]}<span>${PROV[k]}</span></button>`).join('')}</div>`;
  }
  function erroSocial(e, qual) {
    const c = e && e.code || '', n = PROV[qual] || '';
    if (/popup-closed-by-user|cancelled-popup-request|user-cancelled/.test(c)) return '';
    if (/operation-not-allowed|configuration-not-found|invalid-api-key|argument-error/.test(c)) return `O login com ${n} ainda não foi ligado no Conectwork. Por enquanto, entre com e-mail e senha.`;
    if (/unauthorized-domain/.test(c)) return `Este endereço do app ainda não está liberado para o login com ${n}. Avise a equipe Conectwork.`;
    if (/popup-blocked/.test(c)) return `O navegador bloqueou a janela do ${n}. Libere janelas para este site e tente de novo.`;
    if (/user-disabled/.test(c)) return 'Este login foi desativado. Fale com a equipe Conectwork.';
    if (/network-request-failed/.test(c)) return 'Não foi possível conectar ao servidor. Confira sua internet e tente de novo.';
    return `Não foi possível entrar com ${n} agora${c ? ' (' + c + ')' : ''}. Tente de novo ou use e-mail e senha.`;
  }
  /* liga os botões data-social dentro da tela; aoErro(mensagem) mostra o problema onde a tela preferir */
  function ligarSociais(prefixo, aoErro) {
    app().querySelectorAll('[data-social]').forEach(b => b.onclick = async () => {
      const qual = b.dataset.social;
      app().querySelectorAll('[data-social]').forEach(x => { x.disabled = true; });
      aoErro('');
      try {
        const mc = document.getElementById('lg-manter');
        try { await CW.fb.auth().setPersistence(!mc || mc.checked ? 'local' : 'session'); } catch (e) { /* segue com o padrão */ }
        await CW.fb.entrarCom(qual);
        /* o resto acontece no onAuthStateChanged */
      } catch (e) {
        if (/account-exists-with-different-credential/.test(e && e.code || '')) {
          vincular = { cred: e.credential || null, email: (e.email || (e.customData && e.customData.email) || '').toLowerCase(), nome: 'com ' + PROV[qual] };
          telaLogin('login'); return;
        }
        app().querySelectorAll('[data-social]').forEach(x => { x.disabled = false; });
        const m = erroSocial(e, qual); if (m) aoErro(m);
      }
    });
  }

  /* "Manter conectado": marcado (padrão) = continua logado ao fechar o app; desmarcado = sai ao fechar a aba/app.
     A escolha fica guardada no aparelho para a próxima vez. */
  function manterConectado() { try { return localStorage.getItem('cw.manter') !== '0'; } catch (e) { return true; } }

  async function entrar() {
    const em = document.getElementById('lg-email'), se = document.getElementById('lg-senha'), er = document.getElementById('lg-erro'), bt = document.getElementById('lg-entrar');
    const email = em.value.trim().toLowerCase(), senha = se.value;
    er.textContent = '';
    if (!email || !senha) { er.textContent = 'Preencha o e-mail e a senha.'; (email ? se : em).focus(); return; }
    if (!U().validarEmail(email)) { er.textContent = 'Esse e-mail não parece válido. Confira se digitou certo.'; em.focus(); return; }
    bt.disabled = true; bt.lastChild.textContent = 'Entrando…';
    try {
      const manter = !!(document.getElementById('lg-manter') || {}).checked;
      try { localStorage.setItem('cw.manter', manter ? '1' : '0'); } catch (e) { /* sem armazenamento */ }
      await CW.fb.auth().setPersistence(manter ? 'local' : 'session');
      const r = await CW.fb.auth().signInWithEmailAndPassword(email, senha);
      if (vincular && vincular.cred && r && r.user && (!vincular.email || vincular.email === email)) {
        try { await r.user.linkWithCredential(vincular.cred); U().toast('Pronto: agora você também entra ' + vincular.nome + '.'); } catch (e) { console.warn('não ligou o login', e); }
      }
      vincular = null;
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
      const av = o.tipo === 'master' ? `<span class="avatar sm" style="background:var(--grad)">CW</span>` : avatar(o.nome, 'sm', o.tipo === 'empresa' ? (o.empresaId || (o.empresa && o.empresa._id)) : '');
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
    if (!s.perfil && u.displayName) {          /* 1ª vez pelo Google/Microsoft: o perfil nasce com o nome da conta */
      const p = { nome: String(u.displayName).trim().slice(0, 120), email: s.usuario.email, criadoEm: CW.fb.agora(), atualizadoEm: CW.fb.agora() };
      try { await db.doc('usuarios/' + u.uid).set(p); s.perfil = { nome: p.nome, email: p.email }; } catch (e) { console.warn('perfil não gravado', e); }
    }
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

  /* link de convite aberto (#convite/<token>): a parte do convite (modulos/convite.js) cuida antes de tudo */
  const tokenConvite = () => { const m = /^#\/?convite\/([A-Za-z0-9_-]{6,64})/.exec(location.hash || ''); return m ? m[1] : null; };

  async function aoMudarLogin(u) {
    const minha = ++geracao;
    const tk = tokenConvite();
    if (tk && CW.entrada.abrirConviteLink) {
      if (CW.app) CW.app.desmontar();
      if (u) { try { const s = await carregar(u); if (minha !== geracao) return; st = s; } catch (e) { if (minha !== geracao) return; st = vazio(); st.usuario = { uid: u.uid, email: (u.email || '').toLowerCase() }; } }
      else st = vazio();
      CW.entrada.abrirConviteLink(tk, u); return;
    }
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
    if (!st.opcoes.length) {
      /* estava no meio do cadastro da empresa (acabou de criar a conta, ou recarregou a página): continua nele */
      if (CW.entrada.continuarCadastro && CW.entrada.cadastroAberto && CW.entrada.cadastroAberto()) { CW.entrada.continuarCadastro(); return; }
      telaSemAcesso(); return;
    }
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
    /* volta do login por redirect (quando a janela foi bloqueada): mostra o erro, se houver */
    const a = CW.fb.auth();
    if (a.getRedirectResult) a.getRedirectResult().catch(e => { const m = erroSocial(e, (e && e.credential && /microsoft/.test(e.credential.providerId)) ? 'microsoft' : 'google'); if (m) setTimeout(() => { const er = document.getElementById('lg-erro'); if (er) er.textContent = m; }, 300); });
  }

  /* volta para a entrada certa conforme o login atual (login, sem acesso, escolher empresa ou o app) */
  const recarregar = () => aoMudarLogin(CW.fb.auth().currentUser);
  /* link de convite colado/aberto com a página já aberta (dentro ou fora do app) */
  window.addEventListener('hashchange', () => { if (tokenConvite() && CW.fb.auth && CW.fb.auth()) recarregar(); });
  /* depois de aceitar um convite, entra direto na empresa dele (mesmo tendo outras) */
  const preferir = chave => { try { sessionStorage.setItem(chaveGuardada(), chave); } catch (e) { /* sem armazenamento */ } };

  CW.sessao = {
    iniciar, sair, trocar, entrarEm, recarregar, preferir, moldura, encaixar, telaLogin, telaCarregando, limparRota, botoesSociais, ligarSociais,
    estado: () => st,
    contexto: () => st.contexto,
    podeTrocar: () => st.opcoes.length > 1,
    pillStatus
  };
})();
