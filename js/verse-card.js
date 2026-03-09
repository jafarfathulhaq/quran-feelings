'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// verse-card.js — Verse card building, carousel helpers, render & feedback
// Depends on: data.js, core.js
// ══════════════════════════════════════════════════════════════════════════════

// ── Verse Card ────────────────────────────────────────────────────────────────

function buildVerseCard(verse, index) {
  const card    = document.createElement('article');
  card.className = 'verse-card';

  // ── Build tafsir tabs (only include tabs that have content) ──────────────
  const tafsirTabs = [];
  if (verse.tafsir_quraish_shihab) tafsirTabs.push({ id: 'quraish', label: 'Quraish Shihab', text: verse.tafsir_quraish_shihab, note: 'Tafsir M. Quraish Shihab' });
  if (verse.tafsir_kemenag)     tafsirTabs.push({ id: 'kemenag', label: 'Kemenag RI',     text: verse.tafsir_kemenag,     note: 'Tafsir Kemenag RI' });
  if (verse.tafsir_ibnu_kathir_id || verse.tafsir_ibnu_kathir) {
    const ikIsId = !!verse.tafsir_ibnu_kathir_id;
    tafsirTabs.push({
      id:         'ik',
      label:      'Ibnu Kathir',
      text:       verse.tafsir_ibnu_kathir_id || verse.tafsir_ibnu_kathir,
      note:       ikIsId ? 'Ibnu Kathir · Bahasa Indonesia' : 'Ibnu Kathir · English',
      isMarkdown: ikIsId,
    });
  }

  // ── Build tafsir collapsible (fallback when no JSONB summary) ────────────
  const fallbackTafsirHtml = tafsirTabs.length > 0 ? `
    <button class="vc-tafsir-btn vc-tafsir-toggle">
      <span>${EXPAND_ICON} Baca Tafsir</span>
      <span class="vc-tafsir-btn-arrow">${EXPAND_ICON}</span>
    </button>
    <div class="vc-tafsir-panel hidden">
      <div class="vc-tafsir-tabs">
        ${tafsirTabs.map((t, i) =>
          `<button class="vc-tab-btn${i === 0 ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>`
        ).join('')}
      </div>
      ${tafsirTabs.map((t, i) => {
        const long    = t.text.length > 400;
        const content = t.isMarkdown
          ? `<div class="vc-tafsir-md">${renderMarkdown(t.text)}</div>`
          : `<p class="vc-tafsir-text">${escapeHtml(t.text)}</p>`;
        return `
        <div class="vc-tab-content${i === 0 ? '' : ' hidden'}" data-content="${t.id}">
          <div class="vc-tafsir-text-wrap${long ? '' : ' expanded'}">
            ${content}
          </div>
          ${long ? `<button class="vc-read-more-btn">${EXPAND_ICON} Baca Selengkapnya</button>` : ''}
          <p class="vc-tafsir-note">${t.note}</p>
        </div>`;
      }).join('')}
    </div>
  ` : '';

  // ── Build asbabun nuzul section (fallback) ────────────────────────────
  const asbabText = verse.asbabun_nuzul_id || verse.asbabun_nuzul;
  const asbabIsId = !!verse.asbabun_nuzul_id;
  const fallbackAsbabHtml = asbabText ? (() => {
    const long    = asbabText.length > 400;
    const content = asbabIsId
      ? `<div class="vc-tafsir-md">${renderMarkdown(asbabText)}</div>`
      : `<p class="vc-tafsir-text">${escapeHtml(asbabText)}</p>`;
    return `
    <button class="vc-tafsir-btn vc-asbab-toggle">
      <span>${EXPAND_ICON} Kenapa Ayat Ini Diturunkan?</span>
      <span class="vc-tafsir-btn-arrow">${EXPAND_ICON}</span>
    </button>
    <div class="vc-asbab-panel hidden">
      <div class="vc-asbab-body">
        <div class="vc-tafsir-text-wrap${long ? '' : ' expanded'}">
          ${content}
        </div>
        ${long ? `<button class="vc-read-more-btn">${EXPAND_ICON} Baca Selengkapnya</button>` : ''}
        <p class="vc-tafsir-note">${asbabIsId ? 'Asbabun Nuzul · Al-Wahidi · Bahasa Indonesia' : 'Asbabun Nuzul · Al-Wahidi · English'}</p>
      </div>
    </div>
  `;
  })() : '';

  // ── Tafsir Summary teaser (replaces collapsibles when JSONB exists) ────
  const summaryData = verse.tafsir_summary; // JSONB from pre-generated AI summaries
  const CHEVRON_RIGHT = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>`;
  let teaserHtml = '';
  let cardCount  = 0;

  if (summaryData && typeof summaryData === 'object' && summaryData.makna_utama) {
    cardCount = [summaryData.makna_utama, summaryData.hidup_kita,
      summaryData.konteks_turun, summaryData.penjelasan_penting].filter(Boolean).length;
    const previewText = summaryData.makna_utama.text || '';
    teaserHtml = `
      <div class="tafsir-cta-link" data-verse-id="${verse.id}">
        <span class="tafsir-cta-icon">📖</span>
        <span class="tafsir-cta-text">Pahami ayat ini lebih dalam</span>
        ${CHEVRON_RIGHT}
      </div>`;
  }

  // Use teaser if available, otherwise fall back to collapsibles
  const tafsirSectionHtml = teaserHtml
    ? teaserHtml
    : (fallbackTafsirHtml + fallbackAsbabHtml);

  const perVerseText = verse.relevance || verse.resonance || '';
  const perVerseClass = verse.relevance ? 'vc-relevance' : 'vc-resonance';
  const resonanceHtml = perVerseText
    ? `<div class="${perVerseClass}">${escapeHtml(perVerseText)}</div>`
    : '';

  // Surah number for the circle badge
  const surahNum = verse.surah_number || verse.id.split(':')[0];

  card.innerHTML = `
    <div class="vc-arabic-section">
      <div class="vc-ref-row">
        <span class="vc-ref-label">${escapeHtml(verse.ref)}</span>
        <span class="vc-surah-number">${surahNum}</span>
      </div>
      <p class="vc-arabic-text">${escapeHtml(verse.arabic)}</p>
    </div>
    <div class="vc-content">
      <p class="vc-translation">"${escapeHtml(verse.translation)}"</p>
      ${resonanceHtml}
      ${tafsirSectionHtml}
      <div class="vc-action-row">
        <button class="vc-action-btn vc-audio-btn">${PLAY_ICON} Dengarkan</button>
        <button class="vc-action-btn vc-share-btn">Bagikan Ayat ${IG_ICON} ${WA_ICON}</button>
      </div>
    </div>
  `;

  card.querySelector('.vc-audio-btn').addEventListener('click', e => playAudio(verse, e.currentTarget));
  card.querySelector('.vc-share-btn').addEventListener('click', () => openShareSheet(verse));

  // ── Tafsir CTA click → open overlay ────────────────────────────────────
  const tafsirCta = card.querySelector('.tafsir-cta-link');
  if (tafsirCta) {
    tafsirCta.addEventListener('click', () => {
      openTafsirOverlay(verse);
      logEvent('tafsir_summary_opened', {
        mode: currentMode, surah: verse.surah_name,
        ayah: verse.verse_number, card_count: cardCount,
      });
    });
  }

  // ── Tafsir accordion toggle (fallback only) ────────────────────────────
  const tafsirToggle = card.querySelector('.vc-tafsir-toggle');
  if (tafsirToggle) {
    const panel = card.querySelector('.vc-tafsir-panel');

    tafsirToggle.addEventListener('click', () => {
      const isOpen = !panel.classList.contains('hidden');
      panel.classList.toggle('hidden', isOpen);
      tafsirToggle.classList.toggle('open', !isOpen);
      tafsirToggle.innerHTML = isOpen
        ? `<span>${EXPAND_ICON} Baca Tafsir</span><span class="vc-tafsir-btn-arrow">${EXPAND_ICON}</span>`
        : `<span>${COLLAPSE_ICON} Tutup Tafsir</span><span class="vc-tafsir-btn-arrow">${COLLAPSE_ICON}</span>`;
      logEvent('tafsir_opened', { surah_name: verse.surah_name, open: !isOpen });
    });

    // ── Tab switching ──────────────────────────────────────────────────────
    card.querySelectorAll('.vc-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        card.querySelectorAll('.vc-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        card.querySelectorAll('.vc-tab-content').forEach(c => c.classList.add('hidden'));
        card.querySelector(`.vc-tab-content[data-content="${btn.dataset.tab}"]`).classList.remove('hidden');
        logEvent('tafsir_tab', { surah_name: verse.surah_name, tab: btn.dataset.tab });
      });
    });

    // ── Baca Selengkapnya expand (tafsir panel only) ────────────────────────
    panel.querySelectorAll('.vc-read-more-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const wrap     = btn.previousElementSibling;
        const expanded = wrap.classList.toggle('expanded');
        btn.innerHTML  = expanded
          ? `${COLLAPSE_ICON} Sembunyikan`
          : `${EXPAND_ICON} Baca Selengkapnya`;
      });
    });
  }

  // ── Asbabun Nuzul accordion toggle ───────────────────────────────────────
  const asbabToggle = card.querySelector('.vc-asbab-toggle');
  if (asbabToggle) {
    const asbabPanel = card.querySelector('.vc-asbab-panel');

    asbabToggle.addEventListener('click', () => {
      const isOpen = !asbabPanel.classList.contains('hidden');
      asbabPanel.classList.toggle('hidden', isOpen);
      asbabToggle.classList.toggle('open', !isOpen);
      asbabToggle.innerHTML = isOpen
        ? `<span>${EXPAND_ICON} Kenapa Ayat Ini Diturunkan?</span><span class="vc-tafsir-btn-arrow">${EXPAND_ICON}</span>`
        : `<span>${COLLAPSE_ICON} Tutup Asbabun Nuzul</span><span class="vc-tafsir-btn-arrow">${COLLAPSE_ICON}</span>`;
      logEvent('asbabun_nuzul_opened', { surah_name: verse.surah_name, open: !isOpen });
    });

    // ── Baca Selengkapnya for asbabun nuzul ──────────────────────────────
    asbabPanel.querySelectorAll('.vc-read-more-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const wrap     = btn.previousElementSibling;
        const expanded = wrap.classList.toggle('expanded');
        btn.innerHTML  = expanded
          ? `${COLLAPSE_ICON} Sembunyikan`
          : `${EXPAND_ICON} Baca Selengkapnya`;
      });
    });
  }

  return card;
}

// ── Loading State ─────────────────────────────────────────────────────────────
// Dark-gradient chat header with user feeling bubble on the right
// and a typing-indicator app bubble on the left while the API call is in flight.

function showLoading() {
  typewriterActive = false;
  stopLoadingSteps();
  document.getElementById('verse-actions').classList.add('hidden');
  document.getElementById('verse-feedback').classList.add('hidden');

  // Reset carousel state
  currentCardIndex = 0;
  totalVerseCards  = 0;

  const carousel = document.getElementById('verses-carousel');

  if (currentMode === 'jelajahi' || currentMode === 'ajarkan') {
    // Centered spinner loading (no user chat bubble)
    const icon = currentMode === 'ajarkan' ? '🌙' : '📜';
    carousel.innerHTML = `
      <div class="verse-slide">
        <div class="jelajahi-loading">
          <span class="jl-icon">${icon}</span>
          <span class="ls-step-wrap"><span class="ls-step-text" id="loading-step-text"></span></span>
        </div>
      </div>
    `;
  } else {
    carousel.innerHTML = `
      <div class="verse-slide">
        <div class="intro-chat">
          <div class="chat-thread">
            <div class="chat-bubble chat-bubble--user">${escapeHtml(currentFeeling)}</div>
            <div class="chat-bubble chat-bubble--app chat-bubble--typing">
              <span class="ls-step-wrap"><span class="ls-step-text" id="loading-step-text"></span></span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  document.getElementById('verses-dots').innerHTML = '';
  document.getElementById('verse-counter-text').textContent = '';

  startLoadingSteps();
}

// ── Render Verses ─────────────────────────────────────────────────────────────
// Sequence: typewrite reflection → stagger verse cards in → reveal feedback

function renderVerses(data) {
  currentAyat = data.ayat;
  stopLoadingSteps();

  const carousel = document.getElementById('verses-carousel');
  carousel.innerHTML = '';

  // ── Carousel state ──────────────────────────────────────────────────────────
  totalVerseCards  = data.ayat.length + 1; // intro + verse slides
  currentCardIndex = 0;

  // ── A: Build intro slide (chat-bubble style) ───────────────────────────────
  const introSlide = document.createElement('div');
  introSlide.className = 'verse-slide';
  introSlide.innerHTML = `
    <div class="intro-chat">
      <div class="chat-thread">
        <div class="chat-bubble chat-bubble--user">${escapeHtml(currentFeeling)}</div>
        <div class="chat-bubble chat-bubble--app chat-bubble--typing-active">
          <span class="cb-text" id="intro-typewriter"></span>
        </div>
      </div>
      <div class="swipe-hint-pill" id="intro-swipe-hint" style="display:none;">Geser untuk menemukan ayat <span class="swipe-hint-arrow">→</span></div>
    </div>
  `;
  carousel.appendChild(introSlide);

  // ── B: Build verse slides ───────────────────────────────────────────────────
  data.ayat.forEach((verse, i) => {
    const slide = document.createElement('div');
    slide.className = 'verse-slide';
    const card = buildVerseCard(verse, i);
    card.classList.add('card-visible'); // no entrance animation in carousel
    slide.appendChild(card);
    carousel.appendChild(slide);
  });

  // ── C: Pagination dots ──────────────────────────────────────────────────────
  renderDots();
  updateCounter();

  // ── D: Typewriter on intro text ─────────────────────────────────────────────
  const reflection = data.explanation || data.reflection || '';
  const introTextEl = document.getElementById('intro-typewriter');
  typewriterActive = true;
  let pos = 0;

  function finishTypewriter() {
    const appBubble = introTextEl.closest('.chat-bubble--app');
    if (appBubble) appBubble.classList.remove('chat-bubble--typing-active');
    typewriterActive = false;
    const hint = document.getElementById('intro-swipe-hint');
    if (hint) hint.style.display = '';
    startSwipeHintSequence();
  }

  function tick() {
    if (!typewriterActive) return;
    pos = Math.min(pos + 3, reflection.length);
    introTextEl.textContent = reflection.slice(0, pos);
    if (pos < reflection.length) {
      setTimeout(tick, 15);
    } else {
      finishTypewriter();
    }
  }

  // Tap-to-complete: user taps intro card → show full reflection instantly
  if (introSlide) {
    introSlide.addEventListener('click', () => {
      if (typewriterActive && pos < reflection.length) {
        introTextEl.textContent = reflection;
        finishTypewriter();
      }
    }, { once: true });
  }

  if (reflection) {
    // Short reflections (< 80 chars): skip typewriter, use instant reveal
    if (reflection.length < 80) {
      introTextEl.textContent = reflection;
      introTextEl.style.opacity = '0';
      introTextEl.style.transition = 'opacity 0.4s ease';
      requestAnimationFrame(() => { introTextEl.style.opacity = '1'; });
      finishTypewriter();
    } else {
      tick();
    }
  } else {
    finishTypewriter();
  }

  // ── E: Scroll listener for carousel ─────────────────────────────────────────
  carousel.addEventListener('scroll', onCarouselScroll, { passive: true });

  // ── F: Hide actions/feedback until last card ────────────────────────────────
  document.getElementById('verse-actions').classList.add('hidden');
  document.getElementById('verse-feedback').classList.add('hidden');

}

// ── Swipe hint sequence (pill → peek → auto-advance) ─────────────────────────

function startSwipeHintSequence() {
  // Cancel any previous hint timers
  _swipeHintTimers.forEach(clearTimeout);
  _swipeHintTimers = [];

  const carousel = document.getElementById('verses-carousel');
  if (!carousel || totalVerseCards < 2) return;

  // 1. Peek nudge after 1s — reveal edge of next card
  _swipeHintTimers.push(setTimeout(() => {
    if (currentCardIndex !== 0) return;
    carousel.scrollTo({ left: 50, behavior: 'smooth' });
    setTimeout(() => {
      if (currentCardIndex === 0) carousel.scrollTo({ left: 0, behavior: 'smooth' });
    }, 600);
  }, 1000));

  // 2. Auto-advance to first verse after 3s
  _swipeHintTimers.push(setTimeout(() => {
    if (currentCardIndex !== 0) return;
    const slideWidth = carousel.offsetWidth;
    carousel.scrollTo({ left: slideWidth, behavior: 'smooth' });
  }, 3000));
}

function clearSwipeHints() {
  _swipeHintTimers.forEach(clearTimeout);
  _swipeHintTimers = [];
  document.querySelectorAll('.swipe-hint-pill').forEach(el => {
    el.classList.add('hint-faded');
  });
}

// ── Carousel Helpers ──────────────────────────────────────────────────────────

function onCarouselScroll() {
  const carousel   = document.getElementById('verses-carousel');
  const slideWidth = carousel.offsetWidth;
  if (slideWidth === 0) return;
  const newIndex = Math.round(carousel.scrollLeft / slideWidth);
  if (newIndex === currentCardIndex) return;

  currentCardIndex = newIndex;
  updateCounter();
  updateDots();
  updateProgressBar();

  // Clear swipe hints on first move away from intro
  if (newIndex > 0 && _swipeHintTimers.length > 0) clearSwipeHints();

  // Auto-pause audio when swiping away
  stopCurrentAudio();

  logEvent('verse_swiped', { slide_index: newIndex, total: totalVerseCards });

  // Jelajahi lazy loading — load more when within 3 slides of end
  if (currentMode === 'jelajahi' && jelajahiAllVerses.length > 0) {
    const nearEnd = currentCardIndex >= jelajahiLoadedUpTo - 3; // preload 3 slides early
    if (nearEnd && jelajahiLoadedUpTo < jelajahiAllVerses.length) {
      loadNextJelajahiBatch();
    }
  }

  // Show actions + feedback when reaching last card
  if (newIndex === totalVerseCards - 1) {
    showVerseActions();
  }
}

function showVerseActions() {
  const actionsEl  = document.getElementById('verse-actions');
  if (!actionsEl.classList.contains('hidden')) return; // already shown

  const parentView = currentMode === 'jelajahi' ? 'jelajahi-view'
    : currentMode === 'panduan' ? 'panduan-view'
    : currentMode === 'ajarkan' ? 'ajarkan-view' : 'selection-view';
  const moreLabel  = currentMode === 'jelajahi' ? 'Surah lain'
    : currentMode === 'panduan' ? 'Topik lain'
    : currentMode === 'ajarkan' ? 'Pertanyaan lain' : 'Perasaan lain';

  // Jelajahi & Ajarkan don't have "try other verses" (no AI / pre-generated), just back button
  if (currentMode === 'jelajahi' || currentMode === 'ajarkan') {
    actionsEl.innerHTML = `
      <button class="va-secondary" id="find-more-btn">${moreLabel}</button>
    `;
    actionsEl.classList.remove('hidden');
    document.getElementById('find-more-btn')
      .addEventListener('click', () => {
        if (currentMode === 'jelajahi' && lastJuzSurahTapped) {
          switchView('jelajahi-view');
          setTimeout(() => showJuzSurahList(), 50);
        } else {
          switchView(parentView);
        }
      });
  } else {
    actionsEl.innerHTML = `
      <button class="va-refresh" id="refresh-btn">↺ Coba ayat lain</button>
      <button class="va-secondary" id="find-more-btn">${moreLabel}</button>
    `;
    actionsEl.classList.remove('hidden');
    document.getElementById('refresh-btn')
      .addEventListener('click', () => fetchAyat(currentFeeling, { ...currentSearchCtx, refresh: true }));
    document.getElementById('find-more-btn')
      .addEventListener('click', () => switchView(parentView));
    renderFeedback();
  }
}

function updateCounter() {
  const el = document.getElementById('verse-counter-text');
  if (currentCardIndex === 0) {
    if (currentMode === 'jelajahi') {
      el.textContent = jelajahiSurahInfo ? jelajahiSurahInfo.name : 'Info Surah';
    } else if (currentMode === 'ajarkan') {
      el.textContent = 'Ajarkan Anakku';
    } else {
      el.textContent = currentMode === 'panduan' ? 'Penjelasan' : 'Refleksi';
    }
  } else {
    el.textContent = `${currentCardIndex} / ${totalVerseCards - 1}`;
  }

  // Disable arrows at edges
  const prevBtn = document.getElementById('verse-prev');
  const nextBtn = document.getElementById('verse-next');
  if (prevBtn) prevBtn.disabled = currentCardIndex === 0;
  if (nextBtn) nextBtn.disabled = currentCardIndex === totalVerseCards - 1;
}

function useProgressBar() {
  return currentMode === 'jelajahi' && totalVerseCards > 16; // > 15 verses + intro
}

function renderDots() {
  const dotsEl = document.getElementById('verses-dots');
  dotsEl.innerHTML = '';

  if (useProgressBar()) {
    dotsEl.innerHTML = `<div class="reading-progress"><div class="reading-progress-fill" id="reading-progress-fill"></div></div>`;
    updateProgressBar();
    return;
  }

  for (let i = 0; i < totalVerseCards; i++) {
    const dot = document.createElement('span');
    dot.className = 'verse-dot' + (i === 0 ? ' active' : '');
    dotsEl.appendChild(dot);
  }
}

function updateDots() {
  if (useProgressBar()) return; // handled by updateProgressBar
  const dots = document.querySelectorAll('#verses-dots .verse-dot');
  dots.forEach((d, i) => d.classList.toggle('active', i === currentCardIndex));
}

function updateProgressBar() {
  const fill = document.getElementById('reading-progress-fill');
  if (!fill) return;
  const pct = totalVerseCards > 1 ? (currentCardIndex / (totalVerseCards - 1)) * 100 : 0;
  fill.style.width = `${pct}%`;
}

// ── Feedback Section ──────────────────────────────────────────────────────────

function renderFeedback() {
  const feedbackEl = document.getElementById('verse-feedback');
  feedbackEl.innerHTML = `
    <p class="feedback-label">Bagaimana perasaanmu setelah membaca ini?</p>
    <div class="feedback-btns">
      <button class="feedback-btn" data-key="lebih_tenang">Lebih tenang</button>
      <button class="feedback-btn" data-key="sama_saja">Sama saja</button>
      <button class="feedback-btn" data-key="masih_sedih">Masih sedih</button>
    </div>
  `;
  feedbackEl.classList.remove('hidden');

  const FEEDBACK_COPY = {
    lebih_tenang: {
      icon:        '🤍',
      text:        'Alhamdulillah. Semoga ketenangan itu terus menyertaimu.',
      actionLabel: null,
    },
    sama_saja: {
      icon:        '✦',
      text:        'Tidak apa-apa. Kamu sudah melangkah dengan membaca. Pelan-pelan ya.',
      actionLabel: '← Cari ayat lain',
    },
    masih_sedih: {
      icon:        '🤍',
      text:        'Kesedihan itu manusiawi. Allah selalu mendengar, dan kamu tidak sendirian.',
      actionLabel: '← Cari ayat lain',
    },
  };

  feedbackEl.querySelectorAll('.feedback-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;

      const fbProps = {
        response:  key,
        verse_ids: currentAyat.map(v => v.id).join(','),
        method:    currentSearchCtx.method,
      };
      if (currentSearchCtx.emotionId) fbProps.emotion_id = currentSearchCtx.emotionId;
      logEvent('mood_feedback', fbProps);

      const { icon, text, actionLabel } = FEEDBACK_COPY[key] || FEEDBACK_COPY.sama_saja;
      feedbackEl.innerHTML = `
        <div class="feedback-thanks">
          <span class="feedback-thanks-icon">${icon}</span>
          <p class="feedback-thanks-text">${text}</p>
          ${actionLabel ? `<button class="feedback-try-again">${actionLabel}</button>` : ''}
        </div>
      `;
      if (actionLabel) {
        feedbackEl.querySelector('.feedback-try-again')
          .addEventListener('click', () => switchView(currentMode === 'panduan' ? 'panduan-view' : 'selection-view'));
      }
    });
  });
}
