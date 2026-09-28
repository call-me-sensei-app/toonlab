// Bounded, in-memory preview cache. Appearance and playback changes do not
// invalidate motion; changed physical initial conditions do.
const entries=new Map(),limit=384*1024*1024;
export function fluidCacheKey(options) {
  return options.kind==='surf'?JSON.stringify(['surf-v10',options.waveHeight,options.breakerMode])
    :JSON.stringify(['tank-v6',options.columnHeight,options.columnWidth,options.fluidQuality??'high']);
}
export function getPreparedFluid(key) {
  const entry=entries.get(key);
  if(entry){entries.delete(key);entries.set(key,entry);}
  return entry?.frames??null;
}
export function retainPreparedFluid(key,frames) {
  const bytes=frames.reduce((n,f)=>n+f.position.byteLength+f.normal.byteLength+f.foam.byteLength+f.index.byteLength+(f.spray?.byteLength??0),0);
  if(bytes>limit)return;
  entries.delete(key);entries.set(key,{frames,bytes});
  while([...entries.values()].reduce((n,e)=>n+e.bytes,0)>limit||entries.size>2)entries.delete(entries.keys().next().value);
}

// Completed sequences survive a page refresh. Only this experiment's bounded
// cache is managed; water presets and other lab data are never removed.
function openDatabase(){return new Promise(resolve=>{
  if(!globalThis.indexedDB){resolve(null);return;}
  const request=indexedDB.open('toonlab-water-motion-v2',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('sequences',{keyPath:'key'});
  request.onerror=()=>resolve(null);request.onsuccess=()=>resolve(request.result);
});}
async function encodeFrames(frames){
  const parts=[],headers=[];let offset=0;
  for(const frame of frames){
    const header={...frame};
    for(const key of ['position','normal','foam','index','spray']){
      const value=frame[key]??new Int16Array();const pad=(4-offset%4)%4;if(pad){parts.push(new Uint8Array(pad));offset+=pad;}
      header[key]={offset,length:value.length,type:value.constructor.name};parts.push(value);offset+=value.byteLength;
    }
    headers.push(header);
  }
  const blob=new Blob(parts),compressed=typeof CompressionStream==='function';
  return {headers,compressed,blob:compressed?await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob():blob};
}
async function decodeFrames(record){
  const stream=record.compressed?record.blob.stream().pipeThrough(new DecompressionStream('gzip')):record.blob.stream();
  const buffer=await new Response(stream).arrayBuffer(),types={Int16Array,Uint8Array,Uint16Array,Uint32Array,Float32Array};
  return record.headers.map(header=>{const frame={...header};for(const key of ['position','normal','foam','index','spray']){const field=header[key];frame[key]=new types[field.type](buffer,field.offset,field.length);}return frame;});
}
export async function loadPreparedFluid(key){
  const memory=getPreparedFluid(key);if(memory)return memory;
  const db=await openDatabase();if(!db)return null;
  const record=await new Promise(resolve=>{const tx=db.transaction('sequences','readonly'),request=tx.objectStore('sequences').get(key);
    request.onsuccess=()=>resolve(request.result??null);request.onerror=()=>resolve(null);tx.oncomplete=()=>db.close();});
  if(!record)return null;
  const frames=record.frames??await decodeFrames(record);retainPreparedFluid(key,frames);return frames;
}
export async function persistPreparedFluid(key,frames){
  const encoded=await encodeFrames(frames),bytes=encoded.blob.size;if(bytes>limit)return {stored:false,reason:'sequence exceeds cache budget',bytes};
  const db=await openDatabase();if(!db)return {stored:false,reason:'browser storage unavailable',bytes};
  return new Promise(resolve=>{const tx=db.transaction('sequences','readwrite'),store=tx.objectStore('sequences'),request=store.getAll();
    request.onsuccess=()=>{const rows=request.result.filter(row=>row.key!==key).sort((a,b)=>b.touched-a.touched);let total=bytes,kept=1;
      for(const row of rows){if(kept>=2||total+row.bytes>limit)store.delete(row.key);else{total+=row.bytes;kept++;}}
      store.put({key,...encoded,bytes,touched:Date.now()});};
    tx.oncomplete=()=>{db.close();resolve({stored:true,bytes});};tx.onerror=()=>{db.close();resolve({stored:false,reason:tx.error?.message??'storage error',bytes});};tx.onabort=()=>{db.close();resolve({stored:false,reason:tx.error?.message??'storage aborted',bytes});};});
}
