'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// belajar.js — Belajar Al-Qur'an (onboarding, curricula, paths, lessons)
// Depends on: data.js, core.js
// ══════════════════════════════════════════════════════════════════════════════

// ── Belajar Al-Qur'an ────────────────────────────────────────────────────────

let belajarCurriculaData = null;  // cached /api/learning-paths?type=curricula
let belajarPathsData = null;      // cached /api/learning-paths (situation/topic)
let belajarExpandedGroup = null;  // which topic group is open (index or null)
let belajarActiveTab = 'kurikulum';

// Onboarding recommendation mapping (deterministic, no GPT)
const BELAJAR_ONBOARDING_RECS = {
  baru:     ['mengenal-quran-dari-nol', 'kisah-para-nabi'],
  dalam:    ['menjadi-muslim-lebih-baik', 'mengenal-quran-dari-nol'],
  hidup:    ['ketika-hidup-berat', 'menjadi-muslim-lebih-baik'],
  hati:     ['menyembuhkan-hati', 'ketika-hidup-berat'],
  keluarga: ['hubungan-keluarga', 'menjadi-muslim-lebih-baik'],
  iman:     ['percaya-diri-iman', 'mengenal-quran-dari-nol'],
};

// Topic grouping for "Pilih Sendiri" tab
const BELAJAR_TEMA_GROUPS = [
  { title: 'Kesulitan Hidup', emoji: '\uD83D\uDCAA', pathIds: ['menghadapi-cobaan', 'tekanan-sosial', 'kecanduan', 'diuji-kenikmatan', 'tekanan-orang-tua'] },
  { title: 'Emosi & Perasaan', emoji: '\uD83D\uDCAD', pathIds: ['patah-hati', 'berduka', 'merasa-bersalah', 'kesepian', 'merasa-iri', 'merasa-tidak-cukup-baik'] },
  { title: 'Hubungan', emoji: '\uD83E\uDD1D', pathIds: ['keluarga', 'masalah-rumah-tangga', 'ingin-berubah'] },
  { title: 'Iman & Identitas', emoji: '\uD83D\uDD06', pathIds: ['ragu-tentang-iman', 'merasa-jauh-dari-allah', 'mencari-makna-hidup'] },
  { title: 'Mengenal Islam', emoji: '\uD83D\uDCD6', pathIds: ['mengenal-allah', 'tentang-al-quran', 'akhirat', 'ilmu'] },
  { title: 'Ibadah & Spiritual', emoji: '\uD83E\uDD32', pathIds: ['shalat', 'doa', 'taubat', 'tawakkal', 'puasa', 'taqwa'] },
  { title: 'Akhlak & Karakter', emoji: '\uD83D\uDC8E', pathIds: ['sabar', 'syukur', 'ikhlas', 'akhlak', 'keadilan', 'rahmat-allah'] },
  { title: 'Kisah & Tokoh', emoji: '\uD83D\uDCD7', pathIds: ['kisah-ibrahim', 'kisah-musa', 'kisah-yusuf', 'perempuan'] },
];

function openBelajarView() {
  switchView('belajar-view');
  const onboarded = localStorage.getItem('tq-belajar-onboarded');
  if (!onboarded) {
    showBelajarOnboarding();
  } else {
    showBelajarMain();
  }
}

// ── Onboarding ──

function showBelajarOnboarding() {
  const ob = document.getElementById('belajar-onboarding');
  const main = document.getElementById('belajar-main');
  ob.style.display = 'flex';
  main.style.display = 'none';
  renderObWelcome();
}

function renderObWelcome() {
  const ob = document.getElementById('belajar-onboarding');
  ob.innerHTML = `
    <div class="belajar-ob-welcome" id="ob-welcome">
      <div class="belajar-ob-avatar">N</div>
      <div class="belajar-ob-pretitle">Belajar Al-Qur'an bersama</div>
      <div class="belajar-ob-name">Nuri</div>
      <div class="belajar-ob-greeting">Hai! Aku akan bantu kamu belajar dan merenungkan Al-Qur'an \u2014 dengan cara yang mudah dipahami.</div>
      <div class="belajar-ob-verse-ar">\u0627\u0642\u0652\u0631\u064E\u0623\u0652 \u0628\u0650\u0627\u0633\u0652\u0645\u0650 \u0631\u064E\u0628\u0651\u0650\u0643\u064E \u0627\u0644\u0651\u064E\u0630\u0650\u064A \u062E\u064E\u0644\u064E\u0642\u064E</div>
      <div class="belajar-ob-verse-tr">\u201CBacalah dengan nama Tuhanmu yang menciptakan\u201D</div>
      <button class="belajar-ob-start-btn" data-action="obQ1">Mulai \u2192</button>
      <div class="belajar-ob-hint">Cuma 2 pertanyaan, kurang dari 30 detik</div>
    </div>`;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => ob.querySelector('#ob-welcome')?.classList.add('visible'));
  });
}

function renderObQuestion1() {
  const ob = document.getElementById('belajar-onboarding');
  ob.innerHTML = `
    <div class="belajar-ob-question" id="ob-q1">
      <div class="belajar-ob-accent"></div>
      <div class="belajar-ob-body">
        <div class="belajar-ob-steps">
          <div class="belajar-ob-step filled"></div>
          <div class="belajar-ob-step"></div>
        </div>
        <div class="belajar-ob-nuri-row">
          <div class="belajar-ob-nuri-mini">N</div>
          <div class="belajar-ob-nuri-says">Nuri ingin tahu...</div>
        </div>
        <div class="belajar-ob-q-text">Kamu lagi di titik mana dalam perjalanan belajar Al-Qur'an?</div>
        <div class="belajar-ob-options">
          <div class="belajar-ob-option" data-action="obQ1Answer" data-answer="baru">
            <span class="belajar-ob-option-emoji">\uD83C\uDF31</span>
            <div><div class="belajar-ob-option-label">Baru mulai</div><div class="belajar-ob-option-desc">Aku ingin mengenal Al-Qur'an dari awal</div></div>
          </div>
          <div class="belajar-ob-option" data-action="obQ1Answer" data-answer="dalam">
            <span class="belajar-ob-option-emoji">\uD83D\uDCD6</span>
            <div><div class="belajar-ob-option-label">Ingin lebih dalam</div><div class="belajar-ob-option-desc">Sudah sholat, ingin memahami lebih</div></div>
          </div>
          <div class="belajar-ob-option" data-action="obQ1Answer" data-answer="masalah">
            <span class="belajar-ob-option-emoji">\uD83E\uDD32</span>
            <div><div class="belajar-ob-option-label">Sedang butuh pegangan</div><div class="belajar-ob-option-desc">Ada hal yang sedang kuhadapi</div></div>
          </div>
        </div>
      </div>
      <div class="belajar-ob-footer">
        <button class="belajar-ob-skip" data-action="obSkip">Mau lihat semua topik \u2192</button>
      </div>
    </div>`;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => ob.querySelector('#ob-q1')?.classList.add('visible'));
  });
}

function renderObQuestion2() {
  const ob = document.getElementById('belajar-onboarding');
  ob.innerHTML = `
    <div class="belajar-ob-question" id="ob-q2">
      <div class="belajar-ob-accent"></div>
      <div class="belajar-ob-body">
        <div class="belajar-ob-steps">
          <div class="belajar-ob-step filled"></div>
          <div class="belajar-ob-step filled"></div>
        </div>
        <div class="belajar-ob-nuri-row">
          <div class="belajar-ob-nuri-mini">N</div>
          <div class="belajar-ob-nuri-says">Nuri paham...</div>
        </div>
        <div class="belajar-ob-q-text">Boleh cerita sedikit, kamu sedang menghadapi apa?</div>
        <div class="belajar-ob-options">
          <div class="belajar-ob-option" data-action="obQ2Answer" data-answer="hidup">
            <span class="belajar-ob-option-emoji">\uD83D\uDCAA</span>
            <div><div class="belajar-ob-option-label">Ujian hidup</div><div class="belajar-ob-option-desc">Masalah pekerjaan, keuangan, atau tekanan</div></div>
          </div>
          <div class="belajar-ob-option" data-action="obQ2Answer" data-answer="hati">
            <span class="belajar-ob-option-emoji">\uD83D\uDC94</span>
            <div><div class="belajar-ob-option-label">Luka hati</div><div class="belajar-ob-option-desc">Patah hati, kehilangan, atau rasa bersalah</div></div>
          </div>
          <div class="belajar-ob-option" data-action="obQ2Answer" data-answer="keluarga">
            <span class="belajar-ob-option-emoji">\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67</span>
            <div><div class="belajar-ob-option-label">Keluarga</div><div class="belajar-ob-option-desc">Masalah rumah tangga atau orang tua</div></div>
          </div>
          <div class="belajar-ob-option" data-action="obQ2Answer" data-answer="iman">
            <span class="belajar-ob-option-emoji">\uD83D\uDD06</span>
            <div><div class="belajar-ob-option-label">Keraguan iman</div><div class="belajar-ob-option-desc">Merasa jauh dari Allah atau tidak yakin</div></div>
          </div>
        </div>
      </div>
      <div class="belajar-ob-footer">
        <button class="belajar-ob-back" data-action="obBackToQ1">\u2190 Kembali</button>
      </div>
    </div>`;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => ob.querySelector('#ob-q2')?.classList.add('visible'));
  });
}

let _obQ1Answer = null;

function renderObResult(answerKey) {
  const recs = BELAJAR_ONBOARDING_RECS[answerKey] || BELAJAR_ONBOARDING_RECS.baru;
  const ob = document.getElementById('belajar-onboarding');

  ob.innerHTML = `
    <div class="belajar-ob-result" id="ob-result">
      <div class="belajar-ob-loading-avatar" id="ob-loading">N</div>
      <div class="belajar-ob-loading-text" id="ob-loading-text">Nuri sedang menyiapkan perjalanan untukmu...</div>
      <div id="ob-recs" style="display:none;width:100%;text-align:center;"></div>
    </div>`;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => ob.querySelector('#ob-result')?.classList.add('visible'));
  });

  // Fetch curricula to get actual data for the recommended IDs
  fetchBelajarCurricula().then(curricula => {
    const recData = recs.map(id => curricula.find(c => c.id === id)).filter(Boolean);
    if (recData.length < 2) {
      // Fallback: just show belajar-view
      finishOnboarding();
      return;
    }

    setTimeout(() => {
      const loading = document.getElementById('ob-loading');
      const loadingText = document.getElementById('ob-loading-text');
      const recsEl = document.getElementById('ob-recs');
      if (loading) loading.style.display = 'none';
      if (loadingText) loadingText.style.display = 'none';
      if (!recsEl) return;

      const p = recData[0];
      const s = recData[1];
      recsEl.style.display = 'block';
      recsEl.innerHTML = `
        <div class="belajar-ob-avatar" style="width:44px;height:44px;font-size:1.06rem;margin-bottom:14px;animation:belajarFadeInScale 0.5s ease">N</div>
        <div class="belajar-ob-rec-intro">Nuri sarankan untukmu</div>
        <div class="belajar-ob-rec-primary">
          <div class="belajar-ob-rec-emoji">${escapeHtml(p.emoji || '\uD83D\uDCDA')}</div>
          <div class="belajar-ob-rec-title">${escapeHtml(p.title)}</div>
          <div class="belajar-ob-rec-tagline">${escapeHtml(p.tagline || '')}</div>
          <div class="belajar-ob-rec-meta">${p.paths ? p.paths.length + ' tema \u00B7 ' + p.total_lessons + ' pelajaran' : ''}</div>
          <button class="belajar-ob-rec-btn" data-action="obStartCurriculum" data-id="${escapeHtml(p.id)}">Mulai Perjalanan Ini \u2192</button>
        </div>
        <div class="belajar-ob-rec-secondary" data-action="obStartCurriculum" data-id="${escapeHtml(s.id)}">
          <span class="belajar-ob-sec-emoji">${escapeHtml(s.emoji || '\uD83D\uDCDA')}</span>
          <div class="belajar-ob-sec-info">
            <div class="belajar-ob-sec-title">${escapeHtml(s.title)}</div>
            <div class="belajar-ob-sec-meta">${s.paths ? s.paths.length + ' tema \u00B7 ' + s.total_lessons + ' pelajaran' : ''}</div>
          </div>
          <span class="belajar-ob-sec-chevron">\u203A</span>
        </div>
        <button class="belajar-ob-browse" data-action="obSkip">atau pilih sendiri \u2192</button>`;
    }, 1200);
  });
}

function finishOnboarding() {
  localStorage.setItem('tq-belajar-onboarded', 'true');
  showBelajarMain();
}

// ── Belajar Main View ──

function showBelajarMain() {
  const ob = document.getElementById('belajar-onboarding');
  const main = document.getElementById('belajar-main');
  ob.style.display = 'none';
  main.style.display = 'flex';
  // Show loading placeholder while content fetches
  const content = document.querySelector('.belajar-content');
  if (content) {
    content.innerHTML = '<div class="belajar-loading"><div class="belajar-loading-icon">\uD83D\uDCD6</div><div class="belajar-loading-text">Nuri sedang menyiapkan...</div></div>';
  }
  renderBelajarContent();
}

async function fetchBelajarCurricula() {
  if (belajarCurriculaData) return belajarCurriculaData;
  try {
    const res = await fetch('/api/learning-paths?type=curricula');
    if (!res.ok) throw new Error('Failed to fetch curricula');
    belajarCurriculaData = await res.json();
    return belajarCurriculaData;
  } catch (e) {
    console.error('[belajar] curricula fetch error:', e);
    return [];
  }
}

async function fetchBelajarPaths() {
  if (belajarPathsData) return belajarPathsData;
  try {
    const res = await fetch('/api/learning-paths');
    if (!res.ok) throw new Error('Failed to fetch paths');
    belajarPathsData = await res.json();
    return belajarPathsData;
  } catch (e) {
    console.error('[belajar] paths fetch error:', e);
    return { situation: [], topic: [] };
  }
}

async function renderBelajarContent() {
  renderBelajarProgress();
  // Restore tab panel HTML structure (replaces loading placeholder)
  const content = document.querySelector('.belajar-content');
  if (content) {
    content.innerHTML = '<div id="belajar-tab-kurikulum" class="belajar-tab-panel"></div><div id="belajar-tab-tema" class="belajar-tab-panel" style="display:none"></div>';
  }
  // Re-apply active tab visibility
  if (belajarActiveTab === 'tema') {
    const kurPanel = document.getElementById('belajar-tab-kurikulum');
    const temaPanel = document.getElementById('belajar-tab-tema');
    if (kurPanel) kurPanel.style.display = 'none';
    if (temaPanel) temaPanel.style.display = '';
  }
  await Promise.all([renderBelajarKurrikulumTab(), renderBelajarTemaTab()]);
}

function renderBelajarProgress() {
  const el = document.getElementById('belajar-progress');
  const progress = JSON.parse(localStorage.getItem('tq-curriculum-progress') || '{}');

  // Find active curriculum (one with started_at but not all paths completed)
  let active = null;
  for (const [currId, data] of Object.entries(progress)) {
    if (data.started_at && (!data.paths_completed || data.paths_completed.length < (data.total_paths || 999))) {
      active = { id: currId, ...data };
      break;
    }
  }

  if (!active) {
    el.style.display = 'none';
    return;
  }

  // Get curriculum details from cache or show minimal
  fetchBelajarCurricula().then(curricula => {
    const curr = curricula.find(c => c.id === active.id);
    if (!curr) { el.style.display = 'none'; return; }

    const pathIdx = active.current_path_index || 0;
    const lessonIdx = active.current_lesson || 0;
    const totalPaths = curr.paths?.length || 5;
    const totalLessons = totalPaths * 5;
    const completedLessons = (active.paths_completed?.length || 0) * 5 + lessonIdx;
    const pct = Math.round((completedLessons / totalLessons) * 100);

    el.style.display = 'block';
    el.innerHTML = `
      <div class="belajar-progress-top">
        <div class="belajar-progress-left">
          <span class="belajar-progress-emoji">${escapeHtml(curr.emoji || '')}</span>
          <div>
            <div class="belajar-progress-title">${escapeHtml(curr.title)}</div>
            <div class="belajar-progress-sub">Tema ${pathIdx + 1} \u00B7 Pelajaran ${lessonIdx + 1} dari 5</div>
          </div>
        </div>
        <button class="belajar-progress-btn" data-action="belajarResume" data-curr="${escapeHtml(active.id)}">\u25B6 Lanjut</button>
      </div>
      <div class="belajar-progress-bar"><div class="belajar-progress-fill" style="width:${pct}%"></div></div>`;
  });
}

async function renderBelajarKurrikulumTab() {
  const panel = document.getElementById('belajar-tab-kurikulum');
  panel.innerHTML = '<div class="belajar-tab-intro">Nuri sudah menyusun perjalanan belajar untukmu \u2014 tinggal pilih dan mulai.</div>';

  const curricula = await fetchBelajarCurricula();

  let html = '';
  for (const c of curricula) {
    const meta = (c.paths?.length || 0) + ' tema \u00B7 ' + (c.total_lessons || 0) + ' pelajaran';
    html += `
      <div class="belajar-curriculum-card" data-action="belajarCurriculum" data-id="${escapeHtml(c.id)}">
        <div class="belajar-curriculum-emoji">${escapeHtml(c.emoji || '\uD83D\uDCDA')}</div>
        <div class="belajar-curriculum-info">
          <div class="belajar-curriculum-title">${escapeHtml(c.title)}</div>
          <div class="belajar-curriculum-tagline">${escapeHtml(c.tagline || '')}</div>
          <div class="belajar-curriculum-meta">${meta}</div>
        </div>
        <span class="belajar-curriculum-chevron">\u203A</span>
      </div>`;
  }
  panel.innerHTML += html;
}

async function renderBelajarTemaTab() {
  const panel = document.getElementById('belajar-tab-tema');

  // Fetch all paths for title/emoji lookup
  const paths = await fetchBelajarPaths();
  const allPaths = [...(paths.situation || []), ...(paths.topic || [])];
  const pathMap = {};
  for (const p of allPaths) pathMap[p.id] = p;

  let html = '<div class="belajar-tab-intro">Pilih topik yang menarik hatimu \u2014 setiap tema terdiri dari 5 pelajaran mendalam.</div>';

  // Search input
  html += `<div class="belajar-search-wrap"><span class="belajar-search-icon">\uD83D\uDD0D</span><input type="text" class="belajar-search-input" id="belajar-search" placeholder="Cari tema..." /></div>`;

  // Groups
  html += '<div id="belajar-groups">';
  BELAJAR_TEMA_GROUPS.forEach((group, gi) => {
    const pathItems = group.pathIds.map(pid => pathMap[pid]).filter(Boolean);
    html += `
      <div class="belajar-group" data-group="${gi}">
        <div class="belajar-group-header" data-action="belajarToggleGroup" data-group="${gi}">
          <div class="belajar-group-left">
            <span class="belajar-group-emoji">${group.emoji}</span>
            <div>
              <div class="belajar-group-title">${escapeHtml(group.title)}</div>
              <div class="belajar-group-count">${pathItems.length} tema</div>
            </div>
          </div>
          <span class="belajar-group-chevron" id="belajar-chev-${gi}">\u25BE</span>
        </div>
        <div class="belajar-group-paths" id="belajar-paths-${gi}">`;

    for (const p of pathItems) {
      html += `
          <div class="belajar-path-row" data-action="belajarPath" data-id="${escapeHtml(p.id)}">
            <span class="belajar-path-emoji">${escapeHtml(p.emoji || '')}</span>
            <div class="belajar-path-info">
              <div class="belajar-path-title">${escapeHtml(p.title)}</div>
              <div class="belajar-path-meta">${p.lesson_count || 5} pelajaran</div>
            </div>
            <span class="belajar-path-chevron">\u203A</span>
          </div>`;
    }

    html += '</div></div>';
  });
  html += '</div>';

  // Search results container (hidden by default)
  html += '<div id="belajar-search-results" class="belajar-search-results" style="display:none"></div>';

  panel.innerHTML = html;

  // Wire search
  const searchInput = document.getElementById('belajar-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      const groups = document.getElementById('belajar-groups');
      const results = document.getElementById('belajar-search-results');

      if (!q) {
        groups.style.display = 'block';
        results.style.display = 'none';
        return;
      }

      groups.style.display = 'none';
      results.style.display = 'block';

      const matches = allPaths.filter(p => p.title.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q));
      if (!matches.length) {
        results.innerHTML = '<div class="belajar-search-empty">\uD83D\uDD0D Tidak ada tema yang cocok</div>';
        return;
      }

      results.innerHTML = matches.map(p => `
        <div class="belajar-path-row" data-action="belajarPath" data-id="${escapeHtml(p.id)}">
          <span class="belajar-path-emoji">${escapeHtml(p.emoji || '')}</span>
          <div class="belajar-path-info">
            <div class="belajar-path-title">${escapeHtml(p.title)}</div>
            <div class="belajar-path-meta">${p.lesson_count || 5} pelajaran</div>
          </div>
          <span class="belajar-path-chevron">\u203A</span>
        </div>`).join('');
    });
  }
}

function belajarToggleGroup(groupIdx) {
  if (belajarExpandedGroup === groupIdx) {
    // Collapse current
    const paths = document.getElementById('belajar-paths-' + groupIdx);
    const chev = document.getElementById('belajar-chev-' + groupIdx);
    const header = paths?.previousElementSibling;
    if (paths) paths.classList.remove('open');
    if (chev) chev.classList.remove('open');
    if (header) header.classList.remove('open');
    belajarExpandedGroup = null;
  } else {
    // Collapse previous
    if (belajarExpandedGroup !== null) {
      const oldPaths = document.getElementById('belajar-paths-' + belajarExpandedGroup);
      const oldChev = document.getElementById('belajar-chev-' + belajarExpandedGroup);
      const oldHeader = oldPaths?.previousElementSibling;
      if (oldPaths) oldPaths.classList.remove('open');
      if (oldChev) oldChev.classList.remove('open');
      if (oldHeader) oldHeader.classList.remove('open');
    }
    // Expand new
    const paths = document.getElementById('belajar-paths-' + groupIdx);
    const chev = document.getElementById('belajar-chev-' + groupIdx);
    const header = paths?.previousElementSibling;
    if (paths) paths.classList.add('open');
    if (chev) chev.classList.add('open');
    if (header) header.classList.add('open');
    belajarExpandedGroup = groupIdx;
  }
}

function belajarSwitchTab(tabId) {
  belajarActiveTab = tabId;
  document.querySelectorAll('.belajar-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.btab === tabId);
  });
  document.getElementById('belajar-tab-kurikulum').style.display = tabId === 'kurikulum' ? 'block' : 'none';
  document.getElementById('belajar-tab-tema').style.display = tabId === 'tema' ? 'block' : 'none';
  belajarExpandedGroup = null;
}

// ── Lesson Bottom Sheet (Tafsir / Asbabun Nuzul) ──

let lcSheetOpenTab = null;

function openLessonSheet(verse, type) {
  if (!verse) return;
  const overlay = document.getElementById('lc-sheet-overlay');
  const sheet = document.getElementById('lc-sheet');
  const headerEl = document.getElementById('lc-sheet-header');
  const bodyEl = document.getElementById('lc-sheet-body');
  if (!overlay || !sheet) return;

  const ref = `QS. ${escapeHtml(verse.surah_name)}: ${verse.ayah_number}`;
  const typeLabel = type === 'asbabun' ? 'Asbabun Nuzul' : 'Tafsir Lengkap';

  headerEl.innerHTML = `
    <div class="lc-sheet-header-info">
      <div class="lc-sheet-ref">${ref}</div>
      <div class="lc-sheet-type">${typeLabel}</div>
    </div>
    <button class="lc-sheet-close" data-action="lcCloseSheet">\u2715</button>`;

  if (type === 'tafsir') {
    lcSheetOpenTab = 'kemenag';
    const tabs = [
      { key: 'kemenag', name: 'Kemenag', text: verse.tafsir_kemenag },
      { key: 'ibnu', name: 'Ibnu Katsir', text: verse.tafsir_ibnu_kathir_id },
      { key: 'shihab', name: 'Quraish Shihab', text: verse.tafsir_quraish_shihab }
    ].filter(t => t.text);

    bodyEl.innerHTML = `
      <div class="lc-sheet-intro">Pelajari ayat ini dari para ulama dan mufassir terpercaya.</div>
      ${tabs.map(t => `
        <div class="lc-sheet-tab" data-tab-key="${t.key}">
          <div class="lc-sheet-tab-header${t.key === 'kemenag' ? ' open' : ''}" data-action="lcSheetTab" data-key="${t.key}">
            <span class="lc-sheet-tab-name">${escapeHtml(t.name)}</span>
            <span class="lc-sheet-tab-chevron">\u25BE</span>
          </div>
          <div class="lc-sheet-tab-content${t.key === 'kemenag' ? ' open' : ''}">
            <div class="lc-sheet-tab-text">${escapeHtml(t.text)}</div>
          </div>
        </div>
      `).join('')}`;
  } else {
    lcSheetOpenTab = null;
    const text = verse.asbabun_nuzul_id || '';
    const paragraphs = text.split(/\n\n|\n/).filter(Boolean);
    bodyEl.innerHTML = `
      <div class="lc-sheet-asbabun">
        ${paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('')}
        <div class="lc-sheet-asbabun-source">Sumber: Asbab Al-Nuzul, Al-Wahidi</div>
      </div>`;
  }

  overlay.classList.add('visible');
  sheet.classList.add('visible');
}

function closeLessonSheet() {
  const overlay = document.getElementById('lc-sheet-overlay');
  const sheet = document.getElementById('lc-sheet');
  if (overlay) overlay.classList.remove('visible');
  if (sheet) sheet.classList.remove('visible');
}

function toggleLcSheetTab(key) {
  const body = document.getElementById('lc-sheet-body');
  if (!body) return;
  const isClosing = lcSheetOpenTab === key;
  lcSheetOpenTab = isClosing ? null : key;

  body.querySelectorAll('.lc-sheet-tab').forEach(tab => {
    const tabKey = tab.dataset.tabKey;
    const header = tab.querySelector('.lc-sheet-tab-header');
    const content = tab.querySelector('.lc-sheet-tab-content');
    if (tabKey === key && !isClosing) {
      header.classList.add('open');
      content.classList.add('open');
    } else {
      header.classList.remove('open');
      content.classList.remove('open');
    }
  });
}

// Close sheet on overlay tap
document.getElementById('lc-sheet-overlay')?.addEventListener('click', closeLessonSheet);

// ── Belajar Event Delegation ──

document.addEventListener('click', function(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;

  // Onboarding actions
  if (action === 'obQ1') { renderObQuestion1(); return; }
  if (action === 'obQ1Answer') {
    const ans = target.dataset.answer;
    _obQ1Answer = ans;
    if (ans === 'masalah') { renderObQuestion2(); }
    else { renderObResult(ans); }
    return;
  }
  if (action === 'obQ2Answer') {
    renderObResult(target.dataset.answer);
    return;
  }
  if (action === 'obBackToQ1') { renderObQuestion1(); return; }
  if (action === 'obSkip') { finishOnboarding(); return; }
  if (action === 'obStartCurriculum') {
    localStorage.setItem('tq-belajar-onboarded', 'true');
    const cid = target.dataset.id;
    if (cid) openCurriculumFirstPath(cid);
    else showBelajarMain();
    return;
  }

  // Belajar main actions
  if (action === 'belajarToggleGroup') {
    belajarToggleGroup(parseInt(target.dataset.group, 10));
    return;
  }
  if (action === 'belajarPath') {
    openPathPreview(target.dataset.id);
    return;
  }
  if (action === 'belajarCurriculum') {
    openCurriculumFirstPath(target.dataset.id);
    return;
  }
  if (action === 'belajarResume') {
    resumeCurriculum(target.dataset.curr);
    return;
  }
  // Path preview actions
  if (action === 'ppBack') { switchView('belajar-view'); return; }
  if (action === 'ppStartLesson') { startLesson(parseInt(target.dataset.idx, 10)); return; }
  // Lesson view actions
  if (action === 'lcBack') { switchView('path-preview-view'); return; }
  if (action === 'lcNext') { lcNext(); return; }
  if (action === 'lcPrev') { lcPrev(); return; }
  if (action === 'lcToggleVerseBar') { lcToggleVerseBar(); return; }
  if (action === 'lcPlayAudio') { lcPlayAudio(target.dataset.src, target); return; }
  if (action === 'lcOpenTafsir') { if (lcData?.verse) openLessonSheet(lcData.verse, 'tafsir'); return; }
  if (action === 'lcOpenAsbabun') { if (lcData?.verse) openLessonSheet(lcData.verse, 'asbabun'); return; }
  if (action === 'lcCloseSheet') { closeLessonSheet(); return; }
  if (action === 'lcSheetTab') { toggleLcSheetTab(target.dataset.key); return; }
  if (action === 'lcNuriBridge') { lcNuriBridge(target.dataset.from); return; }
  if (action === 'lcNextLesson') { lcNextLesson(); return; }
  if (action === 'lcFinishPath') { switchView('path-preview-view'); return; }
  if (action === 'lcSave') { showToast('Fitur simpan segera hadir'); return; }
  if (action === 'lcShare') { showToast('Fitur bagikan segera hadir'); return; }
});

// Tab switching
document.querySelectorAll('.belajar-tab').forEach(tab => {
  tab.addEventListener('click', () => belajarSwitchTab(tab.dataset.btab));
});

// Back button
document.getElementById('belajar-back-btn')?.addEventListener('click', () => switchView('landing-view'));

// Landing card click
document.getElementById('belajarLandingCard')?.addEventListener('click', openBelajarView);

// Nuri entry at bottom of belajar-view
document.getElementById('belajarNuriEntry')?.addEventListener('click', () => {
  startNuriSession();
});

// ── Path Preview & Lesson View (Swipe Cards) ─────────────────────────────────

let lcData = null;
let lcCards = [];
let lcCardIdx = 0;
let lcAnimDir = 'right';
let lcVerseBarOpen = false;
let lcPathId = null;
let lcPathTitle = '';
let lcTotalLessons = 5;
let lcPathLessons = [];
let lcFromCurriculum = null;
let lcLessonCache = {};

// Swipe state
let lcTouchStartX = 0;
let lcTouchStartY = 0;
let lcTouchLocked = null;
let lcIsSwiping = false;
let lcSwipeX = 0;

function buildLcCards(content, verse) {
  const cards = [{ id: 'verse', label: 'Ayat' }];
  cards.push({ id: 'insight', label: 'Insight' });
  if (verse && (verse.tafsir_summary || verse.asbabun_nuzul_id)) {
    cards.push({ id: 'konteks', label: 'Konteks' });
  }
  if (content.kata_kunci && content.kata_kunci.length > 0) {
    cards.push({ id: 'katakunci', label: 'Kata Kunci' });
  }
  if (content.doa) {
    cards.push({ id: 'doa', label: 'Doa' });
  }
  cards.push({ id: 'renungan', label: 'Renungan' });
  cards.push({ id: 'actions', label: 'Lanjut' });
  return cards;
}

// ── Path Preview ──

async function openPathPreview(pathId) {
  switchView('path-preview-view');
  const view = document.getElementById('path-preview-view');
  view.innerHTML = '<div class="lc-loading"><div class="lc-loading-spinner"></div></div>';

  try {
    const res = await fetch(`/api/learning-paths/${pathId}`);
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();
    lcPathId = data.id;
    lcPathTitle = data.title;
    lcPathLessons = data.lessons || [];
    lcTotalLessons = lcPathLessons.length || 5;

    const progress = JSON.parse(localStorage.getItem('nuri-progress') || '{}');
    const completedCount = lcPathLessons.filter(l => progress[l.id]).length;
    const nextIdx = lcPathLessons.findIndex(l => !progress[l.id]);
    const allDone = completedCount === lcTotalLessons;

    view.innerHTML = `
      <div class="pp-hero">
        <button class="pp-back" data-action="ppBack">\u2190 Kembali</button>
        <div class="pp-hero-content">
          <h2 class="pp-title">${escapeHtml(data.emoji || '\uD83D\uDCD6')}\u00A0\u00A0${escapeHtml(data.title)}</h2>
          <p class="pp-desc">${escapeHtml(data.description || '')}</p>
          ${data.path_intro ? `<p class="pp-intro">${escapeHtml(data.path_intro)}</p>` : ''}
          <div class="pp-progress-info">${completedCount} / ${lcTotalLessons} pelajaran selesai</div>
        </div>
      </div>
      <div class="pp-lessons">
        ${lcPathLessons.map((l, i) => {
          const done = progress[l.id];
          const isCurrent = i === (nextIdx >= 0 ? nextIdx : 0);
          return `
            <button class="pp-lesson-row ${done ? 'done' : ''} ${isCurrent && !allDone ? 'current' : ''}"
                    data-action="ppStartLesson" data-idx="${i}">
              <span class="pp-lesson-num">${done ? '\u2713' : i + 1}</span>
              <div class="pp-lesson-info">
                <div class="pp-lesson-title">${escapeHtml(l.title)}</div>
                <div class="pp-lesson-ref">${escapeHtml(l.verse_ref)}</div>
              </div>
              <span class="pp-lesson-chevron">\u203A</span>
            </button>`;
        }).join('')}
      </div>
      ${!allDone ? `
        <div class="pp-start-wrap">
          <button class="pp-start-btn" data-action="ppStartLesson" data-idx="${nextIdx >= 0 ? nextIdx : 0}">
            ${completedCount > 0 ? 'Lanjut Pelajaran \u2192' : 'Mulai Pelajaran \u2192'}
          </button>
        </div>` : `
        <div class="pp-start-wrap">
          <div class="pp-complete-msg">\u2728 Semua pelajaran selesai!</div>
          ${data.path_closing ? `<p class="pp-closing">${escapeHtml(data.path_closing)}</p>` : ''}
        </div>`}`;
  } catch (e) {
    console.error('[path-preview]', e);
    view.innerHTML = '<div class="lc-loading"><p>Gagal memuat data.</p><button data-action="ppBack">Kembali</button></div>';
  }
}

async function openCurriculumFirstPath(curriculumId) {
  const curricula = await fetchBelajarCurricula();
  const curr = curricula.find(c => c.id === curriculumId);
  if (!curr || !curr.paths || curr.paths.length === 0) {
    showToast('Kurikulum tidak ditemukan');
    return;
  }
  lcFromCurriculum = { id: curriculumId, pathIndex: 0 };
  openPathPreview(curr.paths[0].id);
}

async function resumeCurriculum(curriculumId) {
  const cp = JSON.parse(localStorage.getItem('tq-curriculum-progress') || '{}');
  const state = cp[curriculumId];
  const curricula = await fetchBelajarCurricula();
  const curr = curricula.find(c => c.id === curriculumId);
  if (!curr || !curr.paths) return;

  const pathIdx = state?.current_path_index || 0;
  const path = curr.paths[pathIdx] || curr.paths[0];
  lcFromCurriculum = { id: curriculumId, pathIndex: pathIdx };
  openPathPreview(path.id);
}

// ── Start Lesson ──

async function startLesson(lessonIdx) {
  const lesson = lcPathLessons[lessonIdx];
  if (!lesson) return;

  switchView('lesson-view');
  const wrap = document.getElementById('lc-card-wrap');
  wrap.innerHTML = '<div class="lc-loading"><div class="lc-loading-spinner"></div><div>Memuat pelajaran...</div></div>';

  try {
    let data = lcLessonCache[lesson.id];
    if (!data) {
      const res = await fetch(`/api/learning-paths/lesson/${lesson.id}`);
      if (!res.ok) throw new Error('Failed');
      data = await res.json();
      lcLessonCache[lesson.id] = data;
    }

    lcData = data;

    // Normalize verse for compatibility with existing playAudio / openTafsirOverlay
    if (lcData.verse) {
      lcData.verse.arabic = lcData.verse.text_arabic;
      lcData.verse.translation = lcData.verse.text_indonesian;
      lcData.verse.verse_number = lcData.verse.ayah_number;
      lcData.verse.id = lcData.verse.surah_number + ':' + lcData.verse.ayah_number;
    }

    lcCards = buildLcCards(lcData.content || {}, lcData.verse || {});
    lcCardIdx = 0;
    lcAnimDir = 'right';
    lcVerseBarOpen = false;

    renderLessonShell();
    renderLcCard();
  } catch (e) {
    console.error('[lesson]', e);
    wrap.innerHTML = '<div class="lc-loading"><p>Gagal memuat pelajaran.</p><button data-action="lcBack">Kembali</button></div>';
  }
}

function renderLessonShell() {
  const view = document.getElementById('lesson-view');
  const lesson = lcData.lesson;
  const verse = lcData.verse;

  const headerEl = document.getElementById('lc-header');
  headerEl.innerHTML = `
    <button class="lc-back" data-action="lcBack">\u2190</button>
    <div class="lc-header-info">
      <div class="lc-header-title" id="lc-h-title">${escapeHtml(lcPathTitle)} \u00B7 ${lesson.order_num}/${lcTotalLessons} \u00B7 ${escapeHtml(lesson.title)}</div>
    </div>
    <div class="lc-lesson-dots" id="lc-lesson-dots">
      ${Array.from({length: lcTotalLessons}, (_, i) => {
        const isActive = i + 1 === lesson.order_num;
        return `<div class="lc-lesson-dot${isActive ? ' active' : ''}"></div>`;
      }).join('')}
    </div>`;

  // Verse bar content (hidden initially, shown for non-verse cards)
  const vbar = document.getElementById('lc-verse-bar');
  if (verse) {
    vbar.innerHTML = `
      <div class="lc-vb-header" data-action="lcToggleVerseBar">
        <div class="lc-vb-left">
          <span class="lc-vb-ref">QS. ${escapeHtml(verse.surah_name)}: ${verse.ayah_number}</span>
          <span class="lc-vb-hint" id="lc-vb-hint">Ketuk untuk baca ayat</span>
        </div>
        <span class="lc-vb-chevron" id="lc-vb-chevron">\u25BE</span>
      </div>
      <div class="lc-vb-content" id="lc-vb-content" style="display:none">
        <p class="lc-vb-arabic">${escapeHtml(verse.text_arabic)}</p>
        <div class="lc-vb-divider"></div>
        <p class="lc-vb-translation">${escapeHtml(verse.text_indonesian)}</p>
        <button class="lc-audio-btn lc-audio-dark" data-action="lcPlayAudio" data-src="verse">\u25B6 Dengarkan Ayat</button>
      </div>`;
    lcVerseBarOpen = false;
    vbar.classList.remove('open');
  }

  // Wire touch events on card area
  const cardArea = document.getElementById('lc-card-area');
  cardArea.addEventListener('touchstart', lcHandleTouchStart, { passive: true });
  cardArea.addEventListener('touchmove', lcHandleTouchMove, { passive: false });
  cardArea.addEventListener('touchend', lcHandleTouchEnd, { passive: true });
}

function renderLcCard() {
  const card = lcCards[lcCardIdx];
  const isVerse = card.id === 'verse';

  // Header dark/light
  document.getElementById('lc-header').classList.toggle('lc-header-dark', isVerse);

  // Verse bar and dots visibility
  document.getElementById('lc-verse-bar').style.display = isVerse ? 'none' : '';
  document.getElementById('lc-dots-wrap').style.display = isVerse ? 'none' : '';
  updateLcDots();

  // Card area background
  const area = document.getElementById('lc-card-area');
  area.className = `lc-card-area ${isVerse ? 'lc-area-dark' : 'lc-area-light'}`;

  // Card content
  const wrap = document.getElementById('lc-card-wrap');
  wrap.style.transform = 'none';
  wrap.innerHTML = renderCardContent();

  // Bottom nav — hidden on verse card (button is inline)
  const bottom = document.getElementById('lc-bottom');
  if (isVerse) {
    bottom.style.display = 'none';
  } else {
    bottom.style.display = '';
    bottom.className = 'lc-bottom';
    bottom.innerHTML = renderBottomNav();
  }

  // Lesson dots colors
  updateLessonDotColors(isVerse);

  // Mark complete on actions card
  if (card.id === 'actions') markLessonComplete();
}

function updateLcDots() {
  const el = document.getElementById('lc-dots');
  if (!el) return;
  el.innerHTML = lcCards.map((c, i) =>
    `<div class="lc-dot${i < lcCardIdx ? ' done' : ''}${i === lcCardIdx ? ' active' : ''}"></div>`
  ).join('');
}

function updateLessonDotColors(isVerse) {
  const dots = document.querySelectorAll('#lc-lesson-dots .lc-lesson-dot');
  const orderNum = lcData.lesson.order_num;
  dots.forEach((dot, i) => {
    const isActive = i + 1 === orderNum;
    dot.style.background = isActive
      ? (isVerse ? '#C4973B' : '#2A7C6F')
      : (isVerse ? 'rgba(255,255,255,0.35)' : '#ddd');
  });
}

// ── Card Content Rendering ──

function renderCardContent() {
  const card = lcCards[lcCardIdx];
  const verse = lcData.verse || {};
  const content = lcData.content || {};
  const anim = lcAnimDir === 'right' ? 'lcCardInRight' : 'lcCardInLeft';

  if (card.id === 'verse') return buildCardVerse(verse, anim);

  let inner = '';
  switch (card.id) {
    case 'insight': inner = buildCardInsight(content.insight); break;
    case 'konteks': inner = buildCardKonteks(verse); break;
    case 'katakunci': inner = buildCardKataKunci(content.kata_kunci); break;
    case 'doa': inner = buildCardDoa(content.doa, lcData.doa_verse); break;
    case 'renungan': inner = buildCardRenungan(content.renungan); break;
    case 'actions': inner = buildCardActions(lcData.lesson); break;
  }

  const extra = card.id === 'katakunci' ? ' lc-card-kk-wrap' : (card.id === 'renungan' ? ' lc-card-renungan-bg' : '');
  return `<div class="lc-card-outer" style="animation: ${anim} 0.3s ease">
    <div class="lc-card-white${extra}">${inner}</div>
  </div>`;
}

function buildCardVerse(verse, anim) {
  if (!verse || !verse.text_arabic) return '<div class="lc-card-verse" style="animation: ' + anim + ' 0.3s ease"><p style="color:white">Data ayat tidak tersedia</p></div>';

  // Bismillah separation (Fix 5b)
  const surahNum = verse.surah_number;
  const rawArabic = verse.text_arabic;
  const strippedArabic = stripBismillah(rawArabic, surahNum);
  const showBismillah = surahNum !== 1 && surahNum !== 9 && strippedArabic !== rawArabic;

  // Adaptive font size (Fix 5d)
  const arabicLen = strippedArabic.length;
  const fontSize = arabicLen <= 50 ? 28 : arabicLen <= 120 ? 24 : arabicLen <= 200 ? 20 : 18;

  return `<div class="lc-card-verse" style="animation: ${anim} 0.3s ease">
    ${showBismillah ? '<div class="lc-verse-bismillah">\u0628\u0650\u0633\u0652\u0645\u0650 \u0671\u0644\u0644\u0651\u064E\u0647\u0650 \u0671\u0644\u0631\u0651\u064E\u062D\u0652\u0645\u064E\u0640\u0670\u0646\u0650 \u0671\u0644\u0631\u0651\u064E\u062D\u0650\u064A\u0645\u0650</div>' : ''}
    <div class="lc-verse-ref">QS. ${escapeHtml(verse.surah_name)}: ${verse.ayah_number}</div>
    <div class="lc-verse-arabic" style="font-size: ${fontSize}px">${escapeHtml(strippedArabic)}</div>
    <div class="lc-verse-divider"></div>
    <div class="lc-verse-translation">${escapeHtml(verse.text_indonesian)}</div>
    <button class="lc-audio-btn" data-action="lcPlayAudio" data-src="verse">\u25B6 Dengarkan Ayat</button>
    <button class="lc-gold-btn lc-gold-inline" data-action="lcNext">Pahami Ayat Ini \u2192</button>
  </div>`;
}

function buildCardInsight(insight) {
  if (!insight) return '';
  const pq = insight.pull_quote || '';
  const lines = pq.split('\n').filter(Boolean);
  const quoteHtml = lines.length > 1
    ? `<div class="lc-insight-quote-dark">${escapeHtml(lines[0])}</div>
       <div class="lc-insight-quote-teal">${escapeHtml(lines.slice(1).join(' '))}</div>`
    : `<div class="lc-insight-quote-dark">${escapeHtml(pq)}</div>`;

  return `<div class="lc-insight-body">
    <div class="lc-card-label lc-label-teal">\u2726 MAKNA UTAMA</div>
    <div class="lc-insight-quote">${quoteHtml}</div>
    <div class="lc-insight-divider"></div>
    <div class="lc-insight-text">${escapeHtml(insight.explanation || '')}</div>
    <div class="lc-card-footer-link" data-action="lcOpenTafsir">
      <span>Baca tafsir lengkap \u25BE</span>
    </div>
  </div>`;
}

function buildCardKonteks(verse) {
  if (!verse) return '';
  const summary = verse.tafsir_summary;
  let summaryText = '';
  if (summary) {
    summaryText = typeof summary === 'object' ? (summary.makna_utama?.text || '') : String(summary);
  }
  const ringkas = (verse.tafsir_kemenag || '').substring(0, 300);

  return `<div class="lc-konteks-body">
    <div class="lc-card-label lc-label-gold">\uD83D\uDCDC Konteks Ayat</div>
    ${summaryText ? `<div class="lc-konteks-text">${escapeHtml(summaryText)}</div>` : ''}
    ${ringkas ? `
      <div class="lc-tafsir-ringkas">
        <div class="lc-tafsir-ringkas-label">Tafsir Ringkas</div>
        <div class="lc-tafsir-ringkas-text">${escapeHtml(ringkas)}${ringkas.length >= 300 ? '\u2026' : ''}</div>
      </div>` : ''}
    ${verse.asbabun_nuzul_id ? `
      <div class="lc-card-footer-link" data-action="lcOpenAsbabun">
        <span>Baca sebab turunnya ayat lengkap \u25BE</span>
      </div>` : ''}
  </div>`;
}

function buildCardKataKunci(kataKunci) {
  if (!kataKunci || kataKunci.length === 0) return '';
  const words = kataKunci.slice(0, 2);
  return `<div class="lc-kk-body">
    <div class="lc-kk-header">
      <div class="lc-card-label lc-label-gold">\uD83D\uDD24 Kata Kunci</div>
    </div>
    ${words.map((w, i) => `
      ${i > 0 ? '<div class="lc-kk-divider"></div>' : ''}
      <div class="lc-kk-word">
        <div class="lc-kk-word-top">
          <div class="lc-kk-arabic">${escapeHtml(w.arabic || w.word || '')}</div>
          <div>
            <div class="lc-kk-trans">${escapeHtml(w.transliteration || '')}</div>
            <div class="lc-kk-meaning">${escapeHtml(w.meaning || '')}</div>
          </div>
        </div>
        <div class="lc-kk-explain">${escapeHtml(w.explanation || '')}</div>
      </div>
    `).join('')}
  </div>`;
}

function buildCardDoa(doa, doaVerse) {
  if (!doa) return '';
  const ref = doaVerse ? `QS. ${escapeHtml(doaVerse.surah_name)}: ${doa.ayah}` : `QS. ${doa.surah}: ${doa.ayah}`;

  return `<div class="lc-doa-body">
    <div class="lc-card-label lc-label-gold">\uD83E\uDD32 Doa Terkait</div>
    <div class="lc-doa-intro">${escapeHtml(doa.intro || '')}</div>
    <div class="lc-doa-verse-card">
      ${doaVerse ? `
        <div class="lc-doa-arabic">${escapeHtml(doaVerse.text_arabic || '')}</div>
        <div class="lc-doa-divider"></div>
        <div class="lc-doa-translation">${escapeHtml(doaVerse.text_indonesian || '')}</div>
      ` : ''}
      <div class="lc-doa-ref">${ref}</div>
      ${doaVerse ? `<div class="lc-doa-audio-wrap"><button class="lc-audio-btn lc-audio-dark" data-action="lcPlayAudio" data-src="doa">\u25B6 Dengarkan Doa</button></div>` : ''}
    </div>
    ${doa.practical_tip ? `
      <div class="lc-tip-box">
        <div class="lc-tip-text">\uD83D\uDCA1 <strong>${escapeHtml(doa.practical_tip)}</strong></div>
      </div>` : ''}
  </div>`;
}

function buildCardRenungan(renungan) {
  if (!renungan) return '';
  const qs = renungan.questions || [];
  return `<div class="lc-renungan-body">
    <div class="lc-card-label lc-label-teal">\uD83D\uDCAD Renungan</div>
    <div class="lc-renungan-scenario">
      <div class="lc-renungan-scenario-text">${escapeHtml(renungan.scenario || '')}</div>
    </div>
    <div class="lc-renungan-divider"></div>
    ${qs[0] ? `<div class="lc-renungan-q1">${escapeHtml(qs[0])}</div>` : ''}
    ${qs[1] ? `<div class="lc-renungan-q2">${escapeHtml(qs[1])}</div>` : ''}
    <div class="lc-renungan-note">Tidak ada jawaban benar atau salah.</div>
    <button class="lc-nuri-btn" data-action="lcNuriBridge" data-from="renungan">\uD83D\uDCAC Bahas renungan ini dengan Nuri</button>
  </div>`;
}

function buildCardActions(lesson) {
  const orderNum = lesson.order_num;
  const hasNext = orderNum < lcTotalLessons;
  return `<div class="lc-actions-body">
    <div class="lc-actions-done">
      <div class="lc-actions-emoji">\u2728</div>
      <div class="lc-actions-title">Pelajaran ${orderNum} selesai</div>
      <div class="lc-actions-sub">${escapeHtml(lesson.title)}</div>
    </div>
    <div class="lc-actions-btns">
      ${hasNext ? `<button class="lc-btn-primary" data-action="lcNextLesson">Lanjut Pelajaran ${orderNum + 1} \u2192</button>` : `<button class="lc-btn-primary" data-action="lcFinishPath">Selesai \u2192</button>`}
      <button class="lc-btn-outline" data-action="lcNuriBridge" data-from="actions">\uD83D\uDCAC Tanya Nuri soal ayat ini</button>
      <div class="lc-btn-row">
        <button class="lc-btn-gray" data-action="lcSave">\uD83D\uDCDD Simpan</button>
        <button class="lc-btn-gray" data-action="lcShare">\uD83D\uDCE4 Bagikan</button>
      </div>
    </div>
  </div>`;
}

// ── Bottom Nav ──

function renderBottomNav() {
  const card = lcCards[lcCardIdx];
  const isVerse = card.id === 'verse';
  const total = lcCards.length;

  let html = '';

  html += '<div class="lc-nav-row">';
  html += lcCardIdx > 0
    ? `<button class="lc-nav-prev" data-action="lcPrev">\u2190 Sebelumnya</button>`
    : '<span class="lc-nav-prev" style="visibility:hidden">\u2190 Sebelumnya</span>';
  html += `<span class="lc-nav-counter">${lcCardIdx + 1} / ${total}</span>`;

  if (lcCardIdx < total - 1) {
    const next = lcCards[lcCardIdx + 1];
    const label = next.id === 'konteks' ? 'Lihat Konteks' : next.id === 'katakunci' ? 'Kata Kunci' :
      next.id === 'doa' ? 'Doa Terkait' : next.id === 'renungan' ? 'Renungkan' :
      next.id === 'actions' ? 'Selesai' : 'Lanjut';
    html += `<button class="lc-nav-next" data-action="lcNext">${label} \u2192</button>`;
  } else {
    html += '<span style="width:80px"></span>';
  }

  html += '</div>';
  return html;
}

// ── Navigation ──

function lcNext() {
  if (lcCardIdx < lcCards.length - 1) {
    lcCardIdx++;
    lcAnimDir = 'right';
    renderLcCard();
  }
}

function lcPrev() {
  if (lcCardIdx > 0) {
    lcCardIdx--;
    lcAnimDir = 'left';
    renderLcCard();
  }
}

function lcNextLesson() {
  const nextIdx = lcData.lesson.order_num; // order_num is 1-based, so this is the 0-based index of next
  if (nextIdx < lcPathLessons.length) {
    startLesson(nextIdx);
  } else {
    switchView('path-preview-view');
  }
}

// ── Swipe Gesture ──

function lcHandleTouchStart(e) {
  lcTouchStartX = e.touches[0].clientX;
  lcTouchStartY = e.touches[0].clientY;
  lcTouchLocked = null;
  lcIsSwiping = true;
  lcSwipeX = 0;
}

function lcHandleTouchMove(e) {
  if (!lcIsSwiping) return;
  const dx = e.touches[0].clientX - lcTouchStartX;
  const dy = e.touches[0].clientY - lcTouchStartY;

  if (lcTouchLocked === null) {
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      lcTouchLocked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
    return;
  }

  if (lcTouchLocked === 'v') return;
  e.preventDefault();

  if ((dx > 0 && lcCardIdx === 0) || (dx < 0 && lcCardIdx === lcCards.length - 1)) {
    lcSwipeX = dx * 0.2;
  } else {
    lcSwipeX = dx;
  }

  const wrap = document.getElementById('lc-card-wrap');
  if (wrap) {
    wrap.style.transition = 'none';
    wrap.style.transform = `translateX(${lcSwipeX}px)`;
  }
}

function lcHandleTouchEnd() {
  if (lcTouchLocked === 'h') {
    if (lcSwipeX < -60) lcNext();
    else if (lcSwipeX > 60) lcPrev();
  }

  const wrap = document.getElementById('lc-card-wrap');
  if (wrap) {
    wrap.style.transition = 'transform 0.25s ease-out';
    wrap.style.transform = 'none';
  }

  lcSwipeX = 0;
  lcIsSwiping = false;
  lcTouchLocked = null;
}

// ── Verse Bar Toggle ──

function lcToggleVerseBar() {
  lcVerseBarOpen = !lcVerseBarOpen;
  const bar = document.getElementById('lc-verse-bar');
  const content = document.getElementById('lc-vb-content');
  const hint = document.getElementById('lc-vb-hint');
  const chevron = document.getElementById('lc-vb-chevron');

  bar.classList.toggle('open', lcVerseBarOpen);
  if (content) content.style.display = lcVerseBarOpen ? '' : 'none';
  if (hint) hint.style.display = lcVerseBarOpen ? 'none' : '';
  if (chevron) chevron.classList.toggle('open', lcVerseBarOpen);
}

// ── Play Audio ──

function lcPlayAudio(src, btn) {
  const verse = lcData?.verse;
  if (!verse) return;

  let surah, ayah;
  if (src === 'doa' && lcData.content?.doa) {
    surah = lcData.content.doa.surah;
    ayah = lcData.content.doa.ayah;
  } else {
    surah = verse.surah_number;
    ayah = verse.ayah_number;
  }

  const fakeVerse = { id: `${surah}:${ayah}`, surah_name: verse.surah_name };
  playAudio(fakeVerse, btn);
}

// ── Progress Tracking ──

function markLessonComplete() {
  if (!lcData || !lcData.lesson) return;
  const progress = JSON.parse(localStorage.getItem('nuri-progress') || '{}');
  if (progress[lcData.lesson.id]) return;
  progress[lcData.lesson.id] = true;
  localStorage.setItem('nuri-progress', JSON.stringify(progress));
  logEvent('lp_lesson_viewed', { lesson_id: lcData.lesson.id, path_id: lcPathId });

  if (lcFromCurriculum) {
    const cp = JSON.parse(localStorage.getItem('tq-curriculum-progress') || '{}');
    const curr = cp[lcFromCurriculum.id] || { current_path_index: lcFromCurriculum.pathIndex || 0, current_lesson: 1, started_at: new Date().toISOString(), paths_completed: [] };
    const orderNum = lcData.lesson.order_num;
    if (orderNum >= lcTotalLessons) {
      if (!curr.paths_completed.includes(lcPathId)) curr.paths_completed.push(lcPathId);
      curr.current_lesson = 1;
      curr.current_path_index = (lcFromCurriculum.pathIndex || 0) + 1;
    } else {
      curr.current_lesson = orderNum + 1;
    }
    cp[lcFromCurriculum.id] = curr;
    localStorage.setItem('tq-curriculum-progress', JSON.stringify(cp));
  }
}

// ── Nuri Bridge ──

function lcNuriBridge(from) {
  if (!lcData) return;
  const verse = lcData.verse;
  const content = lcData.content;

  window._nuriLessonContext = {
    path_title: lcPathTitle,
    lesson_title: lcData.lesson.title,
    verse_ref: verse ? `${verse.surah_name}: ${verse.ayah_number}` : '',
    insight_pull_quote: content?.insight?.pull_quote || '',
    renungan_questions: content?.renungan?.questions || [],
  };

  window._lcReturnTo = { cardIdx: lcCardIdx };
  switchView('nuri-view');
  if (typeof startNuriSession === 'function') startNuriSession();
}

