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
    termos: ["luz noturna sensor presenca", "fechadura digital senha", "purificador agua parede", "torneira eletrica cozinha"]
  },
  {
    categoria: "Ferramentas e Utilidades",
    taxaComissao: 0.12,
    termos: ["parafusadeira sem fio 12v", "lavadora alta pressao", "maleta ferramentas completo", "trena laser digital"]
  },
  {
    categoria: "Beleza e Cuidado Pessoal",
    taxaComissao: 0.16,
    termos: ["escova secadora modeladora", "massageador eletrico cervical", "aparador pelos nariz barba", "balanca digital bioimpedancia"]
  },
  {
    categoria: "Saúde e Bem-Estar",
    taxaComissao: 0.10,
    termos: ["medidor pressao digital braco omron", "umidificador ar ultrassonico", "travesseiro ortopedico cervical", "oximetro dedo digital"]
  },
  {
    categoria: "Eletroportáteis",
    taxaComissao: 0.06,
    termos: ["cafeteira eletrica desligamento automatico", "aspirador vertical sem fio", "chaleira eletrica controle temperatura", "air fryer painel analogico"]
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
  const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(termo)}&shipping=fulfillment&sort=sold_quantity_desc&limit=12`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json();

  return (json.results || [])
    .filter(item => {
      const preco = item.price || 0;
      const avaliacoes = item.reviews?.total || 0;
      const nota = item.reviews?.rating_average || 0;
      const comissaoReais = preco * taxaComissao;

      return (
        preco >= 65 &&
        preco <= 480 &&
        avaliacoes >= 50 &&
        nota >= 4.6 &&
        comissaoReais >= 8.5
      );
    })
    .map(item => {
      const comissaoReais = Number((item.price * taxaComissao).toFixed(2));
      const vendasScore = Math.log10((item.reviews?.total || 10) + 1);
      const scoreLucratividade = Number((comissaoReais * vendasScore).toFixed(2));

      return {
        idMl: item.id,
        produto: item.title,
        preco_medio: item.price,
        comissao_estimada_rs: comissaoReais,
        url_original_ml: item.permalink,
        avaliacoes: item.reviews?.total || 0,
        nota: item.reviews?.rating_average || 0,
        score: scoreLucratividade
      };
    });
}

async function filtrarComGemini(candidatosPorCategoria) {
  const prompt = `
Você é um especialista em e-commerce e comportamento de compra do público 55+ e 60+ no Brasil.
Abaixo está uma lista de produtos pré-filtrados do Mercado Livre por categoria.
Para cada categoria, selecione os 6 MELHORES produtos (totalizando 30 itens) que:
1. Tenham maior utilidade prática, segurança e apelo para o público 55+ (ou filhos comprando para os pais).
2. Não sejam itens repetidos ou muito parecidos entre si.
3. Evitem marcas desconhecidas com alto risco de devolução.

Defina também se o melhor formato de artigo é "REVIEW_INDIVIDUAL" ou "LISTA_COMPARATIVA".

Retorne APENAS um JSON válido:
[
  {
    "slug": "slug-limpo-do-produto",
    "categoria": "Nome da Categoria",
    "produto": "Nome limpo e comercial do produto",
    "preco_medio": 149.90,
    "comissao_estimada_rs": 17.99,
    "url_original_ml": "https://...",
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

  return JSON.parse(response.text);
}

async function executarRadar() {
  console.log("🔍 Iniciando Radar Semanal Mercado Livre...");
  const candidatosPorCategoria = {};

  for (const nicho of NICHOS_RADAR) {
    let achados = [];
    for (const termo of nicho.termos) {
      const res = await buscarProdutosML(termo, nicho.taxaComissao);
      achados.push(...res);
    }
    const unicos = Array.from(new Map(achados.map(i => [i.idMl, i])).values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    candidatosPorCategoria[nicho.categoria] = unicos;
  }

  const selecionados = await filtrarComGemini(candidatosPorCategoria);
  const hoje = new Date().toISOString().split("T")[0];

  const itensFormatados = selecionados.map(item => ({
    ...item,
    slug: slugify(item.slug || item.produto),
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

  const mensagem = `🚀 <b>Radar Semanal Compra do Dia Pronto!</b>\n\nForam adicionados <b>${sheetsJson.adicionados || itensFormatados.length} novos produtos</b> na planilha.\n\n<b>Top 5 destaques de lucro:</b>\n${top5Texto}\n\n👉 Abra a planilha <i>CompraDoDia - Controle</i>, gere seus links no Mercado Livre e cole na coluna G!`;

  await enviarTelegram(TELEGRAM_CHAT_ID, mensagem);
  console.log("📲 Alerta enviado no Telegram!");
}

executarRadar().catch(err => {
  console.error("Erro no Radar Semanal:", err);
  process.exit(1);
});
