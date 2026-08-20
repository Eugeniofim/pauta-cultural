/**
 * Diz se o e-mail tem assinatura ativa, perguntando ao Stripe na hora.
 *
 * Sem banco de dados de propósito: o Stripe já é a fonte da verdade. Se o
 * cartão falhar, se a pessoa cancelar pelo portal ou pedir reembolso, a
 * resposta aqui muda sozinha — não existe cópia local para ficar desatualizada.
 *
 * LIMITE CONHECIDO: a busca é só pelo e-mail, sem provar que quem digitou é o
 * dono. Quem souber o e-mail de um assinante consegue liberar o Pro para si.
 * Para um app de R$ 9,90 cujo conteúdo é público nos portais oficiais, o risco
 * é pequeno perto do custo de o assinante perder acesso ao trocar de celular.
 * Fechar isso de vez pede login por link mágico no e-mail — próximo passo.
 */
export const config = { runtime: "edge" };

const ATIVAS = new Set(["active", "trialing"]);
const GRACA  = new Set(["past_due", "unpaid"]);   // ainda deixa entrar, mas avisa

const stripe = (chave, rota) =>
  fetch("https://api.stripe.com/v1/" + rota, { headers: { Authorization: `Bearer ${chave}` } });

export default async (req) => {
  const chave = process.env.STRIPE_SECRET_KEY;
  const semCache = { "Cache-Control": "no-store" };
  if (!chave) return Response.json({ pro: false, erro: "não configurado" }, { status: 503, headers: semCache });

  const email = (new URL(req.url).searchParams.get("email") || "").trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return Response.json({ pro: false, erro: "e-mail inválido" }, { status: 400, headers: semCache });

  try {
    const rc = await stripe(chave, `customers?email=${encodeURIComponent(email)}&limit=10`);
    const jc = await rc.json();
    if (!rc.ok) {
      /* chave restrita sem permissão de ler clientes devolve 403 aqui */
      console.error("stripe clientes:", jc?.error?.message);
      return Response.json({ pro: false, erro: "não consegui consultar" }, { status: 502, headers: semCache });
    }
    const clientes = jc.data || [];
    if (!clientes.length)
      return Response.json({ pro: false, encontrado: false }, { headers: semCache });

    /* a mesma pessoa pode ter mais de um cliente no Stripe (checkout repetido) */
    let melhor = null;
    for (const c of clientes) {
      const rs = await stripe(chave, `subscriptions?customer=${c.id}&status=all&limit=10`);
      const js = await rs.json();
      if (!rs.ok) continue;
      for (const s of js.data || []) {
        const peso = ATIVAS.has(s.status) ? 2 : GRACA.has(s.status) ? 1 : 0;
        if (!peso) continue;
        if (!melhor || peso > melhor.peso) melhor = { peso, s, c };
      }
    }
    if (!melhor)
      return Response.json({ pro: false, encontrado: true }, { headers: semCache });

    const s = melhor.s;
    return Response.json({
      pro: true,
      encontrado: true,
      situacao: s.status,
      emGraca: GRACA.has(s.status),
      cancelaNoFim: !!s.cancel_at_period_end,
      ate: s.current_period_end ? new Date(s.current_period_end * 1000).toISOString().slice(0, 10) : null,
      cliente: melhor.c.id,
    }, { headers: semCache });
  } catch (e) {
    console.error("status:", e.message);
    return Response.json({ pro: false, erro: "erro ao falar com o Stripe" }, { status: 502, headers: semCache });
  }
};
