const MODELO = "gemini-3.1-flash-lite";
const URL_GEMINI = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;

// Formato que o Gemini é obrigado a devolver
const TEXTO = { type: "STRING" };
const NUMERO = { type: "INTEGER" };
const ESQUEMA = {
  type: "OBJECT",
  properties: {
    resumoPerfil: TEXTO,
    generos: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { nome: TEXTO, percentual: NUMERO },
        required: ["nome", "percentual"],
      },
    },
    recomendacoes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          nome: TEXTO,
          motivo: TEXTO,
          compatibilidade: NUMERO,
          tags: { type: "ARRAY", items: TEXTO },
          emPromocao: { type: "BOOLEAN" },
          preco: TEXTO,
        },
        required: ["nome", "motivo", "compatibilidade", "tags", "emPromocao", "preco"],
      },
    },
  },
  required: ["resumoPerfil", "generos", "recomendacoes"],
};

function montarPrompt(perfil, promocoes, opcoes) {
  // As opções vêm do navegador, então limitamos os valores
  const quantidade = Math.min(Math.max(Number(opcoes.quantidade) || 6, 1), 10);
  const genero = String(opcoes.genero || "qualquer").slice(0, 40);
  const foco = opcoes.foco || "misturar"; // "so_promocoes" | "misturar" | "ignorar_promocoes"

  return `Você é um especialista em jogos de PC e vai recomendar jogos para um usuário da Steam.

DADOS DA STEAM DO USUÁRIO
- Mais jogados (horas): ${JSON.stringify(perfil.maisJogados.map((j) => ({ nome: j.nome, horas: j.horas })))}
- Jogados nas últimas 2 semanas: ${JSON.stringify(perfil.maisRecentes.map((j) => ({ nome: j.nome, horas: j.horas })))}
- Jogos que ele JÁ POSSUI (nunca recomende nenhum destes): ${perfil.possuidos.join("; ")}

PROMOÇÕES ATUAIS (raspadas do IsThereAnyDeal): ${JSON.stringify(promocoes)}

OPÇÕES ESCOLHIDAS PELO USUÁRIO NA INTERFACE
- Quantidade de recomendações: ${quantidade}
- Gênero preferido: ${genero}
- Foco em promoções: ${foco}
  (so_promocoes = recomende apenas jogos da lista de promoções; misturar = inclua alguns da lista de promoções e outros fora dela; ignorar_promocoes = ignore a lista)

TAREFA
1. resumoPerfil: 2 frases sobre o gosto do usuário.
2. generos: até 5 gêneros mais presentes na biblioteca dele, com percentuais que somam 100.
3. recomendacoes: exatamente ${quantidade} jogos, sem repetir nenhum jogo que ele já possui.
   - compatibilidade: de 0 a 100.
   - emPromocao: true somente se o jogo estiver na lista de promoções acima; nesse caso copie o preço exatamente como está na lista em "preco". Caso contrário, false e preco "".
Responda em português do Brasil.`;
}

// Tenta uma chave; se falhar (cota, chave inválida...), tenta a próxima.
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function chamarGemini(chaves, prompt, indice = 0, tentativa = 1, falhas = []) {
  if (indice >= chaves.length)
    return Promise.reject(new Error("CHAVES_ESGOTADAS"));

  return fetch(URL_GEMINI, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": chaves[indice] },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: ESQUEMA },
    }),
  }).then((resposta) => {
    if (!resposta.ok) {
      return resposta.text().then((corpo) => {
        console.log(`Chave ${indice + 1} falhou (erro ${resposta.status}, tentativa ${tentativa}):`, corpo.slice(0, 300));

        // 503 = modelo sobrecarregado (temporário): espera e repete a MESMA chave
        if (resposta.status === 503 && tentativa < 3)
          return esperar(3000).then(() => chamarGemini(chaves, prompt, indice, tentativa + 1, falhas));

        // Outros erros (chave inválida, sem cota...): anota e passa para a próxima chave
        falhas.push({ chave: indice + 1, status: resposta.status });
        return chamarGemini(chaves, prompt, indice + 1, 1, falhas);
      });
    }
    return resposta.json().then((dados) => ({
      resultado: JSON.parse(dados.candidates[0].content.parts[0].text),
      rodizio: { chaveUsada: indice + 1, totalChaves: chaves.length, falhas },
    }));
  });
}

const normalizar = (nome) =>
  String(nome)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

function recomendar(chaves, perfil, promocoes, opcoes = {}) {
  return chamarGemini(chaves, montarPrompt(perfil, promocoes, opcoes)).then(({ resultado, rodizio }) => {
    const possuidos = new Set(perfil.possuidos.map(normalizar).filter(Boolean));
    const ofertas = new Map(promocoes.map((p) => [normalizar(p.nome), p]));

    resultado.recomendacoes = resultado.recomendacoes
      // Rede de segurança: tira qualquer jogo que o usuário já tem
      .filter((r) => !possuidos.has(normalizar(r.nome)))
      // Validação: promoção, preço, desconto e loja vêm da lista raspada, não do Gemini
      .map((r) => {
        const oferta = ofertas.get(normalizar(r.nome));

        if (r.emPromocao !== Boolean(oferta))
          console.log(`Promoção corrigida para "${r.nome}": Gemini disse ${r.emPromocao}, o scraper diz ${Boolean(oferta)}`);

        return {
          ...r,
          emPromocao: Boolean(oferta),
          preco: oferta ? oferta.preco : "",
          desconto: oferta ? oferta.desconto : "",
          loja: oferta ? oferta.loja : "",
        };
      });

    return { ...resultado, rodizio };
  });
}

module.exports = { recomendar };