-- Correções de segurança: reserva de créditos antes de usar a IA, trava na criação de conta,
-- limites da pasta de arquivos e cota de armazenamento por plano. Pode rodar mais de uma vez.

-- Detalhes do uso (ex.: qual modelo do fal.ai gerou o vídeo, para conferir antes de devolver créditos).
alter table public.movimentos add column if not exists meta jsonb;

-- Reserva créditos ANTES de chamar a IA (atômico: dois pedidos ao mesmo tempo não usam o mesmo saldo).
-- Reserva até p_max (ou o que tiver de saldo, se for menos), exigindo pelo menos p_minimo.
create or replace function public.reservar(
  p_conta uuid, p_user uuid, p_max numeric, p_minimo numeric, p_descricao text, p_ref text
) returns numeric language plpgsql security definer set search_path = public as $$
declare atual numeric; reservado numeric; novo numeric;
begin
  if p_max <= 0 then return 0; end if;
  select saldo into atual from contas where id = p_conta for update;
  if not found or atual < greatest(p_minimo, 0.001) then raise exception 'saldo_insuficiente'; end if;
  reservado := least(p_max, atual);
  update contas
     set saldo = saldo - reservado,
         avulsos = greatest(0, least(avulsos, saldo - reservado))
   where id = p_conta returning saldo into novo;
  insert into movimentos (conta_id, user_id, tipo, creditos, saldo_apos, descricao, ref)
  values (p_conta, p_user, 'uso', -reservado, novo, p_descricao, p_ref);
  return reservado;
end $$;

-- Acerta uma reserva pelo custo real (cobra a diferença ou devolve a sobra). Custo real 0 = cancela a reserva.
create or replace function public.acertar_reserva(
  p_conta uuid, p_ref text, p_real numeric, p_custo_usd numeric, p_descricao text, p_novo_ref text, p_meta jsonb
) returns numeric language plpgsql security definer set search_path = public as $$
declare m movimentos; diff numeric; novo numeric;
begin
  select * into m from movimentos where conta_id = p_conta and tipo = 'uso' and ref = p_ref for update;
  if not found then
    select saldo into novo from contas where id = p_conta;
    return novo;
  end if;
  diff := greatest(p_real, 0) - (-m.creditos);
  update contas
     set saldo = saldo - diff,
         avulsos = case when diff > 0 then greatest(0, least(avulsos, saldo - diff)) else avulsos end
   where id = p_conta returning saldo into novo;
  if p_real <= 0 then
    delete from movimentos where id = m.id;
  else
    update movimentos set creditos = -p_real, saldo_apos = novo, custo_usd = p_custo_usd,
           descricao = coalesce(p_descricao, descricao), ref = coalesce(p_novo_ref, ref), meta = coalesce(p_meta, meta)
     where id = m.id;
  end if;
  return novo;
end $$;

revoke all on function public.reservar(uuid, uuid, numeric, numeric, text, text) from public, anon, authenticated;
revoke all on function public.acertar_reserva(uuid, text, numeric, numeric, text, text, jsonb) from public, anon, authenticated;

-- Primeira entrada: trava por usuário para dois acessos ao mesmo tempo não criarem duas contas (e dois bônus).
create or replace function public.criar_conta_inicial(p_user uuid, p_nome text, p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare nova uuid; bonus numeric;
begin
  perform pg_advisory_xact_lock(hashtext('criar_conta:' || p_user::text));
  select conta_id into nova from membros where user_id = p_user order by criado_em limit 1;
  if found then return nova; end if;
  select creditos_mensais into bonus from planos where id = 'teste';
  insert into contas (nome, email_cobranca, plano_id, status, saldo) values (p_nome, p_email, 'teste', 'teste', 0) returning id into nova;
  insert into membros (conta_id, user_id, papel) values (nova, p_user, 'dono');
  perform creditar(nova, bonus, 'bonus', 'Créditos de boas-vindas', 'boas-vindas');
  return nova;
end $$;
revoke all on function public.criar_conta_inicial(uuid, text, text) from public, anon, authenticated;

-- Pasta de arquivos: só imagens, vídeos, áudios e PDF, até 300 MB por arquivo, e continua privada.
update storage.buckets
   set public = false,
       file_size_limit = 314572800,
       allowed_mime_types = array['image/*', 'video/*', 'audio/*', 'application/pdf']
 where id = 'midias';

-- Cota de armazenamento por conta (GB), conforme o plano.
update public.planos set recursos = recursos || '{"armazenamento_gb": 1}'::jsonb where id = 'teste';
update public.planos set recursos = recursos || '{"armazenamento_gb": 5}'::jsonb where id = 'essencial';
update public.planos set recursos = recursos || '{"armazenamento_gb": 15}'::jsonb where id = 'profissional';
update public.planos set recursos = recursos || '{"armazenamento_gb": 50}'::jsonb where id = 'premium';
update public.planos set recursos = recursos || '{"armazenamento_gb": 200}'::jsonb where id = 'empresa';
