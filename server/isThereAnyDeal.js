const cheerio = require("cheerio");

const URL_ITAD = "https://isthereanydeal.com/";

// Os destaques do topo não têm o título como texto; o nome está no alt da imagem
function nomeDoJogo($jogo) {
  const titulo = $jogo.find("a.title").text().trim();
  if (titulo) return titulo;
  const alt = $jogo.find("a.banner img").first().attr("alt") || "";
  return alt.replace(/ banner$/, "").trim();
}

// Baixa a página do ITAD e devolve [{ nome, preco, desconto, loja }, ...]
function buscarPromocoes() {
  return fetch(URL_ITAD)
    .then((resposta) => {
      if (!resposta.ok)
        throw new Error(`ITAD respondeu com um erro ${resposta.status}`);
      return resposta.text();
    })
    .then((html) => {
      const $ = cheerio.load(html);
      const promocoes = [];

      $(".hot .game").each((i, elemento) => {
        const jogo = $(elemento);
        const nome = nomeDoJogo(jogo);
        if (!nome) return;

        promocoes.push({
          nome,
          preco: jogo.find(".price").last().text().trim(),
          desconto: jogo.find(".cut").first().text().trim(),
          loja: jogo.find(".shop").first().text().trim(),
        });
      });

      // Lista vazia = o site mudou o HTML e os seletores não acham mais nada
      if (promocoes.length === 0) throw new Error("ITAD_SEM_RESULTADOS");

      return promocoes;
    });
}

module.exports = { buscarPromocoes };