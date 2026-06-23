"use client";

import { useEffect, useState } from "react";

// True below Tailwind's `md` breakpoint (768px). Starts false on the server and
// first client paint (so it matches SSR), then resolves on mount. Used to render
// EITHER the desktop sticky detail panel OR the mobile full-screen drawer — never
// both — so the drawer's body-scroll lock can't fire while it's CSS-hidden on
// desktop (which would freeze the whole page).
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);
  return isMobile;
}
