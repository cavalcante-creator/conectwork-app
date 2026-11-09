/* Conectwork · Agenda e lembretes (10/11/2026, perfil do profissional/prestadora).
   - Compromissos (com cliente, local e hora) e lembretes (pagar algo, renovar um documento, ligar para alguém), com
     repetição (toda semana, todo mês, todo ano) e aviso (na hora, 15 min, 1 hora ou 1 dia antes). Guardados em
     agenda/{id} da empresa; nada se apaga (removido:true) e cada mudança vai para o histórico.
   - Prazos automáticos, sem digitar nada, com o que as outras telas já carregaram (nenhuma leitura nova):
     DAS e declaração anual (Meu negócio), contas a receber (Pagar e receber), demandas aceitas com prazo
     (Ordens de serviço) e documentos com validade (Documentos e certidões).
   - Lembrete dentro do app: "Precisa de você" e número no ícone no dia; com o app aberto, aviso na tela e no navegador
     (se a pessoa deixar). WhatsApp, e-mail e aviso com o app fechado precisam de servidor (etapa futura). */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const EDITA = ['admin', 'financeiro', 'operacional'];
  const REPETE = { '': 'Não repete', semana: 'Toda semana', mes: 'Todo mês', ano: 'Todo ano' };
  const AVISO = { '': 'Sem aviso', 0: 'Na hora', 15: '15 minutos antes', 60: '1 hora antes', 1440: '1 dia antes' };
  const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const pode = ctx => !ctx.soLeitura && EDITA.includes(ctx.contexto.acesso && ctx.contexto.acesso.cargo);
  const quem = ctx => (ctx.sessao.perfil && ctx.sessao.perfil.nome) || ctx.sessao.usuario.email;
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hoje = () => iso(new Date());
  const somaDias = (s, n) => { const d = new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); d.setDate(d.getDate() + n); return iso(d); };
  const dataBR = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
  const diaTxt = s => { const h = hoje(); if (s === h) return 'Hoje'; if (s === somaDias(h, 1)) return 'Amanhã'; if (s === somaDias(h, -1)) return 'Ontem';
    const d = new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); const t = `${SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`; return t[0].toUpperCase() + t.slice(1); };

  const ehMei = ctx => { let p = ''; try { p = sessionStorage.getItem('cw.porte.' + ctx.empresaId) || ''; } catch (e) {} return String(p).startsWith('MEI'); };
  let itens = null, timer = null, sel = null, mesVis = null;   /* itens: os da agenda (sem os removidos) */

  /* ---------- ocorrências: um item com repetição vira várias datas dentro da janela ---------- */
  function ocorrencias(x, de, ate) {
    const out = [], ok = d => d >= de && d <= ate;
    if (!x.repete) { if (ok(x.data)) out.push(x.data); return out; }
    let d = x.data, n = 0;
    while (d <= ate && n < 400) {
      if (d >= de) out.push(d);
      n++;
      if (x.repete === 'semana') d = somaDias(x.data, 7 * n);
      else { const b = new Date(+x.data.slice(0, 4), +x.data.slice(5, 7) - 1, 1), k = x.repete === 'mes' ? n : 12 * n;
        b.setMonth(b.getMonth() + k); const ult = new Date(b.getFullYear(), b.getMonth() + 1, 0).getDate();
        d = iso(new Date(b.getFullYear(), b.getMonth(), Math.min(+x.data.slice(8, 10), ult))); }
    }
    return out;
  }
  const feitoEm = (x, d) => x.repete ? (x.feitos || []).includes(d) : !!x.feito;

  /* ---------- prazos automáticos: o que as outras telas já têm ---------- */
  function automaticos(ctx) {
    const out = [], fis = CW.negocio && CW.negocio.fiscal && CW.negocio.fiscal();
    if (fis) {
      fis.das.filter(x => !x.pago).forEach(x => out.push({ auto: 'das', data: x.venc, titulo: `Pagar o DAS de ${MESES[+x.m.slice(5, 7) - 1]}`, sub: 'Guia mensal do MEI · vence todo dia 20', rota: 'negocio', icone: 'receipt' }));
      if (!fis.dasn.entregue) out.push({ auto: 'dasn', data: fis.dasn.prazo, titulo: `Entregar a declaração anual (DASN-SIMEI) de ${fis.dasn.ano}`, sub: 'Prazo: 31 de maio', rota: 'negocio', icone: 'file' });
    }
    const tit = CW.titulos && CW.titulos.proximos ? CW.titulos.proximos(ctx, 50) || [] : [];
    tit.filter(t => t.lado === 'prestador' && t.vencIso).forEach(t => out.push({ auto: 'receber', data: t.vencIso, titulo: `Receber ${t.valor} de ${t.nome}`, sub: 'Pagamento da nota', rota: 'titulos/ver/' + t.id, icone: 'wallet' }));
    const os = CW.ordens && CW.ordens.lista ? CW.ordens.lista() : [];
    os.filter(o => o.prestadorId === ctx.contexto.empresaId && o.status === 'aceita' && o.prazo).forEach(o => out.push({ auto: 'os', data: o.prazo, titulo: `Entregar: ${o.titulo}`, sub: `Demanda ${o.numero} de ${o.tomadorNome}`, rota: 'ordens/ver/' + o._id, icone: 'clipboard' }));
    const docs = CW.documentos && CW.documentos.comValidade ? CW.documentos.comValidade() : [];
    docs.forEach(d => out.push({ auto: 'doc', data: somaDias(d.validade, -15), titulo: `Renovar: ${d.nome}`, sub: `Vence em ${dataBR(d.validade)}`, rota: 'documentos', icone: 'folder' }));
    return out;
  }

  /* tudo junto, por data: os da agenda (cada ocorrência) e os automáticos */
  function linhas(ctx, de, ate) {
    const out = [];
    (itens || []).forEach(x => ocorrencias(x, de, ate).forEach(d => out.push({ x, data: d, hora: x.hora || '', feito: feitoEm(x, d) })));
    automaticos(ctx).filter(a => a.data >= de && a.data <= ate).forEach(a => out.push({ a, data: a.data, hora: '', feito: false }));
    return out.sort((p, q) => p.data.localeCompare(q.data) || (p.hora || '99').localeCompare(q.hora || '99'));
  }

  /* ---------- tela ---------- */
  function linhaHtml(l, ctx) {
    const { esc, ic } = U(), ed = pode(ctx);
    if (l.a) return `<div class="ag-it ag-auto" data-rota="${esc(l.a.rota)}"><span class="ag-h">${l.data < hoje() ? '<b class="ag-atr">atrasado</b>' : 'o dia todo'}</span><span class="ag-ic">${ic(l.a.icone)}</span>
      <div class="ag-t"><strong>${esc(l.a.titulo)}</strong><small>${esc(l.a.sub)} · <span class="ag-tag">automático</span></small></div><button class="btn sm sec" data-ir="${esc(l.a.rota)}">Abrir</button></div>`;
    const x = l.x, extra = [x.cliente, x.local, x.repete ? REPETE[x.repete].toLowerCase() : '', x.avisar !== '' && x.avisar != null ? 'aviso ' + AVISO[x.avisar].toLowerCase() : ''].filter(Boolean).join(' · ');
    return `<div class="ag-it ${l.feito ? 'ag-feito' : ''}" data-id="${esc(x._id)}" data-dia="${l.data}"><span class="ag-h">${l.hora ? esc(l.hora) : x.tipo === 'lembrete' ? 'lembrete' : 'o dia todo'}</span>
      ${ed ? `<button class="ag-chk" data-feito="${esc(x._id)}" data-dia="${l.data}" aria-label="${l.feito ? 'Marcar como não feito' : 'Marcar como feito'}: ${esc(x.titulo)}" aria-pressed="${l.feito}">${l.feito ? ic('check') : ''}</button>` : `<span class="ag-ic">${ic(x.tipo === 'lembrete' ? 'clock' : 'user')}</span>`}
      <div class="ag-t"><strong>${esc(x.titulo)}</strong>${extra || x.obs ? `<small>${esc(extra)}${x.obs ? (extra ? ' · ' : '') + esc(x.obs) : ''}</small>` : ''}</div>
      ${ed ? `<button class="iconbtn" data-editar="${esc(x._id)}" aria-label="Mudar: ${esc(x.titulo)}" title="Mudar">${ic('edit')}</button>` : ''}</div>`;
  }

  function calendario(ctx) {
    const { esc } = U(), h = hoje(), m = mesVis || h.slice(0, 7), ano = +m.slice(0, 4), mes = +m.slice(5, 7) - 1;
    const ini = new Date(ano, mes, 1), dias = new Date(ano, mes + 1, 0).getDate(), pad = ini.getDay();
    const de = `${m}-01`, ate = `${m}-${String(dias).padStart(2, '0')}`, por = {};
    linhas(ctx, de, ate).forEach(l => { if (!l.feito) por[l.data] = (por[l.data] || 0) + 1; });
    let cel = Array.from({ length: pad }, () => '<span></span>').join('');
    for (let d = 1; d <= dias; d++) { const s = `${m}-${String(d).padStart(2, '0')}`, n = por[s] || 0;
      cel += `<button class="ag-dia ${s === h ? 'hoje' : ''} ${s === sel ? 'sel' : ''} ${s < h ? 'passou' : ''}" data-dia="${s}" aria-label="${d} de ${MESES[mes]}${n ? ', ' + n + (n === 1 ? ' item' : ' itens') : ''}">${d}${n ? `<i>${n > 9 ? '9+' : n}</i>` : ''}</button>`; }
    return `<section class="card" id="ag-cal"><div class="card-h"><button class="iconbtn" id="ag-mes-ant" aria-label="Mês anterior">‹</button><h3 style="flex:1;text-align:center">${esc(MESES[mes][0].toUpperCase() + MESES[mes].slice(1))} de ${ano}</h3><button class="iconbtn" id="ag-mes-prox" aria-label="Próximo mês">›</button></div>
      <div class="card-b"><div class="ag-sem">${SEMANA.map(s => `<span>${s}</span>`).join('')}</div><div class="ag-grade">${cel}</div>
      ${sel ? `<button class="linkbtn" id="ag-todos" style="margin-top:10px">Ver os próximos 30 dias</button>` : ''}</div></section>`;
  }

  function avisosHtml() {
    const { ic } = U(), tem = 'Notification' in window, st = tem ? Notification.permission : 'nao';
    return `<section class="card" id="ag-avisos"><div class="card-h"><span class="ic">${ic('bolt')}</span><h3>Avisos</h3></div><div class="card-b">
      <p class="hint" style="margin:0 0 12px">Com o Conectwork aberto, o aviso aparece na tela na hora marcada. No dia, o item entra em "Precisa de você" e no número do ícone do app.</p>
      ${st === 'granted' ? `<p style="margin:0" id="ag-not-ok"><span class="pill ok">Avisos do navegador ligados</span></p>`
        : st === 'denied' ? `<p class="hint" style="margin:0" id="ag-not-neg">O navegador está bloqueando os avisos. Para ligar, toque no cadeado ao lado do endereço e permita notificações.</p>`
        : tem ? `<button class="btn sec" id="ag-not">${ic('bolt')}Ligar avisos do navegador</button>` : ''}
      <p class="hint" style="margin:12px 0 0;font-size:12px">Aviso por WhatsApp ou e-mail, com o app fechado, chega numa próxima etapa.</p></div></section>`;
  }

  function desenhar(el, ctx) {
    const { ic } = U(), h = hoje();
    document.getElementById('acoes').innerHTML = pode(ctx) ? `<button class="btn sec" id="ag-novo-lem">${ic('clock')}Novo lembrete</button><button class="btn" id="ag-novo">${ic('plus')}Novo compromisso</button>` : '';
    if (!itens) { el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Carregando a agenda…</span></div></div>`; return; }
    const atras = linhas(ctx, somaDias(h, -60), somaDias(h, -1)).filter(l => !l.feito);
    const lista = sel ? linhas(ctx, sel, sel) : linhas(ctx, h, somaDias(h, 30));
    const grupos = {}; lista.forEach(l => { (grupos[l.data] = grupos[l.data] || []).push(l); });
    const corpo = Object.keys(grupos).map(d => `<div class="ag-g"><h4>${diaTxt(d)}<small>${dataBR(d)}</small></h4>${grupos[d].map(l => linhaHtml(l, ctx)).join('')}</div>`).join('');
    el.innerHTML = `<div class="ag-grid"><div class="stack" style="gap:22px">
      ${!sel && atras.length ? `<section class="card" id="ag-atras"><div class="card-h"><span class="ic">${ic('alert')}</span><h3>Ficou para trás</h3><span class="count">${atras.length}</span></div><div class="card-b ag-lista">${atras.map(l => linhaHtml(l, ctx)).join('')}</div></section>` : ''}
      <section class="card" id="ag-lista"><div class="card-h"><span class="ic">${ic('clock')}</span><h3>${sel ? diaTxt(sel) : 'Próximos 30 dias'}</h3></div><div class="card-b ag-lista">
        ${corpo || `<div class="empty" id="ag-vazio"><div class="ic">${ic('clock')}</div><strong>${sel ? 'Nada marcado neste dia.' : 'Nada marcado para os próximos dias.'}</strong><span>Marque visitas a clientes, entregas e lembretes. Os prazos do DAS, das contas a receber, das demandas e dos documentos entram aqui sozinhos.</span></div>`}</div></section>
      </div><div class="stack" style="gap:22px">${calendario(ctx)}${avisosHtml()}</div></div>
      <p class="hint" style="margin:14px 0 0;font-size:12px">Os prazos automáticos vêm das outras telas do Conectwork. Confirme as datas dos impostos com o seu contador.</p>`;
    ligar(el, ctx);
  }

  function ligar(el, ctx) {
    const re = () => desenhar(el, ctx);
    const n = document.getElementById('ag-novo'); if (n) n.onclick = () => formulario(ctx, null, 'compromisso');
    const nl = document.getElementById('ag-novo-lem'); if (nl) nl.onclick = () => formulario(ctx, null, 'lembrete');
    el.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => CW.ir(b.dataset.ir));
    el.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => formulario(ctx, (itens || []).find(x => x._id === b.dataset.editar)));
    el.querySelectorAll('[data-feito]').forEach(b => b.onclick = () => marcar(ctx, (itens || []).find(x => x._id === b.dataset.feito), b.dataset.dia));
    el.querySelectorAll('.ag-dia').forEach(b => b.onclick = () => { sel = sel === b.dataset.dia ? null : b.dataset.dia; re(); });
    const t = document.getElementById('ag-todos'); if (t) t.onclick = () => { sel = null; re(); };
    const mv = k => { const m = mesVis || hoje().slice(0, 7), d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + k, 1); mesVis = iso(d).slice(0, 7); re(); };
    document.getElementById('ag-mes-ant').onclick = () => mv(-1); document.getElementById('ag-mes-prox').onclick = () => mv(1);
    const nt = document.getElementById('ag-not'); if (nt) nt.onclick = () => Notification.requestPermission().then(() => re());
  }

  /* ---------- gravar ---------- */
  function grava(ctx, f, ok) {
    const db = CW.fb.db(), b = db.batch(); f(b, db);
    return b.commit().then(() => { if (ok) U().toast(ok); }).catch(e => U().toast(CW.fb.mensagemErro(e), 'erro'));
  }
  const log = (b, ctx, acao, texto, ref) => CW.log.logNoLote(b, acao, texto, ref);

  async function formulario(ctx, x, tipo) {
    const { esc, ic } = U(); tipo = x ? x.tipo : tipo;
    const v = x || { tipo, titulo: '', data: sel || hoje(), hora: tipo === 'compromisso' ? '09:00' : '', cliente: '', local: '', obs: '', repete: '', avisar: tipo === 'compromisso' ? 60 : 0 };
    const opt = (o, at) => Object.entries(o).map(([k, t]) => `<option value="${k}" ${String(at ?? '') === String(k) ? 'selected' : ''}>${esc(t)}</option>`).join('');
    let res = null;
    const r = await U().dialogo({ titulo: x ? (tipo === 'lembrete' ? 'Mudar lembrete' : 'Mudar compromisso') : (tipo === 'lembrete' ? 'Novo lembrete' : 'Novo compromisso'),
      sub: tipo === 'lembrete' ? 'Algo para não esquecer: pagar, renovar, ligar, mandar.' : 'Visita, reunião ou serviço marcado com um cliente.',
      corpo: `<div class="fgrid">
        <label class="f c12"><span>${tipo === 'lembrete' ? 'Lembrar de' : 'O que é'}</span><input id="ag-tit" maxlength="120" value="${esc(v.titulo)}" placeholder="${tipo === 'lembrete' ? 'Ex.: Renovar o alvará' : 'Ex.: Visita técnica'}"></label>
        <label class="f c6"><span>Dia</span><input id="ag-data" type="date" value="${esc(v.data)}"></label>
        <label class="f c6"><span>Hora <i>(opcional)</i></span><input id="ag-hora" type="time" value="${esc(v.hora || '')}"></label>
        ${tipo === 'compromisso' ? `<label class="f c6"><span>Cliente <i>(opcional)</i></span><input id="ag-cli" maxlength="80" value="${esc(v.cliente || '')}"></label>
        <label class="f c6"><span>Onde <i>(opcional)</i></span><input id="ag-loc" maxlength="120" value="${esc(v.local || '')}"></label>` : ''}
        <label class="f c6"><span>Repetir</span><select id="ag-rep">${opt(REPETE, v.repete || '')}</select></label>
        <label class="f c6"><span>Avisar</span><select id="ag-av">${opt(AVISO, v.avisar ?? '')}</select></label>
        <label class="f c12"><span>Anotação <i>(opcional)</i></span><input id="ag-obs" maxlength="300" value="${esc(v.obs || '')}"></label>
        <p class="err c12" id="ag-erro" role="alert"></p></div>`,
      botoes: [].concat(x ? [{ texto: 'Tirar da agenda', valor: 'tirar', classe: 'ghost' }] : [], [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Salvar', icone: 'check', valor: 'ok', antes: d => {
        const g = id => { const e = d.querySelector('#' + id); return e ? e.value.trim() : ''; }, er = d.querySelector('#ag-erro');
        const titulo = g('ag-tit').replace(/\s+/g, ' '), data = g('ag-data');
        if (titulo.length < 2) { er.textContent = 'Escreva o que é.'; return false; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { er.textContent = 'Escolha o dia.'; return false; }
        res = { tipo, titulo, data, hora: g('ag-hora'), cliente: g('ag-cli'), local: g('ag-loc'), obs: g('ag-obs'), repete: g('ag-rep'), avisar: g('ag-av') === '' ? '' : +g('ag-av') };
        return true; } }]),
      aoAbrir: d => d.querySelector('#ag-tit').focus() });
    const emp = ctx.contexto.empresaId, agora = CW.fb.agora, nomeT = tipo === 'lembrete' ? 'Lembrete' : 'Compromisso';
    if (r === 'tirar' && x) {
      if (!(await U().confirmar('Tirar da agenda?', `"${x.titulo}" sai da agenda${x.repete ? ', com todas as repetições' : ''}.`, 'Tirar'))) return;
      return grava(ctx, (b, db) => { b.update(db.doc('agenda/' + x._id), { removido: true, atualizadoEm: agora() }); log(b, ctx, 'agenda.tirar', `${nomeT} "${x.titulo}" tirado da agenda.`, x._id); }, 'Tirado da agenda.');
    }
    if (r !== 'ok' || !res) return;
    if (x) return grava(ctx, (b, db) => { b.update(db.doc('agenda/' + x._id), Object.assign({}, res, { atualizadoEm: agora() })); log(b, ctx, 'agenda.mudar', `${nomeT} "${res.titulo}" mudado para ${dataBR(res.data)}${res.hora ? ' às ' + res.hora : ''}.`, x._id); }, 'Agenda atualizada.');
    return grava(ctx, (b, db) => { const ref = db.collection('agenda').doc();
      b.set(ref, Object.assign({ empresaId: emp }, res, { feito: false, feitos: [], removido: false, criadoPor: ctx.sessao.usuario.uid, criadoPorNome: quem(ctx), criadoEm: agora(), atualizadoEm: agora() }));
      log(b, ctx, 'agenda.criar', `${nomeT} "${res.titulo}" marcado para ${dataBR(res.data)}${res.hora ? ' às ' + res.hora : ''}${res.repete ? ' (' + REPETE[res.repete].toLowerCase() + ')' : ''}.`, ref.id); },
      tipo === 'lembrete' ? 'Lembrete marcado.' : 'Compromisso marcado.');
  }

  function marcar(ctx, x, dia) {
    if (!x) return;
    const agora = CW.fb.agora, ja = feitoEm(x, dia);
    const mud = x.repete ? { feitos: ja ? (x.feitos || []).filter(d => d !== dia) : (x.feitos || []).concat([dia]).slice(-60) } : { feito: !ja };
    return grava(ctx, (b, db) => { b.update(db.doc('agenda/' + x._id), Object.assign(mud, { atualizadoEm: agora() }));
      log(b, ctx, ja ? 'agenda.reabrir' : 'agenda.feito', `"${x.titulo}" de ${dataBR(dia)} ${ja ? 'voltou para a agenda' : 'marcado como feito'}.`, x._id); }, ja ? 'Voltou para a agenda.' : 'Feito.');
  }

  /* ---------- aviso na hora (com o app aberto) ---------- */
  function conferirAvisos(ctx) {
    if (!itens) return;
    const agoraMs = Date.now(), h = hoje();
    linhas(ctx, somaDias(h, -1), somaDias(h, 2)).forEach(l => {
      if (!l.x || l.feito || l.x.avisar === '' || l.x.avisar == null) return;
      const [hh, mm] = (l.x.hora || '09:00').split(':').map(Number), alvo = new Date(+l.data.slice(0, 4), +l.data.slice(5, 7) - 1, +l.data.slice(8, 10), hh, mm).getTime() - (+l.x.avisar) * 60000;
      if (agoraMs < alvo || agoraMs - alvo > 12 * 3600000) return;   /* só na janela de 12 h depois da hora do aviso */
      const k = 'cw.ag.av.' + l.x._id + '.' + l.data; let ja = null; try { ja = localStorage.getItem(k); } catch (e) {}
      if (ja) return; try { localStorage.setItem(k, '1'); } catch (e) {}
      const txt = `${l.x.titulo} · ${diaTxt(l.data).toLowerCase()}${l.x.hora ? ' às ' + l.x.hora : ''}`;
      U().toast((l.x.tipo === 'lembrete' ? 'Lembrete: ' : 'Compromisso: ') + txt);
      try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Conectwork', { body: txt, icon: 'icons/icon-192.png', tag: k }); } catch (e) { /* sem aviso do navegador */ }
    });
  }

  CW.registrarModulo({
    id: 'agenda', nome: 'Agenda e lembretes', nomeCurto: 'Agenda', icone: 'clock', ordem: 27,
    para: ['empresa'], livre: true,
    mostrar: ctx => ['prestador', 'ambos'].includes((ctx.empresa || {}).tipo) && ehMei(ctx),   /* perfil MEI (10/11/2026) */
    iniciar(ctx) {
      itens = null; sel = null; mesVis = null;
      const db = CW.fb.db(), emp = ctx.contexto.empresaId;
      const redesenha = () => { const el = document.getElementById('view'), at = CW.app.atual(); if (el && at && at.modulo === 'agenda') desenhar(el, Object.assign({}, ctx, { sessao: CW.sessao.estado() })); CW.app.pendenciasMudaram(); };
      CW.inscrever('agenda', () => db.collection('agenda').where('empresaId', '==', emp), s => { itens = CW.fb.lista(s).filter(x => !x.removido); redesenha(); conferirAvisos(ctx); }, () => { itens = []; redesenha(); });
      clearInterval(timer); timer = setInterval(() => conferirAvisos(ctx), 30000);
      return () => { clearInterval(timer); itens = null; };
    },
    /* "Precisa de você": o que é da agenda (os automáticos já aparecem pelas próprias telas) */
    pendencias(ctx) {
      if (!itens) return [];
      const h = hoje();
      return linhas(ctx, somaDias(h, -30), h).filter(l => l.x && !l.feito).map(l => ({ txt: (l.data < h ? 'Ficou para trás: ' : l.x.tipo === 'lembrete' ? 'Lembrete: ' : 'Hoje: ') + l.x.titulo,
        sub: (l.data < h ? dataBR(l.data) : 'hoje') + (l.x.hora ? ' às ' + l.x.hora : '') + (l.x.cliente ? ' · ' + l.x.cliente : ''), rota: 'agenda' }));
    },
    buscar(ctx) {
      return (itens || []).map(x => ({ t: x.titulo, s: `${x.tipo === 'lembrete' ? 'Lembrete' : 'Compromisso'} · ${dataBR(x.data)}${x.hora ? ' às ' + x.hora : ''}${x.cliente ? ' · ' + x.cliente : ''}`, rota: 'agenda', txt: [x.cliente, x.local, x.obs, 'agenda'].join(' ') }));
    },
    telas: { lista: { nome: 'Agenda e lembretes', sub: 'Seus compromissos e lembretes, com os prazos do DAS, das contas a receber, das demandas e dos documentos.', render: desenhar } }
  });
  CW.agenda = { linhas, automaticos, ocorrencias, itens: () => itens || [] };
})();
