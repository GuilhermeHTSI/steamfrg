// steam.js
// Conversa com a Steam Web API para descobrir quem é o jogador e quais jogos ele tem.

const URL_BASE_DA_STEAM = "https://api.steampowered.com";

const QUANTIDADE_DE_JOGOS_MAIS_JOGADOS = 10;
const QUANTIDADE_DE_JOGOS_RECENTES = 5;

function converterMinutosParaHoras(minutos) {
  return Math.round(minutos / 60);
}

// Baixa o endereço informado e devolve o conteúdo já convertido de JSON para objeto.
async function baixarJson(url) {
  const resposta = await fetch(url);

  if (!resposta.ok) {
    throw new Error(`A Steam respondeu com um erro ${resposta.status}`);
  }

  return resposta.json();
}

function montarUrlDoResumoDoJogador(steamId, chaveSteam) {
  return `${URL_BASE_DA_STEAM}/ISteamUser/GetPlayerSummaries/v2/?key=${chaveSteam}&steamids=${steamId}`;
}

function montarUrlDosJogosDoJogador(steamId, chaveSteam) {
  return `${URL_BASE_DA_STEAM}/IPlayerService/GetOwnedGames/v1/?key=${chaveSteam}&steamid=${steamId}&include_appinfo=true`;
}

// Converte um jogo no formato da Steam para o formato simples usado pelo nosso app.
function resumirJogo(jogoDaSteam, minutosJogados) {
  return {
    appid: jogoDaSteam.appid,
    nome: jogoDaSteam.name,
    horas: converterMinutosParaHoras(minutosJogados),
  };
}

// Os 10 jogos com mais horas jogadas desde sempre.
function escolherMaisJogados(jogos) {
  return [...jogos] // a cópia evita mudar a lista original ao ordenar
    .sort((jogoA, jogoB) => jogoB.playtime_forever - jogoA.playtime_forever)
    .slice(0, QUANTIDADE_DE_JOGOS_MAIS_JOGADOS)
    .map((jogo) => resumirJogo(jogo, jogo.playtime_forever));
}

// Os 5 jogos mais jogados nas últimas 2 semanas (ignora quem não jogou nesse período).
function escolherMaisRecentes(jogos) {
  return jogos
    .filter((jogo) => jogo.playtime_2weeks)
    .sort((jogoA, jogoB) => jogoB.playtime_2weeks - jogoA.playtime_2weeks)
    .slice(0, QUANTIDADE_DE_JOGOS_RECENTES)
    .map((jogo) => resumirJogo(jogo, jogo.playtime_2weeks));
}

// Devolve o perfil do jogador junto com um resumo da biblioteca de jogos.
// Se o SteamID não existir, lança o erro "NAO_ENCONTRADO".
async function buscarPerfil(steamId, chaveSteam) {
  const steamIdSeguro = encodeURIComponent(steamId);

  // Passo 1: nome e avatar do jogador
  const respostaDoJogador = await baixarJson(montarUrlDoResumoDoJogador(steamIdSeguro, chaveSteam));
  const jogador = respostaDoJogador.response.players[0];

  if (!jogador) {
    throw new Error("NAO_ENCONTRADO");
  }

  // Passo 2: biblioteca de jogos (vem vazia se o perfil for privado)
  const respostaDosJogos = await baixarJson(montarUrlDosJogosDoJogador(steamIdSeguro, chaveSteam));
  const jogos = respostaDosJogos.response.games || [];

  return {
    nome: jogador.personaname,
    avatar: jogador.avatarfull,
    totalJogos: jogos.length,
    maisJogados: escolherMaisJogados(jogos),
    maisRecentes: escolherMaisRecentes(jogos),
    possuidos: jogos.map((jogo) => jogo.name), // nomes de todos os jogos da conta
  };
}

module.exports = { buscarPerfil };