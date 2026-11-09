/* Conectwork · Meus dados (09/11/2026).
   A pessoa muda o próprio nome e celular, troca o e-mail de acesso e pede um link para trocar a senha.
   - Trocar o e-mail: pede a senha atual (o Firebase exige login recente), depois verifyBeforeUpdateEmail manda um link
     para o e-mail NOVO; o e-mail só muda quando a pessoa abre o link (tela "E-mail confirmado" em js/sessao.js).
     Até lá, ela continua entrando com o e-mail atual. Quem entra só pelo Google não troca aqui: o e-mail é o da conta Google.
   - sincronizar(s): depois do login, se o e-mail de acesso ou o nome mudou, acerta usuarios/{uid} e os acessos da pessoa
     (nome e e-mail que o administrador vê em Usuários e acessos) e grava no histórico de cada empresa.
   Abre pelo nome no canto de cima (ou no menu do celular) e pela busca. */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const cfg = () => window.CONECTWORK_CONFIG || {};
  const temSenha = u => !!(u && (u.providerData || []).some(p => p && p.providerId === 'password'));
  const provedores = u => (u && u.providerData || []).map(p => p && p.providerId).filter(Boolean);

  function erroTroca(e) {
    const c = (e && e.code) || '';
    if (/wrong-password|invalid-credential|invalid-login-credentials/.test(c)) return 'A senha atual não confere. Confira e tente de novo.';
    if (/email-already-in-use/.test(c)) return 'Esse e-mail já é usado por outra conta do Conectwork. Use outro.';
    if (/invalid-email/.test(c)) return 'Esse e-mail não é válido. Confira se digitou certo.';
    if (/too-many-requests/.test(c)) return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
    if (/network-request-failed/.test(c)) return 'Sem internet agora. Confira a conexão e tente de novo.';
    if (/requires-recent-login/.test(c)) return 'Por segurança, saia e entre de novo no Conectwork antes de trocar o e-mail.';
    if (/operation-not-allowed/.test(c)) return 'A troca de e-mail ainda não está ligada no Conectwork. Fale com a equipe Conectwork.';
    return CW.fb.mensagemErro(e);
  }

  /* acerta usuarios/{uid} e os acessos ativos da pessoa com o e-mail de acesso e o nome atuais */
  async function sincronizar(s) {
    if (!s || !s.usuario) return;
    const db = CW.fb.db(), agora = CW.fb.agora, email = s.usuario.email, uid = s.usuario.uid;
    const nome = (s.perfil && s.perfil.nome) || '';
    try { const k = 'cw.emailNovo.' + uid; if (sessionStorage.getItem(k) === email) sessionStorage.removeItem(k); } catch (e) { /* sem armazenamento */ }
    const b = db.batch(); let n = 0;
    if (s.perfil && s.perfil.email !== email) { b.set(db.doc('usuarios/' + uid), { email, atualizadoEm: agora() }, { merge: true }); n++; }
    (s.acessos || []).forEach(a => {
      const mud = {}; if (a.email !== email) mud.email = email; if (nome && a.nome !== nome) mud.nome = nome;
      if (!Object.keys(mud).length) return;
      b.update(db.doc('acessos/' + a._id), Object.assign({ atualizadoEm: agora() }, mud)); n++;
      /* histórico só quando muda de verdade (acesso antigo sem nome ou e-mail só é completado) */
      if (mud.email && a.email) CW.log.logNoLote(b, 'pessoa.email', `E-mail de acesso de ${nome || email} mudou de ${a.email} para ${email}.`, a._id, { empresaId: a.empresaId });
      else if (mud.nome && a.nome) CW.log.logNoLote(b, 'pessoa.nome', `Nome de ${a.nome} mudou para ${nome} (${email}).`, a._id, { empresaId: a.empresaId });
      Object.assign(a, mud);
    });
    if (!n) return;
    if (s.perfil) s.perfil.email = email;
    try { await b.commit(); } catch (e) { console.warn('dados da pessoa não sincronizados', e); }
  }

  function render(el, ctx) {
    const { esc, ic } = U(), s = CW.sessao.estado(), u = CW.fb.auth().currentUser, p = s.perfil || {};
    const senha = temSenha(u), prov = provedores(u), google = prov.includes('google.com'), ms = prov.includes('microsoft.com');
    const pend = (() => { try { return sessionStorage.getItem('cw.emailNovo.' + s.usuario.uid) || ''; } catch (e) { return ''; } })();
    el.innerHTML = `<div class="md-grid">
      <section class="card" id="md-dados"><div class="card-h"><span class="ic">${ic('user')}</span><h3>Seus dados</h3></div>
        <div class="card-b"><div class="fgrid">
          <label class="f c12"><span>Nome completo</span><input id="md-nome" maxlength="120" autocomplete="name" value="${esc(p.nome || '')}"></label>
          <label class="f c12"><span>Celular com DDD <i>(opcional)</i></span><input id="md-tel" data-mascara="celular" autocomplete="tel" value="${esc(p.tel || '')}"></label>
          <p class="err c12" id="md-erro" role="alert"></p>
          <div class="c12"><button class="btn" id="md-salvar" type="button">${ic('check')}Salvar</button></div>
        </div><p class="hint" style="margin:14px 0 0;font-size:12.5px">O nome aparece para as pessoas das empresas em que você tem acesso.</p></div></section>

      <section class="card" id="md-acesso"><div class="card-h"><span class="ic">${ic('mail')}</span><h3>E-mail de acesso</h3></div>
        <div class="card-b">
          <div class="md-email"><strong id="md-email-atual">${esc(s.usuario.email)}</strong>
            <small>${[senha ? 'Entra com e-mail e senha' : '', google ? 'Entra com Google' : '', ms ? 'Entra com Microsoft' : ''].filter(Boolean).join(' · ') || 'E-mail de acesso'}</small></div>
          ${pend ? `<div class="banner info" id="md-pend" style="margin-top:14px">${ic('mail')}<span><strong>Falta abrir o link no e-mail novo</strong>Enviamos para ${esc(pend)}. Até você abrir, continue entrando com ${esc(s.usuario.email)}. Não chegou? Veja o spam ou peça de novo.</span></div>` : ''}
          ${senha ? `<div class="md-acoes"><button class="btn sec" id="md-trocar-email" type="button">${ic('swap')}Trocar o e-mail de acesso</button>
              <button class="btn sec" id="md-trocar-senha" type="button">${ic('lock')}Trocar a senha</button></div>`
            : `<p class="hint" id="md-social" style="margin:14px 0 0">Você entra pela conta ${google ? 'Google' : ms ? 'Microsoft' : 'de outro serviço'}, então o e-mail é o dessa conta. Para usar outro e-mail, peça ao administrador da sua empresa um convite para o e-mail novo.</p>`}
        </div></section>

      <section class="card" id="md-aut"><div class="card-h"><span class="ic">${ic('shield')}</span><h3>Minhas autorizações</h3></div>
        <div class="card-b"><p class="hint" style="margin:0 0 12px">O que você autorizou o Conectwork a fazer com os seus dados, como avisos por WhatsApp e e-mail.</p>
          <button class="btn sec" id="md-ir-aut" type="button">${ic('shield')}Ver minhas autorizações</button></div></section>
    </div>`;
    U().aplicarMascaras(el);
    document.getElementById('md-ir-aut').onclick = () => CW.ir('autorizacoes');
    document.getElementById('md-salvar').onclick = () => salvar(el, ctx);
    const te = document.getElementById('md-trocar-email'); if (te) te.onclick = () => trocarEmail(el, ctx);
    const ts = document.getElementById('md-trocar-senha'); if (ts) ts.onclick = trocarSenha;
  }

  async function salvar(el, ctx) {
    const s = CW.sessao.estado(), er = document.getElementById('md-erro'), bt = document.getElementById('md-salvar');
    const nome = document.getElementById('md-nome').value.replace(/\s+/g, ' ').trim(), tel = document.getElementById('md-tel').value.trim();
    er.textContent = '';
    if (nome.length < 3 || !/\s/.test(nome)) { er.textContent = 'Escreva o nome e o sobrenome.'; return; }
    if (tel && !U().validarCelular(tel)) { er.textContent = 'Celular inválido. Use DDD e o número com 9 na frente, por exemplo (51) 99999-9999.'; return; }
    bt.disabled = true;
    try {
      await CW.fb.db().doc('usuarios/' + s.usuario.uid).set({ nome, email: s.usuario.email, tel, atualizadoEm: CW.fb.agora() }, { merge: true });
      s.perfil = Object.assign(s.perfil || {}, { nome, email: s.usuario.email, tel });
      await sincronizar(s);
      const qn = document.getElementById('quem-nome'); if (qn) qn.textContent = nome;
      U().toast('Dados salvos.');
    } catch (e) { er.textContent = CW.fb.mensagemErro(e); }
    bt.disabled = false;
  }

  async function trocarEmail(el, ctx) {
    const { esc, ic } = U(), s = CW.sessao.estado(), u = CW.fb.auth().currentUser;
    let enviado = null;
    await U().dialogo({ titulo: 'Trocar o e-mail de acesso', sub: `Hoje você entra com ${s.usuario.email}. Vamos mandar um link para o e-mail novo; ele só passa a valer quando você abrir o link.`,
      corpo: `<div class="fgrid">
        <label class="f c12"><span>E-mail novo</span><input id="te-email" type="email" autocomplete="email" maxlength="120"></label>
        <label class="f c12"><span>Sua senha atual</span><input id="te-senha" type="password" autocomplete="current-password" maxlength="100"><em class="hint">Por segurança, confirme que é você.</em></label>
        <p class="err c12" id="te-erro" role="alert"></p></div>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Enviar o link', icone: 'send', valor: 'ok', antes: d => {
        const novo = d.querySelector('#te-email').value.trim().toLowerCase(), senha = d.querySelector('#te-senha').value, er = d.querySelector('#te-erro');
        if (!U().validarEmail(novo)) { er.textContent = 'Escreva um e-mail válido.'; return false; }
        if (novo === s.usuario.email) { er.textContent = 'Esse já é o seu e-mail de acesso.'; return false; }
        if (!senha) { er.textContent = 'Escreva a sua senha atual.'; return false; }
        const bt = d.querySelector('[data-dlg-b="1"]'); bt.disabled = true; er.textContent = '';
        const cred = firebase.auth.EmailAuthProvider.credential(s.usuario.email, senha);
        u.reauthenticateWithCredential(cred)
          .then(() => u.verifyBeforeUpdateEmail(novo, cfg().urlApp ? { url: cfg().urlApp } : undefined))
          .then(() => { enviado = novo; d.close(); })
          .catch(e => { er.textContent = erroTroca(e); bt.disabled = false; });
        return false; } }],
      aoAbrir: d => d.querySelector('#te-email').focus() });
    if (!enviado) return;
    try { sessionStorage.setItem('cw.emailNovo.' + s.usuario.uid, enviado); } catch (e) {}
    try { await CW.registrarLog('pessoa.email_pedido', `${(s.perfil && s.perfil.nome) || s.usuario.email} pediu para trocar o e-mail de acesso de ${s.usuario.email} para ${enviado} (falta confirmar no e-mail novo).`, s.usuario.uid); } catch (e) { /* histórico opcional aqui: a troca só vale depois do link */ }
    U().toast(`Link enviado para ${enviado}. Abra o e-mail novo para concluir a troca.`);
    render(el, ctx);
  }

  async function trocarSenha() {
    const s = CW.sessao.estado();
    if (!(await U().confirmar('Trocar a senha', `Vamos mandar um link para ${s.usuario.email}. Pelo link você cria a senha nova.`, 'Enviar o link'))) return;
    try { await CW.fb.auth().sendPasswordResetEmail(s.usuario.email, cfg().urlApp ? { url: cfg().urlApp } : undefined); U().toast(`Link enviado para ${s.usuario.email}.`); }
    catch (e) { U().toast(erroTroca(e), 'erro'); }
  }

  CW.registrarModulo({
    id: 'meusdados', nome: 'Meus dados', icone: 'user', ordem: 97, menu: false,
    para: ['empresa', 'master'], livre: true, semAprovacao: true,
    telas: { lista: { nome: 'Meus dados', sub: 'Seu nome, celular, e-mail de acesso e senha.', render } }
  });
  CW.meusDados = { sincronizar, temSenha };
})();
