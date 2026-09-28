import {
  createCloudBaseShapeData,
  createCloudCirrusMapData,
  createCloudErosionData,
  createCurlNoiseData,
  createWeatherMapData,
} from '../../src/cloud/index.js';
import {
  MULTI_SCATTERING_LUT_SIZE,
  TRANSMITTANCE_LUT_HEIGHT,
  TRANSMITTANCE_LUT_WIDTH,
  createAtmosphereParams,
  createAtmosphereScattering,
  createMoonAlbedoData,
} from '../../src/sky/index.js';

export const SOURCE_OUTPUT_SPECS = Object.freeze([
  Object.freeze({
    description: 'Tileable cloud coverage and precipitation field.',
    icon: 'stage-shape',
    id: 'weather-map',
    label: 'Weather',
  }),
  Object.freeze({
    description: 'Tileable high-cloud veil and filament mask.',
    icon: 'stage-animation',
    id: 'cirrus-map',
    label: 'Cirrus',
  }),
  Object.freeze({
    description: 'Procedural lunar surface albedo.',
    icon: 'stage-look',
    id: 'moon-albedo',
    label: 'Moon',
  }),
  Object.freeze({
    description: 'Packed low-frequency cloud density basis.',
    icon: 'stage-pieces',
    id: 'base-shape-volume',
    label: 'Base',
  }),
  Object.freeze({
    description: 'Packed detail field that carves cloud edges.',
    icon: 'stage-detail',
    id: 'erosion-volume',
    label: 'Erosion',
  }),
  Object.freeze({
    description: 'Divergence-free advection field for wisps.',
    icon: 'tool-rotate',
    id: 'curl-volume',
    label: 'Curl',
  }),
  Object.freeze({
    description: 'Atmospheric transmittance lookup table.',
    icon: 'stage-export',
    id: 'atmosphere-transmittance',
    label: 'Transmittance',
    railLabel: 'Transmit',
  }),
  Object.freeze({
    description: 'Multiple-scattering lookup table.',
    icon: 'stage-leaves',
    id: 'atmosphere-multiscattering',
    label: 'Multi scatter',
    railLabel: 'Scatter',
  }),
]);

const OUTPUT_SPEC_BY_ID = Object.fromEntries(SOURCE_OUTPUT_SPECS.map((entry) => [entry.id, entry]));

function qualitySettings(quality) {
  return quality === 'production'
    ? { map: 512, surfaceHeight: 256, surfaceWidth: 512, volume: 64 }
    : { map: 256, surfaceHeight: 128, surfaceWidth: 256, volume: 32 };
}

function rgbaBytes(data) {
  return data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data);
}

function volumeAtlas(baked, columns = 8) {
  const { x, y, z } = baked.dims;
  const cols = Math.min(Math.max(columns, 1), z);
  const rows = Math.ceil(z / cols);
  const width = x * cols;
  const height = y * rows;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let slice = 0; slice < z; slice += 1) {
    const tileX = (slice % cols) * x;
    const tileY = Math.floor(slice / cols) * y;
    for (let py = 0; py < y; py += 1) {
      for (let px = 0; px < x; px += 1) {
        const source = ((slice * y * x) + (py * x) + px) * 4;
        const target = (((tileY + py) * width) + tileX + px) * 4;
        data[target] = baked.data[source];
        data[target + 1] = baked.data[source + 1];
        data[target + 2] = baked.data[source + 2];
        data[target + 3] = baked.data[source + 3];
      }
    }
  }
  return {
    data,
    height,
    metadata: {
      atlasColumns: cols,
      atlasRows: rows,
      channels: 'RGBA8',
      sourceDimensions: [x, y, z],
    },
    width,
  };
}

function toneMapFloatRgba(source) {
  const output = new Uint8ClampedArray(source.length);
  for (let index = 0; index < source.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const linear = Math.max(0, source[index + channel]);
      const mapped = linear / (1 + linear);
      output[index + channel] = Math.round(Math.pow(mapped, 1 / 2.2) * 255);
    }
    output[index + 3] = 255;
  }
  return output;
}

function mapResult(id, data, width, height, metadata = {}) {
  const spec = OUTPUT_SPEC_BY_ID[id];
  return {
    data: rgbaBytes(data),
    description: spec.description,
    height,
    id,
    label: spec.label,
    metadata,
    width,
  };
}

function bakeAtmosphere(recipe, output) {
  const params = createAtmosphereParams(recipe.atmosphere);
  const production = recipe.quality === 'production';
  const scattering = createAtmosphereScattering({
    multiScatteringDirections: production ? 64 : 16,
    multiScatteringSteps: production ? 20 : 10,
    name: 'SkyAtmosphereSourceLab',
    params,
  });
  const isTransmittance = output === 'atmosphere-transmittance';
  const floatData = isTransmittance
    ? scattering.transmittanceData
    : scattering.multiScatteringData;
  const coefficients = scattering.coefficients;
  const width = isTransmittance ? TRANSMITTANCE_LUT_WIDTH : MULTI_SCATTERING_LUT_SIZE;
  const height = isTransmittance ? TRANSMITTANCE_LUT_HEIGHT : MULTI_SCATTERING_LUT_SIZE;
  const result = mapResult(output, toneMapFloatRgba(floatData), width, height, {
    channels: 'linear-float-rgba',
    coefficients,
    pngEncoding: 'tone-mapped sRGB visualization',
  });
  scattering.dispose();
  return result;
}

export function bakeSkyAtmosphereSource(recipe) {
  const quality = qualitySettings(recipe.quality);
  switch (recipe.output) {
    case 'weather-map': {
      const baked = createWeatherMapData({
        profile: recipe.weather,
        resolution: quality.map,
        seed: recipe.seed,
      });
      return mapResult(recipe.output, baked.data, baked.resolution, baked.resolution, {
        channels: 'R coverage · G type · B precipitation · A reserved',
        coverageMean: baked.coverageMean,
        seed: baked.seed,
      });
    }
    case 'cirrus-map': {
      const baked = createCloudCirrusMapData({
        height: quality.surfaceHeight,
        seed: recipe.seed,
        width: quality.surfaceWidth,
      });
      return mapResult(recipe.output, baked.data, baked.width, baked.height, {
        channels: 'RGBA8 density',
        densityMean: baked.mean,
        seed: baked.seed,
      });
    }
    case 'moon-albedo': {
      const baked = createMoonAlbedoData({
        height: quality.surfaceHeight,
        seed: recipe.seed,
        width: quality.surfaceWidth,
      });
      return mapResult(recipe.output, baked.data, baked.width, baked.height, {
        channels: 'RGBA8 linear albedo',
        discMean: baked.discMean,
        peak: baked.peak,
        seed: baked.seed,
      });
    }
    case 'base-shape-volume': {
      const baked = createCloudBaseShapeData({ dims: quality.volume, seed: recipe.seed });
      return { ...mapResult(recipe.output, new Uint8Array(), 1, 1), ...volumeAtlas(baked) };
    }
    case 'erosion-volume': {
      const baked = createCloudErosionData({ dims: quality.volume, seed: recipe.seed });
      const atlas = volumeAtlas(baked);
      return {
        ...mapResult(recipe.output, new Uint8Array(), 1, 1),
        ...atlas,
        metadata: { ...atlas.metadata, distinctBands: baked.distinctBands, seed: baked.seed },
      };
    }
    case 'curl-volume': {
      const baked = createCurlNoiseData({ dims: quality.volume, seed: recipe.seed });
      const atlas = volumeAtlas(baked);
      return {
        ...mapResult(recipe.output, new Uint8Array(), 1, 1),
        ...atlas,
        metadata: { ...atlas.metadata, peakLength: baked.peakLength, seed: baked.seed },
      };
    }
    case 'atmosphere-transmittance':
    case 'atmosphere-multiscattering':
      return bakeAtmosphere(recipe, recipe.output);
    default:
      throw new Error(`Unsupported source output: ${recipe.output}`);
  }
}

export function sourceResultPngBlob(result) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = result.width;
    canvas.height = result.height;
    const context = canvas.getContext('2d');
    if (!context) {
      reject(new Error('Canvas 2D is unavailable.'));
      return;
    }
    context.putImageData(new ImageData(result.data, result.width, result.height), 0, 0);
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not encode the source PNG.'));
    }, 'image/png');
  });
}
