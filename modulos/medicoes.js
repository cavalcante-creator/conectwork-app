/* Conectwork · Etapa 2, parte 2: medição do período (equipe contínua). Plano: docs/PLANO-COBRANCA-NOTAS.md.
   - O tomador lança (admin ou RH) ou importa do painel do RH pelo link #medicoes/importar/<resumo> a medição de um contrato
     ativo: período (quinzena ou mês, conforme o contrato), valor e a memória (nome, horas e valor de cada profissional; sem CPF).
     Id = contrato_período: o mesmo período não entra duas vezes.
   - A prestadora (admin ou financeiro) confirma ou aponta divergência com motivo. Com divergência, o tomador corrige e reenvia.
   - O aprovador técnico do tomador (admin ou aprovador) aprova. Quem lançou não aprova sozinho (funções separadas).
   - Cada passo grava no histórico da própria empresa. As regras do banco conferem tudo isso. */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const LANCA = ['admin', 'rh'], APROVA = ['admin', 'aprovador'], CONFIRMA = ['admin', 'financeiro'];
  const ST = { enviada: ['warn', 'Esperando a prestadora'], divergencia: ['danger', 'Divergência'], confirmada_prestadora: ['info', 'Esperando aprovação'], aprovada: ['ok', 'Aprovada'], cancelada: ['info', 'Cancelada'] };
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  let lista = null, porT = [], porP = [];
  const pill = s => { const x = ST[s] || ['info', s]; return `<span class="pill ${x[0]}">${U().esc(x[1])}</span>`; };
  const brl = c => U().formatarDinheiro(c);
  const cargo = ctx => ctx.contexto.acesso && ctx.contexto.acesso.cargo;
  const pode = (ctx, lista) => !ctx.soLeitura && lista.includes(cargo(ctx));
  const quem = ctx => (ctx.sessao.perfil && ctx.sessao.perfil.nome) || ctx.sessao.usuario.email;
  const lado = (m, ctx) => m.tomadorId === ctx.contexto.empresaId ? 'tomador' : 'prestador';
  const outraParte = (m, ctx) => lado(m, ctx) === 'tomador' ? m.prestadorNome : m.tomadorNome;
  const log = (b, ctx, acao, texto, ref) => b.set(CW.fb.db().collection('log').doc(), { em: CW.fb.agora(), uid: ctx.sessao.usuario.uid, quem: quem(ctx), empresaId: ctx.contexto.empresaId, acao, texto, ref: ref || '' });

  /* ---------- períodos: AAAA-MM-1 (dias 1 a 15), AAAA-MM-2 (16 ao fim) ou AAAA-MM (mês inteiro), igual ao painel do RH ---------- */
  function periodoTxt(p) {
    const m = /^(\d{4})-(\d{2})(?:-([12]))?$/.exec(p || ''); if (!m) return p || '';
    const mes = MESES[+m[2] - 1] + '/' + m[1];
    return m[3] ? (m[3] === '1' ? '1ª quinzena (1 a 15) de ' : '2ª quinzena (16 ao fim) de ') + mes : mes.replace(/^./, x => x.toUpperCase());
  }
  const periodoOk = (p, per) => per === 'quinzena' ? /^\d{4}-(0[1-9]|1[0-2])-[12]$/.test(p) : /^\d{4}-(0[1-9]|1[0-2])$/.test(p);
  function ultimosPeriodos(per, n) {
    const out = [], d = new Date(); let a = d.getFullYear(), mm = d.getMonth() + 1, q = d.getDate() > 15 ? 2 : 1;
    while (out.length < n) {
      const base = `${a}-${String(mm).padStart(2, '0')}`;
      if (per === 'quinzena') { out.push(base + '-' + q); if (q === 2) q = 1; else { q = 2; mm--; } }
      else { out.push(base); mm--; }
      if (mm < 1) { mm = 12; a--; }
    }
    return out;
  }

  /* ---------- lista ---------- */
  function precisaDeMim(m, ctx) {
    const l = lado(m, ctx);
    if (l === 'prestador') return m.status === 'enviada' && pode(ctx, CONFIRMA);
    if (m.status === 'divergencia') return pode(ctx, LANCA);
    if (m.status === 'confirmada_prestadora') return pode(ctx, APROVA) && m.criadoPor !== ctx.sessao.usuario.uid;
    return false;
  }
  function desenharLista(el, ctx) {
    const { esc, ic, avatar } = U();
    if (!lista) { el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Carregando as medições…</span></div></div>`; return; }
    document.getElementById('acoes').innerHTML = pode(ctx, LANCA) ? `<button class="btn" id="md-nova">${ic('plus')}Nova medição</button>` : '';
    const minhas = lista.filter(m => precisaDeMim(m, ctx));
    const linha = m => `<tr class="click" data-abrir="${esc(m._id)}" tabindex="0"><td class="m-full"><div class="cell">${avatar(outraParte(m, ctx), '', lado(m, ctx) === 'tomador' ? m.prestadorId : m.tomadorId)}<div style="min-width:0"><strong>${esc(periodoTxt(m.periodo))}</strong><small>${esc(outraParte(m, ctx))} · ${lado(m, ctx) === 'tomador' ? 'você contrata' : 'você presta o serviço'}${m.origem === 'integracao' ? ' · veio do painel do RH' : ''}</small></div></div></td>
      <td class="r"><b>${esc(brl(m.valorCentavos))}</b></td><td>${pill(m.status)}</td></tr>`;
    const tabela = (xs, id) => `<div class="scroll"><table class="resp" id="${id}"><thead><tr><th>Período</th><th class="r">Valor</th><th>Situação</th></tr></thead><tbody>${xs.map(linha).join('')}</tbody></table></div>`;
    el.innerHTML = `${minhas.length ? `<section class="card" id="md-minhas" style="margin-bottom:22px"><div class="card-h"><span class="ic">${ic('alert')}</span><h3>Precisa de você</h3><span class="count">${minhas.length}</span></div>${tabela(minhas, 'md-tab-minhas')}</section>` : ''}
      <section class="card" id="md-lista"><div class="card-h"><span class="ic">${ic('list')}</span><h3>Medições</h3><span class="count">${lista.length}</span></div>
      ${lista.length ? tabela(lista, 'md-tab') : `<div class="empty"><div class="ic">${ic('list')}</div><strong>Nenhuma medição ainda.</strong><span>${pode(ctx, LANCA) ? 'Lance a medição do período ou envie do painel do RH com o botão "Enviar ao Conectwork".' : 'Quando houver medição de um contrato da sua empresa, ela aparece aqui.'}</span>${U().passos(['Contrato de equipe contínua ativo', 'Lance a medição do período (ou envie do painel do RH)', 'O aprovador confere e aprova a medição'])}</div>`}</section>`;
    const n = document.getElementById('md-nova'); if (n) n.onclick = () => formulario(ctx, null, null);
    el.querySelectorAll('[data-abrir]').forEach(r => { const ir = () => CW.ir('medicoes/ver/' + r.dataset.abrir); r.onclick = ir; r.onkeydown = e => { if (e.key === 'Enter') ir(); }; });
  }

  /* ---------- lançar / corrigir (formulário com a memória) ---------- */
  async function contratosAtivos(ctx) {
    return CW.fb.lista(await CW.fb.db().collection('contratos').where('tomadorId', '==', ctx.contexto.empresaId).get()).filter(c => c.status === 'ativo' && (c.modalidade || 'continua') === 'continua');
  }
  /* m = medição a corrigir; pre = dados vindos do painel (importação) */
  async function formulario(ctx, m, pre) {
    const { esc, ic, lerDinheiro, formatarDinheiro } = U();
    let cts;
    try { cts = m ? null : await contratosAtivos(ctx); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); return; }
    if (cts && !cts.length) { await U().dialogo({ titulo: 'Nenhum contrato ativo', corpo: '<p style="margin:0">Para lançar uma medição, a sua empresa precisa de um contrato de equipe contínua ativo (assinado pelas duas empresas). Veja em Contratos.</p>' }); return; }
    let itens = (m ? m.memoria : pre ? pre.itens : []).map(x => ({ nome: x.nome, horas: x.horas, valorCentavos: x.valorCentavos }));
    if (!itens.length) itens = [{ nome: '', horas: '', valorCentavos: 0 }];
    const ctSel = m ? m.contratoId : pre ? pre.contratoId : (cts.length === 1 ? cts[0]._id : '');
    const per = id => (m ? m.periodicidade : ((cts || []).find(c => c._id === id) || {}).periodicidade) || 'quinzena';
    let dados = null;
    const linhaItem = (x, i) => `<div class="md-it" data-i="${i}"><input class="md-it-nome" placeholder="Nome do profissional" maxlength="120" value="${esc(x.nome || '')}" aria-label="Nome do profissional ${i + 1}">
      <input class="md-it-horas" placeholder="Horas" inputmode="decimal" maxlength="8" value="${esc(x.horas === '' || x.horas == null ? '' : String(x.horas).replace('.', ','))}" aria-label="Horas ${i + 1}">
      <input class="md-it-valor" data-mascara="dinheiro" placeholder="0,00" value="${x.valorCentavos ? formatarDinheiro(x.valorCentavos, false) : ''}" aria-label="Valor ${i + 1}">
      <button type="button" class="iconbtn md-it-x" aria-label="Tirar esta linha">${ic('x')}</button></div>`;
    await U().dialogo({ titulo: m ? 'Corrigir medição' : pre ? 'Conferir medição vinda do painel do RH' : 'Nova medição do período', sub: m ? 'Depois de corrigir, a medição volta para a prestadora conferir.' : 'A prestadora confere e, depois, o aprovador técnico aprova.',
      corpo: `<form class="stack" id="md-form" style="gap:14px" novalidate>
        ${m ? `<p style="margin:0"><b>${esc(m.prestadorNome)}</b> · ${esc(periodoTxt(m.periodo))}</p>` : `<div class="fgrid">
          <label class="f c12"><span>Contrato</span><select id="md-ct" ${pre ? 'disabled' : ''}><option value="">Escolha o contrato</option>${cts.map(c => `<option value="${esc(c._id)}" ${c._id === ctSel ? 'selected' : ''}>${esc(c.prestadorNome)} · ${esc(c.objeto.slice(0, 60))}</option>`).join('')}</select></label>
          <label class="f c12"><span>Período</span><select id="md-per" ${pre ? 'disabled' : ''}></select></label></div>`}
        <div><p style="margin:0 0 8px;font-size:13px;font-weight:500">Memória: cada profissional, horas e valor <span class="hint" style="font-weight:400">(sem CPF)</span></p>
          <div class="md-its" id="md-its">${itens.map(linhaItem).join('')}</div>
          <button type="button" class="linkbtn" id="md-mais" style="margin-top:8px">${ic('plus')}Mais um profissional</button></div>
        <div class="md-total"><span>Total da medição</span><b id="md-total">R$ 0,00</b></div>
        <label class="f"><span>Observação <i>(opcional)</i></span><input id="md-obs" maxlength="300" value="${esc((m && m.obs) || '')}"></label>
        <p class="err" id="md-erro" role="alert"></p></form>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: m ? 'Salvar e reenviar' : 'Enviar para a prestadora', valor: 'ok', icone: 'send', antes: d => {
        const er = d.querySelector('#md-erro'), its = ler(d);
        const ct = m ? m.contratoId : (pre ? pre.contratoId : d.querySelector('#md-ct').value), periodo = m ? m.periodo : (pre ? pre.periodo : d.querySelector('#md-per').value);
        if (!ct) { er.textContent = 'Escolha o contrato.'; return false; }
        if (!periodo) { er.textContent = 'Escolha o período.'; return false; }
        if (!its.length) { er.textContent = 'Informe pelo menos um profissional com o valor.'; return false; }
        const ruim = its.findIndex(x => x.nome.split(' ').length < 2 || !(x.valorCentavos > 0) || (x.horas !== null && !(x.horas >= 0 && x.horas <= 400)));
        if (ruim >= 0) { er.textContent = `Confira a linha ${ruim + 1}: nome e sobrenome, horas (de 0 a 400, ou em branco) e valor maior que zero.`; return false; }
        const total = its.reduce((s, x) => s + x.valorCentavos, 0);
        if (pre && total !== pre.total) { er.textContent = `A soma das linhas (${brl(total)}) não bate com o total enviado pelo painel (${brl(pre.total)}). Confira no painel do RH.`; return false; }
        dados = { contratoId: ct, periodo, memoria: its, valorCentavos: total, obs: d.querySelector('#md-obs').value.trim() }; return true; } }],
      aoAbrir: d => {
        const its = d.querySelector('#md-its');
        const soma = () => { d.querySelector('#md-total').textContent = brl(ler(d).reduce((s, x) => s + x.valorCentavos, 0)); };
        const ligar = () => { U().aplicarMascaras(its); its.querySelectorAll('.md-it-x').forEach(b => b.onclick = () => { if (its.children.length > 1) b.closest('.md-it').remove(); soma(); }); };
        its.addEventListener('input', () => { d.querySelector('#md-erro').textContent = ''; soma(); });
        d.querySelector('#md-mais').onclick = () => { its.insertAdjacentHTML('beforeend', linhaItem({ nome: '', horas: '', valorCentavos: 0 }, its.children.length)); ligar(); its.lastElementChild.querySelector('input').focus(); };
        const sc = d.querySelector('#md-ct'), sp = d.querySelector('#md-per');
        const periodos = () => { if (!sp) return; const p = per(sc.value); const ps = pre ? [pre.periodo] : ultimosPeriodos(p, 8);
          sp.innerHTML = `<option value="">Escolha o período</option>` + ps.map(x => `<option value="${x}" ${pre && x === pre.periodo ? 'selected' : ''}>${esc(periodoTxt(x))}</option>`).join(''); };
        if (sc) { sc.onchange = periodos; periodos(); }
        ligar(); soma();
      }
    });
    if (!dados) return;
    return gravar(ctx, m, dados, pre, cts);
  }
  function ler(d) {
    return Array.from(d.querySelectorAll('.md-it')).map(r => {
      const nome = r.querySelector('.md-it-nome').value.trim().replace(/\s+/g, ' '), h = r.querySelector('.md-it-horas').value.trim().replace(',', '.'), v = U().lerDinheiro(r.querySelector('.md-it-valor').value);
      return { nome, horas: h === '' ? null : Number(h), valorCentavos: v || 0 };
    }).filter(x => x.nome || x.valorCentavos);
  }

  async function gravar(ctx, m, dados, pre, cts) {
    const db = CW.fb.db(), agora = CW.fb.agora, b = db.batch();
    try {
      if (m) {
        b.update(db.doc('medicoes/' + m._id), { memoria: dados.memoria, valorCentavos: dados.valorCentavos, obs: dados.obs, status: 'enviada', divergencia: null, confirmacao: null, atualizadoEm: agora() });
        log(b, ctx, 'medicao.corrigir', `Medição de ${periodoTxt(m.periodo)} (${m.prestadorNome}) corrigida e reenviada: ${brl(dados.valorCentavos)}.`, m._id);
        await b.commit(); U().toast('Medição corrigida e reenviada para a prestadora.'); desenharDetalhe(document.getElementById('view'), ctx, m._id); return;
      }
      const c = pre ? pre.contrato : cts.find(x => x._id === dados.contratoId), id = c._id + '_' + dados.periodo, ref = db.doc('medicoes/' + id);
      const ja = await ref.get();
      if (ja.exists) { U().toast(`Já existe medição de ${periodoTxt(dados.periodo)} para ${c.prestadorNome}. Abrimos ela para você.`, 'erro'); CW.ir('medicoes/ver/' + id); return; }
      b.set(ref, { contratoId: c._id, tomadorId: c.tomadorId, prestadorId: c.prestadorId, partes: [c.tomadorId, c.prestadorId], tomadorNome: c.tomadorNome, prestadorNome: c.prestadorNome,
        periodicidade: c.periodicidade, periodo: dados.periodo, valorCentavos: dados.valorCentavos, memoria: dados.memoria, obs: dados.obs,
        origem: pre ? 'integracao' : 'manual', ref: pre ? pre.ref : '', status: 'enviada', divergencia: null, confirmacao: null, aprovacao: null,
        criadoPor: ctx.sessao.usuario.uid, criadoPorNome: quem(ctx), criadoEm: agora(), atualizadoEm: agora() });
      log(b, ctx, 'medicao.enviar', `Medição de ${periodoTxt(dados.periodo)} de ${c.prestadorNome} enviada para conferência: ${brl(dados.valorCentavos)}${pre ? ' (veio do painel do RH)' : ''}.`, id);
      await b.commit(); U().toast('Medição enviada. Agora a prestadora confere.'); CW.ir('medicoes/ver/' + id);
    } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); }
  }

  /* ---------- detalhe ---------- */
  async function desenharDetalhe(el, ctx, id) {
    const { esc, ic, formatarDataHora } = U();
    let m;
    try { m = CW.fb.dados(await CW.fb.db().doc('medicoes/' + id).get()); } catch (e) { m = null; }
    if (!m) { el.innerHTML = `<div class="card"><div class="empty"><div class="ic">${ic('list')}</div><strong>Medição não encontrada.</strong><button class="btn sec sm" id="md-volta">${ic('back')}Voltar</button></div></div>`; document.getElementById('md-volta').onclick = () => CW.ir('medicoes'); return; }
    m._id = id;
    const l = lado(m, ctx), eu = ctx.sessao.usuario.uid;
    document.getElementById('titulo').textContent = periodoTxt(m.periodo);
    document.getElementById('acoes').innerHTML = '';
    const passo = (feito, agoraAqui, txt, info) => `<li class="${feito ? 'done' : agoraAqui ? 'now' : ''}"><span class="dot">${feito ? ic('check') : ''}</span>${esc(txt)}<small>${esc(info || '')}</small></li>`;
    const st = m.status;
    let acoes = '';
    if (l === 'prestador' && st === 'enviada' && pode(ctx, CONFIRMA)) acoes = `<button class="btn ok" id="md-confirmar">${ic('check')}Confirmar a medição</button><button class="btn dangerous" id="md-divergir">${ic('alert')}Apontar divergência</button>`;
    if (l === 'tomador' && (st === 'enviada' || st === 'divergencia') && pode(ctx, LANCA)) acoes = `<button class="btn ${st === 'divergencia' ? '' : 'sec'}" id="md-corrigir">${ic('edit')}Corrigir${st === 'divergencia' ? ' e reenviar' : ''}</button><button class="btn ghost" id="md-cancelar">Cancelar medição</button>`;
    if (l === 'tomador' && st === 'confirmada_prestadora' && pode(ctx, APROVA)) acoes = m.criadoPor === eu
      ? `<div class="banner info">${ic('shield')}<span><strong>Outra pessoa aprova</strong>Você lançou esta medição. Funções separadas: quem lança não aprova sozinho. Peça ao aprovador técnico.</span></div>`
      : `<button class="btn ok" id="md-aprovar">${ic('check')}Aprovar a medição</button>`;
    const temHoras = (m.memoria || []).some(x => x.horas != null);
    const fr = `${periodoTxt(m.periodo)} (${brl(m.valorCentavos)})`, A = CW.avisar;
    const zap = !A || ctx.soLeitura ? '' : l === 'tomador' && st === 'enviada' ? A.botao(ctx, { frase: `a medição de ${fr} está esperando a sua conferência.`, rota: 'medicoes/ver/' + id, contratoId: m.contratoId, para: 'prestador' })
      : l === 'prestador' && st === 'divergencia' ? A.botao(ctx, { frase: `apontamos uma divergência na medição de ${fr}. Pode conferir e corrigir?`, rota: 'medicoes/ver/' + id })
      : l === 'prestador' && st === 'confirmada_prestadora' ? A.botao(ctx, { frase: `confirmamos a medição de ${fr}. Falta a aprovação do aprovador técnico.`, rota: 'medicoes/ver/' + id }) : '';
    el.innerHTML = `<div style="margin-bottom:14px"><button class="linkbtn" id="md-voltar">${ic('back')}Voltar para as medições</button></div>
      <div id="md-docs"></div>
      ${st === 'divergencia' && m.divergencia ? `<div class="banner danger" id="md-div">${ic('alert')}<span><strong>Divergência apontada pela ${esc(m.prestadorNome)}</strong>${esc(m.divergencia.motivo)}</span></div>` : ''}
      <div class="grid-main"><div class="stack">
        <section class="card" id="md-dados"><div class="card-h"><span class="ic">${ic('list')}</span><h3>Medição</h3><span style="margin-left:auto">${pill(st)}</span></div><div class="card-b"><dl class="dl">
          <div><dt>Quem contrata</dt><dd>${esc(m.tomadorNome)}</dd></div><div><dt>Quem presta o serviço</dt><dd>${esc(m.prestadorNome)}</dd></div>
          <div><dt>Período</dt><dd>${esc(periodoTxt(m.periodo))}</dd></div><div><dt>Total</dt><dd style="font-size:20px" id="md-valor">${esc(brl(m.valorCentavos))}</dd></div>
          <div><dt>Origem</dt><dd>${m.origem === 'integracao' ? 'Painel do RH (Enviar ao Conectwork)' : 'Lançada no Conectwork'}</dd></div><div><dt>Lançada por</dt><dd>${esc(m.criadoPorNome || '')}</dd></div>
          ${m.obs ? `<div class="full"><dt>Observação</dt><dd>${esc(m.obs)}</dd></div>` : ''}</dl></div></section>
        <section class="card" id="md-memoria"><div class="card-h"><span class="ic">${ic('users')}</span><h3>Memória da medição</h3><span class="count">${(m.memoria || []).length}</span></div>
          <div class="scroll"><table><thead><tr><th>Profissional</th>${temHoras ? '<th class="r">Horas</th>' : ''}<th class="r">Valor</th></tr></thead><tbody>
          ${(m.memoria || []).map(x => `<tr><td>${esc(x.nome)}</td>${temHoras ? `<td class="r">${x.horas == null ? '—' : esc(String(x.horas).replace('.', ',')) + ' h'}</td>` : ''}<td class="r">${esc(brl(x.valorCentavos))}</td></tr>`).join('')}
          <tr><td><b>Total</b></td>${temHoras ? `<td class="r"><b>${esc(String(Math.round((m.memoria || []).reduce((s, x) => s + (x.horas || 0), 0) * 100) / 100).replace('.', ','))} h</b></td>` : ''}<td class="r"><b>${esc(brl(m.valorCentavos))}</b></td></tr></tbody></table></div></section>
      </div><div class="stack">
        <section class="card" id="md-passos"><div class="card-h"><span class="ic">${ic('clock')}</span><h3>Andamento</h3></div><div class="card-b stack" style="gap:16px">
          <ul class="tl">${passo(true, false, 'Medição enviada', formatarDataHora(m.criadoEm) + ' · ' + (m.criadoPorNome || ''))}
            ${passo(!!m.confirmacao, st === 'enviada' || st === 'divergencia', 'Conferida pela prestadora', m.confirmacao ? formatarDataHora(m.confirmacao.em) + ' · ' + m.confirmacao.nome : st === 'divergencia' ? 'divergência apontada' : 'esperando')}
            ${passo(!!m.aprovacao, st === 'confirmada_prestadora', 'Aprovada pelo aprovador técnico', m.aprovacao ? formatarDataHora(m.aprovacao.em) + ' · ' + m.aprovacao.nome : 'esperando')}</ul>
          ${acoes ? `<div style="display:flex;gap:8px;flex-wrap:wrap" id="md-acoes">${acoes}</div>` : ''}
          ${zap ? `<div id="md-zap">${zap}</div>` : ''}
          ${st === 'aprovada' ? `<div id="md-espelho"><p class="hint" style="margin:0;font-size:12.5px">Próximo passo: o espelho da nota fiscal, com os dados para a prestadora emitir.</p></div>` : ''}
        </div></section></div></div>`;
    ligarDetalhe(el, ctx, m);
    if (CW.avisar) CW.avisar.ligar(el);
    if (CW.documentos && l === 'tomador' && st !== 'cancelada') CW.documentos.alerta(document.getElementById('md-docs'), m.prestadorId, m.prestadorNome);
    if (st === 'aprovada' && CW.espelhos) CW.espelhos.blocoMedicao(document.getElementById('md-espelho'), ctx, m);
  }

  function ligarDetalhe(el, ctx, m) {
    const db = CW.fb.db(), ref = db.doc('medicoes/' + m._id), agora = CW.fb.agora, $ = id => document.getElementById(id);
    const assinatura = () => ({ uid: ctx.sessao.usuario.uid, nome: quem(ctx), em: agora() });
    const grava = async (fn, msg) => { const b = db.batch(); fn(b); try { await b.commit(); if (msg) U().toast(msg); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); } desenharDetalhe(el, ctx, m._id); };
    const pt = periodoTxt(m.periodo);
    $('md-voltar').onclick = () => CW.ir('medicoes');
    const c1 = $('md-confirmar');
    if (c1) c1.onclick = async () => { if (!(await U().confirmar('Confirmar a medição?', `Você confere que a medição de ${pt} está certa: ${brl(m.valorCentavos)}. Depois, o aprovador técnico da ${m.tomadorNome} aprova.`, 'Confirmar'))) return;
      grava(b => { b.update(ref, { status: 'confirmada_prestadora', confirmacao: assinatura(), atualizadoEm: agora() }); log(b, ctx, 'medicao.confirmar', `Medição de ${pt} (${m.tomadorNome}) confirmada: ${brl(m.valorCentavos)}.`, m._id); }, 'Medição confirmada.'); };
    const dv = $('md-divergir');
    if (dv) dv.onclick = async () => {
      let mot = null;
      await U().dialogo({ titulo: 'Apontar divergência', sub: `A ${m.tomadorNome} vê o motivo, corrige e reenvia.`,
        corpo: `<label class="f"><span>O que está diferente?</span><textarea id="dv-mot" rows="4" maxlength="500" placeholder="Ex.: As horas de Fulano na 2ª semana somam 44 h, não 40 h."></textarea></label><p class="err" id="dv-erro"></p>`,
        botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Apontar divergência', valor: 'ok', classe: 'dangerous', antes: d => { const t = d.querySelector('#dv-mot').value.trim(); if (t.length < 10) { d.querySelector('#dv-erro').textContent = 'Explique a divergência (pelo menos 10 letras).'; return false; } mot = t; return true; } }] });
      if (!mot) return;
      grava(b => { b.update(ref, { status: 'divergencia', divergencia: Object.assign(assinatura(), { motivo: mot }), atualizadoEm: agora() }); log(b, ctx, 'medicao.divergencia', `Divergência apontada na medição de ${pt} (${m.tomadorNome}): ${mot}`, m._id); }, 'Divergência enviada.');
    };
    const co = $('md-corrigir'); if (co) co.onclick = () => formulario(ctx, m, null);
    const ca = $('md-cancelar');
    if (ca) ca.onclick = async () => { if (!(await U().confirmar('Cancelar a medição?', `A medição de ${pt} (${m.prestadorNome}) deixa de valer. Fica no histórico.`, 'Cancelar medição'))) return;
      grava(b => { b.update(ref, { status: 'cancelada', atualizadoEm: agora() }); log(b, ctx, 'medicao.cancelar', `Medição de ${pt} (${m.prestadorNome}) cancelada.`, m._id); }, 'Medição cancelada.'); };
    const ap = $('md-aprovar');
    if (ap) ap.onclick = async () => { if (!(await U().confirmar('Aprovar a medição?', `${pt} · ${m.prestadorNome}: ${brl(m.valorCentavos)}. Depois de aprovada, o financeiro prepara o espelho da nota.`, 'Aprovar'))) return;
      grava(b => { b.update(ref, { status: 'aprovada', aprovacao: assinatura(), atualizadoEm: agora() }); log(b, ctx, 'medicao.aprovar', `Medição de ${pt} (${m.prestadorNome}) aprovada: ${brl(m.valorCentavos)}.`, m._id); }, 'Medição aprovada.'); };
  }

  /* ---------- importar do painel do RH: #medicoes/importar/<resumo em base64url> ---------- */
  function lerResumo(txt) {
    try {
      const b64 = String(txt || '').replace(/-/g, '+').replace(/_/g, '/'), pad = b64 + '==='.slice((b64.length + 3) % 4);
      const json = decodeURIComponent(Array.from(atob(pad)).map(ch => '%' + ch.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
      const r = JSON.parse(json);
      if (r.v !== 1 || !/^\d{14}$/.test(String(r.cnpj || '')) || !Array.isArray(r.itens) || !r.itens.length || !Number.isInteger(r.total) || !/^\d{4}-\d{2}(-[12])?$/.test(r.periodo || '')) return null;
      return { periodo: r.periodo, cnpj: r.cnpj, prestadorNome: String(r.nome || ''), total: r.total, ref: String(r.ref || '').slice(0, 80),
        itens: r.itens.slice(0, 300).map(x => ({ nome: String(x.n || '').slice(0, 120), horas: x.h == null ? null : Number(x.h), valorCentavos: Math.round(Number(x.v) || 0) })) };
    } catch (e) { return null; }
  }
  async function importar(el, ctx, payload) {
    const { esc, ic } = U();
    const voltar = `<button class="btn sec" id="mi-voltar">${ic('back')}Ir para as medições</button>`;
    const fimTela = (tipo, titulo, texto) => { el.innerHTML = `<div class="banner ${tipo}" id="mi-msg">${ic('alert')}<span><strong>${esc(titulo)}</strong>${esc(texto)}</span></div><div style="margin-top:14px">${voltar}</div>`; document.getElementById('mi-voltar').onclick = () => CW.ir('medicoes'); };
    const r = lerResumo(payload);
    if (!r) return fimTela('danger', 'Esse link de medição não é válido', 'Ele pode ter sido cortado ao copiar. Volte ao painel do RH e use de novo "Enviar ao Conectwork".');
    if (!pode(ctx, LANCA)) return fimTela('warn', 'Você não pode lançar medições nesta empresa', 'Quem lança é o administrador ou o RH. Peça para uma dessas pessoas abrir o link.');
    let cts;
    try { cts = (await contratosAtivos(ctx)).filter(c => U().dig(c.prestadorCnpj) === r.cnpj); } catch (e) { return fimTela('danger', 'Não foi possível abrir os contratos', CW.fb.mensagemErro(e)); }
    if (!cts.length) return fimTela('warn', `Nenhum contrato ativo com ${r.prestadorNome || 'essa prestadora'}`, `Para receber a medição, a ${ctx.contexto.nome} precisa de um contrato de equipe contínua ativo com a prestadora de CNPJ ${r.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}.`);
    const okPer = cts.filter(c => periodoOk(r.periodo, c.periodicidade));
    if (!okPer.length) return fimTela('warn', 'O período não combina com o contrato', `O painel mandou ${periodoTxt(r.periodo)}, mas o contrato com ${cts[0].prestadorNome} é ${cts[0].periodicidade === 'mes' ? 'mensal' : 'por quinzena'}.`);
    const c = okPer[0];
    el.innerHTML = `<div class="banner info" id="mi-msg">${ic('list')}<span><strong>Medição recebida do painel do RH</strong>${esc(c.prestadorNome)} · ${esc(periodoTxt(r.periodo))} · ${esc(brl(r.total))} (${r.itens.length} profissionais). Confira e envie para a prestadora.</span></div>
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="mi-abrir">${ic('edit')}Conferir e enviar</button>${voltar}</div>`;
    document.getElementById('mi-voltar').onclick = () => CW.ir('medicoes');
    const abrir = () => formulario(ctx, null, Object.assign({}, r, { contratoId: c._id, contrato: c }));
    document.getElementById('mi-abrir').onclick = abrir;
    abrir();
  }

  CW.registrarModulo({
    id: 'medicoes', nome: 'Medições', icone: 'ruler', ordem: 25,
    para: ['empresa'], contrato: ['contratos', 'cobrancas'],
    iniciar(ctx) {
      lista = null; porT = []; porP = [];
      const db = CW.fb.db(), emp = ctx.contexto.empresaId;
      let a = false, b = false;
      const junta = () => {
        const mp = new Map(); porT.concat(porP).forEach(x => mp.set(x._id, x));
        lista = Array.from(mp.values()).sort((x, y) => String(y.periodo).localeCompare(String(x.periodo)) || String(x.prestadorNome).localeCompare(String(y.prestadorNome)));
        const el = document.getElementById('view'), at = CW.app.atual();
        if (el && at && at.modulo === 'medicoes' && at.tela === 'lista') desenharLista(el, Object.assign({}, ctx, { sessao: CW.sessao.estado() }));
        CW.app.pendenciasMudaram();
      };
      CW.inscrever('medicoes-t', () => db.collection('medicoes').where('tomadorId', '==', emp), s => { porT = CW.fb.lista(s); a = true; if (b) junta(); });
      CW.inscrever('medicoes-p', () => db.collection('medicoes').where('prestadorId', '==', emp), s => { porP = CW.fb.lista(s); b = true; if (a) junta(); });
      return () => { lista = null; };
    },
    pendencias(ctx) {
      return (lista || []).filter(m => precisaDeMim(m, ctx)).map(m => ({ rota: 'medicoes/ver/' + m._id, sub: `${outraParte(m, ctx)} · ${periodoTxt(m.periodo)} · ${brl(m.valorCentavos)}`,
        txt: lado(m, ctx) === 'prestador' ? 'Conferir a medição' : m.status === 'divergencia' ? 'Corrigir a medição (divergência)' : 'Aprovar a medição' }));
    },
    telas: {
      lista: { nome: 'Medições', sub: 'Medição do período da equipe contínua: a prestadora confere e o aprovador técnico aprova.', render: (el, ctx) => desenharLista(el, ctx) },
      ver: { nome: 'Medição', sub: 'Valor do período, memória por profissional e o andamento da conferência.', render: (el, ctx) => desenharDetalhe(el, ctx, ctx.params[0]) },
      importar: { nome: 'Medição do painel do RH', sub: 'Confira o que veio do painel do RH antes de enviar para a prestadora.', render: (el, ctx) => importar(el, ctx, ctx.params[0]) }
    }
  });
  CW.medicoes = { periodoTxt, lerResumo, ultimosPeriodos };
})();
