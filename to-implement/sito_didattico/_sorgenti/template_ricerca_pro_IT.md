# Il Template Perplexity Pro per la Ricerca — Edizione Pro

> **Workflow completo + 3 casi di studio elaborati + guida al troubleshooting + pattern avanzati + riferimento configurazione API.**
> 
> Companion al template gratuito e all'articolo Medium. Questo è il sistema completo.

---

## Cosa trovi in questa Edizione Pro

Il template gratuito ti dà i moduli e la checklist di audit. Questa Edizione Pro aggiunge:

1. **Tre casi di studio completamente elaborati** — tre sessioni di ricerca complete su domini diversi, con i prompt reali che ho usato, la struttura di output risultante, e le note di audit che ho fatto
2. **Guida al troubleshooting** — modalità di fallimento comuni quando i prompt vanno storti, e come recuperare
3. **Pattern avanzati** — costruzione di un knowledge graph multi-sessione, sintesi cross-research, e la "disciplina anti-derubricazione" con tre esempi reali in cui mi sono beccato a farla
4. **Ottimizzazione costi** — come spendere meno ottenendo di più
5. **Note di adattamento** — applicare il workflow a progetti di scala diversa (due-diligence di founder, investigazione giornalistica, scrittura di libri tecnici, analisi di mercato)
6. **Riferimento configurazione API** — il setup esatto della Perplexity API che ho usato (preset `advanced-deep-research`, struttura della richiesta, pattern di follow-up per concatenare con LLM successive)
7. **Quando questa Edizione Pro NON ti serve** — gate anti-hype così sai se continuare a leggere o chiudere la scheda

---

## Quando questa Edizione Pro NON ti serve

Sezione anti-hype, in apertura così puoi auto-selezionarti fuori prima di averla letta.

Questa Edizione Pro è eccessiva per:

- **Persone che non hanno ancora colpito le modalità di fallimento descritte nell'articolo.** Se non hai mai lanciato un progetto di ricerca multi-sessione su un dominio che ti importa, i casi di studio e la guida al troubleshooting ti sembreranno astratti. Compra questo dopo aver bruciato $20-30 di credito API per conto tuo e aver sentito il dolore. I pattern allora atterreranno.
- **Persone che vogliono una risposta copia-incollabile a una specifica domanda di ricerca.** L'Edizione Pro ti insegna a pescare in acque sconosciute. Non ti consegna i pesci.
- **Persone per cui $9 rappresentano attrito.** Il template gratuito ha l'80% di quello che ti serve per iniziare. Il valore marginale di questa Edizione Pro è reale ma non life-changing — ti accorcia la curva di apprendimento di forse 4-6 settimane di trial and error. Se non hai fretta o il tuo progetto non giustifica quella compressione, il template gratuito basta.
- **Persone che cercano confronti tra tool o stanno valutando quale prodotto AI di ricerca comprare.** Questo documento è opinionato sul preset Perplexity `advanced-deep-research` perché è quello che ho usato. Non fa benchmark contro Claude, Gemini, ChatGPT Deep Research, o altri. Aggiornamenti futuri potrebbero aggiungere confronti; la v1.0 no.
- **Persone che ricercano domini con documentazione pubblica abbondante e attuale.** Se il tuo dominio ha buoni libri, survey peer-reviewed correnti, o wiki attive ben mantenute, non ti serve un workflow di ricerca AI — ti serve una reading list.

Questa Edizione Pro è per: persone che lavorano a un progetto multi-mese in cui il territorio conta più di qualsiasi singola risposta, che hanno già iniziato a usare tool di ricerca AI e hanno riconosciuto che la qualità dell'output è instabile, e che vogliono un workflow disciplinato riusabile su più sessioni e più domini.

Se sei tu, continua. Se no, tieniti i $9 e leggi l'articolo gratuito e il template — sono sufficienti.

---

# PARTE 1 — Tre casi di studio elaborati

Questi sono anonimizzati e adattati da ricerche reali fatte su un progetto di sei mesi. Ho cambiato le specifiche di dominio dove serviva per tenere privato il mio progetto, ma il workflow e i pattern di output sono esattamente come sono successi.

## Caso di studio 1 — Mappare un settore verticale regolato

### Obiettivo
Mappare il panorama regolatorio + economico + tecnico di un settore verticale regolato in rapida evoluzione, dove stavo valutando il lancio di un prodotto.

### Sessione 1 — Prima passata esplorativa

Prompt completo (puoi adattarlo a qualsiasi dominio regolato):

```
Mi serve una ricerca esplorativa neutra di mapping sull'infrastruttura 
[VERTICALE REGOLATO] 2024-2026.

Contesto: sto valutando la fattibilità di un prodotto in [VERTICALE] 
da prospettiva di founder con piccolo team. NON sto chiedendo quali 
provider usare — voglio il panorama regolatorio + economico + tecnico.

Copri le seguenti macro-aree con profondità di mapping:

1. PATTERN ARCHITETTURALI — sotto-aspetti: stack dominanti, alternative 
   emergenti, split build-vs-buy, tier di complessità operativa
2. PROVIDER E PIATTAFORME — sotto-aspetti: white-label managed, custom 
   build, ibrido, copertura geografica, modelli di pricing
3. IDENTITY LAYER CROSS-PRODOTTO — sotto-aspetti: identità cross-vendor, 
   wallet/account abstraction, requisiti regolatori sull'identità
4. FLUSSI DI PAGAMENTO — sotto-aspetti: provider alternativi, fee, frodi, 
   chargeback, timing di settlement
5. FRAUD PREVENTION — sotto-aspetti: vendor di tooling, ML vs rule-based, 
   pattern di integrazione, tassi di frode per verticale
6. COMPLIANCE MULTI-GIURISDIZIONE — sotto-aspetti: specifiche UE/US/UK/APAC, 
   tier PCI/SAQ, gestione fiscale
7. MARKETING E LIFECYCLE — sotto-aspetti: costi di acquisizione, curve di 
   retention, vincoli regolatori sul marketing
8. PATTERN DI RISPOSTA DELLE PIATTAFORME — sotto-aspetti: come hanno 
   reagito le piattaforme dominanti agli shift regolatori post-2024
9. PATTERN DI ESPERIENZA UTENTE — sotto-aspetti: pattern UX documentati, 
   letteratura A/B testing
10. RISCHI E DOWNSIDE — sotto-aspetti: vendor lock-in, rischio pivot 
    regolatorio, consolidamento di mercato
11. CASI DI STUDIO AZIENDALI — esempi nominati con dati di fatturato, 
    percentuali, date
12. PATTERN EMERGENTI NON RICHIESTI — fai emergere cose che non ho chiesto

Per ogni affermazione cita fonti primarie con link, autore/organizzazione, 
data. Accettabili: docs ufficiali, filing regolatori, industry report 
nominati con publisher+data, talk di conferenze nominati con anno, 
blog post nominati con autore+data. NON accettabili: vago "industry 
report indicano" o quote di esperti non nominati.

Per ogni macro-area in cui i dati pubblici sono limitati, dichiaralo 
esplicitamente invece di riempire con speculazione.
```

### Cosa è tornato

- ~44.000 caratteri
- 14 cluster H2
- 61 sotto-argomenti H3
- ~50 fonti primarie verificabili
- 5 finding marcati come Categoria 5 (direzionali)
- ~30 finding Categoria 4 (sostanziali)

### Note di audit (dopo la sessione)

**Densità**: ✅ sopra le soglie
**Spot-check citazioni**: 8/10 link verificati funzionanti, 2 redirect a versioni archiviate — accettabile
**Disclaimer**: 4 sezioni marcate "dati limitati" — sano
**Finding Categoria 5 inclusi**:
- Un dato di fatturato di un provider specifico che contraddiceva le assunzioni generali del settore
- Una deadline regolatoria che non conoscevo e che impattava il mio timeline
- Un pattern di vendor lock-in documentato che ha cambiato il mio framing buy-vs-build
- Una struttura di accordo commerciale specifica che non avevo mai visto documentata
- Un trend emergente esplicitamente flaggato nella sezione "Pattern Emergenti" che è diventato un tema maggiore

### Buchi identificati
- Categoria A (serve follow-up): 2 — dettaglio pricing di provider specifico, area regolatoria di nicchia
- Categoria B (si chiude lavorando): 6
- Categoria C (non si chiude): 2

### Sessione di chiusura
Lanciata una sessione mirata da $4 sui soli buchi Categoria A. Output molto più stretto (~15.000 caratteri, 4 H2) ma ha indirizzato esattamente quello che mancava.

### Costo totale per questo dominio
$8 su due sessioni, ~3,5 ore del mio tempo incluso l'audit.

### Cosa avrei speso senza questo metodo
Stimando il tempo consulenziale a $300/ora per un mapping equivalente: circa 25-40 ore = $7.500-12.000 solo per questo singolo verticale.

---

## Caso di studio 2 — Mappare pattern di produzione AI

### Obiettivo
Mappare come l'AI viene davvero usata in produzione da operatori seri nel mio settore, separando hype da pratica documentata.

### Perché era complicato

L'AI è l'argomento più sovra-hyped del 2024-2026. Le ricerche generiche restituiscono slop. I blog post dei vendor sono vendita travestita. I thread Twitter sono teatro. La parte difficile non era trovare informazione — era filtrare segnale dal rumore.

### Strategia di prompt

Due aggiustamenti chiave al template standard:

1. **Ho chiesto esplicitamente deployment di produzione documentati** con progetti nominati e date di pubblicazione, non "case study" (che spesso sono marketing travestito da ricerca)
2. **Ho chiesto al modello di distinguere "deployato in produzione" da "research preview" da "demo del vendor"** per ogni claim

### Prompt risultante (estratto chiave)

```
Per ogni claim di deployment AI, etichettalo esplicitamente come:
- DEPLOYATO IN PRODUZIONE (shippato a utenti con progetto nominato + 
  operatore nominato + data di deployment verificabile)
- PROTOTIPO/RESEARCH-PREVIEW (dimostrazione tecnica, non disponibile 
  generalmente)
- DEMO DEL VENDOR (claimato dal vendor senza verifica indipendente di 
  terza parte)

Voglio esempi DEPLOYATI IN PRODUZIONE. Le altre categorie sono contesto 
informativo ma non sono il target primario di mapping.
```

### Cosa ho imparato

Questa singola struttura di prompt ha cambiato drasticamente l'output:
- Il 60% dei "casi d'uso AI" che il modello avrebbe restituito con un prompt generico è collassato in categorie "demo del vendor" o "research preview"
- Gli esempi davvero deployati in produzione erano di gran lunga meno di quanto la copertura del settore suggerirebbe
- Il finding più chiaro: il pattern dominante di successo era **"AI invisibile lato produzione"** — AI usata in workflow/tooling, non in feature rivolte all'utente

Questo è stato un finding Categoria 5 che ha cambiato completamente il framing strategico del progetto.

### Statistiche output
- ~42.000 caratteri
- 16 cluster H2
- 54 sotto-argomenti H3
- 7 finding Categoria 5
- ~40 finding Categoria 4

### Cosa sarebbe costato come ricerca commissionata
Una società di research di settore indipendente seria chiederebbe $5.000-15.000 per questo tipo di mapping su misura. Ho pagato $4.

---

## Caso di studio 3 — Mappare un territorio tecnico di nicchia

### Obiettivo
Mappare un territorio tecnico di nicchia dove la documentazione pubblica era nota essere sparsa — per capire esattamente *quanto* sparsa e dove.

### Perché è interessante

È il caso in cui i limiti del mio metodo sono diventati visibili — e in cui l'*onestà* dell'output è diventata la feature più preziosa.

### Aggiustamenti

Per territori a documentazione sparsa, due cambiamenti:

1. **Abbassa la soglia di densità** — accetta che potresti ottenere 25-30K caratteri di output invece di 45-50K
2. **Aumenta l'enfasi sui disclaimer** — invita esplicitamente il modello a dichiarare limitazioni estese, dato che l'obiettivo è mappare la struttura noto/non-noto del territorio

### Istruzione chiave del prompt

```
Questo dominio è noto avere documentazione pubblica limitata. Il tuo 
output dovrebbe mappare esplicitamente sia:
(a) cosa È documentato con fonti primarie
(b) cosa NON è documentato o documentato solo parzialmente

Per (b), descrivi la forma del buco: è "documentato in campi adiacenti, 
trasferibile", "molto recente e non ancora stabilizzato", "closed-source/
proprietario", o "genuinamente non mappato"?

Il mapping verificabile delle incognite è più prezioso della copertura 
fabbricata di incognite note.
```

### Cosa è tornato

Il modello ha prodotto ~58K caratteri (più di quanto mi aspettassi per un territorio sparso) ma con **disclaimer espliciti in 8 sotto-aree** — molti più degli altri casi di studio.

Era il risultato giusto. L'output mi diceva:
- Il 60% del territorio era discretamente documentato
- Il 25% era documentato in campi adiacenti con pattern trasferibili
- Il 15% era genuinamente non mappato — di nicchia abbastanza che nessuna letteratura pubblica esiste

La porzione del 15% non mappato è diventata, paradossalmente, l'insight più prezioso: **per quelle aree, il mio progetto poteva diventare esso stesso documentazione primaria.** Questo ha cambiato il posizionamento del progetto da "sintetizzare letteratura esistente" a "creare letteratura dove non esiste".

### La lezione

I disclaimer onesti non sono fallimento. Sono l'output più azionabile che puoi ottenere quando ricerchi territori instabili o sotto-documentati.

---

# PARTE 2 — Guida al Troubleshooting

## Modalità di fallimento 1: output superficiale

**Sintomo**: meno di 30K caratteri, claim generici, poche fonti primarie.

**Causa**: prompt troppo prescrittivo (modello ha filtrato verso le risposte attese) o dominio troppo ampio.

**Fix**: 
- Ri-promptare con framing Modulo 1 più forte sul mapping esplorativo neutro
- Restringi il dominio — dividi in 2 sessioni invece di 1
- Aggiungi istruzione esplicita: "Non riassumere. Mappa entità nominate specifiche, progetti, regolamentazioni, eventi datati."

## Modalità di fallimento 2: claim confidenti con fonti vaghe

**Sintomo**: frasi come "i report del settore indicano", "la ricerca suggerisce", "gli esperti concordano" senza fonti nominate.

**Causa**: il Modulo 3 (Citazioni) non è abbastanza forte.

**Fix**:
- Ri-promptare con lista esplicita di tipi di fonte accettabili
- Aggiungi: "Se non puoi citare una fonte primaria per un claim, ometti il claim o etichettalo come 'conoscenza generale del settore, fonte primaria non disponibile'."
- Spot-check citazioni più aggressivamente in audit

## Modalità di fallimento 3: l'output copre quello che hai chiesto ma sembra incompleto

**Sintomo**: ogni macro-area è indirizzata, ma percepisci che il territorio è più grande di quello che è tornato.

**Causa**: la tua lista Modulo 2 (Domini) era incompleta. Il modello non può riempire quello che non hai chiesto.

**Fix**:
- Lancia prima una sessione separata di "scoperta delle macro-aree": chiedi al modello di elencare 20-30 macro-aree rilevanti per il tuo argomento, non di mapparle. Scegli le 12-15 più rilevanti. Poi lancia il prompt completo di mapping.

## Modalità di fallimento 4: le citazioni sono reali ma dicono qualcosa di diverso da quello che l'AI claimsa

**Sintomo**: il link funziona, la fonte è reale, ma la fonte non dice davvero quello che l'AI ha sintetizzato.

**Causa**: parafrasi allucinata di fonti reali. Comune in output densi.

**Fix**:
- Spot-check 5-10 citazioni casuali per sessione, non solo 1-2
- Per i finding Categoria 5 (direzionali), verifica la fonte citata al 100% prima di agire
- Tratta ogni singolo finding Categoria 5 come sospetto fino a verifica

## Modalità di fallimento 5: l'AI sembra ripetere da sessioni precedenti

**Sintomo**: la seconda sessione di ricerca su dominio correlato produce output quasi identico alla prima.

**Causa**: caching Perplexity, o i tuoi prompt sono troppo simili.

**Fix**:
- Istruisci esplicitamente: "Evita di ripetere finding dal mapping introduttivo tipico di [dominio]. Dai priorità a pattern emergenti, contesi o sotto-documentati."
- Cambia leggermente il range temporale (es. 2025-2026 invece di 2024-2026) per forzare nuova query
- Lancia le sessioni a giorni di distanza, non a minuti

## Modalità di fallimento 6: senti che la ricerca sia "completa" ma non sei sicuro

**Sintomo**: hai lanciato 3-5 sessioni, hai un sacco di materiale, ma non riesci a dire se hai coperto il territorio.

**Causa**: framing implicito di "gestibilità" che crea falso senso di completamento. È la modalità anti-derubricazione dell'articolo.

**Fix**:
- Applica deliberatamente il Modulo 6F (Disciplina Anti-Derubricazione)
- Chiediti: "Quali categorie di informazione rilevante un esperto del settore si aspetterebbe di vedere che non ho chiesto?"
- Se non sai rispondere a quella domanda, non hai finito — chiedi al modello di elencare categorie che potresti aver mancato

## Modalità di fallimento 7: la sessione API crasha o restituisce output troncato

**Sintomo**: una sessione che dovrebbe produrre 40-60K caratteri ne restituisce 8-15K e si ferma a metà pensiero, oppure l'API restituisce timeout/errore.

**Causa**: solitamente una di tre cose — `max_output_tokens` raggiunto, reasoning effort troppo alto per la complessità del prompt, o problema transitorio lato Perplexity.

**Fix**:
- Verifica che `max_output_tokens` sia impostato a 128000 (il massimo utile per `advanced-deep-research`). Cap più bassi troncano silenziosamente.
- Se la troncatura è consistente: dividi il prompt in 2 sessioni che coprono meno macro-aree ciascuna.
- Per errori transitori: aspetta 10-15 minuti e riprova. Lo stesso prompt produrrà raramente output identico (leggera varianza), quindi se la seconda passata è drammaticamente diversa dalla prima, stai vedendo varianza, non errore.
- Se stai fatturando molto in sessioni fallite: imposta `reasoning.effort` a `medium` per il mapping rough esplorativo, riserva `high` per sessioni che hai già auditato a effort più basso prima.

---

# PARTE 3 — Pattern Avanzati

## Pattern A — Costruzione di knowledge graph multi-sessione

Per progetti che si estendono su più di 5 sessioni di ricerca, costruisci un knowledge graph mentre vai avanti:

1. Dopo ogni sessione, estrai una lista di **entità nominate** (aziende, regolamentazioni, progetti, persone, tecnologie)
2. Mantieni un singolo documento che mappa queste entità e le loro relazioni
3. Prima di ogni nuova sessione, rivedi il graph per entità che sono state menzionate ma non coperte in profondità — sono candidati per buchi Categoria A
4. Dopo 5+ sessioni, il graph stesso diventa un deliverable (e un documento di riferimento per la durata del progetto)

Nel mio caso, questo graph alla fine conteneva ~330 cluster H2 e ~1.100 sotto-cluster H3. È diventato la spina dorsale navigazionale dell'intero progetto.

## Pattern B — Sintesi cross-research

Quando hai 5+ sessioni correlate, l'esercizio con la leva più alta è **la sintesi cross-research**:

- Per ogni finding Categoria 5, nota da quale sessione viene
- Mappa i finding tra sessioni: quali finding compaiono in più sessioni? Quali compaiono in una sola?
- Finding che compaiono in più sessioni sono conoscenza stabile
- Finding che compaiono solo in una sessione hanno bisogno di verifica — possono essere verità Cat 5 o l'AI può aver confabulato una volta sola

Il pattern di cross-check tra sessioni rivela quali finding sono robusti e quali fragili. Mi è costato un'ora extra per progetto ma ha beccato 2-3 finding al limite della confabulazione.

## Pattern C — Disciplina anti-derubricazione (tre esempi reali)

Mi sono beccato a fare questa cosa tre volte separate durante il progetto. Ogni volta lo stesso pattern: dopo una sessione di ricerca, in fase di audit, ho etichettato certi finding come "minori" / "edge case" / "non bloccanti". Ogni volta, quando mi sono costretto a re-interrogare il framing, i finding sono risultati Categoria 4 o 5.

**Esempio 1**: Dopo una sessione sul panorama regolatorio, avevo notato "il credito d'imposta specifico di un paese esclude una categoria di costi maggiore" e l'avevo flaggato come "minore — aggirabile". Re-interrogato sotto il framing reale del progetto, era un paradosso strutturale che richiedeva architettura contabile separata e ha cambiato come avrei dovuto budgettare il progetto. Categoria 5.

**Esempio 2**: Dopo una sessione sulle feature AI rivolte all'utente, avevo flaggato "85% degli utenti ha atteggiamento negativo verso AI visibile" come "interessante ma non bloccante — basta saperla framettare bene". Re-interrogato, questo singolo finding ha invertito l'intero framing strategico del progetto — da "AI come feature" a "AI invisibile come strategia". Categoria 5.

**Esempio 3**: Dopo una sessione sull'infrastruttura tecnica, avevo flaggato "il vendor primario ha pivotato verso un mercato diverso" come "minore — ne possiamo scegliere un altro". Re-interrogato, era parte di un pattern documentato di instabilità dei vendor in questa nicchia, e la lezione era "costruisci indipendenza dal vendor nell'architettura dal giorno uno". Categoria 5.

In tutti e tre i casi, il framing implicito era "gestibilità — tieni lo scope stretto". Una volta esplicitato, il framing era sbagliato. I finding non erano minori; il mio framing si stava proteggendo da informazione scomoda.

**Questa è la disciplina con la leva più alta dell'intero workflow.** Pratica la cosa coscientemente. Non sembrerà naturale. È per questo che funziona.

## Pattern D — Concatenare un risultato di ricerca in una chiamata LLM successiva

L'output di ricerca Perplexity è denso. Spesso vuoi prendere quell'output denso, passarlo a un LLM diverso (Claude, GPT, la tua istanza Llama locale), e fargli fare lavoro a valle — sintesi, individuazione di contraddizioni, estrazione strutturata, draft di scrittura.

Il modo pulito di farlo è passare sia il prompt originale sia la risposta dell'assistant indietro come storia conversazionale quando chiami il modello successivo. Questo preserva il contesto completo del perché la ricerca è stata strutturata in quel modo, non solo la risposta:

```json
{
  "input": [
    {
      "type": "message",
      "role": "user",
      "content": "<prompt di ricerca originale — Moduli 1-5>"
    },
    {
      "type": "message",
      "role": "assistant",
      "content": "<l'output di ricerca completo che hai ricevuto>"
    },
    {
      "type": "message",
      "role": "user",
      "content": "<la tua istruzione di follow-up, es. 'Estrai tutte le entità nominate in un CSV con colonne nome, categoria, prima-sezione-menzionata, URL-fonte-primaria'>"
    }
  ],
  ...
}
```

La stessa forma funziona sia che tu stia usando di nuovo Perplexity per una chiamata di reasoning di follow-up, sia un altro provider interamente. Il principio: **l'output di ricerca e il prompt che l'ha generato sono contesto inseparabile.** Separarli — incollare solo l'output in un modello successivo — perde il framing che rendeva l'output affidabile. Vale i token in più.

---

# PARTE 4 — Riferimento configurazione API

Questa sezione è per i lettori che vogliono il setup tecnico esatto dietro il workflow. Se sei un lettore non tecnico che usa l'abbonamento Perplexity Pro consumer, salta questa parte.

## Il runtime

I risultati dell'articolo vengono dalla **Perplexity API** nel preset **`advanced-deep-research`** — non dall'abbonamento consumer Pro. I due prodotti sono calibrati diversamente:

- **Pro Search consumer** (abbonamento $20/mese): sintesi di ricerca single-pass, veloce, reasoning leggero. Buono per lookup veloci, debole per mapping di territorio.
- **API `advanced-deep-research`** (a token, top-up minimo $50): institutional-grade, reasoning esteso, tool-augmented, lento per sessione ma output materialmente più profondo.

Il workflow in questa Edizione Pro è calibrato per il preset API. Le soglie di audit (40K+ caratteri, 14+ cluster H2, 50+ H3) riflettono ciò che il preset API produce in modo affidabile. Con il Pro consumer, aspettati ~30% di densità in meno e adatta le soglie proporzionalmente — o accetta che stai facendo una versione più leggera dello stesso workflow.

## Struttura della richiesta di default

Questo è il body JSON che invio per una sessione esplorativa di prima passata:

```json
{
  "input": [
    {
      "type": "message",
      "role": "user",
      "content": "<il tuo prompt assemblato — Moduli 1-5 dal template gratuito>"
    }
  ],
  "stream": false,
  "preset": "advanced-deep-research",
  "max_output_tokens": 128000,
  "reasoning": {
    "effort": "high"
  },
  "tools": [
    { "type": "web_search" },
    { "type": "fetch_url" }
  ]
}
```

Endpoint: `POST https://api.perplexity.ai/v1/responses`. Auth: `Authorization: Bearer $PERPLEXITY_API_KEY`.

Invocazione equivalente in curl:

```bash
curl -X POST https://api.perplexity.ai/v1/responses \
  -H "Authorization: Bearer $PERPLEXITY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": [
      {
        "type": "message",
        "role": "user",
        "content": "<il tuo prompt assemblato>"
      }
    ],
    "stream": false,
    "preset": "advanced-deep-research",
    "max_output_tokens": 128000,
    "reasoning": { "effort": "high" },
    "tools": [
      { "type": "web_search" },
      { "type": "fetch_url" }
    ]
  }'
```

Puoi lanciarlo nel Perplexity Playground (UI web per l'API, con selettore di modello e toggle dei tool), via curl/SDK, o wrappato in qualsiasi delle client library in stile Anthropic/OpenAI.

## Note per parametro

**`preset`** — `advanced-deep-research` è il tier più alto. Altri preset (`fast-search`, `pro-search`, `deep-research`, più `custom` per configurazioni hand-rolled) scambiano profondità per velocità e costo. Per il mapping del territorio usa `advanced-deep-research`. Per estrazione, strutturazione, o lookup semplici di follow-up, `pro-search` o `fast-search` costano una frazione.

**`max_output_tokens`** — 128000 è il massimo pratico utile qui. Impostarlo più basso tronca silenziosamente e potresti perdere la sezione più preziosa (Pattern Emergenti è alla fine). Non impostarlo più basso a meno che tu non stia esplicitamente cappando la spesa su una sessione che sai stretta.

**`reasoning.effort`** — `high` per il mapping esplorativo dove vuoi che il modello pensi forte. `medium` funziona per estrazione o sintesi di follow-up dove il lavoro pesante è già negli input. `low` per lookup semplici. L'effort scala il costo: sessioni high-effort possono costare 2-3× il costo in token di sessioni medium per output di lunghezza simile, quindi riserva `high` per le sessioni dove conta.

**`tools`** — `web_search` è essenziale (è l'intero punto del runtime). `fetch_url` permette al modello di recuperare contenuto completo da URL specifici che fa emergere, il che migliora materialmente la qualità delle citazioni. Entrambi dovrebbero essere abilitati. Disabilitare uno qualsiasi dei due degrada l'output quasi al livello di un LLM base senza retrieval.

**`stream`** — `false` per ricezione sincrona dell'output completo, più facile da auditare. `true` è utile solo se stai pipando l'output in una UI mentre genera e non hai bisogno dell'output completo prima del processing.

## Varianza di costo

L'articolo cita ~$3/sessione di media su 20 sessioni. Il range effettivo:

- **Sessione più bassa nei miei dati**: ~$1.50 (sessione di chiusura Categoria-A stretta, ~15K caratteri output)
- **Sessione più alta**: ~$6 (mapping esplorativo ampio con 14+ macro-aree, citazioni dense, cap di 128K token raggiunto)
- **Mediana**: ~$2.80
- **Cosa guida la varianza**: token totali in output (di più), numero di chiamate `web_search` che il modello fa (significativo), profondità di reasoning a `high` effort su prompt complessi (significativo)

Implicazione pratica: budgetta ~$50 per un progetto di ricerca multi-verticale (5-8 sessioni). Il top-up minimo è $50 comunque, quindi non puoi spendere meno di così.

## Sperimentazione che vale la pena fare

Configurazioni non usate nell'articolo che potrebbero produrre risultati migliori per casi d'uso specifici:

- **`reasoning.effort` più basso per il loop di audit-recovery**: quando ri-lanci una sessione dopo che l'audit ha identificato output superficiale, `medium` effort con un prompt più affilato è a volte meglio di `high` effort con il prompt sciatto originale. Testa sui tuoi dati.
- **Diverse combinazioni di tool per lookup tecnici stretti**: solo `web_search` (no `fetch_url`) per sessioni dove vuoi ampia scoperta di URL; solo `fetch_url` per sessioni dove hai una reading list nota e vuoi estrazione. I risultati dell'articolo vengono da entrambi abilitati, ma cambia in base al dominio.
- **Struttura conversazionale multi-turn con system message**: non ho usato system message nelle run che hanno prodotto i risultati dell'articolo. Plausibilmente vale la pena sperimentare se hai uno stile idiosincratico di audit che vuoi che il modello applichi consistentemente attraverso le sessioni.

**Reminder sui costi**: la sperimentazione è soldi reali sul contatore. Budgetala separatamente. Tieni d'occhio la dashboard API Perplexity. Il prodotto è onesto sul costo per chiamata — non c'è overage a sorpresa.

---

# PARTE 5 — Ottimizzazione Costi

## Spendere meno ottenendo di più

Dopo 20 sessioni ho speso ~$60. Se fossi stato più sveglio dalla sessione 1, avrei potuto farlo per ~$40. Ecco cosa cambierei.

**Smetti di lanciare sessioni profonde su territorio già mappato.** Ho lanciato 2-3 sessioni in cui il rapporto marginale di finding Cat 4-5 era sotto il 5%. Erano spreco. Auditale aggressivamente dopo ogni sessione; se il territorio sembra sottile, vai avanti.

**Lancia PRIMA sessioni di scoperta delle macro-aree, poi mapping.** Spendere $1-2 su una sessione "elenca 25 macro-aree rilevanti per X" prima di lanciare la sessione di mapping da $3-5 previene la copertura incompleta. L'ho imparato a metà strada.

**Usa le sessioni di chiusura liberalmente per i buchi Categoria A.** Una sessione di chiusura stretta da $3-4 vale quasi sempre più di una nuova sessione ampia da $5-7.

**Smetti di provare a ricercare cose che non si ricercano bene.** Alcuni territori non hanno abbastanza documentazione pubblica perché la ricerca AI aggiunga valore. Riconoscilo presto e pivota su consultazione diretta, lettura di fonti primarie, o esperimento in prima persona.

**Usa preset di tier più basso per le sessioni non di mapping.** Una volta che hai l'output di mapping, il lavoro a valle — estrazione, sintesi, restrutturazione — solitamente non ha bisogno di `advanced-deep-research`. `pro-search` a `medium` effort gestisce la maggior parte di questo a una frazione del costo.

## Costo realistico per progetto di ricerca

| Complessità del progetto | Sessioni necessarie | Costo totale |
|---|---|---|
| Mapping di un singolo verticale | 2-3 | $6-12 |
| Panorama multi-verticale | 5-8 | $15-30 |
| Progetto strategico completo (multi-mese) | 15-25 | $45-90 |
| "Mappa tutto quello di cui avrò mai bisogno" | 30+ | $100+ |

Per la maggior parte di founder, operator, giornalisti e scrittori, la risposta è "panorama multi-verticale" — $15-30. È il sweet spot di rendimento sulla spesa.

---

# PARTE 6 — Adattamento a scale diverse

## Per due-diligence di founder

- Comprimi a 3-5 sessioni
- Enfasi forte sul Modulo 4 (Disclaimer) — devi sapere cosa NON è noto
- Cross-reference dei finding Categoria 5 con call con esperti del settore (1-2 call validano il mapping AI)

## Per investigazione giornalistica

- Usa il workflow come scaffolding, non come fonte finale
- Ogni finding Categoria 5 attiva verifica manuale di fonte primaria
- L'output è un *documento di ricerca* su cui poi agisci con strumenti giornalistici tradizionali

## Per scrittura di libri tecnici

- È quello per cui ho usato il workflow io
- 15-25 sessioni su 6 mesi
- Il knowledge graph diventa lo scheletro strutturale del libro
- Ogni cluster di capitolo maggiore mappa a 1-2 sessioni di ricerca
- I finding che compaiono in più sessioni diventano temi centrali

## Per analisi di mercato

- Enfasi forte sul Modulo 5 (Pattern Emergenti) — l'intelligence competitiva spesso viene da lì
- Sintesi cross-research rivela quali trend sono robusti vs hyped
- L'output alimenta strumenti tradizionali di analisi di mercato (sizing, segmentazione)

---

# PARTE 7 — Quando il workflow massimizza il valore vs quando comprime solo tempo

Questa sezione è qui perché il workflow non produce lo stesso tipo di valore su tutti i domini. Entrambi i tipi di valore sono reali. Non sono lo stesso tipo di valore.

## La distinzione

Esistono due regimi:

**Regime A — Domini sotto-documentati.** Territori complessi ma frammentati: aree di nicchia specialistica, intersezioni tra discipline, ambienti regolatori in rapida evoluzione, aree tecniche emergenti, settori in flusso. L'informazione pubblica esiste ma è dispersa, contraddittoria, o incompleta. Nessuna singola fonte ha la mappa completa.

**Regime B — Domini iper-documentati.** Territori complessi ma ampiamente coperti: software di consumo mainstream, framework di programmazione popolari, prodotti di consumo consolidati, industrie ben note. L'informazione pubblica è abbondante, ben organizzata, e centralizzata in fonti canoniche (documentazione ufficiale, wiki mature, canali community di esperti).

Il workflow gira con successo in entrambi i regimi. La natura del valore prodotto è diversa in ciascuno.

## In Regime A — il workflow abilita territorio

Senza il workflow (o il suo equivalente funzionale: $15.000+ in consulenti specializzati), il territorio è **di fatto non-mappabile** per un singolo ricercatore in tempi ragionevoli. L'informazione è troppo dispersa, troppo contraddittoria, troppo frammentata. Gli 80 findings di categoria 5 ottenuti dal mio progetto principale non sarebbero emersi attraverso ricerca normale — li avrei scoperti uno alla volta nell'arco di anni, oppure avrei pagato persone che li avevano già in testa.

In Regime A, il workflow è *abilitante*: rende possibile qualcosa che altrimenti non lo era.

L'articolo originale (quello pubblico e gratuito che introduce questa Edizione Pro) è stato scritto su un'applicazione in Regime A. Per questo il confronto di costo ($60 vs $15.000+) è concreto: l'alternativa era reale, costosa, e avrebbe prodotto una mappa simile.

## In Regime B — il workflow comprime tempo

In un dominio iper-documentato, il workflow gira pulitamente, produce output denso, genera findings categoria 5, ma lo scenario alternativo è diverso. Senza il workflow, potresti comunque costruire la stessa mappa leggendo le fonti canoniche per 20-30 ore e sintetizzando manualmente. L'informazione è *disponibile*, ti serve solo tempo.

In Regime B, il workflow è *comprimente*: fa in una sessione di 5-15 minuti quello che ti richiederebbe 20-30 ore di ricerca manuale.

Questo è anche valore reale — il tempo è denaro reale, e 30 ore sono significative — ma **non è** lo stesso che abilitare qualcosa prima impossibile. Il framing del ROI cambia:

| Regime | Costo alternativa | Alternativa in tempo | Natura del valore |
|---|---|---|---|
| A — Sotto-documentato | $5.000–30.000+ in consulenti | Mesi (spesso impossibile) | Abilita mappatura nuova |
| B — Iper-documentato | $0 (info pubblica gratuita) | 20–30 ore di lettura manuale | Comprime mappatura esistente |

## Come riconoscere in quale regime sei

Prima di iniziare una sessione, fai un sanity check di cinque minuti:

- Un non-esperto può raggiungere l'80% di comprensione del dominio leggendo documentazione ufficiale + 2-3 fonti community di riferimento in 20-30 ore? → **Regime B (compressione)**
- Il dominio è distribuito su 10+ fonti disconnesse, ognuna con informazioni parziali? → **Regime A (abilitazione)**
- Esistono praticanti esperti attivi che si farebbero pagare $200–400/ora per mappare questo dominio? → **Regime A (abilitazione)**
- Wikipedia ha un articolo di alta qualità, aggiornato, e profondo su questo dominio? → **Regime B (compressione)**
- Il dominio è ancora in rapida evoluzione, senza fonti canoniche stabili? → **Regime A (abilitazione)**

Entrambi i regimi sono legittimi. Calibra solo le aspettative: se applichi il workflow a un dominio di Regime B aspettandoti "$15.000 di valore", rimarrai deluso. Se lo applichi a un dominio di Regime A aspettandoti "20 ore risparmiate", sottovaluterai il valore reale.

## Una nota sui domini ibridi

Alcuni domini sono misti. Per esempio, mappare "le best practice attuali per un framework di programmazione consolidato" è Regime B per le basi del framework ma Regime A per l'**intersezione** di quel framework con un contesto di deployment di nicchia emergente. Il workflow gira allo stesso modo; quello che cambia è la tua interpretazione di quali findings categoria 5 rappresentano davvero territorio-abilitato vs solo tempo-compresso.

In caso di dubbio: assumi Regime B finché l'audit non dimostra che i findings categoria 5 **non** sono presenti nelle fonti canoniche. Se non lo sono, ti sei imbattuto in una tasca di Regime A dentro un dominio di Regime B — e quell'intersezione è spesso dove vivono gli insight di valore più alto.

---

# PARTE 8 — Una nota finale sul metodo

Sei mesi fa avrei ucciso per quest'Edizione Pro. Invece ho costruito il workflow $3 alla volta, sbattendo contro le stesse modalità di fallimento ripetutamente finché i pattern sono emersi.

L'insight centrale non è su Perplexity. È su come la ricerca AI-aumentata differisce dal search tradizionale:

- **Il search tradizionale** è bravo a trovare cose specifiche già note
- **La ricerca esplorativa AI** è brava a *mappare territori non noti*
- **Combinare i due** con audit disciplinato è quello che produce conoscenza seria

Il workflow sopra è la versione più disciplinata che ho trovato. Non è l'unica. Man mano che gli strumenti AI evolveranno, evolverà anche il workflow. Ma i principi sottostanti — framing esplorativo neutro, citazioni primarie obbligatorie, dichiarazione esplicita dei limiti, audit categorizzato, disciplina anti-derubricazione — quelli resteranno.

Usali. Adattali. Migliorali.

Se costruisci un workflow migliore, mi piacerebbe vederlo.

---

*Template gratuito (moduli + checklist audit): [link]*

*Articolo su Medium: [link]*

*Domande/feedback: [tua email o handle social]*

---

## Changelog

- **v1.0** — Prima release. Tre casi di studio, guida al troubleshooting, pattern avanzati, ottimizzazione costi, note di adattamento, riferimento completo configurazione API, sezione anti-hype dedicata.
- **Aggiornamenti futuri**: aggiunte pianificate includono confronti tra strumenti AI (Perplexity vs Claude vs Gemini per ricerca), cookbook dedicato per la scrittura di libri tecnici, cookbook dedicato per la due-diligence di founder.

*Se hai comprato questa Edizione Pro, riceverai aggiornamenti futuri gratis. Aggiungiti alla lista degli aggiornamenti a [link].*
