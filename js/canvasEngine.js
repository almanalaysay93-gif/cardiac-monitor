/**
 * High Performance Multi-Trace Canvas Renderer & Sweep Engine
 * Renders 5 simultaneous channels: ECG Lead II, SpO2 Pleth, Respiration, EtCO2 Capnography, and Arterial Line (A-Line / IBP).
 */

class MonitorCanvasEngine {
    constructor(canvas, waveformGenerator, audioSynthesizer) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.generator = waveformGenerator;
        this.audio = audioSynthesizer;

        this.isRunning = true;
        this.isFrozen = false;
        this.showGrid = true;
        this.gridType = 'green';

        this.sweepSpeedMmPerSec = 25;
        this.pixelsPerMm = 4;
        this.gain = 1.0;

        this.sweepX = 0;
        this.clearWidth = 20;

        // 5 Circular history buffers for rendering
        this.ecgBuffer = [];
        this.plethBuffer = [];
        this.respBuffer = [];
        this.etco2Buffer = [];
        this.alineBuffer = [];
        this.bufferLength = 0;

        this.caliperMode = false;
        this.caliper1X = null;
        this.caliper2X = null;
        this.draggingCaliper = null;

        this.setupResize();
        this.bindCaliperEvents();
    }

    setupResize() {
        const resize = () => {
            const rect = this.canvas.parentElement.getBoundingClientRect();
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
            this.bufferLength = Math.ceil(this.canvas.width);
            
            if (this.ecgBuffer.length !== this.bufferLength) {
                this.ecgBuffer = new Array(this.bufferLength).fill(0);
                this.plethBuffer = new Array(this.bufferLength).fill(0);
                this.respBuffer = new Array(this.bufferLength).fill(0);
                this.etco2Buffer = new Array(this.bufferLength).fill(0);
                this.alineBuffer = new Array(this.bufferLength).fill(0);
            }
            this.drawGrid();
            this.prefillBuffers();
        };

        window.addEventListener('resize', resize);
        resize();
    }

    prefillBuffers() {
        const w = this.canvas.width;
        if (!w || !this.generator) return;
        const dt = 0.016;
        for (let x = 0; x < w; x++) {
            const { ecg, pleth, resp, etco2, aline } = this.generator.getNextSample(dt);
            this.ecgBuffer[x] = ecg;
            this.plethBuffer[x] = pleth;
            this.respBuffer[x] = resp;
            this.etco2Buffer[x] = etco2;
            this.alineBuffer[x] = aline;
        }
    }

    setSweepSpeed(mmPerSec) {
        this.sweepSpeedMmPerSec = mmPerSec;
    }

    setGain(gain) {
        this.gain = gain;
    }

    toggleFreeze() {
        this.isFrozen = !this.isFrozen;
        if (this.isFrozen && this.caliperMode) {
            if (this.caliper1X === null) this.caliper1X = this.canvas.width * 0.35;
            if (this.caliper2X === null) this.caliper2X = this.canvas.width * 0.65;
        }
        return this.isFrozen;
    }

    toggleCaliperMode() {
        this.caliperMode = !this.caliperMode;
        if (this.caliperMode && !this.isFrozen) {
            this.isFrozen = true;
        }
        if (this.caliperMode) {
            this.caliper1X = this.canvas.width * 0.35;
            this.caliper2X = this.canvas.width * 0.65;
        }
        return this.caliperMode;
    }

    drawGrid() {
        const w = this.canvas.width;
        const h = this.canvas.height;

        this.ctx.fillStyle = '#050b07';
        this.ctx.fillRect(0, 0, w, h);

        if (!this.showGrid) return;

        const gridColorMajor = this.gridType === 'green' ? 'rgba(0, 255, 102, 0.15)' : 'rgba(255, 80, 80, 0.18)';
        const gridColorMinor = this.gridType === 'green' ? 'rgba(0, 255, 102, 0.05)' : 'rgba(255, 80, 80, 0.06)';

        const smallGrid = this.pixelsPerMm;
        const largeGrid = this.pixelsPerMm * 5;

        this.ctx.lineWidth = 0.5;
        this.ctx.strokeStyle = gridColorMinor;
        this.ctx.beginPath();
        for (let x = 0; x < w; x += smallGrid) {
            this.ctx.moveTo(x, 0); this.ctx.lineTo(x, h);
        }
        for (let y = 0; y < h; y += smallGrid) {
            this.ctx.moveTo(0, y); this.ctx.lineTo(w, y);
        }
        this.ctx.stroke();

        this.ctx.lineWidth = 1.0;
        this.ctx.strokeStyle = gridColorMajor;
        this.ctx.beginPath();
        for (let x = 0; x < w; x += largeGrid) {
            this.ctx.moveTo(x, 0); this.ctx.lineTo(x, h);
        }
        for (let y = 0; y < h; y += largeGrid) {
            this.ctx.moveTo(0, y); this.ctx.lineTo(w, y);
        }
        this.ctx.stroke();
    }

    updateAndRender(dt, currentSpo2 = 98) {
        if (!this.isRunning) return;

        const w = this.canvas.width;
        const h = this.canvas.height;

        if (!this.isFrozen) {
            const speedPxPerSec = this.sweepSpeedMmPerSec * this.pixelsPerMm;
            const pxToAdvance = speedPxPerSec * dt;

            const { ecg, pleth, resp, etco2, aline, justTriggeredR } = this.generator.getNextSample(dt);

            if (justTriggeredR) {
                this.audio.playQrsBeep(currentSpo2);
            }

            const step = Math.max(1, Math.round(pxToAdvance));
            for (let i = 0; i < step; i++) {
                const xIndex = Math.floor(this.sweepX) % w;
                this.ecgBuffer[xIndex] = ecg;
                this.plethBuffer[xIndex] = pleth;
                this.respBuffer[xIndex] = resp;
                this.etco2Buffer[xIndex] = etco2;
                this.alineBuffer[xIndex] = aline;

                this.sweepX = (this.sweepX + 1) % w;
            }
        }

        this.drawGrid();

        // 5 Channel Layout Heights (ECG HR trace rendered BIGGER & more prominent than all others)
        const rowH = h / 6.0;

        const ecgCenterY = rowH * 0.68;   // Baseline lowered for top clearance
        const ecgScale = (rowH * 0.44) * this.gain; // Primary ECG HR waveform: BIGGER & taller amplitude!

        const alineCenterY = rowH * 1.62; // Slot 2 (ART IBP)
        const alineScale = rowH * 0.30;

        const plethCenterY = rowH * 2.62; // Slot 3 (SpO2 PLETH)
        const plethScale = rowH * 0.28;

        // Slot 4 (NIBP) has no waveform trace

        const etco2CenterY = rowH * 4.62; // Slot 5 (EtCO2 CAPNOGRAM)
        const etco2Scale = rowH * 0.28;

        const respCenterY = rowH * 5.62;  // Slot 6 (RESP WAVE)
        const respScale = rowH * 0.25;

        // Render 5 Traces with 100% UNIFORM line thickness (2.0px) across all channels
        this.drawTrace(this.ecgBuffer, ecgCenterY, ecgScale, '#00ff66', 2.0, 3);
        this.drawTrace(this.alineBuffer, alineCenterY, alineScale, '#ff4d4d', 2.0, 3);
        this.drawTrace(this.plethBuffer, plethCenterY, plethScale, '#00e5ff', 2.0, 3);
        this.drawTrace(this.etco2Buffer, etco2CenterY, etco2Scale, '#d8b4fe', 2.0, 3);
        this.drawTrace(this.respBuffer, respCenterY, respScale, '#ffeb3b', 2.0, 3);

        // Sweep Bar
        if (!this.isFrozen) {
            const sweepIntX = Math.floor(this.sweepX);
            this.ctx.fillStyle = '#050b07';
            this.ctx.fillRect(sweepIntX, 0, this.clearWidth, h);

            if (this.showGrid) {
                this.ctx.save();
                this.ctx.beginPath();
                this.ctx.rect(sweepIntX, 0, this.clearWidth, h);
                this.ctx.clip();
                const largeGrid = this.pixelsPerMm * 5;
                this.ctx.strokeStyle = this.gridType === 'green' ? 'rgba(0, 255, 102, 0.15)' : 'rgba(255, 80, 80, 0.18)';
                this.ctx.lineWidth = 1.0;
                this.ctx.beginPath();
                for (let x = Math.floor(sweepIntX / largeGrid) * largeGrid; x < sweepIntX + this.clearWidth; x += largeGrid) {
                    this.ctx.moveTo(x, 0); this.ctx.lineTo(x, h);
                }
                for (let y = 0; y < h; y += largeGrid) {
                    this.ctx.moveTo(sweepIntX, y); this.ctx.lineTo(sweepIntX + this.clearWidth, y);
                }
                this.ctx.stroke();
                this.ctx.restore();
            }

            const grad = this.ctx.createLinearGradient(sweepIntX, 0, sweepIntX - 10, 0);
            grad.addColorStop(0, 'rgba(0, 255, 102, 0.8)');
            grad.addColorStop(1, 'rgba(0, 255, 102, 0.0)');
            this.ctx.fillStyle = grad;
            this.ctx.fillRect(sweepIntX - 10, 0, 10, h);
        }

        if (this.caliperMode) {
            this.drawCalipers();
        }

        // Trace Labels (Clean Top Padding)
        this.ctx.font = '11px "Roboto Mono", monospace';
        this.ctx.fillStyle = 'rgba(0, 255, 102, 0.85)';
        this.ctx.fillText(`II  1.0mV  ${this.sweepSpeedMmPerSec}mm/s  Gain:${this.gain}x`, 15, 15);

        this.ctx.fillStyle = 'rgba(255, 77, 77, 0.85)';
        this.ctx.fillText('ART (A-LINE IBP)', 15, rowH * 1.0 + 15);

        this.ctx.fillStyle = 'rgba(0, 229, 255, 0.85)';
        this.ctx.fillText('SpO2 PLETH', 15, rowH * 2.0 + 15);

        this.ctx.fillStyle = 'rgba(216, 180, 254, 0.85)';
        this.ctx.fillText('EtCO2 CAPNOGRAM', 15, rowH * 4.0 + 15);

        this.ctx.fillStyle = 'rgba(255, 235, 59, 0.85)';
        this.ctx.fillText('RESP WAVE', 15, rowH * 5.0 + 15);

        if (this.isFrozen) {
            this.ctx.font = 'bold 16px "Roboto Mono", monospace';
            this.ctx.fillStyle = '#ff3366';
            this.ctx.fillText('[ FREEZE / PAUSED ]', w - 190, 30);
        }
    }

    drawTrace(buffer, centerY, scale, color, lineW = 1.8, shadowBlur = 3) {
        const w = this.canvas.width;
        if (!buffer || buffer.length === 0) return;

        this.ctx.lineWidth = lineW;
        this.ctx.strokeStyle = color;
        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = shadowBlur;
        this.ctx.beginPath();

        let started = false;
        const sweepIntX = Math.floor(this.sweepX);

        for (let x = 0; x < w; x++) {
            if (!this.isFrozen && x >= sweepIntX && x < sweepIntX + this.clearWidth) {
                started = false;
                continue;
            }

            const val = buffer[x] || 0;
            const y = centerY - (val * scale);

            if (!started) {
                this.ctx.moveTo(x, y);
                started = true;
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;
    }

    drawCalipers() {
        const h = this.canvas.height;
        const c1 = this.caliper1X;
        const c2 = this.caliper2X;

        [c1, c2].forEach((cx, idx) => {
            this.ctx.strokeStyle = idx === 0 ? '#ffea00' : '#ff9100';
            this.ctx.lineWidth = 1.5;
            this.ctx.setLineDash([6, 4]);
            this.ctx.beginPath();
            this.ctx.moveTo(cx, 0); this.ctx.lineTo(cx, h);
            this.ctx.stroke();
            this.ctx.setLineDash([]);

            this.ctx.fillStyle = idx === 0 ? '#ffea00' : '#ff9100';
            this.ctx.beginPath();
            this.ctx.arc(cx, h / 2, 6, 0, Math.PI * 2);
            this.ctx.fill();
        });

        const minX = Math.min(c1, c2);
        const maxX = Math.max(c1, c2);
        const dxPx = maxX - minX;

        const mm = dxPx / this.pixelsPerMm;
        const sec = mm / this.sweepSpeedMmPerSec;
        const ms = Math.round(sec * 1000);
        const calcBpm = ms > 0 ? Math.round(60000 / ms) : 0;

        const midX = minX + dxPx / 2;
        const bannerY = h * 0.48;

        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 1.0;
        this.ctx.beginPath();
        this.ctx.moveTo(minX, bannerY); this.ctx.lineTo(maxX, bannerY);
        this.ctx.stroke();

        this.ctx.fillStyle = 'rgba(10, 20, 15, 0.85)';
        this.ctx.strokeStyle = '#ffea00';
        this.ctx.lineWidth = 1;
        this.ctx.fillRect(midX - 90, bannerY - 32, 180, 44);
        this.ctx.strokeRect(midX - 90, bannerY - 32, 180, 44);

        this.ctx.font = 'bold 12px "Roboto Mono", monospace';
        this.ctx.fillStyle = '#ffea00';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`Δt: ${ms} ms (${sec.toFixed(2)}s)`, midX, bannerY - 14);
        this.ctx.fillStyle = '#00ff66';
        this.ctx.fillText(`Interval HR: ${calcBpm} BPM`, midX, bannerY + 4);
        this.ctx.textAlign = 'left';
    }

    bindCaliperEvents() {
        const getX = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            return (e.clientX || e.touches[0].clientX) - rect.left;
        };

        const onDown = (e) => {
            if (!this.caliperMode) return;
            const x = getX(e);
            if (Math.abs(x - this.caliper1X) < 25) this.draggingCaliper = 1;
            else if (Math.abs(x - this.caliper2X) < 25) this.draggingCaliper = 2;
        };

        const onMove = (e) => {
            if (!this.caliperMode || !this.draggingCaliper) return;
            const x = getX(e);
            if (this.draggingCaliper === 1) this.caliper1X = Math.max(0, Math.min(this.canvas.width, x));
            if (this.draggingCaliper === 2) this.caliper2X = Math.max(0, Math.min(this.canvas.width, x));
        };

        const onUp = () => {
            this.draggingCaliper = null;
        };

        this.canvas.addEventListener('mousedown', onDown);
        this.canvas.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);

        this.canvas.addEventListener('touchstart', onDown);
        this.canvas.addEventListener('touchmove', onMove);
        window.addEventListener('touchend', onUp);
    }
}

if (typeof window !== 'undefined') {
    window.MonitorCanvasEngine = MonitorCanvasEngine;
}
