/* Conectwork · Minhas autorizações (LGPD; CLAUDE.md: consentimentos separados, com revogação).
   A pessoa vê o que autorizou (texto, versão, data e canal) e muda as opcionais quando quiser: avisos por WhatsApp e por
   e-mail, cursos e ofertas (cursos e ofertas começam desmarcados). As três primeiras são necessárias para usar o
   Conectwork (execução do serviço contratado): para retirar, a pessoa pede o encerramento da conta.
   Cada mudança grava um registro novo em consentimentos_log (nada se apaga) e atualiza consentimentos/{uid}_{finalidade}.
   Abre pelo ícone de escudo ao lado do nome (fora do menu) e pelo Início. */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const lista = () => (CW.cadastro && CW.cadastro.AUTORIZACOES) || [];
  const versao = () => (CW.cadastro && CW.cadastro.VERSAO_TEXTOS) || '';

  async function render(el, ctx) {
    const { esc, ic, formatarDataHora } = U(), db = CW.fb.db(), uid = ctx.sessao.usuario.uid;
    el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Carregando as suas autorizações…</span></div></div>`;
    let atuais = {}, hist = [];
    try {
      const [a, h] = await Promise.all([Promise.all(lista().map(x => db.doc('consentimentos/' + uid + '_' + x.k).get())), db.collection('consentimentos_log').where('uid', '==', uid).get()]);
      a.forEach((s, i) => { const d = CW.fb.dados(s); if (d) atuais[lista()[i].k] = d; });
      const ms = v => !v ? 0 : typeof v.toMillis === 'function' ? v.toMillis() : v.seconds ? v.seconds * 1000 : (Date.parse(v) || 0);
      hist = CW.fb.lista(h).sort((x, y) => ms(y.em) - ms(x.em)).slice(0, 30);
    } catch (e) { el.innerHTML = `<div class="banner danger">${ic('alert')}<span><strong>Não foi possível abrir.</strong>${esc(CW.fb.mensagemErro(e))}</span></div>`; return; }
    const nomeDe = k => (lista().find(x => x.k === k) || { t: k }).t;
    const linha = x => { const at = atuais[x.k], on = !!(at && at.aceite);
      return `<div class="docrow ${on ? 'ok' : ''}" data-fin="${x.k}"><span class="ic">${ic(on ? 'check' : 'x')}</span><div class="t"><strong>${esc(x.t)}</strong>
        <small>${at ? (on ? 'Autorizado' : 'Não autorizado') + ' em ' + esc(formatarDataHora(at.revogadoEm || at.em)) + ' · ' + esc(at.canal || '') + ' · versão ' + esc(at.textoVersao || '') : 'Ainda não respondida'}${x.s ? ' · ' + esc(x.s) : ''}</small></div>
        <div class="dc-bt">${x.obrig ? '<span class="pill info">Necessária</span>' : `<label class="aut-sw"><input type="checkbox" data-aut="${x.k}" ${on ? 'checked' : ''}><span>${on ? 'Sim' : 'Não'}</span></label>`}</div></div>`; };
    el.innerHTML = `<div class="banner info" style="margin-bottom:18px">${ic('shield')}<span><strong>Você decide como o Conectwork fala com você</strong>Cada autorização é separada. Mude as opcionais quando quiser: a mudança vale na hora e fica registrada com data e versão do texto.</span></div>
      <section class="card" id="aut-nec" style="margin-bottom:22px"><div class="card-h"><span class="ic">${ic('lock')}</span><h3>Necessárias para usar o Conectwork</h3></div>${lista().filter(x => x.obrig).map(linha).join('')}
        <p class="hint" style="margin:0;padding:10px 20px;font-size:12.5px;border-top:1px solid var(--line)">Servem para prestar o serviço que a sua empresa contratou (cadastro, contratos, notas e pagamentos). Para retirar, peça o encerramento da sua conta à equipe Conectwork: os registros que a lei manda guardar continuam guardados pelo prazo legal.</p></section>
      <section class="card" id="aut-opc" style="margin-bottom:22px"><div class="card-h"><span class="ic">${ic('mail')}</span><h3>Opcionais</h3></div>${lista().filter(x => !x.obrig).map(linha).join('')}</section>
      <section class="card" id="aut-hist"><div class="card-h"><span class="ic">${ic('clock')}</span><h3>Histórico das suas autorizações</h3><span class="count">${hist.length}</span></div>
        ${hist.length ? `<div class="scroll"><table class="rl-tab"><thead><tr><th>Quando</th><th>Autorização</th><th>Resposta</th><th>Onde</th></tr></thead><tbody>${hist.map(h => `<tr><td>${esc(formatarDataHora(h.revogadoEm || h.em))}</td><td style="white-space:normal">${esc(nomeDe(h.finalidade))}</td><td>${h.aceite ? 'Autorizou' : 'Não autorizou'}</td><td>${esc(h.canal || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint" style="margin:0;padding:14px 20px">Sem registros.</p>'}</section>`;
    el.querySelectorAll('[data-aut]').forEach(c => c.onchange = async () => {
      const k = c.dataset.aut, x = lista().find(y => y.k === k), aceite = c.checked, agora = CW.fb.agora;
      const reg = { uid, finalidade: k, aceite, texto: x.t, textoVersao: versao(), canal: 'minhas-autorizacoes', em: agora() };
      if (!aceite) reg.revogadoEm = agora();
      const b = db.batch(); b.set(db.doc('consentimentos/' + uid + '_' + k), reg); b.set(db.collection('consentimentos_log').doc(), reg);
      try { await b.commit(); U().toast(aceite ? 'Autorizado.' : 'Autorização retirada.'); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); }
      render(el, ctx);
    });
  }

  CW.registrarModulo({
    id: 'autorizacoes', nome: 'Minhas autorizações', icone: 'shield', ordem: 98, menu: false,
    para: ['empresa', 'master'], livre: true, semAprovacao: true,
    telas: { lista: { nome: 'Minhas autorizações', sub: 'O que você autorizou o Conectwork a fazer com os seus dados, com data e versão. Mude as opcionais quando quiser.', render } }
  });
})();
