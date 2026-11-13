/* Conectwork · Relatórios do mês para o financeiro e o contador.
   Escolhe o mês e vê, das duas pontas (o que a empresa paga e o que recebe):
   resumo, notas fiscais da competência com as retenções, total das retenções, pagamentos feitos no mês (com o comprovante),
   o que está em aberto (com vencimento) e as medições da competência. Baixa em Excel (planilha com uma aba por parte)
   e em PDF. As bibliotecas (SheetJS e jsPDF) vêm do cdnjs só quando a pessoa pede o arquivo. */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const CDN = { xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', auto: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js', exceljs: 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js' };
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
    /* 13/11/2026 (PDF e Excel completos): mês anterior, últimos 6 meses e o total por empresa */
    const mesAnt = m => { const [a, b] = m.split('-').map(Number); return b === 1 ? `${a - 1}-12` : `${a}-${String(b - 1).padStart(2, '0')}`; };
    const doMes = m => { const pg = D.tit.filter(t => t.liquidacao && (t.liquidacao.data || '').slice(0, 7) === m), ns = D.esp.filter(e => e.competencia === m && e.nota);
      return { mes: m, pago: soma(pg.filter(t => lado(t) === 'pagar'), t => t.liquidoCentavos), recebido: soma(pg.filter(t => lado(t) === 'receber'), t => t.liquidoCentavos),
        notasPagar: soma(ns.filter(e => lado(e) === 'pagar'), e => e.valorCentavos), notasReceber: soma(ns.filter(e => lado(e) === 'receber'), e => e.valorCentavos) }; };
    const hist = []; let mm = mes; for (let i = 0; i < 6; i++) { hist.unshift(doMes(mm)); mm = mesAnt(mm); }
    const ant = doMes(mesAnt(mes));
    const pe = new Map(), add = (nome, k, v) => { if (!pe.has(nome)) pe.set(nome, { empresa: nome, notasPagar: 0, notasReceber: 0, pago: 0, recebido: 0, abertoPagar: 0, abertoReceber: 0 }); pe.get(nome)[k] += v || 0; };
    notas.forEach(e => add(outro(e), lado(e) === 'pagar' ? 'notasPagar' : 'notasReceber', e.valorCentavos));
    pagos.forEach(t => add(outro(t), lado(t) === 'pagar' ? 'pago' : 'recebido', t.liquidoCentavos));
    abertos.forEach(t => add(outro(t), lado(t) === 'pagar' ? 'abertoPagar' : 'abertoReceber', t.liquidoCentavos));
    const porEmpresa = Array.from(pe.values()).sort((a, b) => (b.notasPagar + b.notasReceber + b.pago + b.recebido) - (a.notasPagar + a.notasReceber + a.pago + a.recebido));
    const e0 = ctx.contexto.empresa || {}, perfil = (ctx.sessao && ctx.sessao.perfil) || {};
    return {
      mes, mesAnterior: mesAnt(mes), empresa: ctx.contexto.nome, empresaId: ctx.contexto.empresaId, cnpj: e0.cnpj || '', quem: perfil.nome || ((ctx.sessao && ctx.sessao.usuario) || {}).email || '', hist, ant, porEmpresa, resumo, ret,
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

  /* ---------- PDF e Excel completos (13/11/2026, "deixar melhor o layout do PDF e do Excel, bem completos e visualmente bonitos") ----------
     Os dois têm: capa com a marca, a empresa, o CNPJ, a competência e quem gerou; os números do mês com o mês anterior;
     o gráfico dos últimos 6 meses (recebido x pago); o total por empresa; e cada parte com o total no fim.
     Excel com ExcelJS (cores, moeda, filtro, linha do total com fórmula); se o ExcelJS não vier, a planilha simples do SheetJS. */
  const NAVY = [8, 22, 56], AZUL = [26, 92, 240], LARANJA = [234, 109, 22], VERDE = [14, 138, 85], VERM = [200, 40, 40], CINZA = [100, 112, 135];
  const mesCurto = m => { const x = /^(\d{4})-(\d{2})$/.exec(m || ''); return x ? MESES[+x[2] - 1].slice(0, 3) + '/' + x[1].slice(2) : m; };
  const variacao = (v, a) => !a ? (v ? 'novo' : '') : ((v - a) / a * 100 >= 0 ? '+' : '') + Math.round((v - a) / a * 100) + '%';
  const agoraTxt = () => { const d = new Date(); return dataTxt(hojeIso()) + ' às ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const cnpjTxt = c => { const d = String(c || '').replace(/\D/g, ''); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : (c || ''); };
  /* os números do mês, com o mês anterior para comparar (mesmos nos dois arquivos) */
  function cartoes(R) {
    const v = t => (R.resumo.find(x => x[0] === t) || [, 0])[1];
    return [
      ['Recebido no mês', v('Recebido no mês'), R.ant.recebido, AZUL], ['Pago no mês', v('Pago no mês'), R.ant.pago, LARANJA],
      ['Saldo do mês (recebido - pago)', v('Recebido no mês') - v('Pago no mês'), R.ant.recebido - R.ant.pago, VERDE],
      ['Notas a receber (competência)', v('Notas da competência a receber'), R.ant.notasReceber, AZUL], ['Notas a pagar (competência)', v('Notas da competência a pagar'), R.ant.notasPagar, LARANJA],
      ['Retenções a recolher', v('Retenções feitas pela empresa (a recolher)'), null, CINZA], ['Retenções sofridas', v('Retenções sofridas (retidas pelos clientes)'), null, CINZA],
      ['Em aberto a receber', v('Em aberto a receber (todos os meses)'), null, AZUL], ['Em aberto a pagar', v('Em aberto a pagar (todos os meses)'), null, LARANJA]
    ];
  }
  /* a marca do Conectwork em PNG (para o PDF e o Excel) */
  function logoPng() {
    return new Promise(res => {
      try {
        const svg = U().LOGO(200).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '), img = new Image();
        const t = setTimeout(() => res(null), 2500);
        img.onload = () => { clearTimeout(t); try { const c = document.createElement('canvas'); c.width = c.height = 200; c.getContext('2d').drawImage(img, 0, 0, 200, 200); res(c.toDataURL('image/png')); } catch (e) { res(null); } };
        img.onerror = () => { clearTimeout(t); res(null); };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      } catch (e) { res(null); }
    });
  }
  /* a logo da empresa (a mesma de Minha empresa), já encaixada no quadradinho; sem logo, null (13/11/2026, "pode incluir a logo da pessoa?") */
  async function logoEmpresa(R) {
    try {
      if (!CW.logos || !R.empresaId) return null;
      const u = await CW.logos.buscar(R.empresaId); if (!u) return null;
      const o = await Promise.race([CW.logos.organizar(u), new Promise(r => setTimeout(() => r(null), 3000))]);
      const url = (o && o.url) || u, m = /^data:image\/(png|jpe?g);base64,/i.exec(url || '');
      return m ? { url, tipo: /png/i.test(m[1]) ? 'png' : 'jpeg', fundo: (o && o.fundo) || '#FFFFFF' } : null;
    } catch (e) { return null; }
  }
  /* gráfico dos últimos 6 meses (recebido x pago) desenhado num canvas, para o Excel */
  function graficoPng(R) {
    try {
      const W = 900, H = 340, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#081638'; g.font = 'bold 20px Arial'; g.fillText('Últimos 6 meses · recebido x pago', 24, 34);
      const max = Math.max(1, ...R.hist.map(h => Math.max(h.recebido, h.pago))), x0 = 70, y0 = H - 50, alt = H - 110, larg = (W - x0 - 30) / R.hist.length;
      g.strokeStyle = '#E3E8F2'; g.fillStyle = '#6B7590'; g.font = '13px Arial';
      for (let i = 0; i <= 4; i++) { const y = y0 - alt * i / 4; g.beginPath(); g.moveTo(x0, y); g.lineTo(W - 20, y); g.stroke(); g.fillText(Math.round(max * i / 4 / 100).toLocaleString('pt-BR'), 8, y + 4); }
      R.hist.forEach((h, i) => { const bx = x0 + i * larg + larg * 0.18, bw = larg * 0.3;
        [[h.recebido, '#1A5CF0'], [h.pago, '#EA6D16']].forEach(([v, cor], k) => { const bh = alt * v / max; g.fillStyle = cor; g.fillRect(bx + k * (bw + 4), y0 - bh, bw, bh); });
        g.fillStyle = h.mes === R.mes ? '#081638' : '#6B7590'; g.font = (h.mes === R.mes ? 'bold ' : '') + '14px Arial'; g.fillText(mesCurto(h.mes), bx, y0 + 22); });
      g.fillStyle = '#1A5CF0'; g.fillRect(W - 230, 18, 14, 14); g.fillStyle = '#081638'; g.font = '14px Arial'; g.fillText('Recebido', W - 210, 30);
      g.fillStyle = '#EA6D16'; g.fillRect(W - 120, 18, 14, 14); g.fillStyle = '#081638'; g.fillText('Pago', W - 100, 30);
      return c.toDataURL('image/png');
    } catch (e) { return null; }
  }

  /* ---------- Excel ---------- */
  async function excel(R) {
    try { await carregaScript(CDN.exceljs, () => !!window.ExcelJS); } catch (e) { return excelSimples(R); }
    const wb = new window.ExcelJS.Workbook(); wb.creator = 'Conectwork'; wb.created = new Date();
    const hex = c => 'FF' + c.map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
    const MOEDA = '"R$" #,##0.00;[Red]-"R$" #,##0.00', fill = c => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: c } });
    const borda = { bottom: { style: 'thin', color: { argb: 'FFE3E8F2' } } };
    const [logo, graf, lemp] = await Promise.all([logoPng(), Promise.resolve(graficoPng(R)), logoEmpresa(R)]);
    const logoId = logo ? wb.addImage({ base64: logo, extension: 'png' }) : null;
    const lempId = lemp ? wb.addImage({ base64: lemp.url, extension: lemp.tipo }) : null;
    /* faixa do alto de cada aba: marca, título, empresa e competência */
    const faixa = (ws, titulo, ncol) => {
      ws.properties.tabColor = { argb: hex(NAVY) };
      const ult = Math.max(ncol, 6) + (lempId != null ? 1 : 0);   /* uma coluna a mais na faixa para a logo da empresa */
      if (lempId != null && (ws.getColumn(ult).width || 0) < 10) ws.getColumn(ult).width = 10;
      for (let r = 1; r <= 3; r++) for (let c = 1; c <= ult; c++) ws.getCell(r, c).fill = fill(hex(NAVY));
      ws.getRow(1).height = 30; ws.getRow(2).height = 18; ws.getRow(3).height = 16;
      ws.getCell('B1').value = titulo; ws.getCell('B1').font = { name: 'Calibri', size: 17, bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getCell('B2').value = `${R.empresa}${R.cnpj ? ' · CNPJ ' + cnpjTxt(R.cnpj) : ''} · competência ${mesTxt(R.mes)}`; ws.getCell('B2').font = { size: 11, color: { argb: 'FFC8D5F3' } };
      ws.getCell('B3').value = `Gerado em ${agoraTxt()}${R.quem ? ' por ' + R.quem : ''} · Conectwork`; ws.getCell('B3').font = { size: 9, color: { argb: 'FF8FA3CC' } };
      ws.getColumn(1).width = Math.max(ws.getColumn(1).width || 0, 7);
      if (logoId != null) ws.addImage(logoId, { tl: { col: 0.15, row: 0.2 }, ext: { width: 40, height: 40 } });
      if (lempId != null) ws.addImage(lempId, { tl: { col: ult - 1 + 0.1, row: 0.2 }, ext: { width: 54, height: 54 } });   /* a logo da empresa no canto direito da faixa */
      ws.views = [{ state: 'frozen', ySplit: 5, showGridLines: false }];
      ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
      ws.headerFooter = { oddFooter: `&L${titulo} · ${R.empresa}&RPágina &P de &N` };
    };
    /* tabela com cabeçalho azul-marinho, linhas zebradas, filtro e total com fórmula */
    const tabela = (nome, titulo, cols, linhas, opc) => {
      opc = opc || {};
      const ws = wb.addWorksheet(nome); faixa(ws, titulo, cols.length);
      cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.w || 14; });
      const h = ws.getRow(5); h.values = cols.map(c => c.t); h.height = 22;
      h.eachCell(c => { c.fill = fill(hex(NAVY)); c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.alignment = { vertical: 'middle', wrapText: true }; });
      if (!linhas.length) { const r = ws.getRow(6); r.getCell(1).value = opc.vazio || 'Nada neste mês.'; r.getCell(1).font = { italic: true, color: { argb: 'FF6B7590' } }; return ws; }
      linhas.forEach((l, i) => { const r = ws.getRow(6 + i); r.values = l.v;
        cols.forEach((c, k) => { const cel = r.getCell(k + 1); if (c.m) cel.numFmt = MOEDA; if (c.n) cel.numFmt = '0'; if (c.d) cel.alignment = { horizontal: 'center' };
          cel.border = borda; if (i % 2) cel.fill = fill('FFF4F7FC'); if (l.cor) cel.font = { color: { argb: l.cor } }; }); });
      const fim = 5 + linhas.length;
      ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: fim, column: cols.length } };
      if (cols.some(c => c.m || c.soma)) { const t = ws.getRow(fim + 1); t.getCell(1).value = 'Total'; t.height = 20;
        cols.forEach((c, k) => { const cel = t.getCell(k + 1); const L = ws.getColumn(k + 1).letter;
          if (c.m || c.soma) { cel.value = { formula: `SUBTOTAL(9,${L}6:${L}${fim})` }; if (c.m) cel.numFmt = MOEDA; }
          cel.font = { bold: true, color: { argb: hex(NAVY) } }; cel.fill = fill('FFE6ECF8'); cel.border = { top: { style: 'medium', color: { argb: hex(NAVY) } } }; }); }
      return ws;
    };

    /* Resumo: os números do mês, com o mês anterior e a variação; últimos 6 meses com o gráfico */
    const ws = wb.addWorksheet('Resumo'); faixa(ws, 'Relatório do mês', 6);
    [7, 38, 18, 18, 12, 4].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    const cab = (row, vals) => { const r = ws.getRow(row); vals.forEach((v, i) => { const c = r.getCell(i + 2); c.value = v; c.fill = fill(hex(NAVY)); c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; }); r.height = 20; };
    cab(5, ['Números do mês', mesTxt(R.mes), mesTxt(R.mesAnterior), 'Variação']);
    cartoes(R).forEach(([t, v, a, cor], i) => { const r = ws.getRow(6 + i), n = 6 + i; r.height = 19;
      r.getCell(2).value = t; r.getCell(2).border = { left: { style: 'thick', color: { argb: hex(cor) } }, bottom: borda.bottom };
      r.getCell(3).value = reais(v); r.getCell(3).numFmt = MOEDA; r.getCell(3).font = { bold: true, size: 12 };
      if (a != null) { r.getCell(4).value = reais(a); r.getCell(4).numFmt = MOEDA; r.getCell(4).font = { color: { argb: 'FF6B7590' } };
        r.getCell(5).value = { formula: `IF(D${n}=0,"",C${n}/D${n}-1)` }; r.getCell(5).numFmt = '+0%;[Red]-0%;0%'; }
      [3, 4, 5].forEach(k => { r.getCell(k).border = borda; }); if (i % 2) [2, 3, 4, 5].forEach(k => { r.getCell(k).fill = fill('FFF4F7FC'); }); });
    const h0 = 17; cab(h0, ['Últimos 6 meses', 'Recebido', 'Pago', 'Saldo']);
    R.hist.forEach((h, i) => { const r = ws.getRow(h0 + 1 + i), n = h0 + 1 + i; r.getCell(2).value = mesTxt(h.mes) + (h.mes === R.mes ? ' (este mês)' : '');
      r.getCell(3).value = reais(h.recebido); r.getCell(4).value = reais(h.pago); r.getCell(5).value = { formula: `C${n}-D${n}` };
      [3, 4, 5].forEach(k => { r.getCell(k).numFmt = MOEDA; }); [2, 3, 4, 5].forEach(k => { r.getCell(k).border = borda; if (h.mes === R.mes) r.getCell(k).font = { bold: true }; }); });
    if (graf) ws.addImage(wb.addImage({ base64: graf, extension: 'png' }), { tl: { col: 6.3, row: 4 }, ext: { width: 600, height: 227 } });   /* ao lado dos números */
    const nota = ws.getCell(`B${h0 + 9}`); nota.value = 'O dinheiro não passa pelo Conectwork: sai de quem contrata direto para quem presta. Retenções informadas à mão em cada espelho; as guias são com o seu contador.';
    nota.font = { italic: true, size: 9, color: { argb: 'FF6B7590' } };

    tabela('Notas', 'Notas fiscais da competência', [{ t: 'A pagar/receber', w: 15 }, { t: 'Empresa', w: 30 }, { t: 'Período', w: 30 }, { t: 'Nº da nota', w: 11 }, { t: 'Chave de acesso', w: 48 },
      { t: 'Valor', w: 15, m: 1 }, ...RET.map(([, n]) => ({ t: n, w: 13, m: 1 })), { t: 'Líquido', w: 15, m: 1 }, { t: 'Situação da nota', w: 18 }, { t: 'Pagamento', w: 18 }],
      R.notas.map(n => ({ v: [n.lado, n.empresa, n.periodo, n.numero, n.chave, reais(n.valor), ...n.r.map(reais), reais(n.liquido), n.situacao, n.titulo] })), { vazio: 'Nenhuma nota fiscal desta competência.' });
    tabela('Esperando a nota', 'Esperando a nota fiscal', [{ t: 'A pagar/receber', w: 15 }, { t: 'Empresa', w: 32 }, { t: 'Período', w: 32 }, { t: 'Valor', w: 15, m: 1 }],
      R.semNota.map(x => ({ v: [x.lado, x.empresa, x.periodo, reais(x.valor)] })), { vazio: 'Nenhuma nota esperando.' });
    tabela('Retenções', 'Retenções da competência', [{ t: 'Imposto', w: 22 }, { t: 'Retido pela empresa (a recolher)', w: 30, m: 1 }, { t: 'Retido pelos clientes', w: 26, m: 1 }],
      RET.map(([k, n]) => ({ v: [n, reais(R.ret.pagar[k]), reais(R.ret.receber[k])] })));
    tabela('Pagamentos', 'Pagamentos do mês', [{ t: 'Data', w: 12, d: 1 }, { t: 'A pagar/receber', w: 15 }, { t: 'Empresa', w: 30 }, { t: 'Nota', w: 10 }, { t: 'Líquido', w: 16, m: 1 }, { t: 'Confirmado por', w: 22 }, { t: 'Comprovante', w: 18 }, { t: 'Recebimento confirmado', w: 20 }],
      R.pagos.map(p => ({ v: [dataTxt(p.data), p.lado, p.empresa, p.numero, reais(p.liquido), p.quem, p.comprovante ? 'Sim (no Conectwork)' : 'Não', p.baixado ? 'Sim' : 'Não'] })), { vazio: 'Nenhum pagamento confirmado neste mês.' });
    tabela('Em aberto', 'Em aberto (todos os meses)', [{ t: 'Vencimento', w: 12, d: 1 }, { t: 'Vencido', w: 9, d: 1 }, { t: 'A pagar/receber', w: 15 }, { t: 'Empresa', w: 30 }, { t: 'Período', w: 30 }, { t: 'Nota', w: 10 }, { t: 'Líquido', w: 16, m: 1 }, { t: 'Situação', w: 20 }],
      R.abertos.map(a => ({ v: [dataTxt(a.vencimento), a.vencido ? 'Sim' : 'Não', a.lado, a.empresa, a.periodo, a.numero, reais(a.liquido), a.situacao], cor: a.vencido ? hex(VERM) : null })), { vazio: 'Nada em aberto.' });
    tabela('Medições', 'Medições da competência', [{ t: 'Período', w: 30 }, { t: 'Lado', w: 14 }, { t: 'Empresa', w: 30 }, { t: 'Profissionais', w: 13, n: 1, soma: 1 }, { t: 'Valor', w: 16, m: 1 }, { t: 'Situação', w: 22 }],
      R.medicoes.map(m => ({ v: [m.periodo, m.lado, m.empresa, m.profissionais, reais(m.valor), m.situacao] })), { vazio: 'Nenhuma medição desta competência.' });
    tabela('Por empresa', 'Por empresa', [{ t: 'Empresa', w: 32 }, { t: 'Notas a receber', w: 16, m: 1 }, { t: 'Recebido no mês', w: 16, m: 1 }, { t: 'Em aberto a receber', w: 18, m: 1 }, { t: 'Notas a pagar', w: 16, m: 1 }, { t: 'Pago no mês', w: 16, m: 1 }, { t: 'Em aberto a pagar', w: 18, m: 1 }],
      R.porEmpresa.map(x => ({ v: [x.empresa, reais(x.notasReceber), reais(x.recebido), reais(x.abertoReceber), reais(x.notasPagar), reais(x.pago), reais(x.abertoPagar)] })), { vazio: 'Nenhuma empresa neste mês.' });
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })), a = document.createElement('a');
    a.href = url; a.download = nomeArq(R, 'xlsx'); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    U().toast('Planilha baixada.');
  }
  /* planilha simples (SheetJS), se o ExcelJS não carregar */
  async function excelSimples(R) {
    await carregaScript(CDN.xlsx, () => !!window.XLSX);
    const X = window.XLSX, wb = X.utils.book_new();
    const aba = (nome, linhas, larg) => { const ws = X.utils.aoa_to_sheet(linhas); if (larg) ws['!cols'] = larg.map(w => ({ wch: w })); X.utils.book_append_sheet(wb, ws, nome); };
    aba('Resumo', [['Relatório Conectwork', R.empresa], ['Competência', mesTxt(R.mes)], [], ['Item', 'Valor (R$)', mesTxt(R.mesAnterior) + ' (R$)'], ...cartoes(R).map(([t, v, a]) => [t, reais(v), a == null ? '' : reais(a)]), [], ['Últimos 6 meses', 'Recebido (R$)', 'Pago (R$)'], ...R.hist.map(h => [mesTxt(h.mes), reais(h.recebido), reais(h.pago)])], [40, 18, 18]);
    aba('Notas', [['A pagar/receber', 'Empresa', 'Período', 'Nº da nota', 'Chave de acesso', 'Valor (R$)', ...RET.map(([, n]) => n + ' (R$)'), 'Líquido (R$)', 'Situação da nota', 'Pagamento'],
      ...R.notas.map(n => [n.lado, n.empresa, n.periodo, n.numero, n.chave, reais(n.valor), ...n.r.map(reais), reais(n.liquido), n.situacao, n.titulo])], [14, 28, 30, 10, 52, 14, 12, 12, 12, 16, 14, 18, 18]);
    aba('Esperando a nota', [['A pagar/receber', 'Empresa', 'Período', 'Valor (R$)'], ...R.semNota.map(x => [x.lado, x.empresa, x.periodo, reais(x.valor)])], [14, 28, 30, 14]);
    aba('Retenções', [['Imposto', 'Retido pela empresa (a recolher, R$)', 'Retido pelos clientes (R$)'], ...RET.map(([k, n]) => [n, reais(R.ret.pagar[k]), reais(R.ret.receber[k])])], [20, 34, 28]);
    aba('Pagamentos', [['Data', 'A pagar/receber', 'Empresa', 'Nota', 'Líquido (R$)', 'Confirmado por', 'Comprovante', 'Recebimento confirmado'],
      ...R.pagos.map(p => [dataTxt(p.data), p.lado, p.empresa, p.numero, reais(p.liquido), p.quem, p.comprovante ? 'Sim (no Conectwork)' : 'Não', p.baixado ? 'Sim' : 'Não'])], [12, 14, 28, 10, 14, 22, 20, 22]);
    aba('Em aberto', [['Vencimento', 'Vencido', 'A pagar/receber', 'Empresa', 'Período', 'Nota', 'Líquido (R$)', 'Situação'],
      ...R.abertos.map(a => [dataTxt(a.vencimento), a.vencido ? 'Sim' : 'Não', a.lado, a.empresa, a.periodo, a.numero, reais(a.liquido), a.situacao])], [12, 9, 14, 28, 30, 10, 14, 20]);
    aba('Medições', [['Período', 'Lado', 'Empresa', 'Profissionais', 'Valor (R$)', 'Situação'], ...R.medicoes.map(m => [m.periodo, m.lado, m.empresa, m.profissionais, reais(m.valor), m.situacao])], [30, 14, 28, 12, 14, 22]);
    aba('Por empresa', [['Empresa', 'Notas a receber (R$)', 'Recebido (R$)', 'Em aberto a receber (R$)', 'Notas a pagar (R$)', 'Pago (R$)', 'Em aberto a pagar (R$)'],
      ...R.porEmpresa.map(x => [x.empresa, reais(x.notasReceber), reais(x.recebido), reais(x.abertoReceber), reais(x.notasPagar), reais(x.pago), reais(x.abertoPagar)])], [30, 18, 14, 20, 18, 14, 20]);
    X.writeFile(wb, nomeArq(R, 'xlsx'));
    U().toast('Planilha baixada.');
  }

  /* ---------- PDF ---------- */
  async function pdf(R) {
    await carregaScript(CDN.jspdf, () => !!(window.jspdf && window.jspdf.jsPDF));
    await carregaScript(CDN.auto, () => !!(window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable));
    const [logo, lemp] = await Promise.all([logoPng(), logoEmpresa(R)]);
    const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }), W = 297, M = 12;
    const cor = (f, c) => doc[f](c[0], c[1], c[2]);
    const tituloPagina = () => {
      cor('setFillColor', NAVY); doc.rect(0, 0, W, 30, 'F'); cor('setFillColor', AZUL); doc.rect(0, 30, W, 1.2, 'F');
      if (logo) { try { doc.addImage(logo, 'PNG', M, 6, 18, 18); } catch (e) { /* sem a marca */ } }
      doc.setTextColor(255, 255, 255); doc.setFont(undefined, 'bold'); doc.setFontSize(17); doc.text('Relatório do mês', M + 23, 14);
      doc.setFont(undefined, 'normal'); doc.setFontSize(10); doc.setTextColor(200, 213, 243); doc.text(`${R.empresa}${R.cnpj ? '  ·  CNPJ ' + cnpjTxt(R.cnpj) : ''}`, M + 23, 21);
      doc.setFontSize(8.5); doc.setTextColor(143, 163, 204); doc.text(`Gerado em ${agoraTxt()}${R.quem ? ' por ' + R.quem : ''}`, M + 23, 26);
      /* a logo da empresa num quadradinho com a cor de fundo dela, à direita, ao lado da competência */
      const dx = lemp ? 30 : 0;
      if (lemp) { try { const hx = String(lemp.fundo || '#FFFFFF').replace('#', ''), rgb = hx.length === 6 ? [0, 2, 4].map(i => parseInt(hx.slice(i, i + 2), 16)) : [255, 255, 255];
        doc.setFillColor(rgb[0], rgb[1], rgb[2]); doc.roundedRect(W - M - 22, 4, 22, 22, 3, 3, 'F'); doc.addImage(lemp.url, lemp.tipo.toUpperCase(), W - M - 21, 5, 20, 20); } catch (e) { /* sem a logo */ } }
      doc.setFontSize(8.5); doc.setTextColor(143, 163, 204); doc.text('COMPETÊNCIA', W - M - dx, 11, { align: 'right' });
      doc.setFont(undefined, 'bold'); doc.setFontSize(16); doc.setTextColor(255, 255, 255); doc.text(mesTxt(R.mes), W - M - dx, 20, { align: 'right' }); doc.setFont(undefined, 'normal');
    };
    tituloPagina();
    let y = 39;
    /* os números do mês em cartões, com o mês anterior */
    const cs = cartoes(R), cw = (W - 2 * M - 2 * 6) / 3, ch = 19;
    cs.forEach(([t, v, a, c], i) => { const x = M + (i % 3) * (cw + 6), yy = y + Math.floor(i / 3) * (ch + 5);
      doc.setFillColor(244, 247, 252); doc.roundedRect(x, yy, cw, ch, 2.5, 2.5, 'F'); cor('setFillColor', c); doc.rect(x, yy + 3, 1.4, ch - 6, 'F');
      doc.setFontSize(8.2); cor('setTextColor', CINZA); doc.text(t.toUpperCase(), x + 5, yy + 6);
      doc.setFont(undefined, 'bold'); doc.setFontSize(14); doc.setTextColor(v < 0 ? 200 : 15, v < 0 ? 40 : 23, v < 0 ? 40 : 42); doc.text(brl(v), x + 5, yy + 14); doc.setFont(undefined, 'normal');
      if (a != null) { const vr = variacao(v, a); doc.setFontSize(7.8); cor('setTextColor', CINZA); doc.text(`${mesTxt(R.mesAnterior)}: ${brl(a)}${vr ? '  (' + vr + ')' : ''}`, x + cw - 4, yy + 14, { align: 'right' }); } });
    y += 3 * (ch + 5) + 4;
    /* gráfico dos últimos 6 meses e o total por empresa, lado a lado */
    const gx = M, gw = 150, gh = 62, gy = y;
    doc.setFillColor(255, 255, 255); doc.setDrawColor(227, 232, 242); doc.roundedRect(gx, gy, gw, gh, 2.5, 2.5, 'S');
    doc.setFont(undefined, 'bold'); doc.setFontSize(10); cor('setTextColor', NAVY); doc.text('Últimos 6 meses · recebido x pago', gx + 5, gy + 7); doc.setFont(undefined, 'normal');
    cor('setFillColor', AZUL); doc.rect(gx + gw - 52, gy + 4, 3, 3, 'F'); doc.setFontSize(7.5); cor('setTextColor', CINZA); doc.text('Recebido', gx + gw - 48, gy + 6.6);
    cor('setFillColor', LARANJA); doc.rect(gx + gw - 26, gy + 4, 3, 3, 'F'); doc.text('Pago', gx + gw - 22, gy + 6.6);
    const max = Math.max(1, ...R.hist.map(h => Math.max(h.recebido, h.pago))), bx0 = gx + 8, by0 = gy + gh - 9, bh = gh - 22, slot = (gw - 16) / R.hist.length;
    doc.setDrawColor(227, 232, 242); [0, 0.5, 1].forEach(f => doc.line(bx0, by0 - bh * f, gx + gw - 6, by0 - bh * f));
    doc.setFontSize(6.8); cor('setTextColor', CINZA); doc.text(brl(max), bx0, by0 - bh - 1.5); doc.text(brl(max / 2), bx0, by0 - bh / 2 - 1.5);
    /* o valor em cima de cada barra do mês do relatório */
    const hm = R.hist[R.hist.length - 1];
    R.hist.forEach((h, i) => { const sx = bx0 + i * slot + slot * 0.2, bw = slot * 0.28;
      [[h.recebido, AZUL], [h.pago, LARANJA]].forEach(([v, c], k) => { const hh = Math.max(v ? 0.6 : 0, bh * v / max); cor('setFillColor', c); if (hh) doc.rect(sx + k * (bw + 1), by0 - hh, bw, hh, 'F'); });
      if (h === hm) { doc.setFontSize(6.8); [[h.recebido, 0], [h.pago, 1]].forEach(([v, k]) => { if (v) { cor('setTextColor', k ? LARANJA : AZUL); doc.text(brl(v), sx + k * (bw + 1) + bw / 2, by0 - Math.max(0.6, bh * v / max) - 1.2, { align: 'center' }); } }); }
      doc.setFontSize(7.5); if (h.mes === R.mes) { doc.setFont(undefined, 'bold'); cor('setTextColor', NAVY); } else cor('setTextColor', CINZA); doc.text(mesCurto(h.mes), sx + bw, by0 + 5, { align: 'center' }); doc.setFont(undefined, 'normal'); });
    const px = gx + gw + 6, pw = W - M - px;
    doc.roundedRect(px, gy, pw, gh, 2.5, 2.5, 'S');
    doc.setFont(undefined, 'bold'); doc.setFontSize(10); cor('setTextColor', NAVY); doc.text('Maiores movimentos por empresa', px + 5, gy + 7); doc.setFont(undefined, 'normal');
    const top = R.porEmpresa.slice(0, 6), tmax = Math.max(1, ...top.map(x => x.notasPagar + x.notasReceber + x.pago + x.recebido));
    if (!top.length) { doc.setFontSize(9); cor('setTextColor', CINZA); doc.text('Nenhum movimento neste mês.', px + 5, gy + 18); }
    top.forEach((x, i) => { const yy = gy + 15 + i * 7.5, tot = x.notasPagar + x.notasReceber + x.pago + x.recebido, bw2 = (pw - 78) * tot / tmax;
      doc.setFontSize(8); doc.setTextColor(30, 40, 60); doc.text(doc.splitTextToSize(x.empresa, 40)[0], px + 5, yy + 2.5);
      doc.setFillColor(226, 233, 250); doc.rect(px + 46, yy, pw - 78, 3.4, 'F'); cor('setFillColor', AZUL); if (bw2) doc.rect(px + 46, yy, Math.max(0.6, bw2), 3.4, 'F');
      doc.setFontSize(7.5); cor('setTextColor', CINZA); doc.text(brl(tot), W - M - 4, yy + 2.6, { align: 'right' }); });
    y = gy + gh + 8;

    /* partes do relatório: título com a quantidade, tabela zebrada e o total no fim */
    const secao = (t, n) => { if (y > 172) { doc.addPage(); y = 16; } cor('setFillColor', NAVY); doc.rect(M, y - 4.4, 1.4, 6, 'F');
      doc.setFont(undefined, 'bold'); doc.setFontSize(11.5); cor('setTextColor', NAVY); doc.text(t, M + 4, y); const tw = doc.getTextWidth ? doc.getTextWidth(t) : t.length * 2.4; doc.setFont(undefined, 'normal');
      if (n != null) { doc.setFontSize(8); cor('setTextColor', CINZA); doc.text(`${n} ${n === 1 ? 'item' : 'itens'}`, M + 7 + tw, y); }
      y += 3; };
    const tabela = (head, body, opc) => { opc = opc || {};
      doc.autoTable({ startY: y, head: [head], body: body.length ? body : [[{ content: opc.vazio || 'Nada neste mês.', colSpan: head.length, styles: { fontStyle: 'italic', textColor: CINZA } }]],
        foot: body.length && opc.total ? [opc.total] : undefined, showFoot: 'lastPage',
        headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 8.3, cellPadding: 2.2 }, footStyles: { fillColor: [230, 236, 248], textColor: NAVY, fontStyle: 'bold', fontSize: 8.5 },
        styles: { fontSize: 8.3, cellPadding: 2, lineColor: [227, 232, 242], lineWidth: { bottom: 0.2 }, textColor: [30, 40, 60] }, alternateRowStyles: { fillColor: [246, 248, 252] },
        margin: { left: M, right: M, top: 16 }, columnStyles: opc.colunas || {},
        didParseCell: d => { const cs = (opc.colunas || {})[d.column.index]; if ((d.section === 'foot' || d.section === 'head') && cs && cs.halign) d.cell.styles.halign = cs.halign;
          if (d.section === 'body' && opc.vermelho && opc.vermelho(d.row.index)) d.cell.styles.textColor = VERM; } });
      y = doc.lastAutoTable.finalY + 10; };
    const dir = (...is) => Object.fromEntries(is.map(i => [i, { halign: 'right' }]));
    const soma = (xs, f) => xs.reduce((s, x) => s + (f(x) || 0), 0);
    secao('Notas fiscais da competência', R.notas.length);
    tabela(['Empresa', 'A pagar/receber', 'Período', 'Nº', 'Valor', ...RET.map(([, n]) => n), 'Líquido', 'Situação'],
      R.notas.map(n => [n.empresa, n.lado, n.periodo, n.numero || '—', brl(n.valor), ...n.r.map(v => v ? brl(v) : '—'), brl(n.liquido), n.situacao + (n.titulo ? ' · ' + n.titulo : '')]),
      { colunas: Object.assign(dir(4, 5, 6, 7, 8, 9), { 0: { cellWidth: 34 }, 1: { cellWidth: 23 }, 2: { cellWidth: 36 }, 3: { cellWidth: 10 }, 4: { halign: 'right', cellWidth: 23 }, 5: { halign: 'right', cellWidth: 18 }, 6: { halign: 'right', cellWidth: 18 }, 7: { halign: 'right', cellWidth: 18 }, 8: { halign: 'right', cellWidth: 27 }, 9: { halign: 'right', cellWidth: 23 } }), vazio: 'Nenhuma nota fiscal desta competência.', total: ['Total', '', '', '', brl(soma(R.notas, n => n.valor)), ...RET.map((_, k) => brl(soma(R.notas, n => n.r[k]))), brl(soma(R.notas, n => n.liquido)), ''] });
    if (R.semNota.length) { secao('Esperando a nota fiscal', R.semNota.length); tabela(['Empresa', 'A pagar/receber', 'Período', 'Valor'], R.semNota.map(x => [x.empresa, x.lado, x.periodo, brl(x.valor)]), { colunas: dir(3), total: ['Total', '', '', brl(soma(R.semNota, x => x.valor))] }); }
    secao('Retenções da competência');
    tabela(['Imposto', 'Retido pela empresa (a recolher)', 'Retido pelos clientes'], RET.map(([k, n]) => [n, brl(R.ret.pagar[k]), brl(R.ret.receber[k])]),
      { colunas: dir(1, 2), total: ['Total', brl(soma(RET, ([k]) => R.ret.pagar[k])), brl(soma(RET, ([k]) => R.ret.receber[k]))] });
    secao('Pagamentos do mês', R.pagos.length);
    tabela(['Data', 'Empresa', 'A pagar/receber', 'Nota', 'Líquido', 'Confirmado por', 'Comprovante'], R.pagos.map(p => [dataTxt(p.data), p.empresa, p.lado + (p.baixado ? ' · recebimento confirmado' : ''), p.numero || '—', brl(p.liquido), p.quem, p.comprovante ? 'no Conectwork' : '—']),
      { colunas: dir(4), vazio: 'Nenhum pagamento confirmado neste mês.', total: ['Total', '', '', '', brl(soma(R.pagos, p => p.liquido)), '', ''] });
    secao('Em aberto (todos os meses)', R.abertos.length);
    tabela(['Vencimento', 'Empresa', 'A pagar/receber', 'Período', 'Nota', 'Líquido', 'Situação'], R.abertos.map(a => [dataTxt(a.vencimento) + (a.vencido ? ' (vencido)' : ''), a.empresa, a.lado, a.periodo, a.numero || '—', brl(a.liquido), a.situacao]),
      { colunas: dir(5), vazio: 'Nada em aberto.', vermelho: i => R.abertos[i] && R.abertos[i].vencido, total: ['Total', '', '', '', '', brl(soma(R.abertos, a => a.liquido)), ''] });
    secao('Medições da competência', R.medicoes.length);
    tabela(['Período', 'Empresa', 'Lado', 'Profissionais', 'Valor', 'Situação'], R.medicoes.map(m => [m.periodo, m.empresa, m.lado, String(m.profissionais), brl(m.valor), m.situacao]),
      { colunas: dir(3, 4), vazio: 'Nenhuma medição desta competência.', total: ['Total', '', '', String(soma(R.medicoes, m => m.profissionais)), brl(soma(R.medicoes, m => m.valor)), ''] });
    secao('Por empresa', R.porEmpresa.length);
    tabela(['Empresa', 'Notas a receber', 'Recebido', 'Em aberto a receber', 'Notas a pagar', 'Pago', 'Em aberto a pagar'],
      R.porEmpresa.map(x => [x.empresa, brl(x.notasReceber), brl(x.recebido), brl(x.abertoReceber), brl(x.notasPagar), brl(x.pago), brl(x.abertoPagar)]),
      { colunas: dir(1, 2, 3, 4, 5, 6), vazio: 'Nenhuma empresa neste mês.', total: ['Total', ...['notasReceber', 'recebido', 'abertoReceber', 'notasPagar', 'pago', 'abertoPagar'].map(k => brl(soma(R.porEmpresa, x => x[k])))] });
    doc.setFontSize(8); cor('setTextColor', CINZA);
    doc.text(doc.splitTextToSize('Notas e medições pela competência (mês do serviço); pagamentos pela data do pagamento. O dinheiro não passa pelo Conectwork: sai de quem contrata direto para quem presta. Retenções informadas à mão em cada espelho; as guias de recolhimento são com o seu contador.', W - 2 * M), M, Math.min(y, 196));
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setDrawColor(227, 232, 242); doc.line(M, 201, W - M, 201); doc.setFontSize(7.8); cor('setTextColor', CINZA);
      doc.text(`Conectwork · Relatório do mês · ${R.empresa} · ${mesTxt(R.mes)}`, M, 205.5); doc.text(`Página ${i} de ${n}`, W - M, 205.5, { align: 'right' }); }
    doc.save(nomeArq(R, 'pdf'));
    U().toast('PDF baixado.');
  }

  CW.registrarModulo({
    id: 'relatorios', nome: 'Relatórios', icone: 'chart', ordem: 60,
    para: ['empresa'], contrato: ['cobrancas', 'contratos'],
    telas: { mes: { nome: 'Relatório do mês', sub: 'Notas, retenções, pagamentos, em aberto e medições do mês, para o financeiro e o contador. Baixe em Excel ou PDF.', render } }
  });
  CW.relatorios = { montar, carregar };
})();
