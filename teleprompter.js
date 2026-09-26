(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const dialog = el('prompter');
  const viewport = el('promptViewport');
  const text = el('promptText');
  const input = el('promptInput');
  const speed = el('promptSpeed');
  const size = el('promptSize');
  const storageKey = 'track-sheet-teleprompter-v1';
  let playing = false;
  let frame = 0;
  let lastTime = null;
  let position = 0;
  let wakeLock = null;

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({lyrics: input.value, speed: speed.value, size: size.value}));
      el('draftStatus').textContent = 'Lyrics and settings saved in this browser. Use your usual app to record.';
    } catch {
      el('draftStatus').textContent = 'Browser storage is unavailable. Keep a copy of your lyrics before closing this page.';
    }
  }
  try {
    const draft = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (draft) {
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
    if (playing) { pause(); return; }
    if (viewport.scrollTop >= viewport.scrollHeight - viewport.clientHeight - 1) viewport.scrollTop = 0;
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
  el('openPrompter').onclick = () => {
    if (!input.value.trim()) { el('promptMessage').textContent = 'Paste your lyrics above to start your take.'; input.focus(); return; }
    text.textContent = input.value;
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
    pause('Ready');
    viewport.scrollTop = position = 0;
    el('playPrompt').textContent = 'Start';
  };
  function settings() {
    el('speedValue').textContent = speed.value + ' px/s';
    el('sizeValue').textContent = size.value + ' px';
    text.style.fontSize = size.value + 'px';
    position = viewport.scrollTop;
  }
  [speed, size].forEach(control => control.addEventListener('input', () => { settings(); save(); }));
  settings();
  ['wheel', 'touchstart', 'pointerdown'].forEach(event => viewport.addEventListener(event, () => { if (playing) pause(); }, {passive: true}));
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
  document.addEventListener('visibilitychange', () => { if (document.hidden && playing) pause('Paused while away'); });
})();
