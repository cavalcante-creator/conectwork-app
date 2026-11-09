# E-mails saindo de nao-responda@conectwork.com.br

Hoje os e-mails do login (senha nova, confirmar e-mail, trocar e-mail) saem de
`noreply@conectwork-4c285.firebaseapp.com`. Com o domínio próprio eles saem de `nao-responda@conectwork.com.br`:
passa mais confiança e cai menos no spam. Não muda nada no código. São dois lugares: o Firebase (que mostra os
códigos) e o Registro.br (onde os códigos são colados). Leva uns 15 minutos de trabalho e até 48 horas para valer.

## 1. Firebase: pedir o domínio
1. console.firebase.google.com › projeto **conectwork** › **Authentication** › aba **Modelos**.
2. Abra qualquer modelo (por exemplo, **Redefinição de senha**) e toque no lápis.
3. Embaixo de **De**, toque em **Personalizar domínio**.
4. Escreva `conectwork.com.br` e toque em **Continuar**.
5. O Firebase mostra uma tabela com **entradas de DNS** (normalmente 2 do tipo TXT e 2 do tipo CNAME).
   Deixe essa janela aberta: é dela que você copia os valores. Os valores são do seu projeto; copie exatamente.

## 2. Registro.br: colar as entradas
1. registro.br › entre › **conectwork.com.br** › **Editar zona** (é a mesma tela onde ficam as 4 entradas A do GitHub).
2. Para cada linha da tabela do Firebase, toque em **Nova entrada**:
   - **Tipo:** o mesmo da tabela (TXT ou CNAME).
   - **Nome:** o que vem antes de `conectwork.com.br`. Exemplo: se o Firebase mostra `firebase1._domainkey.conectwork.com.br`,
     escreva só `firebase1._domainkey`. Se o Firebase mostra só `conectwork.com.br` (ou `@`), deixe o nome em branco.
   - **Valor / Dados:** cole o valor do Firebase inteiro.
3. Toque em **Salvar alterações** no fim da página. Atenção: se ficar uma "Nova entrada" vazia aberta, o Registro.br
   não salva nada; apague a vazia antes de salvar (foi o que aconteceu com as entradas do GitHub).
4. Só pode existir **uma** entrada TXT que começa com `v=spf1`. Se o Registro.br já tiver uma (por exemplo, de um e-mail
   da empresa), não crie outra: junte as duas numa só, com o `include:` do Firebase antes do `~all`.

## 3. Firebase: conferir
1. Volte à janela do item 1 e toque em **Verificar**. Se disser que ainda não achou, é normal: o DNS leva de alguns
   minutos a 48 horas para espalhar. Tente de novo mais tarde (a janela pode ser fechada e reaberta pelo mesmo caminho).
2. Quando ficar **Verificado**, em cada modelo:
   - **De:** `nao-responda` @ `conectwork.com.br`
   - **Nome do remetente:** Conectwork
   - **Responder para:** um e-mail que alguém leia (por exemplo, o da equipe Conectwork), para quem responder não se perder.
3. Teste: na tela de entrar do app, use **Esqueci minha senha** com o seu e-mail e veja de onde o e-mail chegou.

## Opcional: DMARC (menos spam)
No Registro.br, mais uma entrada **TXT** com nome `_dmarc` e valor:

    v=DMARC1; p=none; rua=mailto:SEU-EMAIL

(troque SEU-EMAIL pelo e-mail que vai receber os relatórios). Com `p=none` nada é bloqueado; só passa a haver relatório.

## Se algo der errado
- **"Não verificado" depois de 48 horas:** confira se o nome foi escrito sem o `.conectwork.com.br` no fim e se o valor
  foi colado inteiro, sem espaço no começo ou no fim.
- **O site parou de abrir:** as entradas A (185.199.108.153 a .111) e o CNAME `www` do GitHub não podem ser apagadas
  nem alteradas; as do e-mail são entradas novas, ao lado delas.
