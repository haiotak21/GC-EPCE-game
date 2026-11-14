/**
 * "Powered by EPCE GC 2019", shown quietly at the foot of every screen.
 *
 * Deliberately low-contrast and non-interactive: it should be readable if you
 * look for it and invisible if you are mid-hunt. `select-none` stops it being
 * caught when a student drags to copy a clue, and the fixed variant sits above
 * the safe-area inset so it is not hidden by an iPhone's home indicator.
 */

import React from 'react';

declare const __BUILD_ID__: string;

export const Watermark: React.FC<{ fixed?: boolean }> = ({ fixed = false }) => (
  <div
    aria-hidden="true"
    className={
      fixed
        ? 'fixed inset-x-0 bottom-0 z-0 pb-[env(safe-area-inset-bottom)] pointer-events-none'
        : 'pt-2'
    }
  >
    <p className="text-center text-[10px] tracking-wider text-slate-600/70 select-none py-2">
      powered by EPCE GC 2019
      {/* Which build this phone is actually running. Invaluable when the only
          evidence is a photograph of a screen. */}
      <span className="ml-1.5 opacity-60">· {typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'}</span>
    </p>
  </div>
);
