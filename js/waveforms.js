/**
 * Cardiac Monitor Waveform Math Engine
 * Generates realistic real-time ECG, SpO2 (PPG), and Respiration sample values.
 */

class WaveformGenerator {
    constructor() {
        this.sampleRate = 500; // Hz
        this.phase = 0; // Current beat phase (0.0 to 1.0)
        this.pPhase = 0; // Independent P wave phase for AV blocks
        this.time = 0; // Total time in seconds
        this.beatCount = 0;
        this.wenckebachBeat = 0;
        this.lastRBeatTime = 0;
        this.currentRhythm = 'nsr';
        this.targetBpm = 75;
        this.pvcActive = false;
        this.nextPvcInBeats = 4;
        
        // Dynamic state tracking for sounds & triggers
        this.justTriggeredR = false;
        this.torsadesAmplitude = 1.0;
        this.torsadesPhase = 0;
    }

    setRhythm(rhythmKey) {
        this.currentRhythm = rhythmKey;
        this.phase = 0;
        this.pPhase = 0;
        this.wenckebachBeat = 0;
        this.beatCount = 0;
        this.justTriggeredR = false;

        // Default BPM presets for rhythms
        const defaultBpms = {
            'nsr': 72,
            'brady': 45,
            'tachy': 135,
            'afib': 110,
            'aflutter': 140,
            'pvc': 75,
            'vtach': 170,
            'vfib': 0, // chaotic
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

    /**
     * Helper to compute a Gaussian curve: a * exp(-((x - b)^2) / (2 * c^2))
     */
    gaussian(x, a, b, c) {
        return a * Math.exp(-Math.pow(x - b, 2) / (2 * Math.pow(c, 2)));
    }

    /**
     * Generates a standard P-QRS-T complex given phase in [0, 1]
     */
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
            return 1.6; // Vertical spike
        }

        // P Wave
        if (hasP) {
            val += this.gaussian(p, pAmp, pPos, pWidth);
        }

        // Q Wave
        val += this.gaussian(p, qAmp, rPos - 0.02, 0.008);

        // R Wave (Depolarization)
        const rVal = this.gaussian(p, rAmp, rPos, rWidth);
        if (rVal > 0.8 && !this.justTriggeredR) {
            this.justTriggeredR = true;
        }
        val += rVal;

        // S Wave
        val += this.gaussian(p, sAmp, rPos + 0.02, 0.009);

        // ST Segment elevation / depression
        if (stElev !== 0 && p > rPos + 0.03 && p < tPos + 0.08) {
            const stFactor = Math.sin(((p - (rPos + 0.03)) / (tPos + 0.08 - (rPos + 0.03))) * Math.PI);
            val += stElev * stFactor;
        }

        // T Wave (Repolarization)
        val += this.gaussian(p, tAmp, tPos, tWidth);

        return val;
    }

    /**
     * Main step function called at sampleRate (e.g. 500Hz)
     */
    getNextSample(dt) {
        this.time += dt;
        this.justTriggeredR = false;

        const rhythm = this.currentRhythm;
        let ecg = 0;
        let pacerSpike = false;

        // Base beat duration in seconds
        const currentBpm = Math.max(20, this.targetBpm);
        let beatDuration = 60.0 / currentBpm;

        // Advance phase
        this.phase += dt / beatDuration;

        if (this.phase >= 1.0) {
            this.phase -= 1.0;
            this.beatCount++;
            
            // Check PVC occurrence logic
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
                // Raised ST elevation + tall T wave
                ecg = this.generatePQRST(p, { stElev: 0.45, tAmp: 0.4, rAmp: 1.1 });
                break;

            case 'ischemia':
                // ST depression + inverted/flat T wave
                ecg = this.generatePQRST(p, { stElev: -0.25, tAmp: -0.15 });
                break;

            case 'pvc':
                if (this.pvcActive) {
                    // PVC: Wide QRS, no P wave, inverted T wave, high amplitude
                    ecg = this.gaussian(p, -0.3, 0.25, 0.02) +
                          this.gaussian(p, 1.8, 0.32, 0.035) +
                          this.gaussian(p, -0.8, 0.42, 0.03) +
                          this.gaussian(p, -0.4, 0.60, 0.08); // inverted T
                    if (p > 0.31 && p < 0.35 && !this.justTriggeredR) this.justTriggeredR = true;
                } else {
                    ecg = this.generatePQRST(p);
                }
                break;

            case 'afib': {
                // Irregular RR intervals + baseline fibrillatory noise
                const fibNoise = (Math.sin(this.time * 37) * 0.05) + (Math.cos(this.time * 59) * 0.04) + ((Math.random() - 0.5) * 0.05);
                ecg = this.generatePQRST(p, { hasP: false }) + fibNoise;
                break;
            }

            case 'aflutter': {
                // Sawtooth baseline F-waves (~300 bpm frequency)
                const flutterFreq = 5.0; // 5 Hz = 300 bpm
                const sawtooth = (Math.sin(this.time * flutterFreq * Math.PI * 2) * 0.15) + (Math.cos(this.time * flutterFreq * Math.PI * 4) * 0.05);
                ecg = this.generatePQRST(p, { hasP: false }) + sawtooth;
                break;
            }

            case 'vtach': {
                // Monomorphic wide-complex tachycardia
                const vtachFreq = (this.targetBpm / 60.0);
                const vtPhase = (this.time * vtachFreq) % 1.0;
                ecg = Math.sin(vtPhase * Math.PI * 2) * 0.9 + 
                      this.gaussian(vtPhase, 1.2, 0.3, 0.05) - 0.2;
                if (vtPhase > 0.28 && vtPhase < 0.32 && !this.justTriggeredR) this.justTriggeredR = true;
                break;
            }

            case 'vfib': {
                // Coarse / fine chaotic fibrillatory wave
                const c1 = Math.sin(this.time * 7.3);
                const c2 = Math.cos(this.time * 11.7);
                const c3 = Math.sin(this.time * 19.1);
                const noise = (Math.random() - 0.5) * 0.2;
                ecg = (c1 * 0.4 + c2 * 0.3 + c3 * 0.2 + noise);
                break;
            }

            case 'asystole': {
                // Flatline with subtle wander and electrical noise
                const noise = (Math.random() - 0.5) * 0.03;
                const drift = Math.sin(this.time * 0.5) * 0.04;
                ecg = noise + drift;
                break;
            }

            case 'avblock1':
                // Prolonged PR interval (P wave shifted left / earlier relative to QRS)
                ecg = this.generatePQRST(p, { pPos: 0.05, rPos: 0.35 });
                break;

            case 'avblock2_1': {
                // Mobitz I (Wenckebach): PR lengthens over 3 beats, 4th beat drops QRS
                const cycleBeat = this.beatCount % 4;
                if (cycleBeat === 3) {
                    // Dropped QRS (P wave only)
                    ecg = this.gaussian(p, 0.18, 0.15, 0.04);
                } else {
                    const extraPR = cycleBeat * 0.05;
                    ecg = this.generatePQRST(p, { pPos: 0.12 - extraPR, rPos: 0.32 });
                }
                break;
            }

            case 'avblock2_2': {
                // Mobitz II: 2:1 conduction - alternate beat drops QRS
                const cycleBeat = this.beatCount % 2;
                if (cycleBeat === 1) {
                    ecg = this.gaussian(p, 0.18, 0.15, 0.04); // P wave only
                } else {
                    ecg = this.generatePQRST(p);
                }
                break;
            }

            case 'avblock3': {
                // Complete Heart Block: P waves at 75 bpm independent of escape QRS at 38 bpm
                const pFreq = 75.0 / 60.0;
                const pLocalPhase = (this.time * pFreq) % 1.0;
                const pWaveVal = this.gaussian(pLocalPhase, 0.18, 0.15, 0.04);

                // Escape QRS
                const qrsVal = this.generatePQRST(p, { hasP: false, rWidth: 0.025, rAmp: 0.9 });
                ecg = pWaveVal + qrsVal;
                break;
            }

            case 'torsades': {
                // Twisting of points: amplitude modulates sinusoidally
                this.torsadesPhase += dt * 0.8;
                const ampMod = 0.3 + 0.9 * Math.abs(Math.sin(this.torsadesPhase));
                const vtachFreq = (this.targetBpm / 60.0);
                const vtPhase = (this.time * vtachFreq) % 1.0;
                const rawVt = Math.sin(vtPhase * Math.PI * 2) * 0.8 + this.gaussian(vtPhase, 1.1, 0.3, 0.06);
                ecg = rawVt * ampMod;
                if (vtPhase > 0.28 && vtPhase < 0.32 && !this.justTriggeredR) this.justTriggeredR = true;
                break;
            }

            case 'pacemaker':
                // Pacemaker spike before P/QRS
                ecg = this.generatePQRST(p, { pacerSpike: true });
                break;

            default:
                ecg = this.generatePQRST(p);
                break;
        }

        // Add subtle baseline muscle tremor / electrical noise (0.015)
        const baselineNoise = (Math.random() - 0.5) * 0.015;
        ecg += baselineNoise;

        // Generate Pleth (SpO2) sample synchronized with beat
        const pleth = this.generatePlethSample(p, rhythm);

        // Generate Respiration sample (independent ~14 bpm breathing cycle)
        const resp = this.generateRespSample();

        return { ecg, pleth, resp, justTriggeredR: this.justTriggeredR };
    }

    /**
     * SpO2 PPG waveform model
     */
    generatePlethSample(p, rhythm) {
        if (rhythm === 'asystole' || rhythm === 'vfib') {
            return 0.02 + (Math.random() - 0.5) * 0.01; // No pulse wave in arrest
        }

        // Systolic peak followed by dicrotic notch
        let val = 0;
        if (p >= 0.3 && p <= 0.85) {
            const sysP = (p - 0.3) / 0.55;
            val = Math.sin(sysP * Math.PI) * 0.85;
            // Dicrotic notch
            if (sysP > 0.35 && sysP < 0.6) {
                val += Math.sin((sysP - 0.35) * Math.PI * 4) * 0.12;
            }
        }
        return Math.max(0, val);
    }

    /**
     * Respiration waveform model (~14 breaths / min)
     */
    generateRespSample() {
        const respBpm = 14;
        const respFreq = respBpm / 60.0;
        const respPhase = (this.time * respFreq) % 1.0;
        // Smooth sine wave with slight asymmetry
        return Math.sin(respPhase * Math.PI * 2) * 0.6 + Math.sin(respPhase * Math.PI * 4) * 0.1;
    }
}

// Export global instance or module
if (typeof window !== 'undefined') {
    window.WaveformGenerator = WaveformGenerator;
}
