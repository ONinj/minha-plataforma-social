# Login: e-mail e senha, link por e-mail e Google

A tela de entrada tem:
- **Entrar** e **Criar conta**, com e-mail e senha.
- **Esqueci minha senha**: manda um link e a pessoa cria uma senha nova.
- **Entrar sem senha (link por e-mail)**: quem preferir recebe um link e entra sem senha.
- **Entrar com Google**: o botão só aparece quando o Google estiver ligado no Supabase.

Depois de entrar, a pessoa continua conectada naquele aparelho (não precisa entrar toda vez).
Quem sempre entrou pelo link pode criar uma senha no menu da conta (bolinha no canto) → **Definir ou trocar senha**.

## 1. Endereços do site no Supabase (2 min, faça agora mesmo)
Supabase → **Authentication → URL Configuration**:
- **Site URL**: `https://SEU-SITE.vercel.app`
- **Redirect URLs** → **Add URL**: `https://SEU-SITE.vercel.app/**` (com os dois asteriscos no final)

Sem isso, o link de "Esqueci minha senha" não abre a janela de senha nova.

## 2. Confirmação de e-mail
Supabase → **Authentication → Sign In / Providers → Email**:
- **Enable Email provider**: ligado.
- **Confirm email**: ligado (recomendado). Quem cria conta recebe um e-mail para confirmar, uma única vez.
  Isso evita que alguém crie contas com o e-mail dos outros para pegar créditos de teste.

O Supabase grátis envia poucos e-mails por hora. Se forem muitos cadastros, configure um SMTP próprio
(Authentication → Emails → SMTP Settings; por exemplo, Resend ou Brevo, que têm plano grátis).

## 3. Login com Google (15 min)
O erro que aparecia ao clicar em "Entrar com Google" era porque o Google ainda não estava ligado no Supabase.
Agora o botão fica escondido até você ligar.

### 3.1 Google Cloud
1. Entre em **console.cloud.google.com** com o seu Gmail.
2. No topo, **Selecionar projeto → Novo projeto** → nome "Central Social" → Criar. Selecione o projeto.
3. Menu ☰ → **APIs e serviços → Tela de consentimento OAuth** (ou "Google Auth Platform").
   - **Começar** → Nome do app: Central Social; e-mail de suporte: o seu.
   - Público: **Externo**. Contato: o seu e-mail. Aceite e **Criar**.
4. Menu → **Clientes** (ou "Credenciais → Criar credenciais → ID do cliente OAuth"):
   - Tipo: **Aplicativo da Web**. Nome: Central Social.
   - **Origens JavaScript autorizadas**: `https://SEU-SITE.vercel.app`
   - **URIs de redirecionamento autorizados**: cole o endereço que o Supabase mostra no passo 3.2
     (é parecido com `https://xxxxx.supabase.co/auth/v1/callback`).
   - **Criar**. Copie o **ID do cliente** e a **Chave secreta do cliente**.
5. Volte na **Tela de consentimento → Público** e clique em **Publicar app** (senão só você consegue entrar).

### 3.2 Supabase
1. **Authentication → Sign In / Providers → Google**.
2. Copie o **Callback URL (for OAuth)** que aparece ali e cole no passo 4 acima.
3. Ligue **Enable Sign in with Google**, cole o **Client ID** e o **Client Secret** → **Save**.

Recarregue o site: o botão "Entrar com Google" aparece sozinho.
Quem já tinha conta com o mesmo e-mail entra na mesma conta.
