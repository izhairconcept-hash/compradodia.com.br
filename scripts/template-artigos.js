export function gerarHtmlArtigo(dados, linksComunidade) {
  const {
    slug,
    titulo,
    metaDescription,
    categoria,
    dataIso,
    dataFormatada,
    imagemUrl,
    vereditoRapido,
    introducaoHtml,
    produtos,
    tabelaComparativaHtml,
    guiaCompraHtml,
    faqs,
    artigosRelacionados
  } = dados;

  const linkWhats = linksComunidade?.whatsapp || "https://compradodia.com.br/ofertas/";
  const linkTelegram = linksComunidade?.telegram || "https://t.me/compradodiaoficial";

  const urlCanonica = `https://compradodia.com.br/artigos/${slug}.html`;
  const imagemFinal = imagemUrl || "https://compradodia.com.br/assets/og-default.jpg";

  const schemaGraph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "headline": titulo,
        "description": metaDescription,
        "image": [imagemFinal],
        "datePublished": dataIso,
        "dateModified": dataIso,
        "author": {
          "@type": "Organization",
          "name": "Equipe Editorial Compra do Dia",
          "url": "https://compradodia.com.br"
        },
        "publisher": {
          "@type": "Organization",
          "name": "Compra do Dia",
          "url": "https://compradodia.com.br"
        },
        "mainEntityOfPage": urlCanonica
      },
      {
        "@type": "ItemList",
        "itemListElement": produtos.map((prod, idx) => ({
          "@type": "ListItem",
          "position": idx + 1,
          "name": prod.nome,
          "url": `https://compradodia.com.br/ir/?p=${prod.slugLink}`
        }))
      },
      {
        "@type": "FAQPage",
        "mainEntity": faqs.map(f => ({
          "@type": "Question",
          "name": f.pergunta,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": f.resposta
          }
        }))
      }
    ]
  };

  const cardsProdutosHtml = produtos.map((prod, idx) => `
    <section class="product-card" id="opcao-${idx + 1}">
      <div class="product-card-header">
        <h3>${idx + 1}. ${prod.nome}</h3>
        <span class="product-tag">${prod.selo}</span>
      </div>
      <p>${prod.resumo}</p>
      <p><strong>Indicado para:</strong> ${prod.idealPara}</p>
      <ul>
        ${prod.pros.map(p => `<li>✅ ${p}</li>`).join("")}
        ${prod.contras.map(c => `<li>⚠️ Atenção: ${c}</li>`).join("")}
      </ul>
      <div class="cta-box">
        <a href="/ir/?p=${prod.slugLink}" class="btn-ml" target="_blank" rel="nofollow sponsored noopener">
          Ver Preço Atualizado no Mercado Livre ➔
        </a>
        <span class="cta-security-note">
          🔒 Compra 100% segura realizada diretamente no site ou aplicativo oficial do <strong>Mercado Livre</strong> (Compra Garantida e Devolução Grátis).
        </span>
      </div>
    </section>
  `).join("\n");

  const faqsHtml = faqs.map(f => `
    <div class="faq-item">
      <div class="faq-question">${f.pergunta}</div>
      <div class="faq-answer">${f.resposta}</div>
    </div>
  `).join("\n");

  const relacionadosHtml = artigosRelacionados && artigosRelacionados.length > 0
    ? `
      <section style="margin-top: 32px; padding-top: 20px; border-top: 1px solid var(--border);">
        <h3>Leia Também no Compra do Dia</h3>
        <ul>
          ${artigosRelacionados.map(r => `<li><a href="/artigos/${r.slug}.html">${r.titulo}</a></li>`).join("")}
        </ul>
      </section>
    `
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titulo} | Compra do Dia</title>
  <meta name="description" content="${metaDescription}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${urlCanonica}">

  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Compra do Dia">
  <meta property="og:title" content="${titulo}">
  <meta property="og:description" content="${metaDescription}">
  <meta property="og:url" content="${urlCanonica}">
  <meta property="og:image" content="${imagemFinal}">

  <link rel="stylesheet" href="/assets/style.css">
  <script type="application/ld+json">${JSON.stringify(schemaGraph)}</script>
</head>
<body>
  <div class="disclosure-bar">
    <strong>Guia Independente:</strong> Analisamos produtos bem avaliados. Ao clicar nos botões, você é levado ao site oficial do <strong>Mercado Livre</strong> para concluir sua compra com segurança. Podemos receber comissão sem custo extra para você.
  </div>

  <!-- Isca 1: Barra Superior Discreta -->
  <div class="vip-top-bar">
    📲 Receba 1 achado útil por dia (sem spam):
    <a href="${linkWhats}" target="_blank" rel="noopener">Grupo WhatsApp</a> •
    <a href="${linkTelegram}" target="_blank" rel="noopener">Canal Telegram</a>
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
    <article class="article-wrapper">
      <span class="category-badge">${categoria}</span>
      <h1>${titulo}</h1>
      <div class="meta-info">
        Por <strong>Redação Compra do Dia</strong> • Atualizado em ${dataFormatada}
      </div>

      <!-- Bloco Veredito Rápido (Otimizado para GEO) -->
      <div class="tldr-box">
        <span class="tldr-title">📌 Resumo Rápido (Veredito)</span>
        <p style="margin-bottom:0;">${vereditoRapido}</p>
      </div>

      ${introducaoHtml}

      <h2>Comparativo Direto das Melhores Opções</h2>
      <div class="table-responsive">
        ${tabelaComparativaHtml}
      </div>

      <!-- Isca 2: Alerta de Queda de Preço (Meio do Artigo) -->
      <aside class="vip-capture-box mid-article">
        <h3>📉 Não quer comprar hoje ou quer esperar baixar o preço?</h3>
        <p style="margin-bottom: 8px;">Monitoramos diariamente as ofertas relâmpago do <strong>Mercado Livre Full</strong>. Entre gratuitamente e receba apenas 1 a 2 achados úteis por dia:</p>
        <div class="vip-rules">
          <span>🔇 Grupo Silencioso (Só Admins)</span>
          <span>🔒 Telefone Protegido</span>
          <span>🆓 100% Gratuito</span>
        </div>
        <div class="vip-buttons-row">
          <a href="${linkWhats}" class="btn-whats-vip" target="_blank" rel="noopener">🟢 Receber no WhatsApp</a>
          <a href="${linkTelegram}" class="btn-tele-vip" target="_blank" rel="noopener">🔵 Receber no Telegram</a>
        </div>
      </aside>

      <h2>Análise Detalhada e Onde Comprar com Segurança</h2>
      ${cardsProdutosHtml}

      ${guiaCompraHtml}

      <!-- Isca 3: Bloco Educativo de Segurança -->
      <section class="how-it-works">
        <h3 style="margin-top:0;">🛡️ Como funciona a compra pelo Compra do Dia?</h3>
        <ol style="margin-bottom:0;">
          <li><strong>Nós pesquisamos:</strong> Selecionamos apenas produtos com nota alta (acima de 4,7 estrelas) e vendedores confiáveis.</li>
          <li><strong>Você compra no Mercado Livre:</strong> Não vendemos nada diretamente neste site. Os botões levam você direto para o anúncio oficial dentro do <strong>Mercado Livre</strong>.</li>
          <li><strong>Entrega e Garantia oficiais:</strong> Você paga via Pix, boleto ou cartão direto no Mercado Livre e conta com envio rápido e devolução grátis.</li>
        </ol>
      </section>

      <h2>Perguntas Frequentes</h2>
      ${faqsHtml}

      <!-- Isca 4: Fechamento VIP Duplo (WhatsApp + Telegram) -->
      <aside class="vip-capture-box">
        <h3>🎁 Quer receber só produtos testados e com entrega rápida?</h3>
        <p style="margin-bottom: 8px;">Evite compras ruins e economize tempo. Nossa curadoria envia diariamente as melhores oportunidades verificadas do Mercado Livre:</p>
        <div class="vip-rules">
          <span>🔇 Sem bate-papo nem correntes</span>
          <span>⭐ Apenas produtos bem avaliados</span>
          <span>🚪 Saia quando quiser</span>
        </div>
        <div class="vip-buttons-row">
          <a href="${linkWhats}" class="btn-whats-vip" target="_blank" rel="noopener">🟢 Entrar no Grupo WhatsApp</a>
          <a href="${linkTelegram}" class="btn-tele-vip" target="_blank" rel="noopener">🔵 Entrar no Canal Telegram</a>
        </div>
      </aside>

      ${relacionadosHtml}
    </article>
  </main>

  <footer class="site-footer">
    <div class="container">
      <p><strong>Compra do Dia</strong> (compradodia.com.br) — Curadoria independente de compras.</p>
      <p>Aviso de Afiliado: Participamos do Programa de Afiliados do Mercado Livre. Todas as transações, pagamentos, entregas e garantias são realizadas exclusivamente dentro da plataforma oficial do Mercado Livre.</p>
    </div>
  </footer>
</body>
</html>`;
}
