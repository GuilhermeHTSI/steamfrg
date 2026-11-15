# SteamFRG

Recomendador de jogos para a sua conta Steam. Você informa o seu SteamID, o app lê a sua biblioteca, busca promoções do [IsThereAnyDeal](https://isthereanydeal.com/) e usa o **Gemini** para sugerir jogos que você ainda não tem, mostrando preço, desconto e loja das ofertas.

Trabalho de Web Services (IFSudeste MG, Campus Barbacena) · [Site do projeto](https://github.com/GuilhermeHTSI/steamfrg)

## O que você precisa

| Item | Detalhe |
|---|---|
| **Node.js 20.18.1 ou mais novo** | Já inclui o npm. Baixe em <https://nodejs.org/> e confira com `node -v` |
| **Git** | Só para clonar o projeto (ou baixe o ZIP no GitHub) |
| **Chave da Steam Web API** | Veja [como obter](#como-obter-as-chaves-e-o-steamid) |
| **Uma ou mais chaves do Gemini** | Veja [como obter](#como-obter-as-chaves-e-o-steamid) |
| **SteamID de 17 dígitos** | De um perfil com a lista de jogos pública |
| **Internet e porta 3000 livre** | O servidor acessa Steam, IsThereAnyDeal e Google |

Não precisa de banco de dados, Docker nem pacotes globais.

## Instalação

```bash
git clone https://github.com/GuilhermeHTSI/steamfrg.git
cd NOME-DO-REPOSITORIO
npm install
```

Crie o arquivo `.env` (guarda a chave da Steam fora do código) a partir do modelo:

```bash
cp .env.example .env              # Linux e macOS
Copy-Item .env.example .env       # Windows PowerShell
```

Abra o `.env` e preencha, sem aspas:

```
STEAM_API_KEY=cole_sua_chave_aqui
```

> O `.env` é opcional: se preferir, digite a chave da Steam direto na tela do app.

Inicie o servidor e abra <http://localhost:3000>:

```bash
npm start
```

Deve aparecer `Servidor rodando em http://localhost:3000`. Deixe o terminal aberto enquanto usa o app e acesse pelo endereço acima, não abrindo o `index.html` direto do disco.

## Como obter as chaves e o SteamID

- **Chave da Steam:** entre em <https://steamcommunity.com/dev/apikey>, digite `localhost` no campo de domínio e copie a chave. A conta não pode ser "limitada" (contas novas, sem compras, normalmente são). Trate a chave como uma senha.
- **Chave do Gemini:** crie em <https://aistudio.google.com/apikey> (há camada gratuita, com limites de uso).
- **SteamID:** é o número de 17 dígitos (começa com `7656119`) que aparece na URL `steamcommunity.com/profiles/...` do seu perfil. Se a URL for `/id/apelido`, descubra o número em <https://steamid.io/>.
- **Perfil público:** em *Steam > Perfil > Editar perfil > Privacidade*, deixe **Detalhes dos jogos** como **Público**. Sem isso o app não enxerga a sua biblioteca.

## Como usar

1. Cole a(s) chave(s) do Gemini, **uma por linha**. Com duas ou mais, o app usa o **rodízio**: se uma chave falhar (inválida ou sem cota), ele tenta a próxima. A cota do Gemini é por projeto, então chaves do mesmo projeto dividem o mesmo limite.
2. Informe o SteamID e, se não usou o `.env`, a chave da Steam.
3. Escolha a quantidade, o gênero e o foco em promoções, e clique em **Gerar recomendações**.

O app guarda os campos só no seu navegador, para você não digitar de novo.

## Como funciona

1. O navegador envia SteamID, chaves e preferências para o servidor Node.js.
2. O servidor busca o perfil e a biblioteca na **Steam Web API**.
3. O servidor **raspa as promoções** do IsThereAnyDeal (web scraping) e as oferece na sua própria API.
4. O servidor envia ao **Gemini** a biblioteca, as promoções e as preferências, pedindo a resposta em JSON, e troca de chave se uma falhar.
5. O servidor confere o resultado (remove jogos que você já tem e confirma quais estão mesmo em promoção) e o navegador desenha tudo como gráficos, medidores e etiquetas de preço.

## API do projeto

| Rota | O que faz |
|---|---|
| `GET /api/perfil/:steamId` | Perfil e resumo da biblioteca Steam |
| `GET /api/promocoes` | Promoções raspadas do IsThereAnyDeal |
| `POST /api/recomendar` | Fluxo completo: Steam + promoções + Gemini |

## Problemas comuns

| Mensagem ou sintoma | Solução |
|---|---|
| `ENOENT ... package.json` | Você está na pasta errada. Entre na pasta que contém o `package.json` |
| `Cannot find module 'express'` (ou `cheerio`, `dotenv`) | Rode `npm install` |
| `EADDRINUSE ... :3000` | A porta está ocupada: feche o outro programa ou troque `PORTA` em `server/server.js` |
| "Erro ao consultar os serviços externos" e `erro 403` no terminal | Chave da Steam ausente ou inválida. Confira o `.env` e reinicie o servidor |
| "Nenhum jogo encontrado..." | Deixe **Detalhes dos jogos** como Público no perfil Steam |
| "Nenhuma chave Gemini funcionou" | Veja no terminal `Chave N falhou (erro XXX)`: **400** chave inválida · **404** modelo aposentado (troque `MODELO` em `server/gemini.js`) · **429** cota esgotada · **503** Gemini sobrecarregado, tente de novo |
| `unable to verify the first certificate` | Rede (escola, empresa) que inspeciona HTTPS. Use `NODE_USE_SYSTEM_CA=1 npm start` (Node 22.15 ou mais novo) ou `NODE_EXTRA_CA_CERTS=/caminho/certificado.pem npm start` |

## Segurança

O `.env` está no `.gitignore` e nunca deve ir para o GitHub. As chaves digitadas na tela ficam apenas no seu navegador e passam pelo seu servidor local; o servidor não as grava. Se uma chave vazar, apague-a no painel do serviço e crie outra.

---

Guilherme Henrique · Tecnologia em Sistemas para Internet · IFSudeste MG, Campus Barbacena
