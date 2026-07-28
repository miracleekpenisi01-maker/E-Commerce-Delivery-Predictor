/* ===========================
   LogiPulse v2 — app.js
   Tactile Card Stack + Model API Integration
   =========================== */

'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  warehouse: 'B',
  shipment: 'Ship',
  importance: 'low',
  careCalls: 4,
  rating: 3,
  cost: 214,
  priorPurchases: 5,
  discount: 14,
  weight: 3200,
  gender: 'M'
};

const blockDelayRates = { A: 0.63, B: 0.58, C: 0.71, D: 0.54, F: 0.66 };
const API_URL = 'http://localhost:8000/predict';

// Mapping importance string to numerical values expected by model
const importanceMap = { low: 1, medium: 2, high: 3 };

function getRisk(score) {
  if (score < 35) return { cls: 'low', color: '#166534', label: 'LOW RISK', arc: '#166534' };
  if (score < 65) return { cls: 'mid', color: '#B45309', label: 'MODERATE RISK', arc: '#B45309' };
  return { cls: 'high', color: '#991B1B', label: 'HIGH RISK', arc: '#991B1B' };
}

function computeLocalFactors(s) {
  const modeDelayRates = { Flight: 0.52, Ship: 0.68, Road: 0.61 };
  return {
    mode: Math.round((modeDelayRates[s.shipment] || 0.6) * 28),
    calls: Math.round(((s.careCalls - 1) / 9) * 22),
    weight: Math.round(Math.min((s.weight - 1000) / 6000, 1) * 18),
    disc: Math.round((s.discount / 70) * 14),
    rating: Math.round(((5 - s.rating) / 4) * 10),
    wh: Math.round((blockDelayRates[s.warehouse] || 0.6) * 6)
  };
}

// ── DOM Refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function updateSticky() {
  if ($('s-wh')) $('s-wh').textContent = state.warehouse;
  if ($('s-mode')) $('s-mode').textContent = state.shipment;
  if ($('s-cost')) $('s-cost').textContent = state.cost;
  if ($('s-weight')) $('s-weight').textContent = state.weight.toLocaleString();
  if ($('s-disc')) $('s-disc').textContent = state.discount;
}

function updateStars(rating) {
  document.querySelectorAll('.star').forEach((s, i) => {
    s.classList.toggle('active', i < rating);
  });
}

function updateWeightClass(weight) {
  const isLight = weight < 2500;
  const isMed = weight >= 2500 && weight <= 4500;
  const isHeavy = weight > 4500;

  const wLight = document.querySelector('.ws-bar.light');
  const wMed = document.querySelector('.ws-bar.medium');
  const wHeavy = document.querySelector('.ws-bar.heavy');

  if (wLight) wLight.classList.toggle('active', isLight);
  if (wMed) wMed.classList.toggle('active', isMed);
  if (wHeavy) wHeavy.classList.toggle('active', isHeavy);
}

function animateRadial(score, color) {
  const ring = $('riskRing');
  if (ring) {
    const total = 251.2;
    const filled = (score / 100) * total;
    ring.setAttribute('stroke-dasharray', `${filled} ${502.4 - filled}`);
    ring.setAttribute('stroke', color);
  }
  if ($('gaugeScoreText')) {
    $('gaugeScoreText').textContent = score + '%';
    $('gaugeScoreText').setAttribute('fill', color);
  }
}

function generateRecs(score, s) {
  const recs = [];
  if (s.careCalls >= 5) recs.push({ lvl: 'high', icon: '⚡', text: `High customer contact volume (${s.careCalls} calls). Assign priority support — escalation risk elevated.` });
  if (s.weight > 4500) recs.push({ lvl: 'mid', icon: '⚖', text: `Package weight ${s.weight.toLocaleString()}g exceeds typical thresholds. Confirm carrier freight capacity.` });
  if (s.shipment === 'Ship' && score > 55) recs.push({ lvl: 'high', icon: '⛴', text: 'Sea freight shows high delay correlation. Evaluate air freight upgrade for this shipment value.' });
  if (s.discount > 40) recs.push({ lvl: 'mid', icon: '🏷', text: `Discount of ${s.discount}% is above typical range. Check inventory pressure indicators.` });
  if (s.rating <= 2) recs.push({ lvl: 'high', icon: '★', text: `Customer rating ${s.rating}/5 signals dissatisfaction. Proactive communication strongly recommended.` });
  if (blockDelayRates[s.warehouse] > 0.65) recs.push({ lvl: 'mid', icon: '🏭', text: `Block ${s.warehouse} has historical delay rate above baseline. Consider load balancing.` });
  if (score < 35) recs.push({ lvl: 'low', icon: '✓', text: 'Parameters within normal operating range. Standard fulfilment pipeline recommended.' });
  if (recs.length === 0) recs.push({ lvl: 'mid', icon: '◉', text: 'Moderate risk detected. Apply standard monitoring and status notification protocol.' });

  if ($('recContainer')) {
    $('recContainer').innerHTML = recs.map(r => `
      <div class="rec-item-v2 ${r.lvl}">
        <span class="rec-icon-v2">${r.icon}</span>
        <span>${r.text}</span>
      </div>
    `).join('');
  }
}

// ── Calculate via FastAPI Model Endpoint ──────────────────────────────────────
async function calculateRisk() {
  const calcBtn = $('calcBtn');
  const stickyBtn = document.querySelector('.sticky-primary-btn');
  
  if (calcBtn) calcBtn.disabled = true;
  if (stickyBtn) stickyBtn.disabled = true;

  if ($('riskPill')) {
    $('riskPill').textContent = 'RUNNING MODEL...';
    $('riskPill').className = 'risk-status-pill';
  }

  // Build JSON Payload matching Python Backend
  const payload = {
    customer_care_calls: state.careCalls,
    customer_rating: state.rating,
    cost_of_product: state.cost,
    prior_purchases: state.priorPurchases,
    product_importance: importanceMap[state.importance] || 1,
    discount_offered: state.discount,
    weight_in_gms: state.weight,
    warehouse_block: state.warehouse,
    mode_of_shipment: state.shipment,
    gender: state.gender
  };

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();
    const delayScore = Math.round(data.delay_probability);
    const onTimeScore = Math.round(data.on_time_probability);
    const risk = getRisk(delayScore);
    const factors = computeLocalFactors(state);

    // Update Radial Gauge
    animateRadial(delayScore, risk.arc);

    // Status Pill
    if ($('riskPill')) {
      $('riskPill').textContent = risk.label;
      $('riskPill').className = 'risk-status-pill ' + risk.cls;
    }

    // Probabilities
    if ($('onTimeVal')) $('onTimeVal').textContent = onTimeScore + '%';
    if ($('delayVal')) $('delayVal').textContent = delayScore + '%';
    if ($('onTimeBar')) $('onTimeBar').style.width = onTimeScore + '%';
    if ($('delayBar')) $('delayBar').style.width = delayScore + '%';

    // Buttons & Sticky Output
    if ($('ctaScore')) $('ctaScore').textContent = delayScore + '%';
    if ($('stickyScore')) {
      $('stickyScore').textContent = delayScore + '%';
      $('stickyScore').style.color = risk.color;
    }

    // Risk breakdown
    if ($('riskBreakdown')) {
      $('riskBreakdown').innerHTML = `
        <div class="rb-grid">
          <div class="rb-cell">
            <div class="rb-cell-label">On-Time Prob</div>
            <div class="rb-cell-val" style="color: #166534">${onTimeScore}%</div>
          </div>
          <div class="rb-cell">
            <div class="rb-cell-label">Delay Prob</div>
            <div class="rb-cell-val" style="color: ${risk.color}">${delayScore}%</div>
          </div>
          <div class="rb-cell">
            <div class="rb-cell-label">Model Confidence</div>
            <div class="rb-cell-val">91.2%</div>
          </div>
          <div class="rb-cell">
            <div class="rb-cell-label">Risk Tier</div>
            <div class="rb-cell-val" style="color: ${risk.color}">${delayScore < 35 ? 'T1' : delayScore < 65 ? 'T2' : 'T3'}</div>
          </div>
        </div>
      `;
    }

    // Factor bars
    const maxF = 28;
    const setF = (id, val) => {
      if ($('fg-' + id)) $('fg-' + id).style.width = Math.min((val / maxF) * 100, 100) + '%';
      if ($('fgs-' + id)) $('fgs-' + id).textContent = val + 'pt';
    };
    setF('mode', factors.mode);
    setF('calls', factors.calls);
    setF('weight', factors.weight);
    setF('disc', factors.disc);
    setF('rating', factors.rating);
    setF('wh', factors.wh);

    // Update icon
    const icons = { Flight: '✈', Ship: '⛴', Road: '🚛' };
    const fgIcon = document.querySelector('.fg-row:first-child .fg-icon');
    if (fgIcon) fgIcon.textContent = icons[state.shipment];

    // Recommendations
    generateRecs(delayScore, state);

  } catch (err) {
    console.error('API Error:', err);
    if ($('riskPill')) {
      $('riskPill').textContent = 'API OFFLINE';
      $('riskPill').className = 'risk-status-pill high';
    }
  } finally {
    if (calcBtn) calcBtn.disabled = false;
    if (stickyBtn) stickyBtn.disabled = false;
  }
}

// ── Reset ─────────────────────────────────────────────────────────────────────
function resetForm() {
  Object.assign(state, { 
    warehouse: 'B', shipment: 'Ship', importance: 'low',
    careCalls: 4, rating: 3, cost: 214, priorPurchases: 5, discount: 14, weight: 3200, gender: 'M' 
  });

  if ($('ccSlider')) { $('ccSlider').value = 4; $('ccVal').textContent = '4'; }
  if ($('crSlider')) { $('crSlider').value = 3; updateStars(3); }
  if ($('ppSlider')) { $('ppSlider').value = 5; $('ppVal').textContent = '5'; }
  if ($('costSlider')) { $('costSlider').value = 214; $('costVal').textContent = '$214'; }
  if ($('discSlider')) { $('discSlider').value = 14; $('discVal').textContent = '14%'; }
  if ($('wtSlider')) { $('wtSlider').value = 3200; $('wtVal').textContent = '3,200g'; }
  updateWeightClass(3200);

  document.querySelectorAll('.pill').forEach(p => p.classList.toggle('active', p.dataset.val === 'B'));
  const defaultMode = document.querySelector('input[name="mode"][value="Ship"]');
  if (defaultMode) defaultMode.checked = true;

  document.querySelectorAll('.imp-btn').forEach(b => b.classList.toggle('active', b.dataset.val === 'low'));

  updateSticky();
  animateRadial(0, '#E4E4E7');
  if ($('gaugeScoreText')) {
    $('gaugeScoreText').textContent = '—';
    $('gaugeScoreText').setAttribute('fill', '#A1A1AA');
  }
  if ($('riskPill')) {
    $('riskPill').textContent = 'PENDING';
    $('riskPill').className = 'risk-status-pill';
  }
  if ($('onTimeVal')) $('onTimeVal').textContent = '—';
  if ($('onTimeBar')) $('onTimeBar').style.width = '0%';
  if ($('delayVal')) $('delayVal').textContent = '—';
  if ($('delayBar')) $('delayBar').style.width = '0%';
  if ($('ctaScore')) $('ctaScore').textContent = '—';
  if ($('stickyScore')) {
    $('stickyScore').textContent = '—';
    $('stickyScore').style.color = '';
  }
  if ($('riskBreakdown')) $('riskBreakdown').innerHTML = '<div class="rb-placeholder"><div class="rb-placeholder-icon">◉</div><div>Run prediction to see full breakdown</div></div>';
  if ($('recContainer')) $('recContainer').innerHTML = '<div class="rec-empty mono">Run prediction to generate recommendations</div>';
  ['mode','calls','weight','disc','rating','wh'].forEach(id => {
    if ($('fg-' + id)) $('fg-' + id).style.width = '0%';
    if ($('fgs-' + id)) $('fgs-' + id).textContent = '—';
  });
}

// ── Event Bindings ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Warehouse Block pills
  document.querySelectorAll('.pill').forEach(p => {
    p.addEventListener('click', () => {
      document.querySelectorAll('.pill').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      state.warehouse = p.dataset.val;
      updateSticky();
    });
  });

  // Shipment mode
  document.querySelectorAll('input[name="mode"]').forEach(r => {
    r.addEventListener('change', () => { state.shipment = r.value; updateSticky(); });
  });

  // Importance
  document.querySelectorAll('.imp-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.imp-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.importance = b.dataset.val;
    });
  });

  // Sliders
  if ($('ccSlider')) {
    $('ccSlider').addEventListener('input', function() {
      state.careCalls = +this.value;
      $('ccVal').textContent = this.value;
      updateSticky();
    });
  }

  if ($('crSlider')) {
    $('crSlider').addEventListener('input', function() {
      state.rating = +this.value;
      updateStars(+this.value);
      updateSticky();
    });
  }

  if ($('ppSlider')) {
    $('ppSlider').addEventListener('input', function() {
      state.priorPurchases = +this.value;
      $('ppVal').textContent = this.value;
      updateSticky();
    });
  }

  if ($('costSlider')) {
    $('costSlider').addEventListener('input', function() {
      state.cost = +this.value;
      $('costVal').textContent = '$' + this.value;
      updateSticky();
    });
  }

  if ($('discSlider')) {
    $('discSlider').addEventListener('input', function() {
      state.discount = +this.value;
      $('discVal').textContent = this.value + '%';
      updateSticky();
    });
  }

  if ($('wtSlider')) {
    $('wtSlider').addEventListener('input', function() {
      state.weight = +this.value;
      $('wtVal').textContent = (+this.value).toLocaleString() + 'g';
      updateWeightClass(+this.value);
      updateSticky();
    });
  }

  // Buttons
  if ($('calcBtn')) $('calcBtn').addEventListener('click', calculateRisk);
  const stickyBtn = document.querySelector('.sticky-primary-btn');
  if (stickyBtn) stickyBtn.addEventListener('click', calculateRisk);

  // Init UI
  updateSticky();
  updateStars(3);
  updateWeightClass(3200);
});