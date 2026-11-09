/* Módulo Início: mostra quem entrou, em qual empresa e com qual cargo, o "Precisa de você" e os avisos da equipe Conectwork.
   Para a equipe Conectwork, o Início é o Painel da rede (modulos/rede.js). */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  /* "Precisa de você": tudo o que a pessoa tem para fazer, de todos os módulos (CW.app.pendencias) */
  function pvHtml(ps) {
    const { esc, ic } = U();
    if (!ps.length) return `<div class="pv-ok" id="ini-pv-ok">${ic('check')}Tudo em dia. Quando houver algo para você fazer, aparece aqui.</div>`;
    return `<div class="pv-lista">${ps.map(p => `<button class="pv-it" data-pv="${esc(p.rota)}"><span class="ic">${ic(p.icone)}</span><span class="t"><strong>${esc(p.txt)}</strong><small>${esc(p.sub || '')}</small></span><span class="tag gray">${esc(p.modNome)}</span></button>`).join('')}</div>`;
  }
  function pvDesenha(ps) {
    const b = document.getElementById('ini-pv-b'); if (!b) return;
    b.innerHTML = pvHtml(ps);
    const n = document.getElementById('ini-pv-n'); if (n) { n.textContent = ps.length; n.hidden = !ps.length; }
    b.querySelectorAll('[data-pv]').forEach(x => x.onclick = () => CW.ir(x.dataset.pv));
  }
  window.addEventListener('cw:pendencias', e => pvDesenha(e.detail || []));
  const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };

  CW.registrarModulo({
    id: 'inicio', nome: 'Início', icone: 'home', ordem: 0,
    para: ['empresa', 'master'], livre: true, semAprovacao: true,
    telas: {
      inicio: {
        nome: 'Início',
        titulo: ctx => { const p = ctx.sessao.perfil; const n = String((p && p.nome) || '').split(' ')[0]; return saudacao() + (n ? ', ' + n : ''); },
        render(el, ctx) {
          if (ctx.contexto.tipo === 'master' && CW.rede) return CW.rede.painel(el, ctx);   /* equipe Conectwork: Painel da rede */
          const { esc, ic, avatar } = CW.ui, s = ctx.sessao, c = ctx.contexto;
          const nome = (s.perfil && s.perfil.nome) || s.usuario.email;
          const master = c.tipo === 'master';
          const cargo = master ? null : CW.permissoes.cargo(c.acesso.cargo);
          const ajuste = !master && ((c.acesso.extras || []).length || (c.acesso.sem || []).length);
          const vistos = CW.app.visiveis().map(m => `<span class="tag gray">${esc(m.nome)}</span>`).join(' ');
          const aviso = !master && c.empresa.status === 'suspenso'
            ? `<div class="banner danger" id="ini-suspensa">${ic('lock')}<span><strong>O acesso da empresa está suspenso</strong>${esc(c.empresa.motivo || '')} Os dados continuam guardados. Para voltar a usar, fale com a equipe Conectwork.</span></div>`
            : !master && c.empresa.status !== 'aprovado'
            ? `<div class="banner warn" id="ini-analise">${ic('clock')}<span><strong>Cadastro da empresa ainda não aprovado</strong>Enquanto a equipe Conectwork analisa o cadastro, só algumas telas ficam liberadas.</span></div>` : '';
          const leitura = ctx.soLeitura ? `<div class="banner info" id="ini-leitura">${ic('shield')}<span><strong>Acesso só de leitura</strong>Você pode consultar as telas liberadas, mas não altera nada.</span></div>` : '';
          const pv = !master && c.empresa.status === 'aprovado' ? `<section class="card" id="ini-pv"><div class="card-h"><span class="ic">${ic('alert')}</span><h3>Precisa de você</h3><span class="count" id="ini-pv-n" hidden></span></div><div class="card-b" id="ini-pv-b"></div></section>` : '';
          el.innerHTML = `<div id="ini-avisos" class="stack" style="gap:10px"></div>${aviso}${leitura}${pv}
            <section class="card" id="ini-quem"><div class="card-b">
              <div class="profile">${avatar(nome, 'lg')}<div class="t"><h2 id="ini-nome">${esc(nome)}</h2>
                <div class="meta"><span class="tag gray">${esc(s.usuario.email)}</span><a class="tag" href="#autorizacoes" id="ini-aut">Minhas autorizações</a>${master ? '' : CW.sessao.pillStatus(c.empresa.status)}</div></div></div>
            </div></section>
            <div class="grid-2">
              <section class="card"><div class="card-h"><span class="ic">${ic(master ? 'shield' : 'building')}</span><h3>${master ? 'Acesso' : 'Empresa'}</h3></div><div class="card-b">
                <dl class="dl">
                  <div><dt>${master ? 'Equipe' : 'Empresa'}</dt><dd id="ini-empresa">${esc(c.nome)}</dd></div>
                  <div><dt>Cargo</dt><dd id="ini-cargo">${master ? 'Equipe Conectwork' : esc(CW.permissoes.nomeCargo(c.acesso.cargo))}</dd></div>
                  <div class="full"><dt>O que o cargo permite</dt><dd>${master ? 'Analisa cadastros, libera módulos e acompanha toda a rede.' : esc(cargo ? cargo.desc : 'Cargo não reconhecido. Fale com o administrador da empresa.')}${ajuste ? ' <span class="tag">Acesso ajustado</span>' : ''}</dd></div>
                </dl></div></section>
              <section class="card"><div class="card-h"><span class="ic">${ic('grid')}</span><h3>Telas liberadas para você</h3></div><div class="card-b" id="ini-telas">${vistos}
                <p class="hint" style="margin:12px 0 0;font-size:12.5px">As próximas telas aparecem aqui conforme as etapas do Conectwork forem entrando no ar.</p></div></section>
            </div>`;
          if (pv) pvDesenha(CW.app.pendencias());
          if (CW.avisos) CW.avisos.bloco(document.getElementById('ini-avisos'), ctx);
        }
      }
    }
  });
})();
