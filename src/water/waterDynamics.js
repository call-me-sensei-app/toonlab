import * as THREE from 'three';
import { WaterHydrodynamics } from './waterHydrodynamics.js';
import { WaterSpectralOcean } from './waterSpectralOcean.js';
import { WaterDetailSpectrum } from './waterDetailSpectrum.js';
import { WaterRenderExtension } from './waterRenderExtension.js';
import { WaterFoamParticles } from './waterFoamParticles.js';
import { buildGerstnerWaves } from './waterSettings.js';
// One authoritative, sampled water surface. The renderer and CPU contacts
// interpolate the same triangles. Style never changes the solved geometry.
export class WaterDynamics {
    constructor(surface, options = {}) {
        this.surface = surface;
        this.isWaterDynamics = true;
        this.options = options;
        this.mode = options.mode ?? 'spectral';
        this.time = 0;
        this.columns = surface.geometry.parameters.widthSegments + 1;
        this.rows = surface.geometry.parameters.heightSegments + 1;
        this.state = new Float32Array(this.columns * this.rows * 4);
        this.normals = new Float32Array(this.columns * this.rows * 3);
        this.history = new Float32Array(this.columns * this.rows * 4);
        this.foamCoordinates = new Float32Array(this.history.length);
        this.previousFoamCoordinates = new Float32Array(this.history.length);
        this.shoreDistances = new Float32Array(this.columns * this.rows);
        this.shoreContour = new Float32Array(this.columns);
        this.causticResolution = 256;
        this.light = new Float32Array(this.causticResolution ** 2 * 4);
        this.causticWork = new Float64Array(this.causticResolution ** 2);
        this.causticRegion = new THREE.Vector4();
        this.previousFoam = new Float32Array(this.columns * this.rows);
        this.stateAttribute = new THREE.BufferAttribute(this.state, 4).setUsage(THREE.DynamicDrawUsage);
        this.normalAttribute = new THREE.BufferAttribute(this.normals, 3).setUsage(THREE.DynamicDrawUsage);
        surface.geometry.setAttribute('aWaterState', this.stateAttribute);
        surface.geometry.setAttribute('aWaterNormal', this.normalAttribute);
        surface.geometry.setAttribute('aWaterWetDistance',new THREE.BufferAttribute(this.shoreDistances,1).setUsage(THREE.DynamicDrawUsage));
        const makeTexture = (array) => { const t = new THREE.DataTexture(array, this.columns, this.rows, THREE.RGBAFormat, THREE.FloatType); t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; return t; };
        this.texture = makeTexture(this.history);
        this.foamCoordinateTexture = makeTexture(this.foamCoordinates);
        this.causticTexture = new THREE.DataTexture(this.light, this.causticResolution, this.causticResolution, THREE.RGBAFormat, THREE.FloatType);
        this.causticTexture.minFilter = this.causticTexture.magFilter = THREE.LinearFilter;
        this.causticTexture.generateMipmaps = false;
        this.spectrum = new WaterSpectralOcean({ resolution: options.spectralResolution ?? 32 });
        this.normalSpectrum = new WaterSpectralOcean({ resolution: options.spectralResolution ?? 32 });
        this.detailSpectrum = new WaterDetailSpectrum();
        const resolution = this.normalSpectrum.resolution;
        this.normalTextures = Array.from({ length: 3 }, () => {
            const texture = new THREE.DataTexture(new Float32Array(resolution * resolution * 4), resolution, resolution, THREE.RGBAFormat, THREE.FloatType);
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            texture.minFilter = texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = false;
            return texture;
        });
        this.gridSignature = '';
        this.reference = false;
        this.paused = false;
        this.pendingStep = 0;
        this.sampleScratch = {};
        this.settingsSignature = '';
    }
    getRegion(out = new THREE.Vector4()) { return out.set(this.x ?? 0, this.z ?? 0, (this.surface.width + (this.dx ?? 0)) / 2, (this.surface.depth + (this.dz ?? 0)) / 2); }
    rebuild() {
        this.foamParticles?.dispose();this.foamParticles=null;
        this.renderExtension?.dispose();
        this.renderExtension = null;
        const s = this.surface, p = s.getWorldPosition(new THREE.Vector3());
        this.x = p.x;
        this.z = p.z;
        this.level = p.y;
        this.dx = s.width / (this.columns - 1);
        this.dz = s.depth / (this.rows - 1);
        this.minX = this.x - s.width / 2;
        this.minZ = this.z - s.depth / 2;
        this.bed = s.bedHeightSampler ?? (() => this.level - 20);
        if (this.mode !== 'spectral') {
            this.hydro = new WaterHydrodynamics({ columns: this.columns, rows: this.rows, width: s.width, depth: s.depth, centerX: this.x, centerZ: this.z, waterLevel: this.level, bedHeight: this.bed,
                boundary: (side, x, z, time, ghost) => this.boundary(side, x, z, time, ghost), friction: this.mode === 'tank' ? 0 : 0.018 });
            if (this.mode === 'river') {
                for (let i = 0; i < this.hydro.length; i++)
                    this.hydro.qx[i] = this.hydro.h[i] * (s.settings.flowSpeed ?? 0);
            }
        }
        else
            this.hydro = null;
        this.interactions = null;
        this.history.fill(0);
        for(let z=0;z<this.rows;z++)for(let x=0;x<this.columns;x++) {
            const i=(z*this.columns+x)*4;
            this.foamCoordinates[i]=this.minX+x*this.dx;
            this.foamCoordinates[i+1]=this.minZ+z*this.dz;
        }
        if (this.hydro) this.time = 0;
        this.warmupRemaining = this.hydro ? Math.max(0, this.options.warmupSeconds ?? 0) : 0;
        this.spectralTime ??= 0;
    }
    boundary(side, x, z, time, ghost) {
        const settings = this.surface.renderedSettings ?? this.surface.settings;
        if (this.mode === 'river' && (side === 'west' || side === 'east')) {
            if (side === 'west') {
                ghost.h = Math.max(0, this.level - ghost.bed);
                ghost.qx = ghost.h * settings.flowSpeed;
                ghost.qz = 0;
            }
            return true; // east is a zero-gradient outflow; north/south remain walls
        }
        if (this.mode === 'coast' && side === 'south') {
            const h0 = Math.max(this.level - ghost.bed, 0), c = Math.sqrt(9.81 * Math.max(h0, 0.01));
            if (h0 <= 1e-5) {
                ghost.h = ghost.qx = ghost.qz = 0;
                return true;
            }
            // Prescribe only the incoming characteristic. Retain the outgoing one
            // from the interior so reflected waves can leave through this boundary.
            let elevation = 0;
            for (const w of this.incidentWaves ?? [])
                elevation += w.amplitude * Math.sin(w.waveNumber * (w.dirX * x + w.dirZ * z) - w.omega * time + w.phase);
            // Bound incident height by the available column. Lowering the
            // water level must not inject a singular shallow-boundary jet.
            elevation = h0 * 0.35 * Math.tanh(elevation / (h0 * 0.35));
            elevation *= Math.min(time / 3, 1); // smooth startup avoids an impulsive boundary step
            const incoming = 2 * c + 2 * Math.sqrt(9.81 / h0) * elevation;
            const outgoing = (ghost.h > 1e-5 ? ghost.qz / ghost.h : 0) - 2 * Math.sqrt(9.81 * ghost.h);
            const v = (incoming + outgoing) / 2, cb = Math.max((incoming - outgoing) / 4, 0);
            ghost.h = cb * cb / 9.81;
            ghost.qz = ghost.h * v;
            ghost.qx = 0;
            return true;
        }
        return false;
    }
    update(delta) {
        const s = this.surface, p = s.getWorldPosition(new THREE.Vector3());
        const signature = JSON.stringify([p.x, p.y, p.z, this.mode]);
        if (signature !== this.gridSignature || this.bed !== s.bedHeightSampler && s.bedHeightSampler) {
            this.gridSignature = signature;
            this.rebuild();
        }
        const dt = this.paused ? this.pendingStep : Math.max(0, Math.min(delta, 0.1));
        let transportDelta = dt;
        this.pendingStep = 0;
        this.time += dt;
        const settings = s.renderedSettings ?? s.settings;
        const sig = JSON.stringify([settings.waveAmplitude, settings.waveIntensity, settings.waveLength, settings.waveDirection, settings.waveDirectionSpread, settings.waveSpeed, settings.waveSetPeriod, settings.waveSetStrength]);
        if (sig !== this.settingsSignature) {
            this.settingsSignature = sig;
            this.incidentWaves = buildGerstnerWaves(settings);
        }
        if (this.hydro) {
            this.hydro.foamLifetime = settings.swashFoamLifetime;
            this.hydro.foamResidueLifetime = settings.swashFoamResidueLifetime;
            // Amortize the physical pre-roll over frames; never fake the
            // shoreline position or add an unaccounted water source.
            const preroll = dt > 0 ? Math.min(this.warmupRemaining, 0.25) : 0;
            transportDelta += preroll;
            this.hydro.advance(dt + preroll);
            this.warmupRemaining -= preroll;
            this.time = this.hydro.time;
        }
        else {
            this.spectrum.configure(settings, Math.max(1, this.level - this.bed(this.x, this.z)), Math.max(this.dx, this.dz) * 2.5);
            this.spectralTime += (dt * settings.waveSpeed);
            this.spectrum.update(this.spectralTime);
            this.normalSpectrum.configure(settings, Math.max(1, this.level - this.bed(this.x, this.z)));
            this.normalSpectrum.update(this.spectralTime);
            const lengths = [];
            this.normalSpectrum.bands.forEach((band, index) => {
                const n = band.size, step = band.length / n, data = this.normalTextures[index].image.data;
                for (let z = 0; z < n; z++)
                    for (let x = 0; x < n; x++) {
                        const i = z * n + x;
                        data[i * 4] = (band.real[z * n + (x + 1) % n] - band.real[z * n + (x + n - 1) % n]) / (2 * step);
                        data[i * 4 + 1] = (band.real[((z + 1) % n) * n + x] - band.real[((z + n - 1) % n) * n + x]) / (2 * step);
                    }
                this.normalTextures[index].needsUpdate = true;
                this.surface.material.uniforms['uSpectralNormal' + index].value = this.normalTextures[index];
                lengths.push(band.length);
            });
            this.surface.material.uniforms.uSpectralLengths.value.set(...lengths);
            this.interactions?.advance(dt);
        }
        const nx = this.columns, nz = this.rows;
        let minimumY = Infinity, maximumY = -Infinity;
        for (let i=0;i<this.previousFoam.length;i++) this.previousFoam[i]=this.history[i*4+2];
        for (let iz = 0; iz < nz; iz++)
            for (let ix = 0; ix < nx; ix++) {
                const i = iz * nx + ix, j = i * 4, x = this.minX + ix * this.dx, z = this.minZ + iz * this.dz, bed = this.bed(x, z);
                let height, depth, u = 0, v = 0, foam = 0;
                if (this.hydro) {
                    depth = this.hydro.h[i];
                    height = bed + depth;
                    u = depth > 1e-5 ? this.hydro.qx[i] / depth : 0;
                    v = depth > 1e-5 ? this.hydro.qz[i] / depth : 0;
                    foam = this.hydro.foam[i];
                }
                else {
                    const restDepth = Math.max(this.level - bed, 0);
                    const wave = this.spectrum.sample(x - settings.flowDirection[0] * settings.flowSpeed * this.time, z - settings.flowDirection[1] * settings.flowSpeed * this.time)
                        + (this.interactions ? this.interactions.h[i] + this.interactions.bed[i] - this.level : 0);
                    // Offshore linear waves taper smoothly as their depth-limited height
                    // is approached; no clipped plateaus or disconnected curling shells.
                    const allowance = 0.35 * restDepth;
                    const displacement = allowance > 1e-5 ? allowance * Math.tanh(wave / allowance) : 0;
                    height = this.level + displacement;
                    depth = Math.max(height - bed, 0);
                    u = settings.flowDirection[0] * settings.flowSpeed;
                    v = settings.flowDirection[1] * settings.flowSpeed;
                    if (this.interactions && this.interactions.h[i] > 1e-5) {
                        u += this.interactions.qx[i] / this.interactions.h[i];
                        v += this.interactions.qz[i] / this.interactions.h[i];
                    }
                }
                minimumY = Math.min(minimumY, height);
                maximumY = Math.max(maximumY, height);
                this.state[j] = height;
                this.state[j + 1] = depth;
                this.state[j + 2] = u;
                this.state[j + 3] = v;
                this.history[j] = depth > 0.002 ? 1 : this.history[j] * Math.exp(-dt / Math.max(settings.wetSandDryTime, 1));
                this.history[j + 1] = depth; // solved field stores metres, not a binary wet-film flag
                if (this.hydro)
                    this.history[j + 2] = foam;
                this.history[j + 3] = foam * (depth < 0.01 ? 1 : 0);
            }
        // Frame and optical focusing derive from this exact surface, including
        // wet/dry cells. No unrelated caustic animation clock or noise texture.
        for (let iz = 0; iz < nz; iz++)
            for (let ix = 0; ix < nx; ix++) {
                const i = iz * nx + ix, j = i * 4, left = (iz * nx + Math.max(0, ix - 1)) * 4, right = (iz * nx + Math.min(nx - 1, ix + 1)) * 4;
                const down = (Math.max(0, iz - 1) * nx + ix) * 4, up = (Math.min(nz - 1, iz + 1) * nx + ix) * 4;
                const gx = (this.state[right] - this.state[left]) / (this.dx * (ix > 0 && ix < nx - 1 ? 2 : 1));
                const gz = (this.state[up] - this.state[down]) / (this.dz * (iz > 0 && iz < nz - 1 ? 2 : 1));
                const inv = 1 / Math.hypot(gx, 1, gz);
                this.normals[i * 3] = -gx * inv;
                this.normals[i * 3 + 1] = inv;
                this.normals[i * 3 + 2] = -gz * inv;
                if (!this.hydro) {
                    const source = Math.max(0, Math.hypot(gx, gz) - 0.24) * 3;
                    const tracedX = Math.max(0, Math.min(nx-1, ix-this.state[j+2]*dt/this.dx));
                    const tracedZ = Math.max(0, Math.min(nz-1, iz-this.state[j+3]*dt/this.dz));
                    const x0 = Math.min(nx-2, Math.floor(tracedX)), z0 = Math.min(nz-2, Math.floor(tracedZ));
                    const tx = tracedX-x0, tz = tracedZ-z0, fi=z0*nx+x0, old=this.previousFoam;
                    const advected = (old[fi]*(1-tx)+old[fi+1]*tx)*(1-tz)+(old[fi+nx]*(1-tx)+old[fi+nx+1]*tx)*tz;
                    this.history[j + 2] = Math.min(1, advected * Math.exp(-dt / 3) + source * dt);
                }
            }
        this.updateShoreContour();
        this.updateFoamCoordinates(transportDelta);
        if(this.options.foamParticles&&this.hydro) {
            this.foamParticles ??= new WaterFoamParticles(this);
            this.foamParticles.update(transportDelta);
        }
        s.geometry.boundingBox ??= new THREE.Box3();
        s.geometry.boundingBox.min.set(-s.width / 2, minimumY - this.level, -s.depth / 2);
        s.geometry.boundingBox.max.set(s.width / 2, maximumY - this.level, s.depth / 2);
        s.geometry.boundingSphere ??= new THREE.Sphere();
        s.geometry.boundingBox.getBoundingSphere(s.geometry.boundingSphere);
        if (this.options.renderExtent && this.mode === 'coast') {
            this.renderExtension ??= new WaterRenderExtension(this, this.options.renderExtent);
            this.renderExtension.update();
        }
        this.detailSpectrum.configure(settings);
        this.detailSpectrum.update(this.time);
        this.detailSpectrum.bands.forEach((band, i) => {
            this.surface.material.uniforms['uDetailNormal' + i].value = band.texture;
        });
        this.surface.material.uniforms.uDetailLengths.value.set(...this.detailSpectrum.bands.map(b => b.length));
        this.updateCaustics();
        this.stateAttribute.needsUpdate = true;
        this.normalAttribute.needsUpdate = true;
        this.texture.needsUpdate = true;
        this.causticTexture.needsUpdate = true;
        this.surface.material.uniforms.uReferenceView.value = this.reference ? 1 : 0;
        this.surface.material.uniforms.uUseShoreContour.value = this.options.shorelineAxis === 'z' ? 1 : 0;
        this.surface.material.uniforms.uFoamCoordinates.value = this.foamCoordinateTexture;
        this.surface.material.uniforms.uContinueShoreAlongX.value = this.renderExtension ? 1 : 0;
        this.surface.material.uniforms.uUseSpectralNormals.value = this.hydro ? 0 : 1;
        if (this.mode === 'tank')
            this.surface.material.uniforms.uWaveEnergy.value = 0;
    }
    updateShoreContour() {
        if(this.options.shorelineAxis !== 'z') return;
        for(let x=0;x<this.columns;x++) {
            let edge=this.state[x*4+1]>.002 ? this.minZ+this.surface.depth+this.dz : this.minZ-this.dz;
            for(let z=0;z<this.rows-1;z++) {
                const a=this.state[(z*this.columns+x)*4+1],b=this.state[((z+1)*this.columns+x)*4+1];
                if(a>=.002&&b<.002){
                    const i=z*this.columns+x,next=i+this.columns,previous=Math.max(0,z-1)*this.columns+x;
                    const eta=this.state[i*4],etaSlope=z>0?eta-this.state[previous*4]:0;
                    const nextBed=this.state[next*4]-b;
                    // Dry cells store h=0, not the negative signed depth of
                    // the water/bed intersection. Extrapolate the adjacent
                    // wet free surface before finding that intersection.
                    const signedNext=Math.min(b,eta+etaSlope-nextBed);
                    edge=this.minZ+(z+(a-.002)/Math.max(a-signedNext,1e-8))*this.dz;
                    break;
                }
            }
            this.shoreContour[x]=edge;
            for(let z=0;z<this.rows;z++)this.shoreDistances[z*this.columns+x]=edge-(this.minZ+z*this.dz);
        }
        this.surface.geometry.attributes.aWaterWetDistance.needsUpdate=true;
    }
    updateFoamCoordinates(dt) {
        const old=this.previousFoamCoordinates,nx=this.columns,nz=this.rows;
        old.set(this.foamCoordinates);
        for(let z=0;z<nz;z++)for(let x=0;x<nx;x++) {
            const i=(z*nx+x)*4;
            if(this.history[i+2]<.002) {
                this.foamCoordinates[i]=this.minX+x*this.dx;this.foamCoordinates[i+1]=this.minZ+z*this.dz;
                continue;
            }
            const gx=Math.max(0,Math.min(nx-1,x-this.state[i+2]*dt/this.dx));
            const gz=Math.max(0,Math.min(nz-1,z-this.state[i+3]*dt/this.dz));
            const a=Math.min(nx-2,Math.floor(gx)),b=Math.min(nz-2,Math.floor(gz)),tx=gx-a,tz=gz-b,j=(b*nx+a)*4;
            for(let c=0;c<2;c++)this.foamCoordinates[i+c]=(old[j+c]*(1-tx)+old[j+4+c]*tx)*(1-tz)+(old[j+nx*4+c]*(1-tx)+old[j+(nx+1)*4+c]*tx)*tz;
        }
        this.foamCoordinateTexture.needsUpdate=true;
    }
    updateCaustics() {
        // Resolve focusing at a finer scale than the water mesh. A metre-wide
        // ray grid cannot see the sub-metre ripples responsible for caustics.
        const n=this.causticResolution, size=32, step=size/n;
        const center=this.options.causticsCenter ?? [this.x,this.z];
        this.causticRegion.set(center[0],center[1],size/2,size/2);
        this.causticWork.fill(0);
        const settings=this.surface.renderedSettings ?? this.surface.settings;
        const sun=settings.sunDirection,l=Math.hypot(...sun)||1;
        const ix=-sun[0]/l,iy=-sun[1]/l,iz=-sun[2]/l,eta=1/settings.indexOfRefraction;
        if(iy>-0.02 || settings.causticsStrength<=0) {this.light.fill(0);return;}
        const activity=this.mode==='tank'?0:Math.min(this.surface.waveEnergy/0.35,1);
        const styleGain=this.reference?1:settings.detailNormalStrength*0.45+1;
        const detailSlope = {x:0,z:0};
        for(let z=0;z<n;z++)for(let x=0;x<n;x++) {
            const wx=center[0]-size/2+(x+0.5)*step,wz=center[1]-size/2+(z+0.5)*step;
            const gx=Math.max(0,Math.min(this.columns-1,(wx-this.minX)/this.dx));
            const gz=Math.max(0,Math.min(this.rows-1,(wz-this.minZ)/this.dz));
            const a=Math.min(this.columns-2,Math.floor(gx)),b=Math.min(this.rows-2,Math.floor(gz)),tx=gx-a,tz=gz-b;
            const i=b*this.columns+a;
            const sample=(array,stride,component)=>
                (array[i*stride+component]*(1-tx)+array[(i+1)*stride+component]*tx)*(1-tz)+
                (array[(i+this.columns)*stride+component]*(1-tx)+array[(i+this.columns+1)*stride+component]*tx)*tz;
            const h=sample(this.state,4,1);if(h<0.02)continue;
            let nx=sample(this.normals,3,0),ny=sample(this.normals,3,1),nz=sample(this.normals,3,2);
            const ax=wx-settings.flowDirection[0]*settings.flowSpeed*this.time,az=wz-settings.flowDirection[1]*settings.flowSpeed*this.time;
            const wetT=Math.max(0,Math.min(1,(h-0.025)/0.195)), wetRipple=wetT*wetT*(3-2*wetT);
            this.detailSpectrum.sample(ax,az,detailSlope);
            nx-=detailSlope.x*activity*styleGain*wetRipple;
            nz-=detailSlope.z*activity*styleGain*wetRipple;
            const norm=Math.hypot(nx,ny,nz);nx/=norm;ny/=norm;nz/=norm;
            const dot=nx*ix+ny*iy+nz*iz,k=1-eta*eta*(1-dot*dot);if(k<=0)continue;
            const q=eta*dot+Math.sqrt(k),rx=eta*ix-q*nx,ry=eta*iy-q*ny,rz=eta*iz-q*nz;if(ry>=-0.02)continue;
            const surfaceY=sample(this.state,4,0);
            let distance=-h/ry;
            // Refine the intersection against the receiving bed, rather
            // than stopping on a horizontal plane beneath the source ray.
            for(let refine=0;refine<2;refine++) distance=Math.max(0,(this.bed(wx+rx*distance,wz+rz*distance)-surfaceY)/ry);
            const fx=x+rx*distance/step,fz=z+rz*distance/step;
            const x0=Math.floor(fx),z0=Math.floor(fz),u=fx-x0,v=fz-z0;
            const energy=Math.max(0,-dot)*Math.exp(-distance*0.08);
            for(let dz=0;dz<2;dz++)for(let dx=0;dx<2;dx++){
                const xx=x0+dx,zz=z0+dz;if(xx>=0&&xx<n&&zz>=0&&zz<n)this.causticWork[zz*n+xx]+=energy*(dx?u:1-u)*(dz?v:1-v);
            }
        }
        const flatRayY=Math.sqrt(1-eta*eta*(1-iy*iy));
        for(let i=0;i<n*n;i++){
            const wx=center[0]-size/2+(i%n+0.5)*step,wz=center[1]-size/2+(Math.floor(i/n)+0.5)*step;
            const depth=Math.max(0,this.level-this.bed(wx,wz));
            // Display the focusing excess over an unperturbed interface.
            // A perfectly flat tank must not create a glowing caustic wash.
            const unfocused=Math.abs(iy)*Math.exp(-depth/flatRayY*0.08);
            const focused=Math.max(0,this.causticWork[i]-unfocused);
            this.light[i*4]=this.light[i*4+1]=this.light[i*4+2]=focused*3;
            this.light[i*4+3]=1;
        }
    }
    // PlaneGeometry's diagonal is (x+1,z)--(x,z+1). Matching this, rather than
    // bilinear sampling, makes contact height equal the rendered triangles.
    sample(x, z, out = {}) {
        const gx = Math.max(0, Math.min(this.columns - 1, (x - this.minX) / this.dx)), gz = Math.max(0, Math.min(this.rows - 1, (z - this.minZ) / this.dz));
        const ix = Math.min(this.columns - 2, Math.floor(gx)), iz = Math.min(this.rows - 2, Math.floor(gz)), tx = gx - ix, tz = gz - iz;
        const i = iz * this.columns + ix, ids = tx + tz <= 1 ? [i, i + 1, i + this.columns] : [i + this.columns + 1, i + this.columns, i + 1];
        const weights = tx + tz <= 1 ? [1 - tx - tz, tx, tz] : [tx + tz - 1, 1 - tx, 1 - tz];
        for (const [key, offset] of [['height', 0], ['depth', 1], ['velocityX', 2], ['velocityZ', 3]])
            out[key] = ids.reduce((sum, id, k) => sum + this.state[id * 4 + offset] * weights[k], 0);
        out.wet = out.depth > 0.002;
        if(this.options.shorelineAxis === 'z') {
            const edge=this.shoreContour[ix]*(1-tx)+this.shoreContour[ix+1]*tx;
            out.wet=out.depth>0&&z<edge;
        }
        return out;
    }
    impulse(x, z, strength, radius) {
        if (!this.gridSignature)
            this.update(0);
        if (this.hydro)
            this.hydro.impulse(x, z, strength, radius);
        else {
            if (!this.interactions)
                this.interactions = new WaterHydrodynamics({ columns: this.columns, rows: this.rows,
                    width: this.surface.width, depth: this.surface.depth, centerX: this.x, centerZ: this.z, waterLevel: this.level, bedHeight: this.bed,
                    boundary: () => true, friction: 0.02 });
            this.interactions.impulse(x, z, strength, radius);
        }
    }
    shoreEdgeAt(x = 0, minimumDepth = 0.005) {
        if (!this.hydro) return null;
        const ix = Math.max(0, Math.min(this.columns-1, Math.round((x-this.minX)/this.dx)));
        let edge = null;
        // Follow the connected water from the incoming boundary; ignore any
        // isolated residual puddle when reporting uprush/backwash position.
        for(let z=0;z<this.rows-1;z++) {
            const a=this.state[(z*this.columns+ix)*4+1], b=this.state[((z+1)*this.columns+ix)*4+1];
            if(a>=minimumDepth && b<minimumDepth) {
                edge=this.minZ+(z+(a-minimumDepth)/Math.max(a-b,1e-8))*this.dz;
                break;
            }
        }
        return edge;
    }
    diagnostics() { return this.hydro?.diagnostics() ?? { time: this.time, model: 'spectral', bands: 3, peakLength: this.spectrum.peakLength }; }
    dispose() { this.foamParticles?.dispose(); this.foamCoordinateTexture.dispose(); this.renderExtension?.dispose(); this.detailSpectrum.dispose(); this.texture.dispose(); this.causticTexture.dispose(); for (const texture of this.normalTextures)
        texture.dispose(); }
}
