'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// jelajahi.js — Jelajahi Al-Qur'an mode (surah browser, search, verse render)
// Depends on: data.js, core.js, verse-card.js
// ══════════════════════════════════════════════════════════════════════════════

// ── Jelajahi Cards ──────────────────────────────────────────────────────────

function loadSurahFromBrowser(surahNum, source) {
  const meta = SURAH_META[surahNum - 1];
  logEvent('jelajahi_surah_browser', { surah: surahNum, name: meta.name, source });
  lastJuzSurahTapped = null;
  cameFromMultiResult = false;
  fetchJelajahi(null, { type: 'surah', surah: surahNum });
}

function toggleJuzGroup(groupEl) {
  const currentlyOpen = document.querySelector('.juz-group.expanded');
  if (currentlyOpen && currentlyOpen !== groupEl) {
    currentlyOpen.classList.remove('expanded');
  }
  groupEl.classList.toggle('expanded');

  if (groupEl.classList.contains('expanded')) {
    const label = groupEl.querySelector('.juz-group-label');
    logEvent('jelajahi_juz_group_opened', { group: label ? label.textContent : '' });
    setTimeout(() => {
      groupEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }
}

function renderSurahBrowser() {
  const container = document.getElementById('surah-browser');
  if (!container) return;

  let html = '';

  // All juz accordion groups (including Juz 1–5)
  SURAH_BROWSER.forEach((group, idx) => {
    const surahRows = group.surahs.map(num => {
      const s = SURAH_META[num - 1];
      return `
        <button class="sb-accordion-row" data-surah="${num}">
          <span class="sb-num">${num}</span>
          <span class="sb-name">${escapeHtml(s.name)}</span>
          <span class="sb-info">${s.verses} ayat</span>
        </button>
      `;
    }).join('');

    html += `
      <div class="juz-group" id="juz-group-${idx}">
        <button class="juz-group-header">
          <span class="juz-group-left">
            <span class="juz-group-label">${group.label}</span>
            <span class="juz-group-count">${group.surahs.length} surat</span>
          </span>
          <span class="juz-group-arrow">›</span>
        </button>
        <div class="juz-group-content">
          ${surahRows}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Accordion header click handlers
  container.querySelectorAll('.juz-group-header').forEach(header => {
    header.addEventListener('click', () => {
      toggleJuzGroup(header.parentElement);
    });
  });

  // Accordion surah row click handlers
  container.querySelectorAll('.sb-accordion-row').forEach(row => {
    row.addEventListener('click', () => {
      const groupLabel = row.closest('.juz-group').querySelector('.juz-group-label').textContent;
      loadSurahFromBrowser(parseInt(row.dataset.surah, 10), groupLabel);
    });
  });
}

function showJuzSurahList() {
  juzSurahListVisible = true;
  // Clone node to drop any stale animationend listeners from a prior
  // hideJuzSurahList that never fired (view switched away mid-animation).
  const old = document.getElementById('juz-surah-list');
  const container = old.cloneNode(false);
  old.parentNode.replaceChild(container, old);

  container.innerHTML = `
    <div class="juz-surah-inner">
      <div class="juz-surah-header">
        <button class="panduan-expanded-back" id="juz-back-btn">
          ${BACK_ARROW_SVG} Kembali
        </button>
        <span class="juz-surah-title">Juz Amma</span>
      </div>
      <div class="juz-surah-rows">
        ${JUZ_30_SURAHS.map(s => `
          <button class="juz-surah-row" data-surah="${s.number}">
            <span class="juz-surah-num">${s.number}</span>
            <span class="juz-surah-name">${escapeHtml(s.name)}</span>
            <span class="juz-surah-info">${s.verses} ayat</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;

  container.classList.remove('hidden');
  container.classList.add('slide-up');
  container.classList.remove('slide-down');

  container.querySelector('#juz-back-btn').addEventListener('click', hideJuzSurahList);
  container.querySelectorAll('.juz-surah-row').forEach(row => {
    row.addEventListener('click', () => {
      const surahNum = parseInt(row.dataset.surah, 10);
      const meta = SURAH_META[surahNum - 1];
      logEvent('jelajahi_juz_surah_selected', { juz: 30, surah: surahNum, name: meta.name });
      lastJuzSurahTapped = surahNum;
      hideJuzSurahList();
      fetchJelajahi(null, { type: 'surah', surah: surahNum });
    });
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideJuzSurahList() {
  const container = document.getElementById('juz-surah-list');
  container.classList.remove('slide-up');
  container.classList.add('slide-down');

  container.addEventListener('animationend', function handler() {
    container.removeEventListener('animationend', handler);
    container.classList.add('hidden');
    container.classList.remove('slide-down');
    juzSurahListVisible = false;
  });
}

// ── Jelajahi Multi-Result ─────────────────────────────────────────────────

function toggleJelajahiLanding(show) {
  const jView = document.getElementById('jelajahi-view');
  const display = show ? '' : 'none';
  ['.header', '.input-card', '.home-content'].forEach(sel => {
    const el = jView.querySelector(sel);
    if (el) el.style.display = display;
  });
}

function showMultiResults(results) {
  jelajahiMultiResults = results;
  const container = document.getElementById('jelajahi-multi');

  // Hide landing content
  toggleJelajahiLanding(false);

  container.innerHTML = `
    <p class="multi-result-heading">Kami menemukan beberapa surat yang cocok</p>
    <p class="multi-result-subheading">Pilih salah satu untuk mulai membaca:</p>
    ${results.map((r, i) => `
      <button class="multi-result-card" data-idx="${i}">
        <span class="juz-surah-num">${r.surah}</span>
        <div class="multi-card-body">
          <div class="multi-card-header">
            <span class="multi-card-name">${escapeHtml(r.name)}</span>
            <span class="multi-card-info">${r.verse_count} ayat</span>
          </div>
          <p class="multi-card-reason">${escapeHtml(r.reason)}</p>
        </div>
      </button>
    `).join('')}
  `;

  container.classList.remove('hidden');

  container.querySelectorAll('.multi-result-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.idx, 10);
      const chosen = results[idx];
      logEvent('jelajahi_multi_selected', { surah: chosen.surah, name: chosen.name, position: idx + 1 });
      cameFromMultiResult = true;
      // Hide multi UI but preserve results for back navigation
      container.classList.add('hidden');
      container.innerHTML = '';
      toggleJelajahiLanding(true);
      fetchJelajahi(null, { type: 'surah', surah: chosen.surah });
    });
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideMultiResults() {
  const container = document.getElementById('jelajahi-multi');
  container.classList.add('hidden');
  container.innerHTML = '';
  jelajahiMultiResults = null;
  toggleJelajahiLanding(true);
}

// ── Jelajahi Search Input ──────────────────────────────────────────────────

function initJelajahiSearch() {
  const input     = document.getElementById('jelajahi-input');
  const clearBtn  = document.getElementById('jelajahi-clear');
  const submitBtn = document.getElementById('jelajahi-submit');
  if (!input) return;

  const triggerSearch = () => {
    const val = input.value.trim();
    if (val.length >= 2) {
      logEvent('jelajahi_search', { query_length: val.length });
      lastJuzSurahTapped = null;
      cameFromMultiResult = false;
      jelajahiMultiResults = null;
      fetchJelajahi(val, null);
    }
  };

  input.addEventListener('input', () => {
    const len = input.value.length;
    clearBtn.classList.toggle('hidden', len === 0);
    submitBtn.classList.toggle('hidden', len < 2);
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

// ── Jelajahi API Call ────────────────────────────────────────────────────────

async function fetchJelajahi(queryText, presetIntent) {
  currentMode = 'jelajahi';
  currentFeeling = queryText || (presetIntent ? `Surah ${SURAH_META[(presetIntent.surah || 1) - 1].name}` : '');
  currentSearchCtx = { method: presetIntent ? 'jelajahi_preset' : 'jelajahi_search' };

  switchView('verses-view');
  showLoading();

  try {
    const body = { mode: 'jelajahi' };
    if (presetIntent) {
      body.intent = presetIntent;
    } else {
      body.feeling = queryText;
    }

    const res = await fetch('/api/get-ayat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan');

    // Handle surah_list response (e.g. juz query from typed input)
    if (data.type === 'surah_list') {
      switchView('jelajahi-view');
      // Render inline surah list similar to juz amma
      showJuzSurahList();
      return;
    }

    // Handle multi-result response (user picks from 2-3 suggestions)
    if (data.type === 'multi' && Array.isArray(data.results)) {
      stopLoadingSteps();
      switchView('jelajahi-view');
      showMultiResults(data.results);
      return;
    }

    if (data.not_relevant) {
      showNotRelevant(data.message || 'Tidak ditemukan ayat yang cocok.');
      return;
    }

    // Normalize verse data from API
    const verses = (data.ayat || data.verses || []).map(v => ({
      id:                    v.id || `${v.surah_number || v.surah}:${v.verse_number || v.ayah}`,
      ref:                   v.ref || `QS. ${SURAH_META[(v.surah_number || v.surah || 1) - 1].name} : ${v.verse_number || v.ayah}`,
      surah_name:            v.surah_name || SURAH_META[(v.surah_number || v.surah || 1) - 1].name,
      surah_number:          v.surah_number || v.surah,
      verse_number:          v.verse_number || v.ayah,
      arabic:                v.arabic || v.text_arabic,
      translation:           v.translation || v.text_indonesian,
      tafsir_quraish_shihab: v.tafsir_quraish_shihab || null,
      tafsir_summary:        v.tafsir_summary || null,
      tafsir_kemenag:        v.tafsir_kemenag || null,
      tafsir_ibnu_kathir:    v.tafsir_ibnu_kathir || null,
      tafsir_ibnu_kathir_id: v.tafsir_ibnu_kathir_id || null,
      asbabun_nuzul:         v.asbabun_nuzul || null,
      asbabun_nuzul_id:      v.asbabun_nuzul_id || null,
    }));

    if (verses.length === 0) throw new Error('Tidak ditemukan ayat.');

    // Store surah info — prefer SURAH_META (has all fields) over API surah_info
    const firstSurah = verses[0].surah_number;
    jelajahiSurahInfo = SURAH_META[firstSurah - 1] || data.surah_info || null;

    renderJelajahiVerses(verses);

  } catch (err) {
    stopLoadingSteps();
    showError(err.message || 'Terjadi kesalahan. Silakan coba lagi.');
  }
}

// ── Jelajahi Verse Rendering ────────────────────────────────────────────────

function renderJelajahiVerses(verses) {
  jelajahiAllVerses  = verses;
  jelajahiLoadedUpTo = 0;
  currentAyat        = verses;
  stopLoadingSteps();

  const carousel = document.getElementById('verses-carousel');
  carousel.innerHTML = '';

  // Strip Bismillah from verse 1 (it lives on the intro card instead)
  const surahNum = verses[0] ? (verses[0].surah_number || 0) : 0;
  if (verses.length > 0 && verses[0].verse_number === 1) {
    verses[0].arabic = stripBismillah(verses[0].arabic, surahNum);
  }

  // Total includes intro + all verses (even if lazy loaded later)
  totalVerseCards  = verses.length + 1;
  currentCardIndex = 0;

  // ── A: Build intro slide (static surah info) ────────────────────────────
  const introSlide = document.createElement('div');
  introSlide.className = 'verse-slide verse-slide-intro';

  const info = jelajahiSurahInfo;
  const totalVersesDisplay = info ? info.verses : verses.length;
  const surahLabel = info
    ? `Surah ke-${info.number}`
    : '';
  const typeLabel = info ? info.type : '';
  const showBismillah = shouldShowBismillah(surahNum);

  introSlide.innerHTML = `
    <div class="jelajahi-intro">
      <span class="ji-emoji">📜</span>
      ${info ? `<h2 class="ji-name">${escapeHtml(info.name)}</h2>` : ''}
      ${info && info.name_arabic ? `<p class="ji-arabic-name">${escapeHtml(info.name_arabic)}</p>` : ''}
      ${surahLabel ? `<p class="ji-meta">${surahLabel}</p>` : ''}
      <p class="ji-meta">${totalVersesDisplay} Ayat${typeLabel ? ` · ${typeLabel}` : ''}</p>
      ${showBismillah ? `<p class="ji-bismillah">${BISMILLAH_AR}</p>` : ''}
      <div class="swipe-hint-pill ji-hint-pill">Geser untuk mulai baca <span class="swipe-hint-arrow">→</span></div>
    </div>
  `;
  carousel.appendChild(introSlide);

  // ── B: Build first batch of verse slides ──────────────────────────────
  loadNextJelajahiBatch();

  // ── C: Pagination dots or progress bar ────────────────────────────────
  renderDots();
  updateCounter();

  // ── D: Scroll listener ────────────────────────────────────────────────
  carousel.addEventListener('scroll', onCarouselScroll, { passive: true });

  // ── E: Hide actions/feedback until last card ────────────────────────────
  document.getElementById('verse-actions').classList.add('hidden');
  document.getElementById('verse-feedback').classList.add('hidden');

  // ── F: Start swipe hint sequence ──────────────────────────────────────
  startSwipeHintSequence();
}

function loadNextJelajahiBatch() {
  const carousel = document.getElementById('verses-carousel');
  const end = Math.min(jelajahiLoadedUpTo + JELAJAHI_BATCH_SIZE, jelajahiAllVerses.length);

  for (let i = jelajahiLoadedUpTo; i < end; i++) {
    const slide = document.createElement('div');
    slide.className = 'verse-slide';
    const card = buildVerseCard(jelajahiAllVerses[i], i);
    card.classList.add('card-visible');
    slide.appendChild(card);
    carousel.appendChild(slide);
  }

  jelajahiLoadedUpTo = end;

  // Update dots if new slides added (for short surahs with dots)
  if (!useProgressBar()) {
    // Dots were already rendered for all totalVerseCards, no update needed
  }
}
