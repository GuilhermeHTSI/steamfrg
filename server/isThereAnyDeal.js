// isThereAnyDeal.js
// Web scraping: lê a página inicial do IsThereAnyDeal e devolve as promoções em destaque.

const cheerio = require("cheerio");

const URL_DO_SITE = "https://isthereanydeal.com/";

// Seletores CSS que apontam para cada parte do HTML do site.
// Se o site mudar o HTML, normalmente basta ajustar esta lista.
const SELETOR_CARTAO_DE_JOGO = ".hot .game";
const SELETOR_TITULO = "a.title";
const SELETOR_IMAGEM_DO_BANNER = "a.banner img";
const SELETOR_PRECO = ".price";
const SELETOR_DESCONTO = ".cut";
const SELETOR_LOJA = ".shop";

// Baixa o HTML da página inicial do site.
async function baixarHtmlDoSite() {
  const resposta = await fetch(URL_DO_SITE);

  if (!resposta.ok) {
    throw new Error(`ITAD respondeu com um erro ${resposta.status}`);
  }

  return resposta.text();
}

// Os cartões da lista têm o título como texto, mas os 5 destaques do topo não:
// neles o nome só aparece no texto alternativo (alt) da imagem, como "Cyberpunk 2077 banner".
function lerNomeDoJogo(cartaoDoJogo) {
  const titulo = cartaoDoJogo.find(SELETOR_TITULO).text().trim();
  if (titulo) {
    return titulo;
  }

  const textoAlternativo = cartaoDoJogo.find(SELETOR_IMAGEM_DO_BANNER).first().attr("alt") || "";
  return textoAlternativo.replace(/ banner$/, "").trim();
}

// Lê os dados de um cartão de jogo.
function lerPromocao(cartaoDoJogo) {
  return {
    nome: lerNomeDoJogo(cartaoDoJogo),
    // O cartão pode ter dois elementos ".price" (um dentro do outro);
    // o último é o que contém o valor em texto.
    preco: cartaoDoJogo.find(SELETOR_PRECO).last().text().trim(),
    desconto: cartaoDoJogo.find(SELETOR_DESCONTO).first().text().trim(),
    loja: cartaoDoJogo.find(SELETOR_LOJA).first().text().trim(),
  };
}

// Percorre o HTML e monta a lista [{ nome, preco, desconto, loja }, ...].
function extrairPromocoes(html) {
  const pagina = cheerio.load(html);

  return pagina(SELETOR_CARTAO_DE_JOGO)
    .toArray()
    .map((elemento) => lerPromocao(pagina(elemento)))
    .filter((promocao) => promocao.nome !== ""); // descarta cartões sem nome
}

// Função usada pelo servidor.
// Se a lista vier vazia, o site provavelmente mudou o HTML e os seletores não funcionam mais.
async function buscarPromocoes() {
  const html = await baixarHtmlDoSite();
  const promocoes = extrairPromocoes(html);

  if (promocoes.length === 0) {
    throw new Error("ITAD_SEM_RESULTADOS");
  }

  return promocoes;
}

module.exports = { buscarPromocoes };