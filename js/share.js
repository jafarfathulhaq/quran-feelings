'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// share.js — Share feature (image + text), share sheet, panels
// Depends on: data.js, core.js
// ══════════════════════════════════════════════════════════════════════════════

// ── Share Sheet ────────────────────────────────────────────────────────────────


// Build the off-screen share image HTML element
function buildShareElement(verse, options) {
  const { theme, width, height, includeQuestion, compact } = options;
  const el = document.createElement('div');
  el.className = `si-wrap si-theme-${theme}`;
  el.style.width  = width + 'px';
  el.style.height = height + 'px';
  el.style.position = 'absolute';
  el.style.left = '-9999px';
  if (compact) el.style.padding = '6% 12%';

  // Build content — branding header at top, then verse content centered
  let html = '';

  // Branding header (top) — smaller in compact/square mode
  html += `
    <div class="si-header" style="${compact ? 'margin-bottom:16px;' : ''}">
      <span class="si-header-brand" style="${compact ? 'font-size:18px;' : ''}">TemuQuran.com</span>
      <span class="si-header-sub" style="${compact ? 'font-size:10px;' : ''}">Temukan Jawaban Dalam Al-Qur'an</span>
      <div class="si-header-divider" style="${compact ? 'margin-top:10px;' : ''}"></div>
    </div>
  `;

  // Optional user feeling/question — truncate in compact mode
  if (includeQuestion && verse._userQuestion) {
    let qText = verse._userQuestion;
    if (compact && qText.length > 60) qText = qText.slice(0, 60) + '...';
    const qStyle = compact ? 'font-size:13px;margin-bottom:14px;' : '';
    html += `<p class="si-question" style="${qStyle}">"${escapeHtml(qText)}"</p>`;
  }

  // Arabic text — smaller in compact mode
  const arabicStyle = compact ? 'font-size:24px;line-height:1.9;margin-bottom:14px;' : '';
  html += `<p class="si-arabic" style="${arabicStyle}">${escapeHtml(verse.arabic)}</p>`;

  // Translation — smaller in compact mode
  const transStyle = compact ? 'font-size:12px;line-height:1.7;margin-bottom:10px;' : '';
  html += `<p class="si-translation" style="${transStyle}">"${escapeHtml(verse.translation)}"</p>`;

  // Surah reference
  const refStyle = compact ? 'font-size:10px;padding:4px 12px;' : '';
  html += `<span class="si-ref" style="${refStyle}">${escapeHtml(verse.ref)}</span>`;

  el.innerHTML = html;
  return el;
}

// Get dimensions for a platform
function getShareDimensions(platform) {
  if (platform === 'ig_story' || platform === 'wa_status') {
    return { width: 1080, height: 1920 }; // 9:16
  }
  return { width: 1080, height: 1080 }; // 1:1
}

// Generate the share image blob
async function generateShareImage(verse, platform) {
  await loadHtml2Canvas();

  const dims    = getShareDimensions(platform);
  const isSquare = dims.width === dims.height;
  const el = buildShareElement(verse, {
    theme:           shareTheme,
    width:           dims.width / 2, // render at half-size, html2canvas scale: 2 → full res
    height:          dims.height / 2,
    includeQuestion: shareIncludeQuestion,
    compact:         isSquare,
  });

  const container = document.getElementById('share-render');
  container.appendChild(el);

  // Ensure fonts loaded
  await document.fonts.load('400 34px Amiri');
  await document.fonts.ready;

  const canvas = await html2canvas(el, {
    scale:           2,
    useCORS:         true,
    backgroundColor: SHARE_THEME_BG[shareTheme],
    logging:         false,
  });

  container.removeChild(el);

  return new Promise((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png')
  );
}

// Open the share bottom sheet — now shows Panel A (mode select) first
function openShareSheet(verse) {
  shareActiveVerse = verse;

  // Attach user question from current feeling text (for curhat/panduan modes)
  if (currentMode !== 'jelajahi' && currentFeeling) {
    verse._userQuestion = currentFeeling;
  }

  logEvent('share_sheet_opened', { mode: currentMode, card_index: currentCardIndex });

  const overlay = document.getElementById('share-overlay');
  const sheet   = document.getElementById('share-sheet');

  // Show Panel A, hide B-Image and B-Text
  showSharePanelA();

  // Show sheet
  overlay.classList.remove('hidden');
  sheet.classList.remove('hidden');
  requestAnimationFrame(() => {
    overlay.classList.add('visible');
    sheet.classList.add('visible');
  });
}

// Close the share bottom sheet
function closeShareSheet() {
  const overlay = document.getElementById('share-overlay');
  const sheet   = document.getElementById('share-sheet');

  sheet.style.transition = '';
  sheet.style.transform = '';
  overlay.classList.remove('visible');
  sheet.classList.remove('visible');

  setTimeout(() => {
    overlay.classList.add('hidden');
    sheet.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    sheet.setAttribute('aria-hidden', 'true');
  }, 300);

  shareActiveVerse = null;
}

// ── Share Panel Switching ───────────────────────────────────────────────────
function showSharePanelA() {
  document.getElementById('sharePanelA').style.display = '';
  document.getElementById('sharePanelImage').style.display = 'none';
  document.getElementById('sharePanelText').style.display = 'none';
}

function showSharePanelImage() {
  document.getElementById('sharePanelA').style.display = 'none';
  document.getElementById('sharePanelImage').style.display = '';
  document.getElementById('sharePanelText').style.display = 'none';

  logEvent('share_mode_selected', { mode: 'image' });

  // Reset image share state
  const qToggle = document.getElementById('share-toggle-question');
  if (currentMode === 'jelajahi' || currentMode === 'ajarkan' || !currentFeeling) {
    qToggle.style.display = 'none';
  } else {
    qToggle.style.display = '';
  }
  document.getElementById('share-include-question').checked = false;
  shareIncludeQuestion = false;
  shareTheme = 'light';
  document.querySelectorAll('.theme-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.theme === 'light');
  });
  const preview = document.getElementById('share-preview');
  preview.classList.remove('ratio-story');
  updateSharePreview();
}

function showSharePanelText() {
  document.getElementById('sharePanelA').style.display = 'none';
  document.getElementById('sharePanelImage').style.display = 'none';
  document.getElementById('sharePanelText').style.display = '';

  logEvent('share_mode_selected', { mode: 'whatsapp' });

  // Load prefs and render toggles + preview
  shareTextPrefs = loadSharePrefs();
  renderShareToggles();
  updateShareTextPreview();
}


// ── Share Text Composition ──────────────────────────────────────────────────
function composeShareText(verse, prefs) {
  const SEP = '─────';
  const parts = [];

  // Feeling / topic block
  if (prefs.feeling) {
    if (currentMode === 'curhat' && currentFeeling) {
      parts.push('🌙 Perasaan: ' + currentFeeling);
      parts.push('\n' + SEP + '\n');
    } else if (currentMode === 'panduan' && currentFeeling) {
      parts.push('🧭 Topik: ' + currentFeeling);
      parts.push('\n' + SEP + '\n');
    } else if (currentMode === 'ajarkan' && ajarkanCurrentQId) {
      parts.push('👶 Pertanyaan: ' + (verse._userQuestion || ajarkanCurrentQId));
      parts.push('\n' + SEP + '\n');
    }
  }

  // Verse block
  const verseLines = [];
  if (prefs.arabic)      verseLines.push(verse.arabic);
  if (prefs.translation) verseLines.push('\n\u201C' + verse.translation + '\u201D');
  if (prefs.reference)   verseLines.push('\n— ' + verse.ref);
  if (verseLines.length > 0) parts.push(verseLines.join('\n'));

  // Reflection block
  const reflectionText = verse.resonance || verse.relevance;
  if (prefs.reflection && reflectionText) {
    parts.push('\n' + SEP + '\n');
    parts.push('Refleksi:\n' + reflectionText);
  }

  // Tafsir block
  if (prefs.tafsir === 'ringkasan') {
    const summary = verse.tafsir_summary;
    const summaryText = summary && summary.makna_utama && summary.makna_utama.text;
    if (summaryText) {
      if (!prefs.reflection || !reflectionText) parts.push('\n' + SEP + '\n');
      else parts.push('');
      parts.push('Tafsir:\n' + summaryText);
    }
  } else if (prefs.tafsir === 'lengkap') {
    const fullText = verse.tafsir_ibnu_kathir_id || verse.tafsir_ibnu_kathir;
    if (fullText) {
      if (!prefs.reflection || !reflectionText) parts.push('\n' + SEP + '\n');
      else parts.push('');
      parts.push('Tafsir Ibnu Katsir:\n' + fullText);
    }
  }

  // Attribution — always
  parts.push('\n' + SEP + '\n');
  parts.push('Ayat dan penjelasan dari TemuQuran.com');

  return parts.join('\n');
}

// ── Toggle Rendering ────────────────────────────────────────────────────────
function renderShareToggles() {
  const container = document.getElementById('shareToggles');
  if (!container || !shareActiveVerse) return;

  const verse = shareActiveVerse;
  const prefs = shareTextPrefs;

  // Define toggles — conditionally include/hide based on mode
  const toggleDefs = [];

  // Feeling / topic toggle
  const showFeeling = (currentMode === 'curhat' || currentMode === 'panduan');
  const showAjarkanQ = (currentMode === 'ajarkan');
  if (showFeeling) {
    toggleDefs.push({
      key: 'feeling',
      label: currentMode === 'curhat' ? 'Perasaan' : 'Topik',
      sub: currentMode === 'curhat' ? currentFeeling : currentFeeling,
    });
  } else if (showAjarkanQ && ajarkanCurrentQId) {
    toggleDefs.push({
      key: 'feeling',
      label: 'Pertanyaan',
      sub: verse._userQuestion || ajarkanCurrentQId,
    });
  }
  // (jelajahi / votd: no feeling toggle)

  // Arabic
  toggleDefs.push({ key: 'arabic', label: 'Ayat Arab', sub: 'Teks asli Al-Qur\'an' });

  // Translation
  toggleDefs.push({ key: 'translation', label: 'Terjemahan', sub: 'Bahasa Indonesia' });

  // Reference
  toggleDefs.push({ key: 'reference', label: 'Referensi surah', sub: verse.ref || '' });

  // Reflection (hide for ajarkan — no reflection in ajarkan)
  const reflectionText = verse.resonance || verse.relevance;
  if (currentMode !== 'ajarkan' && reflectionText) {
    toggleDefs.push({ key: 'reflection', label: 'Refleksi', sub: 'Penjelasan singkat' });
  }

  // Tafsir (hide for ajarkan — no tafsir fields)
  const hasTafsir = verse.tafsir_summary && verse.tafsir_summary.makna_utama;
  if (currentMode !== 'ajarkan' && hasTafsir) {
    toggleDefs.push({ key: 'tafsir', label: 'Tafsir', sub: 'Ringkasan atau Ibnu Katsir Lengkap', isTafsir: true });
  }

  // Build HTML
  let html = '';
  for (const def of toggleDefs) {
    const isOn = def.key === 'tafsir' ? !!prefs.tafsir : prefs[def.key];
    html += `
      <div class="share-toggle-row" data-toggle-key="${def.key}">
        <div class="share-toggle-info">
          <span class="share-toggle-label">${def.label}</span>
          <span class="share-toggle-sub">${def.sub}</span>
        </div>
        <label class="share-toggle-switch">
          <input type="checkbox" data-share-key="${def.key}" ${isOn ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>`;

    // Tafsir sub-radio (shown only when tafsir is ON)
    if (def.isTafsir && isOn) {
      const tafsirMode = prefs.tafsir || 'ringkasan';
      const hasIbnuKathir = !!(verse.tafsir_ibnu_kathir_id || verse.tafsir_ibnu_kathir);
      html += `
        <div class="share-tafsir-sub" id="shareTafsirSub">
          <label><input type="radio" name="shareTafsirType" value="ringkasan" ${tafsirMode === 'ringkasan' ? 'checked' : ''} /> Ringkasan</label>
          ${hasIbnuKathir ? `<label><input type="radio" name="shareTafsirType" value="lengkap" ${tafsirMode === 'lengkap' ? 'checked' : ''} /> Ibnu Katsir Lengkap</label>` : ''}
        </div>`;
      if (tafsirMode === 'lengkap') {
        html += '<div class="share-tafsir-note">ℹ️ Pesan akan lebih panjang (~300–600 kata)</div>';
      }
    }
  }

  container.innerHTML = html;

  // Wire toggle event listeners
  container.querySelectorAll('input[data-share-key]').forEach(input => {
    input.addEventListener('change', () => {
      const key = input.dataset.shareKey;
      if (key === 'tafsir') {
        shareTextPrefs.tafsir = input.checked ? (shareTextPrefs.tafsir || 'ringkasan') : false;
      } else {
        shareTextPrefs[key] = input.checked;
      }

      // Enforce: arabic + translation can't both be off
      if (!shareTextPrefs.arabic && !shareTextPrefs.translation) {
        shareTextPrefs.arabic = true;
      }

      saveSharePrefs(shareTextPrefs);
      renderShareToggles(); // re-render for tafsir sub-radio and enforce
      updateShareTextPreview();
    });
  });

  // Wire tafsir sub-radio
  container.querySelectorAll('input[name="shareTafsirType"]').forEach(radio => {
    radio.addEventListener('change', () => {
      shareTextPrefs.tafsir = radio.value;
      saveSharePrefs(shareTextPrefs);
      renderShareToggles(); // re-render for length note
      updateShareTextPreview();
    });
  });
}

// ── Live Preview Update ─────────────────────────────────────────────────────
function updateShareTextPreview() {
  const el = document.getElementById('sharePreviewText');
  if (!el || !shareActiveVerse) return;
  const text = composeShareText(shareActiveVerse, shareTextPrefs);
  el.textContent = text;
}

// ── Share text / Copy handlers ──────────────────────────────────────────────
async function shareTextNative() {
  if (!shareActiveVerse) return;
  const text = composeShareText(shareActiveVerse, shareTextPrefs);

  logEvent('share_wa_sent', {
    feeling_on:     shareTextPrefs.feeling,
    arabic_on:      shareTextPrefs.arabic,
    translation_on: shareTextPrefs.translation,
    reference_on:   shareTextPrefs.reference,
    reflection_on:  shareTextPrefs.reflection,
    tafsir_on:      !!shareTextPrefs.tafsir,
    tafsir_mode:    shareTextPrefs.tafsir || 'off',
  });

  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  // Fallback: copy to clipboard
  try {
    await navigator.clipboard.writeText(text);
    showToast('Teks berhasil disalin');
  } catch (_) {}
}

function copyShareText() {
  if (!shareActiveVerse) return;
  const text = composeShareText(shareActiveVerse, shareTextPrefs);

  logEvent('share_wa_copied', {
    feeling_on:     shareTextPrefs.feeling,
    arabic_on:      shareTextPrefs.arabic,
    translation_on: shareTextPrefs.translation,
    reference_on:   shareTextPrefs.reference,
    reflection_on:  shareTextPrefs.reflection,
    tafsir_on:      !!shareTextPrefs.tafsir,
    tafsir_mode:    shareTextPrefs.tafsir || 'off',
  });

  navigator.clipboard.writeText(text).then(() => {
    showToast('Teks berhasil disalin ✓');
  }).catch(() => {
    showToast('Gagal menyalin teks');
  });
}

// Update the live preview thumbnail (CSS-styled, not canvas)
function updateSharePreview() {
  if (!shareActiveVerse) return;
  const verse   = shareActiveVerse;
  const preview = document.getElementById('share-preview');

  let html = `<div class="si-wrap si-theme-${shareTheme}" style="width:100%;position:relative;padding:8% 12%;">`;

  // Branding header (top)
  html += `
    <div class="si-header">
      <span class="si-header-brand" style="font-size:14px;">TemuQuran.com</span>
      <span class="si-header-sub" style="font-size:8px;">Temukan Jawaban Dalam Al-Qur'an</span>
      <div class="si-header-divider"></div>
    </div>
  `;

  // Optional feeling/question
  if (shareIncludeQuestion && verse._userQuestion && currentMode !== 'jelajahi') {
    html += `<p class="si-question" style="font-size:9px;">"${escapeHtml(verse._userQuestion)}"</p>`;
  }

  // Arabic (smaller for preview)
  html += `<p class="si-arabic" style="font-size:18px;line-height:1.9;margin-bottom:10px;max-width:92%;">${escapeHtml(verse.arabic)}</p>`;

  // Translation — full text, no truncation
  html += `<p class="si-translation" style="font-size:9px;line-height:1.6;margin-bottom:8px;">"${escapeHtml(verse.translation)}"</p>`;

  // Ref
  html += `<span class="si-ref" style="font-size:7px;padding:3px 8px;">${escapeHtml(verse.ref)}</span>`;

  // Footer
  html += `<div class="si-footer" style="font-size:7px;margin-top:12px;">TemuQuran.com</div>`;

  html += '</div>';
  preview.innerHTML = html;
}

// Share to a platform
async function shareToPlatform(platform) {
  if (!shareActiveVerse) return;

  if (IS_IN_APP_BROWSER) {
    showToast('Buka di Chrome/Safari untuk berbagi gambar 🌐');
    return;
  }

  logEvent('share_completed', {
    platform,
    theme: shareTheme,
    include_question: shareIncludeQuestion,
    include_question: shareIncludeQuestion,
  });

  showToast('Membuat gambar...');

  let blob = null;
  try {
    blob = await generateShareImage(shareActiveVerse, platform);
  } catch (imgErr) {
    console.warn('Image generation failed:', imgErr);
    showToast('Gagal membuat gambar. Coba lagi.');
    return;
  }

  if (!blob) return;

  const safeName = shareActiveVerse.ref.replace(/[^a-zA-Z0-9]/g, '-');
  const file     = new File([blob], `${safeName}.png`, { type: 'image/png' });

  if (platform === 'download') {
    // Direct download
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = `${safeName}.png`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Gambar tersimpan ✓');
    return;
  }

  // IG Story / WA Status / WA Chat → try Web Share API, fall back to download
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title: shareActiveVerse.ref, files: [file] });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }

  // Fallback: download
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = `${safeName}.png`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Gambar tersimpan ✓');
}
