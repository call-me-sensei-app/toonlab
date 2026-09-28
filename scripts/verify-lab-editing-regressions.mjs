import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const root=new URL('../',import.meta.url).pathname;
const load=p=>import(pathToFileURL(root+p).href);
const memory=new Map();const loc={search:'',pathname:'/tree-lab/',href:'http://localhost/tree-lab/'};
const storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)};
globalThis.document={body:{dataset:{}}};globalThis.window={location:loc,history:{replaceState(){}},localStorage:storage,addEventListener(){},removeEventListener(){},dispatchEvent(){}};globalThis.localStorage=storage;
const configs=[
 ['character','src/toon/toonSettings.js','TOON_SETTING_FIELD_SCHEMA','labs/shader-lab/ui/store.js','createCharacterShaderStore','nested','setSetting'],
 ['rock-shader','src/rock-shader/rockShaderSettings.js','ROCK_SHADER_FIELD_SCHEMA','labs/rock-shader-lab/ui/store.js','createRockShaderLabStore','nested','setSetting'],
 ['ground-shader','src/ground-shader/groundShaderSettings.js','GROUND_SHADER_FIELD_SCHEMA','labs/ground-shader-lab/ui/store.js','createGroundShaderLabStore','nested','setSetting'],
 ['grass-generation','src/vegetation/stylizedGrass.js','GRASS_SETTING_FIELD_SCHEMA','labs/grass-lab/ui/store.js','createGrassLabStore','flat','setSetting'],
 ['water','src/water/waterSettings.js','WATER_SETTING_FIELD_SCHEMA_BY_GROUP','labs/water-lab/store/waterStore.js','createWaterStore','flat','setSetting'],
 ['texture','src/texgen/textureSettings.js','TEXTURE_SETTING_FIELD_SCHEMA','labs/texture-lab/store/textureStore.js','createTextureStore','nested','setField'],
 ['tree-generation','src/vegetation/experimental.js','TREE_SETTING_FIELD_SCHEMA','labs/tree-lab/store/designerStore.js','createDesignerStore','field','setField'],
 ...['tree','grass','flower'].map(scope=>[scope+'-shader','src/vegetation/vegetationShaders.js','scope:'+scope,'labs/vegetation-shader-lab/ui/store.js','createVegetationMaterialLabStore','nested','setSetting',scope]),
];
const clone=v=>v===undefined?undefined:structuredClone(v);
const stable=v=>JSON.stringify(v);
const normalized=v=>v?.isColor?[v.r,v.g,v.b]:v;
const equal=(a,b)=>{a=normalized(a);b=normalized(b);return typeof a==='number'&&typeof b==='number'?Math.abs(a-b)<1e-8:Array.isArray(a)&&Array.isArray(b)?a.length===b.length&&a.every((x,i)=>typeof x==='number'&&typeof b[i]==='number'?Math.abs(x-b[i])<0.005:stable(x)===stable(b[i])):stable(a)===stable(b);};
function candidates(f,base){
 if(f.type==='select')return (f.options??[]).map(v=>v?.value??v?.id??v);
 if(f.type==='boolean'||f.type==='toggle')return [false,true];
 if(f.type==='color')return typeof base==='string'?['#1a7fb3','#e6a12f']:[[0.1,0.6,0.9],[0.9,0.2,0.1]];
 if(f.type==='number')return [...new Set([f.range?.min??f.min,base,f.range?.max??f.max].filter(Number.isFinite))];
 if(Array.isArray(base)&&base.every(Number.isFinite))return [base,base.map((v,i)=>Math.max(0.001,v*0.8+(i+1)*0.01))];
 return [];
}
const results=[];
for(const [lab,schemaPath,schemaName,storePath,factory,shape,action,scope] of configs){
 memory.clear();const s=(await load(storePath))[factory]({scope,urlParams:new URLSearchParams()});
 const mod=await load(schemaPath); const schema=schemaName.startsWith('scope:')?mod.getVegetationShaderScopeFieldSchema(scope):mod[schemaName];
 let chosen;
 for(const [group,fields] of Object.entries(schema))for(const [key,f] of Object.entries(fields))if(!chosen&&f.type==='number'&&typeof (shape==='flat'?s.getState().settings[key]:s.getState().settings[group]?.[key])==='number')chosen={group,key,f};
 if(!chosen)continue;
 const {group,key,f}=chosen;const read=()=>shape==='flat'?s.getState().settings[key]:s.getState().settings[group][key];
 const before=read();const all=candidates(f,before);const numeric=all.filter(Number.isFinite);const values=[...new Set([...all,(Math.min(...numeric)+Math.max(...numeric))/2])].filter(v=>Number.isFinite(v)&&v!==before);if(values.length<2)continue;
 const set=v=>shape==='flat'?s.actions[action](key,v):shape==='field'?s.actions[action](f,v):s.actions[action](group,key,v);
 const oldNow=Date.now;Date.now=()=>1800000000000;
 try{set(values[0]);const first=read();s.actions.undo();set(values[1]);const branch=read();const flags={canUndo:s.getState().canUndo,canRedo:s.getState().canRedo};s.actions.undo();results.push({lab,field:group+'.'+key,before,first,branch,flags,afterUndo:read(),pass:equal(read(),before)&&!flags.canRedo});}catch(e){results.push({lab,error:e.message});}finally{Date.now=oldNow;}
}
for(const result of results)assert.equal(result.pass,true,JSON.stringify(result));
memory.clear();
const {createCharacterShaderStore}=await load('labs/shader-lab/ui/store.js');
const {TOON_SETTING_FIELD_LIST,readToonGroupValue,withToonGroupValue}=await load('labs/shared/toonSettingFields.js');
const {createToonSettings}=await load('src/toon/toonSettings.js');
const base=createToonSettings({preset:'call_me_sensei'});
let character=createCharacterShaderStore({urlParams:new URLSearchParams()});
character.actions.setSetting('ramp','tone.face',[0.8,0.6,0.55]);
character.actions.setSetting('rim','intensity.hair',0.5);
let settings=character.getState().settings;
assert.deepEqual(settings.ramp.tone.face,[0.8,0.6,0.55]);
assert.equal(settings.rim.intensity.hair,0.5);
assert.equal(settings.rim.intensity.cloth,base.rim.intensity.cloth,'a nested edit keeps its siblings');
assert.deepEqual(settings.ramp.tone.skin,base.ramp.tone.skin,'a nested edit keeps its siblings');
character.actions.savePresetAs('Regression nested edits');
character=createCharacterShaderStore({urlParams:new URLSearchParams()});
settings=character.getState().settings;
assert.deepEqual(settings.ramp.tone.face,[0.8,0.6,0.55],'nested edits survive a reload');
assert.equal(settings.rim.intensity.hair,0.5,'nested edits survive a reload');
character.actions.applyPreset(character.getState().presetId);
assert.equal(character.getState().settings.rim.intensity.hair,0.5,'the saved style carries nested edits');
let endpoints=0;
for(const field of TOON_SETTING_FIELD_LIST){
 if(field.type!=='number')continue;
 for(const value of [field.range.min,field.range.max]){
  const group=withToonGroupValue({...base[field.group],enabled:true},field.key,value);
  const updated=createToonSettings({...base,[field.group]:group});
  assert.equal(readToonGroupValue(updated[field.group],field.key),value,`${field.id} endpoint ${value}`);endpoints++;
 }
}
console.log(`Editing regressions passed: ${results.length} history stores, nested character edits, ${endpoints} numeric endpoints.`);
