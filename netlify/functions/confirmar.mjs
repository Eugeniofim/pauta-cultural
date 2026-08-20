/** Confirma a assinatura na volta do checkout, sem esperar webhook. */
export default async (req) => {
  const chave = process.env.STRIPE_SECRET_KEY;
  if (!chave) return Response.json({ pro: false, erro: "não configurado" }, { status: 503 });

  const sessao = new URL(req.url).searchParams.get("sessao");
  if (!sessao || !/^cs_[A-Za-z0-9_]+$/.test(sessao))
    return Response.json({ pro: false, erro: "sessão inválida" }, { status: 400 });

  try {
    const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessao}`,
      { headers: { Authorization: `Bearer ${chave}` } });
    const j = await r.json();
    if (!r.ok) return Response.json({ pro: false }, { status: 502 });
    const pago = j.payment_status === "paid" || j.status === "complete";
    return Response.json({ pro: pago, email: j.customer_details?.email || j.customer_email || null },
      { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ pro: false }, { status: 502 }); }
};
export const config = { path: "/api/confirmar" };
