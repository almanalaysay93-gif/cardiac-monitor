/**
 * Diagnostic 12-Lead ECG Modal & Renderer Engine
 * Displays standard 3x4 12-Lead ECG grid on 25mm/s 10mm/mV medical graph paper.
 */

class Diagnostic12LeadEngine {
    constructor(generator) {
        this.generator = generator;
        this.modalEl = null;
        this.canvas = null;
        this.ctx = null;
        this.initDOM();
    }

    initDOM() {
        // Build 12-Lead Modal Container
        const modal = document.createElement('div');
        modal.id = 'leads12Modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-card">
                <div class="modal-header">
                    <div>
                        <h2>DIAGNOSTIC 12-LEAD ECG REPORT</h2>
                        <span class="modal-subtitle">25 mm/s | 10 mm/mV | Standard Calibration 1.0mV</span>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button id="print12LeadBtn" class="btn btn-primary">🖨️ Print / Download Strip</button>
                        <button id="close12LeadBtn" class="btn btn-danger">✕ Close</button>
                    </div>
                </div>
                <div class="modal-body">
                    <canvas id="leads12Canvas"></canvas>
                </div>
                <div class="modal-footer">
                    <div id="ecgDiagnosisText" class="diagnosis-banner">ANALYSIS: NORMAL SINUS RHYTHM - NO ACUTE ISCHEMIC CHANGES</div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        this.modalEl = modal;
        this.canvas = document.getElementById('leads12Canvas');
        this.ctx = this.canvas.getContext('2d');

        document.getElementById('close12LeadBtn').addEventListener('click', () => this.hide());
        document.getElementById('print12LeadBtn').addEventListener('click', () => this.printStrip());

        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.hide();
        });
    }

    show() {
        this.modalEl.classList.add('active');
        this.render12Lead();
    }

    hide() {
        this.modalEl.classList.remove('active');
    }

    render12Lead() {
        const w = 1100;
        const h = 650;
        this.canvas.width = w;
        this.canvas.height = h;

        // Render Pink/Red Medical ECG Paper Grid
        this.ctx.fillStyle = '#fff5f5';
        this.ctx.fillRect(0, 0, w, h);

        // Minor grid (1mm = 4px at 100dpi)
        const mm = 4;
        this.ctx.lineWidth = 0.5;
        this.ctx.strokeStyle = '#fca5a5';
        this.ctx.beginPath();
        for (let x = 0; x < w; x += mm) {
            this.ctx.moveTo(x, 0); this.ctx.lineTo(x, h);
        }
        for (let y = 0; y < h; y += mm) {
            this.ctx.moveTo(0, y); this.ctx.lineTo(w, y);
        }
        this.ctx.stroke();

        // Major grid (5mm = 20px)
        this.ctx.lineWidth = 1.0;
        this.ctx.strokeStyle = '#f87171';
        this.ctx.beginPath();
        for (let x = 0; x < w; x += mm * 5) {
            this.ctx.moveTo(x, 0); this.ctx.lineTo(x, h);
        }
        for (let y = 0; y < h; y += mm * 5) {
            this.ctx.moveTo(0, y); this.ctx.lineTo(w, y);
        }
        this.ctx.stroke();

        // 3x4 Layout setup
        const cols = [
            { name: ['I', 'II', 'III'], xStart: 40, w: 250 },
            { name: ['aVR', 'aVL', 'aVF'], xStart: 300, w: 250 },
            { name: ['V1', 'V2', 'V3'], xStart: 560, w: 250 },
            { name: ['V4', 'V5', 'V6'], xStart: 820, w: 250 }
        ];

        const rowH = 120;
        const topMargin = 50;

        // Draw each lead
        cols.forEach(col => {
            col.name.forEach((leadName, rowIdx) => {
                const centerY = topMargin + rowIdx * rowH + rowH / 2;
                
                // Lead label
                this.ctx.font = 'bold 14px "Roboto Mono", monospace';
                this.ctx.fillStyle = '#991b1b';
                this.ctx.fillText(leadName, col.xStart, centerY - 35);

                // Trace
                this.ctx.lineWidth = 1.8;
                this.ctx.strokeStyle = '#111827';
                this.ctx.beginPath();

                const points = 250;
                for (let i = 0; i < points; i++) {
                    const p = (i / points);
                    const val = this.generator.generate12LeadSample(leadName, p);
                    const x = col.xStart + (i * (col.w / points));
                    const y = centerY - (val * 35);

                    if (i === 0) this.ctx.moveTo(x, y);
                    else this.ctx.lineTo(x, y);
                }
                this.ctx.stroke();
            });
        });

        // Bottom continuous Lead II rhythm strip
        const stripY = topMargin + 3 * rowH + 60;
        this.ctx.font = 'bold 14px "Roboto Mono", monospace';
        this.ctx.fillStyle = '#991b1b';
        this.ctx.fillText('II (Continuous Rhythm Strip)', 40, stripY - 35);

        this.ctx.lineWidth = 1.8;
        this.ctx.strokeStyle = '#111827';
        this.ctx.beginPath();
        for (let i = 0; i < w - 80; i++) {
            const p = ((i % 250) / 250);
            const val = this.generator.generate12LeadSample('II', p);
            const x = 40 + i;
            const y = stripY - (val * 35);
            if (i === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        }
        this.ctx.stroke();

        // Update diagnosis text
        this.updateDiagnosisText();
    }

    updateDiagnosisText() {
        const rhythm = this.generator.currentRhythm;
        const diagEl = document.getElementById('ecgDiagnosisText');

        const diagnoses = {
            'nsr': 'ANALYSIS: NORMAL SINUS RHYTHM - NO ACUTE ST ELEVATION OR ISCHEMIA',
            'brady': 'ANALYSIS: SINUS BRADYCARDIA - RATE < 60 BPM',
            'tachy': 'ANALYSIS: SINUS TACHYCARDIA - RATE > 100 BPM',
            'afib': 'ANALYSIS: ATRIAL FIBRILLATION WITH IRREGULAR VENTRICULAR RESPONSE',
            'aflutter': 'ANALYSIS: ATRIAL FLUTTER WITH SAWTOOTH F-WAVES',
            'pvc': 'ANALYSIS: FREQUENT PREMATURE VENTRICULAR CONTRACTIONS (PVCs)',
            'vtach': 'ANALYSIS: 🚨 MONOMORPHIC VENTRICULAR TACHYCARDIA (CRITICAL EMERGENCY)',
            'vfib': 'ANALYSIS: 🚨 VENTRICULAR FIBRILLATION - IMMEDIATE DEFIBRILLATION REQUIRED',
            'asystole': 'ANALYSIS: 🚨 ASYSTOLE / FLATLINE - START CPR IMMEDIATELY',
            'stemi': 'ANALYSIS: 🚨 ACUTE INFERIOR MYOCARDIAL INFARCTION (STEMI IN LEADS II, III, aVF)',
            'ischemia': 'ANALYSIS: ACUTE MYOCARDIAL ISCHEMIA (ST DEPRESSION IN PRECORDIAL LEADS)',
            'avblock1': 'ANALYSIS: FIRST DEGREE ATRIOVENTRICULAR (AV) BLOCK (PR > 200ms)',
            'avblock2_1': 'ANALYSIS: SECOND DEGREE AV BLOCK TYPE I (MOBITZ I / WENCKEBACH)',
            'avblock2_2': 'ANALYSIS: SECOND DEGREE AV BLOCK TYPE II (MOBITZ II)',
            'avblock3': 'ANALYSIS: 🚨 THIRD DEGREE COMPLETE AV BLOCK (CHB WITH SLOW ESCAPE RHYTHM)',
            'torsades': 'ANALYSIS: 🚨 TORSADES DE POINTES (POL YMORPHIC VT WITH QTc PROLONGATION)',
            'pacemaker': 'ANALYSIS: VENTRICULAR PACED RHYTHM WITH PACING SPIKES PRECEDING QRS'
        };

        if (diagEl) {
            diagEl.innerText = diagnoses[rhythm] || 'ANALYSIS: UNKNOWN ECG PATTERN';
        }
    }

    printStrip() {
        const link = document.createElement('a');
        link.download = `ECG_12Lead_Report_${Date.now()}.png`;
        link.href = this.canvas.toDataURL('image/png');
        link.click();
    }
}

if (typeof window !== 'undefined') {
    window.Diagnostic12LeadEngine = Diagnostic12LeadEngine;
}
