-- Central Social: publicação automática no Instagram.
-- Rode no Supabase (SQL Editor → New query → cole → Run). Pode rodar de novo sem problema.

-- Uma conta do Instagram conectada por perfil (marca/cliente).
create table if not exists public.conexoes_instagram (
  perfil_id text primary key,
  conta_id uuid not null references public.contas(id) on delete cascade,
  ig_user_id text not null,
  username text,
  token_cifrado text not null,          -- token de acesso criptografado (AES-GCM, chave CHAVE_CRIPTO)
  expira_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists conexoes_instagram_conta_idx on public.conexoes_instagram(conta_id);

-- Fila de publicações agendadas (uma por item do calendário).
create table if not exists public.publicacoes (
  id text primary key,                  -- id do agendamento no calendário
  conta_id uuid not null references public.contas(id) on delete cascade,
  perfil_id text not null,
  quando timestamptz not null,
  tipo text not null check (tipo in ('post','carrossel','reels','story')),
  legenda text not null default '',
  midias jsonb not null default '[]',   -- [{ "caminho": "...", "tipo": "imagem"|"video" }]
  status text not null default 'agendada' check (status in ('agendada','publicando','publicada','erro','cancelada')),
  tentativas int not null default 0,
  containers jsonb,                     -- ids dos containers criados no Instagram (para continuar depois)
  ig_media_id text,
  permalink text,
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists publicacoes_fila_idx on public.publicacoes(status, quando);
create index if not exists publicacoes_conta_idx on public.publicacoes(conta_id, perfil_id);

alter table public.conexoes_instagram enable row level security;
alter table public.publicacoes enable row level security;

-- Recurso "instagram" (publicação automática) nos planos.
update public.planos set recursos = recursos || '{"instagram": true}'::jsonb where id in ('premium', 'empresa');
update public.planos set recursos = recursos || '{"instagram": false}'::jsonb where id in ('teste', 'essencial', 'profissional') and not (recursos ? 'instagram');
