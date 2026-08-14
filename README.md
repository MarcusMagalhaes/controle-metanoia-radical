# Controle Metanoia Radical · Estoque QR

Controle de estoque por leitura de QR code. Roda no **celular e no PC** pelo navegador. Sem app nativo.

## ✅ Rodar AGORA (sem instalar nada, sem conta)
O app já vem com **banco pronto embutido** (salva no próprio navegador — `localStorage`). Não precisa configurar nada pra começar.

1. Nesta pasta, rode um servidor local (pra câmera funcionar):
   ```bash
   python -m http.server 8000
   ```
   Não tem Python? Só abrir o `index.html` com duplo-clique já funciona pra tudo — só a **câmera** não liga em `file://`; nesse caso, ao clicar em *Ler QR* ele pede pra **digitar o código** (ex: `LOG-0001`).
2. Abra **http://localhost:8000**
3. Clique num módulo → cadastre um produto → faça retirada → devolução → veja os **Relatórios**.

Onde ficam os dados: no navegador **deste aparelho**. Cada navegador/PC tem o seu. Fazer backup/mover = ver seção Supabase abaixo (compartilha entre aparelhos).

> Status na tela mostra o banco em uso: **💾 Local (neste aparelho)** ou **🟢 Nuvem (Supabase)**.

---

## Três módulos (ambientes)
Na entrada, escolhe o ambiente: **Logística** (📦, vermelho), **Copa / Cozinha** (🍽️, laranja) ou **Lojinha** (🛍️, verde). Mesma lógica, dados **totalmente separados** por módulo — produtos, estoque e movimentações de um não aparecem no outro. Botão **Trocar** no topo alterna. Códigos com prefixo: `LOG-0001`, `COP-0001`, `LOJ-0001`.

## Logo
A logo é o arquivo **`logo.jpg`** nesta pasta (carregada automático na tela inicial e no cabeçalho). Pra trocar, substitua o `logo.jpg` mantendo o nome.

## O que faz
- Cadastra produto (nome, tipo, unidade, estoque) e **gera QR** para imprimir.
- **Retirada**: lê o QR, informa para quem e quantidade → baixa do estoque.
- **Devolução**: lê o QR, informa quem devolve e quanto voltou → soma no estoque.
  - Item de **uso** volta completo. Item de **consumo** pode voltar com menos (ex: rolo de 50m volta com 20m — entra 20m).
- **Movimentações**: histórico de tudo que saiu e voltou.
- **Relatórios**:
  - *Inventário* — o que você tem em estoque agora (código, nome, tipo, unidade, saldo). Imprime e baixa CSV (abre no Excel).
  - *Movimentação* — entrou/saiu com data e hora, pessoa e observação. Filtra por período. Imprime e baixa CSV.

---

## (Opcional) Compartilhar entre celular e PC — Supabase
Só faça isto quando quiser o **mesmo estoque** em vários aparelhos ao mesmo tempo. Enquanto `config.js` ficar com os valores `COLE...`, o app usa o banco local e ignora o Supabase.

### 1. Criar banco no Supabase
1. Crie conta grátis em https://supabase.com → **New project** (guarde a senha do banco).
2. Menu **SQL Editor** → **New query** → cole todo o conteúdo de [`schema.sql`](schema.sql) → **Run**.
3. Menu **Project Settings** → **Data API** (ou **API**). Copie:
   - **Project URL**
   - **anon public** key

### 2. Configurar o app
Abra [`config.js`](config.js) e cole as duas chaves:
```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJ...",
};
```

### 3. Publicar no GitHub Pages
1. Crie um repositório no GitHub e suba estes arquivos (todos, incluindo `config.js`).
2. Repo → **Settings** → **Pages** → *Source*: `Deploy from a branch` → branch `main` / pasta `/root` → **Save**.
3. Aguarde ~1 min. A URL aparece no topo da página Pages (ex: `https://seu-user.github.io/almoxarifado-qr/`).
4. Abra a URL no PC e no celular. Pronto.

> **Câmera exige HTTPS.** GitHub Pages já é HTTPS, então a leitura de QR funciona. No celular, o navegador vai pedir permissão de câmera na primeira leitura — aceite.

---

## Como usar
- **Cadastrar**: aba *Produtos* → preencha → *Cadastrar + gerar QR* → *Imprimir etiqueta* → cole na prateleira.
- **Tirar material**: aba *Retirada* → *Ler QR* → aponta a câmera → informa pessoa e quantidade → *Confirmar saída*.
- **Devolver**: aba *Devolução* → *Ler QR* → informa quem devolve e quanto voltou.
- **Conferir**: aba *Movimentações* mostra o histórico; aba *Produtos* mostra o saldo atual.

---

## ⚠️ Segurança (leia)
Como o site é estático, a chave **anon** fica visível. Quem tiver a URL **e** a chave consegue ler/gravar no banco. Para uso interno de almoxarifado costuma bastar. Para travar depois:
- Repo **privado** não protege (a chave roda no navegador do usuário) — o que protege é o Supabase.
- Ative **Authentication** no Supabase (login por e-mail) e troque as policies de `using(true)` para exigir usuário logado (`using (auth.role() = 'authenticated')`). Posso ajustar isso quando quiser.

## Rodar localmente para testar
Câmera não funciona em `file://`. Sirva por HTTP local:
```bash
python -m http.server 8000
```
Abra `http://localhost:8000`. (Câmera em `localhost` é permitida pelos navegadores.)
