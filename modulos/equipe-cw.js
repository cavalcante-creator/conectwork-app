/* Conectwork · equipe Conectwork: quem é da equipe e convites para entrar nela.
   - Convidar: nome e e-mail → convites/{token} com tipo 'master'. O link é o mesmo do convite de empresa (#convite/<token>);
     a pessoa cria o acesso (ou entra) com o e-mail convidado e passa a ser da equipe (master/{uid}).
   - Tirar da equipe: outra pessoa da equipe tira (ninguém tira a si mesmo). O primeiro da equipe é criado no console.
   Tudo grava no histórico (empresaId 'master'). */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const R = () => CW.rede;
  /* link com página própria (convite/?c=): o WhatsApp mostra a prévia com imagem e título do convite; a página leva para #convite/<token> */
  const linkConvite = token => { const base = ((window.CONECTWORK_CONFIG || {}).urlApp || (location.origin + location.pathname)).replace(/#.*$/, '').replace(/[^/]*$/, ''); return base + 'convite/?c=' + token; };
  const token = () => { const a = new Uint8Array(18); crypto.getRandomValues(a); return Array.from(a, b => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[b % 62]).join(''); };
  const perfis = {};            /* nome e e-mail de quem foi colocado na equipe pelo console (master/{uid} sem nome) */

  async function lerPerfis(xs) {
    const faltam = xs.filter(m => !m.nome && !perfis[m._id]);
    await Promise.all(faltam.map(m => CW.fb.db().doc('usuarios/' + m._id).get().then(sn => { perfis[m._id] = CW.fb.dados(sn) || {}; }).catch(() => { perfis[m._id] = {}; })));
  }

  async function tela(el, ctx) {
    const { esc, ic, avatar, formatarData } = U(), r = R();
    if (!r.D.equipe || !r.D.convites) { r.carregando(el, 'Carregando a equipe…'); return; }
    await lerPerfis(r.D.equipe);
    if (!document.body.contains(el)) return;
    const eu = ctx.sessao.usuario.uid;
    const pessoas = r.D.equipe.map(m => Object.assign({}, m, { nome: m.nome || (perfis[m._id] || {}).nome || '', email: m.email || (perfis[m._id] || {}).email || '' }))
      .sort((a, b) => (b._id === eu) - (a._id === eu) || String(a.nome || a.email).localeCompare(String(b.nome || b.email), 'pt-BR'));
    const pend = r.D.convites.filter(c => !c.usado);
    document.getElementById('acoes').innerHTML = `<button class="btn" id="eq-convidar">${ic('plus')}Convidar para a equipe</button>`;
    el.innerHTML = `<div class="grid-main"><div class="stack">
      <section class="card" id="eq-lista"><div class="card-h"><span class="ic">${ic('users')}</span><h3>Equipe Conectwork</h3><span class="count">${pessoas.length}</span></div>
        <div class="scroll"><table class="resp"><thead><tr><th>Pessoa</th><th>Na equipe desde</th><th></th></tr></thead><tbody>
        ${pessoas.map(m => `<tr data-pessoa="${esc(m._id)}"><td class="m-full"><div class="cell">${avatar(m.nome || m.email || '?', 'sm')}<div style="min-width:0"><strong>${esc(m.nome || 'Sem nome')}${m._id === eu ? ' <span class="tag">Você</span>' : ''}</strong><small>${esc(m.email || 'Colocada na equipe pelo console do Firebase')}</small></div></div></td>
          <td>${esc(formatarData(m.criadoEm) || '—')}</td>
          <td class="r">${m._id === eu ? '' : `<button class="btn sec sm" data-tirar="${esc(m._id)}">Tirar da equipe</button>`}</td></tr>`).join('')}</tbody></table></div></section>
      ${pend.length ? `<section class="card" id="eq-convites"><div class="card-h"><span class="ic">${ic('mail')}</span><h3>Convites esperando</h3><span class="count">${pend.length}</span></div>
        <div class="scroll"><table class="resp"><thead><tr><th>Convidado</th><th>Enviado em</th><th></th></tr></thead><tbody>
        ${pend.map(c => `<tr><td class="m-full"><div class="cell">${avatar(c.nome || c.email, 'sm')}<div style="min-width:0"><strong>${esc(c.nome || '')}</strong><small>${esc(c.email)}</small></div></div></td>
          <td>${esc(formatarData(c.criadoEm) || '—')}</td>
          <td class="r" style="white-space:nowrap"><button class="btn sec sm" data-link="${esc(c._id)}">Mandar o link</button> <button class="btn sec sm" data-cancelar="${esc(c._id)}">Cancelar</button></td></tr>`).join('')}</tbody></table></div></section>` : ''}
    </div><div class="stack">
      <section class="card"><div class="card-h"><span class="ic">${ic('shield')}</span><h3>O que a equipe faz</h3></div><div class="card-b"><ul style="margin:0;padding-left:18px;font-size:13.5px;line-height:1.6">
        <li>Analisa os cadastros, define plano e módulos e suspende ou reativa empresas.</li>
        <li>Cuida das mensalidades, dos sites de emissão e dos avisos para a rede.</li>
        <li>Consulta qualquer empresa ("Ver como a empresa"), sem alterar nada no lugar dela.</li>
        <li>Convide só quem trabalha no Conectwork: a equipe vê os dados de toda a rede.</li></ul></div></section></div></div>`;
    document.getElementById('eq-convidar').onclick = () => convidar(ctx);
    el.querySelectorAll('[data-tirar]').forEach(b => b.onclick = () => tirar(ctx, pessoas.find(m => m._id === b.dataset.tirar)));
    el.querySelectorAll('[data-link]').forEach(b => b.onclick = () => compartilhar(ctx, pend.find(c => c._id === b.dataset.link), 'Convite para a equipe'));
    el.querySelectorAll('[data-cancelar]').forEach(b => b.onclick = async () => {
      const c = pend.find(x => x._id === b.dataset.cancelar);
      if (!(await U().confirmar('Cancelar o convite?', `O link mandado para ${c.email} deixa de funcionar.`, 'Cancelar convite'))) return;
      const db = CW.fb.db(), bt = db.batch();
      bt.delete(db.doc('convites/' + c._id));
      r.log(bt, ctx, 'master', 'equipe.cancelar', `Convite para a equipe de ${c.nome || c.email} (${c.email}) cancelado.`, c._id);
      try { await bt.commit(); U().toast('Convite cancelado.'); } catch (err) { U().toast(CW.fb.mensagemErro(err), 'erro'); }
    });
  }

  function convidar(ctx) {
    const r = R();
    U().dialogo({ titulo: 'Convidar para a equipe', sub: 'A pessoa recebe um link para criar o acesso com este e-mail e passa a fazer parte da equipe Conectwork.',
      corpo: `<div class="stack" style="gap:12px"><label class="f"><span>Nome completo</span><input id="eq-nome" maxlength="120" autocomplete="off"></label>
        <label class="f"><span>E-mail</span><input id="eq-email" type="email" maxlength="120" autocomplete="off"><em class="hint">Será o login da pessoa.</em></label>
        <label class="f"><span>Celular com DDD (opcional)</span><input id="eq-tel" data-mascara="celular" placeholder="(51) 99999-9999"><em class="hint">Para mandar o link pelo WhatsApp.</em></label>
        <p class="err" id="eq-erro" role="alert"></p></div>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Criar convite', valor: 'ok', antes: d => {
        const nome = d.querySelector('#eq-nome').value.trim().replace(/\s+/g, ' '), email = d.querySelector('#eq-email').value.trim().toLowerCase(), tel = d.querySelector('#eq-tel').value, er = d.querySelector('#eq-erro');
        if (nome.split(' ').length < 2) { er.textContent = 'Informe nome e sobrenome.'; return false; }
        if (!U().validarEmail(email)) { er.textContent = 'Esse e-mail não parece válido. Confira se digitou certo.'; return false; }
        if (tel && !U().validarCelular(tel)) { er.textContent = 'O celular precisa ter DDD e 9 dígitos, ou fique em branco.'; return false; }
        if ((r.D.equipe || []).some(m => (m.email || '') === email)) { er.textContent = 'Essa pessoa já é da equipe.'; return false; }
        if ((r.D.convites || []).some(c => !c.usado && c.email === email)) { er.textContent = 'Já existe um convite esperando para esse e-mail. Use "Mandar o link".'; return false; }
        d._v = { nome, email, tel: U().dig(tel) }; return true; } }],
      aoAbrir: d => { U().aplicarMascaras(d); d.querySelector('#eq-nome').focus(); window.__eqDlg = d; }
    }).then(async v => {
      const d = window.__eqDlg; window.__eqDlg = null;
      if (v !== 'ok' || !d) return;
      const db = CW.fb.db(), tk = token(), b = db.batch();
      const c = { email: d._v.email, nome: d._v.nome, tel: d._v.tel, tipo: 'master', empresaId: 'conectwork', empresaNome: 'Equipe Conectwork', usado: false, criadoPor: ctx.sessao.usuario.uid, criadoPorNome: r.quemSou(ctx), criadoEm: CW.fb.agora() };
      b.set(db.doc('convites/' + tk), c);
      r.log(b, ctx, 'master', 'equipe.convidar', `${d._v.nome} (${d._v.email}) convidado(a) para a equipe Conectwork.`, tk);
      try { await b.commit(); compartilhar(ctx, Object.assign({ _id: tk }, c), 'Convite criado'); } catch (err) { U().toast(CW.fb.mensagemErro(err), 'erro'); }
    });
  }

  function compartilhar(ctx, c, titulo) {
    if (!c) return;
    const { esc, ic, dig } = U(), link = linkConvite(c._id);
    const msg = `Olá, ${String(c.nome || '').split(' ')[0]}! ${R().quemSou(ctx)} convidou você para a equipe do Conectwork.\n\nPara criar seu acesso, abra o link e use o e-mail ${c.email}:\n${link}\n\nO convite vale só para esse e-mail.`;
    const tel = dig(c.tel || ''), zap = `https://wa.me/${tel.length === 11 ? '55' + tel : ''}?text=${encodeURIComponent(msg)}`;
    U().dialogo({ titulo, sub: `Mande o link para ${c.nome || c.email}. Ele só vale para o e-mail ${c.email}.`,
      corpo: `<div class="stack" style="gap:12px">
        <label class="f"><span>Link do convite</span><input id="eq-link" readonly value="${esc(link)}"></label>
        <a class="btn" id="eq-zap" target="_blank" rel="noopener" href="${esc(zap)}">${ic('send')}Enviar pelo WhatsApp</a>
        <button class="btn sec" type="button" id="eq-copiar-msg">${ic('copy')}Copiar a mensagem</button>
        <button class="linkbtn" type="button" id="eq-copiar">Copiar só o link</button></div>`,
      botoes: [{ texto: 'Fechar', valor: null, classe: 'sec' }],
      aoAbrir: d => { d.querySelector('#eq-copiar-msg').onclick = async () => { try { await navigator.clipboard.writeText(msg); U().toast('Mensagem copiada. Cole na conversa com a pessoa.'); } catch (e) { U().toast('Não deu para copiar. Use "Enviar pelo WhatsApp".', 'erro'); } };
        d.querySelector('#eq-copiar').onclick = async () => {
        const inp = d.querySelector('#eq-link');
        try { await navigator.clipboard.writeText(link); } catch (e) { inp.select(); try { document.execCommand('copy'); } catch (x) { /* nada */ } }
        U().toast('Link copiado. Agora é só colar na conversa com a pessoa.'); }; } });
  }

  async function tirar(ctx, m) {
    if (!m) return;
    const r = R();
    if (!(await U().confirmar('Tirar da equipe?', `${m.nome || m.email || 'Esta pessoa'} deixa de ver os dados da rede. O login continua existindo e pode ser convidado de novo depois.`, 'Tirar da equipe'))) return;
    const db = CW.fb.db(), b = db.batch();
    b.delete(db.doc('master/' + m._id));
    r.log(b, ctx, 'master', 'equipe.tirar', `${m.nome || m.email || m._id} saiu da equipe Conectwork.`, m._id);
    try { await b.commit(); U().toast('Pessoa tirada da equipe.'); } catch (err) { U().toast(CW.fb.mensagemErro(err), 'erro'); }
  }

  CW.rede.redesenhar.equipecw = (el, ctx) => tela(el, ctx);
  CW.registrarModulo({
    id: 'equipecw', nome: 'Equipe Conectwork', nomeCurto: 'Equipe', icone: 'users', ordem: 15,
    para: ['master'],
    telas: { lista: { nome: 'Equipe Conectwork', sub: 'Quem trabalha no Conectwork e vê os dados de toda a rede.', render: (el, ctx) => tela(el, ctx) } }
  });
})();
