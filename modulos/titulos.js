/* Conectwork · Etapa 2, parte 6: títulos (contas a pagar e a receber). Plano: docs/PLANO-COBRANCA-NOTAS.md.
   - Nasce quando o financeiro do tomador marca a nota "conferida" (validação tripla): status "aprovado".
   - Vencimento = dia da nota válida (conferida) + dias do contrato. Não muda por um lado só.
   - Funções separadas no tomador: quem conferiu a nota não libera; o financeiro libera; a tesouraria agenda e confirma o
     pagamento com o comprovante; quem liberou não confirma o pagamento sozinho. "Agendado" não é "pago".
   - A prestadora informa a conta para receber (fica numa área privada do título). Trocar a conta depois de informada
     exige revisão reforçada do financeiro do tomador antes de agendar. Depois do pagamento, a prestadora confirma o
     recebimento (baixa).
   - O dinheiro não passa pelo Conectwork. Nada se apaga: tudo fica no histórico. */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const ST = { aprovado: ['warn', 'Esperando liberação'], liberado: ['info', 'Liberado para pagar'], agendado: ['info', 'Pagamento agendado'], liquidado: ['ok', 'Pago'], baixado: ['ok', 'Recebido e baixado'] };
  const ABERTO = ['aprovado', 'liberado', 'agendado'];
  const MAX_ARQ = 3 * 1024 * 1024, PEDACO = 700000;
  const BANCOS = ['001 · Banco do Brasil', '033 · Santander', '041 · Banrisul', '077 · Inter', '104 · Caixa Econômica', '237 · Bradesco', '260 · Nu Pagamentos', '336 · C6 Bank', '341 · Itaú Unibanco', '748 · Sicredi', '756 · Sicoob', 'Outro'];

  let tT = [], tP = [], pronto = false;
  const brl = c => U().formatarDinheiro(c);
  const cargo = ctx => ctx.contexto.acesso && ctx.contexto.acesso.cargo;
  const tem = (ctx, l) => !ctx.soLeitura && l.includes(cargo(ctx));
  const quem = ctx => (ctx.sessao.perfil && ctx.sessao.perfil.nome) || ctx.sessao.usuario.email;
  const eu = ctx => ctx.sessao.usuario.uid;
  const lado = (t, ctx) => t.tomadorId === ctx.contexto.empresaId ? 'tomador' : 'prestador';
  const periodoTxt = p => CW.medicoes ? CW.medicoes.periodoTxt(p) : p;
  const log = (b, ctx, acao, texto, ref) => b.set(CW.fb.db().collection('log').doc(), { em: CW.fb.agora(), uid: eu(ctx), quem: quem(ctx), empresaId: ctx.contexto.empresaId, acao, texto, ref: ref || '' });
  const ms = v => !v ? 0 : typeof v.toMillis === 'function' ? v.toMillis() : v.seconds ? v.seconds * 1000 : (Date.parse(v) || 0);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hoje = () => iso(new Date());
  /* vencimento = dia em que a nota ficou válida (conferida) + dias do contrato */
  const vencimento = t => { const b = ms(t.base); if (!b) return ''; const d = new Date(b); d.setDate(d.getDate() + (t.vencimentoDias || 0)); return iso(d); };
  const dataTxt = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
  const vencido = t => ABERTO.includes(t.status) && vencimento(t) && vencimento(t) < hoje();
  const pill = t => { const x = ST[t.status] || ['info', t.status]; return `<span class="pill ${vencido(t) ? 'danger' : x[0]}">${U().esc(vencido(t) ? 'Vencido · ' + x[1].toLowerCase() : x[1])}</span>`; };

  /* o que cada pessoa precisa fazer */
  function minhaVez(t, ctx) {
    const l = lado(t, ctx), c = t.conta || {};
    if (l === 'prestador') {
      if (!tem(ctx, ['admin', 'financeiro'])) return '';
      if (['aprovado', 'liberado'].includes(t.status) && !c.ok) return 'Informe a conta para receber';
      if (t.status === 'liquidado') return 'Confirme que o dinheiro chegou';
      return '';
    }
    if (t.status === 'aprovado' && tem(ctx, ['admin', 'financeiro']) && t.aprovacao.uid !== eu(ctx)) return 'Liberar para pagamento';
    if (c.revisao && ['aprovado', 'liberado'].includes(t.status) && tem(ctx, ['admin', 'financeiro'])) return 'Revisar a troca de conta da prestadora';
    if (t.status === 'liberado' && tem(ctx, ['admin', 'tesouraria']) && c.ok && !c.revisao) return 'Agendar o pagamento';
    if (t.status === 'agendado' && tem(ctx, ['admin', 'tesouraria']) && (t.liberacao || {}).uid !== eu(ctx)) return 'Confirmar o pagamento com o comprovante';
    return '';
  }

  /* ---------- lista e calendário de vencimentos ---------- */
  function desenharLista(el, ctx) {
    const { esc, ic, avatar } = U();
    document.getElementById('acoes').innerHTML = '';
    /* 14/11/2026: confirmar os pagamentos agendados pelo extrato do banco */
    if (pronto && tem(ctx, ['admin', 'tesouraria']) && tT.some(t => t.status === 'agendado')) {
      document.getElementById('acoes').innerHTML = `<button class="btn sec" id="tt-extrato">${ic('upload')}Conferir pelo extrato</button><input type="file" id="tt-ext-arq" accept=".ofx,.csv,.txt,text/csv" hidden>`;
      const ia = document.getElementById('tt-ext-arq'); document.getElementById('tt-extrato').onclick = () => ia.click();
      ia.onchange = async () => { const f = ia.files[0]; ia.value = ''; if (f) conferirExtrato(el, ctx, f); };
    }
    if (!pronto) { el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Carregando os títulos…</span></div></div>`; return; }
    const todos = tT.concat(tP);
    const minhas = todos.filter(t => minhaVez(t, ctx));
    const abertos = todos.filter(t => ABERTO.includes(t.status) || t.status === 'liquidado' && lado(t, ctx) === 'prestador').sort((a, b) => vencimento(a).localeCompare(vencimento(b)));
    const fechados = todos.filter(t => !abertos.includes(t)).sort((a, b) => ms(b.atualizadoEm) - ms(a.atualizadoEm));
    const outro = t => lado(t, ctx) === 'tomador' ? t.prestadorNome : t.tomadorNome;
    const linha = (t, extra) => `<tr class="click" data-abrir="${esc(t._id)}" tabindex="0"><td class="m-full"><div class="cell">${avatar(outro(t), '', lado(t, ctx) === 'tomador' ? t.prestadorId : t.tomadorId)}<div style="min-width:0"><strong>${esc(outro(t))}</strong><small>${lado(t, ctx) === 'tomador' ? 'A pagar' : 'A receber'} · ${esc(periodoTxt(t.periodo))}${t.notaNumero ? ' · nota ' + esc(t.notaNumero) : ''}${extra ? ' · <b>' + esc(extra) + '</b>' : ''}</small></div></div></td>
      <td class="r"><b>${esc(brl(t.liquidoCentavos))}</b><br><small class="hint">vence ${esc(dataTxt(vencimento(t)))}</small></td><td>${pill(t)}</td></tr>`;
    const tab = (xs, id, fn) => `<div class="scroll"><table class="resp" id="${id}"><thead><tr><th>Título</th><th class="r">Líquido</th><th>Situação</th></tr></thead><tbody>${xs.map(t => linha(t, fn && fn(t))).join('')}</tbody></table></div>`;
    const totPagar = todos.filter(t => lado(t, ctx) === 'tomador' && ABERTO.includes(t.status)).reduce((s, t) => s + t.liquidoCentavos, 0);
    const totReceber = todos.filter(t => lado(t, ctx) === 'prestador' && ['aprovado', 'liberado', 'agendado', 'liquidado'].includes(t.status)).reduce((s, t) => s + t.liquidoCentavos, 0);
    const venc = abertos.filter(vencido);
    /* calendário: agrupado por dia de vencimento */
    const dias = {}; abertos.filter(t => !vencido(t)).forEach(t => { (dias[vencimento(t)] = dias[vencimento(t)] || []).push(t); });
    const cal = Object.keys(dias).sort().map(d => `<div class="tt-dia"><div class="tt-dt"><b>${esc(d.slice(8, 10))}</b><small>${esc(['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+d.slice(5, 7) - 1])}${d === hoje() ? ' · hoje' : ''}</small></div><div class="tt-its">
      ${dias[d].map(t => `<button class="tt-it" data-abrir="${esc(t._id)}"><span>${esc(outro(t))} <small>${lado(t, ctx) === 'tomador' ? 'a pagar' : 'a receber'}</small></span><b>${esc(brl(t.liquidoCentavos))}</b></button>`).join('')}</div></div>`).join('');
    el.innerHTML = `<div class="grid-2" style="margin-bottom:22px" id="tt-numeros">
        ${tT.length ? `<section class="card"><div class="card-b"><p class="hint" style="margin:0 0 4px">A pagar (em aberto)</p><b style="font-size:22px" id="tt-pagar">${esc(brl(totPagar))}</b></div></section>` : ''}
        ${tP.length ? `<section class="card"><div class="card-b"><p class="hint" style="margin:0 0 4px">A receber</p><b style="font-size:22px" id="tt-receber">${esc(brl(totReceber))}</b></div></section>` : ''}</div>
      ${minhas.length ? `<section class="card" id="tt-minhas" style="margin-bottom:22px"><div class="card-h"><span class="ic">${ic('alert')}</span><h3>Precisa de você</h3><span class="count">${minhas.length}</span></div>${tab(minhas, 'tt-tab-minhas', t => minhaVez(t, ctx))}</section>` : ''}
      ${venc.length ? `<section class="card" id="tt-vencidos" style="margin-bottom:22px"><div class="card-h"><span class="ic">${ic('clock')}</span><h3>Vencidos</h3><span class="count">${venc.length}</span></div>${tab(venc, 'tt-tab-venc')}</section>` : ''}
      <section class="card" id="tt-cal" style="margin-bottom:22px"><div class="card-h"><span class="ic">${ic('clock')}</span><h3>Calendário de vencimentos</h3></div>
        ${cal ? `<div class="card-b tt-cal">${cal}</div>` : `<div class="empty"><div class="ic">${ic('clock')}</div><strong>Nenhum vencimento em aberto.</strong><span>Quando uma nota é conferida, o título aparece aqui no dia do vencimento.</span>${U().passos(['A medição ou a entrega é aprovada', 'A prestadora envia a nota e ela é conferida', 'O título aparece aqui, no dia do vencimento'])}</div>`}</section>
      ${fechados.length ? `<section class="card" id="tt-pagos"><div class="card-h"><span class="ic">${ic('check')}</span><h3>Pagos</h3><span class="count">${fechados.length}</span></div>${tab(fechados, 'tt-tab-pagos')}</section>` : ''}`;
    el.querySelectorAll('[data-abrir]').forEach(r => { const ir = () => CW.ir('titulos/ver/' + r.dataset.abrir); r.onclick = ir; r.onkeydown = e => { if (e.key === 'Enter') ir(); }; });
  }

  /* ---------- detalhe ---------- */
  async function desenharVer(el, ctx, id) {
    const { esc, ic, formatarDataHora } = U(), db = CW.fb.db();
    let t, conta = null;
    try { t = CW.fb.dados(await db.doc('titulos/' + id).get()); } catch (e) { t = null; }
    if (!t) { el.innerHTML = `<div class="card"><div class="empty"><div class="ic">${ic('wallet')}</div><strong>Título não encontrado.</strong><button class="btn sec sm" id="tt-volta">${ic('back')}Voltar</button></div></div>`; document.getElementById('tt-volta').onclick = () => CW.ir('titulos'); return; }
    t._id = id;
    const l = lado(t, ctx), c = t.conta || {};
    const verConta = l === 'prestador' ? ['admin', 'financeiro'].includes(cargo(ctx)) : ['admin', 'financeiro', 'tesouraria'].includes(cargo(ctx));
    if (verConta && c.ok) { try { conta = CW.fb.dados(await db.doc('titulos/' + id + '/privado/conta').get()); } catch (e) { conta = null; } }
    document.getElementById('titulo').textContent = (l === 'tomador' ? 'A pagar · ' : 'A receber · ') + (l === 'tomador' ? t.prestadorNome : t.tomadorNome);
    document.getElementById('acoes').innerHTML = '';
    const v = vencimento(t), st = t.status;
    const passo = (feito, agora, txt, info) => `<li class="${feito ? 'done' : agora ? 'now' : ''}"><span class="dot">${feito ? ic('check') : ''}</span>${esc(txt)}<small>${esc(info || '')}</small></li>`;
    const ass = a => a ? formatarDataHora(a.em) + ' · ' + a.nome : '';
    const ordem = ['aprovado', 'liberado', 'agendado', 'liquidado', 'baixado'], i = ordem.indexOf(st);
    let acoes = '';
    const vez = minhaVez(t, ctx);
    if (l === 'tomador') {
      const exc = !!(CW.sessao.estado() || {}).master && CW.piloto(), excAv = `<p class="hint" id="tt-excecao" style="margin:0;font-size:12.5px;width:100%">Exceção do piloto: você fez o passo anterior, mas como equipe Conectwork pode seguir. Fica registrado no pagamento.</p>`;
      if (st === 'aprovado' && tem(ctx, ['admin', 'financeiro'])) acoes += t.aprovacao.uid === eu(ctx) && exc ? `<button class="btn ok" id="tt-liberar">${ic('check')}Liberar para pagamento</button>` + excAv : t.aprovacao.uid === eu(ctx)
        ? `<div class="banner info">${ic('shield')}<span><strong>Outra pessoa libera</strong>Você conferiu a nota. Funções separadas: quem confere a nota não libera o pagamento sozinho.</span></div>`
        : `<button class="btn ok" id="tt-liberar">${ic('check')}Liberar para pagamento</button>`;
      if (c.revisao && ['aprovado', 'liberado'].includes(st) && tem(ctx, ['admin', 'financeiro'])) acoes += `<button class="btn" id="tt-revisar">${ic('shield')}Revisar a troca de conta</button>`;
      if (st === 'liberado' && tem(ctx, ['admin', 'tesouraria'])) acoes += !c.ok ? `<p class="hint" style="margin:0">Esperando a prestadora informar a conta para receber.</p>` : c.revisao ? `<p class="hint" style="margin:0;color:var(--warn)">A prestadora trocou a conta: o financeiro precisa revisar antes de agendar.</p>` : `<button class="btn" id="tt-agendar">${ic('clock')}Agendar o pagamento</button>`;
      if (st === 'agendado' && tem(ctx, ['admin', 'tesouraria'])) acoes += (t.liberacao || {}).uid === eu(ctx) && exc ? `<button class="btn ok" id="tt-liquidar">${ic('upload')}Confirmar o pagamento (com comprovante)</button>` + excAv : (t.liberacao || {}).uid === eu(ctx)
        ? `<div class="banner info">${ic('shield')}<span><strong>Outra pessoa confirma</strong>Você liberou este pagamento. Funções separadas: quem libera não confirma o pagamento sozinho.</span></div>`
        : `<button class="btn ok" id="tt-liquidar">${ic('upload')}Confirmar o pagamento (com comprovante)</button>`;
    } else if (tem(ctx, ['admin', 'financeiro'])) {
      if (['aprovado', 'liberado'].includes(st)) acoes += `<button class="btn ${c.ok ? 'sec' : ''}" id="tt-conta">${ic('bank')}${c.ok ? 'Trocar a conta para receber' : 'Informar a conta para receber'}</button>`;
      if (st === 'liquidado') acoes += `<button class="btn ok" id="tt-baixar">${ic('check')}O dinheiro chegou: dar baixa</button>`;
    }
    const contaTxt = conta ? `${conta.banco ? `${esc(conta.banco)} · ag. ${esc(conta.agencia)} · conta ${esc(conta.conta)} (${esc(conta.tipo || '')})` : '<b>Só Pix</b>'}${conta.pix ? '<br>Pix: <b id="tt-pix">' + esc(conta.pix) + '</b>' : ''}${conta.porNome ? '<br><span class="hint">Informada por ' + esc(conta.porNome) + '</span>' : ''}<br><span class="hint">Titular: ${esc(conta.titular)} · ${esc(conta.doc)}</span>` : '';
    el.innerHTML = `${CW.emissaoMei ? CW.emissaoMei.faixaVolta(ctx) : ''}<div style="margin-bottom:14px"><button class="linkbtn" id="tt-voltar">${ic('back')}Voltar para pagar e receber</button></div>
      <div id="tt-docs"></div>
      ${vencido(t) ? `<div class="banner danger" id="tt-venc">${ic('alert')}<span><strong>Vencido em ${esc(dataTxt(v))}</strong>${l === 'tomador' ? 'O vencimento vem do contrato. Pague o quanto antes e anexe o comprovante.' : 'A empresa que contrata já foi avisada nesta tela.'}</span></div>` : ''}
      ${c.revisao && ['aprovado', 'liberado'].includes(st) ? `<div class="banner warn" id="tt-rev">${ic('shield')}<span><strong>Conta para receber trocada</strong>${l === 'tomador' ? 'Confira a troca com a prestadora por telefone antes de aprovar (revisão reforçada). Até lá, o pagamento não pode ser agendado.' : 'A empresa que contrata confere a troca antes de agendar o pagamento.'}</span></div>` : ''}
      ${vez ? `<div class="banner info" id="tt-vez">${ic('alert')}<span><strong>${esc(vez)}</strong>${l === 'prestador' && vez.startsWith('Informe') ? 'A conta precisa estar no CNPJ da sua empresa. O dinheiro vai direto de quem paga para a sua conta.' : ''}</span></div>` : ''}
      <div class="grid-main"><div class="stack">
        <section class="card" id="tt-dados"><div class="card-h"><span class="ic">${ic('wallet')}</span><h3>${l === 'tomador' ? 'Conta a pagar' : 'Conta a receber'}</h3><span style="margin-left:auto">${pill(t)}</span></div><div class="card-b"><dl class="dl">
          <div><dt>Quem paga</dt><dd>${esc(t.tomadorNome)}</dd></div><div><dt>Quem recebe</dt><dd>${esc(t.prestadorNome)}</dd></div>
          <div><dt>Valor da nota</dt><dd>${esc(brl(t.valorCentavos))}</dd></div><div><dt>Líquido a pagar</dt><dd style="font-size:20px" id="tt-liq">${esc(brl(t.liquidoCentavos))}</dd></div>
          <div><dt>Vencimento</dt><dd id="tt-vencimento">${esc(dataTxt(v))}</dd></div><div><dt>${t.contratoId ? "Regra do contrato" : "Prazo combinado"}</dt><dd>${t.vencimentoDias} dia${t.vencimentoDias === 1 ? '' : 's'} depois da nota válida</dd></div>
          <div><dt>Período</dt><dd>${esc(periodoTxt(t.periodo))}</dd></div><div><dt>Nota fiscal</dt><dd>${t.notaNumero ? 'nº ' + esc(t.notaNumero) : '—'} · <a href="#espelhos/ver/${esc(t.espelhoId)}" class="linkbtn" style="font-size:13px">ver o espelho</a></dd></div>
          ${t.agendamento ? `<div><dt>Pagamento agendado para</dt><dd id="tt-agenda">${esc(dataTxt(t.agendamento.data))}</dd></div>` : ''}
          ${t.liquidacao ? `<div><dt>Pago em</dt><dd>${esc(dataTxt(t.liquidacao.data))}</dd></div>` : ''}</dl></div></section>
        ${verConta ? `<section class="card" id="tt-conta-card"><div class="card-h"><span class="ic">${ic('bank')}</span><h3>Conta para receber</h3></div><div class="card-b"><p style="margin:0;font-size:13.5px" id="tt-conta-txt">${contaTxt || '<span class="hint">Ainda não informada pela prestadora.</span>'}</p>
          ${c.ok ? `<p class="hint" style="margin:10px 0 0;font-size:12.5px">Informada por ${esc(c.nome || '')} em ${esc(formatarDataHora(c.em))}${c.revisadoNome ? ' · troca revisada por ' + esc(c.revisadoNome) : ''}.</p>` : ''}</div></section>` : ''}
      </div><div class="stack">
        <section class="card" id="tt-passos"><div class="card-h"><span class="ic">${ic('clock')}</span><h3>Andamento</h3></div><div class="card-b stack" style="gap:16px">
          <ul class="tl">${passo(true, false, 'Nota conferida (aprovado)', ass(t.aprovacao))}
            ${passo(i >= 1, st === 'aprovado', 'Liberado pelo financeiro', ass(t.liberacao))}
            ${passo(i >= 2, st === 'liberado', 'Pagamento agendado', t.agendamento ? dataTxt(t.agendamento.data) + ' · ' + t.agendamento.nome : '')}
            ${passo(i >= 3, st === 'agendado', 'Pago (comprovante)', t.liquidacao ? dataTxt(t.liquidacao.data) + ' · ' + t.liquidacao.nome : '')}
            ${passo(i >= 4, st === 'liquidado', 'Recebido pela prestadora', ass(t.baixa))}</ul>
          ${t.liquidacao ? `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sec" id="tt-comp">${ic('file')}Abrir o comprovante</button><button class="btn sec" id="tt-demo">${ic('receipt')}Baixar o demonstrativo (PDF)</button></div>` : ''}
          ${acoes ? `<div style="display:flex;gap:8px;flex-wrap:wrap" id="tt-acoes">${acoes}</div>` : ''}
          ${zapTit(t, ctx)}
          <p class="hint" style="margin:0;font-size:12.5px">"Agendado" não é "pago": o título só fica pago com o comprovante. O dinheiro não passa pelo Conectwork.</p>
        </div></section></div></div>`;
    ligar(el, ctx, t, conta);
    if (CW.avisar) CW.avisar.ligar(el);
    if (CW.documentos && l === 'tomador' && ['aprovado', 'liberado', 'agendado'].includes(st)) CW.documentos.alerta(document.getElementById('tt-docs'), t.prestadorId, t.prestadorNome, t.contratoId);
  }

  function zapTit(t, ctx) {
    const A = CW.avisar, l = lado(t, ctx); if (!A || ctx.soLeitura) return '';
    const fr = `${periodoTxt(t.periodo)} (${brl(t.liquidoCentavos)})`, rota = 'titulos/ver/' + t._id;
    const b = l === 'tomador' && t.status === 'liquidado' ? A.botao(ctx, { frase: `o pagamento de ${fr} foi feito. O comprovante está no Conectwork; confirme quando o dinheiro chegar.`, rota, contratoId: t.contratoId, para: 'prestador' })
      : l === 'tomador' && ['aprovado', 'liberado'].includes(t.status) && !(t.conta || {}).ok ? A.botao(ctx, { frase: `o pagamento de ${fr} está aprovado. Falta vocês informarem a conta para receber.`, rota, contratoId: t.contratoId, para: 'prestador' })
      : l === 'prestador' && (t.conta || {}).ok && ['aprovado', 'liberado'].includes(t.status) ? A.botao(ctx, { frase: `a conta para receber o pagamento de ${fr} já está informada.`, rota }) : '';
    return b ? `<div id="tt-zap">${b}</div>` : '';
  }

  const lerComo = (f, modo) => new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => erro(r.error); r[modo](f); });

  /* ---------- demonstrativo de pagamento (14/11/2026, melhoria 2): PDF para quem recebe guardar e mostrar (ex.: pedir crédito) ---------- */
  const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  const carregaScript = (src, ok) => ok() ? Promise.resolve() : new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = src; sc.onload = () => ok() ? res() : rej(new Error('Biblioteca não carregou.')); sc.onerror = () => rej(new Error('Não foi possível baixar a ferramenta do PDF. Confira a internet e tente de novo.')); document.head.appendChild(sc); });
  const logoPng = () => new Promise(res => { try { const svg = U().LOGO(200).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '), img = new Image(), tm = setTimeout(() => res(null), 2500);
    img.onload = () => { clearTimeout(tm); try { const c = document.createElement('canvas'); c.width = c.height = 200; c.getContext('2d').drawImage(img, 0, 0, 200, 200); res(c.toDataURL('image/png')); } catch (e) { res(null); } };
    img.onerror = () => { clearTimeout(tm); res(null); }; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); } catch (e) { res(null); } });
  /* linhas do demonstrativo (testável sem PDF) */
  function demoLinhas(t, e) {
    const r = (e && e.retencoes) || t.retencoes || {}, ret = [['ISS', r.iss], ['INSS', r.inss], ['IR', r.ir], ['PIS/COFINS/CSLL', r.pcc]].filter(x => x[1] > 0);
    const L = [['Quem pagou', t.tomadorNome + (e && e.tomador && e.tomador.cnpj ? ' · CNPJ ' + e.tomador.cnpj : '')], ['Quem recebeu', t.prestadorNome + (e && e.prestadorCnpj ? ' · CNPJ ' + e.prestadorCnpj : '')],
      ['Período do serviço', periodoTxt(t.periodo)], ...(e && e.horas != null ? [['Horas aprovadas', String(e.horas).replace('.', ',') + ' h']] : []),
      ['Nota fiscal', t.notaNumero ? 'nº ' + t.notaNumero : '—'], ['Valor da nota', brl(t.valorCentavos)], ...ret.map(x => ['Retenção ' + x[0], '- ' + brl(x[1])]),
      ['Valor pago (líquido)', brl(t.liquidoCentavos)], ['Vencimento', dataTxt(vencimento(t))], ['Pago em', t.liquidacao ? dataTxt(t.liquidacao.data) : '—'],
      ['Pagamento confirmado por', (t.liquidacao && t.liquidacao.nome) || '—'], ...(t.baixa ? [['Recebimento confirmado por', t.baixa.nome || '—']] : [])];
    return L;
  }
  async function demonstrativo(t) {
    try {
      let e = null; try { e = CW.fb.dados(await CW.fb.db().doc('espelhos/' + t.espelhoId).get()); } catch (er) { /* sem o espelho, vai sem CNPJ e horas */ }
      await carregaScript(JSPDF, () => !!(window.jspdf && window.jspdf.jsPDF));
      const logo = await logoPng(), doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), W = 210, M = 16;
      doc.setFillColor(11, 26, 69); doc.rect(0, 0, W, 34, 'F');
      if (logo) doc.addImage(logo, 'PNG', M, 8, 18, 18);
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.text('Demonstrativo de pagamento', M + (logo ? 23 : 0), 17);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text('Conectwork · ' + periodoTxt(t.periodo), M + (logo ? 23 : 0), 24);
      let y = 48; doc.setTextColor(20, 30, 60);
      demoLinhas(t, e).forEach(([k, v], i) => { if (i % 2 === 0) { doc.setFillColor(241, 243, 247); doc.rect(M, y - 5.5, W - 2 * M, 9, 'F'); }
        const forte = /Valor pago/.test(k); doc.setFont('helvetica', forte ? 'bold' : 'normal'); doc.setFontSize(forte ? 12 : 10.5);
        doc.text(String(k), M + 3, y); doc.text(String(v), W - M - 3, y, { align: 'right' }); y += 9; });
      y += 6; doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90, 100, 120);
      doc.text(doc.splitTextToSize('O dinheiro não passa pelo Conectwork: o pagamento foi feito por quem contrata direto para quem presta o serviço. Este demonstrativo registra o pagamento confirmado no Conectwork, com o comprovante anexado. Código do título: ' + t._id + '. Gerado em ' + new Date().toLocaleString('pt-BR') + '.', W - 2 * M), M, y);
      doc.save('Demonstrativo-' + String(t.prestadorNome || 'pagamento').replace(/[^\wÀ-ú]+/g, '-').slice(0, 40) + '-' + t.periodo + '.pdf');
    } catch (er) { U().toast(er.message || 'Não foi possível gerar o PDF.', 'erro'); }
  }

  function ligar(el, ctx, t, conta) {
    const db = CW.fb.db(), ref = db.doc('titulos/' + t._id), agora = CW.fb.agora, $ = x => document.getElementById(x), U0 = U();
    const ass = () => ({ uid: eu(ctx), nome: quem(ctx), em: agora() });
    const nome = lado(t, ctx) === 'tomador' ? t.prestadorNome : t.tomadorNome;
    const dm = $('tt-demo'); if (dm) dm.onclick = () => demonstrativo(t);
    const grava = async (fn, msg) => { const b = db.batch(); fn(b); try { await b.commit(); if (msg) U0.toast(msg); } catch (e) { U0.toast(CW.fb.mensagemErro(e), 'erro'); } desenharVer(el, ctx, t._id); };
    $('tt-voltar').onclick = () => CW.ir('titulos');
    const lib = $('tt-liberar');
    if (lib) lib.onclick = async () => { if (!(await U0.confirmar('Liberar para pagamento?', `${t.prestadorNome} · ${brl(t.liquidoCentavos)} · vence ${dataTxt(vencimento(t))}. Depois, a tesouraria agenda e paga.`, 'Liberar'))) return;
      grava(b => { b.update(ref, { status: 'liberado', liberacao: Object.assign(ass(), t.aprovacao && t.aprovacao.uid === eu(ctx) ? { excecao: true } : {}), atualizadoEm: agora() }); log(b, ctx, 'titulo.liberar', `Pagamento de ${brl(t.liquidoCentavos)} para ${t.prestadorNome} (${periodoTxt(t.periodo)}) liberado.`, t._id); }, 'Pagamento liberado.'); };
    const rv = $('tt-revisar');
    if (rv) rv.onclick = async () => {
      let ok = false;
      await U0.dialogo({ titulo: 'Revisar a troca de conta', sub: 'Revisão reforçada: golpe de troca de conta é comum.',
        corpo: `<p style="margin:0 0 12px">Conta nova: ${conta ? `<b>${U0.esc(conta.banco)} · ag. ${U0.esc(conta.agencia)} · conta ${U0.esc(conta.conta)}</b>${conta.pix ? ' · Pix ' + U0.esc(conta.pix) : ''}<br><span class="hint">Titular: ${U0.esc(conta.titular)} · ${U0.esc(conta.doc)}</span>` : '(sem acesso)'}</p>
          <label class="check"><input type="checkbox" id="rv-chk"> <span>Liguei para a ${U0.esc(t.prestadorNome)} num telefone que eu já conhecia (não o que veio com a troca) e confirmei a conta nova.</span></label><p class="err" id="rv-erro"></p>`,
        botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Aprovar a conta nova', valor: 'ok', antes: d => { if (!d.querySelector('#rv-chk').checked) { d.querySelector('#rv-erro').textContent = 'Confirme que conferiu por telefone.'; return false; } ok = true; return true; } }] });
      if (!ok) return;
      grava(b => { b.update(ref, { conta: Object.assign({}, t.conta, { revisao: false, revisadoPor: eu(ctx), revisadoNome: quem(ctx), revisadoEm: agora() }), atualizadoEm: agora() });
        log(b, ctx, 'titulo.conta_revisada', `Troca de conta de ${t.prestadorNome} revisada e aprovada (confirmada por telefone).`, t._id); }, 'Conta nova aprovada.');
    };
    const ag = $('tt-agendar');
    if (ag) ag.onclick = async () => {
      let data = null; const v = vencimento(t);
      await U0.dialogo({ titulo: 'Agendar o pagamento', sub: `${t.prestadorNome} · ${brl(t.liquidoCentavos)} · vence ${dataTxt(v)}`,
        corpo: `<label class="f"><span>Data do pagamento</span><input id="ag-data" type="date" value="${v >= hoje() ? v : hoje()}" min="${hoje()}"></label>
          <p class="hint" id="ag-aviso" style="margin:8px 0 0;font-size:12.5px">Agendar não é pagar: depois de pagar, confirme com o comprovante.</p><p class="err" id="ag-erro"></p>`,
        botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Agendar', valor: 'ok', antes: d => { const x = d.querySelector('#ag-data').value; if (!/^\d{4}-\d{2}-\d{2}$/.test(x) || x < hoje()) { d.querySelector('#ag-erro').textContent = 'Escolha uma data de hoje em diante.'; return false; } data = x; return true; } }],
        aoAbrir: d => { const i = d.querySelector('#ag-data'), a = d.querySelector('#ag-aviso'); i.oninput = () => { a.style.color = i.value > v ? 'var(--danger)' : ''; a.textContent = i.value > v ? `Depois do vencimento (${dataTxt(v)}): o contrato não permite adiar por um lado só. Combine com a prestadora.` : 'Agendar não é pagar: depois de pagar, confirme com o comprovante.'; }; } });
      if (!data) return;
      grava(b => { b.update(ref, { status: 'agendado', agendamento: Object.assign(ass(), { data }), atualizadoEm: agora() }); log(b, ctx, 'titulo.agendar', `Pagamento de ${brl(t.liquidoCentavos)} para ${t.prestadorNome} agendado para ${dataTxt(data)}.`, t._id); }, 'Pagamento agendado.');
    };
    const lq = $('tt-liquidar');
    if (lq) lq.onclick = async () => {
      let res = null, arq = null;
      await U0.dialogo({ titulo: 'Confirmar o pagamento', sub: `${t.prestadorNome} · ${brl(t.liquidoCentavos)}`,
        corpo: `<div class="stack" style="gap:12px"><label class="f"><span>Data em que foi pago</span><input id="lq-data" type="date" value="${hoje()}" max="${hoje()}"></label>
          <label class="up" style="cursor:pointer"><input type="file" id="lq-arq" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" style="position:absolute;opacity:0;width:1px;height:1px">
            <span class="ic">${U0.ic('upload')}</span><span class="t"><strong>Anexar o comprovante</strong><small id="lq-nome">PDF ou foto do comprovante do banco (até 3 MB)</small></span></label>
          <p class="err" id="lq-erro" role="alert"></p></div>`,
        botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Confirmar o pagamento', valor: 'ok', classe: 'ok', antes: d => {
          const x = d.querySelector('#lq-data').value, er = d.querySelector('#lq-erro');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(x) || x > hoje()) { er.textContent = 'Informe a data do pagamento (hoje ou antes).'; return false; }
          if (!arq) { er.textContent = 'Anexe o comprovante: sem ele o título não fica pago.'; return false; }
          res = { data: x }; return true; } }],
        aoAbrir: d => { const i = d.querySelector('#lq-arq'); i.onchange = () => { const f = i.files[0]; d.querySelector('#lq-erro').textContent = ''; if (!f) return;
          if (f.size > MAX_ARQ) { arq = null; d.querySelector('#lq-erro').textContent = 'O arquivo passa de 3 MB.'; return; }
          if (!/pdf|jpe?g|png/i.test(f.type + f.name)) { arq = null; d.querySelector('#lq-erro').textContent = 'Envie PDF, JPG ou PNG.'; return; }
          arq = f; d.querySelector('#lq-nome').textContent = f.name; }; } });
      if (!res) return;
      const b64 = String(await lerComo(arq, 'readAsDataURL')).replace(/^data:[^,]*,/, ''), envio = Math.random().toString(36).slice(2, 10), partes = Math.max(1, Math.ceil(b64.length / PEDACO));
      grava(b => {
        for (let k = 0; k < partes; k++) b.set(db.doc(`titulos/${t._id}/arquivos/${envio}-${k}`), { d: b64.slice(k * PEDACO, (k + 1) * PEDACO), k, envio, em: agora() });
        b.update(ref, { status: 'liquidado', liquidacao: Object.assign(ass(), (t.liberacao || {}).uid === eu(ctx) ? { excecao: true } : {}, { data: res.data, comprovante: { envio, partes, nome: arq.name.slice(0, 120), tipo: arq.type || '', tam: arq.size } }), atualizadoEm: agora() });
        log(b, ctx, 'titulo.liquidar', `Pagamento de ${brl(t.liquidoCentavos)} para ${t.prestadorNome} confirmado em ${dataTxt(res.data)}, com comprovante.`, t._id);
      }, 'Pagamento confirmado. A prestadora vê o comprovante.');
    };
    if (CW.emissaoMei) CW.emissaoMei.ligarVolta(ctx);
    const ct = $('tt-conta');
    if (ct) ct.onclick = () => formConta(el, ctx, t, conta);
    const bx = $('tt-baixar');
    if (bx) bx.onclick = async () => { if (!(await U0.confirmar('O dinheiro chegou?', `Confira na conta da empresa: ${brl(t.liquidoCentavos)} de ${t.tomadorNome}. A baixa fecha o título.`, 'Dar baixa'))) return;
      grava(b => { b.update(ref, { status: 'baixado', baixa: ass(), atualizadoEm: agora() }); log(b, ctx, 'titulo.baixar', `Recebimento de ${brl(t.liquidoCentavos)} de ${t.tomadorNome} (${periodoTxt(t.periodo)}) confirmado: título baixado.`, t._id); }, 'Título baixado.'); };
    const cp = $('tt-comp'); if (cp) cp.onclick = () => abrirComprovante(t);
  }

  /* prestadora informa (ou troca) a conta para receber; começa com a conta do cadastro */
  async function formConta(el, ctx, t, atual) {
    const U0 = U(), db = CW.fb.db(), agora = CW.fb.agora;
    let base = atual;
    if (!base) { try { const pv = CW.fb.dados(await db.doc('empresas/' + ctx.contexto.empresaId + '/privado/cadastro').get()) || {}, bk = pv.banco || {}; base = { banco: bk.banco || '', agencia: bk.agencia || '', conta: bk.conta || '', tipo: bk.tipoConta || '', pix: bk.pix || '' }; } catch (e) { base = {}; } }
    /* 13/11/2026: sem conta no cadastro (MEI pré-cadastrado), começa com a do último título desta empresa */
    if (!base.banco && !base.pix) { try { const ant = await ultimaConta(ctx.contexto.empresaId, t._id); if (ant) base = ant; } catch (e) { /* sem anterior */ } }
    const emp = ctx.contexto.empresa || {}, troca = !!(t.conta || {}).ok;
    let dados = null;
    await U0.dialogo({ titulo: troca ? 'Trocar a conta para receber' : 'Conta para receber', sub: troca ? 'A troca passa por revisão reforçada da empresa que paga antes de agendar o pagamento.' : 'Veio do cadastro da sua empresa. Confira antes de enviar.',
      corpo: `<div class="fgrid">
        <p class="hint c12" style="margin:0;font-size:12.5px">Pode ser só a chave Pix: deixe banco, agência e conta em branco.</p>
        <label class="f c12"><span>Banco</span><select id="fc-banco"><option value="">Escolha</option>${BANCOS.map(b => `<option ${b === base.banco ? 'selected' : ''}>${U0.esc(b)}</option>`).join('')}</select></label>
        <label class="f c4"><span>Agência</span><input id="fc-ag" inputmode="numeric" maxlength="6" value="${U0.esc(base.agencia || '')}"></label>
        <label class="f c4"><span>Conta com dígito</span><input id="fc-ct" inputmode="numeric" maxlength="20" value="${U0.esc(base.conta || '')}"></label>
        <label class="f c4"><span>Tipo</span><select id="fc-tp">${['Corrente', 'Poupança', 'Pagamento'].map(x => `<option ${x === base.tipo ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="f c12"><span>Chave Pix <i>(opcional)</i></span><input id="fc-pix" maxlength="120" value="${U0.esc(base.pix || '')}"></label>
        <p class="hint c12" style="margin:0;font-size:12.5px">Titular: ${U0.esc(emp.razao || emp.nome || ctx.contexto.nome)} · ${U0.esc(emp.cnpj || '')}. A conta precisa estar no CNPJ da empresa.</p>
        <p class="err c12" id="fc-erro" role="alert"></p></div>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: troca ? 'Enviar a conta nova' : 'Enviar a conta', valor: 'ok', antes: d => {
        const g = x => d.querySelector(x).value.trim(), er = d.querySelector('#fc-erro');
        const x = { banco: g('#fc-banco'), agencia: U0.dig(g('#fc-ag')), conta: g('#fc-ct').replace(/[^\dXx-]/g, ''), tipo: g('#fc-tp'), pix: g('#fc-pix') };
        const soPix = x.pix && !x.banco && !x.agencia && !U0.dig(x.conta);   /* 13/11/2026: só o Pix também vale */
        if (!soPix) {
          if (!x.banco) { er.textContent = 'Escolha o banco (ou deixe banco, agência e conta em branco e informe só a chave Pix).'; return false; }
          if (x.agencia.length < 3) { er.textContent = 'Informe a agência.'; return false; }
          if (U0.dig(x.conta).length < 3) { er.textContent = 'Informe a conta com o dígito.'; return false; } }
        if (soPix && x.pix.length < 5) { er.textContent = 'Confira a chave Pix.'; return false; }
        if (troca && atual && atual.banco === x.banco && atual.agencia === x.agencia && atual.conta === x.conta && (atual.pix || '') === x.pix) { er.textContent = 'É a mesma conta de antes.'; return false; }
        dados = x; return true; } }] });
    if (!dados) return;
    const versao = ((t.conta || {}).versao || 0) + 1, b = db.batch();
    b.set(db.doc('titulos/' + t._id + '/privado/conta'), Object.assign({}, dados, { titular: emp.razao || emp.nome || ctx.contexto.nome || '', doc: emp.cnpj || '', versao, em: agora(), por: eu(ctx), porNome: quem(ctx) }));
    b.update(db.doc('titulos/' + t._id), { conta: { ok: true, revisao: troca, versao, em: agora(), nome: quem(ctx) }, atualizadoEm: agora() });
    log(b, ctx, troca ? 'titulo.conta_trocar' : 'titulo.conta', `${troca ? 'Conta para receber trocada' : 'Conta para receber informada'} no título de ${t.tomadorNome} (${periodoTxt(t.periodo)}): ${dados.banco ? dados.banco + ', ag. ' + dados.agencia : 'só a chave Pix'}.`, t._id);
    try { await b.commit(); U0.toast(troca ? 'Conta nova enviada. A empresa que paga confere antes de agendar.' : 'Conta enviada.'); } catch (e) { U0.toast(CW.fb.mensagemErro(e), 'erro'); }
    desenharVer(el, ctx, t._id);
  }

  /* conta do último título com conta desta empresa (quem recebe), para não digitar o Pix de novo a cada quinzena */
  async function ultimaConta(empId, menos) {
    const db = CW.fb.db(), ts = CW.fb.lista(await db.collection('titulos').where('prestadorId', '==', empId).get())
      .filter(x => x._id !== menos && x.conta && x.conta.ok);
    const k = x => { const e = (x.conta || {}).em; return e && e.seconds ? new Date(e.seconds * 1000).toISOString() : String(e || x.atualizadoEm || ''); };
    ts.sort((a, b) => k(b).localeCompare(k(a)));
    for (const x of ts) { try { const c = CW.fb.dados(await db.doc('titulos/' + x._id + '/privado/conta').get()); if (c) return { banco: c.banco || '', agencia: c.agencia || '', conta: c.conta || '', tipo: c.tipo || '', pix: c.pix || '' }; } catch (e) { /* sem leitura */ } }
    return null;
  }
  CW.titulosConta = { ultimaConta };

  /* ---------- extrato do banco (14/11/2026): OFX ou planilha (CSV) ----------
     Lê as saídas do extrato e acha os títulos agendados com o mesmo valor líquido, pagos no dia agendado ou depois (até 3 dias
     antes também vale). Valor repetido em mais de um título: usa o nome de quem recebe na descrição; sem certeza, fica para
     conferir. Confirmar grava o pagamento como o botão de sempre, com o trecho do extrato como comprovante (texto). */
  const semAc = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function lerOfx(txt) {
    const out = []; const blocos = String(txt).split(/<STMTTRN>/i).slice(1);
    const tag = (b, n) => { const m = b.match(new RegExp('<' + n + '>([^<\r\n]*)', 'i')); return m ? m[1].trim() : ''; };
    blocos.forEach(b => { const v = Number(tag(b, 'TRNAMT').replace(',', '.')), d = tag(b, 'DTPOSTED');
      if (!isFinite(v) || !/^\d{8}/.test(d)) return;
      out.push({ data: d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8), centavos: Math.round(v * 100), desc: [tag(b, 'NAME'), tag(b, 'MEMO')].filter(Boolean).join(' · '), id: tag(b, 'FITID') }); });
    return out;
  }
  function lerCsvExtrato(txt) {
    const L = CW.medicoes.csvLinhas(txt), num = CW.medicoes.numero;
    const hi = L.findIndex(l => l.some(c => /^data/.test(semAc(c))) && l.some(c => /valor|debito|saida/.test(semAc(c))));
    if (hi < 0) throw new Error('Não achei as colunas Data e Valor no extrato. Exporte em OFX ou numa planilha com Data, Descrição e Valor.');
    const cab = L[hi].map(semAc), col = re => cab.findIndex(c => re.test(c));
    const cD = col(/^data/), cV = col(/^valor/), cDeb = col(/debito|saida/), cH = col(/descri|historico|lancamento|favorecido|memo/);
    const data = v => { const m = String(v || '').match(/(\d{2})\/(\d{2})\/(\d{2,4})/); if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + m[2] + '-' + m[1]; const n = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return n ? n[0] : ''; };
    return L.slice(hi + 1).map((l, i) => { let v = cV >= 0 ? num(l[cV]) : NaN; if (cDeb >= 0 && num(l[cDeb])) v = -Math.abs(num(l[cDeb]));
      return { data: data(l[cD]), centavos: Math.round((v || 0) * 100), desc: cH >= 0 ? String(l[cH] || '').trim() : '', id: 'l' + (hi + 2 + i) }; }).filter(x => x.data && x.centavos);
  }
  function casarExtrato(movs, titulos) {
    const saidas = movs.filter(m => m.centavos < 0), usados = new Set(), res = [];
    const dia = s => Date.parse(s + 'T12:00:00');
    titulos.forEach(t => {
      const ag = ((t.agendamento || {}).data) || '';
      const cands = saidas.filter(m => !usados.has(m) && -m.centavos === t.liquidoCentavos && (!ag || dia(m.data) >= dia(ag) - 3 * 864e5));
      const nome = semAc(t.prestadorNome).split(/\s+/).filter(w => w.length >= 4);
      const porNome = cands.filter(m => nome.some(w => semAc(m.desc).includes(w)));
      const outros = titulos.filter(o => o !== t && o.liquidoCentavos === t.liquidoCentavos).length;
      const m = porNome.length === 1 ? porNome[0] : (cands.length === 1 && !outros ? cands[0] : null);
      if (m) { usados.add(m); res.push({ t, m, certo: true }); }
      else if (cands.length) res.push({ t, m: (porNome[0] || cands[0]), certo: false });
      else res.push({ t, m: null, certo: false });
    });
    return res;
  }
  async function conferirExtrato(el, ctx, f) {
    const U0 = U(), { esc } = U0;
    if (f.size > 2 * 1024 * 1024) { U0.toast('O extrato passa de 2 MB. Exporte só o período dos pagamentos.', 'erro'); return; }
    let movs;
    try { const txt = await f.text(); movs = /<STMTTRN>/i.test(txt) ? lerOfx(txt) : lerCsvExtrato(txt); }
    catch (e) { U0.toast(e.message || 'Não foi possível ler o extrato.', 'erro'); return; }
    const ags = tT.filter(t => t.status === 'agendado');
    const res = casarExtrato(movs, ags), achados = res.filter(x => x.m);
    const linha = (x, i) => { const t = x.t, m = x.m, eu0 = (t.liberacao || {}).uid === eu(ctx);
      return `<label class="tt-ex ${x.m ? '' : 'nao'}" style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--line)">
        <input type="checkbox" data-ex="${i}" ${x.certo && !eu0 ? 'checked' : ''} ${!m || eu0 ? 'disabled' : ''} style="margin-top:4px">
        <span style="flex:1;min-width:0"><b>${esc(t.prestadorNome)}</b> · ${esc(brl(t.liquidoCentavos))}<br>
        <small class="hint">${m ? `No extrato: ${esc(dataTxt(m.data))} · ${esc(m.desc || 'sem descrição')}${x.certo ? '' : ' · <b>confira</b> (mais de um lançamento possível)'}` : 'Não achei no extrato um pagamento com esse valor.'}${eu0 ? ' · você liberou este pagamento: outra pessoa confirma' : ''}</small></span></label>`; };
    let marcados = null;
    await U0.dialogo({ titulo: 'Conferir pelo extrato', sub: `${movs.filter(m => m.centavos < 0).length} saídas no extrato · ${achados.length} de ${ags.length} pagamentos agendados encontrados`,
      corpo: `<div id="tt-ex-lista">${res.map(linha).join('')}</div><p class="hint" style="margin:10px 0 0;font-size:12.5px">O trecho do extrato fica como comprovante de cada pagamento. "Agendado" só vira "pago" com o que aparece no extrato.</p>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Confirmar os marcados', valor: 'ok', classe: 'ok', antes: d => { marcados = Array.from(d.querySelectorAll('[data-ex]:checked')).map(i => res[+i.dataset.ex]); return true; } }] });
    if (!marcados || !marcados.length) return;
    const db = CW.fb.db(), agora = CW.fb.agora; let feitos = 0; const erros = [];
    for (const x of marcados) {
      const t = x.t, m = x.m, txt = `Comprovante pelo extrato do banco\nArquivo: ${f.name}\nData: ${dataTxt(m.data)}\nValor: ${brl(-m.centavos)}\nDescrição: ${m.desc}\nIdentificador do lançamento: ${m.id}\nConferido no Conectwork por ${quem(ctx)}.`;
      const b64 = btoa(unescape(encodeURIComponent(txt))), envio = Math.random().toString(36).slice(2, 10), b = db.batch();
      b.set(db.doc(`titulos/${t._id}/arquivos/${envio}-0`), { d: b64, k: 0, envio, em: agora() });
      b.update(db.doc('titulos/' + t._id), { status: 'liquidado', liquidacao: { uid: eu(ctx), nome: quem(ctx), em: agora(), data: m.data,
        comprovante: { envio, partes: 1, nome: ('extrato-' + f.name).slice(0, 120) + '.txt', tipo: 'text/plain', tam: txt.length }, extrato: { arquivo: f.name.slice(0, 120), id: String(m.id).slice(0, 80), desc: String(m.desc).slice(0, 160) } }, atualizadoEm: agora() });
      log(b, ctx, 'titulo.liquidar', `Pagamento de ${brl(t.liquidoCentavos)} para ${t.prestadorNome} confirmado em ${dataTxt(m.data)} pelo extrato do banco (${f.name}).`, t._id);
      try { await b.commit(); feitos++; t.status = 'liquidado'; } catch (e) { erros.push(t.prestadorNome + ': ' + CW.fb.mensagemErro(e)); }
    }
    U0.toast(feitos + (feitos === 1 ? ' pagamento confirmado' : ' pagamentos confirmados') + ' pelo extrato.' + (erros.length ? ' Não deu: ' + erros.join('; ') : ''), erros.length ? 'erro' : '');
    desenharLista(el, ctx);
  }

  async function abrirComprovante(t) {
    const cp = (t.liquidacao || {}).comprovante; if (!cp) return;
    try {
      const db = CW.fb.db(), ps = await Promise.all(Array.from({ length: cp.partes }, (_, k) => db.doc(`titulos/${t._id}/arquivos/${cp.envio}-${k}`).get()));
      const bin = atob(ps.map(p => (CW.fb.dados(p) || {}).d || '').join('')), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([u8], { type: cp.tipo || 'application/pdf' })), a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { U().toast('Não foi possível abrir o comprovante: ' + CW.fb.mensagemErro(e), 'erro'); }
  }

  /* o título nasce junto com a nota conferida (chamado pelo espelho, na mesma gravação) */
  function criarNoLote(b, ctx, x) {
    const agora = CW.fb.agora, db = CW.fb.db();
    b.set(db.doc('titulos/' + x._id), { espelhoId: x._id, medicaoId: x.medicaoId, contratoId: x.contratoId, tomadorId: x.tomadorId, prestadorId: x.prestadorId, partes: [x.tomadorId, x.prestadorId],
      tomadorNome: x.tomadorNome, prestadorNome: x.prestadorNome, periodo: x.periodo, notaNumero: (x.nota && x.nota.numero) || '', chaveUnica: (x.nota && x.nota.chaveUnica) || '',
      valorCentavos: x.valorCentavos, liquidoCentavos: x.liquidoCentavos, retencoes: x.retencoes, vencimentoDias: x.vencimentoDias, base: agora(),
      status: 'aprovado', aprovacao: { uid: eu(ctx), nome: quem(ctx), em: agora() }, liberacao: null, agendamento: null, liquidacao: null, baixa: null,
      conta: { ok: false, revisao: false, versao: 0 }, criadoEm: agora(), atualizadoEm: agora() });
    log(b, ctx, 'titulo.criar', `Título a pagar para ${x.prestadorNome} (${periodoTxt(x.periodo)}): ${brl(x.liquidoCentavos)}, vence ${x.vencimentoDias} dia(s) depois da nota válida.`, x._id);
  }

  /* Início (09/11/2026): os próximos vencimentos em aberto, com os títulos que esta tela já carrega (nenhuma leitura nova) */
  const proximos = function (ctx, n) {
    if (!pronto || !ctx || !ctx.contexto) return null;
    const vistos = {}, todos = tT.concat(tP).filter(t => !vistos[t._id] && (vistos[t._id] = 1));
    return todos.filter(t => ABERTO.includes(t.status) && vencimento(t)).sort((a, b) => vencimento(a).localeCompare(vencimento(b))).slice(0, n || 5)
      .map(t => { const l = lado(t, ctx); return { id: t._id, nome: l === 'tomador' ? t.prestadorNome : t.tomadorNome, lado: l, valor: brl(t.liquidoCentavos), centavos: t.liquidoCentavos || 0, venc: dataTxt(vencimento(t)), vencIso: vencimento(t), vencido: vencido(t) }; });
  };

  CW.registrarModulo({
    id: 'titulos', nome: 'Pagar e receber', nomeCurto: 'Pagar/receber', icone: 'wallet', ordem: 28,
    para: ['empresa'], contrato: ['cobrancas', 'contratos'], semContrato: ctx => CW.repasse ? CW.repasse.ehMei(ctx) : false, semAprovacao: ctx => CW.repasse ? CW.repasse.meiSemAprov(ctx) : false,
    iniciar(ctx) {
      tT = []; tP = []; pronto = false;
      const db = CW.fb.db(), emp = ctx.contexto.empresaId, ok = { t: false, p: false };
      const redesenha = () => { if (!(ok.t && ok.p)) return; pronto = true;
        const el = document.getElementById('view'), at = CW.app.atual();
        if (el && at && at.modulo === 'titulos' && at.tela === 'lista') desenharLista(el, Object.assign({}, ctx, { sessao: CW.sessao.estado() }));
        CW.app.pendenciasMudaram(); };
      CW.inscrever('titulos-t', () => db.collection('titulos').where('tomadorId', '==', emp), s => { tT = CW.fb.lista(s); ok.t = true; redesenha(); });
      CW.inscrever('titulos-p', () => db.collection('titulos').where('prestadorId', '==', emp), s => { tP = CW.fb.lista(s); ok.p = true; redesenha(); });
      return () => { pronto = false; };
    },
    /* busca do topo: só o que esta tela já carregou */
    buscar(ctx) {
      const vistos = {};
      return tT.concat(tP).filter(t => !vistos[t._id] && (vistos[t._id] = 1)).map(t => { const l = lado(t, ctx), v = vencimento(t);
        return { t: `${l === 'tomador' ? 'A pagar' : 'A receber'} · ${l === 'tomador' ? t.prestadorNome : t.tomadorNome}`, s: `${brl(t.liquidoCentavos)}${v ? ' · vence ' + dataTxt(v) : ''}${t.notaNumero ? ' · nota ' + t.notaNumero : ''}`,
          rota: 'titulos/ver/' + t._id, txt: [t.tomadorNome, t.prestadorNome, t.notaNumero ? 'nota ' + t.notaNumero : '', l === 'tomador' ? 'pagar pagamento' : 'receber', periodoTxt(t.periodo), brl(t.liquidoCentavos)].join(' ') }; });
    },
    pendencias(ctx) {
      if (!pronto) return [];
      return tT.concat(tP).map(t => ({ t, v: minhaVez(t, ctx) })).filter(x => x.v).map(({ t, v }) => ({ txt: v, rota: 'titulos/ver/' + t._id,
        sub: `${lado(t, ctx) === 'tomador' ? t.prestadorNome : t.tomadorNome} · ${brl(t.liquidoCentavos)} · vence ${dataTxt(vencimento(t))}${vencido(t) ? ' (vencido)' : ''}` }));
    },
    telas: {
      lista: { nome: 'Pagar e receber', sub: 'Contas a pagar e a receber das notas conferidas, com o calendário de vencimentos.', render: (el, ctx) => desenharLista(el, ctx) },
      ver: { nome: 'Título', sub: 'Vencimento, liberação, agendamento, pagamento com comprovante e baixa.', render: (el, ctx) => desenharVer(el, ctx, ctx.params[0]) }
    }
  });
  /* Dinheiro do MEI (10/11/2026): notas da rede já pagas para a minha empresa, com o dia do pagamento (sem leitura nova) */
  const recebidos = function (ctx) {
    if (!pronto || !ctx || !ctx.contexto) return [];
    return tP.filter(t => ['liquidado', 'baixado'].includes(t.status) && t.liquidacao && t.liquidacao.data)
      .map(t => ({ id: t._id, nome: t.tomadorNome, centavos: t.liquidoCentavos || 0, data: String(t.liquidacao.data).slice(0, 10), nota: t.notaNumero || '' }));
  };
  CW.titulos = { lerOfx, lerCsvExtrato, casarExtrato,  demoLinhas,  criarNoLote, vencimento, proximos, recebidos };
})();
