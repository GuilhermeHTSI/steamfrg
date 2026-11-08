// server.js
// Servidor do SteamFRG: entrega o site (pasta public) e expõe a API REST em /api/...

const path = require("path");

const PASTA_RAIZ_DO_PROJETO = path.join(__dirname, "..");

// Lê o arquivo .env (onde fica a chave da Steam) a partir da raiz do projeto.
require("dotenv").config({ path: path.join(PASTA_RAIZ_DO_PROJETO, ".env") });

const express = require("express");
const { buscarPerfil } = require("./steam");
const { buscarPromocoes } = require("./isThereAnyDeal");
const { recomendar } = require("./gemini");

const PORTA = 3000;

const servidor = express();

servidor.use(express.json()); // faz o servidor entender o JSON enviado pelo navegador
servidor.use(express.static(path.join(PASTA_RAIZ_DO_PROJETO, "public"))); // entrega o site

// ---------------------------------------------------------------------------
// Erros: cada erro conhecido vira um status HTTP e uma mensagem para o usuário.
// ---------------------------------------------------------------------------
const ERROS_CONHECIDOS = {
  NAO_ENCONTRADO: { status: 404, mensagem: "Jogador não encontrado." },
  SEM_JOGOS: { status: 400, mensagem: "Nenhum jogo encontrado. A lista de jogos do perfil precisa estar pública." },
  CHAVES_ESGOTADAS: { status: 502, mensagem: "Nenhuma chave Gemini funcionou (inválidas ou sem cota)." },
  ITAD_SEM_RESULTADOS: { status: 502, mensagem: "Não foi possível ler as promoções do ITAD." },
};

function responderComErro(resposta, erro) {
  const erroConhecido = ERROS_CONHECIDOS[erro.message];

  if (!erroConhecido) {
    // Erro inesperado: o detalhe fica no terminal e o usuário vê uma mensagem simples.
    console.error(erro);
    return resposta.status(500).json({ erro: "Erro ao consultar os serviços externos." });
  }

  resposta.status(erroConhecido.status).json({ erro: erroConhecido.mensagem });
}

// ---------------------------------------------------------------------------
// Funções auxiliares
// ---------------------------------------------------------------------------

// O navegador não precisa da lista com o nome de todos os jogos da conta
// (só o servidor usa, para montar o prompt), então ela fica de fora da resposta.
function removerListaDeJogosPossuidos(perfil) {
  const { possuidos, ...perfilSemALista } = perfil;
  return perfilSemALista;
}

// Aceita só uma lista de textos e descarta as chaves vazias.
function limparListaDeChaves(chaves) {
  return Array.isArray(chaves) ? chaves.filter(Boolean) : [];
}

// ---------------------------------------------------------------------------
// Rotas da API
// ---------------------------------------------------------------------------

// Perfil e resumo da biblioteca de um jogador.
servidor.get("/api/perfil/:steamId", async (requisicao, resposta) => {
  try {
    const steamId = requisicao.params.steamId;
    const perfil = await buscarPerfil(steamId, process.env.STEAM_API_KEY);

    resposta.json(removerListaDeJogosPossuidos(perfil));
  } catch (erro) {
    responderComErro(resposta, erro);
  }
});

// Promoções raspadas do IsThereAnyDeal (a API própria do projeto).
servidor.get("/api/promocoes", async (requisicao, resposta) => {
  try {
    const promocoes = await buscarPromocoes();

    resposta.json({ promocoes });
  } catch (erro) {
    responderComErro(resposta, erro);
  }
});

// Rota principal: junta Steam + promoções + Gemini.
servidor.post("/api/recomendar", async (requisicao, resposta) => {
  const { steamId, chaveSteam, chavesGemini, opcoes } = requisicao.body || {};
  const chavesDoGemini = limparListaDeChaves(chavesGemini);

  if (!steamId || chavesDoGemini.length === 0) {
    return resposta.status(400).json({ erro: "Informe o ID Steam e ao menos uma chave Gemini." });
  }

  try {
    // Usa a chave digitada na tela; se estiver vazia, usa a do arquivo .env.
    const chaveDaSteam = chaveSteam || process.env.STEAM_API_KEY;

    const perfil = await buscarPerfil(steamId, chaveDaSteam);
    if (perfil.totalJogos === 0) {
      throw new Error("SEM_JOGOS");
    }

    const promocoes = await buscarPromocoes();
    const resultado = await recomendar(chavesDoGemini, perfil, promocoes, opcoes);

    resposta.json({ perfil: removerListaDeJogosPossuidos(perfil), ...resultado });
  } catch (erro) {
    responderComErro(resposta, erro);
  }
});

servidor.listen(PORTA, () => {
  console.log(`Servidor rodando em http://localhost:${PORTA}`);
});