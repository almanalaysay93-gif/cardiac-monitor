/**
 * High Performance Canvas Renderer & Sweep Engine
 * Manages real-time multi-trace ECG/Pleth/Resp rendering, sweep bar, grid system, and measurement calipers.
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
        this.gridType = 'green'; // 'green' or 'red'

        // Display properties
        this.sweepSpeedMmPerSec = 25; // 12.5, 25, 50
        this.pixelsPerMm = 4; // Scale factor for 1080p display
        this.gain = 1.0; // 0.5x, 1x, 2x gain

        // Sweep position tracking
        this.sweepX = 0;
        this.clearWidth = 20; // Width of erasing sweep bar ahead

        // Circular history buffers for rendering
        this.ecgBuffer = [];
        this.plethBuffer = [];
        this.respBuffer = [];
        this.bufferLength = 0;

        // Caliper measurement tool state
        this.caliperMode = false;
        this.caliper1X = null;
        this.caliper2X = null;
        this.draggingCaliper = null; // 1 or 2

        this.setupResize();
        this.bindCaliperEvents();
    }

    setupResize() {
        const resize = () => {
            const rect = this.canvas.parentElement.getBoundingClientRect();
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
            this.bufferLength = Math.ceil(this.canvas.width);
            
            // Re-initialize buffers if needed
            if (this.ecgBuffer.length !== this.bufferLength) {
                this.ecgBuffer = new Array(this.bufferLength).fill(0);
                this.plethBuffer = new Array(this.bufferLength).fill(0);
                this.respBuffer = new Array(this.bufferLength).fill(0);
            }
            this.drawGrid();
        };

        window.addEventListener('resize', resize);
        resize();
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
            // Default calipers to center if not set
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

        const mmPx = this.pixelsPerMm;
        const smallGrid = mmPx; // 1mm
        const largeGrid = mmPx * 5; // 5mm (0.2s at 25mm/s)

        // Draw minor grid lines
        this.ctx.lineWidth = 0.5;
        this.ctx.strokeStyle = gridColorMinor;
        this.ctx.beginPath();
        for (let x = 0; x < w; x += smallGrid) {
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, h);
        }
        for (let y = 0; y < h; y += smallGrid) {
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(w, y);
        }
        this.ctx.stroke();

        // Draw major grid lines
        this.ctx.lineWidth = 1.0;
        this.ctx.strokeStyle = gridColorMajor;
        this.ctx.beginPath();
        for (let x = 0; x < w; x += largeGrid) {
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, h);
        }
        for (let y = 0; y < h; y += largeGrid) {
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(w, y);
        }
        this.ctx.stroke();
    }

    updateAndRender(dt, currentSpo2 = 98) {
        if (!this.isRunning) return;

        const w = this.canvas.width;
        const h = this.canvas.height;

        if (!this.isFrozen) {
            // Speed in pixels per frame
            const speedPxPerSec = this.sweepSpeedMmPerSec * this.pixelsPerMm;
            const pxToAdvance = speedPxPerSec * dt;

            // Generate sample from math engine
            const { ecg, pleth, resp, justTriggeredR } = this.generator.getNextSample(dt);

            if (justTriggeredR) {
                this.audio.playQrsBeep(currentSpo2);
            }

            const step = Math.max(1, Math.round(pxToAdvance));
            for (let i = 0; i < step; i++) {
                const xIndex = Math.floor(this.sweepX) % w;
                this.ecgBuffer[xIndex] = ecg;
                this.plethBuffer[xIndex] = pleth;
                this.respBuffer[xIndex] = resp;

                this.sweepX = (this.sweepX + 1) % w;
            }
        }

        // Render full display canvas
        this.drawGrid();

        // Trace vertical offsets & scale factors
        const ecgCenterY = h * 0.35;
        const ecgScale = (h * 0.18) * this.gain;

        const plethCenterY = h * 0.72;
        const plethScale = h * 0.10;

        const respCenterY = h * 0.89;
        const respScale = h * 0.07;

        // Render Traces
        this.drawTrace(this.ecgBuffer, ecgCenterY, ecgScale, '#00ff66', 'ECG Lead II', 2.0);
        this.drawTrace(this.plethBuffer, plethCenterY, plethScale, '#00e5ff', 'SpO2 PPG', 1.8);
        this.drawTrace(this.respBuffer, respCenterY, respScale, '#ffeb3b', 'Resp Wave', 1.8);

        // Draw Sweep Bar if not frozen
        if (!this.isFrozen) {
            const sweepIntX = Math.floor(this.sweepX);
            
            // Clear gap ahead of sweep bar
            this.ctx.fillStyle = '#050b07';
            this.ctx.fillRect(sweepIntX, 0, this.clearWidth, h);

            // Redraw grid inside clear gap
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
                    this.ctx.moveTo(x, 0);
                    this.ctx.lineTo(x, h);
                }
                for (let y = 0; y < h; y += largeGrid) {
                    this.ctx.moveTo(sweepIntX, y);
                    this.ctx.lineTo(sweepIntX + this.clearWidth, y);
                }
                this.ctx.stroke();
                this.ctx.restore();
            }

            // Draw glowing vertical sweep cursor line
            const grad = this.ctx.createLinearGradient(sweepIntX, 0, sweepIntX - 10, 0);
            grad.addColorStop(0, 'rgba(0, 255, 102, 0.8)');
            grad.addColorStop(1, 'rgba(0, 255, 102, 0.0)');
            this.ctx.fillStyle = grad;
            this.ctx.fillRect(sweepIntX - 10, 0, 10, h);
        }

        // Draw Calipers if enabled
        if (this.caliperMode) {
            this.drawCalipers();
        }

        // Draw Trace Labels
        this.ctx.font = '12px "Roboto Mono", monospace';
        this.ctx.fillStyle = 'rgba(0, 255, 102, 0.8)';
        this.ctx.fillText(`II  1.0mV  ${this.sweepSpeedMmPerSec}mm/s  Gain:${this.gain}x`, 15, 25);

        this.ctx.fillStyle = 'rgba(0, 229, 255, 0.8)';
        this.ctx.fillText('SpO2 PLETH', 15, h * 0.63);

        this.ctx.fillStyle = 'rgba(255, 235, 59, 0.8)';
        this.ctx.fillText('RESP', 15, h * 0.82);

        if (this.isFrozen) {
            this.ctx.font = 'bold 16px "Roboto Mono", monospace';
            this.ctx.fillStyle = '#ff3366';
            this.ctx.fillText('[ FREEZE / PAUSED ]', w - 190, 30);
        }
    }

    drawTrace(buffer, centerY, scale, color, label, lineW = 2.0) {
        const w = this.canvas.width;
        if (!buffer || buffer.length === 0) return;

        this.ctx.lineWidth = lineW;
        this.ctx.strokeStyle = color;
        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = 4;
        this.ctx.beginPath();

        let started = false;
        const sweepIntX = Math.floor(this.sweepX);

        for (let x = 0; x < w; x++) {
            // Skip the erase gap if sweeping
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
        this.ctx.shadowBlur = 0; // reset
    }

    drawCalipers() {
        const h = this.canvas.height;
        const c1 = this.caliper1X;
        const c2 = this.caliper2X;

        // Caliper vertical lines
        [c1, c2].forEach((cx, idx) => {
            this.ctx.strokeStyle = idx === 0 ? '#ffea00' : '#ff9100';
            this.ctx.lineWidth = 1.5;
            this.ctx.setLineDash([6, 4]);
            this.ctx.beginPath();
            this.ctx.moveTo(cx, 0);
            this.ctx.lineTo(cx, h);
            this.ctx.stroke();
            this.ctx.setLineDash([]); // Reset line dash

            // Handles
            this.ctx.fillStyle = idx === 0 ? '#ffea00' : '#ff9100';
            this.ctx.beginPath();
            this.ctx.arc(cx, h / 2, 6, 0, Math.PI * 2);
            this.ctx.fill();
        });

        // Horizontal measurement line between calipers
        const minX = Math.min(c1, c2);
        const maxX = Math.max(c1, c2);
        const dxPx = maxX - minX;

        // Calculate time delta in ms (at 25mm/s: 1mm = 40ms, pixelsPerMm = 4px -> 1px = 10ms at 25mm/s)
        const mm = dxPx / this.pixelsPerMm;
        const sec = mm / this.sweepSpeedMmPerSec;
        const ms = Math.round(sec * 1000);
        const calcBpm = ms > 0 ? Math.round(60000 / ms) : 0;

        // Draw measurement banner
        const midX = minX + dxPx / 2;
        const bannerY = h * 0.48;

        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 1.0;
        this.ctx.beginPath();
        this.ctx.moveTo(minX, bannerY);
        this.ctx.lineTo(maxX, bannerY);
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
            const dist1 = Math.abs(x - this.caliper1X);
            const dist2 = Math.abs(x - this.caliper2X);
            if (dist1 < 25) this.draggingCaliper = 1;
            else if (dist2 < 25) this.draggingCaliper = 2;
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
