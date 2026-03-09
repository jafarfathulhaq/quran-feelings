'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// daily-card.js — Daily Card / VOTD (5-slide rotating card)
// Depends on: data.js, core.js
// ══════════════════════════════════════════════════════════════════════════════

// ── Daily Card (5-Slide Rotating Card) ────────────────────────────────────────

let dailyActiveSlide         = 0;
let dailyRotateTimer         = null;
let dailyExpanded            = false;
let dailyCarouselOpen        = false;
let dailyVOTDData            = null;
let dailyContentData         = null;
let dailyModeLabels          = [];
let dailyHeaderRotateTimer   = null;
// DAILY_ROTATE_MS and DAILY_HEADER_ROTATE_MS constants are in data.js


async function initDailyCard() {
  const wrap = document.getElementById('dailyCardWrap');
  if (!wrap) return;

  const skeleton = document.getElementById('dailySkeleton');
  const header   = document.getElementById('dailyHeader');

  try {
    // Fetch both endpoints in parallel
    const [votdRes, dailyRes] = await Promise.allSettled([
      fetch('/api/verse-of-day'),
      fetch('/api/daily-content'),
    ]);

    // Parse VOTD
    if (votdRes.status === 'fulfilled' && votdRes.value.ok) {
      dailyVOTDData = await votdRes.value.json();
    }

    // Parse daily content
    if (dailyRes.status === 'fulfilled' && dailyRes.value.ok) {
      const d = await dailyRes.value.json();
      if (d && d.content_date) dailyContentData = d;
    }

    // If both fail → hide entire card
    if (!dailyVOTDData && !dailyContentData) {
      wrap.remove();
      return;
    }

    // Build mode labels for the rotating header text
    buildDailyModeLabels();

    // Render slides and date
    renderDailySlides();
    renderDailyDate();

    // Show Layer 1 header, hide skeleton
    skeleton.classList.add('hidden');
    header.classList.remove('hidden');

    // Wire interactions
    header.addEventListener('click', toggleDailyCarousel);
    wireDailyDots();
    wireDailySwipe();
    wireDailyVisibility();

    // Start header label rotation (Layer 1 only, carousel NOT open yet)
    startDailyHeaderRotation();
  } catch {
    wrap.remove();
  }
}

function buildDailyModeLabels() {
  const d = dailyContentData;
  const v = dailyVOTDData;
  const votdRef = v ? (v.ref || `QS. ${v.surah_name}: ${v.verse_number}`) : '';
  dailyModeLabels = [
    v ? `✦ Ayat Hari Ini: ${votdRef}` : '✦ Ayat Hari Ini',
    d && d.feeling_label ? `${d.feeling_emoji || '💭'} Perasaan Hari Ini: ${d.feeling_label}` : '✦ Perasaan Hari Ini',
    d && d.topic          ? `${d.topic_emoji || '🕯'} Panduan Hari Ini: ${d.topic}` : '✦ Panduan Hari Ini',
    d && d.surah_name     ? `📜 Surat Hari Ini: ${d.surah_name}` : '✦ Surat Hari Ini',
    d ? `${d.ajarkan_category_emoji || '👶'} Ajarkan Anakku Hari Ini` : '✦ Ajarkan Anakku Hari Ini',
  ];
}

function renderDailyDate() {
  const dateEl = document.getElementById('dailyHeaderDate');
  if (!dateEl) return;
  const today = new Date();
  dateEl.textContent = today.toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function renderDailySlides() {
  const slides = document.querySelectorAll('.daily-slide');
  const hasDaily = !!dailyContentData;

  // Slide 0 — VOTD
  if (dailyVOTDData) {
    const ref = dailyVOTDData.ref || `QS. ${dailyVOTDData.surah_name}: ${dailyVOTDData.verse_number}`;
    slides[0].innerHTML = `
      <span class="daily-teaser-mode">✦ Ayat Hari Ini</span>
      <div class="daily-teaser-title">${escapeHtml(ref)}</div>
      <div class="daily-teaser-preview">"${escapeHtml(dailyVOTDData.translation)}"</div>
      <span class="daily-teaser-cta">Baca Ayat Lengkap</span>
    `;
  } else {
    slides[0].innerHTML = `
      <span class="daily-teaser-mode">✦ Ayat Hari Ini</span>
      <div class="daily-teaser-title">Tidak tersedia</div>
      <div class="daily-teaser-preview">Ayat hari ini sedang tidak tersedia</div>
    `;
  }

  // Slide 1 — Curhat
  if (hasDaily && dailyContentData.feeling_label) {
    slides[1].innerHTML = `
      <span class="daily-teaser-mode">${dailyContentData.feeling_emoji || '💭'} Curhat</span>
      <div class="daily-teaser-title">Lagi ${escapeHtml(dailyContentData.feeling_label)}?</div>
      <div class="daily-teaser-preview">${dailyContentData.feeling_verse?.reflection ? escapeHtml(dailyContentData.feeling_verse.reflection) : 'Ada ayat yang cocok untukmu hari ini.'}</div>
      <span class="daily-teaser-cta">Temukan Detail Ayat Dan Refleksinya</span>
    `;
  } else {
    slides[1].innerHTML = `
      <span class="daily-teaser-mode">💭 Curhat</span>
      <div class="daily-teaser-title">Ceritakan perasaanmu</div>
      <div class="daily-teaser-preview">Temukan ayat yang sesuai dengan perasaanmu.</div>
      <span class="daily-teaser-cta">Temukan Detail Ayat Dan Refleksinya</span>
    `;
  }

  // Slide 2 — Panduan
  if (hasDaily && dailyContentData.topic) {
    slides[2].innerHTML = `
      <span class="daily-teaser-mode">${dailyContentData.topic_emoji || '🧭'} Panduan</span>
      <div class="daily-teaser-title">${escapeHtml(dailyContentData.topic)}</div>
      <div class="daily-teaser-preview">${dailyContentData.topic_verse?.reflection ? escapeHtml(dailyContentData.topic_verse.reflection) : 'Ada panduan dari Al-Quran untuk topik ini.'}</div>
      <span class="daily-teaser-cta">Baca Penjelasan</span>
    `;
  } else {
    slides[2].innerHTML = `
      <span class="daily-teaser-mode">🧭 Panduan</span>
      <div class="daily-teaser-title">Cari panduan hidup</div>
      <div class="daily-teaser-preview">Temukan jawaban dari Al-Quran untuk pertanyaanmu.</div>
      <span class="daily-teaser-cta">Baca Penjelasan</span>
    `;
  }

  // Slide 3 — Jelajahi
  if (hasDaily && dailyContentData.surah_name) {
    const typeLabel = dailyContentData.surah_type === 'Makkiyah' ? 'Makkiyah' : 'Madaniyah';
    slides[3].innerHTML = `
      <span class="daily-teaser-mode">📜 Jelajahi</span>
      <div class="daily-teaser-title">Surah ${escapeHtml(dailyContentData.surah_name)}</div>
      <div class="daily-teaser-preview">${escapeHtml(dailyContentData.surah_name_arabic)} · ${dailyContentData.surah_verse_count} ayat · ${typeLabel}</div>
      <span class="daily-teaser-cta">Baca Surah</span>
    `;
  } else {
    slides[3].innerHTML = `
      <span class="daily-teaser-mode">📜 Jelajahi</span>
      <div class="daily-teaser-title">Jelajahi Al-Qur'an</div>
      <div class="daily-teaser-preview">Baca dan pelajari surah pilihanmu.</div>
      <span class="daily-teaser-cta">Baca Surah</span>
    `;
  }

  // Slide 4 — Ajarkan
  if (hasDaily && dailyContentData.ajarkan_question_text) {
    slides[4].innerHTML = `
      <span class="daily-teaser-mode">${dailyContentData.ajarkan_category_emoji || '👶'} Ajarkan Anakku</span>
      <div class="daily-teaser-title">${escapeHtml(dailyContentData.ajarkan_question_text)}</div>
      <div class="daily-teaser-preview">${dailyContentData.ajarkan_category ? escapeHtml(dailyContentData.ajarkan_category) : 'Pertanyaan anak tentang Islam'}</div>
      <span class="daily-teaser-cta">Temukan Jawaban</span>
    `;
  } else {
    slides[4].innerHTML = `
      <span class="daily-teaser-mode">👶 Ajarkan Anakku</span>
      <div class="daily-teaser-title">Jawab pertanyaan si kecil</div>
      <div class="daily-teaser-preview">Bantu anak memahami Islam dengan bahasa mereka.</div>
      <span class="daily-teaser-cta">Temukan Jawaban</span>
    `;
  }

  // Wire click-to-expand on each slide
  slides.forEach((slide, i) => {
    slide.addEventListener('click', () => {
      logEvent('daily_card_expanded', { slide: i });
      expandDailyCard(i);
    });
  });
}

// ── Daily Card Rotation ──

function startDailyRotation() {
  if (dailyExpanded) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) return;

  stopDailyRotation();
  resetProgressBar();
  dailyRotateTimer = setInterval(() => {
    const totalSlides = 5;
    goToDailySlide((dailyActiveSlide + 1) % totalSlides);
  }, DAILY_ROTATE_MS);
}

function stopDailyRotation() {
  if (dailyRotateTimer) {
    clearInterval(dailyRotateTimer);
    dailyRotateTimer = null;
  }
}

// ── Layer 1 ↔ Layer 2 Toggle ──

function toggleDailyCarousel() {
  const header   = document.getElementById('dailyHeader');
  const carousel = document.getElementById('dailyCarousel');
  if (!header || !carousel) return;

  dailyCarouselOpen = !dailyCarouselOpen;

  if (dailyCarouselOpen) {
    header.classList.add('open');
    carousel.classList.add('open');
    stopDailyHeaderRotation();
    goToDailySlide(dailyActiveSlide);  // sync carousel to currently displayed label
  } else {
    header.classList.remove('open');
    carousel.classList.remove('open');
    stopDailyRotation();
    // Also collapse Layer 3 if open
    if (dailyExpanded) collapseDailyCard();
    startDailyHeaderRotation();
  }
}

// ── Header mode label rotation (Layer 1 closed state) ──

function startDailyHeaderRotation() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  stopDailyHeaderRotation();
  updateDailyHeaderMode(dailyActiveSlide);
  if (reducedMotion) return;
  dailyHeaderRotateTimer = setInterval(() => {
    dailyActiveSlide = (dailyActiveSlide + 1) % 5;
    updateDailyHeaderMode(dailyActiveSlide);
  }, DAILY_HEADER_ROTATE_MS);
}

function stopDailyHeaderRotation() {
  if (dailyHeaderRotateTimer) {
    clearInterval(dailyHeaderRotateTimer);
    dailyHeaderRotateTimer = null;
  }
}

function updateDailyHeaderMode(index) {
  const el = document.getElementById('dailyHeaderModeText');
  if (!el) return;
  const label = dailyModeLabels[index] || '';
  if (el.textContent === label) return;

  // First render — just show the text, no animation
  if (!el.textContent) {
    el.textContent = label;
    el.style.opacity = '1';
    el.style.transform = 'translateX(0)';
    return;
  }

  // Step 1: Slide out to left (animated)
  el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
  el.style.opacity = '0';
  el.style.transform = 'translateX(-30px)';

  setTimeout(() => {
    // Step 2: Jump to right position instantly (no transition)
    el.style.transition = 'none';
    el.style.opacity = '0';
    el.style.transform = 'translateX(30px)';
    el.textContent = label;

    // Step 3: Small timeout guarantees browser paints the start position
    // before we re-enable the transition (more reliable than rAF)
    setTimeout(() => {
      el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      el.style.opacity = '1';
      el.style.transform = 'translateX(0)';
    }, 20);
  }, 300);
}

function resetProgressBar() {
  const fill = document.getElementById('dailyProgressFill');
  if (!fill) return;
  fill.classList.add('reset');
  // Force reflow to restart animation
  void fill.offsetWidth;
  fill.classList.remove('reset');
}

function goToDailySlide(index) {
  dailyActiveSlide = index;
  const track = document.getElementById('dailySlidesTrack');
  if (track) track.style.transform = `translateX(-${index * 20}%)`;

  // Update dots
  document.querySelectorAll('.daily-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === index);
  });

  // Sync header mode label
  updateDailyHeaderMode(index);
}

function wireDailyDots() {
  const dots = document.querySelectorAll('.daily-dot');
  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      const idx = parseInt(dot.dataset.dot, 10);
      goToDailySlide(idx);
    });
  });
}

function wireDailySwipe() {
  const viewport = document.querySelector('.daily-slides-viewport');
  if (!viewport) return;

  let startX = 0;
  let startY = 0;
  let tracking = false;

  viewport.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });

  viewport.addEventListener('touchend', e => {
    if (!tracking) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    // Only act on horizontal swipes (not vertical scroll)
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;

    const totalSlides = 5;
    if (dx < 0 && dailyActiveSlide < totalSlides - 1) {
      goToDailySlide(dailyActiveSlide + 1);
      logEvent('daily_card_swiped', { direction: 'left', to: dailyActiveSlide });
    } else if (dx > 0 && dailyActiveSlide > 0) {
      goToDailySlide(dailyActiveSlide - 1);
      logEvent('daily_card_swiped', { direction: 'right', to: dailyActiveSlide });
    }
  }, { passive: true });
}

function wireDailyVisibility() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopDailyRotation();
      stopDailyHeaderRotation();
    } else if (!dailyExpanded) {
      if (!dailyCarouselOpen) {
        startDailyHeaderRotation();
      }
    }
  });
}

// ── Daily Card Expand / Collapse ──

function expandDailyCard(slideIndex) {
  dailyExpanded = true;
  stopDailyRotation();

  const body = document.getElementById('dailyExpandedBody');
  if (!body) return;

  // Remove rounded bottom corners from dots (carousel bottom)
  const dots = document.getElementById('dailyDots');
  if (dots) dots.style.borderRadius = '0';

  let content = '';
  const closeBtn = `<button class="daily-close-btn" data-daily-close>✕</button>`;

  switch (slideIndex) {
    case 0: // VOTD
      content = renderDailyVOTDExpanded(closeBtn);
      break;
    case 1: // Curhat
      content = renderDailyCurhatExpanded(closeBtn);
      break;
    case 2: // Panduan
      content = renderDailyPanduanExpanded(closeBtn);
      break;
    case 3: // Jelajahi
      content = renderDailyJelajahiExpanded(closeBtn);
      break;
    case 4: // Ajarkan
      content = renderDailyAjarkanExpanded(closeBtn);
      break;
  }

  body.innerHTML = content;
  body.classList.remove('hidden');

  // Wire close button
  const closeBtnEl = body.querySelector('[data-daily-close]');
  if (closeBtnEl) closeBtnEl.addEventListener('click', collapseDailyCard);

  // Wire audio button if present
  const audioBtn = body.querySelector('.votd-audio-btn');
  if (audioBtn && dailyVOTDData) {
    audioBtn.addEventListener('click', e => playAudio(dailyVOTDData, e.currentTarget));
  }

  // Wire verse audio for curhat/panduan expanded
  const verseAudioBtn = body.querySelector('.daily-verse-audio-btn');
  if (verseAudioBtn) {
    const verseData = slideIndex === 1 ? dailyContentData?.feeling_verse : dailyContentData?.topic_verse;
    if (verseData) {
      verseAudioBtn.addEventListener('click', e => playAudio(verseData, e.currentTarget));
    }
  }

  // Wire CTA
  const ctaBtn = body.querySelector('.daily-cta-btn');
  if (ctaBtn) {
    ctaBtn.addEventListener('click', () => {
      logEvent('daily_card_cta_tapped', { slide: slideIndex });
      handleDailyCTA(slideIndex);
    });
  }

  // Scroll into view
  body.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function collapseDailyCard() {
  dailyExpanded = false;
  const body = document.getElementById('dailyExpandedBody');
  if (body) {
    body.classList.add('hidden');
    body.innerHTML = '';
  }
  // Restore dots bottom radius
  const dots = document.getElementById('dailyDots');
  if (dots) dots.style.borderRadius = '';

  // No auto-rotation — user swipes manually
}

function renderDailyVOTDExpanded(closeBtn) {
  if (!dailyVOTDData) return `<div class="daily-expanded-header"><span class="daily-expanded-title">Ayat Hari Ini</span>${closeBtn}</div><p style="color:rgba(255,255,255,0.6)">Tidak tersedia</p>`;

  const ref = dailyVOTDData.ref || `QS. ${dailyVOTDData.surah_name}: ${dailyVOTDData.verse_number}`;
  return `
    <div class="daily-expanded-header">
      <span class="daily-expanded-title">✦ Ayat Hari Ini</span>
      ${closeBtn}
    </div>
    <p class="votd-arabic">${escapeHtml(dailyVOTDData.arabic)}</p>
    <p class="votd-translation">"${escapeHtml(dailyVOTDData.translation)}"</p>
    <p class="votd-ref">${escapeHtml(ref)}</p>
    <div class="votd-actions">
      <button class="vc-btn votd-audio-btn">${PLAY_ICON} Putar</button>
    </div>
  `;
}

function renderDailyCurhatExpanded(closeBtn) {
  const d = dailyContentData;
  if (!d || !d.feeling_verse) {
    return `
      <div class="daily-expanded-header"><span class="daily-expanded-title">${d?.feeling_emoji || '💭'} Curhat</span>${closeBtn}</div>
      <p style="color:rgba(255,255,255,0.6)">Konten belum tersedia hari ini.</p>
      <button class="daily-cta-btn">💭 Mulai Curhat</button>
    `;
  }
  const v = d.feeling_verse;
  const ref = v.ref || `QS. ${v.surah_name || ''}: ${v.verse_number || ''}`;
  return `
    <div class="daily-expanded-header">
      <span class="daily-expanded-title">${d.feeling_emoji || '💭'} Lagi ${escapeHtml(d.feeling_label)}?</span>
      ${closeBtn}
    </div>
    ${v.reflection ? `<div class="daily-reflection">${escapeHtml(v.reflection)}</div>` : ''}
    <p class="votd-arabic">${escapeHtml(v.arabic || '')}</p>
    <p class="votd-translation">"${escapeHtml(v.translation || '')}"</p>
    <p class="votd-ref">${escapeHtml(ref)}</p>
    <div class="votd-actions">
      <button class="vc-btn daily-verse-audio-btn">${PLAY_ICON} Putar</button>
    </div>
    <button class="daily-cta-btn">💭 Temukan Lebih Banyak</button>
  `;
}

function renderDailyPanduanExpanded(closeBtn) {
  const d = dailyContentData;
  if (!d || !d.topic_verse) {
    return `
      <div class="daily-expanded-header"><span class="daily-expanded-title">${d?.topic_emoji || '🧭'} Panduan</span>${closeBtn}</div>
      <p style="color:rgba(255,255,255,0.6)">Konten belum tersedia hari ini.</p>
      <button class="daily-cta-btn">🧭 Cari Panduan</button>
    `;
  }
  const v = d.topic_verse;
  const ref = v.ref || `QS. ${v.surah_name || ''}: ${v.verse_number || ''}`;
  return `
    <div class="daily-expanded-header">
      <span class="daily-expanded-title">${d.topic_emoji || '🧭'} ${escapeHtml(d.topic)}</span>
      ${closeBtn}
    </div>
    ${v.reflection ? `<div class="daily-reflection">${escapeHtml(v.reflection)}</div>` : ''}
    <p class="votd-arabic">${escapeHtml(v.arabic || '')}</p>
    <p class="votd-translation">"${escapeHtml(v.translation || '')}"</p>
    <p class="votd-ref">${escapeHtml(ref)}</p>
    <div class="votd-actions">
      <button class="vc-btn daily-verse-audio-btn">${PLAY_ICON} Putar</button>
    </div>
    <button class="daily-cta-btn">🧭 Temukan Lebih Banyak</button>
  `;
}

function renderDailyJelajahiExpanded(closeBtn) {
  const d = dailyContentData;
  if (!d || !d.surah_name) {
    return `
      <div class="daily-expanded-header"><span class="daily-expanded-title">📜 Jelajahi</span>${closeBtn}</div>
      <p style="color:rgba(255,255,255,0.6)">Konten belum tersedia hari ini.</p>
      <button class="daily-cta-btn">📜 Jelajahi Al-Qur'an</button>
    `;
  }
  const typeLabel = d.surah_type === 'Makkiyah' ? 'Makkiyah' : 'Madaniyah';
  return `
    <div class="daily-expanded-header">
      <span class="daily-expanded-title">📜 Surah Hari Ini</span>
      ${closeBtn}
    </div>
    <div class="daily-surah-info">
      <div class="daily-surah-arabic">${escapeHtml(d.surah_name_arabic)}</div>
      <div class="daily-surah-name">Surah ${escapeHtml(d.surah_name)}</div>
      <div class="daily-surah-meta">${d.surah_verse_count} ayat · ${typeLabel} · Surah ke-${d.surah_number}</div>
    </div>
    <button class="daily-cta-btn">📜 Buka Surah ${escapeHtml(d.surah_name)}</button>
  `;
}

function renderDailyAjarkanExpanded(closeBtn) {
  const d = dailyContentData;
  if (!d || !d.ajarkan_question_text) {
    return `
      <div class="daily-expanded-header"><span class="daily-expanded-title">👶 Ajarkan Anakku</span>${closeBtn}</div>
      <p style="color:rgba(255,255,255,0.6)">Konten belum tersedia hari ini.</p>
      <button class="daily-cta-btn">👶 Lihat Pertanyaan</button>
    `;
  }
  return `
    <div class="daily-expanded-header">
      <span class="daily-expanded-title">${d.ajarkan_category_emoji || '👶'} Ajarkan Anakku</span>
      ${closeBtn}
    </div>
    <div class="daily-ajarkan-category">${d.ajarkan_category_emoji || ''} ${escapeHtml(d.ajarkan_category || '')}</div>
    <div class="daily-ajarkan-question">${escapeHtml(d.ajarkan_question_text)}</div>
    <button class="daily-cta-btn">👶 Lihat Jawaban</button>
  `;
}

function handleDailyCTA(slideIndex) {
  collapseDailyCard();

  switch (slideIndex) {
    case 0: // VOTD — no deeper action, already expanded
      break;
    case 1: // Curhat — select mode and search with the daily feeling
      if (dailyContentData?.feeling) {
        selectMode('curhat');
        fetchAyat(dailyContentData.feeling, { method: 'text' });
      } else {
        selectMode('curhat');
      }
      break;
    case 2: // Panduan — select mode and search with the daily topic
      if (dailyContentData?.topic_query) {
        selectMode('panduan');
        fetchAyat(dailyContentData.topic_query, { method: 'text' });
      } else {
        selectMode('panduan');
      }
      break;
    case 3: // Jelajahi — load surah directly
      if (dailyContentData?.surah_number) {
        selectMode('jelajahi');
        loadSurahFromBrowser(dailyContentData.surah_number, 'daily_card');
      } else {
        selectMode('jelajahi');
      }
      break;
    case 4: // Ajarkan — load preset question (or route to age selection)
      if (dailyContentData?.ajarkan_question_id) {
        selectMode('ajarkan');
        if (!ajarkanAgeGroup) {
          // Store question ID so it auto-loads after age selection
          ajarkanCurrentQId = dailyContentData.ajarkan_question_id;
          // User will select age, then the normal flow picks up ajarkanCurrentQId
        } else {
          fetchAjarkanPreset(dailyContentData.ajarkan_question_id);
        }
      } else {
        selectMode('ajarkan');
      }
      break;
  }
}
