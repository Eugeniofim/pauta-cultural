/**
 * Abre o portal de assinatura do Stripe — é ali que a pessoa cancela, troca o
 * cartão e baixa as faturas.
 *
 * Cancelar dentro do app é exigência do Código de Defesa do Consumidor: o
 * cancelamento tem que ser tão fácil quanto a contratação. Em vez de escrever
 * essa tela (e ter que acertar reembolso, proporcional, recibo), mandamos para
 * a página do próprio Stripe, que já cuida disso e fica sempre em dia.
 */
const SITE = process.env.URL_SITE || "https://pauta-cultural.vercel.app";
const form = o => new URLSearchParams(o).toString();

export const config = { runtime: "edge" };

export default async (req) => {
  const chave = process.env.STRIPE_SECRET_KEY;
  const semCache = { "Cache-Control": "no-store" };
  if (!chave) return Response.json({ erro: "não configurado" }, { status: 503, headers: semCache });
  if (req.method !== "POST") return Response.json({ erro: "use POST" }, { status: 405, headers: semCache });

  let email = "", cliente = "";
  try { ({ email = "", cliente = "" } = await req.json()); } catch { }
  email = String(email).trim().toLowerCase();

  try {
    /* o front manda o id do cliente quando já sabe; senão, acha pelo e-mail */
    if (!cliente) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
        return Response.json({ erro: "e-mail inválido" }, { status: 400, headers: semCache });
      const rc = await fetch(`https://api.stripe.com/v1/customers?email=${encodeURIComponent(email)}&limit=1`,
        { headers: { Authorization: `Bearer ${chave}` } });
      const jc = await rc.json();
      if (!rc.ok || !(jc.data || []).length)
        return Response.json({ erro: "não achei assinatura para esse e-mail" }, { status: 404, headers: semCache });
      cliente = jc.data[0].id;
    }

    const r = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form({ customer: cliente, return_url: `${SITE}/?assinatura=voltou`, locale: "pt-BR" }),
    });
    const j = await r.json();
    if (!r.ok) {
      const m = j?.error?.message || "";
      const tipo = j?.error?.type || "";
      console.error("portal:", r.status, tipo, m);
      /* os dois tropeços possíveis aqui têm conserto diferente, então vale
         distinguir em vez de devolver "deu erro" e deixar adivinhando */
      const faltaConfig = /configuration|default configuration|has not been created|no configuration/i.test(m);
      const faltaPermissao = r.status === 403 || /permission|restricted|does not have access/i.test(m);
      return Response.json({
        erro: faltaConfig    ? "o portal de assinatura ainda não foi ativado no painel do Stripe"
            : faltaPermissao ? "a chave do Stripe não tem permissão para abrir o portal"
            : "não consegui abrir o portal",
        ajuda: faltaConfig    ? "Stripe → Configurações → Faturamento → Portal do cliente → Ativar"
             : faltaPermissao ? "Stripe → Chaves de API → editar a chave restrita → Portal do cliente: gravar"
             : null,
        /* só o código, não o texto do Stripe: a mensagem dele traz pedaço da
           chave e o id da conta, e esta rota é pública */
        stripe: { status: r.status, tipo },
      }, { status: 502, headers: semCache });
    }
    return Response.json({ url: j.url }, { headers: semCache });
  } catch (e) {
    console.error("portal:", e.message);
    return Response.json({ erro: "erro ao falar com o Stripe" }, { status: 502, headers: semCache });
  }
};
