const $ = (seletor) => document.querySelector(seletor);

const campoChaves = $("#chaves_gemini");
const campoChaveSteam = $("#chave_steam");
const campoId = $("#input_player");
const botao = $("#btn_gerar");
const mensagem = $("#mensagem");
const resultado = $("#resultado");

// Lembra o que o usuário digitou da última vez (só neste navegador)
campoChaves.value = localStorage.getItem("chavesGemini") || "";
campoChaveSteam.value = localStorage.getItem("chaveSteam") || "";
campoId.value = localStorage.getItem("steamId") || "";

// Evita que textos vindos da Steam/Gemini quebrem o HTML da página
const esc = (texto) =>
  String(texto ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

function mostrarMensagem(texto, ehErro) {
  mensagem.textContent = texto;
  mensagem.className = ehErro ? "erro" : "";
}

function corDaNota(nota) {
  if (nota >= 85) return "var(--verde)";
  if (nota >= 70) return "var(--amarelo)";
  return "var(--vermelho)";
}

// Gráfico de barras: itens = [{ nome, valor }], max = valor que preenche a barra toda
function grafico(itens, max, sufixo) {
  return itens
    .map(
      (i) => `
      <div class="linha">
        <span class="rotulo">${esc(i.nome)}</span>
        <div class="barra"><span style="width:${Math.min((i.valor / max) * 100, 100)}%"></span></div>
        <span class="valor">${i.valor}${sufixo}</span>
      </div>`
    )
    .join("");
}

function cartaoJogo(r) {
  const nota = Math.max(0, Math.min(100, Number(r.compatibilidade) || 0));
  return `
    <article class="jogo ${r.emPromocao ? "promo" : ""}">
      <div class="jogo-topo">
        <h3>${esc(r.nome)}</h3>
        <div class="anel" style="--p:${nota};--cor:${corDaNota(nota)}"><span>${nota}%</span></div>
      </div>
      <p>${esc(r.motivo)}</p>
      <div class="tags">${(r.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
      ${r.emPromocao ? `
      <div class="oferta">
        <span class="selo">EM PROMOÇÃO · ${esc(r.preco)}</span>
        ${r.desconto ? `<span class="desconto">${esc(r.desconto)}</span>` : ""}
        ${r.loja ? `<span class="loja">${esc(r.loja)}</span>` : ""}
      </div>` : ""}
    </article>`;
}

function desenharResultado({ perfil, resumoPerfil, generos, recomendacoes, rodizio }) {
  const promocoes = recomendacoes.filter((r) => r.emPromocao).length;

  const falhas = rodizio.falhas.length
  ? ` (${rodizio.falhas.map((f) => `chave ${f.chave}: erro ${f.status}`).join(", ")})`
  : "";
  const textoRodizio = `Respondido pela chave ${rodizio.chaveUsada} de ${rodizio.totalChaves}${falhas}`;

  const recentes = perfil.maisRecentes.length
    ? `<section class="cartao">
         <h2>Horas nas últimas 2 semanas</h2>
         ${grafico(
           perfil.maisRecentes.map((j) => ({ nome: j.nome, valor: j.horas })),
           Math.max(...perfil.maisRecentes.map((j) => j.horas)),
           "h"
         )}
       </section>`
    : "";

  const capas = perfil.maisJogados
    .map(
      (j) => `
      <div class="capa">
        <img src="https://cdn.akamai.steamstatic.com/steam/apps/${j.appid}/header.jpg"
             alt="${esc(j.nome)}" loading="lazy" onerror="this.style.display='none'">
        <span>${esc(j.nome)} · ${j.horas}h</span>
      </div>`
    )
    .join("");

  resultado.innerHTML = `
    <section class="cartao perfil">
      <img class="avatar" src="${esc(perfil.avatar)}" alt="Avatar">
      <div>
        <h2>${esc(perfil.nome)}</h2>
        <p>${esc(resumoPerfil)}</p>
      </div>
    </section>

    <section class="indicadores">
      <div class="indicador"><strong>${perfil.totalJogos}</strong><span>jogos na conta</span></div>
      <div class="indicador"><strong>${recomendacoes.length}</strong><span>recomendações</span></div>
      <div class="indicador"><strong>${promocoes}</strong><span>em promoção</span></div>
    </section>

    <p class="rodizio">${esc(textoRodizio)}</p>

    <div class="graficos">
      <section class="cartao">
        <h2>Seus gêneros</h2>
        ${grafico(generos.map((g) => ({ nome: g.nome, valor: g.percentual })), 100, "%")}
      </section>
      ${recentes}
    </div>

    <section class="cartao">
      <h2>Mais jogados</h2>
      <div class="capas">${capas}</div>
    </section>

    <h2>Recomendados para você</h2>
    <div class="grade">${recomendacoes.map(cartaoJogo).join("")}</div>`;
}

botao.onclick = function () {
  const chavesGemini = campoChaves.value
    .split("\n")
    .map((c) => c.trim())
    .filter(Boolean);
  const steamId = campoId.value.trim();

  if (!steamId || chavesGemini.length === 0) {
    mostrarMensagem("Informe o SteamID e ao menos uma chave do Gemini.", true);
    return;
  }

  localStorage.setItem("chavesGemini", campoChaves.value);
  localStorage.setItem("chaveSteam", campoChaveSteam.value);
  localStorage.setItem("steamId", steamId);

  botao.disabled = true;
  resultado.innerHTML = "";
  mostrarMensagem("Consultando a Steam, buscando promoções e pedindo ao Gemini... pode levar alguns segundos.");

  fetch("/api/recomendar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      steamId,
      chaveSteam: campoChaveSteam.value.trim(),
      chavesGemini,
      opcoes: {
        quantidade: $("#opt_quantidade").value,
        genero: $("#opt_genero").value,
        foco: $("#opt_foco").value,
      },
    }),
  })
    .then((res) => res.json())
    .then((dados) => {
      if (dados.erro) {
        mostrarMensagem(dados.erro, true);
        return;
      }
      mostrarMensagem("");
      desenharResultado(dados);
    })
    .catch(() => mostrarMensagem("Não foi possível falar com o servidor.", true))
    .finally(() => {
      botao.disabled = false;
    });
};