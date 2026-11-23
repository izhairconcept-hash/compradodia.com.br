import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SHEETS_WEBAPP_URL = process.env.SHEETS_WEBAPP_URL;
const SHEETS_SECRET = process.env.SHEETS_SECRET;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const NICHOS_RADAR = [
  {
    categoria: "Casa e Segurança",
    taxaComissao: 0.12,
    termos: [
      "luz noturna sensor presenca",
      "fechadura digital senha",
      "purificador agua parede",
      "torneira eletrica cozinha"
    ]
  },
  {
    categoria: "Ferramentas e Utilidades",
    taxaComissao: 0.12,
    termos: [
      "parafusadeira sem fio 12v",
      "lavadora alta pressao",
      "maleta ferramentas completo",
      "trena laser digital"
    ]
  },
  {
    categoria: "Beleza e Cuidado Pessoal",
    taxaComissao: 0.16,
    termos: [
      "escova secadora modeladora",
      "massageador eletrico cervical",
      "aparador pelos nariz barba",
      "balanca digital bioimpedancia"
    ]
  },
  {
    categoria: "Saúde e Bem-Estar",
    taxaComissao: 0.10,
    termos: [
      "medidor pressao digital braco omron",
      "umidificador ar ultrassonico",
      "travesseiro ortopedico cervical",
      "oximetro dedo digital"
    ]
  },
  {
    categoria: "Eletroportáteis",
    taxaComissao: 0.06,
    termos: [
      "cafeteira eletrica desligamento automatico",
      "aspirador vertical sem fio",
      "chaleira eletrica controle temperatura",
      "air fryer painel analogico"
    ]
  }
];

function slugify(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 65);
}

function linkBuscaGarantidaML(nomeProduto) {
  const slugBusca = slugify(nomeProduto);
  return `https://lista.mercadolivre.com.br/${slugBusca}`;
}

async function enviarTelegram(chatId, texto) {
  if (!TELEGRAM_BOT_TOKEN || !chatId) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: texto,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  });
}

async function buscarProdutosML(termo, taxaComissao) {
  const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(termo)}&sort=sold_quantity_desc&limit=15`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "application/json"
      }
    });

    if (!res.ok) {
      console.warn(`⚠️ API ML retornou status ${res.status} para "${termo}"`);
      return [];
    }

    const json = await res.json();

    return (json.results || [])
      .filter(item => {
        const preco = item.price || 0;
        const comissaoReais = preco * taxaComissao;
        const temLinkValido = typeof item.permalink === "string" && item.permalink.startsWith("http");

        return (
          temLinkValido &&
          preco >= 65 &&
          preco <= 550 &&
          comissaoReais >= 7.5
        );
      })
      .map(item => {
        const comissaoReais = Number((item.price * taxaComissao).toFixed(2));
        const vendasScore = Math.log10((item.sold_quantity || item.reviews?.total || 10) + 1);
        const scoreLucratividade = Number((comissaoReais * vendasScore).toFixed(2));

        return {
          idMl: item.id,
          produto: item.title,
          preco_medio: item.price,
          comissao_estimada_rs: comissaoReais,
          url_original_ml: item.permalink,
          score: scoreLucratividade
        };
      });
  } catch (err) {
    console.warn(`⚠️ Falha ao consultar ML para "${termo}":`, err.message);
    return [];
  }
}

async function buscarViaGoogleSearch(nicho) {
  console.log(`🔎 Acionando busca web para a categoria: ${nicho.categoria}...`);

  const prompt = `
Pesquise no Google produtos reais, populares e atualmente disponíveis para venda no Mercado Livre Brasil (mercadolivre.com.br) relacionados aos seguintes termos: ${nicho.termos.join(", ")}.

Selecione 8 modelos/marcas reais muito bem avaliados e buscados pelo público 55+ e 60+ (faixa de preço entre R$ 70 e R$ 500).
Para cada produto, informe o nome comercial exato (marca + modelo real) e o preço médio atual em reais.

Retorne APENAS um JSON válido neste formato:
[
  {
    "produto": "Marca e Modelo Real do Produto",
    "preco_medio": 149.90
  }
]
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json"
      }
    });

    const lista = JSON.parse(response.text || "[]");

    return lista.map((item, idx) => {
      const preco = Number(item.preco_medio) || 120;
      const comissao = Number((preco * nicho.taxaComissao).toFixed(2));
      const idVirtual = `SEARCH-${slugify(nicho.categoria)}-${idx}`;

      return {
        idMl: idVirtual,
        produto: item.produto,
        preco_medio: preco,
        comissao_estimada_rs: comissao,
        url_original_ml: linkBuscaGarantidaML(item.produto),
        score: comissao
      };
    });
  } catch (err) {
    console.error(`Erro na busca web de ${nicho.categoria}:`, err.message);
    return [];
  }
}

async function filtrarComGemini(candidatosPorCategoria, mapaProdutosReais) {
  const prompt = `
Você é um especialista em e-commerce e comportamento de compra do público 55+ e 60+ no Brasil.
Abaixo está uma lista de produtos candidatos do Mercado Livre por categoria.
Para cada categoria, selecione os 6 MELHORES produtos (totalizando 30 itens) que:
1. Tenham maior utilidade prática, segurança e apelo para o público 55+ (ou filhos comprando para os pais).
2. Não sejam itens repetidos ou muito parecidos entre si.
3. Evitem marcas desconhecidas com alto risco de devolução.

REGRAS OBRIGATÓRIAS:
- Você DEVE retornar exatamente o campo "idMl" idêntico ao fornecido no candidato escolhido. NÃO invente nem altere o "idMl".
- Defina "tipo_post" como "REVIEW_INDIVIDUAL" ou "LISTA_COMPARATIVA".

Retorne APENAS um JSON válido:
[
  {
    "idMl": "MLB123456789",
    "slug": "slug-limpo-do-produto",
    "categoria": "Nome da Categoria",
    "produto": "Nome limpo e comercial do produto",
    "tipo_post": "REVIEW_INDIVIDUAL"
  }
]

Candidatos:
${JSON.stringify(candidatosPorCategoria, null, 2)}
`;

  const response = await ai.models.generateContent({
    model: "gemini-3.6-flash",
    contents: prompt,
    config: { responseMimeType: "application/json" }
  });

  const escolhidos = JSON.parse(response.text || "[]");

  return escolhidos
    .filter(item => mapaProdutosReais.has(item.idMl))
    .map(item => {
      const original = mapaProdutosReais.get(item.idMl);
      return {
        slug: slugify(item.slug || item.produto || original.produto),
        categoria: item.categoria,
        produto: item.produto || original.produto,
        preco_medio: original.preco_medio,
        comissao_estimada_rs: original.comissao_estimada_rs,
        url_original_ml: original.url_original_ml,
        tipo_post: item.tipo_post || "REVIEW_INDIVIDUAL"
      };
    });
}

async function executarRadar() {
  console.log("🔍 Iniciando Radar Semanal Mercado Livre...");
  const candidatosPorCategoria = {};
  const mapaProdutosReais = new Map();

  for (const nicho of NICHOS_RADAR) {
    let achados = [];
    for (const termo of nicho.termos) {
      const res = await buscarProdutosML(termo, nicho.taxaComissao);
      achados.push(...res);
    }

    // Se a API pública do ML bloquear o runner do GitHub, usa Google Search Grounding + link de busca oficial ML
    if (achados.length < 6) {
      const achadosWeb = await buscarViaGoogleSearch(nicho);
      achados.push(...achadosWeb);
    }

    const unicos = Array.from(new Map(achados.map(i => [i.idMl, i])).values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    unicos.forEach(item => mapaProdutosReais.set(item.idMl, item));
    candidatosPorCategoria[nicho.categoria] = unicos.map(({ idMl, produto, preco_medio, comissao_estimada_rs }) => ({
      idMl,
      produto,
      preco_medio,
      comissao_estimada_rs
    }));
  }

  const selecionados = await filtrarComGemini(candidatosPorCategoria, mapaProdutosReais);
  const hoje = new Date().toISOString().split("T")[0];

  const itensFormatados = selecionados.map(item => ({
    ...item,
    data_radar: hoje
  }));

  const sheetsRes = await fetch(SHEETS_WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: SHEETS_SECRET,
      action: "add_radar",
      items: itensFormatados
    })
  });
  const sheetsJson = await sheetsRes.json();

  const top5Texto = itensFormatados
    .slice(0, 5)
    .map((p, i) => `${i + 1}. <b>${p.produto}</b> (~R$ ${p.comissao_estimada_rs} comiss.)`)
    .join("\n");

  const mensagem = `🚀 <b>Radar Semanal Compra do Dia Pronto!</b>\n\nForam adicionados <b>${sheetsJson.adicionados ?? itensFormatados.length} novos produtos</b> na planilha.\n\n<b>Top 5 destaques de lucro:</b>\n${top5Texto}\n\n👉 Abra a planilha <i>CompraDoDia - Controle</i>, gere seus links no Mercado Livre e cole na coluna G!`;

  await enviarTelegram(TELEGRAM_CHAT_ID, mensagem);
  console.log("📲 Alerta enviado no Telegram!");
}

executarRadar().catch(err => {
  console.error("Erro no Radar Semanal:", err);
  process.exit(1);
});
