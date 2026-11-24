import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { gerarHtmlArtigo } from "./template-artigo.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SHEETS_WEBAPP_URL = process.env.SHEETS_WEBAPP_URL;
const SHEETS_SECRET = process.env.SHEETS_SECRET;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || "@compradodiaoficial";
const LINK_CANAL_TELEGRAM = process.env.LINK_CANAL_TELEGRAM || "https://t.me/compradodiaoficial";

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const SITE_URL = "https://compradodia.com.br";
const PASTA_ARTIGOS = path.resolve("artigos");
const LIMITE_POSTS_POR_EXECUCAO = 1;

function extrairObjetoJSON(texto) {
  const limpo = (texto || "").replace(/```json|```/gi, "").trim();
  const inicio = limpo.indexOf("{");
  const fim = limpo.lastIndexOf("}");
  if (inicio === -1 || fim === -1) {
    throw new Error("Resposta do Gemini não contém um JSON válido.");
  }
  return JSON.parse(limpo.slice(inicio, fim + 1));
}

async function enviarTelegram(chatId, texto) {
  if (!TELEGRAM_BOT_TOKEN || !chatId) return;
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: texto,
      parse_mode: "HTML",
      disable_web_page_preview: false
    })
  });
  const data = await res.json();
  if (!data.ok) {
    console.warn(`⚠️ Aviso Telegram (${chatId}):`, data.description);
  }
}

async function buscarFilaAprovada() {
  const separador = SHEETS_WEBAPP_URL.includes("?") ? "&" : "?";
  const url = `${SHEETS_WEBAPP_URL}${separador}token=${encodeURIComponent(SHEETS_SECRET)}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Falha ao consultar planilha: HTTP ${res.status}`);
  }

  const dados = await res.json();
  const rows = Array.isArray(dados) ? dados : (dados.items || dados.itens || []);

  return rows.filter((item) => {
    const status = String(item.status || "").trim().toUpperCase();
    const linkAfiliado = String(item.link_afiliado_ml || "").trim();
    return status === "PENDENTE" && linkAfiliado.startsWith("http");
  });
}

async function gerarConteudoComGemini(item) {
  const prompt = `
Você é um redator especialista em análises de produtos e guias de compra claros, confiáveis e objetivos para o público 55+ e 60+ no Brasil, escrevendo para o portal Compra do Dia.

Crie um artigo completo e persuasivo sobre o produto abaixo:
- Produto: ${item.produto}
- Categoria: ${item.categoria}
- Preço médio: R$ ${item.preco_medio}
- Formato: ${item.tipo_post || "REVIEW_INDIVIDUAL"}

Diretrizes:
1. Linguagem acolhedora, direta, sem jargões técnicos complicados, destacando facilidade de uso, segurança, conforto e durabilidade.
2. Estruture "conteudoHtml" usando apenas tags HTML semânticas (<p>, <h2>, <h3>, <ul>, <li>, <strong>) com:
   - Introdução explicando para quem o produto é ideal;
   - Principais benefícios e pontos positivos no dia a dia;
   - O que observar antes de comprar;
   - Veredito final.
3. Inclua 3 perguntas frequentes práticas em "faq".
4. Crie uma chamada curta e atrativa ("chamadaTelegram") para postar no canal do Telegram (sem colocar o link, pois o script adicionará os botões/links).

Retorne APENAS um objeto JSON válido:
{
  "titulo": "Título atraente para SEO (até 65 caracteres)",
  "metaDescricao": "Resumo claro para o Google (até 155 caracteres)",
  "conteudoHtml": "<p>...</p><h2>...</h2>...",
  "faq": [
    { "pergunta": "...", "resposta": "..." }
  ],
  "chamadaTelegram": "Texto curto com 2 ou 3 tópicos destacando o benefício e o preço médio"
}
`;

  const response = await ai.models.generateContent({
    model: "gemini-3.6-flash",
    contents: prompt,
    config: { responseMimeType: "application/json" }
  });

  return extrairObjetoJSON(response.text);
}

async function marcarComoPublicado(slug) {
  const res = await fetch(SHEETS_WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: SHEETS_SECRET,
      action: "mark_published",
      slug: slug,
      status: "PUBLICADO"
    })
  });
  const json = await res.json();
  console.log(`✅ Status atualizado na planilha para "${slug}":`, JSON.stringify(json));
}

function atualizarIndexESitemap() {
  if (!fs.existsSync(PASTA_ARTIGOS)) {
    fs.mkdirSync(PASTA_ARTIGOS, { recursive: true });
  }

  const arquivos = fs
    .readdirSync(PASTA_ARTIGOS)
    .filter((f) => f.endsWith(".html"))
    .sort()
    .reverse();

  const cardsHtml = arquivos
    .map((arquivo) => {
      const slug = arquivo.replace(".html", "");
      const html = fs.readFileSync(path.join(PASTA_ARTIGOS, arquivo), "utf-8");
      const matchTitulo = html.match(/<h1>(.*?)<\/h1>/i);
      const matchDesc = html.match(/<meta name="description" content="(.*?)">/i);
      const matchCat = html.match(/<span class="badge">(.*?)<\/span>/i);

      const titulo = matchTitulo ? matchTitulo[1] : slug;
      const desc = matchDesc ? matchDesc[1] : "";
      const cat = matchCat ? matchCat[1] : "Oferta";

      return `
        <article style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:0 2px 8px rgba(15,23,42,0.04);">
          <span style="display:inline-block;background:#e0f2fe;color:#0369a1;font-size:0.8rem;font-weight:700;padding:3px 10px;border-radius:999px;margin-bottom:8px;">${cat}</span>
          <h2 style="margin:0 0 8px 0;font-size:1.3rem;"><a href="/artigos/${arquivo}" style="color:#0f172a;text-decoration:none;">${titulo}</a></h2>
          <p style="margin:0 0 12px 0;color:#475569;font-size:1rem;">${desc}</p>
          <a href="/artigos/${arquivo}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700;font-size:0.95rem;">Ler Análise Completa →</a>
        </article>`;
    })
    .join("\n");

  const indexHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Compra do Dia | Achados e Análises Verificadas do Mercado Livre</title>
  <meta name="description" content="Curadoria diária de ofertas, análises honestas e produtos úteis selecionados no Mercado Livre.">
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;color:#1e293b;margin:0;padding:0;line-height:1.6;">
  <header style="background:#0f172a;color:#fff;padding:24px 20px;text-align:center;">
    <h1 style="margin:0;font-size:1.8rem;">🛒 Compra do Dia</h1>
    <p style="margin:6px 0 0 0;color:#cbd5e1;">Achados verificados, reviews práticos e ofertas reais do Mercado Livre</p>
  </header>
  <main style="max-width:780px;margin:28px auto;padding:0 16px;">
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px;margin-bottom:24px;text-align:center;">
      <strong>🔔 Receba as ofertas primeiro no Telegram:</strong>
      <a href="${LINK_CANAL_TELEGRAM}" target="_blank" rel="noopener" style="display:inline-block;margin-left:8px;background:#0284c7;color:#fff;padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:700;">Entrar no Canal</a>
    </div>
    ${cardsHtml || "<p>Novas análises sendo publicadas em breve.</p>"}
  </main>
  <footer style="text-align:center;padding:24px;font-size:0.85rem;color:#64748b;">
    Compra do Dia • Programa de Afiliados Mercado Livre
  </footer>
</body>
</html>`;

  fs.writeFileSync(path.resolve("index.html"), indexHtml, "utf-8");

  const hoje = new Date().toISOString().split("T")[0];
  const urlsSitemap = [
    `  <url><loc>${SITE_URL}/</loc><lastmod>${hoje}</lastmod><priority>1.0</priority></url>`,
    ...arquivos.map(
      (arq) => `  <url><loc>${SITE_URL}/artigos/${arq}</loc><lastmod>${hoje}</lastmod><priority>0.8</priority></url>`
    )
  ].join("\n");

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlsSitemap}
</urlset>`;

  fs.writeFileSync(path.resolve("sitemap.xml"), sitemapXml, "utf-8");
  console.log(`🗺️ index.html e sitemap.xml atualizados (${arquivos.length} artigos).`);
}

async function executarPublicacao() {
  console.log("🚀 Iniciando publicação de conteúdo e distribuição...");

  const filaAprovada = await buscarFilaAprovada();
  console.log(`📋 Total na fila aprovada: ${filaAprovada.length} | Limite por disparo: ${LIMITE_POSTS_POR_EXECUCAO}`);

  const filaParaPublicar = filaAprovada.slice(0, LIMITE_POSTS_POR_EXECUCAO);

  if (filaParaPublicar.length === 0) {
    console.log("ℹ️ Nenhum item PENDENTE com link na coluna G encontrado. Encerrando.");
    return;
  }

  if (!fs.existsSync(PASTA_ARTIGOS)) {
    fs.mkdirSync(PASTA_ARTIGOS, { recursive: true });
  }

  const hoje = new Date().toISOString().split("T")[0];
  let publicadosNestaExecucao = 0;

  for (const item of filaParaPublicar) {
    console.log(`✍️ Gerando artigo para: ${item.produto}...`);
    const conteudo = await gerarConteudoComGemini(item);

    const htmlFinal = gerarHtmlArtigo({
      titulo: conteudo.titulo,
      metaDescricao: conteudo.metaDescricao,
      categoria: item.categoria,
      produto: item.produto,
      precoMedio: item.preco_medio,
      linkAfiliado: item.link_afiliado_ml,
      conteudoHtml: conteudo.conteudoHtml,
      faq: conteudo.faq || [],
      dataPublicacao: hoje,
      linkCanalTelegram: LINK_CANAL_TELEGRAM
    });

    const nomeArquivo = `${item.slug}.html`;
    fs.writeFileSync(path.join(PASTA_ARTIGOS, nomeArquivo), htmlFinal, "utf-8");

    const urlArtigo = `${SITE_URL}/artigos/${nomeArquivo}`;
    const precoFormatado = Number(item.preco_medio || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });

    const mensagemCanal = `🔥 <b>${item.produto}</b>\n\n${conteudo.chamadaTelegram}\n\n💰 <b>Faixa de preço:</b> ${precoFormatado}\n\n🛒 <a href="${item.link_afiliado_ml}">COMPRAR DIRETO NO MERCADO LIVRE</a>\n📖 <a href="${urlArtigo}">Ler análise completa no site</a>`;

    await enviarTelegram(TELEGRAM_CHANNEL_ID, mensagemCanal);
    await marcarComoPublicado(item.slug);
    publicadosNestaExecucao++;
  }

  atualizarIndexESitemap();

  const restantes = filaAprovada.length - publicadosNestaExecucao;
  if (publicadosNestaExecucao > 0 && TELEGRAM_CHAT_ID) {
    await enviarTelegram(
      TELEGRAM_CHAT_ID,
      `✅ <b>Publicação diária concluída!</b>\n\nPublicado: <b>${filaParaPublicar[0].produto}</b>\nRestam na fila aprovada: <b>${restantes} item(ns)</b>.`
    );
  }
}

executarPublicacao().catch((err) => {
  console.error("Erro na publicação:", err);
  process.exit(1);
});
