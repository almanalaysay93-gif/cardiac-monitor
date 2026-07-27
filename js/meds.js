/**
 * ACLS Emergency Medication Panel & Pharmacodynamics Controller
 */

class MedicationController {
    constructor(waveformGenerator, audioSynthesizer, appController) {
        this.generator = waveformGenerator;
        this.audio = audioSynthesizer;
        this.app = appController;
    }

    giveMedication(medKey) {
        const meds = {
            'epi': {
                name: 'Epinephrine 1mg IV Push',
                action: () => {
                    this.generator.medEffects.hrOffset += 30;
                    this.app.currentNibp.sys += 35;
                    this.app.currentNibp.dia += 20;
                    this.app.currentNibp.map = Math.round((this.app.currentNibp.sys + 2 * this.app.currentNibp.dia) / 3);
                    this.app.showNotification('💊 Administered Epinephrine 1mg IV: HR & BP Increased', 'success');
                }
            },
            'amiodarone': {
                name: 'Amiodarone 300mg IV Bolus',
                action: () => {
                    const rhythm = this.generator.currentRhythm;
                    if (rhythm === 'vtach' || rhythm === 'vfib' || rhythm === 'torsades') {
                        setTimeout(() => {
                            this.generator.setRhythm('nsr');
                            this.app.selectRhythmUI('nsr');
                            this.app.showNotification('💊 Administered Amiodarone 300mg IV: Lethal Arrhythmia Converted to NSR!', 'success');
                        }, 1200);
                    } else {
                        this.generator.medEffects.hrOffset = Math.max(-20, this.generator.medEffects.hrOffset - 25);
                        this.app.showNotification('💊 Administered Amiodarone 300mg IV: Heart Rate Slowed', 'info');
                    }
                }
            },
            'atropine': {
                name: 'Atropine 1mg IV Push',
                action: () => {
                    const rhythm = this.generator.currentRhythm;
                    this.generator.medEffects.hrOffset += 35;
                    if (rhythm === 'brady' || rhythm === 'avblock1') {
                        this.generator.setRhythm('nsr');
                        this.app.selectRhythmUI('nsr');
                    }
                    this.app.showNotification('💊 Administered Atropine 1mg IV: Vagolytic HR Surge (+35 BPM)', 'success');
                }
            },
            'adenosine': {
                name: 'Adenosine 6mg Rapid IV Push',
                action: () => {
                    // Transient 2-second AV node block pause
                    this.generator.medEffects.transientPause = true;
                    this.app.showNotification('⚡ Rapid IV Adenosine Administered: Transient AV Block Pause...', 'warning');

                    setTimeout(() => {
                        this.generator.medEffects.transientPause = false;
                        this.generator.setRhythm('nsr');
                        this.app.selectRhythmUI('nsr');
                        this.app.showNotification('✅ Adenosine Washout Complete: Normal Sinus Rhythm Restored!', 'success');
                    }, 2200);
                }
            },
            'nitro': {
                name: 'Nitroglycerin 0.4mg SL',
                action: () => {
                    this.generator.medEffects.stElevOffset = -0.45;
                    this.app.currentNibp.sys = Math.max(70, this.app.currentNibp.sys - 25);
                    this.app.currentNibp.dia = Math.max(45, this.app.currentNibp.dia - 15);
                    this.app.currentNibp.map = Math.round((this.app.currentNibp.sys + 2 * this.app.currentNibp.dia) / 3);
                    
                    if (this.generator.currentRhythm === 'stemi') {
                        this.generator.setRhythm('nsr');
                        this.app.selectRhythmUI('nsr');
                    }
                    this.app.showNotification('💊 Nitroglycerin 0.4mg SL Given: ST Elevation Relieved & Vasodilation', 'success');
                }
            },
            'saline': {
                name: 'IV Normal Saline 500mL Bolus',
                action: () => {
                    this.app.currentNibp.sys += 20;
                    this.app.currentNibp.dia += 10;
                    this.app.currentNibp.map = Math.round((this.app.currentNibp.sys + 2 * this.app.currentNibp.dia) / 3);
                    this.app.showNotification('💧 Administered IV Saline 500mL: Perfusion & Blood Pressure Restored', 'info');
                }
            }
        };

        if (meds[medKey]) {
            meds[medKey].action();
            this.app.updateVitalsDisplay();
        }
    }
}

if (typeof window !== 'undefined') {
    window.MedicationController = MedicationController;
}
