-- Central Social: planos, contas, membros, carteira de créditos, perfis e extrato.
-- Rode no Supabase: SQL Editor → cole tudo → Run. (Pode rodar de novo sem problema.)
-- Todo acesso aos dados passa pelo servidor da plataforma (chave service_role);
-- o RLS fica ligado e sem políticas, então ninguém lê as tabelas direto do navegador.

create extension if not exists pgcrypto;

-- Planos à venda. Os recursos dizem o que cada plano libera.
create table if not exists public.planos (
  id text primary key,
  nome text not null,
  preco numeric(10,2) not null,          -- em reais, por mês
  creditos_mensais numeric(12,2) not null, -- 1 crédito = R$ 0,10 de custo de IA
  recursos jsonb not null,
  ordem int not null default 0,
  publico boolean not null default true
);

insert into public.planos (id, nome, preco, creditos_mensais, ordem, publico, recursos) values
('teste', 'Teste grátis', 0, 30, 0, false,
 '{"max_perfis":1,"claude":["claude-sonnet-5-5","claude-haiku-5-5"],"imagem":["fal-ai/nano-banana-2"],"veo":["fal-ai/veo3.1/lite"],"seedance":false,"biblioteca":false,"drive":false,"esforco_max":"medium"}'),
('essencial', 'Essencial', 59.90, 400, 1, true,
 '{"max_perfis":1,"claude":["claude-sonnet-5-5","claude-haiku-5-5"],"imagem":["fal-ai/nano-banana-2"],"veo":["fal-ai/veo3.1/lite"],"seedance":false,"biblioteca":false,"drive":false,"esforco_max":"medium"}'),
('profissional', 'Profissional', 149.90, 1050, 2, true,
 '{"max_perfis":1,"claude":["claude-sonnet-5-5","claude-haiku-5-5","claude-opus-5-5"],"imagem":["fal-ai/nano-banana-2","fal-ai/nano-banana-pro"],"veo":["fal-ai/veo3.1/lite","fal-ai/veo3.1/fast"],"seedance":true,"biblioteca":true,"drive":false,"esforco_max":"medium"}'),
('premium', 'Premium', 349.90, 2500, 3, true,
 '{"max_perfis":3,"claude":["claude-sonnet-5-5","claude-haiku-5-5","claude-opus-5-5"],"imagem":["fal-ai/nano-banana-2","fal-ai/nano-banana-pro","fal-ai/nano-banana"],"veo":["fal-ai/veo3.1/lite","fal-ai/veo3.1/fast","fal-ai/veo3.1"],"seedance":true,"biblioteca":true,"drive":true,"esforco_max":"high"}'),
('empresa', 'Empresa', 0, 0, 4, false,
 '{"max_perfis":20,"claude":["claude-sonnet-5-5","claude-haiku-5-5","claude-opus-5-5"],"imagem":["fal-ai/nano-banana-2","fal-ai/nano-banana-pro","fal-ai/nano-banana"],"veo":["fal-ai/veo3.1/lite","fal-ai/veo3.1/fast","fal-ai/veo3.1"],"seedance":true,"biblioteca":true,"drive":true,"esforco_max":"high"}')
on conflict (id) do nothing;

-- Uma conta = a pessoa ou empresa que paga (pode ter vários perfis e membros).
create table if not exists public.contas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email_cobranca text,
  plano_id text not null references public.planos(id) default 'teste',
  status text not null default 'teste' check (status in ('teste','ativo','atrasado','cancelado')),
  saldo numeric(14,3) not null default 0,       -- créditos disponíveis (total)
  avulsos numeric(14,3) not null default 0,     -- parte do saldo que veio de recargas (não expira)
  creditos_mensais_custom numeric(12,2),        -- plano Empresa: créditos combinados
  preco_custom numeric(10,2),                   -- plano Empresa: valor combinado
  recursos_custom jsonb,                        -- plano Empresa: ajustes nos recursos
  preferencias jsonb not null default '{}',     -- modelos escolhidos, confirmações, câmbio exibido...
  asaas_cliente text,
  asaas_assinatura text,
  asaas_assinatura_pendente text,               -- troca de plano esperando o pagamento
  plano_pendente text references public.planos(id),
  renova_em timestamptz,
  criado_em timestamptz not null default now()
);

alter table public.contas add column if not exists avulsos numeric(14,3) not null default 0;

create table if not exists public.membros (
  conta_id uuid not null references public.contas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  papel text not null default 'editor' check (papel in ('dono','editor')),
  criado_em timestamptz not null default now(),
  primary key (conta_id, user_id)
);
create index if not exists membros_user_idx on public.membros(user_id);

-- Perfis (marcas/clientes): o conteúdo de cada um é guardado como documento.
create table if not exists public.perfis (
  id text primary key,
  conta_id uuid not null references public.contas(id) on delete cascade,
  dados jsonb not null,
  versao int not null default 1,
  atualizado_em timestamptz not null default now(),
  apagado boolean not null default false
);
create index if not exists perfis_conta_idx on public.perfis(conta_id);

-- Extrato da carteira: toda entrada e saída de créditos.
create table if not exists public.movimentos (
  id bigserial primary key,
  conta_id uuid not null references public.contas(id) on delete cascade,
  user_id uuid,
  tipo text not null check (tipo in ('mensalidade','recarga','uso','estorno','ajuste','bonus')),
  creditos numeric(14,3) not null,               -- positivo entra, negativo sai
  saldo_apos numeric(14,3) not null,
  descricao text,
  ref text,                                       -- id do pagamento / pedido (evita duplicar)
  custo_usd numeric(12,5),
  criado_em timestamptz not null default now()
);
create index if not exists movimentos_conta_idx on public.movimentos(conta_id, criado_em desc);
create unique index if not exists movimentos_ref_unico on public.movimentos(conta_id, tipo, ref) where ref is not null;

-- Câmbio e preços usados para converter custo de IA em créditos (ajustáveis sem novo deploy).
create table if not exists public.config_global (
  id int primary key default 1 check (id = 1),
  cambio numeric(8,4) not null default 5.30,
  precos jsonb not null
);
insert into public.config_global (id, cambio, precos) values (1, 5.30,
 '{"claude":{"claude-opus-5-5":[4,20],"claude-sonnet-5-5":[2,10],"claude-haiku-5-5":[0.1,0.5]},
   "imagem":{"fal-ai/nano-banana-2":0.08,"fal-ai/nano-banana-pro":0.15,"fal-ai/nano-banana":0.04},
   "veo_por_segundo":{"fal-ai/veo3.1/lite":0.06,"fal-ai/veo3.1/fast":0.15,"fal-ai/veo3.1":0.40},
   "segundos_veo":8,
   "seedance_por_segundo":{"480p":0.22,"720p":0.47,"1080p":1.0},
   "segundos_seedance":5,
   "seedance_referencia_fator":0.6,
   "whisper_por_minuto":0.006,
   "margem_seguranca":1.0}')
on conflict (id) do nothing;

alter table public.planos enable row level security;
alter table public.contas enable row level security;
alter table public.membros enable row level security;
alter table public.perfis enable row level security;
alter table public.movimentos enable row level security;
alter table public.config_global enable row level security;

-- ---------------- Funções da carteira (atômicas) ----------------

-- Desconta créditos. Falha com 'saldo_insuficiente' se não houver saldo (a não ser que permita negativo).
create or replace function public.debitar(
  p_conta uuid, p_user uuid, p_creditos numeric, p_descricao text, p_ref text default null,
  p_custo_usd numeric default null, p_permitir_negativo boolean default false
) returns numeric language plpgsql security definer set search_path = public as $$
declare novo numeric;
begin
  if p_creditos <= 0 then
    select saldo into novo from contas where id = p_conta;
    return novo;
  end if;
  -- Gasta primeiro os créditos do plano; os de recarga só quando os do plano acabam.
  update contas set saldo = saldo - p_creditos, avulsos = greatest(0, least(avulsos, saldo - p_creditos))
   where id = p_conta and (p_permitir_negativo or saldo >= p_creditos)
   returning saldo into novo;
  if not found then raise exception 'saldo_insuficiente'; end if;
  insert into movimentos (conta_id, user_id, tipo, creditos, saldo_apos, descricao, ref, custo_usd)
  values (p_conta, p_user, 'uso', -p_creditos, novo, p_descricao, p_ref, p_custo_usd);
  return novo;
end $$;

-- Adiciona créditos (recarga, estorno, ajuste, bônus). Idempotente pelo p_ref.
create or replace function public.creditar(
  p_conta uuid, p_creditos numeric, p_tipo text, p_descricao text, p_ref text default null, p_user uuid default null
) returns numeric language plpgsql security definer set search_path = public as $$
declare novo numeric;
begin
  if p_ref is not null and exists (select 1 from movimentos where conta_id = p_conta and tipo = p_tipo and ref = p_ref) then
    select saldo into novo from contas where id = p_conta;
    return novo;
  end if;
  update contas set saldo = saldo + p_creditos,
         avulsos = case when p_tipo = 'recarga' then avulsos + p_creditos else avulsos end
   where id = p_conta returning saldo into novo;
  if not found then raise exception 'conta_inexistente'; end if;
  insert into movimentos (conta_id, user_id, tipo, creditos, saldo_apos, descricao, ref)
  values (p_conta, p_user, p_tipo, p_creditos, novo, p_descricao, p_ref);
  return novo;
end $$;

-- Renova o mês: créditos de recarga ficam inteiros; dos créditos do plano que sobraram,
-- guarda até 25% do valor mensal; e soma os créditos novos do mês.
-- Idempotente pelo id do pagamento.
create or replace function public.renovar_mensalidade(p_conta uuid, p_ref text)
returns numeric language plpgsql security definer set search_path = public as $$
declare c contas; mensal numeric; acumulado numeric; novo numeric; extra numeric;
begin
  if exists (select 1 from movimentos where conta_id = p_conta and tipo = 'mensalidade' and ref = p_ref) then
    select saldo into novo from contas where id = p_conta;
    return novo;
  end if;
  select * into c from contas where id = p_conta for update;
  if not found then raise exception 'conta_inexistente'; end if;
  select coalesce(c.creditos_mensais_custom, p.creditos_mensais) into mensal from planos p where p.id = c.plano_id;
  extra := greatest(0, least(c.avulsos, c.saldo));
  acumulado := greatest(0, least(c.saldo - extra, mensal * 0.25));
  novo := extra + acumulado + mensal;
  update contas set saldo = novo, status = 'ativo', renova_em = now() + interval '1 month' where id = p_conta;
  insert into movimentos (conta_id, tipo, creditos, saldo_apos, descricao, ref)
  values (p_conta, 'mensalidade', novo - c.saldo, novo,
          format('Renovação do plano (%s créditos + %s acumulados%s)', mensal, round(acumulado, 2),
                 case when extra > 0 then format(' + %s de recargas', round(extra, 2)) else '' end), p_ref);
  return novo;
end $$;

-- Primeira entrada: cria a conta (plano Teste com créditos de boas-vindas) e o usuário como dono.
create or replace function public.criar_conta_inicial(p_user uuid, p_nome text, p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare nova uuid; bonus numeric;
begin
  select conta_id into nova from membros where user_id = p_user order by criado_em limit 1;
  if found then return nova; end if;
  select creditos_mensais into bonus from planos where id = 'teste';
  insert into contas (nome, email_cobranca, plano_id, status, saldo) values (p_nome, p_email, 'teste', 'teste', 0) returning id into nova;
  insert into membros (conta_id, user_id, papel) values (nova, p_user, 'dono');
  perform creditar(nova, bonus, 'bonus', 'Créditos de boas-vindas', 'boas-vindas');
  return nova;
end $$;

revoke all on function public.debitar(uuid, uuid, numeric, text, text, numeric, boolean) from public, anon, authenticated;
revoke all on function public.creditar(uuid, numeric, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.renovar_mensalidade(uuid, text) from public, anon, authenticated;
revoke all on function public.criar_conta_inicial(uuid, text, text) from public, anon, authenticated;

-- Armazenamento dos arquivos (imagens, vídeos, áudios) — privado; acesso por links assinados.
insert into storage.buckets (id, name, public) values ('midias', 'midias', false)
on conflict (id) do nothing;
