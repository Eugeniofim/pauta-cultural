/**
 * Convite de 7 dias — o Stripe é o banco de dados.
 *
 * Fluxo: a pessoa entra com e-mail + código de convite. O código é um
 * promotion code criado no painel do Stripe (dá para limitar usos e prazo
 * por lá, sem mexer em código). O servidor confere duas coisas antes de
 * abrir o checkout:
 *
 *  1. O código existe, está ativo e NÃO é o cupom vitalício (100% forever —
 *     esse segue no fluxo antigo de cupom).
 *  2. O e-mail nunca teve assinatura nem teste. Quem já usou não usa de
 *     novo: o histórico de assinaturas do cliente no Stripe é a memória.
 *
 * O checkout sai com 7 dias de teste e SEM pedir cartão. No oitavo dia, sem
 * cartão cadastrado, o próprio Stripe cancela a assinatura — a pessoa volta
 * ao plano grátis (sai do modo Pro; a conta continua existindo). O código é
 * anexado à sessão para o Stripe contar o resgate e respeitar o limite de
 * usos definido no painel.
 */
const PRICE = process.env.STRIPE_PRICE_ID || "price_1U2t3HRtBz2fFckWz9s2QyZp";
const SITE = process.env.URL_SITE || "https://pauta-cultural.vercel.app";
const form = o => new URLSearchParams(o).toString();

export const config = { runtime: "edge" };

const semCache = { "Cache-Control": "no-store" };

export default async (req) => {
  const chave = process.env.STRIPE_SECRET_KEY;
  if (!chave) return Response.json({ ok: false, msg: "Convites indisponíveis agora." }, { status: 503, headers: semCache });
  if (req.method !== "POST") return Response.json({ ok: false, msg: "use POST" }, { status: 405, headers: semCache });

  let email = "", codigo = "";
  try { ({ email = "", codigo = "" } = await req.json()); } catch { }
  email = String(email).trim().toLowerCase();
  codigo = String(codigo).trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return Response.json({ ok: false, msg: "Preencha seu e-mail no perfil antes de usar o convite." }, { status: 400, headers: semCache });
  if (!codigo)
    return Response.json({ ok: false, msg: "Digite o código do convite." }, { status: 400, headers: semCache });

  const stripe = (rota, init) => fetch("https://api.stripe.com/v1/" + rota, {
    ...init, headers: { Authorization: `Bearer ${chave}`, ...(init?.headers || {}) },
  });

  try {
    /* 1. o código existe e é mesmo um convite? */
    const rp = await stripe(`promotion_codes?code=${encodeURIComponent(codigo)}&active=true&limit=1&expand[]=data.promotion.coupon`);
    const jp = await rp.json();
    if (!rp.ok) { console.error("convite promo:", jp?.error?.message);
      return Response.json({ ok: false, msg: "Não consegui validar o convite agora." }, { status: 502, headers: semCache }); }
    const promo = jp?.data?.[0];
    if (!promo) return Response.json({ ok: false, msg: "Convite não encontrado ou expirado." }, { headers: semCache });

    let c = promo.promotion?.coupon ?? promo.coupon;
    if (typeof c === "string") {
      const rc = await stripe(`coupons/${c}`);
      c = rc.ok ? await rc.json() : {};
    }
    c = c || {};
    if (c.percent_off === 100 && c.duration === "forever")
      return Response.json({ ok: false, vitalicio: true, msg: "Este código é de acesso completo — use o campo de cupom." }, { headers: semCache });

    /* 2. este e-mail já teve assinatura ou teste? */
    const rcli = await stripe(`customers?email=${encodeURIComponent(email)}&limit=10`);
    const jcli = await rcli.json();
    if (!rcli.ok) { console.error("convite clientes:", jcli?.error?.message);
      return Response.json({ ok: false, msg: "Não consegui conferir seu e-mail agora." }, { status: 502, headers: semCache }); }
    for (const cli of jcli.data || []) {
      const rs = await stripe(`subscriptions?customer=${cli.id}&status=all&limit=1`);
      const js = await rs.json();
      if (rs.ok && (js.data || []).length)
        return Response.json({ ok: false, msg: "Este e-mail já usou um teste ou assinatura. Para continuar no Pro, assine na aba Plano." }, { headers: semCache });
    }

    /* 3. checkout com 7 dias de teste, sem cartão */
    const corpo = {
      mode: "subscription",
      "line_items[0][price]": PRICE, "line_items[0][quantity]": "1",
      locale: "pt-BR",
      customer_email: email,
      payment_method_collection: "if_required",
      "subscription_data[trial_period_days]": "7",
      "subscription_data[trial_settings][end_behavior][missing_payment_method]": "cancel",
      "subscription_data[metadata][produto]": "pauta_pro",
      "subscription_data[metadata][origem]": "convite:" + codigo.toUpperCase(),
      "discounts[0][promotion_code]": promo.id,
      success_url: `${SITE}/?assinatura=ok&sessao={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE}/?assinatura=cancelada`,
    };
    const r = await stripe("checkout/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form(corpo),
    });
    const j = await r.json();
    if (!r.ok) { console.error("convite checkout:", j?.error?.message);
      return Response.json({ ok: false, msg: "Não foi possível abrir a confirmação do convite." }, { status: 502, headers: semCache }); }
    return Response.json({ ok: true, url: j.url, msg: "Convite válido — confirme para começar seus 7 dias." }, { headers: semCache });
  } catch (e) {
    console.error("convite:", e.message);
    return Response.json({ ok: false, msg: "Erro ao falar com o Stripe." }, { status: 502, headers: semCache });
  }
};
