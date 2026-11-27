-- Link de aprovação para o cliente final (sem login). Pode rodar mais de uma vez.

-- Cada link mostra só as peças escolhidas de um perfil. O link em si nunca é guardado: só o "hash" dele.
create table if not exists public.links_aprovacao (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  conta_id uuid not null references public.contas(id) on delete cascade,
  perfil_id text not null,
  nome text,
  itens text[] not null,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  revogado boolean not null default false
);
create index if not exists links_aprovacao_perfil_idx on public.links_aprovacao(conta_id, perfil_id);

-- O que o cliente respondeu em cada peça (a última resposta vale).
create table if not exists public.decisoes_cliente (
  link_id uuid not null references public.links_aprovacao(id) on delete cascade,
  aprovacao_id text not null,
  conta_id uuid not null references public.contas(id) on delete cascade,
  perfil_id text not null,
  decisao text not null check (decisao in ('aprovado', 'ajuste')),
  comentario text,
  nome text,
  em timestamptz not null default now(),
  primary key (link_id, aprovacao_id)
);
create index if not exists decisoes_cliente_perfil_idx on public.decisoes_cliente(conta_id, perfil_id, em);

alter table public.links_aprovacao enable row level security;
alter table public.decisoes_cliente enable row level security;
