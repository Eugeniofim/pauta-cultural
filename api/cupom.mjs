/** Valida o cupom no Stripe — o navegador não decide nada. */
export const config = { runtime: "edge" };

export default async (req) => {
  const chave = process.env.STRIPE_SECRET_KEY;
  if (req.method !== "POST") return Response.json({ ok: false, msg: "use POST" }, { status: 405 });

  let codigo = "";
  try { ({ codigo = "" } = await req.json()); } catch { }
  codigo = String(codigo).trim();
  if (!codigo) return Response.json({ ok: false, msg: "Digite um cupom." }, { status: 400 });
  if (!chave) return Response.json({ ok: false, msg: "Validação de cupom indisponível agora." }, { status: 503 });

  try {
    /* expand traz o cupom junto: uma chamada só, sem depender de
       permissão separada de leitura de cupons na chave restrita */
    const r = await fetch(
      `https://api.stripe.com/v1/promotion_codes?code=${encodeURIComponent(codigo)}`
      + `&active=true&limit=1&expand[]=data.promotion.coupon`,
      { headers: { Authorization: `Bearer ${chave}` } });
    const j = await r.json();
    if (!r.ok) { console.error("stripe cupom:", j?.error?.message);
      return Response.json({ ok: false, msg: "Não foi possível validar agora." }, { status: 502 }); }

    const promo = j?.data?.[0];
    if (!promo) return Response.json({ ok: false, msg: "Cupom não encontrado ou expirado." });

    let c = promo.promotion?.coupon ?? promo.coupon;
    if (typeof c === "string") {
      const rc = await fetch(`https://api.stripe.com/v1/coupons/${c}`,
        { headers: { Authorization: `Bearer ${chave}` } });
      c = rc.ok ? await rc.json() : {};
    }
    c = c || {};

    if (c.percent_off === 100 && c.duration === "forever")
      return Response.json({ ok: true, pro: true, msg: "Cupom aplicado — acesso completo liberado." });

    const desc = c.percent_off ? `${c.percent_off}% de desconto`
      : c.amount_off ? `R$ ${(c.amount_off / 100).toFixed(2).replace(".", ",")} de desconto` : null;
    return Response.json({ ok: true, pro: false,
      msg: desc ? `Cupom válido: ${desc}. Ele entra no checkout.`
                : "Cupom válido. O desconto aparece no checkout." });
  } catch (e) {
    console.error("cupom:", e.message);
    return Response.json({ ok: false, msg: "Não foi possível validar agora." }, { status: 502 });
  }
};
