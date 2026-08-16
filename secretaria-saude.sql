-- ============================================================
-- Metanoia Radical - Módulos Secretaria e Saúde
-- Rode DEPOIS de schema.sql, auth-perfis.sql e loja-venda.sql.
-- ============================================================

-- 1) Liberar os novos módulos nas constraints existentes
alter table produtos      drop constraint if exists produtos_modulo_check;
alter table produtos      add  constraint produtos_modulo_check
  check (modulo in ('logistica','copa','loja','secretaria','saude'));

alter table movimentacoes drop constraint if exists movimentacoes_modulo_check;
alter table movimentacoes add  constraint movimentacoes_modulo_check
  check (modulo in ('logistica','copa','loja','secretaria','saude'));

alter table perfis        drop constraint if exists perfis_modulo_check;
alter table perfis        add  constraint perfis_modulo_check
  check (modulo in ('logistica','copa','loja','secretaria','saude'));

-- 2) Tarefas / Atividades (Secretaria)
create table if not exists tarefas (
  id          bigint generated always as identity primary key,
  modulo      text not null,
  descricao   text not null,
  responsavel text,
  previsao    date,
  concluida   boolean not null default false,
  criado_em   timestamptz default now()
);
alter table tarefas enable row level security;
drop policy if exists tarefas_rw on tarefas;
create policy tarefas_rw on tarefas for all
  using (pode_modulo(modulo)) with check (pode_modulo(modulo));

-- 3) Oportunidades de Melhoria (Secretaria)
create table if not exists melhorias (
  id          bigint generated always as identity primary key,
  modulo      text not null,
  descricao   text not null,
  responsavel text,
  concluida   boolean not null default false,
  criado_em   timestamptz default now()
);
alter table melhorias enable row level security;
drop policy if exists melhorias_rw on melhorias;
create policy melhorias_rw on melhorias for all
  using (pode_modulo(modulo)) with check (pode_modulo(modulo));
