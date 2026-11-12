/* Conectwork · Cursos dos parceiros (12/11/2026, reunião: "campo para parceria ofertar cursos e uma porcentagem para a Conectwork").
   Escolha da usuária: por enquanto SÓ REGISTRAR a porcentagem (a cobrança decide-se depois; o dinheiro do curso não passa
   pelo Conectwork: a inscrição é no site do parceiro).
   - Parceiro = empresa com o módulo "cursos" ligado pela equipe Conectwork. Publica cursos (cursos/{id}).
   - A equipe Conectwork registra a porcentagem combinada com cada parceiro (parcerias/{empresaId}: pctBp = % × 100).
   - Todos da rede veem os cursos publicados; "Quero me inscrever" abre o site do parceiro e conta um interessado
     (cursos/{id}/interesses/{uid}: só uid, empresa e data; o parceiro vê quantos, não quem).
   - Nada se apaga (removido:true) e tudo vai para o histórico. */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const MOD = ['online', 'presencial', 'hibrido'], MOD_T = { online: 'On-line', presencial: 'Presencial', hibrido: 'Híbrido' };
  const PUB = { todos: 'Empresas e MEIs', mei: 'MEIs e profissionais', empresas: 'Empresas' };
  let lista = [], meus = [], parc = null, parceiros = [], pronto = false, aba = 'ver';

  const quem = ctx => (ctx.sessao.perfil && ctx.sessao.perfil.nome) || ctx.sessao.usuario.email;
  const master = ctx => ctx.contexto.tipo === 'master';
  const ehParceiro = ctx => !master(ctx) && ((ctx.contexto.empresa || {}).modulos || []).includes('cursos');
  const podeEd = ctx => ehParceiro(ctx) && !ctx.soLeitura && (ctx.contexto.acesso || {}).cargo === 'admin';
  const brl = c => c ? U().formatarDinheiro(c) : 'Gratuito';
  const pctTxt = bp => (bp / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
  function log(b, ctx, acao, texto, ref) {
    b.set(CW.fb.db().collection('log').doc(), { em: CW.fb.agora(), uid: ctx.sessao.usuario.uid, quem: quem(ctx), empresaId: master(ctx) ? 'master' : ctx.contexto.empresaId, acao, texto, ref: ref || '' });
  }

  async function carregar(ctx) {
    const db = CW.fb.db();
    try { lista = CW.fb.lista(await db.collection('cursos').where('status', '==', 'publicado').where('removido', '==', false).limit(100).get()); } catch (e) { lista = []; }
    if (ehParceiro(ctx)) {
      const emp = ctx.contexto.empresaId;
      try { meus = CW.fb.lista(await db.collection('cursos').where('empresaId', '==', emp).get()).filter(x => !x.removido); } catch (e) { meus = []; }
      try { parc = CW.fb.dados(await db.doc('parcerias/' + emp).get()); } catch (e) { parc = null; }
      await Promise.all(meus.map(async x => { try { x._int = (await db.collection('cursos/' + x._id + '/interesses').get()).size; } catch (e) { x._int = null; } }));
    }
    if (master(ctx)) {
      try { parceiros = CW.fb.lista(await db.collection('empresas').where('modulos', 'array-contains', 'cursos').get()); } catch (e) { parceiros = []; }
      const ps = await Promise.all(parceiros.map(p => db.doc('parcerias/' + p._id).get().then(s => CW.fb.dados(s)).catch(() => null)));
      parceiros.forEach((p, i) => { p._parc = ps[i]; });
      try { meus = CW.fb.lista(await db.collection('cursos').get()).filter(x => !x.removido); } catch (e) { meus = []; }
      await Promise.all(meus.map(async x => { try { x._int = (await db.collection('cursos/' + x._id + '/interesses').get()).size; } catch (e) { x._int = null; } }));
    }
    pronto = true;
  }

  function cardCurso(x, ctx, gestao) {
    const { esc, ic } = U();
    const info = [MOD_T[x.modalidade], x.modalidade !== 'online' && x.cidade ? x.cidade : '', x.cargaHoras ? x.cargaHoras + ' h' : '', x.inicio ? 'início ' + U().formatarData(x.inicio) : ''].filter(Boolean).join(' · ');
    return `<article class="cu-it" data-curso="${esc(x._id)}"><div class="cu-top"><span class="pill ${x.status === 'publicado' ? 'ok' : 'warn'}">${x.status === 'publicado' ? (gestao ? 'Publicado' : esc(PUB[x.publico] || '')) : 'Pausado'}</span><b class="cu-preco">${esc(brl(x.precoCentavos))}</b></div>
      <h4>${esc(x.titulo)}</h4><small class="cu-par">${esc(x.parceiroNome || '')}</small>
      ${x.desc ? `<p>${esc(x.desc)}</p>` : ''}<small class="hint">${esc(info)}</small>
      <div class="cu-a">${gestao ? `<span class="hint" style="font-size:12.5px">${x._int == null ? '' : x._int + ' interessado' + (x._int === 1 ? '' : 's')}</span>${podeEd(ctx) ? `<button class="btn sec sm" data-ed="${esc(x._id)}">${ic('edit')}Mudar</button>` : ''}`
        : `<button class="btn sm" data-inscr="${esc(x._id)}">${ic('send')}Quero me inscrever</button>`}</div></article>`;
  }

  function desenhar(el, ctx) {
    const { esc, ic } = U();
    if (!pronto) { el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Carregando os cursos…</span></div></div>`; carregar(ctx).then(() => { if (CW.app.atual() && CW.app.atual().modulo === 'cursos') desenhar(el, ctx); }); return; }
    document.getElementById('acoes').innerHTML = podeEd(ctx) ? `<button class="btn" id="cu-novo">${ic('plus')}Publicar curso</button>` : '';
    if (master(ctx)) { desenharMaster(el, ctx); return; }
    const abas = ehParceiro(ctx) ? `<div class="filters" style="margin-bottom:14px"><button class="chip" data-aba="ver" aria-pressed="${aba === 'ver'}">Cursos da rede</button><button class="chip" data-aba="meus" aria-pressed="${aba === 'meus'}">Meus cursos<b>${meus.length}</b></button></div>` : '';
    if (ehParceiro(ctx) && aba === 'meus') {
      el.innerHTML = `${abas}<section class="card" id="cu-parc" style="margin-bottom:14px"><div class="card-b"><dl class="dl"><div><dt>Porcentagem combinada com o Conectwork</dt><dd id="cu-pct">${parc && parc.pctBp != null ? esc(pctTxt(parc.pctBp)) : 'Ainda não registrada'}</dd></div>
          <div class="full"><dt>Como funciona</dt><dd>A pessoa se inscreve e paga no seu site; o dinheiro não passa pelo Conectwork. A porcentagem fica registrada aqui${parc && parc.obs ? ' · ' + esc(parc.obs) : ''}.</dd></div></dl></div></section>
        <section class="card" id="cu-meus"><div class="card-h"><span class="ic">${ic('star')}</span><h3>Meus cursos</h3><span class="count">${meus.length}</span></div><div class="card-b">
          ${meus.length ? `<div class="cu-grade">${meus.map(x => cardCurso(x, ctx, true)).join('')}</div>` : `<div class="empty"><div class="ic">${ic('star')}</div><strong>Nenhum curso publicado.</strong><span>Publique um curso para as empresas e os profissionais da rede.</span></div>`}</div></section>`;
    } else {
      el.innerHTML = `${abas}<div class="banner info" id="cu-ajuda">${ic('star')}<span><strong>Cursos dos parceiros do Conectwork</strong>A inscrição e o pagamento são feitos no site de quem oferece o curso.</span></div>
        <section class="card" id="cu-lista" style="margin-top:14px"><div class="card-h"><span class="ic">${ic('star')}</span><h3>Cursos abertos</h3><span class="count">${lista.length}</span></div><div class="card-b">
          ${lista.length ? `<div class="cu-grade">${lista.map(x => cardCurso(x, ctx, false)).join('')}</div>` : `<div class="empty"><div class="ic">${ic('star')}</div><strong>Nenhum curso aberto agora.</strong><span>Quando um parceiro publicar um curso, ele aparece aqui.</span></div>`}</div></section>`;
    }
    el.querySelectorAll('[data-aba]').forEach(b => b.onclick = () => { aba = b.dataset.aba; desenhar(el, ctx); });
    const nv = document.getElementById('cu-novo'); if (nv) nv.onclick = () => editar(el, ctx, null);
    el.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => editar(el, ctx, meus.find(x => x._id === b.dataset.ed)));
    el.querySelectorAll('[data-inscr]').forEach(b => b.onclick = () => inscrever(ctx, lista.find(x => x._id === b.dataset.inscr)));
  }

  function desenharMaster(el, ctx) {
    const { esc, ic } = U();
    el.innerHTML = `<div class="banner info">${ic('star')}<span><strong>Cursos dos parceiros</strong>Parceiro = empresa com o módulo "Cursos para a rede" ligado (em Cadastros). Registre aqui a porcentagem combinada: por enquanto é só o registro, sem cobrança.</span></div>
      <section class="card" id="cu-parceiros" style="margin-top:14px"><div class="card-h"><span class="ic">${ic('handshake')}</span><h3>Parceiros</h3><span class="count">${parceiros.length}</span></div>
        ${parceiros.length ? `<div class="scroll"><table class="resp"><thead><tr><th>Parceiro</th><th class="r">Porcentagem</th><th class="r">Cursos</th><th class="r">Interessados</th><th></th></tr></thead><tbody>
          ${parceiros.map(p => { const cs = meus.filter(x => x.empresaId === p._id), ni = cs.reduce((a, x) => a + (x._int || 0), 0);
            return `<tr><td class="m-full"><strong>${esc(p.nome || p.razao)}</strong></td><td class="r" data-r="Porcentagem">${p._parc && p._parc.pctBp != null ? esc(pctTxt(p._parc.pctBp)) : '<span class="hint">não registrada</span>'}</td>
              <td class="r" data-r="Cursos">${cs.length}</td><td class="r" data-r="Interessados">${ni}</td><td class="r"><button class="btn sec sm" data-pct="${esc(p._id)}">${ic('edit')}Porcentagem</button></td></tr>`; }).join('')}</tbody></table></div>`
          : `<div class="empty"><div class="ic">${ic('handshake')}</div><strong>Nenhum parceiro ainda.</strong><span>Ligue o módulo "Cursos para a rede" na empresa parceira, em Cadastros.</span></div>`}</section>
      <section class="card" id="cu-todos" style="margin-top:14px"><div class="card-h"><span class="ic">${ic('star')}</span><h3>Cursos publicados</h3><span class="count">${meus.length}</span></div><div class="card-b">
        ${meus.length ? `<div class="cu-grade">${meus.map(x => cardCurso(x, ctx, true)).join('')}</div>` : '<p class="hint" style="margin:0">Nenhum curso ainda.</p>'}</div></section>`;
    el.querySelectorAll('[data-pct]').forEach(b => b.onclick = () => porcentagem(el, ctx, parceiros.find(p => p._id === b.dataset.pct)));
  }

  async function porcentagem(el, ctx, p) {
    const { esc } = U(); let r = null; const at = p._parc || {};
    await U().dialogo({ titulo: 'Porcentagem do Conectwork', sub: `${p.nome || p.razao} · por enquanto só o registro, sem cobrança.`,
      corpo: `<div class="fgrid"><label class="f c6"><span>Porcentagem combinada (%)</span><input id="pc-v" inputmode="decimal" value="${at.pctBp != null ? esc(String(at.pctBp / 100).replace('.', ',')) : ''}" placeholder="Ex.: 10"></label>
        <label class="f c12"><span>Observação <i>(opcional)</i></span><input id="pc-obs" maxlength="200" value="${esc(at.obs || '')}" placeholder="Ex.: Sobre o valor de cada inscrição, combinado em 12/11."></label><p class="err c12" id="pc-erro"></p></div>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Registrar', valor: 'ok', antes: d => { const v = parseFloat(String(d.querySelector('#pc-v').value).replace(',', '.'));
        if (!(v >= 0 && v <= 100)) { d.querySelector('#pc-erro').textContent = 'Informe a porcentagem entre 0 e 100.'; return false; }
        r = { bp: Math.round(v * 100), obs: d.querySelector('#pc-obs').value.trim() }; return true; } }] });
    if (!r) return;
    const db = CW.fb.db(), b = db.batch();
    b.set(db.doc('parcerias/' + p._id), { empresaId: p._id, pctBp: r.bp, obs: r.obs, em: CW.fb.agora(), por: ctx.sessao.usuario.uid, porNome: quem(ctx) });
    log(b, ctx, 'cursos.porcentagem', `Porcentagem dos cursos de ${p.nome || p.razao} registrada: ${pctTxt(r.bp)}${r.obs ? ' (' + r.obs + ')' : ''}.`, p._id);
    try { await b.commit(); U().toast('Porcentagem registrada.'); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); }
    pronto = false; desenhar(el, ctx);
  }

  async function editar(el, ctx, x) {
    const { esc, lerDinheiro } = U(); let r = null;
    const sel = (id, o, v) => `<select id="${id}">${Object.keys(o).map(k => `<option value="${k}" ${v === k ? 'selected' : ''}>${esc(o[k])}</option>`).join('')}</select>`;
    await U().dialogo({ titulo: x ? 'Mudar curso' : 'Publicar curso', sub: 'A inscrição e o pagamento são no seu site. O Conectwork mostra o curso para a rede.',
      corpo: `<div class="fgrid">
        <label class="f c12"><span>Nome do curso</span><input id="cu-tit" maxlength="100" value="${esc(x ? x.titulo : '')}" placeholder="Ex.: NR-10 Básico"></label>
        <label class="f c12"><span>Sobre o curso</span><textarea id="cu-desc" rows="3" maxlength="500" placeholder="O que a pessoa aprende e para quem é.">${esc(x ? x.desc || '' : '')}</textarea></label>
        <label class="f c6"><span>Como é</span>${sel('cu-mod', MOD_T, x ? x.modalidade : 'online')}</label>
        <label class="f c6"><span>Cidade <i>(presencial)</i></span><input id="cu-cid" maxlength="80" value="${esc(x ? x.cidade || '' : '')}"></label>
        <label class="f c4"><span>Carga horária (h)</span><input id="cu-ch" inputmode="numeric" maxlength="4" value="${x && x.cargaHoras ? x.cargaHoras : ''}"></label>
        <label class="f c4"><span>Início <i>(opcional)</i></span><input id="cu-ini" type="date" value="${esc(x ? x.inicio || '' : '')}"></label>
        <label class="f c4"><span>Valor <i>(0 = gratuito)</i></span><input id="cu-preco" data-mascara="dinheiro" inputmode="numeric" value="${x && x.precoCentavos ? U().formatarDinheiro(x.precoCentavos).replace(/[^\d,.]/g, '') : ''}" placeholder="0,00"></label>
        <label class="f c12"><span>Para quem</span>${sel('cu-pub', PUB, x ? x.publico : 'todos')}</label>
        <label class="f c12"><span>Site da inscrição</span><input id="cu-link" type="url" inputmode="url" maxlength="300" value="${esc(x ? x.link : '')}" placeholder="https://..."></label>
        <label class="check c12"><input type="checkbox" id="cu-pausa" ${x && x.status === 'pausado' ? 'checked' : ''}> <span>Pausar (some da lista da rede)</span></label>
        <p class="err c12" id="cu-erro"></p></div>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }].concat(x ? [{ texto: 'Tirar o curso', valor: 'x', classe: 'dangerous', antes: () => { r = { tirar: true }; return true; } }] : [])
        .concat([{ texto: x ? 'Guardar' : 'Publicar', valor: 'ok', antes: d => {
          const g = id => d.querySelector('#' + id), er = g('cu-erro'), t = g('cu-tit').value.trim(), link = g('cu-link').value.trim(), ch = parseInt(g('cu-ch').value, 10) || 0;
          if (t.length < 4) { er.textContent = 'Informe o nome do curso.'; return false; }
          if (!/^https:\/\/[^\s.]+\.[^\s]+$/i.test(link)) { er.textContent = 'Informe o site da inscrição, começando com https://'; return false; }
          if (g('cu-mod').value !== 'online' && !g('cu-cid').value.trim()) { er.textContent = 'Informe a cidade do curso presencial.'; return false; }
          if (g('cu-ini').value && !U().validarData(g('cu-ini').value)) { er.textContent = 'Data de início inválida.'; return false; }
          r = { titulo: t, desc: g('cu-desc').value.trim(), modalidade: g('cu-mod').value, cidade: g('cu-cid').value.trim(), cargaHoras: Math.min(ch, 2000), inicio: g('cu-ini').value || '',
            precoCentavos: lerDinheiro(g('cu-preco').value) || 0, publico: g('cu-pub').value, link, status: g('cu-pausa').checked ? 'pausado' : 'publicado' }; return true; } }]),
      aoAbrir: d => U().aplicarMascaras(d) });
    if (!r) return;
    const db = CW.fb.db(), b = db.batch(), agora = CW.fb.agora, emp = ctx.contexto.empresaId, e = ctx.contexto.empresa || {};
    if (x && r.tirar) { b.update(db.doc('cursos/' + x._id), { removido: true, atualizadoEm: agora() }); log(b, ctx, 'cursos.tirar', `Curso tirado: ${x.titulo}.`, x._id); }
    else if (x) { b.update(db.doc('cursos/' + x._id), Object.assign({}, r, { atualizadoEm: agora() })); log(b, ctx, 'cursos.mudar', `Curso mudado: ${r.titulo}${r.status === 'pausado' ? ' (pausado)' : ''}.`, x._id); }
    else { const ref = db.collection('cursos').doc(); b.set(ref, Object.assign({ empresaId: emp, parceiroNome: e.nome || e.razao || '', removido: false, criadoPor: ctx.sessao.usuario.uid, criadoPorNome: quem(ctx), criadoEm: agora(), atualizadoEm: agora() }, r));
      log(b, ctx, 'cursos.publicar', `Curso publicado: ${r.titulo} (${brl(r.precoCentavos)}).`, ref.id); }
    try { await b.commit(); U().toast(r.tirar ? 'Curso tirado.' : x ? 'Curso guardado.' : 'Curso publicado.'); } catch (er) { U().toast(CW.fb.mensagemErro(er), 'erro'); }
    pronto = false; aba = 'meus'; desenhar(el, ctx);
  }

  /* "Quero me inscrever": abre o site do parceiro (janela aberta no toque) e conta um interessado (sem dados da pessoa) */
  async function inscrever(ctx, x) {
    if (!x) return;
    let w = null; try { w = window.open(x.link, '_blank', 'noopener'); } catch (e) {}
    const db = CW.fb.db(), uid = ctx.sessao.usuario.uid;
    try { await db.doc('cursos/' + x._id + '/interesses/' + uid).set({ uid, empresaId: ctx.contexto.empresaId || '', em: CW.fb.agora() }); } catch (e) { /* já marcou antes: não conta de novo */ }
    if (!w) await U().dialogo({ titulo: x.titulo, corpo: `<p style="margin:0">A inscrição é no site de ${U().esc(x.parceiroNome || 'quem oferece o curso')}:</p><p style="margin:8px 0 0"><a href="${U().esc(x.link)}" target="_blank" rel="noopener" id="cu-link-ir">${U().esc(x.link)}</a></p>` });
  }

  CW.registrarModulo({
    id: 'cursos', nome: 'Cursos', icone: 'star', ordem: 62,
    para: ['empresa', 'master'], livre: true, semAprovacao: ctx => (ctx.empresa || {}).status === 'mei',
    iniciar() { pronto = false; lista = []; meus = []; parc = null; parceiros = []; aba = 'ver'; },
    telas: { lista: { nome: 'Cursos', sub: 'Cursos dos parceiros do Conectwork para as empresas e os profissionais da rede.', render: (el, ctx) => desenhar(el, ctx) } }
  });
})();
