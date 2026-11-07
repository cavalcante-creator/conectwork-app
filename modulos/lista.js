/* Lista dos módulos carregados. Para incluir um módulo novo: crie modulos/<nome>.js
   (com CW.registrarModulo({...}), ver js/app.js) e acrescente o nome aqui.
   Os arquivos rodam na ordem da lista; depois do último, o app liga (CW.iniciar). */
(function () {
  const MODULOS = ['inicio', 'avisar', 'logos', 'cadastro', 'cadastros-master', 'emissores', 'usuarios', 'convite', 'historico', 'minha-empresa', 'avaliacoes', 'triagem', 'contratos', 'medicoes', 'nfse', 'espelhos', 'titulos', 'relatorios', 'documentos'];
  let faltam = MODULOS.length;
  const pronto = () => { if (--faltam === 0) window.CW.iniciar(); };
  if (!faltam) { window.CW.iniciar(); return; }
  MODULOS.forEach(n => {
    const s = document.createElement('script');
    s.src = 'modulos/' + n + '.js'; s.async = false;
    s.onload = pronto;
    s.onerror = () => { console.error('Módulo não carregou: ' + n); pronto(); };
    document.body.appendChild(s);
  });
})();
