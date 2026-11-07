/* Conectwork · avisos da equipe Conectwork para a rede.
   - Equipe: publica um aviso (título, texto, tipo, para quem e até quando), edita e tira do ar. Nada se apaga.
   - Empresas: os avisos no ar aparecem no Início (para toda a rede, só para quem contrata ou só para quem presta serviço,
     conforme o uso da empresa). A pessoa pode esconder um aviso no próprio aparelho ("Entendi").
   Tudo grava no histórico (empresaId 'master'). */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const R = () => CW.rede;
  const PARA = { todos: 'Toda a rede', tomadores: 'Quem contrata serviços', prestadores: 'Quem presta serviços' };
  const TIPO = { info: 'Informação', atencao: 'Atenção' };
  const p2 = n => String(n).padStart(2, '0');
  const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
  const noAr = a => a.ativo && (!a.ate || a.ate >= hoje());
  const dataBR = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';

  /* ---------- equipe ---------- */
  function tela(el, ctx) {
    const { esc, ic, formatarData } = U(), r = R();
    if (!r.D.avisos) { r.carregando(el, 'Carregando os avisos…'); return; }
    const xs = r.D.avisos.slice().sort((a, b) => String(b._id).localeCompare(String(a._id)));
    const vivos = xs.filter(noAr), outros = xs.filter(a => !noAr(a));
    document.getElementById('acoes').innerHTML = `<button class="btn" id="av-novo">${ic('plus')}Novo aviso</button>`;
    const item = a => `<div class="av-it ${a.tipo === 'atencao' ? 'warn' : ''}" data-aviso="${esc(a._id)}"><div style="min-width:0;flex:1">
        <strong>${esc(a.titulo)}</strong>${a.texto ? `<p>${esc(a.texto)}</p>` : ''}
        <small class="hint">${esc(PARA[a.para] || '')} · ${esc(TIPO[a.tipo] || '')}${a.ate ? ' · até ' + esc(dataBR(a.ate)) : ' · sem data para sair'} · por ${esc(a.criadoPorNome || '')} em ${esc(formatarData(a.criadoEm) || '')}</small></div>
      <div class="av-bts"><button class="btn sec sm" data-editar="${esc(a._id)}">${ic('edit')}Editar</button>${a.ativo ? `<button class="btn sec sm" data-tirar="${esc(a._id)}">Tirar do ar</button>` : `<button class="btn sec sm" data-voltar="${esc(a._id)}">Pôr no ar de novo</button>`}</div></div>`;
    el.innerHTML = `<section class="card" id="av-vivos" style="margin-bottom:22px"><div class="card-h"><span class="ic">${ic('send')}</span><h3>No ar</h3><span class="count">${vivos.length}</span></div><div class="card-b stack" style="gap:10px">
        ${vivos.length ? vivos.map(item).join('') : '<p class="hint" style="margin:0">Nenhum aviso no ar. Os avisos aparecem no Início das empresas.</p>'}</div></section>
      ${outros.length ? `<section class="card" id="av-outros"><div class="card-h"><span class="ic">${ic('clock')}</span><h3>Fora do ar</h3><span class="count">${outros.length}</span></div><div class="card-b stack" style="gap:10px">${outros.map(item).join('')}</div></section>` : ''}`;
    document.getElementById('av-novo').onclick = () => form(ctx, null);
    el.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => form(ctx, xs.find(a => a._id === b.dataset.editar)));
    const ligar = (sel, ativo) => el.querySelectorAll(sel).forEach(b => b.onclick = async () => {
      const a = xs.find(x => x._id === (b.dataset.tirar || b.dataset.voltar)), db = CW.fb.db(), bt = db.batch();
      const upd = { ativo, atualizadoEm: CW.fb.agora() };
      if (ativo && a.ate && a.ate < hoje()) upd.ate = '';       /* pôr no ar de novo um aviso vencido: sem data para sair */
      bt.update(db.doc('avisos/' + a._id), upd);
      r.log(bt, ctx, 'master', ativo ? 'aviso.voltar' : 'aviso.tirar', `Aviso "${a.titulo}" ${ativo ? 'posto no ar de novo' : 'tirado do ar'}.`, a._id);
      b.disabled = true;
      try { await bt.commit(); U().toast(ativo ? 'Aviso no ar de novo.' : 'Aviso tirado do ar.'); } catch (err) { b.disabled = false; U().toast(CW.fb.mensagemErro(err), 'erro'); }
    });
    ligar('[data-tirar]', false); ligar('[data-voltar]', true);
  }

  function form(ctx, a) {
    const { esc } = U(), r = R(), x = a || { titulo: '', texto: '', tipo: 'info', para: 'todos', ate: '' };
    U().dialogo({ titulo: a ? 'Editar aviso' : 'Novo aviso para a rede', sub: 'Aparece no Início das empresas escolhidas, logo no alto.',
      corpo: `<div class="stack" style="gap:12px">
        <label class="f"><span>Título</span><input id="av-titulo" maxlength="120" value="${esc(x.titulo)}" placeholder="Ex.: Novidade: relatórios do mês em PDF"></label>
        <label class="f"><span>Texto (opcional)</span><textarea id="av-texto" rows="4" maxlength="1000">${esc(x.texto)}</textarea></label>
        <div class="fgrid"><label class="f c6"><span>Para quem</span><select id="av-para">${Object.entries(PARA).map(([k, l]) => `<option value="${k}" ${k === x.para ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
          <label class="f c6"><span>Tipo</span><select id="av-tipo">${Object.entries(TIPO).map(([k, l]) => `<option value="${k}" ${k === x.tipo ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label></div>
        <label class="f"><span>No ar até (opcional)</span><input id="av-ate" data-mascara="data" inputmode="numeric" placeholder="dd/mm/aaaa" value="${esc(x.ate ? dataBR(x.ate) : '')}"><em class="hint">Depois desse dia o aviso sai sozinho do Início das empresas.</em></label>
        <p class="err" id="av-erro" role="alert"></p></div>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: a ? 'Salvar' : 'Publicar', valor: 'ok', antes: d => {
        const er = d.querySelector('#av-erro'), titulo = d.querySelector('#av-titulo').value.trim(), texto = d.querySelector('#av-texto').value.trim(), ateTxt = d.querySelector('#av-ate').value.trim();
        if (titulo.length < 3) { er.textContent = 'Escreva o título do aviso (pelo menos 3 letras).'; return false; }
        const ate = ateTxt ? U().dataISO(ateTxt) : '';
        if (ateTxt && !ate) { er.textContent = 'A data precisa estar no formato dd/mm/aaaa.'; return false; }
        if (ate && ate < hoje()) { er.textContent = 'A data já passou. Escolha hoje ou um dia depois.'; return false; }
        d._v = { titulo, texto, ate, para: d.querySelector('#av-para').value, tipo: d.querySelector('#av-tipo').value }; return true; } }],
      aoAbrir: d => { U().aplicarMascaras(d); d.querySelector('#av-titulo').focus(); window.__avDlg = d; }
    }).then(async v => {
      const d = window.__avDlg; window.__avDlg = null;
      if (v !== 'ok' || !d) return;
      const db = CW.fb.db(), b = db.batch();
      if (a) {
        b.update(db.doc('avisos/' + a._id), Object.assign({}, d._v, { atualizadoEm: CW.fb.agora() }));
        r.log(b, ctx, 'master', 'aviso.editar', `Aviso "${d._v.titulo}" editado.`, a._id);
      } else {
        const ref = db.collection('avisos').doc(Date.now().toString(36).padStart(10, '0') + Math.random().toString(36).slice(2, 6));
        b.set(ref, Object.assign({}, d._v, { ativo: true, criadoEm: CW.fb.agora(), criadoPor: ctx.sessao.usuario.uid, criadoPorNome: r.quemSou(ctx) }));
        r.log(b, ctx, 'master', 'aviso.publicar', `Aviso "${d._v.titulo}" publicado para ${PARA[d._v.para].toLowerCase()}.`, ref.id);
      }
      try { await b.commit(); U().toast(a ? 'Aviso salvo.' : 'Aviso publicado.'); } catch (err) { U().toast(CW.fb.mensagemErro(err), 'erro'); }
    });
  }

  /* ---------- empresas: avisos no Início ---------- */
  const chaveVisto = id => 'cw.aviso.visto.' + id;
  const visto = id => { try { return localStorage.getItem(chaveVisto(id)) === '1'; } catch (e) { return false; } };
  async function bloco(box, ctx) {
    if (!box) return;
    const { esc, ic } = U(), tipo = (ctx.contexto.empresa || {}).tipo;
    let xs = [];
    try { xs = CW.fb.lista(await CW.fb.db().collection('avisos').where('ativo', '==', true).get()); } catch (e) { return; }
    xs = xs.filter(a => noAr(a) && !visto(a._id) && (a.para === 'todos' || (a.para === 'tomadores' && tipo !== 'prestador') || (a.para === 'prestadores' && tipo !== 'contratante')))
      .sort((a, b) => String(b._id).localeCompare(String(a._id)));
    if (!document.body.contains(box)) return;
    box.innerHTML = xs.map(a => `<div class="banner ${a.tipo === 'atencao' ? 'warn' : 'info'} av-ban" data-av="${esc(a._id)}">${ic(a.tipo === 'atencao' ? 'alert' : 'send')}<span><strong>${esc(a.titulo)}</strong>${esc(a.texto || '')}<small class="av-de">Aviso da equipe Conectwork</small></span><button class="btn sec sm" data-visto="${esc(a._id)}">Entendi</button></div>`).join('');
    box.querySelectorAll('[data-visto]').forEach(b => b.onclick = () => { try { localStorage.setItem(chaveVisto(b.dataset.visto), '1'); } catch (e) { /* sem armazenamento */ } b.closest('.av-ban').remove(); });
  }

  CW.avisos = { bloco };
  CW.rede.redesenhar.avisos = (el, ctx) => tela(el, ctx);
  CW.registrarModulo({
    id: 'avisos', nome: 'Avisos para a rede', nomeCurto: 'Avisos', icone: 'send', ordem: 14,
    para: ['master'],
    telas: { lista: { nome: 'Avisos para a rede', sub: 'Recados da equipe Conectwork que aparecem no Início das empresas.', render: (el, ctx) => tela(el, ctx) } }
  });
})();
