import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Box,
  Check,
  Copy,
  ExternalLink,
  FileDown,
  FolderOpen,
  Plug,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
} from 'lucide-react';
import '../labs/shared/siteHeader.js';
import './settings.css';

function CopyButton({ label = 'Copy', value }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button className="mcp-copy-button" type="button" onClick={copy}>
      {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
      {copied ? 'Copied' : label}
    </button>
  );
}

const CONNECTION_STEPS = [
  {
    title: 'Run ToonLab locally',
    body: 'Start the repository with npm run dev. This hosts the labs and keeps the .toonlab workspace bridge active.',
  },
  {
    title: 'Open your client\'s MCP settings',
    body: 'Look for Integrations, Connectors, or MCP servers, then choose the option to add a local stdio server.',
  },
  {
    title: 'Add the ToonLab configuration',
    body: 'Copy the JSON below into your client configuration. It points directly at this checkout and its workspace.',
  },
  {
    title: 'Restart or refresh your client',
    body: 'ToonLab tools should appear immediately. No account, token, OAuth flow, or background cloud service is required.',
  },
];

function SettingsApp() {
  const [workspace, setWorkspace] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    fetch('/api/toonlab/workspace', { headers: { accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Workspace service returned ${response.status}.`);
        return response.json();
      })
      .then((value) => { if (active) setWorkspace(value); })
      .catch((reason) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, []);

  const config = useMemo(() => JSON.stringify({
    mcpServers: {
      toonlab: workspace
        ? { args: workspace.mcp.args, command: workspace.mcp.command }
        : { args: ['/absolute/path/to/toonlab/mcp/server.mjs', '--workspace', '/absolute/path/to/project/.toonlab'], command: 'node' },
    },
  }, null, 2), [workspace]);

  const workspacePath = workspace?.path ?? '.toonlab';
  const connected = Boolean(workspace);

  return (
    <>
      <toonlab-site-header active="settings" />
      <div className="page-shell">
        <header className="settings-page-header">
          <div className="page-kicker">Local tools &amp; preferences</div>
          <h1>Settings</h1>
          <p>Manage how this ToonLab checkout connects to your development tools.</p>
        </header>

        <div className="settings-layout">
          <aside className="settings-sidebar">
            <nav className="settings-nav" aria-label="Settings">
              <div className="settings-nav-group">
                <div className="settings-nav-heading">Developer</div>
                <a className="settings-nav-link settings-nav-link--active" href="/settings/" aria-current="page">
                  <Plug size={17} strokeWidth={1.8} aria-hidden />
                  <span>MCP Connection</span>
                </a>
              </div>
            </nav>
          </aside>

          <main className="settings-content">
            <header className="mcp-hero">
              <div className="mcp-eyebrow">
                <span className={`mcp-status-dot${connected ? '' : ' mcp-status-dot--offline'}`} />
                Local MCP · stdio
              </div>
              <h2>Connect ToonLab to your AI tools</h2>
              <p>
                Search CC0 and procedural assets, work with saved lab recipes, generate deterministic
                assets, and import files—all through the project-local <code>.toonlab</code> workspace.
              </p>
            </header>

            <section className="card mcp-endpoint-card" aria-labelledby="workspace-title">
              <div className="mcp-section-heading">
                <div>
                  <div className="mcp-label" id="workspace-title">Your ToonLab workspace</div>
                  <p>Labs and MCP share this folder as their source of truth.</p>
                </div>
                <span className={`status-badge${connected ? '' : ' status-badge--offline'}`}>
                  {connected ? 'Connected' : 'Not running'}
                </span>
              </div>
              <div className="mcp-endpoint-row">
                <FolderOpen size={17} aria-hidden />
                <code title={workspacePath}>{workspacePath}</code>
                <CopyButton value={workspacePath} />
              </div>
              {workspace && (
                <div className="workspace-stats">
                  <span><strong>{workspace.libraryCount}</strong> library entries</span>
                  <span><strong>{workspace.storageInitialized ? 'On disk' : 'Ready to migrate'}</strong> lab storage</span>
                  <span><strong>v{workspace.version}</strong> workspace format</span>
                </div>
              )}
              {error && (
                <div className="workspace-warning">
                  <Terminal size={18} aria-hidden />
                  <span>Start ToonLab with <code>npm run dev</code> to activate disk sync and generate a checkout-specific MCP config.</span>
                </div>
              )}
            </section>

            <section className="card mcp-capabilities" aria-labelledby="capabilities-title">
              <div className="mcp-label">Available tools</div>
              <h3 id="capabilities-title">A local asset pipeline, end to end</h3>
              <div className="mcp-capability-grid">
                <div>
                  <Search size={18} aria-hidden />
                  <strong>Find public assets</strong>
                  <span>Search built-in ToonLab recipes plus CC0 models, textures, and HDRIs.</span>
                </div>
                <div>
                  <Box size={18} aria-hidden />
                  <strong>Use your workspace</strong>
                  <span>Read saved lab presets, catalog entries, imports, creations, and exported files.</span>
                </div>
                <div>
                  <Sparkles size={18} aria-hidden />
                  <strong>Generate procedurally</strong>
                  <span>Create seeded, editable recipes from every built-in procedural catalog entry.</span>
                </div>
                <div>
                  <FileDown size={18} aria-hidden />
                  <strong>Import to disk</strong>
                  <span>Download CC0 bundles into the project with source and attribution metadata.</span>
                </div>
              </div>
            </section>

            <section className="card mcp-guide" aria-labelledby="guide-title">
              <div className="mcp-section-heading">
                <div>
                  <div className="mcp-label">Quick setup</div>
                  <h3 id="guide-title">Connect in four steps</h3>
                </div>
                <span className="accent-badge">About 1 minute</span>
              </div>

              <ol className="mcp-steps">
                {CONNECTION_STEPS.map((step, index) => (
                  <li key={step.title}>
                    <span className="mcp-step-number">{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <h4>{step.title}</h4>
                      <p>{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="mcp-local-note">
                <ShieldCheck size={22} strokeWidth={1.8} aria-hidden />
                <div>
                  <strong>Your work stays local.</strong>
                  <span>
                    The OSS server uses stdio and reads only the workspace path in your configuration.
                    API keys remain browser-only and are never mirrored to disk. Network access happens
                    only when you ask a CC0 search or import tool to contact its public provider.
                  </span>
                </div>
              </div>
            </section>

            <section className="card mcp-config" aria-labelledby="config-title">
              <div className="mcp-label">Manual configuration</div>
              <h3 id="config-title">Add the local server</h3>
              <p>
                Paste this into a client that supports local MCP servers. The generated paths point at
                this checkout, so the MCP process sees the same files as the running labs.
              </p>
              <div className="mcp-code-block">
                <pre><code>{config}</code></pre>
                <CopyButton label="Copy config" value={config} />
              </div>
            </section>

            <div className="mcp-help">
              <div>
                <strong>Need the hosted version?</strong>
                <span>ToonLab Pro adds remote OAuth, hosted provider keys, credit billing, background workers, and cloud sync.</span>
              </div>
              <a href="https://toonlab.io/settings/mcp" target="_blank" rel="noreferrer">
                View ToonLab Pro <ExternalLink size={14} aria-hidden />
              </a>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}

const settingsRoot = globalThis.__TOONLAB_SETTINGS_ROOT__
  ?? createRoot(document.getElementById('app'));
globalThis.__TOONLAB_SETTINGS_ROOT__ = settingsRoot;
settingsRoot.render(<SettingsApp />);
