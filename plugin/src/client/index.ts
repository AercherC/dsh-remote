/**
 * dsh-remote-web-gateway — browser half.
 *
 *   - registers the 远程控制 settings section (QR + pairing code +
 *     device management) over the loopback-only management RPC
 *   - injects the phone layer ONLY when the R06C4C device classifier says
 *     phone (explicit phone & short side < 600, or unknown & short side
 *     < 560 & coarse pointer); classification is 100% synchronous (R06C4C1)
 *     and final on the first frame. Tablets / desktops / narrow desktop
 *     windows get 完全使用 DSH 原生 UI — no plugin CSS, no phone chrome, no
 *     drawer
 *   - R14.2: the workspace picker also registers on tablets (isTablet), so a
 *     touch tablet reaches the browse picker instead of the host native
 *     chooser; a tablet still gets NO phone UI layer, and a desktop (fine
 *     pointer) keeps the DSH native picker untouched.
 *   - on a non-loopback page (a remote phone), the section only explains that
 *     management happens on the computer — it never renders the QR flow.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
// Type-only merges: settings.section SlotMap, ctx.locale, ctx.layout, ctx.slots.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'

import { createRemoteClient } from './rpc-client.ts'
import { NS, zh, en } from './locales.ts'
import { RemoteAccessSection } from './RemoteAccessSection.tsx'
import { getPhoneDetection } from './mobile/detect-browser.ts'
import { installSettingsNavIcon } from './settings-nav-icon.ts'
import { installMobileCss, installPhoneChrome, installPickerCss } from './mobile/index.ts'
import { MobileOverlay } from './mobile/MobileOverlay.tsx'
import { MobileDirectoryFlow } from './workspace-browse/MobileDirectoryFlow.tsx'
import { createWorkspaceBrowseClient } from './workspace-browse/browse-client.ts'
// Type-only merges: settings.section SlotMap, ctx.locale, ctx.layout, ctx.slots,
// and the ui-workspace directory-flow holes (all erased at runtime).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'

/** Stable plugin id (package name) — used for the style-tag ownership mark. */
const PLUGIN_ID = 'dsh-remote-web-gateway'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'connection', 'layout']

/**
 * Mount every browser surface.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-remote-web-gateway: dictionaries')

  // R06C4C/R06C4C1: the ENTIRE phone layer is gated on the device classifier
  // (phone → existing Phone Enhancements; NOT phone → native DSH UI, nothing
  // is injected and the drawer never mounts). The classifier is 100%
  // synchronous — the decision is final on the first frame and never flips
  // within the page session, so these effects run exactly once.
  const detection = getPhoneDetection()
  // R14.2: the picker registers for phones AND tablets; the phone UI layer
  // (drawer / fab / backdrop / phone chrome) stays phone-only.
  const pickerDevice = detection.isPhone || detection.isTablet

  ctx.effect(() => (detection.isPhone ? installMobileCss(PLUGIN_ID) : () => {}), 'dsh-remote-web-gateway: mobile styles')
  ctx.effect(() => (detection.isPhone ? installPhoneChrome() : () => {}), 'dsh-remote-web-gateway: phone chrome')
  ctx.effect(() => (pickerDevice ? installPickerCss(PLUGIN_ID) : () => {}), 'dsh-remote-web-gateway: picker styles')

  // R07: the settings nav glyph for our section is shell-hardcoded (unknown id →
  // the gear, same as General); swap it for a phone+monitor icon. Purely presentational.
  ctx.effect(() => installSettingsNavIcon(), 'dsh-remote-web-gateway: settings-nav icon')

  const remote = createRemoteClient(ctx.get('connection') as ConnectionHandle)

  // Mobile drawer overlay (backdrop + floating open button).
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'dsh-remote-mobile-overlay',
    order: 30,
    locale: NS,
    inject: () => ({
      toggleSidebar: () => { ctx.layout.toggleSidebar() },
    }),
  }, MobileOverlay))

  // R14/R14.2: on phones AND tablets, occupy the two workspace directory-flow
  // holes with the mobile computer-directory picker — a remote rendering of
  // the computer's picker semantics (initial = filesystem roots, complete
  // ancestry, selection = current level). priority -10 shadows the auto-mounted
  // native occupant (priority 0, lowest renders) without ever touching it;
  // desktop (neither phone nor tablet) registers nothing, so the desktop
  // native picker is untouched.
  if (pickerDevice) {
    ctx.slots.inject('conversation.hero.workspace.directoryFlow', () =>
      ctx.slots.inject('sidebar.workspaces.directoryFlow', function* () {
        const browse = createWorkspaceBrowseClient(ctx.get('connection') as ConnectionHandle)
        const injected = () => ({
          listDirectory: (path?: string, signal?: AbortSignal) => browse.listDirectory(path, signal),
          t: ctx.locale.bind(NS),
        })
        yield ctx.slots.register({
          name: 'conversation.hero.workspace.directoryFlow', priority: -10, inject: injected,
        }, MobileDirectoryFlow)
        yield ctx.slots.register({
          name: 'sidebar.workspaces.directoryFlow', priority: -10, inject: injected,
        }, MobileDirectoryFlow)
      }))
  }

  // The settings page — right after 通用设置 (General, order 0), same
  // placement pattern the shipped first-class sections use.
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'remote-access',
    order: 1,
    label: () => t('nav'),
    locale: NS,
    inject: () => ({ api: remote }),
  }, RemoteAccessSection))
}
