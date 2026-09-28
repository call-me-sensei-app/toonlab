// Conservative finite-volume Saint-Venant solver for finite authored water.
// Hydrostatic reconstruction + HLL flux (Audusse et al., 2004).
// h [m], qx/qz [m²/s]; no authored run-up curve or hidden water source.
const G = 9.81;
const DRY = 1e-5;
export class WaterHydrodynamics {
    constructor({ columns = 96, rows = 96, width = 60, depth = 60, centerX = 0, centerZ = 0, waterLevel = 0, bedHeight = () => -2, boundary = null, friction = 0.018 } = {}) {
        if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 3 || rows < 3 || !Number.isFinite(width) || !Number.isFinite(depth) || width <= 0 || depth <= 0)
            throw new RangeError('Invalid water grid');
        Object.assign(this, { columns, rows, width, depth, centerX, centerZ, waterLevel, boundary, friction });
        this.dx = width / (columns - 1);
        this.dz = depth / (rows - 1);
        this.minX = centerX - width / 2;
        this.minZ = centerZ - depth / 2;
        this.length = columns * rows;
        for (const key of ['bed', 'h', 'qx', 'qz', 'dh', 'dqx', 'dqz', 'foam', 'nextFoam', 'dFoamMass', 'moisture']) {
            this[key] = new Float64Array(this.length);
        }
        for (let z = 0; z < rows; z++)
            for (let x = 0; x < columns; x++) {
                const i = z * columns + x;
                this.bed[i] = bedHeight(this.minX + x * this.dx, this.minZ + z * this.dz);
                if (!Number.isFinite(this.bed[i]))
                    throw new TypeError('Non-finite water bed');
                this.h[i] = Math.max(0, waterLevel - this.bed[i]);
            }
        this.time = 0;
        this.boundaryVolume = 0;
        this.roundoffVolume = 0;
        this.initialVolume = this.volume();
        this.steps = 0;
        this.foamLifetime = 4;
        this.foamResidueLifetime = 10;
        this.ghost = { h: 0, qx: 0, qz: 0, bed: 0 };
    }
    volume() { return this.h.reduce((a, h) => a + h, 0) * this.dx * this.dz; }
    diagnostics() {
        return { time: this.time, steps: this.steps, volume: this.volume(), boundaryVolume: this.boundaryVolume,
            massError: this.volume() - this.initialVolume - this.boundaryVolume - this.roundoffVolume,
            roundoffVolume: this.roundoffVolume, minDepth: this.h.reduce((a, h) => Math.min(a, h), Infinity) };
    }
    // A momentum impulse moves water without injecting mass. Direction is
    // radial for a splash; wakes can supply an explicit horizontal direction.
    impulse(x, z, strength = 0.2, radius = 0.8, direction = null) {
        const r = Math.max(radius, Math.min(this.dx, this.dz));
        for (let iz = Math.max(0, Math.floor((z - r * 3 - this.minZ) / this.dz)); iz <= Math.min(this.rows - 1, Math.ceil((z + r * 3 - this.minZ) / this.dz)); iz++) {
            for (let ix = Math.max(0, Math.floor((x - r * 3 - this.minX) / this.dx)); ix <= Math.min(this.columns - 1, Math.ceil((x + r * 3 - this.minX) / this.dx)); ix++) {
                const i = iz * this.columns + ix, rx = this.minX + ix * this.dx - x, rz = this.minZ + iz * this.dz - z;
                const d = Math.hypot(rx, rz), weight = Math.exp(-d * d / (2 * r * r)) * strength;
                this.qx[i] += this.h[i] * weight * (direction?.[0] ?? rx / Math.max(d, r * 0.1));
                this.qz[i] += this.h[i] * weight * (direction?.[1] ?? rz / Math.max(d, r * 0.1));
            }
        }
    }
    face(left, right, axis, dt) {
        const { h, qx, qz, bed, dh, dqx, dqz } = this;
        const ghost = this.ghost;
        const hL = left < 0 ? ghost.h : h[left], hR = right < 0 ? ghost.h : h[right];
        const bL = left < 0 ? ghost.bed : bed[left], bR = right < 0 ? ghost.bed : bed[right];
        const uL = hL > DRY ? (left < 0 ? ghost.qx : qx[left]) / hL : 0;
        const vL = hL > DRY ? (left < 0 ? ghost.qz : qz[left]) / hL : 0;
        const uR = hR > DRY ? (right < 0 ? ghost.qx : qx[right]) / hR : 0;
        const vR = hR > DRY ? (right < 0 ? ghost.qz : qz[right]) / hR : 0;
        const crest = Math.max(bL, bR);
        const a = Math.max(0, hL + bL - crest), b = Math.max(0, hR + bR - crest);
        const normalL = axis === 0 ? uL : vL, normalR = axis === 0 ? uR : vR;
        // Two-sided HLL wave speeds retain an advancing bore more clearly
        // than a single maximum-speed viscosity in every direction.
        const cL = Math.sqrt(G*a), cR = Math.sqrt(G*b);
        const sL = Math.min(0, normalL-cL, normalR-cR, a<=DRY ? normalR-2*cR : Infinity);
        const sR = Math.max(0, normalL+cL, normalR+cR, b<=DRY ? normalL+2*cL : -Infinity);
        const width = Math.max(sR-sL, 1e-8);
        const flux = (fL,fR,delta) => (sR*fL-sL*fR+sL*sR*delta)/width;
        const mass = flux(a*normalL,b*normalR,b-a);
        // Transport aeration with the very same water flux. Sampling a
        // concentration backwards into dry cells diluted the leading swash
        // foam to zero even while aerated water was entering those cells.
        const foamFlux = mass * (mass >= 0 ? (left < 0 ? 0 : this.foam[left]) : (right < 0 ? 0 : this.foam[right]));
        const fx = flux(a*normalL*uL+(axis===0?G*a*a*0.5:0), b*normalR*uR+(axis===0?G*b*b*0.5:0),b*uR-a*uL);
        const fz = flux(a*normalL*vL+(axis===1?G*a*a*0.5:0), b*normalR*vR+(axis===1?G*b*b*0.5:0),b*vR-a*vL);
        const scale = dt / (axis === 0 ? this.dx : this.dz);
        if (left >= 0) {
            dh[left] -= scale * mass;
            this.dFoamMass[left] -= scale * foamFlux;
            dqx[left] -= scale * (fx + (axis === 0 ? G * (hL * hL - a * a) * 0.5 : 0));
            dqz[left] -= scale * (fz + (axis === 1 ? G * (hL * hL - a * a) * 0.5 : 0));
        }
        else
            this.boundaryVolume += mass * dt * (axis === 0 ? this.dz : this.dx);
        if (right >= 0) {
            dh[right] += scale * mass;
            this.dFoamMass[right] += scale * foamFlux;
            dqx[right] += scale * (fx + (axis === 0 ? G * (hR * hR - b * b) * 0.5 : 0));
            dqz[right] += scale * (fz + (axis === 1 ? G * (hR * hR - b * b) * 0.5 : 0));
        }
        else
            this.boundaryVolume -= mass * dt * (axis === 0 ? this.dz : this.dx);
    }
    boundaryFace(i, side, axis, low, dt) {
        const { ghost } = this;
        ghost.h = this.h[i];
        ghost.qx = this.qx[i];
        ghost.qz = this.qz[i];
        ghost.bed = this.bed[i];
        const ix = i % this.columns, iz = Math.floor(i / this.columns);
        const handled = this.boundary?.(side, this.minX + ix * this.dx, this.minZ + iz * this.dz, this.time, ghost);
        if (!handled) {
            if (axis === 0)
                ghost.qx *= -1;
            else
                ghost.qz *= -1;
        }
        ghost.h = Math.max(0, ghost.h);
        this.face(low ? -1 : i, low ? i : -1, axis, dt);
    }
    advance(duration) {
        let remaining = Math.max(0, duration);
        while (remaining > 1e-9) {
            let rate = 1;
            for (let i = 0; i < this.length; i++) {
                const h = this.h[i], c = Math.sqrt(G * h);
                rate = Math.max(rate, ((h > DRY ? Math.abs(this.qx[i]) / h : 0) + c) / this.dx + ((h > DRY ? Math.abs(this.qz[i]) / h : 0) + c) / this.dz);
            }
            // Unsplit 2D CFL; include a conservative cap for external forcing.
            const dt = Math.min(remaining, 0.32 / rate, 1 / 120);
            this.step(dt);
            remaining -= dt;
        }
    }
    step(dt) {
        this.dh.fill(0);
        this.dqx.fill(0);
        this.dqz.fill(0);
        this.dFoamMass.fill(0);
        const nx = this.columns, nz = this.rows;
        for (let z = 0; z < nz; z++) {
            for (let x = 0; x < nx - 1; x++)
                this.face(z * nx + x, z * nx + x + 1, 0, dt);
            this.boundaryFace(z * nx, 'west', 0, true, dt);
            this.boundaryFace(z * nx + nx - 1, 'east', 0, false, dt);
        }
        for (let x = 0; x < nx; x++) {
            for (let z = 0; z < nz - 1; z++)
                this.face(z * nx + x, (z + 1) * nx + x, 1, dt);
            this.boundaryFace(x, 'south', 1, true, dt);
            this.boundaryFace((nz - 1) * nx + x, 'north', 1, false, dt);
        }
        for (let i = 0; i < this.length; i++) {
            const next = this.h[i] + this.dh[i];
            const foamMass = this.h[i] * this.foam[i] + this.dFoamMass[i];
            this.nextFoam[i] = next > DRY ? Math.max(0,Math.min(1,foamMass/next)) : this.foam[i];
            if (!Number.isFinite(next) || next < -1e-7)
                throw new Error(`Unstable water depth at ${i}: ${next}`);
            if (next < 0)
                this.roundoffVolume -= next * this.dx * this.dz;
            this.h[i] = Math.max(next, 0);
            this.qx[i] += this.dqx[i];
            this.qz[i] += this.dqz[i];
            if (this.h[i] <= DRY) {
                this.qx[i] = 0;
                this.qz[i] = 0;
            }
            else {
                // Semi-implicit Manning bed friction removes energy, never water.
                const damping = 1 + dt * G * this.friction ** 2 * Math.hypot(this.qx[i], this.qz[i]) / Math.max(this.h[i] ** (7 / 3), 1e-7);
                this.qx[i] /= damping;
                this.qz[i] /= damping;
            }
        }
        // Foam is a passive visual tracer advected by the solved velocity.
        // Only converging, moving shallow water generates new aeration.
        for (let z = 0; z < nz; z++)
            for (let x = 0; x < nx; x++) {
                const i = z * nx + x, h = this.h[i], u = h > DRY ? this.qx[i] / h : 0, v = h > DRY ? this.qz[i] / h : 0;
                const left = i - (x > 0 ? 1 : 0), right = i + (x < nx - 1 ? 1 : 0), down = i - (z > 0 ? nx : 0), up = i + (z < nz - 1 ? nx : 0);
                const du = ((this.h[right] > DRY ? this.qx[right] / this.h[right] : 0) - (this.h[left] > DRY ? this.qx[left] / this.h[left] : 0)) / (2 * this.dx);
                const dv = ((this.h[up] > DRY ? this.qz[up] / this.h[up] : 0) - (this.h[down] > DRY ? this.qz[down] / this.h[down] : 0)) / (2 * this.dz);
                // Ordinary orbital convergence is not breaking: without a
                // shallow-flow gate every incoming swell filled with foam.
                // Aerate rapid, converging bores and wakes, then let their
                // tracer travel into slower backwash and decay there.
                const speed = Math.hypot(u, v);
                const froude = speed / Math.sqrt(G * Math.max(h, 0.025));
                const breaking = Math.max(0, Math.min(1, (froude - 0.45) / 0.45));
                const source = Math.max(0, -du - dv - 0.15) * breaking * Math.min(1, speed) * Math.min(1, h / 0.025);
                const transported = this.nextFoam[i];
                const lifetime = h > 0.002 ? this.foamLifetime : this.foamResidueLifetime;
                this.nextFoam[i] = Math.min(1, transported * Math.exp(-dt / Math.max(lifetime, 0.25)) + source * dt * 1.5);
                this.moisture[i] = h > 0.001 ? 1 : this.moisture[i] * Math.exp(-dt / 16);
            }
        [this.foam, this.nextFoam] = [this.nextFoam, this.foam];
        this.time += dt;
        this.steps++;
    }
    sampleArray(array, x, z) {
        x = Math.max(0, Math.min(this.columns - 1, x));
        z = Math.max(0, Math.min(this.rows - 1, z));
        const ix = Math.min(this.columns - 2, Math.floor(x)), iz = Math.min(this.rows - 2, Math.floor(z)), tx = x - ix, tz = z - iz, i = iz * this.columns + ix;
        return (array[i] * (1 - tx) + array[i + 1] * tx) * (1 - tz) + (array[i + this.columns] * (1 - tx) + array[i + this.columns + 1] * tx) * tz;
    }
    sample(x, z, out = {}) {
        const gx = (x - this.minX) / this.dx, gz = (z - this.minZ) / this.dz;
        out.depth = this.sampleArray(this.h, gx, gz);
        out.height = this.sampleArray(this.bed, gx, gz) + out.depth;
        out.velocityX = out.depth > DRY ? this.sampleArray(this.qx, gx, gz) / out.depth : 0;
        out.velocityZ = out.depth > DRY ? this.sampleArray(this.qz, gx, gz) / out.depth : 0;
        return out;
    }
}
