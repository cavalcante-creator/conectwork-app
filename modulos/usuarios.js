/* Conectwork · Etapa 1, parte 3: usuários e acessos da empresa (só o administrador).
   - Pessoas com acesso: cargo (os do CLAUDE.md), ajuste por pessoa (extras = telas a mais, sem = telas a menos),
     bloquear e liberar. Ninguém mexe no próprio acesso (as regras do banco também impedem).
   - Convites: nome, e-mail, WhatsApp (opcional) e cargo. Gera um link (#convite/<token>) que o próprio admin
     manda pelo WhatsApp (mensagem pronta) ou copia. Sem servidor: o app não envia e-mail sozinho.
     Reenviar (abre de novo o link para mandar) e cancelar (o link deixa de valer).
   - Toda ação grava no histórico (só nome e e-mail das pessoas, nada de telefone). */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const P = () => CW.permissoes;

  let acessos = null, convites = null;
  const eu = ctx => ctx.sessao.usuario.uid;
  const quem = ctx => (ctx.sessao.perfil && ctx.sessao.perfil.nome) || ctx.sessao.usuario.email;
  /* link com página própria (convite/?c=): o WhatsApp mostra a prévia com imagem e título do convite; a página leva para #convite/<token> */
  const linkConvite = token => { const base = ((window.CONECTWORK_CONFIG || {}).urlApp || (location.origin + location.pathname)).replace(/#.*$/, '').replace(/[^/]*$/, ''); return base + 'convite/?c=' + token; };

  /* telas que dá para ajustar por pessoa: módulos de empresa já no ar, contratados por esta empresa, que dependem do cargo */
  function telasAjustaveis(ctx) {
    const emp = ctx.contexto.empresa || {};
    return CW.app.modulos().filter(m => (m.para || ['empresa']).includes('empresa') && !m.livre && !m.soAdmin && (!m.contrato || [].concat(m.contrato).some(c => (emp.modulos || []).includes(c))));
  }
  const peloCargo = (cargo, id) => { const c = P().cargo(cargo); return !!c && (c.telas === '*' || c.telas.includes(id)); };

  function mensagemZap(cv, ctx) {
    return `Olá, ${cv.nome.split(' ')[0]}! ${quem(ctx)} convidou você para acessar a empresa ${ctx.contexto.nome} no Conectwork, como ${P().nomeCargo(cv.cargo)}.\n\n`
      + `Para criar seu acesso, abra o link e use o e-mail ${cv.email}:\n${linkConvite(cv._id)}\n\nO convite vale só para esse e-mail.`;
  }

  /* ---------- tela ---------- */
  function desenhar(el, ctx) {
    const { esc, ic, avatar, formatarData } = U();
    if (!acessos || !convites) { el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Carregando as pessoas…</span></div></div>`; return; }
    const ro = ctx.soLeitura;
    const pessoas = acessos.slice().sort((a, b) => (b.uid === eu(ctx)) - (a.uid === eu(ctx)) || String(a.nome || a.email).localeCompare(String(b.nome || b.email), 'pt-BR'));
    const telas = telasAjustaveis(ctx);
    const linhas = pessoas.map(a => {
      const sou = a.uid === eu(ctx), pode = !sou && !ro;
      const ve = telas.filter(m => P().podeVer(m, { tipo: 'empresa', empresa: ctx.contexto.empresa, acesso: Object.assign({}, a, { ativo: true }) })).map(m => `<span class="tag gray">${esc(m.nomeCurto || m.nome)}</span>`).join(' ');
      const ajustado = (a.extras || []).length || (a.sem || []).length;
      return `<tr data-uid="${esc(a.uid)}"><td class="m-full"><div class="cell">${avatar(a.nome || a.email)}<div style="min-width:0"><strong>${esc(a.nome || a.email)}${sou ? ' <span class="tag">você</span>' : ''}</strong><small>${esc(a.email || '')}</small></div></div></td>
        <td>${pode ? `<select class="sel" data-cargo="${esc(a._id)}" aria-label="Cargo de ${esc(a.nome || a.email)}">${Object.entries(P().CARGOS).map(([k, c]) => `<option value="${k}" ${k === a.cargo ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select>` : esc(P().nomeCargo(a.cargo))}${ajustado ? '<br><small class="hint">acesso ajustado</small>' : ''}</td>
        <td class="m-hide"><div style="display:flex;gap:4px;flex-wrap:wrap">${a.cargo === 'admin' ? '<span class="tag gray">Tudo da empresa</span>' : ve || '<span class="hint">Só o Início</span>'}</div></td>
        <td>${a.ativo ? '<span class="pill ok">Ativo</span>' : '<span class="pill danger">Bloqueado</span>'}</td>
        <td class="r">${pode ? `<div class="acts"><button class="btn sec sm" data-ajustar="${esc(a._id)}">Ajustar acesso</button><button class="btn ${a.ativo ? 'ghost' : 'sec'} sm" data-bloq="${esc(a._id)}">${a.ativo ? 'Bloquear' : 'Liberar'}</button></div>` : ''}</td></tr>`;
    }).join('');
    const pend = convites.slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    const linhasConv = pend.map(c => `<tr><td class="m-full"><div class="cell">${avatar(c.nome)}<div style="min-width:0"><strong>${esc(c.nome)}</strong><small>${esc(c.email)}</small></div></div></td>
        <td>${esc(P().nomeCargo(c.cargo))}</td><td class="m-hide">${esc(formatarData(c.reenviadoEm || c.criadoEm) || '')}</td>
        <td class="r">${ro ? '' : `<div class="acts"><button class="btn sec sm" data-reenviar="${esc(c._id)}">${ic('send')}Reenviar</button><button class="btn ghost sm" data-cancelar="${esc(c._id)}">Cancelar</button></div>`}</td></tr>`).join('');
    el.innerHTML = `
      <section class="card" id="us-pessoas"><div class="card-h"><span class="ic">${ic('users')}</span><h3>Pessoas com acesso</h3><span class="count">${pessoas.length}</span></div>
        <div class="scroll"><table class="resp"><thead><tr><th>Pessoa</th><th>Cargo</th><th>O que vê</th><th>Situação</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div></section>
      <section class="card" id="us-convites" style="margin-top:22px"><div class="card-h"><span class="ic">${ic('mail')}</span><h3>Convites esperando resposta</h3><span class="count">${pend.length}</span></div>
        ${pend.length ? `<div class="scroll"><table class="resp"><thead><tr><th>Pessoa</th><th>Cargo</th><th>Enviado em</th><th></th></tr></thead><tbody>${linhasConv}</tbody></table></div>`
          : `<div class="card-b"><p class="hint" style="margin:0">Nenhum convite esperando. Use "Convidar pessoa" para dar acesso a alguém da equipe.</p></div>`}</section>
      <section class="card" style="margin-top:22px"><div class="card-h"><span class="ic">${ic('shield')}</span><h3>O que cada cargo faz</h3></div><div class="card-b"><dl class="dl">
        ${Object.values(P().CARGOS).map(c => `<div><dt>${esc(c.nome)}</dt><dd style="font-size:13px;font-weight:400">${esc(c.desc)}</dd></div>`).join('')}</dl>
        <p class="hint" style="margin:14px 0 0;font-size:12.5px">Quem pede não aprova o pagamento sozinho: solicitante, aprovador técnico, financeiro e tesouraria são funções separadas.</p></div></section>`;
    const acoes = document.getElementById('acoes');
    acoes.innerHTML = ro ? '' : `<button class="btn" id="us-convidar">${ic('plus')}Convidar pessoa</button>`;
    ligar(el, ctx);
  }

  function ligar(el, ctx) {
    const db = CW.fb.db(), emp = ctx.contexto.empresaId;
    const acesso = id => acessos.find(a => a._id === id), conv = id => convites.find(c => c._id === id);
    const log = (b, acao, texto, ref) => b.set(db.collection('log').doc(), { em: CW.fb.agora(), uid: eu(ctx), quem: quem(ctx), empresaId: emp, acao, texto, ref: ref || '' });
    const grava = async (fn, ok) => { const b = db.batch(); fn(b); try { await b.commit(); if (ok) U().toast(ok); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); desenhar(el, ctx); } };
    const nome = a => a.nome || a.email;

    const bt = document.getElementById('us-convidar'); if (bt) bt.onclick = () => convidar(ctx);

    el.querySelectorAll('[data-cargo]').forEach(s => s.onchange = () => {
      const a = acesso(s.dataset.cargo), novo = s.value, antes = a.cargo;
      grava(b => { b.update(db.doc('acessos/' + a._id), { cargo: novo, atualizadoEm: CW.fb.agora() });
        log(b, 'acesso.cargo', `Cargo de ${nome(a)} (${a.email}) mudou de ${P().nomeCargo(antes)} para ${P().nomeCargo(novo)}.`, a._id); },
      `${nome(a)} agora é ${P().nomeCargo(novo)}.`);
    });

    el.querySelectorAll('[data-bloq]').forEach(b => b.onclick = async () => {
      const a = acesso(b.dataset.bloq), bloquear = a.ativo;
      if (bloquear && !(await U().confirmar('Bloquear acesso?', `${nome(a)} não vai mais conseguir entrar nesta empresa até ser liberado de novo. O histórico do que essa pessoa fez continua guardado.`, 'Bloquear'))) return;
      grava(x => { x.update(db.doc('acessos/' + a._id), { ativo: !bloquear, atualizadoEm: CW.fb.agora() });
        log(x, bloquear ? 'acesso.bloquear' : 'acesso.liberar', `Acesso de ${nome(a)} (${a.email}) ${bloquear ? 'bloqueado' : 'liberado'}.`, a._id); },
      bloquear ? `Acesso de ${nome(a)} bloqueado.` : `Acesso de ${nome(a)} liberado.`);
    });

    el.querySelectorAll('[data-ajustar]').forEach(b => b.onclick = () => ajustar(ctx, acesso(b.dataset.ajustar), grava, log));

    el.querySelectorAll('[data-reenviar]').forEach(b => b.onclick = () => {
      const c = conv(b.dataset.reenviar);
      grava(x => { x.update(db.doc('convites/' + c._id), { reenviadoEm: CW.fb.agora() }); log(x, 'convite.reenviar', `Convite reenviado para ${c.nome} (${c.email}).`, c._id); });
      compartilhar(ctx, c, 'Reenviar convite');
    });
    el.querySelectorAll('[data-cancelar]').forEach(b => b.onclick = async () => {
      const c = conv(b.dataset.cancelar);
      if (!(await U().confirmar('Cancelar convite?', `O link enviado para ${c.nome} deixa de funcionar. Se precisar, dá para convidar de novo depois.`, 'Cancelar convite'))) return;
      grava(x => { x.delete(db.doc('convites/' + c._id)); log(x, 'convite.cancelar', `Convite de ${c.nome} (${c.email}) cancelado.`, c._id); }, `Convite de ${c.nome} cancelado.`);
    });
  }

  /* ---------- ajustar acesso de uma pessoa ---------- */
  function ajustar(ctx, a, grava, log) {
    const { esc } = U(), db = CW.fb.db();
    const telas = telasAjustaveis(ctx);
    const ve = m => { const base = peloCargo(a.cargo, m.id); return (base && !(a.sem || []).includes(m.id)) || (!base && (a.extras || []).includes(m.id)); };
    const corpo = telas.length ? `<div class="stack" style="gap:8px" id="aj-lista">${telas.map(m => `<label class="check"><input type="checkbox" data-aj="${esc(m.id)}" ${ve(m) ? 'checked' : ''}>
        <span><strong style="font-weight:600">${esc(m.nome)}</strong><small>${peloCargo(a.cargo, m.id) ? 'Liberado pelo cargo' : 'Fora do cargo'}</small></span></label>`).join('')}</div>`
      : `<p class="hint" style="margin:0" id="aj-lista">Ainda não há telas da empresa para ajustar. Elas aparecem aqui conforme os módulos contratados entram no ar.</p>`;
    U().dialogo({ titulo: 'Ajustar acesso', sub: `${a.nome || a.email} · ${P().nomeCargo(a.cargo)}. Marque o que essa pessoa vê, além ou no lugar do que o cargo libera.`, corpo,
      botoes: telas.length ? [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Salvar acesso', valor: 'ok' }] : [{ texto: 'Fechar', valor: null, classe: 'sec' }],
      aoAbrir: d => { d._ler = () => { const extras = [], sem = []; d.querySelectorAll('[data-aj]').forEach(c => { const k = c.dataset.aj, b = peloCargo(a.cargo, k); if (c.checked && !b) extras.push(k); if (!c.checked && b) sem.push(k); }); return { extras, sem }; }; window.__ajDlg = d; }
    }).then(v => {
      const d = window.__ajDlg; window.__ajDlg = null;
      if (v !== 'ok' || !d) return;
      const { extras, sem } = d._ler();
      const nomes = ids => ids.map(k => (telas.find(m => m.id === k) || { nome: k }).nome).join(', ');
      grava(b => { b.update(db.doc('acessos/' + a._id), { extras, sem, atualizadoEm: CW.fb.agora() });
        log(b, 'acesso.ajuste', `Acesso de ${a.nome || a.email} (${a.email}) ajustado.${extras.length ? ' A mais: ' + nomes(extras) + '.' : ''}${sem.length ? ' A menos: ' + nomes(sem) + '.' : ''}${!extras.length && !sem.length ? ' Voltou ao padrão do cargo.' : ''}`, a._id); },
      `Acesso de ${a.nome || a.email} ajustado.`);
    });
  }

  /* ---------- convidar ---------- */
  function convidar(ctx) {
    const { esc } = U();
    let dados = null;
    U().dialogo({ titulo: 'Convidar pessoa', sub: 'A pessoa recebe um link para criar a senha e entra nesta empresa com o cargo escolhido.',
      corpo: `<form class="fgrid" id="cv-form" novalidate>
        <label class="f c12"><span>Nome completo</span><input id="cv-nome" autocomplete="off" maxlength="120"></label>
        <label class="f c6"><span>E-mail</span><input id="cv-email" type="email" autocomplete="off" maxlength="120"><em class="hint">Será o login da pessoa.</em></label>
        <label class="f c6"><span>WhatsApp <i>(opcional)</i></span><input id="cv-tel" data-mascara="celular" inputmode="tel" placeholder="(00) 00000-0000"><em class="hint">Para mandar o link direto.</em></label>
        <label class="f c12"><span>Cargo</span><select id="cv-cargo">${Object.entries(P().CARGOS).map(([k, c]) => `<option value="${k}" ${k === 'consulta' ? 'selected' : ''}>${esc(c.nome)}: ${esc(c.desc)}</option>`).join('')}</select></label>
        <p class="err c12" id="cv-erro" role="alert"></p></form>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Criar convite', valor: 'ok', icone: 'send', antes: d => {
        const v = id => d.querySelector('#' + id).value.trim(), er = d.querySelector('#cv-erro');
        const nome = v('cv-nome').replace(/\s+/g, ' '), email = v('cv-email').toLowerCase(), tel = v('cv-tel'), cargo = d.querySelector('#cv-cargo').value;
        if (nome.split(' ').length < 2) { er.textContent = 'Informe nome e sobrenome.'; d.querySelector('#cv-nome').focus(); return false; }
        if (!U().validarEmail(email)) { er.textContent = 'Esse e-mail não parece válido. Confira se digitou certo.'; d.querySelector('#cv-email').focus(); return false; }
        if (tel && !U().validarCelular(tel)) { er.textContent = 'WhatsApp inválido. Use DDD + 9 dígitos, ou deixe em branco.'; d.querySelector('#cv-tel').focus(); return false; }
        if ((acessos || []).some(a => String(a.email || '').toLowerCase() === email)) { er.textContent = 'Essa pessoa já tem acesso a esta empresa.'; return false; }
        if ((convites || []).some(c => c.email === email)) { er.textContent = 'Já existe um convite esperando para esse e-mail. Use "Reenviar" na lista.'; return false; }
        dados = { nome, email, tel, cargo }; return true;
      } }],
      aoAbrir: d => { U().aplicarMascaras(d); d.querySelector('#cv-nome').focus(); d.querySelectorAll('input').forEach(i => i.addEventListener('input', () => { d.querySelector('#cv-erro').textContent = ''; }));
        d.querySelector('#cv-form').onsubmit = ev => { ev.preventDefault(); d.querySelector('[data-dlg-b="1"]').click(); }; }
    }).then(async v => {
      if (v !== 'ok' || !dados) return;
      const db = CW.fb.db(), ref = db.collection('convites').doc(), emp = ctx.contexto.empresaId;
      const cv = { email: dados.email, nome: dados.nome, tel: dados.tel || '', empresaId: emp, empresaNome: ctx.contexto.nome, cargo: dados.cargo, criadoPor: eu(ctx), criadoPorNome: quem(ctx), criadoEm: CW.fb.agora(), usado: false };
      const b = db.batch(); b.set(ref, cv);
      b.set(db.collection('log').doc(), { em: CW.fb.agora(), uid: eu(ctx), quem: quem(ctx), empresaId: emp, acao: 'convite.criar', texto: `Convite criado para ${dados.nome} (${dados.email}) como ${P().nomeCargo(dados.cargo)}.`, ref: ref.id });
      try { await b.commit(); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); return; }
      compartilhar(ctx, Object.assign({ _id: ref.id }, cv), 'Convite criado');
    });
  }

  /* mandar o link: WhatsApp (mensagem pronta) ou copiar */
  function compartilhar(ctx, c, titulo) {
    const { esc, ic, dig } = U(), link = linkConvite(c._id), msg = mensagemZap(c, ctx);
    const tel = dig(c.tel || ''), zap = `https://wa.me/${tel.length === 11 ? '55' + tel : ''}?text=${encodeURIComponent(msg)}`;
    U().dialogo({ titulo, sub: `Mande o link para ${c.nome}. Ele só vale para o e-mail ${c.email}.`,
      corpo: `<div class="stack" style="gap:12px">
        <label class="f"><span>Link do convite</span><input id="cv-link" readonly value="${esc(link)}"></label>
        <a class="btn" id="cv-zap" target="_blank" rel="noopener" href="${esc(zap)}">${ic('send')}Enviar pelo WhatsApp</a>
        <button class="btn sec" type="button" id="cv-copiar-msg">${ic('copy')}Copiar a mensagem</button>
        <button class="linkbtn" type="button" id="cv-copiar">Copiar só o link</button>
        <p class="hint" style="margin:0;font-size:12.5px">O Conectwork não envia e-mail sozinho por enquanto. Se preferir, cole o link num e-mail para a pessoa.</p></div>`,
      botoes: [{ texto: 'Fechar', valor: null, classe: 'sec' }],
      aoAbrir: d => {
        d.querySelector('#cv-copiar-msg').onclick = async () => { try { await navigator.clipboard.writeText(msg); U().toast('Mensagem copiada. Cole na conversa com a pessoa.'); } catch (e) { U().toast('Não deu para copiar. Use "Enviar pelo WhatsApp".', 'erro'); } };
        d.querySelector('#cv-copiar').onclick = async () => {
          const inp = d.querySelector('#cv-link');
          try { await navigator.clipboard.writeText(link); } catch (e) { inp.select(); try { document.execCommand('copy'); } catch (x) { /* nada */ } }
          U().toast('Link copiado. Agora é só colar na conversa com a pessoa.');
        };
      } });
  }

  CW.registrarModulo({
    id: 'usuarios', nome: 'Usuários e acessos', nomeCurto: 'Usuários', icone: 'users', ordem: 80,
    para: ['empresa'], contrato: 'equipe', soAdmin: true,
    iniciar(ctx) {
      acessos = null; convites = null;
      const emp = ctx.contexto.empresaId, db = CW.fb.db();
      const redesenha = () => { const el = document.getElementById('view'), at = CW.app.atual(); if (el && at && at.modulo === 'usuarios') desenhar(el, Object.assign({}, ctx, { sessao: CW.sessao.estado() })); };
      CW.inscrever('usuarios-acessos', () => db.collection('acessos').where('empresaId', '==', emp), s => { acessos = CW.fb.lista(s); redesenha(); });
      CW.inscrever('usuarios-convites', () => db.collection('convites').where('empresaId', '==', emp).where('usado', '==', false), s => { convites = CW.fb.lista(s); redesenha(); });
      return () => { acessos = null; convites = null; };
    },
    telas: {
      lista: { nome: 'Usuários e acessos', sub: 'Quem entra nesta empresa, com qual cargo e o que cada pessoa vê.', render: (el, ctx) => desenhar(el, ctx) }
    }
  });
})();
