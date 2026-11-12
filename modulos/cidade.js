/* Conectwork · Na sua cidade (11/11/2026, piloto com a Prefeitura de Gravataí).
   Duas telas no mesmo arquivo:
   1) "Oportunidades da cidade" (módulo `cidadegestao`): a PREFEITURA entra com o próprio login. Ela é uma empresa parceira
      pré-cadastrada pela equipe Conectwork com o módulo contratado `cidade` (plano "Parceiro da cidade") e a cidade/UF.
      Publica cursos, eventos, licitações, crédito, avisos e serviços (oportunidades/{id}), vê quem se inscreveu e marca
      quem concluiu o curso (vira certificado no perfil do prestador). Não vê dado nenhum do MEI além da inscrição.
   2) "Na sua cidade" (módulo `nacidade`): o PRESTADOR (MEI ou empresa que presta serviço) vê o que a Prefeitura da cidade
      dele publicou. "Para você" liga a oferta ao momento: DAS vencido mostra a oficina de regularização, nota recusada
      mostra o curso de nota fiscal, e o ramo filtra as licitações. "Quero participar" grava inscricoes/{oportunidade_empresa}
      com a autorização (LGPD) de enviar nome do negócio, nome, e-mail e telefone à Prefeitura, só para aquela inscrição.
      Comprovante de recebimentos (PDF) para pedir crédito: o próprio prestador baixa e leva; o Conectwork não envia a ninguém.
   Nada se apaga (status 'encerrado' / 'cancelado') e toda mudança vai para o histórico. */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const VERSAO_TEXTO = '2026-11-11';
  const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  const TIPOS = {
    curso: { nome: 'Curso', plural: 'Cursos e eventos', ic: 'star', insc: true },
    evento: { nome: 'Evento', plural: 'Cursos e eventos', ic: 'clock', insc: true },
    licitacao: { nome: 'Licitação', plural: 'Licitações', ic: 'clipboard' },
    credito: { nome: 'Crédito', plural: 'Crédito', ic: 'bank' },
    aviso: { nome: 'Aviso', plural: 'Avisos', ic: 'send' },
    servico: { nome: 'Serviço', plural: 'Serviços', ic: 'building' }
  };
  const GATILHOS = { '': 'Ninguém em especial', das: 'Quem está com DAS vencido', dasn: 'Quem não entregou a declaração anual', nota: 'Quem teve uma nota recusada' };
  const GAT_TXT = { das: 'Você está com DAS vencido: isto pode ajudar a regularizar.', dasn: 'A sua declaração anual está pendente: isto pode ajudar.', nota: 'Uma nota sua foi recusada: isto ajuda a acertar a próxima.' };
  const ABAS = [['voce', 'Para você'], ['cursos', 'Cursos e eventos'], ['licitacao', 'Licitações'], ['credito', 'Crédito'], ['aviso', 'Avisos'], ['servico', 'Serviços']];
  const EDITA = ['admin', 'operacional'];
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const chave = (cidade, uf) => norm(cidade) && uf ? norm(cidade).replace(/[^a-z0-9]+/g, '-') + '-' + String(uf).toLowerCase() : '';
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hoje = () => iso(new Date());
  const dataBR = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
  const ms = v => !v ? 0 : typeof v.toMillis === 'function' ? v.toMillis() : v.seconds ? v.seconds * 1000 : (Date.parse(v) || 0);
  const quem = ctx => (ctx.sessao.perfil && ctx.sessao.perfil.nome) || ctx.sessao.usuario.email;
  const segmentos = () => (CW.cadastroMei && CW.cadastroMei.SEGMENTOS) || ['Serviços', 'Comércio', 'Outro'];
  const ehParceira = emp => ((emp || {}).modulos || []).includes('cidade');
  const noAr = o => o.status === 'publicado' && (!o.ate || o.ate >= hoje());
  const grava = (f, ok) => { const db = CW.fb.db(), b = db.batch(); f(b, db); return b.commit().then(() => { if (ok) U().toast(ok); return true; }).catch(e => { U().toast(CW.fb.mensagemErro(e), 'erro'); return false; }); };
  const log = (b, acao, texto, ref) => CW.log.logNoLote(b, acao, texto, ref);
  const quando = o => [o.data ? dataBR(o.data) : '', o.hora ? 'às ' + o.hora : '', o.local || ''].filter(Boolean).join(' · ');

  /* ================= 1) PREFEITURA: Oportunidades da cidade ================= */
  let G = { ops: null, insc: null, filtro: 'no-ar' };
  const podeG = ctx => !ctx.soLeitura && EDITA.includes((ctx.contexto.acesso || {}).cargo);
  const inscDe = id => (G.insc || []).filter(i => i.oportunidadeId === id && i.status !== 'cancelado');

  function gestao(el, ctx) {
    const { esc, ic } = U(), emp = ctx.contexto.empresa || {}, k = chave(emp.cidade, emp.uf);
    document.getElementById('acoes').innerHTML = podeG(ctx) && k ? `<button class="btn" id="cg-nova">${ic('plus')}Nova publicação</button>` : '';
    if (!k) { el.innerHTML = `<div class="banner warn" id="cg-sem-cidade">${ic('alert')}<span><strong>Falta a cidade desta parceira</strong>Peça para a equipe Conectwork informar a cidade e o estado no cadastro. Sem isso, as publicações não chegam aos prestadores.</span></div>`; return; }
    if (!G.ops) { el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Carregando as publicações…</span></div></div>`; return; }
    const xs = G.ops.slice().sort((a, b) => ms(b.criadoEm) - ms(a.criadoEm));
    const vivos = xs.filter(noAr), rasc = xs.filter(o => o.status === 'rascunho'), fora = xs.filter(o => o.status === 'encerrado' || (o.status === 'publicado' && !noAr(o)));
    const lista = G.filtro === 'rascunho' ? rasc : G.filtro === 'fora' ? fora : vivos;
    const totInsc = (G.insc || []).filter(i => i.status !== 'cancelado').length, conc = (G.insc || []).filter(i => i.concluiu).length;
    const n = (id, rot, v, sub) => `<div class="pc-n" id="${id}"><small>${esc(rot)}</small><b>${esc(String(v))}</b><span>${esc(sub || '')}</span></div>`;
    const item = o => { const t = TIPOS[o.tipo] || TIPOS.aviso, ni = inscDe(o._id).length;
      return `<div class="cd-it" data-op="${esc(o._id)}"><span class="cd-ic ${esc(o.tipo)}">${ic(t.ic)}</span><div class="cd-tx"><div class="cd-l1"><span class="pill info">${esc(t.nome)}</span>${o.status === 'rascunho' ? '<span class="pill warn">Rascunho</span>' : ''}${o.status === 'encerrado' ? '<span class="pill">Encerrada</span>' : ''}${o.gatilho ? `<span class="pill">${esc(GATILHOS[o.gatilho])}</span>` : ''}</div>
          <strong>${esc(o.titulo)}</strong>${quando(o) ? `<small>${esc(quando(o))}</small>` : ''}${o.texto ? `<p>${esc(o.texto)}</p>` : ''}
          <small class="hint">${(o.ramos || []).length ? 'Para: ' + esc(o.ramos.join(', ')) : 'Para todos os ramos'}${o.ate ? ' · aparece até ' + esc(dataBR(o.ate)) : ''}${o.vagas ? ' · ' + o.vagas + ' vagas' : ''} · por ${esc(o.criadoPorNome || '')}</small></div>
        <div class="cd-bts">${o.inscricao ? `<button class="btn sec sm" data-insc="${esc(o._id)}">${ic('users')}${ni} inscrito${ni === 1 ? '' : 's'}</button>` : ''}
          ${podeG(ctx) ? `<button class="btn sec sm" data-editar="${esc(o._id)}">${ic('edit')}Editar</button>${o.status === 'publicado' ? `<button class="btn sec sm" data-encerrar="${esc(o._id)}">Encerrar</button>` : `<button class="btn sec sm" data-publicar="${esc(o._id)}">Publicar</button>`}` : ''}</div></div>`; };
    el.innerHTML = `<div class="banner info" style="margin-bottom:18px" id="cg-cidade">${ic('building')}<span><strong>${esc(emp.cidade)} · ${esc(emp.uf)}</strong>O que você publicar aqui aparece em "Na sua cidade" para os prestadores de ${esc(emp.cidade)} que usam o Conectwork. Você só vê os dados de quem se inscrever numa publicação sua.</span></div>
      <div class="pc-grade" id="cg-nums" style="margin-bottom:22px">${n('cg-n-ar', 'No ar', vivos.length, rasc.length ? rasc.length + ' em rascunho' : 'nenhum rascunho')}${n('cg-n-insc', 'Inscrições', totInsc, 'em cursos e eventos')}${n('cg-n-conc', 'Concluíram', conc, 'com certificado no perfil')}${n('cg-n-fora', 'Encerradas', fora.length, 'ficam guardadas')}</div>
      <section class="card"><div class="card-h"><span class="ic">${ic('send')}</span><h3>Publicações</h3><div class="cd-seg" id="cg-filtro">${[['no-ar', 'No ar', vivos.length], ['rascunho', 'Rascunhos', rasc.length], ['fora', 'Encerradas', fora.length]].map(([v, t, q]) => `<button data-f="${v}" aria-pressed="${G.filtro === v}">${t} <i>${q}</i></button>`).join('')}</div></div>
        <div class="card-b stack" style="gap:10px" id="cg-lista">${lista.length ? lista.map(item).join('') : `<div class="empty" id="cg-vazio"><div class="ic">${ic('send')}</div><strong>${G.filtro === 'no-ar' ? 'Nada no ar ainda' : 'Nada aqui'}</strong><span>${G.filtro === 'no-ar' ? 'Comece pela agenda de cursos, um aviso de prazo ou uma licitação aberta.' : ''}</span></div>`}</div></section>`;
    const nv = document.getElementById('cg-nova'); if (nv) nv.onclick = () => formulario(ctx, null);
    el.querySelectorAll('#cg-filtro [data-f]').forEach(b => b.onclick = () => { G.filtro = b.dataset.f; gestao(el, ctx); });
    el.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => formulario(ctx, G.ops.find(o => o._id === b.dataset.editar)));
    el.querySelectorAll('[data-insc]').forEach(b => b.onclick = () => CW.ir('cidadegestao/inscritos/' + b.dataset.insc));
    const muda = (id, status, acao, txt, msg) => { const o = G.ops.find(x => x._id === id); if (!o) return;
      grava((b, db) => { b.update(db.doc('oportunidades/' + id), { status, atualizadoEm: CW.fb.agora() }); log(b, acao, `${(TIPOS[o.tipo] || {}).nome || 'Publicação'} "${o.titulo}" ${txt}.`, id); }, msg); };
    el.querySelectorAll('[data-encerrar]').forEach(b => b.onclick = async () => { if (await U().confirmar('Encerrar a publicação?', 'Ela sai de "Na sua cidade". As inscrições e os certificados continuam guardados.', 'Encerrar')) muda(b.dataset.encerrar, 'encerrado', 'cidade.encerrar', 'encerrada', 'Publicação encerrada.'); });
    el.querySelectorAll('[data-publicar]').forEach(b => b.onclick = () => muda(b.dataset.publicar, 'publicado', 'cidade.publicar', 'publicada', 'Publicada. Já aparece para os prestadores da cidade.'));
  }

  async function formulario(ctx, x) {
    const { esc } = U(), emp = ctx.contexto.empresa || {}, empId = ctx.contexto.empresaId;
    const v = x || { tipo: 'curso', titulo: '', texto: '', data: '', hora: '', local: '', link: '', inscricao: true, vagas: '', ate: '', ramos: [], gatilho: '', docs: [], valorCentavos: 0 };
    const opt = (o, at) => Object.entries(o).map(([k, t]) => `<option value="${k}" ${String(at || '') === k ? 'selected' : ''}>${esc(t.nome || t)}</option>`).join('');
    let res = null;
    const r = await U().dialogo({ titulo: x ? 'Editar publicação' : 'Nova publicação', sub: `Aparece em "Na sua cidade" para os prestadores de ${emp.cidade}.`,
      corpo: `<div class="fgrid" id="cf-form">
        <label class="f c6"><span>O que é</span><select id="cf-tipo">${opt(TIPOS, v.tipo)}</select></label>
        <label class="f c6"><span>Sugerir para</span><select id="cf-gat">${opt(GATILHOS, v.gatilho)}</select></label>
        <label class="f c12"><span>Título</span><input id="cf-tit" maxlength="120" value="${esc(v.titulo)}" placeholder="Ex.: Oficina: como regularizar o DAS"></label>
        <label class="f c12"><span>Explicação <i>(opcional)</i></span><textarea id="cf-txt" rows="3" maxlength="800">${esc(v.texto || '')}</textarea></label>
        <label class="f c4"><span>Dia <i>(opcional)</i></span><input id="cf-data" type="date" value="${esc(v.data || '')}"></label>
        <label class="f c4"><span>Hora <i>(opcional)</i></span><input id="cf-hora" type="time" value="${esc(v.hora || '')}"></label>
        <label class="f c4"><span>Aparece até <i>(opcional)</i></span><input id="cf-ate" type="date" value="${esc(v.ate || '')}"></label>
        <label class="f c12"><span>Onde <i>(opcional)</i></span><input id="cf-local" maxlength="120" value="${esc(v.local || '')}" placeholder="Ex.: Sala do Empreendedor"></label>
        <label class="f c12"><span>Página na internet <i>(opcional)</i></span><input id="cf-link" maxlength="300" value="${esc(v.link || '')}" placeholder="https://"></label>
        <div class="c12" data-so="curso evento"><label class="check"><input type="checkbox" id="cf-insc" ${v.inscricao ? 'checked' : ''}><span>Receber inscrições pelo Conectwork<small>O prestador toca em "Quero participar" e você vê a lista de inscritos.</small></span></label></div>
        <label class="f c6" data-so="curso evento"><span>Vagas <i>(opcional)</i></span><input id="cf-vagas" inputmode="numeric" maxlength="5" value="${esc(v.vagas || '')}"></label>
        <label class="f c6" data-so="licitacao"><span>Valor estimado <i>(opcional)</i></span><input id="cf-valor" data-mascara="dinheiro" inputmode="numeric" value="${v.valorCentavos ? esc(U().formatarDinheiro(v.valorCentavos)) : ''}"></label>
        <label class="f c12" data-so="licitacao"><span>Documentos pedidos <i>(um por linha)</i></span><textarea id="cf-docs" rows="3" maxlength="600" placeholder="Certidão de débitos municipais&#10;Certificado do MEI (CCMEI)">${esc((v.docs || []).join('\n'))}</textarea></label>
        <div class="f c12"><span>Para quais ramos <i>(nenhum marcado = todos)</i></span><div class="cd-chips" id="cf-ramos">${segmentos().map(s => `<label><input type="checkbox" value="${esc(s)}" ${(v.ramos || []).includes(s) ? 'checked' : ''}><span>${esc(s)}</span></label>`).join('')}</div></div>
        <p class="err c12" id="cf-erro" role="alert"></p></div>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Guardar como rascunho', valor: 'rascunho', classe: 'sec', antes: d => ler(d) }, { texto: x && x.status === 'publicado' ? 'Salvar' : 'Publicar', icone: 'check', valor: 'publicado', antes: d => ler(d) }],
      aoAbrir: d => { U().aplicarMascaras(d); const t = d.querySelector('#cf-tipo'), aj = () => d.querySelectorAll('[data-so]').forEach(e => { e.hidden = !e.dataset.so.split(' ').includes(t.value); }); t.onchange = aj; aj(); d.querySelector('#cf-tit').focus(); } });
    function ler(d) {
      const g = id => { const e = d.querySelector('#' + id); return e ? e.value.trim() : ''; }, er = d.querySelector('#cf-erro');
      const tipo = g('cf-tipo'), titulo = g('cf-tit').replace(/\s+/g, ' '), link = g('cf-link'), data = g('cf-data'), ate = g('cf-ate');
      if (!TIPOS[tipo]) { er.textContent = 'Escolha o que é.'; return false; }
      if (titulo.length < 4) { er.textContent = 'Escreva o título (pelo menos 4 letras).'; return false; }
      if (link && !/^https:\/\/[^\s]+\.[^\s]+$/.test(link)) { er.textContent = 'A página precisa começar com https://'; return false; }
      if (ate && data && ate < data && !['curso', 'evento'].includes(tipo)) { er.textContent = '"Aparece até" não pode ser antes do dia.'; return false; }
      if (tipo === 'servico' && !link) { er.textContent = 'Para um serviço, informe a página na internet.'; return false; }
      const insc = !!TIPOS[tipo].insc && d.querySelector('#cf-insc').checked, vagas = insc ? Math.max(0, parseInt(g('cf-vagas'), 10) || 0) : 0;
      res = { tipo, titulo, texto: g('cf-txt'), data, hora: g('cf-hora'), local: g('cf-local'), link, ate, inscricao: insc, vagas, gatilho: g('cf-gat'),
        ramos: Array.from(d.querySelectorAll('#cf-ramos input:checked')).map(c => c.value),
        docs: tipo === 'licitacao' ? g('cf-docs').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 12) : [],
        valorCentavos: tipo === 'licitacao' ? (U().lerDinheiro(g('cf-valor')) || 0) : 0 };
      return true;
    }
    if (!res || !['rascunho', 'publicado'].includes(r)) return;
    const agora = CW.fb.agora, nomeT = TIPOS[res.tipo].nome;
    if (x) return grava((b, db) => { b.update(db.doc('oportunidades/' + x._id), Object.assign({}, res, { status: x.status === 'publicado' && r === 'publicado' ? 'publicado' : r, atualizadoEm: agora() }));
      log(b, 'cidade.mudar', `${nomeT} "${res.titulo}" atualizad${res.tipo === 'licitacao' ? 'a' : 'o'}${r === 'publicado' && x.status !== 'publicado' ? ' e publicad' + (res.tipo === 'licitacao' ? 'a' : 'o') : ''}.`, x._id); }, r === 'publicado' ? 'Publicação salva.' : 'Rascunho salvo.');
    return grava((b, db) => { const ref = db.collection('oportunidades').doc();
      b.set(ref, Object.assign({ origemId: empId, origemNome: emp.nome || '', cidade: emp.cidade, uf: emp.uf, cidadeKey: chave(emp.cidade, emp.uf) }, res,
        { status: r, criadoPor: ctx.sessao.usuario.uid, criadoPorNome: quem(ctx), criadoEm: agora(), atualizadoEm: agora() }));
      log(b, 'cidade.criar', `${nomeT} "${res.titulo}" ${r === 'publicado' ? 'publicad' : 'guardad'}${res.tipo === 'licitacao' ? 'a' : 'o'}${r === 'publicado' ? '' : ' como rascunho'} para ${emp.cidade}.`, ref.id); },
      r === 'publicado' ? 'Publicado. Já aparece para os prestadores da cidade.' : 'Rascunho guardado.');
  }

  function inscritos(el, ctx) {
    const { esc, ic, formatarData } = U(), id = (ctx.params || [])[0], o = (G.ops || []).find(x => x._id === id);
    document.getElementById('acoes').innerHTML = '';
    const volta = `<div style="margin-bottom:14px"><button class="linkbtn" id="ci-voltar">${ic('back')}Voltar para as publicações</button></div>`;
    const liga = () => { const b = document.getElementById('ci-voltar'); if (b) b.onclick = () => CW.ir('cidadegestao'); };
    if (!G.ops || !G.insc) { el.innerHTML = volta + `<div class="card"><div class="empty"><div class="giro"></div><span>Carregando…</span></div></div>`; liga(); return; }
    if (!o) { el.innerHTML = volta + `<div class="banner warn">${ic('alert')}<span><strong>Publicação não encontrada.</strong></span></div>`; liga(); return; }
    const xs = inscDe(id).sort((a, b) => ms(a.criadoEm) - ms(b.criadoEm)), canc = (G.insc || []).filter(i => i.oportunidadeId === id && i.status === 'cancelado').length;
    el.innerHTML = volta + `<section class="card" style="margin-bottom:18px"><div class="card-b cd-tx"><div class="cd-l1"><span class="pill info">${esc((TIPOS[o.tipo] || {}).nome || '')}</span></div><strong style="font-size:17px">${esc(o.titulo)}</strong><small>${esc(quando(o))}${o.vagas ? ' · ' + o.vagas + ' vagas' : ''}</small></div></section>
      <section class="card" id="ci-lista"><div class="card-h"><span class="ic">${ic('users')}</span><h3>Inscritos</h3><span class="count">${xs.length}</span>${xs.length ? `<button class="btn sec sm" id="ci-csv" style="margin-left:auto">${ic('file')}Baixar a lista</button>` : ''}</div>
        ${xs.length ? `<div class="scroll"><table class="rl-tab"><thead><tr><th>Negócio</th><th>Pessoa</th><th>Contato</th><th>Inscrito em</th><th>Situação</th><th></th></tr></thead><tbody>${xs.map(i => `<tr data-i="${esc(i._id)}"><td style="white-space:normal"><strong>${esc(i.negocio)}</strong></td><td>${esc(i.pessoa)}</td><td style="white-space:normal">${esc(i.tel || '')}${i.tel && i.email ? ' · ' : ''}${esc(i.email || '')}</td><td>${esc(formatarData(i.criadoEm) || '')}</td>
            <td>${i.concluiu ? '<span class="pill ok">Concluiu</span>' : '<span class="pill info">Inscrito</span>'}</td>
            <td>${podeG(ctx) && o.tipo === 'curso' ? (i.concluiu ? `<button class="btn sec sm" data-desfaz="${esc(i._id)}">Desfazer</button>` : `<button class="btn sec sm" data-concluiu="${esc(i._id)}">${ic('check')}Concluiu</button>`) : ''}</td></tr>`).join('')}</tbody></table></div>`
          : `<div class="card-b"><div class="empty" id="ci-vazio"><div class="ic">${ic('users')}</div><strong>Ninguém se inscreveu ainda</strong><span>As inscrições feitas em "Na sua cidade" aparecem aqui na hora.</span></div></div>`}
        <p class="hint" style="margin:0;padding:10px 20px;font-size:12.5px;border-top:1px solid var(--line)">${canc ? canc + ' inscrição(ões) cancelada(s) não aparecem. ' : ''}Cada pessoa autorizou o envio destes dados só para esta inscrição (LGPD). Use apenas para organizar o curso ou evento.</p></section>`;
    liga();
    const marca = (iid, sim) => { const i = xs.find(z => z._id === iid); if (!i) return;
      grava((b, db) => { b.update(db.doc('inscricoes/' + iid), { concluiu: sim ? { em: hoje(), por: quem(ctx) } : null, atualizadoEm: CW.fb.agora() });
        log(b, sim ? 'cidade.concluiu' : 'cidade.desfazer', `${i.negocio} ${sim ? 'concluiu' : 'voltou para inscrito em'} "${o.titulo}".`, iid); }, sim ? 'Marcado: concluiu. O certificado aparece no perfil do prestador.' : 'Voltou para inscrito.'); };
    el.querySelectorAll('[data-concluiu]').forEach(b => b.onclick = () => marca(b.dataset.concluiu, true));
    el.querySelectorAll('[data-desfaz]').forEach(b => b.onclick = () => marca(b.dataset.desfaz, false));
    const csv = document.getElementById('ci-csv'); if (csv) csv.onclick = () => {
      const q = s => '"' + String(s || '').replace(/"/g, '""') + '"', linhas = [['Negócio', 'Pessoa', 'Telefone', 'E-mail', 'Situação'].map(q).join(';')].concat(xs.map(i => [i.negocio, i.pessoa, i.tel, i.email, i.concluiu ? 'Concluiu' : 'Inscrito'].map(q).join(';')));
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.download = 'inscritos-' + norm(o.titulo).replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '.csv';
      document.body.appendChild(a); a.click(); a.remove();
      grava((b) => log(b, 'cidade.lista', `Lista de inscritos de "${o.titulo}" baixada (${xs.length}).`, id));
    };
  }

  /* ================= 2) PRESTADOR: Na sua cidade ================= */
  let N = { ops: null, insc: null, aba: 'voce', cursosOk: null };
  const ehMei = ctx => { let p = ''; try { p = sessionStorage.getItem('cw.porte.' + (ctx.empresaId || (ctx.contexto || {}).empresaId)) || ''; } catch (e) {} return String(p).startsWith('MEI'); };
  const empDe = ctx => ctx.empresa || (ctx.contexto || {}).empresa || {};
  const vistoK = id => 'cw.cidade.visto.' + id;
  const visto = id => { try { return !!localStorage.getItem(vistoK(id)); } catch (e) { return true; } };
  /* a situação da pessoa agora, com o que as outras telas já carregaram (nenhuma leitura nova) */
  function situacao() {
    const s = { das: false, dasn: false, nota: false };
    try { const fd = CW.negocio && CW.negocio.fiscalDoc && CW.negocio.fiscalDoc(); if (fd && CW.meuDas) s.das = CW.meuDas.vencidosDe(fd, CW.negocio.inicioMei()).length > 0; } catch (e) {}
    try { const f = CW.negocio && CW.negocio.fiscal && CW.negocio.fiscal(); if (f && f.dasn) s.dasn = !f.dasn.entregue && f.dasn.prazo < hoje(); } catch (e) {}
    try { s.nota = !!(CW.espelhos && CW.espelhos.recusada && CW.espelhos.recusada()); } catch (e) {}
    return s;
  }
  let meuRamo = '';
  const doRamo = o => !(o.ramos || []).length || !meuRamo || o.ramos.includes(meuRamo);
  const vivas = () => (N.ops || []).filter(noAr);
  /* "Para você": o gatilho bate com a situação, ou é do meu ramo e pede resposta (curso, evento, licitação) */
  function paraVoce() {
    const s = situacao();
    const porGat = vivas().filter(o => o.gatilho && s[o.gatilho]).map(o => Object.assign({ motivo: GAT_TXT[o.gatilho] }, o));
    const ids = new Set(porGat.map(o => o._id));
    const porRamo = vivas().filter(o => !ids.has(o._id) && !o.gatilho && (o.ramos || []).length && meuRamo && o.ramos.includes(meuRamo) && ['curso', 'evento', 'licitacao'].includes(o.tipo)).map(o => Object.assign({ motivo: 'Para o seu ramo: ' + meuRamo + '.' }, o));
    return porGat.concat(porRamo);
  }
  const minha = id => (N.insc || []).find(i => i.oportunidadeId === id && i.status !== 'cancelado');

  const variasOrigens = () => new Set(vivas().map(o => o.origemId)).size > 1;
  function cartao(o, ctx) {
    const { esc, ic } = U(), t = TIPOS[o.tipo] || TIPOS.aviso, ins = minha(o._id);
    return `<article class="cd-card ${esc(o.tipo)}" data-op="${esc(o._id)}"><span class="cd-ic ${esc(o.tipo)}">${ic(t.ic)}</span><div class="cd-tx">
        <div class="cd-l1"><span class="pill info">${esc(t.nome)}</span>${ins ? (ins.concluiu ? '<span class="pill ok">Você concluiu</span>' : '<span class="pill ok">Você está inscrito</span>') : ''}${variasOrigens() ? `<small>${esc(o.origemNome || 'Prefeitura')}</small>` : ''}</div>
        <strong>${esc(o.titulo)}</strong>${quando(o) ? `<small class="cd-qd">${ic('clock')}${esc(quando(o))}</small>` : ''}
        ${o.motivo ? `<div class="cd-motivo">${ic('star')}${esc(o.motivo)}</div>` : ''}
        ${o.texto ? `<p>${esc(o.texto)}</p>` : ''}
        ${o.tipo === 'licitacao' ? `<div class="cd-lic">${o.valorCentavos ? `<span>Valor estimado: <b>${esc(U().formatarDinheiro(o.valorCentavos))}</b></span>` : ''}${(o.docs || []).length ? `<div><small>Documentos pedidos</small><ul>${o.docs.map(d => `<li>${esc(d)}</li>`).join('')}</ul></div>` : ''}</div>` : ''}
        <div class="cd-bts">${o.inscricao && TIPOS[o.tipo].insc ? (ins ? `<button class="btn sec sm" data-sair="${esc(o._id)}">Cancelar a minha inscrição</button>` : `<button class="btn sm" data-quero="${esc(o._id)}">${ic('check')}Quero participar</button>`) : ''}
          ${o.link ? `<a class="btn sec sm" href="${esc(o.link)}" target="_blank" rel="noopener noreferrer" data-link="${esc(o._id)}">Abrir a página</a>` : ''}
          ${o.tipo === 'licitacao' && CW.app.visiveis().some(m => m.id === 'documentos') ? `<button class="btn sec sm" data-ir="documentos">${ic('folder')}Ver os meus documentos</button>` : ''}
          ${o.tipo === 'credito' ? `<button class="btn sec sm" data-ir="nacidade/renda">${ic('file')}Comprovante de recebimentos</button>` : ''}</div></div></article>`;
  }

  function naCidade(el, ctx) {
    const { esc, ic } = U(), emp = empDe(ctx), k = chave(emp.cidade, emp.uf);
    document.getElementById('acoes').innerHTML = '';
    if (!k) { el.innerHTML = `<div class="card"><div class="empty" id="nc-sem-cidade"><div class="ic">${ic('building')}</div><strong>Informe a cidade do seu negócio</strong><span>Com a cidade no cadastro, o Conectwork mostra os cursos, as licitações e os avisos da Prefeitura de onde você trabalha.</span></div></div>`; return; }
    if (!N.ops) { el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Buscando o que tem em ${esc(emp.cidade)}…</span></div></div>`; return; }
    const todas = vivas(), pv = paraVoce(), meusC = (N.insc || []).filter(i => i.status !== 'cancelado');
    const por = { voce: pv, cursos: todas.filter(o => ['curso', 'evento'].includes(o.tipo)), licitacao: todas.filter(o => o.tipo === 'licitacao' && doRamo(o)), credito: todas.filter(o => o.tipo === 'credito'), aviso: todas.filter(o => o.tipo === 'aviso'), servico: todas.filter(o => o.tipo === 'servico') };
    const ord = xs => xs.slice().sort((a, b) => (a.data || '9999').localeCompare(b.data || '9999') || ms(b.criadoEm) - ms(a.criadoEm));
    let corpo;
    if (!todas.length) corpo = `<div class="card"><div class="empty" id="nc-vazio"><div class="ic">${ic('building')}</div><strong>Ainda não há nada publicado para ${esc(emp.cidade)}</strong><span>Quando a Prefeitura publicar cursos, licitações ou avisos, eles aparecem aqui.</span></div></div>`;
    else if (N.aba === 'servico') corpo = por.servico.length ? `<div class="cd-serv" id="nc-servicos">${ord(por.servico).map(o => `<a class="cd-sv" href="${esc(o.link)}" target="_blank" rel="noopener noreferrer"><span class="cd-ic servico">${ic('building')}</span><b>${esc(o.titulo)}</b><small>${esc(o.texto || 'Abrir a página')}</small></a>`).join('')}</div>` : vazioAba('Nenhum atalho de serviço publicado.');
    else if (N.aba === 'voce' && !pv.length) corpo = `<div class="card"><div class="empty" id="nc-voce-vazio"><div class="ic">${ic('star')}</div><strong>Nada especial para você agora</strong><span>Quando houver um curso ou aviso ligado à sua situação (um DAS atrasado, uma nota recusada) ou ao seu ramo, ele aparece primeiro aqui. Veja as outras abas.</span></div></div>`;
    else corpo = (por[N.aba] || []).length ? `<div class="cd-lista" id="nc-lista">${ord(por[N.aba]).map(o => cartao(o, ctx)).join('')}</div>` : vazioAba('Nada nesta parte por enquanto.');
    const credExtra = N.aba === 'credito' ? `<section class="card" id="nc-renda" style="margin-top:18px"><div class="card-b cd-renda"><span class="cd-ic credito">${ic('file')}</span><div><strong>Comprovante de recebimentos</strong><p>Para pedir crédito sem ter como provar quanto ganha: o Conectwork monta um PDF com os pagamentos de notas confirmados aqui. Você baixa e leva; nada é enviado a ninguém.</p></div><button class="btn" data-ir="nacidade/renda">${ic('file')}Montar o comprovante</button></div></section>` : '';
    const certs = meusC.filter(i => i.concluiu);
    el.innerHTML = `<div class="cd-topo"><span class="cd-cid">${ic('building')}${esc(emp.cidade)} · ${esc(emp.uf)}</span>${N.cursosOk === false ? `<button class="btn sec sm" id="nc-avise">${ic('mail')}Quero ser avisado de cursos</button>` : ''}</div>
      <div class="cd-abas" id="nc-abas" role="tablist">${ABAS.map(([v, t]) => `<button role="tab" data-aba="${v}" aria-selected="${N.aba === v}">${t}${(por[v] || []).length ? ` <i>${por[v].length}</i>` : ''}</button>`).join('')}</div>
      ${corpo}${credExtra}
      ${meusC.length ? `<section class="card" id="nc-meus" style="margin-top:22px"><div class="card-h"><span class="ic">${ic('star')}</span><h3>Meus cursos e eventos</h3><span class="count">${meusC.length}</span></div>
        ${meusC.map(i => { const o = (N.ops || []).find(z => z._id === i.oportunidadeId); return `<div class="docrow ${i.concluiu ? 'ok' : ''}"><span class="ic">${ic(i.concluiu ? 'check' : 'clock')}</span><div class="t"><strong>${esc(i.titulo || (o && o.titulo) || 'Curso')}</strong><small>${i.concluiu ? 'Concluído em ' + esc(dataBR(i.concluiu.em)) + ' · confirmado pela ' + esc(i.origemNome || 'Prefeitura') : 'Inscrito' + (o && quando(o) ? ' · ' + esc(quando(o)) : '')}</small></div>${i.concluiu ? '<span class="pill ok">Certificado</span>' : ''}</div>`; }).join('')}
        ${certs.length ? `<p class="hint" style="margin:0;padding:10px 20px;font-size:12.5px;border-top:1px solid var(--line)">Os cursos concluídos ficam no seu perfil no Conectwork.</p>` : ''}</section>` : ''}`;
    el.querySelectorAll('#nc-abas [data-aba]').forEach(b => b.onclick = () => { N.aba = b.dataset.aba; if (N.aba === 'aviso') por.aviso.forEach(o => { try { localStorage.setItem(vistoK(o._id), '1'); } catch (e) {} }); naCidade(el, ctx); CW.app.pendenciasMudaram(); });
    el.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => CW.ir(b.dataset.ir));
    el.querySelectorAll('[data-quero]').forEach(b => b.onclick = () => participar(ctx, vivas().find(o => o._id === b.dataset.quero)));
    el.querySelectorAll('[data-sair]').forEach(b => b.onclick = () => sair(ctx, b.dataset.sair));
    const av = document.getElementById('nc-avise'); if (av) av.onclick = () => CW.ir('autorizacoes');
  }
  const vazioAba = t => `<div class="card"><div class="empty" id="nc-aba-vazia"><div class="ic">${U().ic('building')}</div><strong>${U().esc(t)}</strong></div></div>`;

  async function participar(ctx, o) {
    if (!o) return;
    const { esc } = U(), emp = empDe(ctx), empId = ctx.contexto.empresaId, st = ctx.sessao, pessoa = quem(ctx), email = (st.usuario.email || '').toLowerCase(), tel = (st.perfil && (st.perfil.zap || st.perfil.tel)) || '';
    if (ctx.soLeitura || (ctx.contexto.acesso || {}).cargo !== 'admin') { U().toast('Só o administrador da empresa faz a inscrição.', 'erro'); return; }
    const texto = `Autorizo o Conectwork a enviar ${/^prefeitura/i.test(o.origemNome || 'Prefeitura') ? 'à ' : 'para '}${o.origemNome || 'Prefeitura'} o nome do meu negócio, o meu nome, o meu e-mail e o meu telefone, só para a inscrição em "${o.titulo}".`;
    const ok = await U().dialogo({ titulo: 'Quero participar', sub: o.titulo,
      corpo: `<div class="stack" style="gap:12px"><div class="cd-dados"><div><small>Negócio</small><b>${esc(emp.nome || '')}</b></div><div><small>Pessoa</small><b>${esc(pessoa)}</b></div><div><small>E-mail</small><b>${esc(email)}</b></div><div><small>Telefone</small><b>${esc(tel || 'não informado')}</b></div></div>
        <label class="check"><input type="checkbox" id="np-aceite"><span>${esc(texto)}<small>Você pode cancelar a inscrição quando quiser. Os dados não são usados para mais nada.</small></span></label><p class="err" id="np-erro" role="alert"></p></div>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Confirmar a inscrição', icone: 'check', valor: 'ok', antes: d => { if (!d.querySelector('#np-aceite').checked) { d.querySelector('#np-erro').textContent = 'Marque a autorização para se inscrever.'; return false; } return true; } }] });
    if (ok !== 'ok') return;
    const agora = CW.fb.agora, id = o._id + '_' + empId;
    const antiga = (N.insc || []).find(i => i._id === id);   /* já se inscreveu e cancelou: volta, com a autorização de agora */
    if (antiga) return grava((b, db) => { b.update(db.doc('inscricoes/' + id), { status: 'inscrito', consentimento: { texto, versao: VERSAO_TEXTO, em: agora() }, atualizadoEm: agora() });
      log(b, 'cidade.inscrever', `Inscrição em "${o.titulo}" (${o.origemNome || 'Prefeitura'}) feita de novo. Autorizado o envio de nome, e-mail e telefone só para esta inscrição.`, id); }, 'Inscrição feita. A Prefeitura já vê o seu nome na lista.');
    grava((b, db) => { b.set(db.doc('inscricoes/' + id), { oportunidadeId: o._id, origemId: o.origemId, origemNome: o.origemNome || '', titulo: o.titulo, tipo: o.tipo, empresaId: empId, negocio: emp.nome || '', pessoa, email, tel,
        status: 'inscrito', concluiu: null, consentimento: { texto, versao: VERSAO_TEXTO, em: agora() }, criadoPor: st.usuario.uid, criadoEm: agora(), atualizadoEm: agora() });
      log(b, 'cidade.inscrever', `Inscrição em "${o.titulo}" (${o.origemNome || 'Prefeitura'}). Autorizado o envio de nome, e-mail e telefone só para esta inscrição.`, id); }, 'Inscrição feita. A Prefeitura já vê o seu nome na lista.');
  }
  async function sair(ctx, opId) {
    const i = minha(opId); if (!i) return;
    if (!(await U().confirmar('Cancelar a inscrição?', 'O seu nome sai da lista da Prefeitura.', 'Cancelar a inscrição'))) return;
    grava((b, db) => { b.update(db.doc('inscricoes/' + i._id), { status: 'cancelado', atualizadoEm: CW.fb.agora() }); log(b, 'cidade.cancelar', `Inscrição em "${i.titulo}" cancelada.`, i._id); }, 'Inscrição cancelada.');
  }

  /* ---------- comprovante de recebimentos (para pedir crédito): o prestador baixa; nada é enviado ---------- */
  let rendaMeses = 6;
  function recebidosDe(ctx, meses) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (meses - 1)); const de = iso(d).slice(0, 7);
    const xs = (CW.titulos && CW.titulos.recebidos ? CW.titulos.recebidos(ctx) : []).filter(t => t.data.slice(0, 7) >= de).sort((a, b) => a.data.localeCompare(b.data));
    const porMes = {}; for (let i = 0; i < meses; i++) { const m = new Date(d.getFullYear(), d.getMonth() + i, 1); porMes[iso(m).slice(0, 7)] = 0; }
    xs.forEach(t => { porMes[t.data.slice(0, 7)] = (porMes[t.data.slice(0, 7)] || 0) + t.centavos; });
    const total = xs.reduce((s, t) => s + t.centavos, 0);
    return { de, xs, porMes, total, media: Math.round(total / meses) };
  }
  function renda(el, ctx) {
    const { esc, ic } = U(), emp = empDe(ctx), R = recebidosDe(ctx, rendaMeses), brl = c => U().formatarDinheiro(c);
    document.getElementById('acoes').innerHTML = '';
    const mesTxt = m => MESES[+m.slice(5, 7) - 1].slice(0, 3) + '/' + m.slice(2, 4), mx = Math.max(1, ...Object.values(R.porMes));
    el.innerHTML = `<div style="margin-bottom:14px"><button class="linkbtn" id="nr-voltar">${ic('back')}Voltar para Na sua cidade</button></div>
      <div class="banner info" style="margin-bottom:18px">${ic('shield')}<span><strong>Você baixa e leva</strong>O comprovante junta os pagamentos de notas confirmados no Conectwork. Ele fica com você: o Conectwork não manda os seus dados para banco, Prefeitura ou qualquer outra entidade.</span></div>
      <section class="card" style="margin-bottom:18px"><div class="card-b cd-rtopo"><label class="f"><span>Período</span><select id="nr-meses"><option value="6" ${rendaMeses === 6 ? 'selected' : ''}>Últimos 6 meses</option><option value="12" ${rendaMeses === 12 ? 'selected' : ''}>Últimos 12 meses</option></select></label>
        <div class="pc-n" id="nr-total"><small>Recebido no período</small><b>${esc(brl(R.total))}</b><span>${R.xs.length} pagamento${R.xs.length === 1 ? '' : 's'}</span></div><div class="pc-n" id="nr-media"><small>Média por mês</small><b>${esc(brl(R.media))}</b><span>em ${rendaMeses} meses</span></div>
        <button class="btn" id="nr-pdf" ${R.xs.length ? '' : 'disabled'}>${ic('file')}Baixar o comprovante (PDF)</button></div></section>
      ${R.xs.length ? `<section class="card" style="margin-bottom:18px"><div class="card-h"><span class="ic">${ic('chart')}</span><h3>Mês a mês</h3></div><div class="card-b">${Object.entries(R.porMes).map(([m, v]) => `<div class="pc-bar"><span>${esc(mesTxt(m))}</span><i style="width:${Math.round(v / mx * 100)}%"></i><span class="r">${esc(brl(v))}</span></div>`).join('')}</div></section>
      <section class="card" id="nr-lista"><div class="card-h"><span class="ic">${ic('wallet')}</span><h3>Pagamentos recebidos</h3><span class="count">${R.xs.length}</span></div><div class="scroll"><table class="rl-tab"><thead><tr><th>Data</th><th>Quem pagou</th><th>Nota</th><th style="text-align:right">Valor</th></tr></thead><tbody>${R.xs.map(t => `<tr><td>${esc(dataBR(t.data))}</td><td style="white-space:normal">${esc(t.nome)}</td><td>${esc(t.nota || '—')}</td><td style="text-align:right"><strong>${esc(brl(t.centavos))}</strong></td></tr>`).join('')}</tbody></table></div></section>`
      : `<div class="card"><div class="empty" id="nr-vazio"><div class="ic">${ic('wallet')}</div><strong>Ainda não há pagamentos confirmados no período</strong><span>O comprovante usa os pagamentos de notas que o cliente confirmou no Conectwork. Quando houver, ele pode ser baixado aqui.</span></div></div>`}`;
    document.getElementById('nr-voltar').onclick = () => { N.aba = 'credito'; CW.ir('nacidade'); };
    document.getElementById('nr-meses').onchange = e => { rendaMeses = +e.target.value; renda(el, ctx); };
    document.getElementById('nr-pdf').onclick = () => rendaPdf(ctx, emp, R);
  }
  function carregaScript(src, ok) {
    if (ok()) return Promise.resolve();
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = () => ok() ? res() : rej(new Error('Biblioteca não carregou.')); s.onerror = () => rej(new Error('Não foi possível baixar a ferramenta do PDF. Confira a internet e tente de novo.')); document.head.appendChild(s); });
  }
  async function rendaPdf(ctx, emp, R) {
    try {
      await carregaScript(JSPDF, () => !!(window.jspdf && window.jspdf.jsPDF));
      const doc = new window.jspdf.jsPDF(), brl = c => U().formatarDinheiro(c);
      let y = 20; const linha = (t, tam, b) => { doc.setFont('helvetica', b ? 'bold' : 'normal'); doc.setFontSize(tam || 11); doc.splitTextToSize(String(t), 180).forEach(l => { if (y > 280) { doc.addPage(); y = 20; } doc.text(l, 15, y); y += (tam || 11) * 0.5; }); y += 2; };
      linha('Comprovante de recebimentos', 16, true);
      linha(`${emp.nome || ''}${emp.cnpj ? ' · CNPJ ' + emp.cnpj : ''}`, 12);
      linha(`${emp.cidade || ''}${emp.uf ? ' · ' + emp.uf : ''} · emitido em ${dataBR(hoje())} por ${quem(ctx)}`, 10);
      y += 4; linha(`Período: últimos ${rendaMeses} meses (desde ${MESES[+R.de.slice(5, 7) - 1]} de ${R.de.slice(0, 4)})`, 12, true);
      linha(`Recebido no período: ${brl(R.total)} · média por mês: ${brl(R.media)} · ${R.xs.length} pagamento(s)`, 12);
      y += 3; linha('Mês a mês', 13, true); Object.entries(R.porMes).forEach(([m, v]) => linha(`${MESES[+m.slice(5, 7) - 1]} de ${m.slice(0, 4)}: ${brl(v)}`, 11));
      y += 3; linha('Pagamentos recebidos', 13, true); R.xs.forEach(t => linha(`${dataBR(t.data)} · ${t.nome}${t.nota ? ' · nota ' + t.nota : ''} · ${brl(t.centavos)}`, 10));
      y += 6; linha('Este comprovante foi montado pelo Conectwork com os pagamentos de notas fiscais confirmados na plataforma por quem pagou. O dinheiro não passa pelo Conectwork: ele sai de quem contrata direto para o prestador. Não substitui documentos fiscais nem a declaração de faturamento.', 9);
      doc.save(`Comprovante-recebimentos-${norm(emp.nome).replace(/[^a-z0-9]+/g, '-').slice(0, 30)}-${hoje()}.pdf`);
      grava((b) => log(b, 'cidade.renda', `Comprovante de recebimentos baixado (últimos ${rendaMeses} meses).`, ''));
      U().toast('Comprovante baixado.');
    } catch (e) { U().toast(e.message || 'Não foi possível montar o comprovante.', 'erro'); }
  }

  /* ================= registro ================= */
  const redesenha = (mod, f) => () => { const el = document.getElementById('view'), at = CW.app.atual(); if (el && at && at.modulo === mod) CW.app.desenhar(); CW.app.pendenciasMudaram(); if (f) f(); };

  CW.registrarModulo({
    id: 'cidadegestao', nome: 'Oportunidades da cidade', nomeCurto: 'Publicar', icone: 'send', ordem: 19,
    para: ['empresa'], contrato: 'cidade',
    iniciar(ctx) {
      G = { ops: null, insc: null, filtro: 'no-ar' };
      const db = CW.fb.db(), emp = ctx.contexto.empresaId, r = redesenha('cidadegestao');
      CW.inscrever('cidadegestao-ops', () => db.collection('oportunidades').where('origemId', '==', emp), s => { G.ops = CW.fb.lista(s); r(); }, () => { G.ops = []; r(); });
      CW.inscrever('cidadegestao-insc', () => db.collection('inscricoes').where('origemId', '==', emp), s => { G.insc = CW.fb.lista(s); r(); }, () => { G.insc = []; r(); });
      return () => { G = { ops: null, insc: null, filtro: 'no-ar' }; };
    },
    pendencias(ctx) {
      if (!G.ops || !G.insc) return [];
      const k = 'cw.cidade.insc.' + ctx.contexto.empresaId; let ult = 0; try { ult = +localStorage.getItem(k) || 0; } catch (e) {}
      const at = CW.app.atual(); if (at && at.modulo === 'cidadegestao') { try { localStorage.setItem(k, String(Date.now())); } catch (e) {} return []; }
      const novas = G.insc.filter(i => i.status !== 'cancelado' && ms(i.criadoEm) > ult).length;
      return novas ? [{ txt: novas === 1 ? '1 inscrição nova nas suas publicações' : `${novas} inscrições novas nas suas publicações`, sub: 'Oportunidades da cidade', rota: 'cidadegestao' }] : [];
    },
    telas: {
      lista: { nome: 'Oportunidades da cidade', sub: 'Cursos, eventos, licitações, crédito, avisos e serviços que a Prefeitura publica para os prestadores da cidade.', render: gestao },
      inscritos: { nome: 'Inscritos', sub: 'Quem tocou em "Quero participar" e autorizou o envio dos dados para esta inscrição.', render: inscritos }
    }
  });

  const semAprovN = ctx => ehMei(ctx) && ['mei', 'analise', 'pendencia'].includes((empDe(ctx)).status);
  CW.registrarModulo({
    id: 'nacidade', nome: 'Na sua cidade', nomeCurto: 'Cidade', icone: 'building', ordem: 62,
    para: ['empresa'], livre: true, semAprovacao: ctx => semAprovN(ctx),
    mostrar: ctx => ['prestador', 'ambos'].includes((ctx.empresa || {}).tipo) && !ehParceira(ctx.empresa),
    iniciar(ctx) {
      N = { ops: null, insc: null, aba: 'voce', cursosOk: null }; meuRamo = '';
      const db = CW.fb.db(), empId = ctx.contexto.empresaId, emp = ctx.contexto.empresa || {}, k = chave(emp.cidade, emp.uf), r = redesenha('nacidade');
      if (!k) { N.ops = []; N.insc = []; return () => {}; }
      CW.inscrever('nacidade-ops', () => db.collection('oportunidades').where('cidadeKey', '==', k).where('status', '==', 'publicado'), s => { N.ops = CW.fb.lista(s); r(); }, () => { N.ops = []; r(); });
      CW.inscrever('nacidade-insc', () => db.collection('inscricoes').where('empresaId', '==', empId), s => { N.insc = CW.fb.lista(s); r(); }, () => { N.insc = []; r(); });
      db.doc('empresas/' + empId + '/privado/cadastro').get().then(s => { const d = CW.fb.dados(s) || {}; meuRamo = (d.dados || {}).segmento || d.segmento || ''; r(); }).catch(() => {});
      db.doc('consentimentos/' + ctx.sessao.usuario.uid + '_cursos').get().then(s => { const d = CW.fb.dados(s); N.cursosOk = !!(d && d.aceite); r(); }).catch(() => { N.cursosOk = false; });
      return () => { N = { ops: null, insc: null, aba: 'voce', cursosOk: null }; };
    },
    /* "Precisa de você": aviso oficial ainda não lido (sempre) e sugestão ligada à situação (só para quem autorizou cursos) */
    pendencias() {
      if (!N.ops) return [];
      const out = vivas().filter(o => o.tipo === 'aviso' && !visto(o._id)).map(o => ({ txt: 'Aviso da Prefeitura: ' + o.titulo, sub: o.origemNome || 'Na sua cidade', rota: 'nacidade' }));
      if (N.cursosOk) paraVoce().filter(o => o.gatilho && !minha(o._id) && !visto(o._id)).slice(0, 2).forEach(o => out.push({ txt: 'Para você: ' + o.titulo, sub: GAT_TXT[o.gatilho], rota: 'nacidade' }));
      return out;
    },
    buscar() { return vivas().map(o => ({ t: o.titulo, s: `${(TIPOS[o.tipo] || {}).nome || ''} · ${o.origemNome || 'Na sua cidade'}`, rota: 'nacidade', txt: [o.texto, o.local, 'cidade prefeitura'].join(' ') })); },
    telas: {
      lista: { nome: 'Na sua cidade', sub: 'Cursos, licitações, crédito e avisos da Prefeitura de onde você trabalha, começando pelo que serve para você agora.', render(el, ctx) { if (N.aba === 'voce' && N.ops && !paraVoce().length && vivas().length && !N._ja) { N._ja = 1; N.aba = 'cursos'; } naCidade(el, ctx); } },
      renda: { nome: 'Comprovante de recebimentos', sub: 'Para pedir crédito: os pagamentos de notas confirmados no Conectwork, em PDF.', render: renda }
    }
  });

  CW.cidade = { chave, TIPOS, GATILHOS, paraVoce, situacao, recebidosDe, ops: () => vivas(), certificados: () => (N.insc || []).filter(i => i.concluiu), resumo: () => ({ n: vivas().length, voce: paraVoce().length }) };
})();
