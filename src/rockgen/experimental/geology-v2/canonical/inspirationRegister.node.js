import fs from 'node:fs';
import path from 'node:path';

import { canonicalizeJson, contentId } from '../canonical.node.js';

const taxonomy = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '..', 'morphology-taxonomy.v1.json'), 'utf8'));

const EXEMPLARS = Object.freeze({
  'pebble-rounded': ['Chesil Beach rounded pebbles', 'Ruby Beach Olympic National Park pebbles'],
  'pebble-discoid': ['Chesil Beach flat pebbles', 'Lulworth Cove discoid pebbles'],
  'cobble-rounded': ['Elwha River rounded cobbles', 'Lake McDonald multicolour cobbles'],
  'cobble-discoid': ['Lake Superior flat beach stones', 'Chesil Beach discoid cobbles'],
  'boulder-rounded': ['Joshua Tree rounded granite boulders', 'Matobo Hills balancing granite rocks'],
  'boulder-subrounded': ['Yosemite glacial boulders', 'Alabama Hills weathered granite boulders'],
  'boulder-angular': ['Rocky Mountain National Park angular talus boulders', 'Iceland fresh basalt boulders'],
  'boulder-tabular': ['Capitol Reef bedding slabs', 'Zion tabular sandstone boulders'],
  'boulder-river-worn': ['Merced River polished boulders', 'Elwha River boulders'],
  'slab-bedded': ['Zion sandstone bedding slabs', 'Colorado Plateau broken sandstone slabs'],
  'slab-cleavage': ['Snowdonia slate slabs', 'Welsh slate cleavage outcrop'],
  'block-jointed': ['Devils Postpile joint-bounded blocks', 'Joshua Tree jointed granite blocks'],
  'block-fractured': ['Yosemite fresh rockfall blocks', 'Zion fresh sandstone rockfall blocks'],
  'shard-platy': ['Badlands shale chips', 'Burgess Shale platy fragments'],
  'shard-splintery': ['Newberry obsidian shards', 'Glass Buttes obsidian fragments'],
  'erratic-glacial': ['Okotoks Big Rock glacial erratic', 'Yosemite glacial erratics'],

  'corestone-spheroidal': ['Elephant Rocks Missouri granite corestones', 'Matobo Hills granite corestones'],
  'outcrop-massive': ['Yosemite massive granite outcrop', 'Enchanted Rock granite outcrop'],
  'outcrop-jointed': ['Joshua Tree jointed granite outcrop', 'Serpentine Hot Springs jointed granite'],
  'outcrop-bedded': ['Capitol Reef bedded sandstone outcrop', 'Zion Navajo Sandstone outcrop'],
  'outcrop-foliated': ['Lewisian gneiss foliated outcrop', 'Black Canyon Gunnison gneiss outcrop'],
  'outcrop-clastic': ['Roxborough Fountain Formation conglomerate', 'Needles District conglomeratic outcrop'],
  'outcrop-pillow': ['Isle Royale pillow basalt', 'Olympic Peninsula pillow lava outcrop'],
  'tor-block-pile': ['Great Staple Tor block pile', 'Serpentine Hot Springs granite tors'],
  'tor-castellated': ['Haytor Rocks castellated granite', 'Hound Tor granite stacks'],
  'tor-freestanding': ['Vixen Tor freestanding granite', 'Bowerman Nose Dartmoor tor'],
  'monolith-massive': ['Uluru massive sandstone monolith', 'El Capitan granite monolith'],
  'monolith-jointed': ['Devils Tower jointed monolith', 'Shiprock jointed volcanic neck'],
  'dome-exfoliation': ['Half Dome exfoliation sheets', 'Enchanted Rock exfoliation dome'],

  'fin-sandstone': ['Fiery Furnace sandstone fins', 'Arches National Park Park Avenue fins'],
  'blade-narrow': ['Seneca Rocks narrow fin', 'Stegosaurus Ridge rock blade'],
  'spire-rock-needle': ['Spider Rock Canyon de Chelly', 'Totem Pole Monument Valley'],
  'volcanic-spine': ['Mont Pelee lava spine 1902', 'Mount St Helens crater lava spine'],
  'pinnacle-residual': ['Pinnacles National Park rock pinnacles', 'Trona Pinnacles tufa towers'],
  'pillar-residual': ['Wulingyuan sandstone pillars', 'Monument Basin residual pillars'],
  'karst-spire-singular': ['Guilin isolated karst tower', 'Phong Nha limestone tower'],
  'karst-tower-tiered': ['Guilin fenglin limestone tower', 'Phong Nha limestone tower karst'],
  'hoodoo-caprock': ['Thors Hammer Bryce Canyon', 'Drumheller caprock hoodoos'],
  'hoodoo-tapered': ['Bryce Canyon tapered hoodoos', 'Cappadocia fairy chimneys'],

  'pavement-jointed': ['Tessellated Pavement Tasmania', 'Burren jointed limestone pavement'],
  'pavement-karst': ['Burren limestone pavement clints grikes', 'Malham Cove limestone pavement'],
  'mound-massive': ['Alabama Hills granite mound', 'Joshua Tree massive rock mound'],
  'mound-depositional': ['Yellowstone travertine mound', 'Mono Lake tufa mound'],
  'terrace-rock': ['Grand Canyon Tonto Platform', 'Colorado Plateau rock-cut terrace'],
  'terrace-travertine': ['Mammoth Hot Springs terraces', 'Pamukkale travertine terraces'],
  'ledge-resistant': ['Grand Canyon resistant limestone ledges', 'Capitol Reef resistant sandstone ledge'],
  'bench-erosional': ['Grand Canyon Tonto bench', 'Canyonlands erosional bench'],

  'wall-broad': ['El Capitan broad granite wall', 'Arches National Park Great Wall'],
  'cliff-massive': ['El Capitan massive cliff', 'Zion White Cliffs Navajo Sandstone'],
  'cliff-jointed': ['Devils Lake jointed quartzite cliff', 'Joshua Tree jointed granite cliff'],
  'cliff-bedded': ['Zion Navajo Sandstone cliffs', 'Grand Canyon Redwall Limestone'],
  'cliff-foliated': ['Black Canyon Gunnison gneiss wall', 'Lewisian gneiss sea cliffs'],
  'cliff-columnar': ['Giants Causeway columnar cliff', 'Devils Postpile columnar cliff'],
  'sea-cliff-massive': ['Cabo da Roca granite sea cliffs', 'Etretat chalk sea cliff'],
  'sea-cliff-bedded': ['Cliffs of Moher bedding', 'Jurassic Coast bedded cliffs'],
  'overhang-supported': ['Mesa Verde sandstone alcove roof', 'Zion supported sandstone overhang'],
  'canyon-wall': ['Zion Canyon wall', 'Grand Canyon wall'],
  'gorge-paired': ['Taroko Gorge marble walls', 'Black Canyon Gunnison gorge'],
  'escarpment-continuous': ['Niagara Escarpment', 'Drakensberg Great Escarpment'],
  'fault-scarp': ['Hebgen Lake earthquake fault scarp', 'Borah Peak fault scarp'],
  'slope-bedrock': ['Half Dome granite slab slope', 'Cairngorm granite bedrock slope'],
  'cliff-module-straight': ['Zion straight sandstone wall segment', 'Blue Mountains straight cliff face'],
  'cliff-module-corner': ['Zion canyon cliff corner', 'Grand Canyon projecting cliff corner'],
  'cliff-module-termination': ['Zion cliff spur termination', 'Blue Mountains cliff buttress termination'],

  'cave-mouth-karst': ['Carlsbad Caverns Natural Entrance', 'Mammoth Cave Historic Entrance'],
  'cave-mouth-volcanic': ['Thurston Lava Tube entrance', 'Lava Beds National Monument cave entrance'],
  'sea-cave': ['Fingals Cave Staffa', 'Benagil Sea Cave'],
  'arch-sandstone': ['Delicate Arch Utah', 'Double Arch Arches National Park'],
  'arch-sea': ['Durdle Door sea arch', 'Holei Sea Arch Hawaii'],
  'natural-bridge': ['Rainbow Bridge National Monument', 'Owachomo Bridge Natural Bridges'],

  'sea-stack': ['Old Man of Hoy sea stack', 'Twelve Apostles sea stacks'],
  'sea-stump': ['Old Harrys Wife sea stump', 'Twelve Apostles collapsed stack stumps'],

  'mesa-tabular': ['Grand Mesa Colorado', 'Island in the Sky mesa'],
  'butte-tabular': ['West Mitten Butte Monument Valley', 'Courthouse Butte Arizona'],
  'badlands-dissected': ['Badlands National Park pinnacles', 'Bisti De-Na-Zin badlands'],

  'dyke-wall': ['Shiprock radiating dikes', 'Spanish Peaks igneous dikes'],
  'sill-sheet': ['Palisades Sill Hudson River', 'Whin Sill Northumberland'],
  'vein-rib': ['Great Orme quartz vein rib', 'Cornwall quartz vein outcrop'],

  'volcanic-neck': ['Shiprock volcanic neck', 'Agathla Peak volcanic neck'],
  'lava-dome-blocky': ['Lassen Peak blocky lava dome', 'Novarupta lava dome'],
  'lava-dome-flow-banded': ['Obsidian Dome California flow banding', 'Newberry Big Obsidian Flow'],
  'column-colonnade': ['Giants Causeway colonnade', 'Devils Postpile colonnade'],
  'column-entablature': ['Columbia River Basalt entablature', 'Staffa basalt entablature'],
  'column-tiered-flow': ['Latourell Falls tiered basalt flow', 'Columbia River Gorge tiered basalt'],
  'column-radial': ['Samsons Ribs radial columns', 'Sheepeater Cliff curved basalt columns'],

  'ridge-massive': ['Sierra Nevada massive granite ridge', 'Clouds Rest granite ridge'],
  'ridge-stratified': ['Mount Rundle dipping strata', 'Castle Mountain Banff layered cliffs'],
  'ridge-folded': ['Appalachian folded ridges', 'Zagros folded mountain ridges'],
  'ridge-shattered-alpine': ['Matterhorn Hornli Ridge', 'Teton Cathedral Group shattered ridge'],
  'massif-exfoliation': ['Yosemite granite massif exfoliation', 'Spitzkoppe granite massif'],
  'massif-volcanic': ['Mount Rainier volcanic massif', 'Mount St Helens volcanic massif'],
  'karst-tower-field': ['Guilin fenglin limestone tower field', 'Yangshuo limestone tower field'],
  'mountain-modular-bedrock': ['Mount Rundle dipping layered mountain', 'Castle Mountain Banff bedrock hierarchy'],

  'field-boulder': ['Hickory Run Boulder Field', 'Ringing Rocks boulder field'],
  'fan-talus': ['Yosemite talus fan', 'Zion rockfall talus fan'],
  'sheet-scree': ['Teton scree sheet', 'Cairngorm scree slope'],
  'deposit-rockfall': ['Yosemite Happy Isles rockfall deposit', 'Zion rockfall deposit'],
  'moraine-bouldery': ['Rocky Mountain National Park bouldery moraine', 'Glacier National Park moraine boulders'],
  'bar-river': ['Elwha River gravel bar', 'Colorado River gravel bar'],
  'ridge-beach': ['Chesil Beach ridge', 'Lake Superior storm beach ridge'],
});

const APPROVED_PILOT_REFERENCES = Object.freeze({
  'tor-block-pile': [
    {
      label: 'Granite tors at Serpentine Hot Springs',
      license: 'NPS; verify image credit at source before redistribution',
      pageUrl: 'https://www.nps.gov/articles/000/geology-of-serpentine-hot-springs.htm',
      status: 'approved-for-shape-study',
    },
  ],
  'pillar-residual': [
    {
      label: 'Wulingyuan quartzite sandstone pillars panorama',
      license: 'Wikimedia Commons file page; license recorded there',
      pageUrl: 'https://commons.wikimedia.org/wiki/File:1_zhangjiajie_huangshizhai_wulingyuan_panorama_2012.jpg',
      status: 'approved-for-shape-study',
    },
  ],
  'arch-sandstone': [
    {
      label: 'Delicate Arch profile',
      license: 'Public domain dedication by photographer',
      pageUrl: 'https://commons.wikimedia.org/wiki/File:Delicate_arch.jpg',
      status: 'approved-for-shape-study',
    },
  ],
  'cliff-module-straight': [
    {
      label: 'Sandstone cliff at Emerald Pools, Zion National Park',
      license: 'USGS media; verify download/credit metadata at source',
      pageUrl: 'https://www.usgs.gov/media/images/sandstone-cliff',
      status: 'approved-for-shape-study',
    },
  ],
  'mountain-modular-bedrock': [
    {
      label: 'Mount Rundle dipping layered mountain',
      license: 'CC BY-SA 3.0 on Wikimedia Commons file page',
      pageUrl: 'https://commons.wikimedia.org/wiki/File:Mount_Rundle.jpg',
      status: 'approved-for-shape-study',
    },
    {
      label: 'Castle Mountain cliff-forming limestone hierarchy',
      license: 'Creative Commons; exact terms on Wikimedia Commons file page',
      pageUrl: 'https://commons.wikimedia.org/wiki/File:Castle_mountain_2003.jpg',
      status: 'approved-for-shape-study',
    },
  ],
  'hoodoo-caprock': [
    {
      label: "Thor's Hammer hoodoo",
      license: 'CC BY-SA 3.0 and GFDL on the Wikimedia Commons file page; credit Cory Trego',
      pageUrl: 'https://commons.wikimedia.org/wiki/File:Thors_hammer_hoodoo.jpg',
      status: 'approved-for-shape-study',
    },
  ],
});

const ART_DIRECTION_REFERENCES = Object.freeze({
  'pillar-residual': [
    {
      borrowedCues: [
        'mist-separated vertical groups',
        'strong negative space between shafts',
        'occasional broad ledges that can support landmarks',
      ],
      forbiddenAsEvidence: [
        'unsupported or floating masses',
        'decorative periodic bands',
        'lithology claims inferred from a fictional scene',
      ],
      label: 'Genshin Impact — Liyue/Jueyun Karst stone-forest composition',
      pageUrl: 'https://www.hoyolab.com/article/10028',
      rights: 'Link-only art-direction study; third-party game imagery is not redistributed.',
      status: 'candidate-art-direction-reference',
    },
  ],
  'karst-spire-singular': [
    {
      borrowedCues: ['mist-layered depth', 'isolated vertical landmark hierarchy'],
      forbiddenAsEvidence: ['invented ledges without solution or structural control', 'unsupported top-heavy silhouettes'],
      label: 'Genshin Impact — Liyue isolated peak composition',
      pageUrl: 'https://www.hoyolab.com/article/10028',
      rights: 'Link-only art-direction study; third-party game imagery is not redistributed.',
      status: 'candidate-art-direction-reference',
    },
  ],
  'karst-tower-field': [
    {
      borrowedCues: ['foreground-to-background peak rhythm', 'ink-wash-inspired atmospheric separation'],
      forbiddenAsEvidence: ['copying fictional topology as geology', 'uniformly spaced cloned towers'],
      label: 'Genshin Impact — Liyue distant stone-forest composition',
      pageUrl: 'https://www.hoyolab.com/article/10028',
      rights: 'Link-only art-direction study; third-party game imagery is not redistributed.',
      status: 'candidate-art-direction-reference',
    },
  ],
});

const AUTHORITY_REFERENCES = Object.freeze({
  'karst-tower-tiered': [
    {
      claim: 'Guilin is a reference example of fenglin tower karst developed in carbonate rock.',
      label: 'UNESCO — South China Karst',
      pageUrl: 'https://whc.unesco.org/en/list/1248',
      status: 'approved-geology-authority',
    },
  ],
  'pillar-residual': [
    {
      claim: 'Wulingyuan is dominated by narrow quartz sandstone pillars, not limestone tower karst.',
      label: 'UNESCO — Wulingyuan Scenic and Historic Interest Area',
      pageUrl: 'https://whc.unesco.org/en/list/640/',
      status: 'approved-geology-authority',
    },
  ],
  'arch-sandstone': [
    {
      claim: 'Jointed sandstone fins develop openings through weathering and erosion; the residual roof and abutments remain load-bearing.',
      label: 'USGS — Geology of Arches National Park',
      pageUrl: 'https://www.usgs.gov/geology-and-ecology-of-national-parks/geology-arches-national-park',
      status: 'approved-geology-authority',
    },
  ],
  'hoodoo-caprock': [
    {
      claim: 'A more resistant cap protects less resistant rock below, so contrasting resistance is a defining control on a caprock hoodoo.',
      label: 'NPS — Geodiversity Atlas: Cedar Breaks National Monument',
      pageUrl: 'https://www.nps.gov/articles/nps-geodiversity-atlas-cedar-breaks-national-monument-utah.htm',
      status: 'approved-geology-authority',
    },
    {
      claim: 'Differential weathering of variably cemented sedimentary layers produces irregular hoodoo columns rather than uniform manufactured pillars.',
      label: 'NPS — Hoodoos at Bryce Canyon',
      pageUrl: 'https://www.nps.gov/brca/learn/nature/hoodoos.htm',
      status: 'approved-geology-authority',
    },
  ],
});

function mediaSearchUrl(label) {
  const query = new URLSearchParams({ search: label, title: 'Special:MediaSearch', type: 'image' });
  return `https://commons.wikimedia.org/w/index.php?${query}`;
}

export const MORPHOLOGY_INSPIRATION_REGISTER_SCHEMA = 'toonlab/rock-morphology-inspiration-register';
export const MORPHOLOGY_INSPIRATION_REGISTER_VERSION = 1;

export function createMorphologyInspirationRegister() {
  const entries = taxonomy.subtypes.map((subtype) => {
    const names = EXEMPLARS[subtype.id];
    if (!names || names.length < 2) throw new Error(`Missing two inspiration exemplars for ${subtype.id}.`);
    return canonicalizeJson({
      approvedReferences: APPROVED_PILOT_REFERENCES[subtype.id] ?? [],
      artDirectionReferences: ART_DIRECTION_REFERENCES[subtype.id] ?? [],
      authorityReferences: AUTHORITY_REFERENCES[subtype.id] ?? [],
      candidateInspirations: names.map((label) => ({
        label,
        mediaSearchUrl: mediaSearchUrl(label),
        status: 'candidate-gallery-requires-image-level-review',
      })),
      familyId: subtype.familyId,
      forbiddenDrift: subtype.forbiddenDrift,
      requiredSilhouette: subtype.requiredSilhouette,
      subtypeId: subtype.id,
      subtypeLabel: subtype.label,
    });
  });
  return canonicalizeJson({
    entries,
    policy: {
      authoringBlockedWithoutApprovedImage: true,
      artDirectionCannotOverrideGeology: true,
      candidateSearchResultMayCountAsBaseline: false,
      everyAuthoredFeatureRequiresShapeRationale: true,
      imageLicenseAndCreditMustBeRecorded: true,
      minimumCandidateInspirationsPerSubtype: 2,
      natureAndArtDirectionEvidenceMustRemainSeparate: true,
      silhouetteObservationsRequiredBeforeAuthoring: true,
    },
    schema: MORPHOLOGY_INSPIRATION_REGISTER_SCHEMA,
    sourceContentId: contentId({ exemplars: EXEMPLARS, taxonomyVersion: taxonomy.version }),
    version: MORPHOLOGY_INSPIRATION_REGISTER_VERSION,
  });
}

export function summarizeMorphologyInspirationRegister(register = createMorphologyInspirationRegister()) {
  return canonicalizeJson({
    approvedImageReferences: register.entries.reduce((sum, entry) => sum + entry.approvedReferences.length, 0),
    artDirectionReferences: register.entries.reduce((sum, entry) => sum + entry.artDirectionReferences.length, 0),
    authorityReferences: register.entries.reduce((sum, entry) => sum + entry.authorityReferences.length, 0),
    candidateInspirations: register.entries.reduce((sum, entry) => sum + entry.candidateInspirations.length, 0),
    entries: register.entries.length,
    families: new Set(register.entries.map((entry) => entry.familyId)).size,
    subtypesWithApprovedImage: register.entries.filter((entry) => entry.approvedReferences.length > 0).length,
    subtypesBlockedForImageApproval: register.entries.filter((entry) => entry.approvedReferences.length === 0).length,
  });
}
