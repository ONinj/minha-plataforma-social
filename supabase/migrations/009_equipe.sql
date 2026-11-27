-- Convite de equipe: o dono convida pessoas (por e-mail) para trabalhar na mesma conta. Pode rodar mais de uma vez.

create table if not exists public.convites (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.contas(id) on delete cascade,
  email text not null,
  papel text not null default 'editor' check (papel in ('editor')),
  token_hash text not null unique,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  aceito_em timestamptz,
  cancelado boolean not null default false
);
create index if not exists convites_conta_idx on public.convites(conta_id);
alter table public.convites enable row level security;

-- Quantas pessoas (contando o dono) podem usar a conta, conforme o plano.
update public.planos set recursos = recursos || '{"max_membros": 1}'::jsonb where id = 'teste';
update public.planos set recursos = recursos || '{"max_membros": 1}'::jsonb where id = 'essencial';
update public.planos set recursos = recursos || '{"max_membros": 3}'::jsonb where id = 'profissional';
update public.planos set recursos = recursos || '{"max_membros": 10}'::jsonb where id = 'premium';
update public.planos set recursos = recursos || '{"max_membros": 50}'::jsonb where id = 'empresa';
