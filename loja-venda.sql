-- ============================================================
-- Metanoia Radical - Lojinha: venda, forma de pagamento, caixa, troca
-- Rode DEPOIS de schema.sql e auth-perfis.sql. SQL Editor > Run.
-- Colunas novas (nao apaga nada existente).
-- ============================================================

-- Preco de venda no produto (usado na Lojinha; demais ficam 0)
alter table produtos add column if not exists preco numeric not null default 0;

-- Venda: forma de pagamento e valor na movimentacao
alter table movimentacoes add column if not exists forma_pagamento text
  check (forma_pagamento in ('credito','debito','pix','dinheiro'));
alter table movimentacoes add column if not exists valor numeric;

-- (tipo continua 'saida' | 'retorno'. Venda = saida com forma+valor.
--  Troca = retorno do item devolvido + saida do item novo; a diferenca
--  de valor, se houver, vai como valor+forma na saida do item novo.)
