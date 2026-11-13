/* Conectwork · equipe Conectwork: dados da rede, Painel da rede (o Início da equipe) e Empresas.
   - Dados da rede (CW.rede): empresas, valores dos planos (config/planos), mensalidades, avisos, equipe e convites da equipe.
     Ficam ligados enquanto a equipe está no app (iniciar do módulo Empresas) e avisam as telas com o evento "cw:rede".
   - Painel da rede: o que precisa da equipe (cadastros, mensalidades atrasadas, documentos vencendo), números da rede,
     empresas por plano e o que aconteceu por último.
   - Empresas: as empresas da rede com plano, módulos, mensalidade, pessoas e as ações da equipe: ver como a empresa (só
     consulta), mudar plano e módulos (na análise do cadastro) e suspender ou reativar o acesso (com motivo, no histórico).
   Receita = mensalidade; o Conectwork não cobra nada sobre os serviços. */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const P = () => CW.permissoes;

  /* ---------- dados da rede ---------- */
  const D = { empresas: null, planos: null, mens: null, avisos: null, equipe: null, convites: null };
  let avisarTimer = null;
  const avisar = () => { clearTimeout(avisarTimer); avisarTimer = setTimeout(() => { window.dispatchEvent(new CustomEvent('cw:rede')); if (CW.app) CW.app.pendenciasMudaram(); }, 30); };
  function ligar() {
    const db = CW.fb.db(), L = CW.fb.lista;
    Object.keys(D).forEach(k => { D[k] = null; });
    CW.inscrever('rede-empresas', () => db.collection('empresas'), sn => { D.empresas = L(sn); avisar(); });
    CW.inscrever('rede-planos', () => db.doc('config/planos'), sn => { D.planos = CW.fb.dados(sn) || {}; avisar(); }, () => { D.planos = {}; avisar(); });
    CW.inscrever('rede-mens', () => db.collection('mensalidades'), sn => { D.mens = L(sn); avisar(); }, () => { D.mens = []; avisar(); });
    CW.inscrever('rede-avisos', () => db.collection('avisos'), sn => { D.avisos = L(sn); avisar(); }, () => { D.avisos = []; avisar(); });
    CW.inscrever('rede-equipe', () => db.collection('master'), sn => { D.equipe = L(sn); avisar(); }, () => { D.equipe = []; avisar(); });
    CW.inscrever('rede-convites', () => db.collection('convites').where('tipo', '==', 'master'), sn => { D.convites = L(sn); avisar(); }, () => { D.convites = []; avisar(); });
    return () => { Object.keys(D).forEach(k => { D[k] = null; }); };
  }

  /* ---------- contas e textos comuns ---------- */
  const p2 = n => String(n).padStart(2, '0');
  const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
  const mesAtual = () => hoje().slice(0, 7);
  const somaMes = (comp, n) => { const [a, m] = comp.split('-').map(Number), d = new Date(a, m - 1 + n, 1); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`; };
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const nomeMes = comp => { const [a, m] = comp.split('-'); return MESES[Number(m) - 1] + ' de ' + a; };
  const dataBR = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
  const brl = c => U().formatarDinheiro(c || 0);
  const nomeEmp = e => (e && (e.nome || e.razao)) || 'Empresa';
  const quemSou = ctx => (ctx.sessao.perfil && ctx.sessao.perfil.nome) || ctx.sessao.usuario.email;
  const TIPOS = { contratante: 'Contrata serviços', prestador: 'Presta serviços', ambos: 'Contrata e presta' };

  /* situação de uma mensalidade: paga, isenta, atrasada (aberta e vencida) ou em aberto */
  function sitMens(m) {
    if (m.status === 'paga') return { k: 'paga', t: 'Paga em ' + dataBR(m.pagoNoDia), c: 'ok' };
    if (m.status === 'isenta') return { k: 'isenta', t: 'Isenta', c: 'gray' };
    if (m.venc < hoje()) return { k: 'atrasada', t: 'Atrasada', c: 'danger' };
    return { k: 'aberta', t: 'Em aberto', c: 'info' };
  }
  const pill = (c, t) => c === 'gray' ? `<span class="tag gray">${U().esc(t)}</span>` : `<span class="pill ${c}">${U().esc(t)}</span>`;
  const atrasadas = () => (D.mens || []).filter(m => sitMens(m).k === 'atrasada');
  const ativas = () => (D.empresas || []).filter(e => e.status === 'aprovado');
  const carregou = () => D.empresas && D.mens && D.planos && D.avisos;
  const carregando = (el, txt) => { el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>${txt || 'Carregando…'}</span></div></div>`; };
  const erroHtml = (t, e) => `<div class="banner danger">${U().ic('alert')}<span><strong>${U().esc(t)}</strong>${U().esc(CW.fb.mensagemErro(e))}</span></div>`;
  const log = (b, ctx, empresaId, acao, texto, ref) => b.set(CW.fb.db().collection('log').doc(), { em: CW.fb.agora(), uid: ctx.sessao.usuario.uid, quem: quemSou(ctx), empresaId, acao, texto, ref: ref || '' });

  /* ---------- Painel da rede (Início da equipe) ---------- */
  let extra = null, extraEm = 0;          /* documentos e últimas ações: lidos de novo a cada 5 min no máximo */
  async function lerExtra() {
    if (extra && Date.now() - extraEm < 300000) return extra;
    const db = CW.fb.db();
    const [docs, logs] = await Promise.all([
      db.collection('documentos').where('status', '==', 'vigente').get().then(CW.fb.lista).catch(() => []),
      db.collection('log').orderBy('em', 'desc').limit(8).get().then(CW.fb.lista).catch(() => [])
    ]);
    extra = { docs, logs }; extraEm = Date.now(); return extra;
  }
  const ms = v => { if (!v) return 0; if (typeof v.toMillis === 'function') return v.toMillis(); if (v.seconds) return v.seconds * 1000; const t = Date.parse(v); return isNaN(t) ? 0 : t; };

  function kpi(id, rot, val, sub, rota, cor) {
    const { esc } = U();
    return `<a class="rd-k ${cor || ''}" id="${id}" href="#${esc(rota)}"><span>${esc(rot)}</span><b>${esc(val)}</b><small>${esc(sub || '')}</small></a>`;
  }

  async function painel(el, ctx) {
    const { esc, ic, formatarDataHora } = U();
    if (!carregou()) { carregando(el, 'Montando o painel da rede…'); return; }
    const x = await lerExtra();
    if (!document.body.contains(el)) return;
    const emps = D.empresas, nomes = {}; emps.forEach(e => { nomes[e._id] = nomeEmp(e); });
    const analise = emps.filter(e => e.status === 'analise'), pend = emps.filter(e => e.status === 'pendencia');
    const at = ativas(), susp = emps.filter(e => e.status === 'suspenso');
    const comp = mesAtual(), doMes = D.mens.filter(m => m.comp === comp);
    const aReceber = doMes.filter(m => m.status === 'aberta').reduce((s, m) => s + m.valorCentavos, 0);
    const recebido = doMes.filter(m => m.status === 'paga').reduce((s, m) => s + m.valorCentavos, 0);
    const atr = atrasadas(), atrTot = atr.reduce((s, m) => s + m.valorCentavos, 0);
    const semGerar = at.filter(e => !doMes.some(m => m.empresaId === e._id)).length;
    const valores = D.planos.valores || {};
    const semValor = Object.keys(P().PLANOS).filter(k => k !== 'gratuito' && !(valores[k] > 0));
    /* documentos da rede: vencidos e vencendo em 30 dias (empresas ativas) */
    const h = hoje(), lim = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; })();
    const docs = x.docs.filter(d => d.validade && nomes[d.empresaId] && at.some(e => e._id === d.empresaId));
    const vencidos = docs.filter(d => d.validade < h), vencendo = docs.filter(d => d.validade >= h && d.validade <= lim);
    const avisosNoAr = D.avisos.filter(a => a.ativo && (!a.ate || a.ate >= h));

    const precisa = [];
    if (analise.length) precisa.push(['building', `${analise.length} ${analise.length === 1 ? 'cadastro esperando' : 'cadastros esperando'} a sua análise`, analise.slice(0, 3).map(nomeEmp).join(', '), 'cadastros']);
    if (atr.length) precisa.push(['wallet', `${atr.length} ${atr.length === 1 ? 'mensalidade atrasada' : 'mensalidades atrasadas'} · ${brl(atrTot)}`, Array.from(new Set(atr.map(m => m.empresaNome))).slice(0, 3).join(', '), 'mensalidades/mes/atrasadas']);
    if (semValor.length) precisa.push(['receipt', 'Defina o valor da mensalidade dos planos', 'Sem valor: ' + semValor.map(P().nomePlano).join(', '), 'mensalidades/planos']);
    else if (semGerar) precisa.push(['receipt', `Gerar as mensalidades de ${nomeMes(comp)}`, `${semGerar} ${semGerar === 1 ? 'empresa ativa ainda sem' : 'empresas ativas ainda sem'} a mensalidade do mês`, 'mensalidades']);
    if (vencidos.length) precisa.push(['file', `${vencidos.length} ${vencidos.length === 1 ? 'documento vencido' : 'documentos vencidos'} na rede`, Array.from(new Set(vencidos.map(d => nomes[d.empresaId]))).slice(0, 3).join(', '), 'redeempresas']);
    if (pend.length) precisa.push(['clock', `${pend.length} ${pend.length === 1 ? 'empresa corrigindo' : 'empresas corrigindo'} o cadastro`, 'Esperando a empresa reenviar', 'cadastros']);

    const porPlano = Object.keys(P().PLANOS).map(k => [k, at.filter(e => e.plano === k).length]).concat([['', at.filter(e => !P().PLANOS[e.plano]).length]]).filter(([, n]) => n);
    const maxP = Math.max(1, ...porPlano.map(([, n]) => n));
    const receitaMes = at.reduce((s, e) => s + (valores[e.plano] || 0), 0);
    el.innerHTML = `
      <div class="rd-ks" id="rd-numeros">
        ${kpi('rd-k-cad', 'Cadastros esperando', String(analise.length), pend.length ? `${pend.length} corrigindo` : 'para analisar', 'cadastros', analise.length ? 'warn' : '')}
        ${kpi('rd-k-emp', 'Empresas ativas', String(at.length), susp.length ? `${susp.length} suspensa${susp.length > 1 ? 's' : ''}` : 'na rede', 'redeempresas')}
        ${kpi('rd-k-rec', 'Recebido no mês', brl(recebido), `${brl(aReceber)} em aberto`, 'mensalidades', '')}
        ${kpi('rd-k-atr', 'Mensalidades atrasadas', String(atr.length), atr.length ? brl(atrTot) : 'nenhuma', 'mensalidades/mes/atrasadas', atr.length ? 'danger' : '')}
      </div>
      <div class="grid-main">
        <div class="stack">
          <section class="card" id="rd-precisa"><div class="card-h"><span class="ic">${ic('alert')}</span><h3>Precisa de você</h3>${precisa.length ? `<span class="count">${precisa.length}</span>` : ''}</div><div class="card-b">
            ${precisa.length ? `<div class="pv-lista">${precisa.map(([i, t, s, r]) => `<a class="pv-it" href="#${esc(r)}"><span class="ic">${ic(i)}</span><span class="t"><strong>${esc(t)}</strong><small>${esc(s)}</small></span>${ic('chev')}</a>`).join('')}</div>`
              : `<div class="pv-ok">${ic('check')}Tudo em dia na rede.</div>`}</div></section>
          <section class="card" id="rd-ultimas"><div class="card-h"><span class="ic">${ic('clock')}</span><h3>O que aconteceu por último</h3><a class="linkbtn" style="margin-left:auto" href="#historico">Ver tudo</a></div>
            ${x.logs.length ? `<ul class="feed">${x.logs.sort((a, b) => ms(b.em) - ms(a.em)).map(l => `<li><span class="b"></span><div><p>${esc(l.texto)}</p><small>${esc(formatarDataHora(l.em))}${l.quem ? ' · ' + esc(l.quem) : ''}</small></div></li>`).join('')}</ul>`
              : '<div class="card-b"><p class="hint" style="margin:0">Nada registrado ainda.</p></div>'}</section>
        </div>
        <div class="stack">
          <section class="card" id="rd-planos"><div class="card-h"><span class="ic">${ic('grid')}</span><h3>Empresas por plano</h3></div><div class="card-b stack" style="gap:10px">
            ${porPlano.length ? porPlano.map(([k, n]) => `<div class="ng-cli"><span>${esc(k ? P().nomePlano(k) : 'Sem plano')}</span><div class="ng-bar sm"><i style="width:${Math.round(n / maxP * 100)}%"></i></div><b>${n}</b></div>`).join('') : '<p class="hint" style="margin:0">Nenhuma empresa ativa ainda.</p>'}
            <p class="hint" style="margin:4px 0 0;font-size:12.5px" id="rd-receita">Mensalidades das empresas ativas: <b>${esc(brl(receitaMes))}</b> por mês${semValor.length ? ' (falta o valor de ' + esc(semValor.map(P().nomePlano).join(', ')) + ')' : ''}.</p></div></section>
          <section class="card" id="rd-docs"><div class="card-h"><span class="ic">${ic('file')}</span><h3>Documentos da rede</h3></div><div class="card-b">
            <dl class="dl"><div><dt>Vencidos</dt><dd id="rd-vencidos" style="${vencidos.length ? 'color:var(--danger)' : ''}">${vencidos.length}</dd></div><div><dt>Vencem em 30 dias</dt><dd id="rd-vencendo" style="${vencendo.length ? 'color:var(--warn)' : ''}">${vencendo.length}</dd></div></dl>
            ${vencidos.concat(vencendo).slice(0, 5).map(d => `<p style="margin:10px 0 0;font-size:13px"><b>${esc(nomes[d.empresaId])}</b> · ${esc(d.nome || d.tipo)} · ${d.validade < h ? '<span style="color:var(--danger)">venceu em ' : 'vence em '}${esc(dataBR(d.validade))}${d.validade < h ? '</span>' : ''}</p>`).join('')}</div></section>
          <section class="card" id="rd-avisos"><div class="card-h"><span class="ic">${ic('send')}</span><h3>Avisos no ar</h3><a class="linkbtn" style="margin-left:auto" href="#avisos">${avisosNoAr.length ? 'Ver' : 'Publicar'}</a></div><div class="card-b">
            ${avisosNoAr.length ? avisosNoAr.slice(0, 3).map(a => `<p style="margin:0 0 8px;font-size:13.5px"><b>${esc(a.titulo)}</b><br><small class="hint">${esc(PARA[a.para] || '')}${a.ate ? ' · até ' + esc(dataBR(a.ate)) : ''}</small></p>`).join('') : '<p class="hint" style="margin:0">Nenhum aviso no ar para as empresas.</p>'}</div></section>
        </div>
      </div>`;
  }
  const PARA = { todos: 'Para toda a rede', tomadores: 'Para quem contrata', prestadores: 'Para quem presta serviço' };

  /* ---------- Empresas: lista ---------- */
  let filtro = 'aprovado', busca = '';
  const CHIPS = [['aprovado', 'Ativas'], ['suspenso', 'Suspensas'], ['todos', 'Todas']];
  function mensDaEmpresa(id) { return (D.mens || []).filter(m => m.empresaId === id).sort((a, b) => b.comp.localeCompare(a.comp)); }
  function resumoMens(id) {
    const ms_ = mensDaEmpresa(id), atr = ms_.filter(m => sitMens(m).k === 'atrasada');
    if (atr.length) return pill('danger', atr.length === 1 ? 'Atrasada' : `${atr.length} atrasadas`);
    const ult = ms_[0]; if (!ult) return pill('gray', 'Sem mensalidade');
    const s = sitMens(ult); return s.k === 'paga' || s.k === 'isenta' ? pill('ok', 'Em dia') : pill('info', 'Em aberto');
  }
  function lista(el) {
    const { esc, ic, avatar } = U();
    if (!carregou()) { carregando(el, 'Carregando as empresas…'); return; }
    const base = D.empresas.filter(e => ['aprovado', 'suspenso'].includes(e.status));
    const conta = k => k === 'todos' ? base.length : base.filter(e => e.status === k).length;
    const q = busca.trim().toLowerCase();
    const xs = base.filter(e => (filtro === 'todos' || e.status === filtro) && (!q || [nomeEmp(e), e.razao, e.cnpj, e.cidade].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => nomeEmp(a).localeCompare(nomeEmp(b), 'pt-BR'));
    el.innerHTML = `<div class="card" id="re-lista"><div class="card-h" style="flex-wrap:wrap;gap:10px"><div class="filters">${CHIPS.map(([k, l]) => `<button class="chip" data-filtro="${k}" aria-pressed="${filtro === k}">${l}<b>${conta(k)}</b></button>`).join('')}</div>
        <label class="f" style="margin-left:auto;min-width:220px;flex:1;max-width:340px"><input id="re-busca" placeholder="Buscar por nome, CNPJ ou cidade" value="${esc(busca)}" autocomplete="off"></label></div>
      ${xs.length ? `<div class="scroll"><table class="resp"><thead><tr><th>Empresa</th><th>Uso</th><th>Plano</th><th>Módulos</th><th>Mensalidade</th><th>Situação</th><th></th></tr></thead><tbody>
        ${xs.map(e => `<tr class="click" data-ver="${esc(e._id)}" tabindex="0">
          <td class="m-full"><div class="cell">${avatar(nomeEmp(e), '', e._id)}<div style="min-width:0"><strong>${esc(nomeEmp(e))}</strong><small>${esc([e.cnpj, [e.cidade, e.uf].filter(Boolean).join('/')].filter(Boolean).join(' · '))}</small></div></div></td>
          <td class="m-hide">${esc(TIPOS[e.tipo] || '')}</td><td>${esc(P().nomePlano(e.plano) || '—')}</td><td class="m-hide">${(e.modulos || []).length}</td>
          <td>${resumoMens(e._id)}</td><td>${CW.sessao.pillStatus(e.status)}</td>
          <td class="r"><button class="btn sec sm" data-ver="${esc(e._id)}">Abrir</button></td></tr>`).join('')}</tbody></table></div>`
        : `<div class="empty"><div class="ic">${ic('building')}</div><strong>${q ? 'Nenhuma empresa encontrada.' : 'Nenhuma empresa nesta situação.'}</strong>${filtro === 'aprovado' && !q ? '<span>As empresas aparecem aqui depois que o cadastro é aprovado em Cadastros.</span>' : ''}</div>`}</div>`;
    el.querySelectorAll('[data-filtro]').forEach(b => b.onclick = () => { filtro = b.dataset.filtro; lista(el); });
    const bi = document.getElementById('re-busca');
    bi.oninput = () => { busca = bi.value; const pos = bi.selectionStart; lista(el); const n = document.getElementById('re-busca'); n.focus(); n.setSelectionRange(pos, pos); };
    el.querySelectorAll('[data-ver]').forEach(r => { const ir = ev => { ev.stopPropagation(); CW.ir('redeempresas/ver/' + r.dataset.ver); };
      r.onclick = ir; if (r.tagName === 'TR') r.onkeydown = ev => { if (ev.key === 'Enter') ir(ev); }; });
  }

  /* ---------- Empresas: uma empresa ---------- */
  async function ver(el, ctx, id) {
    const { esc, ic, avatar } = U();
    if (!carregou()) { carregando(el, 'Abrindo a empresa…'); return; }
    const e = D.empresas.find(x => x._id === id);
    if (!e) { el.innerHTML = `<div class="card"><div class="empty"><div class="ic">${ic('building')}</div><strong>Empresa não encontrada.</strong><button class="btn sec sm" id="re-voltar">${ic('back')}Voltar para a lista</button></div></div>`; document.getElementById('re-voltar').onclick = () => CW.ir('redeempresas'); return; }
    let pessoas = [];
    try { pessoas = CW.fb.lista(await CW.fb.db().collection('acessos').where('empresaId', '==', id).get()); } catch (err) { console.warn(err); }
    if (!document.body.contains(el)) return;
    document.getElementById('titulo').textContent = nomeEmp(e);
    const ms_ = mensDaEmpresa(id).slice(0, 12), valores = (D.planos || {}).valores || {};
    const mods = (e.modulos || []).map(m => (P().MODULOS_CONTRATAVEIS.find(x => x.id === m) || { nome: m }).nome);
    el.innerHTML = `<div style="margin-bottom:14px"><button class="linkbtn" id="re-voltar">${ic('back')}Voltar para a lista</button></div>
      <section class="card" style="margin-bottom:22px"><div class="card-b profile">${avatar(nomeEmp(e), 'lg', id)}<div class="t"><h2 id="re-nome">${esc(nomeEmp(e))}</h2>
        <div class="meta">${CW.sessao.pillStatus(e.status)}<span class="tag gray">${esc(TIPOS[e.tipo] || '')}</span>${e.cnpj ? `<span class="tag gray">${esc(e.cnpj)}</span>` : ''}${e.plano ? `<span class="tag">${esc(P().nomePlano(e.plano))}</span>` : ''}</div></div></div></section>
      ${e.status === 'suspenso' ? `<div class="banner danger" id="re-suspensa">${ic('lock')}<span><strong>Acesso suspenso${e.avaliadoEm ? ' em ' + esc(U().formatarData(e.avaliadoEm)) : ''}</strong>${esc(e.motivo || '')} A empresa só vê o Início, Meu cadastro e Documentos, com este motivo.</span></div>` : ''}
      <div class="grid-main"><div class="stack">
        <section class="card" id="re-plano"><div class="card-h"><span class="ic">${ic('grid')}</span><h3>Plano e módulos</h3><a class="linkbtn" style="margin-left:auto" href="#cadastros/analise/${esc(id)}" id="re-mudar">Mudar</a></div><div class="card-b">
          <dl class="dl"><div><dt>Plano</dt><dd>${esc(P().nomePlano(e.plano) || 'Sem plano')}</dd></div><div><dt>Mensalidade do plano</dt><dd>${valores[e.plano] > 0 ? esc(brl(valores[e.plano])) : e.plano === 'gratuito' ? 'Grátis' : 'Valor a definir'}</dd></div>
            <div class="full"><dt>Módulos liberados</dt><dd style="font-weight:400">${mods.length ? mods.map(m => `<span class="tag gray">${esc(m)}</span>`).join(' ') : 'Nenhum'}</dd></div></dl></div></section>
        <section class="card" id="re-pessoas"><div class="card-h"><span class="ic">${ic('users')}</span><h3>Pessoas</h3><span class="count">${pessoas.length}</span></div>
          ${pessoas.length ? `<div class="scroll"><table class="resp"><thead><tr><th>Pessoa</th><th>Cargo</th><th>Situação</th></tr></thead><tbody>${pessoas.sort((a, b) => String(a.nome || a.email).localeCompare(String(b.nome || b.email), 'pt-BR')).map(a => `<tr>
            <td class="m-full"><div class="cell">${avatar(a.nome || a.email || '?', 'sm')}<div style="min-width:0"><strong>${esc(a.nome || a.email || 'Pessoa sem nome')}</strong><small>${esc(a.email || '')}</small></div></div></td>
            <td>${esc(P().nomeCargo(a.cargo))}</td><td>${a.ativo ? pill('ok', 'Ativo') : pill('danger', 'Bloqueado')}</td></tr>`).join('')}</tbody></table></div>`
            : '<div class="card-b"><p class="hint" style="margin:0">Nenhuma pessoa ligada a esta empresa.</p></div>'}</section>
      </div><div class="stack">
        <section class="card" id="re-acoes"><div class="card-h"><span class="ic">${ic('shield')}</span><h3>Ações da equipe</h3></div><div class="card-b stack" style="gap:10px">
          <button class="btn" id="re-vercomo">${ic('eye')}Ver como a empresa</button>
          ${e.status === 'aprovado' ? ((CW.sessao.estado().opcoes || []).some(o => o.tipo === 'empresa' && o.empresaId === id)
            ? `<button class="btn sec" id="re-entrar">${ic('building')}Entrar nesta empresa (sou administrador(a))</button><button class="btn ghost" id="re-sairadm">${ic('logout')}Sair da administração</button>`
            : `<button class="btn sec" id="re-souadm">${ic('plus')}Me colocar como administrador(a)</button><p class="hint" style="margin:-4px 0 0;font-size:12.5px">Você passa a ser administrador(a) de verdade desta empresa: pode confirmar contratos, medições e notas por ela.</p>`) : ''}
          <p class="hint" style="margin:-4px 0 4px;font-size:12px">Abre o Conectwork como o administrador da empresa vê, só para consultar. Nada pode ser alterado no lugar da empresa.</p>
          <a class="btn sec" href="#cadastros/analise/${esc(id)}" id="re-cadastro">${ic('file')}Ver o cadastro completo</a>
          ${e.status === 'suspenso' ? `<button class="btn ok" id="re-reativar">${ic('check')}Reativar o acesso</button>`
            : `<button class="btn dangerous" id="re-suspender">${ic('lock')}Suspender o acesso</button>`}
        </div></section>
        <section class="card" id="re-mens"><div class="card-h"><span class="ic">${ic('wallet')}</span><h3>Mensalidades</h3><a class="linkbtn" style="margin-left:auto" href="#mensalidades">Ver todas</a></div>
          ${ms_.length ? `<ul class="feed">${ms_.map(m => { const s = sitMens(m); return `<li><span class="b ${s.c === 'danger' ? 'danger' : s.c === 'ok' ? 'ok' : ''}"></span><div><p><b>${esc(nomeMes(m.comp))}</b> · ${esc(brl(m.valorCentavos))} ${pill(s.c, s.t)}</p><small>Vence em ${esc(dataBR(m.venc))}</small></div></li>`; }).join('')}</ul>`
            : '<div class="card-b"><p class="hint" style="margin:0">Nenhuma mensalidade gerada para esta empresa.</p></div>'}</section>
      </div></div>`;
    document.getElementById('re-voltar').onclick = () => CW.ir('redeempresas');
    const rEn = document.getElementById('re-entrar'); if (rEn) rEn.onclick = () => CW.sessao.entrarEm('empresa:' + id);
    const rSa = document.getElementById('re-sairadm'); if (rSa) rSa.onclick = async () => { try { await CW.cadastrosMaster.sairAdm(id, nomeEmp(e), 'redeempresas/ver/' + id); } catch (err) { U().toast(CW.fb.mensagemErro(err), 'erro'); } };
    const rAd = document.getElementById('re-souadm'); if (rAd) rAd.onclick = async () => { rAd.disabled = true;
      try { await CW.cadastrosMaster.adminDe(id, nomeEmp(e)); U().toast('Pronto: você é administrador(a) de ' + nomeEmp(e) + '.'); await CW.sessao.recarregar(); CW.sessao.entrarEm('empresa:' + id); }
      catch (err) { rAd.disabled = false; U().toast(CW.fb.mensagemErro(err), 'erro'); } };
    document.getElementById('re-vercomo').onclick = ev => { ev.currentTarget.disabled = true; CW.sessao.verComo(id).catch(err => { U().toast(CW.fb.mensagemErro(err), 'erro'); ev.currentTarget.disabled = false; }); };
    const sp = document.getElementById('re-suspender');
    if (sp) sp.onclick = () => suspender(ctx, e);
    const rt = document.getElementById('re-reativar');
    if (rt) rt.onclick = async () => {
      if (!(await U().confirmar('Reativar o acesso?', `A ${nomeEmp(e)} volta a ver as telas do plano.`, 'Reativar'))) return;
      const b = CW.fb.db().batch();
      b.update(CW.fb.db().doc('empresas/' + id), { status: 'aprovado', motivo: '', avaliadoEm: CW.fb.agora(), avaliadoPor: quemSou(ctx) });
      log(b, ctx, id, 'empresa.reativar', `Acesso de ${nomeEmp(e)} reativado.`, id);
      try { await b.commit(); U().toast(`Acesso de ${nomeEmp(e)} reativado.`); } catch (err) { U().toast(CW.fb.mensagemErro(err), 'erro'); }
    };
  }

  function suspender(ctx, e) {
    U().dialogo({ titulo: 'Suspender o acesso', sub: `${nomeEmp(e)} vai ver só o Início, Meu cadastro e Documentos (para regularizar), com o motivo abaixo. Os dados da empresa continuam guardados e nada se apaga.`,
      corpo: `<label class="f"><span>Motivo (aparece para a empresa)</span><textarea id="re-motivo" rows="3" maxlength="300" placeholder="Ex.: Mensalidade de outubro em atraso. Fale com a equipe Conectwork."></textarea><em class="ferr" id="re-motivo-erro"></em></label>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Suspender', valor: 'ok', classe: 'dangerous', antes: d => {
        const m = d.querySelector('#re-motivo').value.trim();
        if (m.length < 10) { d.querySelector('#re-motivo-erro').textContent = 'Escreva o motivo (pelo menos 10 letras).'; return false; }
        d._m = m; return true; } }],
      aoAbrir: d => { d.querySelector('#re-motivo').focus(); window.__reDlg = d; }
    }).then(async v => {
      const d = window.__reDlg; window.__reDlg = null;
      if (v !== 'ok' || !d) return;
      const b = CW.fb.db().batch();
      b.update(CW.fb.db().doc('empresas/' + e._id), { status: 'suspenso', motivo: d._m, avaliadoEm: CW.fb.agora(), avaliadoPor: quemSou(ctx) });
      log(b, ctx, e._id, 'empresa.suspender', `Acesso de ${nomeEmp(e)} suspenso: ${d._m}`, e._id);
      try { await b.commit(); U().toast(`Acesso de ${nomeEmp(e)} suspenso.`); } catch (err) { U().toast(CW.fb.mensagemErro(err), 'erro'); }
    });
  }

  /* redesenha a tela aberta da equipe quando os dados da rede mudam */
  window.addEventListener('cw:rede', () => {
    const at = CW.app && CW.app.atual(), el = document.getElementById('view'), c = CW.sessao.contexto();
    if (!at || !el || !c || c.tipo !== 'master') return;
    const ctx = Object.assign({ modulo: at.modulo, tela: at.tela, params: (decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/').filter(Boolean)).slice(2) }, { contexto: c, sessao: CW.sessao.estado(), soLeitura: false });
    if (at.modulo === 'inicio') painel(el, ctx);
    else if (at.modulo === 'redeempresas' && at.tela === 'lista' && !el.contains(document.activeElement)) lista(el);
    else if (at.modulo === 'redeempresas' && at.tela === 'ver') ver(el, ctx, ctx.params[0]);
    else if (CW.rede.redesenhar[at.modulo]) CW.rede.redesenhar[at.modulo](el, ctx);
  });

  CW.rede = { D, painel, sitMens, atrasadas, mesAtual, somaMes, nomeMes, dataBR, hoje, brl, nomeEmp, quemSou, log, pill, carregou, carregando, erroHtml, TIPOS, PARA, ativas, redesenhar: {} };

  CW.registrarModulo({
    id: 'redeempresas', nome: 'Empresas', icone: 'grid', ordem: 11,
    para: ['master'],
    iniciar: () => ligar(),
    telas: {
      lista: { nome: 'Empresas', sub: 'As empresas da rede: plano, módulos, mensalidade e pessoas.', render: el => lista(el) },
      ver: { nome: 'Empresa', sub: 'Plano, pessoas, mensalidades e as ações da equipe.', render: (el, ctx) => ver(el, ctx, ctx.params[0]) }
    }
  });
})();
