import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAskBlock,
  parseDoneBlock,
  stripProtocolBlocks,
  mapChoice,
  formatAnswers,
  interpretReply,
  formatQuestionsForTelegram,
  buildRecap,
  recapSource,
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

test('buildRecap prefers the done block, falls back to a preview', () => {
  const recap = buildRecap('ignored', { summary: 'Did the thing.', actions: ['Run tests'] });
  assert.match(recap, /Did the thing\./);
  assert.match(recap, /• Run tests/);

  const fallback = buildRecap('A plain answer with no block.', null);
  assert.match(fallback, /A plain answer with no block\./);

  const empty = buildRecap('', { summary: 'Done.', actions: [] });
  assert.match(empty, /Nothing needed from you\./);
});

test('buildRecap truncates a long preview with an ellipsis', () => {
  const long = buildRecap('x'.repeat(400), null);
  assert.match(long, /…$/);
  assert.ok(!long.includes('x'.repeat(281)), 'preview is clipped to 280 chars');

  const short = buildRecap('Short and sweet.', null);
  assert.match(short, /Short and sweet\.$/);
  assert.ok(!short.includes('…'), 'a short answer is not given a trailing ellipsis');
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
