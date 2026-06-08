import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAskBlock,
  parseImplicitAsk,
  trailingQuestion,
  parseDoneBlock,
  stripProtocolBlocks,
  mapChoice,
  formatAnswers,
  interpretReply,
  formatQuestionsForTelegram,
  buildRecap,
  recapSource,
  previewText,
  escapeHtml,
  ProtocolStreamFilter,
} from '../src/protocol.js';

const ASK = [
  'Sure, a couple of things first.',
  '',
  '```aurora:ask',
  '{"questions":[{"header":"DB","question":"Which database?","options":["Postgres","SQLite"],"multiSelect":false}]}',
  '```',
].join('\n');

const DONE = [
  'All wired up.',
  '',
  '```aurora:done',
  '{"summary":"Added the cache layer.","actions":["Run npm test","Set REDIS_URL"]}',
  '```',
].join('\n');

test('parseAskBlock extracts and normalizes questions', () => {
  const ask = parseAskBlock(ASK);
  assert.ok(ask);
  assert.equal(ask.questions.length, 1);
  assert.equal(ask.questions[0].header, 'DB');
  assert.equal(ask.questions[0].question, 'Which database?');
  assert.deepEqual(ask.questions[0].options, ['Postgres', 'SQLite']);
  assert.equal(ask.questions[0].multiSelect, false);
});

test('parseAskBlock returns null when absent or malformed', () => {
  assert.equal(parseAskBlock('just an answer, no block'), null);
  assert.equal(parseAskBlock('```aurora:ask\nnot json\n```'), null);
  // A block with no valid question is treated as no question.
  assert.equal(parseAskBlock('```aurora:ask\n{"questions":[{"options":["a"]}]}\n```'), null);
});

test('trailingQuestion catches a question only at the very end', () => {
  assert.equal(trailingQuestion('Which database should I use?'), 'Which database should I use?');
  // Returns just the final sentence, not the whole paragraph.
  assert.equal(
    trailingQuestion('Here are the options. Which one do you prefer?'),
    'Which one do you prefer?',
  );
  // Allows a trailing closing bracket after the question mark (still matches).
  assert.ok(trailingQuestion('Should I ship it (yes/no)?)'));
  // A rhetorical question the model then answers itself does NOT match.
  assert.equal(trailingQuestion('Why does this matter? Because latency adds up.'), null);
  assert.equal(trailingQuestion('A statement with no question.'), null);
  assert.equal(trailingQuestion(''), null);
});

test('parseImplicitAsk recovers a prose question the model did not wrap', () => {
  const ask = parseImplicitAsk('I can do that. Should I target Postgres or SQLite?');
  assert.ok(ask);
  assert.equal(ask.questions.length, 1);
  assert.equal(ask.questions[0].question, 'Should I target Postgres or SQLite?');
  assert.deepEqual(ask.questions[0].options, []);
  assert.equal(ask.questions[0].multiSelect, false);
});

test('parseImplicitAsk yields to explicit blocks and ignores non-questions', () => {
  // An explicit ask block wins — no implicit fallback.
  assert.equal(parseImplicitAsk(ASK), null);
  // A done block means the model declared itself finished; a trailing question
  // there is rhetorical and must not re-open the turn.
  const doneWithQ =
    'All set — want me to keep going?\n```aurora:done\n{"summary":"x","actions":[]}\n```';
  assert.equal(parseImplicitAsk(doneWithQ), null);
  // A plain finished answer is not an ask.
  assert.equal(parseImplicitAsk('Here is the final report. Done.'), null);
});

test('parseDoneBlock extracts summary and actions', () => {
  const done = parseDoneBlock(DONE);
  assert.ok(done);
  assert.equal(done.summary, 'Added the cache layer.');
  assert.deepEqual(done.actions, ['Run npm test', 'Set REDIS_URL']);
  assert.equal(parseDoneBlock('no block'), null);
  assert.equal(parseDoneBlock('```aurora:done\n{"actions":[]}\n```'), null);
});

test('stripProtocolBlocks removes blocks and trims blank lines', () => {
  const clean = stripProtocolBlocks(ASK);
  assert.equal(clean, 'Sure, a couple of things first.');
  assert.doesNotMatch(clean, /aurora:ask/);
  // Normal markdown code fences are left untouched.
  const md = 'Here:\n```js\nconst x = 1;\n```';
  assert.equal(stripProtocolBlocks(md), md);
});

test('mapChoice maps numbers to options and passes through free text', () => {
  const q = { options: ['Postgres', 'SQLite'], multiSelect: false };
  assert.equal(mapChoice('1', q), 'Postgres');
  assert.equal(mapChoice('2', q), 'SQLite');
  assert.equal(mapChoice('MySQL please', q), 'MySQL please');
  assert.equal(mapChoice('', q), '(no answer)');
  const multi = { options: ['a', 'b', 'c'], multiSelect: true };
  assert.equal(mapChoice('1, 3', multi), 'a, c');
  // No options → the raw text is the answer.
  assert.equal(mapChoice('blue', { options: [] }), 'blue');
});

test('formatAnswers labels each answer by header', () => {
  const questions = [
    { header: 'DB', question: 'x', options: [] },
    { header: '', question: 'y', options: [] },
  ];
  assert.equal(
    formatAnswers(questions, ['Postgres', 'soon']),
    'My answers — DB: Postgres; Q2: soon.',
  );
});

test('interpretReply aligns a single message to one or many questions', () => {
  const one = [{ options: ['Postgres', 'SQLite'], multiSelect: false }];
  assert.deepEqual(interpretReply('1', one), ['Postgres']);
  assert.deepEqual(interpretReply('a custom answer', one), ['a custom answer']);
  const two = [
    { options: ['Postgres', 'SQLite'], multiSelect: false },
    { options: [], multiSelect: false },
  ];
  assert.deepEqual(interpretReply('2; tomorrow', two), ['SQLite', 'tomorrow']);
});

test('formatQuestionsForTelegram numbers options as plain text', () => {
  const msg = formatQuestionsForTelegram([
    {
      header: 'DB',
      question: 'Which database?',
      options: ['Postgres', 'SQLite'],
      multiSelect: false,
    },
  ]);
  assert.match(msg, /Which database\?/);
  assert.match(msg, /1\. Postgres/);
  assert.match(msg, /2\. SQLite/);
});

test('escapeHtml escapes only the markup-significant characters', () => {
  assert.equal(escapeHtml('a < b && c > d'), 'a &lt; b &amp;&amp; c &gt; d');
  assert.equal(escapeHtml('<b>x</b>'), '&lt;b&gt;x&lt;/b&gt;');
  assert.equal(escapeHtml('plain text'), 'plain text');
  assert.equal(escapeHtml(null), '');
  // Quotes are left alone — we never emit attribute values.
  assert.equal(escapeHtml(`"it's fine"`), `"it's fine"`);
});

test('buildRecap renders the done block as a styled Done / Next steps card', () => {
  const recap = buildRecap('ignored', { summary: 'Did the thing.', actions: ['Run tests'] });
  assert.match(recap, /<b>Aurora finished<\/b>/);
  assert.match(recap, /Did the thing\./);
  assert.match(recap, /<b>Next steps<\/b>/);
  assert.match(recap, /• Run tests/);

  const empty = buildRecap('', { summary: 'Done.', actions: [] });
  assert.match(empty, /Nothing needed from you\./);
  assert.ok(!empty.includes('<b>Next steps</b>'), 'no Next steps header when there are no actions');
});

test('buildRecap escapes HTML in the done summary and actions', () => {
  const recap = buildRecap('ignored', {
    summary: 'Wired <Foo> & <Bar>.',
    actions: ['Set A=1 && B=2'],
  });
  assert.match(recap, /Wired &lt;Foo&gt; &amp; &lt;Bar&gt;\./);
  assert.match(recap, /Set A=1 &amp;&amp; B=2/);
  assert.ok(!recap.includes('<Foo>'), 'raw angle brackets from content are escaped');
});

test('buildRecap falls back to an escaped preview when there is no done block', () => {
  const fallback = buildRecap('A plain answer with no block.', null);
  assert.match(fallback, /<b>Aurora finished a turn<\/b>/);
  assert.match(fallback, /A plain answer with no block\./);

  const long = buildRecap('x'.repeat(700), null);
  assert.match(long, /…$/);
  assert.ok(!long.includes('x'.repeat(501)), 'preview is clipped to 500 chars');

  const tagged = buildRecap('see <script> tags', null);
  assert.match(tagged, /see &lt;script&gt; tags/);
});

test('recapSource prefers the final result message over the full narration', () => {
  // A tool-using turn: the narration opens with preamble; the result is the end.
  const narration = 'On it, let me run the gate.\n[work]\n✅ Pushed + promoted v0.3.5.';
  const finalMessage = '✅ Pushed + promoted v0.3.5.';
  assert.equal(recapSource(finalMessage, narration), '✅ Pushed + promoted v0.3.5.');

  // The conclusion drives the recap preview, not the stale opening line.
  const recap = buildRecap(recapSource(finalMessage, narration), null);
  assert.match(recap, /Pushed \+ promoted/);
  assert.ok(!recap.includes('On it, let me run the gate'), 'preamble is not previewed');
});

test('previewText returns the whole body when it fits the limit', () => {
  const body = 'Short and complete.';
  assert.equal(previewText(body, 500), body);
});

test('previewText keeps whole sentences and never cuts a word in half', () => {
  // three sentences; budget admits the first two but not the third
  const body =
    'First sentence is here. Second sentence is here too. ' + 'word '.repeat(40).trim() + '.';
  const out = previewText(body, 60);
  assert.ok(out.endsWith(' …'), 'ends with an ellipsis marker');
  assert.ok(out.startsWith('First sentence is here.'), 'starts at the beginning');
  // the preview must be made of WHOLE words — no token is a fragment of a longer one
  const lastWord = out.replace(/ …$/, '').split(' ').pop();
  assert.ok(/[.!?]$/.test(lastWord), 'preview ends on a sentence boundary');
});

test('previewText falls back to a word boundary when the first sentence is too long', () => {
  const body =
    'thisisoneverylongrunon ' + 'alpha beta gamma delta epsilon zeta eta theta '.repeat(20);
  const out = previewText(body, 50);
  assert.ok(out.endsWith('…'), 'marked as truncated');
  assert.ok(out.length <= 51, 'within the budget');
  assert.ok(!/\S…$/.test(out) || out.lastIndexOf(' ') > 0, 'broke on a space, not mid-word');
  // never splits a word: the char before the trailing content is a full token
  const beforeEllipsis = out.slice(0, -1).trimEnd();
  assert.ok(!beforeEllipsis.endsWith('alph') && !beforeEllipsis.endsWith('bet'));
});

test('recapSource strips protocol blocks and falls back to the narration', () => {
  const withBlock = 'Here is the answer.\n```aurora:done\n{"summary":"x","actions":[]}\n```';
  assert.equal(recapSource(withBlock, 'narration'), 'Here is the answer.');

  // No final message (a block-only turn that streamed nothing): use the narration.
  assert.equal(recapSource('', 'the streamed narration'), 'the streamed narration');
  assert.equal(recapSource(null, 'the streamed narration'), 'the streamed narration');
  assert.equal(recapSource('   ', 'the streamed narration'), 'the streamed narration');
});

test('ProtocolStreamFilter suppresses a block even when split across chunks', () => {
  const f = new ProtocolStreamFilter();
  let visible = '';
  // The fence marker is split across these chunks on purpose.
  for (const chunk of ['Hello there. ', '``', '`aurora:ask\n{"questions"', ':[]}\n```']) {
    visible += f.push(chunk);
  }
  visible += f.end();
  assert.equal(visible, 'Hello there. ');
  assert.match(f.full, /aurora:ask/);
});

test('ProtocolStreamFilter passes normal code fences through', () => {
  const f = new ProtocolStreamFilter();
  let visible = '';
  for (const chunk of ['Here: ', '```js\n', 'const x = 1;\n', '```']) visible += f.push(chunk);
  visible += f.end();
  assert.equal(visible, 'Here: ```js\nconst x = 1;\n```');
});
