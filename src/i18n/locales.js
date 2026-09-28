// User-facing language metadata and concise interface copy shared by the OSS
// Labs shell and the documentation chrome. English remains the source of
// truth for technical identifiers, code, and serialized documents.

// flagCode points at local circular SVG badges in public/flags; keep emoji out
// of the language UI so every shell matches the reference language menu.
export const SUPPORTED_LOCALES = Object.freeze([
  { code: 'en', name: 'English', nativeName: 'English', flagCode: 'gb' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flagCode: 'jp' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flagCode: 'kr' },
  { code: 'zh', name: 'Chinese (Simplified)', nativeName: '简体中文', flagCode: 'cn' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flagCode: 'es' },
  { code: 'fr', name: 'French', nativeName: 'Français', flagCode: 'fr' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flagCode: 'de' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flagCode: 'pt' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)', nativeName: 'Português (Brasil)', flagCode: 'br' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flagCode: 'it' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flagCode: 'ru' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', flagCode: 'id' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', flagCode: 'vn' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', flagCode: 'th' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flagCode: 'tr' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flagCode: 'in' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flagCode: 'sa' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', flagCode: 'bd' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', flagCode: 'my' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flagCode: 'nl' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', flagCode: 'pl' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', flagCode: 'se' },
]);

const ENGLISH = Object.freeze({
  labs: 'Labs', generate: 'Generate', gallery: 'Gallery', library: 'Library',
  styles: 'Styles', settings: 'Settings', docs: 'Docs', github: 'GitHub',
  pro: 'ToonLab Pro', language: 'Language', chooseLab: 'Choose your lab',
  labsTitle: 'Labs', labsSuffix: '— everything runs in your browser.',
  explore: 'Explore {count} user-facing authoring Labs.', betaLabs: 'Live Labs',
  chooseByType: 'Choose by product type',
  chooseByTypeSuffix: '— shaders, generated assets, and reusable source maps.',
  shading: 'Shaders', shadingDescription: 'Character, vegetation, geology, terrain, manufactured, liquid, sky, and cloud treatments.',
  assets: 'Asset Generation', assetsDescription: 'Procedural geometry recipes and editable template-based rock generation.',
  textures: 'Source & Texture Generation', texturesDescription: 'Portable procedural material maps for user-authored surfaces.',
  beta: 'Live', demo: 'Example', family: 'family', preview: 'Preview',
  openDocs: 'Open documentation', documentation: 'Documentation', allLabs: 'All ToonLab Labs',
  labHome: 'Lab Home', file: 'File', edit: 'Edit', view: 'View', help: 'Help',
  reloadPreview: 'Reload Preview', docsKicker: 'Documentation', docsTitle: 'Build with ToonLab',
  docsLede: 'User guides for the runtime, Labs, MCP, portable documents, and asset workflows.',
  docsLanguageNotice: 'This guide follows the language selected in the header. Code, API names, and saved document fields remain unchanged.',
  docsLocalHint: 'Running ToonLab locally? Open /docs/ after starting the development server.',
  footer: 'MIT — ToonLab by Call Me Sensei',
});

// Editor copy is kept separate from the site copy above because Lab workspaces
// render their controls in React rather than through data-i18n attributes.
// Every editor string has a stable key so a lab never needs to guess which
// language is active or duplicate translation logic in its own UI.
const EDITOR_ENGLISH = Object.freeze({
  labCharacterShader: 'Character Shader Lab',
  labRockGeneration: 'Rock & Cliff Generation',
  labRockShader: 'Rock Shader Lab',
  labGroundShader: 'Ground Shader Lab',
  labTerrainGroundShader: 'Terrain & Ground Shader Lab',
  labGrassGeneration: 'Grass & Groundcover Generation Lab',
  labWater: 'Water Lab',
  labSkyAtmosphere: 'Atmosphere Source Lab',
  labEnvironmentShader: 'Environment Shader Lab',
  labManufacturedSurface: 'Manufactured Surface Shader Lab',
  labManufacturedMaterial: 'Manufactured Material Lab',
  labDebris: 'Debris Lab',
  labProp: 'Prop Lab',
  labBuilding: 'Building Lab',
  labLandscape: 'Landscape Lab',
  labTexture: 'Texture Lab',
  labVfx: 'VFX Lab',
  labFbx: 'FBX Editor',
  labTreeGeneration: 'Tree & Shrub Generation Lab',
  labFlower: 'Flower Lab',
  labTransparentShader: 'Glass & Transparent Shader Lab',
  labCloudShader: 'Cloud Shader Lab',
  labSkyShader: 'Sky Shader Lab',
  labSkyCloud: 'Sky & Cloud Lab',
  labAtmosphericCondition: 'Atmospheric Condition Lab',
  labAtmosphereFog: 'Atmosphere, Fog & Volumetrics Lab',
  chooseHowToBegin: 'Choose how to begin',
  whatWouldYouLikeToWorkOn: 'What would you like to work on?',
  draftSafe: 'Your current draft is safe until you explicitly create or open something else.',
  continue: 'Continue',
  currentDraft: 'Current draft',
  newEntry: 'New entry',
  openExistingEntry: 'Open an existing entry',
  searchSavedEntries: 'Search your saved entries and the Lab starter library.',
  searchSavedEntriesPlaceholder: 'Search saved entries and starters…',
  openStyle: 'Open style',
  noSavedEntries: 'No saved entries yet. Create one, then use Save As to add it here.',
  backToLabs: 'Back to Labs',
  leaveLab: 'Leave this Lab without changing the restored draft.',
  preview: 'Preview',
  rotate: 'Rotate',
  pan: 'Pan',
  zoom: 'Zoom',
  idle: 'Idle',
  walk: 'Walk',
  resetCamera: 'Reset camera (C)',
  previewHintOrbit: 'Left-drag rotate · wheel zoom · right-drag pan',
  previewHintWalk: 'WASD/arrows move · Shift runs · Space jumps',
  walkPreviewTitle: 'Walk preview: WASD/arrows move, Shift runs, Space jumps',
  previewTitle: 'Preview only — never saved into your preset.',
  rendererWebGpu: 'WebGPU',
  rendererWebGl: 'TSL WebGL',
  rendererWebGl2: 'TSL WebGL2',
  rendererBooting: 'booting…',
  rendererStillStarting: 'Renderer is still starting',
  rendererBackendMatches: 'Active backend matches the requested renderer',
  rendererRequestedButGot: 'Requested {requested} but got {actual}',
  labCommands: 'Lab commands',
  preset: 'Preset',
  presetTitle: 'The preset you are editing — switching replaces every value in this panel.',
  previewTitleHosted: 'Preview only — never saved into your preset. Upload characters on a character page (Characters → Media).',
  previewTitleLocal: 'Preview only — never saved into your preset. Add characters: drop files into assets-local/models/, run `npm run assets:local`, restart.',
  document: 'Document',
  undo: 'Undo',
  redo: 'Redo',
  update: 'Update',
  saveAs: 'Save As…',
  revertToPreset: 'Revert to preset',
  export: 'Export…',
  importPresetJson: 'Import preset JSON…',
  resetLab: 'Reset lab',
  close: 'Close',
  showOptions: 'Show options',
  noMatchingEntries: 'No matching entries',
  advanced: 'Advanced',
  default: 'Default',
  resetField: 'Reset {field} to default',
  customCharacterLook: 'New character look',
  continueCharacterPersisted: 'Continue with the character look restored from this browser.',
  continueCharacterStarter: 'Continue with the current starter look.',
  newCharacterLookDescription: 'Start a clean character look from the default ToonLab treatment.',
  styleReadOnly: 'read-only',
  styleSaved: 'saved',
  systemStyle: 'system',
  openStyleBundle: 'Open Style Bundle builder',
  base: 'Base',
  skin: 'Skin',
  cel: 'Cel',
  shadow: 'Shadow',
  light: 'Light',
  hair: 'Hair',
  detail: 'Detail',
  outline: 'Outline',
  baseDescription: 'Source texture policy, material roles, and alpha behavior.',
  skinDescription: 'Skin warmth and the face-area lighting overrides.',
  celDescription: 'Cel band thresholds, softness, and shadow tinting.',
  shadowDescription: 'Scene, self, averaged, and contact shadows.',
  lightDescription: 'Indirect bounce, local lights, rim light, and speculars.',
  hairDescription: 'Hair highlight band and eye highlights.',
  detailDescription: 'Material maps, glitter, stickers, fur, and perspective fixes.',
  outlineDescription: 'Ink outline width, color, and per-role behavior.',
  baseTexture: 'Base Texture',
  materialRoles: 'Material Roles',
  alpha: 'Alpha',
  customSaturation: 'Custom Saturation',
  materialColorMode: 'Material Color Mode',
  saturationMode: 'Saturation Mode',
  blendCutoff: 'Blend Cutoff',
  costumeCutout: 'Costume Cutout',
  cutoutCutoff: 'Cutout Cutoff',
  ditherOpacity: 'Dither Opacity',
  enabled: 'Enabled',
  expressionTokenCutout: 'Expression Token Cutout',
  eyeHighlightOrder: 'Eye Highlight Order',
  eyeOrder: 'Eye Order',
  faceCutout: 'Face Cutout',
  hairCutout: 'Hair Cutout',
  mapTransparentCutout: 'Map Transparent Cutout',
  overlayDepthWrite: 'Overlay Depth Write',
  overlayOrder: 'Overlay Order',
  preserveSourceAlphaTest: 'Preserve Source Alpha Test',
  scleraOrder: 'Sclera Order',
  skinCutout: 'Skin Cutout',
  sortOverlays: 'Sort Overlays',
  sourceAlphaMapCutout: 'Source Alpha Map Cutout',
  sourceTransparentCutout: 'Source Transparent Cutout',
  transparentOverlayBlend: 'Transparent Overlay Blend',
  transparentOpacityThreshold: 'Transparent Opacity Threshold',
  compatibility: 'Compatibility',
  sourceMaterialColor: 'Source Material Color',
  textureOnly: 'Texture Only',
  white: 'White',
  skinTone: 'Skin Tone',
  faceLighting: 'Face Lighting',
  celShade: 'Cel Shade',
  shadowColor: 'Shadow Color',
  sceneShadows: 'Scene Shadows',
  selfShadow: 'Self Shadow',
  averageShadow: 'Average Shadow',
  indirectLight: 'Indirect Light',
  localLights: 'Local Lights',
  rimLight: 'Rim Light',
  contactShadow: 'Contact Shadow',
  specular: 'Specular',
  hairHighlight: 'Hair Highlight',
  eyeHighlight: 'Eye Highlight',
  materialMaps: 'Material Maps',
  outlines: 'Outlines',
  glitter: 'Glitter',
  sticker: 'Sticker',
  shadingGroup: 'Shading',
  shadowTones: 'Shadow Tones',
  faceGroup: 'Face',
  castShadows: 'Cast Shadows',
  rim: 'Rim',
  highlights: 'Highlights',
  automaticRoles: 'Automatic Roles',
  fur: 'Fur',
  red: 'Red',
  green: 'Green',
  blue: 'Blue',
  alphaChannel: 'Alpha',
  off: 'Off',
  custom: 'Custom',
  sourceSaturation: 'Source Saturation',
  sourceMaterial: 'Source Material',
  sourceMaps: 'Source Maps',
  headBoneTracked: 'Head Bone (Tracked)',
  staticProxyNormal: 'Static Proxy Normal',
  depthTextureScreenSpace: 'Depth Texture (Screen Space)',
  fresnelClassic: 'Fresnel (Classic)',
  sceneShadowProxy: 'Scene Shadow Proxy',
  characterShadowPass: 'Character Shadow Pass',
  lightDirection: 'Light Direction',
  viewDirectionStable: 'View Direction (Stable)',
  additive: 'Additive',
  multiply: 'Multiply',
  alphaBlend: 'Alpha Blend',
  uv: 'UV',
  uv2: 'UV2',
  strandHighlight: 'Strand Highlight',
  softHighlight: 'Soft Highlight',
  uHorizontal: 'U / Horizontal',
  vVertical: 'V / Vertical',
  defaultLabel: 'Default',
  sourceTexture: 'Source Texture',
  sourceAlpha: 'Source Alpha',
  scrubHint: 'Drag to scrub · click to type (Shift 10×, Alt 0.1×)',
  loaded: 'Loaded {name}.',
  restoredLastLook: 'Restored your last look.',
  historyRestored: 'History restored.',
  opened: 'Opened {name}.',
  savedStyleDeleted: 'Saved style deleted. Call Me Sensei restored.',
  imported: 'Imported {name}.',
  labReset: 'Character Shader Lab reset.',
  savedToPresets: 'Saved “{name}” to your presets.',
  updated: 'Updated “{name}”.',
  couldNotLoadCharacter: 'Could not load the character: {message}',
  materials: 'materials',
});

// Exact phrase-to-key mapping lets shared controls localize labels supplied
// by schema metadata and by older Labs without mutating the saved schema.
const EDITOR_LABEL_KEYS = Object.freeze(Object.fromEntries([
  ...Object.entries(EDITOR_ENGLISH).map(([key, value]) => [value, key]),
  ['TSL WebGL2', 'rendererWebGl2'],
  ['Current draft', 'currentDraft'],
  ['Preset', 'preset'],
  ['The preset you are editing — switching replaces every value in this panel.', 'presetTitle'],
  ['Preview only — nothing here is saved into your document.', 'previewTitle'],
  ['Preview only — never saved into your preset. Upload characters on a character page (Characters → Media).', 'previewTitleHosted'],
  ['Preview only — never saved into your preset. Add characters: drop files into assets-local/models/, run `npm run assets:local`, restart.', 'previewTitleLocal'],
  ['Source texture policy, material roles, and alpha behavior.', 'baseDescription'],
  ['Skin warmth and the face-area lighting overrides.', 'skinDescription'],
  ['Cel band thresholds, softness, and shadow tinting.', 'celDescription'],
  ['Scene, self, averaged, and contact shadows.', 'shadowDescription'],
  ['Indirect bounce, local lights, rim light, and speculars.', 'lightDescription'],
  ['Hair highlight band and eye highlights.', 'hairDescription'],
  ['Material maps, glitter, stickers, fur, and perspective fixes.', 'detailDescription'],
  ['Ink outline width, color, and per-role behavior.', 'outlineDescription'],
  ['Base Texture', 'baseTexture'],
  ['Material Roles', 'materialRoles'],
  ['Alpha', 'alpha'],
  ['Custom Saturation', 'customSaturation'],
  ['Material Color Mode', 'materialColorMode'],
  ['Saturation Mode', 'saturationMode'],
  ['Blend Cutoff', 'blendCutoff'],
  ['Costume Cutout', 'costumeCutout'],
  ['Cutout Cutoff', 'cutoutCutoff'],
  ['Dither Opacity', 'ditherOpacity'],
  ['Enabled', 'enabled'],
  ['Expression Token Cutout', 'expressionTokenCutout'],
  ['Eye Highlight Order', 'eyeHighlightOrder'],
  ['Eye Order', 'eyeOrder'],
  ['Face Cutout', 'faceCutout'],
  ['Hair Cutout', 'hairCutout'],
  ['Map Transparent Cutout', 'mapTransparentCutout'],
  ['Overlay Depth Write', 'overlayDepthWrite'],
  ['Overlay Order', 'overlayOrder'],
  ['Preserve Source Alpha Test', 'preserveSourceAlphaTest'],
  ['Sclera Order', 'scleraOrder'],
  ['Skin Cutout', 'skinCutout'],
  ['Sort Overlays', 'sortOverlays'],
  ['Source Alpha Map Cutout', 'sourceAlphaMapCutout'],
  ['Source Transparent Cutout', 'sourceTransparentCutout'],
  ['Transparent Overlay Blend', 'transparentOverlayBlend'],
  ['Transparent Opacity Threshold', 'transparentOpacityThreshold'],
  ['Compatibility', 'compatibility'],
  ['Source Material Color', 'sourceMaterialColor'],
  ['Texture Only', 'textureOnly'],
  ['White', 'white'],
  ['Tree & Shrub Generation Lab', 'labTreeGeneration'],
  ['Flower Lab', 'labFlower'],
  ['Glass & Transparent Shader Lab', 'labTransparentShader'],
  ['Cloud Shader Lab', 'labCloudShader'],
  ['Sky Shader Lab', 'labSkyShader'],
  ['Sky & Cloud Lab', 'labSkyCloud'],
  ['Atmospheric Condition Lab', 'labAtmosphericCondition'],
  ['Atmosphere, Fog & Volumetrics Lab', 'labAtmosphereFog'],
  ['Skin Tone', 'skinTone'],
  ['Face Lighting', 'faceLighting'],
  ['Cel Shade', 'celShade'],
  ['Shadow Color', 'shadowColor'],
  ['Scene Shadows', 'sceneShadows'],
  ['Self Shadow', 'selfShadow'],
  ['Average Shadow', 'averageShadow'],
  ['Indirect Light', 'indirectLight'],
  ['Local Lights', 'localLights'],
  ['Rim Light', 'rimLight'],
  ['Contact Shadow', 'contactShadow'],
  ['Specular', 'specular'],
  ['Hair Highlight', 'hairHighlight'],
  ['Eye Highlight', 'eyeHighlight'],
  ['Material Maps', 'materialMaps'],
  ['Outlines', 'outlines'],
  ['Glitter', 'glitter'],
  ['Sticker', 'sticker'],
  ['Shading', 'shadingGroup'],
  ['Shadow Tones', 'shadowTones'],
  ['Face', 'faceGroup'],
  ['Cast Shadows', 'castShadows'],
  ['Rim', 'rim'],
  ['Highlights', 'highlights'],
  ['Automatic Roles', 'automaticRoles'],
  ['Fur', 'fur'],
  ['Red', 'red'],
  ['Green', 'green'],
  ['Blue', 'blue'],
  ['Off', 'off'],
  ['Custom', 'custom'],
  ['Source Saturation', 'sourceSaturation'],
  ['Source Material', 'sourceMaterial'],
  ['Source Maps', 'sourceMaps'],
  ['Head Bone (Tracked)', 'headBoneTracked'],
  ['Static Proxy Normal', 'staticProxyNormal'],
  ['Depth Texture (Screen Space)', 'depthTextureScreenSpace'],
  ['Fresnel (Classic)', 'fresnelClassic'],
  ['Scene Shadow Proxy', 'sceneShadowProxy'],
  ['Character Shadow Pass', 'characterShadowPass'],
  ['Light Direction', 'lightDirection'],
  ['View Direction (Stable)', 'viewDirectionStable'],
  ['Additive', 'additive'],
  ['Multiply', 'multiply'],
  ['Alpha Blend', 'alphaBlend'],
  ['UV', 'uv'],
  ['UV2', 'uv2'],
  ['Strand Highlight', 'strandHighlight'],
  ['Soft Highlight', 'softHighlight'],
  ['U / Horizontal', 'uHorizontal'],
  ['V / Vertical', 'vVertical'],
  ['Default', 'defaultLabel'],
  ['Drag to scrub · click to type (Shift 10×, Alt 0.1×)', 'scrubHint'],
  ['Walk preview: WASD/arrows move, Shift runs, Space jumps', 'walkPreviewTitle'],
]));

// A few long-form strings come from the original schema/runtime metadata rather
// than the editor dictionary. Keep their translations here so the shared
// renderer can localize them without changing saved schema documents.
const EDITOR_PHRASE_TRANSLATIONS = Object.freeze({
  'Preserves source texture, source material color, and saturation policy before toon lighting.': {
    ja: 'トゥーンライティング前に、元テクスチャ、元マテリアルカラー、彩度ポリシーを保持します。',
    ko: '툰 조명 전에 소스 텍스처, 소스 머티리얼 색상과 채도 정책을 유지합니다.',
    zh: '在卡通光照前保留源纹理、源材质颜色和饱和度策略。',
    es: 'Conserva la textura, el color del material de origen y la política de saturación antes de la iluminación toon.',
    fr: 'Conserve la texture, la couleur du matériau source et la règle de saturation avant l’éclairage toon.',
    de: 'Bewahrt Quelltextur, Quellmaterialfarbe und Sättigungseinstellung vor der Toon-Beleuchtung.',
    pt: 'Preserva a textura, a cor do material de origem e a política de saturação antes da iluminação toon.',
    'pt-BR': 'Preserva a textura, a cor do material de origem e a política de saturação antes da iluminação toon.',
    it: 'Mantiene la texture, il colore del materiale sorgente e la gestione della saturazione prima dell’illuminazione toon.',
    ru: 'Сохраняет исходную текстуру, цвет исходного материала и режим насыщенности до toon-освещения.',
    id: 'Mempertahankan tekstur sumber, warna material sumber, dan kebijakan saturasi sebelum pencahayaan toon.',
    vi: 'Giữ lại kết cấu nguồn, màu vật liệu nguồn và chính sách bão hòa trước khi chiếu sáng toon.',
    th: 'คงพื้นผิว สีของวัสดุต้นฉบับ และนโยบายความอิ่มตัวไว้ก่อนการจัดแสงแบบทูน',
    tr: 'Toon aydınlatmadan önce kaynak dokuyu, kaynak malzeme rengini ve doygunluk politikasını korur.',
    hi: 'टून लाइटिंग से पहले स्रोत टेक्सचर, स्रोत मटेरियल रंग और सैचुरेशन नीति को बनाए रखता है।',
    ar: 'يحافظ على نسيج المصدر ولون مادته وسياسة التشبع قبل إضاءة التون.',
    bn: 'টুন লাইটিংয়ের আগে সোর্স টেক্সচার, সোর্স ম্যাটেরিয়ালের রং ও স্যাচুরেশন নীতি অক্ষুণ্ণ রাখে।',
    ms: 'Mengekalkan tekstur sumber, warna bahan sumber dan dasar ketepuan sebelum pencahayaan toon.',
    nl: 'Behoudt de brontekstuur, bronmateriaalkleur en verzadigingsinstelling vóór toonbelichting.',
    pl: 'Zachowuje teksturę źródłową, kolor materiału źródłowego i ustawienie nasycenia przed oświetleniem toon.',
    sv: 'Bevarar källtextur, källmaterialets färg och mättnadsinställning före toonbelysning.',
  },
  'Controls cutout, blend, opacity, eye overlay sorting, and transparent decoration behavior.': {
    ja: '抜き、ブレンド、不透明度、目のオーバーレイ順序、透明な装飾の動作を設定します。',
    ko: '컷아웃, 블렌드, 불투명도, 눈 오버레이 정렬과 투명 장식 동작을 제어합니다.',
    zh: '控制裁切、混合、不透明度、眼睛叠加排序和透明装饰行为。',
    es: 'Controla el recorte, la mezcla, la opacidad, el orden de las superposiciones oculares y las decoraciones transparentes.',
    fr: 'Contrôle le détourage, le mélange, l’opacité, le tri des superpositions des yeux et les décorations transparentes.',
    de: 'Steuert Ausschnitt, Mischung, Deckkraft, Sortierung der Augen-Overlays und transparente Dekorationen.',
    pt: 'Controla recorte, mistura, opacidade, ordenação das sobreposições dos olhos e decorações transparentes.',
    'pt-BR': 'Controla recorte, mesclagem, opacidade, ordenação das sobreposições dos olhos e decorações transparentes.',
    it: 'Controlla ritaglio, fusione, opacità, ordine delle sovrapposizioni degli occhi e decorazioni trasparenti.',
    ru: 'Управляет вырезанием, смешиванием, непрозрачностью, порядком наложения глаз и прозрачными украшениями.',
    id: 'Mengontrol cutout, pencampuran, opasitas, urutan overlay mata, dan perilaku dekorasi transparan.',
    vi: 'Điều khiển cắt nền, hòa trộn, độ mờ, thứ tự lớp phủ mắt và cách hoạt động của chi tiết trong suốt.',
    th: 'ควบคุมการตัด การผสม ความทึบ การเรียงซ้อนของดวงตา และการทำงานของของตกแต่งโปร่งใส',
    tr: 'Kesme, karıştırma, opaklık, göz kaplamalarının sıralaması ve saydam süslemelerin davranışını denetler.',
    hi: 'कटआउट, ब्लेंड, अपारदर्शिता, आँखों के ओवरले क्रम और पारदर्शी सजावट के व्यवहार को नियंत्रित करता है।',
    ar: 'يتحكم في الاقتطاع والمزج والشفافية وترتيب تراكبات العين وسلوك الزخارف الشفافة.',
    bn: 'কাটআউট, ব্লেন্ড, অস্বচ্ছতা, চোখের ওভারলে সাজানো এবং স্বচ্ছ অলংকারের আচরণ নিয়ন্ত্রণ করে।',
    ms: 'Mengawal potongan, campuran, kelegapan, susunan tindanan mata dan tingkah laku hiasan lutsinar.',
    nl: 'Regelt uitsnede, menging, dekking, de volgorde van oog-overlays en transparante decoratie.',
    pl: 'Steruje wycięciem, mieszaniem, kryciem, kolejnością nakładek oczu i zachowaniem przezroczystych ozdób.',
    sv: 'Styr urklipp, blandning, opacitet, ordningen på ögonöverlagringar och genomskinliga dekorationer.',
  },
  "Play the character's idle clip": {
    ja: 'キャラクターの待機モーションを再生',
    ko: '캐릭터의 대기 애니메이션 재생',
    zh: '播放角色的待机动作',
    es: 'Reproducir la animación de reposo del personaje',
    fr: 'Lire l’animation d’attente du personnage',
    de: 'Leerlaufanimation des Charakters abspielen',
    pt: 'Reproduzir a animação de espera da personagem',
    'pt-BR': 'Reproduzir a animação ociosa do personagem',
    it: 'Riproduci l’animazione inattiva del personaggio',
    ru: 'Воспроизвести анимацию ожидания персонажа',
    id: 'Putar animasi diam karakter',
    vi: 'Phát hoạt ảnh chờ của nhân vật',
    th: 'เล่นแอนิเมชันท่ายืนของตัวละคร',
    tr: 'Karakterin boşta animasyonunu oynat',
    hi: 'पात्र का निष्क्रिय ऐनिमेशन चलाएँ',
    ar: 'تشغيل حركة السكون للشخصية',
    bn: 'চরিত্রের নিষ্ক্রিয় অ্যানিমেশন চালান',
    ms: 'Mainkan animasi melahu watak',
    nl: 'De idle-animatie van het personage afspelen',
    pl: 'Odtwórz animację bezczynności postaci',
    sv: 'Spela karaktärens inaktiva animation',
  },
  'Walk preview: WASD/arrows move, Shift runs, Space jumps': {
    ja: '歩行プレビュー: WASD／矢印で移動、Shiftで走る、Spaceでジャンプ',
    ko: '걷기 미리보기: WASD/화살표로 이동, Shift로 달리기, Space로 점프',
    zh: '行走预览：WASD/方向键移动，Shift 奔跑，Space 跳跃',
    es: 'Vista previa de caminar: muévete con WASD/flechas, corre con Shift y salta con Space',
    fr: 'Aperçu de marche : déplacez-vous avec WASD/flèches, courez avec Maj et sautez avec Espace',
    de: 'Gehvorschau: Mit WASD/Pfeiltasten bewegen, mit Umschalt laufen, mit Leertaste springen',
    pt: 'Pré-visualização da marcha: mova-se com WASD/setas, corra com Shift e salte com Espaço',
    'pt-BR': 'Prévia de caminhada: mova com WASD/setas, corra com Shift e pule com Espaço',
    it: 'Anteprima camminata: muoviti con WASD/frecce, corri con Maiusc e salta con Spazio',
    ru: 'Предпросмотр ходьбы: движение WASD/стрелками, бег — Shift, прыжок — Space',
    id: 'Pratinjau berjalan: bergerak dengan WASD/panah, berlari dengan Shift, melompat dengan Spasi',
    vi: 'Xem trước đi bộ: di chuyển bằng WASD/phím mũi tên, chạy bằng Shift, nhảy bằng Space',
    th: 'ตัวอย่างการเดิน: เคลื่อนที่ด้วย WASD/ปุ่มลูกศร วิ่งด้วย Shift และกระโดดด้วย Space',
    tr: 'Yürüme önizlemesi: WASD/oklarla hareket, Shift ile koş, Space ile zıpla',
    hi: 'चलने का पूर्वावलोकन: WASD/तीर से चलें, Shift से दौड़ें, Space से कूदें',
    ar: 'معاينة المشي: تحرك باستخدام WASD/الأسهم، اركض بـ Shift واقفز بـ Space',
    bn: 'হাঁটার প্রিভিউ: WASD/তীর দিয়ে চলুন, Shift দিয়ে দৌড়ান, Space দিয়ে লাফ দিন',
    ms: 'Pratonton berjalan: bergerak dengan WASD/panak, berlari dengan Shift, melompat dengan Space',
    nl: 'Loopvoorbeeld: bewegen met WASD/pijltjes, rennen met Shift, springen met Spatie',
    pl: 'Podgląd chodzenia: poruszaj się WASD/strzałkami, biegnij klawiszem Shift, skacz spacją',
    sv: 'Gångförhandsvisning: flytta med WASD/pilar, spring med Shift, hoppa med mellanslag',
  },
});

// Grass Lab still has a few construction/preview terms that are not shared by
// the shader editors. Keep these in the same locale pipeline instead of
// letting the legacy grass panel leak English into an otherwise translated UI.
const GRASS_EDITOR_ENGLISH = Object.freeze({
  styleLabel: 'Style',
  camera: 'Camera',
  sun: 'Sun',
  ambient: 'Amb',
  wind: 'Wind',
  cloud: 'Cloud',
  wet: 'Wet',
  snow: 'Snow',
  push: 'Push',
  clump: 'Clump',
  cluster: 'Cluster',
  patch: 'Patch',
  meadow: 'Meadow',
  previewStyles: 'Preview styles',
  previewAssets: 'Preview assets',
  presetPalettes: 'Preset Palettes',
  grassPaletteCaption: 'Each palette coordinates the base, tip, and material-shadow colors.',
  grassPaletteShadowHint: 'Selecting one also changes the grass color in shadow; fine-tune Shadow Tint under Shadows.',
  grassPaletteTitleSuffix: 'Sets Base Color, Tip Color, and Shadow Tint together.',
  grassPaletteSenseiMeadow: 'Sensei Meadow',
  grassPaletteSenseiMeadowDescription: 'The balanced green meadow used by the studio grass preset.',
  grassPaletteSpringLime: 'Spring Lime',
  grassPaletteSpringLimeDescription: 'Young yellow-green blades with a cool spring shadow.',
  grassPaletteDeepForest: 'Deep Forest',
  grassPaletteDeepForestDescription: 'Dense woodland green with a muted blue-green shadow.',
  grassPaletteSageField: 'Sage Field',
  grassPaletteSageFieldDescription: 'Soft desaturated greens for uplands and windswept fields.',
  grassPaletteDryPrairie: 'Dry Prairie',
  grassPaletteDryPrairieDescription: 'Sun-dried ochre grass with a violet-brown shadow.',
  grassPaletteAutumnAmber: 'Autumn Amber',
  grassPaletteAutumnAmberDescription: 'Warm russet and amber blades grounded by a plum shadow.',
  grassPaletteWisteria: 'Wisteria',
  grassPaletteWisteriaDescription: 'Fantasy violet grass with lavender tips and a deep lilac shadow.',
  grassPaletteMoonlitBlue: 'Moonlit Blue',
  grassPaletteMoonlitBlueDescription: 'Cool blue grass for nocturnal, alpine, or magical biomes.',
  grassPaletteSakuraField: 'Sakura Field',
  grassPaletteSakuraFieldDescription: 'Rose-pink blades with pale blossom tips and a mauve shadow.',
  grassPaletteCrimsonField: 'Crimson Field',
  grassPaletteCrimsonFieldDescription: 'Deep red fantasy grass with coral tips and a cool wine shadow.',
  fineTune: 'Fine Tune',
  show: 'Show',
  done: 'Done',
  grassRestored: 'Restored your last grass.',
  grassClumps: 'clumps',
  grassBladesCount: 'blades',
  grassBladesLabel: 'Blades',
  motion: 'Motion',
  palette: 'Palette',
  shadows: 'Shadows',
  sceneLight: 'Scene Light',
  sceneWind: 'Scene Wind',
  cloudField: 'Cloud Field',
  interaction: 'Interaction',
  grassBladesDescription: 'Random blade dimensions baked into the instance attributes when the field is built. Construction-only.',
  grassMotionDescription: 'Asset-level flexibility: how this grass responds when a scene supplies wind and gusts.',
  grassPaletteDescription: "The blades' coordinated base, tip, and material shadow colors — the grass's identity, whatever the scene lighting does. Magical blue grass welcome.",
  grassLightingDescription: 'How the blades RESPOND to scene light — e.g. the backlit glow on blades between the camera and the sun.',
  grassShadowsDescription: 'Grass-material shadow strength and palette tint. The renderer and cloud-shadow fields themselves come from the scene.',
  grassSceneLightDescription: 'Current sun direction/color and sky color supplied by the scene at runtime.',
  grassSceneWindDescription: 'Current world wind and gust field supplied by weather or another scene system.',
  grassCloudFieldDescription: 'Current drifting cloud-shadow field shared across terrain, water, and vegetation.',
  grassInteractionDescription: 'Current push target and influence radius supplied per scene or grass instance.',
  grassBladeHeightRange: 'Blade Height Range',
  grassBladeHeightRangeDescription: 'Min/max blade height in meters for placements without an explicit height. Construction-only: baked into instance attributes.',
  grassBladeWidthRange: 'Blade Width Range',
  grassBladeWidthRangeDescription: 'Min/max blade width in meters for placements without an explicit width. Construction-only: baked into instance attributes.',
  grassBladesPerClump: 'Blades Per Clump',
  grassBladesPerClumpDescription: 'Blades grown from each placement or authored into each paintable clump mesh. 1 keeps the classic lone-blade field; the first-party meadow clump uses 40. Construction-only.',
  grassClumpRadius: 'Clump Radius',
  grassClumpRadiusDescription: 'Base scatter radius in meters for the extra blades of a clump. Small values read as one tuft; larger values loosen the clump. Construction-only.',
  grassStaticLean: 'Static Lean',
  grassStaticLeanDescription: 'Authored static splay of each blade before live wind and interaction.',
  grassPreviewTitle: 'Preview only — planting, light, weather, and interaction are never saved into your grass preset.',
  grassPreviewCameraHint: 'Choose what left-drag does. Wheel zoom and right-drag pan remain available in every mode.',
  grassPreviewSunHint: 'Scene sun intensity — a preview fixture, not part of the preset.',
  grassPreviewAmbientHint: 'Scene ambient intensity — a preview fixture, not part of the preset.',
  grassPreviewWindHint: "Current scene wind strength — multiplied by the grass asset's Wind Response.",
  grassPreviewCloudHint: 'Current scene cloud-shadow field — preview only, not part of the grass asset.',
  grassPreviewWalkHint: 'Walk preview: WASD/arrows move, Shift runs, Space jumps — blades part around you',
  grassPresetTitle: 'The grass rendition for the active IP style — switching replaces every value in this panel.',
  grassNamePlaceholder: 'Grass name…',
  deleteSavedPreset: 'Delete this saved preset',
  updateSavedAsset: 'Update saved asset',
  exportGrassJson: 'Export runtime grass asset JSON',
  grassDocumentHelp: 'Changes autosave as the current draft. Save As creates a separate searchable grass asset; Update replaces only the selected saved asset. Exported JSON is the runtime grass-preset document.',
  grassSearchPlaceholder: 'Search…',
  grassDraftRestored: 'Keep working with the grass draft restored from this browser.',
  grassStarterDescription: 'Keep working from the current Call Me Sensei starter.',
  createCleanGrass: 'Create clean grass',
  grassNewDescription: 'Reset to a clean Call Me Sensei grass asset without deleting your saved library.',
  grassOpen: 'Open grass',
});

const GRASS_EDITOR_COPY = Object.freeze({
  en: GRASS_EDITOR_ENGLISH,
  ja: {
    styleLabel: 'スタイル', camera: 'カメラ', sun: '太陽', ambient: '環境光', wind: '風', cloud: '雲', wet: '濡れ', snow: '雪', push: '押し',
    clump: '束', cluster: 'クラスター', patch: 'パッチ', meadow: '草原', previewStyles: 'プレビュースタイル', previewAssets: 'プレビューアセット', presetPalettes: 'プリセットパレット', grassPaletteCaption: '各パレットは、根元・穂先・マテリアルシャドウの色を組み合わせます。', grassPaletteShadowHint: '選択すると影の草色も変わります。影の色合いは「シャドウ」で微調整できます。', grassPaletteTitleSuffix: '根元の色、穂先の色、シャドウの色合いをまとめて設定します。', grassPaletteSenseiMeadow: 'センセイ・メドウ', grassPaletteSenseiMeadowDescription: 'スタジオの草プリセットで使う、バランスのよい緑の草原。', grassPaletteSpringLime: 'スプリング・ライム', grassPaletteSpringLimeDescription: '若い黄緑のブレードと、涼しげな春色の影。', grassPaletteDeepForest: 'ディープ・フォレスト', grassPaletteDeepForestDescription: '深い森の緑に、落ち着いた青緑の影を合わせます。', grassPaletteSageField: 'セージ・フィールド', grassPaletteSageFieldDescription: '高地や風に吹かれる野原に合う、柔らかな低彩度の緑。', grassPaletteDryPrairie: 'ドライ・プレーリー', grassPaletteDryPrairieDescription: '日差しで乾いた黄土色の草と、紫がかった茶色の影。', grassPaletteAutumnAmber: 'オータム・アンバー', grassPaletteAutumnAmberDescription: '温かな赤褐色と琥珀色のブレードを、プラム色の影で引き締めます。', grassPaletteWisteria: 'ウィステリア', grassPaletteWisteriaDescription: 'ラベンダー色の穂先と深いライラックの影を持つ、幻想的な紫の草。', grassPaletteMoonlitBlue: 'ムーンリット・ブルー', grassPaletteMoonlitBlueDescription: '夜や高山、魔法のバイオームに合う涼しい青い草。', grassPaletteSakuraField: 'サクラ・フィールド', grassPaletteSakuraFieldDescription: '淡い花色の穂先とモーブ色の影を持つ、ローズピンクのブレード。', grassPaletteCrimsonField: 'クリムゾン・フィールド', grassPaletteCrimsonFieldDescription: '珊瑚色の穂先と冷たいワイン色の影を持つ、深紅の幻想的な草。', fineTune: '微調整', show: '表示', done: '完了',
    motion: 'モーション', palette: 'パレット', shadows: 'シャドウ', sceneLight: 'シーンライト', sceneWind: 'シーンの風', cloudField: '雲フィールド', interaction: 'インタラクション',
    grassMotionDescription: 'シーンから風や突風が与えられたときの、草アセットの反応の柔軟性です。', grassPaletteDescription: '根元・穂先・マテリアルシャドウの色をまとめて管理します。シーンの照明に左右されない草の個性です。幻想的な青い草も使えます。', grassLightingDescription: '草がシーンの光にどう反応するかを設定します。カメラと太陽の間にあるブレードの逆光の輝きなどが対象です。', grassShadowsDescription: '草マテリアルの影の強さと色合いです。レンダラーと雲影フィールド自体はシーンから供給されます。', grassSceneLightDescription: 'シーンがランタイムに供給する太陽の方向・色と空の色です。', grassSceneWindDescription: '天候などのシーンシステムが供給する、現在の世界風と突風のフィールドです。', grassCloudFieldDescription: '地形・水・植生で共有する、移動する雲影フィールドです。', grassInteractionDescription: 'シーンまたは草インスタンスごとに供給される、押しの対象と影響半径です。',
    grassRestored: '前回の草を復元しました。', grassClumps: '束', grassBladesCount: 'ブレード', grassBladesLabel: 'ブレード',
    grassBladesDescription: 'フィールド構築時にインスタンス属性へ焼き込まれる、草ブレード寸法のランダム幅です。構築時のみ使用します。',
    grassBladeHeightRange: 'ブレード高さの範囲', grassBladeHeightRangeDescription: '明示的な高さがない配置で使う、メートル単位のブレード高さの最小値と最大値です。インスタンス属性へ焼き込まれます。',
    grassBladeWidthRange: 'ブレード幅の範囲', grassBladeWidthRangeDescription: '明示的な幅がない配置で使う、メートル単位のブレード幅の最小値と最大値です。インスタンス属性へ焼き込まれます。',
    grassBladesPerClump: '1束あたりのブレード数', grassBladesPerClumpDescription: '各配置から伸びる、またはペイント可能な束メッシュに組み込まれるブレード数です。1なら従来の単一ブレードフィールドになり、ファーストパーティの草原クランプは40本を使います。構築時のみ使用します。',
    grassClumpRadius: '束の半径', grassClumpRadiusDescription: '束に追加するブレードの基本散布半径（メートル）です。小さい値は1つの房に見え、大きい値ほど束が広がります。構築時のみ使用します。',
    grassStaticLean: '固定の傾き', grassStaticLeanDescription: '風やインタラクションが加わる前の、各ブレードに設定された静的な広がりです。',
    grassPreviewTitle: 'プレビュー専用 — 植栽、光、天候、インタラクションは草プリセットに保存されません。',
    grassPreviewCameraHint: '左ドラッグの操作を選択します。ホイールズームと右ドラッグのパンはすべてのモードで使えます。',
    grassPreviewSunHint: 'シーンの太陽光強度 — プレビュー用で、プリセットには含まれません。',
    grassPreviewAmbientHint: 'シーンの環境光強度 — プレビュー用で、プリセットには含まれません。',
    grassPreviewWindHint: 'シーンの風の強さ — 草アセットの風反応を乗算します。',
    grassPreviewCloudHint: 'シーンの雲影フィールド — プレビュー用で、草アセットには含まれません。',
    grassPreviewWalkHint: '歩行プレビュー: WASD／矢印で移動、Shiftで走る、Spaceでジャンプ — 草が周囲で分かれます',
    grassPresetTitle: 'アクティブなIPスタイルの草の表現です — 切り替えるとこのパネルの値がすべて置き換わります。',
    grassNamePlaceholder: '草の名前…', deleteSavedPreset: '保存したプリセットを削除', updateSavedAsset: '保存したアセットを更新', exportGrassJson: 'ランタイム用草アセットJSONを書き出す', customGrass: 'カスタム…',
    grassDocumentHelp: '変更は現在の下書きとして自動保存されます。「名前を付けて保存」で検索可能な別の草アセットを作成し、「更新」で選択中の保存済みアセットだけを置き換えます。書き出したJSONはランタイムのgrass-presetドキュメントです。', grassSearchPlaceholder: '検索…',
    grassDraftRestored: 'このブラウザに復元された草の下書きで作業を続けます。', grassStarterDescription: '現在のCall Me Senseiスターターから作業を続けます。', createCleanGrass: '新しい草を作成', grassNewDescription: '保存済みライブラリを削除せず、Call Me Senseiの草アセットを初期状態から作成します。', grassOpen: '草を開く',
  },
  ko: { styleLabel: '스타일', camera: '카메라', sun: '태양', ambient: '환경광', wind: '바람', cloud: '구름', wet: '젖음', snow: '눈', push: '밀기', clump: '다발', cluster: '군집', patch: '패치', meadow: '초원', previewStyles: '미리보기 스타일', presetPalettes: '프리셋 팔레트', fineTune: '미세 조정', show: '표시', done: '완료', grassRestored: '마지막 잔디를 복원했습니다.', grassClumps: '다발', grassBladesCount: '블레이드', grassBladesLabel: '블레이드' },
  zh: { styleLabel: '风格', camera: '相机', sun: '太阳', ambient: '环境光', wind: '风', cloud: '云', wet: '湿润', snow: '雪', push: '推开', clump: '草簇', cluster: '簇群', patch: '草片', meadow: '草甸', previewStyles: '预览风格', presetPalettes: '预设调色板', fineTune: '微调', show: '显示', done: '完成', grassRestored: '已恢复上次的草地。', grassClumps: '草簇', grassBladesCount: '草叶', grassBladesLabel: '草叶' },
  es: { styleLabel: 'Estilo', camera: 'Cámara', sun: 'Sol', ambient: 'Ambiente', wind: 'Viento', cloud: 'Nube', wet: 'Humedad', snow: 'Nieve', push: 'Empuje', clump: 'Mata', cluster: 'Grupo', patch: 'Parche', meadow: 'Pradera', previewStyles: 'Estilos de vista previa', presetPalettes: 'Paletas predefinidas', fineTune: 'Ajuste fino', show: 'Mostrar', done: 'Listo', grassRestored: 'Se restauró el césped anterior.', grassClumps: 'matas', grassBladesCount: 'hojas', grassBladesLabel: 'Hojas' },
  fr: { styleLabel: 'Style', camera: 'Caméra', sun: 'Soleil', ambient: 'Ambiance', wind: 'Vent', cloud: 'Nuage', wet: 'Humidité', snow: 'Neige', push: 'Poussée', clump: 'Touffe', cluster: 'Groupe', patch: 'Plaque', meadow: 'Prairie', previewStyles: 'Styles d’aperçu', presetPalettes: 'Palettes prédéfinies', fineTune: 'Réglage fin', show: 'Afficher', done: 'Terminé', grassRestored: 'La dernière herbe a été restaurée.', grassClumps: 'touffes', grassBladesCount: 'brins', grassBladesLabel: 'Brins' },
  de: { styleLabel: 'Stil', camera: 'Kamera', sun: 'Sonne', ambient: 'Umgebungslicht', wind: 'Wind', cloud: 'Wolke', wet: 'Nass', snow: 'Schnee', push: 'Schieben', clump: 'Büschel', cluster: 'Gruppe', patch: 'Fleck', meadow: 'Wiese', previewStyles: 'Vorschau-Stile', presetPalettes: 'Voreingestellte Paletten', fineTune: 'Feineinstellung', show: 'Anzeigen', done: 'Fertig', grassRestored: 'Das letzte Gras wurde wiederhergestellt.', grassClumps: 'Büschel', grassBladesCount: 'Halme', grassBladesLabel: 'Halme' },
  pt: { styleLabel: 'Estilo', camera: 'Câmara', sun: 'Sol', ambient: 'Ambiente', wind: 'Vento', cloud: 'Nuvem', wet: 'Húmido', snow: 'Neve', push: 'Empurrar', clump: 'Tufo', cluster: 'Grupo', patch: 'Mancha', meadow: 'Prado', previewStyles: 'Estilos de pré-visualização', presetPalettes: 'Paletas predefinidas', fineTune: 'Ajuste fino', show: 'Mostrar', done: 'Concluído', grassRestored: 'O último relvado foi restaurado.', grassClumps: 'tufos', grassBladesCount: 'folhas', grassBladesLabel: 'Folhas' },
  'pt-BR': { styleLabel: 'Estilo', camera: 'Câmera', sun: 'Sol', ambient: 'Ambiente', wind: 'Vento', cloud: 'Nuvem', wet: 'Úmido', snow: 'Neve', push: 'Empurrar', clump: 'Tufos', cluster: 'Grupo', patch: 'Mancha', meadow: 'Prado', previewStyles: 'Estilos de prévia', presetPalettes: 'Paletas predefinidas', fineTune: 'Ajuste fino', show: 'Mostrar', done: 'Concluído', grassRestored: 'O último gramado foi restaurado.', grassClumps: 'tufos', grassBladesCount: 'folhas', grassBladesLabel: 'Folhas' },
  it: { styleLabel: 'Stile', camera: 'Fotocamera', sun: 'Sole', ambient: 'Ambiente', wind: 'Vento', cloud: 'Nuvola', wet: 'Bagnato', snow: 'Neve', push: 'Spinta', clump: 'Ciuffo', cluster: 'Gruppo', patch: 'Macchia', meadow: 'Prato', previewStyles: 'Stili anteprima', presetPalettes: 'Palette predefinite', fineTune: 'Regolazione fine', show: 'Mostra', done: 'Fatto', grassRestored: 'L’ultima erba è stata ripristinata.', grassClumps: 'ciuffi', grassBladesCount: 'steli', grassBladesLabel: 'Steli' },
  ru: { styleLabel: 'Стиль', camera: 'Камера', sun: 'Солнце', ambient: 'Окружение', wind: 'Ветер', cloud: 'Облако', wet: 'Влага', snow: 'Снег', push: 'Толкать', clump: 'Пучок', cluster: 'Группа', patch: 'Участок', meadow: 'Луг', previewStyles: 'Стили предпросмотра', presetPalettes: 'Предустановленные палитры', fineTune: 'Точная настройка', show: 'Показать', done: 'Готово', grassRestored: 'Последняя трава восстановлена.', grassClumps: 'пучков', grassBladesCount: 'стеблей', grassBladesLabel: 'Стебли' },
  id: { styleLabel: 'Gaya', camera: 'Kamera', sun: 'Matahari', ambient: 'Ambien', wind: 'Angin', cloud: 'Awan', wet: 'Basah', snow: 'Salju', push: 'Dorong', clump: 'Rumpun', cluster: 'Kelompok', patch: 'Petak', meadow: 'Padang rumput', previewStyles: 'Gaya pratinjau', presetPalettes: 'Palet prasetel', fineTune: 'Penyetelan halus', show: 'Tampilkan', done: 'Selesai', grassRestored: 'Rumput terakhir dipulihkan.', grassClumps: 'rumpun', grassBladesCount: 'bilah', grassBladesLabel: 'Bilah' },
  vi: { styleLabel: 'Phong cách', camera: 'Máy ảnh', sun: 'Mặt trời', ambient: 'Môi trường', wind: 'Gió', cloud: 'Mây', wet: 'Ẩm', snow: 'Tuyết', push: 'Đẩy', clump: 'Bụi', cluster: 'Cụm', patch: 'Mảng', meadow: 'Đồng cỏ', previewStyles: 'Phong cách xem trước', presetPalettes: 'Bảng màu đặt sẵn', fineTune: 'Tinh chỉnh', show: 'Hiện', done: 'Xong', grassRestored: 'Đã khôi phục cỏ lần trước.', grassClumps: 'bụi', grassBladesCount: 'ngọn', grassBladesLabel: 'Ngọn cỏ' },
  th: { styleLabel: 'สไตล์', camera: 'กล้อง', sun: 'ดวงอาทิตย์', ambient: 'แสงแวดล้อม', wind: 'ลม', cloud: 'เมฆ', wet: 'เปียก', snow: 'หิมะ', push: 'ผลัก', clump: 'กอ', cluster: 'กลุ่ม', patch: 'แปลง', meadow: 'ทุ่งหญ้า', previewStyles: 'สไตล์ตัวอย่าง', presetPalettes: 'ชุดสีสำเร็จรูป', fineTune: 'ปรับละเอียด', show: 'แสดง', done: 'เสร็จสิ้น', grassRestored: 'กู้คืนหญ้าครั้งล่าสุดแล้ว', grassClumps: 'กอ', grassBladesCount: 'ใบ', grassBladesLabel: 'ใบหญ้า' },
  tr: { styleLabel: 'Stil', camera: 'Kamera', sun: 'Güneş', ambient: 'Ortam', wind: 'Rüzgâr', cloud: 'Bulut', wet: 'Islak', snow: 'Kar', push: 'İt', clump: 'Öbek', cluster: 'Küme', patch: 'Yama', meadow: 'Çayır', previewStyles: 'Önizleme stilleri', presetPalettes: 'Hazır paletler', fineTune: 'İnce ayar', show: 'Göster', done: 'Bitti', grassRestored: 'Son çim görünümü geri yüklendi.', grassClumps: 'öbek', grassBladesCount: 'sap', grassBladesLabel: 'Saplar' },
  hi: { styleLabel: 'स्टाइल', camera: 'कैमरा', sun: 'सूर्य', ambient: 'परिवेश', wind: 'हवा', cloud: 'बादल', wet: 'गीला', snow: 'बर्फ', push: 'धक्का', clump: 'गुच्छा', cluster: 'समूह', patch: 'पैच', meadow: 'घास का मैदान', previewStyles: 'पूर्वावलोकन स्टाइल', presetPalettes: 'प्रीसेट पैलेट', fineTune: 'सूक्ष्म समायोजन', show: 'दिखाएँ', done: 'हो गया', grassRestored: 'पिछली घास पुनर्स्थापित की गई।', grassClumps: 'गुच्छे', grassBladesCount: 'ब्लेड', grassBladesLabel: 'ब्लेड' },
  ar: { styleLabel: 'النمط', camera: 'الكاميرا', sun: 'الشمس', ambient: 'الإضاءة المحيطة', wind: 'الرياح', cloud: 'السحابة', wet: 'رطب', snow: 'ثلج', push: 'دفع', clump: 'كتلة', cluster: 'مجموعة', patch: 'رقعة', meadow: 'مرج', previewStyles: 'أنماط المعاينة', presetPalettes: 'لوحات مسبقة', fineTune: 'ضبط دقيق', show: 'إظهار', done: 'تم', grassRestored: 'تمت استعادة العشب الأخير.', grassClumps: 'كتلات', grassBladesCount: 'شفرات', grassBladesLabel: 'شفرات' },
  bn: { styleLabel: 'স্টাইল', camera: 'ক্যামেরা', sun: 'সূর্য', ambient: 'অ্যাম্বিয়েন্ট', wind: 'বাতাস', cloud: 'মেঘ', wet: 'ভেজা', snow: 'তুষার', push: 'ধাক্কা', clump: 'গুচ্ছ', cluster: 'গোষ্ঠী', patch: 'প্যাচ', meadow: 'তৃণভূমি', previewStyles: 'প্রিভিউ স্টাইল', presetPalettes: 'প্রিসেট প্যালেট', fineTune: 'সূক্ষ্ম সমন্বয়', show: 'দেখান', done: 'সম্পন্ন', grassRestored: 'শেষের ঘাস পুনরুদ্ধার করা হয়েছে।', grassClumps: 'গুচ্ছ', grassBladesCount: 'ব্লেড', grassBladesLabel: 'ব্লেড' },
  ms: { styleLabel: 'Gaya', camera: 'Kamera', sun: 'Matahari', ambient: 'Ambien', wind: 'Angin', cloud: 'Awan', wet: 'Basah', snow: 'Salji', push: 'Tolak', clump: 'Rumpun', cluster: 'Kelompok', patch: 'Tompok', meadow: 'Padang rumput', previewStyles: 'Gaya pratonton', presetPalettes: 'Palet pratetap', fineTune: 'Pelarasan halus', show: 'Tunjukkan', done: 'Selesai', grassRestored: 'Rumput terakhir dipulihkan.', grassClumps: 'rumpun', grassBladesCount: 'bilah', grassBladesLabel: 'Bilah' },
  nl: { styleLabel: 'Stijl', camera: 'Camera', sun: 'Zon', ambient: 'Omgeving', wind: 'Wind', cloud: 'Wolk', wet: 'Nat', snow: 'Sneeuw', push: 'Duwen', clump: 'Pol', cluster: 'Cluster', patch: 'Plek', meadow: 'Weide', previewStyles: 'Voorbeeldstijlen', presetPalettes: 'Vooraf ingestelde paletten', fineTune: 'Fijn afstellen', show: 'Tonen', done: 'Klaar', grassRestored: 'Het vorige gras is hersteld.', grassClumps: 'pollen', grassBladesCount: 'sprieten', grassBladesLabel: 'Sprieten' },
  pl: { styleLabel: 'Styl', camera: 'Kamera', sun: 'Słońce', ambient: 'Otoczenie', wind: 'Wiatr', cloud: 'Chmura', wet: 'Mokre', snow: 'Śnieg', push: 'Popychanie', clump: 'Kępa', cluster: 'Grupa', patch: 'Płat', meadow: 'Łąka', previewStyles: 'Style podglądu', presetPalettes: 'Palety ustawień', fineTune: 'Dostrajanie', show: 'Pokaż', done: 'Gotowe', grassRestored: 'Przywrócono ostatnią trawę.', grassClumps: 'kęp', grassBladesCount: 'źdźbeł', grassBladesLabel: 'Źdźbła' },
  sv: { styleLabel: 'Stil', camera: 'Kamera', sun: 'Sol', ambient: 'Omgivning', wind: 'Vind', cloud: 'Moln', wet: 'Våt', snow: 'Snö', push: 'Tryck', clump: 'Tuva', cluster: 'Grupp', patch: 'Fläck', meadow: 'Äng', previewStyles: 'Förhandsvisningsstilar', presetPalettes: 'Förinställda paletter', fineTune: 'Finjustering', show: 'Visa', done: 'Klar', grassRestored: 'Det senaste gräset har återställts.', grassClumps: 'tuvor', grassBladesCount: 'strån', grassBladesLabel: 'Strån' },
});

const GRASS_EDITOR_LABEL_KEYS = Object.freeze(Object.fromEntries(
  Object.entries(GRASS_EDITOR_ENGLISH).map(([key, value]) => [value, key]),
));

const COPY = Object.freeze({
  en: ENGLISH,
  ja: { labs: 'ラボ', generate: '生成', gallery: 'ギャラリー', library: 'ライブラリ', styles: 'スタイル', settings: '設定', docs: 'ドキュメント', github: 'GitHub', pro: 'ToonLab Pro', language: '言語', chooseLab: 'ラボを選択', labsTitle: 'ラボ', labsSuffix: '— すべてブラウザで動作します。', explore: '{count}個のユーザー向け制作ラボを試す。', betaLabs: '公開中のラボ', chooseByType: '種類から選ぶ', chooseByTypeSuffix: '— シェーダー、生成アセット、再利用できる素材マップ。', shading: 'シェーダー', shadingDescription: 'キャラクター、植生、地質、地形、人工物、水、空、雲の表現。', assets: 'アセット生成', assetsDescription: 'プロシージャル形状レシピと、テンプレートから編集できる岩の生成。', textures: '素材・テクスチャ生成', texturesDescription: 'ユーザーが作るサーフェス用のプロシージャル素材マップ。', beta: '公開中', demo: 'サンプル', family: '系統', preview: 'プレビュー', openDocs: 'ドキュメントを開く', documentation: 'ドキュメント', allLabs: 'ToonLabの全ラボ', labHome: 'ラボホーム', file: 'ファイル', edit: '編集', view: '表示', help: 'ヘルプ', reloadPreview: 'プレビューを再読み込み', docsKicker: 'ドキュメント', docsTitle: 'ToonLabで制作する', docsLede: 'ランタイム、ラボ、MCP、ポータブルドキュメント、アセット制作のユーザーガイド。', docsLanguageNotice: 'ヘッダーで選んだ言語に合わせて表示します。コード、API名、保存ドキュメントのフィールド名は変わりません。', docsLocalHint: 'ローカルで起動した場合は、開発サーバーの起動後に /docs/ を開いてください。', footer: 'MIT — ToonLab by Call Me Sensei' },
  ko: { labs: '랩', generate: '생성', gallery: '갤러리', library: '라이브러리', styles: '스타일', settings: '설정', docs: '문서', github: 'GitHub', pro: 'ToonLab Pro', language: '언어', chooseLab: '랩 선택', labsTitle: '랩', labsSuffix: '— 모든 기능은 브라우저에서 실행됩니다.', explore: '사용자용 제작 랩 {count}개를 살펴보세요.', betaLabs: '공개 랩', chooseByType: '제품 유형으로 선택', chooseByTypeSuffix: '— 셰이더, 생성 에셋, 재사용 가능한 소스 맵.', shading: '셰이더', shadingDescription: '캐릭터, 식생, 지질, 지형, 제조 표면, 물, 하늘, 구름 표현.', assets: '에셋 생성', assetsDescription: '절차적 형상 레시피와 템플릿 기반 편집형 바위 생성.', textures: '소스·텍스처 생성', texturesDescription: '사용자 표면을 위한 절차적 머티리얼 맵.', beta: '공개', demo: '예제', family: '분류', preview: '미리보기', openDocs: '문서 열기', documentation: '문서', allLabs: '모든 ToonLab 랩', labHome: '랩 홈', file: '파일', edit: '편집', view: '보기', help: '도움말', reloadPreview: '미리보기 새로고침', docsKicker: '문서', docsTitle: 'ToonLab으로 제작하기', docsLede: '런타임, 랩, MCP, 포터블 문서, 에셋 워크플로를 위한 사용자 가이드.', docsLanguageNotice: '헤더에서 선택한 언어로 안내를 표시합니다. 코드, API 이름, 저장 문서 필드는 그대로 유지됩니다.', docsLocalHint: '로컬에서 실행 중이라면 개발 서버를 시작한 뒤 /docs/를 열어보세요.', footer: 'MIT — ToonLab by Call Me Sensei' },
  zh: { labs: '实验室', generate: '生成', gallery: '画廊', library: '素材库', styles: '风格', settings: '设置', docs: '文档', github: 'GitHub', pro: 'ToonLab Pro', language: '语言', chooseLab: '选择实验室', labsTitle: '实验室', labsSuffix: '— 全部在浏览器中运行。', explore: '探索 {count} 个面向用户的制作实验室。', betaLabs: '已上线实验室', chooseByType: '按产品类型选择', chooseByTypeSuffix: '— 着色器、生成资产和可复用的源材质图。', shading: '着色器', shadingDescription: '角色、植被、地质、地形、人工表面、水面、天空与云层效果。', assets: '资产生成', assetsDescription: '程序化几何配方，以及基于模板编辑岩石。', textures: '源材质与纹理生成', texturesDescription: '用于用户自制表面的程序化材质图。', beta: '已上线', demo: '示例', family: '分类', preview: '预览', openDocs: '打开文档', documentation: '文档', allLabs: '全部 ToonLab 实验室', labHome: '实验室主页', file: '文件', edit: '编辑', view: '视图', help: '帮助', reloadPreview: '重新加载预览', docsKicker: '文档', docsTitle: '使用 ToonLab 制作', docsLede: '运行时、实验室、MCP、便携文档和资产工作流的用户指南。', docsLanguageNotice: '内容会使用页眉选择的语言显示。代码、API 名称和保存文档字段保持不变。', docsLocalHint: '在本地运行时，请先启动开发服务器，再打开 /docs/。', footer: 'MIT — ToonLab by Call Me Sensei' },
  es: { labs: 'Labs', generate: 'Generar', gallery: 'Galería', library: 'Biblioteca', styles: 'Estilos', settings: 'Ajustes', docs: 'Docs', github: 'GitHub', pro: 'ToonLab Pro', language: 'Idioma', chooseLab: 'Elige tu Lab', labsTitle: 'Labs', labsSuffix: '— todo funciona en el navegador.', explore: 'Explora {count} Labs de creación para usuarios.', betaLabs: 'Labs disponibles', chooseByType: 'Elige por tipo de producto', chooseByTypeSuffix: '— shaders, recursos generados y mapas de materiales reutilizables.', shading: 'Shaders', shadingDescription: 'Tratamientos para personajes, vegetación, geología, terreno, superficies fabricadas, agua, cielo y nubes.', assets: 'Generación de recursos', assetsDescription: 'Recetas de geometría procedural y rocas editables desde una plantilla.', textures: 'Generación de fuentes y texturas', texturesDescription: 'Mapas de materiales procedurales para superficies creadas por ti.', beta: 'Disponible', demo: 'Ejemplo', family: 'familia', preview: 'Vista previa', openDocs: 'Abrir documentación', documentation: 'Documentación', allLabs: 'Todos los Labs de ToonLab', labHome: 'Inicio del Lab', file: 'Archivo', edit: 'Editar', view: 'Ver', help: 'Ayuda', reloadPreview: 'Recargar vista previa', docsKicker: 'Documentación', docsTitle: 'Crea con ToonLab', docsLede: 'Guías de usuario para el runtime, los Labs, MCP, documentos portátiles y flujos de recursos.', docsLanguageNotice: 'La guía usa el idioma elegido en la cabecera. El código, los nombres de API y los campos guardados no cambian.', docsLocalHint: 'Si ejecutas ToonLab localmente, abre /docs/ después de iniciar el servidor de desarrollo.', footer: 'MIT — ToonLab by Call Me Sensei' },
  fr: { labs: 'Labs', generate: 'Générer', gallery: 'Galerie', library: 'Bibliothèque', styles: 'Styles', settings: 'Réglages', docs: 'Docs', github: 'GitHub', pro: 'ToonLab Pro', language: 'Langue', chooseLab: 'Choisissez votre Lab', labsTitle: 'Labs', labsSuffix: '— tout fonctionne dans le navigateur.', explore: 'Découvrez {count} Labs de création pour les utilisateurs.', betaLabs: 'Labs disponibles', chooseByType: 'Choisir par type de produit', chooseByTypeSuffix: '— shaders, ressources générées et cartes source réutilisables.', shading: 'Shaders', shadingDescription: 'Traitements pour personnages, végétation, géologie, terrain, surfaces fabriquées, eau, ciel et nuages.', assets: 'Génération d’assets', assetsDescription: 'Recettes de géométrie procédurale et roches éditables depuis un modèle.', textures: 'Génération de sources et textures', texturesDescription: 'Cartes de matériaux procédurales pour vos surfaces.', beta: 'Disponible', demo: 'Exemple', family: 'famille', preview: 'Aperçu', openDocs: 'Ouvrir la documentation', documentation: 'Documentation', allLabs: 'Tous les Labs ToonLab', labHome: 'Accueil du Lab', file: 'Fichier', edit: 'Édition', view: 'Affichage', help: 'Aide', reloadPreview: 'Recharger l’aperçu', docsKicker: 'Documentation', docsTitle: 'Créer avec ToonLab', docsLede: 'Guides utilisateur du runtime, des Labs, de MCP, des documents portables et des assets.', docsLanguageNotice: 'Le guide suit la langue choisie dans l’en-tête. Le code, les noms d’API et les champs enregistrés restent inchangés.', docsLocalHint: 'En local, ouvrez /docs/ après avoir démarré le serveur de développement.', footer: 'MIT — ToonLab by Call Me Sensei' },
  de: { labs: 'Labs', generate: 'Generieren', gallery: 'Galerie', library: 'Bibliothek', styles: 'Stile', settings: 'Einstellungen', docs: 'Doku', github: 'GitHub', pro: 'ToonLab Pro', language: 'Sprache', chooseLab: 'Lab auswählen', labsTitle: 'Labs', labsSuffix: '— alles läuft im Browser.', explore: 'Entdecke {count} nutzerorientierte Kreativ-Labs.', betaLabs: 'Verfügbare Labs', chooseByType: 'Nach Produkttyp auswählen', chooseByTypeSuffix: '— Shader, generierte Assets und wiederverwendbare Quellkarten.', shading: 'Shader', shadingDescription: 'Behandlungen für Figuren, Vegetation, Geologie, Gelände, gefertigte Oberflächen, Wasser, Himmel und Wolken.', assets: 'Asset-Generierung', assetsDescription: 'Prozedurale Geometrierezepte und editierbare Felsen aus einer Vorlage.', textures: 'Quell- und Texturgenerierung', texturesDescription: 'Prozedurale Materialkarten für eigene Oberflächen.', beta: 'Verfügbar', demo: 'Beispiel', family: 'Bereich', preview: 'Vorschau', openDocs: 'Dokumentation öffnen', documentation: 'Dokumentation', allLabs: 'Alle ToonLab-Labs', labHome: 'Lab-Startseite', file: 'Datei', edit: 'Bearbeiten', view: 'Ansicht', help: 'Hilfe', reloadPreview: 'Vorschau neu laden', docsKicker: 'Dokumentation', docsTitle: 'Mit ToonLab gestalten', docsLede: 'Benutzerhandbücher für Runtime, Labs, MCP, portable Dokumente und Asset-Workflows.', docsLanguageNotice: 'Die Anleitung folgt der Sprache im Header. Code, API-Namen und gespeicherte Dokumentfelder bleiben unverändert.', docsLocalHint: 'Lokal? Öffne nach dem Start des Entwicklungsservers /docs/.', footer: 'MIT — ToonLab by Call Me Sensei' },
  pt: { labs: 'Labs', generate: 'Gerar', gallery: 'Galeria', library: 'Biblioteca', styles: 'Estilos', settings: 'Definições', docs: 'Docs', github: 'GitHub', pro: 'ToonLab Pro', language: 'Idioma', chooseLab: 'Escolha o seu Lab', labsTitle: 'Labs', labsSuffix: '— tudo corre no navegador.', explore: 'Explore {count} Labs de criação para utilizadores.', betaLabs: 'Labs disponíveis', chooseByType: 'Escolher por tipo de produto', chooseByTypeSuffix: '— shaders, assets gerados e mapas de origem reutilizáveis.', shading: 'Shaders', shadingDescription: 'Tratamentos para personagens, vegetação, geologia, terreno, superfícies fabricadas, água, céu e nuvens.', assets: 'Geração de assets', assetsDescription: 'Receitas de geometria procedural e rochas editáveis a partir de um modelo.', textures: 'Geração de fontes e texturas', texturesDescription: 'Mapas de materiais procedurais para as suas superfícies.', beta: 'Disponível', demo: 'Exemplo', family: 'família', preview: 'Pré-visualização', openDocs: 'Abrir documentação', documentation: 'Documentação', allLabs: 'Todos os Labs ToonLab', labHome: 'Início do Lab', file: 'Ficheiro', edit: 'Editar', view: 'Ver', help: 'Ajuda', reloadPreview: 'Recarregar pré-visualização', docsKicker: 'Documentação', docsTitle: 'Crie com ToonLab', docsLede: 'Guias de utilizador para o runtime, Labs, MCP, documentos portáteis e fluxos de assets.', docsLanguageNotice: 'O guia usa o idioma escolhido no cabeçalho. O código, os nomes das APIs e os campos guardados não mudam.', docsLocalHint: 'Se executar ToonLab localmente, abra /docs/ depois de iniciar o servidor de desenvolvimento.', footer: 'MIT — ToonLab by Call Me Sensei' },
  'pt-BR': { labs: 'Labs', generate: 'Gerar', gallery: 'Galeria', library: 'Biblioteca', styles: 'Estilos', settings: 'Configurações', docs: 'Docs', github: 'GitHub', pro: 'ToonLab Pro', language: 'Idioma', chooseLab: 'Escolha seu Lab', labsTitle: 'Labs', labsSuffix: '— tudo roda no navegador.', explore: 'Explore {count} Labs de criação para usuários.', betaLabs: 'Labs disponíveis', chooseByType: 'Escolha por tipo de produto', chooseByTypeSuffix: '— shaders, assets gerados e mapas de origem reutilizáveis.', shading: 'Shaders', shadingDescription: 'Tratamentos para personagens, vegetação, geologia, terreno, superfícies fabricadas, água, céu e nuvens.', assets: 'Geração de assets', assetsDescription: 'Receitas de geometria procedural e rochas editáveis a partir de um modelo.', textures: 'Geração de fontes e texturas', texturesDescription: 'Mapas de materiais procedurais para as suas superfícies.', beta: 'Disponível', demo: 'Exemplo', family: 'família', preview: 'Prévia', openDocs: 'Abrir documentação', documentation: 'Documentação', allLabs: 'Todos os Labs ToonLab', labHome: 'Início do Lab', file: 'Arquivo', edit: 'Editar', view: 'Exibir', help: 'Ajuda', reloadPreview: 'Recarregar prévia', docsKicker: 'Documentação', docsTitle: 'Crie com ToonLab', docsLede: 'Guias de usuário para o runtime, Labs, MCP, documentos portáteis e fluxos de assets.', docsLanguageNotice: 'O guia segue o idioma escolhido no cabeçalho. Código, nomes de API e campos salvos permanecem iguais.', docsLocalHint: 'Se você estiver executando ToonLab localmente, abra /docs/ depois de iniciar o servidor de desenvolvimento.', footer: 'MIT — ToonLab by Call Me Sensei' },
  it: { labs: 'Lab', generate: 'Genera', gallery: 'Galleria', library: 'Libreria', styles: 'Stili', settings: 'Impostazioni', docs: 'Documenti', github: 'GitHub', pro: 'ToonLab Pro', language: 'Lingua', chooseLab: 'Scegli il tuo Lab', labsTitle: 'Lab', labsSuffix: '— tutto gira nel browser.', explore: 'Esplora {count} Lab creativi per gli utenti.', betaLabs: 'Lab disponibili', chooseByType: 'Scegli per tipo di prodotto', chooseByTypeSuffix: '— shader, asset generati e mappe sorgente riutilizzabili.', shading: 'Shader', shadingDescription: 'Trattamenti per personaggi, vegetazione, geologia, terreno, superfici lavorate, acqua, cielo e nuvole.', assets: 'Generazione asset', assetsDescription: 'Ricette di geometria procedurale e rocce modificabili da un modello.', textures: 'Generazione di sorgenti e texture', texturesDescription: 'Mappe materiali procedurali per le tue superfici.', beta: 'Disponibile', demo: 'Esempio', family: 'famiglia', preview: 'Anteprima', openDocs: 'Apri la documentazione', documentation: 'Documentazione', allLabs: 'Tutti i Lab ToonLab', labHome: 'Home del Lab', file: 'File', edit: 'Modifica', view: 'Visualizza', help: 'Aiuto', reloadPreview: 'Ricarica anteprima', docsKicker: 'Documentazione', docsTitle: 'Crea con ToonLab', docsLede: 'Guide utente per runtime, Lab, MCP, documenti portatili e flussi di asset.', docsLanguageNotice: 'La guida segue la lingua scelta nell’intestazione. Codice, nomi API e campi salvati restano invariati.', docsLocalHint: 'In locale, apri /docs/ dopo aver avviato il server di sviluppo.', footer: 'MIT — ToonLab by Call Me Sensei' },
  ru: { labs: 'Лаборатории', generate: 'Генерация', gallery: 'Галерея', library: 'Библиотека', styles: 'Стили', settings: 'Настройки', docs: 'Документация', github: 'GitHub', pro: 'ToonLab Pro', language: 'Язык', chooseLab: 'Выберите лабораторию', labsTitle: 'Лаборатории', labsSuffix: '— всё работает в браузере.', explore: 'Изучите {count} пользовательских лабораторий для создания.', betaLabs: 'Доступные лаборатории', chooseByType: 'Выберите по типу продукта', chooseByTypeSuffix: '— шейдеры, созданные ассеты и повторно используемые карты.', shading: 'Шейдеры', shadingDescription: 'Обработка персонажей, растительности, геологии, ландшафта, готовых поверхностей, воды, неба и облаков.', assets: 'Генерация ассетов', assetsDescription: 'Процедурные рецепты геометрии и редактируемые камни на основе шаблона.', textures: 'Генерация исходников и текстур', texturesDescription: 'Процедурные карты материалов для ваших поверхностей.', beta: 'Доступно', demo: 'Пример', family: 'раздел', preview: 'Предпросмотр', openDocs: 'Открыть документацию', documentation: 'Документация', allLabs: 'Все лаборатории ToonLab', labHome: 'Главная лаборатории', file: 'Файл', edit: 'Правка', view: 'Вид', help: 'Справка', reloadPreview: 'Перезагрузить предпросмотр', docsKicker: 'Документация', docsTitle: 'Создавайте с ToonLab', docsLede: 'Руководства пользователя по runtime, лабораториям, MCP, переносимым документам и ассетам.', docsLanguageNotice: 'Язык руководства выбирается в шапке. Код, имена API и поля сохранённых документов не изменяются.', docsLocalHint: 'При локальном запуске откройте /docs/ после старта сервера разработки.', footer: 'MIT — ToonLab by Call Me Sensei' },
  id: { labs: 'Lab', generate: 'Buat', gallery: 'Galeri', library: 'Pustaka', styles: 'Gaya', settings: 'Pengaturan', docs: 'Dokumentasi', github: 'GitHub', pro: 'ToonLab Pro', language: 'Bahasa', chooseLab: 'Pilih lab Anda', labsTitle: 'Lab', labsSuffix: '— semuanya berjalan di browser.', explore: 'Jelajahi {count} lab pembuatan untuk pengguna.', betaLabs: 'Lab yang tersedia', chooseByType: 'Pilih berdasarkan jenis produk', chooseByTypeSuffix: '— shader, aset hasil generasi, dan peta sumber yang dapat digunakan kembali.', shading: 'Shader', shadingDescription: 'Tampilan karakter, vegetasi, geologi, medan, permukaan buatan, air, langit, dan awan.', assets: 'Pembuatan aset', assetsDescription: 'Resep geometri prosedural dan batu yang dapat diedit dari template.', textures: 'Pembuatan sumber & tekstur', texturesDescription: 'Peta material prosedural untuk permukaan buatan Anda.', beta: 'Tersedia', demo: 'Contoh', family: 'keluarga', preview: 'Pratinjau', openDocs: 'Buka dokumentasi', documentation: 'Dokumentasi', allLabs: 'Semua Lab ToonLab', labHome: 'Beranda Lab', file: 'File', edit: 'Edit', view: 'Tampilan', help: 'Bantuan', reloadPreview: 'Muat ulang pratinjau', docsKicker: 'Dokumentasi', docsTitle: 'Berkarya dengan ToonLab', docsLede: 'Panduan pengguna untuk runtime, Lab, MCP, dokumen portabel, dan alur kerja aset.', docsLanguageNotice: 'Panduan mengikuti bahasa yang dipilih di header. Kode, nama API, dan bidang dokumen tersimpan tetap sama.', docsLocalHint: 'Jika menjalankan ToonLab secara lokal, buka /docs/ setelah server pengembangan dimulai.', footer: 'MIT — ToonLab by Call Me Sensei' },
  vi: { labs: 'Phòng Lab', generate: 'Tạo', gallery: 'Thư viện ảnh', library: 'Thư viện', styles: 'Phong cách', settings: 'Cài đặt', docs: 'Tài liệu', github: 'GitHub', pro: 'ToonLab Pro', language: 'Ngôn ngữ', chooseLab: 'Chọn phòng Lab', labsTitle: 'Phòng Lab', labsSuffix: '— mọi thứ chạy trong trình duyệt.', explore: 'Khám phá {count} phòng Lab sáng tạo dành cho người dùng.', betaLabs: 'Lab đang hoạt động', chooseByType: 'Chọn theo loại sản phẩm', chooseByTypeSuffix: '— shader, tài sản được tạo và bản đồ nguồn có thể tái sử dụng.', shading: 'Shader', shadingDescription: 'Xử lý nhân vật, thảm thực vật, địa chất, địa hình, bề mặt chế tạo, nước, bầu trời và mây.', assets: 'Tạo tài sản', assetsDescription: 'Công thức hình học thủ tục và đá có thể chỉnh sửa từ mẫu.', textures: 'Tạo nguồn & kết cấu', texturesDescription: 'Bản đồ vật liệu thủ tục cho bề mặt do bạn tạo.', beta: 'Đang dùng', demo: 'Ví dụ', family: 'nhóm', preview: 'Xem trước', openDocs: 'Mở tài liệu', documentation: 'Tài liệu', allLabs: 'Tất cả Lab ToonLab', labHome: 'Trang chủ Lab', file: 'Tệp', edit: 'Chỉnh sửa', view: 'Xem', help: 'Trợ giúp', reloadPreview: 'Tải lại bản xem trước', docsKicker: 'Tài liệu', docsTitle: 'Sáng tạo với ToonLab', docsLede: 'Hướng dẫn người dùng về runtime, Lab, MCP, tài liệu di động và quy trình tài sản.', docsLanguageNotice: 'Tài liệu dùng ngôn ngữ được chọn trong đầu trang. Mã, tên API và trường tài liệu đã lưu không thay đổi.', docsLocalHint: 'Nếu chạy ToonLab cục bộ, hãy mở /docs/ sau khi khởi động máy chủ phát triển.', footer: 'MIT — ToonLab by Call Me Sensei' },
  th: { labs: 'แล็บ', generate: 'สร้าง', gallery: 'แกลเลอรี', library: 'คลัง', styles: 'สไตล์', settings: 'การตั้งค่า', docs: 'เอกสาร', github: 'GitHub', pro: 'ToonLab Pro', language: 'ภาษา', chooseLab: 'เลือกแล็บ', labsTitle: 'แล็บ', labsSuffix: '— ทำงานทั้งหมดในเบราว์เซอร์', explore: 'สำรวจแล็บสร้างสรรค์สำหรับผู้ใช้ {count} แห่ง', betaLabs: 'แล็บที่เปิดใช้', chooseByType: 'เลือกตามประเภทผลิตภัณฑ์', chooseByTypeSuffix: '— เชดเดอร์ แอสเซ็ตที่สร้างขึ้น และแผนที่ต้นฉบับที่ใช้ซ้ำได้', shading: 'เชดเดอร์', shadingDescription: 'การจัดแสงตัวละคร พืชพรรณ ธรณีวิทยา ภูมิประเทศ พื้นผิวสำเร็จรูป น้ำ ท้องฟ้า และเมฆ', assets: 'การสร้างแอสเซ็ต', assetsDescription: 'สูตรเรขาคณิตแบบโพรซีเดอรัลและหินที่แก้ไขได้จากเทมเพลต', textures: 'การสร้างต้นฉบับและพื้นผิว', texturesDescription: 'แผนที่วัสดุแบบโพรซีเดอรัลสำหรับพื้นผิวของคุณ', beta: 'เปิดใช้', demo: 'ตัวอย่าง', family: 'หมวด', preview: 'ตัวอย่างก่อนดูจริง', openDocs: 'เปิดเอกสาร', documentation: 'เอกสาร', allLabs: 'แล็บ ToonLab ทั้งหมด', labHome: 'หน้าแรกของแล็บ', file: 'ไฟล์', edit: 'แก้ไข', view: 'มุมมอง', help: 'ช่วยเหลือ', reloadPreview: 'โหลดตัวอย่างใหม่', docsKicker: 'เอกสาร', docsTitle: 'สร้างงานด้วย ToonLab', docsLede: 'คู่มือผู้ใช้สำหรับ runtime แล็บ MCP เอกสารพกพา และเวิร์กโฟลว์แอสเซ็ต', docsLanguageNotice: 'คู่มือนี้ใช้ภาษาที่เลือกในส่วนหัว โค้ด ชื่อ API และฟิลด์เอกสารที่บันทึกไว้จะไม่เปลี่ยน', docsLocalHint: 'หากรัน ToonLab ในเครื่อง ให้เปิด /docs/ หลังเริ่มเซิร์ฟเวอร์พัฒนา', footer: 'MIT — ToonLab by Call Me Sensei' },
  tr: { labs: 'Lablar', generate: 'Üret', gallery: 'Galeri', library: 'Kütüphane', styles: 'Stiller', settings: 'Ayarlar', docs: 'Belgeler', github: 'GitHub', pro: 'ToonLab Pro', language: 'Dil', chooseLab: 'Labınızı seçin', labsTitle: 'Lablar', labsSuffix: '— her şey tarayıcıda çalışır.', explore: 'Kullanıcılara yönelik {count} üretim Labını keşfedin.', betaLabs: 'Kullanıma açık Lablar', chooseByType: 'Ürün türüne göre seçin', chooseByTypeSuffix: '— shaderlar, üretilen varlıklar ve yeniden kullanılabilir kaynak haritaları.', shading: 'Shaderlar', shadingDescription: 'Karakter, bitki örtüsü, jeoloji, arazi, üretilmiş yüzey, su, gökyüzü ve bulut işlemleri.', assets: 'Varlık üretimi', assetsDescription: 'Prosedürel geometri tarifleri ve şablondan düzenlenebilen kayalar.', textures: 'Kaynak ve doku üretimi', texturesDescription: 'Kendi yüzeyleriniz için prosedürel malzeme haritaları.', beta: 'Kullanıma açık', demo: 'Örnek', family: 'ailesi', preview: 'Önizleme', openDocs: 'Belgeleri aç', documentation: 'Belgeler', allLabs: 'Tüm ToonLab Labları', labHome: 'Lab ana sayfası', file: 'Dosya', edit: 'Düzenle', view: 'Görünüm', help: 'Yardım', reloadPreview: 'Önizlemeyi yenile', docsKicker: 'Belgeler', docsTitle: 'ToonLab ile üretin', docsLede: 'Runtime, Lablar, MCP, taşınabilir belgeler ve varlık iş akışları için kullanıcı rehberleri.', docsLanguageNotice: 'Rehber, üst bilgide seçtiğiniz dili kullanır. Kod, API adları ve kaydedilen belge alanları değişmez.', docsLocalHint: 'ToonLabı yerel çalıştırıyorsanız geliştirme sunucusunu başlattıktan sonra /docs/ adresini açın.', footer: 'MIT — ToonLab by Call Me Sensei' },
  hi: { labs: 'लैब', generate: 'बनाएँ', gallery: 'गैलरी', library: 'लाइब्रेरी', styles: 'स्टाइल', settings: 'सेटिंग्स', docs: 'दस्तावेज़', github: 'GitHub', pro: 'ToonLab Pro', language: 'भाषा', chooseLab: 'अपनी लैब चुनें', labsTitle: 'लैब', labsSuffix: '— सब कुछ ब्राउज़र में चलता है।', explore: 'उपयोगकर्ताओं के लिए {count} निर्माण लैब देखें।', betaLabs: 'उपलब्ध लैब', chooseByType: 'उत्पाद प्रकार के अनुसार चुनें', chooseByTypeSuffix: '— शेडर, जनरेट किए गए एसेट और दोबारा उपयोग योग्य स्रोत मैप।', shading: 'शेडर', shadingDescription: 'कैरेक्टर, वनस्पति, भूविज्ञान, भूभाग, निर्मित सतह, पानी, आकाश और बादलों के ट्रीटमेंट।', assets: 'एसेट निर्माण', assetsDescription: 'प्रोसीजरल ज्योमेट्री रेसिपी और टेम्पलेट से संपादन योग्य चट्टानें।', textures: 'स्रोत और टेक्सचर निर्माण', texturesDescription: 'आपकी सतहों के लिए प्रोसीजरल मटेरियल मैप।', beta: 'उपलब्ध', demo: 'उदाहरण', family: 'समूह', preview: 'पूर्वावलोकन', openDocs: 'दस्तावेज़ खोलें', documentation: 'दस्तावेज़', allLabs: 'सभी ToonLab लैब', labHome: 'लैब होम', file: 'फ़ाइल', edit: 'संपादित करें', view: 'दृश्य', help: 'मदद', reloadPreview: 'पूर्वावलोकन फिर लोड करें', docsKicker: 'दस्तावेज़', docsTitle: 'ToonLab के साथ बनाएँ', docsLede: 'रनटाइम, लैब, MCP, पोर्टेबल दस्तावेज़ और एसेट वर्कफ़्लो के लिए उपयोगकर्ता गाइड।', docsLanguageNotice: 'गाइड हेडर में चुनी गई भाषा का अनुसरण करता है। कोड, API नाम और सेव किए गए दस्तावेज़ फ़ील्ड नहीं बदलते।', docsLocalHint: 'स्थानीय रूप से चलाते समय डेवलपमेंट सर्वर शुरू करने के बाद /docs/ खोलें।', footer: 'MIT — ToonLab by Call Me Sensei' },
  ar: { labs: 'المختبرات', generate: 'إنشاء', gallery: 'المعرض', library: 'المكتبة', styles: 'الأنماط', settings: 'الإعدادات', docs: 'التوثيق', github: 'GitHub', pro: 'ToonLab Pro', language: 'اللغة', chooseLab: 'اختر مختبرك', labsTitle: 'المختبرات', labsSuffix: '— كل شيء يعمل في المتصفح.', explore: 'استكشف {count} مختبرات إنشاء موجهة للمستخدمين.', betaLabs: 'المختبرات المتاحة', chooseByType: 'اختر حسب نوع المنتج', chooseByTypeSuffix: '— تظليل، أصول مولدة، وخرائط مصدر قابلة لإعادة الاستخدام.', shading: 'التظليل', shadingDescription: 'معالجات للشخصيات والنباتات والجيولوجيا والتضاريس والأسطح المصنعة والماء والسماء والسحب.', assets: 'إنشاء الأصول', assetsDescription: 'وصفات هندسية إجرائية وصخور قابلة للتحرير انطلاقاً من قالب.', textures: 'إنشاء المصادر والأنسجة', texturesDescription: 'خرائط مواد إجرائية لأسطحك.', beta: 'متاح', demo: 'مثال', family: 'المجموعة', preview: 'معاينة', openDocs: 'فتح التوثيق', documentation: 'التوثيق', allLabs: 'كل مختبرات ToonLab', labHome: 'الصفحة الرئيسية للمختبر', file: 'ملف', edit: 'تحرير', view: 'عرض', help: 'مساعدة', reloadPreview: 'إعادة تحميل المعاينة', docsKicker: 'التوثيق', docsTitle: 'أنشئ باستخدام ToonLab', docsLede: 'أدلة المستخدم لوقت التشغيل والمختبرات وMCP والمستندات المحمولة وسير عمل الأصول.', docsLanguageNotice: 'يتبع الدليل اللغة المختارة في الرأس. تبقى الشفرة وأسماء API وحقول المستندات المحفوظة دون تغيير.', docsLocalHint: 'عند التشغيل محلياً، افتح /docs/ بعد تشغيل خادم التطوير.', footer: 'MIT — ToonLab by Call Me Sensei' },
  bn: { labs: 'ল্যাব', generate: 'তৈরি করুন', gallery: 'গ্যালারি', library: 'লাইব্রেরি', styles: 'স্টাইল', settings: 'সেটিংস', docs: 'ডকুমেন্টেশন', github: 'GitHub', pro: 'ToonLab Pro', language: 'ভাষা', chooseLab: 'ল্যাব বেছে নিন', labsTitle: 'ল্যাব', labsSuffix: '— সবকিছু ব্রাউজারে চলে।', explore: 'ব্যবহারকারীদের জন্য {count}টি নির্মাণ ল্যাব দেখুন।', betaLabs: 'চালু ল্যাব', chooseByType: 'পণ্যের ধরন অনুযায়ী বেছে নিন', chooseByTypeSuffix: '— শেডার, তৈরি অ্যাসেট এবং পুনর্ব্যবহারযোগ্য সোর্স ম্যাপ।', shading: 'শেডার', shadingDescription: 'চরিত্র, উদ্ভিদ, ভূতত্ত্ব, ভূখণ্ড, তৈরি পৃষ্ঠ, জল, আকাশ ও মেঘের ট্রিটমেন্ট।', assets: 'অ্যাসেট তৈরি', assetsDescription: 'প্রসিডিউরাল জ্যামিতি রেসিপি এবং টেমপ্লেট থেকে সম্পাদনাযোগ্য পাথর।', textures: 'সোর্স ও টেক্সচার তৈরি', texturesDescription: 'আপনার পৃষ্ঠের জন্য প্রসিডিউরাল ম্যাটেরিয়াল ম্যাপ।', beta: 'চালু', demo: 'উদাহরণ', family: 'শ্রেণি', preview: 'প্রিভিউ', openDocs: 'ডকুমেন্টেশন খুলুন', documentation: 'ডকুমেন্টেশন', allLabs: 'সব ToonLab ল্যাব', labHome: 'ল্যাব হোম', file: 'ফাইল', edit: 'সম্পাদনা', view: 'দৃশ্য', help: 'সহায়তা', reloadPreview: 'প্রিভিউ রিলোড করুন', docsKicker: 'ডকুমেন্টেশন', docsTitle: 'ToonLab দিয়ে তৈরি করুন', docsLede: 'রানটাইম, ল্যাব, MCP, পোর্টেবল ডকুমেন্ট এবং অ্যাসেট ওয়ার্কফ্লোর ব্যবহারকারী গাইড।', docsLanguageNotice: 'গাইডটি হেডারে নির্বাচিত ভাষা অনুসরণ করে। কোড, API নাম এবং সংরক্ষিত ডকুমেন্ট ফিল্ড অপরিবর্তিত থাকে।', docsLocalHint: 'স্থানীয়ভাবে চালালে ডেভেলপমেন্ট সার্ভার শুরু করে /docs/ খুলুন।', footer: 'MIT — ToonLab by Call Me Sensei' },
  ms: { labs: 'Makmal', generate: 'Jana', gallery: 'Galeri', library: 'Pustaka', styles: 'Gaya', settings: 'Tetapan', docs: 'Dokumentasi', github: 'GitHub', pro: 'ToonLab Pro', language: 'Bahasa', chooseLab: 'Pilih makmal anda', labsTitle: 'Makmal', labsSuffix: '— semuanya berjalan dalam pelayar.', explore: 'Terokai {count} makmal penciptaan untuk pengguna.', betaLabs: 'Makmal tersedia', chooseByType: 'Pilih mengikut jenis produk', chooseByTypeSuffix: '— shader, aset terjana dan peta sumber boleh guna semula.', shading: 'Shader', shadingDescription: 'Rawatan watak, tumbuhan, geologi, rupa bumi, permukaan binaan, air, langit dan awan.', assets: 'Penjanaan aset', assetsDescription: 'Resipi geometri prosedural dan batu yang boleh diedit daripada templat.', textures: 'Penjanaan sumber & tekstur', texturesDescription: 'Peta bahan prosedural untuk permukaan anda.', beta: 'Tersedia', demo: 'Contoh', family: 'keluarga', preview: 'Pratonton', openDocs: 'Buka dokumentasi', documentation: 'Dokumentasi', allLabs: 'Semua Makmal ToonLab', labHome: 'Laman Utama Makmal', file: 'Fail', edit: 'Edit', view: 'Paparan', help: 'Bantuan', reloadPreview: 'Muat semula pratonton', docsKicker: 'Dokumentasi', docsTitle: 'Cipta dengan ToonLab', docsLede: 'Panduan pengguna untuk runtime, Makmal, MCP, dokumen mudah alih dan aliran kerja aset.', docsLanguageNotice: 'Panduan mengikut bahasa yang dipilih pada pengepala. Kod, nama API dan medan dokumen tersimpan tidak berubah.', docsLocalHint: 'Jika menjalankan ToonLab secara setempat, buka /docs/ selepas memulakan pelayan pembangunan.', footer: 'MIT — ToonLab by Call Me Sensei' },
  nl: { labs: 'Labs', generate: 'Genereren', gallery: 'Galerij', library: 'Bibliotheek', styles: 'Stijlen', settings: 'Instellingen', docs: 'Documentatie', github: 'GitHub', pro: 'ToonLab Pro', language: 'Taal', chooseLab: 'Kies je Lab', labsTitle: 'Labs', labsSuffix: '— alles draait in je browser.', explore: 'Ontdek {count} creatieve Labs voor gebruikers.', betaLabs: 'Beschikbare Labs', chooseByType: 'Kies op producttype', chooseByTypeSuffix: '— shaders, gegenereerde assets en herbruikbare bronkaarten.', shading: 'Shaders', shadingDescription: 'Behandelingen voor personages, vegetatie, geologie, terrein, vervaardigde oppervlakken, water, lucht en wolken.', assets: 'Assetgeneratie', assetsDescription: 'Procedurele geometrie-recepten en bewerkbare rotsen vanuit een sjabloon.', textures: 'Bron- en textuurgeneratie', texturesDescription: 'Procedurele materiaalkaarten voor je oppervlakken.', beta: 'Beschikbaar', demo: 'Voorbeeld', family: 'familie', preview: 'Voorbeeld', openDocs: 'Documentatie openen', documentation: 'Documentatie', allLabs: 'Alle ToonLab-Labs', labHome: 'Lab-home', file: 'Bestand', edit: 'Bewerken', view: 'Weergave', help: 'Help', reloadPreview: 'Voorbeeld opnieuw laden', docsKicker: 'Documentatie', docsTitle: 'Maken met ToonLab', docsLede: 'Gebruikersgidsen voor runtime, Labs, MCP, draagbare documenten en asset-workflows.', docsLanguageNotice: 'De gids gebruikt de taal uit de koptekst. Code, API-namen en opgeslagen documentvelden blijven gelijk.', docsLocalHint: 'Draai je ToonLab lokaal? Open /docs/ nadat de ontwikkelserver is gestart.', footer: 'MIT — ToonLab by Call Me Sensei' },
  pl: { labs: 'Laboratoria', generate: 'Generuj', gallery: 'Galeria', library: 'Biblioteka', styles: 'Style', settings: 'Ustawienia', docs: 'Dokumentacja', github: 'GitHub', pro: 'ToonLab Pro', language: 'Język', chooseLab: 'Wybierz laboratorium', labsTitle: 'Laboratoria', labsSuffix: '— wszystko działa w przeglądarce.', explore: 'Poznaj {count} laboratoriów tworzenia dla użytkowników.', betaLabs: 'Dostępne laboratoria', chooseByType: 'Wybierz według typu produktu', chooseByTypeSuffix: '— shadery, wygenerowane zasoby i wielokrotnego użytku mapy źródłowe.', shading: 'Shadery', shadingDescription: 'Obróbka postaci, roślinności, geologii, terenu, powierzchni wykonanych, wody, nieba i chmur.', assets: 'Generowanie zasobów', assetsDescription: 'Proceduralne receptury geometrii i edytowalne skały z szablonu.', textures: 'Generowanie źródeł i tekstur', texturesDescription: 'Proceduralne mapy materiałów dla własnych powierzchni.', beta: 'Dostępne', demo: 'Przykład', family: 'rodzina', preview: 'Podgląd', openDocs: 'Otwórz dokumentację', documentation: 'Dokumentacja', allLabs: 'Wszystkie laboratoria ToonLab', labHome: 'Strona główna laboratorium', file: 'Plik', edit: 'Edycja', view: 'Widok', help: 'Pomoc', reloadPreview: 'Odśwież podgląd', docsKicker: 'Dokumentacja', docsTitle: 'Twórz z ToonLab', docsLede: 'Przewodniki użytkownika po runtime, laboratoriach, MCP, przenośnych dokumentach i pracy z zasobami.', docsLanguageNotice: 'Przewodnik używa języka wybranego w nagłówku. Kod, nazwy API i pola zapisanych dokumentów pozostają bez zmian.', docsLocalHint: 'Uruchamiasz ToonLab lokalnie? Otwórz /docs/ po uruchomieniu serwera deweloperskiego.', footer: 'MIT — ToonLab by Call Me Sensei' },
  sv: { labs: 'Labbar', generate: 'Skapa', gallery: 'Galleri', library: 'Bibliotek', styles: 'Stilar', settings: 'Inställningar', docs: 'Dokumentation', github: 'GitHub', pro: 'ToonLab Pro', language: 'Språk', chooseLab: 'Välj din labb', labsTitle: 'Labbar', labsSuffix: '— allt körs i webbläsaren.', explore: 'Utforska {count} skaparlabbar för användare.', betaLabs: 'Tillgängliga labbar', chooseByType: 'Välj efter produkttyp', chooseByTypeSuffix: '— shaders, genererade resurser och återanvändbara källkartor.', shading: 'Shaders', shadingDescription: 'Behandling av figurer, växtlighet, geologi, terräng, tillverkade ytor, vatten, himmel och moln.', assets: 'Resursskapande', assetsDescription: 'Procedurala geometrirecept och redigerbara stenar från en mall.', textures: 'Käll- och texturskapande', texturesDescription: 'Procedurala materialkartor för dina ytor.', beta: 'Tillgänglig', demo: 'Exempel', family: 'familj', preview: 'Förhandsvisning', openDocs: 'Öppna dokumentation', documentation: 'Dokumentation', allLabs: 'Alla ToonLab-labbar', labHome: 'Labbens startsida', file: 'Arkiv', edit: 'Redigera', view: 'Visa', help: 'Hjälp', reloadPreview: 'Ladda om förhandsvisning', docsKicker: 'Dokumentation', docsTitle: 'Skapa med ToonLab', docsLede: 'Användarguider för runtime, labbar, MCP, portabla dokument och arbetsflöden för resurser.', docsLanguageNotice: 'Guiden följer språket som valts i sidhuvudet. Kod, API-namn och sparade dokumentfält ändras inte.', docsLocalHint: 'Kör du ToonLab lokalt? Öppna /docs/ efter att utvecklingsservern startat.', footer: 'MIT — ToonLab by Call Me Sensei' },
});

const COMMON_COPY = Object.freeze({
  en: { characters: 'Characters', pricing: 'Pricing', openSource: 'Open Source', signIn: 'Sign in' },
  ja: { characters: 'キャラクター', pricing: '料金', openSource: 'オープンソース', signIn: 'サインイン' },
  ko: { characters: '캐릭터', pricing: '요금제', openSource: '오픈 소스', signIn: '로그인' },
  zh: { characters: '角色', pricing: '价格', openSource: '开源', signIn: '登录' },
  es: { characters: 'Personajes', pricing: 'Precios', openSource: 'Código abierto', signIn: 'Iniciar sesión' },
  fr: { characters: 'Personnages', pricing: 'Tarifs', openSource: 'Open source', signIn: 'Se connecter' },
  de: { characters: 'Figuren', pricing: 'Preise', openSource: 'Open Source', signIn: 'Anmelden' },
  pt: { characters: 'Personagens', pricing: 'Preços', openSource: 'Código aberto', signIn: 'Iniciar sessão' },
  'pt-BR': { characters: 'Personagens', pricing: 'Preços', openSource: 'Código aberto', signIn: 'Entrar' },
  it: { characters: 'Personaggi', pricing: 'Prezzi', openSource: 'Open source', signIn: 'Accedi' },
  ru: { characters: 'Персонажи', pricing: 'Цены', openSource: 'Открытый код', signIn: 'Войти' },
  id: { characters: 'Karakter', pricing: 'Harga', openSource: 'Sumber terbuka', signIn: 'Masuk' },
  vi: { characters: 'Nhân vật', pricing: 'Bảng giá', openSource: 'Mã nguồn mở', signIn: 'Đăng nhập' },
  th: { characters: 'ตัวละคร', pricing: 'ราคา', openSource: 'โอเพนซอร์ส', signIn: 'เข้าสู่ระบบ' },
  tr: { characters: 'Karakterler', pricing: 'Fiyatlandırma', openSource: 'Açık kaynak', signIn: 'Giriş yap' },
  hi: { characters: 'पात्र', pricing: 'मूल्य', openSource: 'ओपन सोर्स', signIn: 'साइन इन' },
  ar: { characters: 'الشخصيات', pricing: 'الأسعار', openSource: 'مفتوح المصدر', signIn: 'تسجيل الدخول' },
  bn: { characters: 'চরিত্র', pricing: 'মূল্য', openSource: 'ওপেন সোর্স', signIn: 'সাইন ইন' },
  ms: { characters: 'Watak', pricing: 'Harga', openSource: 'Sumber terbuka', signIn: 'Log masuk' },
  nl: { characters: 'Personages', pricing: 'Prijzen', openSource: 'Open source', signIn: 'Inloggen' },
  pl: { characters: 'Postacie', pricing: 'Cennik', openSource: 'Open source', signIn: 'Zaloguj się' },
  sv: { characters: 'Karaktärer', pricing: 'Priser', openSource: 'Öppen källkod', signIn: 'Logga in' },
});

const EDITOR_COPY = Object.freeze({
  en: EDITOR_ENGLISH,
  ja: {
    labCharacterShader: 'キャラクターシェーダーラボ', labRockGeneration: '岩・崖生成', labRockShader: '岩シェーダーラボ', labGroundShader: 'グラウンドシェーダーラボ', labTerrainGroundShader: '地形・グラウンドシェーダーラボ', labGrassGeneration: '草・グラウンドカバー生成ラボ', labWater: 'ウォーターラボ', labSkyAtmosphere: '大気ソースラボ', labEnvironmentShader: '環境シェーダーラボ', labManufacturedSurface: '人工表面シェーダーラボ', labManufacturedMaterial: '人工マテリアルラボ', labDebris: 'デブリラボ', labProp: 'プロップラボ', labBuilding: '建物ラボ', labLandscape: 'ランドスケープラボ', labTexture: 'テクスチャラボ', labVfx: 'VFXラボ', labFbx: 'FBXエディター', labTreeGeneration: '木・低木生成ラボ', labFlower: '花ラボ', labTransparentShader: 'ガラス・透明シェーダーラボ', labCloudShader: '雲シェーダーラボ', labSkyShader: '空シェーダーラボ', labSkyCloud: '空・雲ラボ', labAtmosphericCondition: '大気条件ラボ', labAtmosphereFog: '大気・霧・ボリュームラボ',
    chooseHowToBegin: '開始方法を選択', whatWouldYouLikeToWorkOn: '何を作業しますか？', draftSafe: '明示的に新規作成または開くまで、現在の下書きは保持されます。', continue: '続ける', currentDraft: '現在の下書き', newEntry: '新規エントリ', openExistingEntry: '既存のエントリを開く', searchSavedEntries: '保存済みエントリとラボのスターターライブラリを検索します。', searchSavedEntriesPlaceholder: '保存済みエントリとスターターを検索…', openStyle: 'スタイルを開く', noSavedEntries: '保存済みエントリはまだありません。作成して「名前を付けて保存」で追加できます。', backToLabs: 'ラボに戻る', leaveLab: '復元した下書きを変更せずにラボを離れます。',
    preview: 'プレビュー', rotate: '回転', pan: 'パン', zoom: 'ズーム', idle: '待機', walk: '歩行', resetCamera: 'カメラをリセット (C)', previewHintOrbit: '左ドラッグで回転・ホイールでズーム・右ドラッグでパン', previewHintWalk: 'WASD／矢印で移動・Shiftで走る・Spaceでジャンプ', previewTitle: 'プレビュー専用 — プリセットには保存されません。', previewTitleHosted: 'プレビュー専用 — プリセットには保存されません。キャラクターはキャラクターページ（キャラクター → メディア）からアップロードしてください。', previewTitleLocal: 'プレビュー専用 — プリセットには保存されません。キャラクターを assets-local/models/ に追加し、`npm run assets:local` を実行して再起動してください。', rendererBooting: '起動中…', rendererStillStarting: 'レンダラーを起動しています', rendererBackendMatches: '選択したレンダラーを使用しています', rendererRequestedButGot: '要求: {requested} ／実際: {actual}', labCommands: 'ラボコマンド', document: 'ドキュメント', undo: '元に戻す', redo: 'やり直す', update: '更新', saveAs: '名前を付けて保存…', revertToPreset: 'プリセットに戻す', export: '書き出し…', importPresetJson: 'プリセットJSONを読み込む…', resetLab: 'ラボをリセット', close: '閉じる', showOptions: 'オプションを表示', noMatchingEntries: '一致する項目はありません', advanced: '詳細', default: 'デフォルト', resetField: '{field}をデフォルトに戻す', customCharacterLook: '新しいキャラクタールック', continueCharacterPersisted: 'このブラウザに保存されたキャラクタールックを続けます。', continueCharacterStarter: '現在のスタータールックを続けます。', newCharacterLookDescription: 'ToonLabのデフォルト処理から新しいキャラクタールックを始めます。', styleReadOnly: '読み取り専用', styleSaved: '保存済み', systemStyle: 'システム', openStyleBundle: 'スタイルバンドルビルダーを開く',
    base: 'ベース', skin: '肌', cel: 'セル', shadow: 'シャドウ', light: 'ライト', hair: '髪', detail: 'ディテール', outline: 'アウトライン', baseDescription: '元テクスチャ、マテリアルの役割、アルファの動作を設定します。', skinDescription: '肌の暖かさと顔周辺のライティング上書きを設定します。', celDescription: 'セルバンドのしきい値、柔らかさ、シャドウの色を設定します。', shadowDescription: 'シーン、セルフ、平均、接触シャドウを設定します。', lightDescription: '間接光、ローカルライト、リムライト、スペキュラーを設定します。', hairDescription: '髪のハイライト帯と目のハイライトを設定します。', detailDescription: 'マテリアルマップ、グリッター、ステッカー、毛、遠近補正を設定します。', outlineDescription: 'インク風アウトラインの幅、色、役割別の動作を設定します。',
    baseTexture: '基本テクスチャ', materialRoles: 'マテリアルの役割', alpha: 'アルファ', preset: 'プリセット', presetTitle: '編集中のプリセット — 切り替えるとこのパネルの値がすべて置き換わります。', customSaturation: 'カスタム彩度', materialColorMode: 'マテリアルカラーモード', saturationMode: '彩度モード', blendCutoff: 'ブレンドしきい値', costumeCutout: '衣装の抜き', cutoutCutoff: '抜きのしきい値', ditherOpacity: 'ディザ不透明度', enabled: '有効', expressionTokenCutout: '表情トークンの抜き', eyeHighlightOrder: '目のハイライト順', eyeOrder: '目の順序', faceCutout: '顔の抜き', hairCutout: '髪の抜き', mapTransparentCutout: '透明マップの抜き', overlayDepthWrite: 'オーバーレイ深度書き込み', overlayOrder: 'オーバーレイ順', preserveSourceAlphaTest: '元アルファテストを保持', scleraOrder: '強膜の順序', skinCutout: '肌の抜き', sortOverlays: 'オーバーレイを整列', sourceAlphaMapCutout: '元アルファマップの抜き', sourceTransparentCutout: '元の透明の抜き', transparentOverlayBlend: '透明オーバーレイブレンド', transparentOpacityThreshold: '透明不透明度しきい値', compatibility: '互換', sourceMaterialColor: '元マテリアルカラー', textureOnly: 'テクスチャのみ', white: '白', skinTone: '肌のトーン', faceLighting: '顔のライティング', celShade: 'セルシェード', shadowColor: 'シャドウカラー', sceneShadows: 'シーンシャドウ', selfShadow: 'セルフシャドウ', averageShadow: '平均シャドウ', indirectLight: '間接光', localLights: 'ローカルライト', rimLight: 'リムライト', contactShadow: '接触シャドウ', specular: 'スペキュラー', hairHighlight: '髪のハイライト', eyeHighlight: '目のハイライト', materialMaps: 'マテリアルマップ', outlines: 'アウトライン', glitter: 'グリッター', sticker: 'ステッカー', shadingGroup: 'シェーディング', shadowTones: '影の色調', faceGroup: '顔', castShadows: '落ち影', rim: 'リム', highlights: 'ハイライト', automaticRoles: '自動ロール', fur: '毛皮', red: '赤', green: '緑', blue: '青', off: 'オフ', custom: 'カスタム', sourceSaturation: '元の彩度', sourceMaterial: '元マテリアル', sourceMaps: '元マップ', headBoneTracked: '頭ボーン（追跡）', staticProxyNormal: '固定プロキシ法線', depthTextureScreenSpace: '深度テクスチャ（画面空間）', fresnelClassic: 'フレネル（クラシック）', sceneShadowProxy: 'シーンシャドウプロキシ', characterShadowPass: 'キャラクターシャドウパス', lightDirection: 'ライト方向', viewDirectionStable: 'ビュー方向（安定）', additive: '加算', multiply: '乗算', alphaBlend: 'アルファブレンド', uv: 'UV', uv2: 'UV2', strandHighlight: 'ストランドハイライト', softHighlight: 'ソフトハイライト', uHorizontal: 'U / 水平方向', vVertical: 'V / 垂直方向', defaultLabel: 'デフォルト', scrubHint: 'ドラッグで調整・クリックで入力（Shift 10×、Alt 0.1×）', loaded: '{name} を読み込みました。', restoredLastLook: '前回のキャラクタールックを復元しました。', historyRestored: '履歴を復元しました。', opened: '{name} を開きました。', savedStyleDeleted: '保存したスタイルを削除し、Call Me Sensei を復元しました。', imported: '{name} を読み込みました。', labReset: 'キャラクターシェーダーラボをリセットしました。', savedToPresets: '「{name}」をプリセットに保存しました。', updated: '「{name}」を更新しました。', couldNotLoadCharacter: 'キャラクターを読み込めませんでした: {message}', materials: 'マテリアル',
  },
  ko: { labCharacterShader: '캐릭터 셰이더 랩', labRockGeneration: '바위·절벽 생성', labRockShader: '바위 셰이더 랩', labGroundShader: '지면 셰이더 랩', labGrassGeneration: '풀·지피식물 생성 랩', labWater: '물 랩', labSkyAtmosphere: '대기 소스 랩', labEnvironmentShader: '환경 셰이더 랩', labManufacturedSurface: '제조 표면 셰이더 랩', labDebris: '잔해 랩', labProp: '소품 랩', labBuilding: '건물 랩', labLandscape: '조경 랩', labTexture: '텍스처 랩', chooseHowToBegin: '시작 방법 선택', whatWouldYouLikeToWorkOn: '무엇을 작업하시겠어요?', draftSafe: '새로 만들거나 열기를 명시적으로 선택할 때까지 현재 초안은 안전하게 보존됩니다.', continue: '계속', newEntry: '새 항목', openExistingEntry: '기존 항목 열기', searchSavedEntries: '저장된 항목과 랩 시작 라이브러리 검색', searchSavedEntriesPlaceholder: '저장된 항목과 시작 항목 검색…', openStyle: '스타일 열기', backToLabs: '랩으로 돌아가기', leaveLab: '복원된 초안을 바꾸지 않고 랩을 나갑니다.', preview: '미리보기', rotate: '회전', pan: '이동', zoom: '확대/축소', idle: '대기', walk: '걷기', resetCamera: '카메라 초기화 (C)', base: '기본', skin: '피부', cel: '셀', shadow: '그림자', light: '빛', hair: '머리카락', detail: '디테일', outline: '윤곽선', baseTexture: '기본 텍스처', materialRoles: '머티리얼 역할', alpha: '알파', enabled: '사용', compatibility: '호환성', sourceMaterialColor: '소스 머티리얼 색상', textureOnly: '텍스처만', white: '흰색' },
  zh: { labCharacterShader: '角色着色器实验室', labRockGeneration: '岩石与悬崖生成', labRockShader: '岩石着色器实验室', labGroundShader: '地面着色器实验室', labGrassGeneration: '草与地被生成实验室', labWater: '水体实验室', labSkyAtmosphere: '大气源实验室', labEnvironmentShader: '环境着色器实验室', labManufacturedSurface: '人工表面着色器实验室', labDebris: '碎屑实验室', labProp: '道具实验室', labBuilding: '建筑实验室', labLandscape: '景观实验室', labTexture: '纹理实验室', chooseHowToBegin: '选择开始方式', whatWouldYouLikeToWorkOn: '你想处理什么？', draftSafe: '在你明确创建或打开其他内容前，当前草稿都会保留。', continue: '继续', newEntry: '新建条目', openExistingEntry: '打开已有条目', searchSavedEntries: '搜索已保存条目和实验室起始库', searchSavedEntriesPlaceholder: '搜索已保存条目和起始内容…', openStyle: '打开风格', backToLabs: '返回实验室', preview: '预览', rotate: '旋转', pan: '平移', zoom: '缩放', idle: '待机', walk: '行走', resetCamera: '重置相机 (C)', base: '基础', skin: '皮肤', cel: '卡通', shadow: '阴影', light: '光照', hair: '头发', detail: '细节', outline: '描边', baseTexture: '基础纹理', materialRoles: '材质角色', alpha: '透明度', enabled: '启用', compatibility: '兼容', sourceMaterialColor: '源材质颜色', textureOnly: '仅纹理', white: '白色' },
  es: { labCharacterShader: 'Lab de sombreado de personajes', labRockGeneration: 'Generación de rocas y acantilados', labRockShader: 'Lab de sombreado de rocas', labGroundShader: 'Lab de sombreado del suelo', labGrassGeneration: 'Lab de generación de hierba y cobertura', labWater: 'Lab de agua', labSkyAtmosphere: 'Lab de fuentes atmosféricas', labEnvironmentShader: 'Lab de sombreado ambiental', labManufacturedSurface: 'Lab de sombreado de superficies fabricadas', labDebris: 'Lab de escombros', labProp: 'Lab de props', labBuilding: 'Lab de edificios', labLandscape: 'Lab de paisajes', labTexture: 'Lab de texturas', chooseHowToBegin: 'Elige cómo empezar', whatWouldYouLikeToWorkOn: '¿En qué quieres trabajar?', draftSafe: 'Tu borrador actual se conserva hasta que crees o abras otra cosa de forma explícita.', continue: 'Continuar', newEntry: 'Nueva entrada', openExistingEntry: 'Abrir una entrada existente', searchSavedEntries: 'Busca tus entradas guardadas y la biblioteca inicial del Lab', searchSavedEntriesPlaceholder: 'Buscar entradas guardadas e iniciales…', openStyle: 'Abrir estilo', backToLabs: 'Volver a Labs', preview: 'Vista previa', rotate: 'Rotar', pan: 'Desplazar', zoom: 'Zoom', idle: 'Reposo', walk: 'Caminar', resetCamera: 'Restablecer cámara (C)', base: 'Base', skin: 'Piel', cel: 'Cel', shadow: 'Sombra', light: 'Luz', hair: 'Cabello', detail: 'Detalle', outline: 'Contorno', baseTexture: 'Textura base', materialRoles: 'Roles de material', alpha: 'Alfa', enabled: 'Activado', compatibility: 'Compatibilidad', sourceMaterialColor: 'Color del material de origen', textureOnly: 'Solo textura', white: 'Blanco' },
  fr: { labCharacterShader: 'Lab de shader de personnages', labRockGeneration: 'Génération de roches et falaises', labRockShader: 'Lab de shader de roches', labGroundShader: 'Lab de shader du sol', labGrassGeneration: 'Lab de génération d’herbe et couvre-sol', labWater: 'Lab de l’eau', labSkyAtmosphere: 'Lab des sources atmosphériques', labEnvironmentShader: 'Lab de shader environnemental', labManufacturedSurface: 'Lab de shader des surfaces fabriquées', labDebris: 'Lab des débris', labProp: 'Lab des éléments', labBuilding: 'Lab des bâtiments', labLandscape: 'Lab des paysages', labTexture: 'Lab de textures', chooseHowToBegin: 'Choisissez comment commencer', whatWouldYouLikeToWorkOn: 'Sur quoi souhaitez-vous travailler ?', draftSafe: 'Votre brouillon reste conservé jusqu’à ce que vous créiez ou ouvriez autre chose.', continue: 'Continuer', newEntry: 'Nouvelle entrée', openExistingEntry: 'Ouvrir une entrée existante', searchSavedEntries: 'Rechercher vos entrées enregistrées et la bibliothèque de départ du Lab', searchSavedEntriesPlaceholder: 'Rechercher des entrées et des éléments de départ…', openStyle: 'Ouvrir le style', backToLabs: 'Retour aux Labs', preview: 'Aperçu', rotate: 'Rotation', pan: 'Déplacement', zoom: 'Zoom', idle: 'Inactif', walk: 'Marche', resetCamera: 'Réinitialiser la caméra (C)', base: 'Base', skin: 'Peau', cel: 'Cel', shadow: 'Ombre', light: 'Lumière', hair: 'Cheveux', detail: 'Détails', outline: 'Contour', baseTexture: 'Texture de base', materialRoles: 'Rôles des matériaux', alpha: 'Alpha', enabled: 'Activé', compatibility: 'Compatibilité', sourceMaterialColor: 'Couleur du matériau source', textureOnly: 'Texture uniquement', white: 'Blanc' },
  de: { labCharacterShader: 'Character-Shader-Lab', labRockGeneration: 'Felsen- und Klippengenerierung', labRockShader: 'Felsen-Shader-Lab', labGroundShader: 'Boden-Shader-Lab', labGrassGeneration: 'Lab für Gras- und Bodendecker-Generierung', labWater: 'Wasser-Lab', labSkyAtmosphere: 'Atmosphärenquellen-Lab', labEnvironmentShader: 'Umgebungs-Shader-Lab', labManufacturedSurface: 'Shader-Lab für gefertigte Oberflächen', labDebris: 'Schutt-Lab', labProp: 'Prop-Lab', labBuilding: 'Gebäude-Lab', labLandscape: 'Landschafts-Lab', labTexture: 'Textur-Lab', chooseHowToBegin: 'So beginnst du', whatWouldYouLikeToWorkOn: 'Woran möchtest du arbeiten?', draftSafe: 'Dein aktueller Entwurf bleibt erhalten, bis du ausdrücklich etwas Neues erstellst oder öffnest.', continue: 'Fortsetzen', newEntry: 'Neuer Eintrag', openExistingEntry: 'Vorhandenen Eintrag öffnen', searchSavedEntries: 'Gespeicherte Einträge und die Startbibliothek des Labs durchsuchen', searchSavedEntriesPlaceholder: 'Gespeicherte Einträge und Startinhalte suchen…', openStyle: 'Stil öffnen', backToLabs: 'Zu den Labs', preview: 'Vorschau', rotate: 'Drehen', pan: 'Schwenken', zoom: 'Zoom', idle: 'Leerlauf', walk: 'Gehen', resetCamera: 'Kamera zurücksetzen (C)', base: 'Basis', skin: 'Haut', cel: 'Cel', shadow: 'Schatten', light: 'Licht', hair: 'Haare', detail: 'Details', outline: 'Kontur', baseTexture: 'Basetextur', materialRoles: 'Materialrollen', alpha: 'Alpha', enabled: 'Aktiviert', compatibility: 'Kompatibilität', sourceMaterialColor: 'Quellmaterialfarbe', textureOnly: 'Nur Textur', white: 'Weiß' },
  pt: { labCharacterShader: 'Lab de shaders de personagens', labRockGeneration: 'Geração de rochas e falésias', labRockShader: 'Lab de shaders de rochas', labGroundShader: 'Lab de shaders do solo', labGrassGeneration: 'Lab de geração de relva e cobertura', labWater: 'Lab de água', labSkyAtmosphere: 'Lab de fontes atmosféricas', labEnvironmentShader: 'Lab de shaders ambientais', labManufacturedSurface: 'Lab de shaders de superfícies fabricadas', labDebris: 'Lab de detritos', labProp: 'Lab de props', labBuilding: 'Lab de edifícios', labLandscape: 'Lab de paisagens', labTexture: 'Lab de texturas', chooseHowToBegin: 'Escolha como começar', whatWouldYouLikeToWorkOn: 'Em que quer trabalhar?', draftSafe: 'O seu rascunho atual é mantido até criar ou abrir explicitamente outra coisa.', continue: 'Continuar', newEntry: 'Nova entrada', openExistingEntry: 'Abrir entrada existente', searchSavedEntries: 'Pesquisar entradas guardadas e a biblioteca inicial do Lab', searchSavedEntriesPlaceholder: 'Pesquisar entradas guardadas e iniciais…', openStyle: 'Abrir estilo', backToLabs: 'Voltar aos Labs', preview: 'Pré-visualização', rotate: 'Rodar', pan: 'Deslocar', zoom: 'Zoom', idle: 'Parado', walk: 'Caminhar', resetCamera: 'Repor câmara (C)', base: 'Base', skin: 'Pele', cel: 'Cel', shadow: 'Sombra', light: 'Luz', hair: 'Cabelo', detail: 'Detalhe', outline: 'Contorno', baseTexture: 'Textura base', materialRoles: 'Funções do material', alpha: 'Alfa', enabled: 'Ativado', compatibility: 'Compatibilidade', sourceMaterialColor: 'Cor do material de origem', textureOnly: 'Apenas textura', white: 'Branco' },
  'pt-BR': { labCharacterShader: 'Lab de shaders de personagens', labRockGeneration: 'Geração de rochas e penhascos', labRockShader: 'Lab de shaders de rochas', labGroundShader: 'Lab de shaders do solo', labGrassGeneration: 'Lab de geração de grama e cobertura', labWater: 'Lab de água', labSkyAtmosphere: 'Lab de fontes atmosféricas', labEnvironmentShader: 'Lab de shaders ambientais', labManufacturedSurface: 'Lab de shaders de superfícies fabricadas', labDebris: 'Lab de detritos', labProp: 'Lab de props', labBuilding: 'Lab de construções', labLandscape: 'Lab de paisagens', labTexture: 'Lab de texturas', chooseHowToBegin: 'Escolha como começar', whatWouldYouLikeToWorkOn: 'No que você quer trabalhar?', draftSafe: 'Seu rascunho atual fica preservado até você criar ou abrir outra coisa explicitamente.', continue: 'Continuar', newEntry: 'Nova entrada', openExistingEntry: 'Abrir entrada existente', searchSavedEntries: 'Pesquise suas entradas salvas e a biblioteca inicial do Lab', searchSavedEntriesPlaceholder: 'Buscar entradas salvas e iniciais…', openStyle: 'Abrir estilo', backToLabs: 'Voltar aos Labs', preview: 'Prévia', rotate: 'Girar', pan: 'Mover', zoom: 'Zoom', idle: 'Parado', walk: 'Caminhar', resetCamera: 'Redefinir câmera (C)', base: 'Base', skin: 'Pele', cel: 'Cel', shadow: 'Sombra', light: 'Luz', hair: 'Cabelo', detail: 'Detalhe', outline: 'Contorno', baseTexture: 'Textura base', materialRoles: 'Funções do material', alpha: 'Alfa', enabled: 'Ativado', compatibility: 'Compatibilidade', sourceMaterialColor: 'Cor do material de origem', textureOnly: 'Somente textura', white: 'Branco' },
  it: { labCharacterShader: 'Lab shader personaggi', labRockGeneration: 'Generazione di rocce e scogliere', labRockShader: 'Lab shader rocce', labGroundShader: 'Lab shader terreno', labGrassGeneration: 'Lab generazione erba e tappezzanti', labWater: 'Lab acqua', labSkyAtmosphere: 'Lab sorgenti atmosferiche', labEnvironmentShader: 'Lab shader ambiente', labManufacturedSurface: 'Lab shader superfici lavorate', labDebris: 'Lab detriti', labProp: 'Lab prop', labBuilding: 'Lab edifici', labLandscape: 'Lab paesaggio', labTexture: 'Lab texture', chooseHowToBegin: 'Scegli come iniziare', whatWouldYouLikeToWorkOn: 'Su cosa vuoi lavorare?', draftSafe: 'La bozza attuale resta al sicuro finché non crei o apri esplicitamente qualcos’altro.', continue: 'Continua', newEntry: 'Nuova voce', openExistingEntry: 'Apri una voce esistente', searchSavedEntries: 'Cerca le voci salvate e la libreria iniziale del Lab', searchSavedEntriesPlaceholder: 'Cerca voci salvate e iniziali…', openStyle: 'Apri stile', backToLabs: 'Torna ai Lab', preview: 'Anteprima', rotate: 'Ruota', pan: 'Panoramica', zoom: 'Zoom', idle: 'Riposo', walk: 'Cammina', resetCamera: 'Reimposta fotocamera (C)', base: 'Base', skin: 'Pelle', cel: 'Cel', shadow: 'Ombra', light: 'Luce', hair: 'Capelli', detail: 'Dettagli', outline: 'Contorno', baseTexture: 'Texture base', materialRoles: 'Ruoli del materiale', alpha: 'Alfa', enabled: 'Attivo', compatibility: 'Compatibilità', sourceMaterialColor: 'Colore materiale sorgente', textureOnly: 'Solo texture', white: 'Bianco' },
  ru: { labCharacterShader: 'Лаборатория шейдеров персонажа', labRockGeneration: 'Генерация скал и утёсов', labRockShader: 'Лаборатория шейдеров скал', labGroundShader: 'Лаборатория шейдеров земли', labGrassGeneration: 'Лаборатория генерации травы и почвопокровных', labWater: 'Лаборатория воды', labSkyAtmosphere: 'Лаборатория атмосферных источников', labEnvironmentShader: 'Лаборатория шейдеров окружения', labManufacturedSurface: 'Лаборатория шейдеров искусственных поверхностей', labDebris: 'Лаборатория обломков', labProp: 'Лаборатория пропов', labBuilding: 'Лаборатория зданий', labLandscape: 'Лаборатория ландшафта', labTexture: 'Лаборатория текстур', chooseHowToBegin: 'Выберите способ начала', whatWouldYouLikeToWorkOn: 'С чем вы хотите работать?', draftSafe: 'Текущий черновик сохраняется, пока вы явно не создадите или не откроете что-то другое.', continue: 'Продолжить', newEntry: 'Новая запись', openExistingEntry: 'Открыть существующую запись', searchSavedEntries: 'Поиск сохранённых записей и стартовой библиотеки лаборатории', searchSavedEntriesPlaceholder: 'Поиск сохранённых записей и стартовых вариантов…', openStyle: 'Открыть стиль', backToLabs: 'Вернуться в лаборатории', preview: 'Предпросмотр', rotate: 'Вращать', pan: 'Панорамировать', zoom: 'Масштаб', idle: 'Покой', walk: 'Идти', resetCamera: 'Сбросить камеру (C)', base: 'Основа', skin: 'Кожа', cel: 'Целл', shadow: 'Тени', light: 'Свет', hair: 'Волосы', detail: 'Детали', outline: 'Контур', baseTexture: 'Основная текстура', materialRoles: 'Роли материалов', alpha: 'Альфа', enabled: 'Включено', compatibility: 'Совместимость', sourceMaterialColor: 'Цвет исходного материала', textureOnly: 'Только текстура', white: 'Белый' },
  id: { labCharacterShader: 'Lab Shader Karakter', labRockGeneration: 'Lab Pembuatan Batu & Tebing', labRockShader: 'Lab Shader Batu', labGroundShader: 'Lab Shader Tanah', labGrassGeneration: 'Lab Pembuatan Rumput & Penutup Tanah', labWater: 'Lab Air', labSkyAtmosphere: 'Lab Sumber Atmosfer', labEnvironmentShader: 'Lab Shader Lingkungan', labManufacturedSurface: 'Lab Shader Permukaan Buatan', labDebris: 'Lab Puing', labProp: 'Lab Prop', labBuilding: 'Lab Bangunan', labLandscape: 'Lab Lanskap', labTexture: 'Lab Tekstur', chooseHowToBegin: 'Pilih cara memulai', whatWouldYouLikeToWorkOn: 'Apa yang ingin Anda kerjakan?', draftSafe: 'Draf saat ini tetap aman sampai Anda membuat atau membuka sesuatu yang lain secara eksplisit.', continue: 'Lanjutkan', newEntry: 'Entri baru', openExistingEntry: 'Buka entri yang ada', searchSavedEntries: 'Cari entri tersimpan dan pustaka awal Lab', searchSavedEntriesPlaceholder: 'Cari entri tersimpan dan awal…', openStyle: 'Buka gaya', backToLabs: 'Kembali ke Lab', preview: 'Pratinjau', rotate: 'Putar', pan: 'Geser', zoom: 'Zoom', idle: 'Diam', walk: 'Berjalan', resetCamera: 'Atur ulang kamera (C)', base: 'Dasar', skin: 'Kulit', cel: 'Cel', shadow: 'Bayangan', light: 'Cahaya', hair: 'Rambut', detail: 'Detail', outline: 'Garis luar', baseTexture: 'Tekstur dasar', materialRoles: 'Peran material', alpha: 'Alfa', enabled: 'Aktif', compatibility: 'Kompatibilitas', sourceMaterialColor: 'Warna material sumber', textureOnly: 'Tekstur saja', white: 'Putih' },
  vi: { labCharacterShader: 'Lab Shader Nhân vật', labRockGeneration: 'Lab Tạo đá & vách đá', labRockShader: 'Lab Shader Đá', labGroundShader: 'Lab Shader Mặt đất', labGrassGeneration: 'Lab Tạo cỏ & cây phủ đất', labWater: 'Lab Nước', labSkyAtmosphere: 'Lab Nguồn khí quyển', labEnvironmentShader: 'Lab Shader Môi trường', labManufacturedSurface: 'Lab Shader Bề mặt chế tạo', labDebris: 'Lab Mảnh vụn', labProp: 'Lab Đạo cụ', labBuilding: 'Lab Công trình', labLandscape: 'Lab Cảnh quan', labTexture: 'Lab Kết cấu', chooseHowToBegin: 'Chọn cách bắt đầu', whatWouldYouLikeToWorkOn: 'Bạn muốn làm việc gì?', draftSafe: 'Bản nháp hiện tại được giữ nguyên cho đến khi bạn chủ động tạo hoặc mở nội dung khác.', continue: 'Tiếp tục', newEntry: 'Mục mới', openExistingEntry: 'Mở mục có sẵn', searchSavedEntries: 'Tìm các mục đã lưu và thư viện khởi đầu của Lab', searchSavedEntriesPlaceholder: 'Tìm mục đã lưu và mục khởi đầu…', openStyle: 'Mở phong cách', backToLabs: 'Quay lại Labs', preview: 'Xem trước', rotate: 'Xoay', pan: 'Di chuyển', zoom: 'Thu phóng', idle: 'Đứng yên', walk: 'Đi bộ', resetCamera: 'Đặt lại máy ảnh (C)', base: 'Cơ bản', skin: 'Da', cel: 'Cel', shadow: 'Bóng', light: 'Ánh sáng', hair: 'Tóc', detail: 'Chi tiết', outline: 'Viền', baseTexture: 'Kết cấu cơ bản', materialRoles: 'Vai trò vật liệu', alpha: 'Alpha', enabled: 'Bật', compatibility: 'Tương thích', sourceMaterialColor: 'Màu vật liệu nguồn', textureOnly: 'Chỉ kết cấu', white: 'Trắng' },
  th: { labCharacterShader: 'แล็บเชดเดอร์ตัวละคร', labRockGeneration: 'แล็บสร้างหินและหน้าผา', labRockShader: 'แล็บเชดเดอร์หิน', labGroundShader: 'แล็บเชดเดอร์พื้นดิน', labGrassGeneration: 'แล็บสร้างหญ้าและพืชคลุมดิน', labWater: 'แล็บน้ำ', labSkyAtmosphere: 'แล็บแหล่งบรรยากาศ', labEnvironmentShader: 'แล็บเชดเดอร์สภาพแวดล้อม', labManufacturedSurface: 'แล็บเชดเดอร์พื้นผิวผลิตขึ้น', labDebris: 'แล็บเศษซาก', labProp: 'แล็บพร็อพ', labBuilding: 'แล็บอาคาร', labLandscape: 'แล็บภูมิทัศน์', labTexture: 'แล็บพื้นผิว', chooseHowToBegin: 'เลือกวิธีเริ่มต้น', whatWouldYouLikeToWorkOn: 'คุณต้องการทำงานกับอะไร?', draftSafe: 'ฉบับร่างปัจจุบันจะยังคงอยู่จนกว่าคุณจะสร้างหรือเปิดสิ่งอื่นโดยตั้งใจ', continue: 'ดำเนินการต่อ', newEntry: 'รายการใหม่', openExistingEntry: 'เปิดรายการที่มีอยู่', searchSavedEntries: 'ค้นหารายการที่บันทึกไว้และคลังเริ่มต้นของแล็บ', searchSavedEntriesPlaceholder: 'ค้นหารายการที่บันทึกและรายการเริ่มต้น…', openStyle: 'เปิดสไตล์', backToLabs: 'กลับไปที่แล็บ', preview: 'ดูตัวอย่าง', rotate: 'หมุน', pan: 'เลื่อน', zoom: 'ซูม', idle: 'อยู่นิ่ง', walk: 'เดิน', resetCamera: 'รีเซ็ตกล้อง (C)', base: 'พื้นฐาน', skin: 'ผิว', cel: 'เซล', shadow: 'เงา', light: 'แสง', hair: 'ผม', detail: 'รายละเอียด', outline: 'เส้นขอบ', baseTexture: 'พื้นผิวพื้นฐาน', materialRoles: 'บทบาทวัสดุ', alpha: 'อัลฟา', enabled: 'เปิดใช้', compatibility: 'เข้ากันได้', sourceMaterialColor: 'สีวัสดุต้นทาง', textureOnly: 'พื้นผิวเท่านั้น', white: 'ขาว' },
  tr: { labCharacterShader: 'Karakter Shader Labı', labRockGeneration: 'Kaya ve Uçurum Üretimi', labRockShader: 'Kaya Shader Labı', labGroundShader: 'Zemin Shader Labı', labGrassGeneration: 'Çim ve Yer Örtüsü Üretim Labı', labWater: 'Su Labı', labSkyAtmosphere: 'Atmosfer Kaynağı Labı', labEnvironmentShader: 'Çevre Shader Labı', labManufacturedSurface: 'Üretilmiş Yüzey Shader Labı', labDebris: 'Moloz Labı', labProp: 'Prop Labı', labBuilding: 'Bina Labı', labLandscape: 'Peyzaj Labı', labTexture: 'Doku Labı', chooseHowToBegin: 'Nasıl başlayacağınızı seçin', whatWouldYouLikeToWorkOn: 'Ne üzerinde çalışmak istiyorsunuz?', draftSafe: 'Başka bir şey oluşturmayı veya açmayı açıkça seçene kadar mevcut taslağınız korunur.', continue: 'Devam et', newEntry: 'Yeni giriş', openExistingEntry: 'Mevcut girişi aç', searchSavedEntries: 'Kayıtlı girişlerinizi ve Lab başlangıç kitaplığını arayın', searchSavedEntriesPlaceholder: 'Kayıtlı ve başlangıç girişlerinde ara…', openStyle: 'Stili aç', backToLabs: 'Lab’lara dön', preview: 'Önizleme', rotate: 'Döndür', pan: 'Kaydır', zoom: 'Yakınlaştır', idle: 'Bekleme', walk: 'Yürüme', resetCamera: 'Kamerayı sıfırla (C)', base: 'Temel', skin: 'Cilt', cel: 'Cel', shadow: 'Gölge', light: 'Işık', hair: 'Saç', detail: 'Ayrıntı', outline: 'Kontur', baseTexture: 'Temel doku', materialRoles: 'Malzeme rolleri', alpha: 'Alfa', enabled: 'Etkin', compatibility: 'Uyumluluk', sourceMaterialColor: 'Kaynak malzeme rengi', textureOnly: 'Yalnızca doku', white: 'Beyaz' },
  hi: { labCharacterShader: 'कैरेक्टर शेडर लैब', labRockGeneration: 'चट्टान और चट्टान-दीवार निर्माण', labRockShader: 'रॉक शेडर लैब', labGroundShader: 'ग्राउंड शेडर लैब', labGrassGeneration: 'घास और ग्राउंडकवर निर्माण लैब', labWater: 'वॉटर लैब', labSkyAtmosphere: 'वायुमंडलीय स्रोत लैब', labEnvironmentShader: 'पर्यावरण शेडर लैब', labManufacturedSurface: 'निर्मित सतह शेडर लैब', labDebris: 'मलबा लैब', labProp: 'प्रॉप लैब', labBuilding: 'बिल्डिंग लैब', labLandscape: 'लैंडस्केप लैब', labTexture: 'टेक्सचर लैब', chooseHowToBegin: 'शुरू करने का तरीका चुनें', whatWouldYouLikeToWorkOn: 'आप किस पर काम करना चाहते हैं?', draftSafe: 'जब तक आप स्पष्ट रूप से कुछ नया नहीं बनाते या खोलते, वर्तमान ड्राफ्ट सुरक्षित रहेगा।', continue: 'जारी रखें', newEntry: 'नई प्रविष्टि', openExistingEntry: 'मौजूदा प्रविष्टि खोलें', searchSavedEntries: 'सहेजी गई प्रविष्टियाँ और लैब स्टार्टर लाइब्रेरी खोजें', searchSavedEntriesPlaceholder: 'सहेजी गई और स्टार्टर प्रविष्टियाँ खोजें…', openStyle: 'स्टाइल खोलें', backToLabs: 'लैब पर वापस जाएँ', preview: 'पूर्वावलोकन', rotate: 'घुमाएँ', pan: 'पैन', zoom: 'ज़ूम', idle: 'स्थिर', walk: 'चलना', resetCamera: 'कैमरा रीसेट करें (C)', base: 'आधार', skin: 'त्वचा', cel: 'सेल', shadow: 'छाया', light: 'प्रकाश', hair: 'बाल', detail: 'विवरण', outline: 'रूपरेखा', baseTexture: 'आधार टेक्सचर', materialRoles: 'मटेरियल भूमिकाएँ', alpha: 'अल्फ़ा', enabled: 'सक्षम', compatibility: 'संगतता', sourceMaterialColor: 'स्रोत मटेरियल रंग', textureOnly: 'केवल टेक्सचर', white: 'सफ़ेद' },
  ar: { labCharacterShader: 'مختبر تظليل الشخصيات', labRockGeneration: 'مختبر إنشاء الصخور والمنحدرات', labRockShader: 'مختبر تظليل الصخور', labGroundShader: 'مختبر تظليل الأرض', labGrassGeneration: 'مختبر إنشاء العشب والغطاء الأرضي', labWater: 'مختبر الماء', labSkyAtmosphere: 'مختبر مصادر الغلاف الجوي', labEnvironmentShader: 'مختبر تظليل البيئة', labManufacturedSurface: 'مختبر تظليل الأسطح المصنعة', labDebris: 'مختبر الركام', labProp: 'مختبر العناصر', labBuilding: 'مختبر المباني', labLandscape: 'مختبر المناظر الطبيعية', labTexture: 'مختبر الأنسجة', chooseHowToBegin: 'اختر طريقة البدء', whatWouldYouLikeToWorkOn: 'على ماذا تريد العمل؟', draftSafe: 'تبقى المسودة الحالية محفوظة حتى تنشئ أو تفتح شيئاً آخر صراحةً.', continue: 'متابعة', newEntry: 'إدخال جديد', openExistingEntry: 'فتح إدخال موجود', searchSavedEntries: 'ابحث في إدخالاتك المحفوظة ومكتبة البدء في المختبر', searchSavedEntriesPlaceholder: 'البحث في الإدخالات المحفوظة ومواد البدء…', openStyle: 'فتح النمط', backToLabs: 'العودة إلى المختبرات', preview: 'معاينة', rotate: 'تدوير', pan: 'تحريك', zoom: 'تكبير', idle: 'سكون', walk: 'مشي', resetCamera: 'إعادة ضبط الكاميرا (C)', base: 'الأساس', skin: 'البشرة', cel: 'سيل', shadow: 'الظل', light: 'الإضاءة', hair: 'الشعر', detail: 'التفاصيل', outline: 'المخطط', baseTexture: 'الخامة الأساسية', materialRoles: 'أدوار الخامات', alpha: 'ألفا', enabled: 'مفعّل', compatibility: 'التوافق', sourceMaterialColor: 'لون الخامة المصدر', textureOnly: 'الخامة فقط', white: 'أبيض' },
  bn: { labCharacterShader: 'ক্যারেক্টার শেডার ল্যাব', labRockGeneration: 'পাথর ও খাড়া পাহাড় তৈরি ল্যাব', labRockShader: 'রক শেডার ল্যাব', labGroundShader: 'গ্রাউন্ড শেডার ল্যাব', labGrassGeneration: 'ঘাস ও গ্রাউন্ডকভার তৈরির ল্যাব', labWater: 'জল ল্যাব', labSkyAtmosphere: 'বায়ুমণ্ডলীয় উৎস ল্যাব', labEnvironmentShader: 'পরিবেশ শেডার ল্যাব', labManufacturedSurface: 'নির্মিত পৃষ্ঠ শেডার ল্যাব', labDebris: 'ধ্বংসাবশেষ ল্যাব', labProp: 'প্রপ ল্যাব', labBuilding: 'ভবন ল্যাব', labLandscape: 'ল্যান্ডস্কেপ ল্যাব', labTexture: 'টেক্সচার ল্যাব', chooseHowToBegin: 'কীভাবে শুরু করবেন বেছে নিন', whatWouldYouLikeToWorkOn: 'আপনি কী নিয়ে কাজ করতে চান?', draftSafe: 'আপনি স্পষ্টভাবে অন্য কিছু তৈরি বা না খোলা পর্যন্ত বর্তমান খসড়া নিরাপদ থাকবে।', continue: 'চালিয়ে যান', newEntry: 'নতুন এন্ট্রি', openExistingEntry: 'বিদ্যমান এন্ট্রি খুলুন', searchSavedEntries: 'সংরক্ষিত এন্ট্রি ও ল্যাবের স্টার্টার লাইব্রেরি খুঁজুন', searchSavedEntriesPlaceholder: 'সংরক্ষিত ও স্টার্টার এন্ট্রি খুঁজুন…', openStyle: 'স্টাইল খুলুন', backToLabs: 'ল্যাবে ফিরে যান', preview: 'প্রিভিউ', rotate: 'ঘোরান', pan: 'প্যান', zoom: 'জুম', idle: 'স্থির', walk: 'হাঁটা', resetCamera: 'ক্যামেরা রিসেট করুন (C)', base: 'ভিত্তি', skin: 'ত্বক', cel: 'সেল', shadow: 'ছায়া', light: 'আলো', hair: 'চুল', detail: 'বিস্তারিত', outline: 'আউটলাইন', baseTexture: 'বেস টেক্সচার', materialRoles: 'ম্যাটেরিয়াল ভূমিকা', alpha: 'আলফা', enabled: 'সক্রিয়', compatibility: 'সামঞ্জস্য', sourceMaterialColor: 'সোর্স ম্যাটেরিয়াল রং', textureOnly: 'শুধু টেক্সচার', white: 'সাদা' },
  ms: { labCharacterShader: 'Makmal Shader Watak', labRockGeneration: 'Makmal Penjanaan Batu & Tebing', labRockShader: 'Makmal Shader Batu', labGroundShader: 'Makmal Shader Tanah', labGrassGeneration: 'Makmal Penjanaan Rumput & Litupan Tanah', labWater: 'Makmal Air', labSkyAtmosphere: 'Makmal Sumber Atmosfera', labEnvironmentShader: 'Makmal Shader Persekitaran', labManufacturedSurface: 'Makmal Shader Permukaan Buatan', labDebris: 'Makmal Serpihan', labProp: 'Makmal Prop', labBuilding: 'Makmal Bangunan', labLandscape: 'Makmal Landskap', labTexture: 'Makmal Tekstur', chooseHowToBegin: 'Pilih cara untuk bermula', whatWouldYouLikeToWorkOn: 'Apakah yang anda mahu kerjakan?', draftSafe: 'Draf semasa kekal selamat sehingga anda mencipta atau membuka sesuatu yang lain dengan jelas.', continue: 'Teruskan', newEntry: 'Entri baharu', openExistingEntry: 'Buka entri sedia ada', searchSavedEntries: 'Cari entri tersimpan dan pustaka permulaan Makmal', searchSavedEntriesPlaceholder: 'Cari entri tersimpan dan permulaan…', openStyle: 'Buka gaya', backToLabs: 'Kembali ke Makmal', preview: 'Pratonton', rotate: 'Putar', pan: 'Anjak', zoom: 'Zum', idle: 'Rehat', walk: 'Berjalan', resetCamera: 'Set semula kamera (C)', base: 'Asas', skin: 'Kulit', cel: 'Cel', shadow: 'Bayang', light: 'Cahaya', hair: 'Rambut', detail: 'Perincian', outline: 'Garis luar', baseTexture: 'Tekstur asas', materialRoles: 'Peranan bahan', alpha: 'Alfa', enabled: 'Didayakan', compatibility: 'Keserasian', sourceMaterialColor: 'Warna bahan sumber', textureOnly: 'Tekstur sahaja', white: 'Putih' },
  nl: { labCharacterShader: 'Character Shader Lab', labRockGeneration: 'Rots- en klifgeneratie', labRockShader: 'Rots Shader Lab', labGroundShader: 'Grond Shader Lab', labGrassGeneration: 'Lab voor gras- en bodembedekkergeneratie', labWater: 'Waterlab', labSkyAtmosphere: 'Atmosfeerbronlab', labEnvironmentShader: 'Omgevingsshaderlab', labManufacturedSurface: 'Shaderlab voor vervaardigde oppervlakken', labDebris: 'Puinlab', labProp: 'Proplab', labBuilding: 'Gebouwenlab', labLandscape: 'Landschapslab', labTexture: 'Textuurlab', chooseHowToBegin: 'Kies hoe je begint', whatWouldYouLikeToWorkOn: 'Waar wil je aan werken?', draftSafe: 'Je huidige concept blijft bewaard totdat je expliciet iets anders maakt of opent.', continue: 'Doorgaan', newEntry: 'Nieuwe invoer', openExistingEntry: 'Bestaande invoer openen', searchSavedEntries: 'Zoek in je opgeslagen invoer en de startbibliotheek van het Lab', searchSavedEntriesPlaceholder: 'Opgeslagen en startinvoer zoeken…', openStyle: 'Stijl openen', backToLabs: 'Terug naar Labs', preview: 'Voorbeeld', rotate: 'Draaien', pan: 'Pannen', zoom: 'Zoomen', idle: 'Rust', walk: 'Lopen', resetCamera: 'Camera resetten (C)', base: 'Basis', skin: 'Huid', cel: 'Cel', shadow: 'Schaduw', light: 'Licht', hair: 'Haar', detail: 'Details', outline: 'Omtrek', baseTexture: 'Basistekstuur', materialRoles: 'Materiaalrollen', alpha: 'Alfa', enabled: 'Ingeschakeld', compatibility: 'Compatibiliteit', sourceMaterialColor: 'Bronmateriaalkleur', textureOnly: 'Alleen textuur', white: 'Wit' },
  pl: { labCharacterShader: 'Laboratorium shaderów postaci', labRockGeneration: 'Generowanie skał i klifów', labRockShader: 'Laboratorium shaderów skał', labGroundShader: 'Laboratorium shaderów podłoża', labGrassGeneration: 'Laboratorium generowania trawy i roślin okrywowych', labWater: 'Laboratorium wody', labSkyAtmosphere: 'Laboratorium źródeł atmosferycznych', labEnvironmentShader: 'Laboratorium shaderów środowiska', labManufacturedSurface: 'Laboratorium shaderów powierzchni wytworzonych', labDebris: 'Laboratorium gruzu', labProp: 'Laboratorium obiektów', labBuilding: 'Laboratorium budynków', labLandscape: 'Laboratorium krajobrazu', labTexture: 'Laboratorium tekstur', chooseHowToBegin: 'Wybierz sposób rozpoczęcia', whatWouldYouLikeToWorkOn: 'Nad czym chcesz pracować?', draftSafe: 'Bieżący szkic pozostanie bezpieczny, dopóki jawnie nie utworzysz lub nie otworzysz czegoś innego.', continue: 'Kontynuuj', newEntry: 'Nowy wpis', openExistingEntry: 'Otwórz istniejący wpis', searchSavedEntries: 'Przeszukaj zapisane wpisy i bibliotekę startową laboratorium', searchSavedEntriesPlaceholder: 'Szukaj zapisanych i startowych wpisów…', openStyle: 'Otwórz styl', backToLabs: 'Wróć do laboratoriów', preview: 'Podgląd', rotate: 'Obróć', pan: 'Przesuń', zoom: 'Powiększ', idle: 'Bezczynność', walk: 'Chodzenie', resetCamera: 'Resetuj kamerę (C)', base: 'Baza', skin: 'Skóra', cel: 'Cel', shadow: 'Cień', light: 'Światło', hair: 'Włosy', detail: 'Szczegóły', outline: 'Kontur', baseTexture: 'Tekstura bazowa', materialRoles: 'Role materiałów', alpha: 'Alfa', enabled: 'Włączone', compatibility: 'Zgodność', sourceMaterialColor: 'Kolor materiału źródłowego', textureOnly: 'Tylko tekstura', white: 'Biały' },
  sv: { labCharacterShader: 'Character Shader Lab', labRockGeneration: 'Skapande av stenar och klippor', labRockShader: 'Rock Shader Lab', labGroundShader: 'Markshaderlabb', labGrassGeneration: 'Lab för skapande av gräs och marktäckare', labWater: 'Vattenlabb', labSkyAtmosphere: 'Lab för atmosfärskällor', labEnvironmentShader: 'Miljöshaderlabb', labManufacturedSurface: 'Shaderlabb för tillverkade ytor', labDebris: 'Skräplabb', labProp: 'Proplabb', labBuilding: 'Byggnadslabb', labLandscape: 'Landskapslabb', labTexture: 'Texturlabb', chooseHowToBegin: 'Välj hur du vill börja', whatWouldYouLikeToWorkOn: 'Vad vill du arbeta med?', draftSafe: 'Ditt aktuella utkast sparas tills du uttryckligen skapar eller öppnar något annat.', continue: 'Fortsätt', newEntry: 'Ny post', openExistingEntry: 'Öppna en befintlig post', searchSavedEntries: 'Sök bland sparade poster och labbets startbibliotek', searchSavedEntriesPlaceholder: 'Sök sparade poster och startinnehåll…', openStyle: 'Öppna stil', backToLabs: 'Tillbaka till labben', preview: 'Förhandsvisning', rotate: 'Rotera', pan: 'Panorera', zoom: 'Zooma', idle: 'Viloläge', walk: 'Gå', resetCamera: 'Återställ kamera (C)', base: 'Bas', skin: 'Hud', cel: 'Cel', shadow: 'Skugga', light: 'Ljus', hair: 'Hår', detail: 'Detaljer', outline: 'Kontur', baseTexture: 'Bastextur', materialRoles: 'Materialroller', alpha: 'Alfa', enabled: 'Aktiverad', compatibility: 'Kompatibilitet', sourceMaterialColor: 'Källmaterialets färg', textureOnly: 'Endast textur', white: 'Vit' },
});

// Schema metadata is generated from camelCase setting names, so it cannot
// reasonably carry a separate translated label for every new field. These
// compact term tables let the shared renderer translate those generated
// labels (and their option values) without touching serialized setting keys.
// Exact, hand-written copy above always wins; this is the safe fallback for
// labels such as “Face Shadow Saturation” and “Transparent Overlay Width”.
const EDITOR_TERM_TRANSLATIONS = Object.freeze({
  ja: {
    Base: 'ベース', Texture: 'テクスチャ', Material: 'マテリアル', Roles: '役割', Alpha: 'アルファ',
    Skin: '肌', Tone: 'トーン', Face: '顔', Lighting: 'ライティング', Cel: 'セル', Shade: 'シェード',
    Shadow: 'シャドウ', Color: 'カラー', Scene: 'シーン', Self: 'セルフ', Average: '平均', Indirect: '間接',
    Light: 'ライト', Local: 'ローカル', Lights: 'ライト', Rim: 'リム', Contact: '接触', Specular: 'スペキュラー',
    Hair: '髪', Highlight: 'ハイライト', Eye: '目', Maps: 'マップ', Outlines: 'アウトライン', Glitter: 'グリッター',
    Sticker: 'ステッカー', Perspective: '遠近', Removal: '補正', Fur: '毛皮', Custom: 'カスタム', Saturation: '彩度',
    Mode: 'モード', Cutout: '抜き', Cutoff: 'しきい値', Dither: 'ディザ', Opacity: '不透明度', Enabled: '有効',
    Expression: '表情', Token: 'トークン', Order: '順序', Map: 'マップ', Transparent: '透明', Overlay: 'オーバーレイ',
    Depth: '深度', Write: '書き込み', Preserve: '保持', Source: '元', Compatibility: '互換', Only: 'のみ', White: '白',
    Default: 'デフォルト', Strength: '強度', Intensity: '強度', Power: 'パワー', Range: '範囲', Minimum: '最小',
    Direct: '直接', Brightness: '明るさ', Tint: '色合い', Mid: '中間', Point: 'ポイント', Softness: '柔らかさ',
    Width: '幅', Area: '領域', Value: '値', Boost: 'ブースト', Offset: 'オフセット', Normal: '法線', Direction: '方向',
    Show: '表示', Channel: 'チャンネル', Off: 'オフ', Red: '赤', Green: '緑', Blue: '青', Additive: '加算',
    Multiply: '乗算', Blend: 'ブレンド', Head: '頭', Bone: 'ボーン', Tracked: '追跡', Static: '固定', Proxy: 'プロキシ',
    Fresnel: 'フレネル', Classic: 'クラシック', Character: 'キャラクター', Pass: 'パス', View: 'ビュー', Stable: '安定',
    Strand: 'ストランド', U: 'U', Horizontal: '水平', V: 'V', Vertical: '垂直', Preset: 'プリセット',
  },
  ko: {
    Base: '기본', Texture: '텍스처', Material: '머티리얼', Roles: '역할', Alpha: '알파', Skin: '피부', Tone: '톤',
    Face: '얼굴', Lighting: '조명', Cel: '셀', Shade: '셰이드', Shadow: '그림자', Color: '색상', Scene: '장면', Self: '자체',
    Average: '평균', Indirect: '간접', Light: '빛', Local: '로컬', Lights: '조명', Rim: '림', Contact: '접촉', Specular: '스페큘러',
    Hair: '머리카락', Highlight: '하이라이트', Eye: '눈', Maps: '맵', Outlines: '윤곽선', Glitter: '반짝임', Sticker: '스티커',
    Perspective: '원근', Removal: '제거', Fur: '털', Custom: '사용자 지정', Saturation: '채도', Mode: '모드', Cutout: '컷아웃',
    Cutoff: '컷오프', Dither: '디더', Opacity: '불투명도', Enabled: '사용', Expression: '표정', Token: '토큰', Order: '순서',
    Map: '맵', Transparent: '투명', Overlay: '오버레이', Depth: '깊이', Write: '쓰기', Preserve: '보존', Source: '소스',
    Compatibility: '호환성', Only: '전용', White: '흰색', Default: '기본값', Strength: '강도', Intensity: '강도', Power: '파워',
    Range: '범위', Minimum: '최소', Direct: '직접', Brightness: '밝기', Tint: '색조', Mid: '중간', Point: '지점', Softness: '부드러움',
    Width: '너비', Area: '영역', Value: '값', Boost: '부스트', Offset: '오프셋', Normal: '노멀', Direction: '방향', Show: '표시',
    Channel: '채널', Off: '끔', Red: '빨강', Green: '초록', Blue: '파랑', Additive: '가산', Multiply: '곱하기', Blend: '블렌드',
    Head: '머리', Bone: '본', Tracked: '추적', Static: '고정', Proxy: '프록시', Fresnel: '프레넬', Classic: '클래식',
    Character: '캐릭터', Pass: '패스', View: '보기', Stable: '안정', Strand: '가닥', U: 'U', Horizontal: '가로', V: 'V', Vertical: '세로', Preset: '프리셋',
  },
  zh: {
    Base: '基础', Texture: '纹理', Material: '材质', Roles: '角色', Alpha: '透明度', Skin: '皮肤', Tone: '色调', Face: '面部',
    Lighting: '光照', Cel: '卡通', Shade: '着色', Shadow: '阴影', Color: '颜色', Scene: '场景', Self: '自身', Average: '平均',
    Indirect: '间接', Light: '光照', Local: '局部', Lights: '光照', Rim: '轮廓', Contact: '接触', Specular: '高光', Hair: '头发',
    Highlight: '高光', Eye: '眼睛', Maps: '贴图', Outlines: '描边', Glitter: '闪光', Sticker: '贴花', Perspective: '透视', Removal: '校正',
    Fur: '毛发', Custom: '自定义', Saturation: '饱和度', Mode: '模式', Cutout: '裁切', Cutoff: '阈值', Dither: '抖动', Opacity: '不透明度',
    Enabled: '启用', Expression: '表情', Token: '标记', Order: '顺序', Map: '贴图', Transparent: '透明', Overlay: '叠加', Depth: '深度',
    Write: '写入', Preserve: '保留', Source: '源', Compatibility: '兼容', Only: '仅', White: '白色', Default: '默认', Strength: '强度',
    Intensity: '强度', Power: '幂', Range: '范围', Minimum: '最小', Direct: '直接', Brightness: '亮度', Tint: '色调', Mid: '中间', Point: '点',
    Softness: '柔和度', Width: '宽度', Area: '区域', Value: '值', Boost: '增强', Offset: '偏移', Normal: '法线', Direction: '方向', Show: '显示',
    Channel: '通道', Off: '关闭', Red: '红', Green: '绿', Blue: '蓝', Additive: '相加', Multiply: '相乘', Blend: '混合', Head: '头部',
    Bone: '骨骼', Tracked: '跟踪', Static: '静态', Proxy: '代理', Fresnel: '菲涅尔', Classic: '经典', Character: '角色', Pass: '通道', View: '视图', Stable: '稳定',
    Strand: '发丝', U: 'U', Horizontal: '水平', V: 'V', Vertical: '垂直', Preset: '预设',
  },
  es: {
    Base: 'Base', Texture: 'Textura', Material: 'Material', Roles: 'Roles', Alpha: 'Alfa', Skin: 'Piel', Tone: 'Tono', Face: 'Rostro',
    Lighting: 'Iluminación', Cel: 'Cel', Shade: 'Sombreado', Shadow: 'Sombra', Color: 'Color', Scene: 'Escena', Self: 'Propia', Average: 'Promedio',
    Indirect: 'Indirecta', Light: 'Luz', Local: 'Locales', Lights: 'Luces', Rim: 'Borde', Contact: 'Contacto', Specular: 'Especular', Hair: 'Cabello',
    Highlight: 'Resaltado', Eye: 'Ojo', Maps: 'Mapas', Outlines: 'Contornos', Glitter: 'Brillo', Sticker: 'Pegatina', Perspective: 'Perspectiva', Removal: 'Corrección',
    Fur: 'Pelaje', Custom: 'Personalizado', Saturation: 'Saturación', Mode: 'Modo', Cutout: 'Recorte', Cutoff: 'Umbral', Dither: 'Tramado', Opacity: 'Opacidad',
    Enabled: 'Activado', Expression: 'Expresión', Token: 'Token', Order: 'Orden', Map: 'Mapa', Transparent: 'Transparente', Overlay: 'Superposición', Depth: 'Profundidad',
    Write: 'Escritura', Preserve: 'Conservar', Source: 'Origen', Compatibility: 'Compatibilidad', Only: 'Solo', White: 'Blanco', Default: 'Predeterminado', Strength: 'Intensidad',
    Intensity: 'Intensidad', Power: 'Potencia', Range: 'Rango', Minimum: 'Mínimo', Direct: 'Directa', Brightness: 'Brillo', Tint: 'Tinte', Mid: 'Medio', Point: 'Punto',
    Softness: 'Suavidad', Width: 'Ancho', Area: 'Área', Value: 'Valor', Boost: 'Refuerzo', Offset: 'Desplazamiento', Normal: 'Normal', Direction: 'Dirección', Show: 'Mostrar',
    Channel: 'Canal', Off: 'Desactivado', Red: 'Rojo', Green: 'Verde', Blue: 'Azul', Additive: 'Aditivo', Multiply: 'Multiplicar', Blend: 'Mezcla', Head: 'Cabeza', Bone: 'Hueso',
    Tracked: 'Rastreado', Static: 'Estático', Proxy: 'Proxy', Fresnel: 'Fresnel', Classic: 'Clásico', Character: 'Personaje', Pass: 'Paso', View: 'Vista', Stable: 'Estable',
    Strand: 'Mecha', U: 'U', Horizontal: 'Horizontal', V: 'V', Vertical: 'Vertical', Preset: 'Preajuste',
  },
  fr: {
    Base: 'Base', Texture: 'Texture', Material: 'Matériau', Roles: 'Rôles', Alpha: 'Alpha', Skin: 'Peau', Tone: 'Teinte', Face: 'Visage',
    Lighting: 'Éclairage', Cel: 'Cel', Shade: 'Ombrage', Shadow: 'Ombre', Color: 'Couleur', Scene: 'Scène', Self: 'Auto', Average: 'Moyenne', Indirect: 'Indirecte', Light: 'Lumière', Local: 'Locales', Lights: 'Lumières', Rim: 'Contour', Contact: 'Contact', Specular: 'Spéculaire', Hair: 'Cheveux', Highlight: 'Reflet', Eye: 'Œil', Maps: 'Cartes', Outlines: 'Contours', Glitter: 'Paillettes', Sticker: 'Autocollant', Perspective: 'Perspective', Removal: 'Correction', Fur: 'Fourrure', Custom: 'Personnalisé', Saturation: 'Saturation', Mode: 'Mode', Cutout: 'Découpe', Cutoff: 'Seuil', Dither: 'Tramage', Opacity: 'Opacité', Enabled: 'Activé', Expression: 'Expression', Token: 'Jeton', Order: 'Ordre', Map: 'Carte', Transparent: 'Transparent', Overlay: 'Superposition', Depth: 'Profondeur', Write: 'Écriture', Preserve: 'Conserver', Source: 'Source', Compatibility: 'Compatibilité', Only: 'Uniquement', White: 'Blanc', Default: 'Par défaut', Strength: 'Intensité', Intensity: 'Intensité', Power: 'Puissance', Range: 'Plage', Minimum: 'Minimum', Direct: 'Directe', Brightness: 'Luminosité', Tint: 'Teinte', Mid: 'Médian', Point: 'Point', Softness: 'Douceur', Width: 'Largeur', Area: 'Zone', Value: 'Valeur', Boost: 'Boost', Offset: 'Décalage', Normal: 'Normale', Direction: 'Direction', Show: 'Afficher', Channel: 'Canal', Off: 'Désactivé', Red: 'Rouge', Green: 'Vert', Blue: 'Bleu', Additive: 'Additif', Multiply: 'Multiplier', Blend: 'Mélange', Head: 'Tête', Bone: 'Os', Tracked: 'Suivi', Static: 'Statique', Proxy: 'Proxy', Fresnel: 'Fresnel', Classic: 'Classique', Character: 'Personnage', Pass: 'Passe', View: 'Vue', Stable: 'Stable', Strand: 'Mèche', U: 'U', Horizontal: 'Horizontal', V: 'V', Vertical: 'Vertical', Preset: 'Préréglage',
  },
  de: {
    Base: 'Basis', Texture: 'Textur', Material: 'Material', Roles: 'Rollen', Alpha: 'Alpha', Skin: 'Haut', Tone: 'Ton', Face: 'Gesicht', Lighting: 'Beleuchtung', Cel: 'Cel', Shade: 'Schattierung', Shadow: 'Schatten', Color: 'Farbe', Scene: 'Szene', Self: 'Eigen', Average: 'Durchschnitt', Indirect: 'Indirekt', Light: 'Licht', Local: 'Lokale', Lights: 'Lichter', Rim: 'Rand', Contact: 'Kontakt', Specular: 'Glanzlicht', Hair: 'Haare', Highlight: 'Highlight', Eye: 'Auge', Maps: 'Maps', Outlines: 'Konturen', Glitter: 'Glitzer', Sticker: 'Sticker', Perspective: 'Perspektive', Removal: 'Korrektur', Fur: 'Fell', Custom: 'Benutzerdefiniert', Saturation: 'Sättigung', Mode: 'Modus', Cutout: 'Ausschnitt', Cutoff: 'Grenzwert', Dither: 'Dithering', Opacity: 'Deckkraft', Enabled: 'Aktiviert', Expression: 'Ausdruck', Token: 'Token', Order: 'Reihenfolge', Map: 'Map', Transparent: 'Transparent', Overlay: 'Überlagerung', Depth: 'Tiefe', Write: 'Schreiben', Preserve: 'Beibehalten', Source: 'Quelle', Compatibility: 'Kompatibilität', Only: 'Nur', White: 'Weiß', Default: 'Standard', Strength: 'Stärke', Intensity: 'Intensität', Power: 'Stärke', Range: 'Bereich', Minimum: 'Minimum', Direct: 'Direkt', Brightness: 'Helligkeit', Tint: 'Farbton', Mid: 'Mittel', Point: 'Punkt', Softness: 'Weichheit', Width: 'Breite', Area: 'Bereich', Value: 'Wert', Boost: 'Verstärkung', Offset: 'Versatz', Normal: 'Normale', Direction: 'Richtung', Show: 'Anzeigen', Channel: 'Kanal', Off: 'Aus', Red: 'Rot', Green: 'Grün', Blue: 'Blau', Additive: 'Additiv', Multiply: 'Multiplizieren', Blend: 'Mischen', Head: 'Kopf', Bone: 'Knochen', Tracked: 'Verfolgt', Static: 'Statisch', Proxy: 'Proxy', Fresnel: 'Fresnel', Classic: 'Klassisch', Character: 'Figur', Pass: 'Pass', View: 'Ansicht', Stable: 'Stabil', Strand: 'Strähne', U: 'U', Horizontal: 'Horizontal', V: 'V', Vertical: 'Vertikal', Preset: 'Voreinstellung',
  },
  pt: {
    Base: 'Base', Texture: 'Textura', Material: 'Material', Roles: 'Funções', Alpha: 'Alfa', Skin: 'Pele', Tone: 'Tom', Face: 'Rosto', Lighting: 'Iluminação', Cel: 'Cel', Shade: 'Sombreamento', Shadow: 'Sombra', Color: 'Cor', Scene: 'Cena', Self: 'Própria', Average: 'Média', Indirect: 'Indireta', Light: 'Luz', Local: 'Locais', Lights: 'Luzes', Rim: 'Contorno', Contact: 'Contacto', Specular: 'Especular', Hair: 'Cabelo', Highlight: 'Realce', Eye: 'Olho', Maps: 'Mapas', Outlines: 'Contornos', Glitter: 'Brilho', Sticker: 'Autocolante', Perspective: 'Perspetiva', Removal: 'Correção', Fur: 'Pelo', Custom: 'Personalizado', Saturation: 'Saturação', Mode: 'Modo', Cutout: 'Recorte', Cutoff: 'Limite', Dither: 'Dithering', Opacity: 'Opacidade', Enabled: 'Ativado', Expression: 'Expressão', Token: 'Token', Order: 'Ordem', Map: 'Mapa', Transparent: 'Transparente', Overlay: 'Sobreposição', Depth: 'Profundidade', Write: 'Escrita', Preserve: 'Preservar', Source: 'Origem', Compatibility: 'Compatibilidade', Only: 'Apenas', White: 'Branco', Default: 'Predefinição', Strength: 'Intensidade', Intensity: 'Intensidade', Power: 'Potência', Range: 'Intervalo', Minimum: 'Mínimo', Direct: 'Direta', Brightness: 'Brilho', Tint: 'Tonalidade', Mid: 'Meio', Point: 'Ponto', Softness: 'Suavidade', Width: 'Largura', Area: 'Área', Value: 'Valor', Boost: 'Reforço', Offset: 'Deslocamento', Normal: 'Normal', Direction: 'Direção', Show: 'Mostrar', Channel: 'Canal', Off: 'Desligado', Red: 'Vermelho', Green: 'Verde', Blue: 'Azul', Additive: 'Aditivo', Multiply: 'Multiplicar', Blend: 'Mistura', Head: 'Cabeça', Bone: 'Osso', Tracked: 'Rastreado', Static: 'Estático', Proxy: 'Proxy', Fresnel: 'Fresnel', Classic: 'Clássico', Character: 'Personagem', Pass: 'Passagem', View: 'Vista', Stable: 'Estável', Strand: 'Mecha', U: 'U', Horizontal: 'Horizontal', V: 'V', Vertical: 'Vertical', Preset: 'Predefinição',
  },
  'pt-BR': {
    Base: 'Base', Texture: 'Textura', Material: 'Material', Roles: 'Funções', Alpha: 'Alfa', Skin: 'Pele', Tone: 'Tom', Face: 'Rosto', Lighting: 'Iluminação', Cel: 'Cel', Shade: 'Sombreamento', Shadow: 'Sombra', Color: 'Cor', Scene: 'Cena', Self: 'Própria', Average: 'Média', Indirect: 'Indireta', Light: 'Luz', Local: 'Locais', Lights: 'Luzes', Rim: 'Contorno', Contact: 'Contato', Specular: 'Especular', Hair: 'Cabelo', Highlight: 'Realce', Eye: 'Olho', Maps: 'Mapas', Outlines: 'Contornos', Glitter: 'Brilho', Sticker: 'Adesivo', Perspective: 'Perspectiva', Removal: 'Correção', Fur: 'Pelo', Custom: 'Personalizado', Saturation: 'Saturação', Mode: 'Modo', Cutout: 'Recorte', Cutoff: 'Limite', Dither: 'Dithering', Opacity: 'Opacidade', Enabled: 'Ativado', Expression: 'Expressão', Token: 'Token', Order: 'Ordem', Map: 'Mapa', Transparent: 'Transparente', Overlay: 'Sobreposição', Depth: 'Profundidade', Write: 'Escrita', Preserve: 'Preservar', Source: 'Origem', Compatibility: 'Compatibilidade', Only: 'Apenas', White: 'Branco', Default: 'Padrão', Strength: 'Intensidade', Intensity: 'Intensidade', Power: 'Potência', Range: 'Intervalo', Minimum: 'Mínimo', Direct: 'Direta', Brightness: 'Brilho', Tint: 'Tonalidade', Mid: 'Meio', Point: 'Ponto', Softness: 'Suavidade', Width: 'Largura', Area: 'Área', Value: 'Valor', Boost: 'Reforço', Offset: 'Deslocamento', Normal: 'Normal', Direction: 'Direção', Show: 'Mostrar', Channel: 'Canal', Off: 'Desligado', Red: 'Vermelho', Green: 'Verde', Blue: 'Azul', Additive: 'Aditivo', Multiply: 'Multiplicar', Blend: 'Mesclar', Head: 'Cabeça', Bone: 'Osso', Tracked: 'Rastreado', Static: 'Estático', Proxy: 'Proxy', Fresnel: 'Fresnel', Classic: 'Clássico', Character: 'Personagem', Pass: 'Passe', View: 'Visão', Stable: 'Estável', Strand: 'Mecha', U: 'U', Horizontal: 'Horizontal', V: 'V', Vertical: 'Vertical', Preset: 'Predefinição',
  },
  it: {
    Base: 'Base', Texture: 'Texture', Material: 'Materiale', Roles: 'Ruoli', Alpha: 'Alfa', Skin: 'Pelle', Tone: 'Tono', Face: 'Viso', Lighting: 'Illuminazione', Cel: 'Cel', Shade: 'Ombreggiatura', Shadow: 'Ombra', Color: 'Colore', Scene: 'Scena', Self: 'Auto', Average: 'Media', Indirect: 'Indiretta', Light: 'Luce', Local: 'Locali', Lights: 'Luci', Rim: 'Bordo', Contact: 'Contatto', Specular: 'Speculare', Hair: 'Capelli', Highlight: 'Riflesso', Eye: 'Occhio', Maps: 'Mappe', Outlines: 'Contorni', Glitter: 'Brillantezza', Sticker: 'Adesivo', Perspective: 'Prospettiva', Removal: 'Correzione', Fur: 'Pelliccia', Custom: 'Personalizzato', Saturation: 'Saturazione', Mode: 'Modalità', Cutout: 'Ritaglio', Cutoff: 'Soglia', Dither: 'Dithering', Opacity: 'Opacità', Enabled: 'Attivo', Expression: 'Espressione', Token: 'Token', Order: 'Ordine', Map: 'Mappa', Transparent: 'Trasparente', Overlay: 'Sovrapposizione', Depth: 'Profondità', Write: 'Scrittura', Preserve: 'Mantieni', Source: 'Sorgente', Compatibility: 'Compatibilità', Only: 'Solo', White: 'Bianco', Default: 'Predefinito', Strength: 'Intensità', Intensity: 'Intensità', Power: 'Potenza', Range: 'Intervallo', Minimum: 'Minimo', Direct: 'Diretta', Brightness: 'Luminosità', Tint: 'Tinta', Mid: 'Medio', Point: 'Punto', Softness: 'Morbidezza', Width: 'Larghezza', Area: 'Area', Value: 'Valore', Boost: 'Incremento', Offset: 'Offset', Normal: 'Normale', Direction: 'Direzione', Show: 'Mostra', Channel: 'Canale', Off: 'Disattivo', Red: 'Rosso', Green: 'Verde', Blue: 'Blu', Additive: 'Additivo', Multiply: 'Moltiplica', Blend: 'Fusione', Head: 'Testa', Bone: 'Osso', Tracked: 'Tracciato', Static: 'Statico', Proxy: 'Proxy', Fresnel: 'Fresnel', Classic: 'Classico', Character: 'Personaggio', Pass: 'Passaggio', View: 'Vista', Stable: 'Stabile', Strand: 'Ciocca', U: 'U', Horizontal: 'Orizzontale', V: 'V', Vertical: 'Verticale', Preset: 'Preimpostazione',
  },
  ru: {
    Base: 'Основа', Texture: 'Текстура', Material: 'Материал', Roles: 'Роли', Alpha: 'Альфа', Skin: 'Кожа', Tone: 'Тон', Face: 'Лицо', Lighting: 'Освещение', Cel: 'Цел-шейдинг', Shade: 'Шейдинг', Shadow: 'Тень', Color: 'Цвет', Scene: 'Сцена', Self: 'Собственная', Average: 'Средняя', Indirect: 'Непрямой', Light: 'Свет', Local: 'Локальные', Lights: 'Источники света', Rim: 'Контур', Contact: 'Контактная', Specular: 'Блик', Hair: 'Волосы', Highlight: 'Подсветка', Eye: 'Глаз', Maps: 'Карты', Outlines: 'Контуры', Glitter: 'Блеск', Sticker: 'Стикер', Perspective: 'Перспектива', Removal: 'Коррекция', Fur: 'Мех', Custom: 'Пользовательская', Saturation: 'Насыщенность', Mode: 'Режим', Cutout: 'Вырезание', Cutoff: 'Порог', Dither: 'Дизеринг', Opacity: 'Непрозрачность', Enabled: 'Включено', Expression: 'Выражение', Token: 'Токен', Order: 'Порядок', Map: 'Карта', Transparent: 'Прозрачный', Overlay: 'Наложение', Depth: 'Глубина', Write: 'Запись', Preserve: 'Сохранять', Source: 'Источник', Compatibility: 'Совместимость', Only: 'Только', White: 'Белый', Default: 'По умолчанию', Strength: 'Сила', Intensity: 'Интенсивность', Power: 'Мощность', Range: 'Диапазон', Minimum: 'Минимум', Direct: 'Прямой', Brightness: 'Яркость', Tint: 'Оттенок', Mid: 'Средний', Point: 'Точка', Softness: 'Мягкость', Width: 'Ширина', Area: 'Область', Value: 'Значение', Boost: 'Усиление', Offset: 'Смещение', Normal: 'Нормаль', Direction: 'Направление', Show: 'Показывать', Channel: 'Канал', Off: 'Выкл.', Red: 'Красный', Green: 'Зелёный', Blue: 'Синий', Additive: 'Сложение', Multiply: 'Умножение', Blend: 'Смешивание', Head: 'Голова', Bone: 'Кость', Tracked: 'Отслеживаемый', Static: 'Статический', Proxy: 'Прокси', Fresnel: 'Френель', Classic: 'Классический', Character: 'Персонаж', Pass: 'Проход', View: 'Вид', Stable: 'Стабильный', Strand: 'Прядь', U: 'U', Horizontal: 'Горизонталь', V: 'V', Vertical: 'Вертикаль', Preset: 'Пресет',
  },
  id: {
    Base: 'Dasar', Texture: 'Tekstur', Material: 'Material', Roles: 'Peran', Alpha: 'Alfa', Skin: 'Kulit', Tone: 'Nada', Face: 'Wajah', Lighting: 'Pencahayaan', Cel: 'Cel', Shade: 'Bayangan', Shadow: 'Bayangan', Color: 'Warna', Scene: 'Adegan', Self: 'Diri', Average: 'Rata-rata', Indirect: 'Tidak langsung', Light: 'Cahaya', Local: 'Lokal', Lights: 'Lampu', Rim: 'Tepi', Contact: 'Kontak', Specular: 'Spekular', Hair: 'Rambut', Highlight: 'Sorotan', Eye: 'Mata', Maps: 'Peta', Outlines: 'Garis luar', Glitter: 'Kilau', Sticker: 'Stiker', Perspective: 'Perspektif', Removal: 'Koreksi', Fur: 'Bulu', Custom: 'Kustom', Saturation: 'Saturasi', Mode: 'Mode', Cutout: 'Potongan', Cutoff: 'Ambang', Dither: 'Dither', Opacity: 'Opasitas', Enabled: 'Aktif', Expression: 'Ekspresi', Token: 'Token', Order: 'Urutan', Map: 'Peta', Transparent: 'Transparan', Overlay: 'Hamparan', Depth: 'Kedalaman', Write: 'Tulis', Preserve: 'Pertahankan', Source: 'Sumber', Compatibility: 'Kompatibilitas', Only: 'Hanya', White: 'Putih', Default: 'Bawaan', Strength: 'Kekuatan', Intensity: 'Intensitas', Power: 'Daya', Range: 'Rentang', Minimum: 'Minimum', Direct: 'Langsung', Brightness: 'Kecerahan', Tint: 'Rona', Mid: 'Tengah', Point: 'Titik', Softness: 'Kelembutan', Width: 'Lebar', Area: 'Area', Value: 'Nilai', Boost: 'Penguatan', Offset: 'Offset', Normal: 'Normal', Direction: 'Arah', Show: 'Tampilkan', Channel: 'Saluran', Off: 'Mati', Red: 'Merah', Green: 'Hijau', Blue: 'Biru', Additive: 'Tambah', Multiply: 'Kalikan', Blend: 'Campur', Head: 'Kepala', Bone: 'Tulang', Tracked: 'Dilacak', Static: 'Statis', Proxy: 'Proksi', Fresnel: 'Fresnel', Classic: 'Klasik', Character: 'Karakter', Pass: 'Lintasan', View: 'Tampilan', Stable: 'Stabil', Strand: 'Untaian', U: 'U', Horizontal: 'Horizontal', V: 'V', Vertical: 'Vertikal', Preset: 'Prasetel',
  },
  vi: {
    Base: 'Cơ bản', Texture: 'Kết cấu', Material: 'Vật liệu', Roles: 'Vai trò', Alpha: 'Alpha', Skin: 'Da', Tone: 'Tông', Face: 'Khuôn mặt', Lighting: 'Ánh sáng', Cel: 'Cel', Shade: 'Đổ bóng', Shadow: 'Bóng', Color: 'Màu', Scene: 'Cảnh', Self: 'Tự thân', Average: 'Trung bình', Indirect: 'Gián tiếp', Light: 'Ánh sáng', Local: 'Cục bộ', Lights: 'Đèn', Rim: 'Viền', Contact: 'Tiếp xúc', Specular: 'Phản chiếu', Hair: 'Tóc', Highlight: 'Điểm sáng', Eye: 'Mắt', Maps: 'Bản đồ', Outlines: 'Đường viền', Glitter: 'Lấp lánh', Sticker: 'Nhãn dán', Perspective: 'Phối cảnh', Removal: 'Hiệu chỉnh', Fur: 'Lông', Custom: 'Tùy chỉnh', Saturation: 'Độ bão hòa', Mode: 'Chế độ', Cutout: 'Cắt', Cutoff: 'Ngưỡng', Dither: 'Dither', Opacity: 'Độ mờ', Enabled: 'Bật', Expression: 'Biểu cảm', Token: 'Mã', Order: 'Thứ tự', Map: 'Bản đồ', Transparent: 'Trong suốt', Overlay: 'Lớp phủ', Depth: 'Độ sâu', Write: 'Ghi', Preserve: 'Giữ lại', Source: 'Nguồn', Compatibility: 'Tương thích', Only: 'Chỉ', White: 'Trắng', Default: 'Mặc định', Strength: 'Cường độ', Intensity: 'Cường độ', Power: 'Công suất', Range: 'Phạm vi', Minimum: 'Tối thiểu', Direct: 'Trực tiếp', Brightness: 'Độ sáng', Tint: 'Sắc độ', Mid: 'Giữa', Point: 'Điểm', Softness: 'Độ mềm', Width: 'Chiều rộng', Area: 'Vùng', Value: 'Giá trị', Boost: 'Tăng cường', Offset: 'Độ lệch', Normal: 'Pháp tuyến', Direction: 'Hướng', Show: 'Hiện', Channel: 'Kênh', Off: 'Tắt', Red: 'Đỏ', Green: 'Xanh lá', Blue: 'Xanh dương', Additive: 'Cộng', Multiply: 'Nhân', Blend: 'Trộn', Head: 'Đầu', Bone: 'Xương', Tracked: 'Theo dõi', Static: 'Tĩnh', Proxy: 'Đại diện', Fresnel: 'Fresnel', Classic: 'Cổ điển', Character: 'Nhân vật', Pass: 'Lượt', View: 'Chế độ xem', Stable: 'Ổn định', Strand: 'Sợi', U: 'U', Horizontal: 'Ngang', V: 'V', Vertical: 'Dọc', Preset: 'Cài đặt sẵn',
  },
  th: {
    Base: 'พื้นฐาน', Texture: 'พื้นผิว', Material: 'วัสดุ', Roles: 'บทบาท', Alpha: 'อัลฟา', Skin: 'ผิว', Tone: 'โทน', Face: 'ใบหน้า', Lighting: 'แสง', Cel: 'เซล', Shade: 'การแรเงา', Shadow: 'เงา', Color: 'สี', Scene: 'ฉาก', Self: 'ตัวเอง', Average: 'ค่าเฉลี่ย', Indirect: 'ทางอ้อม', Light: 'แสง', Local: 'เฉพาะที่', Lights: 'ไฟ', Rim: 'ขอบ', Contact: 'สัมผัส', Specular: 'สเปกคิวลาร์', Hair: 'ผม', Highlight: 'ไฮไลต์', Eye: 'ตา', Maps: 'แผนที่', Outlines: 'เส้นขอบ', Glitter: 'ประกาย', Sticker: 'สติกเกอร์', Perspective: 'มุมมอง', Removal: 'แก้ไข', Fur: 'ขน', Custom: 'กำหนดเอง', Saturation: 'ความอิ่มตัว', Mode: 'โหมด', Cutout: 'ตัดออก', Cutoff: 'ขีดจำกัด', Dither: 'ดิเทอร์', Opacity: 'ความทึบ', Enabled: 'เปิดใช้', Expression: 'สีหน้า', Token: 'โทเคน', Order: 'ลำดับ', Map: 'แผนที่', Transparent: 'โปร่งใส', Overlay: 'ซ้อนทับ', Depth: 'ความลึก', Write: 'เขียน', Preserve: 'คงไว้', Source: 'แหล่งที่มา', Compatibility: 'ความเข้ากันได้', Only: 'เท่านั้น', White: 'ขาว', Default: 'ค่าเริ่มต้น', Strength: 'ความแรง', Intensity: 'ความเข้ม', Power: 'กำลัง', Range: 'ช่วง', Minimum: 'ขั้นต่ำ', Direct: 'โดยตรง', Brightness: 'ความสว่าง', Tint: 'สีอ่อน', Mid: 'กลาง', Point: 'จุด', Softness: 'ความนุ่ม', Width: 'ความกว้าง', Area: 'พื้นที่', Value: 'ค่า', Boost: 'เพิ่ม', Offset: 'ออฟเซ็ต', Normal: '法線', Direction: 'ทิศทาง', Show: 'แสดง', Channel: 'ช่อง', Off: 'ปิด', Red: 'แดง', Green: 'เขียว', Blue: 'น้ำเงิน', Additive: 'บวก', Multiply: 'คูณ', Blend: 'ผสม', Head: 'ศีรษะ', Bone: 'กระดูก', Tracked: 'ติดตาม', Static: 'คงที่', Proxy: 'พร็อกซี', Fresnel: 'เฟรเนล', Classic: 'คลาสสิก', Character: 'ตัวละคร', Pass: 'พาส', View: 'มุมมอง', Stable: 'เสถียร', Strand: 'เส้นผม', U: 'U', Horizontal: 'แนวนอน', V: 'V', Vertical: 'แนวตั้ง', Preset: 'พรีเซ็ต',
  },
  tr: {
    Base: 'Temel', Texture: 'Doku', Material: 'Malzeme', Roles: 'Roller', Alpha: 'Alfa', Skin: 'Cilt', Tone: 'Ton', Face: 'Yüz', Lighting: 'Aydınlatma', Cel: 'Cel', Shade: 'Gölgelendirme', Shadow: 'Gölge', Color: 'Renk', Scene: 'Sahne', Self: 'Kendi', Average: 'Ortalama', Indirect: 'Dolaylı', Light: 'Işık', Local: 'Yerel', Lights: 'Işıklar', Rim: 'Kenar', Contact: 'Temas', Specular: 'Speküler', Hair: 'Saç', Highlight: 'Vurgu', Eye: 'Göz', Maps: 'Haritalar', Outlines: 'Konturlar', Glitter: 'Parıltı', Sticker: 'Çıkartma', Perspective: 'Perspektif', Removal: 'Düzeltme', Fur: 'Kürk', Custom: 'Özel', Saturation: 'Doygunluk', Mode: 'Mod', Cutout: 'Kesme', Cutoff: 'Eşik', Dither: 'Dithering', Opacity: 'Opaklık', Enabled: 'Etkin', Expression: 'İfade', Token: 'Belirteç', Order: 'Sıra', Map: 'Harita', Transparent: 'Şeffaf', Overlay: 'Kaplama', Depth: 'Derinlik', Write: 'Yazma', Preserve: 'Koru', Source: 'Kaynak', Compatibility: 'Uyumluluk', Only: 'Yalnızca', White: 'Beyaz', Default: 'Varsayılan', Strength: 'Güç', Intensity: 'Yoğunluk', Power: 'Güç', Range: 'Aralık', Minimum: 'Minimum', Direct: 'Doğrudan', Brightness: 'Parlaklık', Tint: 'Ton', Mid: 'Orta', Point: 'Nokta', Softness: 'Yumuşaklık', Width: 'Genişlik', Area: 'Alan', Value: 'Değer', Boost: 'Güçlendirme', Offset: 'Ofset', Normal: 'Normal', Direction: 'Yön', Show: 'Göster', Channel: 'Kanal', Off: 'Kapalı', Red: 'Kırmızı', Green: 'Yeşil', Blue: 'Mavi', Additive: 'Toplamalı', Multiply: 'Çarpma', Blend: 'Karışım', Head: 'Baş', Bone: 'Kemik', Tracked: 'İzlenen', Static: 'Sabit', Proxy: 'Vekil', Fresnel: 'Fresnel', Classic: 'Klasik', Character: 'Karakter', Pass: 'Geçiş', View: 'Görünüm', Stable: 'Kararlı', Strand: 'Tel', U: 'U', Horizontal: 'Yatay', V: 'V', Vertical: 'Dikey', Preset: 'Ön ayar',
  },
  hi: {
    Base: 'आधार', Texture: 'टेक्सचर', Material: 'मटेरियल', Roles: 'भूमिकाएँ', Alpha: 'अल्फ़ा', Skin: 'त्वचा', Tone: 'टोन', Face: 'चेहरा', Lighting: 'प्रकाश', Cel: 'सेल', Shade: 'शेडिंग', Shadow: 'छाया', Color: 'रंग', Scene: 'दृश्य', Self: 'स्वयं', Average: 'औसत', Indirect: 'अप्रत्यक्ष', Light: 'प्रकाश', Local: 'स्थानीय', Lights: 'लाइटें', Rim: 'किनारा', Contact: 'संपर्क', Specular: 'स्पेक्युलर', Hair: 'बाल', Highlight: 'हाइलाइट', Eye: 'आँख', Maps: 'मैप', Outlines: 'रूपरेखा', Glitter: 'चमक', Sticker: 'स्टिकर', Perspective: 'परिप्रेक्ष्य', Removal: 'सुधार', Fur: 'फर', Custom: 'कस्टम', Saturation: 'संतृप्ति', Mode: 'मोड', Cutout: 'कटआउट', Cutoff: 'सीमा', Dither: 'डिथर', Opacity: 'अपारदर्शिता', Enabled: 'सक्षम', Expression: 'अभिव्यक्ति', Token: 'टोकन', Order: 'क्रम', Map: 'मैप', Transparent: 'पारदर्शी', Overlay: 'ओवरले', Depth: 'गहराई', Write: 'लेखन', Preserve: 'सुरक्षित रखें', Source: 'स्रोत', Compatibility: 'संगतता', Only: 'केवल', White: 'सफ़ेद', Default: 'डिफ़ॉल्ट', Strength: 'शक्ति', Intensity: 'तीव्रता', Power: 'पावर', Range: 'सीमा', Minimum: 'न्यूनतम', Direct: 'प्रत्यक्ष', Brightness: 'चमक', Tint: 'टिंट', Mid: 'मध्य', Point: 'बिंदु', Softness: 'कोमलता', Width: 'चौड़ाई', Area: 'क्षेत्र', Value: 'मान', Boost: 'बूस्ट', Offset: 'ऑफ़सेट', Normal: 'नॉर्मल', Direction: 'दिशा', Show: 'दिखाएँ', Channel: 'चैनल', Off: 'बंद', Red: 'लाल', Green: 'हरा', Blue: 'नीला', Additive: 'जोड़ना', Multiply: 'गुणा', Blend: 'मिश्रण', Head: 'सिर', Bone: 'हड्डी', Tracked: 'ट्रैक किया गया', Static: 'स्थिर', Proxy: 'प्रॉक्सी', Fresnel: 'फ्रेनल', Classic: 'क्लासिक', Character: 'चरित्र', Pass: 'पास', View: 'दृश्य', Stable: 'स्थिर', Strand: 'लट', U: 'U', Horizontal: 'क्षैतिज', V: 'V', Vertical: 'ऊर्ध्वाधर', Preset: 'प्रीसेट',
  },
  ar: {
    Base: 'أساسي', Texture: 'نسيج', Material: 'مادة', Roles: 'أدوار', Alpha: 'ألفا', Skin: 'بشرة', Tone: 'درجة', Face: 'وجه', Lighting: 'إضاءة', Cel: 'سيل', Shade: 'تظليل', Shadow: 'ظل', Color: 'لون', Scene: 'مشهد', Self: 'ذاتي', Average: 'متوسط', Indirect: 'غير مباشر', Light: 'ضوء', Local: 'محلي', Lights: 'أضواء', Rim: 'حافة', Contact: 'تماس', Specular: 'لامع', Hair: 'شعر', Highlight: 'إبراز', Eye: 'عين', Maps: 'خرائط', Outlines: 'مخططات', Glitter: 'بريق', Sticker: 'ملصق', Perspective: 'منظور', Removal: 'تصحيح', Fur: 'فراء', Custom: 'مخصص', Saturation: 'تشبع', Mode: 'وضع', Cutout: 'اقتطاع', Cutoff: 'حد', Dither: 'تردد', Opacity: 'شفافية', Enabled: 'مفعّل', Expression: 'تعبير', Token: 'رمز', Order: 'ترتيب', Map: 'خريطة', Transparent: 'شفاف', Overlay: 'تراكب', Depth: 'عمق', Write: 'كتابة', Preserve: 'حفظ', Source: 'مصدر', Compatibility: 'توافق', Only: 'فقط', White: 'أبيض', Default: 'افتراضي', Strength: 'قوة', Intensity: 'شدة', Power: 'قدرة', Range: 'نطاق', Minimum: 'الحد الأدنى', Direct: 'مباشر', Brightness: 'سطوع', Tint: 'صبغة', Mid: 'متوسط', Point: 'نقطة', Softness: 'نعومة', Width: 'عرض', Area: 'منطقة', Value: 'قيمة', Boost: 'تعزيز', Offset: 'إزاحة', Normal: 'عمودي', Direction: 'اتجاه', Show: 'إظهار', Channel: 'قناة', Off: 'إيقاف', Red: 'أحمر', Green: 'أخضر', Blue: 'أزرق', Additive: 'جمعي', Multiply: 'ضرب', Blend: 'مزج', Head: 'رأس', Bone: 'عظم', Tracked: 'متتبع', Static: 'ثابت', Proxy: 'وكيل', Fresnel: 'فرينل', Classic: 'كلاسيكي', Character: 'شخصية', Pass: 'تمرير', View: 'عرض', Stable: 'مستقر', Strand: 'خصلة', U: 'U', Horizontal: 'أفقي', V: 'V', Vertical: 'عمودي', Preset: 'إعداد مسبق',
  },
  bn: {
    Base: 'ভিত্তি', Texture: 'টেক্সচার', Material: 'ম্যাটেরিয়াল', Roles: 'ভূমিকা', Alpha: 'আলফা', Skin: 'ত্বক', Tone: 'টোন', Face: 'মুখ', Lighting: 'আলো', Cel: 'সেল', Shade: 'শেডিং', Shadow: 'ছায়া', Color: 'রং', Scene: 'দৃশ্য', Self: 'নিজস্ব', Average: 'গড়', Indirect: 'পরোক্ষ', Light: 'আলো', Local: 'স্থানীয়', Lights: 'লাইট', Rim: 'প্রান্ত', Contact: 'স্পর্শ', Specular: 'স্পেকুলার', Hair: 'চুল', Highlight: 'হাইলাইট', Eye: 'চোখ', Maps: 'ম্যাপ', Outlines: 'আউটলাইন', Glitter: 'ঝিলিক', Sticker: 'স্টিকার', Perspective: 'দৃষ্টিকোণ', Removal: 'সংশোধন', Fur: 'লোম', Custom: 'কাস্টম', Saturation: 'স্যাচুরেশন', Mode: 'মোড', Cutout: 'কাটআউট', Cutoff: 'সীমা', Dither: 'ডিথার', Opacity: 'অস্বচ্ছতা', Enabled: 'সক্রিয়', Expression: 'অভিব্যক্তি', Token: 'টোকেন', Order: 'ক্রম', Map: 'ম্যাপ', Transparent: 'স্বচ্ছ', Overlay: 'ওভারলে', Depth: 'গভীরতা', Write: 'লেখা', Preserve: 'রাখুন', Source: 'উৎস', Compatibility: 'সামঞ্জস্য', Only: 'শুধু', White: 'সাদা', Default: 'ডিফল্ট', Strength: 'শক্তি', Intensity: 'তীব্রতা', Power: 'পাওয়ার', Range: 'পরিসর', Minimum: 'সর্বনিম্ন', Direct: 'সরাসরি', Brightness: 'উজ্জ্বলতা', Tint: 'টিন্ট', Mid: 'মাঝ', Point: 'বিন্দু', Softness: 'নরমতা', Width: 'প্রস্থ', Area: 'এলাকা', Value: 'মান', Boost: 'বুস্ট', Offset: 'অফসেট', Normal: 'নর্মাল', Direction: 'দিক', Show: 'দেখান', Channel: 'চ্যানেল', Off: 'বন্ধ', Red: 'লাল', Green: 'সবুজ', Blue: 'নীল', Additive: 'যোগ', Multiply: 'গুণ', Blend: 'মিশ্রণ', Head: 'মাথা', Bone: 'হাড়', Tracked: 'ট্র্যাক করা', Static: 'স্থির', Proxy: 'প্রক্সি', Fresnel: 'ফ্রেনেল', Classic: 'ক্লাসিক', Character: 'চরিত্র', Pass: 'পাস', View: 'ভিউ', Stable: 'স্থিতিশীল', Strand: 'গুচ্ছ', U: 'U', Horizontal: 'অনুভূমিক', V: 'V', Vertical: 'উল্লম্ব', Preset: 'প্রিসেট',
  },
  ms: {
    Base: 'Asas', Texture: 'Tekstur', Material: 'Bahan', Roles: 'Peranan', Alpha: 'Alfa', Skin: 'Kulit', Tone: 'Nada', Face: 'Wajah', Lighting: 'Pencahayaan', Cel: 'Cel', Shade: 'Lorekan', Shadow: 'Bayang', Color: 'Warna', Scene: 'Adegan', Self: 'Sendiri', Average: 'Purata', Indirect: 'Tidak langsung', Light: 'Cahaya', Local: 'Setempat', Lights: 'Lampu', Rim: 'Tepi', Contact: 'Sentuhan', Specular: 'Spekular', Hair: 'Rambut', Highlight: 'Sorotan', Eye: 'Mata', Maps: 'Peta', Outlines: 'Garis luar', Glitter: 'Kilauan', Sticker: 'Pelekat', Perspective: 'Perspektif', Removal: 'Pembetulan', Fur: 'Bulu', Custom: 'Tersuai', Saturation: 'Ketepuan', Mode: 'Mod', Cutout: 'Potongan', Cutoff: 'Ambang', Dither: 'Dither', Opacity: 'Kelegapan', Enabled: 'Didayakan', Expression: 'Ekspresi', Token: 'Token', Order: 'Susunan', Map: 'Peta', Transparent: 'Lutsinar', Overlay: 'Tindanan', Depth: 'Kedalaman', Write: 'Tulis', Preserve: 'Kekalkan', Source: 'Sumber', Compatibility: 'Keserasian', Only: 'Sahaja', White: 'Putih', Default: 'Lalai', Strength: 'Kekuatan', Intensity: 'Keamatan', Power: 'Kuasa', Range: 'Julat', Minimum: 'Minimum', Direct: 'Langsung', Brightness: 'Kecerahan', Tint: 'Warna', Mid: 'Tengah', Point: 'Titik', Softness: 'Kelembutan', Width: 'Lebar', Area: 'Kawasan', Value: 'Nilai', Boost: 'Rangsangan', Offset: 'Ofset', Normal: 'Normal', Direction: 'Arah', Show: 'Tunjukkan', Channel: 'Saluran', Off: 'Mati', Red: 'Merah', Green: 'Hijau', Blue: 'Biru', Additive: 'Tambahan', Multiply: 'Darab', Blend: 'Campuran', Head: 'Kepala', Bone: 'Tulang', Tracked: 'Dijejak', Static: 'Statik', Proxy: 'Proksi', Fresnel: 'Fresnel', Classic: 'Klasik', Character: 'Watak', Pass: 'Laluan', View: 'Paparan', Stable: 'Stabil', Strand: 'Jalur', U: 'U', Horizontal: 'Mendatar', V: 'V', Vertical: 'Menegak', Preset: 'Pratetap',
  },
  nl: {
    Base: 'Basis', Texture: 'Textuur', Material: 'Materiaal', Roles: 'Rollen', Alpha: 'Alfa', Skin: 'Huid', Tone: 'Tint', Face: 'Gezicht', Lighting: 'Belichting', Cel: 'Cel', Shade: 'Schaduw', Shadow: 'Schaduw', Color: 'Kleur', Scene: 'Scène', Self: 'Zelf', Average: 'Gemiddeld', Indirect: 'Indirect', Light: 'Licht', Local: 'Lokale', Lights: 'Lichten', Rim: 'Rand', Contact: 'Contact', Specular: 'Speculair', Hair: 'Haar', Highlight: 'Highlight', Eye: 'Oog', Maps: 'Kaarten', Outlines: 'Omtrekken', Glitter: 'Glans', Sticker: 'Sticker', Perspective: 'Perspectief', Removal: 'Correctie', Fur: 'Vacht', Custom: 'Aangepast', Saturation: 'Verzadiging', Mode: 'Modus', Cutout: 'Uitsnede', Cutoff: 'Drempel', Dither: 'Dithering', Opacity: 'Dekking', Enabled: 'Ingeschakeld', Expression: 'Expressie', Token: 'Token', Order: 'Volgorde', Map: 'Kaart', Transparent: 'Transparant', Overlay: 'Overlay', Depth: 'Diepte', Write: 'Schrijven', Preserve: 'Behouden', Source: 'Bron', Compatibility: 'Compatibiliteit', Only: 'Alleen', White: 'Wit', Default: 'Standaard', Strength: 'Sterkte', Intensity: 'Intensiteit', Power: 'Kracht', Range: 'Bereik', Minimum: 'Minimum', Direct: 'Direct', Brightness: 'Helderheid', Tint: 'Tint', Mid: 'Midden', Point: 'Punt', Softness: 'Zachtheid', Width: 'Breedte', Area: 'Gebied', Value: 'Waarde', Boost: 'Boost', Offset: 'Verschuiving', Normal: 'Normaal', Direction: 'Richting', Show: 'Tonen', Channel: 'Kanaal', Off: 'Uit', Red: 'Rood', Green: 'Groen', Blue: 'Blauw', Additive: 'Optellen', Multiply: 'Vermenigvuldigen', Blend: 'Mengen', Head: 'Hoofd', Bone: 'Bot', Tracked: 'Gevolgd', Static: 'Statisch', Proxy: 'Proxy', Fresnel: 'Fresnel', Classic: 'Klassiek', Character: 'Personage', Pass: 'Pass', View: 'Weergave', Stable: 'Stabiel', Strand: 'Lok', U: 'U', Horizontal: 'Horizontaal', V: 'V', Vertical: 'Verticaal', Preset: 'Voorinstelling',
  },
  pl: {
    Base: 'Baza', Texture: 'Tekstura', Material: 'Materiał', Roles: 'Role', Alpha: 'Alfa', Skin: 'Skóra', Tone: 'Ton', Face: 'Twarz', Lighting: 'Oświetlenie', Cel: 'Cel', Shade: 'Cieniowanie', Shadow: 'Cień', Color: 'Kolor', Scene: 'Scena', Self: 'Własny', Average: 'Średni', Indirect: 'Pośrednie', Light: 'Światło', Local: 'Lokalne', Lights: 'Światła', Rim: 'Krawędź', Contact: 'Kontakt', Specular: 'Lustrzany', Hair: 'Włosy', Highlight: 'Podświetlenie', Eye: 'Oko', Maps: 'Mapy', Outlines: 'Kontury', Glitter: 'Blask', Sticker: 'Naklejka', Perspective: 'Perspektywa', Removal: 'Korekta', Fur: 'Futro', Custom: 'Niestandardowe', Saturation: 'Nasycenie', Mode: 'Tryb', Cutout: 'Wycięcie', Cutoff: 'Próg', Dither: 'Dithering', Opacity: 'Krycie', Enabled: 'Włączone', Expression: 'Wyraz', Token: 'Token', Order: 'Kolejność', Map: 'Mapa', Transparent: 'Przezroczysty', Overlay: 'Nakładka', Depth: 'Głębia', Write: 'Zapis', Preserve: 'Zachowaj', Source: 'Źródło', Compatibility: 'Zgodność', Only: 'Tylko', White: 'Biały', Default: 'Domyślne', Strength: 'Siła', Intensity: 'Intensywność', Power: 'Moc', Range: 'Zakres', Minimum: 'Minimum', Direct: 'Bezpośrednie', Brightness: 'Jasność', Tint: 'Odcień', Mid: 'Środek', Point: 'Punkt', Softness: 'Miękkość', Width: 'Szerokość', Area: 'Obszar', Value: 'Wartość', Boost: 'Wzmocnienie', Offset: 'Przesunięcie', Normal: 'Normalna', Direction: 'Kierunek', Show: 'Pokaż', Channel: 'Kanał', Off: 'Wyłączone', Red: 'Czerwony', Green: 'Zielony', Blue: 'Niebieski', Additive: 'Dodawanie', Multiply: 'Mnożenie', Blend: 'Mieszanie', Head: 'Głowa', Bone: 'Kość', Tracked: 'Śledzone', Static: 'Statyczne', Proxy: 'Proxy', Fresnel: 'Fresnel', Classic: 'Klasyczne', Character: 'Postać', Pass: 'Przejście', View: 'Widok', Stable: 'Stabilne', Strand: 'Pasmo', U: 'U', Horizontal: 'Poziomo', V: 'V', Vertical: 'Pionowo', Preset: 'Ustawienie wstępne',
  },
  sv: {
    Base: 'Bas', Texture: 'Textur', Material: 'Material', Roles: 'Roller', Alpha: 'Alfa', Skin: 'Hud', Tone: 'Ton', Face: 'Ansikte', Lighting: 'Belysning', Cel: 'Cel', Shade: 'Skuggning', Shadow: 'Skugga', Color: 'Färg', Scene: 'Scen', Self: 'Egen', Average: 'Genomsnitt', Indirect: 'Indirekt', Light: 'Ljus', Local: 'Lokala', Lights: 'Ljus', Rim: 'Kant', Contact: 'Kontakt', Specular: 'Spegel', Hair: 'Hår', Highlight: 'Högdagrar', Eye: 'Öga', Maps: 'Kartor', Outlines: 'Konturer', Glitter: 'Glitter', Sticker: 'Klistermärke', Perspective: 'Perspektiv', Removal: 'Korrigering', Fur: 'Päls', Custom: 'Anpassad', Saturation: 'Mättnad', Mode: 'Läge', Cutout: 'Urklipp', Cutoff: 'Tröskel', Dither: 'Dithering', Opacity: 'Opacitet', Enabled: 'Aktiverad', Expression: 'Uttryck', Token: 'Token', Order: 'Ordning', Map: 'Karta', Transparent: 'Genomskinlig', Overlay: 'Överlagring', Depth: 'Djup', Write: 'Skrivning', Preserve: 'Bevara', Source: 'Källa', Compatibility: 'Kompatibilitet', Only: 'Endast', White: 'Vit', Default: 'Standard', Strength: 'Styrka', Intensity: 'Intensitet', Power: 'Kraft', Range: 'Intervall', Minimum: 'Minimum', Direct: 'Direkt', Brightness: 'Ljusstyrka', Tint: 'Färgton', Mid: 'Mitten', Point: 'Punkt', Softness: 'Mjukhet', Width: 'Bredd', Area: 'Område', Value: 'Värde', Boost: 'Förstärkning', Offset: 'Förskjutning', Normal: 'Normal', Direction: 'Riktning', Show: 'Visa', Channel: 'Kanal', Off: 'Av', Red: 'Röd', Green: 'Grön', Blue: 'Blå', Additive: 'Additiv', Multiply: 'Multiplicera', Blend: 'Blanda', Head: 'Huvud', Bone: 'Ben', Tracked: 'Spårad', Static: 'Statisk', Proxy: 'Proxy', Fresnel: 'Fresnel', Classic: 'Klassisk', Character: 'Karaktär', Pass: 'Pass', View: 'Vy', Stable: 'Stabil', Strand: 'Slinga', U: 'U', Horizontal: 'Horisontell', V: 'V', Vertical: 'Vertikal', Preset: 'Förinställning',
  },
});

const EDITOR_COMMON_TERM_TRANSLATIONS = Object.freeze({
  Advanced: {
    ja: '詳細', ko: '고급', zh: '高级', es: 'Avanzado', fr: 'Avancé', de: 'Erweitert', pt: 'Avançado', 'pt-BR': 'Avançado',
    it: 'Avanzate', ru: 'Расширенные', id: 'Lanjutan', vi: 'Nâng cao', th: 'ขั้นสูง', tr: 'Gelişmiş', hi: 'उन्नत', ar: 'متقدم', bn: 'উন্নত', ms: 'Lanjutan', nl: 'Geavanceerd', pl: 'Zaawansowane', sv: 'Avancerat',
  },
});

const EDITOR_COPY_CACHE = new Map();

const LOCALE_CODES = new Set(SUPPORTED_LOCALES.map(({ code }) => code));

export function normalizeLocale(value) {
  const raw = String(value ?? '').trim().replace('_', '-');
  if (LOCALE_CODES.has(raw)) return raw;
  const base = raw.split('-')[0];
  if (LOCALE_CODES.has(base)) return base;
  return null;
}

export function getLocale() {
  const href = typeof window !== 'undefined' ? window.location.href : 'https://toonlab.invalid/';
  const query = new URL(href).searchParams.get('lang');
  const stored = typeof window !== 'undefined' ? window.localStorage.getItem('toonlab.locale') : null;
  const browserLanguages = typeof navigator !== 'undefined' ? navigator.languages : [];
  const browser = browserLanguages?.find((value) => normalizeLocale(value)) || (typeof navigator !== 'undefined' ? navigator.language : null);
  return normalizeLocale(query) || normalizeLocale(stored) || normalizeLocale(browser) || 'en';
}

export function setLocale(locale, { reload = true } = {}) {
  const next = normalizeLocale(locale) || 'en';
  if (typeof window === 'undefined') return next;
  window.localStorage.setItem('toonlab.locale', next);
  if (!reload) return next;
  const url = new URL(window.location.href);
  url.searchParams.set('lang', next);
  window.location.assign(url.toString());
  return next;
}

function translateEditorTerms(value, locale) {
  const dictionary = {
    ...(EDITOR_TERM_TRANSLATIONS[locale] || {}),
    ...Object.fromEntries(
      Object.entries(EDITOR_COMMON_TERM_TRANSLATIONS)
        .map(([term, translations]) => [term, translations[locale] || term]),
    ),
  };
  if (!dictionary || !value) return value;
  let translated = String(value);
  const terms = Object.keys(dictionary).sort((a, b) => b.length - a.length);
  for (const term of terms) {
    const replacement = dictionary[term];
    if (!replacement || replacement === term) continue;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    translated = translated.replace(new RegExp(`\\b${escaped}\\b`, 'g'), replacement);
  }
  return translated;
}

export function getCopy(locale = getLocale()) {
  const code = normalizeLocale(locale) || 'en';
  let editorCopy = EDITOR_COPY_CACHE.get(code);
  if (!editorCopy) {
    const editorSource = {
      ...EDITOR_ENGLISH,
      ...(EDITOR_COPY[code] || EDITOR_COPY.en),
    };
    editorCopy = Object.fromEntries(
      Object.entries(editorSource).map(([key, value]) => [
        key,
        code === 'en' || value !== EDITOR_ENGLISH[key]
          ? value
          : translateEditorTerms(value, code),
      ]),
    );
    EDITOR_COPY_CACHE.set(code, editorCopy);
  }
  return {
    ...ENGLISH,
    ...EDITOR_ENGLISH,
    ...GRASS_EDITOR_ENGLISH,
    ...(COPY[code] || {}),
    ...(COMMON_COPY[code] || COMMON_COPY.en),
    ...(GRASS_EDITOR_COPY[code] || GRASS_EDITOR_COPY.en),
    ...editorCopy,
  };
}

export function getLanguageOptions() {
  return SUPPORTED_LOCALES;
}

export function getLanguageFlagUrl(localeOrCode) {
  const option = typeof localeOrCode === 'string'
    ? SUPPORTED_LOCALES.find(({ code }) => code === localeOrCode) || { flagCode: localeOrCode }
    : localeOrCode;
  return `/flags/${option?.flagCode || 'gb'}.svg`;
}

/** Translate a phrase owned by a Lab without changing its serialized value. */
export function localizeEditorText(value, locale = getLocale()) {
  const text = String(value ?? '');
  const code = normalizeLocale(locale) || 'en';
  const phraseTranslation = EDITOR_PHRASE_TRANSLATIONS[text]?.[code];
  if (phraseTranslation) return phraseTranslation;
  const grassKey = GRASS_EDITOR_LABEL_KEYS[text];
  if (grassKey) {
    const copy = getCopy(code);
    const localized = copy[grassKey] || text;
    return code === 'en' || localized !== GRASS_EDITOR_ENGLISH[grassKey]
      ? localized
      : translateEditorTerms(localized, code);
  }
  if (text.startsWith('Reset ') && text.endsWith(' to default')) {
    const copy = getCopy(code);
    return copy.resetField
      .replace('{field}', localizeEditorText(text.slice(6, -11), locale));
  }
  const key = EDITOR_LABEL_KEYS[text];
  if (key) {
    const copy = getCopy(code);
    const localized = copy[key] || text;
    return code === 'en' || localized !== EDITOR_ENGLISH[key]
      ? localized
      : translateEditorTerms(localized, code);
  }
  return translateEditorTerms(text, code);
}

export function localizeTemplate(value, _locale = getLocale(), vars = {}) {
  return String(value).replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

export function applyTranslations(root = document, locale = getLocale()) {
  const copy = getCopy(locale);
  for (const node of root.querySelectorAll('[data-i18n]')) {
    const key = node.dataset.i18n;
    if (copy[key]) node.textContent = copy[key];
  }
  for (const node of root.querySelectorAll('[data-i18n-attr]')) {
    const [attribute, key] = node.dataset.i18nAttr.split(':');
    if (attribute && key && copy[key]) node.setAttribute(attribute, copy[key]);
  }
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  if (typeof document !== 'undefined') document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  return locale;
}

export function mountLanguagePicker(root = document) {
  if (typeof document === 'undefined') return getLocale();
  const locale = getLocale();
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  const menus = root.matches?.('[data-language-menu]')
    ? [root]
    : [...root.querySelectorAll('[data-language-menu]')];
  for (const menu of menus) {
    menu.__languageMenuCleanup?.();
    const activeOption = SUPPORTED_LOCALES.find(({ code }) => code === locale) || SUPPORTED_LOCALES[0];
    const copy = getCopy(locale);
    const trigger = menu.querySelector('[data-language-trigger]');
    const current = menu.querySelector('[data-language-current]');
    const flagBadge = menu.querySelector('[data-language-flag]');
    const list = menu.querySelector('[data-language-options]');
    if (!trigger || !list) continue;

    if (current) current.textContent = activeOption.nativeName;
    if (flagBadge) {
      const image = document.createElement('img');
      image.src = getLanguageFlagUrl(activeOption);
      image.alt = '';
      image.setAttribute('aria-hidden', 'true');
      flagBadge.replaceChildren(image);
    }
    trigger.setAttribute('aria-label', copy.language);
    trigger.setAttribute('aria-expanded', 'false');
    const listId = menu.id
      ? `${menu.id}-options`
      : `toonlab-language-${Math.random().toString(36).slice(2)}-options`;
    trigger.setAttribute('aria-controls', listId);
    list.id = listId;
    list.setAttribute('aria-label', copy.language);
    list.replaceChildren(...SUPPORTED_LOCALES.map(({ code, nativeName, flagCode }) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'tl-language-option';
      option.dataset.locale = code;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(code === locale));

      const optionFlag = document.createElement('span');
      optionFlag.className = 'tl-language-option__flag';
      optionFlag.setAttribute('aria-hidden', 'true');
      const image = document.createElement('img');
      image.src = getLanguageFlagUrl(flagCode);
      image.alt = '';
      optionFlag.append(image);
      const optionName = document.createElement('span');
      optionName.className = 'tl-language-option__name';
      optionName.textContent = nativeName;
      const check = document.createElement('span');
      check.className = 'tl-language-option__check';
      check.setAttribute('aria-hidden', 'true');
      check.textContent = '✓';
      option.append(optionFlag, optionName, check);
      return option;
    }));

    const setOpen = (open, focusFirst = false) => {
      list.hidden = !open;
      trigger.setAttribute('aria-expanded', String(open));
      menu.dataset.open = String(open);
      if (open && focusFirst) list.querySelector('[role="option"]')?.focus();
    };
    const onTriggerClick = () => setOpen(list.hidden);
    const onOptionClick = (event) => {
      const option = event.target.closest?.('[role="option"]');
      if (!option || !menu.contains(option)) return;
      setLocale(option.dataset.locale);
    };
    const onMenuKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (!list.hidden) {
          event.preventDefault();
          setOpen(false);
          trigger.focus();
        }
        return;
      }
      if (event.key === 'ArrowDown' && event.target === trigger) {
        event.preventDefault();
        setOpen(true, true);
        return;
      }
      if (!event.target.matches?.('[role="option"]')) return;
      const options = [...list.querySelectorAll('[role="option"]')];
      const index = options.indexOf(event.target);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        options[(index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]?.focus();
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        options[event.key === 'Home' ? 0 : options.length - 1]?.focus();
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.target.click();
      }
    };
    const onDocumentPointerDown = (event) => {
      if (!menu.contains(event.target)) setOpen(false);
    };
    trigger.addEventListener('click', onTriggerClick);
    menu.addEventListener('click', onOptionClick);
    menu.addEventListener('keydown', onMenuKeyDown);
    document.addEventListener('pointerdown', onDocumentPointerDown);
    menu.__languageMenuCleanup = () => {
      trigger.removeEventListener('click', onTriggerClick);
      menu.removeEventListener('click', onOptionClick);
      menu.removeEventListener('keydown', onMenuKeyDown);
      document.removeEventListener('pointerdown', onDocumentPointerDown);
      delete menu.__languageMenuCleanup;
    };
  }
  return locale;
}
