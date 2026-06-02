# Brand Voice — pushOut1777

> Documento di riferimento operativo. Coerenza cross-asset, EN e IT.
> Aggiornare quando emergono nuovi pattern consolidati post-2°/3° asset.

---

## Filosofia di base

Il brand pushOut1777 si rivolge a lettori adulti competenti che 
detestano hype, motivational content, vendor pitch travestiti da 
articoli. La voce comunica:

- Serietà senza pesantezza
- Onestà sui limiti
- Evidenza sostanziata
- Anti-hype come default
- Rispetto per il tempo del lettore

L'autore è un professionista esperto che ha imparato qualcosa duramente 
e lo condivide perché è utile, non perché vuole vendere o costruire 
audience. Se il lettore vuole il know-how, lo trova. Se non lo vuole, 
nessun problema.

---

## Tono di scrittura

### Cosa fa la voce

- Frasi brevi nelle parti narrative ("Last December I started a 
  project. Multi-platform. Fast-moving regulations.")
- Periodi più articolati nelle parti analitiche, ma sempre con 
  struttura logica chiara
- Ammissione di errori e fallimenti propri ("I caught myself doing 
  this three times")
- Numeri specifici sempre, mai vaghi
- Attribuzione esplicita dei range
- Sezione "anti-hype" come marker di credibilità

### Cosa NON fa la voce

- Non usa metafore corporate ("ecosystem", "synergy", "leverage" 
  come verbo)
- Non usa motivational platitudes ("believe in yourself", 
  "the journey")
- Non promette risultati specifici in tempi specifici 
  ("$10K in 30 giorni")
- Non parla di "best practices" senza disclaimer
- Non usa coach-speak ("limitless potential", "unlock your")
- Non chiude con call-to-action aggressive ("don't wait, start now")
- Non usa esclamativi nelle parti tecniche

---

## Sintassi tipica

### Apertura articoli (hook)

Sempre concreto, sempre specifico, sempre numerico se possibile.

✅ "I spent $60 on Perplexity Pro. Here's what 20 sessions taught me."
✅ "Six months ago I started a complex technical project."
❌ "AI is changing everything for content creators."
❌ "In today's fast-paced world..."

### Chiusura articoli

Restituire al lettore la responsabilità del giudizio. Mai chiusura 
sentimentale.

✅ "Use it. Adapt it. Improve it."
✅ "If you build a better workflow, I'd love to see it."
❌ "I hope this helps you on your journey!"
❌ "Stay tuned for more amazing content!"

### Sezioni anti-hype

Posizionate dopo le sezioni di positivo. Costituiscono marker di 
credibilità.

✅ "Quando questo metodo NON serve" / "When this method does NOT 
   serve you"
✅ Lista di scenari specifici dove il metodo fallisce
✅ Self-disclosure dei limiti del metodo

### Sezioni tecniche di configurazione

> Aggiunto in v1.1 dopo l'integrazione del setup API Perplexity.

Quando in un asset compaiono dettagli tecnici di configurazione 
(es. JSON request, parametri API, comando curl), valgono regole 
di tono specifiche:

- **Nessun marketing del tool**: documenta come si usa, non 
  perché è il migliore. Niente "the most advanced AI research 
  platform on the market". Solo "the API endpoint is X, the 
  preset is Y, here's the request body."
- **Disclaimer onesto sul costo**: ogni sezione tecnica con numeri 
  di costo deve avere un avviso esplicito sulla varianza e 
  sull'imprevedibilità. Pattern: "watch the dashboard", "API 
  bills per token and complex sessions can run higher than you 
  expect."
- **Permesso esplicito a sperimentare**: invitare il lettore a 
  variare la configurazione, non assolutizzare la propria. Pattern: 
  "I converged on these settings after experimentation, but 
  they're not the only valid configuration."
- **No screenshot UI a meno di necessità reale**: i numeri e il 
  JSON sono universali, gli screenshot dell'UI invecchiano in 
  3-6 mesi.

---

## Registro lessicale

### Parole preferite

- "workflow" (non "system" generico)
- "process" (non "method" se ambiguo)
- "documented" (non "proven")
- "specific" (non "actual")
- "trade-off" (non "balance")
- "marker" (per qualità segnaletica)
- "category-shifting" (per finding direzionali)
- "evidence-based" (non "data-driven" che è clichè)
- "preset" / "configuration" (per setup tecnici, non "settings 
  magic" o "secret sauce")

### Parole da evitare

- "best practices" (vago, hyped)
- "leverage" come verbo
- "unlock" (motivational)
- "actionable" (consulting cliché)
- "synergy" (corporate cliché)
- "game-changer" (hyped)
- "next-level" (hyped)
- "ultimate" (assolutivo)
- "guru", "expert", "master" (self-aggrandizing)
- "secret sauce" / "magic config" (per setup tecnici — 
  cliché vendor)

---

## Pattern strutturali ricorrenti

### Pattern Hook + Numero

Apertura: claim concreto con numero specifico.

```
Ho speso $X. Per avere lo stesso risultato avrei pagato $Y.
[paragrafo che giustifica $Y con calcolo]
```

### Pattern Problema → Anti-pattern → Soluzione

Espone problema concreto, lista 3 anti-pattern documentati con 
conseguenze, poi soluzione.

```
[Problema osservato]
Tre modalità di fallimento ricorrenti:
1. [Anti-pattern 1 con conseguenza]
2. [Anti-pattern 2 con conseguenza]  
3. [Anti-pattern 3 con conseguenza]
La soluzione: [pattern editoriale proposto]
```

### Pattern Numbers Table

Tabelle con metriche reali, non prosa generica.

```
| Metrica | Valore |
|---------|--------|
| Speso totale | ~$60 |
| Output | ~140.000 parole |
| ROI conservativo | $15.000 |
| ROI moderato | $30.000+ |
```

### Pattern Anti-hype Section

Sezione dedicata "Quando NON usare X" con scenari specifici.

```
## Quando questo metodo NON ti serve

Sezione anti-hype, importante.
Questo workflow è eccessivo per:
- [Scenario 1 specifico]
- [Scenario 2 specifico]
- [Scenario 3 specifico]
```

### Pattern Anti-hype Self-Selection (Pro Edition)

> Aggiunto in v1.1.

Per asset paywall con audience che potrebbe arrivarci da canali 
multipli (cross-promo, distribuzione stand-alone), inserire una 
sezione anti-hype DEDICATA in apertura, non solo distribuita. 
Lo scopo è permettere al lettore di auto-selezionarsi fuori prima 
di aver letto cose per cui non è pronto.

Pattern: "Questa Edizione Pro è eccessiva per: [5 categorie 
specifiche di lettore con motivazione concreta]. Se non sei in 
una di queste categorie, continua. Se lo sei, non spendere $9 — 
il template gratuito ti basta."

Funziona contro-intuitivamente: chi viene auto-selezionato fuori 
non era cliente. Chi resta è quello giusto. Refund rate cala, 
recensioni migliorano.

### Pattern Final Note Onesta

Chiusura che restituisce realismo al lettore.

```
Il metodo ha richiesto X mesi di trial and error per essere scoperto. 
L'articolo l'ho scritto in un pomeriggio. È anche una meta-lezione 
sulla ricerca: la scoperta è costosa, la spiegazione è economica, 
e una volta spiegata la scoperta è gratis.
```

### Pattern Configuration Reference

> Aggiunto in v1.1 per asset con setup tecnico (API, JSON, curl).

Per asset Pro con sezioni di configurazione tecnica:

```
## [Sezione configurazione]

[Runtime context — 1 paragrafo: "this is the API in preset X, 
not the consumer subscription Y"]

[Default request structure — JSON minimal]

[Per-parameter notes — bullet point per ogni parametro chiave 
con cosa fa, quando alzarlo/abbassarlo, impatto sul costo]

[Cost variance — 4-5 bullet con range reali, non punto singolo]

[Experimentation worth doing — invito esplicito a sperimentare 
con avviso sui costi]
```

Chiave: **mai presentare la propria configurazione come "ottimale" 
in assoluto**. Sempre come "quello che ho usato io, ecco perché, 
ecco cosa ti consiglio di provare a variare".

---

## Differenze tra EN e IT

### Versione inglese

- Frasi mediamente più brevi
- Più colloquiale ("here's what I learned", "you'll need to")
- Numeri in formato US ($15,000, 140,000)
- Tag e termini tecnici in inglese senza traduzione
- "Bullet points" frequenti per scannability
- Tono più diretto, meno mediato

### Versione italiana

- Frasi mediamente leggermente più articolate ma non barocche
- Più diretto del tipico italiano corporate ("ti dico", "fai questo")
- Numeri in formato europeo ($15.000, 140.000)
- Termini tecnici inglesi mantenuti se standard ("workflow", "framing", 
  "deployment", "slop", "preset", "endpoint", "reasoning effort")
- Termini italiani preferiti dove naturali ("modalità di fallimento", 
  "ricerca", "panorama")
- Bullet points OK ma meno densi che in EN
- Tono più "schietto da professionista italiano competente", 
  meno "American optimism"

### Cosa NON fare nelle versioni IT

- Tradurre "best practices" come "migliori pratiche" (suona artificiale, 
  meglio "pattern consolidati" o "pratiche stabilizzate")
- Tradurre "framework" come "quadro di riferimento" (mantieni "framework")
- Tradurre "workflow" come "flusso di lavoro" (mantieni "workflow")
- Tradurre "preset" come "preimpostazione" o "configurazione 
  preconfezionata" (mantieni "preset")
- Tradurre "endpoint" come "punto finale" (mantieni "endpoint")
- Tradurre "reasoning effort" come "sforzo di ragionamento" (mantieni 
  "reasoning effort" se contesto API, altrimenti "intensità del 
  reasoning")
- Calque sintattici dall'inglese ("non ho né l'uno né l'altro" è OK, 
  "io non li avevo entrambi" è calque)

### Workflow linguistico master/adattamento (v1.2)

**Realtà operativa**: l'autore è italiano nativo, NON fluente in 
inglese. Il master document è IT (lingua di pensiero e produzione). 
EN è adattamento di mercato per Medium internazionale, non traduzione 
meccanica né riscrittura parallela indipendente.

**Sequenza tipica**:

1. Brainstorming, struttura, prima stesura → IT (fluido, naturale)
2. Adattamento EN da master IT, con liberty di:
   - Riformulare frasi che in calque EN suonerebbero rigide
   - Usare costrutti EN-natural quando sono più diretti del calque 
     dall'IT-formale
   - Mantenere il significato e l'argomentazione, modulare la forma
3. Pubblicazione EN prima (scelta strategica di mercato Medium)
4. Pubblicazione IT dopo, eventualmente con micro-aggiustamenti 
   indipendenti di stile/linguaggio

**Regola backport (post-publish EN)**: quando IT viene rivisto dopo 
EN già pubblicato, distinguere caso per caso:

| Tipo di modifica IT | Backport a EN? |
|---|---|
| Fact-correction (numeri, dati, riferimenti) | ✅ Sempre giustificato |
| Chiarimento concettuale (passaggio confuso anche in EN) | ✅ Se il punto era confuso anche in EN |
| Preferenza stilistica IT (più formale, più articolato) | ❌ NO, se EN è già brand-voice-conforme |
| Riformulazione tecnica più precisa | ✅ Se la precisione manca anche in EN |

**Esempio concreto (asset 1, sessione 10 maggio 2026)**:

- Modifica IT su scalabilità del metodo: la versione IT nuova usava 
  formulazioni come "auditabilità", "discriminare tra output 
  affidabili e hallucinations". La versione EN attuale ("you couldn't 
  audit it", "the AI is bullshitting") è EN-natural e brand-voice-
  conforme. **NO backport** — la versione EN è migliore di quella 
  che sarebbe stata se tradotta dall'IT formale.
- Modifica IT sul top-up Perplexity API: $50 PER OGNI RICARICA 
  (non one-time), $40 residuo (non $10). **SÌ backport** — è 
  fact-correction, errore fattuale presente anche in EN.

**Implicazione operativa**: quando l'utente dice "ho rivisto IT, 
voglio allineare EN", NON applicare automaticamente. Diagnosticare 
il tipo di modifica, applicare la regola sopra, comunicare 
trasparentemente la decisione caso per caso.

---

## Pattern visivi

### Nei file Markdown

- H1 solo per titolo articolo
- H2 per sezioni principali
- H3 per sub-sezioni
- H4 raro, solo dove gerarchia è genuinamente profonda
- Tabelle preferibili a liste lunghe quando struttura è bidimensionale
- Code blocks per prompt example, JSON request, curl command — non per 
  "esempi di output stilizzati"

### Su Medium

- Kicker image pulita (Unsplash o generata, mai stock corporate)
- Sottotitolo specifico, mai generico
- Massimo 5 tag (Medium permette 5 max)
- Mix di tag high-volume (`Artificial Intelligence`, `Productivity`) 
  + tag niche (`Perplexity`, specifico)

### Su LinkedIn

Per pattern visivi minimali su qualsiasi post LinkedIn:
- Massimo 1 emoji nel titolo, mai più
- Bullet points OK
- Apertura conversazionale, non prescrittiva

Per regole complete sui post LinkedIn pushOut1777 di lancio asset, 
vedi la sezione dedicata "Comunicazione alla propria rete LinkedIn" 
qui sotto, che ha precedenza su queste indicazioni generiche.

---

## Comunicazione alla propria rete LinkedIn (v1.3)

**Contesto**: il pattern editoriale pushOut1777 v1.3 distingue 
promo invasiva su pubblico cold (Reddit/Twitter cross-post, gruppi 
vari — VIETATA) dalla comunicazione alla propria rete qualificata 
(LinkedIn personale, audience che ha scelto di seguirti — PERMESSA 
1 volta per asset). Questa sezione specifica come fare correttamente 
la seconda.

### Regole strutturali

- **Frequenza**: 1 post per asset, mai di più. No re-share dopo 
  qualche giorno, no "bump" del proprio post con commenti, no 
  carosello di update.
- **Lingua**: IT su rete IT. Workflow linguistico v1.2 (master IT, 
  adattamento EN) si applica anche qui — quindi il post LinkedIn è 
  scritto nativamente in IT, non tradotto dall'EN dell'articolo 
  Medium. EN solo se rete LinkedIn è internazionalizzata (per ora 
  non è il caso).
- **Timing**: pubblicare quando hai 30 minuti per leggere e 
  rispondere agli eventuali primi commenti nelle 2 ore successive. 
  Niente post-and-disappear.
- **Anti-pattern algoritmo**: NO trucco "link nel primo commento" 
  (Linkedin l'ha rilevato dal 2023, oggi è neutrale o negativo, ed 
  è contrario brand voice trasparente). Link Medium direttamente nel 
  corpo del post.

### Tono e linguaggio

- Anti-hype rigoroso: niente "spacca tutto", "il segreto", "rivoluzionario", 
  "incredibile", emoji rocket 🚀, fuochi d'artificio
- Tono "professionista che condivide qualcosa di utile alla propria 
  rete", non "creator che fa la promo"
- Numeri specifici sempre (~$60, 140K parole, 80 findings cat.5) — 
  stessi numeri dell'articolo Medium, consistency cross-canale
- Anti-claim economici "money-promise": niente "ho risparmiato 
  15.000€" come hook (anche se vero, attiva diffidenza). Preferire 
  competence-claim ("ho lavorato 6 mesi su questo workflow") o 
  method-claim ("ho costruito un workflow in 4 step")
- Onestà sui limiti: 1 frase che dichiari "questo metodo non funziona 
  per X" all'interno del post stesso (mini-anti-hype inline)

### Hashtag

- **Quantità**: 1-3 hashtag massimo, specifici
- **Evitare**: stuffing tipo #AI #Productivity #Innovation #Research 
  #Perplexity #PromptEngineering #IntelligenzaArtificiale (6+ hashtag 
  generici = signal "promotional content" all'algoritmo, performance 
  peggiore di 1-3 specifici)
- **Buoni esempi per asset Perplexity**: `#PerplexityAPI` 
  `#AIResearch`. Specifici, non saturati, target qualificato.

### Struttura tipo per asset di lancio

1. **Hook in 1 frase** (massimo 2 righe LinkedIn): 
   non money-claim, non hype. Esempio:
   *"Ho lavorato 6 mesi su come usare l'AI per fare ricerca 
   strategica seria invece di produrre slop confidente."*
2. **Contesto in 2-3 righe**: cosa hai fatto, perché era importante, 
   numeri-chiave 1-2.
3. **Cosa hai imparato in 3-5 righe**: il punto principale del 
   workflow, brevemente.
4. **Anti-hype inline (1 riga)**: quando il metodo NON serve. 
   Esempio:
   *"Per domande semplici o aree ben documentate questo workflow 
   è eccessivo — basta una query diretta."*
5. **Invito senza pressione**: 1 frase tipo *"Se ti interessa il 
   workflow completo l'ho scritto qui (in inglese, ma navigabile)"* 
   con link Medium nel corpo.
6. **Eventuale 1 frase di question genuina alla rete**: *"Curioso 
   di sapere come state auditando output AI nei vostri progetti, 
   se lo fate."*
7. **1-3 hashtag specifici alla fine**.

### Cosa NON includere

- Link Gumroad direttamente. Il Pro $9 va trovato attraverso 
  l'articolo Medium o il template Gist, non offerto in lancio LinkedIn 
  (sembra hard-sell)
- Promozione del template gratuito come amo separato dall'articolo
- Screenshot del prodotto Gumroad
- Call-to-action tipo "compra ora", "non perdere", "limited time"
- Self-deprecation che cerca pity ("non sono nessuno ma...")
- Boasting ("come ho fatto X migliaia di €") anche se vero

### Esempio applicabile asset 1 (Perplexity)

Bozza riferimento (non da copiare letteralmente, da adattare):

> Ho passato 6 mesi a capire come usare l'AI per fare ricerca 
> strategica seria — non per generare riassunti, ma per mappare 
> davvero territori tecnici complessi.
>
> Risultato: ~140.000 parole di mappatura strutturata su un dominio 
> nuovo, ~80 scoperte che hanno cambiato direzione al progetto, 
> circa $60 spesi.
>
> Il punto centrale che ho imparato: l'AI fa "slop" finché le chiedi 
> di confermare ipotesi. Quando le chiedi di mappare un territorio 
> in modo neutro, e quando audisci sistematicamente l'output, 
> funziona molto meglio. Ma serve disciplina.
>
> Non è una metodologia per chiunque: per domande semplici è 
> eccessiva, per domini ben documentati basta una query diretta. 
> Serve quando il territorio è complesso e l'errore costa caro.
>
> Ho scritto il workflow completo qui (in inglese, ma traducibile 
> con il browser): [link Medium]
>
> Curioso di sentire come gestite l'auditing degli output AI nei 
> vostri progetti.
>
> #PerplexityAPI #AIResearch

Note al modello sopra:
- Hook competence-claim, non money-claim
- Numeri specifici sostanziati
- Anti-hype inline (paragrafo "Non è una metodologia per chiunque")
- Invito senza pressione, in IT (rete IT)
- Question genuina alla rete (non rhetoric)
- 2 hashtag specifici, no stuffing
- Zero menzione Gumroad direttamente (chi clicca Medium trova tutto)
- Tono "professionista che condivide", non "creator che lancia"

---

## Quality gate brand voice (per ogni nuovo asset)

Prima di pubblicare:

- [ ] Apertura concreta e numerica (non generica)
- [ ] Almeno una sezione anti-hype "quando NON usare X"
- [ ] Per asset Pro: sezione anti-hype self-selection in apertura
- [ ] Almeno 3 anti-pattern documentati
- [ ] Numeri sostanziati con calcolo trasparente
- [ ] Chiusura onesta, non sentimentale
- [ ] Nessuna parola della lista "evitare" (best practices, leverage, 
      unlock, secret sauce, etc.)
- [ ] Coerenza tono tra parti narrative e analitiche
- [ ] Per asset con configurazione tecnica: pattern Configuration 
      Reference rispettato (no marketing del tool, disclaimer costo, 
      permesso a sperimentare)
- [ ] EN e IT entrambe verificate per stile naturale (non traduzione)

---

## Note di evoluzione

Brand voice consolidato dal primo asset (Perplexity research workflow). 
Da rivalutare dopo:

- 3° asset pubblicato (consolidamento pattern)
- Primo feedback significativo da audience
- Primo asset che fallisce (cosa imparare dal flop)
- Primo asset virale se accade (cosa amplificare)
