# Ligar a publicação automática pelo Metricool

Tudo já está pronto no site. Enquanto as chaves do Metricool não estiverem na Vercel, nada muda para ninguém.
Quando você colocar, a publicação automática liga sozinha.

Existem dois jeitos, e os dois podem funcionar ao mesmo tempo:

- **Metricool da plataforma (o seu):** você assina o Metricool Advanced, cria uma "marca" para cada cliente e
  liga cada perfil da plataforma à marca dele. Vale para todos os planos pagos (Essencial e Profissional com limite mensal; Premium e Empresa sem limite).
- **Metricool próprio do cliente:** quem já assina o Metricool Advanced coloca o userId e o token dele em
  **Configurações → Meu próprio Metricool**. Funciona em qualquer plano (o cliente já paga o Metricool dele).

## 1. Banco de dados (1 min, faça agora mesmo)
Supabase → **SQL Editor → New query** → cole todo o arquivo `supabase/migrations/002_instagram.sql` → **Run**.
Depois, outra **New query** com todo o arquivo `supabase/migrations/003_metricool.sql` → **Run**.
Tem que aparecer "Success" nos dois. Pode rodar de novo sem problema.

## 2. Chave de segurança (1 min, se ainda não fez)
Vercel → **Settings → Environment Variables**. Se ainda não existir, crie:

| Nome | Valor |
|---|---|
| `CHAVE_CRIPTO` | um texto aleatório longo (40+ letras e números). **Nunca troque depois.** Ele protege os tokens dos clientes |

## 3. Quando assinar o Metricool Advanced (5 min)
1. No Metricool: clique na sua foto → **Configurações da conta** → aba **API**.
2. Copie o **userId** (um número) e o **token** (userToken).
3. Vercel → **Settings → Environment Variables** → crie:

| Nome | Valor |
|---|---|
| `METRICOOL_USER_ID` | o userId |
| `METRICOOL_USER_TOKEN` | o token |

4. **Deployments → ⋯ → Redeploy.**

## 4. Para cada cliente (3 min por cliente)
1. No Metricool, crie uma **marca** para o cliente.
2. Conecte o Instagram (e Facebook, TikTok, se quiser) nessa marca. Se a conta não é sua, use o **link de conexão**
   do Metricool (na marca, a opção de convidar/enviar link para conectar as redes). Copie esse link.
3. Na plataforma: **Administração → Gerenciar** (na conta do cliente) → parte **Metricool** →
   escolha a marca de cada perfil e, se quiser, cole o link de conexão → **Salvar**.
4. Confira se a conta do cliente está num plano pago e se ainda cabe mais um perfil com publicação no plano dele.

Pronto. O cliente vê em **Perfis e redes**: "✅ Pronto para publicar sozinho" e o botão para (re)conectar as redes.

## Como funciona no dia a dia
- Ao **aprovar** uma peça com data, a opção "Publicar automaticamente" já vem marcada.
  Ou, no **Calendário**, abra o item → "Publicar automaticamente na data" / "Publicar agora" (sai em ~2 min).
- A plataforma manda para o Metricool a imagem/vídeo, a legenda com hashtags, a data (horário de Brasília) e as redes
  marcadas no post. Quem publica é o Metricool, na hora certa.
- O calendário mostra 📸 Automático → 📸 Publicado ↗ (com o link) ou 📸 Erro (com o motivo).
- Mudou a data ou a legenda? Salve o item: a plataforma troca o agendamento no Metricool.
  Cancelou? Ele some do Metricool também.

## Se der problema
- **"Metricool (401)"**: userId ou token errados. Confira na aba API do Metricool.
- **"Essa data já passou"**: o Metricool só aceita horários futuros. Use "Publicar agora".
- **Erro no post**: abra o Metricool e veja a marca. Geralmente é a rede desconectada (mande o link de conexão de novo).
