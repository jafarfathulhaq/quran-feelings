'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// init.js — App initialization, event listeners, service worker (loaded LAST)
// Depends on: ALL other js files must be loaded before this one
// ══════════════════════════════════════════════════════════════════════════════

// ── Init ──────────────────────────────────────────────────────────────────────

// Verses-view back button → return to mode parent (or expanded card / juz list)
document.getElementById('back-btn').addEventListener('click', () => {
  if (currentMode === 'jelajahi') {
    if (cameFromMultiResult && jelajahiMultiResults) {
      // Go back to multi-result selection
      cameFromMultiResult = false;
      switchView('jelajahi-view');
      setTimeout(() => showMultiResults(jelajahiMultiResults), 50);
    } else if (lastJuzSurahTapped) {
      // Go back to juz surah list
      switchView('jelajahi-view');
      setTimeout(() => showJuzSurahList(), 50);
    } else {
      switchView('jelajahi-view');
    }
  } else if (currentMode === 'panduan' && expandedCardId) {
    const cardToExpand = expandedCardId;
    switchView('panduan-view');
    setTimeout(() => expandPanduanCard(cardToExpand), 50);
  } else if (currentMode === 'ajarkan') {
    switchView('ajarkan-view');
  } else {
    switchView(currentMode === 'panduan' ? 'panduan-view' : 'selection-view');
  }
});

// Curhat back → landing
document.getElementById('curhat-back-btn').addEventListener('click', () => switchView('landing-view'));

// Panduan back → landing (or collapse expanded card)
document.getElementById('panduan-back-btn').addEventListener('click', () => {
  if (expandedCardId) {
    collapsePanduanCard();
  } else {
    switchView('landing-view');
  }
});

// Ajarkan back → landing (or collapse expanded category)
document.getElementById('ajarkan-back-btn').addEventListener('click', () => {
  if (ajarkanExpandedCatId) {
    collapseAjarkanCategory();
  } else {
    switchView('landing-view');
  }
});

// Jelajahi back → landing (or close juz surah list / multi results)
document.getElementById('jelajahi-back-btn').addEventListener('click', () => {
  if (juzSurahListVisible) {
    hideJuzSurahList();
  } else if (document.getElementById('jelajahi-multi') && !document.getElementById('jelajahi-multi').classList.contains('hidden')) {
    hideMultiResults();
  } else {
    switchView('landing-view');
  }
});

// Verse carousel arrow buttons
document.getElementById('verse-prev').addEventListener('click', () => {
  if (currentCardIndex > 0) scrollCarouselTo(currentCardIndex - 1);
});
document.getElementById('verse-next').addEventListener('click', () => {
  if (currentCardIndex < totalVerseCards - 1) scrollCarouselTo(currentCardIndex + 1);
});

// ── Share Sheet Event Listeners ────────────────────────────────────────────────

// Close sheet on overlay tap
document.getElementById('share-overlay').addEventListener('click', closeShareSheet);

// Close sheet on X button
document.getElementById('share-sheet-close').addEventListener('click', closeShareSheet);

// Swipe-down to dismiss share sheet
{
  const sheet = document.getElementById('share-sheet');
  let startY = 0, currentY = 0, isDragging = false;

  sheet.addEventListener('touchstart', e => {
    // Only start drag if at scroll top (so inner scroll still works)
    if (sheet.scrollTop > 0) return;
    startY = e.touches[0].clientY;
    currentY = startY;
    isDragging = true;
    sheet.style.transition = 'none';
  }, { passive: true });

  sheet.addEventListener('touchmove', e => {
    if (!isDragging) return;
    currentY = e.touches[0].clientY;
    const dy = currentY - startY;
    if (dy > 0) {
      // Dragging down — prevent pull-to-refresh and translate sheet
      e.preventDefault();
      sheet.style.transform = `translateY(${dy}px)`;
    } else {
      // Dragging up — allow normal scroll, cancel drag
      isDragging = false;
      sheet.style.transition = '';
      sheet.style.transform = '';
    }
  }, { passive: false });

  sheet.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    const dy = currentY - startY;
    sheet.style.transition = '';
    if (dy > 80) {
      // Dragged far enough → close
      closeShareSheet();
    } else {
      // Snap back
      sheet.style.transform = '';
    }
  });
}

// Panel A — Mode select buttons
document.getElementById('shareModeImg').addEventListener('click', showSharePanelImage);
document.getElementById('shareModeWA').addEventListener('click', showSharePanelText);

// Panel B-Image — Back button
document.getElementById('shareBackImgBtn').addEventListener('click', showSharePanelA);

// Panel B-Text — Back button
document.getElementById('shareBackTxtBtn').addEventListener('click', showSharePanelA);

// Panel B-Text — Share text via native share picker
document.getElementById('shareSendWA').addEventListener('click', shareTextNative);

// Panel B-Text — Copy text
document.getElementById('shareCopyText').addEventListener('click', copyShareText);

// Theme picker (inside Panel B-Image)
document.getElementById('share-theme-picker').addEventListener('click', e => {
  const pill = e.target.closest('.theme-pill');
  if (!pill) return;
  shareTheme = pill.dataset.theme;
  document.querySelectorAll('.theme-pill').forEach(p => p.classList.toggle('active', p === pill));
  logEvent('share_theme_selected', { theme: shareTheme });
  updateSharePreview();
});

// Content toggles (inside Panel B-Image)
document.getElementById('share-include-question').addEventListener('change', e => {
  shareIncludeQuestion = e.target.checked;
  updateSharePreview();
});
// Platform buttons (inside Panel B-Image)
document.querySelectorAll('.share-platform-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const platform = btn.dataset.platform;
    shareLastPlatform = platform;

    // Update preview aspect ratio
    const preview = document.getElementById('share-preview');
    if (platform === 'ig_story' || platform === 'wa_status') {
      preview.classList.add('ratio-story');
    } else {
      preview.classList.remove('ratio-story');
    }
    updateSharePreview();

    shareToPlatform(platform);
  });
});

initLandingCarousel();
renderEmotionCards();
renderPanduanCards();
renderSurahBrowser();
initSearch();
initPanduanSearch();
initJelajahiSearch();
renderAjarkanView();
initDailyCard();
initA2HS();
initAbout();

// ── Pre-warm top emotion cards in background ─────────────────────────────────
// Silently fetches results for the 3 most-used emotion shortcuts so that
// the first tap delivers an instant cache-hit instead of a 6-12 s wait.
(function preWarmEmotionCards() {
  const TOP_EMOTIONS = ['sad', 'anxious', 'hopeless'];  // highest-traffic cards
  const PRE_WARM_DELAY = 3000;  // wait 3 s after page load

  setTimeout(async () => {
    for (const eid of TOP_EMOTIONS) {
      const emo = emotions.find(e => e.id === eid);
      if (!emo) continue;

      const normKey = _cacheNormalise('curhat', emo.feeling);
      const hashedKey = await _hashKey(normKey);

      // Skip if already cached
      if (getClientCache(hashedKey)) continue;

      try {
        const res = await fetch('/api/get-ayat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feeling: emo.feeling, mode: 'curhat' }),
        });
        if (!res.ok) continue;
        const data = await res.json();
        if (!data.not_relevant && data.ayat) {
          setClientCache(hashedKey, data);
        }
      } catch { /* silent — pre-warm is best-effort */ }
    }
  }, PRE_WARM_DELAY);
})();

// ── Service Worker ─────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// ── PWA Session Tracking ──────────────────────────────────────────────────────
if (window.matchMedia('(display-mode: standalone)').matches) {
  logEvent('pwa_session_start', { source: 'homescreen' });
}

// ── Notification Open Tracking ────────────────────────────────────────────────
(function trackPushOpen() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('ref') === 'push') {
    logEvent('push_opened', {
      type: params.get('type') || 'unknown',
      day: params.get('day') || 'unknown',
    });
    history.replaceState(null, '', window.location.pathname);

    const mode = params.get('mode');
    if (mode && typeof selectMode === 'function') {
      selectMode(mode);
    }
  }
})();

// ── Silent re-subscribe if permission granted but subscription lost ──────────
resubscribeIfNeeded();

// ── Push Permission Triggers ──────────────────────────────────────────────────

// Path 1 — Android: ask immediately after install
window.addEventListener('appinstalled', () => {
  setTimeout(() => requestPushPermission('post_install'), 2000);
});

// Path 2 — iOS standalone: ask on next launch
if (window.matchMedia('(display-mode: standalone)').matches) {
  setTimeout(() => requestPushPermission('post_install'), 3000);
}

// Path 3 — Regular mobile browser: ask after 60 cumulative seconds
if (!window.matchMedia('(display-mode: standalone)').matches) {
  const THRESHOLD_SECONDS = 20;
  let _engagementTimer = null;
  let _prompted = false;

  function _checkTimeGate() {
    if (_prompted) return;
    const spent = parseInt(localStorage.getItem('tq_time_spent') || '0', 10);
    if (spent >= THRESHOLD_SECONDS) {
      _prompted = true;
      _stopTimer();
      requestPushPermission();
    }
  }

  function _startTimer() {
    if (_engagementTimer) return;
    _engagementTimer = setInterval(() => {
      const current = parseInt(localStorage.getItem('tq_time_spent') || '0', 10);
      localStorage.setItem('tq_time_spent', (current + 1).toString());
      _checkTimeGate();
    }, 1000);
  }

  function _stopTimer() {
    clearInterval(_engagementTimer);
    _engagementTimer = null;
  }

  document.addEventListener('visibilitychange', () => {
    document.hidden ? _stopTimer() : _startTimer();
  });

  _startTimer();
}
