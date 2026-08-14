-- ============================================================
-- Metanoia Radical - Perfis + Controle de Acesso (RBAC)
-- Rode DEPOIS do schema.sql. Supabase > SQL Editor > cole > Run.
-- Requer login Google ativo (Authentication > Providers > Google).
-- ============================================================

-- Tabela de perfis (1 por usuario do Auth)
create table if not exists perfis (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  nome       text,
  nivel      text not null default 'pendente'
             check (nivel in ('pendente','admin_geral','admin','operador')),
  modulo     text check (modulo in ('logistica','copa','loja')),
  criado_em  timestamptz default now()
);
alter table perfis enable row level security;

-- ---------- Funcoes auxiliares (security definer: nao recursam na RLS) ----------
create or replace function is_admin_geral() returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and nivel = 'admin_geral');
$$;

-- pode ver/mexer no modulo m? (admin_geral tudo; admin/operador so o seu)
create or replace function pode_modulo(m text) returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from perfis
    where id = auth.uid()
      and (nivel = 'admin_geral' or (nivel in ('admin','operador') and modulo = m))
  );
$$;

-- eh admin (geral ou do modulo m)? usado p/ criar/apagar produto
create or replace function eh_admin_modulo(m text) returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from perfis
    where id = auth.uid()
      and (nivel = 'admin_geral' or (nivel = 'admin' and modulo = m))
  );
$$;

-- ---------- Politicas de PERFIS ----------
drop policy if exists perfis_self_select  on perfis;
drop policy if exists perfis_self_insert  on perfis;
drop policy if exists perfis_admin_select on perfis;
drop policy if exists perfis_admin_update on perfis;

-- cada um le o proprio perfil
create policy perfis_self_select on perfis for select using (auth.uid() = id);
-- primeiro login: cria o proprio como pendente (nao pode se autopromover)
create policy perfis_self_insert on perfis for insert
  with check (auth.uid() = id and nivel = 'pendente' and modulo is null);
-- admin_geral le e edita todos
create policy perfis_admin_select on perfis for select using (is_admin_geral());
create policy perfis_admin_update on perfis for update using (is_admin_geral()) with check (is_admin_geral());

-- ---------- Politicas de DADOS (troca as antigas 'liberado geral') ----------
drop policy if exists p_produtos_all      on produtos;
drop policy if exists p_movimentacoes_all on movimentacoes;
drop policy if exists produtos_select on produtos;
drop policy if exists produtos_insert on produtos;
drop policy if exists produtos_update on produtos;
drop policy if exists produtos_delete on produtos;
drop policy if exists mov_select on movimentacoes;
drop policy if exists mov_insert on movimentacoes;

-- PRODUTOS: ver = quem tem o modulo; criar/apagar = so admin; atualizar estoque = operador tambem
create policy produtos_select on produtos for select using (pode_modulo(modulo));
create policy produtos_insert on produtos for insert with check (eh_admin_modulo(modulo));
create policy produtos_update on produtos for update using (pode_modulo(modulo)) with check (pode_modulo(modulo));
create policy produtos_delete on produtos for delete using (eh_admin_modulo(modulo));

-- MOVIMENTACOES: ver e registrar = quem tem o modulo (inclui operador)
create policy mov_select on movimentacoes for select using (pode_modulo(modulo));
create policy mov_insert on movimentacoes for insert with check (pode_modulo(modulo));

-- ============================================================
-- BOOTSTRAP: depois de fazer o 1o login com Google no app,
-- rode isto trocando pelo SEU email p/ virar admin_geral:
--   update perfis set nivel = 'admin_geral', modulo = null
--   where email = 'SEU_EMAIL@gmail.com';
-- ============================================================
