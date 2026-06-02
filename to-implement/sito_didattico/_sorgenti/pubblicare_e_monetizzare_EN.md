# Operational Instructions — Publication and Monetization

> Step-by-step guide to publishing the 3 artifacts and setting up monetization.
> Total estimated time: 2-3 hours of your work, one-time setup.

---

## Table of Contents

1. What you have available
2. Fast setup (recommended path)
3. Complete setup (maximization path)
4. Minimum setup ("upload and forget" path)
5. Necessary minimum promotion
6. Tracking and iteration
7. Alternatives and combinations
8. Final check before publishing
9. What NOT to do
10. Post-publication scenarios

---

## 1. What you have available

Three publishable files in the `/home/claude/sideproject/` directory (plus the corresponding Italian versions 05/06/07 to be published in the second wave):

- **`01_articolo_medium.md`** — main article ~3,500 words, in English, ready for Medium
- **`02_template_gratuito.md`** — free modular template to host as Gist or public Google Doc
- **`03_template_pro.md`** — extended Pro version ~5,000 words with case studies, troubleshooting, advanced patterns, full API configuration reference, to sell on Gumroad/LemonSqueezy

All three have placeholders `[link]` or `https://your-link-goes-here` you need to replace after creating the final URLs.

The files reflect the actual setup used: **Perplexity API in `advanced-deep-research` preset**, pay-per-token, $50 minimum top-up. Not the $20/month consumer subscription. This is clarified in the publishable files honestly without weighing down the pitch.

---

## 2. Fast recommended setup (~2 hours)

This is the path that maximizes value-to-time ratio for someone who said "I don't want to waste time."

### Step 1 — Create the 3 target links (30 minutes)

#### A. Gumroad account for the Pro template
- Go to gumroad.com
- Sign up (free, takes email + password)
- Verify email
- "Create new product" → type "Digital download" → upload `03_template_pro.md`
- Title: "The Perplexity Pro Research Template — Pro Edition"
- Price: **$9** (psychological sweet spot for impulse purchases, under $10 outperforms $7 or $12)
- Short description (3-4 sentences): see "Pre-written texts" section below
- Cover image: Gumroad generates one by default, fine for now — you can replace it later
- Save and publish
- Copy the product URL (format `https://gumroad.com/l/xxxxxx`)

#### B. GitHub Gist for the free template
- Go to gist.github.com (you must be logged into GitHub)
- "New gist"
- Filename: `perplexity-research-template.md`
- Copy/paste content of `02_template_gratuito.md`
- Replace `https://your-gumroad-link` with the Gumroad URL created above
- "Create public gist"
- Copy the gist URL

#### C. Medium account if you don't have one
- medium.com → Sign up (free, can use Google login)
- For Medium Partner Program (to get paid): go to Settings → Membership → Become a Medium member ($5/month — pays back in the first article that works) → Settings → Partner Program → Join
- Note: in 2024-2025 the rules changed, you must be a Medium Member to be in the Partner Program. It's a necessary cost, $5/month easily amortized

### Step 2 — Publish Medium article (45 minutes)

- Open `01_articolo_medium.md`
- Replace `https://your-link-goes-here` with Gist URL (free template)
- Replace `https://your-gumroad-link` with Gumroad URL (Pro template)
- On Medium: "Write a story"
- Copy/paste the entire article
- Medium automatically converts Markdown headers, bold, italic, links, tables
- Visually verify everything looks good
- Add title + subtitle (Medium asks for them separately)
- **Tags**: add 5 tags (max allowed): `Artificial Intelligence`, `Perplexity`, `Productivity`, `Research`, `Writing`
- Add a "kicker image" at the top — Medium recommends an image, makes a big difference. See `image_prompts_bundle.md` for the exact prompts I prepared
- Click "Publish" → Medium asks for final tags and collection (you can skip collection)
- Publish

### Step 3 — Verify and cross-link (15 minutes)

- Copy published Medium article URL
- Go back to Gumroad → edit product description → add link to Medium article as reference
- Go back to Gist → add Medium article link at the bottom
- Three points connected: Medium → Gist (free) → Gumroad (Pro)

### Step 4 — Minimal promotion (30 minutes, optional)

See section 5 below. If you really want to minimize, skip this step.

**Total: ~2 hours. Published and monetized. From here on, it's automatic.**

---

## 3. Complete setup (~3-4 hours)

If you want to maximize return, add these extra steps to the fast setup:

### Email capture

- Setup ConvertKit free tier (1,000 free subscribers) or Substack
- Add a "Get future updates" form both in the Gist and in Gumroad description
- Connect: whoever buys Pro automatically enters list
- Email automation: 1 welcome email + 1 email at 7 days with bonus content (you can create a 1,000-word bonus mini-cookbook one-time)

Cost: $0. Time: 1 hour setup.

Benefit: email list grows passively. When you have another template/product/article, you have a ready audience.

### Twitter/X launch thread

- Summarize the 6 epistemological principles of the article in a thread of 8-12 tweets
- Link the Medium article in the last tweet
- Published and that's it — you don't have to respond to everything, let it work

Time: 30 minutes.

### LinkedIn cross-post

- Copy/adapt Medium article in LinkedIn format (suitable: ~2,000 words, more punctuated, clear headers)
- Link to original Medium as "full version"
- LinkedIn algorithm rewards technical/business content

Time: 30 minutes.

### Hacker News / Indie Hackers / Reddit submission

- Submit article on Hacker News (news.ycombinator.com → submit)
- Submit on Indie Hackers (indiehackers.com → community)
- Submit on Reddit r/PromptEngineering, r/perplexity, r/writing, r/ChatGPTPro
- Just submit + catchy title. NO aggressive promotion, community rules are strict

Time: 20 minutes.

---

## 4. Minimum setup "upload and forget" (~45 minutes)

If you really want the minimum:

1. Create Gumroad account, publish Pro template at $9 (15 min)
2. Create Gist with free template that links to Gumroad (10 min)
3. Publish Medium article that links both (20 min)

Skip: optimal tags, kicker image, promotion, thread, LinkedIn.

Expected result: organic Medium SEO traffic. Likely $0-50 in the first months. But the asset is online and running.

If a similar article ever goes viral on Medium, the asset already exists and capitalizes.

---

## 5. Necessary minimum promotion

If you said "the bare minimum or automating as much as possible," these are the 3 things worth the time:

### A. Optimal Medium tags
Already in instructions. Wrong tags = invisible article. Right tags = article found in 6-12 months via search SEO.

### B. Killer subtitle
I already wrote a subtitle in the article, but you can A/B test. Medium allows changing the title after publication without losing stats.

Current subtitle: *"A 4-step research workflow I built across 20 deep-dives — and what I learned about getting AI to actually do research instead of producing slop."*

Alternatives to try if first version doesn't perform:
- *"The 4-step workflow that turned $60 of Perplexity Pro into research worth $15,000+"*
- *"Why most people use AI research tools wrong — and the 4-step fix"*
- *"6 months, 20 sessions, $60. Here's what I learned about doing serious research with AI."*

### C. One single submission to active community
Choose ONE among Hacker News, Indie Hackers, Reddit r/PromptEngineering. Submit the article. Wait. If it doesn't get upvoted in the first hours, leave it and don't insist.

If it gets upvoted: significant traffic for 1-3 days. Likely Gumroad conversions.

---

## 6. Tracking and iteration

### What to check every 1-2 weeks (5 min)

- Medium stats: views, reads, claps, conversion rate (if you're in Partner Program)
- Gumroad sales: number of conversions, source (if Gumroad provides attribution)
- Gist traffic: GitHub provides limited view stats

### When to update

- **After 3 months**: re-read article. Update examples, data, pricing if changed. Add note "Updated [date]".
- **After 6 months**: if Pro template has sold >20 copies, consider v2.0 with new case studies. Sell v2.0 to old customers at discount, others at full price.
- **After 12 months**: re-evaluate keeping the product. If it generated <$200 total, it's dead. If $500+, evergreen asset.

### Minimum necessary iteration

Nothing. Really. Publish and that's it. If it works, the asset matures by itself. If it doesn't work, no iteration will save it.

The only exception: if in the first 7 days you see 0 Gumroad conversions despite decent Medium traffic, try reducing Pro price to $7 and see if it changes. If still 0, the problem is the template, not the price.

---

## 7. Alternatives and combinations

### Alternative 1: Substack instead of Medium

Substack advantages:
- You own the audience (direct email)
- No Partner Program fee
- Built-in paywall (you can put part of the article behind $5/month)

Substack disadvantages:
- You have to build audience from scratch
- Worse SEO than Medium for searches like "perplexity research workflow"

Verdict: Medium better for single article that wants to be found. Substack better if you already have email list or want to build series of regular articles.

### Alternative 2: LemonSqueezy instead of Gumroad

LemonSqueezy advantages:
- Automatic EU tax handling (Merchant of Record)
- Slightly lower fees for low volume
- More modern interface

LemonSqueezy disadvantages:
- Account approval takes 2-3 days
- Audience less familiar with the brand

Verdict: Gumroad better for fast setup. LemonSqueezy better if you're in EU and want automatic VAT compliance (for an EU-based seller, LemonSqueezy may be preferable to avoid tax friction with EU digital sales under OSS threshold).

### Alternative 3: Paywalled article + free template

Reverse the logic: Medium article behind paywall (Members-only), free template.

Advantages:
- Medium Member-only earnings are much higher than free article (for every "read" by a member you get $0.10-0.50, vs $0 for non-members)
- Free template maximizes distribution

Disadvantages:
- Paywall reduces initial reach
- You can't promote the article to non-members (they only see the paywall)

Verdict: depends on goal. If you want maximum Medium payments, Members-only. If you want maximum reach and Gumroad conversion, free article + paid template.

**Recommendation**: free article. The Medium → Gumroad conversion is the main value multiplier. If the article is behind a paywall, you've closed the funnel.

### Winning combination for your case

Given a profile that prefers minimal active promotion and maximum automation:

1. **Free Medium article** (maximum discovery via SEO)
2. **GitHub Gist for free template** (zero friction)
3. **LemonSqueezy for $9 Pro template** (automatic compliance, cleaner tax handling)
4. **Passive email capture** via ConvertKit free (one-time, 1 hour setup)

No Twitter, no LinkedIn, no recurring community submission. The asset self-promotes via Medium SEO. You check stats once a month, max.

**Realistic earning expectation in this setup**: $50-300 in the first 6 months. Likely $100-200. Doesn't change your life. Gives you:
- Evergreen asset that, if you ever need a public reference of the method, you have
- Validation of techniques before serious work
- Possibly a small email audience (50-200 people) that grows over time

---

## 8. Final check before publishing

- [ ] All three files read and verified
- [ ] Placeholder links replaced with real URLs
- [ ] No mention of identifiable specifics (industry, technology stack, project names, specific professional role) in any of the publishable files
- [ ] Sample domains in the files kept neutral (fintech, biotech, climate-tech) and internal-project descriptions camouflaged as "regulated industry vertical", "AI production patterns", "niche technical territory"
- [ ] Numbers are consistent across all files (~$60, ~140K words, ~330 H2, ~1100 H3, 80 cat-5, 350 cat-4, 96-97% coverage)
- [ ] Medium tags chosen: AI, Perplexity, Productivity, Research, Writing
- [ ] Gumroad/LemonSqueezy pricing fixed: $9
- [ ] Cross-links Medium → Gist → Pro working
- [ ] Technical setup reference (Perplexity API, `advanced-deep-research` preset) consistent across article, free template (the "API request reference" module), and Pro (PART 4)
- [ ] JSON request numbers identical across the three files (max_output_tokens 128000, reasoning effort high, web_search + fetch_url)

When all checkboxes are ticked, publish. Period.

---

## 9. What NOT to do

- Don't respond to every Medium comment. Let the community self-moderate.
- Don't add tags beyond Medium's 5 limit. The system penalizes tag spam.
- Don't spam the link in other communities beyond the single initial submission.
- Don't update the article in the first 2 weeks. Let stats stabilize.
- Don't run paid promotion (Medium Promote, FB Ads). For a $9 side project there's no ROI.
- Don't write sequel articles before verifying the first one performs. Wait 4-6 weeks.
- Don't reveal details about the underlying real project (industry, stack, names) in comments, DMs, or interviews, even when asked. Public framing is "applied to a complex technical editorial project." Period.

---

## 10. Post-publication scenarios

Things that will likely happen in the first 60-180 days after publication, and how to handle them without wasting time or exposing yourself more than necessary.

### A. Someone comments on Medium asking "what project were you mapping?"

Sample reply, polite and firm:
> *"Thanks for reading. The specifics of the project are private for now — I'll publish more about it when it's ready. The workflow itself is independent of the domain, which is part of what makes it useful: you can apply the same 4-step pattern to your own area whether that's fintech, biotech, or anything else."*

Never reply with partial details hoping to "satisfy" curiosity. You open a loop and then you have to manage it. A short, polite, definitive answer closes the conversation better.

### B. Newsletter / podcast / technical blog reaches out for interview or feature

Binary decision:
- **If the source has audience >5K subscribers and serious profile**: say yes. Agree on format (short audio, email exchange, guest article). Stay on the workflow, not the project. Link Medium + Gumroad in the bio.
- **If the source is small or ambiguous**: say yes anyway, low cost. Same rule: workflow yes, project no.
- **If the source explicitly asks for project details**: reply that the project is private and that the interview only makes sense if the focus is the workflow. If they refuse, drop it.

Don't improvise technical answers about the Perplexity API in real-time audio interviews. If they ask for technical details, redirect to the Pro template which already has everything structured. "It's all in the Pro Edition, link in the description" is a valid answer and zeroes out verbal performance pressure.

### C. Perplexity changes pricing, preset, or API policy

Possible scenarios, pre-noted to avoid being caught off-guard:

- **Preset renamed or deprecated**: update the 3 publishable files (article, free template, Pro) with the new preset name, add an edit note at the bottom ("Updated [date]: preset renamed from advanced-deep-research to [new]"). Time: 20 minutes.
- **Pricing changes significantly**: if the average $3/session becomes $6+, update the table in the files and the "Cost variance" section of the Pro. Add edit note.
- **Feature removed (e.g., fetch_url disabled)**: update Pro troubleshooting (Failure mode 7 and Pattern D), add a "If your runtime no longer supports X" section with workarounds.
- **Perplexity introduces a better competitor preset**: tempting move to avoid → rewriting everything. Right move → publish a follow-up article "Updated workflow: [new preset] vs advanced-deep-research" linking to the first article. Creates a new asset, doesn't destroy the old one.

In all cases, **update files with visible datestamp** ("Last updated: [date]") at the top. Readers landing on the asset 12 months later appreciate knowing when info is fresh.

### D. Someone asks for paid consulting on the method

Three possible paths:
- **No thanks, decline politely**: "Thanks but I don't take consulting work right now. The Pro Edition has everything I would tell you in a 1:1 — at $9 it's the most cost-efficient way to get the method." Right answer if you don't want to manage engagements.
- **Yes but at gating rate**: "Consulting at $300/hour, 2-hour minimum. Most people find the $9 Pro Edition is enough — happy to recommend that first." Right answer if you want to monetize but discourage casuals.
- **Yes flat-fee on narrow scope**: "I can do a 60-minute call to review your specific research project and audit your prompts, $200 flat. Beyond that, the Pro Edition." Right answer if you want a small extra income without structural commitment.

Default: first option (polite decline). 1:1 consulting is incompatible with a side project that wants to be automated.

### E. Someone copies the article or template and republishes it as their own

Three severity levels:
- **Cites the source but changes title/structure**: ignorable. It's reworked fair use, happens always, also creates some link discovery.
- **Full copy without attribution**: if it's on Medium or platform with clear DMCA, file DMCA takedown (10 minutes). If it's on an obscure blog, ignore — not worth the time.
- **Sells the Pro template as their own on Gumroad/LemonSqueezy**: DMCA takedown on that platform. Selling platforms respond quickly because they have legal liability.

Don't start online wars. Rule: fast takedown if needed, no public callout. Public callout costs more time and energy than it's worth.

### F. Article is not performing and you're tempted to make big edits

Resist for the first 6 weeks. Medium SEO matures slowly. Articles that explode after 4-8 months are common. If at 8 weeks you have less than 200 total views, then:

1. Verify tags (Medium sometimes silently changes them)
2. Change subtitle (see alternatives in section 5B)
3. Add a "kicker image" if it didn't have one
4. Post once on a relevant community you haven't touched yet

Nothing more so far. Only after 4 months without signals, evaluate a more aggressive v2 of title or positioning.

### G. Pro sells but people request refund "not what I expected"

Expected refund rate on Gumroad/LemonSqueezy for $9 info products: 2-5%. If you're above 10%, there's a mismatch between promise and content.

What to do:
- Re-read the Pro sales description. Does it promise something not there? Reformulate.
- Add to the description a "What this Pro Edition does NOT do" section mirroring the "When this Pro Edition does NOT serve you" section already in the file. Filter upstream those who aren't the target.
- If the problem persists, consider: lower price ($5-7) or addition of bonus content (short cookbook of 1,500-2,000 words on a specific use case).

Never argue with someone requesting a refund. Grant it and learn from feedback.

---

## Pre-written useful texts

### Gumroad/LemonSqueezy description (3-4 sentences)

> *"The complete Perplexity Pro research workflow with three fully worked case studies, troubleshooting guide, advanced patterns, cost optimization, and full API configuration reference. Built from 20 deep research sessions across 6 months using the `advanced-deep-research` preset. Companion to the Medium article. One-time purchase, free updates. Includes anti-hype gate so you can self-select out before buying — this isn't for everyone."*

### Gumroad auto-confirm email (if you set it)

> *"Thank you for purchasing the Pro Edition. Inside you'll find three case studies, a troubleshooting guide for prompts that go sideways, advanced patterns for multi-session research, cost optimization notes, and the full API configuration reference. Skip to Part 1 if you want to see the workflow in action; skip to Part 4 if you want the technical setup; skip to Part 7 if you've already read the article and want the synthesis. — [your name]"*

### Launch tweet (if you decide to do it)

> *"I spent $60 on Perplexity Pro for 20 research sessions over 6 months — using the advanced-deep-research API preset, not the consumer subscription. Output equivalent in consultant hours: $15,000-$30,000. Wrote up the 4-step workflow + 6 epistemological principles. Free article + free template + Pro Edition. Link below. 🧵"*

---

## Frequently asked questions you might have

**"Do I really need to read the article before publishing it?"**
Yes. It's long, you might have opinions on specific sections. Find 30 minutes.

**"Can I modify the tone if it doesn't feel like mine?"**
Of course. But the current tone is calibrated for indie creator/technical writer audience: serious, evidence-based, anti-hype, occasional dry humor. Change it only if you have specific reason.

**"What do I do if the article doesn't get read?"**
Nothing for 6 weeks. Wait. Medium SEO maturity takes 3-6 months. If after 6 months <500 total views, the article is dead, accept it and learn for the next one. See also scenario F above.

**"What do I do if the Pro sells too well?"**
Nice problem to have. Consider: raising price to $14-19 (keep first 100 buyers at $9 as early access), or producing v2.0 with more content.

**"What do I do if someone copies the template and republishes it for free?"**
See scenario E above. In summary: fast takedown if needed, no public war.

**"What do I reply if asked for details about the real project?"**
See scenario A above. Short, polite, definitive answer. Never partial details.

**"Do I need to update the files every time Perplexity changes something?"**
Only if it changes in a way that materially impacts numbers or workflow. See scenario C above.

---

## Cross-publication strategy (English + Italian)

If you have both English and Italian versions of the article and templates available:

### Recommended publishing sequence

1. **English first** on Medium (larger audience, better SEO, Partner Program payouts)
2. **Italian second** on Medium (with Italian tags) AND/OR LinkedIn IT
3. Cross-link both versions in each other's footer ("Available also in [other language]")

### Why English first

- Medium's English audience is ~95% of total readership
- Italian content on Medium has lower discoverability
- Partner Program pays per English read, not per non-English
- English article on Hacker News / Indie Hackers / Reddit drives English traffic

### Why publish Italian at all

- LinkedIn IT and Substack IT have meaningful Italian audiences for tech/AI content
- Italian tech content on Medium has less competition (lower visibility but easier to rank)
- Localized version may rank for Italian-specific searches
- Helps with personal brand in Italian-speaking professional networks

### Practical tip

Set Italian publication 2-4 weeks after English. This way:
- You have engagement signal from English version to inform Italian version (better subtitle, see what tags worked)
- Italian readers don't see "this is just a translation" — feels like a fresh piece
- Spread workload: don't publish both at once

---

*Good launch.*

---

*Internal note (not public):*

*Anonymization approach: publishable files (01, 02, 03, 05, 06, 07) are at maximum cleanliness, zero intentional leaks. Operational and setup files (04, 08, project setup files) are clean but tolerate well-considered intentional leaks, never accidental. If in the future, after publication of the main project, you want to evaluate cryptic easter eggs for affectionate fans who may make the connection, see the note in `02_memoria_iniziale.md` "On the horizon" section.*
