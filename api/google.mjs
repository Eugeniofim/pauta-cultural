/**
 * Entrar com Google — verificação do token no servidor.
 *
 * O navegador recebe do Google um token assinado e manda para cá. Conferir
 * esse token no próprio navegador não vale nada: qualquer pessoa edita o
 * JavaScript da página e diz que é quem quiser. Quem confere é o Google, por
 * este endpoint, e só então o e-mail é aceito.
 *
 * Duas checagens que não podem faltar:
 *  - aud precisa ser o NOSSO client id. Sem isso, um token emitido para
 *    qualquer outro site do mundo seria aceito aqui.
 *  - email_verified precisa ser verdadeiro. Conta Google sem e-mail
 *    confirmado não prova endereço nenhum.
 */
export const config = { runtime: "edge" };

const semCache = { "Cache-Control": "no-store" };

export default async (req) => {
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  if (!CLIENT_ID)
    return Response.json({ erro: "login com Google não configurado" }, { status: 503, headers: semCache });
  if (req.method !== "POST")
    return Response.json({ erro: "use POST" }, { status: 405, headers: semCache });

  let token = "";
  try { ({ token = "" } = await req.json()); } catch { }
  if (!token || token.length > 4096)
    return Response.json({ erro: "token ausente" }, { status: 400, headers: semCache });

  try {
    const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(token));
    const j = await r.json();
    if (!r.ok)
      return Response.json({ erro: "token inválido" }, { status: 401, headers: semCache });

    /* o token é do nosso app? */
    if (j.aud !== CLIENT_ID)
      return Response.json({ erro: "token de outro aplicativo" }, { status: 401, headers: semCache });

    /* o Google confirmou este e-mail? */
    if (j.email_verified !== "true" && j.email_verified !== true)
      return Response.json({ erro: "e-mail não confirmado no Google" }, { status: 401, headers: semCache });

    if (!j.email)
      return Response.json({ erro: "token sem e-mail" }, { status: 401, headers: semCache });

    return Response.json({
      ok: true,
      email: String(j.email).toLowerCase(),
      nome: j.name || j.given_name || "",
    }, { headers: semCache });
  } catch (e) {
    console.error("google:", e.message);
    return Response.json({ erro: "não consegui falar com o Google" }, { status: 502, headers: semCache });
  }
};
