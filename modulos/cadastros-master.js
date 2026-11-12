/* Conectwork · Etapa 1, parte 2: análise de cadastros (só a equipe Conectwork).
   Lista por situação (em análise, ajuste pedido, aprovadas, recusadas, todas) e, para cada empresa:
   dados do cadastro, documentos com "Conferido", plano e módulos, e a decisão:
   aprovar (todos os documentos obrigatórios conferidos e plano escolhido), pedir ajuste ou recusar (motivo obrigatório).
   Não existe taxa sobre pagamentos: a receita é a mensalidade do plano (valores a definir).
   Cada ação grava no histórico da empresa (log com empresaId da empresa analisada). */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const P = () => CW.permissoes;
  const C = () => CW.cadastro;

  const CHIPS = [['analise', 'Em análise'], ['pendencia', 'Ajuste pedido'], ['aprovado', 'Aprovadas'], ['basico', 'Falta completar'], ['mei', 'MEI (cadastro rápido)'], ['recusado', 'Recusadas'], ['todos', 'Todas']];
  let filtro = 'analise';
  let empresas = null;                 /* lista viva (onSnapshot) */
  const dig = v => String(v == null ? '' : v).replace(/\D/g, '');

  const nomeEmp = e => e.nome || e.razao || 'Empresa';
  const quemSou = ctx => (ctx.sessao.perfil && ctx.sessao.perfil.nome) || ctx.sessao.usuario.email;
  const conferido = (pv, k) => { const c = (pv.conferidos || {})[k], f = (pv.docs || {})[k]; return !!(c && f && c.nome === f.nome); };
  const trocado = (pv, k) => { const c = (pv.conferidos || {})[k], f = (pv.docs || {})[k]; return !!(c && f && c.nome !== f.nome); };
  const tempo = v => { const d = U().formatarData(v); return d || '—'; };

  /* ---------- lista ---------- */
  function desenharLista(el) {
    const { esc, ic, avatar } = U();
    if (!empresas) { el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Carregando os cadastros…</span></div></div>`; return; }
    const conta = s => s === 'todos' ? empresas.length : empresas.filter(e => e.status === s).length;
    const lista = empresas.filter(e => filtro === 'todos' || e.status === filtro)
      .sort((a, b) => String(b._env || '').localeCompare(String(a._env || '')));
    const linhas = lista.map(e => `<tr class="click" data-abrir="${esc(e._id)}" tabindex="0">
        <td class="m-full"><div class="cell">${avatar(nomeEmp(e), '', e._id)}<div style="min-width:0"><strong>${esc(nomeEmp(e))}</strong><small>${esc(e.razao || '')}</small></div></div></td>
        <td class="m-hide">${esc(e.cnpj || '')}</td><td class="m-hide">${esc(C().TIPOS[e.tipo] || '')}</td>
        <td class="m-hide">${esc([e.cidade, e.uf].filter(Boolean).join('/'))}</td><td class="m-hide">${esc(tempo(e.enviadoEm || e.criadoEm))}</td>
        <td>${CW.sessao.pillStatus(e.status)}${e.preCadastro ? ' <span class="pill warn">Documentos pendentes</span>' : ''}</td>
        <td class="r"><button class="btn ${e.status === 'analise' ? '' : 'sec'} sm" data-abrir="${esc(e._id)}">${e.status === 'analise' ? 'Analisar' : 'Abrir'}</button></td></tr>`).join('');
    el.innerHTML = `<div class="card" id="cm-lista"><div class="card-h"><div class="filters">${CHIPS.map(([k, l]) => `<button class="chip" data-filtro="${k}" aria-pressed="${filtro === k}">${l}<b>${conta(k)}</b></button>`).join('')}</div>
        <button class="btn sec sm" id="cm-prevarios" style="margin-left:auto">${ic('list')}Pré-cadastrar vários MEIs</button><button class="btn sm" id="cm-pre">${ic('plus')}Pré-cadastrar empresa</button></div>
      ${lista.length ? `<div class="scroll"><table class="resp"><thead><tr><th>Empresa</th><th>CNPJ</th><th>Uso</th><th>Cidade</th><th>Enviado em</th><th>Situação</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`
        : `<div class="empty"><div class="ic">${ic('building')}</div><strong>Nenhum cadastro nesta situação.</strong></div>`}</div>`;
    el.querySelectorAll('[data-filtro]').forEach(b => b.onclick = () => { filtro = b.dataset.filtro; desenharLista(el); });
    document.getElementById('cm-pre').onclick = () => preCadastro();
    document.getElementById('cm-prevarios').onclick = () => preVarios();
    el.querySelectorAll('[data-abrir]').forEach(r => { const ir = ev => { ev.stopPropagation(); CW.ir('cadastros/analise/' + r.dataset.abrir); };
      r.onclick = ir; if (r.tagName === 'TR') r.onkeydown = ev => { if (ev.key === 'Enter') ir(ev); }; });
  }

  /* ---------- análise ---------- */
  async function carregar(id) {
    const db = CW.fb.db();
    const [e, p, l] = await Promise.all([
      db.doc('empresas/' + id).get(), db.doc('empresas/' + id + '/privado/cadastro').get(),
      db.collection('log').where('empresaId', '==', id).limit(100).get().catch(() => null)
    ]);
    const hist = l ? CW.fb.lista(l).sort((a, b) => ordem(b) - ordem(a)) : [];   /* mais recente primeiro (ordem feita aqui: não precisa de índice no Firestore) */
    return { e: CW.fb.dados(e), pv: CW.fb.dados(p) || {}, hist };
  }
  const ordem = x => { const v = x.em; if (!v) return 0; if (typeof v.toMillis === 'function') return v.toMillis(); if (v.seconds) return v.seconds * 1000; const t = Date.parse(v); return isNaN(t) ? 0 : t; };

  function cartaoDados(e, pv) {
    const { esc, ic } = U(), d = pv.dados || {}, en = pv.end || {}, r = pv.resp || {}, b = pv.banco || {};
    const linha = (k, v, cheio) => `<div class="${cheio ? 'full' : ''}"><dt>${k}</dt><dd>${esc(v || '') || '—'}</dd></div>`;
    const sec = (t, i, rows) => `<section class="card"><div class="card-h"><span class="ic">${ic(i)}</span><h3>${t}</h3></div><div class="card-b"><dl class="dl">${rows}</dl></div></section>`;
    return `<div class="stack">
      ${sec('Empresa', 'building', linha('Razão social', e.razao, 1) + linha('Nome fantasia', e.nome) + linha('CNPJ', e.cnpj) + linha('Uso', C().TIPOS[e.tipo]) + linha('Data de abertura', U().formatarData(d.abertura)) + linha('Porte', d.porte) + linha('Regime', d.regime) + linha('CNAE principal', d.cnae, 1) + linha('Inscrição municipal', d.im) + linha('Inscrição estadual', d.ie || 'Isenta'))}
      ${sec('Endereço', 'home', linha('Endereço', [en.logradouro, en.numero].filter(Boolean).join(', ') + (en.compl ? ' · ' + en.compl : ''), 1) + linha('Bairro', en.bairro) + linha('CEP', en.cep) + linha('Cidade', [en.cidade, en.uf].filter(Boolean).join('/'), 1))}
      ${sec('Responsável', 'user', linha('Nome', r.nome, 1) + linha('CPF', r.cpf) + linha('Cargo', r.cargo) + linha('Celular', r.cel) + linha('E-mail', r.email, 1) + linha('E-mail financeiro', r.emailFin, 1))}
      ${sec('Dados bancários', 'bank', linha('Banco', b.banco, 1) + linha('Agência', b.agencia) + linha('Conta', [b.conta, b.tipoConta].filter(Boolean).join(' · ')) + linha('Pix', [b.pixTipo, b.pix].filter(Boolean).join(': '), 1))}
    </div>`;
  }

  function cartaoDocs(e, pv, editavel) {
    const { esc, ic } = U(), l = C().docsReq({ dados: pv.dados || {}, tipo: e.tipo });
    const comArq = l.filter(([k]) => (pv.docs || {})[k]).length, ok = l.filter(([k]) => conferido(pv, k)).length;
    return `<section class="card" id="cm-docs"><div class="card-h"><span class="ic">${ic('file')}</span><h3>Documentos</h3><span class="count" style="margin-left:auto" id="cm-conf">${ok} de ${comArq} conferidos</span></div>
      ${l.map(([k, rot, req]) => { const f = (pv.docs || {})[k], c = conferido(pv, k), t = trocado(pv, k);
        return `<div class="docrow ${c ? 'ok' : ''}"><span class="ic">${ic(c ? 'check' : 'file')}</span><div class="t"><strong>${esc(rot)}</strong>
          <small>${f ? esc(f.nome) + ' · ' + C().tamanho(f.tam) + (t ? ' · <span class="ferr">arquivo trocado depois da conferência</span>' : '') : req ? '<span class="ferr">Não enviado</span>' : 'Não enviado (opcional)'}</small></div>
          ${editavel && f ? `<label><input type="checkbox" data-conf="${k}" ${c ? 'checked' : ''}>Conferido</label>` : f ? (c ? '<span class="pill ok">Conferido</span>' : '<span class="pill info">Não conferido</span>') : ''}</div>`; }).join('')}
      <p class="hint" style="margin:0;padding:12px 20px;font-size:12px;border-top:1px solid var(--line)">Nesta versão o cadastro guarda o nome de cada arquivo. Confira o documento pelo canal combinado com a empresa antes de marcar.</p></section>`;
  }

  function cartaoHist(hist) {
    const { esc, ic, formatarDataHora } = U();
    const cor = a => /aprovar/.test(a) ? 'ok' : /ajuste/.test(a) ? 'warn' : /recusar/.test(a) ? 'danger' : '';
    return `<section class="card" id="cm-hist"><div class="card-h"><span class="ic">${ic('clock')}</span><h3>Histórico</h3></div>
      ${hist.length ? `<ul class="feed">${hist.map(h => `<li><span class="b ${cor(h.acao)}"></span><div><p>${esc(h.texto)}</p><small>${esc(formatarDataHora(h.em))}${h.quem ? ' · ' + esc(h.quem) : ''}</small></div></li>`).join('')}</ul>`
        : '<div class="card-b"><p class="hint" style="margin:0">Nada registrado ainda.</p></div>'}</section>`;
  }

  function zap(pv, e, st) {
    const cel = U().dig((pv.resp || {}).cel); if (cel.length !== 11) return '';
    const app = (window.CONECTWORK_CONFIG || {}).urlApp || location.origin + location.pathname;
    const txt = st === 'aprovado' ? `Olá! O cadastro da ${nomeEmp(e)} no Conectwork foi aprovado. Já dá para entrar: ${app}`
      : st === 'pendencia' ? `Olá! A equipe Conectwork pediu um ajuste no cadastro da ${nomeEmp(e)}: ${e.motivo || ''} Entre em ${app}, abra "Meu cadastro" e use "Corrigir cadastro".`
        : st === 'recusado' ? `Olá! O cadastro da ${nomeEmp(e)} no Conectwork não foi aprovado. Motivo: ${e.motivo || ''}` : '';
    if (!txt) return '';
    return `<a class="btn sec" id="cm-zap" target="_blank" rel="noopener" href="https://wa.me/55${cel}?text=${encodeURIComponent(txt)}">${U().ic('send')}Avisar a empresa pelo WhatsApp</a>`;
  }

  function cartaoDecisao(e, pv, faltam) {
    const { esc, ic } = U(), st = e.status;
    const planoSel = `<label class="f"><span>Plano (mensalidade) <b aria-hidden="true">*</b></span><select id="cm-plano"><option value="">Escolha o plano</option>${Object.entries(P().PLANOS).map(([k, p]) => `<option value="${k}" ${k === e.plano ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>
      <em class="hint" id="cm-plano-desc">${esc(e.plano && P().PLANOS[e.plano] ? P().PLANOS[e.plano].desc : 'Valores das mensalidades a definir.')}</em></label>`;
    const mods = `<div class="f"><span style="font-size:12.5px;color:var(--muted);font-weight:500">Módulos liberados</span><div class="mods" id="cm-mods">${P().MODULOS_CONTRATAVEIS.map(m => `<label class="check"><input type="checkbox" data-mod="${m.id}" ${(e.modulos || []).includes(m.id) ? 'checked' : ''}><span>${esc(m.nome)}${m.fase > 1 ? `<span class="tag gray">fase ${m.fase}</span>` : ''}<small>${esc(m.desc)}</small></span></label>`).join('')}</div></div>`;
    let corpo;
    if (st === 'aprovado') corpo = `<div class="banner ok">${ic('check')}<span><strong>Aprovada em ${esc(tempo(e.avaliadoEm))}</strong>Empresa ativa na rede${e.avaliadoPor ? ' · por ' + esc(e.avaliadoPor) : ''}.</span></div>
      ${e.preCadastro ? `<div class="banner warn" id="cm-pre-aviso">${ic('alert')}<span><strong>Pré-cadastro: dados e documentos pendentes</strong>A empresa foi liberada só com o CNPJ. Quando tiver o responsável e os documentos, peça para a empresa completar o cadastro: ela preenche em "Meu cadastro", envia, e você confere e aprova de novo.</span></div>` : ''}
      ${e.preCadastro ? `<div class="fgrid"><label class="f c6"><span>Uso</span><select id="cm-tipo">${Object.entries(C().TIPOS).map(([k, t]) => `<option value="${k}" ${k === e.tipo ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        <label class="f c6"><span>Porte</span><select id="cm-porte"><option value="">Não informado</option>${C().PORTES.map(x => `<option ${x === (pv.dados || {}).porte ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
        <em class="hint c12" style="margin-top:-6px">MEI que só presta serviço abre no jeito do profissional: menu simples, notas a emitir e a receber.</em></div>` : ''}
      ${planoSel}${mods}<button class="btn" id="cm-salvar">${ic('check')}${e.preCadastro ? 'Salvar uso, porte, plano e módulos' : 'Salvar plano e módulos'}</button>
      ${e.preCadastro ? `<label class="f"><span>Mensagem para a empresa</span><textarea id="cm-motivo" rows="2" maxlength="500">Complete os dados da empresa e envie os documentos para conferência.</textarea><em class="ferr" id="cm-motivo-erro"></em></label>
      <div><button class="btn warn" id="cm-ajuste">${ic('edit')}Pedir para a empresa completar o cadastro</button></div>` : ''}`;
    else if (st === 'recusado') corpo = `<div class="banner danger">${ic('x')}<span><strong>Recusada em ${esc(tempo(e.avaliadoEm))}</strong>${esc(e.motivo || '')}</span></div>`;
    else corpo = `${st === 'pendencia' ? `<div class="banner warn">${ic('alert')}<span><strong>Esperando a correção da empresa</strong>${esc(e.motivo || '')}</span></div>` : ''}
      ${planoSel}${mods}
      <button class="btn ok" id="cm-aprovar" ${faltam || !e.plano ? 'disabled' : ''}>${ic('check')}Aprovar cadastro</button>
      <p class="hint" id="cm-falta" style="margin:-6px 0 0;font-size:12px">${faltam ? (faltam === 1 ? 'Falta conferir 1 documento obrigatório para aprovar.' : `Faltam conferir ${faltam} documentos obrigatórios para aprovar.`) : !e.plano ? 'Escolha o plano para aprovar.' : 'Tudo conferido. Pode aprovar.'}</p>
      <label class="f"><span>Motivo do ajuste ou da recusa</span><textarea id="cm-motivo" rows="3" maxlength="500" placeholder="Ex.: O comprovante de endereço está ilegível. Envie uma cópia mais nítida."></textarea><em class="ferr" id="cm-motivo-erro"></em></label>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn warn" id="cm-ajuste">${ic('edit')}Pedir ajuste</button><button class="btn dangerous" id="cm-recusar">${ic('x')}Recusar</button></div>`;
    return `<section class="card" id="cm-decisao"><div class="card-h"><span class="ic">${ic('shield')}</span><h3>Decisão</h3></div><div class="card-b stack" style="gap:14px">${corpo}${zap(pv, e, st)}</div></section>`;
  }

  async function desenharAnalise(el, ctx, id) {
    const { esc, ic, avatar } = U();
    let x;
    try { x = await carregar(id); } catch (err) { el.innerHTML = `<div class="banner danger">${ic('alert')}<span><strong>Não foi possível abrir o cadastro.</strong>${esc(CW.fb.mensagemErro(err))}</span></div>`; return; }
    const { e, pv, hist } = x;
    if (!e) { el.innerHTML = `<div class="card"><div class="empty"><div class="ic">${ic('building')}</div><strong>Cadastro não encontrado.</strong><button class="btn sec sm" data-voltar>${ic('back')}Voltar para a lista</button></div></div>`; el.querySelector('[data-voltar]').onclick = () => CW.ir('cadastros'); return; }
    e._id = id;
    const req = C().docsReq({ dados: pv.dados || {}, tipo: e.tipo }).filter(([, , r]) => r);
    const faltam = req.filter(([k]) => !conferido(pv, k)).length;
    const editavel = e.status !== 'recusado';
    document.getElementById('titulo').textContent = nomeEmp(e);
    el.innerHTML = `<div style="margin-bottom:14px"><button class="linkbtn" id="cm-voltar">${ic('back')}Voltar para a lista</button></div>
      <section class="card" style="margin-bottom:22px"><div class="card-b profile">${avatar(nomeEmp(e), 'lg', id)}<div class="t"><h2 id="cm-nome">${esc(nomeEmp(e))}</h2>
        <div class="meta">${CW.sessao.pillStatus(e.status)}<span class="tag gray">${esc(C().TIPOS[e.tipo] || '')}</span><span class="tag gray">${esc(e.cnpj || '')}</span><span class="tag gray" id="cm-protocolo">Protocolo ${esc(e.protocolo || '—')}</span>${e.plano ? `<span class="tag">${esc(P().nomePlano(e.plano))}</span>` : ''}</div></div></div></section>
      <div class="grid-main"><div>${cartaoDados(e, pv)}</div>
        <div class="stack decision">${cartaoDecisao(e, pv, faltam)}${cartaoDocs(e, pv, editavel)}<div id="cm-arquivos"></div>${cartaoHist(hist)}</div></div>`;
    ligarAnalise(el, ctx, e, pv, faltam);
    if (CW.documentos) CW.documentos.blocoMaster(document.getElementById('cm-arquivos'), id);
  }

  function ligarAnalise(el, ctx, e, pv, faltam) {
    const db = CW.fb.db(), id = e._id, quem = quemSou(ctx);
    const log = (b, acao, texto) => b.set(db.collection('log').doc(), { em: CW.fb.agora(), uid: ctx.sessao.usuario.uid, quem, empresaId: id, acao, texto, ref: id });
    const refazer = () => desenharAnalise(el, ctx, id);
    const falhou = err => { console.error(err); U().toast(CW.fb.mensagemErro(err), 'erro'); refazer(); };
    document.getElementById('cm-voltar').onclick = () => CW.ir('cadastros');

    /* conferir documento (guarda o nome do arquivo: se a empresa trocar o arquivo, volta a ficar "não conferido") */
    el.querySelectorAll('[data-conf]').forEach(c => c.onchange = async () => {
      const k = c.dataset.conf, f = (pv.docs || {})[k], conf = Object.assign({}, pv.conferidos || {});
      if (c.checked) conf[k] = { nome: f.nome, em: CW.fb.agora(), por: quem }; else delete conf[k];
      const rot = (C().docsReq({ dados: pv.dados || {}, tipo: e.tipo }).find(x => x[0] === k) || [])[1] || k;
      const b = db.batch(); b.update(db.doc('empresas/' + id + '/privado/cadastro'), { conferidos: conf });
      log(b, c.checked ? 'cadastro.conferir' : 'cadastro.desconferir', `${rot} ${c.checked ? 'conferido' : 'desmarcado como conferido'} no cadastro de ${nomeEmp(e)}.`);
      c.disabled = true;
      try { await b.commit(); refazer(); } catch (err) { falhou(err); }
    });

    /* plano sugere os módulos (dá para ajustar um a um) */
    const sel = document.getElementById('cm-plano');
    if (sel) sel.onchange = () => {
      const p = P().PLANOS[sel.value];
      document.getElementById('cm-plano-desc').textContent = p ? p.desc : 'Valores das mensalidades a definir.';
      if (p) el.querySelectorAll('[data-mod]').forEach(c => { c.checked = p.modulos.includes(c.dataset.mod); });
      const ap = document.getElementById('cm-aprovar'), falta = document.getElementById('cm-falta');
      if (ap) { ap.disabled = !sel.value || faltam > 0; if (!faltam) falta.textContent = sel.value ? 'Tudo conferido. Pode aprovar.' : 'Escolha o plano para aprovar.'; }
    };
    const lerMods = () => Array.from(el.querySelectorAll('[data-mod]')).filter(c => c.checked).map(c => c.dataset.mod);
    const nomesMods = ms => ms.map(m => (P().MODULOS_CONTRATAVEIS.find(x => x.id === m) || { nome: m }).nome).join(', ') || 'nenhum';

    const decidir = async (status, campos, acao, texto, msg) => {
      const b = db.batch();
      b.update(db.doc('empresas/' + id), Object.assign({ status, avaliadoEm: CW.fb.agora(), avaliadoPor: quem }, campos));
      log(b, acao, texto);
      el.querySelectorAll('#cm-decisao button').forEach(x => { x.disabled = true; });
      try { await b.commit(); U().toast(msg); refazer(); } catch (err) { falhou(err); }
    };

    const ap = document.getElementById('cm-aprovar');
    if (ap) ap.onclick = async () => {
      const plano = sel.value, mods = lerMods();
      if (!plano) { U().toast('Escolha o plano antes de aprovar.', 'erro'); sel.focus(); return; }
      if (!mods.length && !(await U().confirmar('Aprovar sem nenhum módulo?', 'A empresa vai entrar, mas não verá nenhuma tela além do Início. Você pode liberar os módulos depois.', 'Aprovar assim'))) return;
      decidir('aprovado', Object.assign({ plano, modulos: mods, motivo: '' }, e.preCadastro ? { preCadastro: false } : {}), 'empresa.aprovar',
        `Cadastro de ${nomeEmp(e)} aprovado no plano ${P().nomePlano(plano)}. Módulos: ${nomesMods(mods)}.`, `${nomeEmp(e)} aprovada e liberada na rede.`);
    };
    const motivo = () => { const t = document.getElementById('cm-motivo'), m = t.value.trim();
      if (m.length < 10) { document.getElementById('cm-motivo-erro').textContent = 'Escreva o motivo (pelo menos 10 letras). Ele aparece para a empresa.'; t.focus(); return null; } return m; };
    const mt = document.getElementById('cm-motivo'); if (mt) mt.oninput = () => { document.getElementById('cm-motivo-erro').textContent = ''; };
    const aj = document.getElementById('cm-ajuste');
    if (aj) aj.onclick = () => { const m = motivo(); if (!m) return;
      decidir('pendencia', { motivo: m }, 'empresa.ajuste', `Ajuste pedido no cadastro de ${nomeEmp(e)}: ${m}`, `Ajuste pedido a ${nomeEmp(e)}.`); };
    const rc = document.getElementById('cm-recusar');
    if (rc) rc.onclick = async () => { const m = motivo(); if (!m) return;
      if (!(await U().confirmar('Recusar o cadastro?', `A ${nomeEmp(e)} não poderá usar o Conectwork com este cadastro. O motivo aparece para a empresa.`, 'Recusar'))) return;
      decidir('recusado', { motivo: m }, 'empresa.recusar', `Cadastro de ${nomeEmp(e)} recusado: ${m}`, `Cadastro de ${nomeEmp(e)} recusado.`); };

    const sv = document.getElementById('cm-salvar');
    if (sv) sv.onclick = async () => {
      const plano = sel.value, mods = lerMods();
      if (!plano) { U().toast('Escolha o plano.', 'erro'); sel.focus(); return; }
      const b = db.batch(), ct = document.getElementById('cm-tipo'), cp = document.getElementById('cm-porte');
      const tipo = ct ? ct.value : e.tipo, porte = cp ? cp.value : null, porteAntes = (pv.dados || {}).porte || '';
      b.update(db.doc('empresas/' + id), { plano, modulos: mods, tipo });
      if (cp && porte !== porteAntes) b.update(db.doc('empresas/' + id + '/privado/cadastro'), { 'dados.porte': porte });
      log(b, 'empresa.plano', `Plano de ${nomeEmp(e)}: ${P().nomePlano(plano)}. Módulos: ${nomesMods(mods)}.${tipo !== e.tipo ? ' Uso: ' + C().TIPOS[tipo] + '.' : ''}${cp && porte !== porteAntes ? ' Porte: ' + (porte || 'não informado') + '.' : ''}`);
      try { sessionStorage.removeItem('cw.porte.' + id); } catch (er) { /* o menu do MEI confere o porte de novo ao entrar */ }
      sv.disabled = true;
      try { await b.commit(); U().toast(`Plano e módulos de ${nomeEmp(e)} salvos.`); refazer(); } catch (err) { falhou(err); }
    };
  }


  /* ---------- pré-cadastro pela equipe (09/11/2026) ----------
     Para começar a usar antes de ter o responsável e os documentos: só CNPJ, nome, uso e plano. A empresa já nasce
     aprovada (preCadastro: true, documentos pendentes) e, se marcado, quem está logado vira administrador(a) dela
     para configurar tudo. Depois: "Pedir para a empresa completar o cadastro" → a empresa preenche e envia → análise. */
  function preCadastro() {
    const { esc, ic, dig } = U(), st = CW.sessao.estado(), u = st.usuario;
    const planos = Object.entries(P().PLANOS);
    let dados = null;
    U().dialogo({ titulo: 'Pré-cadastrar empresa', sub: 'Só o CNPJ para começar. A empresa já fica liberada e os dados e documentos ficam pendentes.',
      corpo: `<div class="stack" style="gap:14px" id="pc-form">
        <label class="f"><span>CNPJ <b aria-hidden="true">*</b></span><input id="pc-cnpj" data-mascara="cnpj" inputmode="numeric" placeholder="00.000.000/0000-00" autocomplete="off"></label>
        <label class="f"><span>Nome da empresa <b aria-hidden="true">*</b></span><input id="pc-nome" maxlength="120" autocomplete="off" placeholder="Nome fantasia ou razão social"></label>
        <label class="f"><span>Porte</span><select id="pc-porte"><option value="">Não sei ainda</option>${C().PORTES.map(x => `<option>${esc(x)}</option>`).join('')}</select>
          <em class="hint">MEI abre o Conectwork no jeito do profissional: menu simples, notas a emitir e a receber.</em></label>
        <label class="f"><span>Uso</span><select id="pc-tipo">${Object.entries(C().TIPOS).map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('')}</select></label>
        <label class="f"><span>Plano</span><select id="pc-plano">${planos.map(([k, p]) => `<option value="${k}" ${k === 'profissional' ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>
          <em class="hint" id="pc-plano-desc">${esc(P().PLANOS.profissional.desc)} Os módulos do plano já vêm ligados; dá para mudar depois.</em></label>
        <div class="fgrid" id="pc-cidade-bloco" hidden><label class="f c8"><span>Cidade que a parceira atende <b aria-hidden="true">*</b></span><input id="pc-cidade" maxlength="60" autocomplete="off" placeholder="Ex.: Gravataí"></label>
          <label class="f c4"><span>UF <b aria-hidden="true">*</b></span><input id="pc-uf" maxlength="2" autocomplete="off" placeholder="RS" style="text-transform:uppercase"></label>
          <em class="hint c12">O que ela publicar aparece para os prestadores desta cidade. Escreva igual ao cadastro dos prestadores (acento não faz diferença).</em></div>
        <label class="check"><input type="checkbox" id="pc-admin" checked><span>Me colocar como administrador(a) desta empresa<small>Para você configurar a empresa agora. Depois, convide as pessoas com o e-mail delas.</small></span></label>
        <p class="err" id="pc-erro" role="alert"></p></div>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Pré-cadastrar', valor: 'ok', icone: 'check', antes: d => {
        const v = id => d.querySelector('#' + id).value.trim(), er = d.querySelector('#pc-erro');
        const cnpj = v('pc-cnpj'), nome = v('pc-nome').replace(/\s+/g, ' ');
        if (!U().validarCNPJ(cnpj)) { er.textContent = dig(cnpj).length ? 'CNPJ inválido. Confira os números.' : 'Informe o CNPJ.'; d.querySelector('#pc-cnpj').focus(); return false; }
        if (nome.length < 2) { er.textContent = 'Informe o nome da empresa.'; d.querySelector('#pc-nome').focus(); return false; }
        if ((empresas || []).some(e => dig(e.cnpj) === dig(cnpj))) { er.textContent = 'Este CNPJ já tem cadastro no Conectwork. Procure a empresa na lista "Todas".'; return false; }
        const cid = d.querySelector('#pc-plano').value === 'cidade', cidade = cid ? v('pc-cidade').replace(/\s+/g, ' ') : '', uf = cid ? v('pc-uf').toUpperCase() : '';
        if (cid && (cidade.length < 2 || !/^[A-Z]{2}$/.test(uf))) { er.textContent = 'Informe a cidade e a UF (duas letras) que a parceira atende.'; d.querySelector('#pc-cidade').focus(); return false; }
        if (cid && d.querySelector('#pc-tipo').value === 'prestador') { er.textContent = 'Parceiro da cidade não pode ser "só presta serviços". Escolha outro uso.'; return false; }
        dados = { cidade, uf, cnpj, nome, porte: d.querySelector('#pc-porte').value, tipo: d.querySelector('#pc-tipo').value, plano: d.querySelector('#pc-plano').value, admin: d.querySelector('#pc-admin').checked };
        return true; } }],
      aoAbrir: d => { U().aplicarMascaras(d); const sp = d.querySelector('#pc-plano'), po = d.querySelector('#pc-porte');
        po.onchange = () => { if (po.value.startsWith('MEI')) d.querySelector('#pc-tipo').value = 'prestador'; };   /* MEI presta serviço */
        sp.onchange = () => { d.querySelector('#pc-cidade-bloco').hidden = sp.value !== 'cidade'; d.querySelector('#pc-plano-desc').textContent = (P().PLANOS[sp.value] || {}).desc + ' Os módulos do plano já vêm ligados; dá para mudar depois.'; };
        d.querySelector('#pc-cnpj').focus(); }
    }).then(async v => {
      if (v !== 'ok' || !dados) return;
      const db = CW.fb.db(), agora = CW.fb.agora, num = dig(dados.cnpj), empRef = db.collection('empresas').doc(), id = empRef.id;
      const quem = (st.perfil && st.perfil.nome) || u.email, mods = (P().PLANOS[dados.plano] || { modulos: [] }).modulos.slice();
      let protocolo = '';
      try {
        await db.runTransaction(async tx => {
          const cRef = db.doc('contadores/protocolo'), nRef = db.doc('cnpjs/' + num);
          const c = await tx.get(cRef), n = await tx.get(nRef);
          if (n.exists) { const e = new Error('cnpj'); e.code = 'cw/cnpj-repetido'; throw e; }
          const ano = new Date().getFullYear(), atual = c.exists ? c.data() : null, seq = atual && atual.ano === ano ? atual.n + 1 : 1;
          protocolo = `CW-${ano}-${String(seq).padStart(4, '0')}`;
          tx.set(cRef, { ano, n: seq });
          tx.set(nRef, { empresaId: id, criadoEm: agora() });
          tx.set(empRef, { tipo: dados.tipo, status: 'aprovado', nome: dados.nome, razao: '', cnpj: dados.cnpj, cnpjNum: num, cidade: dados.cidade || '', uf: dados.uf || '', protocolo,
            criadoPor: u.uid, criadoEm: agora(), enviadoEm: agora(), plano: dados.plano, modulos: mods, preCadastro: true, avaliadoEm: agora(), avaliadoPor: quem });
          tx.set(db.doc('empresas/' + id + '/privado/cadastro'), { dados: dados.porte ? { porte: dados.porte } : {}, end: {}, resp: {}, banco: {}, docs: {}, preCadastro: true });
          if (dados.admin) tx.set(db.doc('acessos/' + id + '_' + u.uid), { uid: u.uid, empresaId: id, nome: quem, email: (u.email || '').toLowerCase(), cargo: 'admin', extras: [], sem: [], ativo: true, criadoEm: agora() });
          tx.set(db.collection('log').doc(), { em: agora(), uid: u.uid, quem, empresaId: id, acao: 'empresa.precadastro',
            texto: `Pré-cadastro de ${dados.nome} (CNPJ ${dados.cnpj}) pela equipe Conectwork, no plano ${P().nomePlano(dados.plano)}${dados.porte ? ', porte ' + dados.porte : ''}${dados.cidade ? ', parceira de ' + dados.cidade + '/' + dados.uf : ''}. Dados e documentos pendentes.${dados.admin ? ` ${quem} entrou como administrador(a).` : ''}`, ref: id });
        });
      } catch (err) {
        U().toast(err && err.code === 'cw/cnpj-repetido' ? 'Este CNPJ já tem cadastro no Conectwork.' : 'O pré-cadastro não foi feito. ' + CW.fb.mensagemErro(err), 'erro');
        return;
      }
      if (!dados.admin) { U().toast(`${dados.nome} pré-cadastrada (protocolo ${protocolo}).`); return; }
      const ir = await U().confirmar(`${dados.nome} pré-cadastrada`, `Protocolo ${protocolo}. Você já é administrador(a) dela. Quer entrar na empresa agora para configurar?`, 'Entrar na empresa');
      if (!ir) { await CW.sessao.recarregar(); return; }
      await CW.sessao.recarregar();
      CW.sessao.entrarEm('empresa:' + id);
    });
  }

  /* ---------- pré-cadastrar vários MEIs de uma vez (12/11/2026, "precisamos já cadastrar e deixar pronto quem está no painel") ----------
     A lista vem do painel do RH ("Copiar a lista para o Conectwork": Nome;CNPJ;Prestadora;Celular;E-mail, uma pessoa por linha; nunca CPF).
     Cada MEI nasce como o pré-cadastro de sempre (aprovado, preCadastro, porte MEI, só presta, plano gratuito) e, com e-mail, ganha um
     convite de administrador(a) para esse e-mail: a pessoa abre o link, cria a senha e já entra no MEI dela. CNPJ que já existe fica de fora. */
  function lerLista(txt) {
    const linhas = String(txt || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean), out = [];
    linhas.forEach((l, i) => {
      const c = l.split(/\t|;/).map(x => x.trim()), cnpjI = c.findIndex(x => dig(x).length === 14);
      if (cnpjI < 0) { if (i === 0 || /cnpj/i.test(l)) return; out.push({ linha: l, erro: 'sem CNPJ' }); return; }
      const nome = (c[0] && c[0] !== c[cnpjI] ? c[0] : '').replace(/\s+/g, ' '), cnpj = U().mascara.cnpj(c[cnpjI]), resto = c.filter((x, j) => j !== 0 && j !== cnpjI);
      const email = (resto.find(x => /@/.test(x)) || '').toLowerCase(), tel = dig(resto.find(x => dig(x).length >= 10 && dig(x).length <= 13 && !/@/.test(x)) || '');
      const prest = resto.find(x => x && !/@/.test(x) && dig(x).length < 10) || '';
      const r = { linha: l, nome, cnpj, num: dig(cnpj), email, tel: tel.length > 11 && tel.startsWith('55') ? tel.slice(2) : tel, prest };
      if (!U().validarCNPJ(cnpj)) r.erro = 'CNPJ inválido'; else if (nome.split(' ').length < 2) r.erro = 'falta o nome e sobrenome';
      else if (email && !U().validarEmail(email)) r.erro = 'e-mail inválido';
      else if (out.some(o => o.num === r.num)) r.erro = 'CNPJ repetido na lista';
      out.push(r);
    });
    return out;
  }
  async function preVarios() {
    const { esc } = U(); let txt = '';
    const v = await U().dialogo({ titulo: 'Pré-cadastrar vários MEIs', sub: 'Cole a lista que o painel do RH copia (Pagamento dos PJ › Conectwork › Convidar os PJ › "Copiar a lista para o Conectwork"). Uma pessoa por linha: Nome; CNPJ; Prestadora; Celular; E-mail.',
      corpo: `<div class="stack" style="gap:10px"><label class="f"><span>Lista</span><textarea id="pv-txt" rows="9" placeholder="Joao da Silva;12.345.678/0001-90;Zenith;51999990000;joao@email.com"></textarea></label>
        <p class="hint" id="pv-prev" style="margin:0">Cada MEI fica aprovado, com o porte MEI e só presta serviços. Quem tem e-mail recebe um convite para entrar já como administrador(a) do MEI dele. Não use CPF.</p><p class="err" id="pv-erro" role="alert"></p></div>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Pré-cadastrar', valor: 'ok', antes: d => { txt = d.querySelector('#pv-txt').value; const xs = lerLista(txt).filter(x => !x.erro); if (!xs.length) { d.querySelector('#pv-erro').textContent = 'Nenhuma linha com nome e CNPJ válidos.'; return false; } return true; } }],
      aoAbrir: d => { const t = d.querySelector('#pv-txt'), pv = d.querySelector('#pv-prev'); t.oninput = () => { const xs = lerLista(t.value), ok = xs.filter(x => !x.erro), er = xs.filter(x => x.erro), ja = ok.filter(x => (empresas || []).some(e => dig(e.cnpj) === x.num));
          pv.innerHTML = `<b>${ok.length - ja.length}</b> para pré-cadastrar${ja.length ? ` · ${ja.length} já estão no Conectwork` : ''} · ${ok.filter(x => x.email).length} com e-mail (recebem convite)${er.length ? ` · <span style="color:var(--danger)">${er.length} com problema: ${er.slice(0, 4).map(x => esc((x.nome || x.linha).slice(0, 30) + ' (' + x.erro + ')')).join(', ')}</span>` : ''}`; }; t.focus(); }
    });
    if (v !== 'ok') return;
    const xs = lerLista(txt).filter(x => !x.erro), u = CW.fb.auth().currentUser, st = CW.sessao.estado(), quem = (st.perfil && st.perfil.nome) || u.email;
    const db = CW.fb.db(), agora = CW.fb.agora, mods = (P().PLANOS.gratuito || { modulos: ['cobrancas'] }).modulos.slice(), res = [];
    U().toast('Pré-cadastrando ' + xs.length + '…');
    for (const x of xs) {
      const ja = (empresas || []).find(e => dig(e.cnpj) === x.num);
      if (ja) { res.push(Object.assign({ st: 'ja', empresaId: ja._id }, x)); continue; }
      const empRef = db.collection('empresas').doc(), id = empRef.id, cvRef = x.email ? db.collection('convites').doc() : null, nomeNeg = x.nome;
      try {
        await db.runTransaction(async tx => {
          const cRef = db.doc('contadores/protocolo'), nRef = db.doc('cnpjs/' + x.num);
          const c = await tx.get(cRef), n = await tx.get(nRef);
          if (n.exists) { const e = new Error('cnpj'); e.code = 'cw/cnpj-repetido'; throw e; }
          const ano = new Date().getFullYear(), atual = c.exists ? c.data() : null, seq = atual && atual.ano === ano ? atual.n + 1 : 1, protocolo = `CW-${ano}-${String(seq).padStart(4, '0')}`;
          tx.set(cRef, { ano, n: seq }); tx.set(nRef, { empresaId: id, criadoEm: agora() });
          tx.set(empRef, { tipo: 'prestador', status: 'aprovado', nome: nomeNeg, razao: '', cnpj: x.cnpj, cnpjNum: x.num, cidade: '', uf: '', protocolo,
            criadoPor: u.uid, criadoEm: agora(), enviadoEm: agora(), plano: 'gratuito', modulos: mods, preCadastro: true, avaliadoEm: agora(), avaliadoPor: quem });
          tx.set(db.doc('empresas/' + id + '/privado/cadastro'), { dados: { porte: 'MEI' }, end: {}, resp: x.tel ? { nome: x.nome, celular: x.tel } : { nome: x.nome }, banco: {}, docs: {}, preCadastro: true });
          if (cvRef) tx.set(cvRef, { email: x.email, nome: x.nome, tel: x.tel || '', empresaId: id, empresaNome: nomeNeg, cargo: 'admin', criadoPor: u.uid, criadoPorNome: quem, criadoEm: agora(), usado: false });
          tx.set(db.collection('log').doc(), { em: agora(), uid: u.uid, quem, empresaId: id, acao: 'empresa.precadastro',
            texto: `Pré-cadastro do MEI ${nomeNeg} (CNPJ ${x.cnpj}) pela equipe Conectwork, em lote${x.prest ? ', presta serviço para ' + x.prest : ''}.${x.email ? ' Convite de administrador(a) para ' + x.email + '.' : ''}`, ref: id });
        });
        res.push(Object.assign({ st: 'ok', empresaId: id, convite: cvRef ? cvRef.id : '' }, x));
      } catch (err) { res.push(Object.assign({ st: 'erro', msg: err && err.code === 'cw/cnpj-repetido' ? 'CNPJ já tem cadastro' : CW.fb.mensagemErro(err) }, x)); }
    }
    mostrarLote(res);
  }
  const linkConv = t => ((window.CONECTWORK_CONFIG || {}).urlApp || (location.origin + location.pathname)).replace(/#.*$/, '').replace(/[^/]*$/, '') + 'convite/?c=' + t;
  const msgConv = x => `Olá, ${x.nome.split(' ')[0]}! O seu MEI (CNPJ ${x.cnpj}) já está cadastrado no Conectwork${x.prest ? ', onde a ' + x.prest + ' vai pedir e receber as suas notas fiscais' : ''}.\n\nPara entrar, abra o link e crie a sua senha com o e-mail ${x.email}:\n${linkConv(x.convite)}\n\nO convite vale só para esse e-mail.`;
  function mostrarLote(res) {
    const { esc, ic, dig: d } = U(), ok = res.filter(x => x.st === 'ok'), ja = res.filter(x => x.st === 'ja'), er = res.filter(x => x.st === 'erro');
    const zap = x => { const t = d(x.tel || ''); return `https://wa.me/${t.length === 11 || t.length === 10 ? '55' + t : ''}?text=${encodeURIComponent(msgConv(x))}`; };
    U().dialogo({ titulo: 'MEIs pré-cadastrados', sub: `${ok.length} cadastrados agora${ja.length ? ` · ${ja.length} já estavam no Conectwork` : ''}${er.length ? ` · ${er.length} com erro` : ''}. Mande o convite de cada um.`,
      corpo: `<div class="stack" style="gap:8px" id="pv-res">${ok.map((x, i) => `<div class="pv-l" style="display:flex;gap:8px 12px;align-items:center;flex-wrap:wrap;padding:6px 0;border-bottom:1px solid var(--line)"><span style="flex:1 1 200px;min-width:0"><b>${esc(x.nome)}</b><br><small class="hint">${esc(x.cnpj)}${x.email ? ' · ' + esc(x.email) : ' · sem e-mail'}</small></span>
          ${x.convite ? `<a class="btn sm" target="_blank" rel="noopener" href="${esc(zap(x))}">${ic('send')}WhatsApp</a><button class="linkbtn" data-pvc="${i}">Copiar convite</button>` : '<small class="hint">Sem e-mail: abra o MEI em Cadastros e convide depois em Pessoas.</small>'}</div>`).join('')}
        ${ja.length ? `<p class="hint" style="margin:6px 0 0">Já estavam no Conectwork: ${ja.map(x => esc(x.nome)).join(', ')}.</p>` : ''}
        ${er.length ? `<p class="err" style="margin:6px 0 0">Não cadastrados: ${er.map(x => esc(x.nome + ' (' + x.msg + ')')).join(', ')}.</p>` : ''}</div>`,
      botoes: [{ texto: 'Fechar', valor: null, classe: 'sec' }],
      aoAbrir: dl => dl.querySelectorAll('[data-pvc]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(msgConv(ok[+b.dataset.pvc])); U().toast('Convite copiado.'); } catch (e) { U().toast('Não deu para copiar. Use o WhatsApp.', 'erro'); } })
    });
  }

  CW.registrarModulo({
    id: 'cadastros', nome: 'Cadastros', icone: 'building', ordem: 10,
    para: ['master'],
    iniciar() {
      empresas = null;
      CW.inscrever('cadastros-empresas', () => CW.fb.db().collection('empresas'), snap => {
        empresas = CW.fb.lista(snap).map(e => Object.assign(e, { _env: (() => { const v = e.enviadoEm || e.criadoEm; const t = v && (typeof v.toMillis === 'function' ? v.toMillis() : v.seconds ? v.seconds * 1000 : Date.parse(v)); return t ? String(t).padStart(15, '0') : ''; })() }));
        const el = document.getElementById('view'), at = CW.app.atual();
        if (el && at && at.modulo === 'cadastros' && at.tela === 'lista') desenharLista(el);
      });
      return () => { empresas = null; };
    },
    telas: {
      lista: { nome: 'Cadastros', sub: 'Empresas que pediram para entrar no Conectwork. Confira os dados e os documentos antes de aprovar.', render: el => desenharLista(el) },
      analise: { nome: 'Análise do cadastro', sub: 'Confira os dados e os documentos, escolha o plano e decida.', render: (el, ctx) => desenharAnalise(el, ctx, ctx.params[0]) }
    }
  });
})();
