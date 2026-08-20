/**
 * Pauta Cultural — service worker
 *
 * Existe por um motivo concreto: artista consultando edital no ônibus, no
 * interior, com sinal ruim. Sem isto, a tela fica em branco e o prazo se perde.
 *
 * Duas regras que não se quebram aqui:
 *
 * 1. O APP VEM DA REDE PRIMEIRO. Um service worker que serve HTML do cache
 *    entrega versão velha para sempre, e não há como consertar remotamente —
 *    o próprio cache impede a correção de chegar. Por isso: rede primeiro,
 *    cache só quando a rede falhar.
 *
 * 2. NADA DE PAGAMENTO É GUARDADO. Guardar /api/status faria alguém que
 *    cancelou continuar com o Pro, e /api/assinar devolveria um link de
 *    checkout já usado. Essas rotas passam direto, sempre.
 */
const VERSAO = "pauta-v2";
const CASCA  = VERSAO + "-casca";
const DADOS  = VERSAO + "-dados";

/* o essencial para a tela abrir sem rede */
const ESSENCIAL = ["/", "/manifest.webmanifest", "/icone.svg", "/icone-192.png", "/icone-512.png", "/icone-maskable-512.png"];

/* rotas que jamais podem sair do cache: dizem respeito a dinheiro e acesso */
const NUNCA_GUARDAR = /\/api\/(status|portal|assinar|confirmar|cupom)/;

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CASCA);
    /* addAll falha inteiro se um arquivo faltar; um a um é mais resistente */
    await Promise.all(ESSENCIAL.map(u => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter(n => !n.startsWith(VERSAO)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

/* rede com prazo: sem isto, conexão ruim trava esperando para sempre em vez
   de cair no cache, que é justamente o caso que queremos resolver */
function comPrazo(req, ms) {
  return new Promise((ok, falha) => {
    const t = setTimeout(() => falha(new Error("demorou")), ms);
    fetch(req).then(r => { clearTimeout(t); ok(r); }, err => { clearTimeout(t); falha(err); });
  });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (NUNCA_GUARDAR.test(url.pathname)) return;   // passa direto para a rede

  /* o app em si: rede primeiro, sempre — ver regra 1 no topo */
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const r = await comPrazo(req, 6000);
        if (r && r.ok) (await caches.open(CASCA)).put("/", r.clone());
        return r;
      } catch (err) {
        return (await caches.match("/")) || Response.error();
      }
    })());
    return;
  }

  /* editais ao vivo: rede primeiro; sem rede, devolve a última lista que
     chegou, marcada, para o app poder avisar que está mostrando algo antigo */
  if (url.pathname === "/api/editais") {
    e.respondWith((async () => {
      try {
        const r = await comPrazo(req, 8000);
        if (r && r.ok) (await caches.open(DADOS)).put(req, r.clone());
        return r;
      } catch (err) {
        const g = await caches.match(req);
        if (!g) throw err;
        const corpo = await g.json();
        corpo.doCache = true;
        return new Response(JSON.stringify(corpo),
          { headers: { "Content-Type": "application/json; charset=utf-8" } });
      }
    })());
    return;
  }

  /* ícones e imagens: cache primeiro, atualizando por baixo */
  e.respondWith((async () => {
    const guardado = await caches.match(req);
    const rede = fetch(req).then(r => {
      if (r && r.ok) caches.open(CASCA).then(c => c.put(req, r.clone()));
      return r;
    }).catch(() => null);
    return guardado || (await rede) || Response.error();
  })());
});

/* saída de emergência: se um dia este arquivo servir errado, a página manda
   "desligar" e o service worker se apaga sozinho, sem depender de suporte */
self.addEventListener("message", e => {
  if (e.data === "desligar") {
    self.registration.unregister()
      .then(() => caches.keys())
      .then(ns => Promise.all(ns.map(n => caches.delete(n))));
  }
});
