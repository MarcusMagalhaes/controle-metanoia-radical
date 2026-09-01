-- ============================================================
-- Permite o modo "Substituir" do Restaurar backup apagar movimentações.
-- (produtos/tarefas/melhorias já podem ser apagados pelas policies atuais.)
-- Rode uma vez no Supabase (SQL Editor).
-- ============================================================
drop policy if exists mov_delete on movimentacoes;
create policy mov_delete on movimentacoes for delete
  using (pode_modulo(modulo));
