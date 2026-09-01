// ============================================================
// Restaura um backup para o Supabase.
// Uso:  SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... node scripts/restore.mjs backups/segunda.json
// Faz upsert (merge por id). Requer que os ids sejam inseríveis
// (rode identity-by-default.sql uma vez — ver README).
// ============================================================
import { readFileSync } from "node:fs";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const arq = process.argv[2];
if (!URL || !KEY) { console.error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE"); process.exit(1); }
if (!arq) { console.error("Uso: node scripts/restore.mjs backups/<dia>.json"); process.exit(1); }

const { dados } = JSON.parse(readFileSync(arq, "utf-8"));
// produtos antes de movimentacoes (FK). perfis por último (FK auth.users pode faltar).
const ORDEM = ["produtos", "tarefas", "melhorias", "movimentacoes", "perfis"];

for (const t of ORDEM) {
  const rows = (dados && dados[t]) || [];
  if (!rows.length) { console.log(`${t}: vazio, pulando`); continue; }
  const r = await fetch(`${URL}/rest/v1/${t}`, {
    method: "POST",
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json", Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) console.error(`${t}: ERRO HTTP ${r.status} — ${await r.text()}`);
  else console.log(`${t}: restaurado ${rows.length} registros`);
}
console.log("Concluído.");
