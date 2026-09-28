// Labs home page: renders the card grids from labsShowcase.js and runs the
// scroll-reveal. The legacy-URL redirect runs inline in index.html <head>
// (before paint) so this module only ever executes for real home visits.

import '../shared/siteHeader.js';
import {
  BETA_LAB_GROUPS,
  BETA_LABS_SHOWCASE,
  DEMOS_SHOWCASE,
} from './labsShowcase.js';
import { applyTranslations, getCopy, getLocale, localizeTemplate } from '../../src/i18n/locales.js';

const SHOTS_BASE = '/home/shots/';
const locale = getLocale();
const copy = getCopy(locale);

const GROUP_COPY_BY_ID = Object.freeze({
  shaders: ['shading', 'shadingDescription'],
  'asset-generation': ['assets', 'assetsDescription'],
  'source-texture-generation': ['textures', 'texturesDescription'],
});

function renderCard(lab) {
  const card = document.createElement('a');
  card.className = 'lab-card';
  card.href = lab.href;

  const media = document.createElement('div');
  media.className = 'lab-card-media';

  const index = document.createElement('span');
  index.className = 'lab-card-index';
  index.textContent = lab.i;

  const jp = document.createElement('span');
  jp.className = 'lab-card-jp';
  jp.textContent = lab.jp;

  const glyph = document.createElement('span');
  glyph.className = 'lab-card-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = lab.jp.slice(0, 1);

  const img = document.createElement('img');
  img.src = `${SHOTS_BASE}${lab.id}.png`;
  img.alt = `${lab.title} — live screenshot`;
  img.loading = 'lazy';
  img.addEventListener('error', () => {
    media.classList.add('lab-card-media--flat');
  });

  const status = document.createElement('span');
  status.className = 'lab-card-status';
  status.textContent = lab.labStatus === 'validation' ? copy.demo : copy.beta;

  media.append(index, jp, glyph, img, status);

  const body = document.createElement('div');
  body.className = 'lab-card-body';

  const text = document.createElement('div');
  if (lab.family) {
    const family = document.createElement('div');
    family.className = 'lab-card-family';
    family.textContent = `${lab.family} ${copy.family}`;
    text.append(family);
  }
  const target = document.createElement('div');
  target.className = 'lab-card-target';
  target.textContent = lab.npm;
  const artifact = document.createElement('div');
  artifact.className = 'lab-card-artifact';
  artifact.textContent = `${lab.artifact} · ${copy.preview}`;
  const title = document.createElement('h3');
  title.textContent = lab.title;
  const desc = document.createElement('p');
  desc.textContent = lab.desc;
  text.append(target, artifact, title, desc);

  const arrow = document.createElement('span');
  arrow.className = 'lab-card-arrow';
  arrow.textContent = '→';

  body.append(text, arrow);
  card.append(media, body);
  return card;
}

function renderBetaGroups(containerId, groups) {
  const container = document.getElementById(containerId);
  if (!container) return;
  for (const group of groups) {
    const section = document.createElement('section');
    section.className = 'lab-product-group';

    const heading = document.createElement('div');
    heading.className = 'lab-product-group-heading';
    heading.dataset.reveal = '';

    const title = document.createElement('h3');
    title.id = `beta-group-${group.id}`;
    const groupCopyKeys = GROUP_COPY_BY_ID[group.id];
    title.textContent = groupCopyKeys ? copy[groupCopyKeys[0]] : group.label;
    section.setAttribute('aria-labelledby', title.id);

    const description = document.createElement('p');
    description.textContent = groupCopyKeys ? copy[groupCopyKeys[1]] : group.description;
    heading.append(title, description);

    const grid = document.createElement('div');
    grid.className = 'lab-grid';
    grid.dataset.revealStagger = '';
    grid.setAttribute('aria-labelledby', title.id);
    for (const lab of group.entries) grid.appendChild(renderCard(lab));

    section.append(heading, grid);
    container.appendChild(section);
  }
}

function renderExample(containerId, exampleId) {
  const container = document.getElementById(containerId);
  const example = DEMOS_SHOWCASE.find((entry) => entry.id === exampleId);
  if (!container || !example) return;
  container.appendChild(renderCard(example));
}

applyTranslations(document, locale);
renderBetaGroups('betaLabGroups', BETA_LAB_GROUPS);
renderExample('walkableSampleGrid', 'water-playground');

const homeExplore = document.querySelector('[data-home-explore]');
if (homeExplore) homeExplore.textContent = localizeTemplate(copy.explore, locale, { count: BETA_LABS_SHOWCASE.length });

// Scroll reveal: single elements carry data-reveal; grids carry
// data-reveal-stagger and stamp --reveal-i per child for the cascade.
function initReveal() {
  const singles = [...document.querySelectorAll('[data-reveal]')];
  const staggerChildren = [];
  for (const group of document.querySelectorAll('[data-reveal-stagger]')) {
    [...group.children].forEach((child, i) => {
      child.style.setProperty('--reveal-i', String(i % 12));
      staggerChildren.push(child);
    });
  }
  const targets = [...singles, ...staggerChildren];

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    for (const el of targets) el.classList.add('is-revealed');
    return;
  }

  const observer = new IntersectionObserver((observed) => {
    for (const item of observed) {
      if (!item.isIntersecting) continue;
      item.target.classList.add('is-revealed');
      observer.unobserve(item.target);
    }
  }, { rootMargin: '0px 0px -8% 0px' });

  for (const el of targets) observer.observe(el);
}

initReveal();

// Automation gate (repo convention: verify scripts wait on body.dataset).
document.body.dataset.homeReady = 'true';
