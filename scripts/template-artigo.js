export function gerarHtmlArtigo(dados) {
  const {
    titulo,
    metaDescricao,
    categoria,
    produto,
    precoMedio,
    linkAfiliado,
    conteudoHtml,
    faq = [],
    dataPublicacao = new Date().toISOString().split("T")[0],
    linkCanalTelegram = "https://t.me/compradodiaoficial"
  } = dados;

  const precoFormatado = Number(precoMedio || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });

  const faqHtml = faq.length
    ? `
      <section class="faq-box" style="margin-top: 32px; padding: 24px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
        <h2 style="font-size: 1.4rem; margin-bottom: 16px; color: #0f172a;">Perguntas Frequentes</h2>
        ${faq
          .map(
            (item) => `
          <details style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #e2e8f0;" open>
            <summary style="font-weight: 700; font-size: 1.1rem; cursor: pointer; color: #1e293b;">${item.pergunta}</summary>
            <p style="margin-top: 8px; font-size: 1.05rem; line-height: 1.6; color: #334155;">${item.resposta}</p>
          </details>
        `
          )
          .join("")}
      </section>
    `
    : "";

  const schemaJson = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: titulo,
    description: metaDescricao,
    datePublished: dataPublicacao,
    author: {
      "@type": "Organization",
      name: "Compra do Dia"
    },
    publisher: {
      "@type": "Organization",
      name: "Compra do Dia",
      url: "https://compradodia.com.br"
    }
  });

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titulo} | Compra do Dia</title>
  <meta name="description" content="${metaDescricao}">
  <meta name="robots" content="index, follow">
  <script type="application/ld+json">${schemaJson}</script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #f1f5f9;
      color: #1e293b;
      margin: 0;
      padding: 0;
      line-height: 1.7;
      font-size: 18px;
    }
    header {
      background: #0f172a;
      color: #ffffff;
      padding: 18px 20px;
      text-align: center;
    }
    header a {
      color: #ffffff;
      text-decoration: none;
      font-size: 1.4rem;
      font-weight: 800;
    }
    .container {
      max-width: 780px;
      margin: 24px auto;
      background: #ffffff;
      padding: 28px 24px;
      border-radius: 14px;
      box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);
    }
    .badge {
      display: inline-block;
      background: #e0f2fe;
      color: #0369a1;
      font-weight: 700;
      font-size: 0.85rem;
      padding: 4px 12px;
      border-radius: 999px;
      margin-bottom: 12px;
    }
    h1 {
      font-size: 1.85rem;
      line-height: 1.25;
      color: #0f172a;
      margin: 0 0 14px 0;
    }
    .meta {
      font-size: 0.9rem;
      color: #64748b;
      margin-bottom: 24px;
    }
    .cta-box {
      background: #fffbeb;
      border: 2px solid #f59e0b;
      border-radius: 12px;
      padding: 22px;
      margin: 26px 0;
      text-align: center;
    }
    .cta-preco {
      font-size: 1.25rem;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 12px;
    }
    .btn-ml {
      display: inline-block;
      background: #ffe600;
      color: #1e293b;
      font-weight: 800;
      font-size: 1.15rem;
      padding: 15px 28px;
      border-radius: 10px;
      text-decoration: none;
      border: 1px solid #eab308;
      box-shadow: 0 3px 8px rgba(0, 0, 0, 0.1);
    }
    .telegram-box {
      margin-top: 34px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 12px;
      padding: 20px;
      text-align: center;
    }
    .btn-tg {
      display: inline-block;
      margin-top: 10px;
      background: #0284c7;
      color: #ffffff;
      font-weight: 700;
      padding: 12px 24px;
      border-radius: 8px;
      text-decoration: none;
    }
    footer {
      text-align: center;
      padding: 24px;
      font-size: 0.85rem;
      color: #64748b;
    }
  </style>
</head>
<body>
  <header>
    <a href="https://compradodia.com.br">🛒 Compra do Dia</a>
  </header>

  <main class="container">
    <span class="badge">${categoria || "Achados Verificados"}</span>
    <h1>${titulo}</h1>
    <div class="meta">Atualizado em ${dataPublicacao} • Curadoria Oficial Compra do Dia</div>

    <div class="cta-box">
      <div class="cta-preco">${produto} • Faixa de ${precoFormatado}</div>
      <a href="${linkAfiliado}" target="_blank" rel="nofollow sponsored noopener" class="btn-ml">
        👉 Ver Oferta no Mercado Livre
      </a>
    </div>

    <article>
      ${conteudoHtml}
    </article>

    <div class="cta-box">
      <div class="cta-preco">Garanta o melhor preço com entrega rápida</div>
      <a href="${linkAfiliado}" target="_blank" rel="nofollow sponsored noopener" class="btn-ml">
        🛒 Conferir Disponibilidade no Mercado Livre
      </a>
    </div>

    ${faqHtml}

    <div class="telegram-box">
      <strong>🔔 Quer receber ofertas selecionadas todos os dias no telemóvel?</strong><br>
      Entre gratuitamente no nosso canal oficial do Telegram:<br>
      <a href="${linkCanalTelegram}" target="_blank" rel="noopener" class="btn-tg">
        Entrar no Canal @compradodiaoficial
      </a>
    </div>
  </main>

  <footer>
    <p>Compra do Dia • Participamos do Programa de Afiliados do Mercado Livre. Os preços e condições podem sofrer alteração sem aviso prévio.</p>
  </footer>
</body>
</html>`;
}

export default gerarHtmlArtigo;
