/* Conectwork · Dinheiro do MEI (10/11/2026, etapa 1 do docs/PLANO-MEI.md).
   - O que entrou e o que saiu fora das notas do Conectwork: movimentos/{id} da empresa (vendas, serviços, materiais,
     contas…), pagos ou em aberto (a receber / a pagar). Nada se apaga (removido:true); tudo vai para o histórico.
   - As notas da rede já pagas (Pagar e receber) entram na conta do mês sozinhas, sem copiar: assim nunca contam duas vezes.
   - "+ Registrar" (botão sempre à mão no perfil MEI) e o assistente lançam aqui. interpretar() entende frases como
     "vendi R$ 200 hoje no pix" por regras (sem IA) e só grava depois que a pessoa confirma.
   - Contas por regras verificáveis: entrou (pago no mês), saiu (pago no mês), sobrou = entrou − saiu. */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const EDITA = ['admin', 'financeiro'];
  const CAT = { entrada: ['Venda', 'Serviço', 'Outra entrada'], saida: ['Material', 'Mercadoria para revenda', 'Transporte', 'Aluguel', 'Contas (luz, água, internet)', 'Impostos (DAS)', 'Equipamento', 'Outra despesa'] };
  const FORMA = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão', boleto: 'Boleto', transferencia: 'Transferência', outro: 'Outro' };
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const CDN = { xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', auto: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js' };
  const pode = ctx => !ctx.soLeitura && EDITA.includes(ctx.contexto.acesso && ctx.contexto.acesso.cargo);
  const quem = ctx => (ctx.sessao.perfil && ctx.sessao.perfil.nome) || ctx.sessao.usuario.email;
  const brl = c => U().formatarDinheiro(c || 0);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hoje = () => iso(new Date());
  const somaDias = (s, n) => { const d = new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); d.setDate(d.getDate() + n); return iso(d); };
  const dataBR = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
  const mesTxt = ym => { const t = MESES[+ym.slice(5, 7) - 1] + ' de ' + ym.slice(0, 4); return t[0].toUpperCase() + t.slice(1); };
  const mesMais = (ym, k) => { const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + k, 1); return iso(d).slice(0, 7); };
  const norm = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  let movs = null, mes = null, timerFab = null;

  /* ---------- contas (regras verificáveis) ---------- */
  const ativos = () => (movs || []).filter(m => !m.removido);
  const dataConta = m => m.situacao === 'pago' ? (m.pagoEm || m.data) : null;   /* entra na conta do mês em que foi pago */
  function doMes(ctx, ym) {
    const meus = ativos().filter(m => { const d = dataConta(m); return d && d.slice(0, 7) === ym; });
    const rede = (CW.titulos && CW.titulos.recebidos ? CW.titulos.recebidos(ctx) : []).filter(t => t.data.slice(0, 7) === ym);
    const entrou = meus.filter(m => m.tipo === 'entrada').reduce((s, m) => s + m.valorCentavos, 0) + rede.reduce((s, t) => s + t.centavos, 0);
    const saiu = meus.filter(m => m.tipo === 'saida').reduce((s, m) => s + m.valorCentavos, 0);
    return { entrou, saiu, sobrou: entrou - saiu, meus, rede };
  }
  function abertos(ctx) {
    const rec = ativos().filter(m => m.tipo === 'entrada' && m.situacao === 'aberto');
    const pag = ativos().filter(m => m.tipo === 'saida' && m.situacao === 'aberto');
    const redeRec = (CW.titulos && CW.titulos.proximos ? CW.titulos.proximos(ctx, 50) || [] : []).filter(t => t.lado === 'prestador');
    return { rec, pag, redeRec };
  }
  /* faturamento do MEI (limite): vendas e serviços recebidos, por mês 'AAAA-MM' (as notas da rede o Meu negócio já soma) */
  function faturamentoPorMes() {
    const out = {}; ativos().filter(m => m.tipo === 'entrada' && ['Venda', 'Serviço'].includes(m.categoria) && m.situacao === 'pago').forEach(m => { const k = dataConta(m).slice(0, 7); out[k] = (out[k] || 0) + m.valorCentavos; });
    return out;
  }

  /* ---------- entender uma frase (sem IA): "vendi R$ 200 hoje no pix", "comprei 80 de material", "fulano me deve 150" ---------- */
  function lerValor(t) {
    const m = /r\$\s*([\d.]+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/i.exec(t) || /(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s*(?:reais|real|conto|pila)?/i.exec(t);
    if (!m) return 0;
    const n = Number(m[1].replace(/\./g, '').replace(',', '.'));
    return isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
  }
  function interpretar(texto) {
    const t = norm(texto), w = t.split(/[^a-z0-9]+/).filter(Boolean), tem = (...xs) => xs.some(x => w.some(p => p.startsWith(x)));
    if (/^(quanto|qual|quais|quando|como|o que|por que|preciso|posso)\b/.test(t)) return null;   /* é pergunta, não lançamento */
    const valor = lerValor(texto); if (!valor) return null;
    let tipo = null, situacao = 'pago';
    if (/\b(me deve|esta me devendo|ta me devendo|tá me devendo|vai me pagar|fiado|ficou devendo)\b/.test(t)) { tipo = 'entrada'; situacao = 'aberto'; }
    else if (/\b(eu devo|tenho que pagar|vou pagar|preciso pagar|vence)\b/.test(t)) { tipo = 'saida'; situacao = 'aberto'; }
    else if (tem('vendi', 'recebi', 'ganhei', 'entrou', 'cobrei', 'faturei')) tipo = 'entrada';
    else if (tem('comprei', 'paguei', 'gastei', 'saiu')) tipo = 'saida';
    if (!tipo) return null;
    let categoria;
    if (tipo === 'entrada') categoria = tem('servic', 'conserto', 'instala', 'manutenc', 'reforma', 'pintura', 'atendi', 'consulta', 'aula', 'corte') ? 'Serviço' : tem('vendi', 'produt', 'mercador', 'pecas', 'peca') ? 'Venda' : 'Outra entrada';
    else categoria = tem('materia', 'insumo') ? 'Material' : tem('mercador', 'estoque', 'revenda', 'produt') ? 'Mercadoria para revenda' : tem('gasolina', 'combust', 'uber', 'onibus', 'passagem', 'frete', 'transporte', 'estaciona') ? 'Transporte'
      : tem('aluguel') ? 'Aluguel' : tem('luz', 'agua', 'internet', 'telefone', 'celular', 'energia') ? 'Contas (luz, água, internet)' : tem('das', 'imposto', 'taxa') ? 'Impostos (DAS)' : tem('ferrament', 'equipament', 'maquina', 'computador', 'notebook') ? 'Equipamento' : 'Outra despesa';
    const forma = tem('pix') ? 'pix' : tem('dinheiro', 'especie') ? 'dinheiro' : tem('cartao', 'credito', 'debito', 'maquininha') ? 'cartao' : tem('boleto') ? 'boleto' : tem('transferenc', 'ted', 'doc') ? 'transferencia' : '';
    let data = hoje(); if (tem('anteontem')) data = somaDias(hoje(), -2); else if (tem('ontem')) data = somaDias(hoje(), -1);
    const dm = /\bdia (\d{1,2})\b/.exec(t); if (dm && +dm[1] >= 1 && +dm[1] <= 31) { const h = hoje(), d = `${h.slice(0, 8)}${String(+dm[1]).padStart(2, '0')}`; data = situacao === 'aberto' || d <= h ? d : `${mesMais(h.slice(0, 7), -1)}-${String(+dm[1]).padStart(2, '0')}`; }
    const descricao = String(texto).trim().replace(/\s+/g, ' ').slice(0, 120);
    return { tipo, valorCentavos: valor, categoria, forma: forma || (situacao === 'aberto' ? '' : 'outro'), situacao, data: situacao === 'aberto' ? hoje() : data, vencimento: situacao === 'aberto' && data !== hoje() ? data : '', descricao, cliente: '' };
  }
  const resumoTxt = x => `${x.tipo === 'entrada' ? (x.situacao === 'aberto' ? 'A receber' : 'Entrou') : (x.situacao === 'aberto' ? 'A pagar' : 'Saiu')} ${brl(x.valorCentavos)} · ${x.categoria}${x.forma && x.forma !== 'outro' ? ' · ' + FORMA[x.forma] : ''} · ${x.situacao === 'aberto' ? (x.vencimento ? 'vence ' + dataBR(x.vencimento) : 'sem data') : (x.data === hoje() ? 'hoje' : dataBR(x.data))}`;

  /* ---------- gravar ---------- */
  function log(b, acao, texto, ref) { CW.log.logNoLote(b, acao, texto, ref); }
  async function gravar(ctx, x, origem) {
    const db = CW.fb.db(), b = db.batch(), ref = db.collection('movimentos').doc(), agora = CW.fb.agora;
    const doc = { empresaId: ctx.contexto.empresaId, tipo: x.tipo, valorCentavos: x.valorCentavos, data: x.data, descricao: x.descricao, categoria: x.categoria, forma: x.forma || 'outro',
      situacao: x.situacao, vencimento: x.vencimento || '', cliente: x.cliente || '', origem: origem || 'manual', removido: false, pagoEm: x.situacao === 'pago' ? x.data : '',
      criadoPor: ctx.sessao.usuario.uid, criadoPorNome: quem(ctx), criadoEm: agora(), atualizadoEm: agora() };
    b.set(ref, doc); log(b, 'dinheiro.criar', `${resumoTxt(x)} · ${x.descricao}`, ref.id);
    await b.commit(); return ref.id;
  }
  async function mudar(ctx, m, mud, acao, texto) {
    const db = CW.fb.db(), b = db.batch();
    b.update(db.doc('movimentos/' + m._id), Object.assign({}, mud, { atualizadoEm: CW.fb.agora() })); log(b, acao, texto, m._id);
    try { await b.commit(); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); throw e; }
  }

  /* formulário curto: Entrou/Saiu → valor → o quê → categoria → como pagou → pago ou em aberto */
  async function registrar(ctx, pre, m) {
    ctx = ctx || ctxAgora(); if (!pode(ctx)) { U().toast('Seu acesso não registra movimentos. Fale com o administrador da empresa.', 'erro'); return null; }
    const { esc } = U(), v = Object.assign({ tipo: 'entrada', valorCentavos: 0, descricao: '', categoria: '', forma: 'pix', situacao: 'pago', data: hoje(), vencimento: '', cliente: '' }, m || pre || {});
    let res = null;
    const catOpts = tipo => CAT[tipo].map(c => `<option ${c === v.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('');
    const r = await U().dialogo({ titulo: m ? 'Mudar movimento' : 'Registrar', sub: 'Leva poucos segundos. O dia e "já foi pago" já vêm marcados.',
      corpo: `<div class="fgrid">
        <div class="c12 dn-tipo" role="group" aria-label="Entrou ou saiu"><button type="button" data-tp="entrada" aria-pressed="${v.tipo === 'entrada'}">Entrou dinheiro</button><button type="button" data-tp="saida" aria-pressed="${v.tipo === 'saida'}">Saiu dinheiro</button></div>
        <label class="f c6"><span>Valor (R$)</span><input id="dn-valor" data-mascara="dinheiro" inputmode="numeric" value="${v.valorCentavos ? esc(U().formatarDinheiro(v.valorCentavos, false)) : ''}" placeholder="0,00"></label>
        <label class="f c6"><span>Do quê</span><select id="dn-cat">${catOpts(v.tipo)}</select></label>
        <label class="f c12"><span>Descrição</span><input id="dn-desc" maxlength="120" value="${esc(v.descricao)}" placeholder="${v.tipo === 'entrada' ? 'Ex.: Venda de bolos' : 'Ex.: Material da obra'}"></label>
        <label class="f c6"><span>Como foi pago</span><select id="dn-forma">${Object.entries(FORMA).map(([k, t]) => `<option value="${k}" ${k === (v.forma || 'outro') ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        <label class="f c6"><span>Situação</span><select id="dn-sit"><option value="pago" ${v.situacao === 'pago' ? 'selected' : ''}>Já foi pago</option><option value="aberto" ${v.situacao === 'aberto' ? 'selected' : ''}>${v.tipo === 'entrada' ? 'Ainda vou receber' : 'Ainda vou pagar'}</option></select></label>
        <label class="f c6"><span id="dn-data-r">${v.situacao === 'aberto' ? 'Vence em' : 'Dia'}</span><input id="dn-data" type="date" value="${esc(v.situacao === 'aberto' ? (v.vencimento || '') : v.data)}"></label>
        <label class="f c6"><span>Cliente ou fornecedor <i>(opcional)</i></span><input id="dn-cli" maxlength="80" value="${esc(v.cliente || '')}"></label>
        <p class="err c12" id="dn-erro" role="alert"></p></div>`,
      botoes: [].concat(m ? [{ texto: 'Tirar', valor: 'tirar', classe: 'ghost' }] : [], [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Salvar', icone: 'check', valor: 'ok', antes: d => {
        const g = id => d.querySelector('#' + id).value.trim(), er = d.querySelector('#dn-erro');
        const tipo = d.querySelector('[data-tp][aria-pressed="true"]').dataset.tp, valor = +U().dig(g('dn-valor')), sit = g('dn-sit'), dia = g('dn-data');
        if (!valor) { er.textContent = 'Escreva o valor.'; d.querySelector('#dn-valor').focus(); return false; }
        if (sit === 'pago' && !/^\d{4}-\d{2}-\d{2}$/.test(dia)) { er.textContent = 'Escolha o dia.'; return false; }
        if (sit === 'pago' && dia > hoje()) { er.textContent = 'Um pagamento já feito não pode ter dia no futuro. Se ainda vai acontecer, escolha "Ainda vou…".'; return false; }
        const desc = g('dn-desc') || g('dn-cat');
        res = { tipo, valorCentavos: valor, categoria: g('dn-cat'), descricao: desc.slice(0, 120), forma: g('dn-forma'), situacao: sit, data: sit === 'pago' ? dia : (m ? m.data : hoje()), vencimento: sit === 'aberto' ? (dia || '') : '', cliente: g('dn-cli') };
        return true; } }]),
      aoAbrir: d => {
        U().aplicarMascaras(d);
        const ajusta = () => { const tp = d.querySelector('[data-tp][aria-pressed="true"]').dataset.tp, sit = d.querySelector('#dn-sit');
          d.querySelector('#dn-cat').innerHTML = CAT[tp].map(c => `<option>${esc(c)}</option>`).join('');
          sit.options[1].text = tp === 'entrada' ? 'Ainda vou receber' : 'Ainda vou pagar'; d.querySelector('#dn-desc').placeholder = tp === 'entrada' ? 'Ex.: Venda de bolos' : 'Ex.: Material da obra'; };
        d.querySelectorAll('[data-tp]').forEach(b => b.onclick = () => { d.querySelectorAll('[data-tp]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); ajusta(); });
        d.querySelector('#dn-sit').onchange = e => { const ab = e.target.value === 'aberto', dt = d.querySelector('#dn-data'); d.querySelector('#dn-data-r').textContent = ab ? 'Vence em' : 'Dia'; dt.value = ab ? '' : hoje(); };
        d.querySelector('#dn-valor').focus(); } });
    if (r === 'tirar' && m) {
      if (!(await U().confirmar('Tirar este movimento?', `${resumoTxt(m)} sai das contas. Fica guardado no histórico.`, 'Tirar'))) return null;
      try { await mudar(ctx, m, { removido: true }, 'dinheiro.tirar', `Tirado: ${resumoTxt(m)} · ${m.descricao}`); U().toast('Tirado.'); } catch (e) { /* aviso já mostrado */ }
      return null;
    }
    if (r !== 'ok' || !res) return null;
    try {
      if (m) { await mudar(ctx, m, Object.assign({}, res, { pagoEm: res.situacao === 'pago' ? res.data : '' }), 'dinheiro.mudar', `Mudado para: ${resumoTxt(res)} · ${res.descricao}`); U().toast('Movimento atualizado.'); return m._id; }
      const id = await gravar(ctx, res, pre && pre.origem); U().toast(res.tipo === 'entrada' ? 'Entrada registrada.' : 'Saída registrada.'); return id;
    } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); return null; }
  }
  async function quitar(ctx, m) {
    const rec = m.tipo === 'entrada';
    if (!(await U().confirmar(rec ? 'Recebeu?' : 'Pagou?', `${brl(m.valorCentavos)} · ${m.descricao}. Fica marcado como ${rec ? 'recebido' : 'pago'} hoje (${dataBR(hoje())}).`, rec ? 'Recebi' : 'Paguei'))) return;
    try { await mudar(ctx, m, { situacao: 'pago', pagoEm: hoje() }, 'dinheiro.quitar', `${rec ? 'Recebido' : 'Pago'} em ${dataBR(hoje())}: ${brl(m.valorCentavos)} · ${m.descricao}`); U().toast(rec ? 'Marcado como recebido.' : 'Marcado como pago.'); } catch (e) { /* aviso já mostrado */ }
  }

  /* ---------- tela ---------- */
  function linhaHtml(m, ed) {
    const { esc, ic } = U(), ent = m.tipo === 'entrada';
    return `<div class="dn-it" data-mov="${esc(m._id)}"><span class="dn-sinal ${ent ? 'ent' : 'sai'}">${ic(ent ? 'plus' : 'receipt')}</span>
      <div class="dn-t"><strong>${esc(m.descricao)}</strong><small>${esc(m.categoria)}${m.forma && m.forma !== 'outro' ? ' · ' + esc(FORMA[m.forma]) : ''}${m.cliente ? ' · ' + esc(m.cliente) : ''} · ${esc(dataBR(dataConta(m) || m.vencimento || m.data))}${m.origem === 'assistente' ? ' · pelo assistente' : ''}</small></div>
      <b class="dn-v ${ent ? 'ent' : 'sai'}">${ent ? '+' : '−'} ${esc(brl(m.valorCentavos))}</b>${ed ? `<button class="iconbtn" data-editar="${esc(m._id)}" aria-label="Mudar: ${esc(m.descricao)}" title="Mudar">${ic('edit')}</button>` : ''}</div>`;
  }
  function grafico(ctx) {
    const { esc } = U(), ms = Array.from({ length: 6 }, (_, i) => mesMais(mes, i - 5)), dados = ms.map(m => Object.assign({ m }, doMes(ctx, m)));
    const max = Math.max(1, ...dados.map(d => Math.max(d.entrou, d.saiu)));
    return `<div class="dn-graf" role="img" aria-label="Entradas e saídas dos últimos 6 meses">${dados.map(d => `<div class="dn-col ${d.m === mes ? 'atual' : ''}"><div class="dn-barras"><i class="ent" style="height:${Math.round(d.entrou / max * 100)}%" title="Entrou ${esc(brl(d.entrou))}"></i><i class="sai" style="height:${Math.round(d.saiu / max * 100)}%" title="Saiu ${esc(brl(d.saiu))}"></i></div><span>${esc(MESES[+d.m.slice(5, 7) - 1].slice(0, 3))}</span></div>`).join('')}</div>
      <div class="dn-leg"><span><i class="ent"></i>Entrou</span><span><i class="sai"></i>Saiu</span></div>`;
  }
  function desenhar(el, ctx) {
    const { esc, ic } = U(), ed = pode(ctx); mes = mes || hoje().slice(0, 7);
    document.getElementById('acoes').innerHTML = ed ? `<button class="btn sec" id="dn-saiu">${ic('receipt')}Saiu</button><button class="btn" id="dn-entrou">${ic('plus')}Entrou</button>` : '';
    if (!movs) { el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Carregando o seu dinheiro…</span></div></div>`; return; }
    const R = doMes(ctx, mes), A = abertos(ctx);
    const lista = R.meus.map(m => ({ d: dataConta(m), h: linhaHtml(m, ed) })).concat(R.rede.map(t => ({ d: t.data, h: `<div class="dn-it"><span class="dn-sinal ent">${ic('wallet')}</span><div class="dn-t"><strong>Nota${t.nota ? ' ' + esc(t.nota) : ''} paga por ${esc(t.nome)}</strong><small>Pelo Conectwork · ${esc(dataBR(t.data))}</small></div><b class="dn-v ent">+ ${esc(brl(t.centavos))}</b></div>` })))
      .sort((a, b) => b.d.localeCompare(a.d));
    const recTot = A.rec.reduce((s, m) => s + m.valorCentavos, 0) + A.redeRec.reduce((s, t) => s + (t.centavos || 0), 0), pagTot = A.pag.reduce((s, m) => s + m.valorCentavos, 0);
    el.innerHTML = `<div class="dn-mes"><button class="iconbtn" id="dn-ant" aria-label="Mês anterior">‹</button><h3 id="dn-mes-t">${esc(mesTxt(mes))}</h3><button class="iconbtn" id="dn-prox" aria-label="Próximo mês" ${mes >= hoje().slice(0, 7) ? 'disabled' : ''}>›</button></div>
      <div class="dn-nums" id="dn-nums">
        <div class="dn-num ent"><small>Entrou</small><b id="dn-entrou-v">${esc(brl(R.entrou))}</b></div>
        <div class="dn-num sai"><small>Saiu</small><b id="dn-saiu-v">${esc(brl(R.saiu))}</b></div>
        <div class="dn-num ${R.sobrou < 0 ? 'neg' : 'sob'}"><small>${R.sobrou < 0 ? 'Faltou' : 'Sobrou'}</small><b id="dn-sobrou-v">${esc(brl(Math.abs(R.sobrou)))}</b></div>
      </div>
      <div class="dn-grid"><div class="stack" style="gap:22px">
        <section class="card" id="dn-lista"><div class="card-h"><span class="ic">${ic('list')}</span><h3>Movimentos do mês</h3><span class="count">${lista.length}</span></div><div class="card-b dn-lista">
          ${lista.length ? lista.map(x => x.h).join('') : `<div class="empty" id="dn-vazio"><div class="ic">${ic('wallet')}</div><strong>Nada registrado em ${esc(mesTxt(mes).toLowerCase())}.</strong><span>Toque em "Entrou" ou "Saiu", ou escreva para o assistente: "vendi R$ 200 hoje no Pix".</span></div>`}</div></section>
        <section class="card" id="dn-graf"><div class="card-h"><span class="ic">${ic('chart')}</span><h3>Últimos 6 meses</h3></div><div class="card-b">${grafico(ctx)}</div></section>
      </div><div class="stack" style="gap:22px">
        <section class="card" id="dn-receber"><div class="card-h"><span class="ic">${ic('wallet')}</span><h3>A receber</h3><b class="dn-tot ent">${esc(brl(recTot))}</b></div><div class="card-b dn-lista">
          ${A.rec.map(m => `<div class="dn-it"><div class="dn-t"><strong>${esc(m.descricao)}</strong><small>${m.cliente ? esc(m.cliente) + ' · ' : ''}${m.vencimento ? 'vence ' + esc(dataBR(m.vencimento)) : 'sem data'}${m.vencimento && m.vencimento < hoje() ? ' · <b class="dn-atr">atrasado</b>' : ''}</small></div><b class="dn-v">${esc(brl(m.valorCentavos))}</b>${ed ? `<button class="btn sm sec" data-quitar="${esc(m._id)}">Recebi</button>` : ''}</div>`).join('')}
          ${A.redeRec.map(t => `<div class="dn-it"><div class="dn-t"><strong>${esc(t.nome)}</strong><small>Nota pelo Conectwork · vence ${esc(t.venc)}${t.vencido ? ' · <b class="dn-atr">atrasado</b>' : ''}</small></div><b class="dn-v">${esc(t.valor)}</b><button class="btn sm sec" data-ir="titulos/ver/${esc(t.id)}">Abrir</button></div>`).join('')}
          ${!A.rec.length && !A.redeRec.length ? '<p class="hint" style="margin:0">Nada a receber.</p>' : ''}</div></section>
        <section class="card" id="dn-pagar"><div class="card-h"><span class="ic">${ic('receipt')}</span><h3>A pagar</h3><b class="dn-tot sai">${esc(brl(pagTot))}</b></div><div class="card-b dn-lista">
          ${A.pag.map(m => `<div class="dn-it"><div class="dn-t"><strong>${esc(m.descricao)}</strong><small>${m.cliente ? esc(m.cliente) + ' · ' : ''}${m.vencimento ? 'vence ' + esc(dataBR(m.vencimento)) : 'sem data'}${m.vencimento && m.vencimento < hoje() ? ' · <b class="dn-atr">atrasado</b>' : ''}</small></div><b class="dn-v">${esc(brl(m.valorCentavos))}</b>${ed ? `<button class="btn sm sec" data-quitar="${esc(m._id)}">Paguei</button>` : ''}</div>`).join('') || '<p class="hint" style="margin:0">Nada a pagar.</p>'}</div></section>
        <section class="card" id="dn-rel"><div class="card-h"><span class="ic">${ic('file')}</span><h3>Relatório do mês</h3></div><div class="card-b"><p class="hint" style="margin:0 0 12px">Para guardar ou mandar para o contador.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn sec" id="dn-pdf">${ic('file')}PDF</button><button class="btn sec" id="dn-xls">${ic('grid')}Excel</button></div></div></section>
      </div></div>
      <p class="hint" style="margin:14px 0 0;font-size:12px">"Sobrou" é o que entrou menos o que saiu no mês, pelos pagamentos feitos. Não é o saldo do banco. As notas pagas pelo Conectwork entram sozinhas.</p>`;
    ligar(el, ctx);
  }
  function ligar(el, ctx) {
    const re = () => desenhar(el, ctx);
    const a = document.getElementById('dn-entrou'); if (a) a.onclick = () => registrar(ctx, { tipo: 'entrada' });
    const s = document.getElementById('dn-saiu'); if (s) s.onclick = () => registrar(ctx, { tipo: 'saida', forma: 'pix' });
    document.getElementById('dn-ant').onclick = () => { mes = mesMais(mes, -1); re(); };
    document.getElementById('dn-prox').onclick = () => { if (mes < hoje().slice(0, 7)) { mes = mesMais(mes, 1); re(); } };
    el.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => registrar(ctx, null, ativos().find(m => m._id === b.dataset.editar)));
    el.querySelectorAll('[data-quitar]').forEach(b => b.onclick = () => quitar(ctx, ativos().find(m => m._id === b.dataset.quitar)));
    el.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => CW.ir(b.dataset.ir));
    document.getElementById('dn-pdf').onclick = () => exportar(ctx, 'pdf');
    document.getElementById('dn-xls').onclick = () => exportar(ctx, 'xlsx');
  }

  /* ---------- relatório do mês (PDF e Excel) ---------- */
  function carregaScript(src, ok) {
    if (ok()) return Promise.resolve();
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = () => ok() ? res() : rej(new Error('Biblioteca não carregou.')); s.onerror = () => rej(new Error('Não foi possível baixar a ferramenta do relatório. Confira a internet e tente de novo.')); document.head.appendChild(s); });
  }
  async function exportar(ctx, tipo) {
    const R = doMes(ctx, mes), emp = ctx.contexto.nome, nome = `Dinheiro-${mes}`;
    const linhas = R.meus.map(m => [dataBR(dataConta(m)), m.tipo === 'entrada' ? 'Entrou' : 'Saiu', m.categoria, m.descricao, FORMA[m.forma] || '', (m.tipo === 'entrada' ? 1 : -1) * m.valorCentavos / 100])
      .concat(R.rede.map(t => [dataBR(t.data), 'Entrou', 'Nota pelo Conectwork', `Nota ${t.nota} · ${t.nome}`, '', t.centavos / 100])).sort((a, b) => a[0].split('/').reverse().join('').localeCompare(b[0].split('/').reverse().join('')));
    try {
      if (tipo === 'xlsx') {
        await carregaScript(CDN.xlsx, () => !!window.XLSX); const X = window.XLSX;
        const ws = X.utils.aoa_to_sheet([[`${emp} · ${mesTxt(mes)}`], [], ['Entrou', R.entrou / 100], ['Saiu', R.saiu / 100], [R.sobrou < 0 ? 'Faltou' : 'Sobrou', Math.abs(R.sobrou) / 100], [], ['Dia', 'Tipo', 'Do quê', 'Descrição', 'Como foi pago', 'Valor (R$)']].concat(linhas));
        const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Dinheiro'); X.writeFile(wb, nome + '.xlsx');
      } else {
        await carregaScript(CDN.jspdf, () => !!(window.jspdf && window.jspdf.jsPDF)); await carregaScript(CDN.auto, () => !!(window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable));
        const doc = new window.jspdf.jsPDF(); doc.setFontSize(15); doc.text(`Dinheiro de ${mesTxt(mes).toLowerCase()}`, 14, 18); doc.setFontSize(10); doc.text(emp, 14, 25);
        doc.text(`Entrou ${brl(R.entrou)}   ·   Saiu ${brl(R.saiu)}   ·   ${R.sobrou < 0 ? 'Faltou' : 'Sobrou'} ${brl(Math.abs(R.sobrou))}`, 14, 33);
        doc.autoTable({ startY: 40, head: [['Dia', 'Tipo', 'Do quê', 'Descrição', 'Pago com', 'Valor']], body: linhas.map(l => l.slice(0, 5).concat([brl(Math.round(l[5] * 100))])), styles: { fontSize: 9 } });
        doc.setFontSize(8); doc.text('Feito no Conectwork. "Sobrou" é o que entrou menos o que saiu no mês; não é o saldo do banco.', 14, 287); doc.save(nome + '.pdf');
      }
      const b = CW.fb.db().batch(); log(b, 'dinheiro.relatorio', `Relatório do dinheiro de ${mesTxt(mes).toLowerCase()} baixado em ${tipo === 'pdf' ? 'PDF' : 'Excel'}.`, ''); b.commit().catch(() => {});
    } catch (e) { U().toast(e.message || 'Não foi possível montar o relatório.', 'erro'); }
  }

  /* ---------- botão "+ Registrar" sempre à mão (perfil MEI) ---------- */
  const ctxAgora = () => { const c = CW.sessao.contexto(); return { contexto: c, sessao: CW.sessao.estado(), soLeitura: CW.permissoes.soLeitura(c) }; };
  function fab(ligar) {
    let b = document.getElementById('mei-registrar');
    if (!ligar) { if (b) b.remove(); return; }
    if (b) return;
    b = document.createElement('button'); b.id = 'mei-registrar'; b.className = 'mei-fab'; b.type = 'button'; b.setAttribute('aria-label', 'Registrar entrada ou saída de dinheiro');
    b.innerHTML = U().ic('plus') + '<span>Registrar</span>'; b.onclick = () => registrar(ctxAgora(), {});
    document.body.appendChild(b);
  }

  const ehMei = ctx => { let p = ''; try { p = sessionStorage.getItem('cw.porte.' + ctx.empresaId) || ''; } catch (e) {} return String(p).startsWith('MEI'); };
  /* telas da gestão do MEI liberadas também no cadastro rápido (status 'mei') e enquanto o cadastro completo é analisado */
  const meiSemAprov = ctx => ehMei(ctx) && ['mei', 'analise', 'pendencia'].includes(((ctx.empresa) || {}).status);
  CW.registrarModulo({
    id: 'dinheiro', nome: 'Dinheiro', icone: 'bank', ordem: 26.5,
    para: ['empresa'], livre: true, semAprovacao: ctx => meiSemAprov(ctx),
    mostrar: ctx => ehMei(ctx),
    iniciar(ctx) {
      movs = null; mes = null;
      const db = CW.fb.db(), emp = ctx.contexto.empresaId;
      const redesenha = () => { const el = document.getElementById('view'), at = CW.app.atual(); if (el && at && at.modulo === 'dinheiro') desenhar(el, Object.assign({}, ctx, { sessao: CW.sessao.estado() }));
        window.dispatchEvent(new CustomEvent('cw:dinheiro')); CW.app.pendenciasMudaram(); };
      CW.inscrever('movimentos', () => db.collection('movimentos').where('empresaId', '==', emp), s => { movs = CW.fb.lista(s); redesenha(); }, () => { movs = []; redesenha(); });
      clearInterval(timerFab); timerFab = setInterval(() => fab(document.documentElement.classList.contains('mei') && pode(ctx) && !document.querySelector('dialog[open]')), 800);
      fab(document.documentElement.classList.contains('mei') && pode(ctx));
      return () => { clearInterval(timerFab); fab(false); movs = null; };
    },
    pendencias(ctx) {
      if (!movs) return [];
      const h = hoje();
      return ativos().filter(m => m.situacao === 'aberto' && m.vencimento && m.vencimento <= h).map(m => ({ txt: m.tipo === 'entrada' ? `Cobrar: ${m.descricao}` : `Pagar: ${m.descricao}`,
        sub: `${brl(m.valorCentavos)} · ${m.vencimento < h ? 'venceu ' + dataBR(m.vencimento) : 'vence hoje'}${m.cliente ? ' · ' + m.cliente : ''}`, rota: 'dinheiro' }));
    },
    buscar() { return ativos().map(m => ({ t: m.descricao, s: `${m.tipo === 'entrada' ? 'Entrou' : 'Saiu'} ${brl(m.valorCentavos)} · ${dataBR(dataConta(m) || m.data)}`, rota: 'dinheiro', txt: [m.categoria, m.cliente, brl(m.valorCentavos)].join(' ') })); },
    telas: { mes: { nome: 'Dinheiro', sub: 'O que entrou e o que saiu no mês, o que falta receber e pagar. Registre em segundos.', render: desenhar } }
  });
  CW.dinheiro = { interpretar, registrar, gravar, resumoTxt, doMes, abertos, faturamentoPorMes, pronto: () => !!movs, hoje, FORMA, CAT };
})();
