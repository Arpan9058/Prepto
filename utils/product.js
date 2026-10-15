const { httpError } = require('../middleware/errors');
const categories = [
  'technical',
  'behavioral',
  'systemDesign',
  'aptitude',
  'reasoning',
  'automata',
  'englishComprehension',
  'personality',
];
const difficulties = ['easy', 'medium', 'hard'];
function id(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value))
    throw httpError(400, 'Invalid identifier');
  return value;
}
function text(value, name, max = 4000) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw httpError(400, `Invalid ${name}`);
  return value.trim();
}
function pageSize(value) {
  const n = value === undefined ? 12 : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 50) throw httpError(400, 'pageSize must be 1-50');
  return n;
}
function date(value) {
  return value?.toDate ? value.toDate() : new Date(value);
}
function iso(value) {
  return value ? date(value).toISOString() : null;
}
function publicQuestion(q, bookmark = false) {
  return {
    id: q.id,
    title: q.title,
    prompt: q.prompt,
    category: q.category,
    difficulty: q.difficulty,
    skills: q.skills,
    type: q.type,
    options: q.options,
    bookmarked: bookmark,
  };
}
function prefixes(input) {
  const result = new Set();
  for (const word of input.toLowerCase().match(/[\p{L}\p{N}_.+-]+/gu) || [])
    for (let i = 2; i <= Math.min(word.length, 40); i++) result.add(word.slice(0, i));
  return [...result];
}
function validateQuestion(body) {
  const title = text(body.title, 'title', 140),
    prompt = text(body.prompt, 'prompt');
  if (!categories.includes(body.category) || !difficulties.includes(body.difficulty))
    throw httpError(400, 'Invalid category or difficulty');
  if (!['multipleChoice', 'openEnded'].includes(body.type))
    throw httpError(400, 'Invalid question type');
  if (!Array.isArray(body.skills) || body.skills.length < 1 || body.skills.length > 5)
    throw httpError(400, 'Provide 1-5 skills');
  const skills = [...new Set(body.skills.map((s) => text(s, 'skill', 60)))];
  let options = [],
    answer = '';
  if (body.type === 'multipleChoice') {
    if (!Array.isArray(body.options) || body.options.length < 2 || body.options.length > 6)
      throw httpError(400, 'Provide 2-6 options');
    options = body.options.map((o) => text(o, 'option', 200));
    if (new Set(options).size !== options.length || !options.includes(body.answer))
      throw httpError(400, 'Invalid options or correct answer');
    answer = body.answer;
  }
  const explanation = text(body.explanation, 'explanation', 4000);
  return {
    title,
    prompt,
    category: body.category,
    difficulty: body.difficulty,
    type: body.type,
    skills,
    options,
    answer,
    explanation,
    searchPrefixes: prefixes(`${title} ${skills.join(' ')}`),
  };
}
module.exports = {
  categories,
  difficulties,
  id,
  text,
  pageSize,
  iso,
  date,
  publicQuestion,
  validateQuestion,
};
