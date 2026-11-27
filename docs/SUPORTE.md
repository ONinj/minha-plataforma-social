# Chat de suporte e depoimentos

## O que foi criado

**Para o cliente:** um balão de conversa (💬) no topo da tela, ao lado do sino.
- Ele abre uma janela lateral com as conversas dele com a equipe.
- Dá para abrir uma conversa nova (assunto e mensagem) e anexar um print da tela.
- Uma bolinha vermelha aparece quando a equipe responde.
- O cliente nunca vê as notas internas da equipe.

**Para a equipe (só quem está em `ADMIN_EMAILS`):** a aba **Suporte (equipe)**, no menu "Conta".
- **Esquerda:** a fila de conversas. Dá para filtrar por situação (Abertas, Aguardando cliente, Resolvidas), por etiqueta e por "Só minhas", e buscar por e-mail, nome da conta, assunto ou texto das mensagens. As conversas com mensagem nova e as urgentes ficam no topo.
- **Meio:** o chat.
  - **Responder ao cliente:** manda a resposta; a conversa passa para "Aguardando cliente". Se o cliente responder, ela volta para "Aberta".
  - **📝 Nota interna:** um recado só para a equipe, que aparece em amarelo.
  - **⚡ Resposta pronta:** preenche o texto com uma resposta salva.
  - **Enviar e resolver:** responde e já fecha a conversa.
- **Direita:**
  - prioridade (urgente, alta, normal, baixa);
  - responsável (alguém da equipe);
  - etiquetas, que você marca com um clique;
  - os dados do cliente: plano, saldo, uso no mês, perfis, e-mails e data de renovação;
  - as outras conversas do mesmo cliente.
- **Engrenagem (⚙):** cria ou apaga etiquetas (com cor) e respostas prontas.
- O menu lateral mostra quantas conversas têm mensagem nova.

**Depoimentos:** em **Administração › Depoimentos**, você cadastra o que clientes reais disseram (nome, cargo, texto, estrelas). Os que você marca como publicados aparecem na página de vendas, na seção "O que dizem". Enquanto não houver nenhum publicado, essa seção fica escondida.
> Use só depoimentos verdadeiros e com a permissão da pessoa. Depoimento inventado é proibido pelo Código de Defesa do Consumidor e pelo CONAR.

## O que você precisa fazer (1 vez)

1. Abra o **Supabase** e entre no **SQL Editor** (menu da esquerda), depois clique em **New query**.
2. Abra o arquivo `supabase/migrations/010_suporte.sql` aqui do projeto, copie tudo e cole.
3. Clique em **Run**. Deve aparecer "Success".

Antes disso, o balão de suporte mostra o aviso "O suporte ainda está sendo ativado".

> Se ainda não rodou a **008** (link de aprovação) e a **009** (convite de equipe), rode as duas antes, na ordem.

## Como funciona por dentro

- As mensagens ficam no banco, nas tabelas `suporte_*`. Só o servidor lê essas tabelas (o RLS está ligado e sem regras).
- Os prints ficam no armazenamento da própria conta do cliente e abrem por um link temporário.
- Contra abuso: cada mensagem tem até 4000 caracteres, e cada pessoa pode mandar até 40 mensagens por hora.
- A tela confere se há mensagem nova a cada 10 segundos com o chat aberto e a cada 1 minuto com ele fechado. Isso é feito por consultas leves, sem custo extra.
