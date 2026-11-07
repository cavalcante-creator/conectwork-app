/* Conectwork · Etapa 1, parte 4: primeiro acesso pelo convite (#convite/<token>).
   - Sem login: "Você recebeu um convite" → "Criar meu acesso" (nome, e-mail do convite, senha forte, termos e
     autorizações separadas, cursos e ofertas desmarcados) ou "Já tenho login".
     O convite só pode ser lido por quem entrou com o e-mail convidado (regras do banco), por isso os detalhes
     aparecem depois do login.
   - Com login: mostra empresa, cargo e quem convidou → "Aceitar e entrar".
   - Aceitar (uma operação só): cria acessos/{empresa}_{uid} com o cargo do convite, marca o convite como usado,
     grava/atualiza o perfil, as autorizações (canal "convite") e o histórico da empresa. Depois entra direto na empresa.
   - "Tenho um convite" (login e tela sem acesso): cola o link recebido. */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const K = () => CW.cadastro;
  let pendente = null;                 /* conta criada agora pelo convite: { token, nome, cons } → aceita sozinho */

  const S = () => CW.sessao;
  const limparHash = () => { if (/^#\/?convite\//.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); };
  const voltar = () => { limparHash(); S().recarregar(); };

  function autorizacoesHtml(prefixo, marcadas) {
    const { esc } = U();
    return K().AUTORIZACOES.map(a => `<label class="check ${a.obrig ? '' : 'opc'}"><input type="checkbox" data-${prefixo}="${a.k}" ${marcadas[a.k] ? 'checked' : ''}><span>${esc(a.t)}${a.obrig ? ' <b style="color:var(--danger);font-weight:500" aria-hidden="true">*</b>' : ''}${a.s ? `<small>${esc(a.s)}</small>` : ''}</span></label>`).join('');
  }
  const padraoCons = () => { const c = {}; K().AUTORIZACOES.forEach(a => { c[a.k] = a.obrig ? false : !!a.padrao; }); return c; };
  const lerCons = (el, prefixo) => { const c = {}; el.querySelectorAll(`[data-${prefixo}]`).forEach(x => { c[x.dataset[prefixo]] = x.checked; }); return c; };
  const faltaObrig = c => K().AUTORIZACOES.some(a => a.obrig && !c[a.k]);

  /* ---------- sem login ---------- */
  function semLogin(token) {
    const { ic } = U();
    S().moldura(`<div class="logincard card" id="cv-boasvindas"><div class="card-b"><div class="lform">
      <div class="lg-cab"><h2>Você recebeu um convite</h2><p class="sub">Você foi convidado(a) para usar o Conectwork. Para aceitar, crie seu acesso com o mesmo e-mail que recebeu o convite.</p></div>
      <button class="btn" id="cv-criar">${ic('user')}Criar meu acesso</button>
      <button class="btn sec" id="cv-tenho">${ic('lock')}Já tenho login no Conectwork</button>
      ${S().botoesSociais('cv', 'Entrar')}
      <p class="err" id="cv-erro0" role="alert"></p>
      <button class="linkbtn" id="cv-ignorar" style="align-self:center">Agora não</button></div></div></div>`);
    S().ligarSociais('cv', m => { document.getElementById('cv-erro0').textContent = m; });
    document.getElementById('cv-criar').onclick = () => criarAcesso(token);
    document.getElementById('cv-tenho').onclick = () => { S().telaLogin('login', ''); const s = document.querySelector('#lg .lg-cab .sub'); if (s) s.textContent = 'Entre para ver e aceitar o convite.'; };
    document.getElementById('cv-ignorar').onclick = voltar;
  }

  function criarAcesso(token) {
    const { ic, esc } = U();
    S().moldura(`<div class="logincard card" id="cv-acesso"><div class="card-b"><form class="lform" id="cv-form" novalidate>
      <div class="lg-cab"><h2>Crie seu acesso</h2><p class="sub">Use o e-mail que recebeu o convite.</p></div>
      <label class="f"><span>Seu nome completo</span><input id="cv-nome" autocomplete="name" maxlength="120"></label>
      <label class="f"><span>E-mail do convite</span><input id="cv-email" type="email" autocomplete="username" maxlength="120"></label>
      <label class="f"><span>Crie uma senha</span><span class="lg-pw"><input id="cv-senha" type="password" autocomplete="new-password"><button type="button" class="lg-olho" data-olho="cv-senha" aria-label="Mostrar a senha" aria-pressed="false">${ic('eye')}</button></span>
        <span class="senha-forca" id="cv-forca" aria-hidden="true"><i></i><i></i><i></i></span><em class="hint">Mínimo de 8 caracteres, com letras e números.</em></label>
      <label class="f"><span>Repita a senha</span><input id="cv-senha2" type="password" autocomplete="new-password"></label>
      <label class="check"><input type="checkbox" id="cv-termos"><span>Li e aceito os <button type="button" class="linkbtn" data-texto="termos">Termos de uso</button> e a <button type="button" class="linkbtn" data-texto="privacidade">Política de privacidade</button> do Conectwork. <b style="color:var(--danger);font-weight:500" aria-hidden="true">*</b></span></label>
      <div class="stack" style="gap:8px" id="cv-auts">${autorizacoesHtml('ca', padraoCons())}</div>
      <p class="err" id="cv-erro" role="alert"></p>
      <button class="btn" id="cv-ok" type="submit">${ic('arrow')}Criar acesso e aceitar o convite</button>
      <button class="linkbtn" type="button" id="cv-volta" style="align-self:center">Voltar</button>
      <p class="hint" style="margin:0;font-size:11.5px">${esc(K().AVISO)}</p></form></div></div>`);
    const $ = id => document.getElementById(id), er = $('cv-erro');
    $('cv-senha').oninput = () => { $('cv-forca').className = 'senha-forca n' + K().forcaSenha($('cv-senha').value); };
    document.querySelectorAll('#cv-form input').forEach(i => i.addEventListener('input', () => { er.textContent = ''; }));
    document.querySelectorAll('[data-olho]').forEach(b => b.onclick = () => { const i = $(b.dataset.olho), m = i.type === 'password'; i.type = m ? 'text' : 'password'; b.innerHTML = ic(m ? 'eyeoff' : 'eye'); b.setAttribute('aria-label', m ? 'Esconder a senha' : 'Mostrar a senha'); b.setAttribute('aria-pressed', String(m)); });
    document.querySelectorAll('[data-texto]').forEach(b => b.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); K().mostrarTexto(b.dataset.texto); });
    $('cv-volta').onclick = () => semLogin(token);
    $('cv-nome').focus();
    $('cv-form').onsubmit = async ev => {
      ev.preventDefault();
      const nome = $('cv-nome').value.trim().replace(/\s+/g, ' '), email = $('cv-email').value.trim().toLowerCase(), senha = $('cv-senha').value, cons = lerCons(document, 'ca');
      if (nome.split(' ').length < 2) { er.textContent = 'Informe nome e sobrenome.'; $('cv-nome').focus(); return; }
      if (!U().validarEmail(email)) { er.textContent = 'Esse e-mail não parece válido. Confira se digitou certo.'; $('cv-email').focus(); return; }
      if (!K().senhaOk(senha)) { er.textContent = 'A senha precisa ter 8 ou mais caracteres, com letras e números.'; $('cv-senha').focus(); return; }
      if (senha !== $('cv-senha2').value) { er.textContent = 'As duas senhas não estão iguais.'; $('cv-senha2').focus(); return; }
      if (!$('cv-termos').checked) { er.textContent = 'Para continuar, aceite os Termos de uso e a Política de privacidade.'; return; }
      if (faltaObrig(cons)) { er.textContent = 'Marque as autorizações obrigatórias (com *) para usar o Conectwork.'; return; }
      const bt = $('cv-ok'); bt.disabled = true; bt.lastChild.textContent = 'Criando…';
      pendente = { token, nome, cons };
      try {
        const cred = await CW.fb.auth().createUserWithEmailAndPassword(email, senha);
        try { await cred.user.sendEmailVerification((window.CONECTWORK_CONFIG || {}).urlApp ? { url: window.CONECTWORK_CONFIG.urlApp } : undefined); } catch (e) { console.warn('confirmação de e-mail não enviada', e); }
        /* o resto acontece quando o login muda (aoMudarLogin → abrirConviteLink com "pendente") */
      } catch (e) {
        pendente = null; bt.disabled = false; bt.lastChild.textContent = 'Criar acesso e aceitar o convite';
        er.textContent = /email-already-in-use/.test(e && e.code) ? 'Esse e-mail já tem acesso ao Conectwork. Volte e use "Já tenho login".' : K().erroConta(e);
      }
    };
  }

  /* ---------- com login ---------- */
  async function comLogin(token, u) {
    const { esc, ic } = U(), db = CW.fb.db(), email = (u.email || '').toLowerCase();
    S().telaCarregando('Abrindo o convite…');
    let c = null, erro = null;
    try { c = CW.fb.dados(await db.doc('convites/' + token).get()); } catch (e) { erro = e; }
    if (erro && !/permission-denied|not-found/.test(erro.code || '')) { problema('Não foi possível abrir o convite', CW.fb.mensagemErro(erro), u, true); return; }
    const equipe = !!c && c.tipo === 'master';
    if (!c || c.email !== email) { pendente = null; problema('Este convite não está disponível para você', `Você entrou como ${email}. O convite pode ser para outro e-mail, ter sido cancelado ou já usado. Confira com quem convidou você.`, u); return; }
    if (equipe && S().estado().master) { pendente = null; problema('Você já faz parte da equipe Conectwork', `Seu login ${email} já está na equipe.`, u, false, true); return; }
    const jaTem = !equipe && (S().estado().acessos || []).concat(S().estado().bloqueados || []).find(a => a.empresaId === c.empresaId);
    if (jaTem) { pendente = null; problema('Você já tem acesso a esta empresa', `Seu login ${email} já está ligado a ${c.empresaNome || 'esta empresa'}.`, u, false, true); return; }
    if (c.usado) { pendente = null; problema('Este convite já foi usado', 'Peça um novo convite a quem convidou você.', u); return; }
    if (pendente && pendente.token === token) { const p = pendente; pendente = null; return aceitar(token, c, u, p.nome, p.cons); }
    const perfilNome = (S().estado().perfil && S().estado().perfil.nome) || c.nome || '';
    const nomeCargo = equipe ? 'Equipe Conectwork' : CW.permissoes.nomeCargo(c.cargo);
    const descCargo = equipe ? 'Analisa cadastros, cuida das mensalidades e dos avisos e acompanha toda a rede. Vê os dados de todas as empresas.' : (CW.permissoes.cargo(c.cargo) || {}).desc || '';
    S().moldura(`<div class="logincard card" id="cv-card"><div class="card-b"><div class="lform">
      <div class="lg-cab"><h2>${equipe ? 'Convite para a equipe Conectwork' : 'Convite para ' + esc(c.empresaNome || 'uma empresa')}</h2><p class="sub">${esc(c.criadoPorNome || 'O administrador')} convidou você para entrar como <b>${esc(nomeCargo)}</b>.</p></div>
      <dl class="dl"><div><dt>Seu login</dt><dd>${esc(email)}</dd></div><div><dt>Cargo</dt><dd id="cv-cargo">${esc(nomeCargo)}</dd></div>
        <div class="full"><dt>O que o cargo faz</dt><dd style="font-weight:400;font-size:13px">${esc(descCargo)}</dd></div></dl>
      <label class="f"><span>Seu nome completo</span><input id="cv-nome2" value="${esc(perfilNome)}" maxlength="120"></label>
      <label class="check"><input type="checkbox" id="cv-termos2"><span>Li e aceito os <button type="button" class="linkbtn" data-texto="termos">Termos de uso</button> e a <button type="button" class="linkbtn" data-texto="privacidade">Política de privacidade</button>. <b style="color:var(--danger);font-weight:500" aria-hidden="true">*</b></span></label>
      <div class="stack" style="gap:8px">${autorizacoesHtml('cb', padraoCons())}</div>
      <p class="err" id="cv-erro2" role="alert"></p>
      <button class="btn" id="cv-aceitar">${ic('check')}Aceitar e entrar</button>
      <button class="linkbtn" id="cv-agora-nao" style="align-self:center">Agora não</button></div></div></div>`);
    document.querySelectorAll('[data-texto]').forEach(b => b.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); K().mostrarTexto(b.dataset.texto); });
    document.getElementById('cv-agora-nao').onclick = voltar;
    document.getElementById('cv-aceitar').onclick = () => {
      const er = document.getElementById('cv-erro2'), nome = document.getElementById('cv-nome2').value.trim().replace(/\s+/g, ' '), cons = lerCons(document, 'cb');
      if (nome.split(' ').length < 2) { er.textContent = 'Informe nome e sobrenome.'; return; }
      if (!document.getElementById('cv-termos2').checked) { er.textContent = 'Para continuar, aceite os Termos de uso e a Política de privacidade.'; return; }
      if (faltaObrig(cons)) { er.textContent = 'Marque as autorizações obrigatórias (com *) para usar o Conectwork.'; return; }
      aceitar(token, c, u, nome, cons);
    };
  }

  function problema(titulo, texto, u, tentar, entrar) {
    const { esc, ic } = U();
    S().moldura(`<div class="logincard card" id="cv-problema"><div class="card-b"><div class="lform">
      <div class="lg-cab"><h2>${esc(titulo)}</h2><p class="sub">${esc(texto)}</p></div>
      ${tentar ? `<button class="btn" id="cv-tentar">${ic('arrow')}Tentar de novo</button>` : ''}
      ${entrar ? `<button class="btn" id="cv-entrar">${ic('arrow')}Entrar no Conectwork</button>` : `<button class="btn ${tentar ? 'sec' : ''}" id="cv-continuar">${ic('arrow')}Continuar como ${esc(u.email)}</button>`}
      <button class="btn sec" id="cv-outro">${ic('logout')}Sair e entrar com outro e-mail</button></div></div></div>`);
    const t = document.getElementById('cv-tentar'); if (t) t.onclick = () => S().recarregar();
    const e = document.getElementById('cv-entrar') || document.getElementById('cv-continuar'); e.onclick = voltar;
    document.getElementById('cv-outro').onclick = async () => { const tk = location.hash; await S().sair(); if (/convite\//.test(tk)) history.replaceState(null, '', location.pathname + location.search + tk); S().recarregar(); };
  }

  async function aceitar(token, c, u, nome, cons) {
    const db = CW.fb.db(), agora = CW.fb.agora, email = (u.email || '').toLowerCase(), emp = c.empresaId, K_ = K();
    const equipe = c.tipo === 'master';
    S().telaCarregando(equipe ? 'Entrando na equipe…' : 'Entrando na empresa…');
    const b = db.batch(), perfil = S().estado().perfil;
    if (equipe) b.set(db.doc('master/' + u.uid), { nome, email, convite: token, criadoEm: agora() });
    else b.set(db.doc('acessos/' + emp + '_' + u.uid), { uid: u.uid, empresaId: emp, nome, email, cargo: c.cargo, extras: [], sem: [], ativo: true, convite: token, criadoEm: agora() });
    b.update(db.doc('convites/' + token), { usado: true, usadoEm: agora(), usadoPor: u.uid });
    b.set(db.doc('usuarios/' + u.uid), perfil ? { nome, email, atualizadoEm: agora() } : { nome, email, criadoEm: agora(), atualizadoEm: agora() }, { merge: true });
    K_.AUTORIZACOES.forEach(a => {
      const reg = { uid: u.uid, finalidade: a.k, aceite: !!cons[a.k], texto: a.t, textoVersao: K_.VERSAO_TEXTOS, canal: 'convite', em: agora() };
      b.set(db.doc('consentimentos/' + u.uid + '_' + a.k), reg);
      b.set(db.collection('consentimentos_log').doc(), reg);
    });
    b.set(db.collection('log').doc(), equipe
      ? { em: agora(), uid: u.uid, quem: nome, empresaId: 'master', acao: 'equipe.entrar', texto: `${nome} (${email}) aceitou o convite e entrou na equipe Conectwork.`, ref: token }
      : { em: agora(), uid: u.uid, quem: nome, empresaId: emp, acao: 'convite.aceitar', texto: `${nome} (${email}) aceitou o convite e entrou como ${CW.permissoes.nomeCargo(c.cargo)}.`, ref: token });
    try { await b.commit(); }
    catch (e) { problema('Não foi possível aceitar o convite', CW.fb.mensagemErro(e), u, true); return; }
    S().preferir(equipe ? 'master' : 'empresa:' + emp);
    limparHash();
    U().toast(equipe ? 'Bem-vindo(a) à equipe Conectwork!' : `Bem-vindo(a) à ${c.empresaNome || 'empresa'}!`);
    S().recarregar();
  }

  /* chamado pela sessão sempre que a página abre com #convite/<token> */
  function abrirConviteLink(token, u) { if (u) comLogin(token, u); else semLogin(token); }

  /* "Tenho um convite": cola o link recebido */
  function tenhoConvite() {
    let tk = null;
    U().dialogo({ titulo: 'Tenho um convite', sub: 'Cole aqui o link que você recebeu por WhatsApp ou e-mail.',
      corpo: `<label class="f"><span>Link do convite</span><input id="tc-link" placeholder="https://…#convite/…" autocomplete="off"></label><p class="err" id="tc-erro" role="alert"></p>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Abrir convite', valor: 'ok', antes: d => {
        const v = d.querySelector('#tc-link').value.trim(), m = /convite\/([A-Za-z0-9_-]{6,64})/.exec(v) || /^([A-Za-z0-9_-]{15,64})$/.exec(v);
        if (!m) { d.querySelector('#tc-erro').textContent = 'Esse link não parece um convite do Conectwork. Copie o link inteiro da mensagem.'; return false; }
        tk = m[1]; return true; } }],
      aoAbrir: d => { const i = d.querySelector('#tc-link'); i.focus(); i.addEventListener('input', () => { d.querySelector('#tc-erro').textContent = ''; }); }
    }).then(v => { if (v === 'ok' && tk) { location.hash = '#convite/' + tk; } });
  }

  CW.entrada.abrirConviteLink = abrirConviteLink;
  CW.entrada.abrirConvite = tenhoConvite;
})();
