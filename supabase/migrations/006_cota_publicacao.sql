-- Publicação automática em todos os planos pagos, com limite mensal por perfil nos planos de entrada.
-- publicacao_mensal: quantas publicações automáticas por mês, por perfil (ausente = sem limite)
-- perfis_publicacao: quantos perfis da conta podem ter publicação automática pela plataforma
-- Pode rodar mais de uma vez.
update public.planos set recursos = recursos
  || '{"instagram": true, "perfis_publicacao": 1, "publicacao_mensal": {"reels": 4, "stories": 8, "posts": 4}}'::jsonb
where id = 'essencial';

update public.planos set recursos = recursos
  || '{"instagram": true, "perfis_publicacao": 3, "publicacao_mensal": {"reels": 8, "stories": 16, "posts": 12}}'::jsonb
where id = 'profissional';

update public.planos set recursos = (recursos - 'publicacao_mensal') || '{"instagram": true, "perfis_publicacao": 15}'::jsonb
where id = 'premium';

update public.planos set recursos = (recursos - 'publicacao_mensal') || '{"instagram": true, "perfis_publicacao": 50}'::jsonb
where id = 'empresa';

update public.planos set recursos = recursos || '{"instagram": false, "perfis_publicacao": 0}'::jsonb
where id = 'teste';

-- De onde saiu a publicação: Metricool próprio do cliente não entra na conta do limite.
alter table public.publicacoes add column if not exists origem text not null default 'plataforma';
create index if not exists publicacoes_cota_idx on public.publicacoes(conta_id, perfil_id, quando);
