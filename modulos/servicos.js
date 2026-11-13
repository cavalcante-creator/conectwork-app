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
  const CIC = { 'Limpeza e conservação': 'home', 'Portaria e recepção': 'lock', 'Manutenção predial': 'building', 'Manutenção industrial': 'bolt', 'Produção e logística': 'inbox',
    'Tecnologia': 'net', 'Escritório e gestão': 'clipboard', 'Segurança e saúde': 'shield', 'Eventos e alimentação': 'users' };
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
    /* 13/11/2026 ("MEI só presta serviço"): quem só presta não cadastra serviço "que a empresa contrata" nem vê "Pedir"/"Quem faz";
       o botão de cima vira "Outro serviço que ofereço" (leva ao campo de "Outros serviços que ofereço") */
    const podeOf = presta(ctx) && pode(ctx, OFERTA), podeEd = contrata(ctx) && pode(ctx, EDITA), podePedir = contrata(ctx) && pode(ctx, ['admin', 'solicitante']);
    document.getElementById('acoes').innerHTML = podeEd ? `<button class="btn" id="sv-novo">${ic('plus')}Serviço específico</button>` : !contrata(ctx) && podeOf ? `<button class="btn" id="sv-novo-of">${ic('plus')}Outro serviço que ofereço</button>` : '';
    const gs = GERAIS.filter(g => (!F.cat || g.cat === F.cat) && (!F.q || casa(g.nome + ' ' + g.cat, F.q)));
    const es = esp.filter(x => (!F.cat || x.cat === F.cat) && (!F.q || casa(x.nome + ' ' + (x.cat || '') + ' ' + (x.desc || ''), F.q)));
    /* visual de 13/11/2026 ("o layout está muito básico"): cabeçalho com resumo e busca, categorias com ícone e quantidade,
       cartão com o ícone da categoria, "Pedir" em destaque, "Quem faz" discreto e "Oferecemos" como etiqueta que liga e desliga */
    const icCat = c => ic(CIC[c] || 'grid'), corCat = c => 'c' + (Math.max(0, CATS.indexOf(c)) % 6);
    const cartao = (id, nome, sub, esp1, cat) => `<div class="sv-it${!esp1 && of.has(id) ? ' oferece' : ''}" data-sv="${esc(id)}">
      <div class="sv-top"><span class="sv-ic ${esp1 ? 'esp' : corCat(cat)}">${esp1 ? ic('star') : icCat(cat)}</span><div class="t"><strong>${esc(nome)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</div>
        ${esp1 && podeEd ? `<button class="iconbtn sm" data-ed="${esc(id)}" aria-label="Mudar ${esc(nome)}" title="Mudar">${ic('edit')}</button>` : ''}
        ${!esp1 && podeOf ? `<label class="sv-of" title="Marque se a sua empresa faz este serviço"><input type="checkbox" data-of="${esc(id)}" ${of.has(id) ? 'checked' : ''}><span>${ic('check')}Oferecemos</span></label>` : ''}</div>
      <div class="a">${podePedir ? `<button class="btn sm" data-pedir="${esc(nome)}">${ic('send')}Pedir</button>` : ''}
        ${!esp1 && contrata(ctx) ? `<button class="sv-quem-bt" data-quem="${esc(id)}" data-nome="${esc(nome)}">${ic('users')}Quem faz</button>` : ''}</div></div>`;
    const porCat = CATS.filter(c => gs.some(g => g.cat === c)).map(c => { const xs = gs.filter(g => g.cat === c), n = xs.filter(g => of.has(g.id)).length;
      return `<div class="sv-cat"><div class="sv-cat-h"><span class="sv-ic sm ${corCat(c)}">${icCat(c)}</span><h4>${esc(c)}</h4><span class="sv-n">${xs.length}</span>${podeOf && n ? `<span class="sv-n of">${n} oferecido${n === 1 ? '' : 's'}</span>` : ''}</div>
        <div class="sv-grade">${xs.map(g => cartao(g.id, g.nome, '', false, c)).join('')}</div></div>`; }).join('');
    const nCat = c => GERAIS.filter(g => g.cat === c).length;
    const frase = contrata(ctx) && presta(ctx) ? 'Peça serviços para a sua empresa e marque os que vocês oferecem na rede.' : contrata(ctx) ? 'Escolha o serviço que precisa: "Pedir" abre a ordem de serviço já com o nome; "Quem faz" mostra as empresas da rede.' : 'Marque os serviços que a sua empresa faz: quem procura na rede encontra vocês.';
    el.innerHTML = `
      <section class="sv-topo" id="sv-filtro">
        <div class="sv-topo-t"><div><h2>Encontre o serviço</h2><p id="sv-ajuda">${esc(frase)}</p></div>
          <div class="sv-res"><span><b>${GERAIS.length}</b>serviços</span><span><b>${CATS.length}</b>categorias</span>${presta(ctx) ? `<span><b>${of.size + ofEsp.length}</b>vocês oferecem</span>` : `<span><b>${esp.length}</b>da empresa</span>`}</div></div>
        <label class="sv-busca">${ic('busca')}<input id="sv-q" type="search" aria-label="Procurar serviço" placeholder="Procurar serviço (ex.: elétrica, limpeza)" value="${esc(F.q)}"></label>
        <div class="sv-chips"><button class="chip" data-cat="" aria-pressed="${!F.cat}">Todas <span>${GERAIS.length}</span></button>${CATS.map(c => `<button class="chip" data-cat="${esc(c)}" aria-pressed="${F.cat === c}">${icCat(c)}${esc(c)} <span>${nCat(c)}</span></button>`).join('')}</div>
      </section>
      <section class="card sv-bloco" id="sv-esp"><div class="card-h"><span class="ic">${ic('star')}</span><h3>${contrata(ctx) ? 'Serviços específicos da empresa' : 'Outros serviços que ofereço'}</h3>${contrata(ctx) ? `<span class="count">${esp.length}</span>` : ''}</div><div class="card-b">
        ${!contrata(ctx) ? '' : es.length ? `<div class="sv-grade">${es.map(x => cartao(x._id, x.nome, [x.cat, x.desc].filter(Boolean).join(' · '), true)).join('')}</div>`
          : `<div class="sv-vazio">${ic('star')}<span>${esp.length ? 'Nenhum serviço específico com esse filtro.' : 'O que a sua empresa contrata e não está na lista geral (ex.: "Calibração da balança da linha 2").'}</span>${podeEd && !esp.length ? `<button class="btn sec sm" id="sv-novo2">${ic('plus')}Cadastrar</button>` : ''}</div>`}
        ${presta(ctx) ? `<div class="sv-ofesp-box${contrata(ctx) ? '' : ' so'}">${contrata(ctx) ? '<div class="fsec">Outros serviços que oferecemos</div>' : ''}<p class="hint" style="margin:0 0 10px;font-size:12.5px">${contrata(ctx) ? '' : 'Escreva o serviço e toque em Acrescentar (ou Enter). '}O que a sua empresa faz e não está na lista geral. Aparece para quem procura na rede.</p>
          <div id="sv-ofesp" class="sv-tags">${ofEsp.length ? ofEsp.map((t, i) => `<span class="sv-tag">${ic('check')}${esc(t)}${podeOf ? ` <button class="linkbtn" data-tiraesp="${i}" aria-label="Tirar ${esc(t)}">×</button>` : ''}</span>`).join('') : '<span class="hint">Nenhum ainda.</span>'}</div>
          ${podeOf ? `<div class="sv-add"><input id="sv-ofesp-in" maxlength="80" placeholder="Ex.: Pintura epóxi de piso industrial"><button class="btn sec sm" id="sv-ofesp-add">${ic('plus')}Acrescentar</button></div>` : ''}</div>` : ''}
      </div></section>
      <section class="sv-bloco" id="sv-gerais"><div class="sv-gerais-h"><h3>Serviços gerais</h3><span class="count">${gs.length}</span>${presta(ctx) ? `<span class="hint" style="margin-left:auto;font-size:12.5px">${of.size} marcado${of.size === 1 ? '' : 's'} como oferecido${of.size === 1 ? '' : 's'}</span>` : ''}</div>
        ${porCat || `<div class="card"><div class="empty"><div class="ic">${ic('busca')}</div><strong>Nenhum serviço com esse filtro.</strong><span>Tente outra palavra ou escolha "Todas".</span></div></div>`}</section>`;
    ligar(el, ctx);
  }

  function ligar(el, ctx) {
    const q = document.getElementById('sv-q');
    if (q) q.oninput = () => { F.q = q.value; const p = q.selectionStart; desenhar(el, ctx); const n = document.getElementById('sv-q'); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (e) {} } };
    el.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { F.cat = b.dataset.cat; desenhar(el, ctx); });
    const nv = document.getElementById('sv-novo'); if (nv) nv.onclick = () => editar(el, ctx, null);
    const nv2 = document.getElementById('sv-novo2'); if (nv2) nv2.onclick = () => editar(el, ctx, null);
    const no = document.getElementById('sv-novo-of'); if (no) no.onclick = () => { const i = document.getElementById('sv-ofesp-in'); if (i) { i.scrollIntoView({ behavior: 'smooth', block: 'center' }); i.focus(); } };
    const inp = document.getElementById('sv-ofesp-in'); if (inp) inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const a = document.getElementById('sv-ofesp-add'); if (a) a.click(); } };
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
