/** Abre o checkout do Stripe. A chave vem do ambiente do servidor, nunca do navegador. */
const PRICE = process.env.STRIPE_PRICE_ID || "price_1U2t3HRtBz2fFckWz9s2QyZp";
const SITE  = process.env.URL_SITE || "https://pauta-cultural.vercel.app";
const form = o => new URLSearchParams(o).toString();

export const config = { runtime: "edge" };

export default async (req) => {
  const chave = process.env.STRIPE_SECRET_KEY;
  if (!chave) return Response.json(
    { erro: "pagamento ainda não configurado", detalhe: "falta STRIPE_SECRET_KEY no servidor" }, { status: 503 });
  if (req.method !== "POST") return Response.json({ erro: "use POST" }, { status: 405 });

  let email = "";
  try { ({ email = "" } = await req.json()); } catch { }

  const corpo = {
    mode: "subscription",
    "line_items[0][price]": PRICE, "line_items[0][quantity]": "1",
    locale: "pt-BR", allow_promotion_codes: "true", billing_address_collection: "auto",
    success_url: `${SITE}/?assinatura=ok&sessao={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE}/?assinatura=cancelada`,
    "subscription_data[metadata][produto]": "pauta_pro",
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
    return Response.json({ url: j.url }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("assinar:", e.message);
    return Response.json({ erro: "erro ao falar com o Stripe" }, { status: 502 });
  }
};
