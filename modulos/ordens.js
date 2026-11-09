/* Conectwork · Ordens de serviço (contrato de serviço por entrega, modalidade "os").
   Feito para o profissional PJ/MEI (e também para prestadoras) trabalhar por entrega, não por hora:
   - quem contrata (admin ou solicitante) propõe a OS: o que entregar (escopo), prazo e valor da entrega;
   - o profissional aceita ou recusa: recusar não tem punição nem reduz reputação;
   - ele decide como, quando e onde faz, e registra a entrega (descrição e, se quiser, um arquivo);
   - quem contrata (admin ou aprovador, nunca quem pediu a OS) aceita total, aceita em parte (com motivo e valor) ou aponta
     divergência (o profissional corrige e entrega de novo);
   - a OS aceita segue o mesmo caminho da medição: espelho da nota, nota do profissional, pagamento e baixa.
   Sem horário, sem ponto, sem ordens disciplinares (CLAUDE.md, regra 5). */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const ST = { proposta: ['warn', 'Esperando resposta'], recusada: ['info', 'Recusada'], aceita: ['info', 'Em execução'], entregue: ['warn', 'Entregue · esperando aceite'],
    divergencia: ['danger', 'Divergência na entrega'], aceita_total: ['ok', 'Aceita'], aceita_parcial: ['ok', 'Aceita em parte'], cancelada: ['info', 'Cancelada'] };
  const PEDE = ['admin', 'solicitante'], ACEITA = ['admin', 'aprovador'], FAZ = ['admin', 'financeiro', 'operacional'];
  /* empresa que só presta serviço (ex.: profissional MEI) não abre OS: recebe as OS de quem contrata (10/11/2026) */
  const soPresta = ctx => ((ctx.contexto && ctx.contexto.empresa) || {}).tipo === 'prestador';
  const podePedir = ctx => !soPresta(ctx) && tem(ctx, PEDE);
  const MAX = 5 * 1024 * 1024, PEDACO = 700000;
  let osT = [], osP = [], pronto = false;
  const brl = c => U().formatarDinheiro(c);
  const cargo = ctx => ctx.contexto.acesso && ctx.contexto.acesso.cargo;
  const tem = (ctx, l) => !ctx.soLeitura && l.includes(cargo(ctx));
  const quem = ctx => (ctx.sessao.perfil && ctx.sessao.perfil.nome) || ctx.sessao.usuario.email;
  const eu = ctx => ctx.sessao.usuario.uid;
  const lado = (o, ctx) => o.tomadorId === ctx.contexto.empresaId ? 'tomador' : 'prestador';
  const outro = (o, ctx) => lado(o, ctx) === 'tomador' ? o.prestadorNome : o.tomadorNome;
  const pill = s => { const x = ST[s] || ['info', s]; return `<span class="pill ${x[0]}">${U().esc(x[1])}</span>`; };
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hoje = () => iso(new Date());
  const dataTxt = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
  const log = (b, ctx, acao, texto, ref) => b.set(CW.fb.db().collection('log').doc(), { em: CW.fb.agora(), uid: eu(ctx), quem: quem(ctx), empresaId: ctx.contexto.empresaId, acao, texto, ref: ref || '' });
  const lerComo = (f, modo) => new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => erro(r.error); r[modo](f); });

  function minhaVez(o, ctx) {
    if (lado(o, ctx) === 'prestador') {
      if (!tem(ctx, FAZ)) return '';
      if (o.status === 'proposta') return 'Responder a ordem de serviço';
      if (o.status === 'aceita') return 'Fazer e registrar a entrega';
      if (o.status === 'divergencia') return 'Corrigir e entregar de novo';
      return '';
    }
    if (o.status === 'entregue' && tem(ctx, ACEITA) && o.criadoPor !== eu(ctx)) return 'Conferir a entrega';
    return '';
  }

  /* ---------- lista ---------- */
  function tabela(xs, ctx, id) {
    const { esc, avatar } = U();
    return `<div class="scroll"><table class="resp" id="${id}"><thead><tr><th>Ordem de serviço</th><th class="r">Valor</th><th>Situação</th></tr></thead><tbody>
      ${xs.map(o => `<tr class="click" data-abrir="${esc(o._id)}" tabindex="0"><td class="m-full"><div class="cell">${avatar(outro(o, ctx), '', lado(o, ctx) === 'tomador' ? o.prestadorId : o.tomadorId)}<div style="min-width:0"><strong>OS ${o.numero} · ${esc(o.titulo)}</strong><small>${esc(outro(o, ctx))} · prazo ${esc(dataTxt(o.prazo))}${minhaVez(o, ctx) ? ' · <b>' + esc(minhaVez(o, ctx)) + '</b>' : ''}</small></div></div></td>
        <td class="r"><b>${esc(brl(o.aceite ? o.aceite.valorAceito : o.valorCentavos))}</b></td><td>${pill(o.status)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function ligarLinhas(el) { el.querySelectorAll('[data-abrir]').forEach(r => { const ir = () => CW.ir('ordens/ver/' + r.dataset.abrir); r.onclick = ir; r.onkeydown = e => { if (e.key === 'Enter') ir(); }; }); }
  function desenharLista(el, ctx) {
    const { ic } = U();
    document.getElementById('acoes').innerHTML = podePedir(ctx) ? `<button class="btn" id="os-nova">${ic('plus')}Nova ordem de serviço</button>` : '';
    const n = document.getElementById('os-nova'); if (n) n.onclick = () => nova(ctx, null);
    if (!pronto) { el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Carregando as ordens de serviço…</span></div></div>`; return; }
    const todas = osT.concat(osP).sort((a, b) => String(b.prazo).localeCompare(String(a.prazo))), minhas = todas.filter(o => minhaVez(o, ctx));
    el.innerHTML = `${minhas.length ? `<section class="card" id="os-minhas" style="margin-bottom:22px"><div class="card-h"><span class="ic">${ic('alert')}</span><h3>Precisa de você</h3><span class="count">${minhas.length}</span></div>${tabela(minhas, ctx, 'os-tab-minhas')}</section>` : ''}
      <section class="card" id="os-lista"><div class="card-h"><span class="ic">${ic('list')}</span><h3>Ordens de serviço</h3><span class="count">${todas.length}</span></div>
        ${todas.length ? tabela(todas, ctx, 'os-tab') : (soPresta(ctx)
          ? `<div class="empty" id="os-vazio-presta"><div class="ic">${ic('list')}</div><strong>Nenhum serviço pedido ainda.</strong><span>Quem abre a ordem de serviço é a empresa que contrata você. Quando ela pedir um trabalho, ele aparece aqui para você aceitar ou recusar.</span>${U().passos(['A empresa que contrata abre a ordem: o que entregar, prazo e valor', 'Você aceita ou recusa', 'Você entrega e a empresa dá o aceite'])}</div>`
          : `<div class="empty"><div class="ic">${ic('list')}</div><strong>Nenhuma ordem de serviço.</strong><span>Com um contrato de serviço por entrega ativo, cada trabalho vira uma ordem de serviço: o que entregar, o prazo e o valor da entrega.</span>${U().passos(['Contrato de serviço por entrega ativo', 'Abra a ordem: o que entregar, prazo e valor', 'A prestadora entrega e você dá o aceite'])}</div>`)}</section>
      <p class="hint" style="margin:14px 0 0;font-size:12px">Pagamento por entrega aceita, nunca por hora. O profissional decide como, quando e onde faz o trabalho e pode recusar uma OS sem nenhuma punição.</p>`;
    ligarLinhas(el);
  }

  /* cartão dentro do contrato */
  async function blocoContrato(box, ctx, c) {
    if (!box) return;
    let base = osT.concat(osP);
    if (!pronto) { try { base = CW.fb.lista(await CW.fb.db().collection('ordens').where(c.tomadorId === ctx.contexto.empresaId ? 'tomadorId' : 'prestadorId', '==', ctx.contexto.empresaId).get()); } catch (e) { base = []; } }
    const { ic } = U(), xs = base.filter(o => o.contratoId === c._id).sort((a, b) => b.numero - a.numero);
    const pode = c.status === 'ativo' && c.tomadorId === ctx.contexto.empresaId && podePedir(ctx);
    box.innerHTML = `<section class="card" id="os-card"><div class="card-h"><span class="ic">${ic('list')}</span><h3>Ordens de serviço</h3><span class="count">${xs.length}</span>${pode ? `<button class="btn sm" id="os-nova-ct" style="margin-left:auto">${ic('plus')}Nova OS</button>` : ''}</div>
      ${xs.length ? tabela(xs, ctx, 'os-tab-ct') : `<p class="hint" style="margin:0;padding:14px 20px">${c.status === 'ativo' ? 'Nenhuma OS ainda. Cada trabalho vira uma OS com escopo, prazo e valor da entrega.' : 'Com o contrato ativo (as duas assinaturas), as ordens de serviço aparecem aqui.'}</p>`}</section>`;
    ligarLinhas(box);
    const b = document.getElementById('os-nova-ct'); if (b) b.onclick = () => nova(ctx, c);
  }

  /* ---------- nova OS ---------- */
  async function nova(ctx, c0) {
    const { esc, lerDinheiro } = U(), db = CW.fb.db(), emp = ctx.contexto.empresaId;
    let cts;
    try { cts = c0 ? [c0] : CW.fb.lista(await db.collection('contratos').where('tomadorId', '==', emp).get()).filter(c => c.modalidade === 'os' && c.status === 'ativo'); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); return; }
    if (!cts.length) { await U().dialogo({ titulo: 'Nenhum contrato de serviço por entrega ativo', corpo: '<p style="margin:0">Crie em Contratos um contrato do tipo "Serviço por entrega" com o profissional ou a prestadora, faça a triagem e assinem os dois.</p>' }); return; }
    let dados = null;
    await U().dialogo({ titulo: 'Nova ordem de serviço', sub: 'Descreva a entrega, não as horas. O profissional decide como e quando faz.',
      corpo: `<form class="fgrid" id="os-form" novalidate>
        <label class="f c12"><span>Contrato</span><select id="os-ct" ${cts.length === 1 ? 'disabled' : ''}>${cts.map(c => `<option value="${esc(c._id)}">${esc(c.prestadorNome)} · ${esc(c.objeto.slice(0, 60))}</option>`).join('')}</select></label>
        <label class="f c12"><span>O que será entregue</span><input id="os-tit" maxlength="120" placeholder="Ex.: Revisão do quadro elétrico da linha 2"></label>
        <label class="f c12"><span>Escopo da entrega</span><textarea id="os-esc" rows="4" maxlength="2000" placeholder="O resultado esperado e como saber que está pronto. Ex.: trocar disjuntores, testar e entregar o relatório com fotos."></textarea></label>
        <label class="f c6"><span>Prazo da entrega</span><input id="os-prazo" type="date" min="${hoje()}"></label>
        <label class="f c6"><span>Valor da entrega</span><input id="os-valor" data-mascara="dinheiro" inputmode="numeric" placeholder="0,00"><em class="hint">Valor fechado pela entrega, não por hora.</em></label>
        <p class="err c12" id="os-erro" role="alert"></p></form>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Enviar ao profissional', valor: 'ok', icone: 'send', antes: d => {
        const g = x => d.querySelector('#' + x), er = g('os-erro'), tit = g('os-tit').value.trim(), esc2 = g('os-esc').value.trim(), prazo = g('os-prazo').value, v = lerDinheiro(g('os-valor').value);
        if (tit.length < 5) { er.textContent = 'Diga o que será entregue (pelo menos 5 letras).'; return false; }
        if (/\b(hora|horas|hor[aá]rio|jornada|expediente|ponto)\b/i.test(tit + ' ' + esc2)) { er.textContent = 'Descreva a entrega, sem horário, jornada ou horas. O profissional decide quando e como faz.'; return false; }
        if (esc2.length < 10) { er.textContent = 'Descreva o escopo da entrega.'; return false; }
        if (!U().validarData(prazo) || prazo < hoje()) { er.textContent = 'Escolha o prazo (de hoje em diante).'; return false; }
        if (!(v > 0)) { er.textContent = 'Informe o valor da entrega.'; return false; }
        dados = { contratoId: g('os-ct').value, titulo: tit, escopo: esc2, prazo, valorCentavos: v }; return true; } }],
      aoAbrir: d => U().aplicarMascaras(d) });
    if (!dados) return;
    const c = cts.find(x => x._id === dados.contratoId);
    const numero = osT.concat(osP).filter(o => o.contratoId === c._id).reduce((m, o) => Math.max(m, o.numero || 0), 0) + 1;
    const ref = db.collection('ordens').doc(), b = db.batch(), agora = CW.fb.agora;
    b.set(ref, Object.assign({ tomadorId: c.tomadorId, prestadorId: c.prestadorId, partes: [c.tomadorId, c.prestadorId], tomadorNome: c.tomadorNome, prestadorNome: c.prestadorNome, numero,
      status: 'proposta', aceiteProf: null, recusa: null, entrega: null, entregas: [], divergencia: null, aceite: null, cancelamento: null, criadoPor: eu(ctx), criadoPorNome: quem(ctx), criadoEm: agora(), atualizadoEm: agora() }, dados));
    log(b, ctx, 'os.criar', `OS ${numero} enviada para ${c.prestadorNome}: ${dados.titulo} (${brl(dados.valorCentavos)}, prazo ${dataTxt(dados.prazo)}).`, ref.id);
    try { await b.commit(); U().toast('Ordem de serviço enviada.'); CW.ir('ordens/ver/' + ref.id); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); }
  }

  /* ---------- detalhe ---------- */
  async function desenharVer(el, ctx, id) {
    const { esc, ic, formatarDataHora } = U();
    let o; try { o = CW.fb.dados(await CW.fb.db().doc('ordens/' + id).get()); } catch (e) { o = null; }
    if (!o) { el.innerHTML = `<div class="card"><div class="empty"><div class="ic">${ic('list')}</div><strong>Ordem de serviço não encontrada.</strong><button class="btn sec sm" id="os-volta">${ic('back')}Voltar</button></div></div>`; document.getElementById('os-volta').onclick = () => CW.ir('ordens'); return; }
    o._id = id;
    const l = lado(o, ctx), st = o.status, A = CW.avisar;
    document.getElementById('titulo').textContent = `OS ${o.numero} · ${o.titulo}`;
    document.getElementById('acoes').innerHTML = '';
    let acoes = '', zap = '';
    if (l === 'prestador' && st === 'proposta' && tem(ctx, FAZ)) acoes = `<button class="btn ok" id="os-aceitar">${ic('check')}Aceitar a OS</button><button class="btn ghost" id="os-recusar">Recusar</button>`;
    if (l === 'prestador' && ['aceita', 'divergencia'].includes(st) && tem(ctx, FAZ)) acoes = `<button class="btn" id="os-entregar">${ic('upload')}Registrar a entrega</button>`;
    if (l === 'tomador' && st === 'entregue' && tem(ctx, ACEITA)) acoes = o.criadoPor === eu(ctx)
      ? `<div class="banner info">${ic('shield')}<span><strong>Outra pessoa confere a entrega</strong>Você pediu esta OS. Funções separadas: o aprovador técnico ou o administrador aceita a entrega.</span></div>`
      : `<button class="btn ok" id="os-ok">${ic('check')}Aceitar a entrega</button><button class="btn sec" id="os-parcial">Aceitar em parte</button><button class="btn dangerous" id="os-div">${ic('alert')}Apontar divergência</button>`;
    if (l === 'tomador' && ['proposta', 'aceita'].includes(st) && tem(ctx, PEDE)) acoes += `<button class="btn ghost" id="os-cancelar">Cancelar a OS</button>`;
    if (l === 'tomador' && ['aceita_total', 'aceita_parcial'].includes(st) && tem(ctx, ['admin', 'financeiro']) && CW.espelhos) acoes += `<button class="btn" id="os-espelho">${ic('receipt')}Espelho da nota</button>`;
    if (A && !ctx.soLeitura) {
      if (l === 'tomador' && st === 'proposta') zap = A.botao(ctx, { frase: `mandamos a OS ${o.numero} (${o.titulo}, ${brl(o.valorCentavos)}). Pode aceitar ou recusar no Conectwork.`, rota: 'ordens/ver/' + id, contratoId: o.contratoId, para: 'prestador' });
      if (l === 'prestador' && st === 'entregue') zap = A.botao(ctx, { frase: `registramos a entrega da OS ${o.numero} (${o.titulo}). Falta a conferência de vocês.`, rota: 'ordens/ver/' + id });
    }
    const ent = o.entrega, ac = o.aceite;
    const passo = (feito, agora, txt, info) => `<li class="${feito ? 'done' : agora ? 'now' : ''}"><span class="dot">${feito ? ic('check') : ''}</span>${esc(txt)}<small>${esc(info || '')}</small></li>`;
    el.innerHTML = `<div style="margin-bottom:14px"><button class="linkbtn" id="os-voltar">${ic('back')}Voltar para as ordens de serviço</button></div>
      ${st === 'divergencia' && o.divergencia ? `<div class="banner danger" id="os-div-b">${ic('alert')}<span><strong>Divergência apontada por ${esc(o.divergencia.nome)}</strong>${esc(o.divergencia.motivo)}</span></div>` : ''}
      ${st === 'recusada' && o.recusa ? `<div class="banner info" id="os-rec-b">${ic('check')}<span><strong>Recusada pelo profissional</strong>${esc(o.recusa.motivo || 'Sem motivo informado.')} · Recusar uma OS não tem punição nem reduz reputação.</span></div>` : ''}
      ${l === 'prestador' && st === 'proposta' ? `<div class="banner info" id="os-livre">${ic('shield')}<span><strong>Você decide</strong>Aceite se o escopo, o prazo e o valor servem para você. Recusar não tem punição nem reduz a sua reputação. Você escolhe como, quando e onde faz o trabalho.</span></div>` : ''}
      <div class="grid-main"><div class="stack">
        <section class="card" id="os-dados"><div class="card-h"><span class="ic">${ic('list')}</span><h3>OS ${o.numero}</h3><span style="margin-left:auto">${pill(st)}</span></div><div class="card-b"><dl class="dl">
          <div class="full"><dt>O que será entregue</dt><dd>${esc(o.titulo)}</dd></div><div class="full"><dt>Escopo</dt><dd style="white-space:pre-wrap">${esc(o.escopo)}</dd></div>
          <div><dt>Prazo</dt><dd>${esc(dataTxt(o.prazo))}${['aceita', 'divergencia'].includes(st) && o.prazo < hoje() ? ' <span class="pill danger">passou</span>' : ''}</dd></div><div><dt>Valor da entrega</dt><dd style="font-size:20px">${esc(brl(o.valorCentavos))}</dd></div>
          <div><dt>Quem contrata</dt><dd>${esc(o.tomadorNome)}</dd></div><div><dt>Quem faz</dt><dd>${esc(o.prestadorNome)}</dd></div>
          ${ac ? `<div class="full"><dt>Aceite</dt><dd>${esc(ac.tipo === 'parcial' ? 'Em parte: ' + brl(ac.valorAceito) + ' · ' + ac.motivo : 'Total: ' + brl(ac.valorAceito))}</dd></div>` : ''}</dl></div></section>
        ${ent ? `<section class="card" id="os-entrega"><div class="card-h"><span class="ic">${ic('upload')}</span><h3>Entrega${(o.entregas || []).length > 1 ? ` (${o.entregas.length}ª)` : ''}</h3></div><div class="card-b stack" style="gap:10px">
          <p style="margin:0;white-space:pre-wrap;font-size:13.5px">${esc(ent.descricao)}</p><small class="hint">${esc(ent.nome)} · ${esc(formatarDataHora(ent.em))}</small>
          ${ent.arquivo ? `<div><button class="btn ghost sm" id="os-arq">${ic('file')}Abrir ${esc(ent.arquivo.nome)}</button></div>` : ''}</div></section>` : ''}
      </div><div class="stack">
        <section class="card" id="os-passos"><div class="card-h"><span class="ic">${ic('clock')}</span><h3>Andamento</h3></div><div class="card-b stack" style="gap:14px">
          <ul class="tl">${passo(true, false, 'OS enviada', formatarDataHora(o.criadoEm) + ' · ' + (o.criadoPorNome || ''))}
            ${passo(!!o.aceiteProf, st === 'proposta', 'Aceita pelo profissional', o.aceiteProf ? formatarDataHora(o.aceiteProf.em) + ' · ' + o.aceiteProf.nome : st === 'recusada' ? 'recusada' : 'esperando')}
            ${passo(!!ent, ['aceita', 'divergencia'].includes(st), 'Entrega registrada', ent ? formatarDataHora(ent.em) : '')}
            ${passo(!!ac, st === 'entregue', 'Entrega aceita', ac ? formatarDataHora(ac.em) + ' · ' + ac.nome : '')}</ul>
          ${acoes ? `<div style="display:flex;gap:8px;flex-wrap:wrap" id="os-acoes">${acoes}</div>` : ''}${zap ? `<div id="os-zap">${zap}</div>` : ''}
        </div></section></div></div>`;
    ligar(el, ctx, o);
    if (A) A.ligar(el);
  }

  function ligar(el, ctx, o) {
    const db = CW.fb.db(), ref = db.doc('ordens/' + o._id), agora = CW.fb.agora, $ = x => document.getElementById(x), Ux = U();
    const ass = () => ({ uid: eu(ctx), nome: quem(ctx), em: agora() });
    const grava = async (fn, msg) => { const b = db.batch(); fn(b); try { await b.commit(); if (msg) Ux.toast(msg); } catch (e) { Ux.toast(CW.fb.mensagemErro(e), 'erro'); } desenharVer(el, ctx, o._id); };
    const txt = async (titulo, sub, rot, min, ph, classe, botao) => { let v = null;
      await Ux.dialogo({ titulo, sub, corpo: `<label class="f"><span>${Ux.esc(rot)}</span><textarea id="dl-txt" rows="4" maxlength="2000" placeholder="${Ux.esc(ph || '')}"></textarea></label><p class="err" id="dl-erro"></p>`,
        botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: botao, valor: 'ok', classe, antes: d => { const t = d.querySelector('#dl-txt').value.trim(); if (t.length < min) { d.querySelector('#dl-erro').textContent = min ? `Escreva pelo menos ${min} letras.` : ''; return false; } v = t; return true; } }] });
      return v; };
    $('os-voltar').onclick = () => CW.ir('ordens');
    const t = `OS ${o.numero} (${o.titulo})`;
    const a1 = $('os-aceitar');
    if (a1) a1.onclick = async () => { if (!(await Ux.confirmar('Aceitar a OS?', `${o.titulo} · ${brl(o.valorCentavos)} · prazo ${dataTxt(o.prazo)}. Você decide como e quando faz.`, 'Aceitar'))) return;
      grava(b => { b.update(ref, { status: 'aceita', aceiteProf: ass(), atualizadoEm: agora() }); log(b, ctx, 'os.aceitar', `${t} de ${o.tomadorNome} aceita.`, o._id); }, 'OS aceita.'); };
    const r1 = $('os-recusar');
    if (r1) r1.onclick = async () => { const m = await txt('Recusar a OS', 'Recusar não tem punição nem reduz a sua reputação. O motivo é opcional.', 'Motivo (opcional)', 0, 'Ex.: Sem agenda para esse prazo.', 'dangerous', 'Recusar');
      if (m === null) return; grava(b => { b.update(ref, { status: 'recusada', recusa: Object.assign(ass(), { motivo: m.slice(0, 300) }), atualizadoEm: agora() }); log(b, ctx, 'os.recusar', `${t} de ${o.tomadorNome} recusada.`, o._id); }, 'OS recusada.'); };
    const en = $('os-entregar');
    if (en) en.onclick = async () => {
      let res = null, arq = null;
      await Ux.dialogo({ titulo: 'Registrar a entrega', sub: `${t} · prazo ${dataTxt(o.prazo)}`,
        corpo: `<div class="stack" style="gap:12px"><label class="f"><span>O que foi entregue</span><textarea id="en-desc" rows="4" maxlength="2000" placeholder="Descreva o resultado: o que foi feito e como conferir."></textarea></label>
          <label class="up" style="cursor:pointer"><input type="file" id="en-arq" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" style="position:absolute;opacity:0;width:1px;height:1px">
            <span class="ic">${Ux.ic('upload')}</span><span class="t"><strong>Anexar evidência <span class="hint" style="font-weight:400">(opcional)</span></strong><small id="en-arq-n">Relatório, fotos em PDF, laudo… até 5 MB</small></span></label><p class="err" id="en-erro"></p></div>`,
        botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Registrar a entrega', valor: 'ok', icone: 'upload', antes: d => { const v = d.querySelector('#en-desc').value.trim(); if (v.length < 10) { d.querySelector('#en-erro').textContent = 'Descreva a entrega (pelo menos 10 letras).'; return false; } res = v; return true; } }],
        aoAbrir: d => { const i = d.querySelector('#en-arq'); i.onchange = () => { const f = i.files[0]; if (!f) return; if (f.size > MAX) { arq = null; d.querySelector('#en-erro').textContent = 'O arquivo passa de 5 MB.'; return; } arq = f; d.querySelector('#en-arq-n').textContent = f.name; }; } });
      if (!res) return;
      let arquivo = null, partes = 0, b64 = '', envio = '';
      if (arq) { b64 = String(await lerComo(arq, 'readAsDataURL')).replace(/^data:[^,]*,/, ''); envio = Math.random().toString(36).slice(2, 10); partes = Math.max(1, Math.ceil(b64.length / PEDACO)); arquivo = { envio, partes, nome: arq.name.slice(0, 120), tipo: arq.type || '', tam: arq.size }; }
      const entrega = Object.assign(ass(), { descricao: res, arquivo });
      grava(b => {
        for (let k = 0; k < partes; k++) b.set(db.doc(`ordens/${o._id}/arquivos/${envio}-${k}`), { d: b64.slice(k * PEDACO, (k + 1) * PEDACO), k, envio, em: agora() });
        b.update(ref, { status: 'entregue', entrega, entregas: (o.entregas || []).concat([{ descricao: res.slice(0, 300), nome: quem(ctx), em: new Date().toISOString(), arquivo: arquivo ? arquivo.nome : '' }]), atualizadoEm: agora() });
        log(b, ctx, 'os.entregar', `Entrega da ${t} registrada para ${o.tomadorNome}.`, o._id);
      }, 'Entrega registrada. Agora quem contrata confere.');
    };
    const ok = $('os-ok');
    if (ok) ok.onclick = async () => { if (!(await Ux.confirmar('Aceitar a entrega?', `${t}: ${brl(o.valorCentavos)}. Depois o financeiro prepara o espelho da nota.`, 'Aceitar'))) return;
      grava(b => { b.update(ref, { status: 'aceita_total', aceite: Object.assign(ass(), { tipo: 'total', valorAceito: o.valorCentavos }), atualizadoEm: agora() }); log(b, ctx, 'os.aceite', `Entrega da ${t} aceita: ${brl(o.valorCentavos)}.`, o._id); }, 'Entrega aceita.'); };
    const pa = $('os-parcial');
    if (pa) pa.onclick = async () => {
      let res = null;
      await Ux.dialogo({ titulo: 'Aceitar em parte', sub: `${t} · valor combinado ${brl(o.valorCentavos)}`,
        corpo: `<div class="fgrid"><label class="f c12"><span>Valor aceito</span><input id="pa-v" data-mascara="dinheiro" inputmode="numeric"></label><label class="f c12"><span>O que ficou faltando</span><textarea id="pa-m" rows="3" maxlength="500"></textarea></label><p class="err c12" id="pa-erro"></p></div>`,
        botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Aceitar em parte', valor: 'ok', antes: d => { const v = Ux.lerDinheiro(d.querySelector('#pa-v').value), m = d.querySelector('#pa-m').value.trim();
          if (!(v > 0 && v < o.valorCentavos)) { d.querySelector('#pa-erro').textContent = 'O valor aceito precisa ser maior que zero e menor que o combinado.'; return false; }
          if (m.length < 10) { d.querySelector('#pa-erro').textContent = 'Explique o que ficou faltando.'; return false; } res = { v, m }; return true; } }],
        aoAbrir: d => Ux.aplicarMascaras(d) });
      if (!res) return;
      grava(b => { b.update(ref, { status: 'aceita_parcial', aceite: Object.assign(ass(), { tipo: 'parcial', valorAceito: res.v, motivo: res.m }), atualizadoEm: agora() }); log(b, ctx, 'os.aceite_parcial', `Entrega da ${t} aceita em parte: ${brl(res.v)} de ${brl(o.valorCentavos)}. ${res.m}`, o._id); }, 'Entrega aceita em parte.');
    };
    const dv = $('os-div');
    if (dv) dv.onclick = async () => { const m = await txt('Apontar divergência', 'O profissional vê o motivo, corrige e entrega de novo.', 'O que não está de acordo com o escopo?', 10, 'Ex.: Faltou o relatório com as fotos do teste.', 'dangerous', 'Apontar divergência');
      if (!m) return; grava(b => { b.update(ref, { status: 'divergencia', divergencia: Object.assign(ass(), { motivo: m }), atualizadoEm: agora() }); log(b, ctx, 'os.divergencia', `Divergência na entrega da ${t}: ${m}`, o._id); }, 'Divergência enviada.'); };
    const ca = $('os-cancelar');
    if (ca) ca.onclick = async () => { const m = await txt('Cancelar a OS', 'O profissional vê o motivo. Fica no histórico.', 'Motivo', 5, '', 'dangerous', 'Cancelar a OS');
      if (!m) return; grava(b => { b.update(ref, { status: 'cancelada', cancelamento: Object.assign(ass(), { motivo: m }), atualizadoEm: agora() }); log(b, ctx, 'os.cancelar', `${t} cancelada: ${m}`, o._id); }, 'OS cancelada.'); };
    const es = $('os-espelho');
    if (es) es.onclick = async () => { let ja = null; try { ja = CW.fb.dados(await db.doc('espelhos/' + o._id).get()); } catch (e) {} CW.ir((ja ? 'espelhos/ver/' : 'espelhos/preparar/') + o._id); };
    const fa = $('os-arq');
    if (fa) fa.onclick = async () => { const a = o.entrega.arquivo;
      try { const ps = await Promise.all(Array.from({ length: a.partes }, (_, k) => db.doc(`ordens/${o._id}/arquivos/${a.envio}-${k}`).get()));
        const bin = atob(ps.map(p => (CW.fb.dados(p) || {}).d || '').join('')), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([u8], { type: a.tipo || 'application/pdf' })), x = document.createElement('a'); x.href = url; x.target = '_blank'; x.rel = 'noopener'; document.body.appendChild(x); x.click(); x.remove();
      } catch (e) { Ux.toast('Não foi possível abrir o arquivo: ' + CW.fb.mensagemErro(e), 'erro'); } };
  }

  CW.registrarModulo({
    id: 'ordens', nome: 'Ordens de serviço', nomeCurto: 'OS', icone: 'clipboard', ordem: 24,
    para: ['empresa'], contrato: ['contratos', 'cobrancas'],
    iniciar(ctx) {
      osT = []; osP = []; pronto = false;
      const db = CW.fb.db(), emp = ctx.contexto.empresaId, ok = { t: false, p: false };
      const re = () => { if (!(ok.t && ok.p)) return; pronto = true; const el = document.getElementById('view'), at = CW.app.atual();
        if (el && at && at.modulo === 'ordens' && at.tela === 'lista') desenharLista(el, Object.assign({}, ctx, { sessao: CW.sessao.estado() }));
        CW.app.pendenciasMudaram(); };
      CW.inscrever('ordens-t', () => db.collection('ordens').where('tomadorId', '==', emp), s => { osT = CW.fb.lista(s); ok.t = true; re(); }, () => { ok.t = true; re(); });
      CW.inscrever('ordens-p', () => db.collection('ordens').where('prestadorId', '==', emp), s => { osP = CW.fb.lista(s); ok.p = true; re(); }, () => { ok.p = true; re(); });
      return () => { pronto = false; };
    },
    /* busca do topo: só o que esta tela já carregou */
    buscar(ctx) {
      const vistos = {};
      return osT.concat(osP).filter(o => !vistos[o._id] && (vistos[o._id] = 1)).map(o => ({ t: `OS ${o.numero} · ${o.titulo || ''}`, s: `${outro(o, ctx)} · ${brl(o.valorCentavos || 0)}`, rota: 'ordens/ver/' + o._id,
        txt: ['os ' + o.numero, 'ordem de serviço', o.titulo, o.tomadorNome, o.prestadorNome].join(' ') }));
    },
    pendencias(ctx) {
      if (!pronto) return [];
      return osT.concat(osP).map(o => ({ o, v: minhaVez(o, ctx) })).filter(x => x.v).map(({ o, v }) => ({ txt: v, sub: `OS ${o.numero} · ${o.titulo} · ${outro(o, ctx)} · prazo ${dataTxt(o.prazo)}`, rota: 'ordens/ver/' + o._id }));
    },
    telas: {
      lista: { nome: 'Ordens de serviço', sub: 'Trabalho por entrega: escopo, prazo e valor; o profissional aceita, entrega e quem contrata confere.', render: (el, ctx) => desenharLista(el, ctx) },
      ver: { nome: 'Ordem de serviço', sub: 'Escopo, prazo, valor, entrega e aceite.', render: (el, ctx) => desenharVer(el, ctx, ctx.params[0]) }
    }
  });
  CW.ordens = { blocoContrato, lista: () => osT.concat(osP) };
})();
