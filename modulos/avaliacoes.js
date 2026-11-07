/* Conectwork · Etapa 2, parte 7: avaliação do serviço da prestadora (equipe contínua).
   Não é módulo de menu: aparece no contrato (cartão "Avaliação do serviço").
   - Depois que o período é pago (título pago ou baixado), quem contrata (admin ou aprovador técnico) avalia o serviço da
     prestadora naquele período: qualidade, prazo, comunicação e aderência ao escopo (1 a 5) e um comentário.
   - A prestadora vê a avaliação e pode responder uma vez. Uma avaliação por período (id = id do título).
   - Nota baixa não desativa ninguém automaticamente. Quem avalia o profissional é a prestadora (etapa futura). */
(function () {
  const CW = window.CW = window.CW || {};
  const U = () => CW.ui;
  const CRIT = [['qualidade', 'Qualidade do serviço'], ['prazo', 'Prazo e pontualidade'], ['comunicacao', 'Comunicação'], ['escopo', 'Fez o que foi combinado']];
  const AVALIA = ['admin', 'aprovador'], RESPONDE = ['admin', 'financeiro'];
  const cargo = ctx => ctx.contexto.acesso && ctx.contexto.acesso.cargo;
  const tem = (ctx, l) => !ctx.soLeitura && l.includes(cargo(ctx));
  const quem = ctx => (ctx.sessao.perfil && ctx.sessao.perfil.nome) || ctx.sessao.usuario.email;
  const periodoTxt = p => CW.medicoes ? CW.medicoes.periodoTxt(p) : p;
  const media = a => { const v = CRIT.map(([k]) => (a.notas || {})[k] || 0); return v.reduce((s, x) => s + x, 0) / v.length; };
  const fmt = n => n.toFixed(1).replace('.', ',');
  const estrelas = n => '★★★★★'.slice(0, Math.round(n)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(n));
  const log = (b, ctx, acao, texto, ref) => b.set(CW.fb.db().collection('log').doc(), { em: CW.fb.agora(), uid: ctx.sessao.usuario.uid, quem: quem(ctx), empresaId: ctx.contexto.empresaId, acao, texto, ref: ref || '' });

  async function bloco(box, ctx, c) {
    if (!box || c.status === 'assinatura' || c.status === 'cancelado') return;
    const { esc, ic, formatarDataHora } = U(), db = CW.fb.db(), emp = ctx.contexto.empresaId, l = c.tomadorId === emp ? 'tomador' : 'prestador';
    const campo = l === 'tomador' ? 'tomadorId' : 'prestadorId';
    let tits = [], avs = [];
    try {
      const [a, b] = await Promise.all([db.collection('titulos').where(campo, '==', emp).get(), db.collection('avaliacoes').where(campo, '==', emp).get()]);
      tits = CW.fb.lista(a).filter(t => t.contratoId === c._id); avs = CW.fb.lista(b).filter(x => x.contratoId === c._id);
    } catch (e) { box.innerHTML = ''; return; }
    const feitas = new Set(avs.map(a => a._id));
    const pend = l === 'tomador' && tem(ctx, AVALIA) ? tits.filter(t => ['liquidado', 'baixado'].includes(t.status) && !feitas.has(t._id)) : [];
    avs.sort((a, b) => String(b.periodo).localeCompare(String(a.periodo)));
    const m = avs.length ? avs.reduce((s, a) => s + media(a), 0) / avs.length : 0;
    box.innerHTML = `<section class="card" id="av-card"><div class="card-h"><span class="ic">${ic('star')}</span><h3>Avaliação do serviço</h3>${avs.length ? `<span style="margin-left:auto" class="av-media" id="av-media"><b>${fmt(m)}</b> <span class="av-est">${estrelas(m)}</span> <small class="hint">${avs.length} período${avs.length > 1 ? 's' : ''}</small></span>` : ''}</div><div class="card-b stack" style="gap:12px">
      ${pend.map(t => `<div class="banner info av-pend">${ic('star')}<span><strong>Avalie o serviço de ${esc(periodoTxt(t.periodo))}</strong>O período já foi pago. Leva menos de um minuto. <button class="linkbtn" data-avaliar="${esc(t._id)}">Avaliar agora</button></span></div>`).join('')}
      ${avs.map(a => `<div class="av-it" data-av="${esc(a._id)}"><div class="av-top"><strong>${esc(periodoTxt(a.periodo))}</strong><span><b>${fmt(media(a))}</b> <span class="av-est">${estrelas(media(a))}</span></span></div>
        <div class="av-crit">${CRIT.map(([k, n]) => `<span>${esc(n)}: <b>${(a.notas || {})[k]}</b></span>`).join('')}</div>
        ${a.comentario ? `<p class="av-com">"${esc(a.comentario)}"</p>` : ''}<small class="hint">${esc(a.porNome || '')} · ${esc(formatarDataHora(a.em))}</small>
        ${a.resposta ? `<div class="av-resp"><b>Resposta da ${esc(c.prestadorNome)}:</b> ${esc(a.resposta.texto)}<br><small class="hint">${esc(a.resposta.nome)} · ${esc(formatarDataHora(a.resposta.em))}</small></div>`
          : l === 'prestador' && tem(ctx, RESPONDE) ? `<button class="linkbtn" data-responder="${esc(a._id)}" style="font-size:13px">Responder</button>` : ''}</div>`).join('')}
      ${!avs.length && !pend.length ? `<p class="hint" style="margin:0;font-size:13px">${l === 'tomador' ? 'Depois que cada período é pago, quem contrata avalia o serviço da prestadora aqui.' : 'Depois que cada período é pago, a empresa que contrata avalia o serviço. Você vê aqui e pode responder.'}</p>` : ''}
      <p class="hint" style="margin:0;font-size:12px">Avaliação baixa não desativa ninguém automaticamente: serve para conversar e melhorar o serviço.</p></div></section>`;
    box.querySelectorAll('[data-avaliar]').forEach(b => b.onclick = () => avaliar(box, ctx, c, tits.find(t => t._id === b.dataset.avaliar)));
    box.querySelectorAll('[data-responder]').forEach(b => b.onclick = () => responder(box, ctx, c, avs.find(a => a._id === b.dataset.responder)));
  }

  async function avaliar(box, ctx, c, t) {
    const { esc } = U(); let dados = null;
    await U().dialogo({ titulo: 'Avaliar o serviço', sub: `${c.prestadorNome} · ${periodoTxt(t.periodo)}`,
      corpo: `<div class="stack" style="gap:14px">${CRIT.map(([k, n]) => `<div class="av-linha"><span>${esc(n)}</span><div class="av-notas" data-k="${k}" role="radiogroup" aria-label="${esc(n)}">${[1, 2, 3, 4, 5].map(v => `<button type="button" class="av-n" data-v="${v}" aria-label="${v} de 5">${v}</button>`).join('')}</div></div>`).join('')}
        <p class="hint" style="margin:-4px 0 0;font-size:12px">1 = muito ruim · 5 = muito bom</p>
        <label class="f"><span>Comentário <i>(opcional)</i></span><textarea id="av-com" rows="3" maxlength="1000" placeholder="O que foi bem e o que pode melhorar."></textarea></label><p class="err" id="av-erro"></p></div>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Enviar avaliação', valor: 'ok', antes: d => {
        const notas = {}; let falta = '';
        CRIT.forEach(([k, n]) => { const s = d.querySelector(`.av-notas[data-k="${k}"] .av-n.sel`); if (s) notas[k] = +s.dataset.v; else if (!falta) falta = n; });
        if (falta) { d.querySelector('#av-erro').textContent = 'Dê uma nota para: ' + falta + '.'; return false; }
        dados = { notas, comentario: d.querySelector('#av-com').value.trim() }; return true; } }],
      aoAbrir: d => d.querySelectorAll('.av-notas').forEach(g => g.querySelectorAll('.av-n').forEach(b => b.onclick = () => { g.querySelectorAll('.av-n').forEach(x => x.classList.toggle('on', +x.dataset.v <= +b.dataset.v)); g.querySelectorAll('.av-n').forEach(x => x.classList.toggle('sel', x === b)); d.querySelector('#av-erro').textContent = ''; })) });
    if (!dados) return;
    const db = CW.fb.db(), b = db.batch(), agora = CW.fb.agora;
    b.set(db.doc('avaliacoes/' + t._id), { tipo: 'servico_prestadora', tituloId: t._id, contratoId: c._id, tomadorId: c.tomadorId, prestadorId: c.prestadorId, partes: [c.tomadorId, c.prestadorId],
      periodo: t.periodo, notas: dados.notas, comentario: dados.comentario, por: ctx.sessao.usuario.uid, porNome: quem(ctx), em: agora(), resposta: null });
    log(b, ctx, 'avaliacao.criar', `Serviço de ${c.prestadorNome} em ${periodoTxt(t.periodo)} avaliado: média ${fmt(media(dados))}.`, t._id);
    try { await b.commit(); U().toast('Avaliação enviada. Obrigado!'); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); }
    bloco(box, ctx, c);
  }

  async function responder(box, ctx, c, a) {
    let txt = null;
    await U().dialogo({ titulo: 'Responder a avaliação', sub: `${periodoTxt(a.periodo)} · média ${fmt(media(a))}. A resposta é uma só e a ${c.tomadorNome} vê.`,
      corpo: `<label class="f"><span>Sua resposta</span><textarea id="rs-txt" rows="4" maxlength="1000"></textarea></label><p class="err" id="rs-erro"></p>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Enviar resposta', valor: 'ok', antes: d => { const v = d.querySelector('#rs-txt').value.trim(); if (v.length < 5) { d.querySelector('#rs-erro').textContent = 'Escreva a resposta.'; return false; } txt = v; return true; } }] });
    if (!txt) return;
    const db = CW.fb.db(), b = db.batch();
    b.update(db.doc('avaliacoes/' + a._id), { resposta: { texto: txt, uid: ctx.sessao.usuario.uid, nome: quem(ctx), em: CW.fb.agora() } });
    log(b, ctx, 'avaliacao.responder', `Resposta à avaliação de ${periodoTxt(a.periodo)} (${c.tomadorNome}).`, a._id);
    try { await b.commit(); U().toast('Resposta enviada.'); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); }
    bloco(box, ctx, c);
  }

  CW.avaliacoes = { bloco, media };
})();
