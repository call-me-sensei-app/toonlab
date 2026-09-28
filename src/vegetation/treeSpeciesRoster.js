function slugifyScientificName(scientificName) {
  return scientificName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function cohort(architectureId, entries) {
  return entries.map(([commonName, scientificName, aliases = []]) => Object.freeze({
    id: slugifyScientificName(scientificName),
    architectureId,
    scientificName,
    commonName,
    aliases: Object.freeze([commonName, ...aliases]),
  }));
}

export const TREE_SPECIES_ROSTER = Object.freeze([
  ...cohort('massive-decurrent', [
    ['English oak', 'Quercus robur'],
    ['Northern red oak', 'Quercus rubra'],
    ['Cork oak', 'Quercus suber'],
    ['Sweet chestnut', 'Castanea sativa'],
    ['English walnut', 'Juglans regia'],
  ]),
  ...cohort('high-crown-excurrent', [
    ['European ash', 'Fraxinus excelsior'],
    ['Manchurian ash', 'Fraxinus mandshurica'],
    ['Tulip tree', 'Liriodendron tulipifera'],
    ['American sweetgum', 'Liquidambar styraciflua'],
    ['Empress tree', 'Paulownia tomentosa'],
  ]),
  ...cohort('vase-arching', [
    ['American elm', 'Ulmus americana'],
    ['Wych elm', 'Ulmus glabra'],
    ['Chinese elm', 'Ulmus parvifolia'],
    ['Japanese zelkova', 'Zelkova serrata'],
    ['Common hackberry', 'Celtis occidentalis'],
  ]),
  ...cohort('smooth-layered', [
    ['European beech', 'Fagus sylvatica'],
    ['Japanese beech', 'Fagus crenata'],
    ['European hornbeam', 'Carpinus betulus'],
    ['Japanese hornbeam', 'Carpinus japonica'],
    ['Small-leaved lime', 'Tilia cordata', ['small-leaved linden']],
  ]),
  ...cohort('pale-clonal', [
    ['Silver birch', 'Betula pendula'],
    ['Paper birch', 'Betula papyrifera'],
    ['Asian white birch', 'Betula platyphylla'],
    ['Eurasian aspen', 'Populus tremula'],
    ['Quaking aspen', 'Populus tremuloides'],
  ]),
  ...cohort('riparian-central-leader', [
    ['Black poplar', 'Populus nigra'],
    ['Eastern cottonwood', 'Populus deltoides'],
    ['Black alder', 'Alnus glutinosa'],
    ['Japanese alder', 'Alnus japonica'],
    ['White willow', 'Salix alba'],
  ]),
  ...cohort('maple-rounded', [
    ['Sugar maple', 'Acer saccharum'],
    ['Red maple', 'Acer rubrum'],
    ['Japanese maple', 'Acer palmatum'],
    ['Fullmoon maple', 'Acer japonicum'],
    ['Paperbark maple', 'Acer griseum'],
  ]),
  ...cohort('flowering-ornamental', [
    ['Japanese flowering cherry', 'Prunus serrulata'],
    ['Japanese apricot', 'Prunus mume'],
    ['Kobus magnolia', 'Magnolia kobus'],
    ['Kousa dogwood', 'Cornus kousa'],
    ['Chinese redbud', 'Cercis chinensis'],
  ]),
  ...cohort('orchard-fruit', [
    ['Apple', 'Malus domestica'],
    ['Asian pear', 'Pyrus pyrifolia'],
    ['Peach', 'Prunus persica'],
    ['European plum', 'Prunus domestica'],
    ['Japanese persimmon', 'Diospyros kaki'],
  ]),
  ...cohort('mediterranean-evergreen', [
    ['Olive', 'Olea europaea'],
    ['Holm oak', 'Quercus ilex'],
    ['Carob', 'Ceratonia siliqua'],
    ['Strawberry tree', 'Arbutus unedo'],
    ['Bay laurel', 'Laurus nobilis'],
  ]),
  ...cohort('tropical-buttressed', [
    ['Kapok', 'Ceiba pentandra'],
    ['Sal', 'Shorea robusta'],
    ['Gurjan', 'Dipterocarpus alatus'],
    ['Tualang', 'Koompassia excelsa'],
    ['Big-leaf mahogany', 'Swietenia macrophylla'],
  ]),
  ...cohort('tropical-spreading', [
    ['Rain tree', 'Samanea saman'],
    ['Royal poinciana', 'Delonix regia'],
    ['Jacaranda', 'Jacaranda mimosifolia'],
    ['Mango', 'Mangifera indica'],
    ['Tamarind', 'Tamarindus indica'],
  ]),
  ...cohort('ficus-aerial-root', [
    ['Banyan', 'Ficus benghalensis'],
    ['Chinese banyan', 'Ficus microcarpa'],
    ['Moreton Bay fig', 'Ficus macrophylla'],
    ['Rubber fig', 'Ficus elastica'],
    ['Sacred fig', 'Ficus religiosa'],
  ]),
  ...cohort('mangrove-specialized-root', [
    ['Red mangrove', 'Rhizophora mangle'],
    ['Asian red mangrove', 'Rhizophora apiculata'],
    ['Grey mangrove', 'Avicennia marina'],
    ['Large-leafed mangrove', 'Bruguiera gymnorhiza'],
    ['White-flowered mangrove apple', 'Sonneratia alba'],
  ]),
  ...cohort('savanna-umbrella', [
    ['Umbrella thorn', 'Vachellia tortilis'],
    ['Gum arabic tree', 'Senegalia senegal'],
    ['African baobab', 'Adansonia digitata'],
    ["Grandidier's baobab", 'Adansonia grandidieri'],
    ['Marula', 'Sclerocarya birrea'],
  ]),
  ...cohort('eucalypt-paperbark', [
    ['Blue gum', 'Eucalyptus globulus'],
    ['River red gum', 'Eucalyptus camaldulensis'],
    ['Ghost gum', 'Corymbia aparrerinja'],
    ['Rainbow eucalyptus', 'Eucalyptus deglupta'],
    ['Broad-leaved paperbark', 'Melaleuca quinquenervia'],
  ]),
  ...cohort('dense-whorled-conifer', [
    ['Norway spruce', 'Picea abies'],
    ['Ezo spruce', 'Picea jezoensis'],
    ['European silver fir', 'Abies alba'],
    ['Momi fir', 'Abies firma'],
    ['Douglas fir', 'Pseudotsuga menziesii'],
  ]),
  ...cohort('open-spreading-pine', [
    ['Scots pine', 'Pinus sylvestris'],
    ['Ponderosa pine', 'Pinus ponderosa'],
    ['Japanese black pine', 'Pinus thunbergii'],
    ['Japanese red pine', 'Pinus densiflora'],
    ['Stone pine', 'Pinus pinea'],
  ]),
  ...cohort('tall-sparse-pine', [
    ['Eastern white pine', 'Pinus strobus'],
    ['Lodgepole pine', 'Pinus contorta'],
    ['Longleaf pine', 'Pinus palustris'],
    ['Great Basin bristlecone pine', 'Pinus longaeva'],
    ['Japanese white pine', 'Pinus parviflora'],
  ]),
  ...cohort('scale-spray-conifer', [
    ['Italian cypress', 'Cupressus sempervirens'],
    ['Hinoki cypress', 'Chamaecyparis obtusa'],
    ['Western red cedar', 'Thuja plicata'],
    ['Chinese juniper', 'Juniperus chinensis'],
    ['Japanese cedar', 'Cryptomeria japonica'],
  ]),
  ...cohort('deciduous-wetland-conifer', [
    ['Dawn redwood', 'Metasequoia glyptostroboides'],
    ['Bald cypress', 'Taxodium distichum'],
    ['European larch', 'Larix decidua'],
    ['Japanese larch', 'Larix kaempferi'],
    ['Chinese swamp cypress', 'Glyptostrobus pensilis'],
  ]),
  ...cohort('giant-ancient-conifer', [
    ['Coast redwood', 'Sequoia sempervirens'],
    ['Giant sequoia', 'Sequoiadendron giganteum'],
    ['Cedar of Lebanon', 'Cedrus libani'],
    ['Deodar cedar', 'Cedrus deodara'],
    ['New Zealand kauri', 'Agathis australis'],
  ]),
  ...cohort('specialized-relict-gymnosperm', [
    ['Monkey puzzle', 'Araucaria araucana'],
    ['Norfolk Island pine', 'Araucaria heterophylla'],
    ['Wollemi pine', 'Wollemia nobilis'],
    ['Buddhist pine', 'Podocarpus macrophyllus'],
    ['Ginkgo', 'Ginkgo biloba'],
  ]),
  ...cohort('single-stem-pinnate-palm', [
    ['Coconut', 'Cocos nucifera'],
    ['Date palm', 'Phoenix dactylifera'],
    ['Royal palm', 'Roystonea regia'],
    ['Areca palm', 'Areca catechu'],
    ['African oil palm', 'Elaeis guineensis'],
  ]),
  ...cohort('single-stem-fan-palm', [
    ['Mexican fan palm', 'Washingtonia robusta'],
    ['Cabbage palm', 'Sabal palmetto'],
    ['Windmill palm', 'Trachycarpus fortunei'],
    ['Chinese fan palm', 'Livistona chinensis'],
    ['Palmyra palm', 'Borassus flabellifer'],
  ]),
  ...cohort('branching-clustering-palm', [
    ['Doum palm', 'Hyphaene thebaica'],
    ['Nipa palm', 'Nypa fruticans'],
    ['Lady palm', 'Rhapis excelsa'],
    ['Mediterranean fan palm', 'Chamaerops humilis'],
    ['Golden cane palm', 'Dypsis lutescens'],
  ]),
  ...cohort('running-temperate-bamboo', [
    ['Moso bamboo', 'Phyllostachys edulis'],
    ['Golden bamboo', 'Phyllostachys aurea'],
    ['Black bamboo', 'Phyllostachys nigra'],
    ['Japanese timber bamboo', 'Phyllostachys bambusoides'],
    ['Bisset bamboo', 'Phyllostachys bissetii'],
  ]),
  ...cohort('clumping-tropical-bamboo', [
    ['Common bamboo', 'Bambusa vulgaris'],
    ['Giant timber bamboo', 'Bambusa oldhamii'],
    ['Giant bamboo', 'Dendrocalamus asper'],
    ['Guadua bamboo', 'Guadua angustifolia'],
    ['Robust fountain bamboo', 'Fargesia robusta'],
  ]),
  ...cohort('cycad-terminal-crown', [
    ['Sago cycad', 'Cycas revoluta'],
    ['Queen sago', 'Cycas circinalis'],
    ['Chestnut dioon', 'Dioon edule'],
    ['Eastern Cape giant cycad', 'Encephalartos altensteinii'],
    ['Burrawang', 'Macrozamia communis'],
  ]),
  ...cohort('tree-fern-terminal-crown', [
    ['Soft tree fern', 'Dicksonia antarctica'],
    ['Australian tree fern', 'Sphaeropteris cooperi', ['Cyathea cooperi']],
    ['Black tree fern', 'Sphaeropteris medullaris', ['Cyathea medullaris']],
    ['Silver fern', 'Alsophila dealbata', ['Cyathea dealbata']],
    ["Hapuu", 'Cibotium glaucum', ["hāpuʻu"]],
  ]),
  ...cohort('branched-rosette-tree', [
    ['Joshua tree', 'Yucca brevifolia'],
    ['Socotra dragon tree', 'Dracaena cinnabari'],
    ['Canary Islands dragon tree', 'Dracaena draco'],
    ['Quiver tree', 'Aloidendron dichotomum', ['Aloe dichotoma']],
    ['Cabbage tree', 'Cordyline australis'],
  ]),
  ...cohort('pandanus-giant-monocot', [
    ['Screw pine', 'Pandanus tectorius'],
    ["Traveller's tree", 'Ravenala madagascariensis'],
    ['Wild banana', 'Musa acuminata'],
    ['Ethiopian banana', 'Ensete ventricosum'],
    ['Giant bird-of-paradise', 'Strelitzia nicolai'],
  ]),
  ...cohort('tree-form-cactus', [
    ['Saguaro', 'Carnegiea gigantea'],
    ['Giant cardon', 'Pachycereus pringlei'],
    ['Organ-pipe cactus', 'Stenocereus thurberi'],
    ['Peruvian apple cactus', 'Cereus repandus'],
    ['Prickly pear', 'Opuntia ficus-indica'],
  ]),
]);

if (TREE_SPECIES_ROSTER.length !== 165) {
  throw new Error(`Tree species roster must contain 165 profiles; received ${TREE_SPECIES_ROSTER.length}.`);
}
if (new Set(TREE_SPECIES_ROSTER.map((profile) => profile.id)).size !== 165) {
  throw new Error('Tree species profile ids must be unique.');
}
if (new Set(TREE_SPECIES_ROSTER.map((profile) => profile.scientificName)).size !== 165) {
  throw new Error('Tree species scientific names must be unique.');
}

