/**
 * Phone layer stylesheet (R06C4C: injected ONLY when the device classifier
 * says phone — tablets/desktops/narrow desktop windows never receive it and
 * keep the DSH native UI byte-for-byte untouched).
 *
 * R14.2: the workspace-picker sheet is now a SEPARATE stylesheet
 * (`PICKER_CSS`, below) injected for `isPhone || isTablet` — a tablet gets
 * the browse picker WITHOUT the phone UI layer (drawer / fab / backdrop /
 * phone chrome stay phone-only). The picker rules therefore live OUTSIDE the
 * `max-width: 1023px` block and have no `>= 1024px` desktop guard, so an iPad
 * in landscape (short side 1024) still renders the sheet. Phone-only rules
 * keep the desktop guard unchanged.
 *
 * Portions adapted from the MIT-licensed dsh-web-mobile project
 * (https://github.com/dsh-web-mobile, © its authors), specifically
 * `src/client/styles/layout.css.ts`. The MIT license text is preserved in
 * `NOTICE` inside this repository and the adapted fragments are listed in the
 * R04 report (section "License attribution"). Adaptations:
 *   - the marker attribute is `data-dsh-remote-mobile` (this plugin's own)
 *   - only the rules this plugin needs are kept (no aionui / git graph /
 *     stats / usage plugins), so future DSH DOM upgrades have a small
 *     maintenance surface
 *   - structural anchors only: DSH's own attributes (`data-side`,
 *     `data-phase`, `aria-modal`) and class-suffix selectors; nothing depends
 *     on third-party plugin DOM.
 *
 * Once installed (phone devices only), the phone layout rules key off the
 * < 1024px viewport: every real phone viewport is below it. The
 * 768–1023px block below originally accommodated TABLETS; under the final
 * R06C4C rule tablets never receive the phone stylesheet, so that block now
 * only affects wide / landscape PHONES (centered sheets instead of
 * edge-to-edge).
 */

export const MOBILE_CSS = `/* ---------- dsh-remote-web-gateway: mobile-only layer (< 1024px) ---------- */

@media (max-width: 1023px) {
  /* Phone chrome: keep pan/pinch zoom, kill double-tap zoom and the 300ms
     tap delay. Safe-area pushes content below the status bar / notch. */
  html,
  body {
    touch-action: manipulation !important;
  }

  /* --- Sidebar becomes a left drawer ---
     The frame is found by the overlay effect ([data-dsh-remote-mobile]);
     the first grid child is DSH's sidebar column. Closed: fully off-screen
     (translateX(-110%)). Open (frame WITHOUT data-sidebar-collapsed):
     transform:none so fixed-position descendants stay viewport-anchored. */
  [data-dsh-remote-mobile="frame"] {
    position: relative !important;
    grid-template-columns: minmax(0, 1fr) 0 0 !important;
    padding-top: env(safe-area-inset-top, 0px) !important;
  }

  [data-dsh-remote-mobile="frame"] > :first-child {
    position: absolute !important;
    inset: 0 auto 0 0 !important;
    width: max-content !important;
    max-width: 92vw !important;
    z-index: 40 !important;
    transform: translateX(-110%);
    transition: transform .28s var(--ds-ease-in-out, ease-in-out);
    background: var(--dsw-alias-bg-layer-1, #ffffff);
    padding-top: env(safe-area-inset-top, 0px) !important;
    border-right: none !important;
    overflow-y: auto !important;
  }

  [data-dsh-remote-mobile="frame"]:not([data-sidebar-collapsed]) > :first-child {
    transform: none !important;
  }

  /* Drag handles are useless on touch and would float over the drawer. */
  [data-side="sidebar"],
  [data-side="details"] {
    display: none !important;
  }

  /* --- Floating open button + backdrop (rendered by the overlay) --- */
  [data-dsh-remote-mobile="fab"] {
    position: fixed !important;
    right: 16px !important;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 16px) !important;
    z-index: 45 !important;
    width: 48px !important;
    height: 48px !important;
    min-height: 48px !important;
    border-radius: 50% !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border: none !important;
    background: var(--dsw-alias-button-floating-fill, #ffffff) !important;
    color: var(--dsw-alias-label-primary, inherit) !important;
    box-shadow: 0 2px 12px rgba(0, 0, 0, .25) !important;
    -webkit-tap-highlight-color: transparent !important;
  }

  [data-dsh-remote-mobile="backdrop"] {
    position: fixed !important;
    inset: 0 !important;
    z-index: 39 !important;
    background: rgba(0, 0, 0, .35) !important;
    border: none !important;
    animation: dsh-remote-mobile-fade .18s var(--ds-ease-out, ease-in-out);
  }

  /* --- R13: always-visible sidebar entry (upstream MobileNavToggle idea) ---
     The opener renders whenever the drawer is closed, in EVERY phase (the
     overlay no longer phase-gates it), so an active conversation always has a
     Workspace/Session entry point. Placement is pure CSS:
     - hero / blank (frame without [data-phase="active"]): the floating
       bottom-right button above (existing rules).
     - active conversation: a compact top-left hamburger over the session
       header, with the header yielding left padding so the crumbs never
       slide under it.
     - any open modal ([aria-modal="true"]): hidden, matching the Escape
       yield in MobileOverlay.
     Requires :has() (Chromium 105+, Safari 15.4+) — already used by the
     settings-sheet rules in this file. */
  [data-dsh-remote-mobile="frame"]:has([data-phase="active"]) [data-dsh-remote-mobile="fab"] {
    right: auto !important;
    left: calc(env(safe-area-inset-left, 0px) + 8px) !important;
    top: calc(env(safe-area-inset-top, 0px) + 8px) !important;
    bottom: auto !important;
    width: 36px !important;
    height: 36px !important;
    min-height: 36px !important;
  }
  [data-dsh-remote-mobile="frame"]:has([data-phase="active"]) [data-phase] header {
    padding-left: 52px !important;
  }
  [data-dsh-remote-mobile="frame"]:has([aria-modal="true"]) [data-dsh-remote-mobile="fab"],
  [data-dsh-remote-mobile="frame"]:has([aria-modal="true"]) [data-dsh-remote-mobile="backdrop"] {
    display: none !important;
  }

  @media (prefers-reduced-motion: reduce) {
    [data-dsh-remote-mobile="backdrop"] {
      animation: none !important;
    }
    [data-dsh-remote-mobile="frame"] > :first-child {
      transition: none !important;
    }
  }

  /* --- Conversation text on mobile ---
     Trim the side gutters, shrink the type a notch, remove desktop
     scrollbar-gutter (touch scrolling), keep actions inside the message. */
  [data-phase] [class$="_scrollBody"] {
    scrollbar-gutter: auto !important;
    scrollbar-width: none !important;
  }
  [data-phase] [class$="_scrollBody"]::-webkit-scrollbar {
    display: none !important;
    width: 0 !important;
    height: 0 !important;
  }
  [data-phase] [class$="_actions"] {
    overflow: hidden !important;
  }
  [data-phase] [class$="_actions"] [class$="_timeEnd"] {
    flex: 0 1 auto !important;
    min-width: 0 !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }
  [data-phase] [class$="_scroll"]:has(p) {
    padding-left: 20px !important;
    padding-right: 20px !important;
    font-size: 15px !important;
  }
  [data-phase] [class$="_scroll"]:has(p) p,
  [data-phase] [class$="_scroll"]:has(p) li,
  [data-phase] [class$="_scroll"]:has(p) [class*="_text_"] {
    font-size: 15px !important;
  }

  /* Markdown tables fill the message column; a truly wide cell scrolls
     inside the wrapper instead of overflowing the viewport. */
  [data-phase] table {
    width: 100% !important;
    max-width: 100% !important;
  }
  [data-phase] th,
  [data-phase] td {
    max-width: none !important;
    min-width: 0 !important;
  }

  /* User bubbles fill the message column on phones. */
  [data-phase] [class$="_userStack"],
  [data-phase] [class$="_userStack"] [class$="_bubble"] {
    box-sizing: border-box !important;
    width: fit-content !important;
    max-width: 100% !important;
  }

  /* --- Composer bottom row ---
     The permission pill keeps its natural width; the model pill absorbs the
     spare space and ellipsizes the full model id instead of squeezing the
     permission control. Structural anchors only (the card is the element
     containing the textarea). */
  [data-phase] [class*="_card"]:has(textarea) [class$="_row"]:has([class$="_trailing"]) {
    gap: 8px !important;
  }
  [data-phase] [class*="_card"]:has(textarea) [class$="_row"]:has([class$="_trailing"]) > :first-child {
    gap: 8px !important;
  }
  [data-phase] [class*="_card"]:has(textarea) [class$="_row"]:has([class$="_trailing"]) > :first-child > :nth-child(2) {
    flex: 0 0 auto !important;
    gap: 8px !important;
  }
  [data-phase] [class*="_card"]:has(textarea) [class$="_trailing"] {
    flex: 1 1 auto !important;
    gap: 8px !important;
    min-width: 0 !important;
  }
  [data-phase] [class*="_card"]:has(textarea) [class$="_root"]:has(> [class$="_trigger"][aria-haspopup="menu"]) {
    flex: 1 1 auto !important;
    min-width: 0 !important;
  }
  [data-phase] [class*="_card"]:has(textarea) [class$="_root"]:has(> [class$="_trigger"][aria-haspopup="menu"]) > [class$="_trigger"] {
    width: 100% !important;
    max-width: 100% !important;
  }
  [data-phase] [class*="_card"]:has(textarea) [class$="_root"]:has(> [class$="_trigger"][aria-haspopup="menu"]) > [class$="_trigger"] > [class$="_triggerLabel"] {
    flex: 1 1 auto !important;
    min-width: 0 !important;
  }
  /* Center the model menu on the trigger so it never overflows the left edge. */
  [data-phase] [class*="_card"]:has(textarea) [class$="_root"]:has(> [class$="_trigger"]) > [class$="_menu"] {
    left: 50% !important;
    right: auto !important;
    transform: translateX(-50%) !important;
  }

  /* --- Session header ---
     Cap the crumb width so the mode label and helper cluster stay readable;
     keep the actions right-aligned. */
  [data-phase] header [class$="_crumbs"] {
    flex: 0 1 auto !important;
    min-width: 0 !important;
    max-width: 24vw !important;
  }
  [data-phase] header [class$="_headerActions"] {
    flex: 0 1 auto !important;
    min-width: 0 !important;
    margin-left: auto !important;
    justify-content: flex-end !important;
  }

  /* --- Settings dialog on mobile ---
     Near-full-width bottom sheet: nav tabs wrap into rows on top, options
     scroll below. Gated on the settings nav tab list (:has(> :first-child >
     :last-child > button)) so the transient export dialog keeps its official
     centered card. Requires :has() (Chromium 105+). */
  [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])) {
    position: absolute !important;
    left: 8px !important;
    top: calc(env(safe-area-inset-top, 0px) + 12px) !important;
    width: calc(100vw - 16px) !important;
    max-width: calc(100vw - 16px) !important;
    height: auto !important;
    max-height: min(800px, calc(100dvh - 24px - env(safe-area-inset-top, 0px))) !important;
    flex-direction: column !important;
    border-radius: 14px !important;
  }
  [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])) > :first-child {
    width: 100% !important;
    flex-direction: row !important;
    align-items: center !important;
    gap: 6px !important;
    padding: 10px 12px 8px !important;
  }
  [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])) > :first-child > :first-child {
    display: none !important;
  }
  [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])) > :first-child [class$="_navList"] {
    flex: 1 1 auto !important;
    min-width: 0 !important;
    flex-direction: row !important;
    flex-wrap: wrap !important;
    gap: 6px !important;
    overflow: visible !important;
  }
  [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])) > :last-child {
    flex: 1 1 auto !important;
    min-height: 0 !important;
  }
  [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])) > :last-child > :last-child {
    padding: 0 12px 24px !important;
  }
  /* The transient export dialog must never overflow the viewport. */
  [aria-modal="true"]:not(:has(> :first-child > :last-child > button)) {
    max-width: calc(100vw - 32px) !important;
  }

  /* --- Touch targets ---
     Anything tappable in the drawer / settings sheet gets a comfortable
     minimum height. */
  [data-dsh-remote-mobile="frame"] button,
  [aria-modal="true"] button {
    min-height: 36px !important;
  }

  @keyframes dsh-remote-mobile-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
}

/* --- Wide / landscape phones (768-1023px): sheets stay centered, never
     edge-to-edge. (Adapted from dsh-web-mobile misc.css.ts; under the final
     R06C4C rule tablets never receive this stylesheet, so this block only
     fires on phones whose viewport happens to exceed 768px.) */
@media (min-width: 768px) and (max-width: 1023px) {
  [aria-modal="true"]:has(> :first-child > :last-child > button):not(:has([role="navigation"])),
  [aria-modal="true"]:not(:has(> :first-child > :last-child > button)) {
    left: 0 !important;
    right: 0 !important;
    margin-left: auto !important;
    margin-right: auto !important;
    width: min(calc(100vw - 32px), 720px) !important;
    max-width: min(calc(100vw - 32px), 720px) !important;
  }
  [aria-modal="true"] [class$="_section"] {
    width: 100% !important;
    max-width: none !important;
  }
}

/* --- Desktop guard (>= 1024px): the mobile controls never appear even if
     the overlay effect left them mounted. The DSH official layout is
     untouched — every other rule lives inside the max-width: 1023px block.
     (The workspace picker sheet is NOT guarded here: it lives in PICKER_CSS
     and is gated by device detection, so a tablet in landscape keeps it.) */
@media (min-width: 1024px) {
  [data-dsh-remote-mobile="fab"],
  [data-dsh-remote-mobile="backdrop"] {
    display: none !important;
  }
}
`

/**
 * R14.2 — mobile workspace directory picker bottom-sheet stylesheet.
 *
 * Injected for `isPhone || isTablet` (NOT the phone UI layer). Lives OUTSIDE
 * the `max-width: 1023px` media block with NO `>= 1024px` guard, so an iPad in
 * landscape (short side 1024) still renders the sheet. A tablet therefore
 * gets the browse picker without the drawer / fab / backdrop / phone chrome.
 */
export const PICKER_CSS = `/* ---------- dsh-remote-web-gateway: mobile workspace picker (device-gated) ---------- */

  [data-dsh-remote-workspace-picker] {
    position: fixed !important;
    inset: 0 !important;
    z-index: 46 !important;
    display: flex !important;
    align-items: flex-end !important;
    justify-content: center !important;
    background: rgba(0, 0, 0, .35) !important;
    animation: dsh-remote-mobile-fade .18s var(--ds-ease-out, ease-in-out);
  }
  [data-dsh-remote-workspace-picker] [data-wsb="sheet"] {
    box-sizing: border-box !important;
    width: 100% !important;
    max-width: 720px !important;
    height: min(88dvh, 900px, calc(100dvh - 16px)) !important;
    max-height: calc(100dvh - 16px) !important;
    display: flex !important;
    flex-direction: column !important;
    background: var(--dsw-alias-bg-layer-1, #ffffff) !important;
    border-radius: 14px 14px 0 0 !important;
    padding-bottom: env(safe-area-inset-bottom, 0px) !important;
    overflow: hidden !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="header"] {
    display: grid !important;
    grid-template-columns: minmax(72px, auto) minmax(0, 1fr) 28px !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 8px !important;
    padding: 12px 14px 8px !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="title"] {
    margin: 0 !important;
    font-size: 16px !important;
    line-height: 22px !important;
    color: var(--dsw-alias-label-primary, inherit) !important;
    overflow: hidden !important;
    text-align: center !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="back"] {
    min-height: 32px !important;
    padding: 4px 6px !important;
    border: none !important;
    border-radius: 8px !important;
    background: transparent !important;
    color: var(--dsw-alias-state-business-primary, #4f6ef7) !important;
    font-size: 14px !important;
    line-height: 20px !important;
    text-align: left !important;
    cursor: pointer !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="back"]:disabled {
    visibility: hidden !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="close"] {
    width: 28px !important;
    height: 28px !important;
    min-height: 28px !important;
    flex: none !important;
    border: none !important;
    border-radius: 50% !important;
    background: transparent !important;
    color: var(--dsw-alias-label-secondary, inherit) !important;
    font-size: 14px !important;
    line-height: 1 !important;
    cursor: pointer !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="crumbs"] {
    display: flex !important;
    flex-wrap: nowrap !important;
    align-items: center !important;
    gap: 4px !important;
    padding: 4px 14px 8px !important;
    border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .08)) !important;
    overflow-x: auto !important;
    scrollbar-width: none !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="crumb-seat"] {
    display: inline-flex !important;
    align-items: center !important;
    gap: 4px !important;
    min-width: 0 !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="crumb-sep"] {
    color: var(--dsw-alias-label-dimmed, rgba(0, 0, 0, .35)) !important;
    font-size: 14px !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="crumb"] {
    border: none !important;
    background: transparent !important;
    color: var(--dsw-alias-label-secondary, inherit) !important;
    font-size: 13px !important;
    line-height: 20px !important;
    padding: 4px 6px !important;
    border-radius: 8px !important;
    cursor: pointer !important;
    min-height: 28px !important;
    max-width: 34vw !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="content"] {
    flex: 1 1 0 !important;
    min-height: 0 !important;
    overflow-y: auto !important;
    padding: 4px 8px 8px !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="list"] {
    list-style: none !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="row"] {
    display: flex !important;
    align-items: center !important;
    justify-content: flex-start !important;
    gap: 8px !important;
    width: 100% !important;
    min-height: 40px !important;
    border: none !important;
    border-radius: 10px !important;
    background: transparent !important;
    color: var(--dsw-alias-label-primary, inherit) !important;
    font-size: 15px !important;
    line-height: 22px !important;
    padding: 8px 10px !important;
    cursor: pointer !important;
    text-align: left !important;
    -webkit-tap-highlight-color: transparent !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="row"]:active {
    background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .06)) !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="row-name"] {
    flex: 1 1 auto !important;
    min-width: 0 !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="row-icon"] {
    flex: none !important;
    width: 22px !important;
    font-size: 16px !important;
    line-height: 22px !important;
    text-align: center !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="row-chevron"] {
    flex: none !important;
    margin-left: auto !important;
    color: var(--dsw-alias-label-dimmed, rgba(0, 0, 0, .35)) !important;
    font-size: 16px !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="loading"],
  [data-dsh-remote-workspace-picker] [data-wsb="truncated"] {
    padding: 10px 12px !important;
    font-size: 13px !important;
    line-height: 20px !important;
    color: var(--dsw-alias-label-secondary, inherit) !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="error"] {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 8px !important;
    margin: 8px 6px 0 !important;
    padding: 10px 12px !important;
    border-radius: 10px !important;
    background: var(--dsw-alias-state-error-secondary, rgba(240, 68, 56, .1)) !important;
    color: var(--dsw-alias-state-error-primary, #e5484d) !important;
    font-size: 13px !important;
    line-height: 20px !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="retry"] {
    flex: none !important;
    min-height: 30px !important;
    border: none !important;
    border-radius: 8px !important;
    background: transparent !important;
    color: var(--dsw-alias-state-business-primary, #4f6ef7) !important;
    font-size: 13px !important;
    cursor: pointer !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="footer"] {
    display: flex !important;
    align-items: center !important;
    justify-content: flex-end !important;
    gap: 8px !important;
    padding: 10px 14px calc(env(safe-area-inset-bottom, 0px) + 10px) !important;
    border-top: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .08)) !important;
    flex: 0 0 auto !important;
    background: var(--dsw-alias-bg-layer-1, #ffffff) !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="cancel"],
  [data-dsh-remote-workspace-picker] [data-wsb="select"] {
    min-height: 38px !important;
    padding: 0 16px !important;
    border-radius: 10px !important;
    font-size: 14px !important;
    line-height: 20px !important;
    cursor: pointer !important;
    -webkit-tap-highlight-color: transparent !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="cancel"] {
    border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .12)) !important;
    background: transparent !important;
    color: var(--dsw-alias-label-primary, inherit) !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="select"] {
    border: none !important;
    background: var(--dsw-alias-button-floating-fill, #ffffff) !important;
    color: var(--dsw-alias-state-business-primary, #4f6ef7) !important;
    font-weight: 600 !important;
  }
  [data-dsh-remote-workspace-picker] [data-wsb="select"]:disabled,
  [data-dsh-remote-workspace-picker] [data-wsb="cancel"]:disabled {
    opacity: .45 !important;
    cursor: default !important;
  }

  @media (min-width: 768px) {
    [data-dsh-remote-workspace-picker] {
      align-items: center !important;
      padding: 24px !important;
      box-sizing: border-box !important;
    }
    [data-dsh-remote-workspace-picker] [data-wsb="sheet"] {
      height: min(82dvh, 900px, calc(100dvh - 48px)) !important;
      max-height: calc(100dvh - 48px) !important;
      border-radius: 14px !important;
      padding-bottom: 0 !important;
    }
  }

  @keyframes dsh-remote-mobile-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
`
