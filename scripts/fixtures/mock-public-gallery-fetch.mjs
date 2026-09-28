// Deterministic fetch fixture loaded only by verify-mcp.mjs.
// It exercises the packaged MCP's HTTP Gallery boundary without a network
// listener or a dependency on production availability.

globalThis.fetch = async (input) => {
  const url = new URL(input);
  if (url.origin !== 'https://gallery.test') {
    return new Response(JSON.stringify({ error: 'unexpected origin' }), {
      headers: { 'content-type': 'application/json' },
      status: 404,
    });
  }
  if (url.pathname === '/api/v1/creations') {
    if (url.searchParams.get('q') !== 'tree'
      || url.searchParams.get('type') !== 'tree-recipe') {
      return new Response(JSON.stringify({ error: 'unexpected search parameters' }), {
        headers: { 'content-type': 'application/json' },
        status: 400,
      });
    }
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const items = [{
      attribution: 'ToonLab community',
      author: { name: 'Tree reviewer' },
      description: 'A reviewed procedural tree recipe.',
      download: '/assets/gallery-tree-001.toonlab.json',
      id: 'gallery-tree-001',
      label: 'Gallery Tree 001',
      license: 'CC0-1.0',
      slug: 'gallery-tree-001',
      tags: ['tree', 'vegetation', 'procedural'],
      thumbnail: '/assets/gallery-tree-001.webp',
      type: 'tree-recipe',
      updated_at: '2026-08-29T00:00:00.000Z',
      url: '/c/gallery-tree-001',
    }];
    return Response.json({ items: items.slice(offset, offset + 1) });
  }
  if (url.pathname === '/api/v1/creations/gallery-tree-001') {
    return Response.json({
      attribution: 'ToonLab community',
      author: { name: 'Tree reviewer' },
      description: 'A reviewed procedural tree recipe.',
      document: {
        options: { seed: 101, size: 2 },
        schema: 'treeRecipe',
        type: 'tree',
        version: 3,
      },
      files: [{ contentType: 'application/json', url: '/assets/gallery-tree-001.toonlab.json' }],
      id: 'gallery-tree-001',
      label: 'Gallery Tree 001',
      license: 'CC0-1.0',
      slug: 'gallery-tree-001',
      tags: ['tree', 'vegetation', 'procedural'],
      thumbnail: '/assets/gallery-tree-001.webp',
      type: 'tree-recipe',
    });
  }
  return new Response(JSON.stringify({ error: 'not found' }), {
    headers: { 'content-type': 'application/json' },
    status: 404,
  });
};
