// ============================================================
// Backup diário da base Supabase -> backups/<dia-da-semana>.json
// Roda no GitHub Actions. Usa a service_role key (bypassa RLS).
// Sobrepõe o arquivo do mesmo dia da semana (máx 7 dias). Só grava se houver dados.
// ============================================================
import { writeFileSync, mkdirSync } from "node:fs";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
if (!URL || !KEY) { console.error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE"); process.exit(1); }

const TABELAS = ["produtos", "movimentacoes", "perfis", "tarefas", "melhorias"];

async function dump(tabela) {
  const r = await fetch(`${URL}/rest/v1/${tabela}?select=*`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!r.ok) throw new Error(`${tabela}: HTTP ${r.status} ${await r.text()}`);
  return r.json();
}

const dados = {};
let total = 0;
for (const t of TABELAS) { dados[t] = await dump(t); total += dados[t].length; }

if (total === 0) {
  console.log("Base vazia — backup ignorado (mantém o último backup bom).");
  process.exit(0);
}

const tz = "America/Sao_Paulo";
const agora = new Date();
const diaLongo = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, weekday: "long" }).format(agora);
const dia = diaLongo.replace("-feira", "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim(); // segunda, terca...
const dataBR = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, dateStyle: "short", timeStyle: "short" }).format(agora);

const saida = {
  gerado_em: agora.toISOString(),
  data_br: dataBR,
  dia,
  contagens: Object.fromEntries(TABELAS.map((t) => [t, dados[t].length])),
  dados,
};

mkdirSync("backups", { recursive: true });
writeFileSync(`backups/${dia}.json`, JSON.stringify(saida, null, 2));
console.log(`Backup ${dia} (${dataBR}): ${total} registros — ` +
  TABELAS.map((t) => `${t}=${dados[t].length}`).join(", "));
