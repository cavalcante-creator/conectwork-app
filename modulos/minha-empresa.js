/* Conectwork · Etapa 1, parte 6: Minha empresa (empresa aprovada).
   Dados aprovados, endereço, responsável, documentos (com a situação da conferência), plano e módulos contratados.
   Dados bancários só para o administrador e o financeiro (LGPD: mostrar só o necessário).
   Mudar dados passa por nova conferência da equipe Conectwork (por enquanto, pelo contato com a equipe). */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;

  async function render(el, ctx) {
    const { esc, ic, avatar, formatarData } = U(), c = ctx.contexto, db = CW.fb.db(), P = CW.permissoes;
    el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Carregando os dados da empresa…</span></div></div>`;
    let e, pv;
    try {
      const [a, b] = await Promise.all([db.doc('empresas/' + c.empresaId).get(), db.doc('empresas/' + c.empresaId + '/privado/cadastro').get()]);
      e = CW.fb.dados(a) || c.empresa; pv = CW.fb.dados(b) || {};
    } catch (err) { el.innerHTML = `<div class="banner danger">${ic('alert')}<span><strong>Não foi possível abrir os dados da empresa.</strong>${esc(CW.fb.mensagemErro(err))}</span></div>`; return; }
    const verBanco = ['admin', 'financeiro'].includes(c.acesso.cargo);
    const d = pv.dados || {}, en = pv.end || {}, r = pv.resp || {}, bk = pv.banco || {};
    const linha = (k, v, cheio) => `<div class="${cheio ? 'full' : ''}"><dt>${k}</dt><dd>${esc(v || '') || '—'}</dd></div>`;
    const sec = (t, i, rows, id) => `<section class="card" ${id ? `id="${id}"` : ''}><div class="card-h"><span class="ic">${ic(i)}</span><h3>${t}</h3></div><div class="card-b"><dl class="dl">${rows}</dl></div></section>`;
    const docs = (CW.cadastro ? CW.cadastro.docsReq({ dados: d, tipo: e.tipo }) : []).map(([k, rot]) => {
      const f = (pv.docs || {})[k], cf = (pv.conferidos || {})[k], ok = !!(cf && f && cf.nome === f.nome);
      return `<div class="docrow ${ok ? 'ok' : ''}"><span class="ic">${ic(ok ? 'check' : 'file')}</span><div class="t"><strong>${esc(rot)}</strong><small>${f ? esc(f.nome) : 'Não enviado'}</small></div>${f ? (ok ? '<span class="pill ok">Conferido</span>' : '<span class="pill info">Em conferência</span>') : ''}</div>`;
    }).join('');
    const mods = P.MODULOS_CONTRATAVEIS.map(m => { const tem = (e.modulos || []).includes(m.id);
      return `<div class="docrow ${tem ? 'ok' : ''}"><span class="ic">${ic(tem ? 'check' : 'clock')}</span><div class="t"><strong>${esc(m.nome)}${m.fase > 1 ? ` <span class="tag gray">fase ${m.fase}</span>` : ''}</strong><small>${esc(m.desc)}</small></div>${tem ? '<span class="pill ok">Contratado</span>' : '<span class="pill info">Disponível</span>'}</div>`; }).join('');
    el.innerHTML = `
      <section class="card" style="margin-bottom:22px"><div class="card-b profile">${avatar(e.nome || e.razao, 'lg', c.empresaId)}<div class="t"><h2 id="me-nome">${esc(e.nome || e.razao)}</h2>
        <div class="meta">${CW.sessao.pillStatus(e.status)}<span class="tag gray">${esc((CW.cadastro && CW.cadastro.TIPOS[e.tipo]) || '')}</span><span class="tag gray">${esc(e.cnpj || '')}</span>${e.plano ? `<span class="tag" id="me-plano">Plano ${esc(P.nomePlano(e.plano))}</span>` : ''}</div></div></div></section>
      <div class="grid-main"><div class="stack">
        ${sec('Empresa', 'building', linha('Razão social', e.razao, 1) + linha('Nome fantasia', e.nome) + linha('CNPJ', e.cnpj) + linha('Data de abertura', formatarData(d.abertura)) + linha('Porte', d.porte) + linha('Regime', d.regime) + linha('CNAE principal', d.cnae, 1) + linha('Inscrição municipal', d.im) + linha('Inscrição estadual', d.ie || 'Isenta') + linha('Cliente desde', formatarData(e.avaliadoEm)) + linha('Protocolo', e.protocolo), 'me-empresa')}
        ${sec('Endereço', 'home', linha('Endereço', [en.logradouro, en.numero].filter(Boolean).join(', ') + (en.compl ? ' · ' + en.compl : ''), 1) + linha('Bairro', en.bairro) + linha('CEP', en.cep) + linha('Cidade', [en.cidade, en.uf].filter(Boolean).join('/'), 1))}
        ${sec('Responsável', 'user', linha('Nome', r.nome, 1) + linha('Cargo', r.cargo) + linha('E-mail', r.email) + linha('E-mail financeiro', r.emailFin, 1))}
        ${verBanco ? sec('Dados bancários', 'bank', linha('Banco', bk.banco, 1) + linha('Agência', bk.agencia) + linha('Conta', [bk.conta, bk.tipoConta].filter(Boolean).join(' · ')) + linha('Pix', [bk.pixTipo, bk.pix].filter(Boolean).join(': '), 1), 'me-banco') : ''}
      </div><div class="stack">
        <section class="card" id="me-logo"><div class="card-h"><span class="ic">${ic('star')}</span><h3>Logo da empresa</h3></div><div class="card-b stack" style="gap:12px">
          <div style="display:flex;align-items:center;gap:14px">${avatar(e.nome || e.razao, 'lg', c.empresaId)}<p class="hint" style="margin:0;font-size:12.5px">Aparece no lugar das iniciais para quem trabalha com a sua empresa no Conectwork. PNG, JPG ou WEBP; de preferência quadrada e com fundo transparente ou branco.</p></div>
          ${c.acesso.cargo === 'admin' && !ctx.soLeitura ? `<div style="display:flex;gap:8px;flex-wrap:wrap"><label class="btn sec sm" style="cursor:pointer;position:relative">${ic('upload')}Enviar logo<input type="file" id="me-logo-arq" accept="image/png,image/jpeg,image/webp" style="position:absolute;opacity:0;width:1px;height:1px"></label>
            <button class="btn ghost sm" id="me-logo-tirar">Tirar a logo</button></div>` : '<p class="hint" style="margin:0;font-size:12.5px">Só o administrador da empresa troca a logo.</p>'}</div></section>
        <section class="card" id="me-modulos"><div class="card-h"><span class="ic">${ic('grid')}</span><h3>Plano e módulos</h3></div>
          <div class="card-b" style="padding-bottom:6px"><dl class="dl"><div><dt>Plano</dt><dd style="font-size:18px">${esc(P.nomePlano(e.plano) || '—')}</dd></div><div><dt>Módulos contratados</dt><dd>${(e.modulos || []).length}</dd></div></dl></div>
          ${mods}<p class="hint" style="margin:0;padding:12px 20px;font-size:12px;border-top:1px solid var(--line)">Os módulos são liberados pela equipe Conectwork conforme o plano. A receita do Conectwork é só a mensalidade: não há comissão sobre os serviços.</p></section>
        ${verBanco ? `<section class="card" id="me-mens"><div class="card-h"><span class="ic">${ic('wallet')}</span><h3>Mensalidade do Conectwork</h3></div><div class="card-b" id="me-mens-b"><p class="hint" style="margin:0">Carregando…</p></div></section>` : ''}
        <section class="card" id="me-docs"><div class="card-h"><span class="ic">${ic('file')}</span><h3>Documentos</h3></div>${docs}</section>
        <div class="banner info">${ic('alert')}<span><strong>Precisa mudar algum dado?</strong>Fale com a equipe Conectwork. Dados cadastrais e bancários mudados passam por nova conferência antes de valer.</span></div>
      </div></div>`;
    if (verBanco) mensalidades(c.empresaId);
    const arq = document.getElementById('me-logo-arq'), tirar = document.getElementById('me-logo-tirar');
    const registra = (b, texto) => b.set(db.collection('log').doc(), { em: CW.fb.agora(), uid: ctx.sessao.usuario.uid, quem: (ctx.sessao.perfil && ctx.sessao.perfil.nome) || ctx.sessao.usuario.email, empresaId: c.empresaId, acao: 'empresa.logo', texto, ref: '' });
    if (arq) arq.onchange = async () => {
      const f = arq.files[0]; if (!f) return;
      try {
        const d = await CW.logos.reduzir(f), b = db.batch();
        b.set(db.doc('logos/' + c.empresaId), { d, nome: f.name.slice(0, 120), em: CW.fb.agora(), por: ctx.sessao.usuario.uid });
        registra(b, 'Logo da empresa trocada.');
        await b.commit(); CW.logos.limpar(c.empresaId); U().toast('Logo guardada.'); render(el, ctx);
      } catch (e) { U().toast(e && e.message && !e.code ? e.message : CW.fb.mensagemErro(e), 'erro'); }
    };
    if (tirar) tirar.onclick = async () => {
      if (!(await U().confirmar('Tirar a logo?', 'Voltam a aparecer as iniciais da empresa.', 'Tirar'))) return;
      const b = db.batch(); b.delete(db.doc('logos/' + c.empresaId)); registra(b, 'Logo da empresa retirada.');
      try { await b.commit(); CW.logos.limpar(c.empresaId); U().toast('Logo retirada.'); CW.app.montar(); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); }
    };
  }

  /* mensalidades do Conectwork desta empresa (só admin e financeiro leem, pelas regras do banco) */
  async function mensalidades(empresaId) {
    const box = document.getElementById('me-mens-b'); if (!box) return;
    const { esc, formatarDinheiro } = U();
    let xs = [];
    try { xs = CW.fb.lista(await CW.fb.db().collection('mensalidades').where('empresaId', '==', empresaId).get()); }
    catch (e) { box.innerHTML = `<p class="hint" style="margin:0">Não foi possível carregar agora.</p>`; return; }
    if (!document.body.contains(box)) return;
    const h = new Date().toISOString().slice(0, 10), br = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
    const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'], nm = c => MES[Number(c.slice(5, 7)) - 1] + '/' + c.slice(0, 4);
    xs.sort((a, b) => b.comp.localeCompare(a.comp));
    box.innerHTML = xs.length ? xs.slice(0, 6).map(m => {
      const st = m.status === 'paga' ? `<span class="pill ok">Paga em ${esc(br(m.pagoNoDia))}</span>` : m.status === 'isenta' ? '<span class="tag gray">Isenta</span>'
        : m.venc < h ? '<span class="pill danger">Atrasada</span>' : `<span class="pill info">Vence em ${esc(br(m.venc))}</span>`;
      return `<div class="docrow"><div class="t"><strong>${esc(nm(m.comp))} · ${esc(formatarDinheiro(m.valorCentavos))}</strong></div>${st}</div>`; }).join('')
      + '<p class="hint" style="margin:10px 0 0;font-size:12px">A mensalidade é paga direto à equipe Conectwork. Dúvidas sobre a cobrança: fale com a equipe.</p>'
      : '<p class="hint" style="margin:0">Nenhuma mensalidade lançada ainda.</p>';
  }

  CW.registrarModulo({
    id: 'empresa', nome: 'Minha empresa', nomeCurto: 'Empresa', icone: 'building', ordem: 70,
    para: ['empresa'],
    telas: { dados: { nome: 'Minha empresa', sub: 'Dados aprovados, documentos, plano e módulos contratados.', render } }
  });
})();
