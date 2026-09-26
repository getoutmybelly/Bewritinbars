(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const dialog = el('prompter');
  const viewport = el('promptViewport');
  const text = el('promptText');
  const input = el('promptInput');
  const speed = el('promptSpeed');
  const size = el('promptSize');
  const countdown = el('promptCountdown');
  const spacing = el('promptSpacing');
  const width = el('promptWidth');
  let countdownTimer = 0;
  let counting = false;
  let needsCountIn = true;
  const storageKey = 'track-sheet-teleprompter-v1';
  let playing = false;
  let frame = 0;
  let lastTime = null;
  let position = 0;
  let wakeLock = null;

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({lyrics: input.value, speed: speed.value, size: size.value, countdown: countdown.value, spacing: spacing.value, width: width.value}));
      el('draftStatus').textContent = 'Lyrics and settings saved in this browser. Use your usual app to record.';
    } catch {
      el('draftStatus').textContent = 'Browser storage is unavailable. Keep a copy of your lyrics before closing this page.';
    }
  }
  try {
    const draft = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (draft) {
      if ([0, 3, 5, 10].includes(Number(draft.countdown))) countdown.value = draft.countdown;
      if (Number(draft.spacing) >= 1.2 && Number(draft.spacing) <= 2.4) spacing.value = draft.spacing;
      if (Number(draft.width) >= 50 && Number(draft.width) <= 100) width.value = draft.width;
      if (typeof draft.lyrics === 'string') input.value = draft.lyrics;
      if (Number(draft.speed) >= 5 && Number(draft.speed) <= 160) speed.value = draft.speed;
      if (Number(draft.size) >= 24 && Number(draft.size) <= 88) size.value = draft.size;
    }
  } catch { /* A fresh draft remains usable when storage is unavailable. */ }

  function mode(prompt) {
    el('builderWorkspace').hidden = prompt;
    el('prompterSetup').hidden = !prompt;
    el('builderMode').setAttribute('aria-pressed', String(!prompt));
    el('prompterMode').setAttribute('aria-pressed', String(prompt));
  }
  el('builderMode').onclick = () => mode(false);
  el('prompterMode').onclick = () => mode(true);
  input.addEventListener('input', save);
  el('useSong').onclick = () => {
    const sections = currentGenre ? GENRES[currentGenre].sections : [];
    const lyrics = sections.map((section, i) => {
      const data = songData[i];
      if (!data.lyrics.trim() && !data.adlib.trim()) return '';
      return '[' + section.name + ']\n' + [data.lyrics.trim(), data.adlib.trim() ? '(' + data.adlib.trim() + ')' : ''].filter(Boolean).join('\n');
    }).filter(Boolean).join('\n\n');
    if (!lyrics) { el('promptMessage').textContent = 'Add lyrics in the song builder first, or paste them above.'; return; }
    if (input.value.trim() && input.value !== lyrics && !confirm('Replace the teleprompter lyrics with your song builder lyrics?')) return;
    input.value = lyrics;
    save();
    el('promptMessage').textContent = 'Song builder lyrics loaded. You can edit them here before your take.';
  };
  async function keepAwake() {
    if (!navigator.wakeLock || wakeLock) return;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (!playing || !dialog.open) { await lock.release(); return; }
      wakeLock = lock;
      lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
    } catch { /* Scrolling works without wake-lock permission. */ }
  }
  function pause(status = 'Paused') {
    clearInterval(countdownTimer);
    counting = false;
    el('countdownOverlay').hidden = true;
    playing = false;
    cancelAnimationFrame(frame);
    lastTime = null;
    el('playPrompt').textContent = 'Resume';
    el('playStatus').textContent = status;
    if (wakeLock) { const lock = wakeLock; wakeLock = null; lock.release().catch(() => {}); }
  }
  function tick(now) {
    if (!playing) return;
    if (lastTime !== null) {
      position += Number(speed.value) * Math.min((now - lastTime) / 1000, 0.1);
      viewport.scrollTop = position;
      if (position >= viewport.scrollHeight - viewport.clientHeight) { pause('End of lyrics'); el('playPrompt').textContent = 'Play again'; return; }
    }
    lastTime = now;
    frame = requestAnimationFrame(tick);
  }
  function play() {
    if (playing || counting) { pause(); return; }
    if (viewport.scrollTop >= viewport.scrollHeight - viewport.clientHeight - 1) { viewport.scrollTop = 0; needsCountIn = true; }
    if (needsCountIn && Number(countdown.value)) {
      counting = true;
      let remaining = Number(countdown.value);
      const overlay = el('countdownOverlay');
      overlay.textContent = remaining; overlay.hidden = false;
      el('playPrompt').textContent = 'Cancel';
      el('playStatus').textContent = 'Get ready';
      countdownTimer = setInterval(() => {
        remaining -= 1;
        if (remaining > 0) overlay.textContent = remaining;
        else { clearInterval(countdownTimer); counting = false; overlay.hidden = true; needsCountIn = false; play(); }
      }, 1000);
      return;
    }
    needsCountIn = false;
    position = viewport.scrollTop;
    lastTime = null;
    playing = true;
    el('playPrompt').textContent = 'Pause';
    el('playStatus').textContent = 'Scrolling';
    keepAwake();
    frame = requestAnimationFrame(tick);
  }
  function layout() {
    const height = viewport.clientHeight;
    text.style.setProperty('--prompt-lead', height * 0.3 + 'px');
    text.style.setProperty('--prompt-tail', height * 0.7 + 'px');
    position = viewport.scrollTop;
  }
  new ResizeObserver(layout).observe(viewport);
  function renderLyrics() {
    text.replaceChildren();
    const menu = el('promptSection');
    menu.replaceChildren(new Option('Beginning', ''));
    input.value.split('\n').forEach((line, index) => {
      const node = document.createElement('span');
      node.textContent = line + '\n';
      const label = line.trim();
      if (/^\[[^\]]+\]$/.test(label) || /^(?:verse|hook|chorus|intro|outro|bridge|pre-chorus|refrain|breakdown)(?:\s+\d+)?\s*:?$/i.test(label)) {
        node.id = 'lyric-section-' + index;
        node.className = 'lyric-section';
        menu.add(new Option(label.replace(/^\[|\]$/g, ''), node.id));
      }
      text.appendChild(node);
    });
  }
  function reposition(top, status) {
    pause(status);
    viewport.scrollTop = Math.max(0, top);
    position = viewport.scrollTop;
    needsCountIn = true;
    el('playPrompt').textContent = 'Start';
  }
  el('rewindPrompt').onclick = () => reposition(viewport.scrollTop - parseFloat(getComputedStyle(text).lineHeight) * 4, 'Back 4 lines — ready');
  el('promptSection').onchange = event => {
    const target = event.target.value ? el(event.target.value) : null;
    const top = target ? target.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop - viewport.clientHeight * 0.3 : 0;
    reposition(top, target ? 'Section ready' : 'Ready');
  };
  el('openPrompter').onclick = () => {
    if (!input.value.trim()) { el('promptMessage').textContent = 'Paste your lyrics above to start your take.'; input.focus(); return; }
    renderLyrics();
    needsCountIn = true;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    layout();
    viewport.scrollTop = position = 0;
    el('playPrompt').textContent = 'Start';
    el('playStatus').textContent = 'Ready';
    el('playPrompt').focus();
  };
  el('closePrompter').onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    pause();
    document.body.style.overflow = '';
    if (document.fullscreenElement === dialog) document.exitFullscreen().catch(() => {});
    el('openPrompter').focus();
  });
  el('playPrompt').onclick = play;
  el('restartPrompt').onclick = () => {
    reposition(0, 'Ready');
    el('promptSection').value = '';
    el('playPrompt').textContent = 'Start';
  };
  function settings() {
    el('speedValue').textContent = speed.value + ' px/s';
    el('sizeValue').textContent = size.value + ' px';
    text.style.fontSize = size.value + 'px';
    text.style.lineHeight = spacing.value;
    text.style.width = width.value + '%';
    el('spacingValue').textContent = spacing.value + '×';
    el('widthValue').textContent = width.value + '%';
    position = viewport.scrollTop;
  }
  [speed, size, countdown, spacing, width].forEach(control => control.addEventListener('input', () => { settings(); save(); }));
  settings();
  ['wheel', 'touchstart', 'pointerdown'].forEach(event => viewport.addEventListener(event, () => { if (playing || counting) pause(); }, {passive: true}));
  viewport.addEventListener('scroll', () => { if (!playing) position = viewport.scrollTop; });
  dialog.addEventListener('keydown', event => {
    if (event.target.matches('input, textarea, select')) return;
    if (event.code === 'Space' && !event.target.closest('button')) { event.preventDefault(); play(); }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      speed.value = Math.max(5, Math.min(160, Number(speed.value) + (event.key === 'ArrowUp' ? 5 : -5)));
      settings(); save();
    }
  });
  if (!dialog.requestFullscreen) el('fullscreenPrompt').hidden = true;
  el('fullscreenPrompt').onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await dialog.requestFullscreen();
    } catch { el('playStatus').textContent = 'Full screen unavailable — you can still perform in this view.'; }
  };
  document.addEventListener('fullscreenchange', () => { el('fullscreenPrompt').textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen'; });
  document.addEventListener('visibilitychange', () => { if (document.hidden && (playing || counting)) pause('Paused while away'); });
})();
