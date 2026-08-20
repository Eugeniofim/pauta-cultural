# Pauta Cultural

Editais e festivais de cultura do Brasil num lugar só, com um assistente que
ajuda o artista a escrever o projeto.

**No ar:** https://pautacultural.netlify.app

---

## O que faz

**Editais** — busca ao vivo nas APIs oficiais dos Mapas Culturais estaduais.
Prazo conferido contra a fonte, link direto para o portal de inscrição. Estados
sem API pública entram com o portal oficial linkado; os demais aparecem como
"em breve", nunca inventados.

**Festivais** — 117 no Brasil e 24 no exterior (12 na Europa), com e-mail, site
ou Instagram de quem organiza. O app escreve o e-mail de apresentação e abre no
Gmail da pessoa, no idioma provável do país. A Pauta nunca envia nada sozinha.

**Assistente da Lei Rouanet** — 36 perguntas em português comum que viram os 8
campos de texto do SALIC, com os limites da Instrução Normativa calculados.

**Chat** — responde sobre orçamento e regras. Com servidor de IA configurado,
conversa livre e reescreve os textos do projeto.

---

## Como funciona por dentro

Uma página só (`index.html`), sem framework nem build. Todo o estado do usuário
fica no navegador dele — conta, rascunhos, conversas. Nada sai do aparelho a não
ser o que ele mesmo envia.

Quatro funções no Netlify cuidam do que precisa de servidor:

| Rota | O que faz |
|---|---|
| `/api/editais` | Busca as APIs estaduais e devolve os editais abertos. Cache de 6h. |
| `/api/assinar` | Abre o checkout do Stripe. |
| `/api/confirmar` | Confirma a assinatura na volta do checkout. |
| `/api/cupom` | Valida cupom no Stripe — o navegador não decide nada. |

As APIs estaduais não mandam cabeçalho CORS, por isso a busca acontece no
servidor e não no navegador.

---

## Rodar local

```bash
npx netlify-cli dev
```

Sem as variáveis de ambiente as rotas de pagamento respondem 503 e o app avisa
que o pagamento está sendo ligado — nada quebra, nada mente.

## Publicar

Conectado ao Netlify, cada push na `main` publica sozinho.

## Variáveis de ambiente

Ficam no painel do Netlify, nunca no código. Veja `.env.example` para a lista.

---

## Princípios

Estas regras valem para qualquer mudança neste projeto:

**Não inventar dado.** Se a fonte oficial não publica o valor do edital, o app
diz "no regulamento" e manda a pessoa ao portal. Nunca estima.

**Prazo é contra o relógio real.** A data vem do portal e os dias são contados
no momento em que a pessoa abre. Edital vencido sai da lista sozinho.

**Fonte fora do ar não apaga dado.** Se uma secretaria não responde, o app
mantém a última lista conferida e avisa que aquela fonte não respondeu.

**Estado não confirmado é "em breve".** Preferimos deixar em branco a listar
algo que não conferimos.

**Contato só se confere com o domínio oficial.** Nada de e-mail de terceiro.
