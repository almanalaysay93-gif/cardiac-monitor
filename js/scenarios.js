/**
 * ACLS Emergency Clinical Case Scenarios Engine
 */

class ScenariosEngine {
    constructor(waveformGenerator, audioSynthesizer, appController) {
        this.generator = waveformGenerator;
        this.audio = audioSynthesizer;
        this.app = appController;
        this.activeScenario = null;
    }

    loadScenario(scenarioKey) {
        const scenarios = {
            'stemi_case': {
                title: 'Case 1: Acute Inferior STEMI',
                rhythm: 'stemi',
                bpm: 85,
                spo2: 96,
                nibp: { sys: 145, dia: 90, map: 108 },
                history: '62yo Male presenting with 2 hours of severe retrosternal chest pressure radiating to jaw. Diaphoretic and pale.',
                guide: '👉 Actions: Open 12-Lead ECG to confirm ST elevation in leads II, III, aVF. Administer Nitroglycerin SL.'
            },
            'vfib_case': {
                title: 'Case 2: Pulseless VFib Cardiac Arrest',
                rhythm: 'vfib',
                bpm: 0,
                spo2: 72,
                nibp: { sys: 0, dia: 0, map: 0 },
                history: '55yo Female collapsed in waiting room. Unresponsive, no breathing, no carotid pulse detected!',
                guide: '👉 Actions: High Priority Alarm active! Charge Defibrillator to 200J, deliver shock, and give Epinephrine 1mg IV.'
            },
            'avblock_case': {
                title: 'Case 3: Symptomatic 3rd Degree AV Block',
                rhythm: 'avblock3',
                bpm: 35,
                spo2: 93,
                nibp: { sys: 80, dia: 50, map: 60 },
                history: '78yo Male experiencing lightheadedness, confusion, and profound hypotension.',
                guide: '👉 Actions: Complete Heart Block detected. Give Atropine 1mg IV or switch rhythm to Ventricular Pacemaker.'
            },
            'vtach_case': {
                title: 'Case 4: Unstable Ventricular Tachycardia',
                rhythm: 'vtach',
                bpm: 175,
                spo2: 88,
                nibp: { sys: 85, dia: 55, map: 65 },
                history: '68yo Female reporting racing heart, dizziness, and chest tightness.',
                guide: '👉 Actions: Monomorphic VTach. Toggle SYNC ON and perform Synchronized Cardioversion (100J-200J) or give Amiodarone 300mg IV.'
            }
        };

        const sc = scenarios[scenarioKey];
        if (!sc) return;

        this.activeScenario = sc;

        // Apply scenario physiological parameters
        this.generator.setRhythm(sc.rhythm);
        this.generator.setBpm(sc.bpm);
        this.app.selectRhythmUI(sc.rhythm);

        this.app.currentSpo2 = sc.spo2;
        this.app.currentNibp = { ...sc.nibp };
        this.app.updateVitalsDisplay();
        this.app.evaluateAlarms(sc.rhythm);

        // Update Scenario Banner UI
        const titleEl = document.getElementById('scenarioTitle');
        const descEl = document.getElementById('scenarioHistory');
        const guideEl = document.getElementById('scenarioGuide');

        if (titleEl) titleEl.innerText = sc.title;
        if (descEl) descEl.innerText = sc.history;
        if (guideEl) guideEl.innerText = sc.guide;

        this.app.showNotification(`🏥 Clinical Scenario Loaded: ${sc.title}`, 'info');
    }
}

if (typeof window !== 'undefined') {
    window.ScenariosEngine = ScenariosEngine;
}
