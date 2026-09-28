import { normalizeExperimentSettings } from './experimentModels.js';
import { Select, Slider } from '../../shared/ui/index.js';
import { ScrubValue } from '../../shared/ui/components/Slider.jsx';

export function SceneSettings({state,actions}) {
  const stage=state.view.stage,settings=normalizeExperimentSettings(state.experimentSettings);
  const change=(key,value)=>actions.setExperimentSetting(key,value);
  const number=(key,label,min,max,step,unit)=> <div className="wl-study-field" key={key}>
    <label>{label}<ScrubValue min={min} max={max} step={step} unit={unit} value={settings[key]} onChange={value=>change(key,value)}/></label>
    <Slider testId={`scene-${key}`} min={min} max={max} step={step} value={settings[key]} onChange={value=>change(key,value)}/>
  </div>;
  return <div className="wl-study-settings" data-testid="scene-settings">
    {stage==='barrel'&&<>
      <p>Inspect a plunging crest as its lip curls down, closes the barrel, and collapses. The spilling case uses a gentler reef.</p>
      <div className="wl-study-field"><label>Breaking wave</label><Select testId="breaker-mode" value={settings.breakerMode} onChange={value=>change('breakerMode',value)} options={[{value:'barrel',label:'Plunging · hollow barrel'},{value:'spilling',label:'Spilling · tumbling crest'}]}/></div>
      {number('waveHeight','Crest-to-trough height',1.5,4,.1,'m')}
    </>}
    {stage==='waterfall'&&<>
      <p>A falling sheet fed by an upstream channel, with a plunge pool and impact spray.</p>
      <div className="wl-study-field"><label>Impact rocks</label><Select testId="impact-rocks" value={String(settings.impactRocks)} onChange={value=>change('impactRocks',value==='true')} options={[{value:'true',label:'Rocks · split flow and spray'},{value:'false',label:'Open plunge pool'}]}/></div>
      <div className="wl-study-field"><label>Upper ledge · ⅓ down</label><Select testId="mid-ledge" value={String(settings.midLedge)} onChange={value=>change('midLedge',value==='true')} options={[{value:'true',label:'Protruding rock · split curtain'},{value:'false',label:'Uninterrupted upper fall'}]}/></div>
      {number('height','Drop height',2,16,.1,'m')}
      {number('fallWidth','Waterfall width',2,10,.1,'m')}
      {number('discharge','Discharge',.6,10,.1,'m³/s')}
      {number('speed','Speed at the lip',.5,3,.1,'m/s')}
      {number('aeration','Falling-water aeration',0,1,.05,'')}
      {number('foamAmount','Impact foam',0,2,.1,'×')}
      {number('mistAmount','Mist density',0,2,.1,'×')}
      {number('mistWind','Mist crosswind',-1.5,1.5,.1,'m/s')}
    </>}
    {stage==='glass-box'&&<>
      <p>Release a retained column into a shallow pool. Water hits the glass wall, rebounds, and settles.</p>
      <div className="wl-study-field"><label>Fluid detail</label><Select testId="fluid-quality" value={settings.fluidQuality} onChange={value=>change('fluidQuality',value)} options={[{value:'high',label:'High · finer sheets and spray'},{value:'standard',label:'Standard · faster preparation'}]}/></div>
      {number('columnHeight','Initial column height',1,4,.1,'m')}
      {number('columnWidth','Initial column width',1,4,.05,'m')}
      <p>Tank interior: 6 × 3.2 × 4.8 m. Changing the initial column restarts the release.</p>
    </>}
    <div className="wl-study-field"><label>Lighting rig</label><Select testId="scene-lighting" value={settings.lighting} onChange={value=>change('lighting',value)} options={[{value:'cinematic',label:'Cinematic · warm key / cool rim'},{value:'neutral',label:'Neutral · sky daylight'}]}/></div>
    {settings.lighting==='cinematic'&&number('exposure','Exposure',.3,2,.05,'×')}
    {number('timeScale','Playback speed',.1,1,.1,'×')}
    <details><summary>Model and scope</summary><p>{stage==='barrel'?'The plunging case starts from an authored curling crest and rotating flow. Gravity and 3D fluid pressure solve its closure and collapse. The spilling case shoals over a reef. The opening camera seeks a bounded passage; air pressure remains approximated.':stage==='waterfall'?'Gravity and discharge determine the falling sheet. Stream contacts sample the visible rocks; projected runoff follows their upper surfaces. Breakup and aeration approximate unresolved turbulence and air.':'A 3D particle fluid with exact tank walls and view-dependent water depth. Air bubbles and the thinnest spray are below the solver resolution.'}</p><p>{stage==='waterfall'?'Flow updates continuously.':'The first run prepares motion with GPU compute when available. Replay, the timeline, and later visits reuse the cached sequence. Surf runs for three seconds; the tank runs for four.'} Scene parameters are remembered locally; appearance uses the existing style controls.</p></details>
  </div>;
}
