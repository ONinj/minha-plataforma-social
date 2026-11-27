-- Chat de suporte (clientes ↔ equipe da plataforma) e depoimentos para a página de vendas. Pode rodar mais de uma vez.

create table if not exists public.suporte_conversas (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.contas(id) on delete cascade,
  user_id uuid not null,
  email text,
  assunto text not null,
  status text not null default 'aberta' check (status in ('aberta', 'aguardando', 'resolvida')),
  prioridade text not null default 'normal' check (prioridade in ('baixa', 'normal', 'alta', 'urgente')),
  responsavel text,
  tags text[] not null default '{}',
  nao_lidas_equipe int not null default 0,
  nao_lidas_cliente int not null default 0,
  criado_em timestamptz not null default now(),
  ultima_msg_em timestamptz not null default now()
);
create index if not exists suporte_conversas_conta_idx on public.suporte_conversas(conta_id, ultima_msg_em desc);
create index if not exists suporte_conversas_fila_idx on public.suporte_conversas(status, ultima_msg_em desc);

create table if not exists public.suporte_mensagens (
  id bigserial primary key,
  conversa_id uuid not null references public.suporte_conversas(id) on delete cascade,
  autor text not null check (autor in ('cliente', 'equipe', 'nota', 'sistema')),
  autor_email text,
  texto text not null,
  anexo text,
  criado_em timestamptz not null default now()
);
create index if not exists suporte_mensagens_conversa_idx on public.suporte_mensagens(conversa_id, id);

-- Etiquetas (ex.: cobrança, bug, dúvida) e respostas prontas da equipe.
create table if not exists public.suporte_tags (
  id text primary key,
  nome text not null,
  cor text not null default '#8b5cf6'
);
insert into public.suporte_tags (id, nome, cor) values
  ('duvida', 'Dúvida', '#60a5fa'), ('cobranca', 'Cobrança', '#f59e0b'), ('bug', 'Problema técnico', '#f43f5e'),
  ('sugestao', 'Sugestão', '#22c55e'), ('instagram', 'Instagram/Metricool', '#e879f9'), ('ia', 'IA e créditos', '#8b5cf6')
on conflict (id) do nothing;

create table if not exists public.suporte_respostas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  texto text not null,
  criado_em timestamptz not null default now()
);

-- Depoimentos reais de clientes (cadastrados pela equipe) para a página de vendas.
create table if not exists public.depoimentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cargo text,
  texto text not null,
  nota int not null default 5 check (nota between 1 and 5),
  publicado boolean not null default false,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);

alter table public.suporte_conversas enable row level security;
alter table public.suporte_mensagens enable row level security;
alter table public.suporte_tags enable row level security;
alter table public.suporte_respostas enable row level security;
alter table public.depoimentos enable row level security;
