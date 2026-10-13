// App-wide looping background video (muted, no audio, decorative), plus PWA service-worker registration.
// Falls back to the still poster when the visitor prefers reduced motion, has Data Saver on, or is on a slow network.

let started = false;

function shouldPlayVideo() {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  const c = navigator.connection;
  if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) return false;
  return true;
}

export function setupApp() {
  if (started) return;
  started = true;

  const wrap = document.createElement('div');
  wrap.className = 'bg-video';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.style.backgroundImage = 'url(/media/hero-poster.jpg)';

  if (shouldPlayVideo()) {
    const v = document.createElement('video');
    v.muted = true; // must be set as a property for iOS autoplay
    v.defaultMuted = true;
    v.loop = true;
    v.autoplay = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.disablePictureInPicture = true;
    v.preload = 'metadata';
    v.poster = '/media/hero-poster.jpg';
    v.tabIndex = -1;
    // Smaller file for phones. (<source media> is ignored on video elements, so choose here.) MP4 first for iOS/Safari,
    // WebM as a fallback for browsers built without H.264.
    const small = window.matchMedia?.('(max-width: 720px)').matches;
    const base = small ? '/media/hero-small' : '/media/hero';
    [['mp4', 'video/mp4'], ['webm', 'video/webm']].forEach(([ext, type]) => {
      const src = document.createElement('source');
      src.src = `${base}.${ext}`;
      src.type = type;
      v.append(src);
    });
    wrap.append(v);
    const play = () => {
      if (document.hidden || v.error) return;
      v.play().catch(() => { /* The poster remains visible if autoplay is blocked. */ });
    };
    const retryPlay = () => play();
    v.addEventListener('canplay', play, { once: true });
    v.addEventListener('playing', () => {
      v.classList.add('ready');
      window.removeEventListener('pointerdown', retryPlay);
    }, { once: true });
    v.addEventListener('error', () => v.classList.remove('ready'));
    // Save battery: stop decoding while the tab is hidden.
    document.addEventListener('visibilitychange', () => (document.hidden ? v.pause() : play()));
    // iOS may block autoplay until the first touch.
    window.addEventListener('pointerdown', retryPlay, { passive: true });
  }

  const shade = document.createElement('div');
  shade.className = 'bg-shade';
  shade.setAttribute('aria-hidden', 'true');
  document.body.prepend(shade);
  document.body.prepend(wrap);
  document.body.classList.add('bg-on');

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
}
