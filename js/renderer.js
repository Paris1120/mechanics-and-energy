/* =========================================================
 * renderer.js : 시뮬레이션 캔버스 그리기
 * ========================================================= */
const Renderer = (() => {
  let canvas,
    ctx,
    W = 0,
    H = 0,
    view = null;

  const C = {
    bg: '#060a11',
    grid: '#131b29',
    gridText: '#4b5563',
    groundFill: '#0a0f18',
    groundLine: '#334155',
    main: '#3b82f6',
    mainSolid: '#60a5fa',
    ideal: '#94a3b8',
    alt: '#a78bfa',
    vx: '#34d399',
    vy: '#fb923c',
    target: '#f87171',
    person: '#cbd5e1',
  };
  const FONT = '11px Pretendard, "Malgun Gothic", sans-serif';
  const MONO = '10px "JetBrains Mono", Consolas, monospace';

  function init(el) {
    canvas = el;
    ctx = canvas.getContext('2d');
    resize();
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    W = r.width;
    H = r.height;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const maxY = (path) => path.reduce((m, p) => Math.max(m, p.y), 0);
  const toPx = (x, y) => [view.ox + x * view.s, view.oy - y * view.s];

  // 화면에 모든 것이 들어오도록 축척 계산 (가로·세로 같은 비율)
  function fitView(res) {
    const inp = res.input;
    let yTop = Math.max(res.apex.y, inp.targetH, inp.groundH + inp.height);
    if (res.idealPath) yTop = Math.max(yTop, maxY(res.idealPath));
    if (res.altPath) yTop = Math.max(yTop, maxY(res.altPath));

    const xMin = -Math.max(1, res.R * 0.06) - inp.height * 0.3;
    const xMax = res.R + Math.max(1, res.R * 0.08);
    const yMax = yTop * 1.12 + 0.5;
    const pad = { l: 46, r: 24, t: 24, b: 34 };

    const s = Math.min(
      (W - pad.l - pad.r) / (xMax - xMin),
      (H - pad.t - pad.b) / yMax,
    );
    const usedW = (xMax - xMin) * s;
    view = {
      s,
      ox: pad.l + (W - pad.l - pad.r - usedW) / 2 - xMin * s,
      oy: H - pad.b,
    };
  }

  function line(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function niceStep(raw) {
    const p = 10 ** Math.floor(Math.log10(raw));
    const n = raw / p;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p;
  }

  function drawGrid() {
    const { s, ox, oy } = view;
    const step = niceStep(70 / s); // 약 70px 간격
    const x0 = -ox / s,
      x1 = (W - ox) / s,
      y1 = oy / s;
    const label = (v) => `${parseFloat(v.toFixed(2))}m`;

    ctx.lineWidth = 1;
    ctx.strokeStyle = C.grid;
    ctx.font = MONO;
    ctx.fillStyle = C.gridText;

    for (let i = Math.ceil(x0 / step); i * step <= x1; i++) {
      const [px] = toPx(i * step, 0);
      line(px, 0, px, oy);
      ctx.textAlign = 'center';
      ctx.fillText(label(i * step), px, oy + 16);
    }
    for (let i = 1; i * step <= y1; i++) {
      const [, py] = toPx(0, i * step);
      line(0, py, W, py);
      ctx.textAlign = 'left';
      ctx.fillText(label(i * step), 4, py - 4);
    }
  }

  function drawGround(res) {
    const { oy } = view;
    ctx.fillStyle = C.groundFill;
    ctx.fillRect(0, oy, W, H - oy);
    ctx.strokeStyle = C.groundLine;
    ctx.lineWidth = 1.5;
    line(0, oy, W, oy);

    const gH = res.input.groundH;
    if (gH > 0) {
      // 발사대(언덕/건물)
      const [xr, yt] = toPx(0.25, gH);
      ctx.fillStyle = '#111827';
      ctx.fillRect(0, yt, xr, oy - yt);
      ctx.strokeRect(0, yt, xr, oy - yt);
    }
  }

  function drawPerson(res) {
    const inp = res.input,
      Hp = inp.height,
      gH = inp.groundH,
      bx = -0.18 * Hp;
    ctx.strokeStyle = C.person;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.5, 0.025 * Hp * view.s);

    const [f1x, f1y] = toPx(bx - 0.1 * Hp, gH);
    const [f2x, f2y] = toPx(bx + 0.1 * Hp, gH);
    const [hx, hy] = toPx(bx, gH + 0.5 * Hp); // 골반
    const [sx, sy] = toPx(bx, gH + 0.82 * Hp); // 어깨
    const [handX, handY] = toPx(0, res.h0); // 던지는 손
    const [a2x, a2y] = toPx(bx - 0.12 * Hp, gH + 0.55 * Hp);
    const [cx, cy] = toPx(bx, gH + 0.935 * Hp); // 머리 중심

    line(f1x, f1y, hx, hy);
    line(f2x, f2y, hx, hy);
    line(hx, hy, sx, sy);
    line(sx, sy, handX, handY);
    line(sx, sy, a2x, a2y);
    ctx.beginPath();
    ctx.arc(cx, cy, 0.065 * Hp * view.s, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawTarget(res) {
    const ht = res.input.targetH;
    const [px, py] = toPx(res.R, ht);
    const [, gy] = toPx(res.R, 0);

    if (ht > 0) {
      // 기둥 + 받침
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 3;
      line(px + 12, gy, px + 12, py);
      line(px + 12, py, px + 9, py);
    }
    ctx.strokeStyle = C.target;
    ctx.lineWidth = 2.5; // 링
    ctx.beginPath();
    ctx.ellipse(px, py, 10, 3.5, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 1.5; // 깃발
    line(px + 12, py, px + 12, py - 30);
    ctx.fillStyle = C.target;
    ctx.beginPath();
    ctx.moveTo(px + 12, py - 30);
    ctx.lineTo(px + 28, py - 25);
    ctx.lineTo(px + 12, py - 20);
    ctx.fill();

    ctx.font = FONT;
    ctx.fillStyle = '#fca5a5';
    ctx.textAlign = 'center';
    ctx.fillText(`목표 (${res.R}m, ${ht}m)`, px, py - 38);
  }

  function drawPath(path, color, dash, width, alpha, cur = null) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let [px, py] = toPx(path[0].x, path[0].y);
    ctx.moveTo(px, py);
    const stride = Math.max(1, Math.floor(path.length / 1500));
    for (let i = stride; i < path.length; i += stride) {
      if (cur && path[i].t > cur.t) break;
      [px, py] = toPx(path[i].x, path[i].y);
      ctx.lineTo(px, py);
    }
    const last = cur || path[path.length - 1];
    [px, py] = toPx(last.x, last.y);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.restore();
  }

  function drawAngleArc(res) {
    const [hx, hy] = toPx(0, res.h0);
    const r = 34,
      a = -res.theta;
    ctx.save();
    ctx.strokeStyle = 'rgba(148,163,184,.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    line(hx, hy, hx + r + 18, hy);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(hx, hy, r, Math.min(0, a), Math.max(0, a));
    ctx.stroke();
    ctx.font = FONT;
    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'left';
    ctx.fillText(
      `θ=${(res.theta / Physics.DEG).toFixed(1)}°`,
      hx + (r + 8) * Math.cos(a / 2),
      hy + (r + 8) * Math.sin(a / 2) + 4,
    );
    ctx.restore();
  }

  function drawApex(res) {
    const a = res.apex;
    if (a.t <= 1e-6 || a.t >= res.time - 1e-6) return; // 올라가기만/내려가기만 하면 생략
    const [px, py] = toPx(a.x, a.y);
    ctx.save();
    ctx.strokeStyle = 'rgba(96,165,250,.35)';
    ctx.setLineDash([2, 4]);
    line(px, py, px, view.oy);
    ctx.setLineDash([]);
    ctx.fillStyle = C.mainSolid;
    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#93c5fd';
    ctx.fillText(`최고점 ${a.y.toFixed(2)}m`, px, py - 10);
    ctx.restore();
  }

  function drawBall(cur) {
    const [px, py] = toPx(cur.x, cur.y);
    ctx.save();
    ctx.shadowColor = C.main;
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = C.main;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  function arrow(x1, y1, x2, y2, color, w) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 3) return;
    const ang = Math.atan2(y2 - y1, x2 - x1),
      head = Math.min(12, len * 0.4);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = w;
    line(
      x1,
      y1,
      x2 - Math.cos(ang) * head * 0.6,
      y2 - Math.sin(ang) * head * 0.6,
    );
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - head * Math.cos(ang - 0.4),
      y2 - head * Math.sin(ang - 0.4),
    );
    ctx.lineTo(
      x2 - head * Math.cos(ang + 0.4),
      y2 - head * Math.sin(ang + 0.4),
    );
    ctx.closePath();
    ctx.fill();
  }

  function drawVectors(res, cur) {
    const L = 90 / res.v0; // 초기 속도 = 90px
    const [px, py] = toPx(cur.x, cur.y);
    arrow(px, py, px + cur.vx * L, py, C.vx, 2);
    arrow(px, py, px, py - cur.vy * L, C.vy, 2);
    arrow(px, py, px + cur.vx * L, py - cur.vy * L, '#ffffff', 2.5);
  }

  function draw(res, cur, opts = {}) {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    if (!res || W === 0) return;

    fitView(res);
    drawGround(res);
    drawGrid();
    drawTarget(res);
    drawPerson(res);
    if (res.idealPath) drawPath(res.idealPath, C.ideal, [4, 6], 1.5, 0.7);
    if (res.altPath) drawPath(res.altPath, C.alt, [6, 6], 1.5, 0.8);
    drawPath(res.path, C.main, [10, 8], 2.5, 0.5); // 전체 예상 궤적 (점선)
    drawPath(res.path, C.mainSolid, [], 2.5, 1, cur); // 지나온 궤적 (실선)
    drawAngleArc(res);
    drawApex(res);
    drawBall(cur);
    if (opts.showVectors) drawVectors(res, cur);
  }

  return { init, resize, draw };
})();
