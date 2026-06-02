# Image Prompts Bundle — primo asset pushOut1777

> Prompt pronti per generare le immagini necessarie ai file pubblicabili 
> del primo asset (Perplexity research workflow). 
>
> Strumenti consigliati per generazione: Bing Image Creator (DALL-E 3, 
> gratis), ChatGPT Plus (DALL-E 3 integrato), Ideogram, Midjourney, 
> Flux Schnell. Alternativa zero-AI: Unsplash search con keyword 
> suggerite a fondo documento.
>
> Stile cross-asset: minimalist editorial illustration, no people, no 
> branded logos, pulito e leggibile, palette sobria. NON stock corporate, 
> NON foto di gente che sorride al laptop, NON 3D render glossy.

---

## File pubblicabili — riepilogo posizionamento

| File | Immagini | Posizione |
|---|---|---|
| `01_articolo_medium.md` (EN) | 1 kicker image | In cima, prima dell'H1, full-width |
| `05_articolo_medium_IT.md` | 1 kicker image (la stessa dell'EN va bene) | In cima, prima dell'H1, full-width |
| `02_template_gratuito.md` (EN) | 0 (opzionale 1) | Solo se la piattaforma di hosting le rende — Gist NO, Google Doc SÌ |
| `06_template_gratuito_IT.md` | 0 (opzionale 1) | Stesso |
| `03_template_pro.md` (EN) | 1 cover image (per Gumroad/LemonSqueezy) | Cover prodotto |
| `07_template_pro_IT.md` | 1 cover image (la stessa o variante) | Cover prodotto |

Nota strategica: per Medium 1 kicker image è essenziale (CTR sale del 
20-40% con kicker rispetto a senza). Per Gist e Google Doc le immagini 
sono opzionali e a basso impatto. Per Gumroad/LemonSqueezy la cover è 
visibile nel marketplace, vale la pena.

---

## Prompt #1 — Kicker image articolo Medium (EN + IT)

**Posizionamento**: in cima a `01_articolo_medium.md` e `05_articolo_medium_IT.md`, prima dell'H1.

**Concept**: una mappa esplorativa stilizzata. Linee, nodi, regioni mappate vs regioni con disclaimer "unmapped". Visualizza l'idea centrale dell'articolo: territory mapping, non answer-finding. Niente AI buzz visivo (no robot, no neural network glow).

**Prompt principale (DALL-E 3 / Midjourney / Flux):**

```
Minimalist editorial illustration of an exploration map. Top-down 
view of a stylized abstract territory: clusters of small connected 
nodes representing thematic regions, several sub-regions labeled 
with subtle disclaimer markers (small dotted areas labeled "limited 
data"). Clean lines, hand-drawn quality but precise. Color palette: 
deep navy blue background, off-white linework, occasional muted 
amber accents on key nodes. No text, no people, no robots, no 
glowing UI elements. Editorial style suitable for a serious 
technical article. 16:9 aspect ratio.
```

**Variante più sobria (se la prima viene troppo "carta dei pirati")**:

```
Minimalist data-cartography illustration. A grid of clean rectangular 
clusters of varying density, connected by thin lines, suggesting a 
mapped knowledge territory. Some clusters dense and confidently 
drawn, others sparser and dashed (suggesting partial mapping). 
Off-white on deep navy, single muted amber accent on the central 
cluster. No text, no faces, no AI clichés. Editorial flat illustration 
style. 16:9.
```

**Alternativa fotografica (Unsplash search)**: cercare `topographic map`, 
`network nodes minimal`, `library archive`, `research notebook flat lay`. 
Filtrare per immagini senza persone, senza branding visibile, sobrie.

**Note di scelta**: il map metaphor è coerente col linguaggio dell'articolo 
("territory map", "what's missing"). Evitare l'AI cliché image (robot 
mano umana, brain con circuiti) — sarebbe contro brand voice.

---

## Prompt #2 — Cover image template Pro (EN + IT)

**Posizionamento**: cover prodotto Gumroad/LemonSqueezy per `03_template_pro.md` e `07_template_pro_IT.md`.

**Concept**: un blueprint stilizzato di workflow modulare. Sei blocchi connessi (i 6 moduli del template) + un anello di audit attorno. Più tecnico/architetturale del kicker dell'articolo.

**Prompt principale**:

```
Minimalist technical blueprint illustration. Six labeled rectangular 
modules arranged in a flowing process, connected by thin directional 
arrows: "Opening", "Domains", "Citations", "Disclaimers", "Patterns", 
"Audit". The audit module wraps around the others as a feedback loop. 
Style: clean architectural blueprint, off-white linework on deep navy 
background, single muted amber accent on the audit loop. No people, 
no glowing elements, no AI imagery. Suitable as a digital product 
cover. Square 1:1 aspect ratio.
```

**Variante senza testo embedded** (se DALL-E rende male i label):

```
Minimalist technical blueprint illustration showing a six-step 
modular workflow. Six small rectangular blocks connected in sequence 
with thin arrows, surrounded by a dashed feedback loop. Off-white 
on deep navy, single muted amber accent on the feedback arrow. 
Architectural blueprint aesthetic. No text labels, no people, no 
AI clichés. Square 1:1.
```

I label li aggiungi tu in post (Figma, Canva, Affinity) se DALL-E 
fa pasticci col testo.

**Alternativa zero-AI (Unsplash + sovrascrittura)**: cercare 
`blueprint architecture`, `modular system`, `process diagram minimal`. 
Aggiungere overlay con titolo del prodotto.

---

## Prompt #3 (opzionale) — Immagine inline articolo (mid-article)

**Posizionamento**: solo se l'articolo Medium è stato pubblicato e hai notato in stats che il drop-off è alto a metà. Aggiungi un'immagine spezza-prosa dopo la sezione "I sei principi epistemologici" o dopo "I numeri, trasparenti" come ancora visiva.

**Concept**: una rappresentazione visiva del 4-step workflow (First pass → Audit → Identify gaps → Closing pass).

**Prompt**:

```
Minimalist horizontal flow diagram showing four sequential steps. 
Each step is a small clean rectangular node with a single-word 
label: "Pass", "Audit", "Gaps", "Closing". Thin arrows between them. 
Below each node a small visual abstraction (e.g., a wide ring for 
Pass, a checkmark cluster for Audit, a row of dashed boxes for 
Gaps, a focused arrow for Closing). Off-white on deep navy, single 
muted amber accent on the Audit step. Editorial flat illustration 
style. 16:9 aspect ratio.
```

**Quando rinunciare**: se l'articolo va bene senza, non aggiungere. 
Più immagini = più tempo di setup. Per ora la kicker basta.

---

## Prompt #4 (opzionale, post-pubblicazione) — Email banner per ConvertKit

**Posizionamento**: solo dopo aver setupato email capture (post-pubblicazione, fase 2). Banner per email di benvenuto a chi compra il Pro.

**Concept**: variante del cover Pro, formato banner orizzontale.

**Prompt**:

```
Minimalist email banner illustration. A small abstract knowledge map 
on the left third (off-white nodes connected on deep navy background), 
empty negative space on the right two-thirds for text overlay. Single 
muted amber accent. No people, no AI imagery, no branded logos. 
Clean editorial style. 1500x500 banner aspect ratio.
```

Non urgente. Solo se a fase 2 si setupa il funnel email.

---

## Specifiche tecniche di output

Per tutti i prompt sopra:

**Formati e dimensioni**:
- Kicker Medium: 1600×900 px (16:9, formato Medium consiglia)
- Cover Gumroad/LemonSqueezy: 1200×1200 px (1:1, formato cover prodotto)
- Banner email: 1500×500 px

**File format**: PNG con sfondo opaco (non trasparente). JPG accettabile 
ma PNG preferito per la qualità su Medium.

**Color palette suggerita**:
- Background: deep navy `#0F1A2E` o `#13192C`
- Linework / primary: off-white `#F4EFE6`
- Accent: muted amber `#D4A05F` o `#C18B4D`
- Eventuali sub-accent: muted teal `#3F7A89`

Coerenza palette cross-asset: il kicker dell'articolo, la cover Pro, 
e l'eventuale banner email devono usare gli stessi 3 colori 
(background + linework + accent). Questo crea identità visiva 
riconoscibile come "asset pushOut1777" senza bisogno di logo.

---

## Note di pratica

**Iterazione**: prevedi 3-5 generazioni per ogni prompt prima di avere 
qualcosa di pubblicabile. DALL-E 3 e Midjourney spesso rendono il primo 
shot decente ma con qualche elemento off (scritte sbagliate, persona 
inserita per default, gradiente troppo glossy). Iterare costa tempo 
ma è più rapido che cercare su Unsplash per ore.

**Quando rinunciare a generare e usare Unsplash**: se dopo 5-7 generazioni 
non hai qualcosa di buono, vai su Unsplash con le keyword sopra. Una 
foto Unsplash sobria è meglio di un AI render scadente.

**Cosa evitare assolutamente**:
- Persone che sorridono al laptop (cliché stock corporate)
- Robot, neural network glow, "AI brain" (cliché AI hype)
- 3D render glossy/iperrealistici (cliché vendor pitch)
- Logo brand riconoscibili nello sfondo
- Stock photography troppo lucida (es. iStockphoto vibe)
- Testo nel render se DALL-E lo storpia (meglio ometterlo e aggiungerlo 
  in post)

**Cosa cercare**:
- Editorial illustration style (NYT, The Atlantic, Stratechery, 
  Casey Newton's Platformer)
- Minimalist data viz aesthetic
- Carta da disegno tecnica vintage rivisitata
- Mappe esplorative storiche stilizzate

---

## Piano implementazione

1. **Genera kicker image articolo (Prompt #1)** — la prima immagine da 
   avere prima della pubblicazione Medium EN. Tempo realistico: 30-60 minuti 
   inclusa iterazione.
2. **Genera cover Pro (Prompt #2)** — necessaria al setup Gumroad/LemonSqueezy. 
   Tempo: 30-45 minuti.
3. **Pubblica articolo + Pro con queste due immagini.** Vai live.
4. **(Opzionale, dopo 1-2 settimane di stats)** Se drop-off mid-article è 
   alto, aggiungi inline image (Prompt #3). Update silent dell'articolo 
   Medium.
5. **(Opzionale, fase 2)** Banner email (Prompt #4) quando setup email capture.

Total tempo immagini per il go-live: 1-2 ore. Non è un blocker se hai 
tempo limitato — articolo senza kicker comunque pubblicabile, ma il 
CTR ne soffre.

---

## Posizionamento esplicito nei file

In ogni file pubblicabile è già stato inserito un placeholder posizionale 
in cima. Quando hai l'immagine generata:

1. **Per articolo Medium**: caricala come "feature image" durante 
   l'editing su Medium (non incollarla come block image inline — Medium 
   ha un campo apposito per la kicker, e processa l'aspect ratio 
   correttamente solo da lì).

2. **Per Gumroad/LemonSqueezy**: caricala nel campo "cover image" del 
   prodotto durante creazione/edit. Sostituisce quella di default 
   generata dalla piattaforma.

3. **Per Gist (template gratuito)**: skip. Gist non rende immagini 
   inline in modo che valga il tempo. Se vuoi migliorare presentazione 
   del template gratuito, ospitalo invece su Google Doc pubblico o 
   Notion page con la cover image — ma questa è ottimizzazione fase 2.

I placeholder nei file sono:
- `01_articolo_medium.md`: `[KICKER IMAGE — see image prompt #1 in image bundle]`
- `05_articolo_medium_IT.md`: `[KICKER IMAGE — vedi prompt #1 nel bundle immagini]`

Rimuovi i placeholder dopo aver caricato l'immagine reale su Medium 
(Medium gestisce la kicker fuori dal corpo del testo).
