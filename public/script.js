// script.js
// Parte que roda no navegador: lê os campos, chama a API do servidor e desenha o resultado na tela.

// ---------------------------------------------------------------------------
// Elementos da página (os ids vêm do index.html)
// ---------------------------------------------------------------------------
const campoChavesDoGemini = document.querySelector("#chaves_gemini");
const campoChaveDaSteam = document.querySelector("#chave_steam");
const campoSteamId = document.querySelector("#input_player");
const seletorQuantidade = document.querySelector("#opt_quantidade");
const seletorGenero = document.querySelector("#opt_genero");
const seletorFocoEmPromocao = document.querySelector("#opt_foco");
const botaoGerar = document.querySelector("#btn_gerar");
const areaDaMensagem = document.querySelector("#mensagem");
const areaDoResultado = document.querySelector("#resultado");

// A cor do anel de compatibilidade depende da nota (0 a 100).
const NOTA_MINIMA_PARA_VERDE = 85;
const NOTA_MINIMA_PARA_AMARELO = 70;

// ---------------------------------------------------------------------------
// Campos lembrados pelo navegador (localStorage), para não digitar tudo de novo
// ---------------------------------------------------------------------------
function restaurarCamposSalvos() {
  campoChavesDoGemini.value = localStorage.getItem("chavesGemini") || "";
  campoChaveDaSteam.value = localStorage.getItem("chaveSteam") || "";
  campoSteamId.value = localStorage.getItem("steamId") || "";
}

function salvarCamposNoNavegador() {
  localStorage.setItem("chavesGemini", campoChavesDoGemini.value);
  localStorage.setItem("chaveSteam", campoChaveDaSteam.value);
  localStorage.setItem("steamId", campoSteamId.value.trim());
}

// ---------------------------------------------------------------------------
// Funções pequenas de apoio
// ---------------------------------------------------------------------------

// Troca caracteres especiais (como < e >) por versões seguras.
// Assim, um texto vindo da Steam ou do Gemini nunca quebra o HTML da página.
function escaparHtml(texto) {
  const substituicoes = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

  return String(texto ?? "").replace(/[&<>"']/g, (caractere) => substituicoes[caractere]);
}

function mostrarMensagem(texto, ehErro) {
  areaDaMensagem.textContent = texto;
  areaDaMensagem.className = ehErro ? "erro" : "";
}

// Devolve uma das cores definidas no style.css.
function escolherCorDaNota(nota) {
  if (nota >= NOTA_MINIMA_PARA_VERDE) return "var(--verde)";
  if (nota >= NOTA_MINIMA_PARA_AMARELO) return "var(--amarelo)";
  return "var(--vermelho)";
}

// Garante que a nota fique entre 0 e 100, mesmo que o Gemini devolva algo estranho.
function limitarNota(nota) {
  return Math.max(0, Math.min(100, Number(nota) || 0));
}

// ---------------------------------------------------------------------------
// Peças da tela: cada função devolve um pedaço de HTML
// ---------------------------------------------------------------------------

// Gráfico de barras. Cada item tem { nome, valor }.
// "valorMaximo" é o valor que preenche a barra inteira; "sufixo" é a unidade (% ou h).
function montarGraficoDeBarras(itens, valorMaximo, sufixo) {
  return itens
    .map((item) => {
      const larguraEmPorcentagem = Math.min((item.valor / valorMaximo) * 100, 100);

      return `
      <div class="linha">
        <span class="rotulo">${escaparHtml(item.nome)}</span>
        <div class="barra"><span style="width:${larguraEmPorcentagem}%"></span></div>
        <span class="valor">${item.valor}${sufixo}</span>
      </div>`;
    })
    .join("");
}

// Preço, desconto e loja de um jogo em promoção.
function montarOferta(recomendacao) {
  if (!recomendacao.emPromocao) {
    return "";
  }

  const selosDeDesconto = recomendacao.desconto
    ? `<span class="desconto">${escaparHtml(recomendacao.desconto)}</span>`
    : "";
  const seloDaLoja = recomendacao.loja ? `<span class="loja">${escaparHtml(recomendacao.loja)}</span>` : "";

  return `
        <div class="oferta">
          <span class="selo">EM PROMOÇÃO · ${escaparHtml(recomendacao.preco)}</span>
          ${selosDeDesconto}
          ${seloDaLoja}
        </div>`;
}

function montarCartaoDeRecomendacao(recomendacao) {
  const nota = limitarNota(recomendacao.compatibilidade);
  const classeDoCartao = recomendacao.emPromocao ? "jogo promo" : "jogo";
  const tags = (recomendacao.tags || []).map((tag) => `<span class="tag">${escaparHtml(tag)}</span>`).join("");

  return `
    <article class="${classeDoCartao}">
      <div class="jogo-topo">
        <h3>${escaparHtml(recomendacao.nome)}</h3>
        <div class="anel" style="--p:${nota};--cor:${escolherCorDaNota(nota)}"><span>${nota}%</span></div>
      </div>
      <p>${escaparHtml(recomendacao.motivo)}</p>
      <div class="tags">${tags}</div>
      ${montarOferta(recomendacao)}
    </article>`;
}

function montarCartaoDoPerfil(perfil, resumoDoPerfil) {
  return `
    <section class="cartao perfil">
      <img class="avatar" src="${escaparHtml(perfil.avatar)}" alt="Avatar">
      <div>
        <h2>${escaparHtml(perfil.nome)}</h2>
        <p>${escaparHtml(resumoDoPerfil)}</p>
      </div>
    </section>`;
}

function montarIndicadores(totalDeJogos, totalDeRecomendacoes, totalEmPromocao) {
  return `
    <section class="indicadores">
      <div class="indicador"><strong>${totalDeJogos}</strong><span>jogos na conta</span></div>
      <div class="indicador"><strong>${totalDeRecomendacoes}</strong><span>recomendações</span></div>
      <div class="indicador"><strong>${totalEmPromocao}</strong><span>em promoção</span></div>
    </section>`;
}

// Texto que mostra qual chave do Gemini respondeu. Exemplo:
// "Respondido pela chave 2 de 2 (chave 1: erro 400)"
function montarTextoDoRodizio(rodizio) {
  const chavesQueFalharam = rodizio.falhas.map((falha) => `chave ${falha.chave}: erro ${falha.status}`);
  const detalhesDasFalhas = chavesQueFalharam.length > 0 ? ` (${chavesQueFalharam.join(", ")})` : "";

  return `Respondido pela chave ${rodizio.chaveUsada} de ${rodizio.totalChaves}${detalhesDasFalhas}`;
}

function montarSecaoDeGeneros(generos) {
  const itensDoGrafico = generos.map((genero) => ({ nome: genero.nome, valor: genero.percentual }));

  return `
      <section class="cartao">
        <h2>Seus gêneros</h2>
        ${montarGraficoDeBarras(itensDoGrafico, 100, "%")}
      </section>`;
}

// Se o jogador não jogou nada nas últimas 2 semanas, a seção nem aparece.
function montarSecaoDeHorasRecentes(jogosRecentes) {
  if (jogosRecentes.length === 0) {
    return "";
  }

  const itensDoGrafico = jogosRecentes.map((jogo) => ({ nome: jogo.nome, valor: jogo.horas }));
  const maiorQuantidadeDeHoras = Math.max(...itensDoGrafico.map((item) => item.valor));

  return `
      <section class="cartao">
        <h2>Horas nas últimas 2 semanas</h2>
        ${montarGraficoDeBarras(itensDoGrafico, maiorQuantidadeDeHoras, "h")}
      </section>`;
}

// A imagem da capa vem do endereço público da Steam, que usa o appid do jogo.
function montarCapaDoJogo(jogo) {
  const enderecoDaCapa = `https://cdn.akamai.steamstatic.com/steam/apps/${jogo.appid}/header.jpg`;

  return `
      <div class="capa">
        <img src="${enderecoDaCapa}" alt="${escaparHtml(jogo.nome)}" loading="lazy" onerror="this.style.display='none'">
        <span>${escaparHtml(jogo.nome)} · ${jogo.horas}h</span>
      </div>`;
}

function montarSecaoDeCapas(jogosMaisJogados) {
  return `
    <section class="cartao">
      <h2>Mais jogados</h2>
      <div class="capas">${jogosMaisJogados.map(montarCapaDoJogo).join("")}</div>
    </section>`;
}

// Junta todas as peças e coloca o resultado na página.
function mostrarResultado(dadosDaApi) {
  const { perfil, resumoPerfil, generos, recomendacoes, rodizio } = dadosDaApi;
  const totalEmPromocao = recomendacoes.filter((recomendacao) => recomendacao.emPromocao).length;

  areaDoResultado.innerHTML = `
    ${montarCartaoDoPerfil(perfil, resumoPerfil)}
    ${montarIndicadores(perfil.totalJogos, recomendacoes.length, totalEmPromocao)}
    <p class="rodizio">${escaparHtml(montarTextoDoRodizio(rodizio))}</p>
    <div class="graficos">
      ${montarSecaoDeGeneros(generos)}
      ${montarSecaoDeHorasRecentes(perfil.maisRecentes)}
    </div>
    ${montarSecaoDeCapas(perfil.maisJogados)}
    <h2>Recomendados para você</h2>
    <div class="grade">${recomendacoes.map(montarCartaoDeRecomendacao).join("")}</div>`;
}

// ---------------------------------------------------------------------------
// Ação principal: clique no botão "Gerar recomendações"
// ---------------------------------------------------------------------------

// Uma chave por linha no campo de texto; linhas vazias são ignoradas.
function lerChavesDoGemini() {
  return campoChavesDoGemini.value
    .split("\n")
    .map((linha) => linha.trim())
    .filter((linha) => linha !== "");
}

// Reúne tudo o que o servidor precisa para gerar as recomendações.
function montarPedidoParaOServidor(steamId, chavesDoGemini) {
  return {
    steamId,
    chaveSteam: campoChaveDaSteam.value.trim(),
    chavesGemini: chavesDoGemini,
    opcoes: {
      quantidade: seletorQuantidade.value,
      genero: seletorGenero.value,
      foco: seletorFocoEmPromocao.value,
    },
  };
}

async function gerarRecomendacoes() {
  const steamId = campoSteamId.value.trim();
  const chavesDoGemini = lerChavesDoGemini();

  if (!steamId || chavesDoGemini.length === 0) {
    mostrarMensagem("Informe o SteamID e ao menos uma chave do Gemini.", true);
    return;
  }

  salvarCamposNoNavegador();

  // Enquanto espera: desliga o botão (evita cliques repetidos) e limpa o resultado antigo.
  botaoGerar.disabled = true;
  areaDoResultado.innerHTML = "";
  mostrarMensagem("Consultando a Steam, buscando promoções e pedindo ao Gemini... pode levar alguns segundos.");

  try {
    const resposta = await fetch("/api/recomendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(montarPedidoParaOServidor(steamId, chavesDoGemini)),
    });
    const dadosDaApi = await resposta.json();

    if (dadosDaApi.erro) {
      mostrarMensagem(dadosDaApi.erro, true);
      return;
    }

    mostrarMensagem("");
    mostrarResultado(dadosDaApi);
  } catch (erro) {
    mostrarMensagem("Não foi possível falar com o servidor.", true);
  } finally {
    botaoGerar.disabled = false; // roda sempre, com sucesso ou com erro
  }
}

// ---------------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------------
restaurarCamposSalvos();
botaoGerar.addEventListener("click", gerarRecomendacoes);