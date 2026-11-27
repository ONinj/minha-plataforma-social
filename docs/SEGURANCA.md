# Segurança: o que foi corrigido e o que conferir

## 1. Rode a atualização do banco (2 min)
Supabase → **SQL Editor → New query** → cole todo o arquivo `supabase/migrations/007_seguranca.sql` → **Run**.
Ela liga a reserva de créditos, a trava contra contas duplicadas, os limites da pasta de arquivos e a cota de espaço por plano.
Enquanto ela não rodar, o site continua funcionando como antes (sem a proteção nova de saldo).

Depois rode no SQL Editor (tem que voltar **vazio**):
```sql
select tablename from pg_tables where schemaname = 'public' and rowsecurity = false;
```

## 2. O que mudou no site
- **Créditos reservados antes de usar a IA:** pedidos disparados ao mesmo tempo não furam mais o saldo.
- **Vídeos:** o modelo do Seedance, a duração, a resolução e a proporção são conferidos no servidor; a duração
  do vídeo de referência é medida no arquivo. Créditos de vídeo só voltam quando o fal.ai diz que falhou.
- **Voz:** cobrada pelo tamanho do áudio, não pelo número que o navegador manda.
- **Administração:** além de estar em `ADMIN_EMAILS`, o e-mail precisa estar **confirmado** no Supabase.
- **Perfis:** ninguém consegue ligar Metricool, Instagram ou publicações num perfil de outra conta.
- **Arquivos:** só imagem, vídeo, áudio e PDF, até 300 MB cada, com espaço por plano
  (Teste 1 GB · Essencial 5 GB · Profissional 15 GB · Premium 50 GB · Empresa 200 GB).
- **Diagnóstico (`/api/saude`):** o público vê só "ok/erro"; os detalhes ficam em Administração → Visão geral → Diagnóstico.
- **Cobrança:** antes de dar créditos, o site confere o pagamento na API do Asaas; o valor pago é conferido;
  mensalidade estornada também tira os créditos (uma vez só).
- **Conta nova:** dois acessos ao mesmo tempo não criam duas contas (nem dois bônus).

## 3. Conferir fora do código
1. Supabase → Authentication → Sign In / Providers → Email: **Confirm email ligado**.
2. Supabase → Authentication → Rate Limits e Attack Protection: limites de e-mail/OTP, **CAPTCHA** e proteção de senhas vazadas.
3. Supabase → Storage → midias: **privada** (a atualização 007 já coloca os limites).
4. Vercel → Environment Variables: chaves secretas marcadas como **Sensitive**; nenhuma com `NEXT_PUBLIC_` além da URL e da chave anon do Supabase.
5. Anthropic e fal.ai: **limite mensal de gasto** e recarga automática.
6. Asaas: token do webhook longo e aleatório.
7. Verificação em duas etapas em GitHub, Vercel, Supabase, Asaas, Google, Anthropic e fal.ai.
8. Chaves que já apareceram em prints, conversas ou e-mails: gere novas.
