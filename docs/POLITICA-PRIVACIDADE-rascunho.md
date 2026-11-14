# Política de privacidade do Conectwork · RASCUNHO

> **Rascunho para revisão jurídica (14/11/2026).** Não publicar sem a revisão e a aprovação de um advogado.
> Os trechos entre colchetes `[ ]` são dados a preencher ou decisões a tomar.
> O texto descreve o que o app faz hoje (código em `modulos/` e regras em `firestore.rules`). Se o app mudar, revisar este texto.

## 1. Quem cuida dos dados

**Controlador dos dados da conta e do uso da plataforma:**
- [RAZÃO SOCIAL], CNPJ [CNPJ], [ENDEREÇO].
- Encarregado (DPO): [NOME], [E-MAIL DO ENCARREGADO].

[A DEFINIR com o jurídico: quando uma empresa registra os dados da equipe dela ou de quem ela contrata (por exemplo, o nome e as horas de um profissional numa medição), a empresa é a controladora desses dados e o Conectwork atua como operador. Confirmar essa divisão e refletir no contrato com as empresas.]

## 2. Que dados usamos

| Dado | De quem | Para quê |
|---|---|---|
| Nome, e-mail, celular | Quem usa o app | Entrar, identificar quem fez cada ação, mandar avisos |
| CNPJ, razão social, endereço, porte, atividade | Empresas e MEIs | Cadastro, análise da empresa, notas e contratos |
| Responsável legal (nome, cargo, celular) | Empresas | Cadastro e contato |
| Documentos e certidões (PDF ou foto) | Empresas | Comprovar a regularidade da empresa (ficam na área privada da empresa) |
| Conta bancária ou chave Pix | Quem recebe | Mostrar a quem paga onde depositar (área privada, com revisão reforçada na troca) |
| Contratos, ordens de serviço, medições (nome do profissional, horas, valor, CNPJ do MEI) | Empresas | Registrar a contratação e o que foi entregue |
| Notas fiscais (XML ou PDF) e comprovantes | Empresas | Conferir a nota e registrar o pagamento |
| Avaliações | Empresas | Reputação e histórico |
| DAS e declaração anual marcados, agenda, lembretes | MEI | Lembretes e o selo "Prestador em dia" |
| Inscrições em cursos e eventos da cidade | MEI que se inscreve | Enviar a inscrição ao parceiro da cidade, com autorização |
| Histórico de ações (quem, quando, empresa, o que fez) | Quem usa o app | Segurança e prova das operações |
| Autorizações (texto, versão, data, canal, finalidade, revogação) | Quem usa o app | Provar o que foi autorizado |

**O que não pedimos:** o Conectwork não pede nem guarda o **CPF** dos profissionais nas medições e nas equipes (usa o CNPJ do MEI). Também não guarda localização, controle de ponto nem dados de saúde. O histórico só guarda nome e e-mail de quem agiu.

## 3. Bases legais (LGPD, art. 7º)

[A CONFIRMAR com o jurídico.]

- **Execução de contrato:** cadastro, contratos, medições, notas, pagamentos e histórico (autorizações "operacional", "contrato" e "cobrança", obrigatórias para usar a plataforma).
- **Cumprimento de obrigação legal:** guarda de registros fiscais e contábeis pelo prazo da lei.
- **Legítimo interesse:** segurança, prevenção a fraude, análise do cadastro e o histórico que não pode ser apagado.
- **Consentimento:** avisos por WhatsApp e e-mail, convites para cursos, ofertas do clube de parceiros e envio de inscrições ao parceiro da cidade.
  - Cursos e ofertas vêm **desmarcados**.
  - Cada consentimento é separado e pode ser retirado a qualquer momento em **Minhas autorizações**.

## 4. Com quem os dados são compartilhados

- **Entre as empresas de uma mesma contratação.** Quem contrata e quem presta veem o contrato, a medição, a nota e o título daquela relação. Cada empresa só vê o que é dela: isso é garantido pelas regras de segurança do banco de dados, não só pela tela.
- **Equipe da prestadora.** Os clientes da prestadora veem nome, função, cidade e "desde quando" dos profissionais que ela marcar como visíveis. Eles nunca veem o CNPJ nem os dados de contato desses profissionais.
- **Parceiro da cidade (por exemplo, a prefeitura).** Recebe só as inscrições feitas com autorização. O Painel da cidade da equipe Conectwork mostra apenas números juntados, sem identificar ninguém, e grupos com menos de 5 pessoas não são mostrados.
- **Parceiros de cursos.** Recebem só a contagem de interessados (sem nome). A inscrição é feita no site do parceiro.
- **Fornecedores de tecnologia.**
  - Google Firebase: autenticação, banco de dados e hospedagem dos dados.
  - GitHub Pages: hospedagem do site.
  - Bibliotecas carregadas do cdnjs para gerar PDF e planilhas no navegador.
  - [A CONFIRMAR: os dados do Firebase podem ficar em servidores fora do Brasil. Indicar a região do projeto e a base da transferência internacional (LGPD, art. 33).]
- **Autoridades**, quando houver obrigação legal ou ordem judicial.

O Conectwork **não vende** dados pessoais e não usa os dados para anúncios.

## 5. Por quanto tempo guardamos

[A DEFINIR com o jurídico e o contador.] Sugestão:
- Dados da conta: enquanto a conta existir.
- Registros fiscais, contratos, notas e pagamentos: pelo prazo legal (por exemplo, 5 anos depois do fim do exercício).
- Histórico de ações: pelo mesmo prazo dos registros a que se refere.
- Inscrições da cidade: até [N] meses depois do evento.
- Consentimentos: enquanto valerem, mais o prazo de prova.

Os registros não são apagados de verdade enquanto a lei exigir: ficam marcados como removidos.

## 6. Seus direitos (LGPD, art. 18)

Você pode pedir:
- confirmação e acesso aos dados;
- correção;
- anonimização, bloqueio ou eliminação do que for desnecessário;
- portabilidade;
- informação sobre com quem compartilhamos;
- revogação do consentimento;
- revisão de decisões automatizadas.

Nome, celular e e-mail de acesso podem ser mudados em **Meus dados**. As autorizações ficam em **Minhas autorizações**. Para os outros pedidos: [E-MAIL DO ENCARREGADO]. Prazo de resposta: [N] dias.

Se a empresa onde você trabalha é a controladora (item 1), o pedido pode ser encaminhado a ela.

## 7. Segurança

- Acesso por login, com cargos por pessoa e funções separadas.
- Regras de segurança no banco de dados: cada empresa só lê o que é dela.
- Dados bancários e documentos em área privada da empresa.
- Histórico que não pode ser editado.
- Nenhuma chave secreta guardada no navegador.

Em caso de incidente com risco relevante, avisaremos os afetados e a ANPD no prazo da regulamentação.

## 8. Armazenamento no aparelho

O app guarda no navegador (armazenamento local) só preferências e atalhos, por exemplo:
- tema claro ou escuro;
- menu recolhido;
- empresa escolhida;
- colunas lembradas da planilha de medição;
- passos já vistos.

Não usamos cookies de publicidade nem rastreadores de terceiros. [A CONFIRMAR: ferramentas de métrica, se forem adotadas.]

## 9. Crianças e adolescentes

A plataforma é para empresas e pessoas com 18 anos ou mais.

## 10. Mudanças nesta política

Mudanças importantes serão avisadas no app e por e-mail. A versão aceita fica registrada junto com cada autorização.

## 11. Contato

Encarregado: [NOME] · [E-MAIL DO ENCARREGADO] · [ENDEREÇO]
