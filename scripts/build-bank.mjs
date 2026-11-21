import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import katex from '../vendor/katex/katex.min.js';

const topicById = new Map();
const questionById = new Map();
let formulaCount = 0;

function checkText(text, id) {
  assert(typeof text === 'string' && text.trim(), 'Missing text in ' + id);
  const formulas = [...text.matchAll(/\$\$([\s\S]+?)\$\$|\$([^$\n]+)\$/g)];
  for (const match of formulas) {
    const formula = match[1] ?? match[2];
    assert(!/\d\s*\/\s*\d/.test(formula), 'Use a typeset fraction in ' + id);
    try {
      katex.renderToString(formula, { throwOnError: true, displayMode: !!match[1] });
    } catch (error) {
      throw new Error(id + ': ' + error.message);
    }
    formulaCount++;
  }
  assert(!text.replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+\$/g, '').includes('$'), 'Unmatched delimiter in ' + id);
}

function checkPair(pair, id) {
  checkText(pair?.zh, id);
  checkText(pair?.en, id);
}

for (const course of ['026', '028']) {
  const file = new URL('../content/' + course + '.json', import.meta.url);
  const part = JSON.parse(await readFile(file, 'utf8'));
  for (const topic of part.topics) {
    assert(!topicById.has(topic.id) && topic.course === course, 'Invalid topic ' + topic.id);
    checkPair(topic, topic.id);
    checkPair({ zh: topic.summaryZh, en: topic.summaryEn }, topic.id);
    for (const term of topic.terms) checkPair(term, topic.id);
    topicById.set(topic.id, topic);
  }
  for (const q of part.questions) {
    assert(q.id.startsWith(course + '-') && q.course === course, 'Course mismatch ' + q.id);
    assert(!questionById.has(q.id) && topicById.get(q.topic)?.course === course, 'Invalid question/topic ' + q.id);
    assert([1, 2, 3].includes(q.level), 'Invalid difficulty ' + q.id);
    checkPair(q.prompt, q.id);
    assert(q.solution.length > 0, 'Missing solution ' + q.id);
    for (const method of q.solution) {
      assert(method.steps.length > 0, 'Missing steps ' + q.id);
      checkPair(method.title, q.id);
      for (const step of method.steps) checkPair(step, q.id);
    }
    switch (q.type) {
      case 'choice': {
        const choices = new Set(q.options.map(o => o.id));
        assert(choices.size === q.options.length && choices.size >= 2, 'Invalid options ' + q.id);
        assert(q.answers.length === 1 && choices.has(q.answers[0]), 'Invalid answer ' + q.id);
        for (const option of q.options) checkPair(option, q.id);
        break;
      }
      case 'true-false':
        assert(q.answers.length === 1 && ['true', 'false'].includes(q.answers[0]), 'Invalid judgment ' + q.id);
        break;
      case 'short':
        assert(q.answers.length && q.answers.every(a => typeof a === 'string' && a.trim()), 'Missing answer ' + q.id);
        break;
      case 'written':
        break;
      default:
        throw new Error('Unknown question type ' + q.type);
    }
    questionById.set(q.id, q);
  }
}

const questions = [...questionById.values()];
for (const q of questions) {
  for (const id of q.related ?? []) {
    assert(id !== q.id && questionById.get(id)?.topic === q.topic, 'Invalid related question ' + q.id + ' → ' + id);
  }
}
const bank = { version: 1, topics: [...topicById.values()], questions };
await writeFile(new URL('../bank.json', import.meta.url), JSON.stringify(bank, null, 2) + '\n');
console.log(questions.length + ' questions, ' + bank.topics.length + ' topics, ' + formulaCount + ' KaTeX expressions validated.');
for (const course of ['026', '028']) {
  const items = questions.filter(q => q.course === course);
  const counts = field => Object.fromEntries([...new Set(items.map(q => q[field]))]
    .map(value => [value, items.filter(q => q[field] === value).length]));
  console.log(course, 'formats', counts('type'), 'levels', counts('level'));
}
