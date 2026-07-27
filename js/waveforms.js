/**
 * Cardiac Monitor Waveform Math Engine - Extended Edition
 * Supports 17 Cardiac Rhythms, SpO2 PPG, Respiration, EtCO2 Capnography, Arterial Line IBP,
 * 12-Lead ECG Projections, and Pharmacodynamic Medication Modifiers.
 */

class WaveformGenerator {
    constructor() {
        this.sampleRate = 500; // Hz
        this.phase = 0; // Current beat phase (0.0 to 1.0)
        this.time = 0; // Total time in seconds
        this.beatCount = 0;
        this.currentRhythm = 'nsr';
        this.targetBpm = 75;
        this.pvcActive = false;
        this.nextPvcInBeats = 4;
        
        // Dynamic state tracking for sounds & triggers
        this.justTriggeredR = false;
        this.torsadesAmplitude = 1.0;
        this.torsadesPhase = 0;

        // Pharmacodynamic Medication Modifiers
        this.medEffects = {
            hrOffset: 0,
            sysBpOffset: 0,
            diaBpOffset: 0,
            stElevOffset: 0,
            transientPause: false
        };
    }

    setRhythm(rhythmKey) {
        this.currentRhythm = rhythmKey;
        this.phase = 0;
        this.beatCount = 0;
        this.justTriggeredR = false;

        const defaultBpms = {
            'nsr': 72,
            'brady': 45,
            'tachy': 135,
            'afib': 110,
            'aflutter': 140,
            'pvc': 75,
            'vtach': 170,
            'vfib': 0,
            'asystole': 0,
            'stemi': 85,
            'ischemia': 80,
            'avblock1': 65,
            'avblock2_1': 60,
            'avblock2_2': 50,
            'avblock3': 38,
            'torsades': 200,
            'pacemaker': 70
        };

        if (defaultBpms[rhythmKey] !== undefined) {
            this.targetBpm = defaultBpms[rhythmKey];
        }
    }

    setBpm(bpm) {
        this.targetBpm = Math.max(20, Math.min(250, bpm));
    }

    gaussian(x, a, b, c) {
        return a * Math.exp(-Math.pow(x - b, 2) / (2 * Math.pow(c, 2)));
    }

    generatePQRST(p, options = {}) {
        const {
            pAmp = 0.15,
            pWidth = 0.04,
            pPos = 0.12,
            qAmp = -0.15,
            rAmp = 1.2,
            rWidth = 0.012,
            rPos = 0.3,
            sAmp = -0.3,
            stElev = 0.0,
            tAmp = 0.25,
            tWidth = 0.06,
            tPos = 0.55,
            hasP = true,
            pacerSpike = false
        } = options;

        let val = 0;

        // Pacer Spike
        if (pacerSpike && Math.abs(p - (rPos - 0.03)) < 0.003) {
            return 1.6;
        }

        // P Wave
        if (hasP) {
            val += this.gaussian(p, pAmp, pPos, pWidth);
        }

        // Q Wave
        val += this.gaussian(p, qAmp, rPos - 0.02, 0.008);

        // R Wave
        const rVal = this.gaussian(p, rAmp, rPos, rWidth);
        if (rVal > 0.8 && !this.justTriggeredR) {
            this.justTriggeredR = true;
        }
        val += rVal;

        // S Wave
        val += this.gaussian(p, sAmp, rPos + 0.02, 0.009);

        // ST Segment (including medication offset)
        const totalStElev = stElev + this.medEffects.stElevOffset;
        if (totalStElev !== 0 && p > rPos + 0.03 && p < tPos + 0.08) {
            const stFactor = Math.sin(((p - (rPos + 0.03)) / (tPos + 0.08 - (rPos + 0.03))) * Math.PI);
            val += totalStElev * stFactor;
        }

        // T Wave
        val += this.gaussian(p, tAmp, tPos, tWidth);

        return val;
    }

    /**
     * 12-Lead ECG Projection Generator
     */
    generate12LeadSample(lead, p) {
        const base = this.generatePQRST(p);

        // Lead-specific vector transformations
        switch (lead) {
            case 'I':   return base * 0.7 + this.gaussian(p, 0.1, 0.12, 0.04);
            case 'II':  return base; // Standard reference
            case 'III': return base * 0.5 - this.gaussian(p, 0.15, 0.3, 0.012);
            case 'aVR': return -base * 0.8; // Inverted in aVR
            case 'aVL': return base * 0.4 + this.gaussian(p, -0.1, 0.55, 0.06);
            case 'aVF': return base * 0.85;
            case 'V1':  return -this.gaussian(p, 0.2, 0.28, 0.01) + this.gaussian(p, -0.9, 0.31, 0.015) + this.gaussian(p, -0.2, 0.55, 0.06);
            case 'V2':  return -this.gaussian(p, 0.3, 0.28, 0.01) + this.gaussian(p, -1.2, 0.31, 0.015) + this.gaussian(p, 0.3, 0.55, 0.06);
            case 'V3':  return this.gaussian(p, 0.6, 0.3, 0.015) - this.gaussian(p, 0.5, 0.32, 0.015) + this.gaussian(p, 0.35, 0.55, 0.06);
            case 'V4':  return this.gaussian(p, 1.4, 0.3, 0.012) - this.gaussian(p, 0.3, 0.32, 0.015) + this.gaussian(p, 0.3, 0.55, 0.06);
            case 'V5':  return this.gaussian(p, 1.2, 0.3, 0.012) - this.gaussian(p, 0.2, 0.32, 0.015) + this.gaussian(p, 0.25, 0.55, 0.06);
            case 'V6':  return this.gaussian(p, 0.9, 0.3, 0.012) - this.gaussian(p, 0.1, 0.32, 0.015) + this.gaussian(p, 0.2, 0.55, 0.06);
            default:    return base;
        }
    }

    getNextSample(dt) {
        this.time += dt;
        this.justTriggeredR = false;

        if (this.medEffects.transientPause) {
            // Adenosine transient AV block pause
            return {
                ecg: (Math.random() - 0.5) * 0.02,
                pleth: 0.01,
                resp: this.generateRespSample(),
                etco2: this.generateEtco2Sample(),
                aline: 0.05,
                justTriggeredR: false
            };
        }

        const rhythm = this.currentRhythm;
        let ecg = 0;

        const effectiveBpm = Math.max(20, this.targetBpm + this.medEffects.hrOffset);
        let beatDuration = 60.0 / effectiveBpm;

        this.phase += dt / beatDuration;

        if (this.phase >= 1.0) {
            this.phase -= 1.0;
            this.beatCount++;
            
            if (rhythm === 'pvc') {
                this.nextPvcInBeats--;
                if (this.nextPvcInBeats <= 0) {
                    this.pvcActive = true;
                    this.nextPvcInBeats = 3 + Math.floor(Math.random() * 4);
                } else {
                    this.pvcActive = false;
                }
            }
        }

        const p = this.phase;

        switch (rhythm) {
            case 'nsr':
            case 'brady':
            case 'tachy':
                ecg = this.generatePQRST(p);
                break;
            case 'stemi':
                ecg = this.generatePQRST(p, { stElev: 0.45, tAmp: 0.4, rAmp: 1.1 });
                break;
            case 'ischemia':
                ecg = this.generatePQRST(p, { stElev: -0.25, tAmp: -0.15 });
                break;
            case 'pvc':
                if (this.pvcActive) {
                    ecg = this.gaussian(p, -0.3, 0.25, 0.02) +
                          this.gaussian(p, 1.8, 0.32, 0.035) +
                          this.gaussian(p, -0.8, 0.42, 0.03) +
                          this.gaussian(p, -0.4, 0.60, 0.08);
                    if (p > 0.31 && p < 0.35 && !this.justTriggeredR) this.justTriggeredR = true;
                } else {
                    ecg = this.generatePQRST(p);
                }
                break;
            case 'afib': {
                const fibNoise = (Math.sin(this.time * 37) * 0.05) + (Math.cos(this.time * 59) * 0.04) + ((Math.random() - 0.5) * 0.05);
                ecg = this.generatePQRST(p, { hasP: false }) + fibNoise;
                break;
            }
            case 'aflutter': {
                const flutterFreq = 5.0;
                const sawtooth = (Math.sin(this.time * flutterFreq * Math.PI * 2) * 0.15) + (Math.cos(this.time * flutterFreq * Math.PI * 4) * 0.05);
                ecg = this.generatePQRST(p, { hasP: false }) + sawtooth;
                break;
            }
            case 'vtach': {
                const vtachFreq = (effectiveBpm / 60.0);
                const vtPhase = (this.time * vtachFreq) % 1.0;
                ecg = Math.sin(vtPhase * Math.PI * 2) * 0.9 + this.gaussian(vtPhase, 1.2, 0.3, 0.05) - 0.2;
                if (vtPhase > 0.28 && vtPhase < 0.32 && !this.justTriggeredR) this.justTriggeredR = true;
                break;
            }
            case 'vfib': {
                const c1 = Math.sin(this.time * 7.3);
                const c2 = Math.cos(this.time * 11.7);
                const c3 = Math.sin(this.time * 19.1);
                ecg = (c1 * 0.4 + c2 * 0.3 + c3 * 0.2 + (Math.random() - 0.5) * 0.2);
                break;
            }
            case 'asystole':
                ecg = (Math.random() - 0.5) * 0.03 + Math.sin(this.time * 0.5) * 0.04;
                break;
            case 'avblock1':
                ecg = this.generatePQRST(p, { pPos: 0.05, rPos: 0.35 });
                break;
            case 'avblock2_1': {
                const cycleBeat = this.beatCount % 4;
                if (cycleBeat === 3) ecg = this.gaussian(p, 0.18, 0.15, 0.04);
                else ecg = this.generatePQRST(p, { pPos: 0.12 - (cycleBeat * 0.05), rPos: 0.32 });
                break;
            }
            case 'avblock2_2': {
                const cycleBeat = this.beatCount % 2;
                if (cycleBeat === 1) ecg = this.gaussian(p, 0.18, 0.15, 0.04);
                else ecg = this.generatePQRST(p);
                break;
            }
            case 'avblock3': {
                const pFreq = 75.0 / 60.0;
                const pLocalPhase = (this.time * pFreq) % 1.0;
                ecg = this.gaussian(pLocalPhase, 0.18, 0.15, 0.04) + this.generatePQRST(p, { hasP: false, rWidth: 0.025, rAmp: 0.9 });
                break;
            }
            case 'torsades': {
                this.torsadesPhase += dt * 0.8;
                const ampMod = 0.3 + 0.9 * Math.abs(Math.sin(this.torsadesPhase));
                const vtachFreq = (effectiveBpm / 60.0);
                const vtPhase = (this.time * vtachFreq) % 1.0;
                ecg = (Math.sin(vtPhase * Math.PI * 2) * 0.8 + this.gaussian(vtPhase, 1.1, 0.3, 0.06)) * ampMod;
                if (vtPhase > 0.28 && vtPhase < 0.32 && !this.justTriggeredR) this.justTriggeredR = true;
                break;
            }
            case 'pacemaker':
                ecg = this.generatePQRST(p, { pacerSpike: true });
                break;
            default:
                ecg = this.generatePQRST(p);
                break;
        }

        ecg += (Math.random() - 0.5) * 0.015;

        const pleth = this.generatePlethSample(p, rhythm);
        const resp = this.generateRespSample();
        const etco2 = this.generateEtco2Sample();
        const aline = this.generateAlineSample(p, rhythm);

        return { ecg, pleth, resp, etco2, aline, justTriggeredR: this.justTriggeredR };
    }

    generatePlethSample(p, rhythm) {
        if (rhythm === 'asystole' || rhythm === 'vfib') return 0.02 + (Math.random() - 0.5) * 0.01;
        let val = 0;
        if (p >= 0.3 && p <= 0.85) {
            const sysP = (p - 0.3) / 0.55;
            val = Math.sin(sysP * Math.PI) * 0.85;
            if (sysP > 0.35 && sysP < 0.6) val += Math.sin((sysP - 0.35) * Math.PI * 4) * 0.12;
        }
        return Math.max(0, val);
    }

    generateRespSample() {
        const respFreq = 14 / 60.0;
        const respPhase = (this.time * respFreq) % 1.0;
        return Math.sin(respPhase * Math.PI * 2) * 0.6 + Math.sin(respPhase * Math.PI * 4) * 0.1;
    }

    /**
     * Capnography (EtCO2) Waveform Model (Trapezoidal Expiratory Capnogram)
     */
    generateEtco2Sample() {
        if (this.currentRhythm === 'asystole') return 0;
        const respFreq = 14 / 60.0;
        const respPhase = (this.time * respFreq) % 1.0;

        let val = 0;
        // Expiration phase (0.25 to 0.70 of respiratory cycle)
        if (respPhase >= 0.25 && respPhase <= 0.70) {
            const expP = (respPhase - 0.25) / 0.45;
            if (expP < 0.15) {
                val = (expP / 0.15) * 0.85; // Expiratory upstroke (Phase II)
            } else if (expP < 0.85) {
                val = 0.85 + ((expP - 0.15) / 0.7) * 0.15; // Alveolar plateau (Phase III ~ 38 mmHg)
            } else {
                val = 1.0 - ((expP - 0.85) / 0.15); // Inspiratory downstroke (Phase IV)
            }
        }
        return Math.max(0, val);
    }

    /**
     * Arterial Line (A-Line / IBP) Continuous Waveform Model
     */
    generateAlineSample(p, rhythm) {
        if (rhythm === 'asystole' || rhythm === 'vfib') return 0.05 + (Math.random() - 0.5) * 0.02;

        let val = 0.1; // Diastolic baseline
        if (p >= 0.3 && p <= 0.80) {
            const sysP = (p - 0.3) / 0.50;
            if (sysP < 0.25) {
                val = 0.1 + (sysP / 0.25) * 0.85; // Rapid systolic rise
            } else if (sysP < 0.45) {
                val = 0.95 - ((sysP - 0.25) / 0.2) * 0.35; // Systolic peak decay
            } else if (sysP < 0.55) {
                val = 0.60 + Math.sin((sysP - 0.45) * Math.PI * 10) * 0.1; // Dicrotic notch!
            } else {
                val = 0.60 - ((sysP - 0.55) / 0.45) * 0.50; // Diastolic decay
            }
        }
        return Math.max(0.05, val);
    }
}

if (typeof window !== 'undefined') {
    window.WaveformGenerator = WaveformGenerator;
}
