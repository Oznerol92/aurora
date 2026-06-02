# Il Template Perplexity Pro per la Ricerca

> **Un sistema modulare per portare avanti progetti di ricerca seri con l'AI.**
> 
> Sei blocchi. Li combini per qualsiasi dominio. Gratis da usare, adattare, condividere.
>
> Companion all'articolo: *Ho speso $60 su Perplexity Pro. Per avere lo stesso risultato avrei pagato un consulente $15.000+.*

---

## Come usare questo template

1. Leggi i 6 moduli qui sotto. Ognuno è un blocco autonomo.
2. Per la tua ricerca, copia i moduli in un singolo prompt (in ordine: Apertura → Domini → Citazioni → Disclaimer → Pattern emergenti).
3. Riempi i `[PLACEHOLDER TRA PARENTESI]` con le tue specifiche.
4. Lancialo come singola query Perplexity Pro deep research.
5. Quando ricevi l'output, applica il **Modulo 6 (Audit post-ricerca)** come checklist su quello che è tornato.
6. Identifica i buchi. Se hai buchi in Categoria A, fai una seconda sessione mirata.

Questo è il workflow a 4 step descritto nell'articolo: prima passata → audit → identificazione buchi → passata di chiusura.

**Una nota sul runtime**: questo template è calibrato per la Perplexity API nel preset `advanced-deep-research` (a token, top-up minimo $50). Funziona anche con l'abbonamento Perplexity Pro consumer, ma aspettati ~30% di densità di output in meno e reasoning meno profondo. La struttura esatta della richiesta API che uso è in fondo a questo documento. La Pro Edition ha il riferimento di configurazione completo.

---

## MODULO 1 — Apertura

> **Scopo**: stabilire intento, formulare la ricerca in modo neutrale, segnalare che vuoi mapping esplorativo non risposte prescrittive.

```
Mi serve una ricerca esplorativa neutra di mapping su [DOMINIO/ARGOMENTO] 
che copra [PERIODO TEMPORALE, es. 2024-2026].

Contesto: sto lavorando a [DESCRIZIONE BREVE NON TENDENZIOSA DEL PROGETTO 
O DELLA DECISIONE — restala neutrale, NON pre-caricare conclusioni che 
ti aspetti].

NON sto chiedendo "best practice" né "cosa funziona meglio". Voglio una 
mappa del territorio reale: pattern dominanti, alternative emergenti, 
fallimenti documentati, vincoli regolatori/economici/tecnici, trade-off, 
anti-pattern.

Regole di minimizzazione bias:
- Non filtrare per quello che è comunemente raccomandato
- Non confermare il mio framing o le mie assunzioni
- Fai emergere esplicitamente le aree contese o non risolte
- Quando il settore ha scuole di pensiero in competizione, presentale 
  affiancate senza scegliere un vincitore
```

**Esempi (domini neutri):**

- Fintech: "Mi serve una ricerca esplorativa neutra di mapping sulla regolamentazione del buy-now-pay-later in UE 2024-2026..."
- Biotech: "Mi serve una ricerca esplorativa neutra di mapping sui pattern di commercializzazione delle terapie CAR-T 2023-2026..."
- Climate-tech: "Mi serve una ricerca esplorativa neutra di mapping sulle dinamiche di pricing commerciale del direct air capture 2024-2026..."

---

## MODULO 2 — Domini

> **Scopo**: elencare le macro-aree che vuoi coperte senza pre-filtrarle. Genera questa lista in modo ampio. Se ti perdi il 30% delle categorie rilevanti, l'AI non può riempire quello che non hai chiesto.

```
Copri le seguenti macro-aree con profondità di mapping (non insegnamento 
profondo, ma mapping del panorama con riferimenti concreti):

1. [MACRO-AREA 1] — sotto-aspetti: [3-5 sotto-aspetti che vuoi vedere emergere]
2. [MACRO-AREA 2] — sotto-aspetti: [3-5]
3. [MACRO-AREA 3] — sotto-aspetti: [3-5]
[continua per 8-15 macro-aree]

Per ogni area, output:
- 2-4 paragrafi di sintesi
- 1 tabella di tool/attori/pattern/regolamentazioni dominanti con stato, 
  costo (se applicabile), licenza/giurisdizione, date chiave
- 3-5 link primari verificabili per area
```

**Calibrazione:**
- 5-7 macro-aree → mapping leggero (~30-40K caratteri output)
- 8-12 macro-aree → mapping standard (~40-50K)
- 13-18 macro-aree → mapping profondo (~50-60K)
- Oltre 18 → output diventa sottile per area, dividi in più sessioni

---

## MODULO 3 — Citazioni

> **Scopo**: forzare le fonti primarie. Questa singola istruzione filtra lo slop AI di circa il 90%.

```
Per ogni affermazione cita fonti primarie con link, autore/organizzazione, 
data. Fonti primarie accettabili:

- Documentazione ufficiale (con URL)
- Paper peer-reviewed (arXiv, riviste, con DOI quando disponibile)
- Talk di conferenze di settore (GDC, DEF CON, KubeCon, RSA, ACM, etc., 
  con anno)
- Blog post specifici con autore nominato e data
- Filing regolatori, documenti giudiziari, pubblicazioni governative
- Postmortem con progetto nominato + autore nominato
- Filing aziendali (10-K, S-1) per claim finanziari
- Industry report nominati (con publisher + data) per dati di mercato

NON accettabili:
- "I report del settore indicano..." senza nominare il report
- "La maggior parte degli esperti dice..." senza esperti specifici nominati
- Wikipedia come fonte primaria per argomenti correnti/contesi
- Sintesi AI-generated di altro contenuto AI-generated

Se per una specifica affermazione non riesci a citare una fonte primaria, 
dichiara "fonte primaria non disponibile" piuttosto che citare una vaga 
fonte secondaria.
```

---

## MODULO 4 — Disclaimer

> **Scopo**: invertire l'incentivo implicito che fa riempire i buchi all'AI con speculazione confidente.

```
Per ogni macro-area in cui i dati pubblici sono limitati o assenti, 
DICHIARALO ESPLICITAMENTE invece di riempire con speculazione generica.

Specificamente:
- Se un argomento è coperto bene in campi adiacenti ma non specificamente 
  in [TUO DOMINIO], dillo e indica da dove vengono i pattern trasferibili
- Se un argomento è troppo recente per avere un consenso stabile, 
  marcalo come "emergente, conteso" con timeframe
- Se un argomento ha risposte note pubblicamente disponibili ma non 
  riesci a verificarle con fonti primarie, scrivi "documentato a [X] 
  ma non verificato indipendentemente"
- Se non hai dati utili su una sotto-area, lasciala vuota con "nessun 
  dato pubblico disponibile" invece di produrre filler

Le sezioni marcate con note di limitazione sono PIÙ preziose delle 
sezioni senza. Onestà preferita ad apparenza di completezza.
```

---

## MODULO 5 — Pattern emergenti

> **Scopo**: permesso esplicito all'AI di far emergere pattern fuori dalla struttura del prompt. Costantemente la sezione con il rendimento più alto.

```
Alla fine dell'output, includi una sezione intitolata "PATTERN EMERGENTI 
NON RICHIESTI ESPLICITAMENTE".

In questa sezione fai emergere 5-10 pattern, osservazioni o trend del 
2024-2026 che:
- Sono rilevanti per il dominio mappato sopra
- NON erano coperti dalle macro-aree del Modulo 2
- Sono emergenti, contesi, di nicchia o controintuitivi
- Possono includere fallimenti documentati, anti-pattern, trend 
  controversi, o esperimenti orientati al futuro

Per ogni pattern: nominalo, fornisci 2-3 frasi di contesto, cita 1-2 
fonti primarie specifiche, e indica maturità (sperimentale / emergente 
/ deployato in produzione) e ambito di rilevanza realistico.

Questa sezione è esplorazione bonus. L'obiettivo è far emergere pattern 
che non sapevo di dover chiedere. Sorprendimi con sostanza, non novità 
fine a se stessa.
```

---

## MODULO 6 — Checklist audit post-ricerca

> **Scopo**: non andare avanti dopo un singolo prompt. Auditare l'output sistematicamente. Questo step è ciò che separa la ricerca seria dal consumo passivo di slop AI.

Dopo aver ricevuto l'output, esegui questa checklist (calcola 30-45 minuti per sessione):

### A. Verifica densità

| Metrica | Soglia | Tuo output |
|---|---|---|
| Caratteri totali | ≥40.000 | _____ |
| Cluster H2 | ≥14 | _____ |
| Sotto-cluster H3 | ≥50 | _____ |
| Citazioni per macro-area | ≥3 primarie verificabili | _____ |

Se qualcosa è sotto soglia: il modello non si è impegnato. Ri-promptare con framing più forte del Modulo 1.

### B. Verifica citazioni

Per 5-10 affermazioni a campione nell'output, verifica:
- La fonte citata esiste? (Clicca il link)
- La fonte dice davvero quello che l'AI dice?
- La fonte è datata nel range temporale specificato?

Se più del 20% delle citazioni a campione fallisce: tratta tutto l'output come sospetto. Ri-lancialo con istruzioni Modulo 3 più forti.

### C. Verifica disclaimer

Conta le sezioni etichettate "dati limitati", "fonte primaria non disponibile", "emergente conteso", etc.

- 0 disclaimer su 14+ macro-aree = l'AI sta sparando palle da qualche parte. Tratta l'output come sospetto.
- 2-5 disclaimer onesti = realismo sano. Fidati di più del resto.
- 8+ disclaimer = o il dominio è genuinamente mal documentato, o il prompt era troppo stretto.

### D. Categorizza i finding (1-5)

Vai attraverso ogni claim notevole nell'output e taggalo:

- **Categoria 5** — Direzionale. Sposta la traiettoria del progetto o le tue assunzioni.
- **Categoria 4** — Sostanziale. Informazione nuova che non avevi, materialmente utile.
- **Categoria 3** — Conferma di quello che già sospettavi.
- **Categoria 2** — Informazione marginale, utile ma minore.
- **Categoria 1** — Filler, generico, basso valore.

Distribuzione sana: 5-10% Cat 5, 15-25% Cat 4, resto Cat 3-2-1. Se sotto il 5% Cat 4-5: l'area è iper-mappata o il prompt era fuori bersaglio. Se sopra il 30% Cat 4-5: hai trovato un filone riccamente sotto-esplorato.

### E. Identifica buchi (Categoria A/B/C)

Per ogni area maggiore non coperta in modo soddisfacente:

- **Categoria A — Fai un'altra ricerca.** Territorio grosso mancante, letteratura pubblica esiste.
- **Categoria B — Si chiude lavorando.** Dettagli implementativi specifici, emergeranno durante il progetto.
- **Categoria C — Non si chiude con ricerca esterna.** Contesto locale, molto emergente, serve consultazione diretta.

### F. Disciplina anti-derubricazione

Per ogni finding che a prima passata etichetti "minore" / "edge case" / "non bloccante":

**Fermati. Re-interroga il framing implicito sotto cui è minore.**

Se il framing è implicito e di comodo, costringilo a essere esplicito. Poi decidi se il finding è davvero minore o se stai inconsciamente derubricandolo per mantenere lo scope gestibile.

Questa è la disciplina con la leva più alta dell'intero workflow. La maggior parte delle aree sotto-ricercate non sono "aree che non hai pensato di chiedere" — sono "aree che hai implicitamente derubricato in fase di audit".

---

## Quando lanciare una ricerca di chiusura

Dopo l'audit, SOLO per buchi Categoria A:

- Struttura prompt: gli stessi 5 moduli sopra, ma ristretti ai buchi specifici con riferimento esplicito a cosa la prima sessione aveva coperto
- Costo: tipicamente 3-5 dollari per sessione di chiusura
- Dopo la chiusura: audit finale, poi vai avanti

Se dopo la sessione di chiusura hai ancora buchi Cat A, il dominio potrebbe essere mal documentato — procedi con quello che hai e tratta i buchi residui come Categoria B o C.

---

## Quando NON usare questo template

- Domande fattuali semplici ("Qual è la sintassi di X?")
- Domini ben documentati dove la docs ufficiale ti risponde in 5 minuti
- Decisioni binarie dove ti basta confrontare A vs B
- Decisioni urgenti single-shot (risposte in 10 minuti)

Usa questo template per: domini complessi con stato che cambia, impegni multi-mese in cui il territorio conta, aree dove gli errori da informazione incompleta sono costosi.

---

## Riferimento richiesta API

Per il preset `advanced-deep-research`, la struttura della richiesta che ha prodotto i risultati nell'articolo:

```json
{
  "input": [
    {
      "type": "message",
      "role": "user",
      "content": "<incolla qui il tuo prompt assemblato — Moduli 1-5>"
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

Endpoint: `POST https://api.perplexity.ai/v1/responses`. Auth Bearer con la tua API key. La Pro Edition ha un esempio curl completo, pattern di follow-up per concatenare con LLM successive, e note sulla varianza di costo per configurazione.

Avviso breve sui costi: l'API fattura a token e sessioni complesse possono costare più della media di ~$3. Tieni d'occhio la dashboard. Configurazioni che cambiano reasoning effort, max output tokens, o set di tool influiscono tutte su prezzo e qualità — vale la pena sperimentare se hai margine nel budget.

---

## Libreria di esempi

### Esempio 1 — Regolamentazione fintech

```
Mi serve una ricerca esplorativa neutra di mapping sulla regolamentazione 
cross-border del buy-now-pay-later in UE 2024-2026.

Contesto: sto valutando la fattibilità di ingresso sul mercato per un 
prodotto fintech rivolto ai consumatori UE. NON sto chiedendo quali 
paesi siano i migliori per entrare — voglio la mappa regolatoria.

[Moduli 2-5 personalizzati per: regolatori per paese, leggi specifiche 
BNPL vs credito al consumo generale, casi di enforcement recenti, 
vendor di tooling compliance, armonizzazione UE emergente, fallimenti 
di compliance documentati per operatori nominati]
```

### Esempio 2 — Commercializzazione biotech

```
Mi serve una ricerca esplorativa neutra di mapping sui pattern di 
commercializzazione delle terapie CAR-T 2023-2026.

Contesto: sto facendo ricerca sulle dinamiche commerciali nello spazio 
delle cell therapy. NON sto chiedendo quali terapie avranno successo — 
voglio il panorama.

[Moduli 2-5 personalizzati per: modelli di pricing, pattern di 
negoziazione con i payer, colli di bottiglia di capacità produttiva, 
risultati recenti di trial clinici nominati, percorsi regolatori in 
US/UE/Giappone, pubblicazioni post-launch di dati real world, 
fallimenti commerciali documentati]
```

### Esempio 3 — Dinamiche di mercato climate-tech

```
Mi serve una ricerca esplorativa neutra di mapping sulle dinamiche di 
pricing commerciale del direct air capture 2024-2026.

Contesto: sto valutando la struttura di mercato nella rimozione del 
carbonio. NON sto chiedendo quale azienda DAC vincerà — voglio il 
panorama costi/pricing.

[Moduli 2-5 personalizzati per: numeri reali di costo per tonnellata 
riportati, economics di progetti nominati, impatto IRA/credito 
d'imposta UE, prezzi di mercato volontario, segnali di mercato di 
compliance, curve di costo di scaling, fallimenti o ritardi di 
progetti documentati, tecnologie alternative emergenti]
```

---

## Note finali

Questo template non produce un documento di ricerca finito. Produce una mappa del panorama ad alta densità e ben citata.

Il lavoro dopo il template:
- Leggere l'output con attenzione
- Sintetizzare attraverso più sessioni di ricerca
- Prendere decisioni basate sul territorio
- Applicare la tua expertise di dominio per individuare cosa l'AI ha mancato

Perplexity Pro è uno strumento. Il template è un workflow. Il giudizio resta tuo.

---

*Se questo ti è utile e vuoi esempi estesi, troubleshooting e un caso di studio elaborato, la versione Pro è [disponibile qui](https://your-gumroad-link).*

*Template gratuito: usalo, condividilo, fork. Attribuzione apprezzata ma non richiesta.*
