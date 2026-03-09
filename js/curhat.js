'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// curhat.js — Curhat mode (emotion cards, carousel effect, search input)
// Depends on: data.js, core.js
// ══════════════════════════════════════════════════════════════════════════════

// ── Emotion Carousel Effect ───────────────────────────────────────────────────

function initCarouselEffect() {
  const carousel = document.getElementById('emotion-grid');
  if (!carousel) return;

  // Scale + fade cards based on distance from visible centre
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

  // Desktop drag-to-scroll
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

  // Run once after paint so offsetLeft values are ready
  requestAnimationFrame(() => requestAnimationFrame(update));
}

// ── Emotion Cards ─────────────────────────────────────────────────────────────

function renderEmotionCards() {
  const grid = document.getElementById('emotion-grid');
  grid.innerHTML = emotions.map(e => `
    <button
      class="emotion-card"
      data-feeling="${e.feeling}"
      data-emotion-id="${e.id}"
      aria-label="${e.label} — ${e.desc}"
    >
      <span class="ec-emoji">${e.emoji}</span>
      <span class="ec-label">${e.label}</span>
      <span class="ec-desc">${e.desc}</span>
    </button>
  `).join('');

  grid.querySelectorAll('.emotion-card').forEach(card => {
    card.addEventListener('click', () =>
      fetchAyat(card.dataset.feeling, { method: 'emotion_card', emotionId: card.dataset.emotionId })
    );
  });

  initCarouselEffect();
}

// ── Search Input ──────────────────────────────────────────────────────────────

function initSearch() {
  const input     = document.getElementById('feeling-input');
  const clearBtn  = document.getElementById('feeling-clear');
  const submitBtn = document.getElementById('feeling-submit');

  const triggerSearch = () => {
    const val = input.value.trim();
    if (val.length >= 3) fetchAyat(val);
  };

  input.addEventListener('input', () => {
    const len = input.value.length;
    clearBtn.classList.toggle('hidden', len === 0);
    submitBtn.classList.toggle('hidden', len < 3);
  });

  // Ctrl/Cmd + Enter to submit from textarea
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
