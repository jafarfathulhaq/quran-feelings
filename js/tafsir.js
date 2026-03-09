'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// tafsir.js — Tafsir overlay + About/FAQ overlay
// Depends on: data.js, core.js
// ══════════════════════════════════════════════════════════════════════════════

function formatTafsirSources(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return '';
  const names = sources.map(s => TAFSIR_SOURCE_NAMES[s] || s);
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];
}

let _tafsirOverlayVerse    = null; // verse currently shown in overlay
let _tafsirLastCardViewed  = 0;    // 0-based index of last card swiped to

function openTafsirOverlay(verse) {
  const overlay  = document.getElementById('tafsir-overlay');
  const summary  = verse.tafsir_summary;
  if (!overlay || !summary || !summary.makna_utama) return;

  _tafsirOverlayVerse   = verse;
  _tafsirLastCardViewed = 0;

  // ── Determine which cards exist ──────────────────────────────────────────
  const cardKeys = ['makna_utama', 'hidup_kita', 'konteks_turun', 'penjelasan_penting'];
  const cards = cardKeys.filter(k => summary[k] && summary[k].text);
  const totalCards = cards.length;

  // ── Build carousel slides ────────────────────────────────────────────────
  const slidesHtml = cards.map(key => {
    const card = summary[key];
    const sources = formatTafsirSources(card.sources);
    return `
      <div class="to-slide">
        <div class="to-card">
          <div class="to-label-wrap">
            <span class="to-label-line"></span>
            <span class="to-label">${TAFSIR_CARD_LABELS[key]}</span>
            <span class="to-label-line"></span>
          </div>
          <div class="to-text">${escapeHtml(card.text)}</div>
          <div class="to-source">Ringkasan berdasarkan: ${escapeHtml(sources)}</div>
        </div>
      </div>`;
  }).join('');

  // ── Build dots ───────────────────────────────────────────────────────────
  const dotsHtml = cards.map((_, i) =>
    `<div class="to-dot${i === 0 ? ' active' : ''}"></div>`
  ).join('');

  // ── Build full tafsir tabs ───────────────────────────────────────────────
  const fullTafsirSources = [];
  if (verse.tafsir_kemenag)        fullTafsirSources.push({ id: 'kemenag', label: 'Kemenag',        text: verse.tafsir_kemenag, isMarkdown: false });
  const ikText = verse.tafsir_ibnu_kathir_id || verse.tafsir_ibnu_kathir;
  if (ikText)                      fullTafsirSources.push({ id: 'ik',      label: 'Ibnu Katsir',    text: ikText, isMarkdown: true });
  const asbabFullText = verse.asbabun_nuzul_id || verse.asbabun_nuzul;
  if (asbabFullText)               fullTafsirSources.push({ id: 'asbab',   label: 'Asbabun Nuzul',  text: asbabFullText, isMarkdown: true });

  const fullTabsHtml = fullTafsirSources.length > 0 ? `
    <div class="to-full-section">
      <button class="to-full-btn" id="to-full-btn">
        Baca tafsir lengkap
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div class="to-full-content" id="to-full-content">
        ${fullTafsirSources.map((s, i) => `
          <div class="tfl-item">
            <button class="tfl-toggle" data-tfl-id="${s.id}">
              <span>${s.label}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            <div class="tfl-answer">
              <div class="tfl-body vc-tafsir-md">
                ${s.isMarkdown ? renderMarkdown(s.text) : '<p>' + escapeHtml(s.text).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>') + '</p>'}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>` : '';

  // ── Verse reference ──────────────────────────────────────────────────────
  const verseRef = `${verse.surah_name}: ${verse.verse_number}`;

  // ── Assemble overlay HTML ────────────────────────────────────────────────
  overlay.innerHTML = `
    <div class="to-header">
      <button class="to-back" id="to-back-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M15 18l-6-6 6-6"/></svg>
        Kembali
      </button>
      <span class="to-counter" id="to-counter">1 / ${totalCards}</span>
    </div>
    <div class="to-ref" id="to-ref">
      <button class="to-ref-toggle" id="to-ref-toggle">
        <span class="to-ref-text">${escapeHtml(verseRef)}</span>
        <svg class="to-ref-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div class="to-ref-expand" id="to-ref-expand">
        <div class="to-ref-card">
          <div class="to-ref-arabic-wrap">
            <p class="to-ref-arabic">${escapeHtml(verse.arabic)}</p>
          </div>
          <p class="to-ref-translation">"${escapeHtml(verse.translation)}"</p>
        </div>
      </div>
      <div class="to-ref-divider"></div>
    </div>
    <div class="to-carousel" id="to-carousel">${slidesHtml}</div>
    <div class="to-dots-section">
      <div class="to-dots" id="to-dots">${dotsHtml}</div>
      <div class="to-hint" id="to-hint">
        <span>Geser untuk lanjut</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
      </div>
    </div>
    ${fullTabsHtml}
  `;

  // ── Show overlay ─────────────────────────────────────────────────────────
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('tafsir-locked');
  history.pushState({ tafsirOverlay: true }, '');

  // ── Carousel scroll → update dots + counter ──────────────────────────────
  const carousel = document.getElementById('to-carousel');
  const dots     = document.getElementById('to-dots');
  const counter  = document.getElementById('to-counter');
  const hint     = document.getElementById('to-hint');
  let scrollTimer;

  carousel.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const idx = Math.round(carousel.scrollLeft / carousel.offsetWidth);
      _tafsirLastCardViewed = Math.max(_tafsirLastCardViewed, idx);
      // Update dots
      Array.from(dots.children).forEach((d, i) => d.classList.toggle('active', i === idx));
      // Update counter
      counter.textContent = `${idx + 1} / ${totalCards}`;
      // Hide hint after first swipe
      if (idx > 0 && hint) hint.classList.add('faded');
      // Log swipe
      if (idx > 0) {
        logEvent('tafsir_summary_swiped', {
          mode: currentMode, surah: verse.surah_name,
          ayah: verse.verse_number, to_card: idx + 1,
        });
      }
    }, 50);
  });

  // ── Back button ──────────────────────────────────────────────────────────
  document.getElementById('to-back-btn').addEventListener('click', () => {
    closeTafsirOverlay();
    // Go back in history to match the pushState
    if (history.state && history.state.tafsirOverlay) history.back();
  });

  // ── Verse ref expand/collapse ────────────────────────────────────────────
  const refToggle = document.getElementById('to-ref-toggle');
  const refExpand = document.getElementById('to-ref-expand');
  if (refToggle && refExpand) {
    refToggle.addEventListener('click', () => {
      const isOpen = refExpand.classList.toggle('open');
      refToggle.classList.toggle('open', isOpen);
    });
  }

  // ── Full tafsir expand/collapse ──────────────────────────────────────────
  const fullBtn     = document.getElementById('to-full-btn');
  const fullContent = document.getElementById('to-full-content');

  if (fullBtn && fullContent && fullTafsirSources.length > 0) {
    fullBtn.addEventListener('click', () => {
      const isExpanded = fullContent.classList.toggle('expanded');
      fullBtn.classList.toggle('expanded', isExpanded);
      if (isExpanded) {
        // Scroll the full-tafsir section into view so user can read it
        setTimeout(() => {
          const section = fullBtn.closest('.to-full-section');
          if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
        logEvent('tafsir_full_opened', {
          mode: currentMode, surah: verse.surah_name, ayah: verse.verse_number,
        });
      }
    });

    // Accordion toggles (single-open behavior)
    fullContent.querySelectorAll('.tfl-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const answer = btn.closest('.tfl-item').querySelector('.tfl-answer');
        const isOpen = btn.classList.contains('open');

        // Close all open items
        fullContent.querySelectorAll('.tfl-toggle.open').forEach(t => {
          t.classList.remove('open');
          t.closest('.tfl-item').querySelector('.tfl-answer').classList.remove('open');
        });

        // If clicked item wasn't open, open it
        if (!isOpen) {
          btn.classList.add('open');
          answer.classList.add('open');
        }

        logEvent('tafsir_full_tab_switched', { source: btn.dataset.tflId });
      });
    });
  }
}

function closeTafsirOverlay() {
  const overlay = document.getElementById('tafsir-overlay');
  if (!overlay) return;

  overlay.classList.remove('active');
  document.body.classList.remove('tafsir-locked');

  // Log close event
  if (_tafsirOverlayVerse) {
    logEvent('tafsir_overlay_closed', {
      mode: currentMode,
      surah: _tafsirOverlayVerse.surah_name,
      ayah: _tafsirOverlayVerse.verse_number,
      last_card_viewed: _tafsirLastCardViewed + 1,
    });
  }

  // Clear after transition
  setTimeout(() => {
    overlay.innerHTML = '';
    overlay.setAttribute('aria-hidden', 'true');
  }, 300);

  _tafsirOverlayVerse   = null;
  _tafsirLastCardViewed = 0;
}

// Close tafsir overlay on browser back button
window.addEventListener('popstate', () => {
  const tafsirOv = document.getElementById('tafsir-overlay');
  if (tafsirOv && tafsirOv.classList.contains('active')) {
    closeTafsirOverlay();
    return;
  }
  const aboutOv = document.getElementById('aboutOverlay');
  if (aboutOv && aboutOv.classList.contains('active')) {
    closeAbout();
  }
});

// ── About / FAQ Overlay ───────────────────────────────────────────────────────
function openAbout() {
  const overlay = document.getElementById('aboutOverlay');
  if (!overlay) return;
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('about-locked');
  history.pushState({ about: true }, '');
  logEvent('about_opened', {});
}

function closeAbout() {
  const overlay = document.getElementById('aboutOverlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('about-locked');
  // Collapse any open accordion item
  overlay.querySelectorAll('.ao-toggle.open').forEach(b => {
    b.classList.remove('open');
    b.nextElementSibling.classList.remove('open');
  });
}

function initAbout() {
  // Trigger button
  const trigger = document.getElementById('aboutTrigger');
  if (trigger) trigger.addEventListener('click', openAbout);

  // Back button
  const back = document.getElementById('aboutBack');
  if (back) back.addEventListener('click', closeAbout);

  // Accordion toggles (single-open behavior)
  document.querySelectorAll('#aboutOverlay .ao-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const answer = btn.nextElementSibling;
      const isOpen = btn.classList.contains('open');
      const faqKey = btn.getAttribute('data-faq');

      // Close all open items
      document.querySelectorAll('#aboutOverlay .ao-toggle.open').forEach(b => {
        b.classList.remove('open');
        b.nextElementSibling.classList.remove('open');
      });

      // Toggle the clicked item
      if (!isOpen) {
        btn.classList.add('open');
        answer.classList.add('open');
        if (faqKey) logEvent('about_faq_tapped', { item: faqKey });
      }
    });
  });

  // QRIS save button — blob download for reliable mobile support
  const qrisBtn = document.getElementById('qrisSaveBtn');
  if (qrisBtn) {
    qrisBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const resp = await fetch('qris.png');
        const blob = await resp.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = 'QRIS-TemuQuran.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch {
        // Fallback: open image in new tab
        window.open('qris.png', '_blank');
      }
      logEvent('qris_saved');
    });
  }
}
