const path = require("path");
const RAIZ = path.join(__dirname, "..");

require("dotenv").config({ path: path.join(RAIZ, ".env") });
const express = require("express");

const { buscarPerfil } = require("./steam");
const { buscarPromocoes } = require("./isThereAnyDeal");
const { recomendar } = require("./gemini");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(RAIZ, "public")));

// Não manda a lista completa de jogos para o navegador
function perfilPublico(perfil) {
  const { possuidos, ...resto } = perfil;
  return resto;
}

function tratarErro(res, erro) {
  const conhecidos = {
    NAO_ENCONTRADO: [404, "Jogador não encontrado."],
    SEM_JOGOS: [400, "Nenhum jogo encontrado. A lista de jogos do perfil precisa estar pública."],
    CHAVES_ESGOTADAS: [502, "Nenhuma chave Gemini funcionou (inválidas ou sem cota)."],
    ITAD_SEM_RESULTADOS: [502, "Não foi possível ler as promoções do ITAD."],
  };
  const [status, mensagem] = conhecidos[erro.message] || [500, "Erro ao consultar os serviços externos."];
  if (status === 500) console.error(erro);
  res.status(status).json({ erro: mensagem });
}

app.get("/api/perfil/:steamId", (req, res) => {
  buscarPerfil(req.params.steamId, process.env.STEAM_API_KEY)
    .then((perfil) => res.json(perfilPublico(perfil)))
    .catch((erro) => tratarErro(res, erro));
});

app.get("/api/promocoes", (req, res) => {
  buscarPromocoes()
    .then((promocoes) => res.json({ promocoes }))
    .catch((erro) => tratarErro(res, erro));
});

app.post("/api/recomendar", (req, res) => {
  const { steamId, chaveSteam, chavesGemini, opcoes } = req.body;
  const chaves = Array.isArray(chavesGemini) ? chavesGemini.filter(Boolean) : [];

  if (!steamId || chaves.length === 0)
    return res.status(400).json({ erro: "Informe o ID Steam e ao menos uma chave Gemini." });

  let perfil;

  buscarPerfil(steamId, chaveSteam || process.env.STEAM_API_KEY)
    .then((dados) => {
      perfil = dados;
      if (perfil.totalJogos === 0) throw new Error("SEM_JOGOS");
      return buscarPromocoes();
    })
    .then((promocoes) => recomendar(chaves, perfil, promocoes, opcoes))
    .then((resultado) => res.json({ perfil: perfilPublico(perfil), ...resultado }))
    .catch((erro) => tratarErro(res, erro));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});