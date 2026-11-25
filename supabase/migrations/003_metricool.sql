-- Central Social: publicação automática pelo Metricool.
-- Rode no Supabase (SQL Editor → New query → cole → Run). Pode rodar de novo sem problema.

-- Metricool próprio de uma conta (quem tem assinatura do Metricool pode usar a dela).
create table if not exists public.metricool_contas (
  conta_id uuid primary key references public.contas(id) on delete cascade,
  user_id text not null,
  token_cifrado text not null,            -- userToken criptografado (CHAVE_CRIPTO)
  atualizado_em timestamptz not null default now()
);

-- Qual marca do Metricool publica por cada perfil.
create table if not exists public.metricool_marcas (
  perfil_id text primary key,
  conta_id uuid not null references public.contas(id) on delete cascade,
  blog_id text not null,
  nome text,
  origem text not null default 'plataforma' check (origem in ('plataforma','propria')),
  link_conexao text,                       -- link temporário do Metricool para o cliente conectar as redes
  atualizado_em timestamptz not null default now()
);
create index if not exists metricool_marcas_conta_idx on public.metricool_marcas(conta_id);

-- A fila de publicações passa a saber por onde saiu (Instagram direto ou Metricool).
alter table public.publicacoes add column if not exists via text not null default 'instagram';
alter table public.publicacoes add column if not exists externo_id text;

alter table public.metricool_contas enable row level security;
alter table public.metricool_marcas enable row level security;
