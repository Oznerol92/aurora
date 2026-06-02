# Il metodo — come facciamo gli articoli

Un piccolo manuale-template per imparare a scrivere e pubblicare articoli fatti
bene. Pensato per essere dato a qualcuno che parte: si guarda un esempio, si
copia un template, si seguono i tutorial.

## Come si usa
Apri **`index.html`** nel browser. Tre sezioni:

- **Esempi** — articoli veri, fatti col metodo. Il modello da guardare.
- **Template** — scheletri da copiare e riempire (incluso il *template articolo*).
- **Tutorial** — il metodo spiegato: la voce, l'anonimizzazione, come pubblicare
  e monetizzare, le immagini, e come crearsi il proprio project su Claude.

Consiglio: tieni aperti **un esempio** e **il template articolo** affiancati.

## Struttura
```
sito_didattico/
├── index.html        → punto di ingresso
├── style.css         → tema (ottone su inchiostro)
├── esempi/           → 2 articoli reali (EN + IT)
├── template/         → template articolo (EN+IT) + template ricerca free/pro
├── tutorial/         → voce, anonimizzazione, pubblicare, immagini, crea-il-tuo-project
└── _sorgenti/        → i .md puliti, fonte delle pagine
```

## Cosa è stato tolto / cambiato rispetto all'archivio originale
- **Rimossi** tutti i file personali e i diari di sessione (memoria, system
  prompt, descrizione del project, prompt di apertura, README di setup, report,
  handoff, memo). Non servono a chi impara e contenevano dati privati.
- **Dati account → segnaposto**: email, username e URL personali sostituiti con
  `tuonome` / `tua-email@example.com` ovunque.
- **Anonimizzazione**: rimosso dal tutorial il vecchio changelog interno, che
  nominava per esteso uno stack tecnico privato. Tenuto tutto il metodo.
- **Aggiunti** due template articolo nuovi (EN+IT) e il tutorial "Crea il TUO
  project".

## Note
- I **font** caricano da Google Fonts via CDN: serve connessione.
- I documenti di metodo nominano ancora il sistema "pushOut1777" e portano
  qualche nota operativa interna: non sono dati sensibili, ma si possono
  neutralizzare se vuoi un manuale del tutto neutro.
