/* ============================================================
   ICE CARVE — Canvas interaction
   - Renders a chunk of ice with caustic highlights
   - Mouse click: crack appears + shards fly out
   - Mouse drag: continuous shaving, dust trails
   - Cold mist drifts up around the block
   - Block "regenerates" smoothly once carved past threshold
   ============================================================ */

window.IceCarve = (function () {

  function mount(host, opts = {}) {
    const W = opts.width || 520;
    const H = opts.height || 420;

    // ----- DOM -----
    host.innerHTML = `
      <div class="ic-stage" style="width:${W}px;height:${H}px">
        <canvas class="ic-mist"   width="${W}" height="${H}"></canvas>
        <canvas class="ic-ice"    width="${W}" height="${H}"></canvas>
        <canvas class="ic-shards" width="${W}" height="${H}"></canvas>
        <div class="ic-prompt">
          <span class="ic-prompt-dot"></span>
          <span>CLICK · DRAG TO CARVE</span>
        </div>
        <div class="ic-meter">
          <span class="ic-meter-k">ICE</span>
          <span class="ic-meter-bar"><i style="width:100%"></i></span>
          <span class="ic-meter-v">100%</span>
        </div>
      </div>
    `;

    const stage  = host.querySelector(".ic-stage");
    const mist   = host.querySelector(".ic-mist");
    const ice    = host.querySelector(".ic-ice");
    const shards = host.querySelector(".ic-shards");
    const meterI = host.querySelector(".ic-meter i");
    const meterV = host.querySelector(".ic-meter-v");

    const mistCtx = mist.getContext("2d");
    const iceCtx  = ice.getContext("2d");
    const sCtx    = shards.getContext("2d");

    // ----- Ice geometry: faceted block (sharp angles, like a real ice chunk) -----
    // 2.5D cube-ish shape: top face + front face + right face, each a fixed polygon
    // so light hits them at different angles → reads as a hard, angular block.
    const cx = W / 2, cy = H / 2 + 14;
    const S  = Math.min(W, H) * 0.34;        // half-size
    // Outer silhouette (hand-tuned for a chunky, asymmetric ice block — NOT round)
    const ICE_SHAPE = [
      { x: cx - S * 0.95, y: cy - S * 0.28 },  // top-left corner
      { x: cx - S * 0.55, y: cy - S * 0.95 },  // top peak (left)
      { x: cx + S * 0.20, y: cy - S * 0.88 },  // top peak (right)
      { x: cx + S * 0.85, y: cy - S * 0.50 },  // upper-right corner
      { x: cx + S * 1.00, y: cy + S * 0.10 },  // right corner
      { x: cx + S * 0.70, y: cy + S * 0.78 },  // lower-right
      { x: cx + S * 0.05, y: cy + S * 0.92 },  // bottom
      { x: cx - S * 0.70, y: cy + S * 0.70 },  // lower-left
      { x: cx - S * 1.00, y: cy + S * 0.18 },  // left corner
    ];
    // Internal facet seams — fixed, NOT random. These create the 3D faceted look.
    // Each facet is a closed polygon of ICE_SHAPE indices + internal points.
    const FP = {
      // internal vertices (peaks of inner ridges)
      cTop:   { x: cx - S * 0.10, y: cy - S * 0.45 },   // upper inner ridge
      cMid:   { x: cx + S * 0.15, y: cy - S * 0.05 },   // central highlight peak
      cBot:   { x: cx - S * 0.05, y: cy + S * 0.35 },   // lower inner
      cLeft:  { x: cx - S * 0.55, y: cy + S * 0.10 },   // left mid
    };
    // Facets: list of polygon vertex arrays (each clipped against ICE_SHAPE outline).
    // Tones from light (top, catching highlight) to dark (bottom-right shadow side).
    const FACETS = [
      // top-front bright facet (catches the most light)
      { poly: [ ICE_SHAPE[1], ICE_SHAPE[2], FP.cMid, FP.cTop ],
        tone: "rgba(245, 250, 255, 0.92)" },
      // upper-left bright facet
      { poly: [ ICE_SHAPE[0], ICE_SHAPE[1], FP.cTop, FP.cLeft ],
        tone: "rgba(225, 240, 255, 0.85)" },
      // top-right mid facet
      { poly: [ ICE_SHAPE[2], ICE_SHAPE[3], FP.cMid ],
        tone: "rgba(200, 226, 252, 0.85)" },
      // right shadow facet (darker)
      { poly: [ ICE_SHAPE[3], ICE_SHAPE[4], ICE_SHAPE[5], FP.cMid ],
        tone: "rgba(140, 185, 232, 0.80)" },
      // center body
      { poly: [ FP.cTop, FP.cMid, FP.cBot, FP.cLeft ],
        tone: "rgba(180, 215, 248, 0.80)" },
      // bottom-right darker facet
      { poly: [ FP.cMid, ICE_SHAPE[5], ICE_SHAPE[6], FP.cBot ],
        tone: "rgba(110, 165, 220, 0.78)" },
      // bottom-left facet
      { poly: [ FP.cBot, ICE_SHAPE[6], ICE_SHAPE[7], FP.cLeft ],
        tone: "rgba(130, 180, 230, 0.78)" },
      // left mid facet (slightly darker)
      { poly: [ ICE_SHAPE[8], ICE_SHAPE[0], FP.cLeft, ICE_SHAPE[7] ],
        tone: "rgba(155, 200, 240, 0.80)" },
    ];
    // Edges to stroke (between adjacent facets) — gives the geometric crisp look
    const EDGES = [
      [ICE_SHAPE[0], FP.cLeft], [ICE_SHAPE[1], FP.cTop], [ICE_SHAPE[2], FP.cMid],
      [ICE_SHAPE[3], FP.cMid], [ICE_SHAPE[5], FP.cBot], [ICE_SHAPE[7], FP.cBot],
      [FP.cTop, FP.cMid], [FP.cMid, FP.cBot], [FP.cTop, FP.cLeft], [FP.cLeft, FP.cBot],
    ];

    // ----- Damage mask (a separate canvas; we punch out chips) -----
    const mask = document.createElement("canvas");
    mask.width = W; mask.height = H;
    const mCtx = mask.getContext("2d");

    let integrity = 1;       // 1 = full, 0 = gone
    const cracks = [];       // {x,y,branches:[{angle,length,age}]}
    const chipMarks = [];    // pale surface chips; avoids dark punched-out holes
    const shardList = [];    // flying pieces
    const mistParticles = [];

    // seed mist
    for (let i = 0; i < 40; i++) {
      mistParticles.push({
        x: cx + (Math.random() - 0.5) * S * 2.4,
        y: cy + S * 0.6 + Math.random() * 40,
        r: 14 + Math.random() * 28,
        vy: -0.2 - Math.random() * 0.4,
        vx: (Math.random() - 0.5) * 0.2,
        life: Math.random(),
        seed: Math.random() * 1000,
      });
    }

    // ----- Drawing primitives -----
    // Outer silhouette as STRAIGHT lines (sharp corners, faceted look)
    function pathIce(ctx) {
      ctx.beginPath();
      ICE_SHAPE.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
    }

    function pathFacet(ctx, pts) {
      ctx.beginPath();
      pts.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
    }

    // Pre-computed highlight polygon (a small bright wedge near the top-front facet)
    // FIXED — no random flickering
    const HIGHLIGHT = [
      { x: ICE_SHAPE[1].x + S*0.10, y: ICE_SHAPE[1].y + S*0.10 },
      { x: ICE_SHAPE[2].x - S*0.20, y: ICE_SHAPE[2].y + S*0.08 },
      { x: FP.cMid.x - S*0.15, y: FP.cMid.y - S*0.10 },
      { x: FP.cTop.x + S*0.08, y: FP.cTop.y + S*0.12 },
    ];

    function drawIce() {
      iceCtx.clearRect(0, 0, W, H);

      // Compute shrink scale from integrity: full=1.0, gone=0.55
      // The block visibly gets smaller as it's carved.
      const scale = 1;
      // Anchor the bottom of the ice to a fixed "ground" line so it sinks toward the floor as it shrinks
      const groundLine = cy + S * 0.92;

      // shadow under ice — also shrinks with the block, stays on the ground line
      iceCtx.save();
      iceCtx.filter = "blur(20px)";
      iceCtx.fillStyle = "rgba(60,110,180,0.45)";
      iceCtx.beginPath();
      iceCtx.ellipse(cx + S*0.05, groundLine + S*0.10, S*0.95, S*0.18, 0, 0, Math.PI * 2);
      iceCtx.fill();
      iceCtx.restore();

      // Apply scale transform — pivot at bottom of ice (groundLine, cx)
      iceCtx.save();
      iceCtx.translate(cx, groundLine);
      iceCtx.scale(scale, scale);
      iceCtx.translate(-cx, -groundLine);

      // ---- Clip everything to the outer ice silhouette ----
      iceCtx.save();
      pathIce(iceCtx);
      iceCtx.clip();

      // 1. Paint each facet as a flat color tone — this is what makes it look like a CUT block
      FACETS.forEach(f => {
        pathFacet(iceCtx, f.poly);
        iceCtx.fillStyle = f.tone;
        iceCtx.fill();
      });

      // 2. Draw the internal facet seams (the 3D edges between facets) — fixed, crisp
      iceCtx.lineCap = "round";
      iceCtx.lineJoin = "round";
      iceCtx.strokeStyle = "rgba(255,255,255,0.32)";
      iceCtx.lineWidth = 0.8;
      EDGES.forEach(([a, b]) => {
        iceCtx.beginPath();
        iceCtx.moveTo(a.x, a.y);
        iceCtx.lineTo(b.x, b.y);
        iceCtx.stroke();
      });
      // darker undertone for some seams (gives depth)
      iceCtx.strokeStyle = "rgba(60, 110, 170, 0.35)";
      iceCtx.lineWidth = 0.5;
      EDGES.slice(4).forEach(([a, b]) => {
        iceCtx.beginPath();
        iceCtx.moveTo(a.x, a.y);
        iceCtx.lineTo(b.x, b.y);
        iceCtx.stroke();
      });

      // 3. One static highlight polygon — bright wedge near top facet
      pathFacet(iceCtx, HIGHLIGHT);
      iceCtx.fillStyle = "rgba(255,255,255,0.38)";
      iceCtx.fill();

      // 4. Subtle gradient overlay top-to-bottom for cohesion
      const grad = iceCtx.createLinearGradient(cx, cy - S, cx, cy + S);
      grad.addColorStop(0, "rgba(255,255,255,0.08)");
      grad.addColorStop(1, "rgba(40, 90, 160, 0.18)");
      iceCtx.fillStyle = grad;
      iceCtx.fillRect(cx - S * 1.2, cy - S * 1.2, S * 2.4, S * 2.4);

      // 5. Pale surface chips instead of dark punched-out holes.
      chipMarks.forEach(mark => drawChipMark(iceCtx, mark));

      // 6. Cracks from carving (these ARE meant to be visible after clicking)
      cracks.forEach(c => drawCrack(iceCtx, c));

      iceCtx.restore();

      // ---- Outline strokes (sharp corner look) ----
      iceCtx.save();
      pathIce(iceCtx);
      iceCtx.lineJoin = "miter";
      iceCtx.miterLimit = 4;
      iceCtx.lineWidth = 1.4;
      iceCtx.strokeStyle = "rgba(255,255,255,0.55)";
      iceCtx.stroke();
      iceCtx.lineWidth = 0.6;
      iceCtx.strokeStyle = "rgba(60, 110, 180, 0.7)";
      iceCtx.stroke();
      iceCtx.restore();          // closes outline save

      iceCtx.restore();          // closes scale transform save
    }

    function drawCrack(ctx, c) {
      ctx.lineCap = "round";
      c.branches.forEach(b => {
        const alpha = Math.max(0, 1 - b.age / 220);
        ctx.strokeStyle = `rgba(40, 70, 120, ${alpha * 0.85})`;
        ctx.lineWidth = b.width;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        let x = c.x, y = c.y, a = b.angle;
        const seg = 6;
        for (let i = 0; i < seg; i++) {
          a += (Math.random() - 0.5) * 0.7;
          x += Math.cos(a) * b.length / seg;
          y += Math.sin(a) * b.length / seg;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        // tiny offshoots
        if (b.width > 1.2) {
          ctx.lineWidth = b.width * 0.5;
          ctx.strokeStyle = `rgba(40, 70, 120, ${alpha * 0.5})`;
          ctx.beginPath();
          ctx.moveTo(c.x + Math.cos(a) * b.length * 0.3, c.y + Math.sin(a) * b.length * 0.3);
          const a2 = a + (Math.random() - 0.5) * 1.4;
          ctx.lineTo(
            c.x + Math.cos(a) * b.length * 0.3 + Math.cos(a2) * b.length * 0.3,
            c.y + Math.sin(a) * b.length * 0.3 + Math.sin(a2) * b.length * 0.3
          );
          ctx.stroke();
        }
      });
    }

    function drawChipMark(ctx, mark) {
      const alpha = Math.max(0, 1 - mark.age / 900);
      if (alpha <= 0) return;

      ctx.save();
      ctx.translate(mark.x, mark.y);
      ctx.rotate(mark.rot);

      ctx.beginPath();
      mark.shape.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fillStyle = `rgba(222, 242, 255, ${0.34 * alpha})`;
      ctx.fill();

      ctx.save();
      ctx.clip();
      const grad = ctx.createLinearGradient(-mark.size, -mark.size, mark.size, mark.size);
      grad.addColorStop(0, `rgba(255,255,255,${0.45 * alpha})`);
      grad.addColorStop(0.58, `rgba(180,220,248,${0.18 * alpha})`);
      grad.addColorStop(1, `rgba(70,125,190,${0.16 * alpha})`);
      ctx.fillStyle = grad;
      ctx.fillRect(-mark.size * 1.4, -mark.size * 1.4, mark.size * 2.8, mark.size * 2.8);
      ctx.restore();

      ctx.strokeStyle = `rgba(255,255,255,${0.55 * alpha})`;
      ctx.lineWidth = 0.75;
      ctx.stroke();

      ctx.restore();
    }

    // Mouse coords are in canvas space (un-scaled). To hit-test against
    // ICE_SHAPE we must inverse the scale that drawIce applies.
    function pointInIce(x, y) {
      const scale = 1;
      const groundLine = cy + S * 0.92;
      // inverse transform: world → local
      const lx = (x - cx) / scale + cx;
      const ly = (y - groundLine) / scale + groundLine;
      let inside = false;
      for (let i = 0, j = ICE_SHAPE.length - 1; i < ICE_SHAPE.length; j = i++) {
        const xi = ICE_SHAPE[i].x, yi = ICE_SHAPE[i].y;
        const xj = ICE_SHAPE[j].x, yj = ICE_SHAPE[j].y;
        const intersect = ((yi > ly) !== (yj > ly)) &&
                          (lx < (xj - xi) * (ly - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    }

    // ---- Generate an angular ice-shard polygon ----
    // Returns array of {x,y} relative to (0,0) center, with sharp irregular vertices.
    function makeShardShape(size){
      const n = 4 + Math.floor(Math.random() * 3);        // 4-6 vertices
      const pts = [];
      for (let i = 0; i < n; i++){
        const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const r = size * (0.55 + Math.random() * 0.7);
        pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
      }
      return pts;
    }

    function carveAt(x, y, strength = 1) {
      if (!pointInIce(x, y)) return false;

      // Convert world-space (x,y) into LOCAL ice-block coords so the bite
      // is stamped on the un-scaled mask correctly.
      const scale = 1;
      const groundLine = cy + S * 0.92;
      const lx = (x - cx) / scale + cx;
      const ly = (y - groundLine) / scale + groundLine;

      // 1. Punch a CHUNK out of the mask — irregular polygon, not a soft round blob
      const biteSize = 7 + Math.random() * 6 * strength;
      const bite = makeShardShape(biteSize);
      chipMarks.push({ x: lx, y: ly, shape: bite, size: biteSize, rot: Math.random() * Math.PI * 2, age: 0 });
      if (chipMarks.length > 42) chipMarks.shift();

      // 2. Integrity drops — ice will visibly SHRINK because we scale the whole block by integrity
      integrity = Math.max(0, integrity - 0.004 * strength);

      // 3. Crack near the hit — stored in LOCAL coords so it scales with the ice
      if (Math.random() < 0.55) {
        const branches = [];
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          branches.push({
            angle: Math.random() * Math.PI * 2,
            length: 18 + Math.random() * 36,
            age: 0,
            width: 0.8 + Math.random() * 1.4,
          });
        }
        cracks.push({ x: lx, y: ly, branches });
        if (cracks.length > 24) cracks.shift();
      }

      // 4. SPAWN ANGULAR ICE SHARDS — chunky polygons, not pixels
      // Each shard inherits the ice color palette and has a bright facet + dark facet.
      const count = 4 + Math.floor(Math.random() * 4);
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 2.5 + Math.random() * 4.5 * strength;
        const size = 4 + Math.random() * 8 * (0.7 + strength * 0.4);
        const shape = makeShardShape(size);
        // pick a tone from the ice palette
        const tones = [
          { fill: "rgba(232, 244, 255, 0.96)", shade: "rgba(120, 175, 230, 0.85)" },
          { fill: "rgba(210, 232, 252, 0.94)", shade: "rgba(100, 160, 220, 0.85)" },
          { fill: "rgba(190, 220, 248, 0.92)", shade: "rgba(85,  145, 210, 0.85)" },
          { fill: "rgba(170, 210, 245, 0.90)", shade: "rgba(70,  130, 200, 0.85)" },
        ];
        const tone = tones[Math.floor(Math.random() * tones.length)];
        shardList.push({
          x, y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - (2 + Math.random() * 2.5),   // initial upward kick
          shape,
          size,
          tone,
          rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 0.35,
          life: 1,
          fade: 0.008 + Math.random() * 0.006,
          grounded: false,
          restY: 0,
        });
      }

      // 5. Cold dust + mist puff at impact
      for (let i = 0; i < 5; i++) {
        mistParticles.push({
          x: x + (Math.random() - 0.5) * 20,
          y: y + (Math.random() - 0.5) * 20,
          r: 6 + Math.random() * 14,
          vy: -0.5 - Math.random() * 0.6,
          vx: (Math.random() - 0.5) * 0.8,
          life: 1,
          seed: Math.random() * 1000,
        });
      }

      return true;
    }

    // ground line where shards land — just below the ice block
    function groundY() { return cy + S * 0.96; }

    function updateShards() {
      sCtx.clearRect(0, 0, W, H);
      const gY = groundY();

      for (let i = shardList.length - 1; i >= 0; i--) {
        const s = shardList[i];

        if (!s.grounded) {
          s.x += s.vx;
          s.y += s.vy;
          s.vy += 0.32;            // gravity (heavier — feels like real ice chunk)
          s.vx *= 0.985;
          s.rot += s.vr;

          // Land on ground with a small bounce, then settle
          if (s.y >= gY) {
            if (Math.abs(s.vy) > 1.3) {
              // bounce
              s.y = gY;
              s.vy = -s.vy * 0.32;
              s.vx *= 0.55;
              s.vr *= 0.6;
            } else {
              s.grounded = true;
              s.restY = gY;
              s.y = gY;
              s.vx = 0; s.vy = 0; s.vr = 0;
              // slight settle rotation toward flat
              s.rot = s.rot * 0.6;
              // start fading
              s.fade = 0.012;
            }
          }
        } else {
          // sitting on ground — fade out
          s.life -= s.fade;
        }

        if (s.life <= 0 || s.y > H + 40 || s.x < -40 || s.x > W + 40) {
          shardList.splice(i, 1);
          continue;
        }

        // ---- Draw a polygonal ice shard ----
        sCtx.save();
        sCtx.globalAlpha = Math.max(0, s.life);
        sCtx.translate(s.x, s.y);
        sCtx.rotate(s.rot);

        // base fill
        sCtx.beginPath();
        s.shape.forEach((p, j) => {
          if (j === 0) sCtx.moveTo(p.x, p.y);
          else sCtx.lineTo(p.x, p.y);
        });
        sCtx.closePath();
        sCtx.fillStyle = s.tone.fill;
        sCtx.fill();

        // bottom-half darker facet for depth
        sCtx.save();
        sCtx.clip();
        sCtx.fillStyle = s.tone.shade;
        sCtx.fillRect(-s.size, 0, s.size * 2, s.size * 1.5);
        sCtx.restore();

        // bright top edge highlight
        sCtx.strokeStyle = "rgba(255,255,255,0.7)";
        sCtx.lineWidth = 0.6;
        sCtx.beginPath();
        for (let j = 0; j < s.shape.length; j++){
          const a = s.shape[j];
          const b = s.shape[(j + 1) % s.shape.length];
          // only stroke the upper half of the polygon
          if (a.y < 0 && b.y < 0){
            sCtx.moveTo(a.x, a.y);
            sCtx.lineTo(b.x, b.y);
          }
        }
        sCtx.stroke();

        // outline
        sCtx.strokeStyle = "rgba(50, 95, 160, 0.55)";
        sCtx.lineWidth = 0.5;
        sCtx.beginPath();
        s.shape.forEach((p, j) => {
          if (j === 0) sCtx.moveTo(p.x, p.y);
          else sCtx.lineTo(p.x, p.y);
        });
        sCtx.closePath();
        sCtx.stroke();

        sCtx.restore();
      }
    }

    function updateCracks() {
      cracks.forEach(c => c.branches.forEach(b => b.age++));
      // fade old cracks
      for (let i = cracks.length - 1; i >= 0; i--) {
        if (cracks[i].branches.every(b => b.age > 220)) cracks.splice(i, 1);
      }
      chipMarks.forEach(c => c.age++);
      for (let i = chipMarks.length - 1; i >= 0; i--) {
        if (chipMarks[i].age > 900) chipMarks.splice(i, 1);
      }
    }

    function updateMist(t) {
      mistCtx.clearRect(0, 0, W, H);
      mistCtx.globalCompositeOperation = "lighter";
      for (let i = mistParticles.length - 1; i >= 0; i--) {
        const m = mistParticles[i];
        m.x += m.vx + Math.sin(t / 1000 + m.seed) * 0.15;
        m.y += m.vy;
        m.life -= 0.004;
        if (m.life <= 0 || m.y < -40) {
          // respawn near base of ice
          m.x = cx + (Math.random() - 0.5) * S * 2.4;
          m.y = cy + S * 0.6 + Math.random() * 40;
          m.r = 14 + Math.random() * 28;
          m.life = 1;
          m.vy = -0.2 - Math.random() * 0.4;
          m.vx = (Math.random() - 0.5) * 0.2;
          continue;
        }
        const a = Math.max(0, m.life) * 0.18;
        const grad = mistCtx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
        grad.addColorStop(0, `rgba(220, 240, 255, ${a})`);
        grad.addColorStop(1, `rgba(220, 240, 255, 0)`);
        mistCtx.fillStyle = grad;
        mistCtx.beginPath();
        mistCtx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        mistCtx.fill();
      }
      mistCtx.globalCompositeOperation = "source-over";
    }

    // No mid-play healing — ice stays carved until it runs out.
    function regenerate() { /* no-op */ }

    function fullRegen() {
      mCtx.clearRect(0, 0, W, H);
      integrity = 1;
      cracks.length = 0;
      chipMarks.length = 0;
    }

    // ----- Input -----
    let dragging = false;
    let lastT = 0, lastX = 0, lastY = 0;
    function getPos(e) {
      const r = stage.getBoundingClientRect();
      const t = (e.touches ? e.touches[0] : e);
      return { x: (t.clientX - r.left) * (W / r.width), y: (t.clientY - r.top) * (H / r.height) };
    }
    function onDown(e) {
      const p = getPos(e);
      dragging = true; lastX = p.x; lastY = p.y; lastT = performance.now();
      stage.classList.add("is-striking");
      // brief "hit" pulse — cursor returns to idle after 120ms even if held
      clearTimeout(stage._strikeT);
      stage._strikeT = setTimeout(() => stage.classList.remove("is-striking"), 140);
      carveAt(p.x, p.y, 1.4);
      e.preventDefault();
    }
    function onMove(e) {
      if (!dragging) return;
      const now = performance.now();
      if (now - lastT < 24) return;
      const p = getPos(e);
      // interpolate to fill gaps
      const dx = p.x - lastX, dy = p.y - lastY;
      const dist = Math.hypot(dx, dy);
      const steps = Math.min(6, Math.max(1, Math.floor(dist / 8)));
      for (let i = 1; i <= steps; i++) {
        carveAt(lastX + dx * i / steps, lastY + dy * i / steps, 0.7);
      }
      // re-pulse the strike pose during drag
      stage.classList.add("is-striking");
      clearTimeout(stage._strikeT);
      stage._strikeT = setTimeout(() => stage.classList.remove("is-striking"), 110);
      lastX = p.x; lastY = p.y; lastT = now;
      e.preventDefault();
    }
    function onUp() {
      dragging = false;
      clearTimeout(stage._strikeT);
      stage.classList.remove("is-striking");
    }

    stage.addEventListener("mousedown",  onDown);
    stage.addEventListener("mousemove",  onMove);
    addEventListener("mouseup",          onUp);
    stage.addEventListener("touchstart", onDown, { passive: false });
    stage.addEventListener("touchmove",  onMove, { passive: false });
    addEventListener("touchend",         onUp);

    // ----- Loop -----
    function loop(t) {
      updateMist(t);
      drawIce();
      updateShards();
      updateCracks();
      regenerate();

      // When fully carved, wait a beat and then regenerate a fresh block
      if (integrity < 0.02 && !window._iceRegenT) {
        window._iceRegenT = setTimeout(() => {
          fullRegen();
          window._iceRegenT = null;
        }, 1800);
      }

      // meter
      const pct = Math.round(integrity * 100);
      meterI.style.width = pct + "%";
      meterV.textContent = pct + "%";

      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    return {
      reset: fullRegen,
    };
  }

  return { mount };
})();
