/**
 * Web Audio API Sound Synthesizer for Cardiac Monitor
 * Provides pitch-matched QRS beeps, medical alarm chimes, defib charge/shock, and NIBP audio effects.
 */

class AudioSynthesizer {
    constructor() {
        this.ctx = null;
        this.isMuted = false;
        this.volume = 0.7;
        this.alarmInterval = null;
        this.currentAlarmPriority = null; // 'high', 'warning', or null
    }

    init() {
        if (!this.ctx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContextClass();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    /**
     * Play hospital heart beat beep tone
     * Frequency shifts downward as SpO2 level decreases (100% -> 800Hz, 85% -> 480Hz)
     */
    playQrsBeep(spo2 = 98) {
        if (this.isMuted) return;
        this.init();
        if (!this.ctx) return;

        // Base frequency formula: 400 + (spo2 - 70) * 13.3
        const freq = Math.max(350, Math.min(1000, 400 + (spo2 - 70) * 13.3));
        const duration = 0.08; // 80 ms tone

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        // Envelope
        gain.gain.setValueAtTime(0, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(this.volume * 0.4, this.ctx.currentTime + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    /**
     * Start medical alarm chime sequence
     * @param {string} priority - 'high' (red alarm: VFib, VTach, Flatline) or 'warning' (yellow alarm)
     */
    startAlarm(priority = 'high') {
        if (this.currentAlarmPriority === priority) return;
        this.stopAlarm();
        this.currentAlarmPriority = priority;

        this.init();
        if (!this.ctx) return;

        if (priority === 'high') {
            // High priority IEC 60601-1-8 alarm chime: 5 notes sequence
            const notes = [523.25, 659.25, 783.99, 1046.50, 783.99]; // C5, E5, G5, C6, G5
            const noteDur = 0.12;

            const playPattern = () => {
                if (this.isMuted || this.currentAlarmPriority !== 'high') return;
                let now = this.ctx.currentTime;
                notes.forEach((freq, idx) => {
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();

                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(freq, now + idx * noteDur);

                    gain.gain.setValueAtTime(0, now + idx * noteDur);
                    gain.gain.linearRampToValueAtTime(this.volume * 0.5, now + idx * noteDur + 0.01);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + idx * noteDur + noteDur - 0.01);

                    osc.connect(gain);
                    gain.connect(this.ctx.destination);

                    osc.start(now + idx * noteDur);
                    osc.stop(now + idx * noteDur + noteDur);
                });
            };

            playPattern();
            this.alarmInterval = setInterval(playPattern, 1200);

        } else if (priority === 'warning') {
            // Yellow warning dual-tone beep
            const playWarning = () => {
                if (this.isMuted || this.currentAlarmPriority !== 'warning') return;
                const now = this.ctx.currentTime;
                [440, 554.37].forEach((freq, idx) => {
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, now + idx * 0.15);
                    gain.gain.setValueAtTime(0, now + idx * 0.15);
                    gain.gain.linearRampToValueAtTime(this.volume * 0.35, now + idx * 0.15 + 0.01);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.15 + 0.12);
                    osc.connect(gain);
                    gain.connect(this.ctx.destination);
                    osc.start(now + idx * 0.15);
                    osc.stop(now + idx * 0.15 + 0.14);
                });
            };

            playWarning();
            this.alarmInterval = setInterval(playWarning, 2500);
        }
    }

    stopAlarm() {
        if (this.alarmInterval) {
            clearInterval(this.alarmInterval);
            this.alarmInterval = null;
        }
        this.currentAlarmPriority = null;
    }

    /**
     * Defibrillator capacitor charging sound effect
     */
    playDefibCharge(durationSec = 2.5) {
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(1800, now + durationSec);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(this.volume * 0.4, now + 0.1);
        gain.gain.setValueAtTime(this.volume * 0.4, now + durationSec - 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + durationSec);
    }

    /**
     * Defibrillator shock discharge audio effect
     */
    playDefibShock() {
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        
        // Loud pop + noise discharge
        const bufferSize = this.ctx.sampleRate * 0.4;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.05));
        }

        const whiteNoise = this.ctx.createBufferSource();
        whiteNoise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(this.volume * 0.9, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        whiteNoise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        whiteNoise.start(now);
    }

    /**
     * NIBP Cuff deflation / inflation sound
     */
    playNibpSound() {
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(80, now + 1.2);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(this.volume * 0.2, now + 0.1);
        gain.gain.linearRampToValueAtTime(0.001, now + 1.2);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 1.2);
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.isMuted) {
            this.stopAlarm();
        }
        return this.isMuted;
    }

    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, vol));
    }
}

if (typeof window !== 'undefined') {
    window.AudioSynthesizer = AudioSynthesizer;
}
