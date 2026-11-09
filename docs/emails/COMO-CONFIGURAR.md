# E-mails do Conectwork no Firebase

Os textos dos e-mails ficam no console do Firebase (não no código).
Console → projeto **conectwork** → **Authentication** → aba **Modelos** (Templates).

## 1. Link dos e-mails abre o próprio Conectwork
Em qualquer modelo, clique no lápis e depois em **Personalizar URL de ação** e cole:

    https://conectwork.com.br/

Salve. Vale para todos os modelos (senha nova, confirmar e-mail, trocar e-mail). O app já sabe abrir esses links.

## 2. Redefinição de senha
- **Nome do remetente:** Conectwork
- **Assunto:** Crie uma senha nova no Conectwork
- **Mensagem:** apague o texto e cole todo o conteúdo de `redefinir-senha.html`.

## 3. Verificação de endereço de e-mail
- **Nome do remetente:** Conectwork
- **Assunto:** Confirme o seu e-mail no Conectwork
- **Mensagem:** cole `confirmar-email.html` (se o Firebase não deixar editar a mensagem deste modelo, troque só o nome do remetente e o assunto).

## 4. Idioma
No topo da aba Modelos, troque o idioma dos modelos para **Português (Brasil)**.

## 5. Trocar o e-mail de acesso (Meus dados)
O modelo **Alteração de endereço de e-mail** (o que avisa o e-mail ANTIGO) e o link de confirmação mandado ao e-mail NOVO
usam o mesmo endereço do item 1. Basta o nome do remetente "Conectwork" e o idioma em português.
Se a troca disser "ainda não está ligada", confira em **Authentication › Configurações › Ações do usuário** se a
proteção de enumeração de e-mail está ligada (é o padrão): a troca usa o link de confirmação, que funciona com ela.

## 6. Remetente com o domínio próprio
Passo a passo em `REMETENTE-PROPRIO.md` (os e-mails passam a sair de `nao-responda@conectwork.com.br`).
