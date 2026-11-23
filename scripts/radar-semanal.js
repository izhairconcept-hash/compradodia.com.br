import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SHEETS_WEBAPP_URL = process.env.SHEETS_WEBAPP_URL;
const SHEETS_SECRET = process.env.SHEETS_SECRET;
const ZAPI_INSTANCE_ID = process.env.ZAPI_INSTANCE_ID;
const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;
const SEU_WHATSAPP = process.env.SEU_WHATSAPP; // Ex: 5531999999999

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Configuração das 5 categorias-alvo com taxas reais de comissão ML e termos de alta conversão 55+
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

      // Filtros de qualidade e lucratividade mínima (R$ 8,50 de comissão por venda)
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
      // Score equilibra chance de venda (volume) com ganho financeiro em R$
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

Para cada item escolhido, defina também se o melhor formato de artigo é "REVIEW_INDIVIDUAL" (produto muito desejado sozinho) ou "LISTA_COMPARATIVA" (bom para agrupar em rankings).

Retorne APENAS um JSON válido no formato:
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
    model: "gemini-2.5-flash",
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
    // Remove duplicados e ordena pelo maior Score de Lucratividade
    const unicos = Array.from(new Map(achados.map(i => [i.idMl, i])).values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    candidatosPorCategoria[nicho.categoria] = unicos;
  }

  console.log("🧠 Curadoria final com Gemini API...");
  const selecionados = await filtrarComGemini(candidatosPorCategoria);
  const hoje = new Date().toISOString().split("T")[0];

  const itensFormatados = selecionados.map(item => ({
    ...item,
    slug: slugify(item.slug || item.produto),
    data_radar: hoje
  }));

  // Envia para o Google Sheets
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
  console.log("📊 Resultado Google Sheets:", sheetsJson);

  // Envia alerta no seu WhatsApp via Z-API
  if (ZAPI_INSTANCE_ID && ZAPI_TOKEN && SEU_WHATSAPP) {
    const top3Texto = itensFormatados
      .slice(0, 3)
      .map((p, i) => `${i + 1}. ${p.produto} (~R$ ${p.comissao_estimada_rs} comiss.)`)
      .join("\n");

    const mensagem = `🚀 *Radar Semanal Compra do Dia Pronto!*\n\nForam adicionados *${sheetsJson.adicionados || itensFormatados.length} novos produtos* de alta conversão na planilha.\n\n*Destaques de lucro:*\n${top3Texto}\n\n👉 Abra a planilha *CompraDoDia - Controle*, gere seus links no Mercado Livre e cole na coluna G para o robô começar a publicar!`;

    await fetch(`https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": ZAPI_CLIENT_TOKEN
      },
      body: JSON.stringify({
        phone: SEU_WHATSAPP,
        message: mensagem
      })
    });
    console.log("📲 Alerta enviado no WhatsApp!");
  }
}

executarRadar().catch(err => {
  console.error("Erro no Radar Semanal:", err);
  process.exit(1);
});
