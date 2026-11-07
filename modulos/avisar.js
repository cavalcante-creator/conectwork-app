/* Conectwork · "Avisar no WhatsApp": abre o WhatsApp com a mensagem pronta e o link da tela no Conectwork.
   Não precisa de servidor: a própria pessoa envia. Quando a mensagem é para a prestadora e o contrato tem o celular do
   interlocutor, a conversa já abre com ele; senão, a pessoa escolhe o contato no WhatsApp.
   Uso: CW.avisar.botao(el, ctx, { frase, rota, contratoId, para: 'prestador' | 'tomador' }) devolve o HTML do botão;
   depois CW.avisar.ligar(el) liga os botões da tela. */
(function () {
  const CW = window.CW = window.CW || {};
  const U = () => CW.ui;
  const dados = {};
  let n = 0;
  const linkDa = rota => location.origin + location.pathname.replace(/index\.html$/, '') + '#' + rota;
  function botao(ctx, op) {
    const id = 'zap-' + (++n); dados[id] = Object.assign({ empresa: ctx.contexto.nome }, op);
    return `<button class="btn ghost sm zap" data-zap="${id}" type="button">${U().ic('send')}Avisar no WhatsApp</button>`;
  }
  async function abrir(op) {
    let cel = '';
    if (op.para === 'prestador' && op.contratoId) {
      try { const c = CW.fb.dados(await CW.fb.db().doc('contratos/' + op.contratoId).get()); cel = U().dig(((c || {}).interlocutor || {}).cel || ''); } catch (e) { cel = ''; }
    }
    const txt = `Olá! Aqui é da ${op.empresa}. No Conectwork: ${op.frase}\n${linkDa(op.rota)}`;
    const url = (cel.length >= 10 ? 'https://wa.me/55' + cel : 'https://wa.me/') + '?text=' + encodeURIComponent(txt);
    try { window.open(url, '_blank', 'noopener'); } catch (e) {}
  }
  function ligar(el) { (el || document).querySelectorAll('[data-zap]').forEach(b => { b.onclick = () => { const op = dados[b.dataset.zap]; if (op) abrir(op); }; }); }
  CW.avisar = { botao, ligar, abrir, linkDa };
})();
