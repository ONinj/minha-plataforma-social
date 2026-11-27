# Link de aprovação para o cliente final

## Ligar (1 min)
Supabase → **SQL Editor → New query** → cole `supabase/migrations/008_aprovacao_cliente.sql` → **Run**.

## Como usar
1. Em **Aprovações**, clique em **📤 Enviar para o cliente aprovar**.
2. Escolha as peças (todas as que estão aguardando já vêm marcadas), o nome do cliente e por quantos dias o link vale.
3. **Gerar link** → **Enviar pelo WhatsApp** ou **Copiar mensagem com o link**.
4. O cliente abre no celular, sem login, vê as imagens/vídeos, legenda e data, e toca em **Aprovar** ou **Pedir ajuste**
   (com o comentário). Ele pode mudar a resposta enquanto o link valer.
5. As respostas chegam sozinhas em **Aprovações** (aviso na tela e selo em cada peça). Pedido de ajuste tem o botão
   **Mandar o ajuste para o gerente**. A aprovação final continua sendo sua (o cliente aprovar não publica nada sozinho).

## Segurança
- O link tem um código aleatório longo; no banco fica só o "hash" dele (por isso ele só aparece na hora de criar).
- O cliente vê só as peças escolhidas: nada de conversas, outros perfis ou dados da conta.
- As imagens e vídeos abrem por links temporários (3 horas, renovados a cada visita).
- Dá para **desativar** um link a qualquer momento na mesma janela.
