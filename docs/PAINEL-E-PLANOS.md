# Painel de administração e planos

## Ligar (1 min)
Supabase → **SQL Editor → New query** → cole todo o arquivo `supabase/migrations/004_planos_v2_painel.sql` → **Run**.
Ele atualiza os preços e benefícios dos planos, cria o registro de pagamentos e o alerta de gasto.

## Planos

| | Essencial | Profissional | Premium | Empresa |
|---|---|---|---|---|
| Preço | R$ 69,90 | R$ 159,90 | R$ 379,90 | sob consulta |
| Créditos/mês | 420 | 1.000 | 2.400 | combinado |
| Perfis de clientes | 2 | 5 | 15 | 50 |
| Claude | Sonnet | Sonnet e Opus | Sonnet e Opus | Sonnet e Opus |
| Capricho do gerente | Médio | Alto | Máximo | Máximo |
| Imagens | Nano Banana 2 | + Pro | + Pro | + Pro |
| Veo 3.1 | Lite | Lite e Fast | Lite, Fast e completo | todos |
| Seedance | até 480p | até 720p | até 1080p | até 1080p |
| Biblioteca de referências | ✓ | ✓ | ✓ | ✓ |
| Importar do Google Drive | — | ✓ | ✓ | ✓ |
| Publicação automática por mês, por perfil | 4 reels, 8 stories, 4 posts | 8 reels, 16 stories, 12 posts | sem limite | sem limite |
| Perfis com publicação automática | 1 | 3 | 15 | 50 |
| Sobra de créditos que acumula | até 25% | até 50% | até 100% | até 100% |
| Desconto nas recargas | — | 5% | 10% | 15% |
| Atendimento | e-mail | WhatsApp | WhatsApp prioritário | dedicado |

Em todos os planos, quem tem o próprio Metricool pode publicar por ele.
Recargas (não vencem): 100 créditos R$ 14,90 · 500 por R$ 69,90 · 1.500 por R$ 199,90 (com o desconto do plano).

Conta de bolso: 1 crédito = R$ 0,10 de IA. Se o cliente gastar tudo, a IA custa uns 60 a 63% do preço do plano.
O resto paga as taxas do Asaas, impostos, servidores e o seu lucro. Na prática, muita gente não usa tudo.

Quem já assina continua pagando o valor antigo até trocar de plano (é o mais justo e evita reclamação).
Os benefícios novos valem para todos na hora.

## Limite de publicação automática
Rode `supabase/migrations/006_cota_publicacao.sql` no SQL Editor para ligar.
- Conta por perfil e por mês do calendário (pela data de publicação). Vira o mês, renova.
- Só contam as publicações agendadas, publicando ou publicadas. Canceladas e com erro não contam.
- Quem usa o Metricool próprio não tem limite.
- Passou do limite: a peça é entregue normalmente para postar manualmente.
- O gerente pergunta antes de planejar: (1) só o que cabe no plano, (2) campanha completa marcando o que sai sozinho, ou (3) só os arquivos.
- Os números ficam no banco (tabela planos, campo publicacao_mensal). Para mudar, me peça ou edite no SQL Editor.

## Painel (Administração)
- **Visão geral**: alertas, quanto entrou no mês (bruto e líquido), custo de IA, quanto sobrou, receita recorrente,
  clientes ativos/em teste/atrasados, créditos em aberto, gráfico do custo por dia, onde o custo está indo
  (Claude, imagens, Veo, Seedance, voz), contas que mais gastam, últimos pagamentos e integrações ligadas.
- **Configurações da plataforma** (na Visão geral):
  - **Câmbio**: o valor do dólar usado nos créditos. O painel mostra o dólar do dia e avisa quando estiver diferente.
  - **Margem**: 0% = cada crédito vale R$ 0,10 de IA. Com 20%, cada ação gasta 20% mais créditos.
  - **Limite de gasto mensal**: a partir de 80% aparece aviso no painel e quando você entra na plataforma.
- **Contas**: busca, plano de cada um, saldo, uso, custo e o botão Gerenciar (plano, créditos, Metricool).
- **Planos e preços**: mude preço, créditos e número de perfis. Mostra quanto a IA custa no máximo e fica
  amarelo/vermelho se passar de 60%/70% do preço.

Os pagamentos aparecem no painel a partir do primeiro pagamento depois de rodar o arquivo 004.
