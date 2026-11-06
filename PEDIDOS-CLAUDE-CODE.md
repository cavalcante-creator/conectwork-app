# Pedidos para o Claude Code

Cole **um pedido por vez**. Só passe para o próximo quando o anterior estiver testado e publicado.

---

## Pedido 1 · Etapa 0 (base do app)

```
Leia o CLAUDE.md, o docs/REQUISITOS-FASE1.md (Etapa 0), o docs/MODELO-DE-DADOS.md e o firestore.rules.
Use o repositório ../painel-colafix como referência de padrão (módulos, login, testes) e o
docs/prototipo-referencia.html como referência de visual e textos.

Monte a Etapa 0 do Conectwork:
1. Estrutura de pastas do CLAUDE.md, sem etapa de build, pronta para GitHub Pages.
2. js/firebase.js lendo window.CONECTWORK_CONFIG do config.js (use o Firebase pela CDN oficial, versão fixa).
3. Tela de login com e-mail e senha e "Esqueci minha senha" (sendPasswordResetEmail), no visual do protótipo.
4. js/sessao.js: depois do login carrega usuarios/{uid}, os acessos (consulta em acessos where uid == meu uid)
   e se existe master/{uid}. Trata: sem acesso (tela com "Cadastrar minha empresa" e "Tenho um convite"),
   um acesso (entra direto), vários (escolher empresa; botão de troca no topo).
5. js/app.js: roteamento por hash #modulo/tela, CW.registrarModulo({id, nome, icone, telas, iniciar}),
   menu lateral e barra de baixo no celular montados pelas permissões (js/permissoes.js com os cargos do CLAUDE.md).
6. js/ui.js com toast, diálogo, painel lateral, máscaras e validação de CNPJ/CPF/e-mail/celular, dinheiro e data.
7. js/log.js com registrarLog(acao, texto, ref) gravando em log/ conforme o modelo de dados.
8. Um módulo "Início" simples mostrando nome da pessoa, empresa e cargo, só para provar que tudo está ligado.
9. Testes: (a) regras do Firestore no emulador com @firebase/rules-unit-testing cobrindo: pessoa sem acesso
   não lê empresa em análise de outra; membro lê a própria empresa; admin não altera o próprio cargo;
   convite só é aceito pelo e-mail certo; log não pode ser editado; (b) teste de tela do login no padrão do painel.
10. Atualize o README com como rodar os testes.

Ao terminar: liste arquivos criados, testes que passaram e o que preciso fazer no console do Firebase.
Não invente regra de negócio: se faltar algo, pergunte.
```

---

## Pedido 2 · Etapa 1 (acesso)

```
Leia de novo o CLAUDE.md e o docs/REQUISITOS-FASE1.md (Etapa 1). Monte a Etapa 1, módulo por módulo,
nesta ordem, com testes ao final de cada um:
1. modulos/cadastro.js: cadastro de empresa começando por "Crie seu acesso" (nome, e-mail, senha forte;
   createUserWithEmailAndPassword + sendEmailVerification; pula se já estiver logado), depois as etapas do
   protótipo com validações reais e CNPJ sem repetir. O rascunho fica só no navegador; no envio grava
   empresas/{id}, empresas/{id}/privado/cadastro e o acesso admin do fundador. Protocolo CW-AAAA-0000.
   Tela "Meu cadastro" para empresa não aprovada, com "Corrigir cadastro".
2. modulos/cadastros-master.js: análise de cadastros para a equipe master (lista por situação, análise com
   documentos conferidos, plano (Essencial, Profissional, Rede ou Gratuito para profissional), módulos,
   aprovar, pedir ajuste e recusar com motivo obrigatório). Não existe taxa por pagamento: a receita é mensalidade.
3. modulos/usuarios.js: usuários e acessos (cargo, ajuste de acesso com extras e sem, bloquear e liberar),
   convites com link e botões "Enviar pelo WhatsApp" (wa.me com mensagem pronta) e "Copiar link",
   reenviar e cancelar convite.
4. Primeiro acesso pelo link do convite (#convite/<token>): criar conta com o e-mail do convite, senha forte,
   aceite de termos; cria o acesso e marca o convite como usado.
5. modulos/historico.js: histórico de alterações com filtro por pessoa e busca (admin e master).
6. modulos/minha-empresa.js: dados aprovados, documentos e módulos contratados.
Todas as ações que mudam dados gravam no log. Atualize firestore.rules e os testes se precisar de algo novo.
Ao terminar: resumo, arquivos, testes e passos no console do Firebase.
```

---

## Pedido 3 · Etapa 2 (motor comum)
Será escrito quando a Etapa 1 estiver no ar. Cobre contratos com modalidade, aceite e medição, espelho de
faturamento, validação tripla, títulos com estados e funções separadas (ver docs/REQUISITOS-FASE1.md).
Antes dele: regras de retenção definidas com o contador e parecer jurídico sobre a modalidade equipe contínua.
