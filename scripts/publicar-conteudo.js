import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { gerarHtmlArtigo } from "./template-artigo.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SHEETS_WEBAPP_URL = process.env.SHEETS_WEBAPP_URL;
const SHEETS_SECRET = process.env.SHEETS_SECRET;

// Facebook Graph API (Página)
const FB_PAGE_ID = process.env.FB_PAGE_ID;
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

// WhatsApp (Z-API)
const ZAPI_INSTANCE_ID = process.env.ZAPI_INSTANCE_ID;
const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;
const WHATSAPP_GRUPO_VIP_ID = process.env.WHATSAPP_GRUPO_VIP_ID; // Ex: 1203630...@g.us
const SEU_WHATSAPP = process.env.SEU_WHATSAPP; // Para você encaminhar em 1 clique no Canal
const LINK_CONVITE_GRUPO_VIP = process.env.LINK_CONVITE_GRUPO_VIP || "https://compradodia.com.br/ofertas/";

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

function garantirPastas() {
  ["artigos", "data", "ofertas"].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

function lerJsonSeguro(caminho, padrao) {
  if (!fs.existsSync(caminho)) return padrao;
  return JSON.parse(fs.readFileSync(caminho, "utf-8"));
}

async function buscarFilaAprovada() {
  const res = await fetch(`${SHEETS_WEBAPP_URL}?token=${encodeURIComponent(SHEETS_SECRET)}`);
  const rows = await res.json();
  // Filtra linhas que têm link oficial mercadolivre.com/sec/... preenchido e ainda não foram publicadas
  return rows.filter(r =>
    r.status !== "PUBLICADO" &&
    typeof r.link_afiliado_ml === "string" &&
    r.link_afiliado_ml.trim().startsWith("http")
  );
}

async function gerarConteudoComGemini(item, artigosExistentes) {
  const relacionadosSugestao = artigosExistentes
    .filter(a => a.categoria === item.categoria)
    .slice(-3)
    .map(a => ({ slug: a.slug, titulo: a.titulo }));

  const prompt = `
Você é o editor-chefe do portal "Compra do Dia" (compradodia.com.br), especializado em ajudar o público 55+ e 60+ (e filhos comprando para os pais) a fazer compras seguras e úteis no Mercado Livre.

Produto selecionado:
- Nome: ${item.produto}
- Categoria: ${item.categoria}
- Preço médio de referência: R$ ${item.preco_medio}
- Tipo de pauta: ${item.tipo_post}

Crie um guia editorial completo, respeitoso, didático e sem jargões técnicos complicados.
Deixe claro no texto que o Compra do Dia é um guia independente e que a compra final é feita com segurança dentro do Mercado Livre.

Retorne APENAS um JSON válido com esta estrutura exata:
{
  "titulo": "Título editorial atraente para Google Discover e Facebook (máx 68 caracteres)",
  "metaDescription": "Resumo claro para Google com 140 a 155 caracteres",
  "vereditoRapido": "Parágrafo curto e direto (3 linhas) resumindo para quem o produto vale a pena e seu principal benefício (otimizado para IA/GEO)",
  "introducaoHtml": "<p>2 a 3 parágrafos conectando o problema do dia a dia à solução prática.</p>",
  "produtos": [
    {
      "slugLink": "${item.slug}",
      "nome": "${item.produto}",
      "selo": "Destaque Custo-Benefício",
      "resumo": "Explicação prática de como funciona no dia a dia",
      "idealPara": "Perfil exato de quem mais aproveita",
      "pros": ["Vantagem 1", "Vantagem 2", "Vantagem 3"],
      "contras": ["Ponto de atenção honesto 1"]
    }
  ],
  "tabelaComparativaHtml": "<table><thead><tr><th>Característica</th><th>Detalhes</th><th>Benefício Prático</th></tr></thead><tbody><tr><td>Uso</td><td>Simples e intuitivo</td><td>Não exige conhecimento técnico</td></tr><tr><td>Entrega</td><td>Mercado Livre Full</td><td>Recebimento rápido e devolução grátis</td></tr></tbody></table>",
  "guiaCompraHtml": "<h2>O que observar antes de escolher</h2><p>Dicas práticas de segurança, voltagem, garantia e uso.</p>",
  "faqs": [
    { "pergunta": "Pergunta comum de quem tem 55+ sobre esse produto?", "resposta": "Resposta clara e tranquilizadora." },
    { "pergunta": "A compra é feita com segurança no Mercado Livre?", "resposta": "Sim. Ao clicar nos botões desta página, você é levado diretamente ao anúncio oficial no Mercado Livre, com Compra Garantida e devolução grátis." },
    { "pergunta": "É difícil de instalar ou usar no dia a dia?", "resposta": "Explicação simples sobre a facilidade de uso." }
  ],
  "postFacebook": "Texto envolvente de 3 a 4 linhas para postar na Página do Facebook despertando curiosidade e utilidade (sem parecer propaganda agressiva).",
  "cardWhatsApp": "Mensagem curta com emojis moderados, destacando o problema resolvido, preço aproximado (R$ ${item.preco_medio}) e chamada para ler/ver no Mercado Livre."
}
`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { responseMimeType: "application/json" }
  });

  const gerado = JSON.parse(response.text);
  gerado.artigosRelacionados = relacionadosSugestao;
  return gerado;
}

function atualizarIndexESitemap(publicados, linksMap) {
  // 1. Atualiza index.html (Capa do Portal)
  const cardsHome = publicados
    .slice()
    .reverse()
    .map(art => `
      <article class="product-card" style="margin: 20px 0;">
        <span class="category-badge">${art.categoria}</span>
        <h2 style="margin-top: 6px; font-size: 23px;">
          <a href="/artigos/${art.slug}.html" style="color: #0f172a; text-decoration: none;">${art.titulo}</a>
        </h2>
        <p style="color: #475569; font-size: 17px;">${art.metaDescription}</p>
        <a href="/artigos/${art.slug}.html" class="btn-ml" style="font-size: 17px; padding: 12px 20px; max-width: 280px;">Ler Análise Completa ➔</a>
      </article>
    `).join("\n");

  const homeHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Compra do Dia | Guias Práticos e Achados Seguros no Mercado Livre</title>
  <meta name="description" content="Análises independentes, comparativos e dicas práticas de casa, bem-estar e utilidades para comprar com segurança no Mercado Livre.">
  <link rel="canonical" href="https://compradodia.com.br/">
  <link rel="stylesheet" href="/assets/style.css">
</head>
<body>
  <div class="disclosure-bar">
    <strong>Guia Independente:</strong> Pesquisamos os produtos mais bem avaliados. As compras são concluídas diretamente no site oficial do <strong>Mercado Livre</strong>.
  </div>
  <header class="site-header">
    <div class="container">
      <a href="/" class="logo">Compra<span>doDia</span></a>
      <nav class="nav-links">
        <a href="/">Início</a>
        <a href="/ofertas/">Destaques da Semana</a>
      </nav>
    </div>
  </header>
  <main class="container">
    <section style="margin: 28px 0 10px;">
      <h1 style="font-size: 28px;">Guias Práticos e Escolhas Seguras</h1>
      <p style="color: #475569;">Selecionamos soluções úteis para facilitar o dia a dia em casa, com envio rápido e garantia oficial do Mercado Livre.</p>
    </section>
    ${cardsHome}
  </main>
  <footer class="site-footer">
    <div class="container">
      <p><strong>Compra do Dia</strong> (compradodia.com.br) — Curadoria independente de compras.</p>
      <p>Participamos do Programa de Afiliados do Mercado Livre. Todas as compras e entregas são realizadas dentro da plataforma oficial do Mercado Livre.</p>
    </div>
  </footer>
</body>
</html>`;
  fs.writeFileSync("index.html", homeHtml, "utf-8");

  // 2. Atualiza ofertas/index.html (Vitrine rápida estilo Linktree para Bio das Redes Sociais)
  const itensVitrine = Object.entries(linksMap)
    .reverse()
    .slice(0, 20)
    .map(([slug, info]) => `
      <div class="product-card" style="padding: 18px; margin: 14px 0;">
        <span class="category-badge">${info.categoria}</span>
        <h3 style="margin: 6px 0 12px; font-size: 19px;">${info.titulo}</h3>
        <a href="/ir/?p=${slug}" class="btn-ml" target="_blank" rel="nofollow sponsored noopener" style="font-size: 17px; padding: 14px;">
          Ver no Mercado Livre ➔
        </a>
      </div>
    `).join("\n");

  const vitrineHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Destaques da Semana | Compra do Dia</title>
  <meta name="robots" content="noindex, follow">
  <link rel="stylesheet" href="/assets/style.css">
</head>
<body>
  <header class="site-header">
    <div class="container">
      <a href="/" class="logo">Compra<span>doDia</span></a>
      <nav class="nav-links"><a href="/">Ver Artigos</a></nav>
    </div>
  </header>
  <main class="container">
    <h1 style="font-size: 26px; margin-top: 24px;">🔥 Destaques Selecionados</h1>
    <p style="color: #475569;">Toque no item desejado para abrir o anúncio oficial direto no Mercado Livre:</p>
    ${itensVitrine}
  </main>
</body>
</html>`;
  fs.writeFileSync("ofertas/index.html", vitrineHtml, "utf-8");

  // 3. Atualiza sitemap.xml
  const urlsXml = [
    `  <url><loc>https://compradodia.com.br/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ...publicados.map(a => `  <url><loc>https://compradodia.com.br/artigos/${a.slug}.html</loc><lastmod>${a.dataIso}</lastmod><priority>0.8</priority></url>`)
  ].join("\n");

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlsXml}\n</urlset>`;
  fs.writeFileSync("sitemap.xml", sitemap, "utf-8");
}

async function postarNoFacebook(mensagem, urlArtigo) {
  if (!FB_PAGE_ID || !FB_PAGE_ACCESS_TOKEN) return;
  const endpoint = `https://graph.facebook.com/v21.0/${FB_PAGE_ID}/feed`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: mensagem,
      link: urlArtigo,
      access_token: FB_PAGE_ACCESS_TOKEN
    })
  });
  const data = await res.json();
  console.log("📘 Resposta Facebook Graph API:", data);
}

async function enviarWhatsAppZApi(destino, texto) {
  if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN || !destino) return;
  await fetch(`https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Token": ZAPI_CLIENT_TOKEN
    },
    body: JSON.stringify({ phone: destino, message: texto })
  });
}

async function executarPublicacao() {
  garantirPastas();
  const fila = await buscarFilaAprovada();

  if (fila.length === 0) {
    console.log("⏸️ Nenhum produto com status PRONTO e link preenchido na planilha.");
    return;
  }

  // Processa 1 artigo por execução do cron (evita rajada e espaça os posts ao longo do dia)
  const item = fila[0];
  console.log(`✍️ Gerando artigo para: ${item.produto}...`);

  const linksMap = lerJsonSeguro("data/links.json", {});
  const publicados = lerJsonSeguro("data/publicados.json", []);

  const conteudo = await gerarConteudoComGemini(item, publicados);
  const agora = new Date();
  const dataIso = agora.toISOString().split("T")[0];
  const dataFormatada = agora.toLocaleDateString("pt-BR");

  // Salva o link oficial no mapa centralizado (/ir/?p=slug)
  linksMap[item.slug] = {
    titulo: item.produto,
    url: item.link_afiliado_ml.trim(),
    categoria: item.categoria,
    atualizado_em: dataIso
  };
  fs.writeFileSync("data/links.json", JSON.stringify(linksMap, null, 2), "utf-8");

  // Gera o HTML da página estática
  const htmlFinal = gerarHtmlArtigo(
    {
      slug: item.slug,
      titulo: conteudo.titulo,
      metaDescription: conteudo.metaDescription,
      categoria: item.categoria,
      dataIso,
      dataFormatada,
      vereditoRapido: conteudo.vereditoRapido,
      introducaoHtml: conteudo.introducaoHtml,
      produtos: conteudo.produtos,
      tabelaComparativaHtml: conteudo.tabelaComparativaHtml,
      guiaCompraHtml: conteudo.guiaCompraHtml,
      faqs: conteudo.faqs,
      artigosRelacionados: conteudo.artigosRelacionados
    },
    LINK_CONVITE_GRUPO_VIP
  );

  fs.writeFileSync(`artigos/${item.slug}.html`, htmlFinal, "utf-8");

  publicados.push({
    slug: item.slug,
    titulo: conteudo.titulo,
    metaDescription: conteudo.metaDescription,
    categoria: item.categoria,
    dataIso
  });
  fs.writeFileSync("data/publicados.json", JSON.stringify(publicados, null, 2), "utf-8");

  // Atualiza Home, Vitrine /ofertas/ e Sitemap
  atualizarIndexESitemap(publicados, linksMap);

  const urlArtigo = `https://compradodia.com.br/artigos/${item.slug}.html`;
  const urlDiretaMl = `https://compradodia.com.br/ir/?p=${item.slug}`;

  // 1. Publica na Página do Facebook
  await postarNoFacebook(`${conteudo.postFacebook}\n\n👇 Leia a análise completa e veja no Mercado Livre:`, urlArtigo);

  // 2. Dispara no Grupo VIP do WhatsApp (100% automático)
  const msgGrupo = `${conteudo.cardWhatsApp}\n\n📖 *Leia a análise:* ${urlArtigo}\n🛒 *Ir direto ao Mercado Livre:* ${urlDiretaMl}`;
  await enviarWhatsAppZApi(WHATSAPP_GRUPO_VIP_ID, msgGrupo);

  // 3. Manda no seu WhatsApp pessoal para você encaminhar em 1 clique no Canal do WhatsApp
  await enviarWhatsAppZApi(
    SEU_WHATSAPP,
    `✅ *Artigo Publicado no Compra do Dia!*\nEncaminhe a mensagem abaixo para o seu Canal do WhatsApp:\n\n---\n${msgGrupo}`
  );

  // 4. Marca linha como PUBLICADO no Google Sheets
  await fetch(SHEETS_WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: SHEETS_SECRET,
      action: "mark_published",
      rowIndex: item._rowIndex
    })
  });

  console.log(`🎉 Publicação concluída com sucesso: ${urlArtigo}`);
}

executarPublicacao().catch(err => {
  console.error("Erro na publicação:", err);
  process.exit(1);
});
