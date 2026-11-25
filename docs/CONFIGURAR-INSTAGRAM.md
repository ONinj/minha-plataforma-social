# Ligar a publicação automática no Instagram

Pré-requisito: o modo nuvem já funcionando (docs/CONFIGURAR-NUVEM.md).

## 1. Banco de dados (2 min)
Supabase → **SQL Editor → New query** → cole o arquivo `supabase/migrations/002_instagram.sql` → **Run**.
Depois faça o mesmo com `supabase/migrations/003_metricool.sql`.

## 2. App na Meta (20 min)
1. Entre em **developers.facebook.com** com o seu Facebook → **My Apps → Create App**.
2. Caso de uso: **Manage messaging & content on Instagram** (API do Instagram). Tipo: **Business**. Dê um nome (ex.: Central Social).
3. No painel do app: **Instagram → API setup with Instagram login**.
4. Em **Set up Instagram business login → Business login settings**:
   - **OAuth redirect URIs**: `https://SEU-SITE.vercel.app/api/instagram/retorno`
   - **Deauthorize callback URL** e **Data deletion request URL**: `https://SEU-SITE.vercel.app/exclusao-de-dados`
5. Copie o **Instagram app ID** e o **Instagram app secret** (ficam nessa mesma tela; não confunda com o App ID do Facebook).
6. **App settings → Basic**: Privacy Policy URL = `https://SEU-SITE.vercel.app/privacidade`.
7. Enquanto o app está em **Development**, só contas adicionadas como testadoras funcionam:
   **App roles → Roles → Add People → Instagram Tester** → digite o @ da conta.
   No Instagram (celular): **Configurações → Apps e sites → Convites de testador** → aceitar.
   A conta precisa ser **profissional** (Empresa ou Criador de conteúdo).

## 3. Vercel (5 min)
Adicione em Settings → Environment Variables e faça Redeploy:

| Nome | Valor |
|---|---|
| `INSTAGRAM_APP_ID` | Instagram app ID |
| `INSTAGRAM_APP_SECRET` | Instagram app secret |
| `CHAVE_CRIPTO` | um texto aleatório longo (40+ letras e números). **Não troque depois**: ele protege os tokens salvos |
| `CRON_SECRET` | outro texto aleatório longo (é a senha do relógio) |
| `NEXT_PUBLIC_EMAIL_CONTATO` | (opcional) e-mail de contato que aparece na política de privacidade |

## 4. Relógio que publica na hora (5 min)
Supabase → **Database → Extensions**: ligue **pg_cron** e **pg_net**.
Depois, no **SQL Editor**, rode (troque o endereço e o segredo):

```sql
select cron.schedule('publicar-instagram', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://SEU-SITE.vercel.app/api/cron/publicar',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'O_MESMO_CRON_SECRET_DA_VERCEL'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);
```

Ele chama a plataforma a cada 5 minutos: publica o que já passou da hora e renova os tokens que estão para vencer.
Para conferir: `select * from cron.job_run_details order by start_time desc limit 5;`
Para remover: `select cron.unschedule('publicar-instagram');`

## 5. Usar
1. A publicação automática está liberada nos planos **Premium** e **Empresa** (tabela `planos`, campo `instagram`).
   Para a sua própria conta, use **Administração → Gerenciar → plano Empresa, status ativo**.
2. **Perfis e redes → Conectar Instagram** → autorize no Instagram.
3. Ao **aprovar** uma peça com data, deixe marcado “Publicar automaticamente no Instagram”. Ou abra o item no
   **Calendário** → “Publicar automaticamente na data” / “Publicar agora”.
4. O calendário mostra 📸 Automático → 📸 Publicando… → 📸 Publicado ↗ (link do post) ou 📸 Erro (com o motivo).

## Para publicar nas contas dos clientes (App Review)
No modo Development só funcionam as contas testadoras. Para qualquer cliente conectar:
1. **App settings → Basic**: ícone, categoria, e-mail de contato, URLs de privacidade e exclusão (já existem).
2. **Business verification** da sua empresa (documentos/CNPJ).
3. **App Review → Permissions and features**: peça **Advanced Access** para `instagram_business_basic` e
   `instagram_business_content_publish`, com um vídeo mostrando o fluxo (conectar → agendar → publicado).
4. Depois de aprovado, mude o app para **Live**.

Formatos suportados: post com imagem, carrossel (2 a 10 mídias), reels (vídeo) e story (imagem ou vídeo).
As imagens são convertidas para JPEG automaticamente. Limite do Instagram: cerca de 50 a 100 publicações pela API por conta a cada 24 h.
