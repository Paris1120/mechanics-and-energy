/* =========================================================
 * main.js : 화면 전환, 반응형 레이아웃, 입력 처리, 애니메이션, 결과 출력
 * ========================================================= */
(() => {
  const $ = (id) => document.getElementById(id);
  const DEG = Physics.DEG;
  const f = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '-');

  // 물체 프리셋 (질량 kg, 지름 m, 항력계수)
  const OBJECTS = {
    baseball: { mass: 0.145, diameter: 0.074, cd: 0.35 },
    tennis: { mass: 0.058, diameter: 0.067, cd: 0.55 },
    basketball: { mass: 0.62, diameter: 0.24, cd: 0.47 },
    soccer: { mass: 0.43, diameter: 0.22, cd: 0.25 },
    shotput: { mass: 7.26, diameter: 0.12, cd: 0.47 },
    pingpong: { mass: 0.0027, diameter: 0.04, cd: 0.5 },
  };
  const OBJECT_NAMES = {
    baseball: '야구공',
    tennis: '테니스공',
    basketball: '농구공',
    soccer: '축구공',
    shotput: '투포환',
    pingpong: '탁구공',
    custom: '직접 입력',
  };
  const MODE_NAMES = {
    min: '최소 힘 모드',
    angle: '각도 고정 모드',
    speed: '속도 고정 모드',
  };
  const MODE_HINTS = {
    min: '가장 작은 초기 속도(= 가장 적은 힘)로 목표에 도달하는 각도를 자동으로 찾습니다.',
    angle: '입력한 각도로 던질 때 필요한 초기 속도를 계산합니다.',
    speed: '입력한 속도로 던질 때 목표에 맞는 각도(최대 2개)를 계산합니다.',
  };
  const TITLES = {
    calculator: '궤도 계산기',
    results: '계산 결과',
    graphs: '그래프',
    solution: '수식 풀이',
    theory: '이론 & 공식',
    team: '팀 소개',
  };
  const SPEEDS = [0.25, 0.5, 1, 2];
  const ICON_PLAY =
    '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>';
  const ICON_PAUSE =
    '<svg viewBox="0 0 24 24"><rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/></svg>';

  const EMPTY = {
    dock: '<div class="empty">아직 계산된 결과가 없습니다.</div>',
    eq: '<div class="empty">계산 후 애니메이션 시간에 맞춰 공식에 실제 값이 대입됩니다.</div>',
    page: (text) => `<div class="empty-state"><p>${text}</p>
      <button type="button" class="btn-ghost" data-goto="calculator">궤도 계산기로 이동</button></div>`,
  };

  // 휴대폰 판단: 화면 폭이 좁거나, 가로로 눕힌 휴대폰이면 컴팩트 모드
  const compactMQ = window.matchMedia(
    '(max-width: 767px), (max-height: 560px) and (orientation: landscape)',
  );

  let result = null;
  let t = 0;
  let playing = false;
  let loopId = 0;
  let speedIdx = 2;
  let showVectors = true;
  let activePane = 'results';
  let currentView = 'calculator';

  /* ---------- 초기화 ---------- */
  Renderer.init($('sim-canvas'));
  const dockChart = Charts.create($('chart-dock'), 'height');
  ['height', 'velocity', 'energy', 'trajectory'].forEach((m) => {
    Charts.create($('chart-' + m), m);
    $('note-' + m).textContent = Charts.note(m);
  });

  applyObjectPreset();
  updateFormVisibility();
  clearResult();
  applyLayout();

  if (compactMQ.addEventListener)
    compactMQ.addEventListener('change', applyLayout);
  else compactMQ.addListener(applyLayout);

  // 캔버스 크기가 바뀔 때마다 (창 크기 변경, 화면 회전, 메뉴 전환) 다시 그림
  new ResizeObserver(() => {
    Renderer.resize();
    redraw();
  }).observe($('canvas-wrap'));

  /* ---------- 반응형 레이아웃 ---------- */
  function applyLayout() {
    const compact = compactMQ.matches;
    document.body.classList.toggle('compact', compact);

    const form = $('input-form');
    const slot = compact ? $('pane-inputs') : $('side-slot');
    if (form.parentElement !== slot) slot.appendChild(form);

    if (compact && !result) setPane('inputs');
    else if (!compact && activePane === 'inputs') setPane('results');
  }

  /* ---------- 하단 탭 패널 ---------- */
  function setPane(name) {
    activePane = name;
    document
      .querySelectorAll('#dock-tabs .seg-btn')
      .forEach((b) => b.classList.toggle('active', b.dataset.pane === name));
    document
      .querySelectorAll('.pane')
      .forEach((p) => p.classList.toggle('active', p.id === 'pane-' + name));
    if (name === 'eq') redraw();
  }
  document
    .querySelectorAll('#dock-tabs .seg-btn')
    .forEach((b) => b.addEventListener('click', () => setPane(b.dataset.pane)));

  document.querySelectorAll('#chart-tabs .seg-btn').forEach((b) => {
    b.addEventListener('click', () => {
      document
        .querySelectorAll('#chart-tabs .seg-btn')
        .forEach((x) => x.classList.toggle('active', x === b));
      dockChart.setMode(b.dataset.chart);
    });
  });

  /* ---------- 메뉴 (페이지 전환) ---------- */
  function setView(v) {
    currentView = v;
    document
      .querySelectorAll('.nav-item')
      .forEach((b) => b.classList.toggle('active', b.dataset.view === v));
    document
      .querySelectorAll('.view')
      .forEach((s) => s.classList.toggle('active', s.id === 'view-' + v));
    $('page-title').textContent = TITLES[v];
    if (v === 'calculator') redraw();
  }
  document
    .querySelectorAll('.nav-item')
    .forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-goto]');
    if (g) setView(g.dataset.goto);
  });

  /* ---------- 입력 폼 ---------- */
  $('in-object').addEventListener('change', applyObjectPreset);
  ['in-mass', 'in-diameter', 'in-cd'].forEach((id) =>
    $(id).addEventListener('input', () => {
      $('in-object').value = 'custom';
    }),
  );
  ['in-mode', 'in-gravity-preset', 'in-drag'].forEach((id) =>
    $(id).addEventListener('change', updateFormVisibility),
  );

  function applyObjectPreset() {
    const o = OBJECTS[$('in-object').value];
    if (!o) return;
    $('in-mass').value = o.mass;
    $('in-diameter').value = o.diameter;
    $('in-cd').value = o.cd;
  }

  function updateFormVisibility() {
    const mode = $('in-mode').value;
    const drag = $('in-drag').checked;
    $('field-angle').classList.toggle('hidden', mode !== 'angle');
    $('field-speed').classList.toggle('hidden', mode !== 'speed');
    $('field-orbit').classList.toggle('hidden', mode !== 'speed');
    $('field-gravity').classList.toggle(
      'hidden',
      $('in-gravity-preset').value !== 'custom',
    );
    $('field-rho').classList.toggle('hidden', !drag);
    $('drag-badge').textContent = drag ? '공기저항 ON' : '공기저항 OFF';
    $('drag-badge').classList.toggle('on', drag);
    $('mode-hint').textContent = MODE_HINTS[mode];
  }

  function readInput() {
    const num = (id) => parseFloat($(id).value);
    const gp = $('in-gravity-preset').value;
    const inp = {
      distance: num('in-distance'),
      targetH: num('in-target-h'),
      groundH: num('in-ground-h'),
      g: gp === 'custom' ? num('in-gravity') : parseFloat(gp),
      height: num('in-height'),
      arm: num('in-arm'),
      object: $('in-object').value,
      mass: num('in-mass'),
      diameter: num('in-diameter'),
      cd: num('in-cd'),
      mode: $('in-mode').value,
      angle: num('in-angle'),
      speed: num('in-speed'),
      orbit: $('in-orbit').value,
      drag: $('in-drag').checked,
      rho: num('in-rho'),
    };

    const errors = [];
    const need = (ok, msg) => {
      if (!ok) errors.push(msg);
    };
    need(inp.distance > 0, '목표 수평 거리는 0보다 커야 합니다.');
    need(inp.targetH >= 0, '목표 지점 높이는 0 이상이어야 합니다.');
    need(inp.groundH >= 0, '발사 지면 높이는 0 이상이어야 합니다.');
    need(inp.g > 0, '중력 가속도는 0보다 커야 합니다.');
    need(
      inp.height >= 0.5 && inp.height <= 2.5,
      '키는 0.5 ~ 2.5 m 사이로 입력해주세요.',
    );
    need(inp.arm > 0, '팔 가속 거리는 0보다 커야 합니다.');
    need(inp.mass > 0, '질량은 0보다 커야 합니다.');
    if (inp.drag) {
      need(inp.diameter > 0, '지름은 0보다 커야 합니다.');
      need(inp.cd > 0, '항력계수는 0보다 커야 합니다.');
      need(inp.rho > 0, '공기 밀도는 0보다 커야 합니다.');
    }
    if (inp.mode === 'angle')
      need(
        inp.angle > -89 && inp.angle < 89,
        '발사 각도는 -89° ~ 89° 사이로 입력해주세요.',
      );
    if (inp.mode === 'speed')
      need(inp.speed > 0, '초기 속도는 0보다 커야 합니다.');
    return { inp, errors };
  }

  /* ---------- 계산하기 ---------- */
  $('input-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const { inp, errors } = readInput();
    if (errors.length) {
      showMessage('error', errors.join('<br>'));
      if (activePane === 'inputs') setPane('results');
      return;
    }

    const btn = $('btn-calc');
    btn.disabled = true;
    btn.textContent = '계산 중...';

    setTimeout(() => {
      try {
        const res = Physics.solve(inp);
        if (res.ok) setResult(res);
        else {
          clearResult();
          showMessage('error', res.message);
        }
      } catch (err) {
        console.error(err);
        showMessage('error', '계산 중 오류가 발생했습니다: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = '계산하기';
        if (activePane === 'inputs') setPane('results'); // 휴대폰: 결과 탭으로 자동 이동
      }
    }, 30);
  });

  function setResult(res) {
    result = res;
    t = 0;
    document.body.classList.add('has-result');
    $('placeholder').classList.add('hidden');
    $('lg-ideal').classList.toggle('hidden', !res.idealPath);
    $('lg-alt').classList.toggle('hidden', !res.altPath);

    const cards = buildCards(res);
    $('result-grid').innerHTML = cards;
    $('result-grid-full').innerHTML = cards;
    renderMessages(res);
    renderSummary(res);
    renderSolution(res);

    $('status').textContent = '계산 완료';
    $('status').classList.add('done');
    Charts.setData(res);
    play();
  }

  function clearResult() {
    result = null;
    pause();
    t = 0;
    document.body.classList.remove('has-result');
    $('placeholder').classList.remove('hidden');
    $('result-grid').innerHTML = EMPTY.dock;
    $('result-grid-full').innerHTML =
      EMPTY.page('아직 계산된 결과가 없습니다.');
    $('solution-view').innerHTML = EMPTY.page(
      '계산을 하면 단계별 풀이가 표시됩니다.',
    );
    $('eq-view').innerHTML = EMPTY.eq;
    $('input-summary').innerHTML = '';
    $('status').textContent = '계산 전';
    $('status').classList.remove('done');
    Charts.setData(null);
    redraw();
  }

  function showMessage(type, html) {
    ['message', 'message-full'].forEach((id) => {
      const el = $(id);
      el.className = 'message ' + type;
      el.innerHTML = html;
    });
  }

  /* ---------- 결과 카드 ---------- */
  function card(label, value, unit, sub, highlight = false) {
    return `<div class="card result${highlight ? ' highlight' : ''}">
      <span class="r-label">${label}</span>
      <span class="r-value">${value}<small>${unit}</small></span>
      <span class="r-sub">${sub}</span>
    </div>`;
  }

  function buildCards(r) {
    const inp = r.input;
    const cards = [];

    cards.push(
      card(
        '필요한 초기 속도',
        f(r.v0),
        'm/s',
        `= ${f(r.v0 * 3.6, 1)} km/h`,
        true,
      ),
    );

    let angleSub;
    if (inp.mode === 'min') angleSub = '가장 적은 힘이 드는 최적 각도';
    else if (r.alt !== null)
      angleSub = `같은 속도로 가능한 다른 각도: ${f(r.alt / DEG, 1)}°`;
    else angleSub = '같은 속도로 가능한 각도는 이 각도 하나';
    cards.push(card('발사 각도', f(r.theta / DEG, 1), '°', angleSub, true));

    cards.push(
      card('예상 도달 시간', f(r.time), 's', `수평 ${f(r.R, 1)} m 이동`, true),
    );
    cards.push(
      card(
        '최고점 높이',
        f(r.apex.y),
        'm',
        `발사 지점에서 ${f(r.apex.x, 1)} m 앞`,
      ),
    );
    cards.push(
      card(
        '목표 도달 속도',
        f(r.vf),
        'm/s',
        r.impactAngle >= 0
          ? `${f(r.impactAngle, 1)}° 각도로 내려오며 도달`
          : `${f(-r.impactAngle, 1)}° 각도로 올라가며 도달`,
      ),
    );
    cards.push(
      card(
        '필요한 평균 힘',
        f(r.force, 1),
        'N',
        `약 ${f(r.liftKg, 1)} kg 물체를 드는 힘`,
      ),
    );
    cards.push(
      card(
        '발사 운동 에너지',
        f(r.Ek0),
        'J',
        `충격량 mv₀ = ${f(r.impulse, 3)} N·s`,
      ),
    );

    if (inp.drag) {
      cards.push(
        card(
          '공기저항 에너지 손실',
          f(r.lossJ),
          'J',
          `처음 역학적 에너지의 ${f(r.lossPct, 1)}%`,
        ),
      );
      if (r.ideal && inp.mode === 'speed') {
        cards.push(
          card(
            '공기저항 없을 때 각도',
            f(r.ideal.theta / DEG, 1),
            '°',
            '같은 속도, 공기저항 없는 경우',
          ),
        );
      } else if (r.ideal) {
        const diff = (r.v0 / r.ideal.v0 - 1) * 100;
        cards.push(
          card(
            '공기저항 없을 때 필요 속도',
            f(r.ideal.v0),
            'm/s',
            `공기저항 때문에 ${f(Math.abs(diff), 1)}% ${diff >= 0 ? '더' : '덜'} 필요`,
          ),
        );
      }
    } else {
      cards.push(
        card(
          '역학적 에너지',
          f(r.E0),
          'J',
          '공기저항이 없으므로 처음부터 끝까지 보존',
        ),
      );
    }
    return cards.join('');
  }

  function renderMessages(r) {
    const msgs = [];
    if (!r.reached)
      msgs.push(
        '<b>주의</b> 수치 오차로 목표 직전에 착지했습니다. 입력값을 조금 바꿔보세요.',
      );
    if (r.input.drag) {
      msgs.push(
        `<b>공기저항 ON</b> k = ρC<sub>d</sub>A / 2m = ${r.k.toExponential(2)} m⁻^1^. ` +
          '질량이 클수록 k가 작아져 이상적인 포물선에 가까워집니다.',
      );
    } else {
      msgs.push(
        '<b>참고</b> 공기저항이 없으면 질량은 궤적에 영향을 주지 않습니다. ' +
          '질량은 필요한 힘, 에너지, 충격량에만 영향을 줍니다.',
      );
    }
    showMessage(r.reached ? 'info' : 'error', msgs.join('<br>'));
  }

  /* ---------- 입력 조건 요약 (계산 결과 페이지) ---------- */
  function renderSummary(r) {
    const inp = r.input;
    let modeText = MODE_NAMES[inp.mode];
    if (inp.mode === 'angle') modeText += ` (${inp.angle}°)`;
    if (inp.mode === 'speed') modeText += ` (${inp.speed} m/s)`;

    const rows = [
      ['목표 수평 거리', `${f(inp.distance)} m`],
      ['목표 지점 높이', `${f(inp.targetH)} m`],
      ['발사 지면 높이', `${f(inp.groundH)} m`],
      ['중력 가속도', `${f(inp.g)} m/s²`],
      ['키', `${f(inp.height)} m`],
      ['발사 높이 h₀', `${f(r.h0, 3)} m`],
      ['팔 가속 거리', `${f(inp.arm)} m`],
      ['물체', OBJECT_NAMES[inp.object]],
      ['질량', `${inp.mass} kg`],
      ['지름', `${inp.diameter} m`],
      ['항력계수', `${inp.cd}`],
      ['계산 모드', modeText],
      ['공기저항', inp.drag ? `ON (ρ = ${inp.rho})` : 'OFF'],
    ];
    $('input-summary').innerHTML = rows
      .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
      .join('');
  }

  /* ---------- 공식 박스 ---------- */
  function box(label, formula, sub, res, extra = '') {
    return `<div class="eq-box">
      <div class="eq-label">${label}</div>
      <div class="eq-formula">${formula}</div>
      ${sub ? `<div class="eq-sub">${sub}</div>` : ''}
      <div class="eq-result">${res}</div>${extra}
    </div>`;
  }

  function modeFormulaBox(r, prefix = '') {
    const inp = r.input,
      I = r.ideal,
      g = r.g,
      R = r.R,
      dh = r.dh;
    const note = inp.drag
      ? '<div class="eq-sub">공기저항이 없을 때의 이론값입니다.</div>'
      : '';

    if (inp.mode === 'min') {
      return box(
        `${prefix}최소 초기 속도`,
        'v₀^2^ = g·(Δh + √(R² + Δh²))<br>tanθ = v₀^2^ / (g·R)',
        `v₀^2^ = ${f(g)}·(${f(dh, 3)} + √(${f(R)}^2^ + ${f(dh, 3)}^2^))`,
        `v₀ = ${f(I.v0)} m/s,  θ = ${f(I.theta / DEG, 1)}°`,
        note,
      );
    }
    if (inp.mode === 'angle') {
      return box(
        `${prefix}각도 → 필요한 초기 속도`,
        'v₀ = √( g·R² / (2cos²θ·(R·tanθ − Δh)) )',
        `v₀ = √( ${f(g)}·${f(R)}^2^ / (2cos²(${f(inp.angle, 1)}°)·(${f(R)}·tan(${f(inp.angle, 1)}°) − ${f(dh, 3)})) )`,
        I ? `v₀ = ${f(I.v0)} m/s` : '이론상 도달 불가',
        note,
      );
    }
    return box(
      `${prefix}속도 → 가능한 발사 각도`,
      'tanθ = (v₀^2^ ± √(v₀^3^ − g(gR² + 2Δh·v₀^2^))) / (g·R)',
      `v₀ = ${f(inp.speed)} m/s,  g = ${f(g)} m/s²,  R = ${f(R)} m,  Δh = ${f(dh, 3)} m`,
      I
        ? `θ = ${f(I.theta / DEG, 1)}°` +
            (I.alt !== null ? `  또는  ${f(I.alt / DEG, 1)}°` : '')
        : '이론상 도달 불가',
      note,
    );
  }

  /* ---------- 수식 탭 (실시간, 궤도 계산기) ---------- */
  function renderEquations(r, cur) {
    const g = r.g,
      v0 = r.v0,
      th = r.theta,
      thD = th / DEG,
      tt = cur.t,
      m = r.input.mass,
      drag = r.input.drag;
    const xI = v0 * Math.cos(th) * tt;
    const yI = r.h0 + v0 * Math.sin(th) * tt - 0.5 * g * tt * tt;
    const vyI = v0 * Math.sin(th) - g * tt;
    const sim = (txt) =>
      drag ? `<div class="eq-sub">시뮬레이션(공기저항 포함): ${txt}</div>` : '';
    const Ek = 0.5 * m * (cur.vx * cur.vx + cur.vy * cur.vy);
    const Ep = m * g * cur.y;

    let html = modeFormulaBox(r);
    html += box(
      '수평 위치',
      'x(t) = v₀·cosθ·t',
      `x(${f(tt)}) = ${f(v0)}·cos(${f(thD, 1)}°)·${f(tt)}`,
      `= ${f(xI)} m`,
      sim(`${f(cur.x)} m`),
    );
    html += box(
      '수직 위치',
      'y(t) = h₀ + v₀·sinθ·t − ½·g·t²',
      `y(${f(tt)}) = ${f(r.h0)} + ${f(v0)}·sin(${f(thD, 1)}°)·${f(tt)} − ${f(g / 2, 3)}·${f(tt)}^2^`,
      `= ${f(yI)} m`,
      sim(`${f(cur.y)} m`),
    );
    html += box(
      '수직 속도',
      'vy(t) = v₀·sinθ − g·t',
      `vy(${f(tt)}) = ${f(v0)}·sin(${f(thD, 1)}°) − ${f(g)}·${f(tt)}`,
      `= ${f(vyI)} m/s`,
      sim(`${f(cur.vy)} m/s`),
    );
    html += box(
      '현재 에너지',
      'Eₖ = ½·m·v²,  Eₚ = m·g·h',
      `Eₖ = ${f(Ek)} J,  Eₚ = ${f(Ep)} J`,
      `E = Eₖ + Eₚ = ${f(Ek + Ep)} J`,
    );
    if (drag) {
      html += box(
        '공기저항 (수치해석)',
        'F = ½·ρ·Cd·A·v²<br>a = −g·ŷ − k·|v|·v',
        `ρ = ${f(r.input.rho, 3)},  Cd = ${f(r.input.cd)},  A = ${r.area.toExponential(2)} m²`,
        'RK4 수치해석, Δt = 0.001 s',
      );
    }
    $('eq-view').innerHTML = html;
  }

  /* ---------- 수식 풀이 페이지 (단계별) ---------- */
  function renderSolution(r) {
    const inp = r.input,
      g = r.g,
      v0 = r.v0,
      th = r.theta,
      thD = th / DEG,
      m = inp.mass,
      drag = inp.drag;
    const vx0 = v0 * Math.cos(th),
      vy0 = v0 * Math.sin(th);
    const sim = (txt) =>
      drag
        ? `<div class="eq-sub">공기저항 포함 시뮬레이션 값: ${txt}</div>`
        : '';
    const tI = r.R / vx0;
    const HI = vy0 > 0 ? r.h0 + (vy0 * vy0) / (2 * g) : r.h0;
    const vf2 = v0 * v0 - 2 * g * r.dh;

    const steps = [];
    if (drag) {
      steps.push(`<div class="eq-box note">
        <div class="eq-label">안내</div>
        <div class="eq-sub">공기저항이 켜져 있습니다. 아래 공식값은 공기저항이 없을 때의 이론값이고,
        실제 결과는 RK4 수치해석으로 계산한 시뮬레이션 값입니다. 두 값의 차이가 공기저항의 효과입니다.</div>
      </div>`);
    }
    steps.push(
      box(
        '1. 발사 높이',
        'h₀ = 지면 높이 + 키 × 0.9',
        `h₀ = ${f(inp.groundH)} + ${f(inp.height)} × 0.9`,
        `h₀ = ${f(r.h0, 3)} m`,
      ),
    );
    steps.push(
      box(
        '2. 높이 차',
        'Δh = h목표 − h₀',
        `Δh = ${f(inp.targetH)} − ${f(r.h0, 3)}`,
        `Δh = ${f(r.dh, 3)} m`,
      ),
    );
    steps.push(modeFormulaBox(r, '3. '));
    steps.push(
      box(
        '4. 초기 속도 분해',
        'v₀x = v₀·cosθ,  v₀y = v₀·sinθ',
        `v₀x = ${f(v0)}·cos(${f(thD, 1)}°),  v₀y = ${f(v0)}·sin(${f(thD, 1)}°)`,
        `v₀x = ${f(vx0)} m/s,  v₀y = ${f(vy0)} m/s`,
      ),
    );
    steps.push(
      box(
        '5. 도달 시간',
        't = R / v₀x',
        `t = ${f(r.R)} / ${f(vx0)}`,
        `t = ${f(tI)} s`,
        sim(`${f(r.time)} s`),
      ),
    );
    steps.push(
      box(
        '6. 최고점 높이',
        'H = h₀ + v₀y² / (2g)',
        `H = ${f(r.h0, 3)} + ${f(vy0)}^2^ / (2·${f(g)})`,
        `H = ${f(HI)} m`,
        sim(`${f(r.apex.y)} m`),
      ),
    );
    steps.push(
      box(
        '7. 목표 도달 속도',
        'v = √(v₀^2^ − 2g·Δh)',
        `v = √(${f(v0)}^2^ − 2·${f(g)}·${f(r.dh, 3)})`,
        vf2 >= 0 ? `v = ${f(Math.sqrt(vf2))} m/s` : '-',
        sim(`${f(r.vf)} m/s`),
      ),
    );
    steps.push(
      box(
        '8. 발사 운동 에너지',
        'Eₖ = ½·m·v₀^2^',
        `Eₖ = 0.5·${m}·${f(v0)}^2^`,
        `Eₖ = ${f(r.Ek0)} J`,
      ),
    );
    steps.push(
      box(
        '9. 처음 역학적 에너지',
        'E = Eₖ + m·g·h₀',
        `E = ${f(r.Ek0)} + ${m}·${f(g)}·${f(r.h0, 3)}`,
        `E = ${f(r.E0)} J`,
        drag
          ? `<div class="eq-sub">공기저항으로 손실된 에너지: ${f(r.lossJ)} J (${f(r.lossPct, 1)}%)</div>`
          : '<div class="eq-sub">공기저항이 없으므로 이 값이 끝까지 보존됩니다.</div>',
      ),
    );
    steps.push(
      box(
        '10. 필요한 평균 힘',
        'F·d = ½·m·v₀^2^  →  F = Eₖ / d',
        `F = ${f(r.Ek0)} / ${f(inp.arm)}`,
        `F = ${f(r.force, 1)} N`,
        `<div class="eq-sub">약 ${f(r.liftKg, 1)} kg 물체를 드는 힘</div>`,
      ),
    );
    steps.push(
      box(
        '11. 충격량',
        'I = m·v₀',
        `I = ${m}·${f(v0)}`,
        `I = ${f(r.impulse, 3)} N·s`,
      ),
    );

    $('solution-view').innerHTML = steps.join('');
  }

  /* ---------- 애니메이션 ---------- */
  function play() {
    if (!result) return;
    if (t >= result.time) t = 0;
    playing = true;
    updatePlayBtn();
    const id = ++loopId;
    let last = null;

    const tick = (ts) => {
      if (!playing || id !== loopId) return;
      if (last !== null) t += ((ts - last) / 1000) * SPEEDS[speedIdx];
      last = ts;
      if (t >= result.time) {
        t = result.time;
        playing = false;
        updatePlayBtn();
      }
      redraw();
      if (playing) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function pause() {
    playing = false;
    updatePlayBtn();
  }

  function updatePlayBtn() {
    $('btn-play').innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    $('btn-play').setAttribute('aria-label', playing ? '일시정지' : '재생');
  }

  function redraw() {
    if (!result) {
      Renderer.draw(null);
      ['live-x', 'live-y', 'live-v'].forEach((id) => {
        $(id).textContent = '0.00';
      });
      $('timeline').value = 0;
      $('time-label').textContent = '0.00s';
      return;
    }
    const cur = Physics.stateAt(result.path, t);
    Renderer.draw(result, cur, { showVectors });
    $('timeline').value = Math.round((t / result.time) * 1000);
    $('time-label').textContent = t.toFixed(2) + 's';
    $('live-x').textContent = cur.x.toFixed(2);
    $('live-y').textContent = cur.y.toFixed(2);
    $('live-v').textContent = Math.hypot(cur.vx, cur.vy).toFixed(2);
    if (activePane === 'eq' && currentView === 'calculator')
      renderEquations(result, cur);
    Charts.setCursor(cur);
  }

  /* ---------- 플레이어 버튼 ---------- */
  $('btn-play').addEventListener('click', () => {
    if (result) playing ? pause() : play();
  });
  $('btn-reset').addEventListener('click', () => {
    if (!result) return;
    pause();
    t = 0;
    redraw();
  });
  $('btn-vectors').addEventListener('click', () => {
    showVectors = !showVectors;
    $('btn-vectors').textContent = showVectors ? '벡터 ON' : '벡터 OFF';
    $('lg-vec').classList.toggle('hidden', !showVectors);
    redraw();
  });
  $('btn-speed').addEventListener('click', () => {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    $('btn-speed').textContent = SPEEDS[speedIdx] + 'x';
  });
  $('timeline').addEventListener('input', (e) => {
    if (!result) return;
    pause();
    t = (e.target.value / 1000) * result.time;
    redraw();
  });
})();
