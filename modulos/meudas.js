/* Conectwork · DAS do ano e Check-up do CNPJ (10/11/2026, perfil MEI; layout inspirado na referência aprovada pela usuária).
   - DAS do ano (#mei/das): mês a mês, com selo Pago / Em aberto / Vencido, troca de ano, "Gerar a guia" no site oficial
     (PGMEI) e "Paguei" / "Não paguei". Grava em fiscal/{empresa}.das, o mesmo registro do Meu negócio, com histórico.
     O Conectwork não emite nem consulta a guia na Receita: isso precisa da integração oficial no servidor (etapa futura).
   - Check-up do CNPJ (#mei/checkup): o MEI está em dia? DAS, declaração anual, limite do faturamento, documentos e
     cadastro na rede, cada um com o que fazer. Conta com o que a pessoa marcou no Conectwork. */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const EDITA = ['admin', 'financeiro'];
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const pode = ctx => !ctx.soLeitura && EDITA.includes(ctx.contexto.acesso && ctx.contexto.acesso.cargo);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hoje = () => iso(new Date());
  const dataBR = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
  const mesNome = m => { const t = MESES[+m.slice(5, 7) - 1]; return t[0].toUpperCase() + t.slice(1); };
  const ms = v => !v ? 0 : typeof v.toMillis === 'function' ? v.toMillis() : v.seconds ? v.seconds * 1000 : (Date.parse(v) || 0);
  let D = null, ano = null;

  async function carregar(ctx) {
    const db = CW.fb.db(), emp = ctx.contexto.empresaId;
    const [fi, pv] = await Promise.all([db.doc('fiscal/' + emp).get().catch(() => null), db.doc('empresas/' + emp + '/privado/cadastro').get().catch(() => null)]);
    const dados = ((pv && CW.fb.dados(pv)) || {}).dados || {}, e = ctx.contexto.empresa || {};
    /* começo do MEI: data de abertura do cadastro completo; senão, o mês em que entrou no Conectwork */
    const inicio = dados.abertura ? String(dados.abertura).slice(0, 7) : (ms(e.criadoEm) ? iso(new Date(ms(e.criadoEm))).slice(0, 7) : hoje().slice(0, 4) + '-01');
    return { fiscal: (fi && CW.fb.dados(fi)) || { das: {}, dasn: {} }, inicio };
  }
  /* situação de cada mês do ano (só meses que já começaram e depois da abertura) */
  function mesesDoAno(a) {
    const h = hoje(), venc = m => CW.negocio.vencDas(m), out = [];
    for (let i = 1; i <= 12; i++) {
      const m = `${a}-${String(i).padStart(2, '0')}`;
      if (m > h.slice(0, 7) || m < D.inicio) continue;
      const p = (D.fiscal.das || {})[m], pago = !!(p && p.pago), v = venc(m);
      out.push({ m, venc: v, pago, data: p && p.data, st: pago ? 'pago' : v < h ? 'vencido' : 'aberto' });
    }
    return out.reverse();
  }
  function vencidos() { const a0 = +D.inicio.slice(0, 4), a1 = +hoje().slice(0, 4), out = []; for (let a = a0; a <= a1; a++) mesesDoAno(a).forEach(x => { if (x.st === 'vencido') out.push(x); }); return out; }

  async function gravar(ctx, das, texto, msg, el) {
    const db = CW.fb.db(), b = db.batch(), novo = { das, dasn: D.fiscal.dasn || {}, em: CW.fb.agora(), por: ctx.sessao.usuario.uid };
    b.set(db.doc('fiscal/' + ctx.contexto.empresaId), novo); CW.log.logNoLote(b, 'negocio.fiscal', texto, '');
    try { await b.commit(); D.fiscal = Object.assign({}, D.fiscal, { das }); if (CW.negocio.recalcular) CW.negocio.recalcular(D.fiscal); U().toast(msg); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); }
    desenharDas(el, ctx);
  }

  /* ---------- DAS do ano ---------- */
  async function telaDas(el, ctx) {
    el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Carregando o seu DAS…</span></div></div>`;
    try { D = await carregar(ctx); } catch (e) { el.innerHTML = `<div class="banner danger">${U().ic('alert')}<span><strong>Não deu para abrir o DAS.</strong>${U().esc(CW.fb.mensagemErro(e))}</span></div>`; return; }
    ano = ano || +hoje().slice(0, 4); desenharDas(el, ctx);
  }
  function desenharDas(el, ctx) {
    const { esc, ic } = U(), ed = pode(ctx), anos = []; for (let a = +D.inicio.slice(0, 4); a <= +hoje().slice(0, 4); a++) anos.push(a);
    const lista = mesesDoAno(ano), venc = vencidos(), PG = CW.negocio.PGMEI;
    const selo = x => x.st === 'pago' ? `<span class="das-selo pago">${ic('check')}Pago</span>` : x.st === 'vencido' ? `<span class="das-selo venc">Vencido</span>` : `<span class="das-selo aberto">Em aberto</span>`;
    el.innerHTML = `${venc.length ? `<div class="mh-alerta" id="das-alerta"><span class="mh-alerta-ic">${ic('alert')}</span><span class="t"><b>Você tem ${venc.length === 1 ? 'DAS vencido' : venc.length + ' DAS vencidos'}</b><small>Regularize e fique em dia: gere a guia no site oficial e marque aqui quando pagar.</small></span></div>` : ''}
      <div class="das-topo"><div class="das-anos" role="group" aria-label="Ano">${anos.map(a => `<button type="button" class="mh-chip" data-ano="${a}" aria-pressed="${a === ano}">${ic('clock')}${a}</button>`).join('')}</div>
        <a class="btn sec" href="${esc(PG)}" target="_blank" rel="noopener" id="das-gerar">${ic('receipt')}Gerar a guia no site oficial</a></div>
      <div class="das-lista" id="das-lista">${lista.length ? lista.map(x => `<div class="das-it ${x.st}" data-mes="${x.m}">
          <div class="das-l">${selo(x)}<b>${esc(mesNome(x.m))} ${x.m.slice(0, 4)}</b></div>
          <div class="das-r"><small>${x.st === 'pago' ? 'Pago' + (x.data ? ' em ' + esc(dataBR(x.data)) : '') : 'Vencimento: ' + esc(dataBR(x.venc))}</small>
            ${ed ? (x.st === 'pago' ? `<button class="linkbtn" data-naopaguei="${x.m}">Não paguei</button>` : `<button class="btn sm" data-paguei="${x.m}">${ic('check')}Paguei</button>`) : ''}</div></div>`).join('')
        : `<div class="empty"><strong>Nenhum DAS em ${ano}.</strong><span>O DAS começa no mês em que o MEI foi aberto.</span></div>`}</div>
      <p class="hint" style="margin:14px 0 0;font-size:12.5px">O DAS de cada mês vence no dia 20 do mês seguinte e precisa ser pago mesmo sem faturar. O Conectwork mostra o que você marcou aqui; para conferir na Receita, use o site oficial do DAS (consulta de extrato).</p>`;
    el.querySelectorAll('[data-ano]').forEach(b => b.onclick = () => { ano = +b.dataset.ano; desenharDas(el, ctx); });
    el.querySelectorAll('[data-paguei]').forEach(b => b.onclick = async () => { const m = b.dataset.paguei;
      if (!(await U().confirmar(`Pagou o DAS de ${mesNome(m).toLowerCase()}?`, `Fica marcado como pago hoje (${dataBR(hoje())}). Guarde o comprovante.`, 'Paguei'))) return;
      gravar(ctx, Object.assign({}, D.fiscal.das || {}, { [m]: { pago: true, data: hoje() } }), `DAS de ${mesNome(m).toLowerCase()}/${m.slice(0, 4)} marcado como pago.`, 'DAS marcado como pago.', el); });
    el.querySelectorAll('[data-naopaguei]').forEach(b => b.onclick = async () => { const m = b.dataset.naopaguei;
      if (!(await U().confirmar('Desmarcar o pagamento?', `O DAS de ${mesNome(m).toLowerCase()} volta a ficar em aberto.`, 'Desmarcar'))) return;
      const das = Object.assign({}, D.fiscal.das || {}); das[m] = { pago: false };
      gravar(ctx, das, `DAS de ${mesNome(m).toLowerCase()}/${m.slice(0, 4)} desmarcado (não pago).`, 'Pagamento desmarcado.', el); });
  }

  /* ---------- Check-up do CNPJ ---------- */
  async function telaCheckup(el, ctx) {
    const { esc, ic } = U();
    el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Fazendo o check-up…</span></div></div>`;
    let K = null;
    try { D = await carregar(ctx); const N = await CW.negocio.carregar(ctx); K = CW.negocio.contas(N); }
    catch (e) { el.innerHTML = `<div class="banner danger">${ic('alert')}<span><strong>Não deu para fazer o check-up.</strong>${esc(CW.fb.mensagemErro(e))}</span></div>`; return; }
    const itens = checkup(ctx, K), probs = itens.filter(x => x.st === 'ruim').length, avisos = itens.filter(x => x.st === 'aviso').length;
    el.innerHTML = `<section class="ck-topo ${probs ? 'ruim' : avisos ? 'aviso' : 'bom'}" id="ck-res"><span class="ck-ic">${ic(probs ? 'alert' : 'shield')}</span>
        <div><b>${probs ? (probs === 1 ? '1 ponto para resolver' : probs + ' pontos para resolver') : 'Seu MEI está em dia'}</b><small>${probs ? 'Resolva e o seu MEI fica em dia.' : avisos ? 'Tudo certo por enquanto. Fique de olho nos avisos.' : 'Continue assim: DAS pago, declaração entregue e faturamento dentro do limite.'}</small></div></section>
      <div class="ck-lista" id="ck-lista">${itens.map(x => `<div class="ck-it ${x.st}" data-ck="${x.k}"><span class="ck-dot">${ic(x.st === 'bom' ? 'check' : x.st === 'info' ? 'star' : 'alert')}</span>
        <div class="t"><b>${esc(x.t)}</b><small>${esc(x.s)}</small></div>${x.ir ? `<button class="btn sm ${x.st === 'ruim' ? '' : 'sec'}" data-ir="${esc(x.ir[1])}">${esc(x.ir[0])}</button>` : ''}</div>`).join('')}</div>
      <p class="hint" style="margin:14px 0 0;font-size:12.5px">O check-up usa o que está registrado no Conectwork. Ele não substitui a consulta oficial na Receita nem o seu contador.</p>`;
    el.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => CW.ir(b.dataset.ir));
  }
  function checkup(ctx, K) {
    const out = [], v = vencidos(), h = hoje(), S = CW.negocio.situacaoFiscal(D.fiscal), L = CW.negocio.LIMITE_MEI, brl = c => U().formatarDinheiro(c);
    out.push(v.length ? { k: 'das', st: 'ruim', t: v.length === 1 ? 'DAS vencido' : `${v.length} DAS vencidos`, s: v.slice(0, 3).map(x => mesNome(x.m) + '/' + x.m.slice(0, 4)).join(', ') + (v.length > 3 ? ' e outros' : '') + '. Gere a guia e pague para ficar em dia.', ir: ['Ver DAS', 'mei/das'] }
      : { k: 'das', st: 'bom', t: 'DAS em dia', s: 'Nenhuma guia vencida pelo que está marcado.', ir: ['Ver DAS', 'mei/das'] });
    const abriuEsteAno = +D.inicio.slice(0, 4) >= +h.slice(0, 4);
    out.push(abriuEsteAno ? { k: 'dasn', st: 'info', t: 'Declaração anual', s: 'Como o MEI abriu este ano, a primeira declaração é até 31 de maio do ano que vem.' }
      : S.dasn.entregue ? { k: 'dasn', st: 'bom', t: `Declaração anual de ${S.dasn.ano} entregue`, s: 'A próxima é até 31 de maio do ano que vem.' }
        : S.dasn.prazo < h ? { k: 'dasn', st: 'ruim', t: `Declaração anual de ${S.dasn.ano} atrasada`, s: 'O prazo era 31 de maio. Entregue logo para evitar multa.', ir: ['Resolver', 'negocio'] }
          : { k: 'dasn', st: 'aviso', t: `Declaração anual de ${S.dasn.ano} a entregar`, s: 'Prazo: 31 de maio.', ir: ['Resolver', 'negocio'] });
    const p = K.noAno / L;
    out.push(p >= 1 ? { k: 'limite', st: 'ruim', t: 'Passou do limite do MEI', s: `${brl(K.noAno)} de ${brl(L)} no ano. Fale com o seu contador sobre o desenquadramento.`, ir: ['Ver faturamento', 'negocio'] }
      : p >= 0.8 ? { k: 'limite', st: 'aviso', t: 'Perto do limite do MEI', s: `${brl(K.noAno)} de ${brl(L)} no ano (${Math.round(p * 100)}%).`, ir: ['Ver faturamento', 'negocio'] }
        : { k: 'limite', st: 'bom', t: 'Faturamento dentro do limite', s: `${brl(K.noAno)} de ${brl(L)} no ano (${Math.round(p * 100)}%).` });
    const docs = CW.documentos && CW.documentos.comValidade ? CW.documentos.comValidade() : [];
    if (CW.app.visiveis().some(m => m.id === 'documentos')) { const vencs = docs.filter(d => d.validade < h);
      out.push(vencs.length ? { k: 'docs', st: 'ruim', t: vencs.length === 1 ? 'Documento vencido' : `${vencs.length} documentos vencidos`, s: vencs.map(d => d.nome).slice(0, 2).join(', '), ir: ['Ver documentos', 'documentos'] }
        : { k: 'docs', st: 'bom', t: 'Documentos e certidões', s: docs.length ? 'Os enviados estão dentro da validade.' : 'Nenhum documento com validade vencida.' }); }
    const st = (ctx.contexto.empresa || {}).status;
    out.push(st === 'aprovado' ? { k: 'rede', st: 'bom', t: 'Cadastro na rede aprovado', s: 'Empresas podem contratar você pelo Conectwork.' }
      : st === 'mei' ? { k: 'rede', st: 'info', t: 'Receber pedidos de empresas', s: 'Opcional: complete o cadastro com os documentos para entrar na rede.', ir: ['Completar', 'meucadastro'] }
        : { k: 'rede', st: 'info', t: 'Cadastro na rede em análise', s: 'A equipe Conectwork está conferindo os documentos.', ir: ['Ver situação', 'meucadastro'] });
    return out;
  }

  const ehMei = ctx => { let p = ''; try { p = sessionStorage.getItem('cw.porte.' + ctx.empresaId) || ''; } catch (e) {} return String(p).startsWith('MEI'); };
  CW.registrarModulo({
    id: 'mei', nome: 'Meu MEI', icone: 'receipt', ordem: 26.2, menu: false,
    para: ['empresa'], livre: true,
    semAprovacao: ctx => ehMei(ctx) && ['mei', 'analise', 'pendencia'].includes((ctx.empresa || {}).status),
    mostrar: ctx => ehMei(ctx) && EDITA.concat(['contador']).includes((ctx.acesso || {}).cargo),
    telas: {
      das: { nome: 'DAS do ano', sub: 'A guia mensal do MEI, mês a mês: o que está pago, em aberto e vencido.', render: telaDas },
      checkup: { nome: 'Check-up do CNPJ', sub: 'Veja se o seu MEI está em dia e o que falta resolver.', render: telaCheckup }
    }
  });
  /* para o alerta do Início: os mesmos vencidos desta tela, desde a abertura do MEI */
  CW.meuDas = { vencidosDe: (f, inicio) => { const ant = D; D = { fiscal: f || { das: {} }, inicio: inicio || hoje().slice(0, 4) + '-01' }; const v = vencidos(); D = ant; return v; } };
})();
