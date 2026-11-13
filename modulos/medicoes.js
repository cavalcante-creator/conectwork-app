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
    const linha = m => `<tr class="click" data-abrir="${esc(m._id)}" tabindex="0"><td class="m-full"><div class="cell">${avatar(outraParte(m, ctx), '', lado(m, ctx) === 'tomador' ? m.prestadorId : m.tomadorId)}<div style="min-width:0"><strong>${esc(periodoTxt(m.periodo))}</strong><small>${esc(outraParte(m, ctx))} · ${lado(m, ctx) === 'tomador' ? 'você contrata' : 'você presta o serviço'}${m.origem === 'integracao' ? ' · veio do painel do RH' : ''}${m.parte ? ' · nota separada: ' + esc((m.memoria || []).map(x => x.nome).join(', ')) : ''}</small></div></div></td>
      <td class="r"><b>${esc(brl(m.valorCentavos))}</b></td><td>${pill(m.status)}</td></tr>`;
    const tabela = (xs, id) => `<div class="scroll"><table class="resp" id="${id}"><thead><tr><th>Período</th><th class="r">Valor</th><th>Situação</th></tr></thead><tbody>${xs.map(linha).join('')}</tbody></table></div>`;
    el.innerHTML = `${minhas.length ? `<section class="card" id="md-minhas" style="margin-bottom:22px"><div class="card-h"><span class="ic">${ic('alert')}</span><h3>Precisa de você</h3><span class="count">${minhas.length}</span></div>${tabela(minhas, 'md-tab-minhas')}</section>` : ''}
      <section class="card" id="md-lista"><div class="card-h"><span class="ic">${ic('list')}</span><h3>Medições</h3><span class="count">${lista.length}</span></div>
      ${lista.length ? tabela(lista, 'md-tab') : `<div class="empty"><div class="ic">${ic('list')}</div><strong>Nenhuma medição ainda.</strong><span>${pode(ctx, LANCA) ? 'Lance a medição do período: digite cada profissional ou preencha com uma planilha (Excel ou CSV).' : 'Quando houver medição de um contrato da sua empresa, ela aparece aqui.'}</span>${U().passos(['Contrato de equipe contínua ativo', 'Lance a medição do período (digitada ou por planilha)', 'O aprovador confere e aprova a medição'])}</div>`}</section>`;
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
    let itens = (pre ? pre.itens : m ? m.memoria : []).map(x => Object.assign({ nome: x.nome, horas: x.horas, valorCentavos: x.valorCentavos }, x.cnpj ? { cnpj: x.cnpj } : {}));
    if (!itens.length) itens = [{ nome: '', horas: '', valorCentavos: 0 }];
    const ctSel = m ? m.contratoId : pre ? pre.contratoId : (cts.length === 1 ? cts[0]._id : '');
    const per = id => (m ? m.periodicidade : ((cts || []).find(c => c._id === id) || {}).periodicidade) || 'quinzena';
    let dados = null;
    const linhaItem = (x, i) => `<div class="md-it" data-i="${i}" data-cnpj="${esc(x.cnpj || '')}"><input class="md-it-nome" placeholder="Nome do profissional" maxlength="120" value="${esc(x.nome || '')}" aria-label="Nome do profissional ${i + 1}">
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
          <div class="md-plan"><button type="button" class="linkbtn" id="md-mais">${ic('plus')}Mais um profissional</button>
            ${pre ? '' : `<button type="button" class="linkbtn" id="md-planilha">${ic('upload')}Preencher com uma planilha</button><button type="button" class="linkbtn" id="md-modelo">${ic('file')}Baixar o modelo</button>`}</div>
          <input type="file" id="md-arq" accept=".xlsx,.xls,.csv,text/csv" hidden>
          <p class="hint" id="md-plan-msg" style="margin:6px 0 0;font-size:12.5px"></p></div>
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
        /* planilha (12/11/2026): qualquer cliente lança a medição a partir de uma planilha, sem depender de um painel de RH */
        const arq = d.querySelector('#md-arq'), msg = d.querySelector('#md-plan-msg'), bp = d.querySelector('#md-planilha'), bm = d.querySelector('#md-modelo');
        if (bm) bm.onclick = () => baixarModelo();
        if (bp) bp.onclick = () => arq.click();
        if (arq) arq.onchange = async () => {
          const f = arq.files[0]; arq.value = ''; if (!f) return;
          msg.textContent = 'Lendo a planilha…';
          try {
            const r = await lerPlanilha(f);
            its.innerHTML = r.itens.map(linhaItem).join(''); ligar(); soma(); d.querySelector('#md-erro').textContent = '';
            msg.textContent = `${r.itens.length} ${r.itens.length === 1 ? 'profissional' : 'profissionais'} da planilha "${f.name}".` + (r.pulou ? (r.pulou === 1 ? ' 1 linha sem nome ou sem valor ficou de fora.' : ` ${r.pulou} linhas sem nome ou sem valor ficaram de fora.`) : '') + ' Confira antes de enviar.';
          } catch (e) { msg.textContent = ''; d.querySelector('#md-erro').textContent = e.message || 'Não foi possível ler a planilha.'; }
        };
        ligar(); soma();
      }
    });
    if (!dados) return;
    return gravar(ctx, m, dados, pre, cts);
  }
  /* ---------- planilha da medição (12/11/2026): Excel ou CSV com Nome, Horas (opcional), Valor e CNPJ do MEI (opcional) ---------- */
  const XLSX_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  const semAcento = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  function carregaScript(src, ok) {
    if (ok()) return Promise.resolve();
    return new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = src; sc.onload = () => ok() ? res() : rej(new Error('A ferramenta de planilha não carregou.')); sc.onerror = () => rej(new Error('Não foi possível baixar a ferramenta de planilha. Confira a internet ou salve como CSV.')); document.head.appendChild(sc); });
  }
  /* número de planilha: 1.234,56 · 1234,56 · 1234.56 · 1,234.56 · número do Excel */
  function numero(v) {
    if (typeof v === 'number') return v;
    let t = String(v == null ? '' : v).replace(/[R$\s]/g, '');
    if (!t) return null;
    const uv = t.lastIndexOf(','), up = t.lastIndexOf('.');
    if (uv > up) t = t.replace(/\./g, '').replace(',', '.');
    else if (uv < 0 && /^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');   /* 1.200 = mil e duzentos */
    else t = t.replace(/,/g, '');
    const n = Number(t); return isFinite(n) ? n : NaN;
  }
  function csvLinhas(txt) {
    const lin = txt.replace(/^\ufeff/, '').split(/\r?\n/).filter(l => l.trim());
    const sep = (lin[0].match(/;/g) || []).length >= (lin[0].match(/,/g) || []).length ? ';' : ',';
    return lin.map(l => { const out = []; let cur = '', q = false;
      for (let i = 0; i < l.length; i++) { const ch = l[i];
        if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
        else if (ch === '"') q = true; else if (ch === sep) { out.push(cur); cur = ''; } else cur += ch; }
      out.push(cur); return out; });
  }
  async function lerPlanilha(f) {
    if (f.size > 5 * 1024 * 1024) throw new Error('A planilha passa de 5 MB. Deixe só as colunas Nome, Horas, Valor e CNPJ do MEI.');
    let linhas;
    if (/\.csv$/i.test(f.name) || f.type === 'text/csv') linhas = csvLinhas(await f.text());
    else {
      await carregaScript(XLSX_CDN, () => !!window.XLSX);
      const wb = window.XLSX.read(await f.arrayBuffer(), { type: 'array' });
      linhas = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
    }
    const hi = linhas.findIndex(l => l.some(c => /^(nome|profissional)/.test(semAcento(c))));
    if (hi < 0) throw new Error('Não achei a coluna "Nome" na planilha. Use o modelo: Nome, Horas, Valor e CNPJ do MEI.');
    const cab = linhas[hi].map(semAcento), col = re => cab.findIndex(c => re.test(c));
    const cN = col(/^(nome|profissional)/), cH = col(/^horas?/), cV = col(/^(valor|total)/), cC = col(/cnpj/);
    if (cV < 0) throw new Error('Não achei a coluna "Valor" na planilha. Use o modelo: Nome, Horas, Valor e CNPJ do MEI.');
    const itens = []; let pulou = 0;
    linhas.slice(hi + 1).forEach((l, i) => {
      const nome = String(l[cN] == null ? '' : l[cN]).trim().replace(/\s+/g, ' '), v = numero(l[cV]);
      if (!nome && (v == null || isNaN(v))) return;   /* linha vazia */
      if (/^total/.test(semAcento(nome))) return;      /* linha de total da planilha */
      if (!nome || !(v > 0)) { pulou++; return; }
      const h = cH >= 0 ? numero(l[cH]) : null, cn = cC >= 0 ? U().dig(String(l[cC] || '')) : '';
      itens.push(Object.assign({ nome: nome.slice(0, 120), horas: h == null || isNaN(h) ? '' : Math.round(h * 100) / 100, valorCentavos: Math.round(v * 100) }, /^\d{14}$/.test(cn) && U().validarCNPJ(cn) ? { cnpj: cn } : {}));
    });
    if (!itens.length) throw new Error('A planilha não tem nenhuma linha com nome e valor. Confira as colunas Nome e Valor.');
    if (itens.length > 300) throw new Error('A planilha tem mais de 300 profissionais. Divida em duas medições.');
    return { itens, pulou };
  }
  function baixarModelo() {
    const txt = '\ufeffNome;Horas;Valor;CNPJ do MEI\r\n';
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' })); a.download = 'modelo-medicao-conectwork.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }
  function ler(d) {
    return Array.from(d.querySelectorAll('.md-it')).map(r => {
      const nome = r.querySelector('.md-it-nome').value.trim().replace(/\s+/g, ' '), h = r.querySelector('.md-it-horas').value.trim().replace(',', '.'), v = U().lerDinheiro(r.querySelector('.md-it-valor').value);
      return Object.assign({ nome, horas: h === '' ? null : Number(h), valorCentavos: v || 0 }, /^\d{14}$/.test(r.dataset.cnpj || '') ? { cnpj: r.dataset.cnpj } : {});   /* CNPJ do MEI (vem do painel) segue junto */
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
      const c = pre ? pre.contrato : cts.find(x => x._id === dados.contratoId), parte = pre && pre.parte ? pre.parte : '', id = c._id + '_' + dados.periodo + (parte ? '_' + parte : ''), ref = db.doc('medicoes/' + id);
      const ja = await ref.get();
      if (ja.exists) { U().toast(`Já existe medição de ${periodoTxt(dados.periodo)} para ${c.prestadorNome}. Abrimos ela para você.`, 'erro'); CW.ir('medicoes/ver/' + id); return; }
      b.set(ref, { contratoId: c._id, tomadorId: c.tomadorId, prestadorId: c.prestadorId, partes: [c.tomadorId, c.prestadorId], tomadorNome: c.tomadorNome, prestadorNome: c.prestadorNome,
        periodicidade: c.periodicidade, periodo: dados.periodo, valorCentavos: dados.valorCentavos, memoria: dados.memoria, obs: dados.obs,
        origem: pre ? 'integracao' : 'manual', ref: pre ? pre.ref : '', status: 'enviada', divergencia: null, confirmacao: null, aprovacao: null,
        ...(parte ? { parte } : {}),
        criadoPor: ctx.sessao.usuario.uid, criadoPorNome: quem(ctx), criadoEm: agora(), atualizadoEm: agora() });
      log(b, ctx, 'medicao.enviar', `Medição de ${periodoTxt(dados.periodo)} de ${c.prestadorNome}${parte ? ' (nota separada: ' + dados.memoria.map(x => x.nome).join(', ') + ')' : ''} enviada para conferência: ${brl(dados.valorCentavos)}${pre ? ' (veio do painel do RH)' : ''}.`, id);
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
    const separa = t => `<div class="banner info" id="md-separa">${ic('shield')}<span><strong>Outra pessoa ${t}</strong>Você está nas duas empresas desta medição. Funções separadas: quem lança pela empresa que contrata não confere pela prestadora, e quem confere não aprova.</span></div>`;
    /* exceção do piloto (12/11/2026, "faça uma exceção"): a equipe Conectwork faz os passos mesmo tendo feito o anterior; fica marcado */
    const exc = !!(CW.sessao.estado() || {}).master, excAv = `<p class="hint" id="md-excecao" style="margin:0;font-size:12.5px;width:100%">Exceção do piloto: você fez o passo anterior, mas como equipe Conectwork pode seguir. Fica registrado na medição.</p>`;
    /* 13/11/2026 ("nesse caso precisa aprovar"): medição do painel do RH é a aprovação de quem contrata; quem enviou e também está
       na prestadora pode confirmar, marcado como exceção (regra medicaoConfirmarPainel). */
    const excPainel = m.origem === 'integracao' && m.criadoPor === eu && !exc;
    if (l === 'prestador' && st === 'enviada' && pode(ctx, CONFIRMA) && m.criadoPor === eu && !exc && !excPainel) acoes = separa('confere pela prestadora');
    else if (l === 'prestador' && st === 'enviada' && pode(ctx, CONFIRMA)) acoes = `<button class="btn ok" id="md-confirmar">${ic('check')}Confirmar a medição</button><button class="btn dangerous" id="md-divergir">${ic('alert')}Apontar divergência</button>` + (excPainel ? `<p class="hint" id="md-excecao" style="margin:0;font-size:12.5px;width:100%">Você enviou esta medição pelo painel do RH e também está na ${esc(m.prestadorNome)}. Pode confirmar por ela: fica registrado na medição como exceção.</p>` : m.criadoPor === eu ? excAv : '');
    if (l === 'tomador' && (st === 'enviada' || st === 'divergencia') && pode(ctx, LANCA)) acoes = `<button class="btn ${st === 'divergencia' ? '' : 'sec'}" id="md-corrigir">${ic('edit')}Corrigir${st === 'divergencia' ? ' e reenviar' : ''}</button><button class="btn ghost" id="md-cancelar">Cancelar medição</button>`;
    const bloqAp = m.criadoPor === eu || (m.confirmacao && m.confirmacao.uid === eu);
    if (l === 'tomador' && st === 'confirmada_prestadora' && pode(ctx, APROVA) && exc && bloqAp) acoes = `<button class="btn ok" id="md-aprovar">${ic('check')}Aprovar a medição</button>` + excAv;
    else if (l === 'tomador' && st === 'confirmada_prestadora' && pode(ctx, APROVA) && m.confirmacao && m.confirmacao.uid === eu && m.criadoPor !== eu) acoes = separa('aprova');
    else if (l === 'tomador' && st === 'confirmada_prestadora' && pode(ctx, APROVA)) acoes = m.criadoPor === eu
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
          ${(m.memoria || []).map(x => `<tr><td>${esc(x.nome)}${x.cnpj ? `<br><small class="hint">MEI ${esc(U().mascara.cnpj(x.cnpj))}</small>` : ''}</td>${temHoras ? `<td class="r">${x.horas == null ? '—' : esc(String(x.horas).replace('.', ',')) + ' h'}</td>` : ''}<td class="r">${esc(brl(x.valorCentavos))}</td></tr>`).join('')}
          <tr><td><b>Total</b></td>${temHoras ? `<td class="r"><b>${esc(String(Math.round((m.memoria || []).reduce((s, x) => s + (x.horas || 0), 0) * 100) / 100).replace('.', ','))} h</b></td>` : ''}<td class="r"><b>${esc(brl(m.valorCentavos))}</b></td></tr></tbody></table></div></section>
      </div><div class="stack">
        <section class="card" id="md-passos"><div class="card-h"><span class="ic">${ic('clock')}</span><h3>Andamento</h3></div><div class="card-b stack" style="gap:16px">
          <ul class="tl">${passo(true, false, 'Medição enviada', formatarDataHora(m.criadoEm) + ' · ' + (m.criadoPorNome || ''))}
            ${passo(!!m.confirmacao, st === 'enviada' || st === 'divergencia', 'Conferida pela prestadora', m.confirmacao ? formatarDataHora(m.confirmacao.em) + ' · ' + m.confirmacao.nome + (m.confirmacao.excecao ? (m.origem === 'integracao' && !m.confirmacao.master ? ' (exceção: enviou pelo painel)' : ' (exceção do piloto)') : '') : st === 'divergencia' ? 'divergência apontada' : 'esperando')}
            ${m.origem === 'integracao' ? passo(true, false, 'Aprovada pela ' + (m.tomadorNome || 'empresa que contrata') + ' no envio pelo painel do RH', st === 'aprovada' ? 'aprovada ao confirmar' : 'vale quando a prestadora confirmar') : passo(!!m.aprovacao, st === 'confirmada_prestadora', 'Aprovada pelo aprovador técnico', m.aprovacao ? formatarDataHora(m.aprovacao.em) + ' · ' + m.aprovacao.nome + (m.aprovacao.excecao ? ' (exceção do piloto)' : '') : 'esperando')}</ul>
          ${acoes ? `<div style="display:flex;gap:8px;flex-wrap:wrap" id="md-acoes">${acoes}</div>` : ''}
          ${zap ? `<div id="md-zap">${zap}</div>` : ''}
          ${st === 'aprovada' && l === 'prestador' && (m.memoria || []).some(x => x.cnpj) ? `<div><button class="btn" id="md-repasse">${ic('users')}Notas dos profissionais MEI</button><p class="hint" style="margin:6px 0 0;font-size:12.5px">Cada profissional MEI emite a nota dele para a sua empresa pelo valor da linha.</p></div>` : ''}
          ${(CW.sessao.estado() || {}).master ? `<div id="md-teste" style="border-top:1px dashed var(--line);padding-top:12px"><button class="btn ghost sm" id="md-apagar" style="color:var(--danger)">${ic('x')}Apagar (dados de teste)</button><p class="hint" style="margin:4px 0 0;font-size:12px">Só a equipe Conectwork vê. Apaga esta medição e tudo o que saiu dela (notas, notas dos MEIs, títulos e arquivos).</p></div>` : ''}
          ${st === 'aprovada' ? `<div id="md-espelho"><p class="hint" style="margin:0;font-size:12.5px">Próximo passo: o espelho da nota fiscal, com os dados para a prestadora emitir.</p></div>` : ''}
        </div></section></div></div>`;
    ligarDetalhe(el, ctx, m);
    const rp = document.getElementById('md-repasse'); if (rp) rp.onclick = () => CW.ir('repasse/ver/' + id);
    const ap = document.getElementById('md-apagar'); if (ap) ap.onclick = () => apagarTeste(ctx, m);
    if (CW.avisar) CW.avisar.ligar(el);
    if (CW.documentos && l === 'tomador' && st !== 'cancelada') CW.documentos.alerta(document.getElementById('md-docs'), m.prestadorId, m.prestadorNome);
    if (st === 'aprovada' && CW.espelhos) CW.espelhos.blocoMedicao(document.getElementById('md-espelho'), ctx, m);
  }

  /* Apagar (dados de teste) · 13/11/2026 ("preciso deixar limpo para amanhã"; só no período de teste, só a equipe Conectwork):
     apaga a medição, os espelhos que saíram dela (o da prestadora e os dos MEIs, com os arquivos da nota), os títulos (com a conta
     e o comprovante) e a reserva da chave da nota. O histórico (log) fica, com o registro de que foi apagado. */
  async function apagarTeste(ctx, m) {
    const db = CW.fb.db(), id = m._id;
    let esps = [];
    try { esps = CW.fb.lista(await db.collection('espelhos').where('medicaoId', '==', id).get()); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); return; }
    const tits = (await Promise.all(esps.map(e => db.doc('titulos/' + e._id).get().then(s => CW.fb.dados(s) ? Object.assign({ _id: e._id }, CW.fb.dados(s)) : null).catch(() => null)))).filter(Boolean);
    const ok = await U().confirmar('Apagar (dados de teste)?', `Apaga de vez a medição de ${periodoTxt(m.periodo)} (${m.tomadorNome} › ${m.prestadorNome}), ${esps.length} espelho${esps.length === 1 ? '' : 's'} de nota (inclui as notas dos MEIs) e ${tits.length} título${tits.length === 1 ? '' : 's'}. Não dá para desfazer. Use só para limpar testes.`, 'Apagar de vez');
    if (!ok) return;
    const docs = [];
    esps.forEach(e => { const ns = [e.nota].concat(e.recusadas || []).filter(Boolean);
      ns.forEach(n => { if (n.envio && n.partes) for (let k = 0; k < n.partes; k++) docs.push('espelhos/' + e._id + '/arquivos/' + n.envio + '-' + k); if (n.chaveUnica) docs.push('notaschave/' + n.chaveUnica); }); });
    tits.forEach(t => { docs.push('titulos/' + t._id + '/privado/conta'); const cp = (t.liquidacao || {}).comprovante; if (cp && cp.envio && cp.partes) for (let k = 0; k < cp.partes; k++) docs.push('titulos/' + t._id + '/arquivos/' + cp.envio + '-' + k); docs.push('titulos/' + t._id); });
    esps.forEach(e => docs.push('espelhos/' + e._id)); docs.push('medicoes/' + id);
    let feitos = 0; const falhas = [];
    for (const d of [...new Set(docs)]) { try { await db.doc(d).delete(); feitos++; } catch (e) { if (!/not.?found/i.test(String(e && (e.code || e.message)))) falhas.push(d); } }
    try { const b = db.batch(); log(b, ctx, 'teste.apagar', `Dados de teste apagados pela equipe Conectwork: medição ${periodoTxt(m.periodo)} (${m.tomadorNome} › ${m.prestadorNome}), ${esps.length} espelho(s) e ${tits.length} título(s).`, id); await b.commit(); } catch (e) { /* sem histórico */ }
    if (falhas.length) U().toast(`Não deu para apagar ${falhas.length} item(ns): publique o firestore.rules novo e tente de novo.`, 'erro');
    else { U().toast('Dados de teste apagados.'); CW.ir('medicoes'); }
  }

  function ligarDetalhe(el, ctx, m) {
    const db = CW.fb.db(), ref = db.doc('medicoes/' + m._id), agora = CW.fb.agora, $ = id => document.getElementById(id);
    const assinatura = () => ({ uid: ctx.sessao.usuario.uid, nome: quem(ctx), em: agora() });
    const grava = async (fn, msg) => { const b = db.batch(); fn(b); try { await b.commit(); if (msg) U().toast(msg); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); } desenharDetalhe(el, ctx, m._id); };
    const pt = periodoTxt(m.periodo);
    $('md-voltar').onclick = () => CW.ir('medicoes');
    const c1 = $('md-confirmar');
    /* medição do painel do RH (13/11/2026): o envio pelo painel já é a aprovação de quem contrata; a prestadora confirma e ela fica aprovada */
    const painel = m.origem === 'integracao';
    if (c1) c1.onclick = async () => { if (!(await U().confirmar('Confirmar a medição?', painel ? `Você confere que a medição de ${pt} está certa: ${brl(m.valorCentavos)}. A ${m.tomadorNome} já aprovou ao enviar pelo painel do RH: confirmando, ela fica aprovada e você já prepara as notas dos profissionais MEI.` : `Você confere que a medição de ${pt} está certa: ${brl(m.valorCentavos)}. Depois, o aprovador técnico da ${m.tomadorNome} aprova.`, 'Confirmar'))) return;
      const conf = Object.assign(assinatura(), m.criadoPor === ctx.sessao.usuario.uid ? { excecao: true } : {});
      const up = painel ? { status: 'aprovada', confirmacao: conf, aprovacao: { uid: m.criadoPor, nome: (m.criadoPorNome || '') + ' (painel do RH)', em: m.criadoEm || agora(), painel: true }, atualizadoEm: agora() } : { status: 'confirmada_prestadora', confirmacao: conf, atualizadoEm: agora() };
      grava(b => { b.update(ref, up); log(b, ctx, painel ? 'medicao.aprovar' : 'medicao.confirmar', `Medição de ${pt} (${m.tomadorNome}) confirmada${painel ? ' pela prestadora e aprovada (enviada pelo painel do RH)' : ''}: ${brl(m.valorCentavos)}.`, m._id); }, painel ? 'Medição confirmada e aprovada. Agora prepare as notas dos profissionais MEI.' : 'Medição confirmada.'); };
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
      grava(b => { const me = ctx.sessao.usuario.uid; b.update(ref, { status: 'aprovada', aprovacao: Object.assign(assinatura(), m.criadoPor === me || (m.confirmacao && m.confirmacao.uid === me) ? { excecao: true } : {}), atualizadoEm: agora() }); log(b, ctx, 'medicao.aprovar', `Medição de ${pt} (${m.prestadorNome}) aprovada: ${brl(m.valorCentavos)}.`, m._id); }, 'Medição aprovada.'); };
  }

  /* ---------- importar do painel do RH: #medicoes/importar/<resumo em base64url> ---------- */
  function lerResumo(txt) {
    try {
      const b64 = String(txt || '').replace(/-/g, '+').replace(/_/g, '/'), pad = b64 + '==='.slice((b64.length + 3) % 4);
      const json = decodeURIComponent(Array.from(atob(pad)).map(ch => '%' + ch.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
      const r = JSON.parse(json);
      if (r.v !== 1 || !/^\d{14}$/.test(String(r.cnpj || '')) || !Array.isArray(r.itens) || !r.itens.length || !Number.isInteger(r.total) || !/^\d{4}-\d{2}(-[12])?$/.test(r.periodo || '')) return null;
      return { periodo: r.periodo, cnpj: r.cnpj, prestadorNome: String(r.nome || ''), total: r.total, ref: String(r.ref || '').slice(0, 80), parte: /^[a-z0-9]{3,30}$/.test(String(r.parte || '')) ? String(r.parte) : '',
        itens: r.itens.slice(0, 300).map(x => Object.assign({ nome: String(x.n || '').slice(0, 120), horas: x.h == null ? null : Number(x.h), valorCentavos: Math.round(Number(x.v) || 0) },
          /^\d{14}$/.test(String(x.c || '')) && U().validarCNPJ(String(x.c)) ? { cnpj: String(x.c) } : {})) };   /* c = CNPJ do MEI (10/11/2026): cada um recebe o espelho da nota dele */
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
    if (!cts.length) {
      /* 12/11/2026 ("os contratos foram feitos antes do Conectwork"): o contrato que já existe no papel é registrado aqui mesmo,
         com a prestadora e a medição já preenchidas; quando ele fica ativo, o contrato mostra "Voltar para a medição". */
      const cn = r.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'), nm = r.prestadorNome || 'essa prestadora';
      let espera = []; try { espera = CW.fb.lista(await CW.fb.db().collection('contratos').where('tomadorId', '==', ctx.contexto.empresaId).get()).filter(c => c.status === 'assinatura' && U().dig(c.prestadorCnpj) === r.cnpj); } catch (e) { espera = []; }
      const adm = ctx.contexto.acesso && ctx.contexto.acesso.cargo === 'admin' && !ctx.soLeitura, rota = 'medicoes/importar/' + payload;
      el.innerHTML = `<div class="banner warn" id="mi-msg">${ic('alert')}<span><strong>${espera.length ? `O contrato com ${esc(nm)} ainda não está ativo` : `Falta registrar no Conectwork o contrato com ${esc(nm)}`}</strong>${espera.length
          ? 'Ele já foi registrado e está esperando a triagem ou as assinaturas. Quando as duas empresas confirmarem, ele fica ativo e a medição pode ser enviada.'
          : `O contrato de vocês pode ter sido assinado antes do Conectwork: não precisa fazer outro. Registre aqui o contrato que já existe (CNPJ ${esc(cn)}), com a data em que foi assinado. ${adm ? '' : 'Quem registra é o administrador da empresa.'}`}</span></div>
        <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">${espera.length ? `<button class="btn" id="mi-vercont">${ic('file')}Ver o contrato</button>` : adm ? `<button class="btn" id="mi-regcont">${ic('file')}Registrar o contrato que já existe</button>` : ''}${voltar}</div>`;
      document.getElementById('mi-voltar').onclick = () => CW.ir('medicoes');
      const vc = document.getElementById('mi-vercont'); if (vc) vc.onclick = () => { try { sessionStorage.setItem('cw.medVoltar', rota); } catch (e) { /* */ } CW.ir('contratos/ver/' + espera[0]._id); };
      const rc = document.getElementById('mi-regcont'); if (rc) rc.onclick = () => CW.contratos.novo(ctx, { cnpj: r.cnpj, nome: String(r.prestadorNome || '').toLowerCase().replace(/(^|\s)\S/g, m => m.toUpperCase()), periodicidade: /-[12]$/.test(r.periodo) ? 'quinzena' : 'mes', existente: true, voltar: rota });
      return;
    }
    const okPer = cts.filter(c => periodoOk(r.periodo, c.periodicidade));
    if (!okPer.length) return fimTela('warn', 'O período não combina com o contrato', `O painel mandou ${periodoTxt(r.periodo)}, mas o contrato com ${cts[0].prestadorNome} é ${cts[0].periodicidade === 'mes' ? 'mensal' : 'por quinzena'}.`);
    const c = okPer[0], id = c._id + '_' + r.periodo + (r.parte ? '_' + r.parte : '');
    /* a medição deste período (ou esta nota separada) já existe: enquanto a prestadora não confirmou, o painel pode mandar de novo
       e a medição é atualizada (ex.: um PJ foi antes e os outros entram depois na mesma nota) */
    let ja = null;
    try { ja = CW.fb.dados(await CW.fb.db().doc('medicoes/' + id).get()); } catch (e) { ja = null; }
    if (ja && !['enviada', 'divergencia'].includes(ja.status)) return fimTela('warn', `A ${r.parte ? 'nota separada' : 'medição'} de ${periodoTxt(r.periodo)} já foi ${ja.status === 'aprovada' ? 'aprovada' : ja.status === 'cancelada' ? 'cancelada' : 'confirmada pela prestadora'}`,
      r.parte ? 'Ela não muda mais por aqui. Se precisar, mande de novo pelo painel como outra nota.' : `Ela não muda mais por aqui. Os PJ que faltam podem ir como "nota separada" pelo painel do RH.`);
    if (ja) ja._id = id;
    const sep = r.parte ? ` · <b>nota separada</b> (${esc(r.itens.map(x => x.nome).join(', '))})` : '';
    el.innerHTML = `<div class="banner info" id="mi-msg">${ic('list')}<span><strong>${ja ? 'Atualização da medição vinda do painel do RH' : 'Medição recebida do painel do RH'}</strong>${esc(c.prestadorNome)} · ${esc(periodoTxt(r.periodo))} · ${esc(brl(r.total))} (${r.itens.length} profissiona${r.itens.length === 1 ? 'l' : 'is'})${sep}. ${ja ? `Antes: ${esc(brl(ja.valorCentavos))} (${(ja.memoria || []).length}). Confira e reenvie para a prestadora.` : 'Confira e envie para a prestadora.'}</span></div>
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="mi-abrir">${ic('edit')}${ja ? 'Conferir e atualizar' : 'Conferir e enviar'}</button>${voltar}</div>`;
    document.getElementById('mi-voltar').onclick = () => CW.ir('medicoes');
    const abrir = () => formulario(ctx, ja, Object.assign({}, r, { contratoId: c._id, contrato: c }));
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
    /* busca do topo: só o que esta tela já carregou */
    buscar(ctx) {
      return (lista || []).map(m => ({ t: `Medição de ${periodoTxt(m.periodo)}`, s: `${outraParte(m, ctx)} · ${brl(m.valorCentavos || 0)}`, rota: 'medicoes/ver/' + m._id,
        txt: [m.tomadorNome, m.prestadorNome, m.periodo, m.status, brl(m.valorCentavos || 0)].join(' ') }));
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
  CW.medicoes = { periodoTxt, lerResumo, ultimosPeriodos, numero, csvLinhas };
})();
