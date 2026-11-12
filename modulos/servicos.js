/* Conectwork · Catálogo de serviços (12/11/2026, reunião: "painel de opções de serviços gerais ou específicos").
   - Serviços gerais: a lista pronta abaixo (SERV), igual para todas as empresas, por categoria.
   - Serviços específicos: cada empresa cadastra os seus (servicosesp/{id}: empresaId, nome, cat, desc, removido…).
   - Quem contrata escolhe no catálogo e toca em "Pedir este serviço": abre a nova ordem de serviço já com o nome.
     "Quem faz" mostra as empresas aprovadas da rede que marcaram o serviço.
   - Quem presta marca os serviços que oferece (ofertaserv/{empresaId}: gerais = ids da lista, especificos = textos).
   - Nada se apaga (removido:true) e tudo vai para o histórico. */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;

  const SERV = [
    ['Limpeza e conservação', ['Limpeza de escritório', 'Limpeza industrial', 'Limpeza pós-obra', 'Limpeza de vidros e fachadas', 'Jardinagem e poda']],
    ['Portaria e recepção', ['Portaria', 'Recepção', 'Controle de acesso']],
    ['Manutenção predial', ['Manutenção elétrica', 'Manutenção hidráulica', 'Pintura', 'Alvenaria e pequenas reformas', 'Serralheria', 'Marcenaria', 'Ar-condicionado e refrigeração']],
    ['Manutenção industrial', ['Manutenção mecânica de máquinas', 'Manutenção elétrica industrial', 'Solda', 'Caldeiraria', 'Lubrificação']],
    ['Produção e logística', ['Mão de obra de produção', 'Carga e descarga', 'Empilhadeira', 'Separação e embalagem', 'Fretes e transporte']],
    ['Tecnologia', ['Suporte de informática', 'Redes e cabeamento', 'Desenvolvimento de sistemas', 'Câmeras e alarmes']],
    ['Escritório e gestão', ['Contabilidade', 'Departamento pessoal', 'Assessoria jurídica', 'Consultoria', 'Design e marketing']],
    ['Segurança e saúde', ['Segurança do trabalho', 'Treinamentos de NR', 'Brigada de incêndio', 'Exames ocupacionais']],
    ['Eventos e alimentação', ['Buffet e alimentação', 'Montagem de eventos', 'Fotografia e vídeo']]
  ];
  const slug = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const GERAIS = []; SERV.forEach(([cat, xs]) => xs.forEach(n => GERAIS.push({ id: slug(n), nome: n, cat })));
  const CATS = SERV.map(x => x[0]);
  const EDITA = ['admin', 'solicitante', 'operacional'];       /* cadastram os serviços específicos */
  const OFERTA = ['admin', 'operacional'];                       /* marcam o que a prestadora oferece */
  const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  let esp = [], oferta = null, pronto = false, F = { q: '', cat: '' };
  const cargo = ctx => ctx.contexto.acesso && ctx.contexto.acesso.cargo;
  const pode = (ctx, l) => !ctx.soLeitura && l.includes(cargo(ctx));
  const tipo = ctx => (ctx.contexto.empresa || {}).tipo || 'contratante';
  const contrata = ctx => tipo(ctx) !== 'prestador';
  const presta = ctx => tipo(ctx) !== 'contratante';
  const quem = ctx => (ctx.sessao.perfil && ctx.sessao.perfil.nome) || ctx.sessao.usuario.email;
  function log(b, ctx, acao, texto, ref) {
    b.set(CW.fb.db().collection('log').doc(), { em: CW.fb.agora(), uid: ctx.sessao.usuario.uid, quem: quem(ctx), empresaId: ctx.contexto.empresaId, acao, texto, ref: ref || '' });
  }
  const casa = (t, q) => { const w = norm(q).split(/\s+/).filter(Boolean); const n = norm(t); return w.every(x => n.includes(x)); };

  async function carregar(ctx) {
    const db = CW.fb.db(), emp = ctx.contexto.empresaId;
    try { esp = CW.fb.lista(await db.collection('servicosesp').where('empresaId', '==', emp).get()).filter(x => !x.removido); } catch (e) { esp = []; }
    try { oferta = CW.fb.dados(await db.doc('ofertaserv/' + emp).get()); } catch (e) { oferta = null; }
    pronto = true;
  }

  function desenhar(el, ctx) {
    const { esc, ic } = U();
    if (!pronto) { el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Carregando o catálogo…</span></div></div>`; carregar(ctx).then(() => { if (CW.app.atual() && CW.app.atual().modulo === 'servicos') desenhar(el, ctx); }); return; }
    const of = new Set((oferta && oferta.gerais) || []), ofEsp = (oferta && oferta.especificos) || [];
    const podeOf = presta(ctx) && pode(ctx, OFERTA), podeEd = pode(ctx, EDITA), podePedir = contrata(ctx) && pode(ctx, ['admin', 'solicitante']);
    document.getElementById('acoes').innerHTML = podeEd ? `<button class="btn" id="sv-novo">${ic('plus')}Serviço específico</button>` : '';
    const gs = GERAIS.filter(g => (!F.cat || g.cat === F.cat) && (!F.q || casa(g.nome + ' ' + g.cat, F.q)));
    const es = esp.filter(x => (!F.cat || x.cat === F.cat) && (!F.q || casa(x.nome + ' ' + (x.cat || '') + ' ' + (x.desc || ''), F.q)));
    const cartao = (id, nome, sub, esp1) => `<div class="sv-it" data-sv="${esc(id)}"><div class="t"><strong>${esc(nome)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</div>
      <div class="a">${podePedir ? `<button class="btn sm" data-pedir="${esc(nome)}">${ic('send')}Pedir</button>` : ''}
        ${!esp1 ? `<button class="btn sec sm" data-quem="${esc(id)}" data-nome="${esc(nome)}">${ic('users')}Quem faz</button>` : ''}
        ${!esp1 && podeOf ? `<label class="check sv-of"><input type="checkbox" data-of="${esc(id)}" ${of.has(id) ? 'checked' : ''}><span>Oferecemos</span></label>` : ''}
        ${esp1 && podeEd ? `<button class="iconbtn sm" data-ed="${esc(id)}" aria-label="Mudar ${esc(nome)}" title="Mudar">${ic('edit')}</button>` : ''}</div></div>`;
    const porCat = CATS.filter(c => gs.some(g => g.cat === c)).map(c => `<div class="sv-cat"><div class="fsec">${esc(c)}</div><div class="sv-grade">${gs.filter(g => g.cat === c).map(g => cartao(g.id, g.nome, '', false)).join('')}</div></div>`).join('');
    el.innerHTML = `
      <div class="banner info" id="sv-ajuda">${ic('grid')}<span><strong>${contrata(ctx) && presta(ctx) ? 'Peça e ofereça serviços' : contrata(ctx) ? 'Escolha o serviço que precisa' : 'Marque os serviços que sua empresa faz'}</strong>${contrata(ctx) ? 'Serviços gerais (a lista do Conectwork) e os específicos que a sua empresa cadastra. "Pedir" abre a ordem de serviço com o nome do serviço; "Quem faz" mostra quem oferece na rede. ' : ''}${presta(ctx) ? 'Marque "Oferecemos" nos serviços que sua empresa presta: assim ela aparece em "Quem faz" para quem contrata.' : ''}</span></div>
      <section class="card" id="sv-filtro" style="margin:14px 0"><div class="card-b" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <label class="f" style="flex:1 1 240px;margin:0"><input id="sv-q" type="search" aria-label="Procurar serviço" placeholder="Procurar serviço (ex.: elétrica, limpeza)" value="${esc(F.q)}"></label>
        <div class="filters" style="flex-wrap:wrap"><button class="chip" data-cat="" aria-pressed="${!F.cat}">Todas</button>${CATS.map(c => `<button class="chip" data-cat="${esc(c)}" aria-pressed="${F.cat === c}">${esc(c)}</button>`).join('')}</div></div></section>
      <section class="card" id="sv-esp" style="margin-bottom:14px"><div class="card-h"><span class="ic">${ic('star')}</span><h3>Serviços específicos da empresa</h3><span class="count">${esp.length}</span></div><div class="card-b">
        ${es.length ? `<div class="sv-grade">${es.map(x => cartao(x._id, x.nome, [x.cat, x.desc].filter(Boolean).join(' · '), true)).join('')}</div>`
          : `<p class="hint" style="margin:0">${esp.length ? 'Nenhum serviço específico com esse filtro.' : 'Sua empresa ainda não cadastrou serviços específicos. Use para o que não está na lista geral (ex.: "Calibração da balança da linha 2").'}</p>`}
        ${presta(ctx) ? `<div class="fsec" style="margin-top:16px">Outros serviços que oferecemos</div><p class="hint" style="margin:0 0 8px;font-size:12.5px">O que sua empresa faz e não está na lista geral. Aparece para quem procura na rede.</p>
          <div id="sv-ofesp">${ofEsp.length ? ofEsp.map((t, i) => `<span class="chip" style="margin:0 6px 6px 0">${esc(t)}${podeOf ? ` <button class="linkbtn" data-tiraesp="${i}" aria-label="Tirar ${esc(t)}">×</button>` : ''}</span>`).join('') : '<span class="hint">Nenhum.</span>'}</div>
          ${podeOf ? `<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><input id="sv-ofesp-in" maxlength="80" placeholder="Ex.: Pintura epóxi de piso industrial" style="flex:1 1 220px"><button class="btn sec sm" id="sv-ofesp-add">${ic('plus')}Acrescentar</button></div>` : ''}` : ''}
      </div></section>
      <section class="card" id="sv-gerais"><div class="card-h"><span class="ic">${ic('grid')}</span><h3>Serviços gerais</h3><span class="count">${gs.length}</span>${presta(ctx) ? `<span class="hint" style="margin-left:auto;font-size:12.5px">${of.size} marcado${of.size === 1 ? '' : 's'} como oferecido${of.size === 1 ? '' : 's'}</span>` : ''}</div><div class="card-b">
        ${porCat || '<p class="hint" style="margin:0">Nenhum serviço com esse filtro.</p>'}</div></section>`;
    ligar(el, ctx);
  }

  function ligar(el, ctx) {
    const q = document.getElementById('sv-q');
    if (q) q.oninput = () => { F.q = q.value; const p = q.selectionStart; desenhar(el, ctx); const n = document.getElementById('sv-q'); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (e) {} } };
    el.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { F.cat = b.dataset.cat; desenhar(el, ctx); });
    const nv = document.getElementById('sv-novo'); if (nv) nv.onclick = () => editar(el, ctx, null);
    el.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => editar(el, ctx, esp.find(x => x._id === b.dataset.ed)));
    el.querySelectorAll('[data-pedir]').forEach(b => b.onclick = () => { if (CW.ordens && CW.ordens.nova) CW.ordens.nova(ctx, null, { titulo: b.dataset.pedir }); });
    el.querySelectorAll('[data-quem]').forEach(b => b.onclick = () => quemFaz(ctx, b.dataset.quem, b.dataset.nome));
    el.querySelectorAll('[data-of]').forEach(c => c.onchange = () => gravarOferta(el, ctx, c.dataset.of, c.checked));
    const add = document.getElementById('sv-ofesp-add');
    if (add) add.onclick = () => { const i = document.getElementById('sv-ofesp-in'), t = i.value.trim().replace(/\s+/g, ' ');
      if (t.length < 3) { U().toast('Escreva o serviço (pelo menos 3 letras).', 'erro'); return; }
      const ofEsp = (oferta && oferta.especificos) || [];
      if (ofEsp.length >= 20) { U().toast('Até 20 serviços por aqui. Tire algum para acrescentar outro.', 'erro'); return; }
      gravarOferta(el, ctx, null, null, ofEsp.concat([t])); };
    el.querySelectorAll('[data-tiraesp]').forEach(b => b.onclick = () => { const ofEsp = ((oferta && oferta.especificos) || []).slice(); ofEsp.splice(+b.dataset.tiraesp, 1); gravarOferta(el, ctx, null, null, ofEsp); });
  }

  async function gravarOferta(el, ctx, id, on, especificos) {
    const db = CW.fb.db(), emp = ctx.contexto.empresaId, g = new Set((oferta && oferta.gerais) || []);
    if (id) { if (on) g.add(id); else g.delete(id); }
    const novo = { empresaId: emp, gerais: [...g], especificos: especificos || (oferta && oferta.especificos) || [], atualizadoPor: ctx.sessao.usuario.uid, atualizadoEm: CW.fb.agora() };
    const nomeG = id ? (GERAIS.find(x => x.id === id) || {}).nome : '';
    const b = db.batch(); b.set(db.doc('ofertaserv/' + emp), novo);
    log(b, ctx, 'servicos.oferta', id ? `${on ? 'Passou a oferecer' : 'Deixou de oferecer'}: ${nomeG}.` : `Outros serviços oferecidos: ${(novo.especificos || []).join(', ') || 'nenhum'}.`, emp);
    try { await b.commit(); oferta = Object.assign({}, novo, { atualizadoEm: new Date() }); U().toast(id ? (on ? 'Marcado como oferecido.' : 'Tirado dos oferecidos.') : 'Serviços oferecidos atualizados.'); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); }
    desenhar(el, ctx);
  }

  async function editar(el, ctx, x) {
    const { esc } = U(); let r = null;
    await U().dialogo({ titulo: x ? 'Mudar serviço específico' : 'Novo serviço específico', sub: 'Serviço que a sua empresa contrata e não está na lista geral.',
      corpo: `<div class="fgrid"><label class="f c12"><span>Nome do serviço</span><input id="se-nome" maxlength="80" value="${esc(x ? x.nome : '')}" placeholder="Ex.: Calibração da balança da linha 2"></label>
        <label class="f c12"><span>Categoria</span><select id="se-cat"><option value="">Selecione</option>${CATS.concat(['Outra']).map(c => `<option ${x && x.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label class="f c12"><span>Descrição <i>(opcional)</i></span><textarea id="se-desc" rows="3" maxlength="300" placeholder="O que esse serviço inclui.">${esc(x ? x.desc || '' : '')}</textarea></label><p class="err c12" id="se-erro"></p></div>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }].concat(x ? [{ texto: 'Tirar do catálogo', valor: 'x', classe: 'dangerous', antes: () => { r = { tirar: true }; return true; } }] : [])
        .concat([{ texto: x ? 'Guardar' : 'Cadastrar', valor: 'ok', antes: d => { const n = d.querySelector('#se-nome').value.trim().replace(/\s+/g, ' '), c = d.querySelector('#se-cat').value, ds = d.querySelector('#se-desc').value.trim();
          if (n.length < 3) { d.querySelector('#se-erro').textContent = 'Informe o nome do serviço (pelo menos 3 letras).'; return false; }
          if (!c) { d.querySelector('#se-erro').textContent = 'Escolha a categoria.'; return false; }
          if (esp.some(y => (!x || y._id !== x._id) && norm(y.nome) === norm(n))) { d.querySelector('#se-erro').textContent = 'Já existe um serviço específico com esse nome.'; return false; }
          r = { nome: n, cat: c, desc: ds }; return true; } }]) });
    if (!r) return;
    const db = CW.fb.db(), b = db.batch(), agora = CW.fb.agora;
    if (x && r.tirar) { b.update(db.doc('servicosesp/' + x._id), { removido: true, atualizadoEm: agora() }); log(b, ctx, 'servicos.tirar', `Serviço específico tirado do catálogo: ${x.nome}.`, x._id); }
    else if (x) { b.update(db.doc('servicosesp/' + x._id), { nome: r.nome, cat: r.cat, desc: r.desc, atualizadoEm: agora() }); log(b, ctx, 'servicos.mudar', `Serviço específico mudado: ${r.nome}.`, x._id); }
    else { const ref = db.collection('servicosesp').doc(); b.set(ref, { empresaId: ctx.contexto.empresaId, nome: r.nome, cat: r.cat, desc: r.desc, removido: false, criadoPor: ctx.sessao.usuario.uid, criadoPorNome: quem(ctx), criadoEm: agora(), atualizadoEm: agora() });
      log(b, ctx, 'servicos.criar', `Serviço específico cadastrado: ${r.nome} (${r.cat}).`, ref.id); }
    try { await b.commit(); U().toast(r.tirar ? 'Serviço tirado do catálogo.' : x ? 'Serviço guardado.' : 'Serviço cadastrado.'); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); }
    pronto = false; desenhar(el, ctx);
  }

  /* quem oferece o serviço na rede: empresas aprovadas que marcaram o serviço (uma consulta só, ao tocar) */
  async function quemFaz(ctx, id, nome) {
    const { esc, ic } = U(), db = CW.fb.db();
    let xs = [];
    try {
      const ofs = CW.fb.lista(await db.collection('ofertaserv').where('gerais', 'array-contains', id).limit(30).get()).filter(o => o.empresaId !== ctx.contexto.empresaId);
      const emps = await Promise.all(ofs.map(o => db.doc('empresas/' + o.empresaId).get().then(s => CW.fb.dados(s)).catch(() => null)));
      xs = emps.map((e, i) => e && e.status === 'aprovado' ? Object.assign({ _id: ofs[i].empresaId }, e) : null).filter(Boolean);
    } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); return; }
    await U().dialogo({ titulo: 'Quem faz: ' + nome, sub: 'Empresas aprovadas da rede que oferecem este serviço.',
      corpo: xs.length ? `<ul class="sv-quem" id="sv-quem">${xs.map(e => `<li>${U().avatar(e.nome || e.razao, '', e._id)}<div><strong>${esc(e.nome || e.razao)}</strong><small>${esc([e.cidade, e.uf].filter(Boolean).join('/') || '')}</small></div></li>`).join('')}</ul>
        <p class="hint" style="margin:12px 0 0;font-size:12.5px">Para contratar, faça o contrato com a empresa em Contratos.</p>`
        : `<p style="margin:0" id="sv-quem-vazio">${ic('users')} Nenhuma empresa da rede marcou este serviço ainda.</p>` });
  }

  CW.registrarModulo({
    id: 'servicos', nome: 'Catálogo de serviços', nomeCurto: 'Serviços', icone: 'grid', ordem: 19,
    para: ['empresa'],   /* cargos: admin, solicitante, aprovador e operacional (js/permissoes.js) */
    iniciar() { pronto = false; esp = []; oferta = null; },
    telas: {
      lista: { nome: 'Catálogo de serviços', sub: 'Serviços gerais e os específicos da sua empresa: peça, veja quem faz e marque o que vocês oferecem.', render: (el, ctx) => desenhar(el, ctx) }
    }
  });
  CW.servicos = { GERAIS, CATS, slug };
})();
