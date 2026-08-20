/** Abre o checkout do Stripe. A chave vem do ambiente do servidor, nunca do navegador. */
const PRICE       = process.env.STRIPE_PRICE_ID || "price_1U2t3HRtBz2fFckWz9s2QyZp";
const PRICE_ANUAL = process.env.STRIPE_PRICE_ANUAL || "";
const SITE  = process.env.URL_SITE || "https://pauta-cultural.vercel.app";
const form = o => new URLSearchParams(o).toString();

export const config = { runtime: "edge" };

export default async (req) => {
  const chave = process.env.STRIPE_SECRET_KEY;
  if (!chave) return Response.json(
    { erro: "pagamento ainda não configurado", detalhe: "falta STRIPE_SECRET_KEY no servidor" }, { status: 503 });
  if (req.method !== "POST") return Response.json({ erro: "use POST" }, { status: 405 });

  let email = "", plano = "mensal";
  try { ({ email = "", plano = "mensal" } = await req.json()); } catch { }

  /* o anual só entra se realmente houver um preço configurado; sem isso a
     pessoa clicaria em "anual" e seria cobrada o mensal sem saber */
  const anual = plano === "anual" && !!PRICE_ANUAL;
  const preco = anual ? PRICE_ANUAL : PRICE;

  const corpo = {
    mode: "subscription",
    "line_items[0][price]": preco, "line_items[0][quantity]": "1",
    locale: "pt-BR", allow_promotion_codes: "true", billing_address_collection: "auto",
    success_url: `${SITE}/?assinatura=ok&sessao={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE}/?assinatura=cancelada`,
    "subscription_data[metadata][produto]": "pauta_pro",
    "subscription_data[metadata][plano]": anual ? "anual" : "mensal",
  };
  if (email) corpo.customer_email = email;

  try {
    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form(corpo),
    });
    const j = await r.json();
    if (!r.ok) { console.error("stripe:", j?.error?.message);
      return Response.json({ erro: "não foi possível abrir o checkout" }, { status: 502 }); }
    return Response.json({ url: j.url, plano: anual ? "anual" : "mensal" },
      { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("assinar:", e.message);
    return Response.json({ erro: "erro ao falar com o Stripe" }, { status: 502 });
  }
};
