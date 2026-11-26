-- Planos com mais benefícios, registro dos pagamentos recebidos e alerta de gasto para o administrador.
-- Pode rodar mais de uma vez.

-- 1) Planos: preços, créditos e benefícios.
--    acumulo: quanto dos créditos do plano que sobraram passa para o mês seguinte (0.5 = até 50% do plano)
--    desconto_recarga: desconto nas recargas avulsas (0.1 = 10%)
--    seedance_resolucoes: resoluções do Seedance liberadas
--    extras: benefícios que aparecem na lista do plano (atendimento etc.)
update public.planos set preco = 0, creditos_mensais = 30, recursos =
 '{"max_perfis":1,"claude":["claude-sonnet-5-5","claude-haiku-5-5"],"imagem":["fal-ai/nano-banana-2"],"veo":["fal-ai/veo3.1/lite"],
   "seedance":true,"seedance_resolucoes":["480p"],"biblioteca":true,"drive":false,"esforco_max":"medium","instagram":false,
   "acumulo":0,"desconto_recarga":0,"extras":[]}'::jsonb
where id = 'teste';

update public.planos set preco = 69.90, creditos_mensais = 420, recursos =
 '{"max_perfis":2,"claude":["claude-sonnet-5-5","claude-haiku-5-5"],"imagem":["fal-ai/nano-banana-2"],"veo":["fal-ai/veo3.1/lite"],
   "seedance":true,"seedance_resolucoes":["480p"],"biblioteca":true,"drive":false,"esforco_max":"medium","instagram":false,
   "acumulo":0.25,"desconto_recarga":0,"extras":["Suporte por e-mail"]}'::jsonb
where id = 'essencial';

update public.planos set preco = 159.90, creditos_mensais = 1000, recursos =
 '{"max_perfis":5,"claude":["claude-sonnet-5-5","claude-haiku-5-5","claude-opus-5-5"],"imagem":["fal-ai/nano-banana-2","fal-ai/nano-banana-pro"],
   "veo":["fal-ai/veo3.1/lite","fal-ai/veo3.1/fast"],"seedance":true,"seedance_resolucoes":["480p","720p"],"biblioteca":true,"drive":true,
   "esforco_max":"high","instagram":false,"acumulo":0.5,"desconto_recarga":0.05,"extras":["Suporte por WhatsApp"]}'::jsonb
where id = 'profissional';

update public.planos set preco = 379.90, creditos_mensais = 2400, recursos =
 '{"max_perfis":15,"claude":["claude-sonnet-5-5","claude-haiku-5-5","claude-opus-5-5"],"imagem":["fal-ai/nano-banana-2","fal-ai/nano-banana-pro","fal-ai/nano-banana"],
   "veo":["fal-ai/veo3.1/lite","fal-ai/veo3.1/fast","fal-ai/veo3.1"],"seedance":true,"seedance_resolucoes":["480p","720p","1080p"],"biblioteca":true,"drive":true,
   "esforco_max":"max","instagram":true,"acumulo":1,"desconto_recarga":0.1,"extras":["Suporte prioritário por WhatsApp","Novidades em primeira mão"]}'::jsonb
where id = 'premium';

update public.planos set recursos =
 '{"max_perfis":50,"claude":["claude-sonnet-5-5","claude-haiku-5-5","claude-opus-5-5"],"imagem":["fal-ai/nano-banana-2","fal-ai/nano-banana-pro","fal-ai/nano-banana"],
   "veo":["fal-ai/veo3.1/lite","fal-ai/veo3.1/fast","fal-ai/veo3.1"],"seedance":true,"seedance_resolucoes":["480p","720p","1080p"],"biblioteca":true,"drive":true,
   "esforco_max":"max","instagram":true,"acumulo":1,"desconto_recarga":0.15,"extras":["Atendimento dedicado","Créditos e perfis sob medida"]}'::jsonb
where id = 'empresa';

-- 2) Pagamentos recebidos (para o painel mostrar quanto entrou de verdade).
create table if not exists public.pagamentos (
  id text primary key,                         -- id do pagamento no Asaas
  conta_id uuid references public.contas(id) on delete set null,
  tipo text not null check (tipo in ('assinatura','recarga')),
  valor numeric(10,2) not null,
  valor_liquido numeric(10,2),
  descricao text,
  estornado boolean not null default false,
  criado_em timestamptz not null default now()
);
create index if not exists pagamentos_data_idx on public.pagamentos(criado_em desc);
alter table public.pagamentos enable row level security;

-- 3) Alerta de gasto mensal com IA (em reais; 0 = sem alerta).
alter table public.config_global add column if not exists alerta_gasto_mensal numeric(10,2) not null default 0;

-- 4) Renovação: o quanto acumula depende do plano (antes era sempre 25%).
create or replace function public.renovar_mensalidade(p_conta uuid, p_ref text)
returns numeric language plpgsql security definer set search_path = public as $$
declare c contas; mensal numeric; fator numeric; acumulado numeric; novo numeric; extra numeric;
begin
  if exists (select 1 from movimentos where conta_id = p_conta and tipo = 'mensalidade' and ref = p_ref) then
    select saldo into novo from contas where id = p_conta;
    return novo;
  end if;
  select * into c from contas where id = p_conta for update;
  if not found then raise exception 'conta_inexistente'; end if;
  select coalesce(c.creditos_mensais_custom, p.creditos_mensais),
         coalesce((c.recursos_custom->>'acumulo')::numeric, (p.recursos->>'acumulo')::numeric, 0.25)
    into mensal, fator from planos p where p.id = c.plano_id;
  extra := greatest(0, least(c.avulsos, c.saldo));
  acumulado := greatest(0, least(c.saldo - extra, mensal * fator));
  novo := extra + acumulado + mensal;
  update contas set saldo = novo, status = 'ativo', renova_em = now() + interval '1 month' where id = p_conta;
  insert into movimentos (conta_id, tipo, creditos, saldo_apos, descricao, ref)
  values (p_conta, 'mensalidade', novo - c.saldo, novo,
          format('Renovação do plano (%s créditos + %s acumulados%s)', mensal, round(acumulado, 2),
                 case when extra > 0 then format(' + %s de recargas', round(extra, 2)) else '' end), p_ref);
  return novo;
end $$;
revoke all on function public.renovar_mensalidade(uuid, text) from public, anon, authenticated;
