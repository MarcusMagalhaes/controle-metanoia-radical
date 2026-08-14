// ============================================================
// Controle Metanoia Radical - Estoque QR
// Modulos: logistica | copa | loja  (dados isolados por modulo)
// Banco: LOCAL (navegador) por padrao. Supabase se config.js tiver chaves.
// ============================================================
const cfg = window.APP_CONFIG || {};
const statusEl = document.getElementById("status");
const statusInicial = document.getElementById("status-inicial");

const MODULOS = {
  logistica: { nome: "Logística", prefixo: "LOG", icone: "📦" },
  copa: { nome: "Copa / Cozinha", prefixo: "COP", icone: "🍽️" },
  loja: { nome: "Lojinha", prefixo: "LOJ", icone: "🛍️" },
};

let MODULO = null;

// ============================================================
// CAMADA DE BANCO (mesma interface p/ Local e Supabase)
// ============================================================
const usaSupabase = cfg.SUPABASE_URL && !String(cfg.SUPABASE_URL).startsWith("COLE");

// ---------- Banco LOCAL (localStorage) ----------
const LocalDB = {
  _get(k) { return JSON.parse(localStorage.getItem(k) || "[]"); },
  _set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
  _novoId(arr) { return arr.reduce((m, x) => Math.max(m, x.id), 0) + 1; },

  async contarProdutos(mod) {
    return this._get("mr_produtos").filter((p) => p.modulo === mod).length;
  },
  async listarProdutos(mod) {
    return this._get("mr_produtos")
      .filter((p) => p.modulo === mod)
      .sort((a, b) => a.nome.localeCompare(b.nome));
  },
  async acharProduto(mod, codigo) {
    return this._get("mr_produtos").find((p) => p.modulo === mod && p.codigo === codigo) || null;
  },
  async inserirProduto(p) {
    const arr = this._get("mr_produtos");
    if (arr.some((x) => x.modulo === p.modulo && x.codigo === p.codigo))
      throw new Error("Código já existe neste módulo");
    p.id = this._novoId(arr);
    p.criado_em = new Date().toISOString();
    arr.push(p);
    this._set("mr_produtos", arr);
    return p;
  },
  async atualizarEstoque(id, qtd) {
    const arr = this._get("mr_produtos");
    const p = arr.find((x) => x.id === id);
    if (p) { p.qtd_estoque = qtd; this._set("mr_produtos", arr); }
  },
  async inserirMov(m) {
    const arr = this._get("mr_movimentacoes");
    m.id = this._novoId(arr);
    m.criado_em = new Date().toISOString();
    arr.push(m);
    this._set("mr_movimentacoes", arr);
  },
  async listarMov(mod) {
    const prods = this._get("mr_produtos");
    return this._get("mr_movimentacoes")
      .filter((m) => m.modulo === mod)
      .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
      .map((m) => {
        const p = prods.find((x) => x.id === m.produto_id) || {};
        return { ...m, produtos: { nome: p.nome, codigo: p.codigo, unidade: p.unidade } };
      });
  },
};

// ---------- Banco SUPABASE ----------
let sbClient = null;
if (usaSupabase) sbClient = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

const SupaDB = {
  async contarProdutos(mod) {
    const { count } = await sbClient.from("produtos").select("*", { count: "exact", head: true }).eq("modulo", mod);
    return count || 0;
  },
  async listarProdutos(mod) {
    const { data, error } = await sbClient.from("produtos").select("*").eq("modulo", mod).order("nome");
    if (error) throw error; return data || [];
  },
  async acharProduto(mod, codigo) {
    const { data } = await sbClient.from("produtos").select("*").eq("modulo", mod).eq("codigo", codigo).single();
    return data || null;
  },
  async inserirProduto(p) {
    const { data, error } = await sbClient.from("produtos").insert(p).select().single();
    if (error) throw error; return data;
  },
  async atualizarEstoque(id, qtd) {
    const { error } = await sbClient.from("produtos").update({ qtd_estoque: qtd }).eq("id", id);
    if (error) throw error;
  },
  async inserirMov(m) {
    const { error } = await sbClient.from("movimentacoes").insert(m);
    if (error) throw error;
  },
  async listarMov(mod) {
    const { data, error } = await sbClient
      .from("movimentacoes").select("*, produtos(nome, codigo, unidade)")
      .eq("modulo", mod).order("criado_em", { ascending: false }).limit(500);
    if (error) throw error; return data || [];
  },
};

const db = usaSupabase ? SupaDB : LocalDB;

// ============================================================
// AUTENTICAÇÃO + PERFIL (Google SSO via Supabase Auth)
// ============================================================
let PERFIL = null, USER = null;

const TELAS = ["tela-carregando", "tela-login", "tela-pendente", "tela-modulo", "tela-usuarios", "app"];
function mostrarTela(id) {
  TELAS.forEach((t) => document.getElementById(t).classList.toggle("hidden", t !== id));
}

const ABAS_POR_NIVEL = {
  operador: ["retirada", "devolucao"],
  admin: ["produtos", "retirada", "devolucao", "movimentacoes", "relatorios"],
  admin_geral: ["produtos", "retirada", "devolucao", "movimentacoes", "relatorios"],
};
function rotuloNivel(n) {
  return { pendente: "Pendente", operador: "Operador", admin: "Admin do módulo", admin_geral: "Admin geral" }[n] || n;
}

async function initApp() {
  if (!usaSupabase) {
    // Modo local (sem Supabase): sem login, acesso total p/ testar
    PERFIL = { nivel: "admin_geral", modulo: null, email: "local" };
    document.getElementById("btn-usuarios").style.display = "none";
    document.getElementById("user-email").textContent = "local";
    document.getElementById("btn-trocar").style.display = "";
    mostrarTela("tela-modulo");
    return;
  }
  sbClient.auth.onAuthStateChange((ev) => {
    if (ev === "SIGNED_OUT") mostrarTela("tela-login");
  });
  const { data: { session } } = await sbClient.auth.getSession();
  if (!session) { mostrarTela("tela-login"); return; }
  USER = session.user;
  try { PERFIL = await carregarOuCriarPerfil(USER); }
  catch (e) { document.getElementById("login-erro").textContent = "Erro: " + e.message; mostrarTela("tela-login"); return; }
  rotear();
}

async function carregarOuCriarPerfil(user) {
  let { data, error } = await sbClient.from("perfis").select("*").eq("id", user.id).maybeSingle();
  if (error) throw error;
  if (!data) {
    const novo = { id: user.id, email: user.email, nome: user.user_metadata?.full_name || user.email, nivel: "pendente", modulo: null };
    const ins = await sbClient.from("perfis").insert(novo).select().single();
    if (ins.error) throw ins.error;
    data = ins.data;
  }
  return data;
}

function rotear() {
  document.getElementById("user-email").textContent = PERFIL.email || USER?.email || "";
  const ehGeral = PERFIL.nivel === "admin_geral";
  document.getElementById("btn-trocar").style.display = ehGeral ? "" : "none";
  document.getElementById("btn-usuarios").style.display = ehGeral ? "" : "none";

  if (PERFIL.nivel === "pendente") {
    document.getElementById("pendente-email").textContent = PERFIL.email || "";
    mostrarTela("tela-pendente");
    return;
  }
  if ((PERFIL.nivel === "admin" || PERFIL.nivel === "operador") && !PERFIL.modulo) {
    document.getElementById("pendente-email").textContent = PERFIL.email || "";
    document.getElementById("pendente-msg").textContent = "Seu perfil ainda não tem um módulo definido. Fale com um administrador.";
    mostrarTela("tela-pendente");
    return;
  }
  if (ehGeral) { mostrarTela("tela-modulo"); }
  else { entrarModulo(PERFIL.modulo); }
}

// Login Google
document.getElementById("btn-google").onclick = () =>
  sbClient.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.href.split("#")[0] } });

// Logout
async function sair() { if (usaSupabase) await sbClient.auth.signOut(); location.reload(); }
document.getElementById("btn-sair").onclick = sair;
document.getElementById("btn-sair-app").onclick = sair;
document.getElementById("btn-sair-pendente").onclick = sair;

// ============================================================
// SELEÇÃO DE MÓDULO + ABAS POR PAPEL
// ============================================================
document.querySelectorAll(".mod-card").forEach((card) => {
  card.addEventListener("click", () => entrarModulo(card.dataset.modulo));
});

function aplicarAbas(nivel) {
  const abas = ABAS_POR_NIVEL[nivel] || [];
  document.querySelectorAll(".tab").forEach((t) => {
    t.style.display = abas.includes(t.dataset.tab) ? "" : "none";
  });
  ativarAba(abas[0]);
}

function ativarAba(nome) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === nome));
  document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
  document.getElementById("tab-" + nome).classList.add("active");
  pararScanners();
  if (nome === "produtos") carregarProdutos();
  if (nome === "movimentacoes") carregarMovimentacoes();
  if (nome === "relatorios") gerarRelatorios();
}

function entrarModulo(mod) {
  MODULO = mod;
  document.body.dataset.modulo = mod;
  document.getElementById("modulo-atual").textContent = MODULOS[mod].icone + " " + MODULOS[mod].nome;
  mostrarTela("app");
  statusEl.textContent = "";
  aplicarAbas(PERFIL ? PERFIL.nivel : "admin_geral");
}

document.getElementById("btn-trocar").addEventListener("click", () => {
  if (!PERFIL || PERFIL.nivel !== "admin_geral") return;
  pararScanners();
  MODULO = null;
  mostrarTela("tela-modulo");
});

// ============================================================
// GESTÃO DE USUÁRIOS (só admin_geral)
// ============================================================
document.getElementById("btn-usuarios").onclick = abrirUsuarios;
document.getElementById("btn-voltar-usuarios").onclick = () => mostrarTela("tela-modulo");

async function abrirUsuarios() {
  mostrarTela("tela-usuarios");
  const box = document.getElementById("lista-usuarios");
  box.innerHTML = '<p class="vazio">Carregando...</p>';
  const { data, error } = await sbClient.from("perfis").select("*").order("criado_em");
  if (error) { box.innerHTML = '<p class="vazio">Erro: ' + error.message + "</p>"; return; }
  if (!data.length) { box.innerHTML = '<p class="vazio">Nenhum usuário ainda.</p>'; return; }
  box.innerHTML = data.map(linhaUsuario).join("");
  box.querySelectorAll("[data-salvar]").forEach((b) => (b.onclick = () => salvarUsuario(b.dataset.salvar)));
}

function linhaUsuario(u) {
  const niveis = ["pendente", "operador", "admin", "admin_geral"];
  const mods = ["", "logistica", "copa", "loja"];
  const optN = niveis.map((n) => `<option value="${n}" ${u.nivel === n ? "selected" : ""}>${rotuloNivel(n)}</option>`).join("");
  const optM = mods.map((m) => `<option value="${m}" ${(u.modulo || "") === m ? "selected" : ""}>${m ? MODULOS[m].nome : "—"}</option>`).join("");
  const pend = u.nivel === "pendente";
  return `<div class="item">
    <div class="item-main"><b>${u.nome || u.email}</b>
      <span class="badge ${pend ? "consumo" : "uso"}">${rotuloNivel(u.nivel)}</span></div>
    <div class="item-sub">${u.email}</div>
    <div class="row" style="margin-top:8px">
      <label>Papel<select id="niv-${u.id}">${optN}</select></label>
      <label>Módulo<select id="mod-${u.id}">${optM}</select></label>
      <label style="flex:0 0 auto">&nbsp;<button class="btn-sec" data-salvar="${u.id}">Salvar</button></label>
    </div>
  </div>`;
}

async function salvarUsuario(id) {
  const nivel = document.getElementById("niv-" + id).value;
  let modulo = document.getElementById("mod-" + id).value || null;
  if (nivel === "admin_geral" || nivel === "pendente") modulo = null;
  if ((nivel === "admin" || nivel === "operador") && !modulo) { alert("Escolha o módulo para Admin/Operador."); return; }
  const { error } = await sbClient.from("perfis").update({ nivel, modulo }).eq("id", id);
  if (error) { alert("Erro: " + error.message); return; }
  abrirUsuarios();
}

// ============================================================
// Navegação por abas
// ============================================================
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => ativarAba(tab.dataset.tab));
});

// ============================================================
// Helpers
// ============================================================
function msg(texto, erro = false) {
  statusEl.textContent = texto;
  statusEl.classList.toggle("erro", erro);
  if (!erro) setTimeout(() => (statusEl.textContent = ""), 3000);
}

async function proximoCodigo() {
  const n = (await db.contarProdutos(MODULO)) + 1;
  return MODULOS[MODULO].prefixo + "-" + String(n).padStart(4, "0");
}

function fmtData(iso) {
  return new Date(iso).toLocaleString("pt-BR");
}

// ============================================================
// PRODUTOS
// ============================================================
const formProduto = document.getElementById("form-produto");
formProduto.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(formProduto);
  let codigo = (f.get("codigo") || "").trim();
  if (!codigo) codigo = await proximoCodigo();

  const produto = {
    modulo: MODULO,
    codigo,
    nome: f.get("nome").trim(),
    tipo: f.get("tipo"),
    unidade: (f.get("unidade") || "un").trim(),
    qtd_estoque: Number(f.get("qtd")) || 0,
  };

  try {
    const salvo = await db.inserirProduto(produto);
    msg("✅ Produto cadastrado");
    formProduto.reset();
    mostrarQR(salvo);
    carregarProdutos();
  } catch (err) {
    msg("Erro: " + err.message, true);
  }
});

function mostrarQR(produto) {
  const box = document.getElementById("qr-resultado");
  box.classList.remove("hidden");
  document.getElementById("qr-nome").textContent = produto.nome;
  document.getElementById("qr-codigo").textContent = produto.codigo;
  const alvo = document.getElementById("qrcode");
  alvo.innerHTML = "";
  new QRCode(alvo, { text: produto.codigo, width: 220, height: 220 });
  document.getElementById("btn-imprimir").onclick = () => imprimirEtiqueta(produto, alvo);
}

function imprimirEtiqueta(produto, alvoQR) {
  const img = alvoQR.querySelector("img") || alvoQR.querySelector("canvas");
  const dataUrl = img.tagName === "IMG" ? img.src : img.toDataURL();
  const w = window.open("", "_blank");
  w.document.write(`
    <html><head><title>Etiqueta ${produto.codigo}</title>
    <style>body{font-family:sans-serif;text-align:center;padding:20px}
    img{width:200px;height:200px}h2{margin:8px 0}p{margin:2px;font-size:14px}
    .m{color:#E1251B;font-weight:bold;font-size:12px;letter-spacing:1px}</style>
    </head><body>
    <p class="m">METANOIA RADICAL · ${MODULOS[produto.modulo].nome}</p>
    <img src="${dataUrl}" />
    <h2>${produto.nome}</h2>
    <p><b>${produto.codigo}</b></p>
    <p>Tipo: ${produto.tipo} | Unidade: ${produto.unidade}</p>
    <script>window.onload=()=>{window.print()}<\/script>
    </body></html>`);
  w.document.close();
}

async function carregarProdutos() {
  const filtro = (document.getElementById("busca-produto").value || "").toLowerCase();
  let itens;
  try { itens = await db.listarProdutos(MODULO); }
  catch (err) { return msg("Erro: " + err.message, true); }

  itens = itens.filter(
    (p) => p.nome.toLowerCase().includes(filtro) || p.codigo.toLowerCase().includes(filtro)
  );
  const lista = document.getElementById("lista-produtos");
  if (!itens.length) { lista.innerHTML = '<p class="vazio">Nenhum produto neste módulo.</p>'; return; }
  lista.innerHTML = itens.map((p) => `
    <div class="item">
      <div class="item-main"><b>${p.nome}</b><span class="badge ${p.tipo}">${p.tipo}</span></div>
      <div class="item-sub"><span class="mono">${p.codigo}</span> · estoque: <b>${p.qtd_estoque} ${p.unidade}</b></div>
      <button class="link" data-qr='${encodeURIComponent(JSON.stringify(p))}'>ver QR</button>
    </div>`).join("");
  lista.querySelectorAll("button[data-qr]").forEach((b) => {
    b.onclick = () => mostrarQR(JSON.parse(decodeURIComponent(b.dataset.qr)));
  });
}
document.getElementById("busca-produto").addEventListener("input", carregarProdutos);

// ============================================================
// SCANNER QR + entrada manual
// ============================================================
let scanners = {};
function iniciarScanner(qual, readerId, aoLer) {
  pararScanners();
  const reader = new Html5Qrcode(readerId);
  scanners[qual] = reader;
  reader.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } },
    (texto) => { pararScanners(); aoLer(texto.trim()); }, () => {})
    .catch((err) => {
      msg("Câmera indisponível. Digite o código.", true);
      const c = prompt("Código do produto (ex: LOG-0001):");
      if (c) aoLer(c.trim());
    });
}
function pararScanners() {
  Object.values(scanners).forEach((s) => { try { s.stop().then(() => s.clear()).catch(() => {}); } catch (_) {} });
  scanners = {};
}
async function acharOuAvisar(codigo) {
  const p = await db.acharProduto(MODULO, codigo);
  if (!p) msg("QR não encontrado neste módulo: " + codigo, true);
  return p;
}

// RETIRADA
let produtoRetirada = null;
document.getElementById("scan-retirada").onclick = () =>
  iniciarScanner("retirada", "reader-retirada", async (codigo) => {
    produtoRetirada = await acharOuAvisar(codigo);
    if (!produtoRetirada) return;
    document.getElementById("info-retirada").innerHTML = infoProduto(produtoRetirada);
    document.getElementById("form-retirada").classList.remove("hidden");
  });
document.getElementById("form-retirada").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!produtoRetirada) return;
  const f = new FormData(e.target);
  const qtd = Number(f.get("quantidade"));
  if (qtd <= 0) return msg("Quantidade inválida", true);
  if (qtd > produtoRetirada.qtd_estoque) return msg(`Estoque insuficiente (tem ${produtoRetirada.qtd_estoque})`, true);
  await registrar("saida", produtoRetirada, {
    pessoa: f.get("pessoa").trim(), quantidade: qtd,
    observacao: f.get("observacao").trim(), novoEstoque: produtoRetirada.qtd_estoque - qtd,
  });
  e.target.reset(); e.target.classList.add("hidden"); produtoRetirada = null;
});

// DEVOLUÇÃO
let produtoDevolucao = null;
document.getElementById("scan-devolucao").onclick = () =>
  iniciarScanner("devolucao", "reader-devolucao", async (codigo) => {
    produtoDevolucao = await acharOuAvisar(codigo);
    if (!produtoDevolucao) return;
    document.getElementById("info-devolucao").innerHTML = infoProduto(produtoDevolucao);
    document.getElementById("form-devolucao").classList.remove("hidden");
  });
document.getElementById("form-devolucao").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!produtoDevolucao) return;
  const f = new FormData(e.target);
  const qtd = Number(f.get("quantidade"));
  if (qtd <= 0) return msg("Quantidade inválida", true);
  await registrar("retorno", produtoDevolucao, {
    pessoa: f.get("pessoa").trim(), quantidade: qtd,
    observacao: f.get("observacao").trim(), novoEstoque: produtoDevolucao.qtd_estoque + qtd,
  });
  e.target.reset(); e.target.classList.add("hidden"); produtoDevolucao = null;
});

function infoProduto(p) {
  return `<b>${p.nome}</b> <span class="badge ${p.tipo}">${p.tipo}</span><br>
    <span class="mono">${p.codigo}</span> · estoque atual: <b>${p.qtd_estoque} ${p.unidade}</b>`;
}
async function registrar(tipo, produto, dados) {
  try {
    await db.inserirMov({
      modulo: MODULO, produto_id: produto.id, tipo,
      pessoa: dados.pessoa, quantidade: dados.quantidade, observacao: dados.observacao || null,
    });
    await db.atualizarEstoque(produto.id, dados.novoEstoque);
    msg(`✅ ${tipo === "saida" ? "Saída" : "Retorno"} registrado. Estoque: ${dados.novoEstoque}`);
  } catch (err) { msg("Erro: " + err.message, true); }
}

// ============================================================
// MOVIMENTAÇÕES (lista rápida)
// ============================================================
document.getElementById("btn-recarregar-mov").onclick = carregarMovimentacoes;
async function carregarMovimentacoes() {
  let data;
  try { data = await db.listarMov(MODULO); }
  catch (err) { return msg("Erro: " + err.message, true); }
  const lista = document.getElementById("lista-mov");
  if (!data.length) { lista.innerHTML = '<p class="vazio">Nenhuma movimentação neste módulo.</p>'; return; }
  lista.innerHTML = data.map((m) => {
    const p = m.produtos || {};
    const sinal = m.tipo === "saida" ? "−" : "+";
    return `<div class="item">
      <div class="item-main"><b>${p.nome || "?"}</b>
        <span class="badge ${m.tipo === "saida" ? "consumo" : "uso"}">${sinal}${m.quantidade} ${p.unidade || ""}</span></div>
      <div class="item-sub">${m.tipo === "saida" ? "para" : "de"} <b>${m.pessoa}</b> ·
        <span class="mono">${p.codigo || ""}</span> · ${fmtData(m.criado_em)}
        ${m.observacao ? "<br>obs: " + m.observacao : ""}</div>
    </div>`;
  }).join("");
}

// ============================================================
// RELATÓRIOS  (inventário + movimentação, imprimir + CSV)
// ============================================================
let cacheInventario = [];
let cacheMov = [];

async function gerarRelatorios() {
  cacheInventario = await db.listarProdutos(MODULO);
  await gerarMovFiltrado();
  renderInventario();
}

function renderInventario() {
  const box = document.getElementById("rel-inventario");
  if (!cacheInventario.length) { box.innerHTML = '<p class="vazio">Sem produtos.</p>'; return; }
  const linhas = cacheInventario.map((p) => `
    <tr>
      <td class="mono">${p.codigo}</td><td>${p.nome}</td><td>${p.tipo}</td>
      <td>${p.unidade}</td><td class="${p.qtd_estoque <= 0 ? "zerado" : ""}"><b>${p.qtd_estoque}</b></td>
    </tr>`).join("");
  box.innerHTML = `
    <div class="rel-resumo">Itens cadastrados: <b>${cacheInventario.length}</b></div>
    <div class="tabela-wrap"><table class="tabela">
      <thead><tr><th>Código</th><th>Nome</th><th>Tipo</th><th>Un.</th><th>Estoque</th></tr></thead>
      <tbody>${linhas}</tbody></table></div>`;
}

document.getElementById("mov-filtrar").onclick = () => gerarMovFiltrado();

async function gerarMovFiltrado() {
  const de = document.getElementById("mov-de").value;
  const ate = document.getElementById("mov-ate").value;
  let mov = await db.listarMov(MODULO);
  if (de) mov = mov.filter((m) => m.criado_em.slice(0, 10) >= de);
  if (ate) mov = mov.filter((m) => m.criado_em.slice(0, 10) <= ate);
  cacheMov = mov;
  renderMovimentacao();
}

function renderMovimentacao() {
  const box = document.getElementById("rel-movimentacao");
  if (!cacheMov.length) { box.innerHTML = '<p class="vazio">Nenhuma movimentação no período.</p>'; return; }
  let totSaida = 0, totRetorno = 0;
  const linhas = cacheMov.map((m) => {
    const p = m.produtos || {};
    const ent = m.tipo === "retorno";
    if (ent) totRetorno += Number(m.quantidade); else totSaida += Number(m.quantidade);
    return `<tr>
      <td>${fmtData(m.criado_em)}</td>
      <td class="${ent ? "td-entrada" : "td-saida"}">${ent ? "Entrada" : "Saída"}</td>
      <td>${p.nome || "?"}</td><td class="mono">${p.codigo || ""}</td>
      <td>${m.pessoa}</td><td><b>${ent ? "+" : "−"}${m.quantidade}</b> ${p.unidade || ""}</td>
      <td>${m.observacao || ""}</td>
    </tr>`;
  }).join("");
  box.innerHTML = `
    <div class="rel-resumo">Registros: <b>${cacheMov.length}</b> ·
      Saídas: <b>${totSaida}</b> · Entradas: <b>${totRetorno}</b></div>
    <div class="tabela-wrap"><table class="tabela">
      <thead><tr><th>Data/Hora</th><th>Mov.</th><th>Produto</th><th>Código</th><th>Pessoa</th><th>Qtd</th><th>Obs.</th></tr></thead>
      <tbody>${linhas}</tbody></table></div>`;
}

// ---- Ações de relatório (imprimir / CSV) ----
document.querySelectorAll("[data-rel]").forEach((b) => {
  b.onclick = () => {
    const nomeMod = MODULOS[MODULO].nome;
    if (b.dataset.rel === "inv-print") imprimirRel("Inventário · " + nomeMod, document.getElementById("rel-inventario").innerHTML);
    if (b.dataset.rel === "mov-print") imprimirRel("Movimentação · " + nomeMod, document.getElementById("rel-movimentacao").innerHTML);
    if (b.dataset.rel === "inv-csv") baixarCSV("inventario_" + MODULO,
      ["Codigo", "Nome", "Tipo", "Unidade", "Estoque"],
      cacheInventario.map((p) => [p.codigo, p.nome, p.tipo, p.unidade, p.qtd_estoque]));
    if (b.dataset.rel === "mov-csv") baixarCSV("movimentacao_" + MODULO,
      ["DataHora", "Movimento", "Produto", "Codigo", "Pessoa", "Quantidade", "Unidade", "Observacao"],
      cacheMov.map((m) => {
        const p = m.produtos || {};
        return [fmtData(m.criado_em), m.tipo === "retorno" ? "Entrada" : "Saida",
          p.nome || "", p.codigo || "", m.pessoa, m.quantidade, p.unidade || "", m.observacao || ""];
      }));
  };
});

function imprimirRel(titulo, htmlInterno) {
  const w = window.open("", "_blank");
  w.document.write(`
    <html><head><title>${titulo}</title>
    <style>
      body{font-family:sans-serif;padding:20px;color:#222}
      h1{color:#E1251B;font-size:18px;margin:0 0 4px}
      .sub{color:#666;font-size:12px;margin:0 0 14px}
      table{border-collapse:collapse;width:100%;font-size:12px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
      th{background:#f3ede1}
      .rel-resumo{font-size:13px;margin:8px 0}
      .td-entrada{color:#1f7a44;font-weight:bold}.td-saida{color:#b81b13;font-weight:bold}
    </style></head><body>
    <h1>Metanoia Radical — ${titulo}</h1>
    <p class="sub">Gerado em ${new Date().toLocaleString("pt-BR")}</p>
    ${htmlInterno}
    <script>window.onload=()=>window.print()<\/script>
    </body></html>`);
  w.document.close();
}

function baixarCSV(nomeArquivo, cabecalho, linhas) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const corpo = [cabecalho, ...linhas].map((l) => l.map(esc).join(";")).join("\r\n");
  const blob = new Blob(["﻿" + corpo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nomeArquivo + ".csv";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ============================================================
// START
// ============================================================
initApp();
