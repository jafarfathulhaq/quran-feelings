'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// panduan.js — Panduan Hidup mode (cards, carousel, search, sub-questions)
// Depends on: data.js, core.js
// ══════════════════════════════════════════════════════════════════════════════

// ── Panduan Cards ──────────────────────────────────────────────────────────

function renderPanduanCards() {
  const grid = document.getElementById('panduan-grid');
  if (!grid) return;
  grid.innerHTML = panduanPresets.map(p => `
    <button
      class="emotion-card"
      data-query="${escapeHtml(p.query)}"
      data-preset-id="${p.id}"
      aria-label="${p.label}"
    >
      <span class="ec-emoji">${p.emoji}</span>
      <span class="ec-label">${p.label}</span>
    </button>
  `).join('');

  grid.querySelectorAll('.emotion-card').forEach(card => {
    card.addEventListener('click', () => expandPanduanCard(card.dataset.presetId));
  });

  initPanduanCarouselEffect();
}

function initPanduanCarouselEffect() {
  const carousel = document.getElementById('panduan-grid');
  if (!carousel) return;

  function update() {
    const visibleWidth = carousel.offsetWidth;
    const center = carousel.scrollLeft + visibleWidth / 2;

    carousel.querySelectorAll('.emotion-card').forEach(card => {
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const dist = Math.abs(center - cardCenter);
      const maxDist = visibleWidth * 0.65;
      const ratio = Math.min(dist / maxDist, 1);

      const scale   = (1 - ratio * 0.10).toFixed(3);
      const opacity = (1 - ratio * 0.42).toFixed(3);
      card.style.transform = `scale(${scale})`;
      card.style.opacity   = opacity;
    });
  }

  carousel.addEventListener('scroll', update, { passive: true });

  let isDragging = false, startX = 0, scrollStart = 0;
  carousel.addEventListener('mousedown', e => {
    isDragging  = true;
    startX      = e.pageX;
    scrollStart = carousel.scrollLeft;
    carousel.classList.add('is-dragging');
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!isDragging) return;
    carousel.scrollLeft = scrollStart - (e.pageX - startX);
  });
  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    carousel.classList.remove('is-dragging');
  });

  requestAnimationFrame(() => requestAnimationFrame(update));
}

// ── Panduan Search Input ──────────────────────────────────────────────────

function initPanduanSearch() {
  const input     = document.getElementById('panduan-input');
  const clearBtn  = document.getElementById('panduan-clear');
  const submitBtn = document.getElementById('panduan-submit');
  if (!input) return;

  const triggerSearch = () => {
    const val = input.value.trim();
    if (val.length >= 3) fetchAyat(val, { method: 'text' });
  };

  input.addEventListener('input', () => {
    const len = input.value.length;
    clearBtn.classList.toggle('hidden', len === 0);
    submitBtn.classList.toggle('hidden', len < 3);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) triggerSearch();
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.classList.add('hidden');
    submitBtn.classList.add('hidden');
    input.focus();
  });

  submitBtn.addEventListener('click', triggerSearch);
}

// ── Sub-Questions Drill-Down ─────────────────────────────────────────────────

function expandPanduanCard(cardId) {
  expandedCardId = cardId;

  const preset = panduanPresets.find(p => p.id === cardId);
  if (!preset) return;

  const subQuestions = PANDUAN_SUB_QUESTIONS[cardId] || [];

  const container = document.getElementById('panduan-expanded');
  container.innerHTML = `
    <div class="panduan-expanded-inner">
      <button class="panduan-expanded-back" id="expanded-back-btn">
        ${BACK_ARROW_SVG} Kembali
      </button>
      <div class="panduan-expanded-header">
        <span class="panduan-expanded-emoji">${preset.emoji}</span>
        <h2 class="panduan-expanded-title">${preset.label}</h2>
        <p class="panduan-expanded-desc">${escapeHtml(preset.query)}</p>
      </div>
      <div class="sub-questions-list">
        ${subQuestions.map((q, i) => `
          <button class="sub-question-row" data-index="${i}" data-card-id="${cardId}">
            <span>${escapeHtml(q)}</span>
            <span class="sub-question-arrow">${CHEVRON_RIGHT_SVG}</span>
          </button>
        `).join('')}
      </div>
      <div class="tulis-sendiri-section" id="tulis-sendiri-section">
        <button class="tulis-sendiri-row" id="tulis-sendiri-btn">
          <span>✏️</span>
          <span>Tulis sendiri...</span>
        </button>
      </div>
    </div>
  `;

  // Show expanded, animate in
  container.classList.remove('hidden', 'slide-down');
  container.classList.add('slide-up');

  // Wire sub-question taps
  container.querySelectorAll('.sub-question-row').forEach(row => {
    row.addEventListener('click', () => {
      const qIndex = parseInt(row.dataset.index, 10);
      const qText  = subQuestions[qIndex];
      selectSubQuestion(qText, cardId, qIndex);
    });
  });

  // Wire back button
  container.querySelector('#expanded-back-btn').addEventListener('click', collapsePanduanCard);

  // Wire "Tulis sendiri"
  container.querySelector('#tulis-sendiri-btn').addEventListener('click', () => showTulisSendiri(cardId));

  window.scrollTo({ top: 0, behavior: 'smooth' });
  logEvent('card_expanded', { card_id: cardId, mode: 'panduan' });
}

function collapsePanduanCard() {
  const container = document.getElementById('panduan-expanded');
  container.classList.remove('slide-up');
  container.classList.add('slide-down');

  container.addEventListener('animationend', function handler() {
    container.removeEventListener('animationend', handler);
    container.classList.add('hidden');
    container.classList.remove('slide-down');
    container.innerHTML = '';
    expandedCardId = null;
  });
}

function selectSubQuestion(questionText, cardId, index) {
  logEvent('sub_question_selected', { card_id: cardId, question_index: index, mode: 'panduan' });
  fetchAyat(questionText, { method: 'panduan_sub_question', emotionId: cardId });
}

function showTulisSendiri(cardId) {
  logEvent('tulis_sendiri_opened', { card_id: cardId, mode: 'panduan' });

  const section = document.getElementById('tulis-sendiri-section');
  section.innerHTML = `
    <div class="tulis-sendiri-form">
      <textarea id="tulis-sendiri-input" placeholder="Tulis pertanyaanmu di sini..." rows="3"></textarea>
      <button class="tulis-sendiri-submit" id="tulis-sendiri-submit" disabled>Cari Panduan</button>
    </div>
  `;

  const input  = document.getElementById('tulis-sendiri-input');
  const submit = document.getElementById('tulis-sendiri-submit');

  input.focus();

  // Scroll so textarea is visible
  setTimeout(() => input.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);

  input.addEventListener('input', () => {
    submit.disabled = input.value.trim().length < 3;
  });

  const doSubmit = () => {
    const val = input.value.trim();
    if (val.length >= 3) fetchAyat(val, { method: 'panduan_tulis_sendiri', emotionId: cardId });
  };

  submit.addEventListener('click', doSubmit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doSubmit();
  });
}
