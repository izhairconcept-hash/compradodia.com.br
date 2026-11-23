import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SHEETS_WEBAPP_URL = process.env.SHEETS_WEBAPP_URL;
const SHEETS_SECRET = process.env.SHEETS_SECRET;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const NICHOS_RADAR = [
  { categoria: "Casa e Segurança", taxaComissao: 0.12 },
  { categoria: "Ferramentas e Utilidades", taxaComissao: 0.12 },
  { categoria: "Beleza e Cuidado Pessoal", taxaComissao: 0.16 },
  { categoria: "Saúde e Bem-Estar", taxaComissao: 0.10 },
  { categoria: "Eletroportáteis", taxaComissao: 0.06 }
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

function extrairArrayJSON(texto) {
  const limpo = (texto || "").replace(/```json|```/gi, "").trim();
  const inicio = limpo.indexOf("[");
  const fim = limpo.lastIndexOf("]");
  if (inicio === -1 || fim === -1) return [];
  return JSON.parse(limpo.slice(inicio, fim + 1));
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

async function minerarTodosOsNichos() {
  console.log("🔎 Minerando 30 produtos reais em chamada única na Gemini API...");

  const prompt = `
Você é um especialista em e-commerce e comportamento de compra do público 55+ e 60+ no Brasil, atuando como curador do portal Compra do Dia (afiliado Mercado Livre).

Selecione exatamente 30 produtos REAIS, populares, de marcas confiáveis e atualmente vendidos no Mercado Livre Brasil (faixa de preço entre R$ 75 e R$ 550), distribuídos igualmente em 6 produtos por categoria:
1. "Casa e Segurança" (ex.: fechadura digital, câmera Wi-Fi, luz noturna com sensor, purificador de água, barra de apoio)
2. "Ferramentas e Utilidades" (ex.: parafusadeira sem fio 12V, lavadora de alta pressão, trena laser, maleta de ferramentas)
3. "Beleza e Cuidado Pessoal" (ex.: escova secadora, massageador cervical, aparador de pelos, balança digital)
4. "Saúde e Bem-Estar" (ex.: medidor de pressão de braço Omron, umidificador ultrassônico, travesseiro ortopédico, oxímetro)
5. "Eletroportáteis" (ex.: cafeteira elétrica, aspirador vertical sem fio, chaleira elétrica, air fryer)

Regras:
- Informe marca e modelo reais e bem avaliados no Brasil.
- Não repita produtos parecidos.
- Defina "tipo_post" como "REVIEW_INDIVIDUAL" ou "LISTA_COMPARATIVA".

Responda SOMENTE com um array JSON válido, sem markdown ou texto extra:
[
  {
    "categoria": "Casa e Segurança",
    "produto": "Marca e Modelo Real do Produto",
    "preco_medio": 189.90,
    "tipo_post": "REVIEW_INDIVIDUAL"
  }
]
`;

  const response = await ai.models.generateContent({
    model: "gemini-3.6-flash",
    contents: prompt,
    config: { responseMimeType: "application/json" }
  });

  const listaBruta = extrairArrayJSON(response.text);
  const taxasMap = new Map(NICHOS_RADAR.map(n => [n.categoria.toLowerCase(), n.taxaComissao]));

  return listaBruta.map(item => {
    const preco = Number(item.preco_medio) || 150;
    const taxa = taxasMap.get(String(item.categoria || "").toLowerCase()) || 0.10;
    const comissao = Number((preco * taxa).toFixed(2));

    return {
      slug: slugify(item.produto),
      categoria: item.categoria || "Utilidades",
      produto: item.produto,
      preco_medio: preco,
      comissao_estimada_rs: comissao,
      url_original_ml: linkBuscaGarantidaML(item.produto),
      tipo_post: item.tipo_post || "REVIEW_INDIVIDUAL"
    };
  });
}

async function executarRadar() {
  console.log("🔍 Iniciando Radar Semanal Mercado Livre...");

  const selecionados = await minerarTodosOsNichos();
  const hoje = new Date().toISOString().split("T")[0];

  const itensFormatados = selecionados.map(item => ({
    ...item,
    data_radar: hoje
  }));

  console.log(`📦 Total de itens prontos para enviar à planilha: ${itensFormatados.length}`);

  if (itensFormatados.length === 0) {
    throw new Error("Nenhum produto válido foi retornado pelo radar.");
  }

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
  console.log("📊 Resposta da planilha:", JSON.stringify(sheetsJson));

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
