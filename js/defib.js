/**
 * Defibrillator, ACLS Cardioversion, CPR, and Quiz Game Module
 */

class DefibController {
    constructor(waveformGenerator, audioSynthesizer, canvasEngine, appController) {
        this.generator = waveformGenerator;
        this.audio = audioSynthesizer;
        this.engine = canvasEngine;
        this.app = appController;

        this.selectedJoules = 200;
        this.isSyncMode = false;
        this.isCharged = false;
        this.isCharging = false;
        
        // Quiz state
        this.isQuizMode = false;
        this.quizCurrentRhythm = null;
        this.score = 0;
        this.totalQuestions = 0;
    }

    setJoules(joules) {
        this.selectedJoules = joules;
    }

    toggleSyncMode() {
        this.isSyncMode = !this.isSyncMode;
        return this.isSyncMode;
    }

    charge() {
        if (this.isCharged || this.isCharging) return;
        this.isCharging = true;
        this.audio.playDefibCharge(2.5);

        setTimeout(() => {
            this.isCharging = false;
            this.isCharged = true;
            if (this.app) this.app.updateDefibUI();
        }, 2500);
    }

    deliverShock() {
        if (!this.isCharged) return false;

        this.audio.playDefibShock();
        this.isCharged = false;

        // Shock effect: Artifact pulse on canvas engine
        const currentRhythm = this.generator.currentRhythm;
        
        // Lethal shockable rhythms: VFib, VTach, Torsades
        const shockable = ['vfib', 'vtach', 'torsades'];
        
        if (shockable.includes(currentRhythm)) {
            // Successful shock converts to Sinus Rhythm and stops alarm!
            setTimeout(() => {
                this.generator.setRhythm('nsr');
                if (this.app) {
                    this.app.selectRhythmUI('nsr');
                    this.app.updateVitalsForRhythm('nsr');
                    this.app.showNotification(`⚡ SHOCK DELIVERED (${this.selectedJoules}J): RHYTHM CONVERTED TO SINUS RHYTHM! ALARM STOPPED!`, 'success');
                }
            }, 600);
        } else if (currentRhythm === 'asystole') {
            // Non-shockable! Asystole remains flatline or goes to fine VFib
            this.app.showNotification(`⚡ SHOCK DELIVERED (${this.selectedJoules}J): ASYSTOLE IS NON-SHOCKABLE! CONTINUE CPR!`, 'warning');
        } else {
            // Shocking organized rhythm (Cardioversion or accidental shock)
            if (this.isSyncMode) {
                this.app.showNotification(`⚡ SYNC CARDIOVERSION DELIVERED (${this.selectedJoules}J): RHYTHM STABILIZED!`, 'info');
            } else {
                this.app.showNotification(`⚡ UNSYNCHRONIZED SHOCK DELIVERED (${this.selectedJoules}J) ON ORGANIZED RHYTHM.`, 'warning');
            }
        }

        if (this.app) {
            if (this.app.scenarios) this.app.scenarios.notifyAction('shock');
            this.app.updateDefibUI();
        }
        return true;
    }

    startQuiz() {
        this.isQuizMode = true;
        this.nextQuizQuestion();
    }

    nextQuizQuestion() {
        const rhythms = [
            'nsr', 'brady', 'tachy', 'afib', 'aflutter', 'pvc',
            'vtach', 'vfib', 'asystole', 'stemi', 'ischemia',
            'avblock1', 'avblock2_1', 'avblock2_2', 'avblock3', 'torsades', 'pacemaker'
        ];
        
        // Pick random rhythm
        const randIdx = Math.floor(Math.random() * rhythms.length);
        this.quizCurrentRhythm = rhythms[randIdx];

        // Apply rhythm
        this.generator.setRhythm(this.quizCurrentRhythm);
        if (this.app) {
            this.app.updateQuizDisplay(this.quizCurrentRhythm);
        }
    }

    checkAnswer(userChoice) {
        this.totalQuestions++;
        const isCorrect = userChoice === this.quizCurrentRhythm;
        if (isCorrect) this.score++;

        const rhythmNames = {
            'nsr': 'Normal Sinus Rhythm',
            'brady': 'Sinus Bradycardia',
            'tachy': 'Sinus Tachycardia',
            'afib': 'Atrial Fibrillation',
            'aflutter': 'Atrial Flutter',
            'pvc': 'Premature Ventricular Contractions',
            'vtach': 'Ventricular Tachycardia',
            'vfib': 'Ventricular Fibrillation',
            'asystole': 'Asystole',
            'stemi': 'ST Elevation (STEMI)',
            'ischemia': 'ST Depression (Ischemia)',
            'avblock1': '1st Degree AV Block',
            'avblock2_1': '2nd Degree AV Block (Wenckebach)',
            'avblock2_2': '2nd Degree AV Block (Mobitz II)',
            'avblock3': '3rd Degree AV Block',
            'torsades': 'Torsades de Pointes',
            'pacemaker': 'Ventricular Pacemaker'
        };

        const resultText = isCorrect ? 
            `✅ Correct! It was ${rhythmNames[this.quizCurrentRhythm]}` : 
            `❌ Incorrect! It was ${rhythmNames[this.quizCurrentRhythm]}`;

        if (this.app) {
            this.app.showQuizFeedback(resultText, isCorrect, this.score, this.totalQuestions);
        }
    }
}

if (typeof window !== 'undefined') {
    window.DefibController = DefibController;
}
