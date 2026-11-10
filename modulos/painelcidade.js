/* Conectwork · Painel da cidade (10/11/2026, piloto com a Prefeitura de Gravataí). Só a equipe Conectwork (master).
   Junta, por cidade e mês, os números dos MEIs que usam o Conectwork, sem identificar ninguém (LGPD):
   - MEIs no Conectwork e novos no mês; por ramo (grupos com menos de 5 MEIs vão para "Outros").
   - Selo "Prestador em dia" (nenhum DAS vencido e nenhuma declaração anual atrasada, CW.meuDas.situacaoEm), DAS vencidos,
     DAS pagos no mês e atrasados regularizados, declaração anual entregue, notas fiscais enviadas pelo Conectwork e na rede.
   - O DAS e a declaração são o que o MEI marcou no app (o Conectwork ainda não consulta a Receita): o relatório avisa.
   - PDF para mandar à Prefeitura (só números juntados). Nada é gravado, só o histórico de quem baixou. */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const MINIMO = 5;   /* grupos menores que isso não aparecem separados (não dá para identificar ninguém) */
  const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const ms = v => !v ? 0 : typeof v.toMillis === 'function' ? v.toMillis() : v.seconds ? v.seconds * 1000 : (Date.parse(v) || 0);
  const mesTxt = m => { const t = MESES[+m.slice(5, 7) - 1]; return t[0].toUpperCase() + t.slice(1) + ' de ' + m.slice(0, 4); };
  const fimMes = m => { const d = new Date(+m.slice(0, 4), +m.slice(5, 7), 0); return iso(d); };
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const F = { cidade: 'Gravataí', mes: iso(new Date()).slice(0, 7) };
  let base = null;   /* { meis:[{id,cidade,uf,criado,inicio,ramo,status,fiscal}], esp:[...] } carregado uma vez por abertura */

  async function carregar() {
    const db = CW.fb.db(), L = s => CW.fb.lista(s);
    const emps = L(await db.collection('empresas').get()).filter(e => e.tipo === 'prestador');
    const meis = [];
    await Promise.all(emps.map(async e => {
      let pv = {}; try { pv = CW.fb.dados(await db.doc('empresas/' + e._id + '/privado/cadastro').get()) || {}; } catch (x) {}
      const d = pv.dados || {}; if (!String(d.porte || '').startsWith('MEI')) return;
      let fi = null; try { fi = CW.fb.dados(await db.doc('fiscal/' + e._id).get()); } catch (x) {}
      const criado = ms(e.criadoEm) ? iso(new Date(ms(e.criadoEm))) : '';
      meis.push({ id: e._id, cidade: e.cidade || (pv.end || {}).cidade || '', uf: e.uf || (pv.end || {}).uf || '', criado, status: e.status,
        inicio: d.abertura ? String(d.abertura).slice(0, 7) : (criado ? criado.slice(0, 7) : ''), ramo: d.segmento || 'Não informado', fiscal: fi || { das: {}, dasn: {} } });
    }));
    let esp = []; try { esp = L(await db.collection('espelhos').get()).filter(x => x.nota && x.nota.enviadoEm); } catch (x) {}
    return { meis, esp };
  }

  /* os números de uma cidade num mês (situação no fim do mês, ou hoje se for o mês atual) */
  function calcular(B, cidade, mes) {
    const hoje = iso(new Date()), ref = fimMes(mes) < hoje ? fimMes(mes) : hoje, c = norm(cidade);
    const xs = B.meis.filter(x => norm(x.cidade) === c && x.criado && x.criado <= ref);
    const ids = new Set(xs.map(x => x.id)), r = { cidade, mes, ref, total: xs.length, novos: 0, emDia: 0, comVenc: 0, dasVenc: 0, dasPagos: 0, regular: 0, dasnPrec: 0, dasnEnt: 0, naRede: 0, notas: 0, notasVal: 0, ramos: [] };
    const porRamo = {};
    xs.forEach(x => {
      if (x.criado.slice(0, 7) === mes) r.novos++;
      if (x.status === 'aprovado') r.naRede++;
      porRamo[x.ramo] = (porRamo[x.ramo] || 0) + 1;
      const s = CW.meuDas.situacaoEm(x.fiscal, x.inicio || mes, ref);
      if (s.emDia) r.emDia++; if (s.venc.length) { r.comVenc++; r.dasVenc += s.venc.length; }
      if (s.dasn.precisa) { r.dasnPrec++; if (s.dasn.entregue) r.dasnEnt++; }
      Object.entries(x.fiscal.das || {}).forEach(([m, p]) => { if (p && p.pago && p.data && p.data.slice(0, 7) === mes) { r.dasPagos++; if (CW.negocio.vencDas(m) < p.data) r.regular++; } });
    });
    B.esp.forEach(e => { if (ids.has(e.prestadorId) && iso(new Date(ms(e.nota.enviadoEm))).slice(0, 7) === mes) { r.notas++; r.notasVal += e.valorCentavos || 0; } });
    let outros = 0; Object.entries(porRamo).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => { if (n >= MINIMO && k !== 'Não informado') r.ramos.push([k, n]); else outros += n; });
    if (outros) r.ramos.push(['Outros (grupos com menos de ' + MINIMO + ')', outros]);
    return r;
  }

  function cidades(B) { const v = {}; B.meis.forEach(x => { if (x.cidade) v[norm(x.cidade)] = v[norm(x.cidade)] || x.cidade; }); if (!v[norm('Gravataí')]) v[norm('Gravataí')] = 'Gravataí'; return Object.values(v).sort((a, b) => a.localeCompare(b, 'pt-BR')); }
  function meses() { const out = [], d = new Date(); d.setDate(1); for (let i = 0; i < 12; i++) { out.push(iso(d).slice(0, 7)); d.setMonth(d.getMonth() - 1); } return out; }

  async function tela(el, ctx) {
    const { esc, ic } = U();
    document.getElementById('acoes').innerHTML = '';
    if (!base) {
      el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Juntando os números dos MEIs…</span></div></div>`;
      try { base = await carregar(); } catch (e) { el.innerHTML = `<div class="banner danger">${ic('alert')}<span><strong>Não deu para juntar os números.</strong>${esc(CW.fb.mensagemErro(e))}</span></div>`; return; }
    }
    const r = calcular(base, F.cidade, F.mes), brl = c => U().formatarDinheiro(c);
    const poucos = r.total > 0 && r.total < MINIMO;
    const n = (id, rot, v, sub) => `<div class="pc-n" id="${id}"><small>${esc(rot)}</small><b>${esc(String(v))}</b><span>${esc(sub || '')}</span></div>`;
    const maxR = Math.max(1, ...r.ramos.map(x => x[1]));
    el.innerHTML = `
      <section class="card" style="margin-bottom:22px"><div class="card-b pc-filtros">
        <label class="f"><span>Cidade</span><select id="pc-cidade">${cidades(base).map(c => `<option ${norm(c) === norm(F.cidade) ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label class="f"><span>Mês</span><select id="pc-mes">${meses().map(m => `<option value="${m}" ${m === F.mes ? 'selected' : ''}>${esc(mesTxt(m))}</option>`).join('')}</select></label>
        <button class="btn sec" id="pc-atualizar">${ic('swap')}Atualizar números</button>
        <button class="btn" id="pc-pdf" ${r.total ? '' : 'disabled'}>${ic('file')}Baixar o relatório (PDF)</button></div></section>
      ${!r.total ? `<div class="card"><div class="empty" id="pc-vazio"><div class="ic">${ic('building')}</div><strong>Nenhum MEI de ${esc(F.cidade)} no Conectwork até ${esc(mesTxt(F.mes).toLowerCase())}.</strong><span>Os números aparecem quando os MEIs da cidade entrarem pelo "Sou MEI".</span></div></div>` : `
      ${poucos ? `<div class="banner warn" id="pc-poucos" style="margin-bottom:16px">${ic('shield')}<span><strong>Menos de ${MINIMO} MEIs nesta cidade</strong>Com tão poucos, os números podem identificar alguém. Não mande este relatório para fora ainda.</span></div>` : ''}
      <div class="pc-grade" id="pc-nums">
        ${n('pc-total', 'MEIs no Conectwork', r.total, r.novos ? `+${r.novos} no mês` : 'nenhum novo no mês')}
        ${n('pc-selo', 'Prestadores em dia (selo)', pct(r.emDia, r.total) + '%', `${r.emDia} de ${r.total}`)}
        ${n('pc-venc', 'Com DAS vencido', r.comVenc, r.dasVenc ? `${r.dasVenc} guias vencidas no total` : 'nenhuma guia vencida')}
        ${n('pc-pagos', 'DAS pagos no mês', r.dasPagos, r.regular ? (r.regular === 1 ? '1 estava atrasado (regularizado)' : `${r.regular} estavam atrasados (regularizados)`) : 'nenhum atrasado regularizado')}
        ${n('pc-dasn', 'Declaração anual entregue', r.dasnPrec ? pct(r.dasnEnt, r.dasnPrec) + '%' : '—', r.dasnPrec ? `${r.dasnEnt} de ${r.dasnPrec} que precisavam` : 'ninguém precisava ainda')}
        ${n('pc-notas', 'Notas fiscais pelo Conectwork', r.notas, r.notas ? brl(r.notasVal) + ' no mês' : 'nenhuma no mês')}
        ${n('pc-rede', 'Recebendo pedidos na rede', r.naRede, 'cadastro completo e aprovado')}
      </div>
      <section class="card" style="margin-top:22px" id="pc-ramos"><div class="card-h"><span class="ic">${ic('chart')}</span><h3>MEIs por ramo</h3></div><div class="card-b">
        ${r.ramos.map(([k, v]) => `<div class="pc-bar"><span>${esc(k)}</span><i style="width:${Math.round(v / maxR * 100)}%"></i><span class="r">${v}</span></div>`).join('')}</div></section>
      <p class="hint" style="margin:14px 0 0;font-size:12.5px" id="pc-nota">Situação em ${esc(r.ref.split('-').reverse().join('/'))}. Números juntados, sem nome nem CNPJ (LGPD); ramos com menos de ${MINIMO} MEIs ficam em "Outros". DAS e declaração são o que cada MEI marcou no Conectwork: ainda não há consulta à Receita.</p>`}`;
    const g = id => document.getElementById(id);
    g('pc-cidade').onchange = () => { F.cidade = g('pc-cidade').value; tela(el, ctx); };
    g('pc-mes').onchange = () => { F.mes = g('pc-mes').value; tela(el, ctx); };
    g('pc-atualizar').onclick = () => { base = null; tela(el, ctx); };
    g('pc-pdf').onclick = () => pdf(ctx, r);
  }

  function carregaScript(src, ok) {
    if (ok()) return Promise.resolve();
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = () => ok() ? res() : rej(new Error('Biblioteca não carregou.')); s.onerror = () => rej(new Error('Não foi possível baixar a ferramenta do relatório. Confira a internet e tente de novo.')); document.head.appendChild(s); });
  }
  async function pdf(ctx, r) {
    try {
      await carregaScript(JSPDF, () => !!(window.jspdf && window.jspdf.jsPDF));
      const doc = new window.jspdf.jsPDF(), brl = c => U().formatarDinheiro(c);
      let y = 20; const linha = (t, tam, b) => { doc.setFont('helvetica', b ? 'bold' : 'normal'); doc.setFontSize(tam || 11); doc.splitTextToSize(String(t), 180).forEach(l => { if (y > 280) { doc.addPage(); y = 20; } doc.text(l, 15, y); y += (tam || 11) * 0.5; }); y += 2; };
      linha(`Conectwork · MEIs de ${r.cidade}`, 16, true);
      linha(`${mesTxt(r.mes)} · situação em ${r.ref.split('-').reverse().join('/')}`, 11);
      y += 4;
      [['MEIs no Conectwork', `${r.total} (${r.novos} novos no mês)`],
       ['Prestadores em dia (selo)', `${pct(r.emDia, r.total)}% · ${r.emDia} de ${r.total}`],
       ['Com DAS vencido', `${r.comVenc} MEIs · ${r.dasVenc} guias`],
       ['DAS pagos no mês', `${r.dasPagos} (${r.regular} ${r.regular === 1 ? 'atrasado regularizado' : 'atrasados regularizados'})`],
       ['Declaração anual entregue', r.dasnPrec ? `${pct(r.dasnEnt, r.dasnPrec)}% · ${r.dasnEnt} de ${r.dasnPrec}` : 'ninguém precisava ainda'],
       ['Notas fiscais pelo Conectwork', `${r.notas} · ${brl(r.notasVal)}`],
       ['Recebendo pedidos na rede', String(r.naRede)]].forEach(([k, v]) => linha(`${k}: ${v}`, 12));
      y += 4; linha('MEIs por ramo', 13, true); r.ramos.forEach(([k, v]) => linha(`${k}: ${v}`, 11));
      y += 6; linha(`Números juntados, sem nome nem CNPJ (LGPD). Ramos com menos de ${MINIMO} MEIs aparecem em "Outros". DAS e declaração são informados pelos próprios MEIs no Conectwork; ainda não há consulta à Receita Federal.`, 9);
      linha('O Conectwork organiza a contratação e a gestão documental. A validade da relação depende da operação real, da legislação aplicável e da análise jurídica e contábil adequada.', 9);
      doc.save(`Conectwork-${norm(r.cidade).replace(/\s+/g, '-')}-${r.mes}.pdf`);
      const db = CW.fb.db(), b = db.batch();
      b.set(db.collection('log').doc(), { em: CW.fb.agora(), uid: ctx.sessao.usuario.uid, quem: (ctx.sessao.perfil && ctx.sessao.perfil.nome) || ctx.sessao.usuario.email, empresaId: 'master', acao: 'painel.cidade', texto: `Relatório dos MEIs de ${r.cidade} (${mesTxt(r.mes)}) baixado.`, ref: '' });
      b.commit().catch(() => {});
      U().toast('Relatório baixado.');
    } catch (e) { U().toast(e.message || 'Não foi possível montar o relatório.', 'erro'); }
  }

  CW.registrarModulo({
    id: 'painelcidade', nome: 'Painel da cidade', nomeCurto: 'Cidade', icone: 'chart', ordem: 13.5,
    para: ['master'],
    iniciar() { base = null; return () => { base = null; }; },
    telas: { ver: { nome: 'Painel da cidade', sub: 'Os MEIs de cada cidade no Conectwork, sem identificar ninguém: selo em dia, DAS, declaração e notas. Para o relatório da Prefeitura.', render: tela } }
  });
  CW.painelCidade = { calcular, carregar };
})();
