# Ligar o modo nuvem (login, planos, créditos e cobrança)

Enquanto as variáveis abaixo não estiverem na Vercel, a plataforma funciona no **modo local** (cada pessoa usa as
próprias chaves e os dados ficam no navegador). Quando você coloca as variáveis e publica de novo, ela passa a
funcionar no **modo nuvem**:

- login com Google ou link por e-mail;
- dados e arquivos salvos na nuvem (Supabase), iguais em qualquer aparelho;
- as chaves das IAs ficam só no servidor (são as suas) e cada cliente gasta **créditos** do plano;
- assinatura mensal e recargas pelo **Asaas** (Pix, boleto ou cartão);
- painel de **Administração** para você.

Faça na ordem. Leva uns 40 minutos.

---

## 1. Supabase (login, banco e arquivos)

1. Crie uma conta em **supabase.com** e um projeto novo (região: São Paulo). Guarde a senha do banco.
2. Menu **SQL Editor → New query**: cole todo o conteúdo de `supabase/migrations/001_planos_creditos.sql` e clique em **Run**.
   Depois rode, um de cada vez e nesta ordem, os outros arquivos da pasta `supabase/migrations` (002, 003, 004...). Todos podem ser rodados de novo sem problema.
   (Pode rodar de novo no futuro sem problema; ele não apaga nada.)
3. Menu **Authentication → URL Configuration**:
   - **Site URL**: o endereço do seu site na Vercel (ex.: `https://minha-plataforma-social.vercel.app`).
   - **Redirect URLs**: adicione o mesmo endereço.
4. Menu **Authentication → Sign In / Providers**:
   - **Email**: deixe ligado (é o “link de acesso por e-mail”).
   - **Google** (opcional, recomendado): precisa de um “ID do cliente OAuth” do Google Cloud. Siga o link
     “Google” na própria tela do Supabase; ele mostra o endereço de retorno que você cola no Google Cloud. Não
     precisa de faturamento no Google.
5. Pegue os valores para a Vercel:
   - **Project Settings → API**: `Project URL` e a chave `anon`/`publishable` e a chave `service_role`/`secret`.
   - **Project Settings → Database → Connection string → Transaction pooler** (porta **6543**): troque
     `[YOUR-PASSWORD]` pela senha do banco.

> O e-mail de login do Supabase tem limite baixo de envios no plano grátis. Para muitos clientes, configure um
> SMTP próprio em **Authentication → Emails → SMTP** (ex.: Resend, Brevo).

## 2. Asaas (cobrança)

1. Crie uma conta de testes em **sandbox.asaas.com** (depois você repete na conta real, **asaas.com**).
2. **Integrações → Chaves de API → Gerar chave**. Guarde a chave.
3. **Integrações → Webhooks → Adicionar**:
   - URL: `https://SEU-SITE.vercel.app/api/webhooks/asaas`
   - Token de autenticação: invente um texto aleatório com 32 a 255 caracteres, sem espaços (guarde).
   - Eventos: **Cobranças** (pagamento confirmado, recebido, vencido, estornado) e **Assinaturas** (removida/inativada).
   - Versão da API: v3. Deixe a fila **ativa**.

## 3. Vercel (variáveis de ambiente)

No projeto da Vercel: **Settings → Environment Variables**. Adicione (em *Production* e *Preview*):

| Nome | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL do Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave `anon`/`publishable` |
| `SUPABASE_SERVICE_ROLE_KEY` | chave `service_role`/`secret` (**nunca** compartilhe) |
| `DATABASE_URL` | connection string do *Transaction pooler* (porta 6543) com a senha |
| `ANTHROPIC_API_KEY` | sua chave da Anthropic |
| `FAL_KEY` | sua chave do fal.ai |
| `ASAAS_API_KEY` | chave de API do Asaas |
| `ASAAS_AMBIENTE` | `sandbox` para testes; `producao` quando for cobrar de verdade |
| `ASAAS_WEBHOOK_TOKEN` | o token que você inventou no webhook |
| `ADMIN_EMAILS` | seu e-mail de login (vários separados por vírgula) |
| `NEXT_PUBLIC_WHATSAPP` | seu WhatsApp com DDI e DDD, só números (ex.: `5541999999999`) |

Só se o seu projeto Supabase for antigo e usar a chave JWT “legacy” (HS256), adicione também
`SUPABASE_JWT_SECRET` (Project Settings → API → JWT Secret). Projetos novos não precisam.

Depois: **Deployments → … → Redeploy** (as variáveis só valem num deploy novo).

## 4. Primeiro acesso

1. Abra o site: aparece a tela de login. Entre com o e-mail que está em `ADMIN_EMAILS`.
2. Se o navegador tiver os perfis do modo local, aparece **“Importar para a nuvem”**: clique para levar seus
   perfis, conversas e arquivos.
3. Contas novas começam no plano **Teste grátis** com 30 créditos.
4. Teste uma assinatura em **Plano e créditos** com o Asaas em *sandbox* (lá dá para simular o pagamento).
   Quando o webhook chegar, o plano muda e os créditos aparecem.
5. No menu **Administração** você vê todas as contas, o custo de IA do mês e pode mudar planos, montar o plano
   **Empresa** (créditos e valor combinados) e ajustar créditos.

## Como os créditos funcionam

- 1 crédito = R$ 0,10 de custo de IA. Cada ação desconta o **custo real**: Claude pelos tokens usados, imagem por
  imagem, vídeo pela duração (cobrado ao enviar e **devolvido se o vídeo falhar**), voz pela duração do áudio.
- Câmbio e preços ficam na tabela `config_global` do Supabase. Se o dólar ou algum preço mudar, ajuste lá
  (Table Editor) sem precisar publicar de novo. O campo `margem_seguranca` multiplica todos os custos (ex.: 1.1 = 10% a mais).
- Na renovação mensal: os créditos do plano que sobraram passam até o limite de 25% do valor mensal; os créditos de
  **recarga nunca expiram**.
- Pagamento vencido bloqueia o uso até ser pago. Assinatura cancelada deixa usar o saldo que sobrou.
- Os planos (preço, créditos e o que cada um libera) ficam na tabela `planos`.
