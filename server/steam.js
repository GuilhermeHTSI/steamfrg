function buscarJson(url) {
  return fetch(url).then((resposta) => {
    if (!resposta.ok)
      throw new Error(`A Steam respondeu com um erro ${resposta.status}`);
    return resposta.json();
  });
}

const paraHoras = (minutos) => Math.round(minutos / 60);

// Devolve o perfil + a lista de jogos que o usuário possui.
function buscarPerfil(steamId, chave) {
  const id = encodeURIComponent(steamId);
  const urlJogador = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${chave}&steamids=${id}`;
  const urlJogos = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${chave}&steamid=${id}&include_appinfo=true`;

  let jogador;

  return buscarJson(urlJogador)
    .then((dados) => {
      jogador = dados.response.players[0];
      if (!jogador) throw new Error("NAO_ENCONTRADO");
      return buscarJson(urlJogos);
    })
    .then((dados) => {
      const jogos = dados.response.games || [];

      const maisJogados = [...jogos]
        .sort((a, b) => b.playtime_forever - a.playtime_forever)
        .slice(0, 10)
        .map((j) => ({ appid: j.appid, nome: j.name, horas: paraHoras(j.playtime_forever) }));

      const maisRecentes = jogos
        .filter((j) => j.playtime_2weeks)
        .sort((a, b) => b.playtime_2weeks - a.playtime_2weeks)
        .slice(0, 5)
        .map((j) => ({ appid: j.appid, nome: j.name, horas: paraHoras(j.playtime_2weeks) }));

      return {
        nome: jogador.personaname,
        avatar: jogador.avatarfull,
        totalJogos: jogos.length,
        maisJogados,
        maisRecentes,
        possuidos: jogos.map((j) => j.name),
      };
    });
}

module.exports = { buscarPerfil };