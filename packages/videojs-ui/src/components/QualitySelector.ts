import type { VideoJsPlayer } from '../types.js';

export type QualityInfo = {
  index: number;
  height: number;
};

export type QualitySelectorInstance = {
  updateQualities: (qualities: QualityInfo[]) => void;
  destroy: () => void;
};

/**
 * Injects a native <select> quality dropdown into the video.js control bar,
 * inserted before the fullscreen button.
 */
export function initializeQualitySelector(
  videoPlayer: VideoJsPlayer,
  onSelect: (index: number | 'auto') => void,
): QualitySelectorInstance {
  const controlBarEl = videoPlayer.el().querySelector('.vjs-control-bar');
  if (!controlBarEl) {
    return { updateQualities: () => {}, destroy: () => {} };
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'vjs-control vjs-quality-selector';

  const select = document.createElement('select');
  select.className = 'vjs-quality-select';
  select.setAttribute('aria-label', 'Video quality');

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'HD ▾';
  placeholder.disabled = true;
  placeholder.selected = true;
  select.appendChild(placeholder);

  select.addEventListener('change', () => {
    const val = select.value;
    onSelect(val === 'auto' ? 'auto' : parseInt(val, 10));
  });

  wrapper.appendChild(select);

  const fullscreen = controlBarEl.querySelector('.vjs-fullscreen-control');
  if (fullscreen) {
    controlBarEl.insertBefore(wrapper, fullscreen);
  } else {
    controlBarEl.appendChild(wrapper);
  }

  return {
    updateQualities(qualities: QualityInfo[]): void {
      select.innerHTML = '';
      const autoOpt = document.createElement('option');
      autoOpt.value = 'auto';
      autoOpt.textContent = 'Auto';
      select.appendChild(autoOpt);
      for (const q of qualities) {
        const opt = document.createElement('option');
        opt.value = String(q.index);
        opt.textContent = `${q.height}p`;
        select.appendChild(opt);
      }
      if (qualities.length > 0) {
        select.value = String(qualities[qualities.length - 1].index);
      }
    },
    destroy(): void {
      wrapper.remove();
    },
  };
}
