/**
 * O assistente do Pauta — conversa sabendo quem é o artista.
 *
 * Recebe o histórico, o projeto aberto e o perfil (pitch, estilo, estado,
 * áreas, kit) e devolve a resposta em streaming, no formato de evento que a
 * tela já lia antes de existir servidor: "event: texto" com {t}.
 *
 * A regra do app vale aqui também, e por isso está escrita no prompt: este
 * assistente NÃO inventa edital, prazo, valor nem contato. Quando não sabe,
 * diz que não sabe e manda conferir no portal oficial. Um assistente que
 * chuta prazo num app de prazos destrói a única coisa que o produto vende.
 */
import Anthropic from "@anthropic-ai/sdk";

/* Runtime Node, não Edge: o SDK da Anthropic usa node:fs e node:path, que a
   borda não tem. E o handler é no estilo (req, res) do Node — na primeira
   tentativa devolvi um Response web, que este runtime ignora: a conexão
   ficava pendurada até o timeout, sem resposta nem erro. */
export const config = { supportsResponseStreaming: true };

const semCache = { "Cache-Control": "no-store" };
const sse = (evento, dado) =>
  `event: ${evento}\ndata: ${JSON.stringify(dado)}\n\n`;

function contexto(perfil, projeto) {
  const p = perfil || {};
  const k = p.kit || {};
  const L = [];
  if (p.nome) L.push(`Nome: ${p.nome}`);
  if (p.areas?.length) L.push(`Áreas: ${p.areas.join(", ")}`);
  if (k.estilo) L.push(`Estilo: ${k.estilo}`);
  if (p.uf) L.push(`Estado: ${p.uf}`);
  if (p.tipo) L.push(`Inscreve-se como: ${p.tipo === "pj" ? "Pessoa Jurídica" : p.tipo === "pf" ? "Pessoa Física" : "PF ou PJ"}`);
  if (k.pitch) L.push(`Sobre o trabalho: ${k.pitch}`);
  if (k.reltxt) L.push(`Release: ${k.reltxt.slice(0, 900)}`);
  const temMaterial = ["video", "stream", "release", "rider", "site"].filter(x => k[x]);
  if (temMaterial.length) L.push(`Material pronto: ${temMaterial.join(", ")}`);
  else L.push("Ainda não cadastrou material (vídeo, release, rider).");
  if (k.dur || k.pessoas) L.push(`Formato: ${[k.dur, k.pessoas && k.pessoas + " em palco"].filter(Boolean).join(", ")}`);

  let s = L.length ? `QUEM É O ARTISTA\n${L.join("\n")}` : "O artista ainda não preencheu o perfil.";
  if (projeto && (projeto.nome || projeto.campos)) {
    s += `\n\nPROJETO ABERTO AGORA\n${JSON.stringify(projeto).slice(0, 2500)}`;
  }
  return s;
}

const SISTEMA = `Você é o assistente do Pauta Cultural, app brasileiro que reúne editais e festivais e ajuda artistas a escrever projetos.

Fala com o artista em português do Brasil, direto e sem formalidade excessiva. Respostas curtas: duas a cinco frases, a menos que peçam detalhe. Sem bullet quando uma frase resolve.

O QUE VOCÊ NUNCA FAZ
- Não inventa edital, prazo, valor, link ou contato. Se não tem certeza, diz que não sabe e manda conferir no portal oficial.
- Não afirma que um edital está aberto. Prazos mudam sem aviso, e o app existe justamente porque prazo errado faz o artista perder inscrição.
- Não promete aprovação nem estima chance.

O QUE VOCÊ SABE FAZER
- Lei Rouanet e SALIC: os 8 campos de texto, e os limites da IN MinC nº 29/2026 — administrativo 15%, captação 10% até R$ 150 mil, acessibilidade e divulgação 20%, distribuição gratuita 3x10%, preço popular 20% com teto de R$ 50. Se te perguntarem número que não está aqui, diga que precisa ser conferido na norma.
- Ajudar a escrever e melhorar texto de projeto, usando o que sabe do artista.
- Explicar diferença entre fomento direto, incentivo fiscal e premiação.
- Dizer o que costuma faltar numa proposta: contrapartida, acessibilidade, plano de divulgação, orçamento coerente.

Use o perfil abaixo para responder no contexto real dele — cite o estilo, o estado e o material que ele tem. Se o perfil estiver vazio, sugira preencher o kit de mídia no menu da conta.`;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const chave = process.env.ANTHROPIC_API_KEY;

  const manda = (evento, dado) => res.write(sse(evento, dado));
  const comoSSE = () => {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("X-Accel-Buffering", "no");
  };

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ erro: "use POST" }));
    return;
  }
  if (!chave) {
    comoSSE();
    manda("erro", { msg: "O assistente ainda não foi ligado." });
    res.end();
    return;
  }

  const corpo = req.body || {};
  const mensagens = corpo.mensagens, projeto = corpo.projeto, perfil = corpo.perfil;

  /* só role e content, e só os últimos turnos: histórico inteiro de meses
     encareceria cada resposta sem melhorar nenhuma */
  const msgs = (Array.isArray(mensagens) ? mensagens : [])
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20)
    .map(m => ({ role: m.role, content: m.content.slice(0, 6000) }));
  if (!msgs.length) {
    comoSSE();
    manda("erro", { msg: "Sem mensagem." });
    res.end();
    return;
  }

  const client = new Anthropic({ apiKey: chave });
  comoSSE();
  try {
    const stream = client.messages.stream({
      model: "claude-opus-5",
      max_tokens: 8000,
      /* effort médio em vez de desligar o pensamento: numa conversa sobre
         regra de norma, desligar troca latência por resposta pior */
      output_config: { effort: "medium" },
      system: `${SISTEMA}\n\n${contexto(perfil, projeto)}`,
      messages: msgs,
    });
    for await (const ev of stream) {
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta")
        manda("texto", { t: ev.delta.text });
    }
    const fim = await stream.finalMessage();
    if (fim.stop_reason === "refusal")
      manda("erro", { msg: "Não consigo responder isso. Tente reformular." });
  } catch (e) {
    console.error("conversar:", e?.message);
    manda("erro", { msg: "O assistente falhou agora. Tente de novo." });
  } finally {
    res.end();
  }
}
