# Istruzioni Operative — Pubblicazione e Monetizzazione

> Guida step-by-step per pubblicare i 3 artefatti e impostare monetizzazione.
> Tempo totale stimato: 2-3 ore di lavoro tuo, una volta sola.

---

## Indice

1. Cosa hai a disposizione
2. Setup veloce (path raccomandato)
3. Setup completo (path massimizzazione)
4. Setup minimo (path "carico e basta")
5. Promozione minima necessaria
6. Tracking e iterazione
7. Alternative e combinazioni
8. Check finale prima di pubblicare
9. Cosa NON fare
10. Scenari post-pubblicazione

---

## 1. Cosa hai a disposizione

Tre file pubblicabili nella directory `/home/claude/sideproject/` (più i corrispettivi italiani 05/06/07 da pubblicare in seconda battuta):

- **`01_articolo_medium.md`** — articolo principale ~3500 parole, in inglese, pronto per Medium
- **`02_template_gratuito.md`** — template modulare gratuito da hostare come Gist o Google Doc pubblico
- **`03_template_pro.md`** — versione Pro extended ~5000 parole con case studies, troubleshooting, advanced patterns, da vendere su Gumroad/LemonSqueezy

Tutti e tre hanno placeholder `[link]` o `https://your-link-goes-here` che devi sostituire dopo aver creato i link finali.

I file riflettono il setup reale che hai usato: **Perplexity API in preset `advanced-deep-research`**, pagamento a token, top-up minimo $50. Non l'abbonamento consumer Pro $20/mese. Questo è chiarito nei file pubblicabili in modo onesto senza appesantire il pitch.

---

## 2. Setup veloce raccomandato (~2 ore tue)

Questo è il path che massimizza il rapporto valore/tempo per uno che dichiara "non voglio perdere tempo".

### Step 1 — Crea i 3 link target (30 minuti)

#### A. Account Gumroad per il template Pro
- Vai su gumroad.com
- Sign up (gratis, prende email + password)
- Verifica email
- "Create new product" → tipo "Digital download" → carica `03_template_pro.md`
- Titolo: "The Perplexity Pro Research Template — Pro Edition"
- Prezzo: **$9** (sweet spot psicologico per impulso, sotto i $10 funziona meglio di $7 o $12)
- Descrizione breve (3-4 frasi): vedi sotto sezione "Testi pre-scritti"
- Cover image: Gumroad ne genera una di default, va bene per ora — puoi sostituirla dopo
- Salva e pubblica
- Copia l'URL del prodotto (formato `https://gumroad.com/l/xxxxxx`)

#### B. GitHub Gist per il template gratuito
- Vai su gist.github.com (devi essere loggato in GitHub)
- "New gist" 
- Filename: `perplexity-research-template.md`
- Copia/incolla contenuto di `02_template_gratuito.md`
- Sostituisci `https://your-gumroad-link` con l'URL Gumroad creato sopra
- "Create public gist"
- Copia l'URL del gist

#### C. Account Medium se non ce l'hai
- medium.com → Sign up (gratis, può usare Google login)
- Per Medium Partner Program (per essere pagato): vai su Settings → Membership → Become a Medium member ($5/mese — paga indietro nel primo articolo che funziona) → Settings → Partner Program → Join
- Nota: nel 2024-2025 le regole sono cambiate, devi essere Medium Member per essere nel Partner Program. È costo necessario, $5/mese ammortizzato facilmente

### Step 2 — Pubblica articolo Medium (45 minuti)

- Apri `01_articolo_medium.md`
- Sostituisci `https://your-link-goes-here` con URL Gist (template gratuito)
- Sostituisci `https://your-gumroad-link` con URL Gumroad (template Pro)
- Su Medium: "Write a story"
- Copia/incolla l'intero articolo
- Medium converte automaticamente Markdown headers, bold, italic, link, tabelle
- Verifica visivamente che tutto si veda bene
- Aggiungi titolo + sottotitolo (Medium li chiede separatamente)
- **Tag**: aggiungi 5 tag (massimo permesso): `Artificial Intelligence`, `Perplexity`, `Productivity`, `Research`, `Writing`
- Aggiungi una "kicker image" in cima — Medium consiglia immagine, fa molta differenza. Vedi `image_prompts_bundle.md` per i prompt esatti che ho preparato
- Click "Publish" → Medium chiede tag finali e collection (puoi saltare collection)
- Pubblica

### Step 3 — Verifica e cross-link (15 minuti)

- Copia URL Medium articolo pubblicato
- Torna sul Gumroad → modifica descrizione del prodotto → aggiungi link all'articolo Medium come riferimento
- Torna sul Gist → aggiungi link articolo Medium in fondo
- Tre punti collegati: Medium → Gist (gratis) → Gumroad (Pro)

### Step 4 — Promozione minima (30 minuti, opzionale)

Vedi sezione 5 sotto. Se davvero vuoi minimizzare, salta questo step.

**Totale: ~2 ore. Pubblicato e monetizzato. Da qui in poi è automatico.**

---

## 3. Setup completo (~3-4 ore)

Se vuoi massimizzare il return, aggiungi questi step extra al setup veloce:

### Email capture

- Setup ConvertKit free tier (1.000 subscriber gratis) o Substack
- Aggiungi un form "Get future updates" sia nel Gist sia nel Gumroad description
- Collega: chi compra il Pro entra in lista automaticamente
- Email automation: 1 email di benvenuto + 1 email a 7 giorni con bonus content (puoi creare un bonus mini-cookbook di 1000 parole una volta sola)

Costo: 0$. Tempo: 1 ora setup.

Beneficio: lista email cresce passivamente. Quando avrai un altro template/prodotto/articolo, hai un'audience pronta.

### Twitter/X thread di lancio

- Riassumi i 6 principi epistemologici dell'articolo in un thread di 8-12 tweet
- Linka l'articolo Medium nell'ultimo tweet
- Pubblicato e basta — non devi rispondere a tutto, lascia che funzioni

Tempo: 30 minuti.

### LinkedIn cross-post

- Copia/adatta articolo Medium in formato LinkedIn (adatto: ~2000 parole, più punctuated, headers chiari)
- Linka al Medium originale come "full version" 
- LinkedIn algoritmo premia contenuto tecnico/business

Tempo: 30 minuti.

### Hacker News / Indie Hackers / Reddit submission

- Submit articolo su Hacker News (news.ycombinator.com → submit)
- Submit su Indie Hackers (indiehackers.com → community)
- Submit su Reddit r/PromptEngineering, r/perplexity, r/writing, r/ChatGPTPro
- Solo submit + titolo accattivante. NO promozione aggressiva, regole community sono severe

Tempo: 20 minuti.

---

## 4. Setup minimo "carico e basta" (~45 minuti)

Se vuoi davvero il minimo:

1. Crea Gumroad account, pubblica template Pro a $9 (15 min)
2. Crea Gist con template gratuito che linka al Gumroad (10 min)
3. Pubblica articolo Medium che linka entrambi (20 min)

Skip: tag ottimali, kicker image, promozione, thread, LinkedIn.

Risultato atteso: traffico organico Medium SEO. Probabile $0-50 nei primi mesi. Ma l'asset è online e gira.

Se mai un articolo simile diventa viral su Medium, l'asset esiste già e capitalizza.

---

## 5. Promozione minima necessaria

Se hai detto "il minimo indispensabile o automatizzando tutto il possibile", queste sono le 3 cose che valgono il tempo:

### A. Tag Medium ottimali
Già nelle istruzioni. Tag sbagliati = articolo invisibile. Tag giusti = articolo trovato in 6-12 mesi via search SEO.

### B. Sottotitolo killer
Ho già scritto un sottotitolo nell'articolo, ma puoi A/B testare. Medium permette di modificare titolo dopo pubblicazione senza perdere stats.

Sottotitolo attuale: *"A 4-step research workflow I built across 20 deep-dives — and what I learned about getting AI to actually do research instead of producing slop."*

Alternative da provare se prima versione non performa:
- *"The 4-step workflow that turned $60 of Perplexity Pro into research worth $15,000+"*
- *"Why most people use AI research tools wrong — and the 4-step fix"*
- *"6 months, 20 sessions, $60. Here's what I learned about doing serious research with AI."*

### C. Una sola pubblicazione su community attiva
Scegli UNA tra Hacker News, Indie Hackers, Reddit r/PromptEngineering. Submit l'articolo. Aspetta. Se non viene upvoted nelle prime ore, lascia perdere e non insistere.

Se viene upvoted: traffico significativo per 1-3 giorni. Conversioni Gumroad probabili.

---

## 6. Tracking e iterazione

### Cosa controllare ogni 1-2 settimane (5 min)

- Medium stats: views, reads, claps, conversion rate (se sei in Partner Program)
- Gumroad sales: numero conversioni, source (se Gumroad fornisce attribuzione)
- Gist traffic: GitHub fornisce stats di view limitate

### Quando aggiornare

- **Dopo 3 mesi**: rileggi articolo. Aggiorna esempi, dati, pricing se cambiati. Aggiungi nota "Updated [date]".
- **Dopo 6 mesi**: se Pro template ha venduto >20 copie, considera v2.0 con nuovi case studies. Vendi v2.0 a clienti vecchi a sconto, agli altri prezzo pieno.
- **Dopo 12 mesi**: rivaluta se mantenere il prodotto. Se ha generato <$200 totali, è dead. Se ha generato $500+, è asset evergreen.

### Iterazione minima necessaria

Niente. Davvero. Pubblica e basta. Se funziona, l'asset matura da solo. Se non funziona, non c'è iterazione che lo salvi.

L'unica eccezione: se nei primi 7 giorni vedi 0 conversioni Gumroad nonostante traffico Medium decente, prova a ridurre prezzo Pro a $7 e vedi se cambia. Se ancora 0, il problema è il template, non il prezzo.

---

## 7. Alternative e combinazioni

### Alternativa 1: Substack invece di Medium

Vantaggi Substack:
- Tu possiedi l'audience (email diretta)
- Niente fee Partner Program
- Built-in paywall (puoi mettere parte dell'articolo dietro $5/mese)

Svantaggi Substack:
- Devi costruire audience da zero
- SEO peggiore di Medium per ricerche tipo "perplexity research workflow"

Verdetto: Medium meglio per articolo singolo che vuole essere trovato. Substack meglio se hai già lista email o vuoi costruire serie di articoli regolari.

### Alternativa 2: LemonSqueezy invece di Gumroad

Vantaggi LemonSqueezy:
- Gestione tasse EU automatica (Merchant of Record)
- Fee leggermente più bassa per volume basso
- Interfaccia più moderna

Svantaggi LemonSqueezy:
- Account approval prende 2-3 giorni
- Audience meno familiare con il brand

Verdetto: Gumroad meglio per setup veloce. LemonSqueezy meglio se sei in EU e vuoi compliance VAT automatica (per te che sei italiano, LemonSqueezy potrebbe essere preferibile per evitare grane fiscali con vendite digitali EU sotto soglia OSS).

**Nota fiscale Italia**: vendite digitali sotto €10K/anno cross-border = IVA italiana, sopra = OSS. Se sei in regime forfettario, attento: vendite digitali a privati EU potrebbero entrare in calcolo coefficiente. Consulta commercialista se le vendite Gumroad/LemonSqueezy superano qualche centinaio di euro.

### Alternativa 3: Paywalled article + free template

Inverti la logica: articolo Medium dietro paywall (Members-only), template gratuito.

Vantaggi:
- Medium Member-only earnings sono molto più alti dei free article (per ogni "read" da un membro paghi $0.10-0.50, vs $0 per non-membri)
- Template gratuito massimizza distribuzione

Svantaggi:
- Paywall riduce reach iniziale
- Non puoi promuovere articolo a non-membri (vedono solo paywall)

Verdetto: dipende da goal. Se vuoi pagamenti Medium massimi, Members-only. Se vuoi reach massima e conversion Gumroad, free article + paid template.

**Raccomandazione**: free article. La conversione Medium → Gumroad è il moltiplicatore di valore principale. Se l'articolo è dietro paywall, hai chiuso il funnel.

### Combinazione vincente per il tuo caso

Dato il tuo profilo (non vuoi pubblicità attiva, vuoi automatizzare al massimo):

1. **Medium articolo gratuito** (massima discovery via SEO)
2. **GitHub Gist template gratuito** (zero attriti)
3. **LemonSqueezy template Pro $9** (compliance VAT EU automatica, no headache fiscali)
4. **Email capture passiva** via ConvertKit free (un'unica volta, 1 ora setup)

Niente Twitter, niente LinkedIn, niente community submission ricorrente. L'asset si autopromuove via Medium SEO. Tu controlli stats una volta al mese, max.

**Realistic earning expectation in questo setup**: $50-300 nei primi 6 mesi. Probabilmente $100-200. Non ti cambia la vita. Ti dà:
- Asset evergreen che se mai ti serve riferenza pubblica del metodo, hai
- Validazione tecniche prima di scrivere il libro
- Eventuale audience email piccola (50-200 persone) che cresce nel tempo

---

## 8. Check finale prima di pubblicare

- [ ] Tutti e tre i file letti e verificati
- [ ] Placeholder link sostituiti con URL reali
- [ ] Niente menzione di specifiche identificative — settore, stack tecnologico, nomi di progetto, ruolo professionale specifico — in nessuno dei file pubblicabili
- [ ] Domain di esempio nei file mantenuto neutro (fintech, biotech, climate-tech) e descrizioni del progetto interno camuffate come "regulated industry vertical", "AI production patterns", "niche technical territory"
- [ ] I numeri sono coerenti tra tutti i file (~$60, ~140K parole, ~330 H2, ~1100 H3, 80 cat-5, 350 cat-4, 96-97% coverage)
- [ ] Tag Medium scelti: AI, Perplexity, Productivity, Research, Writing
- [ ] Pricing Gumroad/LemonSqueezy fissato: $9
- [ ] Cross-link Medium → Gist → Pro funzionanti
- [ ] Riferimento al setup tecnico (Perplexity API, preset `advanced-deep-research`) coerente in articolo, template gratuito (modulo "API request reference") e Pro (PARTE 4)
- [ ] Numeri della richiesta JSON identici nei tre file (max_output_tokens 128000, reasoning effort high, web_search + fetch_url)

Quando tutti i checkbox sono spuntati, pubblica. Punto.

---

## 9. Cosa NON fare

- Non rispondere a ogni commento Medium. Lascia che la community si auto-modere.
- Non aggiungere altri tag oltre i 5 di Medium. Il sistema penalizza tag spam.
- Non spammare il link in altre community oltre l'unica submission iniziale.
- Non aggiornare l'articolo nelle prime 2 settimane. Lascia che le stats si stabilizzino.
- Non fare promo paid (Medium Promote, FB Ads). Per un side project a $9 non ha ROI.
- Non scrivere sequel articoli prima di aver verificato che il primo performa. Aspetta 4-6 settimane.
- Non rivelare dettagli sul progetto principale (settore, stack, nomi) nei commenti, nei DM o nelle interviste, anche se richiesto. La narrativa pubblica è "applicato a un progetto editoriale tecnico complesso". Punto.

---

## 10. Scenari post-pubblicazione

Cose che probabilmente succederanno nei primi 60-180 giorni dopo pubblicazione, e come gestirle senza farti perdere tempo o esporti più del dovuto.

### A. Qualcuno commenta su Medium chiedendo "che progetto stavi mappando?"

Risposta tipo, gentile e ferma:
> *"Thanks for reading. The specifics of the project are private for now — I'll publish more about it when it's ready. The workflow itself is independent of the domain, which is part of what makes it useful: you can apply the same 4-step pattern to your own area whether that's fintech, biotech, or anything else."*

Non rispondere mai con dettagli parziali sperando di "soddisfare" la curiosità. Apri un loop e poi devi gestirlo. Una risposta secca, gentile, definitiva chiude la conversazione meglio.

### B. Newsletter / podcast / blog tecnico ti contatta per intervista o feature

Decisione binaria:
- **Se la fonte ha audience >5K iscritti e profilo serio**: rispondi sì. Concorda formato (audio breve, scambio email, articolo invitato). Tieniti sul workflow, non sul progetto. Linka Medium + Gumroad nelle bio.
- **Se la fonte è piccola o ambigua**: rispondi sì comunque, costo basso. Stessa regola: workflow sì, progetto no.
- **Se la fonte chiede esplicitamente dettagli sul progetto**: rispondi che il progetto è privato e che l'intervista ha senso solo se il focus è il workflow. Se rifiutano, lascia perdere.

Non improvvisare risposte tecniche su Perplexity API in interviste audio in tempo reale. Se ti chiedono dettagli tecnici, rimanda al template Pro che ha già tutto strutturato. "It's all in the Pro Edition, link in the description" è risposta valida e azzera la pressione di performance verbale.

### C. Perplexity cambia pricing, preset, o policy API

Possibili scenari, già annotati per non farsi prendere alla sprovvista:

- **Preset rinominato o deprecato**: aggiorna i 3 file pubblicabili (articolo, template gratuito, Pro) con il nuovo nome del preset, aggiungi una nota di edit in fondo ("Updated [data]: preset renamed from advanced-deep-research to [new]"). Tempo: 20 minuti.
- **Pricing cambia significativamente**: se i $3 medi a sessione diventano $6+, aggiorna la tabella nei file e la sezione "Cost variance" del Pro. Aggiungi nota di edit.
- **Funzionalità rimossa (es. fetch_url disabilitato)**: aggiorna il troubleshooting Pro (Failure mode 7 e Pattern D), aggiungi una sezione "If your runtime no longer supports X" con workaround.
- **Perplexity introduce competitor preset migliore**: tentativo da non fare → riscrivere tutto. Mossa giusta → pubblicare un articolo follow-up "Updated workflow: [new preset] vs advanced-deep-research" che linka al primo articolo. Crea nuovo asset, non distrugge il vecchio.

In tutti i casi, **aggiorna i file con datestamp visibile** ("Last updated: [date]") in cima. I lettori che capitano sull'asset 12 mesi dopo apprezzano sapere quando l'info è fresca.

### D. Qualcuno chiede una consulenza pagata sul metodo

Tre possibili vie:
- **No grazie, declinare gentilmente**: "Thanks but I don't take consulting work right now. The Pro Edition has everything I would tell you in a 1:1 — at $9 it's the most cost-efficient way to get the method." Risposta corretta se non vuoi gestire gli incarichi.
- **Sì ma a tariffa di gate**: "Consulting at $300/hour, 2-hour minimum. Most people find the $9 Pro Edition is enough — happy to recommend that first." Risposta corretta se vuoi monetizzare ma scoraggiare i casuali.
- **Sì a forfait su scope ridotto**: "I can do a 60-minute call to review your specific research project and audit your prompts, $200 flat. Beyond that, the Pro Edition." Risposta corretta se vuoi una piccola entrata extra senza impegno strutturale.

Default: prima opzione (declina gentile). Le consulenze 1:1 sono incompatibili con un side project che vuole essere automatizzato.

### E. Qualcuno copia l'articolo o il template e lo ripubblica come proprio

Tre livelli di gravità:
- **Cita la fonte ma cambia titolo/struttura**: ignorabile. È fair use rimaneggiato, succede sempre, fa anche un po' di link discovery.
- **Copia integrale senza citazione**: se è su Medium o piattaforma con DMCA chiaro, fai DMCA takedown (10 minuti). Se è su un blog oscuro, ignora — non vale il tempo.
- **Vende il template Pro come proprio su Gumroad/LemonSqueezy**: DMCA takedown su quella piattaforma. Le piattaforme di selling rispondono rapidamente perché hanno responsabilità legale.

Non scatenare guerre online. La regola: takedown rapido se serve, niente public callout. Public callout costa più tempo e energia di quanto ne valga.

### F. Articolo non sta performando e tu sei tentato di fare grosse modifiche

Resisti per le prime 6 settimane. Medium SEO matura lentamente. Gli articoli che esplodono dopo 4-8 mesi sono comuni. Se a 8 settimane hai meno di 200 views totali, allora:

1. Verifica tag (a volte Medium li cambia silenziosamente)
2. Cambia sottotitolo (vedi alternative in sezione 5B)
3. Aggiungi una "kicker image" se non ce l'aveva
4. Posta una volta su una community rilevante che non hai ancora toccato

Niente di più finora. Solo dopo 4 mesi senza segnali, valuta una v2 più aggressiva del titolo o del posizionamento.

### G. Il Pro vende ma le persone chiedono refund "non è quello che mi aspettavo"

Refund-rate atteso su Gumroad/LemonSqueezy per prodotti $9 di tipo info: 2-5%. Se sei sopra il 10% c'è un mismatch tra promessa e contenuto.

Cosa fare:
- Rileggi la descrizione di vendita del Pro. Promette qualcosa che non c'è? Riformula.
- Aggiungi nella descrizione una sezione "What this Pro Edition does NOT do" mirroring la sezione "When this Pro Edition does NOT serve you" già presente nel file. Filtra a monte chi non è il target.
- Se il problema persiste, considera: prezzo più basso ($5-7) o aggiunta di contenuto bonus (cookbook breve di 1500-2000 parole su un caso d'uso specifico).

Non litigare mai con chi chiede refund. Concedi e impara dal feedback.

---

## Testi pre-scritti utili

### Descrizione Gumroad/LemonSqueezy (3-4 frasi)

> *"The complete Perplexity Pro research workflow with three fully worked case studies, troubleshooting guide, advanced patterns, cost optimization, and full API configuration reference. Built from 20 deep research sessions across 6 months using the `advanced-deep-research` preset. Companion to the Medium article. One-time purchase, free updates. Includes anti-hype gate so you can self-select out before buying — this isn't for everyone."*

### Email auto-confirma Gumroad (se setti)

> *"Thank you for purchasing the Pro Edition. Inside you'll find three case studies, a troubleshooting guide for prompts that go sideways, advanced patterns for multi-session research, cost optimization notes, and the full API configuration reference. Skip to Part 1 if you want to see the workflow in action; skip to Part 4 if you want the technical setup; skip to Part 7 if you've already read the article and want the synthesis. — [your name]"*

### Tweet di lancio (se decidi di farlo)

> *"I spent $60 on Perplexity Pro for 20 research sessions over 6 months — using the advanced-deep-research API preset, not the consumer subscription. Output equivalent in consultant hours: $15,000-$30,000. Wrote up the 4-step workflow + 6 epistemological principles. Free article + free template + Pro Edition. Link below. 🧵"*

---

## Domande frequenti che potresti avere

**"Devo davvero leggere l'articolo prima di pubblicarlo?"**
Sì. È in inglese, è lungo, magari hai opinioni su sezioni specifiche. Trova 30 minuti.

**"Posso modificare il tono se sento che non è il mio?"**
Ovviamente sì. Ma il tono attuale è calibrato per audience indie creator/scrittori tecnici: serio, evidence-based, anti-hype, qualche battuta. Cambialo solo se hai motivo specifico.

**"Cosa faccio se l'articolo non viene letto?"**
Niente per 6 settimane. Aspetti. Medium SEO maturity richiede 3-6 mesi. Se dopo 6 mesi <500 views totali, l'articolo è morto, accetta e impara per il prossimo. Vedi anche scenario F sopra.

**"Cosa faccio se vende troppo bene il Pro?"**
Problema bello da avere. Considera: aumentare prezzo a $14-19 (mantieni first 100 buyers a $9 come early access), oppure produrre v2.0 con più contenuto.

**"Cosa faccio se qualcuno copia il template e lo ripubblica gratis?"**
Vedi scenario E sopra. In sintesi: takedown rapido se serve, niente guerra pubblica.

**"Cosa rispondo se mi chiedono dettagli sul progetto reale?"**
Vedi scenario A sopra. Risposta secca, gentile, definitiva. Mai dettagli parziali.

**"Devo aggiornare i file ogni volta che Perplexity cambia qualcosa?"**
Solo se cambia in modo che impatta materialmente i numeri o il workflow. Vedi scenario C sopra.

---

*Buon lancio.*

---

*Note interne (non pubbliche):*

*Approccio anonimizzazione: i file pubblicabili (01, 02, 03, 05, 06, 07) sono al massimo livello di pulizia, zero leak intenzionali. I file di setup e operativi (04, 08, file di project setup) sono puliti ma con tolleranza per leak studiati a tavolino, mai accidentali. Se in futuro, dopo la pubblicazione del progetto principale, vorrà valutare easter egg crittografati per fan affezionati che possano fare il collegamento, vedi la nota in `02_memoria_iniziale.md` sezione "On the horizon".*
