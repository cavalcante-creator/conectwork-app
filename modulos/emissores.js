/* Conectwork · equipe Conectwork: sites para emitir a nota fiscal de serviço, por cidade.
   O botão "Emitir a nota" do espelho escolhe o site sozinho: o que a empresa definiu, senão o da cidade da empresa
   nesta tabela (config/emissores), senão o Emissor Nacional (gov.br). Aqui ficam só as cidades que ainda usam
   site próprio da prefeitura. */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const UFS = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ');
  const chave = (uf, cid) => (String(uf || '').toUpperCase() + '|' + String(cid || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim());

  async function render(el, ctx) {
    const { esc, ic } = U(), db = CW.fb.db();
    el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Carregando…</span></div></div>`;
    let tab = {};
    try { tab = (CW.fb.dados(await db.doc('config/emissores').get()) || {}).cidades || {}; } catch (e) { el.innerHTML = `<div class="banner danger">${ic('alert')}<span><strong>Não foi possível abrir a tabela.</strong>${esc(CW.fb.mensagemErro(e))}</span></div>`; return; }
    const linhas = Object.entries(tab).sort((a, b) => a[0].localeCompare(b[0]));
    el.innerHTML = `<div class="banner info" style="margin-bottom:18px">${ic('help')}<span><strong>Padrão: Emissor Nacional (gov.br)</strong>Cadastre aqui só as cidades que ainda emitem a nota no site da prefeitura. Cada empresa também pode definir o próprio site no espelho ("Não é esse o site?").</span></div>
      <section class="card" id="em-lista"><div class="card-h"><span class="ic">${ic('net')}</span><h3>Cidades com site próprio</h3><span class="count">${linhas.length}</span></div>
        ${linhas.length ? `<div class="scroll"><table class="resp"><thead><tr><th>Cidade</th><th>Site</th><th></th></tr></thead><tbody>
          ${linhas.map(([k, v]) => `<tr><td><strong>${esc(v.cidade || k.split('|')[1])}/${esc(k.split('|')[0])}</strong></td><td style="overflow-wrap:anywhere">${esc(v.url)}</td><td class="r"><button class="btn ghost sm" data-tirar="${esc(k)}">Tirar</button></td></tr>`).join('')}
        </tbody></table></div>` : `<div class="empty"><div class="ic">${ic('net')}</div><strong>Nenhuma cidade cadastrada.</strong><span>Todas as empresas usam o Emissor Nacional.</span></div>`}
        <div class="card-b"><form class="fgrid" id="em-form" novalidate>
          <label class="f c3"><span>UF</span><select id="em-uf"><option value="">UF</option>${UFS.map(u => `<option>${u}</option>`).join('')}</select></label>
          <label class="f c9"><span>Cidade</span><input id="em-cid" maxlength="80" placeholder="Ex.: Gravataí"></label>
          <label class="f c12"><span>Site para emitir a nota</span><input id="em-url" type="url" inputmode="url" maxlength="300" placeholder="https://..."></label>
          <p class="err c12" id="em-erro" role="alert"></p>
          <div class="c12"><button class="btn" id="em-add">${ic('plus')}Acrescentar cidade</button></div></form></div></section>`;
    const grava = async (novo, txt) => {
      const b = db.batch();
      b.set(db.doc('config/emissores'), { cidades: novo, em: CW.fb.agora(), por: ctx.sessao.usuario.uid });
      b.set(db.collection('log').doc(), { em: CW.fb.agora(), uid: ctx.sessao.usuario.uid, quem: (ctx.sessao.perfil && ctx.sessao.perfil.nome) || ctx.sessao.usuario.email, empresaId: 'conectwork', acao: 'config.emissores', texto: txt, ref: '' });
      try { await b.commit(); U().toast('Tabela guardada.'); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); }
      render(el, ctx);
    };
    el.querySelectorAll('[data-tirar]').forEach(bt => bt.onclick = () => { const n = Object.assign({}, tab), k = bt.dataset.tirar; delete n[k]; grava(n, 'Cidade tirada da tabela de sites de emissão: ' + k.replace('|', ' · ') + '.'); });
    document.getElementById('em-form').onsubmit = ev => {
      ev.preventDefault();
      const uf = document.getElementById('em-uf').value, cid = document.getElementById('em-cid').value.trim().replace(/\s+/g, ' '), url = document.getElementById('em-url').value.trim(), er = document.getElementById('em-erro');
      if (!uf || cid.length < 2) { er.textContent = 'Informe a UF e a cidade.'; return; }
      if (!/^https:\/\/[^\s.]+\.[^\s]+$/i.test(url)) { er.textContent = 'Informe o site completo, começando com https://'; return; }
      grava(Object.assign({}, tab, { [chave(uf, cid)]: { cidade: cid, url } }), `Site de emissão de ${cid}/${uf}: ${url}.`);
    };
  }

  CW.registrarModulo({
    id: 'emissores', nome: 'Sites de emissão', nomeCurto: 'Emissão', icone: 'net', ordem: 12, para: ['master'],
    telas: { lista: { nome: 'Sites para emitir a nota', sub: 'O botão "Emitir a nota" usa o Emissor Nacional, menos nas cidades desta lista.', render: (el, ctx) => render(el, ctx) } }
  });
})();
