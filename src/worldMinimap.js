// Clickable world minimap. Import from '@call-me-sensei/toonlab'.
//
// Renders a stylized top-down map of a heightfield world onto a canvas —
// water by depth, sand at the waterline, meadow shading with altitude, rock
// on steep slopes, snow on peaks, and a simple NW hillshade for relief.
// The base map is painted once from `heightAt` samples; per-frame work is a
// cheap blit plus the player marker.
//
//   const minimap = createWorldMinimap({
//     heightAt,
//     size: 1000,                       // world extent in meters (square)
//     waterLevel: 0,
//     onPick: (x, z) => teleport(x, z), // click → world coordinates
//   });
//   container.appendChild(minimap.canvas);
//   minimap.setPlayer(character.position.x, character.position.z, character.rotation.y); // per frame
export function createWorldMinimap({
  heightAt,
  size = 1000,
  waterLevel = 0,
  resolution = 192,
  displaySize = 176,
  palette = {},
  onPick = null,
  paths = null,
  markers = [],
} = {}) {
  if (typeof heightAt !== 'function') throw new Error('createWorldMinimap needs heightAt(x, z).');
  const colors = {
    deepWater: [0.12, 0.33, 0.45],
    grass: [0.43, 0.64, 0.29],
    grassHigh: [0.55, 0.6, 0.3],
    rock: [0.56, 0.63, 0.67],
    sand: [0.86, 0.81, 0.59],
    shallowWater: [0.4, 0.68, 0.68],
    snow: [0.83, 0.87, 0.9],
    ...palette,
  };

  const canvas = document.createElement('canvas');
  canvas.width = resolution;
  canvas.height = resolution;
  canvas.style.width = `${displaySize}px`;
  canvas.style.height = `${displaySize}px`;
  canvas.style.cursor = 'crosshair';
  const ctx = canvas.getContext('2d');

  // Base layer, painted once (and on refresh()).
  const base = document.createElement('canvas');
  base.width = resolution;
  base.height = resolution;
  const half = size / 2;
  const step = size / resolution;
  const mapToWorld = (px, py) => ({ x: px * step - half, z: py * step - half });
  const worldToMap = (x, z) => ({ x: (x + half) / step, y: (z + half) / step });

  const mix = (a, b, t) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
  const clamp01 = (v) => Math.min(Math.max(v, 0), 1);

  function refresh() {
    const image = base.getContext('2d').createImageData(resolution, resolution);
    for (let py = 0; py < resolution; py += 1) {
      for (let px = 0; px < resolution; px += 1) {
        const { x, z } = mapToWorld(px + 0.5, py + 0.5);
        const h = heightAt(x, z);
        let rgb;
        if (h < waterLevel - 0.15) {
          rgb = mix(colors.shallowWater, colors.deepWater, clamp01((waterLevel - h) / 12));
        } else if (h < waterLevel + 1.2) {
          rgb = colors.sand;
        } else {
          // Analytic slope from neighbor samples — same rock/grass split the
          // terrain painting uses.
          const d = Math.max(step, 2);
          const sx = (heightAt(x + d, z) - heightAt(x - d, z)) / (2 * d);
          const sz = (heightAt(x, z + d) - heightAt(x, z - d)) / (2 * d);
          const slope = Math.hypot(sx, sz);
          rgb = mix(colors.grass, colors.grassHigh, clamp01((h - waterLevel) / 90));
          rgb = mix(rgb, colors.rock, clamp01((slope - 0.35) / 0.35));
          rgb = mix(rgb, colors.snow, clamp01((h - 130) / 45));
          // NW hillshade for relief.
          const shade = 1 + Math.min(Math.max((sx + sz) * 0.9, -0.22), 0.22);
          rgb = [rgb[0] * shade, rgb[1] * shade, rgb[2] * shade];
        }
        const i = (py * resolution + px) * 4;
        image.data[i] = clamp01(rgb[0]) * 255;
        image.data[i + 1] = clamp01(rgb[1]) * 255;
        image.data[i + 2] = clamp01(rgb[2]) * 255;
        image.data[i + 3] = 255;
      }
    }
    base.getContext('2d').putImageData(image, 0, 0);
    drawOverlays(base.getContext('2d'));
    ctx.drawImage(base, 0, 0);
  }

  // Path network + POI markers are baked into the base layer so the
  // per-frame blit stays one drawImage. Pass the object from
  // `createStylizedPaths` (or `world.paths`) and the network draws itself.
  const pathColors = { dirt: '#8a6a43', planks: '#a3764a', stone: '#a0a098' };
  let markerList = Array.isArray(markers) ? [...markers] : [];
  function drawOverlays(context) {
    const routes = paths?.routes;
    if (Array.isArray(routes)) {
      context.save();
      context.lineCap = 'round';
      context.lineJoin = 'round';
      for (const route of routes) {
        if (!Array.isArray(route.samples) || route.samples.length < 2) continue;
        context.beginPath();
        for (let index = 0; index < route.samples.length; index += 1) {
          const point = worldToMap(route.samples[index].x, route.samples[index].z);
          if (index === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        }
        context.strokeStyle = pathColors[route.style] ?? pathColors.dirt;
        context.lineWidth = Math.max(resolution / 128, 1.2);
        context.globalAlpha = 0.9;
        context.stroke();
      }
      context.restore();
    }
    if (markerList.length > 0) {
      context.save();
      for (const marker of markerList) {
        const point = worldToMap(marker.x, marker.z);
        context.beginPath();
        context.arc(point.x, point.y, Math.max(resolution / 64, 2.4), 0, Math.PI * 2);
        context.fillStyle = marker.color ?? '#f4e9c8';
        context.strokeStyle = 'rgba(20, 32, 40, 0.9)';
        context.lineWidth = 1.2;
        context.fill();
        context.stroke();
        if (marker.label) {
          context.font = `${Math.max(resolution / 24, 8)}px system-ui, sans-serif`;
          context.textAlign = 'center';
          context.fillStyle = 'rgba(255, 252, 240, 0.95)';
          context.strokeStyle = 'rgba(20, 32, 40, 0.85)';
          context.lineWidth = 2.5;
          context.strokeText(marker.label, point.x, point.y - 5);
          context.fillText(marker.label, point.x, point.y - 5);
        }
      }
      context.restore();
    }
  }
  refresh();

  const player = { heading: 0, visible: false, x: 0, z: 0 };
  function draw() {
    ctx.clearRect(0, 0, resolution, resolution);
    ctx.drawImage(base, 0, 0);
    if (!player.visible) return;
    const p = worldToMap(player.x, player.z);
    ctx.save();
    ctx.translate(p.x, p.y);
    // Triangle authored pointing up-map (world −z); a THREE rotation.y of θ
    // faces world (sin θ, cos θ), which is map angle π − θ.
    ctx.rotate(Math.PI - player.heading);
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(3.6, 4);
    ctx.lineTo(-3.6, 4);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(20, 32, 40, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function setPlayer(x, z, heading = 0) {
    player.x = x;
    player.z = z;
    player.heading = heading;
    player.visible = true;
    draw();
  }

  const handleClick = (event) => {
    if (typeof onPick !== 'function') return;
    const rect = canvas.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * resolution;
    const py = ((event.clientY - rect.top) / rect.height) * resolution;
    const { x, z } = mapToWorld(px, py);
    onPick(x, z);
  };
  canvas.addEventListener('click', handleClick);

  /** Replaces the POI marker list (`[{ x, z, color?, label? }]`) and repaints. */
  function setMarkers(next = []) {
    markerList = Array.isArray(next) ? [...next] : [];
    refresh();
    draw();
  }

  return {
    canvas,
    mapToWorld,
    refresh,
    setMarkers,
    setPlayer,
    worldToMap,
    dispose() {
      canvas.removeEventListener('click', handleClick);
      canvas.remove();
    },
  };
}
