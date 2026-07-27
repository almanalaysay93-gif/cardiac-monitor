/**
 * Main Cardiac Monitor Application Controller - Extended ICU Edition
 */

class CardiacMonitorApp {
    constructor() {
        this.generator = new window.WaveformGenerator();
        this.audio = new window.AudioSynthesizer();
        this.canvas = document.getElementById('monitorCanvas');
        this.engine = new window.MonitorCanvasEngine(this.canvas, this.generator, this.audio);
        this.defib = new window.DefibController(this.generator, this.audio, this.engine, this);
        this.leads12 = new window.Diagnostic12LeadEngine(this.generator);
        this.meds = new window.MedicationController(this.generator, this.audio, this);
        this.scenarios = new window.ScenariosEngine(this.generator, this.audio, this);

        this.currentSpo2 = 98;
        this.currentNibp = { sys: 120, dia: 80, map: 93 };
        this.currentResp = 14;
        this.currentTemp = 37.0;

        this.lastFrameTime = performance.now();
        this.initEvents();
        this.initUI();
        this.startLoop();
    }

    initEvents() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                const tabId = btn.getAttribute('data-tab');
                const tabEl = document.getElementById(tabId);
                if (tabEl) tabEl.classList.add('active');
            });
        });

        // 12-Lead Modal Button
        const open12LeadBtn = document.getElementById('open12LeadBtn');
        if (open12LeadBtn) {
            open12LeadBtn.addEventListener('click', () => {
                this.leads12.show();
            });
        }

        // Fullscreen Toggle Controls
        const fullscreenBtn = document.getElementById('fullscreenBtn');
        const exitFullscreenBtn = document.getElementById('exitFullscreenBtn');

        const toggleFullscreen = (enable) => {
            const isFull = enable !== undefined ? enable : !document.body.classList.contains('fullscreen-active');
            
            if (isFull) {
                document.body.classList.add('fullscreen-active');
                if (document.documentElement.requestFullscreen) {
                    document.documentElement.requestFullscreen().catch(() => {});
                }
                this.showNotification('Full View Mode Activated (Press Esc to Exit)', 'info');
            } else {
                document.body.classList.remove('fullscreen-active');
                if (document.fullscreenElement && document.exitFullscreen) {
                    document.exitFullscreen().catch(() => {});
                }
            }

            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
            }, 100);
        };

        if (fullscreenBtn) fullscreenBtn.addEventListener('click', () => toggleFullscreen(true));
        if (exitFullscreenBtn) exitFullscreenBtn.addEventListener('click', () => toggleFullscreen(false));

        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) {
                document.body.classList.remove('fullscreen-active');
                window.dispatchEvent(new Event('resize'));
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.body.classList.contains('fullscreen-active')) {
                toggleFullscreen(false);
            }
        });

        // Rhythm Buttons
        document.querySelectorAll('.rhythm-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const rhythmKey = btn.getAttribute('data-rhythm');
                if (!rhythmKey) return;
                this.selectRhythmUI(rhythmKey);
                this.generator.setRhythm(rhythmKey);

                document.getElementById('bpmSlider').value = this.generator.targetBpm;
                document.getElementById('bpmVal').innerText = `${this.generator.targetBpm} BPM`;
                
                this.updateVitalsForRhythm(rhythmKey);
                this.audio.init();
            });
        });

        // Medication Buttons (Works both in sidebar and fullscreen quickbar)
        document.querySelectorAll('[data-med]').forEach(btn => {
            btn.addEventListener('click', () => {
                const medKey = btn.getAttribute('data-med');
                this.meds.giveMedication(medKey);
            });
        });

        // Clinical Scenario Cards & Quick Select
        document.querySelectorAll('[data-scenario]').forEach(card => {
            card.addEventListener('click', () => {
                const scenarioKey = card.getAttribute('data-scenario');
                this.scenarios.loadScenario(scenarioKey);
            });
        });

        const qScenario = document.getElementById('quickScenarioSelect');
        if (qScenario) {
            qScenario.addEventListener('change', (e) => {
                if (e.target.value) this.scenarios.loadScenario(e.target.value);
            });
        }

        // Quick Bar Defib Controls
        const qCharge = document.querySelector('.quick-charge-btn');
        const qShock = document.querySelector('.quick-shock-btn');
        const qSync = document.querySelector('.quick-sync-btn');
        const q12Lead = document.getElementById('quick12LeadBtn');

        if (qCharge) qCharge.addEventListener('click', () => { this.defib.charge(); qCharge.innerText = 'CHARGING...'; });
        if (qShock) qShock.addEventListener('click', () => { this.defib.deliverShock(); });
        if (qSync) qSync.addEventListener('click', () => {
            const isSync = this.defib.toggleSyncMode();
            qSync.classList.toggle('btn-warning', isSync);
            qSync.innerText = isSync ? 'SYNC: ON' : 'SYNC: OFF';
            const syncBtn = document.getElementById('syncBtn');
            if (syncBtn) {
                syncBtn.classList.toggle('btn-warning', isSync);
                syncBtn.innerText = isSync ? 'SYNC: ON' : 'SYNC: OFF';
            }
        });
        if (q12Lead) q12Lead.addEventListener('click', () => this.leads12.show());

        // BPM Slider
        const bpmSlider = document.getElementById('bpmSlider');
        if (bpmSlider) {
            bpmSlider.addEventListener('input', (e) => {
                const val = parseInt(e.target.value, 10);
                this.generator.setBpm(val);
                document.getElementById('bpmVal').innerText = `${val} BPM`;
            });
        }

        // Gain Slider
        document.querySelectorAll('[data-gain]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('[data-gain]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const gain = parseFloat(btn.getAttribute('data-gain'));
                this.engine.setGain(gain);
            });
        });

        // Speed Controls
        document.querySelectorAll('[data-speed]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('[data-speed]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const speed = parseFloat(btn.getAttribute('data-speed'));
                this.engine.setSweepSpeed(speed);
            });
        });

        // Audio Mute Toggle
        const audioBtn = document.getElementById('audioToggleBtn');
        if (audioBtn) {
            audioBtn.addEventListener('click', () => {
                const isMuted = this.audio.toggleMute();
                audioBtn.innerHTML = isMuted ? '🔇 Muted' : '🔊 Audio On';
                audioBtn.classList.toggle('btn-danger', isMuted);
            });
        }

        // Freeze Button
        const freezeBtn = document.getElementById('freezeBtn');
        if (freezeBtn) {
            freezeBtn.addEventListener('click', () => {
                const isFrozen = this.engine.toggleFreeze();
                freezeBtn.classList.toggle('btn-warning', isFrozen);
                freezeBtn.innerText = isFrozen ? '▶ Resume' : '⏸ Freeze';
            });
        }

        // Caliper Tool Button
        const caliperBtn = document.getElementById('caliperBtn');
        if (caliperBtn) {
            caliperBtn.addEventListener('click', () => {
                const isActive = this.engine.toggleCaliperMode();
                caliperBtn.classList.toggle('btn-warning', isActive);
            });
        }

        // NIBP Measure Button
        const nibpBtn = document.getElementById('nibpCycleBtn');
        if (nibpBtn) {
            nibpBtn.addEventListener('click', () => {
                this.triggerNibpCycle();
            });
        }

        // Defib Controls
        document.querySelectorAll('[data-joules]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('[data-joules]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const j = parseInt(btn.getAttribute('data-joules'), 10);
                this.defib.setJoules(j);
            });
        });

        const syncBtn = document.getElementById('syncBtn');
        if (syncBtn) {
            syncBtn.addEventListener('click', () => {
                const isSync = this.defib.toggleSyncMode();
                syncBtn.classList.toggle('btn-warning', isSync);
                syncBtn.innerText = isSync ? 'SYNC: ON' : 'SYNC: OFF';
            });
        }

        const chargeBtn = document.getElementById('defibChargeBtn');
        if (chargeBtn) {
            chargeBtn.addEventListener('click', () => {
                this.defib.charge();
                chargeBtn.innerText = 'CHARGING...';
            });
        }

        const shockBtn = document.getElementById('defibShockBtn');
        if (shockBtn) {
            shockBtn.addEventListener('click', () => {
                this.defib.deliverShock();
            });
        }

        // Quiz Buttons
        const startQuizBtn = document.getElementById('startQuizBtn');
        if (startQuizBtn) {
            startQuizBtn.addEventListener('click', () => {
                this.defib.startQuiz();
            });
        }

        document.querySelectorAll('.quiz-option-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const choice = btn.getAttribute('data-choice');
                this.defib.checkAnswer(choice);
            });
        });

        const nextQuizBtn = document.getElementById('nextQuizBtn');
        if (nextQuizBtn) {
            nextQuizBtn.addEventListener('click', () => {
                this.defib.nextQuizQuestion();
            });
        }
    }

    initUI() {
        this.selectRhythmUI('nsr');
        this.updateVitalsForRhythm('nsr');
    }

    selectRhythmUI(rhythmKey) {
        document.querySelectorAll('.rhythm-btn').forEach(b => {
            if (b.classList.contains('quiz-option-btn')) return;
            b.classList.toggle('active', b.getAttribute('data-rhythm') === rhythmKey);
        });
    }

    updateVitalsForRhythm(rhythm) {
        switch (rhythm) {
            case 'vfib':
            case 'asystole':
                this.currentSpo2 = 72;
                this.currentNibp = { sys: 0, dia: 0, map: 0 };
                break;
            case 'vtach':
            case 'torsades':
                this.currentSpo2 = 85;
                this.currentNibp = { sys: 70, dia: 40, map: 50 };
                break;
            case 'brady':
            case 'avblock3':
                this.currentSpo2 = 94;
                this.currentNibp = { sys: 90, dia: 60, map: 70 };
                break;
            case 'tachy':
                this.currentSpo2 = 97;
                this.currentNibp = { sys: 145, dia: 90, map: 108 };
                break;
            default:
                this.currentSpo2 = 98;
                this.currentNibp = { sys: 120, dia: 80, map: 93 };
                break;
        }
        this.updateVitalsDisplay();
        this.evaluateAlarms(rhythm);
    }

    triggerNibpCycle() {
        const nibpValEl = document.getElementById('nibpValue');
        if (nibpValEl) nibpValEl.innerText = 'INFLATING...';
        this.audio.playNibpSound();

        setTimeout(() => {
            const { sys, dia, map } = this.currentNibp;
            if (nibpValEl) {
                nibpValEl.innerText = sys === 0 ? '---/---' : `${sys}/${dia} (${map})`;
            }
            this.showNotification(`NIBP Cycle Complete: ${sys}/${dia} mmHg`, 'info');
        }, 1500);
    }

    evaluateAlarms(rhythm) {
        const banner = document.getElementById('alarmBanner');

        if (rhythm === 'asystole') {
            if (banner) {
                banner.className = 'alarm-banner high-alarm';
                banner.innerText = 'CRITICAL ALARM: ASYSTOLE / FLATLINE';
            }
            this.audio.startAlarm('asystole');
        } else if (['vfib', 'vtach', 'torsades'].includes(rhythm)) {
            const names = {
                'vfib': 'CRITICAL ALARM: VENTRICULAR FIBRILLATION',
                'vtach': 'CRITICAL ALARM: VENTRICULAR TACHYCARDIA',
                'torsades': 'CRITICAL ALARM: TORSADES DE POINTES'
            };
            if (banner) {
                banner.className = 'alarm-banner high-alarm';
                banner.innerText = names[rhythm] || 'CRITICAL CARDIAC ALARM';
            }
            this.audio.startAlarm('high');
        } else if (rhythm === 'brady' || rhythm === 'tachy') {
            if (banner) {
                banner.className = 'alarm-banner yellow-alarm';
                banner.innerText = rhythm === 'brady' ? 'WARNING: SEVERE BRADY CARDIA' : 'WARNING: TACHYCARDIA';
            }
            this.audio.startAlarm('warning');
        } else {
            if (banner) banner.className = 'alarm-banner';
            this.audio.stopAlarm();
        }
    }

    updateVitalsDisplay() {
        const hrEl = document.getElementById('hrValue');
        const spo2El = document.getElementById('spo2Value');
        const nibpEl = document.getElementById('nibpValue');
        const alineEl = document.getElementById('alineValue');
        const etco2El = document.getElementById('etco2Value');
        const respEl = document.getElementById('respValue');

        const currentBpm = (this.generator.currentRhythm === 'vfib' || this.generator.currentRhythm === 'asystole') ? 0 : (this.generator.targetBpm + this.generator.medEffects.hrOffset);

        if (hrEl) hrEl.innerText = currentBpm > 0 ? Math.round(currentBpm) : '---';
        if (spo2El) spo2El.innerText = this.currentSpo2 > 0 ? `${this.currentSpo2}%` : '--%';
        
        const { sys, dia, map } = this.currentNibp;
        if (nibpEl) nibpEl.innerText = sys === 0 ? '---/---' : `${sys}/${dia} (${map})`;
        if (alineEl) alineEl.innerText = sys === 0 ? '---/---' : `${sys}/${dia} (${map})`;

        if (etco2El) etco2El.innerText = (this.generator.currentRhythm === 'asystole') ? '0' : '38';
        if (respEl) respEl.innerText = this.currentResp;
    }

    updateDefibUI() {
        const chargeBtn = document.getElementById('defibChargeBtn');
        const shockBtn = document.getElementById('defibShockBtn');
        const qCharge = document.querySelector('.quick-charge-btn');
        const qShock = document.querySelector('.quick-shock-btn');
        const statusEl = document.getElementById('defibStatusText');

        if (this.defib.isCharged) {
            if (chargeBtn) chargeBtn.innerText = 'CHARGED ⚡';
            if (qCharge) qCharge.innerText = 'CHARGED ⚡';
            if (shockBtn) {
                shockBtn.disabled = false;
                shockBtn.classList.add('btn-danger');
            }
            if (qShock) {
                qShock.disabled = false;
                qShock.classList.add('btn-danger');
            }
            if (statusEl) statusEl.innerText = `CAPACITOR CHARGED: ${this.defib.selectedJoules} JOULES`;
        } else {
            if (chargeBtn) chargeBtn.innerText = 'CHARGE CAPACITOR';
            if (qCharge) qCharge.innerText = 'CHARGE CAPACITOR';
            if (shockBtn) {
                shockBtn.disabled = true;
                shockBtn.classList.remove('btn-danger');
            }
            if (qShock) {
                qShock.disabled = true;
                qShock.classList.remove('btn-danger');
            }
            if (statusEl) statusEl.innerText = 'DEFIBRILLATOR READY';
        }
    }

    updateQuizDisplay(targetRhythm) {
        document.getElementById('quizTitle').innerText = '❓ QUIZ MODE: IDENTIFY THE ECG RHYTHM ON MONITOR';
        document.getElementById('quizFeedback').innerText = 'Inspect the live trace and select your diagnosis below:';
        document.getElementById('quizOptions').style.display = 'grid';
        document.getElementById('nextQuizBtn').style.display = 'none';
    }

    showQuizFeedback(text, isCorrect, score, total) {
        const fb = document.getElementById('quizFeedback');
        fb.innerHTML = `<strong>${text}</strong><br>Score: ${score} / ${total}`;
        document.getElementById('nextQuizBtn').style.display = 'inline-block';
    }

    showNotification(msg, type = 'info') {
        const toast = document.getElementById('notificationToast');
        if (!toast) return;
        toast.innerText = msg;
        toast.className = `notification-toast show ${type}`;
        setTimeout(() => {
            toast.className = 'notification-toast';
        }, 3500);
    }

    startLoop() {
        const loop = (timestamp) => {
            const dt = Math.min(0.05, (timestamp - this.lastFrameTime) / 1000.0);
            this.lastFrameTime = timestamp;

            this.engine.updateAndRender(dt, this.currentSpo2);

            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }
}

// Launch application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    window.app = new CardiacMonitorApp();
});
