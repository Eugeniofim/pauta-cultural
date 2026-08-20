/**
 * Pauta Cultural — editais ao vivo
 * Busca as APIs oficiais dos Mapas Culturais no servidor (as estaduais não
 * mandam CORS, então o navegador bloquearia) e devolve JSON normalizado.
 * Cache de 6h na borda: editais não mudam de minuto em minuto.
 */
const INSTALACOES = [
  { uf: "PE", esf: "Estadual", nome: "Mapa Cultural de Pernambuco", base: "https://mapacultural.pe.gov.br" },
  { uf: "CE", esf: "Estadual", nome: "Mapa Cultural do Ceará",      base: "https://mapacultural.secult.ce.gov.br" },
  { uf: "PA", esf: "Estadual", nome: "Mapa Cultural do Pará",       base: "https://mapacultural.pa.gov.br" },
  { uf: "PB", esf: "Estadual", nome: "Mapa Cultural da Paraíba",    base: "https://mapacultural.pb.gov.br" },
  { uf: "SE", esf: "Estadual", nome: "Mapa Cultural de Sergipe",    base: "https://mapacultural.se.gov.br" },
  { uf: "AP", esf: "Estadual", nome: "Mapa Cultural do Amapá",      base: "https://mapacultural.ap.gov.br" },
];
const TIPO = {
  "Edital": "Fomento", "Prêmio": "Prêmio", "Premio": "Prêmio", "Festival": "Festival",
  "Concurso": "Prêmio", "Oficina": "Oficina", "Curso": "Oficina", "Chamada": "Fomento",
  "Chamamento": "Fomento", "Bolsa": "Prêmio", "Residência": "Residência",
  "Credenciamento": "Credenciamento", "Campanhas": "Chamamento", "Mostra": "Festival",
};

/* Área cultural a partir do texto do edital.
   Ordem importa: o específico vem antes do genérico, senão "arte digital"
   cairia em "artes visuais". Na dúvida devolve "Todas". */
function area(txt) {
  const s = (txt || "").toLowerCase();
  if (/\bvideo ?mapping|videomapping|proje[çc][ãa]o mapeada|arte digital|artes digitais|arte generativa|realidade (virtual|aumentada|estendida)|\bvr\b|\bxr\b|instala[çc][ãa]o interativa|live coding|net ?art|arte e tecnologia|cultura digital|intelig[êe]ncia artificial/.test(s))
    return "Artes Digitais";
  if (/performance|interven[çc][ãa]o urbana|body ?art|live cinema|arte sonora|happening|a[çc][ãa]o performativa/.test(s))
    return "Performance";
  if (/artesanat|artes[ãa]o|artes[ãa]|cer[âa]mic|tecelag|bordad|rendeir|fibras naturais|joalheri|marchetari|entalh/.test(s))
    return "Artesanato";
  if (/gastronom|culin[áa]ri|cozinh|alimenta[çc][ãa]o|sabores|comida|panifica|fermenta[çc]|do[çc]aria|quitut/.test(s))
    return "Gastronomia";
  if (/\bmoda\b|estilism|vestu[áa]ri|modelage|upcycling|costur/.test(s))
    return "Moda";
  if (/cultura popular|maracatu|frevo|\bcoco\b|cavalo-marinho|congad|folia de reis|quadrilha junina|capoeira|boi-bumb|reisad|cirand|jongo|carimb[óo]|maculel[êe]|tambor de crioula/.test(s))
    return "Cultura Popular";
  if (/\bmúsic|musical|fonogr|banda|cancion|sonoriz|orquestr|coral|cantor/.test(s)) return "Música";
  if (/audiovisu|cinema|filme|curta|document[áa]ri|videoclip|videoart|s[ée]rie|roteir|anima[çc][ãa]o/.test(s)) return "Audiovisual";
  if (/teatro|teatral|dramatur|c[êe]nic|espet[áa]cul|bonecos|mamulengo/.test(s)) return "Teatro";
  if (/dan[çc]a|coreog|bal[ée]/.test(s)) return "Dança";
  if (/artes visuais|exposi[çc]|artes pl[áa]st|fotografi|escultur|pintur|gravur|muralism|arte urbana|grafit|colage/.test(s)) return "Artes Visuais";
  if (/literat|livro|leitura|poesia|escrit|conta[çd]|biblioteca|edi[çc][ãa]o de livro|sarau|slam/.test(s)) return "Literatura";
  if (/circo|circens|palha[çc]|acrobac/.test(s)) return "Circo";
  if (/patrim[ôo]ni|museu|museolog|acervo|restaur|mem[óo]ria|arquivo hist/.test(s)) return "Patrimônio Cultural";
  return "Todas";
}
const limpa = t => String(t || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

async function buscar(inst, hoje) {
  const campos = "id,name,shortDescription,registrationFrom,registrationTo,type,owner.name,owner.En_Municipio";
  const url = `${inst.base}/api/opportunity/find?@select=${campos}`
    + `&registrationTo=GT(${hoje})&@order=registrationTo ASC&@limit=80`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6500);
  try {
    const r = await fetch(url, { signal: ctrl.signal,
      headers: { Accept: "application/json", "User-Agent": "PautaCultural/1.0 (+https://pauta-cultural.vercel.app)" } });
    if (!r.ok) return { uf: inst.uf, erro: `HTTP ${r.status}`, itens: [] };
    const dados = await r.json();
    if (!Array.isArray(dados)) return { uf: inst.uf, erro: "formato inesperado", itens: [] };

    const agora = new Date();
    const doisAnos = new Date(); doisAnos.setFullYear(doisAnos.getFullYear() + 2);

    const itens = dados
      .filter(o => o?.name && o?.registrationTo?.date)
      .map(o => {
        const ate = o.registrationTo.date.slice(0, 10);
        const fim = new Date(ate + "T23:59:59-03:00");
        /* alguns portais gravam 2111 como "sem encerramento" */
        const absurdo = fim > doisAnos;
        const titulo = limpa(o.name);
        const desc = limpa(o.shortDescription);
        return {
          t: titulo.length > 96 ? titulo.slice(0, 93) + "…" : titulo,
          o: o.owner?.name || inst.nome, sis: inst.nome,
          cid: o.owner?.En_Municipio || null,
          tp: TIPO[o.type?.name] || o.type?.name || "Fomento",
          cat: area(titulo + " " + desc),
          reg: inst.uf, esf: inst.esf, fo: "pub", ex: "ambos",
          ate: absurdo ? null : ate,
          janela: absurdo ? "Sem data de encerramento no portal" : null,
          d: desc || "Consulte o regulamento no portal oficial.",
          link: `${inst.base}/oportunidade/${o.id}`,
          r: ["Cadastro no " + inst.nome, "Requisitos definidos no edital"],
          c: ["Definidas no edital"],
        };
      })
      .filter(x => x.ate === null || new Date(x.ate + "T23:59:59-03:00") > agora);
    return { uf: inst.uf, erro: null, itens };
  } catch (e) {
    return { uf: inst.uf, erro: e.name === "AbortError" ? "timeout" : "sem resposta", itens: [] };
  } finally { clearTimeout(t); }
}

export const config = { runtime: "edge" };

export default async () => {
  const hoje = new Date().toISOString().slice(0, 10);
  const res = await Promise.all(INSTALACOES.map(i => buscar(i, hoje)));
  let editais = [];
  const fontes = {}, falhas = [];
  for (const r of res) {
    fontes[r.uf] = r.erro ? `falhou: ${r.erro}` : r.itens.length;
    if (r.erro) falhas.push(`${r.uf}: ${r.erro}`);
    editais = editais.concat(r.itens);
  }
  /* o mesmo edital às vezes aparece duas vezes no portal de origem */
  const vistos = new Set();
  editais = editais.filter(e => {
    const chave = `${e.reg}|${e.t.toLowerCase()}|${e.ate || ""}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave); return true;
  });
  editais.forEach((e, i) => { e.id = 9000 + i; });
  editais.sort((a, b) => {
    if (!a.ate) return 1; if (!b.ate) return -1;
    return new Date(a.ate) - new Date(b.ate);
  });

  return new Response(JSON.stringify({
    ok: editais.length > 0, gerado_em: new Date().toISOString(),
    total: editais.length, fontes, falhas, editais,
  }), { status: 200, headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=600",
      /* a borda guarda por 6h e serve o antigo enquanto rebusca — se um portal
         estadual cair, ninguém vê tela vazia. CDN-Cache-Control é o nome que a
         Vercel entende; o da Netlify fica para o caso de voltarmos pra lá. */
      "CDN-Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
      "Netlify-CDN-Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
      "Access-Control-Allow-Origin": "*",
  }});
};
