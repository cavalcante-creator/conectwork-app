# CLAUDE.md · Conectwork

Leia este arquivo inteiro antes de qualquer tarefa. Ele vale mais do que qualquer suposição.

## O que é
Plataforma que liga três elos: **contratante** (indústria, ex.: Colafix), **intermediária** (empresa que fornece profissionais, ex.: Zenith, Nexus) e **prestador** (profissional MEI). O fluxo central: fechamento do valor → pedido de nota → envio e conferência do XML → pagamento → histórico. Fase 1 = piloto na Colafix.

## Como o projeto é feito (igual ao painel da Colafix)
- JavaScript puro, **sem etapa de build**, publicado no **GitHub Pages**.
- **Firebase**: Authentication (e-mail e senha) e Firestore. Projeto `conectwork`, **separado** do projeto do painel da Colafix.
- Use o repositório irmão `../painel-colafix` como **referência de padrão**: como os módulos são registrados, como o login é tratado, como os testes são feitos. Copie o jeito, não copie dados nem regras de negócio da Colafix.
- Visual e textos: siga `docs/prototipo-referencia.html` (cores, fonte, componentes, modo claro e escuro). O protótipo é a referência visual e de fluxo; o código dele é só ilustrativo e **não** deve ser copiado como base (ele guarda tudo em localStorage).

## Estrutura de pastas
```
index.html            casca do app (layout, menu, carregamento)
config.js             configuração do Firebase (vai para o repositório: o GitHub Pages precisa dele; a segurança vem das regras)
css/app.css           estilos (tokens de cor do protótipo, claro e escuro)
js/firebase.js        inicialização do Firebase e helpers de banco
js/sessao.js          login, logout, troca de empresa, usuário e acesso atuais
js/permissoes.js      cargos, módulos por empresa, ajuste por pessoa
js/app.js             roteamento por hash (#modulo/tela), menu, registro de módulos
js/ui.js              componentes: toast, diálogo, painel lateral, tabelas, formulários, máscaras
js/log.js             registro no histórico de alterações
modulos/<nome>.js     um arquivo por módulo, registrado com CW.registrarModulo({...})
modulos/lista.js      lista dos módulos carregados
firestore.rules       regras de segurança
testes/               testes automatizados
```

## Regras de ouro
1. **Cada empresa só vê o que é dela.** Todo documento tem `empresaId` (ou `partes` quando envolve duas empresas). A segurança vem do `firestore.rules`, nunca só da tela. Toda mudança de coleção ou campo atualiza as regras **e** os testes das regras.
2. **Permissão em dois níveis:** módulos ligados por empresa (equipe Conectwork) e cargo por pessoa (administrador da empresa), com ajuste individual (`extras` e `sem`), no mesmo modelo de `acessos` do painel da Colafix.
3. **Toda ação que muda dados grava no histórico** (`log`), com quem, quando, empresa e o que foi feito. O histórico não pode ser editado nem apagado.
4. **Nada de segredo no front.** Certificado digital, chaves de API de WhatsApp, banco ou NFS-e só no servidor (Cloud Functions, em etapa futura). Se uma tarefa exigir isso, pare e avise.
5. **Linguagem de PJ.** Prestador é **profissional** ou **prestador**, nunca "funcionário". Fim de contrato é **encerramento do serviço**, nunca "demissão". Pagamento é **pagamento da nota**, nunca "salário". Isso reduz risco trabalhista; não negocie esta regra.
6. **Textos em português do Brasil**, simples, sem jargão. Erros dizem o que aconteceu e o que fazer.
7. **Validações reais:** CNPJ e CPF por dígito verificador, e-mail, celular com DDD, datas.
8. **LGPD:** só guarde o necessário. Dados bancários e documentos ficam em área privada da empresa. Nada de dados pessoais em logs além de nome e e-mail.
9. **Sem dados fictícios em produção.** Dados de exemplo só no ambiente `teste`.
10. **Testes antes de subir:** cada pedido termina com os testes passando e a lista do que foi testado.

## Cargos (dentro de cada empresa)
| Cargo | O que vê |
|---|---|
| admin | Tudo da empresa; convida pessoas, define cargos, ajusta acessos |
| financeiro | Pagar, receber, relatórios, conta, dados da empresa |
| rh | Fechamentos, integração, relatórios, catálogo |
| operacional | Notas a emitir, profissionais, catálogo |
| contador | Só leitura: cobranças e relatórios |
| consulta | Só leitura das telas liberadas |
A **equipe Conectwork** (master) não é cargo: é quem tem o documento `master/{uid}`.

## Como entregar cada pedido
- Trabalhe numa etapa por vez, como está em `PEDIDOS-CLAUDE-CODE.md`.
- Ao terminar: resumo do que mudou, arquivos criados ou alterados, testes feitos, e o que a pessoa precisa fazer no console do Firebase (se houver).
- Se algo do pedido conflitar com este arquivo, este arquivo vence. Pergunte antes de inventar regra de negócio.
