-- Guarda o último aviso recebido do Asaas (para o diagnóstico mostrar se os avisos estão chegando).
-- Pode rodar mais de uma vez.
alter table public.config_global add column if not exists ultimo_webhook jsonb;
