'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// ajarkan.js — Ajarkan Anakku mode (categories, search, results, cards)
// Depends on: data.js, core.js, verse-card.js
// ══════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════════
//  AJARKAN ANAKKU — Functions
// ════════════════════════════════════════════════════════════════════════════════

// ── Render Input View ─────────────────────────────────────────────────────────

function renderAjarkanView() {
  renderAjarkanAgePills();
  renderAjarkanCategories();
  initAjarkanSearch();
  initAjarkanFilter();
  // If age was already selected (returning to view), show gated content
  if (ajarkanAgeGroup) {
    const gated = document.getElementById('ak-gated-content');
    if (gated) { gated.classList.remove('ak-hidden'); gated.classList.remove('ak-gated-reveal'); }
  }
}

function renderAjarkanAgePills() {
  document.querySelectorAll('.ak-age-seg').forEach(seg => {
    seg.addEventListener('click', () => {
      const age = seg.dataset.age;
      ajarkanAgeGroup = age;
      document.querySelectorAll('.ak-age-seg').forEach(s => s.classList.remove('active'));
      seg.classList.add('active');
      logEvent(age === 'under7' ? 'ajarkan_age_under7_selected' : 'ajarkan_age_7plus_selected');
      // Remove warning if any
      const warn = document.querySelector('.ak-age-warning');
      if (warn) warn.remove();
      // Reveal gated content (search + categories)
      const gated = document.getElementById('ak-gated-content');
      if (gated && gated.classList.contains('ak-hidden')) {
        gated.classList.remove('ak-hidden');
        gated.classList.add('ak-gated-reveal');
      }
    });
  });
}

function renderAjarkanCategories() {
  const grid = document.getElementById('ak-category-grid');
  if (!grid) return;
  grid.innerHTML = '';
  AJARKAN_CATEGORIES.forEach(cat => {
    const total = cat.subcategories.reduce((s, sc) => s + sc.questions.length, 0);
    const card = document.createElement('button');
    card.className = 'ak-category-card';
    card.innerHTML = `
      <span class="ak-category-emoji">${cat.emoji}</span>
      <div class="ak-category-text">
        <span class="ak-category-label">${cat.label}</span>
        <span class="ak-category-count">${total} pertanyaan</span>
      </div>
    `;
    card.addEventListener('click', () => {
      logEvent('ajarkan_category_tapped', { category: cat.id });
      expandAjarkanCategory(cat.id);
    });
    grid.appendChild(card);
  });
}

function expandAjarkanCategory(catId) {
  ajarkanExpandedCatId = catId;
  const cat = AJARKAN_CATEGORIES.find(c => c.id === catId);
  if (!cat) return;

  const container = document.getElementById('ajarkan-expanded');
  container.innerHTML = `
    <div class="panduan-expanded-inner">
      <button class="panduan-expanded-back" id="ak-expanded-back-btn">
        ${BACK_ARROW_SVG} Kembali
      </button>
      <div class="ak-expanded-header">
        <span class="ak-expanded-emoji">${cat.emoji}</span>
        <div class="ak-expanded-text">
          <h3 class="ak-expanded-title">${cat.label}</h3>
          <p class="ak-expanded-desc">${cat.subcategories.length} topik</p>
        </div>
      </div>
      <div class="ak-questions-list" id="ak-subcategory-list"></div>
    </div>
  `;

  const list = container.querySelector('#ak-subcategory-list');
  cat.subcategories.forEach(sub => {
    // Subcategory header (tappable, toggles question list)
    const header = document.createElement('div');
    header.className = 'ak-subcategory-header';
    header.innerHTML = `<span class="ak-sub-name">${escapeHtml(sub.name)}</span><span class="ak-sub-meta">${sub.questions.length} pertanyaan <span class="ak-sub-chevron">\u25BC</span></span>`;
    list.appendChild(header);

    // Questions wrapper (collapsed by default)
    const questionsWrap = document.createElement('div');
    questionsWrap.className = 'ak-sub-questions-wrap ak-sub-collapsed';

    sub.questions.forEach(q => {
      const row = document.createElement('button');
      row.className = 'ak-question-row';
      row.innerHTML = `<span>${escapeHtml(q.text)}</span>${CHEVRON_RIGHT_SVG}`;
      row.addEventListener('click', () => {
        if (!ensureAjarkanAge()) return;
        logEvent('ajarkan_question_selected', { question_id: q.id, source: 'category' });
        fetchAjarkanPreset(q.id);
      });
      questionsWrap.appendChild(row);
    });

    list.appendChild(questionsWrap);

    // Toggle expand/collapse on header tap
    header.addEventListener('click', () => {
      const isCollapsed = questionsWrap.classList.contains('ak-sub-collapsed');
      questionsWrap.classList.toggle('ak-sub-collapsed', !isCollapsed);
      header.classList.toggle('ak-sub-expanded', isCollapsed);
    });
  });

  container.classList.remove('hidden');
  container.classList.remove('slide-down');
  container.classList.add('slide-up');

  container.querySelector('#ak-expanded-back-btn').addEventListener('click', collapseAjarkanCategory);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function collapseAjarkanCategory() {
  ajarkanExpandedCatId = null;
  const container = document.getElementById('ajarkan-expanded');
  container.classList.remove('slide-up');
  container.classList.add('slide-down');
  setTimeout(() => {
    container.classList.add('hidden');
    container.classList.remove('slide-down');
  }, 250);
}

function ensureAjarkanAge() {
  if (ajarkanAgeGroup) return true;
  // Show warning
  if (!document.querySelector('.ak-age-warning')) {
    const warn = document.createElement('p');
    warn.className = 'ak-age-warning';
    warn.textContent = 'Pilih kelompok usia anak dulu';
    const selector = document.querySelector('.ak-age-selector');
    if (selector) selector.after(warn);
  }
  return false;
}

function initAjarkanSearch() {
  const input   = document.getElementById('ajarkan-input');
  const clear   = document.getElementById('ajarkan-clear');
  const submit  = document.getElementById('ajarkan-submit');
  if (!input || !submit) return;

  input.addEventListener('input', () => {
    const hasText = input.value.trim().length > 0;
    clear.classList.toggle('hidden', !hasText);
    submit.classList.toggle('hidden', !hasText);
  });

  clear.addEventListener('click', () => {
    input.value = '';
    clear.classList.add('hidden');
    submit.classList.add('hidden');
    input.focus();
  });

  submit.addEventListener('click', () => {
    const query = input.value.trim();
    if (!query) return;
    if (!ensureAjarkanAge()) return;
    logEvent('ajarkan_search_started', { query_length: query.length });
    fetchAjarkanFreeform(query);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit.click();
    }
  });
}

function initAjarkanFilter() {
  const filterInput = document.getElementById('ak-filter-input');
  if (!filterInput) return;

  let filterTimeout;
  filterInput.addEventListener('input', () => {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => {
      const query = filterInput.value.trim().toLowerCase();
      filterAjarkanQuestions(query);
    }, 200);
  });
}

function filterAjarkanQuestions(query) {
  const grid = document.getElementById('ak-category-grid');
  if (!grid) return;

  if (!query || query.length < 2) {
    // Show categories, hide filtered list
    grid.style.display = '';
    const existing = document.getElementById('ak-filtered-results');
    if (existing) existing.remove();
    return;
  }

  logEvent('ajarkan_question_filtered', { query_length: query.length });

  // Hide category grid
  grid.style.display = 'none';

  // Build flat filtered list — word-based matching (all query words must appear)
  const queryWords = query.split(/\s+/).filter(w => w.length >= 2);
  if (queryWords.length === 0) {
    grid.style.display = '';
    const existing = document.getElementById('ak-filtered-results');
    if (existing) existing.remove();
    return;
  }
  const matches = [];
  AJARKAN_CATEGORIES.forEach(cat => {
    cat.subcategories.forEach(sub => {
      sub.questions.forEach(q => {
        const text = q.text.toLowerCase();
        // Score: count how many query words appear in the question text
        const wordHits = queryWords.filter(w => text.includes(w)).length;
        if (wordHits > 0) {
          matches.push({ ...q, category: cat.label, subcategory: sub.name, _score: wordHits });
        }
      });
    });
  });
  // Sort by relevance: more matching words first
  matches.sort((a, b) => b._score - a._score);

  let container = document.getElementById('ak-filtered-results');
  if (!container) {
    container = document.createElement('div');
    container.id = 'ak-filtered-results';
    container.className = 'ak-filtered-list';
    grid.parentNode.appendChild(container);
  }
  container.innerHTML = '';

  if (matches.length === 0) {
    container.innerHTML = `<div class="ak-empty-state">
      <span class="ak-empty-icon">\uD83D\uDD0D</span>
      <p class="ak-empty-text">Tidak ada pertanyaan yang cocok</p>
      <p class="ak-empty-hint">Coba kata kunci lain</p>
    </div>`;
    return;
  }

  matches.slice(0, 20).forEach(m => {
    const item = document.createElement('button');
    item.className = 'ak-filtered-item';
    item.innerHTML = `<span>${escapeHtml(m.text)}</span><span class="ak-filtered-cat">${m.subcategory}</span>`;
    item.addEventListener('click', () => {
      if (!ensureAjarkanAge()) return;
      logEvent('ajarkan_question_selected', { question_id: m.id, source: 'filter' });
      fetchAjarkanPreset(m.id);
    });
    container.appendChild(item);
  });

  if (matches.length > 20) {
    const more = document.createElement('p');
    more.style.cssText = 'text-align:center;color:var(--text-muted);font-size:12px;padding:8px;';
    more.textContent = `+${matches.length - 20} pertanyaan lainnya`;
    container.appendChild(more);
  }
}

// ── Fetch Functions ───────────────────────────────────────────────────────────

async function fetchAjarkanPreset(questionId) {
  ajarkanCurrentQId = questionId;
  // Find question text for display
  let questionText = '';
  for (const cat of AJARKAN_CATEGORIES) {
    for (const sub of cat.subcategories) {
      const q = sub.questions.find(q => q.id === questionId);
      if (q) { questionText = q.text; break; }
    }
    if (questionText) break;
  }
  currentFeeling = questionText;
  switchView('verses-view');
  showLoading();

  try {
    const res = await fetch('/api/get-ayat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'ajarkan',
        questionId,
        ageGroup: ajarkanAgeGroup,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan');
    if (data.error === 'not_available') {
      logEvent('ajarkan_not_available', { question_id: questionId });
      showNotRelevant(data.message || 'Pertanyaan ini belum tersedia. Silakan coba pertanyaan lain.');
    } else {
      logEvent('ajarkan_search_completed', { question_id: questionId, age_group: ajarkanAgeGroup });
      ajarkanCurrentData = data;
      renderAjarkanResults(data);
    }
  } catch (err) {
    stopLoadingSteps();
    logEvent('ajarkan_search_completed', { outcome: 'error' });
    showError(err.message || 'Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function fetchAjarkanFreeform(query) {
  ajarkanCurrentQId = null;
  currentFeeling = query;
  switchView('verses-view');
  showLoading();

  try {
    const res = await fetch('/api/get-ayat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'ajarkan',
        feeling: query,
        ageGroup: ajarkanAgeGroup,
        freeform: true,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan');

    if (data.error === 'not_available') {
      logEvent('ajarkan_not_available', { query_length: query.length });
      // Show suggestions if available
      if (data.suggestions && data.suggestions.length > 0) {
        showAjarkanSuggestions(data.message, data.suggestions);
      } else {
        showNotRelevant(data.message || 'Pertanyaan ini belum tersedia.');
      }
    } else {
      ajarkanCurrentQId = data.question_id;
      ajarkanCurrentData = data;
      if (data.also_relevant) {
        logEvent('ajarkan_search_partial_match', { question_id: data.question_id });
      } else {
        logEvent('ajarkan_search_completed', { question_id: data.question_id, age_group: ajarkanAgeGroup });
      }
      renderAjarkanResults(data);
    }
  } catch (err) {
    stopLoadingSteps();
    logEvent('ajarkan_search_completed', { outcome: 'error' });
    showError(err.message || 'Terjadi kesalahan. Silakan coba lagi.');
  }
}

function showAjarkanSuggestions(message, suggestions) {
  stopLoadingSteps();
  const carousel = document.getElementById('verses-carousel');
  carousel.innerHTML = `
    <div class="verse-slide">
      <div class="intro-chat">
        <div class="chat-thread">
          <div class="chat-bubble chat-bubble--app">
            <p style="margin-bottom:12px;">${escapeHtml(message)}</p>
            <p style="font-size:13px;color:var(--text-muted);margin-bottom:8px;">Mungkin maksudmu:</p>
            <div id="ak-suggestion-list" style="display:flex;flex-direction:column;gap:6px;"></div>
          </div>
        </div>
        <button class="find-more-btn" id="ak-suggestions-back">← Coba pertanyaan lain</button>
      </div>
    </div>
  `;
  const list = carousel.querySelector('#ak-suggestion-list');
  suggestions.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'sub-question-row';
    btn.style.cssText = 'font-size:13px;padding:10px 12px;';
    btn.innerHTML = `<span>${escapeHtml(s.text)}</span>${CHEVRON_RIGHT_SVG}`;
    btn.addEventListener('click', () => {
      logEvent('ajarkan_suggestion_tapped', { question_id: s.questionId });
      fetchAjarkanPreset(s.questionId);
    });
    list.appendChild(btn);
  });
  carousel.querySelector('#ak-suggestions-back').addEventListener('click', () => switchView('ajarkan-view'));
}

// ── Result Renderers ──────────────────────────────────────────────────────────

function renderAjarkanResults(data) {
  stopLoadingSteps();
  const carousel = document.getElementById('verses-carousel');
  carousel.innerHTML = '';

  // Ensure pembuka_percakapan is an object (may come as string from DB)
  if (typeof data.pembuka_percakapan === 'string') {
    try { data.pembuka_percakapan = JSON.parse(data.pembuka_percakapan); } catch { data.pembuka_percakapan = {}; }
  }

  const verses = data.ayat || [];
  // Cards: Penjelasan + Ide Ngobrol + Coba Lakukan (verse refs are in Card 0)
  totalVerseCards = 3;
  currentCardIndex = 0;

  // Card 0: Penjelasan (with verse references)
  carousel.appendChild(buildAjarkanPenjelasanCard(data, verses));
  // Card 1: Ide Ngobrol
  carousel.appendChild(buildAjarkanNgobrolCard(data));
  // Card 2: Coba Lakukan
  carousel.appendChild(buildAjarkanAktivitasCard(data));

  renderDots();
  updateCounter();

  // Scroll listener for index tracking
  // NOTE: CSS scroll-snap-type: x mandatory handles native touch swiping.
  // Do NOT add manual touch handlers — they race with onCarouselScroll and cause card skipping.
  carousel.addEventListener('scroll', onCarouselScroll, { passive: true });

  // Hide actions/feedback for ajarkan
  document.getElementById('verse-actions').classList.add('hidden');
  document.getElementById('verse-feedback').classList.add('hidden');

  // Show penjelasan_anak instantly with fade-in
  const typeEl = document.getElementById('ak-penjelasan-text');
  if (typeEl && data.penjelasan_anak) {
    typeEl.textContent = data.penjelasan_anak;
    typeEl.classList.add('ak-fade-in');
  }
}

function typewriteAjarkan(el, text, speed) {
  el.innerHTML = '';
  let i = 0;
  const cursor = document.createElement('span');
  cursor.className = 'ak-typewriter-cursor';
  el.appendChild(cursor);

  const timer = setInterval(() => {
    if (!typewriterActive) { clearInterval(timer); cursor.remove(); return; }
    if (i < text.length) {
      cursor.before(document.createTextNode(text.charAt(i)));
      i++;
    } else {
      clearInterval(timer);
      setTimeout(() => cursor.remove(), 1200);
    }
  }, speed);
}

// ── Card Builders ─────────────────────────────────────────────────────────────

function buildAjarkanPenjelasanCard(data, verses) {
  const slide = document.createElement('div');
  slide.className = 'verse-slide';

  let verseTeaserHtml = '';
  if (verses.length > 0) {
    verseTeaserHtml = `
      <div class="ak-verse-teaser">
        <div class="ak-verse-teaser-label">\uD83D\uDCD6 Referensi Ayat (${verses.length})</div>
        ${verses.map((v, i) => `
          <div class="ak-vmc-row" data-ak-toggle="vmc">
            <span class="ak-vmc-row-name">${escapeHtml(v.surah_name || '')} \u2022 Ayat ${v.ayah || ''}</span>
            <span class="ak-vmc-row-action">lihat ayat <span class="ak-vmc-row-chevron">\u25BC</span></span>
          </div>
          <div class="ak-verse-mini-card ak-vmc-collapsed">
            ${v.verse_relevance ? `<div class="ak-vmc-relevance"><span class="ak-vmc-pin">\uD83D\uDCCC</span><span>${escapeHtml(v.verse_relevance)}</span></div>` : ''}
            <div class="ak-vmc-arabic-section">
              <div class="ak-vmc-ref">${escapeHtml(v.surah_name || '')} \u2022 Ayat ${v.ayah || ''}</div>
              <p class="ak-vmc-arabic">${v.arabic || ''}</p>
            </div>
            <div class="ak-vmc-content">
              <p class="ak-vmc-translation">"${escapeHtml(v.translation || '')}"</p>
              <div class="ak-action-row">
                <button class="ak-action-btn" data-ak-audio="${v.surah || ''}:${v.ayah || ''}">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Dengarkan
                </button>
                <button class="ak-action-btn" data-ak-share="${i}">Bagikan Ayat</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  const ageLabel = (data.age_group === 'under7') ? 'Di bawah 7 tahun' : '7 tahun ke atas';
  const otherAge = (data.age_group === 'under7') ? '7plus' : 'under7';
  const otherLabel = (data.age_group === 'under7') ? 'Ganti ke 7+' : 'Ganti ke <7';

  slide.innerHTML = `
    <div class="ak-age-badge" data-ak-switch-age="${otherAge}" title="${otherLabel}">${ageLabel}</div>
    <div class="ak-card"><div class="ak-card-body">
      <div class="ak-section-label"><span class="ak-sl-icon">\uD83E\uDDD2</span> Penjelasan untuk anak</div>
      <h2 class="ak-intro-question">${escapeHtml(data.question_text || currentFeeling)}</h2>
      <div class="ak-explanation-wrap">
        <span class="ak-explanation-text" id="ak-penjelasan-text"></span>
      </div>
      ${verseTeaserHtml}
    </div></div>
    <div class="ak-swipe-cta" data-ak-goto="1">
      <span class="ak-swipe-cta-icon">\uD83D\uDCAC</span>
      <span class="ak-swipe-cta-text">Cara ngobrol dengan anak</span>
      <span class="ak-swipe-cta-arrow">Geser \u2192</span>
    </div>
  `;

  wireAjarkanCardEvents(slide, data, verses);
  return slide;
}

function buildAjarkanNgobrolCard(data) {
  const slide = document.createElement('div');
  slide.className = 'verse-slide';
  const p = data.pembuka_percakapan || {};

  slide.innerHTML = `
    <div class="ak-card"><div class="ak-card-body">
      <div class="ak-section-label"><span class="ak-sl-icon">\uD83D\uDCAC</span> Cara ngobrol dengan anak</div>

      <p class="ak-ngobrol-hint">Pilih cara memulai:</p>
      <div class="ak-ngobrol-toggle">
        <button class="ak-ngobrol-seg active" data-ak-ngobrol="pertanyaan">\u2753 Pertanyaan</button>
        <button class="ak-ngobrol-seg" data-ak-ngobrol="cerita">\uD83D\uDCD6 Cerita</button>
      </div>

      <div class="ak-ngobrol-panel" id="ak-ngobrol-pertanyaan">
        <span class="ak-pembuka-text">${escapeHtml(p.pertanyaan || '')}</span>
        <p class="ak-panduan-text">${escapeHtml(p.panduan_pertanyaan || '')}</p>
        <div class="ak-expand-row" data-ak-expand>
          <span class="ak-expand-row-icon">\uD83C\uDF19</span>
          <span class="ak-expand-row-label">Lihat penjelasan untuk anak</span>
          <span class="ak-expand-row-chevron">\u25BC</span>
        </div>
        <div class="ak-expand-content">
          <p class="ak-expand-text">${escapeHtml(data.penjelasan_anak || '')}</p>
        </div>
      </div>

      <div class="ak-ngobrol-panel ak-ngobrol-hidden" id="ak-ngobrol-cerita">
        <span class="ak-pembuka-text">${escapeHtml(p.cerita || '')}</span>
        <p class="ak-panduan-text">${escapeHtml(p.panduan_cerita || '')}</p>
        <div class="ak-expand-row" data-ak-expand>
          <span class="ak-expand-row-icon">\uD83C\uDF19</span>
          <span class="ak-expand-row-label">Lihat penjelasan untuk anak</span>
          <span class="ak-expand-row-chevron">\u25BC</span>
        </div>
        <div class="ak-expand-content">
          <p class="ak-expand-text">${escapeHtml(data.penjelasan_anak || '')}</p>
        </div>
      </div>

    </div></div>
    <div class="ak-swipe-cta" data-ak-goto="2">
      <span class="ak-swipe-cta-icon">\u2728</span>
      <span class="ak-swipe-cta-text">Coba lakukan bersama anak</span>
      <span class="ak-swipe-cta-arrow">Geser \u2192</span>
    </div>
  `;

  // Wire ngobrol toggle
  slide.querySelectorAll('[data-ak-ngobrol]').forEach(seg => {
    seg.addEventListener('click', () => {
      const which = seg.dataset.akNgobrol;
      slide.querySelectorAll('.ak-ngobrol-seg').forEach(s => s.classList.remove('active'));
      seg.classList.add('active');
      slide.querySelectorAll('.ak-ngobrol-panel').forEach(p => p.classList.add('ak-ngobrol-hidden'));
      const panel = slide.querySelector(`#ak-ngobrol-${which}`);
      if (panel) panel.classList.remove('ak-ngobrol-hidden');
    });
  });

  wireAjarkanCardEvents(slide, data);
  return slide;
}

function buildAjarkanAktivitasCard(data) {
  const slide = document.createElement('div');
  slide.className = 'verse-slide';

  slide.innerHTML = `
    <div class="ak-card"><div class="ak-card-body">
      <div class="ak-section-label"><span class="ak-sl-icon">\u2728</span> Coba lakukan bersama anak</div>
      <div class="ak-activity-box">
        <p class="ak-activity-text">${data.aktivitas_bersama || ''}</p>
      </div>
    </div></div>
  `;

  wireAjarkanCardEvents(slide, data);
  return slide;
}

function buildAjarkanVerseCard(verse, data, index) {
  const slide = document.createElement('div');
  slide.className = 'verse-slide';

  slide.innerHTML = `
    <div class="ak-card"><div class="ak-card-body">
      <div class="ak-section-label"><span class="ak-sl-icon">\uD83D\uDCD6</span> Ayat dari Al-Qur'an</div>
      ${verse.verse_relevance ? `
        <div class="ak-verse-relevance">
          <span class="ak-verse-relevance-icon">\uD83D\uDCCC</span>
          <p class="ak-verse-relevance-text">${escapeHtml(verse.verse_relevance)}</p>
        </div>` : ''}
      <div class="ak-verse-row" data-ak-toggle="verse">
        <span class="ak-verse-name">${escapeHtml(verse.surah_name || '')} \u2022 Ayat ${verse.ayah || ''}</span>
        <span class="ak-verse-toggle">lihat ayat <span class="ak-verse-chevron">\u25BC</span></span>
      </div>
      <div class="ak-verse-dropdown">
        <p class="ak-verse-arabic">${verse.arabic || ''}</p>
        <p class="ak-verse-translation">${escapeHtml(verse.translation || '')}</p>
      </div>
      <div class="ak-action-row">
        <button class="ak-action-btn" data-ak-audio="${verse.surah || ''}:${verse.ayah || ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Dengarkan
        </button>
        <button class="ak-action-btn" data-ak-share="${index}">Bagikan Ayat</button>
      </div>
    </div></div>
  `;

  wireAjarkanCardEvents(slide, data);
  return slide;
}

// ── Card Event Wiring ─────────────────────────────────────────────────────────

function wireAjarkanCardEvents(slide, data, verses) {
  // Expand/collapse rows
  slide.querySelectorAll('[data-ak-expand]').forEach(row => {
    row.addEventListener('click', () => {
      row.classList.toggle('open');
      const content = row.nextElementSibling;
      if (content) content.classList.toggle('open');
    });
  });

  // Verse mini-card toggle (Card 0)
  slide.querySelectorAll('[data-ak-toggle="vmc"]').forEach(row => {
    row.addEventListener('click', () => {
      const card = row.nextElementSibling;
      if (card) card.classList.toggle('ak-vmc-collapsed');
      row.classList.toggle('ak-vmc-open');
      const actionEl = row.querySelector('.ak-vmc-row-action');
      if (actionEl) {
        const isOpen = row.classList.contains('ak-vmc-open');
        actionEl.childNodes[0].textContent = isOpen ? 'tutup ' : 'lihat ayat ';
      }
    });
  });

  // Verse dropdown toggle
  slide.querySelectorAll('[data-ak-toggle="verse"]').forEach(row => {
    row.addEventListener('click', () => {
      const dd = row.nextElementSibling;
      if (dd) dd.classList.toggle('open');
      const toggleEl = row.querySelector('.ak-verse-toggle');
      if (toggleEl) {
        toggleEl.classList.toggle('open');
        const isOpen = toggleEl.classList.contains('open');
        toggleEl.childNodes[0].textContent = isOpen ? 'tutup ayat ' : 'lihat ayat ';
      }
      logEvent('ajarkan_verse_expanded');
    });
  });

  // Inline copy
  slide.querySelectorAll('[data-ak-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.akCopy;
      let text = '';
      if (key === 'penjelasan') text = data.penjelasan_anak || '';
      else if (key === 'pertanyaan') text = (data.pembuka_percakapan || {}).pertanyaan || '';
      else if (key === 'cerita') text = (data.pembuka_percakapan || {}).cerita || '';
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        btn.classList.add('copied');
        const tip = btn.querySelector('.ak-salin-tooltip');
        if (tip) tip.classList.add('show');
        logEvent(key === 'penjelasan' ? 'ajarkan_penjelasan_copied' : 'ajarkan_conversation_copied', { key });
        setTimeout(() => {
          btn.classList.remove('copied');
          if (tip) tip.classList.remove('show');
        }, 1400);
      }).catch(() => {});
    });
  });

  // CTAs (goto)
  slide.querySelectorAll('[data-ak-goto]').forEach(el => {
    el.addEventListener('click', () => {
      const target = parseInt(el.dataset.akGoto, 10);
      scrollCarouselTo(target);
      logEvent('ajarkan_card_swiped', { to: target });
    });
  });

  // Audio buttons
  slide.querySelectorAll('[data-ak-audio]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [surah, ayah] = btn.dataset.akAudio.split(':');
      if (surah && ayah) {
        playAudio({ surah: parseInt(surah), ayah: parseInt(ayah) }, btn);
      }
    });
  });

  // Share buttons
  slide.querySelectorAll('[data-ak-share]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.akShare, 10);
      const allVerses = data.ayat || [];
      if (allVerses[idx]) openShareSheet(allVerses[idx]);
    });
  });

  // Age switch badge — tap to toggle age group and re-fetch same question
  slide.querySelectorAll('[data-ak-switch-age]').forEach(badge => {
    badge.addEventListener('click', () => {
      const newAge = badge.dataset.akSwitchAge;
      if (!newAge || !ajarkanCurrentQId) return;
      ajarkanAgeGroup = newAge;
      // Update pills on the ajarkan-view too
      document.querySelectorAll('.ak-age-seg').forEach(s => {
        s.classList.toggle('active', s.dataset.age === newAge);
      });
      logEvent(newAge === 'under7' ? 'ajarkan_age_under7_selected' : 'ajarkan_age_7plus_selected', { source: 'badge' });
      fetchAjarkanPreset(ajarkanCurrentQId);
    });
  });
}
