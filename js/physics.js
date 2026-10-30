/* =========================================================
 * physics.js : 물리 계산 엔진
 *  1) 이상적인 포물선 운동 해석해 (공기저항 X)
 *  2) 공기저항 포함 수치해석 (RK4)
 *  3) 목표 지점을 맞히는 발사 조건 탐색 (이분법, 황금분할)
 * ========================================================= */
const Physics = (() => {
  const DEG = Math.PI / 180;
  const RELEASE_RATIO = 0.9; // 발사 높이 = 키 × 0.9
  const FINAL_DT = 0.001; // 최종 궤적 시간 간격 (s)
  const T_MAX = 120; // 시뮬레이션 최대 시간 (s)

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- 1. 이상적인 포물선 운동 ---------- */

  // 각도 θ가 주어졌을 때 필요한 초기 속도
  function idealSpeedForAngle(R, dh, g, theta) {
    const c = Math.cos(theta);
    const denom = 2 * c * c * (R * Math.tan(theta) - dh);
    if (!(denom > 0)) return null; // 그 각도로는 도달 불가
    return Math.sqrt((g * R * R) / denom);
  }

  // 최소 초기 속도와 최적 각도
  function idealMinSpeed(R, dh, g) {
    const v2 = g * (dh + Math.sqrt(R * R + dh * dh));
    return { v0: Math.sqrt(v2), theta: Math.atan(v2 / (g * R)) };
  }

  // 속도 v0가 주어졌을 때 가능한 각도 (최대 2개)
  function idealAnglesForSpeed(R, dh, g, v0) {
    const v2 = v0 * v0;
    const disc = v2 * v2 - g * (g * R * R + 2 * dh * v2);
    if (disc < 0) return [];
    const s = Math.sqrt(disc);
    const low = Math.atan((v2 - s) / (g * R));
    const high = Math.atan((v2 + s) / (g * R));
    return s < 1e-9 ? [low] : [low, high];
  }

  /* ---------- 2. 수치해석 (RK4) ---------- */

  // 가속도: a = -g ŷ - k|v|v   (k = ρ·Cd·A / 2m)
  function accel(vx, vy, k, g) {
    const sp = Math.hypot(vx, vy);
    return [-k * sp * vx, -g - k * sp * vy];
  }

  function rk4Step(s, dt, k, g) {
    const [a1x, a1y] = accel(s.vx, s.vy, k, g);
    const v2x = s.vx + (a1x * dt) / 2,
      v2y = s.vy + (a1y * dt) / 2;
    const [a2x, a2y] = accel(v2x, v2y, k, g);
    const v3x = s.vx + (a2x * dt) / 2,
      v3y = s.vy + (a2y * dt) / 2;
    const [a3x, a3y] = accel(v3x, v3y, k, g);
    const v4x = s.vx + a3x * dt,
      v4y = s.vy + a3y * dt;
    const [a4x, a4y] = accel(v4x, v4y, k, g);
    return {
      t: s.t + dt,
      x: s.x + (dt / 6) * (s.vx + 2 * v2x + 2 * v3x + v4x),
      y: s.y + (dt / 6) * (s.vy + 2 * v2y + 2 * v3y + v4y),
      vx: s.vx + (dt / 6) * (a1x + 2 * a2x + 2 * a3x + a4x),
      vy: s.vy + (dt / 6) * (a1y + 2 * a2y + 2 * a3y + a4y),
    };
  }

  function lerpState(a, b, f) {
    return {
      t: a.t + (b.t - a.t) * f,
      x: a.x + (b.x - a.x) * f,
      y: a.y + (b.y - a.y) * f,
      vx: a.vx + (b.vx - a.vx) * f,
      vy: a.vy + (b.vy - a.vy) * f,
    };
  }

  // 궤적 시뮬레이션: x가 R에 도달하거나 바닥(y=0)에 닿으면 종료
  function simulate(v0, theta, p, dt = p.dt, record = false) {
    let s = {
      t: 0,
      x: 0,
      y: p.h0,
      vx: v0 * Math.cos(theta),
      vy: v0 * Math.sin(theta),
    };
    const path = record ? [s] : null;
    let apex = s;
    const tol = Math.max(0.005, p.R * 1e-4);

    while (s.t < T_MAX) {
      const n = rk4Step(s, dt, p.k, p.g);

      if (n.x >= p.R) {
        // 목표 지점의 x에 도달
        const end = lerpState(s, n, (p.R - s.x) / (n.x - s.x));
        if (record) path.push(end);
        if (end.y > apex.y) apex = end;
        return { reached: true, yAtR: end.y, end, apex, path };
      }
      if (n.y <= 0) {
        // 목표 전에 바닥에 떨어짐
        const end = lerpState(s, n, s.y / (s.y - n.y));
        if (record) path.push(end);
        const reached = p.R - end.x <= tol; // 아주 근소한 차이면 도달로 인정
        return { reached, yAtR: reached ? end.y : -Infinity, end, apex, path };
      }
      s = n;
      if (record) path.push(s);
      if (s.y > apex.y) apex = s;
    }
    return { reached: false, yAtR: -Infinity, end: s, apex, path };
  }

  /* ---------- 3. 발사 조건 탐색 (공기저항 O) ---------- */

  // 각도가 정해졌을 때 필요한 속도 (이분법)
  function speedForAngle(theta, p) {
    const f = (v) => simulate(v, theta, p).yAtR - p.ht;
    let lo = 0,
      hi = Math.max(1, p.vHint);
    while (f(hi) < 0) {
      lo = hi;
      hi *= 2;
      if (hi > 3000) return null; // 사실상 도달 불가
    }
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) < 0) lo = mid;
      else hi = mid;
    }
    return hi;
  }

  // 속도가 정해졌을 때 가능한 각도 (각도를 훑으며 부호 변화 탐색 → 이분법)
  function anglesForSpeed(v0, p) {
    const f = (th) => simulate(v0, th, p).yAtR - p.ht;
    const roots = [];
    const step = 0.5 * DEG;
    let a = -60 * DEG,
      fa = f(a);
    for (let b = a + step; b <= 89.5 * DEG + 1e-9; b += step) {
      const fb = f(b);
      if (fa >= 0 !== fb >= 0) roots.push(bisectAngle(f, a, b, fa));
      a = b;
      fa = fb;
    }
    if (roots.length > 2) return [roots[0], roots[roots.length - 1]];
    return roots;
  }

  function bisectAngle(f, a, b, fa) {
    for (let i = 0; i < 40; i++) {
      const m = (a + b) / 2,
        fm = f(m);
      if (fm >= 0 === fa >= 0) {
        a = m;
        fa = fm;
      } else b = m;
    }
    return fa >= 0 ? a : b; // 목표에 닿는 쪽 반환
  }

  // 최소 속도 + 최적 각도 (1° 간격 탐색 → 황금분할로 정밀화)
  function minSpeed(p) {
    let best = null;
    for (let deg = -45; deg <= 85; deg += 1) {
      const th = deg * DEG;
      const v = speedForAngle(th, p);
      if (v !== null && (!best || v < best.v0)) best = { v0: v, theta: th };
    }
    if (!best) return null;

    const fv = (th) => speedForAngle(th, p) ?? Infinity;
    const gr = (Math.sqrt(5) - 1) / 2;
    let a = best.theta - DEG,
      b = best.theta + DEG;
    let c = b - gr * (b - a),
      d = a + gr * (b - a);
    let fc = fv(c),
      fd = fv(d);
    for (let i = 0; i < 25; i++) {
      if (fc < fd) {
        b = d;
        d = c;
        fd = fc;
        c = b - gr * (b - a);
        fc = fv(c);
      } else {
        a = c;
        c = d;
        fc = fd;
        d = a + gr * (b - a);
        fd = fv(d);
      }
    }
    const theta = (a + b) / 2;
    const v0 = fv(theta);
    return Number.isFinite(v0) ? { v0, theta } : best;
  }

  /* ---------- 4. 모드별 풀이 ---------- */

  function otherAngle(roots, theta) {
    let best = null;
    for (const r of roots) {
      if (
        Math.abs(r - theta) > 0.5 * DEG &&
        (best === null || Math.abs(r - theta) > Math.abs(best - theta))
      )
        best = r;
    }
    return best;
  }

  function pickBySpeed(inp, roots) {
    if (!roots.length) return null;
    const useHigh = inp.orbit === 'high' && roots.length > 1;
    const theta = useHigh ? roots[roots.length - 1] : roots[0];
    const alt =
      roots.length > 1 ? (useHigh ? roots[0] : roots[roots.length - 1]) : null;
    return { v0: inp.speed, theta, alt };
  }

  function solveIdeal(inp, R, dh, g) {
    if (inp.mode === 'min') return { ...idealMinSpeed(R, dh, g), alt: null };
    if (inp.mode === 'angle') {
      const theta = inp.angle * DEG;
      const v0 = idealSpeedForAngle(R, dh, g, theta);
      if (v0 === null) return null;
      return {
        v0,
        theta,
        alt: otherAngle(idealAnglesForSpeed(R, dh, g, v0), theta),
      };
    }
    return pickBySpeed(inp, idealAnglesForSpeed(R, dh, g, inp.speed));
  }

  function solveDrag(inp, p) {
    if (inp.mode === 'min') {
      const s = minSpeed(p);
      return s ? { ...s, alt: null } : null;
    }
    if (inp.mode === 'angle') {
      const theta = inp.angle * DEG;
      const v0 = speedForAngle(theta, p);
      if (v0 === null) return null;
      return { v0, theta, alt: otherAngle(anglesForSpeed(v0, p), theta) };
    }
    return pickBySpeed(inp, anglesForSpeed(inp.speed, p));
  }

  function failMessage(inp, p, R, dh, g) {
    if (inp.mode === 'angle') {
      return `발사 각도 ${inp.angle}°로는 목표 지점에 도달할 수 없습니다. 목표가 발사 방향보다 위에 있어요. 각도를 높여보세요.`;
    }
    if (inp.mode === 'speed') {
      const need = inp.drag ? minSpeed(p) : idealMinSpeed(R, dh, g);
      return (
        `초기 속도 ${inp.speed} m/s로는 목표에 도달할 수 없습니다.` +
        (need
          ? ` 최소 ${need.v0.toFixed(2)} m/s 이상이 필요합니다.`
          : ' 속도를 높여보세요.')
      );
    }
    return '조건에 맞는 발사 조건을 찾지 못했습니다. 입력값을 확인해주세요.';
  }

  // 그래프용 데이터 샘플링
  function sampleSeries(path, m, g, n = 300) {
    const point = (s) => {
      const v2 = s.vx * s.vx + s.vy * s.vy;
      const Ek = 0.5 * m * v2,
        Ep = m * g * s.y;
      return {
        t: s.t,
        x: s.x,
        y: s.y,
        vx: s.vx,
        vy: s.vy,
        v: Math.sqrt(v2),
        Ek,
        Ep,
        E: Ek + Ep,
      };
    };
    const step = Math.max(1, Math.floor(path.length / n));
    const out = [];
    for (let i = 0; i < path.length; i += step) out.push(point(path[i]));
    if ((path.length - 1) % step !== 0) out.push(point(path[path.length - 1]));
    return out;
  }

  /* ---------- 5. 메인 계산 함수 ---------- */
  function solve(inp) {
    const g = inp.g;
    const R = inp.distance;
    const h0 = inp.groundH + inp.height * RELEASE_RATIO;
    const dh = inp.targetH - h0;
    const area = Math.PI * (inp.diameter / 2) ** 2;
    const k = inp.drag ? (0.5 * inp.rho * inp.cd * area) / inp.mass : 0;

    // 탐색 속도를 위해 비행 시간 규모에 맞춰 시간 간격 결정
    const hint = idealMinSpeed(R, dh, g);
    const tHint = R / (hint.v0 * Math.cos(hint.theta));
    const p = {
      R,
      ht: inp.targetH,
      h0,
      g,
      k,
      vHint: hint.v0,
      dt: clamp(tHint / 400, 0.001, 0.02),
    };
    const pIdeal = { ...p, k: 0 };

    const idealSol = solveIdeal(inp, R, dh, g);
    const sol = inp.drag ? solveDrag(inp, p) : idealSol;
    if (!sol) return { ok: false, message: failMessage(inp, p, R, dh, g) };

    const run = simulate(sol.v0, sol.theta, p, FINAL_DT, true);
    const idealRun =
      inp.drag && idealSol
        ? simulate(idealSol.v0, idealSol.theta, pIdeal, 0.002, true)
        : null;
    const altRun =
      sol.alt !== null ? simulate(sol.v0, sol.alt, p, 0.002, true) : null;

    const m = inp.mass;
    const v0 = sol.v0;
    const end = run.end;
    const vf = Math.hypot(end.vx, end.vy);
    const Ek0 = 0.5 * m * v0 * v0;
    const Ekf = 0.5 * m * vf * vf;
    const E0 = Ek0 + m * g * h0;
    const Ef = Ekf + m * g * end.y;
    const lossJ = Math.max(0, E0 - Ef);
    const force = Ek0 / inp.arm; // F = ½mv² / d

    return {
      ok: true,
      input: inp,
      R,
      h0,
      dh,
      g,
      k,
      area,
      v0,
      theta: sol.theta,
      alt: sol.alt,
      ideal: idealSol,
      reached: run.reached,
      time: end.t,
      apex: run.apex,
      end,
      vf,
      impactAngle: Math.atan2(-end.vy, end.vx) / DEG, // + : 내려오면서 도달
      Ek0,
      Ekf,
      E0,
      Ef,
      lossJ,
      lossPct: (lossJ / E0) * 100,
      force,
      liftKg: force / 9.81,
      impulse: m * v0,
      path: run.path,
      idealPath: idealRun ? idealRun.path : null,
      altPath: altRun ? altRun.path : null,
      series: sampleSeries(run.path, m, g),
      idealSeries: idealRun ? sampleSeries(idealRun.path, m, g) : null,
    };
  }

  // 시간 t에서의 상태 (보간)
  function stateAt(path, t) {
    if (t <= path[0].t) return path[0];
    const last = path[path.length - 1];
    if (t >= last.t) return last;
    let lo = 0,
      hi = path.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (path[mid].t <= t) lo = mid;
      else hi = mid;
    }
    const a = path[lo],
      b = path[hi];
    return lerpState(a, b, (t - a.t) / (b.t - a.t));
  }

  return { solve, stateAt, DEG, RELEASE_RATIO };
})();
