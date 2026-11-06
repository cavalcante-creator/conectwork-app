/* Módulo Início (Etapa 0): mostra quem entrou, em qual empresa e com qual cargo.
   Serve para provar que login, sessão, permissões e menu estão ligados. */
(function () {
  const CW = window.CW;
  const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };

  CW.registrarModulo({
    id: 'inicio', nome: 'Início', icone: 'home', ordem: 0,
    para: ['empresa', 'master'], livre: true, semAprovacao: true,
    telas: {
      inicio: {
        nome: 'Início',
        titulo: ctx => { const p = ctx.sessao.perfil; const n = String((p && p.nome) || '').split(' ')[0]; return saudacao() + (n ? ', ' + n : ''); },
        render(el, ctx) {
          const { esc, ic, avatar } = CW.ui, s = ctx.sessao, c = ctx.contexto;
          const nome = (s.perfil && s.perfil.nome) || s.usuario.email;
          const master = c.tipo === 'master';
          const cargo = master ? null : CW.permissoes.cargo(c.acesso.cargo);
          const ajuste = !master && ((c.acesso.extras || []).length || (c.acesso.sem || []).length);
          const vistos = CW.app.visiveis().map(m => `<span class="tag gray">${esc(m.nome)}</span>`).join(' ');
          const aviso = !master && c.empresa.status !== 'aprovado'
            ? `<div class="banner warn" id="ini-analise">${ic('clock')}<span><strong>Cadastro da empresa ainda não aprovado</strong>Enquanto a equipe Conectwork analisa o cadastro, só algumas telas ficam liberadas.</span></div>` : '';
          const leitura = ctx.soLeitura ? `<div class="banner info" id="ini-leitura">${ic('shield')}<span><strong>Acesso só de leitura</strong>Você pode consultar as telas liberadas, mas não altera nada.</span></div>` : '';
          el.innerHTML = `${aviso}${leitura}
            <section class="card" id="ini-quem"><div class="card-b">
              <div class="profile">${avatar(nome, 'lg')}<div class="t"><h2 id="ini-nome">${esc(nome)}</h2>
                <div class="meta"><span class="tag gray">${esc(s.usuario.email)}</span>${master ? '' : CW.sessao.pillStatus(c.empresa.status)}</div></div></div>
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
        }
      }
    }
  });
})();
