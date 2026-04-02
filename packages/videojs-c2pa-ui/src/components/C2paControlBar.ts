import videojs from 'video.js';
import type { VideoJsPlayer, VjsComponent } from '../types.js';

const COMPONENT_NAME = 'C2PALoadProgressBar';

/**
 * Registers the C2PA custom progress bar and adds it to the player's seek bar.
 * The default LoadProgressBar update is disabled so the C2PA timeline takes
 * full control of segment rendering.
 *
 * Returns the registered component instance.
 */
export function registerControlBar(videoPlayer: VideoJsPlayer): VjsComponent {
  const LoadProgressBar = videojs.getComponent('LoadProgressBar');

  class C2PALoadProgressBar extends LoadProgressBar {
    // Suppress the default progress bar update — timeline is managed by C2paTimeline
    update(_e?: Event): void {}
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  videojs.registerComponent(COMPONENT_NAME, C2PALoadProgressBar as any);
  videoPlayer.controlBar.progressControl.seekBar.addChild(COMPONENT_NAME);

  const controlBar = videoPlayer.controlBar.progressControl.seekBar.getChild(COMPONENT_NAME);
  if (!controlBar) throw new Error(`C2PA progress bar component not found: ${COMPONENT_NAME}`);
  const el = controlBar.el() as HTMLElement;
  el.style.width = '100%';
  el.style.backgroundColor = 'transparent';

  return controlBar;
}
