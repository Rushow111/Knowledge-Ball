import { isLikelyEnglish, needsEnglishTranslation } from './KnowledgeLanguage';

function expect(value: boolean, expected: boolean): void {
  if (value !== expected) throw new Error(`Expected ${expected}, received ${value}`);
}

expect(isLikelyEnglish('Prime numbers have exactly two positive divisors.'), true);
expect(isLikelyEnglish('质数只有两个正因数。'), false);
expect(needsEnglishTranslation({ title: '质数', reasoning: 'It has two divisors.' }), true);
expect(needsEnglishTranslation({ title: 'Prime number', reasoning: 'It has two divisors.' }), false);

console.log('Knowledge language regression tests passed.');
