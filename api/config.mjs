/**
 * O que o navegador precisa saber para montar a tela.
 *
 * O client id do Google é público por natureza — vai no HTML de qualquer
 * site que use login do Google. Mas serví-lo daqui, em vez de chumbar no
 * arquivo, tem uma vantagem que importa neste app: se a variável não
 * estiver configurada, o front simplesmente não desenha o botão. Nada de
 * botão morto pedindo desculpa por não funcionar.
 */
export const config = { runtime: "edge" };

export default async () =>
  Response.json(
    {
      google: process.env.GOOGLE_CLIENT_ID || null,
      /* o front esconde a aba Conversar quando isto é falso */
      assistente: !!process.env.ANTHROPIC_API_KEY,
    },
    { headers: { "Cache-Control": "public, max-age=300", "Content-Type": "application/json; charset=utf-8" } }
  );
