/**
 * Settings-nav glyph override (read-only-shell workaround, option A).
 *
 * DSH's settings shell picks each nav glyph by section id in `SettingsRoot.tsx`
 * `navIcon()`; an id the shell does not know — our `remote-access` — falls back
 * to the settings gear, the SAME glyph as the General section. The
 * `settings.section` registration carries no icon field, so on a stock DSH this
 * plugin cannot supply a distinct nav glyph through the slot contract. This
 * module injects it directly: a body-level MutationObserver finds the settings
 * panel's nav cell whose label matches the remote-control label and swaps the
 * leading gear <svg> for a display/window glyph (16px, currentColor) vendored
 * from the native icon set — a single device, so it stays clean and matches the
 * shell nav glyphs' size and镂空 style exactly.
 *
 * It targets only `[role="dialog"] nav button` and never touches shell CSS or
 * semantics. It is idempotent AND self-healing: a shell re-render (e.g. a
 * locale re-registration bumping the ledger) may re-insert the original gear,
 * whereupon the observer re-applies the glyph. A shell owner who adds
 * `remote-access` to `navIcon()` can delete this module.
 */

/** Remote-control nav label in every shipped locale (the shell exposes no DOM id). */
const REMOTE_LABELS = ['远程控制', 'Remote Control']

/**
 * 16px native system glyph (vendored verbatim from DSH's
 * `IconBrowseOutline16` — a hollow window/display frame). Single device so
 * it stays clean at 16px, and being an actual system icon it matches the
 * shell nav glyphs' size + 镂空 style exactly.
 */
const ICON_SVG = [
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">',
  '<path fill="currentColor" d="M11.2426 4.80473V6.10551H4.75819V4.80473H11.2426Z"/>',
  '<path fill="currentColor" d="M9.40858 7.84478V9.14557H4.75819V7.84478H9.40858Z"/>',
  '<path fill="currentColor" d="M9.23438 0.546389C10.1941 0.546389 10.9683 0.544914 11.5859 0.611819C12.2161 0.680096 12.7634 0.825745 13.2393 1.17139C13.5172 1.3733 13.7619 1.61812 13.9639 1.896C14.3096 2.37183 14.4551 2.91922 14.5234 3.54932C14.5903 4.16686 14.5889 4.94133 14.5889 5.90088V10.0981C14.5889 11.0576 14.5903 11.8321 14.5234 12.4497C14.4552 13.0798 14.3094 13.6272 13.9639 14.103C13.7619 14.381 13.5172 14.6257 13.2393 14.8276C12.7633 15.1734 12.2163 15.3189 11.5859 15.3872C10.9683 15.4541 10.1942 15.4536 9.23438 15.4536H6.76563C5.80591 15.4536 5.03168 15.4541 4.41407 15.3872C3.78385 15.3189 3.23665 15.1734 2.76074 14.8276C2.48291 14.6257 2.23802 14.3809 2.03614 14.103C1.69066 13.6272 1.54483 13.0798 1.47657 12.4497C1.40973 11.8321 1.41114 11.0576 1.41114 10.0981V5.90088C1.41113 4.94132 1.40966 4.16686 1.47657 3.54932C1.54488 2.91921 1.69042 2.37184 2.03614 1.896C2.2381 1.61807 2.4828 1.37333 2.76074 1.17139C3.23665 0.825682 3.78386 0.680109 4.41407 0.611819C5.03168 0.544905 5.80591 0.546389 6.76563 0.546389H9.23438ZM6.76563 1.896C5.77586 1.896 5.0876 1.89738 4.55957 1.95459C4.0443 2.01043 3.76214 2.11349 3.55469 2.26416C3.39135 2.38284 3.24761 2.52662 3.12891 2.68994C2.97821 2.89736 2.8752 3.17967 2.81934 3.69483C2.76214 4.22279 2.76075 4.91131 2.76074 5.90088V10.0981C2.76074 11.0876 2.76221 11.7762 2.81934 12.3042C2.87516 12.8194 2.97829 13.1026 3.12891 13.3101C3.24754 13.4733 3.39147 13.6172 3.55469 13.7358C3.76213 13.8865 4.04438 13.9896 4.55957 14.0454C5.0876 14.1026 5.77586 14.103 6.76563 14.103H9.23438C10.2242 14.103 10.9124 14.1026 11.4404 14.0454C11.9556 13.9896 12.2379 13.8865 12.4453 13.7358C12.6086 13.6172 12.7525 13.4733 12.8711 13.3101C13.0217 13.1026 13.1248 12.8195 13.1807 12.3042C13.2378 11.7762 13.2393 11.0876 13.2393 10.0981V5.90088C13.2393 4.91131 13.2379 4.22279 13.1807 3.69483C13.1248 3.17969 13.0218 2.89736 12.8711 2.68994C12.7524 2.52667 12.6086 2.38281 12.4453 2.26416C12.2379 2.11355 11.9556 2.01041 11.4404 1.95459C10.9124 1.8974 10.2241 1.896 9.23438 1.896H6.76563Z"/>',
  '</svg>',
].join('')

/** The marker attribute stamped on OUR glyph so re-runs skip it (and re-apply after a shell re-render). */
const MARKER = 'data-dsh-remote-icon'

/**
 * Install the observer that swaps the remote-control section's nav glyph.
 * @returns a cleanup that disconnects the observer (used as an effect callback).
 */
export function installSettingsNavIcon(): () => void {
  const applyOnce = (): void => {
    document.querySelectorAll<HTMLButtonElement>('[role="dialog"] nav button').forEach((button) => {
      const label = button.lastElementChild?.textContent?.trim() ?? ''
      if (!REMOTE_LABELS.includes(label)) return
      const icon = button.firstElementChild
      if (icon?.hasAttribute(MARKER) === true) return
      if (!(icon instanceof SVGElement)) return
      const glyph = new DOMParser().parseFromString(ICON_SVG, 'image/svg+xml').documentElement
      glyph.setAttribute(MARKER, '')
      icon.replaceWith(glyph)
    })
  }

  const observer = new MutationObserver(applyOnce)
  observer.observe(document.body, { childList: true, subtree: true })
  applyOnce()
  return () => observer.disconnect()
}
