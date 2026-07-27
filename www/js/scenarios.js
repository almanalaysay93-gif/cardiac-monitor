/**
 * ACLS Emergency Clinical Case Scenarios & Resuscitation Countdown Timer Engine
 */

class ScenariosEngine {
    constructor(waveformGenerator, audioSynthesizer, appController) {
        this.generator = waveformGenerator;
        this.audio = audioSynthesizer;
        this.app = appController;

        this.activeScenario = null;
        this.timerInterval = null;
        this.timeRemaining = 0;
        this.totalDuration = 0;
        this.isResolved = false;
    }

    loadScenario(scenarioKey) {
        this.stopTimer();

        const scenarios = {
            'stemi_case': {
                key: 'stemi_case',
                title: 'Case 1: Acute Inferior STEMI',
                rhythm: 'stemi',
                bpm: 85,
                spo2: 96,
                nibp: { sys: 145, dia: 90, map: 108 },
                timeLimitSec: 120,
                history: '62yo Male presenting with 2h crushing retrosternal pain radiating to jaw.',
                guide: '👉 Emergency: Give Nitroglycerin SL & check 12-Lead ECG before time expires!',
                correctActions: ['nitro']
            },
            'vfib_case': {
                key: 'vfib_case',
                title: 'Case 2: Pulseless VFib Cardiac Arrest',
                rhythm: 'vfib',
                bpm: 0,
                spo2: 72,
                nibp: { sys: 0, dia: 0, map: 0 },
                timeLimitSec: 60,
                history: '55yo Female sudden collapse in waiting area. Unresponsive, pulseless!',
                guide: '👉 CRITICAL: Charge Defib 200J & DELIVER SHOCK or give Epinephrine within 60s!',
                correctActions: ['shock', 'epi', 'amiodarone']
            },
            'avblock_case': {
                key: 'avblock_case',
                title: 'Case 3: Symptomatic 3rd Degree AV Block',
                rhythm: 'avblock3',
                bpm: 35,
                spo2: 93,
                nibp: { sys: 80, dia: 50, map: 60 },
                timeLimitSec: 90,
                history: '78yo Male presenting with severe presyncope, confusion & profound hypotension.',
                guide: '👉 Emergency: Give Atropine 1mg IV or activate Pacemaker within 90s!',
                correctActions: ['atropine', 'pacemaker']
            },
            'vtach_case': {
                key: 'vtach_case',
                title: 'Case 4: Unstable Ventricular Tachycardia',
                rhythm: 'vtach',
                bpm: 175,
                spo2: 88,
                nibp: { sys: 85, dia: 55, map: 65 },
                timeLimitSec: 75,
                history: '68yo Female reporting palpitations, dizziness & hypotension.',
                guide: '👉 CRITICAL: Turn SYNC ON & Shock (Cardiovert) or give Amiodarone 300mg IV within 75s!',
                correctActions: ['shock', 'amiodarone']
            },
            'torsades_case': {
                key: 'torsades_case',
                title: 'Case 5: Torsades de Pointes (Polymorphic VT)',
                rhythm: 'torsades',
                bpm: 200,
                spo2: 82,
                nibp: { sys: 75, dia: 45, map: 55 },
                timeLimitSec: 60,
                history: '45yo Male with long QTc interval collapsing into undulating wide-complex tachycardia.',
                guide: '👉 CRITICAL: Unsynchronized Defib Shock required within 60s!',
                correctActions: ['shock']
            },
            'anaphylaxis_case': {
                key: 'anaphylaxis_case',
                title: 'Case 6: Anaphylactic Shock & Hypoxia',
                rhythm: 'tachy',
                bpm: 145,
                spo2: 80,
                nibp: { sys: 70, dia: 40, map: 50 },
                timeLimitSec: 90,
                history: '28yo Female with severe bee sting reaction, stridor, hypotension & bronchospasm.',
                guide: '👉 Emergency: Administer Epinephrine 1mg IV + Saline Bolus within 90s!',
                correctActions: ['epi', 'saline']
            },
            'pea_case': {
                key: 'pea_case',
                title: 'Case 7: Pulseless Electrical Activity (PEA)',
                rhythm: 'nsr',
                bpm: 70,
                spo2: 70,
                nibp: { sys: 0, dia: 0, map: 0 },
                timeLimitSec: 90,
                history: '50yo Male in cardiac arrest with sinus rhythm on monitor but NO palpable pulse!',
                guide: '👉 Emergency PEA: Push Epinephrine 1mg IV & Saline Bolus immediately!',
                correctActions: ['epi', 'saline']
            },
            'hyperkalemia_case': {
                key: 'hyperkalemia_case',
                title: 'Case 8: Hyperkalemic Bradycardia & Wide QRS',
                rhythm: 'brady',
                bpm: 40,
                spo2: 92,
                nibp: { sys: 85, dia: 50, map: 61 },
                timeLimitSec: 100,
                history: '65yo End-stage renal disease patient presenting with serum K+ of 7.8 mEq/L.',
                guide: '👉 Emergency: Push Atropine 1mg IV or Saline Bolus within 100s!',
                correctActions: ['atropine', 'saline']
            }
        };

        const sc = scenarios[scenarioKey];
        if (!sc) return;

        this.activeScenario = sc;
        this.isResolved = false;
        this.totalDuration = sc.timeLimitSec;
        this.timeRemaining = sc.timeLimitSec;

        // Apply scenario vitals & rhythm
        this.generator.setRhythm(sc.rhythm);
        this.generator.setBpm(sc.bpm);
        this.app.selectRhythmUI(sc.rhythm);

        this.app.currentSpo2 = sc.spo2;
        this.app.currentNibp = { ...sc.nibp };
        this.app.updateVitalsDisplay();
        this.app.evaluateAlarms(sc.rhythm);

        // Update UI Text & Guide
        const titleEl = document.getElementById('scenarioTitle');
        const descEl = document.getElementById('scenarioHistory');
        const guideEl = document.getElementById('scenarioGuide');

        if (titleEl) titleEl.innerText = sc.title;
        if (descEl) descEl.innerText = sc.history;
        if (guideEl) guideEl.innerText = sc.guide;

        // Start Countdown Timer
        this.startTimer();
        this.app.showNotification(`🚨 EMERGENCY SCENARIO STARTED: ${sc.title} (${sc.timeLimitSec}s Timer!)`, 'warning');
    }

    startTimer() {
        this.updateTimerDisplay();
        this.timerInterval = setInterval(() => {
            this.timeRemaining--;
            this.updateTimerDisplay();

            if (this.timeRemaining <= 0) {
                this.onTimeExpired();
            }
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    updateTimerDisplay() {
        const mins = Math.floor(this.timeRemaining / 60);
        const secs = this.timeRemaining % 60;
        const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

        const timerEls = document.querySelectorAll('.scenario-timer-display');
        timerEls.forEach(el => {
            el.innerText = `⏱️ ${timeStr}`;
            el.classList.toggle('urgent', this.timeRemaining <= 20);
        });
    }

    notifyAction(actionKey) {
        if (!this.activeScenario || this.isResolved) return;

        const correct = this.activeScenario.correctActions.includes(actionKey);
        if (correct) {
            this.isResolved = true;
            this.stopTimer();

            const elapsed = this.totalDuration - this.timeRemaining;

            // Restore Sinus Rhythm & Normal Vitals Immediately, Stop Alarm Tone
            this.generator.setRhythm('nsr');
            this.app.selectRhythmUI('nsr');
            this.app.updateVitalsForRhythm('nsr');

            const guideEl = document.getElementById('scenarioGuide');
            if (guideEl) {
                guideEl.innerHTML = `<span style="color:#00ff66;">🎉 RESUSCITATION SUCCESSFUL! Patient Saved in ${elapsed}s!</span>`;
            }

            this.app.showNotification(`🎉 RESUSCITATION SUCCESSFUL! Patient Stabilized in ${elapsed} Seconds!`, 'success');
        } else {
            // INCORRECT TREATMENT: Immediate deterioration to Asystole (Flatline)!
            this.isResolved = true;
            this.stopTimer();

            this.generator.setRhythm('asystole');
            this.app.selectRhythmUI('asystole');
            this.app.currentSpo2 = 0;
            this.app.currentNibp = { sys: 0, dia: 0, map: 0 };
            this.app.updateVitalsDisplay();
            this.app.evaluateAlarms('asystole');

            const guideEl = document.getElementById('scenarioGuide');
            if (guideEl) {
                guideEl.innerHTML = `<span style="color:#ff2a5f;">🚨 INCORRECT TREATMENT: PATIENT FLATLINED INTO ASYSTOLE!</span>`;
            }

            this.app.showNotification(`🚨 INCORRECT INTERVENTION! Patient Deteriorated into Asystole (Flatline)!`, 'danger');
        }
    }

    onTimeExpired() {
        this.stopTimer();
        this.isResolved = true;

        // Patient Flatlines into Asystole
        this.generator.setRhythm('asystole');
        this.app.selectRhythmUI('asystole');
        this.app.currentSpo2 = 0;
        this.app.currentNibp = { sys: 0, dia: 0, map: 0 };
        this.app.updateVitalsDisplay();
        this.app.evaluateAlarms('asystole');

        const guideEl = document.getElementById('scenarioGuide');
        if (guideEl) {
            guideEl.innerHTML = `<span style="color:#ff2a5f;">🚨 PATIENT DECEASED: TIME EXPIRED (RESUSCITATION FAILED)</span>`;
        }

        this.app.showNotification(`🚨 TIME EXPIRED: PATIENT FLATLINED! RESUSCITATION FAILED!`, 'danger');
    }
}

if (typeof window !== 'undefined') {
    window.ScenariosEngine = ScenariosEngine;
}
