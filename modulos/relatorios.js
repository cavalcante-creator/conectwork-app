/* Conectwork · Relatórios do mês para o financeiro e o contador.
   Escolhe o mês e vê, das duas pontas (o que a empresa paga e o que recebe):
   resumo, notas fiscais da competência com as retenções, total das retenções, pagamentos feitos no mês (com o comprovante),
   o que está em aberto (com vencimento) e as medições da competência. Baixa em Excel (planilha com uma aba por parte)
   e em PDF. As bibliotecas (SheetJS e jsPDF) vêm do cdnjs só quando a pessoa pede o arquivo. */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const CDN = { xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', auto: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js' };
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const RET = [['iss', 'ISS'], ['inss', 'INSS'], ['ir', 'IR'], ['pcc', 'PIS/COFINS/CSLL']];
  const ST_ESP = { aguardando_nota: 'Esperando a nota', nota_enviada: 'Nota para conferir', nota_ok: 'Nota conferida' };
  const ST_TIT = { aprovado: 'Esperando liberação', liberado: 'Liberado', agendado: 'Agendado', liquidado: 'Pago', baixado: 'Recebido e baixado' };
  const ST_MED = { enviada: 'Esperando a prestadora', divergencia: 'Divergência', confirmada_prestadora: 'Esperando aprovação', aprovada: 'Aprovada', cancelada: 'Cancelada' };
  const ABERTO = ['aprovado', 'liberado', 'agendado'];

  const brl = c => U().formatarDinheiro(c || 0);
  const reais = c => Math.round(c || 0) / 100;
  const mesTxt = m => { const x = /^(\d{4})-(\d{2})$/.exec(m || ''); return x ? MESES[+x[2] - 1].replace(/^./, c => c.toUpperCase()) + '/' + x[1] : m; };
  const periodoTxt = p => CW.medicoes ? CW.medicoes.periodoTxt(p) : p;
  const ms = v => !v ? 0 : typeof v.toMillis === 'function' ? v.toMillis() : v.seconds ? v.seconds * 1000 : (Date.parse(v) || 0);
  const dataTxt = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
  const venc = t => CW.titulos ? CW.titulos.vencimento(t) : '';
  const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const mesAtual = () => hojeIso().slice(0, 7);
  const ultimosMeses = n => { const out = [], d = new Date(); d.setDate(1); for (let i = 0; i < n; i++) { out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); d.setMonth(d.getMonth() - 1); } return out; };

  function carregaScript(src, ok) {
    if (ok()) return Promise.resolve();
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = () => ok() ? res() : rej(new Error('Biblioteca não carregou.')); s.onerror = () => rej(new Error('Não foi possível baixar a ferramenta do arquivo. Confira a internet e tente de novo.')); document.head.appendChild(s); });
  }

  /* ---------- dados ---------- */
  async function carregar(ctx) {
    const db = CW.fb.db(), emp = ctx.contexto.empresaId;
    const dois = async col => { const [a, b] = await Promise.all([db.collection(col).where('tomadorId', '==', emp).get(), db.collection(col).where('prestadorId', '==', emp).get()]);
      const m = new Map(); CW.fb.lista(a).concat(CW.fb.lista(b)).forEach(x => m.set(x._id, x)); return Array.from(m.values()); };
    const [esp, tit, med] = await Promise.all([dois('espelhos'), dois('titulos'), dois('medicoes')]);
    return { esp, tit, med };
  }

  /* monta as partes do relatório do mês (mesmo conteúdo na tela, no Excel e no PDF) */
  function montar(D, ctx, mes) {
    const emp = ctx.contexto.empresaId, lado = x => x.tomadorId === emp ? 'pagar' : 'receber', outro = x => x.tomadorId === emp ? x.prestadorNome : x.tomadorNome;
    const ladoTxt = x => lado(x) === 'pagar' ? 'A pagar' : 'A receber';
    const titDe = {}; D.tit.forEach(t => { titDe[t._id] = t; });
    const notas = D.esp.filter(e => e.competencia === mes && e.nota).sort((a, b) => lado(a).localeCompare(lado(b)) || outro(a).localeCompare(outro(b)));
    const semNota = D.esp.filter(e => e.competencia === mes && !e.nota);
    const ret = { pagar: {}, receber: {} }; RET.forEach(([k]) => { ret.pagar[k] = 0; ret.receber[k] = 0; });
    notas.forEach(e => RET.forEach(([k]) => { ret[lado(e)][k] += (e.retencoes || {})[k] || 0; }));
    const pagos = D.tit.filter(t => t.liquidacao && (t.liquidacao.data || '').slice(0, 7) === mes).sort((a, b) => a.liquidacao.data.localeCompare(b.liquidacao.data));
    const abertos = D.tit.filter(t => ABERTO.includes(t.status) || (t.status === 'liquidado' && lado(t) === 'receber' && !t.liquidacao)).sort((a, b) => venc(a).localeCompare(venc(b)));
    const meds = D.med.filter(m => String(m.periodo).slice(0, 7) === mes && m.status !== 'cancelada').sort((a, b) => String(a.periodo).localeCompare(String(b.periodo)));
    const soma = (xs, f) => xs.reduce((s, x) => s + (f(x) || 0), 0);
    const resumo = [
      ['Notas da competência a pagar', soma(notas.filter(e => lado(e) === 'pagar'), e => e.valorCentavos)],
      ['Notas da competência a receber', soma(notas.filter(e => lado(e) === 'receber'), e => e.valorCentavos)],
      ['Retenções feitas pela empresa (a recolher)', soma(RET, ([k]) => ret.pagar[k])],
      ['Retenções sofridas (retidas pelos clientes)', soma(RET, ([k]) => ret.receber[k])],
      ['Pago no mês', soma(pagos.filter(t => lado(t) === 'pagar'), t => t.liquidoCentavos)],
      ['Recebido no mês', soma(pagos.filter(t => lado(t) === 'receber'), t => t.liquidoCentavos)],
      ['Em aberto a pagar (todos os meses)', soma(abertos.filter(t => lado(t) === 'pagar'), t => t.liquidoCentavos)],
      ['Em aberto a receber (todos os meses)', soma(abertos.filter(t => lado(t) === 'receber'), t => t.liquidoCentavos)]
    ];
    const hoje = hojeIso();
    return {
      mes, empresa: ctx.contexto.nome, resumo, ret,
      notas: notas.map(e => ({ id: e._id, lado: ladoTxt(e), empresa: outro(e), periodo: periodoTxt(e.periodo), numero: e.nota.numero || '', chave: e.nota.chave || '', valor: e.valorCentavos,
        r: RET.map(([k]) => (e.retencoes || {})[k] || 0), liquido: e.liquidoCentavos, situacao: ST_ESP[e.status] || e.status, titulo: titDe[e._id] ? (ST_TIT[titDe[e._id].status] || '') : '' })),
      semNota: semNota.map(e => ({ lado: ladoTxt(e), empresa: outro(e), periodo: periodoTxt(e.periodo), valor: e.valorCentavos })),
      pagos: pagos.map(t => ({ id: t._id, lado: ladoTxt(t), empresa: outro(t), numero: t.notaNumero || '', data: t.liquidacao.data, liquido: t.liquidoCentavos, quem: t.liquidacao.nome || '', comprovante: !!t.liquidacao.comprovante, baixado: t.status === 'baixado' })),
      abertos: abertos.map(t => ({ id: t._id, lado: ladoTxt(t), empresa: outro(t), periodo: periodoTxt(t.periodo), numero: t.notaNumero || '', vencimento: venc(t), vencido: venc(t) && venc(t) < hoje, liquido: t.liquidoCentavos, situacao: ST_TIT[t.status] || t.status })),
      medicoes: meds.map(m => ({ lado: m.tomadorId === emp ? 'Você contrata' : 'Você presta', empresa: outro(m), periodo: periodoTxt(m.periodo), valor: m.valorCentavos, profissionais: (m.memoria || []).length, situacao: ST_MED[m.status] || m.status }))
    };
  }

  /* ---------- tela ---------- */
  let dadosCache = null;
  async function render(el, ctx) {
    const { esc, ic } = U();
    const mes = /^\d{4}-\d{2}$/.test(ctx.params[0] || '') ? ctx.params[0] : mesAtual();
    document.getElementById('acoes').innerHTML = `<button class="btn sec" id="rl-xls">${ic('file')}Excel</button><button class="btn sec" id="rl-pdf">${ic('file')}PDF</button>`;
    el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Montando o relatório…</span></div></div>`;
    try { dadosCache = await carregar(ctx); } catch (e) { el.innerHTML = `<div class="banner danger">${ic('alert')}<span><strong>Não foi possível montar o relatório.</strong>${esc(CW.fb.mensagemErro(e))}</span></div>`; return; }
    const R = montar(dadosCache, ctx, mes);
    const tab = (id, cab, linhas, vazio) => linhas.length ? `<div class="scroll"><table class="resp rl-tab" id="${id}"><thead><tr>${cab.map(c => `<th class="${c[1] || ''}">${esc(c[0])}</th>`).join('')}</tr></thead><tbody>${linhas.join('')}</tbody></table></div>` : `<p class="hint" style="margin:0;padding:16px 20px">${esc(vazio)}</p>`;
    const sec = (id, icone, t, corpo, n) => `<section class="card" id="${id}" style="margin-bottom:22px"><div class="card-h"><span class="ic">${ic(icone)}</span><h3>${esc(t)}</h3>${n != null ? `<span class="count">${n}</span>` : ''}</div>${corpo}</section>`;
    el.innerHTML = `<div class="rl-barra"><label class="f" style="max-width:260px"><span>Mês (competência)</span><select id="rl-mes">${ultimosMeses(18).map(m => `<option value="${m}" ${m === mes ? 'selected' : ''}>${esc(mesTxt(m))}</option>`).join('')}</select></label></div>
      <section class="card" id="rl-resumo" style="margin-bottom:22px"><div class="card-h"><span class="ic">${ic('wallet')}</span><h3>Resumo de ${esc(mesTxt(mes))}</h3></div><div class="card-b rl-res">
        ${R.resumo.map(([t, v]) => `<div><small>${esc(t)}</small><b>${esc(brl(v))}</b></div>`).join('')}</div></section>
      ${sec('rl-notas', 'receipt', 'Notas fiscais da competência', tab('rl-tab-notas', [['Empresa'], ['Nº'], ['Valor', 'r'], ...RET.map(([, n]) => [n, 'r']), ['Líquido', 'r'], ['Situação']],
        R.notas.map(n => `<tr><td class="m-full"><strong>${esc(n.empresa)}</strong><br><small class="hint">${esc(n.lado)} · ${esc(n.periodo)}</small></td><td>${esc(n.numero || '—')}</td><td class="r">${esc(brl(n.valor))}</td>${n.r.map(v => `<td class="r">${v ? esc(brl(v)) : '—'}</td>`).join('')}<td class="r"><b>${esc(brl(n.liquido))}</b></td><td>${esc(n.situacao)}${n.titulo ? '<br><small class="hint">' + esc(n.titulo) + '</small>' : ''}</td></tr>`),
        'Nenhuma nota fiscal desta competência.') + (R.semNota.length ? `<p class="hint" style="margin:0;padding:10px 20px;font-size:12.5px;border-top:1px solid var(--line)" id="rl-semnota">Esperando a nota: ${R.semNota.map(x => esc(x.empresa + ' (' + x.periodo + ', ' + brl(x.valor) + ')')).join('; ')}.</p>` : ''), R.notas.length)}
      ${sec('rl-ret', 'shield', 'Retenções da competência', `<div class="scroll"><table class="rl-tab" id="rl-tab-ret"><thead><tr><th>Imposto</th><th class="r">Retido pela sua empresa (a recolher)</th><th class="r">Retido de você pelos clientes</th></tr></thead><tbody>
        ${RET.map(([k, n]) => `<tr><td>${esc(n)}</td><td class="r">${esc(brl(R.ret.pagar[k]))}</td><td class="r">${esc(brl(R.ret.receber[k]))}</td></tr>`).join('')}</tbody></table></div>
        <p class="hint" style="margin:0;padding:10px 20px;font-size:12px">Valores informados à mão em cada espelho. As guias de recolhimento são com o seu contador.</p>`)}
      ${sec('rl-pagos', 'check', 'Pagamentos do mês', tab('rl-tab-pagos', [['Data'], ['Empresa'], ['Nota'], ['Líquido', 'r'], ['Confirmado por'], ['']],
        R.pagos.map(p => `<tr><td>${esc(dataTxt(p.data))}</td><td class="m-full"><strong>${esc(p.empresa)}</strong><br><small class="hint">${esc(p.lado)}${p.baixado ? ' · recebimento confirmado' : ''}</small></td><td>${esc(p.numero || '—')}</td><td class="r"><b>${esc(brl(p.liquido))}</b></td><td>${esc(p.quem)}</td><td class="r"><a class="linkbtn" href="#titulos/ver/${esc(p.id)}" style="font-size:13px">comprovante</a></td></tr>`),
        'Nenhum pagamento confirmado neste mês.'), R.pagos.length)}
      ${sec('rl-abertos', 'clock', 'Em aberto (todos os meses)', tab('rl-tab-abertos', [['Vencimento'], ['Empresa'], ['Nota'], ['Líquido', 'r'], ['Situação']],
        R.abertos.map(a => `<tr><td>${a.vencido ? `<b style="color:var(--danger)">${esc(dataTxt(a.vencimento))}</b><br><small style="color:var(--danger)">vencido</small>` : esc(dataTxt(a.vencimento))}</td><td class="m-full"><strong>${esc(a.empresa)}</strong><br><small class="hint">${esc(a.lado)} · ${esc(a.periodo)}</small></td><td>${esc(a.numero || '—')}</td><td class="r"><b>${esc(brl(a.liquido))}</b></td><td>${esc(a.situacao)}</td></tr>`),
        'Nada em aberto.'), R.abertos.length)}
      ${sec('rl-med', 'list', 'Medições da competência', tab('rl-tab-med', [['Período'], ['Empresa'], ['Profissionais', 'r'], ['Valor', 'r'], ['Situação']],
        R.medicoes.map(m => `<tr><td>${esc(m.periodo)}</td><td class="m-full"><strong>${esc(m.empresa)}</strong><br><small class="hint">${esc(m.lado)}</small></td><td class="r">${m.profissionais}</td><td class="r">${esc(brl(m.valor))}</td><td>${esc(m.situacao)}</td></tr>`),
        'Nenhuma medição desta competência.'), R.medicoes.length)}
      <p class="hint" style="margin:0;font-size:12px">Notas e medições pela competência (mês do serviço); pagamentos pela data do pagamento. O dinheiro não passa pelo Conectwork.</p>`;
    document.getElementById('rl-mes').onchange = e => CW.ir('relatorios/mes/' + e.target.value);
    document.getElementById('rl-xls').onclick = () => excel(R).catch(er => U().toast(er.message, 'erro'));
    document.getElementById('rl-pdf').onclick = () => pdf(R).catch(er => U().toast(er.message, 'erro'));
  }

  const nomeArq = (R, ext) => `Conectwork-relatorio-${R.mes}-${String(R.empresa).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '')}.${ext}`;

  /* ---------- Excel ---------- */
  async function excel(R) {
    await carregaScript(CDN.xlsx, () => !!window.XLSX);
    const X = window.XLSX, wb = X.utils.book_new();
    const aba = (nome, linhas, larg) => { const ws = X.utils.aoa_to_sheet(linhas); if (larg) ws['!cols'] = larg.map(w => ({ wch: w })); X.utils.book_append_sheet(wb, ws, nome); };
    aba('Resumo', [['Relatório Conectwork', R.empresa], ['Competência', mesTxt(R.mes)], [], ['Item', 'Valor (R$)'], ...R.resumo.map(([t, v]) => [t, reais(v)])], [46, 18]);
    aba('Notas', [['A pagar/receber', 'Empresa', 'Período', 'Nº da nota', 'Chave de acesso', 'Valor (R$)', ...RET.map(([, n]) => n + ' (R$)'), 'Líquido (R$)', 'Situação da nota', 'Pagamento'],
      ...R.notas.map(n => [n.lado, n.empresa, n.periodo, n.numero, n.chave, reais(n.valor), ...n.r.map(reais), reais(n.liquido), n.situacao, n.titulo])], [14, 28, 30, 10, 52, 14, 12, 12, 12, 16, 14, 18, 18]);
    aba('Retenções', [['Imposto', 'Retido pela empresa (a recolher, R$)', 'Retido pelos clientes (R$)'], ...RET.map(([k, n]) => [n, reais(R.ret.pagar[k]), reais(R.ret.receber[k])])], [20, 34, 28]);
    aba('Pagamentos', [['Data', 'A pagar/receber', 'Empresa', 'Nota', 'Líquido (R$)', 'Confirmado por', 'Comprovante', 'Recebimento confirmado'],
      ...R.pagos.map(p => [dataTxt(p.data), p.lado, p.empresa, p.numero, reais(p.liquido), p.quem, p.comprovante ? 'Sim (no Conectwork)' : 'Não', p.baixado ? 'Sim' : 'Não'])], [12, 14, 28, 10, 14, 22, 20, 22]);
    aba('Em aberto', [['Vencimento', 'Vencido', 'A pagar/receber', 'Empresa', 'Período', 'Nota', 'Líquido (R$)', 'Situação'],
      ...R.abertos.map(a => [dataTxt(a.vencimento), a.vencido ? 'Sim' : 'Não', a.lado, a.empresa, a.periodo, a.numero, reais(a.liquido), a.situacao])], [12, 9, 14, 28, 30, 10, 14, 20]);
    aba('Medições', [['Período', 'Lado', 'Empresa', 'Profissionais', 'Valor (R$)', 'Situação'], ...R.medicoes.map(m => [m.periodo, m.lado, m.empresa, m.profissionais, reais(m.valor), m.situacao])], [30, 14, 28, 12, 14, 22]);
    X.writeFile(wb, nomeArq(R, 'xlsx'));
    U().toast('Planilha baixada.');
  }

  /* ---------- PDF ---------- */
  async function pdf(R) {
    await carregaScript(CDN.jspdf, () => !!(window.jspdf && window.jspdf.jsPDF));
    await carregaScript(CDN.auto, () => !!(window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable));
    const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const azul = [8, 22, 56], cab = { fillColor: azul, textColor: 255, fontStyle: 'bold', fontSize: 8.5 }, corpo = { fontSize: 8.5, cellPadding: 1.8 };
    doc.setFillColor(...azul); doc.rect(0, 0, 297, 22, 'F');
    doc.setTextColor(255); doc.setFontSize(15); doc.text('Conectwork · Relatório do mês', 12, 10);
    doc.setFontSize(10); doc.text(`${R.empresa} · competência ${mesTxt(R.mes)} · gerado em ${dataTxt(hojeIso())}`, 12, 17);
    doc.setTextColor(20);
    let y = 30;
    const titulo = t => { if (y > 180) { doc.addPage(); y = 16; } doc.setFontSize(11.5); doc.setFont(undefined, 'bold'); doc.text(t, 12, y); doc.setFont(undefined, 'normal'); y += 3; };
    const tabela = (head, body, colunas) => { doc.autoTable({ startY: y, head: [head], body: body.length ? body : [[{ content: 'Nada neste mês.', colSpan: head.length }]], headStyles: cab, styles: corpo, margin: { left: 12, right: 12 }, columnStyles: colunas || {} }); y = doc.lastAutoTable.finalY + 9; };
    titulo('Resumo'); tabela(['Item', 'Valor'], R.resumo.map(([t, v]) => [t, brl(v)]), { 1: { halign: 'right' } });
    titulo('Notas fiscais da competência');
    tabela(['Empresa', 'A pagar/receber', 'Nº', 'Valor', ...RET.map(([, n]) => n), 'Líquido', 'Situação'], R.notas.map(n => [n.empresa, n.lado, n.numero || '—', brl(n.valor), ...n.r.map(v => v ? brl(v) : '—'), brl(n.liquido), n.situacao]),
      { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } });
    titulo('Retenções da competência'); tabela(['Imposto', 'Retido pela empresa (a recolher)', 'Retido pelos clientes'], RET.map(([k, n]) => [n, brl(R.ret.pagar[k]), brl(R.ret.receber[k])]), { 1: { halign: 'right' }, 2: { halign: 'right' } });
    titulo('Pagamentos do mês'); tabela(['Data', 'Empresa', 'A pagar/receber', 'Nota', 'Líquido', 'Confirmado por', 'Comprovante'], R.pagos.map(p => [dataTxt(p.data), p.empresa, p.lado, p.numero || '—', brl(p.liquido), p.quem, p.comprovante ? 'no Conectwork' : '—']), { 4: { halign: 'right' } });
    titulo('Em aberto (todos os meses)'); tabela(['Vencimento', 'Empresa', 'A pagar/receber', 'Nota', 'Líquido', 'Situação'], R.abertos.map(a => [dataTxt(a.vencimento) + (a.vencido ? ' (vencido)' : ''), a.empresa, a.lado, a.numero || '—', brl(a.liquido), a.situacao]), { 4: { halign: 'right' } });
    titulo('Medições da competência'); tabela(['Período', 'Empresa', 'Lado', 'Profissionais', 'Valor', 'Situação'], R.medicoes.map(m => [m.periodo, m.empresa, m.lado, String(m.profissionais), brl(m.valor), m.situacao]), { 3: { halign: 'right' }, 4: { halign: 'right' } });
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text(`Conectwork · O dinheiro não passa pelo Conectwork. Retenções informadas à mão em cada espelho.   Página ${i} de ${n}`, 12, 203); }
    doc.save(nomeArq(R, 'pdf'));
    U().toast('PDF baixado.');
  }

  CW.registrarModulo({
    id: 'relatorios', nome: 'Relatórios', icone: 'grid', ordem: 60,
    para: ['empresa'], contrato: ['cobrancas', 'contratos'],
    telas: { mes: { nome: 'Relatório do mês', sub: 'Notas, retenções, pagamentos, em aberto e medições do mês, para o financeiro e o contador. Baixe em Excel ou PDF.', render } }
  });
  CW.relatorios = { montar, carregar };
})();
