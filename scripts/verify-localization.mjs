import assert from 'node:assert/strict';
import { getCopy, getLanguageOptions } from '../src/i18n/locales.js';
import { readFile } from 'node:fs/promises';

const expected = ['en', 'ja', 'ko', 'zh', 'es', 'fr', 'de', 'pt', 'pt-BR', 'it', 'ru', 'id', 'vi', 'th', 'tr', 'hi', 'ar', 'bn', 'ms', 'nl', 'pl', 'sv'];
const options = getLanguageOptions();
assert.deepEqual(options.map(({ code }) => code), expected, 'language catalog must match Call Me Sensei’s 22-language contract');
for (const { code, flagCode } of options) {
  assert.match(flagCode, /^[a-z]{2}$/, `${code} must use a two-letter SVG flag code`);
  await readFile(new URL(`../public/flags/${flagCode}.svg`, import.meta.url));
}

const keys = Object.keys(getCopy('en'));
for (const { code } of options) {
  const copy = getCopy(code);
  for (const key of keys) {
    assert.equal(typeof copy[key], 'string', `${code}.${key} must be a string`);
    assert.ok(copy[key].trim(), `${code}.${key} must not be empty`);
  }
}

const checks = [
  ['labs/shared/siteHeader.js', 'data-language-picker'],
  ['labs/home/main.js', 'applyTranslations'],
  ['docs/main.jsx', 'DocsLanguageBanner'],
  ['README.md', 'Open the full documentation locally'],
];
for (const [file, marker] of checks) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.ok(source.includes(marker), `${file} must expose ${marker}`);
}

console.log(`Localization verified: ${options.length} locales, ${keys.length} shared copy keys, shell/docs hooks present.`);
