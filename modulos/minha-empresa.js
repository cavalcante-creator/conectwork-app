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
      <section class="card" style="margin-bottom:22px"><div class="card-b profile">${avatar(e.nome || e.razao, 'lg')}<div class="t"><h2 id="me-nome">${esc(e.nome || e.razao)}</h2>
        <div class="meta">${CW.sessao.pillStatus(e.status)}<span class="tag gray">${esc((CW.cadastro && CW.cadastro.TIPOS[e.tipo]) || '')}</span><span class="tag gray">${esc(e.cnpj || '')}</span>${e.plano ? `<span class="tag" id="me-plano">Plano ${esc(P.nomePlano(e.plano))}</span>` : ''}</div></div></div></section>
      <div class="grid-main"><div class="stack">
        ${sec('Empresa', 'building', linha('Razão social', e.razao, 1) + linha('Nome fantasia', e.nome) + linha('CNPJ', e.cnpj) + linha('Data de abertura', formatarData(d.abertura)) + linha('Porte', d.porte) + linha('Regime', d.regime) + linha('CNAE principal', d.cnae, 1) + linha('Inscrição municipal', d.im) + linha('Inscrição estadual', d.ie || 'Isenta') + linha('Cliente desde', formatarData(e.avaliadoEm)) + linha('Protocolo', e.protocolo), 'me-empresa')}
        ${sec('Endereço', 'home', linha('Endereço', [en.logradouro, en.numero].filter(Boolean).join(', ') + (en.compl ? ' · ' + en.compl : ''), 1) + linha('Bairro', en.bairro) + linha('CEP', en.cep) + linha('Cidade', [en.cidade, en.uf].filter(Boolean).join('/'), 1))}
        ${sec('Responsável', 'user', linha('Nome', r.nome, 1) + linha('Cargo', r.cargo) + linha('E-mail', r.email) + linha('E-mail financeiro', r.emailFin, 1))}
        ${verBanco ? sec('Dados bancários', 'bank', linha('Banco', bk.banco, 1) + linha('Agência', bk.agencia) + linha('Conta', [bk.conta, bk.tipoConta].filter(Boolean).join(' · ')) + linha('Pix', [bk.pixTipo, bk.pix].filter(Boolean).join(': '), 1), 'me-banco') : ''}
      </div><div class="stack">
        <section class="card" id="me-modulos"><div class="card-h"><span class="ic">${ic('grid')}</span><h3>Plano e módulos</h3></div>
          <div class="card-b" style="padding-bottom:6px"><dl class="dl"><div><dt>Plano</dt><dd style="font-size:18px">${esc(P.nomePlano(e.plano) || '—')}</dd></div><div><dt>Módulos contratados</dt><dd>${(e.modulos || []).length}</dd></div></dl></div>
          ${mods}<p class="hint" style="margin:0;padding:12px 20px;font-size:12px;border-top:1px solid var(--line)">Os módulos são liberados pela equipe Conectwork conforme o plano. A receita do Conectwork é só a mensalidade: não há comissão sobre os serviços.</p></section>
        <section class="card" id="me-docs"><div class="card-h"><span class="ic">${ic('file')}</span><h3>Documentos</h3></div>${docs}</section>
        <div class="banner info">${ic('alert')}<span><strong>Precisa mudar algum dado?</strong>Fale com a equipe Conectwork. Dados cadastrais e bancários mudados passam por nova conferência antes de valer.</span></div>
      </div></div>`;
  }

  CW.registrarModulo({
    id: 'empresa', nome: 'Minha empresa', nomeCurto: 'Empresa', icone: 'building', ordem: 70,
    para: ['empresa'],
    telas: { dados: { nome: 'Minha empresa', sub: 'Dados aprovados, documentos, plano e módulos contratados.', render } }
  });
})();
