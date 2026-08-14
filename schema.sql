-- ============================================================
-- Metanoia Radical - Controle de Estoque QR
-- Esquema do banco (Supabase / PostgreSQL)
-- Rode no Supabase: painel > SQL Editor > New query > cole > Run
-- ============================================================

-- Produtos (materiais), separados por MODULO (logistica | copa | loja)
create table if not exists produtos (
  id           bigint generated always as identity primary key,
  modulo       text not null check (modulo in ('logistica','copa','loja')),
  codigo       text not null,                 -- conteudo do QR (ex: LOG-0001)
  nome         text not null,
  tipo         text not null check (tipo in ('consumo','uso')),
  unidade      text default 'un',             -- un, m, kg, cx...
  qtd_estoque  numeric not null default 0,    -- saldo atual
  criado_em    timestamptz default now(),
  unique (modulo, codigo)                     -- codigo unico dentro do modulo
);

-- Movimentacoes (saidas e devolucoes), tambem por MODULO
create table if not exists movimentacoes (
  id           bigint generated always as identity primary key,
  modulo       text not null check (modulo in ('logistica','copa','loja')),
  produto_id   bigint not null references produtos(id) on delete cascade,
  tipo         text not null check (tipo in ('saida','retorno')),
  pessoa       text not null,
  quantidade   numeric not null check (quantidade > 0),
  observacao   text,
  criado_em    timestamptz default now()
);

create index if not exists idx_prod_modulo on produtos(modulo);
create index if not exists idx_mov_modulo  on movimentacoes(modulo, criado_em desc);
create index if not exists idx_mov_produto on movimentacoes(produto_id);

-- ------------------------------------------------------------
-- RLS: ferramenta interna. Libera leitura/escrita para a chave anon.
-- Uso interno. Ver README para travar depois com login.
-- ------------------------------------------------------------
alter table produtos      enable row level security;
alter table movimentacoes enable row level security;

drop policy if exists p_produtos_all      on produtos;
drop policy if exists p_movimentacoes_all on movimentacoes;

create policy p_produtos_all      on produtos      for all using (true) with check (true);
create policy p_movimentacoes_all on movimentacoes for all using (true) with check (true);

-- ============================================================
-- MIGRACAO (rode SO se voce ja tinha criado as tabelas sem 'modulo'):
--   alter table produtos      add column if not exists modulo text;
--   alter table movimentacoes add column if not exists modulo text;
--   update produtos      set modulo = 'logistica' where modulo is null;
--   update movimentacoes set modulo = 'logistica' where modulo is null;
-- Depois recrie as constraints conforme acima.
-- ============================================================
