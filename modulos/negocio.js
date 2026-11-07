/* Conectwork · "Meu negócio": a área do profissional PJ/MEI (e de qualquer prestadora).
   - Faturamento do ano: notas emitidas pelo Conectwork (pela competência) + o que a pessoa fatura fora do Conectwork.
   - Limite do MEI: barra do ano, aviso a partir de 80% e quando passa (passar até 20% desenquadra no ano seguinte; mais
     que isso, desde o mês em que passou — confirme com o contador).
   - De quem vem o faturamento (12 meses): se um só cliente passa de 80%, o app mostra. Ter outros clientes é sinal de
     negócio independente (dependência econômica é um dos sinais que a Justiça olha na pejotização).
   - Outros clientes e faturamento fora do Conectwork: privados (faturamento/{empresaId}). Opcional: mostrar às empresas
     que contratam só QUANTOS clientes atende (independencia/{empresaId}), sem nomes nem valores.
   Não é orientação contábil: os números servem para acompanhar; o contador confirma. */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const LIMITE_MEI = 8100000;   /* R$ 81.000,00 por ano (regra vigente do MEI; proporcional no ano de abertura) */
  const VE = ['admin', 'financeiro'];
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const brl = c => U().formatarDinheiro(c || 0);
  const cargo = ctx => ctx.contexto.acesso && ctx.contexto.acesso.cargo;
  const pode = ctx => !ctx.soLeitura && VE.includes(cargo(ctx));
  const quem = ctx => (ctx.sessao.perfil && ctx.sessao.perfil.nome) || ctx.sessao.usuario.email;
  const log = (b, ctx, acao, texto) => b.set(CW.fb.db().collection('log').doc(), { em: CW.fb.agora(), uid: ctx.sessao.usuario.uid, quem: quem(ctx), empresaId: ctx.contexto.empresaId, acao, texto, ref: '' });
  const anoAtual = () => new Date().getFullYear();
  const mesesAtras = n => { const out = [], d = new Date(); d.setDate(1); for (let i = 0; i < n; i++) { out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); d.setMonth(d.getMonth() - 1); } return out; };

  let D = null;   /* { esp, tit, os, fat, ind, porte } */

  async function carregar(ctx) {
    const db = CW.fb.db(), emp = ctx.contexto.empresaId, q = col => db.collection(col).where('prestadorId', '==', emp).get().then(s => CW.fb.lista(s)).catch(() => []);
    const [esp, tit, os, f, i, pv] = await Promise.all([q('espelhos'), q('titulos'), q('ordens'), db.doc('faturamento/' + emp).get().catch(() => null), db.doc('independencia/' + emp).get().catch(() => null), db.doc('empresas/' + emp + '/privado/cadastro').get().catch(() => null)]);
    return { esp, tit, os, fat: (f && CW.fb.dados(f)) || { anos: {}, clientes: [] }, ind: (i && CW.fb.dados(i)) || null, porte: ((pv && CW.fb.dados(pv)) || {}).dados ? CW.fb.dados(pv).dados.porte || '' : '' };
  }
  /* faturado pelo Conectwork por mês (competência da nota) e por cliente */
  function contas(D) {
    const porMes = {}, porCli = {}, ult = new Set(mesesAtras(12));
    D.esp.filter(e => e.nota).forEach(e => { const m = e.competencia; porMes[m] = (porMes[m] || 0) + e.valorCentavos; if (ult.has(m)) porCli[e.tomadorNome] = (porCli[e.tomadorNome] || 0) + e.valorCentavos; });
    const fora = {}; Object.entries(D.fat.anos || {}).forEach(([a, ms]) => Object.entries(ms || {}).forEach(([mm, v]) => { fora[`${a}-${mm}`] = v || 0; }));
    const foraUlt = [...ult].reduce((s, m) => s + (fora[m] || 0), 0);
    if (foraUlt) porCli['Fora do Conectwork'] = foraUlt;
    const ano = String(anoAtual()), noAno = Object.entries(porMes).filter(([m]) => m.startsWith(ano)).reduce((s, [, v]) => s + v, 0) + Object.entries(fora).filter(([m]) => m.startsWith(ano)).reduce((s, [, v]) => s + v, 0);
    const tot12 = Object.values(porCli).reduce((s, v) => s + v, 0);
    const ranking = Object.entries(porCli).sort((a, b) => b[1] - a[1]).map(([n, v]) => ({ n, v, p: tot12 ? v / tot12 : 0 }));
    const maior = ranking.find(r => r.n !== 'Fora do Conectwork') || null;
    return { noAno, tot12, ranking, maior, fora, porMes };
  }

  async function render(el, ctx) {
    const { esc, ic } = U();
    el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Montando o seu painel…</span></div></div>`;
    try { D = await carregar(ctx); } catch (e) { el.innerHTML = `<div class="banner danger">${ic('alert')}<span><strong>Não foi possível abrir.</strong>${esc(CW.fb.mensagemErro(e))}</span></div>`; return; }
    const K = contas(D), mei = String(D.porte).startsWith('MEI'), pct = K.noAno / LIMITE_MEI, ano = anoAtual();
    const abertas = D.os.filter(o => ['proposta', 'aceita', 'divergencia'].includes(o.status)).sort((a, b) => String(a.prazo).localeCompare(String(b.prazo)));
    const receber = D.tit.filter(t => ['aprovado', 'liberado', 'agendado', 'liquidado'].includes(t.status));
    const venc = t => CW.titulos ? CW.titulos.vencimento(t) : '';
    const dataTxt = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
    const cor = pct >= 1 ? 'var(--danger)' : pct >= 0.8 ? 'var(--warn)' : 'var(--ok)';
    const clientes = D.fat.clientes || [];
    const nCli = new Set(D.esp.filter(e => e.nota).map(e => e.tomadorId)).size + clientes.length;
    el.innerHTML = `
      ${mei ? `<section class="card" id="ng-mei" style="margin-bottom:22px"><div class="card-h"><span class="ic">${ic('wallet')}</span><h3>Limite do MEI em ${ano}</h3><span class="count">${Math.round(pct * 100)}%</span></div><div class="card-b stack" style="gap:10px">
          <div class="ng-bar"><i style="width:${Math.min(100, pct * 100)}%;background:${cor}"></i></div>
          <p style="margin:0;font-size:14px"><b>${esc(brl(K.noAno))}</b> de ${esc(brl(LIMITE_MEI))} no ano (notas pelo Conectwork + o que você informou de fora).</p>
          ${pct >= 1 ? `<div class="banner danger" id="ng-aviso">${U().ic('alert')}<span><strong>Você passou do limite do MEI</strong>Até 20% acima, o desenquadramento vale a partir do ano seguinte; mais que isso, desde o mês em que passou. Fale com o seu contador já.</span></div>`
            : pct >= 0.8 ? `<div class="banner warn" id="ng-aviso">${U().ic('alert')}<span><strong>Perto do limite do MEI</strong>Faltam ${esc(brl(LIMITE_MEI - K.noAno))} para o limite do ano. Converse com o seu contador sobre o próximo passo (por exemplo, virar microempresa).</span></div>` : ''}
          <p class="hint" style="margin:0;font-size:12px">No ano em que o MEI foi aberto, o limite é proporcional aos meses. Os números são para acompanhar; o contador confirma.</p></div></section>`
        : `<section class="card" id="ng-ano" style="margin-bottom:22px"><div class="card-b"><p class="hint" style="margin:0 0 4px">Faturado em ${ano}</p><b style="font-size:22px">${esc(brl(K.noAno))}</b></div></section>`}
      <div class="grid-main"><div class="stack">
        <section class="card" id="ng-clientes"><div class="card-h"><span class="ic">${ic('users')}</span><h3>De quem vem o seu faturamento</h3><span class="hint" style="margin-left:auto;font-size:12px">últimos 12 meses</span></div><div class="card-b stack" style="gap:10px">
          ${K.ranking.length ? K.ranking.map(r => `<div class="ng-cli"><span>${esc(r.n)}</span><div class="ng-bar sm"><i style="width:${Math.round(r.p * 100)}%"></i></div><b>${Math.round(r.p * 100)}%</b></div>`).join('') : '<p class="hint" style="margin:0">Ainda sem notas nos últimos 12 meses.</p>'}
          ${K.maior && K.maior.p > 0.8 ? `<div class="banner warn" id="ng-dep">${ic('alert')}<span><strong>${Math.round(K.maior.p * 100)}% do seu faturamento vem de ${esc(K.maior.n)}</strong>Depender de um só cliente é um dos sinais que a Justiça olha para dizer que um PJ é, na prática, empregado. Ter outros clientes mostra que você é um negócio independente e protege você e quem contrata.</span></div>` : K.ranking.length > 1 ? `<p class="hint" style="margin:0;font-size:12.5px" id="ng-ok">Faturamento distribuído entre clientes: bom sinal de negócio independente.</p>` : ''}
        </div></section>
        <section class="card" id="ng-fora"><div class="card-h"><span class="ic">${ic('wallet')}</span><h3>Faturamento fora do Conectwork em ${ano}</h3></div><div class="card-b stack" style="gap:12px">
          <p class="hint" style="margin:0;font-size:12.5px">Notas que você emite para clientes que não usam o Conectwork. Só você e o financeiro da sua empresa veem.</p>
          <div class="ng-meses">${MESES.map((m, i) => { const k = String(i + 1).padStart(2, '0'), v = ((D.fat.anos || {})[ano] || {})[k] || 0; return `<label class="f"><span>${m}</span><input data-mes="${k}" data-mascara="dinheiro" inputmode="numeric" placeholder="0,00" value="${v ? U().formatarDinheiro(v, false) : ''}" ${pode(ctx) ? '' : 'disabled'}></label>`; }).join('')}</div>
          ${pode(ctx) ? `<div><button class="btn sec" id="ng-salvar-fora">${ic('check')}Salvar</button></div>` : ''}</div></section>
      </div><div class="stack">
        <section class="card" id="ng-outros"><div class="card-h"><span class="ic">${ic('building')}</span><h3>Outros clientes</h3><span class="count">${nCli}</span></div><div class="card-b stack" style="gap:10px">
          <p class="hint" style="margin:0;font-size:12.5px">Clientes de fora do Conectwork. Os nomes ficam só com você.</p>
          ${clientes.map((c, i) => `<div class="docrow ok"><span class="ic">${ic('building')}</span><div class="t"><strong>${esc(c.nome)}</strong><small>desde ${esc(c.desde || '—')}</small></div>${pode(ctx) ? `<button class="btn ghost sm" data-tirar="${i}">Tirar</button>` : ''}</div>`).join('')}
          ${pode(ctx) ? `<div class="fgrid"><label class="f c8"><span>Cliente</span><input id="ng-cli-n" maxlength="80" placeholder="Nome da empresa"></label><label class="f c4"><span>Desde</span><input id="ng-cli-d" type="month"></label></div>
            <div><button class="btn sec sm" id="ng-cli-add">${ic('plus')}Acrescentar</button></div>
            <label class="check"><input type="checkbox" id="ng-comp" ${D.ind && D.ind.compartilhar ? 'checked' : ''}> <span>Mostrar às empresas que me contratam quantos clientes eu atendo (sem nomes nem valores)</span></label>` : ''}
        </div></section>
        <section class="card" id="ng-os"><div class="card-h"><span class="ic">${ic('list')}</span><h3>Ordens de serviço em aberto</h3><span class="count">${abertas.length}</span></div>
          ${abertas.length ? abertas.map(o => `<a class="docrow ng-link" href="#ordens/ver/${esc(o._id)}"><span class="ic">${ic('list')}</span><div class="t"><strong>OS ${o.numero} · ${esc(o.titulo)}</strong><small>${esc(o.tomadorNome)} · prazo ${esc(dataTxt(o.prazo))}</small></div><b>${esc(brl(o.valorCentavos))}</b></a>`).join('') : '<p class="hint" style="margin:0;padding:14px 20px">Nenhuma OS em aberto.</p>'}</section>
        <section class="card" id="ng-receber"><div class="card-h"><span class="ic">${ic('clock')}</span><h3>A receber</h3><span class="count">${receber.length}</span></div>
          ${receber.length ? receber.map(t => `<a class="docrow ng-link" href="#titulos/ver/${esc(t._id)}"><span class="ic">${ic('wallet')}</span><div class="t"><strong>${esc(t.tomadorNome)}</strong><small>${t.status === 'liquidado' ? 'pago: confirme que chegou' : 'vence ' + esc(dataTxt(venc(t)))}</small></div><b>${esc(brl(t.liquidoCentavos))}</b></a>`).join('') : '<p class="hint" style="margin:0;padding:14px 20px">Nada a receber agora.</p>'}</section>
      </div></div>
      <p class="hint" style="margin:14px 0 0;font-size:12px">Você decide como, quando e onde trabalha, e pode recusar qualquer OS sem punição. O Conectwork organiza a gestão documental; a validade da relação depende da operação real e da análise jurídica e contábil adequada.</p>`;
    ligar(el, ctx);
  }

  function ligar(el, ctx) {
    const db = CW.fb.db(), emp = ctx.contexto.empresaId, agora = CW.fb.agora, $ = x => document.getElementById(x), ano = String(anoAtual());
    const salvarFat = async (fat, texto, msg) => { const b = db.batch(); b.set(db.doc('faturamento/' + emp), { anos: fat.anos || {}, clientes: fat.clientes || [], em: agora(), por: ctx.sessao.usuario.uid }); log(b, ctx, 'negocio.faturamento', texto);
      try { await b.commit(); U().toast(msg); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); } render(el, ctx); };
    const sf = $('ng-salvar-fora');
    if (sf) sf.onclick = () => { const anos = Object.assign({}, D.fat.anos || {}), m = {};
      el.querySelectorAll('[data-mes]').forEach(i => { const v = U().lerDinheiro(i.value) || 0; if (v) m[i.dataset.mes] = v; }); anos[ano] = m;
      salvarFat(Object.assign({}, D.fat, { anos }), `Faturamento fora do Conectwork de ${ano} atualizado.`, 'Faturamento salvo.'); };
    const add = $('ng-cli-add');
    if (add) add.onclick = () => { const n = $('ng-cli-n').value.trim(), dd = $('ng-cli-d').value;
      if (n.length < 2) { U().toast('Escreva o nome do cliente.', 'erro'); return; }
      const clientes = (D.fat.clientes || []).concat([{ nome: n.slice(0, 80), desde: dd ? dd.slice(5, 7) + '/' + dd.slice(0, 4) : '' }]);
      salvarFat(Object.assign({}, D.fat, { clientes }), 'Outro cliente acrescentado.', 'Cliente acrescentado.').then(() => sincInd(ctx, clientes.length)); };
    el.querySelectorAll('[data-tirar]').forEach(b => b.onclick = () => { const clientes = (D.fat.clientes || []).filter((_, i) => i !== +b.dataset.tirar);
      salvarFat(Object.assign({}, D.fat, { clientes }), 'Cliente tirado da lista.', 'Cliente tirado.').then(() => sincInd(ctx, clientes.length)); });
    const comp = $('ng-comp');
    if (comp) comp.onchange = () => sincInd(ctx, (D.fat.clientes || []).length, comp.checked, true);
  }
  /* só o número de clientes (Conectwork + fora) vai para o documento que as empresas podem ver */
  async function sincInd(ctx, nFora, compartilhar, aviso) {
    const db = CW.fb.db(), emp = ctx.contexto.empresaId, comp = compartilhar == null ? !!(D.ind && D.ind.compartilhar) : compartilhar;
    const nCli = new Set(D.esp.filter(e => e.nota).map(e => e.tomadorId)).size + nFora;
    const b = db.batch(); b.set(db.doc('independencia/' + emp), { nClientes: nCli, compartilhar: comp, em: CW.fb.agora(), por: ctx.sessao.usuario.uid });
    if (aviso) log(b, ctx, 'negocio.compartilhar', comp ? `Passou a mostrar às empresas que contratam que atende ${nCli} cliente(s).` : 'Deixou de mostrar o número de clientes às empresas que contratam.');
    try { await b.commit(); D.ind = { nClientes: nCli, compartilhar: comp }; if (aviso) U().toast(comp ? 'As empresas que contratam vão ver quantos clientes você atende.' : 'Número de clientes não aparece mais.'); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); }
  }

  CW.registrarModulo({
    id: 'negocio', nome: 'Meu negócio', nomeCurto: 'Negócio', icone: 'star', ordem: 26,
    para: ['empresa'], contrato: ['contratos', 'cobrancas'],
    mostrar: ctx => ['prestador', 'ambos'].includes((ctx.empresa || {}).tipo),
    telas: { painel: { nome: 'Meu negócio', sub: 'Faturamento do ano, limite do MEI, de quem vem o seu faturamento, outros clientes e o que você tem a receber.', render } }
  });
  CW.negocio = { contas, LIMITE_MEI };
})();
