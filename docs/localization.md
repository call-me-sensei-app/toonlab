# Localization

ToonLab’s user-facing shell and documentation entry points support the same 22
languages used by Call Me Sensei. The language picker is available in the site
header and in every Lab editor command row. It stores the selection in
`toonlab.locale` and also accepts `?lang=<code>` for a shareable URL.

## Supported languages

`en`, `ja`, `ko`, `zh`, `es`, `fr`, `de`, `pt`, `pt-BR`, `it`, `ru`, `id`,
`vi`, `th`, `tr`, `hi`, `ar`, `bn`, `ms`, `nl`, `pl`, and `sv`.

Translations live in `src/i18n/locales.js`. Keep the locale order and codes in
sync with Call Me Sensei. New copy belongs in the English source object first,
then in every locale object; use each language’s native script and natural UI
wording rather than transliterating English labels.

## What is translated

- Navigation, Lab-home labels, status badges, editor menus, language controls,
  and the documentation landing guidance.
- README instructions that explain how to start the server and open `/docs/`.
- Language metadata, including native names and circular flag indicators.

Technical identifiers are intentionally not translated: code, package names,
API names, URLs, creation types, and serialized document fields must remain
stable so that users can copy examples and load saved documents in every
language.

## Release checklist

- [x] Use the canonical 22-language list and native language names.
- [x] Keep the OSS site header, Labs home, editor headers, and docs portal on
  one locale source.
- [x] Persist a user’s choice and support a `?lang=` URL override.
- [x] Keep flag indicators compact, circular, keyboard-accessible, and paired
  with a native-language dropdown label.
- [x] Add a local README path to the complete docs portal.
- [x] Verify every locale has a non-empty value for every shared UI key.
- [x] Run `npm run verify:localization` before release.
- [ ] Have a native speaker review any new product-specific copy before adding
  it to the shared catalog.
