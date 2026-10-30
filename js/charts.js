/* =========================================================
 * charts.js : 그래프 (Chart.js), 여러 개의 그래프를 동시에 관리
 * ========================================================= */
const Charts = (() => {
  const NOTES = {
    height:
      '물체의 높이 y가 시간에 따라 어떻게 변하는지 보여줍니다. 공기저항이 없으면 정확한 2차 함수(포물선) 모양입니다.',
    velocity:
      '공기저항이 없으면 수평 속도 vx는 일정하고, 수직 속도 vy는 기울기 −g인 직선으로 감소합니다. 공기저항이 있으면 vx도 점점 줄어듭니다.',
    energy:
      '공기저항이 없으면 운동 에너지와 위치 에너지의 합(역학적 에너지)이 일정하게 유지됩니다. 공기저항이 있으면 줄어든 만큼 열 등으로 손실됩니다.',
    trajectory:
      '실제 공간에서 물체가 지나간 경로(x-y)입니다. 회색 점선은 공기저항이 없을 때의 경로입니다.',
  };

  const instances = [];
  let data = null;
  let cursor = null;
  let ready = false;

  // 현재 시간(또는 위치)을 세로선으로 표시하는 플러그인
  const cursorPlugin = {
    id: 'timeCursor',
    afterDatasetsDraw(c) {
      const v = c.simCursorX;
      if (v === null || v === undefined || !c.scales.x) return;
      const x = c.scales.x.getPixelForValue(v);
      const { top, bottom, left, right } = c.chartArea;
      if (x < left || x > right) return;
      const g = c.ctx;
      g.save();
      g.strokeStyle = 'rgba(255,255,255,.35)';
      g.setLineDash([4, 4]);
      g.beginPath();
      g.moveTo(x, top);
      g.lineTo(x, bottom);
      g.stroke();
      g.restore();
    },
  };

  function setup() {
    if (ready) return true;
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js를 불러오지 못했습니다. 인터넷 연결을 확인하세요.');
      return false;
    }
    Chart.defaults.color = '#8b97a8';
    Chart.defaults.borderColor = '#1a2333';
    Chart.defaults.font.family = 'Pretendard, "Malgun Gothic", sans-serif';
    Chart.defaults.font.size = 11;
    ready = true;
    return true;
  }

  function create(canvas, mode) {
    if (!canvas || !setup()) return { setMode: (m) => NOTES[m] };

    const chart = new Chart(canvas, {
      type: 'line',
      data: { datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        parsing: false,
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        elements: {
          point: { radius: 0 },
          line: { borderWidth: 2, tension: 0 },
        },
        scales: {
          x: { type: 'linear', title: { display: true, text: '' } },
          y: { title: { display: true, text: '' } },
        },
        plugins: {
          legend: { labels: { boxWidth: 10, boxHeight: 2 } },
          tooltip: {
            callbacks: {
              label: (c) => `${c.dataset.label}: ${c.parsed.y.toFixed(2)}`,
            },
          },
        },
      },
      plugins: [cursorPlugin],
    });
    chart.simCursorX = null;

    const inst = { chart, mode };
    instances.push(inst);
    render(inst);

    return {
      setMode(m) {
        inst.mode = m;
        render(inst);
        applyCursor(inst);
        return NOTES[m];
      },
    };
  }

  const ds = (label, points, color, dash = []) => ({
    label,
    data: points,
    borderColor: color,
    backgroundColor: color,
    borderDash: dash,
  });
  const pick = (arr, xk, yk) => arr.map((p) => ({ x: p[xk], y: p[yk] }));

  function render(inst) {
    const { chart, mode } = inst;
    const sets = [];
    let xTitle = '시간 t (s)',
      yTitle = '';

    if (data) {
      const s = data.series,
        id = data.idealSeries;
      if (mode === 'height') {
        yTitle = '높이 y (m)';
        sets.push(ds('실제 y(t)', pick(s, 't', 'y'), '#3b82f6'));
        if (id)
          sets.push(
            ds('공기저항 없을 때', pick(id, 't', 'y'), '#94a3b8', [5, 5]),
          );
      } else if (mode === 'velocity') {
        yTitle = '속도 (m/s)';
        sets.push(ds('수평 속도 vx', pick(s, 't', 'vx'), '#34d399'));
        sets.push(ds('수직 속도 vy', pick(s, 't', 'vy'), '#fb923c'));
        sets.push(ds('속력 |v|', pick(s, 't', 'v'), '#e5e7eb'));
      } else if (mode === 'energy') {
        yTitle = '에너지 (J)';
        sets.push(ds('운동 에너지 Ek', pick(s, 't', 'Ek'), '#3b82f6'));
        sets.push(ds('위치 에너지 Ep', pick(s, 't', 'Ep'), '#34d399'));
        sets.push(ds('역학적 에너지 E', pick(s, 't', 'E'), '#fbbf24', [6, 4]));
      } else {
        xTitle = '수평 거리 x (m)';
        yTitle = '높이 y (m)';
        sets.push(ds('실제 궤적', pick(s, 'x', 'y'), '#3b82f6'));
        if (id)
          sets.push(
            ds('공기저항 없을 때', pick(id, 'x', 'y'), '#94a3b8', [5, 5]),
          );
      }
    }

    chart.data.datasets = sets;
    chart.options.scales.x.title.text = xTitle;
    chart.options.scales.y.title.text = yTitle;
    chart.options.scales.y.beginAtZero =
      mode === 'height' || mode === 'trajectory';
    chart.update();
  }

  function applyCursor(inst) {
    inst.chart.simCursorX = cursor
      ? inst.mode === 'trajectory'
        ? cursor.x
        : cursor.t
      : null;
    if (inst.chart.canvas.offsetParent !== null) inst.chart.draw(); // 보이는 그래프만 다시 그림
  }

  function setData(res) {
    data = res;
    cursor = null;
    instances.forEach((i) => {
      render(i);
      applyCursor(i);
    });
  }

  function setCursor(state) {
    cursor = state;
    instances.forEach(applyCursor);
  }

  const note = (m) => NOTES[m];

  return { create, setData, setCursor, note };
})();
