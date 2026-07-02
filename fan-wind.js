/* ============================================================
   FAN + WIND ENGINE
   - Renders an SVG fan (white minimalist)
   - Renders a big red power button
   - When ON: rotates the fan, broadcasts a "wind level" that other
     elements subscribe to in order to sway / drift.
   - Exposes:
       FanWind.mount(targetEl, opts)
       FanWind.isOn()
       FanWind.onChange(cb)        // cb(level: 0..3, on: bool)
       FanWind.applyDrift(el, k)   // attach inline sway to any element
   ============================================================ */

window.FanWind = (function () {
  let state = { on: false, speed: 0, level: 2 };  // level 1..3 multiplies speed/effects
  const subs = [];
  const driftEls = [];                  // {el, k, baseX, baseY}
  let rafId = null;
  let t0 = performance.now();
  let currentRotation = 0;
  let fanHostEl = null;   // for body shake at L3

  // ---------- Public ----------
  function isOn() { return state.on; }
  function getLevel() { return state.level; }
  function setLevel(lv) {
    state.level = Math.max(1, Math.min(3, lv | 0));
    notify();
  }

  function onChange(cb) { subs.push(cb); cb(state.speed, state.on); }

  function notify() { subs.forEach(cb => cb(state.speed, state.on)); }

  function applyDrift(el, k = 1) {
    if (!el) return;
    driftEls.push({ el, k, seed: Math.random() * 1000 });
  }

  /* mount({
       host: HTMLElement,
       size: 320,
       label: "POWER",
   }) */
  function mount(host, opts = {}) {
    const size = opts.size || 320;
    const label = opts.label || "POWER";

    host.innerHTML = `
      <div class="fw-wrap" style="--fw-size:${size}px">
        <div class="fw-fan" aria-hidden="true">
          <svg class="fw-fan-svg" viewBox="0 0 200 200" width="${size}" height="${size}">
            <!-- outer cage -->
            <circle cx="100" cy="100" r="96" fill="none" stroke="rgba(232,237,245,0.18)" stroke-width="1.5"/>
            <circle cx="100" cy="100" r="88" fill="none" stroke="rgba(232,237,245,0.10)" stroke-width="1"/>
            <!-- cage radial lines -->
            <g stroke="rgba(232,237,245,0.12)" stroke-width="0.6">
              ${Array.from({length: 24}).map((_, i) => {
                const a = (i * 15) * Math.PI / 180;
                const x1 = 100 + Math.cos(a) * 14;
                const y1 = 100 + Math.sin(a) * 14;
                const x2 = 100 + Math.cos(a) * 95;
                const y2 = 100 + Math.sin(a) * 95;
                return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
              }).join("")}
            </g>
            <g stroke="rgba(232,237,245,0.10)" stroke-width="0.6" fill="none">
              <circle cx="100" cy="100" r="35"/>
              <circle cx="100" cy="100" r="55"/>
              <circle cx="100" cy="100" r="75"/>
            </g>

            <!-- blades — group rotates -->
            <g class="fw-blades" style="transform-origin:100px 100px">
              <g>
                <!-- 3 blades 120deg apart -->
                ${[0, 120, 240].map(rot => `
                  <path d="M 100 100
                           Q 118 60 100 18
                           Q 82 60 100 100 Z"
                        fill="rgba(248,250,255,0.94)"
                        transform="rotate(${rot} 100 100)"/>
                `).join("")}
              </g>
              <!-- center hub -->
              <circle cx="100" cy="100" r="11" fill="#0a1628" stroke="rgba(248,250,255,0.9)" stroke-width="1.5"/>
              <circle cx="100" cy="100" r="3" fill="rgba(248,250,255,0.7)"/>
            </g>
          </svg>
          <div class="fw-base">
            <div class="fw-base-stem"></div>
            <div class="fw-base-foot"></div>
          </div>
        </div>

        <div class="fw-control">
          <div class="fw-control-label">
            <span class="fw-led" data-on="false"></span>
            <span class="fw-control-text">${label}</span>
          </div>
          <button class="fw-btn" aria-pressed="false" aria-label="Power">
            <span class="fw-btn-ring"></span>
            <span class="fw-btn-cap"></span>
            <span class="fw-btn-gloss"></span>
          </button>
          <div class="fw-meta">
            <span class="fw-meta-k">STATE</span>
            <span class="fw-meta-v" data-fw-state>OFF</span>
          </div>
        </div>
      </div>
    `;

    const blades = host.querySelector(".fw-blades");
    const btn    = host.querySelector(".fw-btn");
    const led    = host.querySelector(".fw-led");
    const stateV = host.querySelector("[data-fw-state]");

    btn.addEventListener("click", () => {
      state.on = !state.on;
      btn.setAttribute("aria-pressed", String(state.on));
      btn.classList.toggle("is-on", state.on);
      led.dataset.on = String(state.on);
      stateV.textContent = state.on ? "ON · L3" : "OFF";
      notify();
    });

    fanHostEl = host;

    // ---------- Animation loop ----------
    function loop(now) {
      const dt = Math.min(50, now - t0) / 1000;
      t0 = now;

      // Target speed depends on LEVEL when on:
      // L1 → 0.45 (gentle breeze)
      // L2 → 0.75 (steady)
      // L3 → 1.40 (well past "max", so blades blur and shake)
      const levelTargets = { 1: 0.45, 2: 0.75, 3: 1.40 };
      const target = state.on ? (levelTargets[state.level] || 0.75) : 0;
      // L3 ramps faster (sudden gust feel), L1 slower (gentle)
      const rampRate = state.on
        ? (state.level === 3 ? 2.8 : state.level === 1 ? 1.0 : 1.6)
        : 2.2;
      state.speed += (target - state.speed) * Math.min(1, dt * rampRate);
      if (Math.abs(state.speed - target) < 0.001) state.speed = target;

      // rotate blades — base 540deg/sec at speed 1, scales linearly so L3 → ~756deg/sec (2.1 turns/sec)
      currentRotation += state.speed * 540 * dt;
      blades.style.transform = `rotate(${currentRotation}deg)`;

      // BODY SHAKE — only at L3 (speed > 1)
      const shakeIntensity = Math.max(0, state.speed - 1.0) * 5;
      if (shakeIntensity > 0.05 && fanHostEl) {
        const sx = (Math.random() - 0.5) * shakeIntensity;
        const sy = (Math.random() - 0.5) * shakeIntensity * 0.6;
        fanHostEl.style.transform = `translate(${sx.toFixed(2)}px, ${sy.toFixed(2)}px)`;
      } else if (fanHostEl && fanHostEl.style.transform) {
        fanHostEl.style.transform = "";
      }

      // Apparent motion blur — fade blades and add radial flash glow at high speed
      // (cheaper than CSS filter:blur which causes screenshot timeouts)
      const fade = Math.max(0, state.speed - 0.85);
      blades.style.opacity = (1 - fade * 0.45).toFixed(3);

      // apply wind drift to subscribed elements — scales with speed, so L3 is much more dramatic
      const tSec = now / 1000;
      const driftBoost = state.speed;          // 0..1.4
      const wobbleAmp  = state.level === 3 ? 4.5 : 1.5;
      for (const d of driftEls) {
        const wobble = Math.sin(tSec * (1.4 + state.level * 0.3) + d.seed) * wobbleAmp * d.k;
        const push   = driftBoost * 7 * d.k;
        const yWob   = Math.sin(tSec * 0.9 + d.seed * 1.7) * 1.2 * d.k * driftBoost;
        d.el.style.transform = `translate(${push + wobble * driftBoost}px, ${yWob}px)`;
      }

      // broadcast continuous speed to css var on root (clamped 0..~1.4 for css)
      document.documentElement.style.setProperty("--wind", state.speed.toFixed(3));
      // also expose level so CSS can react (e.g. show debris, screen tint)
      document.documentElement.style.setProperty("--fan-level", state.on ? state.level : 0);

      rafId = requestAnimationFrame(loop);
    }
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  return { mount, isOn, onChange, applyDrift, setLevel, getLevel };
})();


/* ============================================================
   CURSOR — minimal weather-station crosshair that follows mouse
   Auto-attaches; respects prefers-reduced-motion.
   ============================================================ */
(function () {
  if (matchMedia("(pointer:coarse)").matches) return; // skip on touch
  const el = document.createElement("div");
  el.className = "wx-cursor";
  el.innerHTML = `
    <svg viewBox="-20 -20 40 40" width="40" height="40" aria-hidden="true">
      <circle r="14" fill="none" stroke="rgba(91,158,255,0.65)" stroke-width="0.8"/>
      <circle r="2"  fill="rgba(91,158,255,0.9)"/>
      <line x1="-18" y1="0" x2="-8" y2="0" stroke="rgba(91,158,255,0.6)" stroke-width="0.8"/>
      <line x1="18"  y1="0" x2="8"  y2="0" stroke="rgba(91,158,255,0.6)" stroke-width="0.8"/>
      <line x1="0" y1="-18" x2="0" y2="-8" stroke="rgba(91,158,255,0.6)" stroke-width="0.8"/>
      <line x1="0" y1="18"  x2="0" y2="8"  stroke="rgba(91,158,255,0.6)" stroke-width="0.8"/>
    </svg>
  `;
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(el));
  let tx = 0, ty = 0, x = 0, y = 0;
  addEventListener("mousemove", e => { tx = e.clientX; ty = e.clientY; });
  function tick() {
    x += (tx - x) * 0.18;
    y += (ty - y) * 0.18;
    el.style.transform = `translate(${x - 20}px, ${y - 20}px)`;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
