'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// nuri.js — Nuri chat functions (session, messages, formatting, send flow)
// Depends on: data.js, core.js
// Note: escapeHtml() is defined in core.js — the duplicate that was here
// in the monolithic app.js has been removed.
// ══════════════════════════════════════════════════════════════════════════════

// ── Nuri — Chat Functions ─────────────────────────────────────────────────────

function startNuriSession() {
  nuriMessages = [];
  nuriOptedIn = false;
  nuriSessionId = generateUUID();
  nuriExchangeCount = 0;
  nuriConversationMode = null;
  nuriIsTyping = false;
  nuriLastFailedMessage = null;

  document.getElementById('nuriMessages').innerHTML = '';

  const nuriInput = document.getElementById('nuriInput');
  const nuriSendBtn = document.getElementById('nuriSendBtn');
  if (nuriInput) nuriInput.disabled = false;
  if (nuriSendBtn) nuriSendBtn.disabled = false;

  switchView('nuri-view');

  const lessonCtx = window._nuriLessonContext;

  if (lessonCtx && lessonCtx.renungan_questions && lessonCtx.renungan_questions.length > 0) {
    // Came from lesson renungan — contextual opening + auto-send
    appendNuriMessage('Halo! Kamu baru selesai belajar tentang *' + (lessonCtx.path_title || '') + '*. Yuk, kita bahas renungannya bareng! \uD83C\uDF3F', false);

    const autoMsg = 'Saya baru belajar tentang ' + (lessonCtx.path_title || '') + ' dan mau bahas renungan ini';
    appendUserMessage(autoMsg);
    nuriMessages.push({ role: 'user', content: autoMsg });

    // Send to API with lesson context (isRetry=true to skip re-appending user bubble)
    _sendNuriMessageInternal(autoMsg, true);
  } else {
    appendNuriMessage(getNuriOpeningMessage() + '\n\nAda yang ingin kamu tanyakan atau pelajari dari Al-Qur\'an?', false);
  }

  logEvent('nuri_session_started', { session_id: nuriSessionId });
}

function appendNuriMessage(text, showFeedback = true) {
  const wrap = document.createElement('div');
  wrap.className = 'nuri-bubble-wrap nuri';

  // Avatar
  const avatar = document.createElement('div');
  avatar.className = 'nuri-bubble-avatar';
  avatar.innerHTML = '<span class="nuri-avatar-icon">\u{1F4D6}</span>';

  // Bubble
  const bubble = document.createElement('div');
  bubble.className = 'nuri-bubble';
  bubble.innerHTML = formatNuriMessage(text);

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  document.getElementById('nuriMessages').appendChild(wrap);

  // Feedback row — only if opted in and showFeedback is true
  if (nuriOptedIn && showFeedback) {
    const idx = nuriExchangeCount;
    const feedbackRow = document.createElement('div');
    feedbackRow.className = 'nuri-feedback-row';
    feedbackRow.innerHTML = `
      <button class="nuri-feedback-btn" data-idx="${idx}" data-signal="positive">\u{1F44D}</button>
      <button class="nuri-feedback-btn" data-idx="${idx}" data-signal="negative">\u{1F44E}</button>
    `;
    feedbackRow.querySelectorAll('.nuri-feedback-btn').forEach(btn => {
      btn.addEventListener('click', () => handleNuriFeedback(idx, btn.dataset.signal, btn));
    });
    document.getElementById('nuriMessages').appendChild(feedbackRow);
  }

  nuriScrollToBottom();
}

function appendUserMessage(text) {
  const wrap = document.createElement('div');
  wrap.className = 'nuri-bubble-wrap user';
  const bubble = document.createElement('div');
  bubble.className = 'nuri-bubble';
  bubble.textContent = text;
  wrap.appendChild(bubble);
  document.getElementById('nuriMessages').appendChild(wrap);
  nuriScrollToBottom();
}


// escapeHtml() — defined in core.js (was duplicated here in the monolithic file)

function formatNuriMessage(text) {
  // Extract verse blocks first, escape all prose, then re-insert verse HTML.
  const placeholders = [];
  let safe = text
    .replace(/\{ARABIC\}([\s\S]*?)\{\/ARABIC\}/g, (_, arabic) => {
      const idx = placeholders.length;
      placeholders.push('<span class="nuri-verse-arabic">' + escapeHtml(arabic.trim()) + '</span>');
      return `\x00PH${idx}\x00`;
    })
    .replace(/\{TRANSLATION\}([\s\S]*?)\{\/TRANSLATION\}/g, (_, tr) => {
      const idx = placeholders.length;
      placeholders.push('<span class="nuri-verse-translation">"' + escapeHtml(tr.trim()) + '"</span>');
      return `\x00PH${idx}\x00`;
    })
    .replace(/\{REF\}([\s\S]*?)\{\/REF\}/g, (_, ref) => {
      const idx = placeholders.length;
      placeholders.push('<span class="nuri-verse-ref">\u2014 ' + escapeHtml(ref.trim()) + '</span>');
      return `\x00PH${idx}\x00`;
    });
  // Escape the prose text (everything outside verse blocks)
  safe = escapeHtml(safe);
  // Restore verse block HTML and convert newlines
  safe = safe.replace(/\x00PH(\d+)\x00/g, (_, i) => placeholders[+i]);
  return safe.replace(/\n/g, '<br>');
}

function showNuriTypingIndicator() {
  const typing = document.createElement('div');
  typing.className = 'nuri-typing';
  typing.id = 'nuriTyping';
  typing.innerHTML = `
    <div class="nuri-bubble-avatar"><span class="nuri-avatar-icon">\u{1F4D6}</span></div>
    <div class="nuri-typing-dots">
      <div class="nuri-typing-dot"></div>
      <div class="nuri-typing-dot"></div>
      <div class="nuri-typing-dot"></div>
    </div>`;
  document.getElementById('nuriMessages').appendChild(typing);
  nuriScrollToBottom();
}

function hideNuriTypingIndicator() {
  const el = document.getElementById('nuriTyping');
  if (el) el.remove();
}

function nuriScrollToBottom() {
  const el = document.getElementById('nuriMessages');
  if (el) el.scrollTop = el.scrollHeight;
}

// ── Quick Reply System ──────────────────────────────────────────────────────

function renderQuickReplies(replies) {
  if (!replies || !replies.length) return;
  const qr = document.createElement('div');
  qr.className = 'nuri-quick-replies';
  if (replies.some(r => (r.label || '').length > 25)) qr.classList.add('single-col');
  replies.forEach(chip => {
    const btn = document.createElement('button');
    btn.className = 'nuri-qr-chip';
    btn.textContent = chip.label;
    btn.dataset.message = chip.message || '';
    if (chip.action) btn.dataset.qrAction = chip.action;
    btn.addEventListener('click', () => handleQuickReplyTap(btn, qr));
    qr.appendChild(btn);
  });
  document.getElementById('nuriMessages').appendChild(qr);
  nuriScrollToBottom();
}

function handleQuickReplyTap(btn, container) {
  btn.classList.add('selected');
  container.classList.add('used');
  const message = btn.dataset.message;
  if (message) sendNuriMessageText(message);
}

function sendNuriMessageText(text) {
  if (!text) return;
  const input = document.getElementById('nuriInput');
  if (input) input.value = text;
  sendNuriMessage();
}

function appendNuriSessionEndMessage() {
  const el = document.createElement('div');
  el.className = 'nuri-session-end';
  el.textContent =
    'Kita udah ngobrol banyak hari ini! Simpan yang paling berkesan, dan balik lagi kapan aja ya \u{1F319}';
  document.getElementById('nuriMessages').appendChild(el);
  document.getElementById('nuriInput').disabled = true;
  document.getElementById('nuriSendBtn').disabled = true;
  nuriScrollToBottom();

  logEvent('nuri_session_ended_limit', { session_id: nuriSessionId });
}

function handleNuriFeedback(exchangeIndex, signal, btn) {
  // Visual feedback
  btn.parentElement.querySelectorAll('.nuri-feedback-btn')
    .forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');

  // Log — only if opted in
  if (!nuriOptedIn) return;

  logEvent('nuri_feedback', {
    session_id: nuriSessionId,
    exchange_index: exchangeIndex,
    signal: signal,
  });
}

// ── Send message flow ─────────────────────────────────────────────────────────

function appendNuriRetryButton() {
  const row = document.createElement('div');
  row.className = 'nuri-retry-row';
  row.innerHTML = '<button class="nuri-retry-btn">Coba lagi \u{1F504}</button>';
  row.querySelector('.nuri-retry-btn').addEventListener('click', () => {
    row.remove();
    // Remove the error message bubble above
    const msgs = document.getElementById('nuriMessages');
    const lastBubble = msgs.querySelector('.nuri-bubble-wrap.nuri:last-of-type');
    if (lastBubble) lastBubble.remove();
    retryNuriMessage();
  });
  document.getElementById('nuriMessages').appendChild(row);
  nuriScrollToBottom();
}

function retryNuriMessage() {
  if (!nuriLastFailedMessage) return;
  const text = nuriLastFailedMessage;
  nuriLastFailedMessage = null;
  // Don't pop from nuriMessages — the user message is still valid in history.
  // Just re-send without re-appending the user bubble.
  _sendNuriMessageInternal(text, true);
}

async function sendNuriMessage() {
  const input = document.getElementById('nuriInput');
  const text = input.value.trim();
  if (!text || nuriIsTyping) return;
  _sendNuriMessageInternal(text, false);
}

async function _sendNuriMessageInternal(text, isRetry) {
  if (nuriIsTyping) return;

  if (nuriExchangeCount >= NURI_CONFIG.maxExchanges) {
    appendNuriSessionEndMessage();
    return;
  }

  const input = document.getElementById('nuriInput');

  if (!isRetry) {
    input.value = '';
    input.style.height = 'auto';
  }
  nuriIsTyping = true;
  nuriLastFailedMessage = null;
  document.getElementById('nuriSendBtn').disabled = true;

  if (!isRetry) {
    appendUserMessage(text);
    nuriMessages.push({ role: 'user', content: text });
  }

  showNuriTypingIndicator();

  const contextMessages = nuriMessages.slice(-(NURI_CONFIG.contextWindow * 2));

  try {
    const payload = JSON.stringify({
      mode: 'dewasa',
      conversation_mode: nuriConversationMode,
      messages: contextMessages,
      opted_in: nuriOptedIn,
      session_id: nuriSessionId,
      exchange_count: nuriExchangeCount,
      lesson_context: window._nuriLessonContext || null,
    });

    // Auto-retry once on failure (handles Vercel cold-start 500s)
    let data = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch('/api/nuri', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        });
        if (!res.ok) {
          if (attempt === 0) { continue; }
          throw new Error(`HTTP ${res.status}`);
        }
        data = await res.json();
        if (data.error) {
          if (attempt === 0) { data = null; continue; }
        }
        break;
      } catch (fetchErr) {
        if (attempt === 0) { continue; }
        throw fetchErr;
      }
    }

    hideNuriTypingIndicator();

    if (!data || data.error) {
      nuriLastFailedMessage = text;
      appendNuriMessage('Maaf, ada kendala teknis. Coba lagi ya \u{1F64F}', false);
      appendNuriRetryButton();
      logEvent('nuri_error', { session_id: nuriSessionId, error_type: data?.error || 'unknown' });
      return;
    }

    if (data.conversation_mode && !nuriConversationMode) {
      nuriConversationMode = data.conversation_mode;
    }

    nuriMessages.push({ role: 'assistant', content: data.nuri_response_raw });
    appendNuriMessage(data.nuri_response_formatted);

    if (data.quick_replies && data.quick_replies.length > 0) {
      renderQuickReplies(data.quick_replies);
    }

    nuriExchangeCount++;

    logEvent('nuri_exchange_completed', {
      session_id: nuriSessionId,
      exchange_index: nuriExchangeCount,
      conversation_mode: nuriConversationMode,
    });

    if (nuriExchangeCount === NURI_CONFIG.maxExchanges) {
      appendNuriSessionEndMessage();
    }

  } catch (err) {
    hideNuriTypingIndicator();
    nuriLastFailedMessage = text;
    appendNuriMessage('Maaf, ada kendala teknis. Coba lagi ya \u{1F64F}', false);
    appendNuriRetryButton();
    logEvent('nuri_error', { session_id: nuriSessionId, error_type: 'network' });
  } finally {
    nuriIsTyping = false;
    document.getElementById('nuriSendBtn').disabled = false;
    input.focus();
  }
}

// Auto-resize textarea
document.getElementById('nuriInput')?.addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 100) + 'px';
});

document.getElementById('nuriInput')?.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendNuriMessage();
  }
});

// Nuri event listeners
document.getElementById('nuriSendBtn')?.addEventListener('click', sendNuriMessage);
// nuriStartBtn and nuriLandingCard removed — Nuri entry now via belajar-view
document.getElementById('nuriBackBtn')?.addEventListener('click', () => {
  if (window._lcReturnTo) {
    const returnTo = window._lcReturnTo;
    window._lcReturnTo = null;
    window._nuriLessonContext = null;
    // Return to lesson-view at the correct card
    switchView('lesson-view');
    if (typeof lcCardIdx !== 'undefined' && returnTo.cardIdx !== undefined) {
      lcCardIdx = returnTo.cardIdx;
      renderLcCard();
    }
  } else {
    switchView('landing-view');
  }
});
