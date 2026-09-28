// User documentation for the OSS package and its 15 live Labs. Hosted features
// are labeled explicitly and link to toonlab.io. The settings reference renders
// the generated settings-reference.md from this folder.
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { marked } from 'marked';
import {
  BookOpenText,
  Bot,
  Check,
  Copy,
  Crown,
  Lightbulb,
  Plug,
  Sparkles,
  TerminalSquare,
} from 'lucide-react';
import settingsReferenceRaw from './settings-reference.md?raw';
import labPreviewEnvironmentRaw from './lab-preview-environment.md?raw';
import rockShaderRaw from './rock-shader.md?raw';
import openAssetLibraryRaw from './open-asset-library.md?raw';
import generatedAssetLabelingRaw from './generated-asset-labeling.md?raw';
import stylesAndBundlesRaw from './styles-and-bundles.md?raw';
import capabilityStatusRaw from './capability-status.md?raw';
import urbanPropSurfaceRolesRaw from './urban-prop-surface-roles.md?raw';
import { LIVE_LAB_DOCUMENTATION } from '../labs/shared/liveLabDocumentation.js';
import '../labs/shared/siteHeader.js';
import { getCopy, getLocale } from '../src/i18n/locales.js';
import './docs.css';

const GITHUB = 'https://github.com/call-me-sensei-app/toonlab';

function DocsLanguageBanner() {
  const copy = getCopy(getLocale());
  return (
    <aside className="docs-language-banner" role="note">
      <strong>{copy.docsLanguageNotice}</strong>
      <span>{copy.docsLocalHint}</span>
    </aside>
  );
}

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="docs-codeblock-copy"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function CodeBlock({ code, label }) {
  return (
    <div className="docs-codeblock">
      {label && <div className="docs-codeblock-label">{label}</div>}
      <pre><code>{code}</code></pre>
      <CopyButton value={code} />
    </div>
  );
}

function PromptBlock({ title, prompt, note, pro }) {
  return (
    <div className="docs-promptblock">
      <span className="docs-promptblock-title">
        {title}
        {pro && <span className="docs-pro">Pro</span>}
      </span>
      <CodeBlock code={prompt} />
      {note && <p className="docs-promptblock-note">{note}</p>}
    </div>
  );
}

function ProBadge() {
  return <span className="docs-pro">Pro</span>;
}

function LiveLabs() {
  useEffect(() => {
    const scrollToLab = () => {
      const labId = window.location.hash.match(/^#\/labs\/([^/]+)/)?.[1];
      if (labId) requestAnimationFrame(() => document.getElementById(labId)?.scrollIntoView({ block: 'start' }));
    };
    scrollToLab();
    window.addEventListener('hashchange', scrollToLab);
    return () => window.removeEventListener('hashchange', scrollToLab);
  }, []);

  return (
    <article>
      <div className="docs-eyebrow">Public Beta</div>
      <h1>The 15 live ToonLab Labs</h1>
      <p className="docs-lede">
        Each Lab owns one focused, portable artifact. Preview cameras, lighting, stages, playback,
        weather, and comparison helpers are deliberately not saved unless the Lab explicitly says
        otherwise. Use <strong>Help → Documentation</strong> inside any editor to return directly
        to its section below.
      </p>
      <div className="docs-callout">
        <Bot size={16} aria-hidden />
        <span>
          <strong>Using MCP?</strong> Call <code>list_live_labs</code>, then{' '}
          <code>get_lab_features</code> for the exhaustive field schema, document discriminator,
          starter document, supported mutations, output capabilities, and preview boundary.
        </span>
      </div>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead><tr><th>Lab</th><th>Saved artifact</th><th>Runtime</th></tr></thead>
          <tbody>
            {LIVE_LAB_DOCUMENTATION.map((lab) => (
              <tr key={lab.id}>
                <td><a href={`#/labs/${lab.id}`}>{lab.title}</a></td>
                <td><code>{lab.creationType}</code></td>
                <td><code>{lab.runtime}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="docs-md">
        {LIVE_LAB_DOCUMENTATION.map((lab) => (
          <section id={lab.id} key={lab.id}>
            <h2>{lab.title}</h2>
            <p>{lab.summary}</p>
            <p><strong>Saved artifact:</strong> {lab.artifact} — <code>{lab.creationType}</code></p>
            <p><strong>Runtime:</strong> <code>{lab.runtime}</code></p>
            <h3>Recommended workflow</h3>
            <ol>{lab.workflow.map((step) => <li key={step}>{step}</li>)}</ol>
            <h3>Editable controls</h3>
            <ul>{lab.controls.map((control) => <li key={control}>{control}</li>)}</ul>
            <h3>Preview-only state</h3>
            <p>{lab.previewOnly.join(', ')}. This state is for evaluation and is not part of the portable artifact.</p>
            {lab.relatedDocs.length > 0 && (
              <p>
                <strong>Related runtime documentation:</strong>{' '}
                {lab.relatedDocs.map((doc, index) => (
                  <span key={doc}>
                    {index > 0 && ', '}
                    <a href={`${GITHUB}/blob/main/docs/${doc}`} target="_blank" rel="noreferrer">{doc}</a>
                  </span>
                ))}
              </p>
            )}
          </section>
        ))}
      </div>
    </article>
  );
}

/* ---------------------------------------------------------------- overview */

function Overview() {
  const copy = getCopy(getLocale());
  return (
    <article>
      <div className="docs-eyebrow">{copy.docsKicker}</div>
      <h1>{copy.docsTitle}</h1>
      <p className="docs-lede">{copy.docsLede}</p>

      <DocsLanguageBanner />

      <p>
        ToonLab 0.5.0 is an open-source anime rendering and content-integration runtime for
        Three.js, plus browser Labs for focused shader and asset authoring. For a compliant,
        semantically labeled scene, the Call Me Sensei bundle owns the supported visual baseline.
        It does not invent a polished world, layout, or unambiguous material contract from one prompt.
      </p>

      <h2>The pieces</h2>
      <ul>
        <li>
          <strong>The runtime library</strong> —{' '}
          <a href="https://www.npmjs.com/package/@call-me-sensei/toonlab" target="_blank" rel="noreferrer">
            <code>@call-me-sensei/toonlab</code>
          </a>
          : focused shading, vegetation, water, sky, cloud, post, asset, and texture tools. Host
          games own scene construction, camera behavior, gameplay, dynamic physics,
          navigation, and renderer setup. Labeled static solids receive conservative
          package-owned collision through the high-level scene runtime.
        </li>
        <li>
          <strong>The Labs</strong> — fifteen focused editors served by <code>npm run dev</code>
          or hosted at <a href="https://toonlab.io" target="_blank"
          rel="noreferrer">toonlab.io</a>. Each Lab documents what it edits, previews, saves,
          and exports.
        </li>
        <li>
          <strong>The local MCP server</strong> — bundled with the package: your coding agent
          searches the procedural catalog and public CC0 sources, reads and saves presets, and
          imports assets into an on-disk <code>.toonlab/</code> workspace. With optional local
          provider keys it also exposes image generation, Meshy 7 image/multiview-to-3D, the
          selected-image-model concept-to-Meshy workflow, and Tripo generation/segmentation.
          Stdio, no OAuth.
        </li>
        <li>
          <strong>Managed generation and cloud library</strong> <ProBadge /> — toonlab.io adds a
          remote MCP server with managed credentials, credits/refunds, durable workers, stored
          characters, a cloud library, and the public gallery. Pro hosts the providers; it does
          not define a different Meshy workflow.
        </li>
      </ul>

      <h2>The optimal workflow</h2>
      <p>
        <span className="docs-step-label">01</span>
        <strong>Install the runtime and the agent skills.</strong> <code>npm install
        @call-me-sensei/toonlab</code>, then copy the feature skills from the installed
        package&apos;s <code>agents/</code> directory into your project. They teach the agent the
        assembly order, frame-loop contract, and each subsystem&apos;s API. Start with{' '}
        <code>game-dev</code>. The package contains no lab applications or visual assets.
      </p>
      <p>
        <span className="docs-step-label">02</span>
        <strong>Connect the local MCP server.</strong> See <a href="#/mcp">Connect via MCP</a> —
        one JSON block, no account. Your agent can now find or import assets and share presets
        with the labs through <code>.toonlab/</code>.
      </p>
      <p>
        <span className="docs-step-label">03</span>
        <strong>Author focused looks visually, apply them to supplied content.</strong> Tune one
        shader, asset, or qualified system at a time, export portable presets, and compose only
        the approved domains into a local style bundle.
      </p>
      <p>
        <span className="docs-step-label">04</span>
        <strong>Prompt, run, iterate in bounded steps.</strong> Give the agent an existing scene and
        one verifiable integration goal. Whole-world generation and automatic
        terrain/biome/coast/cliff design remain outside the focused Lab workflow.
      </p>

      <h2>Start here</h2>
      <div className="docs-cards">
        <a className="docs-card" href="/examples/walkable-reference/">
          <Sparkles size={18} aria-hidden />
          <strong>Walkable reference scene</strong>
          <span>Scene Three as one independent file: change time, character, and style bundle, or disable each shader domain.</span>
        </a>
        <a className="docs-card" href="#/capability-status">
          <BookOpenText size={18} aria-hidden />
          <strong>Current capability status</strong>
          <span>The 0.5.0 first-pass contract, host responsibilities, measured limits, and verification gates.</span>
        </a>
        <a className="docs-card" href="#/library">
          <BookOpenText size={18} aria-hidden />
          <strong>Using the library</strong>
          <span>Stylize an existing scene, author focused assets, and share portable settings.</span>
        </a>
        <a className="docs-card" href="#/styles-and-bundles">
          <Sparkles size={18} aria-hidden />
          <strong>Styles and bundles</strong>
          <span>Rendering domains, required labels, routing, fallbacks, and OSS ownership.</span>
        </a>
        <a className="docs-card" href="#/labs">
          <BookOpenText size={18} aria-hidden />
          <strong>The 15 live Labs</strong>
          <span>What each user-facing Lab edits, saves, previews, and exports.</span>
        </a>
        <a className="docs-card" href="#/open-asset-library">
          <BookOpenText size={18} aria-hidden />
          <strong>Open asset library</strong>
          <span>Scene coverage, procedural base sets, open licenses, and generation routing.</span>
        </a>
        <a className="docs-card" href="#/mcp">
          <Plug size={18} aria-hidden />
          <strong>Connect via MCP</strong>
          <span>The local server, its tool reference, and the optional Pro remote server.</span>
        </a>
        <a className="docs-card" href="#/prompts">
          <Sparkles size={18} aria-hidden />
          <strong>Prompt cookbook</strong>
          <span>Bounded existing-scene integrations plus clearly labeled experiments.</span>
        </a>
        <a className="docs-card" href="#/reference">
          <TerminalSquare size={18} aria-hidden />
          <strong>Settings reference</strong>
          <span>Every tunable field with types, defaults, and ranges — generated from the schemas.</span>
        </a>
      </div>
    </article>
  );
}

/* ----------------------------------------------------------------- library */

const EXISTING_SCENE_SNIPPET = `import { createSceneStyleRuntime, CALL_ME_SENSEI_STYLE_BUNDLE } from '@call-me-sensei/toonlab/styles';
import { applyEnvironmentShader } from '@call-me-sensei/toonlab/environment';
import { createCallMeSenseiGrassField } from '@call-me-sensei/toonlab/grass';

// The host already owns layout, input, camera, placements and the frame loop.
// Use one scene-style runtime for labeled static collision and shared passes.
await applyEnvironmentShader(manufacturedRoot, {
  preset: 'call_me_sensei',
  scenario: 'exteriorDay',
});

const grass = await createCallMeSenseiGrassField({ placements });
scene.add(grass);
// Preserve accepted root and per-material labels on all styled targets.
const look = createSceneStyleRuntime({ renderer, scene });
await look.apply(CALL_ME_SENSEI_STYLE_BUNDLE, { discovery: 'scene-labels', mode: 'strict' });
look.collision.assertReady();

renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();
  look.update(delta, camera);
  grass.update(delta, camera);
  renderer.render(scene, camera);
});`;

const TOON_SNIPPET = `import { applyToonShader, createToonSettings } from '@call-me-sensei/toonlab/toon';

// Every field ships a sensible default; override only what defines your look.
// 14 groups — see the Settings reference for all of them.
const settings = createToonSettings({
  preset: 'default',
  rim: { mode: 'depth', intensity: { hair: 0.3 } },
  outline: { width: { cloth: 0.005 } },
  ramp: { tone: { skin: [0.94, 0.82, 0.76] } },
});

applyToonShader(characterRoot, { settings });`;

const ASSET_SNIPPET = `import { loadImportedAsset } from '@call-me-sensei/toonlab/assetlib';

// assetRecipe comes from the connected ToonLab OSS or Pro MCP surface.
// Official downloads use immutable https://assets.toonlab.io URLs.
const loaded = await loadImportedAsset(assetRecipe);
if (loaded.kind === 'model') {
  loaded.object3D.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  scene.add(loaded.object3D);
}`;

const TEXGEN_SNIPPET = `import {
  createTextureSettings, evaluateTextureMaps,
  findTexturePreset, syncTextureMapTextures,
} from '@call-me-sensei/toonlab/texgen';

// 25 tileable generators, layered overlays (moss, rust, grime), a
// cel-capable color ramp, and derived normal/AO/roughness/ORM maps —
// all CPU-baked from a 60+ preset library. No texture assets shipped.
const settings = createTextureSettings(findTexturePreset('mossy-bricks').settings);
const maps = await evaluateTextureMaps(settings, { size: 256 });
const { textures } = syncTextureMapTextures(maps); // THREE.DataTexture per map
material.map = textures.albedo;
material.normalMap = textures.normal;`;

const BUNDLE_SNIPPET = `import {
  createStyleBundleDocument,
  resolveStyleBundleSettings,
  serializeStyleBundle,
} from '@call-me-sensei/toonlab/styles';

// Local OSS document: commit it, save it in .toonlab, or use any host store.
const bundle = createStyleBundleDocument('studio-signature', {
  label: 'Studio Signature',
  slots: {
    toon: { style: 'call_me_sensei' },
    environment: { style: 'call_me_sensei' },
    treeShader: { style: 'call_me_sensei' },
    grassShader: { style: 'call_me_sensei' },
    flowerShader: { style: 'call_me_sensei' },
    rock: { style: 'call_me_sensei' },
    sky: { style: 'call_me_sensei' },
    water: { style: 'call_me_sensei' },
    post: { style: 'call_me_sensei' },
  },
});

const json = serializeStyleBundle(bundle);
const settings = resolveStyleBundleSettings(bundle);

// A bundle selects treatments; explicit asset labels select destinations.
applyToonShader(characterRoot, { settings: settings.toon });
applyToonShader(equipmentRoot, { settings: settings.toon });
// Apply environment, Tree/Grass/Flower, rock, sky, water, and post through
// their owning runtimes. Bundle resolution does not classify the scene.`;

function Library() {
  return (
    <article>
      <div className="docs-eyebrow">Runtime library</div>
      <h1>Using the npm package</h1>
      <p className="docs-lede">
        <code>@call-me-sensei/toonlab</code> is a runtime library — your app owns the renderer and
        the frame loop; ToonLab systems accept your objects. It is WebGPU-first (TSL /
        NodeMaterial) with a WebGL2 fallback through the same path.
      </p>

      <CodeBlock label="Install" code={'npm install @call-me-sensei/toonlab'} />

      <div className="docs-callout">
        <Bot size={16} aria-hidden />
        <span>
          For every tunable field with types, defaults, and ranges, see the{' '}
          <a href="#/reference">Settings reference</a> — generated from the same schemas that
          drive the labs and the debug panel.
        </span>
      </div>

      <h2>Recommended: integrate into an existing scene</h2>
      <p>
        Your host supplies the scene layout, geometry, camera, dynamic physics, navigation,
        placements, and frame loop. Label those existing targets, source any named
        asset gaps through Gallery/MCP, then apply the matching focused ToonLab runtimes.
      </p>
      <CodeBlock label="main.js" code={EXISTING_SCENE_SNIPPET} />
      <p>
        Sky and Cloud have focused public authoring APIs, but complete
        terrain/biome/coast/cliff construction and whole-world composition remain host-owned. The{' '}
        <a href="#/capability-status">capability-status document</a>{' '}
        is the current product boundary.
      </p>

      <h2>What each import gives you</h2>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Import</th>
              <th>What you get</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>/styles</td><td>Local, versioned style-bundle documents: create, validate, serialize, parse, and resolve coordinated domain settings without a database.</td></tr>
            <tr><td>/toon</td><td>Anime character shader: cel bands, face lighting, rim, hair highlights, outlines — 23 preset-serializable settings groups.</td></tr>
            <tr><td>/environment</td><td>Scene shader for texture packs and glTF: material-role classification, wrapped lighting, time-of-day, fog, cloud shadows.</td></tr>
            <tr><td>/water</td><td>Focused water treatment for a host-authored footprint, continuous shore, and closed seabed: waves, foam, caustics, ripples, underwater treatment, and buoyancy sampling.</td></tr>
            <tr><td>/sky</td><td>Atmosphere, palette, sun, moon, stars, god rays, and shared SkyParams used by the live Sky Labs.</td></tr>
            <tr><td>/vegetation</td><td>Instanced grass and flower fields, procedural trees, palettes, masks, and scatter helpers.</td></tr>
            <tr><td>/cloud</td><td>Cloud shape, erosion, density, lighting, wind, cirrus, haze, fade, style, and hero-cloud recipes used by the live Cloud Labs.</td></tr>
            <tr><td>/post</td><td>Optional compositor pipeline and packaged post settings. The host owns renderer lifecycle and cameras.</td></tr>
            <tr><td>/texgen</td><td>Seamless CPU-baked PBR texture generator with 60+ presets and a natural-language recipe mapper.</td></tr>
            <tr><td>/rockgen</td><td>Seeded rock generation and editable template-based rock projects.</td></tr>
            <tr><td>/rock-shader</td><td>Reusable detailed rock material profiles, independent from rock generation.</td></tr>
            <tr><td>/assetlib, /loaders</td><td>Open-asset loading and model loaders for GLB, VRM, PMX, FBX, and related formats.</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        Public exports describe callable contracts, not a promise that an AI agent can compose
        them into a polished scene. Lighting, camera behavior, game feel, gameplay VFX, paths,
        automatic catalog placement, terrain/biome/coast/cliff design, underwater habitat, and
        full-world composition are controlled by your application rather than a
        single automatic ToonLab workflow.
      </p>
      <p>
        The full cluster table with per-system deep dives is in the{' '}
        <a href={`${GITHUB}#whats-inside`} target="_blank" rel="noreferrer">README</a> and{' '}
        <a href={`${GITHUB}/tree/main/docs`} target="_blank" rel="noreferrer"><code>docs/</code></a>.
      </p>

      <h2>Customize a shader</h2>
      <p>
        Every ToonLab shader is driven by a settings object created from a schema — you never
        write GLSL/TSL to get a custom look. The same schemas power the labs, so anything you can
        click there is a field you can set in code.
      </p>
      <CodeBlock label="Custom character shader" code={TOON_SNIPPET} />
      <p>
        The intended workflow for a signature look: tune it visually in the{' '}
        <a href="/shader-lab/" target="_blank" rel="noreferrer">Character Shader Lab</a>, export
        the preset document, and load it in your game (<code>serializeToonPreset</code> /{' '}
        <code>registerToonPreset</code>). For looks beyond the schema, the shaders are open-source
        TSL modules — fork the cluster and keep the preset contract.
      </p>
      <p>
        Custom environment shaders follow the same separation through the{' '}
        <a href="#/urban-prop-roles">manufactured environment material contract</a>: assets keep
        stable material, finish, rendering, structural, and content classifications while each
        shader supplies global settings and sparse profile layers.
      </p>
      <p>
        Before applying several shader profiles together, read the{' '}
        <a href="#/styles-and-bundles">style bundle and asset-routing contract</a>. It defines
        which shader owns characters, equipment, manufactured props, vegetation, rocks, water,
        sky, and VFX—and which labels an imported asset needs before its result is production-safe.
      </p>

      <h2>Create assets</h2>
      <p>
        Assets come from the project/library, Gallery, policy-permitted open sources, focused
        procedural generators, and the texture generator. ToonLab MCP can discover and import
        them with metadata and provenance. The host still owns placement, grounding, collision,
        instancing, and level-wide LOD policy.
      </p>
      <CodeBlock label="Procedural + imported assets" code={ASSET_SNIPPET} />
      <CodeBlock label="Procedural textures" code={TEXGEN_SNIPPET} />

      <h2>Apply a style bundle</h2>
      <CodeBlock label="Style bundle in the runtime" code={BUNDLE_SNIPPET} />
      <p>
        Creating, validating, serializing, parsing, and resolving local bundle JSON is part of the
        OSS package and requires no account or database. <code>fetchStyleBundle</code> can
        optionally load a public or self-hosted document. Cloud persistence, collaboration, and
        publishing through the{' '}
        <a href="https://toonlab.io/styles" target="_blank" rel="noreferrer">hosted bundle builder</a>{' '}
        are <ProBadge /> features.
      </p>

      <h2>Share your work</h2>
      <p>
        Locally, everything you author lives in portable JSON documents: labs save into the
        disk-backed <code>.toonlab/</code> workspace (shared with the MCP server), and every lab
        can export preset files you can commit to your repo or hand to anyone.
      </p>
      <p>
        Publishing to the public <a href="https://toonlab.io/gallery" target="_blank" rel="noreferrer">gallery</a>{' '}
        <ProBadge /> works through a toonlab.io account: save a creation to your cloud library,
        set its visibility to public, and it gets a permanent page and appears in gallery search —
        loadable by anyone, including by reference from style bundles.
      </p>
    </article>
  );
}

/* --------------------------------------------------------------------- mcp */

const LOCAL_CONFIG = `{
  "mcpServers": {
    "toonlab-local": {
      "command": "npx",
      "args": ["-y", "--package=@call-me-sensei/toonlab@latest", "toonlab-mcp", "--workspace", "/absolute/path/to/your-game/.toonlab"]
    }
  }
}`;

const LOCAL_TOOLS = [
  ['get_anime_game_profile', 'Canonical anime-game bundle, treatment routing, sourcing order, and policy.'],
  ['get_workspace_info', 'Workspace path, migration status, and item counts.'],
  ['list_live_labs', 'All 15 public Beta Labs, portable creation types, runtimes, and management support.'],
  ['get_lab_features', 'Every editable field plus the portable document contract and a valid starter document.'],
  ['search_assets', 'Search built-in procedural assets, saved library entries, lab presets, and files on disk.'],
  ['get_asset', 'Complete asset, recipe, preset, library entry, or workspace file descriptor by id.'],
  ['list_my_creations', 'Search the disk-backed library by text, exact tags, and kind; paginate with nextOffset.'],
  ['get_my_creation', 'Read a saved creation or small workspace file (binary as base64 with a direct path).'],
  ['save_creation', 'Save a JSON or text creation with durable searchable tags so labs and agents share it.'],
  ['update_creation', 'Replace or RFC 7396 merge-patch any local creation and its label, description, or tags.'],
  ['delete_creation', 'Delete any local creation with confirm: true.'],
  ['list_lab_state', 'List non-secret raw Lab drafts and historical browser stores.'],
  ['get_lab_state', 'Read one allowed Lab-state key.'],
  ['set_lab_state', 'Create or replace one allowed Lab-state value (4 MiB UTF-8 maximum).'],
  ['delete_lab_state', 'Delete one Lab-state key with confirm: true.'],
  ['generate_asset', 'Generate a deterministic, editable asset recipe from a built-in catalog entry (seeded — no credits, no AI).'],
  ['search_cc0_assets', 'Search CC0 models, textures, and HDRIs from Poly Haven and ambientCG.'],
  ['get_cc0_asset', 'Source, attribution, and download metadata for one CC0 asset.'],
  ['import_cc0_asset', 'Download a CC0 asset plus attribution manifest into .toonlab/imports.'],
  ['validate_asset_candidate', 'Evaluate provenance, license, source class, and anime fit against policy.'],
  ['record_asset_gap', 'Create the canonical JSON and Markdown record required before custom work.'],
  ['get_generation_capabilities', 'Configured local image/3D providers, models, supported kinds, and limits.'],
  ['generate_ai_asset', 'Run BYO-key image generation, Meshy 7 image/multiview-to-3D or selected-image-model concept-to-Meshy, and Tripo generation/segmentation.'],
  ['get_generation_job', 'Poll one local provider workflow and its parent/child stages.'],
  ['get_generation_jobs', 'List local provider workflows for batch polling and recovery.'],
  ['save_generated_asset', 'Persist a ready generated artifact and provenance into the local Library.'],
];

function Mcp() {
  return (
    <article>
      <div className="docs-eyebrow">Model Context Protocol</div>
      <h1>Connect your AI coding agent</h1>
      <p className="docs-lede">
        The open-source package bundles a local MCP server: stdio transport, no account, no OAuth,
        everything on disk. It shares the <code>.toonlab/</code> workspace with the browser labs,
        so what your agent saves, the labs see — and vice versa.
      </p>

      <h2>Setup</h2>
      <p>
        With the labs running (<code>npm run dev</code>), open{' '}
        <a href="/settings/" target="_blank" rel="noreferrer">/settings/</a> for a ready-made,
        checkout-specific config to paste into your client. Or configure it directly from npm:
      </p>
      <CodeBlock label="MCP client config" code={LOCAL_CONFIG} />
      <p>
        The workspace directory is created on first use and is ignored by Git by default. See{' '}
        <a href={`${GITHUB}/blob/main/docs/mcp.md`} target="_blank" rel="noreferrer">
          Local MCP and workspace
        </a>{' '}
        for the full layout.
      </p>

      <h2>Tool reference (local server)</h2>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Tool</th>
              <th>What it does</th>
            </tr>
          </thead>
          <tbody>
            {LOCAL_TOOLS.map(([name, what]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Lab authoring contract</h2>
      <p>
        Call <code>list_live_labs</code>, then <code>get_lab_features</code> with one Lab id. The
        response includes the full field schema, creation type, discriminator and version paths,
        id/label paths, feature root, a JSON Schema envelope, and a fully populated valid starter
        document. Copy that starter and change only described fields before saving. This covers
        Toon, Tree/Grass/Flower Shader, Rock Shader, Ground, Manufactured Surface, Water, Sky,
        Cloud, integrated Sky &amp; Cloud, Rock, Tree, Grass, and Texture Labs.
      </p>
      <h2>Creation and state management</h2>
      <p>
        Saved Library objects are discoverable like Gallery assets. Search names, descriptions,
        types, and tags with <code>list_my_creations</code>, or search only reusable Library assets
        with <code>search_assets({'{ source: "library", tags: ["village"] }'})</code>. Saving and
        updating accept up to ten lowercase slug tags; the browser Library exposes the same tags.
      </p>
      <p>
        <code>list_my_creations</code> returns an immutable <code>managementId</code> for each local
        library row. Use it for <code>get_my_creation</code>, <code>update_creation</code>, and
        <code>delete_creation</code>; a portable document id is accepted only when unambiguous.
        Deletion always requires <code>confirm: true</code>. The OSS server has no account ownership
        boundary: granting a client this workspace grants it access to every non-secret creation
        and allowed Lab-state entry in that workspace. Provider credentials, secret-looking keys,
        thumbnails, and probe values are never exposed through raw state management.
      </p>
      <p>
        The complete request fields, result shapes, Live Lab/type table, limits, error behavior,
        and examples are in{' '}
        <a href={`${GITHUB}/blob/main/docs/mcp.md`} target="_blank" rel="noreferrer">
          the MCP API reference
        </a>.
      </p>
      <p>
        Note the boundary: local <code>generate_asset</code> produces <strong>seeded procedural
        recipes</strong> from the built-in catalog — deterministic and free. The separate local
        <code>generate_ai_asset</code> uses provider keys from your Node environment. Meshy text
        explicitly runs selected <code>image_model</code> concept generation before Meshy 7;
        Tripo handles segmentation. Pro hosts the same provider workflows with managed credentials,
        credits/refunds, durable workers, OAuth, and cloud storage.
      </p>

      <h2>
        The remote Pro server <ProBadge />
      </h2>
      <div className="docs-callout docs-callout--pro">
        <Crown size={16} aria-hidden />
        <span>
          <a href="https://toonlab.io" target="_blank" rel="noreferrer">toonlab.io</a> hosts a
          remote MCP server at <code>https://toonlab.io/mcp</code> (OAuth, Pro/Team plans) that
          adds an indexed CC0 search with styled previews, AI generation on credits — concept art,
          seamless textures, image→3D chaining — stored characters with reference-image
          consistency, and your cloud library. It composes with the local server; run both. Setup
          and its tool reference:{' '}
          <a href="https://toonlab.io/docs/mcp" target="_blank" rel="noreferrer">
            toonlab.io/docs/mcp
          </a>.
        </span>
      </div>
    </article>
  );
}

/* ----------------------------------------------------------------- prompts */

function Prompts() {
  return (
    <article>
      <div className="docs-eyebrow">Prompt cookbook</div>
      <h1>Prompts for focused integrations</h1>
      <p className="docs-lede">
        These prompts assume the recommended setup — the runtime installed, the{' '}
        <a href={`${GITHUB}/tree/main/agents`} target="_blank" rel="noreferrer">ToonLab skills</a>{' '}
        copied into your project, and the <a href="#/mcp">local MCP server</a> connected. Recipes
        that need the hosted service are badged <span className="docs-pro">Pro</span>.
      </p>

      <div className="docs-callout">
        <Lightbulb size={16} aria-hidden />
        <span>
          Pattern: <strong>supplied scene → one bounded role → observable definition of
          done.</strong> &quot;Apply the rock treatment to these cliff meshes and verify these three
          cameras&quot; is a supported brief; &quot;build a beautiful open world&quot; is an experiment.
        </span>
      </div>

      <h2>Start with an existing scene</h2>
      <PromptBlock
        title="The first prompt"
        prompt={`Using the ToonLab game-dev skill, integrate @call-me-sensei/toonlab into this
existing Three.js scene. Inventory and label the character, manufactured,
ground, rock, tree, grass, flower, water, and post targets. Reuse project assets
first, then use whichever ToonLab OSS or Pro MCP surface is connected for named
asset gaps. Apply each matching runtime, preserve provenance, and verify the
supplied gameplay, close, and wide cameras. Do not redesign terrain, coastline,
biome, lighting, camera, or gameplay unless I explicitly request an experiment.`}
        note="Focused integration is the recommended path. Run one material or asset family at a time when the scene is large."
      />

      <h2>Dress the world with assets</h2>
      <PromptBlock
        title="Fill a scene from assets and reliable generators"
        prompt={`Read docs/open-asset-library.md and inventory the missing scene-kit roles for
the fishing village. Reuse accepted project assets first. For any role owned
by an approved procedural family, generate from its approved base set and
record the recipe and seed without browsing the gallery. For remaining roles,
search curated CC0 and then CC-BY sources, import with provenance, and produce
the required credits. Label every root and material, verify it with the Call
Me Sensei bundle, and report the coverage manifest changes. Use image-to-3D
only for a named gap that neither reliable generation nor open assets cover.`}
        note="Gallery discovery is optional. The chosen route must preserve provenance, semantic labels, and Call Me Sensei verification."
      />
      <PromptBlock
        title="Experimental procedural set dressing"
        prompt={`As an experiment, use the ToonLab outdoor-world and rockgen skills to scatter cliff rocks along
the north ridge and add a stepped stone path from the village to the shrine
with an arched plank bridge over the river. Keep every host-owned transform,
collision, and terrain edit explicit; record where the skills or APIs were
insufficient and do not describe the result as automatic world construction.`}
      />
      <PromptBlock
        title="Seeded recipes from the catalog"
        prompt={`With the toonlab-local MCP server, generate three broadleaf tree recipe
variations (generate_asset from the catalog entry, different seeds), save
them as creations, and spawn them along the shore so I can compare them in
the game.`}
      />

      <h2>Textures and style</h2>
      <PromptBlock
        title="Procedural texture with texgen"
        prompt={`Using the ToonLab texture skill, build a mossy stone texture for the shrine
path with texgen (start from the mossy-bricks preset), tune the ramp toward a
hand-painted five-stop cel look, and derive normal + AO maps.`}
      />
      <PromptBlock
        title="AI-generated seamless texture"
        pro
        prompt={`Generate a 2k seamless mossy stone texture through the toonlab remote MCP
server (kind texture_image) and apply it to the shrine walls. Before
generating, call get_generation_capabilities and tell me the credit cost.`}
        note="AI generation runs on toonlab.io (Pro plan + credits). The local texgen recipe above is the free procedural alternative."
      />
      <PromptBlock
        title="Create and apply a local style bundle"
        prompt={`Read docs/styles-and-bundles.md. Inventory every renderable root and assign an
explicit rendering domain, then label every material with the semantic role
required by that domain. Report mixed atlases, missing masks, transparency,
and custom shaders. Create a local style bundle document with
@call-me-sensei/toonlab/styles and apply every filled slot through its owning
runtime. Preserve asset presets and current conditions, wire it behind a
setStyle() function, and finish with a routing audit that lists every fallback
or exemption.`}
        note="The bundle chooses coordinated treatments; durable asset labels determine where those treatments apply."
      />

      <h2>Experimental atmosphere and feel</h2>
      <PromptBlock
        title="Weather as drama"
        prompt={`As an experiment, use the ToonLab weather and lighting skills to add a day/night cycle and a
thunderstorm that rolls in at dusk: wind ramps in the grass and trees, rain
streaks and ripples the water, lightning drives the sky flash and the light
rig, and the storm clears to fireflies at night. List all host adapters and
do not present the result as a supported full-world workflow.`}
      />
      <PromptBlock
        title="Anime combat feedback"
        prompt={`As a host-owned experiment, use the ToonLab game-feel and VFX guidance to make the sword swing feel
anime: 60 ms hit-stop on contact, a camera punch, a trail ribbon that follows
the blade, impact sparks, and a one-frame white flash on the target. Keep it
inside the game runtime and record the missing ToonLab package surfaces.`}
      />

      <h2>
        Characters <ProBadge />
      </h2>
      <PromptBlock
        title="Consistent character art"
        pro
        prompt={`Using my stored ToonLab character Yuki (list_characters first to see her
options), generate a concept of her in the travel cloak, lantern in hand, on
the pier at dusk. Pass character: { ref: "Yuki", outfit: "travel cloak" } —
do not re-describe her appearance in the prompt.`}
        note="Stored character profiles with reference-image consistency live on toonlab.io — the server composes appearance, art style, and references automatically."
      />

      <h2>Ship the loop</h2>
      <PromptBlock
        title="Iterate with verification"
        prompt={`Play through the current build: spawn, walk to the village, buy the lantern,
sail past the reef in the storm. Fix anything that breaks the loop — falling
through terrain, unlit props at night, water clipping in the boat — and rerun
until the whole sequence works. List what you changed.`}
      />

      <p>
        The extended cookbook — including the full Pro generation and character workflows — is at{' '}
        <a href="https://toonlab.io/docs/prompts" target="_blank" rel="noreferrer">
          toonlab.io/docs/prompts
        </a>.
      </p>
    </article>
  );
}

/* --------------------------------------------------------------- reference */

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/&[a-z]+;|&#\d+;/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

// Systems intentionally undocumented until their output meets the quality bar.
const HIDDEN_REFERENCE_SECTIONS = ['Buildings'];

function stripHiddenSections(markdown) {
  for (const title of HIDDEN_REFERENCE_SECTIONS) {
    markdown = markdown
      .replace(new RegExp(`\\n## ${title}\\n[\\s\\S]*?(?=\\n## |$)`), '\n')
      .replace(new RegExp(`- \\[${title}\\]\\(#[\\w-]+\\)\\n`), '');
  }
  return markdown;
}

let referenceHtmlCache = null;

function referenceHtml() {
  if (referenceHtmlCache) return referenceHtmlCache;
  let html = marked.parse(stripHiddenSections(settingsReferenceRaw), { async: false });
  html = html.replace(
    /<h([123])>([^<]+)<\/h\1>/g,
    (_m, level, text) => `<h${level} id="${slugify(text)}">${text}</h${level}>`,
  );
  html = html.replace(
    /href="lab-preview-environment\.md[^"]*"/g,
    'href="#/lab-preview-environment"',
  );
  html = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/, '');
  html = html.replace(
    /href="([\w-]+\.md)"/g,
    `href="${GITHUB}/blob/main/docs/$1" target="_blank" rel="noreferrer"`,
  );
  referenceHtmlCache = html;
  return html;
}

function Reference() {
  const html = useMemo(referenceHtml, []);
  return (
    <article>
      <div className="docs-eyebrow">Generated reference</div>
      <h1>Settings reference</h1>
      <p className="docs-lede">
        Every tunable field in <code>@call-me-sensei/toonlab</code>, generated straight from the
        settings schemas that drive the labs and the debug panel — with type, default, range or
        options, and whether the field is portable (saved in preset documents) or scene/runtime
        state.
      </p>
      <div className="docs-callout">
        <Bot size={16} aria-hidden />
        <span>
          <strong>Using a coding agent?</strong> Point it at the raw markdown source of this page:{' '}
          <code>docs/settings-reference.md</code> in the repo (regenerate with{' '}
          <code>node scripts/generate-settings-reference.mjs</code>), or fetch it from{' '}
          <a href="https://toonlab.io/docs/reference.md" target="_blank" rel="noreferrer">
            toonlab.io/docs/reference.md
          </a>.
        </span>
      </div>
      <div className="docs-md" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}

/* ------------------------------------------ manufactured material contract */

let urbanPropSurfaceRolesHtmlCache = null;

function urbanPropSurfaceRolesHtml() {
  if (urbanPropSurfaceRolesHtmlCache) return urbanPropSurfaceRolesHtmlCache;
  let html = marked.parse(urbanPropSurfaceRolesRaw, { async: false });
  html = html.replace(
    /<h([123])>([^<]+)<\/h\1>/g,
    (_m, level, text) => `<h${level} id="${slugify(text)}">${text}</h${level}>`,
  );
  urbanPropSurfaceRolesHtmlCache = html;
  return html;
}

function UrbanPropSurfaceRoles() {
  const html = useMemo(urbanPropSurfaceRolesHtml, []);
  return (
    <article>
      <div className="docs-eyebrow">Manufactured environment contract</div>
      <div className="docs-md" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}

/* ---------------------------------------------------------- styles/bundles */

let stylesAndBundlesHtmlCache = null;

function stylesAndBundlesHtml() {
  if (stylesAndBundlesHtmlCache) return stylesAndBundlesHtmlCache;
  let html = marked.parse(stylesAndBundlesRaw, { async: false });
  html = html.replace(
    /<h([123])>([^<]+)<\/h\1>/g,
    (_m, level, text) => `<h${level} id="${slugify(text)}">${text}</h${level}>`,
  );
  html = html.replace(
    /href="urban-prop-surface-roles\.md"/g,
    'href="#/urban-prop-roles"',
  );
  html = html.replace(
    /href="open-asset-library\.md"/g,
    'href="#/open-asset-library"',
  );
  html = html.replace(
    /href="generated-asset-labeling\.md"/g,
    'href="#/generated-asset-labeling"',
  );
  stylesAndBundlesHtmlCache = html;
  return html;
}

function StylesAndBundles() {
  const html = useMemo(stylesAndBundlesHtml, []);
  return (
    <article>
      <div className="docs-eyebrow">Rendering style contract</div>
      <div className="docs-md" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}

/* ------------------------------------------------------- open asset library */

let openAssetLibraryHtmlCache = null;

function openAssetLibraryHtml() {
  if (openAssetLibraryHtmlCache) return openAssetLibraryHtmlCache;
  let html = marked.parse(openAssetLibraryRaw, { async: false });
  html = html.replace(
    /<h([123])>([^<]+)<\/h\1>/g,
    (_m, level, text) => `<h${level} id="${slugify(text)}">${text}</h${level}>`,
  );
  html = html.replace(
    /href="styles-and-bundles\.md"/g,
    'href="#/styles-and-bundles"',
  );
  openAssetLibraryHtmlCache = html;
  return html;
}

function OpenAssetLibrary() {
  const html = useMemo(openAssetLibraryHtml, []);
  return (
    <article>
      <div className="docs-eyebrow">Content coverage contract</div>
      <div className="docs-md" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}

/* ------------------------------------------------ generated asset labeling */

let generatedAssetLabelingHtmlCache = null;

function generatedAssetLabelingHtml() {
  if (generatedAssetLabelingHtmlCache) return generatedAssetLabelingHtmlCache;
  const html = marked.parse(generatedAssetLabelingRaw, { async: false }).replace(
    /<h([123])>([^<]+)<\/h\1>/g,
    (_m, level, text) => `<h${level} id="${slugify(text)}">${text}</h${level}>`,
  );
  generatedAssetLabelingHtmlCache = html;
  return html;
}

function GeneratedAssetLabeling() {
  const html = useMemo(generatedAssetLabelingHtml, []);
  return (
    <article>
      <div className="docs-eyebrow">Generator output contract</div>
      <div className="docs-md" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}

/* ----------------------------------------------------- preview environment */

let labPreviewEnvironmentHtmlCache = null;

function labPreviewEnvironmentHtml() {
  if (labPreviewEnvironmentHtmlCache) return labPreviewEnvironmentHtmlCache;
  const html = marked.parse(labPreviewEnvironmentRaw, { async: false }).replace(
    /<h([123])>([^<]+)<\/h\1>/g,
    (_m, level, text) => `<h${level} id="${slugify(text)}">${text}</h${level}>`,
  );
  labPreviewEnvironmentHtmlCache = html;
  return html;
}

function LabPreviewEnvironmentDocs() {
  const html = useMemo(labPreviewEnvironmentHtml, []);
  return (
    <article>
      <div className="docs-eyebrow">Universal lab acceptance harness</div>
      <div className="docs-md" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}

/* --------------------------------------------------------------- rock shader */

let rockShaderHtmlCache = null;

function rockShaderHtml() {
  if (rockShaderHtmlCache) return rockShaderHtmlCache;
  let html = marked.parse(rockShaderRaw, { async: false });
  html = html.replace(
    /<h([123])>([^<]+)<\/h\1>/g,
    (_m, level, text) => `<h${level} id="${slugify(text)}">${text}</h${level}>`,
  );
  html = html.replace(
    /href="lab-architecture\.md[^"]*"/g,
    'href="#/labs"',
  );
  html = html.replace(
    /href="generated-asset-labeling\.md"/g,
    'href="#/generated-asset-labeling"',
  );
  rockShaderHtmlCache = html;
  return html;
}

function RockShaderDocs() {
  const html = useMemo(rockShaderHtml, []);
  return (
    <article>
      <div className="docs-eyebrow">Rock rendering domain</div>
      <div className="docs-md" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}

/* --------------------------------------------------------- capability status */

let capabilityStatusHtmlCache = null;

function capabilityStatusHtml() {
  if (capabilityStatusHtmlCache) return capabilityStatusHtmlCache;
  capabilityStatusHtmlCache = marked.parse(capabilityStatusRaw, { async: false }).replace(
    /<h([123])>([^<]+)<\/h\1>/g,
    (_match, level, title) => `<h${level} id="${slugify(title)}">${title}</h${level}>`,
  );
  return capabilityStatusHtmlCache;
}

function CapabilityStatus() {
  const html = useMemo(capabilityStatusHtml, []);
  return (
    <article>
      <div className="docs-eyebrow">Current product boundary</div>
      <div className="docs-md" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}

/* --------------------------------------------------------------------- app */

const SECTIONS = [
  { hash: '', label: 'Overview', component: Overview },
  { hash: '#/labs', label: 'Live Labs', component: LiveLabs },
  { hash: '#/capability-status', label: 'Capability status', component: CapabilityStatus },
  { hash: '#/library', label: 'Using the library', component: Library },
  {
    hash: '#/styles-and-bundles',
    label: 'Styles & bundles',
    component: StylesAndBundles,
  },
  {
    hash: '#/lab-preview-environment',
    label: 'Lab preview environment',
    component: LabPreviewEnvironmentDocs,
  },
  {
    hash: '#/rock-shader',
    label: 'Rock shader',
    component: RockShaderDocs,
  },
  {
    hash: '#/open-asset-library',
    label: 'Open asset library',
    component: OpenAssetLibrary,
  },
  {
    hash: '#/generated-asset-labeling',
    label: 'Generated asset labels',
    component: GeneratedAssetLabeling,
  },
  {
    hash: '#/urban-prop-roles',
    label: 'Environment materials',
    component: UrbanPropSurfaceRoles,
  },
  { hash: '#/mcp', label: 'Connect via MCP', component: Mcp },
  { hash: '#/prompts', label: 'Prompt cookbook', component: Prompts },
  { hash: '#/reference', label: 'Settings reference', component: Reference },
];

function activeSection() {
  const hash = window.location.hash;
  return SECTIONS.find((section) => section.hash && hash.startsWith(section.hash)) ?? SECTIONS[0];
}

function App() {
  const [section, setSection] = useState(activeSection);
  const copy = getCopy(getLocale());

  useEffect(() => {
    const onHashChange = () => {
      const next = activeSection();
      setSection((prev) => {
        if (prev !== next) window.scrollTo(0, 0);
        return next;
      });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const Body = section.component;

  return (
    <>
      <toonlab-site-header active="docs" />
      <div className="docs-frame">
        <aside className="docs-side">
          <div className="docs-side-label">{copy.documentation}</div>
          <nav className="docs-nav">
            {SECTIONS.map((item) => (
              <a
                key={item.label}
                href={item.hash || '#'}
                className={item === section ? 'active' : undefined}
                onClick={(event) => {
                  if (!item.hash) {
                    event.preventDefault();
                    history.pushState(null, '', window.location.pathname);
                    setSection(SECTIONS[0]);
                    window.scrollTo(0, 0);
                  }
                }}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="docs-side-foot">
            <a href={GITHUB} target="_blank" rel="noreferrer">GitHub</a>
            <a href="https://www.npmjs.com/package/@call-me-sensei/toonlab" target="_blank" rel="noreferrer">npm</a>
            <a href="https://toonlab.io/docs" target="_blank" rel="noreferrer">Pro docs</a>
          </div>
        </aside>
        <main className="docs-main">
          {section !== SECTIONS[0] && <DocsLanguageBanner />}
          <Body />
        </main>
      </div>
    </>
  );
}

createRoot(document.getElementById('app')).render(<App />);
