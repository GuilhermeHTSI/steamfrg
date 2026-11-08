// gemini.js
// Monta o prompt, conversa com o Gemini (com rodízio de chaves) e confere a resposta.

// Se o Google aposentar este modelo, a API responde erro 404: troque pelo nome atual.
const MODELO = "gemini-3.5-flash";
const URL_DO_GEMINI = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;

// Quando o Gemini está sobrecarregado (erro 503), esperamos um pouco e tentamos de novo.
const MAXIMO_DE_TENTATIVAS_POR_CHAVE = 3;
const ESPERA_ENTRE_TENTATIVAS_EM_MS = 3000;

// Limites das preferências que vêm do navegador.
const QUANTIDADE_PADRAO_DE_RECOMENDACOES = 6;
const QUANTIDADE_MINIMA_DE_RECOMENDACOES = 1;
const QUANTIDADE_MAXIMA_DE_RECOMENDACOES = 10;
const TAMANHO_MAXIMO_DO_GENERO = 40;
const FOCOS_EM_PROMOCAO_VALIDOS = ["misturar", "so_promocoes", "ignorar_promocoes"];
const FOCO_PADRAO = "misturar";

// ---------------------------------------------------------------------------
// Formato da resposta: obriga o Gemini a devolver um JSON com esta estrutura.
// ---------------------------------------------------------------------------
const TIPO_TEXTO = { type: "STRING" };
const TIPO_NUMERO_INTEIRO = { type: "INTEGER" };
const TIPO_VERDADEIRO_OU_FALSO = { type: "BOOLEAN" };

const ESQUEMA_DA_RESPOSTA = {
  type: "OBJECT",
  properties: {
    resumoPerfil: TIPO_TEXTO,
    generos: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { nome: TIPO_TEXTO, percentual: TIPO_NUMERO_INTEIRO },
        required: ["nome", "percentual"],
      },
    },
    recomendacoes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          nome: TIPO_TEXTO,
          motivo: TIPO_TEXTO,
          compatibilidade: TIPO_NUMERO_INTEIRO,
          tags: { type: "ARRAY", items: TIPO_TEXTO },
          emPromocao: TIPO_VERDADEIRO_OU_FALSO,
          preco: TIPO_TEXTO,
        },
        required: ["nome", "motivo", "compatibilidade", "tags", "emPromocao", "preco"],
      },
    },
  },
  required: ["resumoPerfil", "generos", "recomendacoes"],
};

// ---------------------------------------------------------------------------
// Preferências e prompt
// ---------------------------------------------------------------------------

// Como as opções vêm do navegador, limitamos cada valor antes de usar no prompt.
function lerPreferencias(opcoesDoUsuario) {
  const opcoes = opcoesDoUsuario || {};

  const quantidadePedida = Number(opcoes.quantidade) || QUANTIDADE_PADRAO_DE_RECOMENDACOES;
  const quantidade = Math.min(
    Math.max(quantidadePedida, QUANTIDADE_MINIMA_DE_RECOMENDACOES),
    QUANTIDADE_MAXIMA_DE_RECOMENDACOES
  );

  const genero = String(opcoes.genero || "qualquer").slice(0, TAMANHO_MAXIMO_DO_GENERO);

  const focoEmPromocao = FOCOS_EM_PROMOCAO_VALIDOS.includes(opcoes.foco) ? opcoes.foco : FOCO_PADRAO;

  return { quantidade, genero, focoEmPromocao };
}

// Para o prompt, basta o nome e as horas de cada jogo.
function resumirJogosParaOPrompt(jogos) {
  return jogos.map((jogo) => ({ nome: jogo.nome, horas: jogo.horas }));
}

function montarPrompt(perfil, promocoes, preferencias) {
  const { quantidade, genero, focoEmPromocao } = preferencias;

  const jogosMaisJogados = JSON.stringify(resumirJogosParaOPrompt(perfil.maisJogados));
  const jogosRecentes = JSON.stringify(resumirJogosParaOPrompt(perfil.maisRecentes));
  const nomesDosJogosPossuidos = perfil.possuidos.join("; ");
  const promocoesEmTexto = JSON.stringify(promocoes);

  return `Você é um especialista em jogos de PC e vai recomendar jogos para um usuário da Steam.

DADOS DA STEAM DO USUÁRIO
- Mais jogados (horas): ${jogosMaisJogados}
- Jogados nas últimas 2 semanas: ${jogosRecentes}
- Jogos que ele JÁ POSSUI (nunca recomende nenhum destes): ${nomesDosJogosPossuidos}

PROMOÇÕES ATUAIS (raspadas do IsThereAnyDeal): ${promocoesEmTexto}

OPÇÕES ESCOLHIDAS PELO USUÁRIO NA INTERFACE
- Quantidade de recomendações: ${quantidade}
- Gênero preferido: ${genero}
- Foco em promoções: ${focoEmPromocao}
  (so_promocoes = recomende apenas jogos da lista de promoções; misturar = inclua alguns da lista de promoções e outros fora dela; ignorar_promocoes = ignore a lista)

TAREFA
1. resumoPerfil: 2 frases sobre o gosto do usuário.
2. generos: até 5 gêneros mais presentes na biblioteca dele, com percentuais que somam 100.
3. recomendacoes: exatamente ${quantidade} jogos, sem repetir nenhum jogo que ele já possui.
   - compatibilidade: de 0 a 100.
   - emPromocao: true somente se o jogo estiver na lista de promoções acima; nesse caso copie o preço exatamente como está na lista em "preco". Caso contrário, false e preco "".
Responda em português do Brasil.`;
}

// ---------------------------------------------------------------------------
// Conversa com o Gemini + rodízio de chaves
// ---------------------------------------------------------------------------

function esperar(milissegundos) {
  return new Promise((resolver) => setTimeout(resolver, milissegundos));
}

// Envia o prompt ao Gemini usando UMA chave e devolve a resposta HTTP (boa ou ruim).
function enviarPromptAoGemini(chaveDoGemini, prompt) {
  return fetch(URL_DO_GEMINI, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": chaveDoGemini },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: ESQUEMA_DA_RESPOSTA },
    }),
  });
}

// Mostra no terminal por que uma chave falhou (nunca imprime a chave em si).
async function registrarFalhaNoTerminal(resposta, numeroDaChave, numeroDaTentativa) {
  const detalhesDoErro = await resposta.text();
  console.log(
    `Chave ${numeroDaChave} falhou (erro ${resposta.status}, tentativa ${numeroDaTentativa}):`,
    detalhesDoErro.slice(0, 300)
  );
}

// Tenta UMA chave. Se o Gemini estiver sobrecarregado (503), espera e tenta de novo com a mesma chave.
// Qualquer outro erro (chave inválida, cota esgotada...) devolve a resposta ruim para o rodízio seguir adiante.
async function enviarComRepeticaoNaMesmaChave(chaveDoGemini, numeroDaChave, prompt) {
  let numeroDaTentativa = 1;

  while (true) {
    const resposta = await enviarPromptAoGemini(chaveDoGemini, prompt);

    if (resposta.ok) {
      return resposta;
    }

    await registrarFalhaNoTerminal(resposta, numeroDaChave, numeroDaTentativa);

    const geminiEstaSobrecarregado = resposta.status === 503;
    const aindaTemTentativas = numeroDaTentativa < MAXIMO_DE_TENTATIVAS_POR_CHAVE;

    if (!geminiEstaSobrecarregado || !aindaTemTentativas) {
      return resposta;
    }

    await esperar(ESPERA_ENTRE_TENTATIVAS_EM_MS);
    numeroDaTentativa++;
  }
}

// RODÍZIO DE CHAVES: testa as chaves na ordem até uma funcionar.
// Devolve o JSON do Gemini e um relato de qual chave respondeu e quais falharam antes.
async function pedirRespostaAoGemini(chavesDoGemini, prompt) {
  const falhas = [];

  for (let posicao = 0; posicao < chavesDoGemini.length; posicao++) {
    const numeroDaChave = posicao + 1; // para o usuário, a primeira chave é a "chave 1"
    const resposta = await enviarComRepeticaoNaMesmaChave(chavesDoGemini[posicao], numeroDaChave, prompt);

    if (resposta.ok) {
      const dadosDoGemini = await resposta.json();
      const textoJson = dadosDoGemini.candidates[0].content.parts[0].text;

      return {
        resultado: JSON.parse(textoJson),
        rodizio: { chaveUsada: numeroDaChave, totalChaves: chavesDoGemini.length, falhas },
      };
    }

    falhas.push({ chave: numeroDaChave, status: resposta.status });
  }

  throw new Error("CHAVES_ESGOTADAS");
}

// ---------------------------------------------------------------------------
// Validação: o Gemini sugere, o servidor confere
// ---------------------------------------------------------------------------

// Deixa só letras e números, sem acento e em minúsculas,
// para comparar "Diablo® IV" com "Diablo IV" sem erro.
function normalizarNome(nome) {
  return String(nome)
    .toLowerCase()
    .normalize("NFD") // separa as letras dos acentos ("é" vira "e" + acento)
    .replace(/[\u0300-\u036f]/g, "") // remove os acentos
    .replace(/[^a-z0-9]/g, ""); // remove tudo que não é letra ou número
}

// Substitui o que o Gemini disse sobre promoção pelos dados reais da lista raspada.
function completarComDadosDaPromocao(recomendacao, promocaoPorNome) {
  const promocao = promocaoPorNome.get(normalizarNome(recomendacao.nome));
  const estaEmPromocao = promocao !== undefined;

  if (recomendacao.emPromocao !== estaEmPromocao) {
    console.log(
      `Promoção corrigida para "${recomendacao.nome}": Gemini disse ${recomendacao.emPromocao}, o scraper diz ${estaEmPromocao}`
    );
  }

  return {
    ...recomendacao,
    emPromocao: estaEmPromocao,
    preco: estaEmPromocao ? promocao.preco : "",
    desconto: estaEmPromocao ? promocao.desconto : "",
    loja: estaEmPromocao ? promocao.loja : "",
  };
}

function validarRecomendacoes(recomendacoesDoGemini, perfil, promocoes) {
  const nomesDosJogosPossuidos = new Set(perfil.possuidos.map(normalizarNome).filter(Boolean));
  const promocaoPorNome = new Map(promocoes.map((promocao) => [normalizarNome(promocao.nome), promocao]));

  return recomendacoesDoGemini
    .filter((recomendacao) => !nomesDosJogosPossuidos.has(normalizarNome(recomendacao.nome))) // tira jogos que o usuário já tem
    .map((recomendacao) => completarComDadosDaPromocao(recomendacao, promocaoPorNome));
}

// ---------------------------------------------------------------------------
// Função usada pelo servidor
// ---------------------------------------------------------------------------
async function recomendar(chavesDoGemini, perfil, promocoes, opcoesDoUsuario) {
  const preferencias = lerPreferencias(opcoesDoUsuario);
  const prompt = montarPrompt(perfil, promocoes, preferencias);

  const { resultado, rodizio } = await pedirRespostaAoGemini(chavesDoGemini, prompt);
  const recomendacoes = validarRecomendacoes(resultado.recomendacoes, perfil, promocoes);

  return { ...resultado, recomendacoes, rodizio };
}

module.exports = { recomendar };