/**
 * R14 / R14.2 — MobileDirectoryFlow render tests.
 *
 * Pins the "mobile = remote rendering of the desktop picker" contract:
 *   - opening lists the computer filesystem roots, never the Host home;
 *   - breadcrumbs always start at This computer and expose every ancestor;
 *   - row taps navigate, crumb taps step back, "select current" adopts the
 *     current level through the owner's onPicked (the SAME adoption path as
 *     desktop);
 *   - failures surface inline with a retry that re-requests the same level;
 *   - hidden rows are not rendered (official default).
 *
 * R14.2 additions (portal + dialog a11y):
 *   - the sheet renders through a portal into document.body;
 *   - aria-labelledby ties the title to the dialog;
 *   - Escape closes (and yields while the owner is busy);
 *   - focus moves into the sheet on open and restores to the opener on close.
 *
 * Uses react-test-renderer (repo convention) with a hand-rolled document
 * stub: the portal, focus, and Escape handlers touch `document`, so a minimal
 * stub supplies body / activeElement / addEventListener / removeEventListener /
 * querySelector. No jsdom needed.
 */

import { createElement } from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MobileDirectoryFlow, type MobileDirectoryFlowProps } from '../src/client/workspace-browse/MobileDirectoryFlow.tsx'
import { WorkspaceBrowseError } from '../src/client/workspace-browse/browse-client.ts'
import type { DirectoryListingView } from '../src/wire.js'

// Capture portal calls (the vi.mock factory closes over this hoisted value).
const portals = vi.hoisted(() => ({ calls: [] as Array<[unknown, unknown]> }))

vi.mock('react-dom', () => {
  return {
    // react-test-renderer does NOT support ReactDOM.createPortal (React errors
    // out with "another renderer is being used in addition to the test
    // renderer"). So the portal is mocked to return its child verbatim: the
    // unit contract under test is "the component portals into document.body",
    // verified through `portals.calls`, while the actual portal DOM behavior
    // is React's own and covered by the emulated/real-device acceptance.
    createPortal: (child: unknown, container: unknown) => {
      portals.calls.push([child, container])
      return child
    },
  }
})

const HOME = 'C:\\Users\\demo'
const PROJECTS = 'C:\\Users\\demo\\projects'
const DRIVE = 'D:\\'

function listing(path: string, entries: Array<{ name: string; path: string; hidden?: boolean }>, home = HOME, truncated = false): DirectoryListingView {
  const crumbs = path.startsWith('D:')
    ? [{ name: 'D:\\', path: DRIVE, hidden: false }]
    : [
        { name: 'C:\\', path: 'C:\\', hidden: false },
        { name: 'Users', path: 'C:\\Users', hidden: false },
        { name: 'demo', path: HOME, hidden: false },
        ...(path === HOME ? [] : [{ name: 'projects', path: PROJECTS, hidden: false }]),
      ]
  return {
    kind: 'directory',
    path,
    home,
    crumbs,
    entries: entries.map(entry => ({ name: entry.name, path: entry.path, hidden: entry.hidden ?? false })),
    truncated,
  }
}

function computerListing(): DirectoryListingView {
  return {
    kind: 'computer',
    path: null,
    home: HOME,
    crumbs: [],
    entries: [
      { name: 'C:', path: 'C:\\', hidden: false },
      { name: 'D:', path: DRIVE, hidden: false },
    ],
    truncated: false,
  }
}

const t = (key: string) =>
  ({
    pickerTitle: 'Select Workspace Directory',
    pickerSelectCurrent: 'Select this directory',
    pickerCancel: 'Cancel',
    pickerLoading: 'Loading…',
    pickerRetry: 'Retry',
    pickerUnreadable: 'Cannot read this directory',
    pickerInternal: 'An error occurred',
    pickerComputer: 'This computer',
    pickerBack: 'Back',
    pickerTruncated: 'Too many folders',
  })[key] ?? key

interface DomStub {
  doc: {
    body: object
    activeElement: { focus: ReturnType<typeof vi.fn> }
    addEventListener: (type: string, fn: (event: { key?: string }) => void) => void
    removeEventListener: (type: string, fn: (event: { key?: string }) => void) => void
    querySelector: (selector: string) => { focus: ReturnType<typeof vi.fn> } | null
  }
  body: object
  closeEl: { focus: ReturnType<typeof vi.fn> }
  activeEl: { focus: ReturnType<typeof vi.fn> }
  fireKeydown: (key: string) => void
  cleanup: () => void
}

let dom: DomStub

function installDomStub(): DomStub {
  const listeners = new Map<string, Array<(event: { key?: string }) => void>>()
  const closeEl = { focus: vi.fn() }
  const activeEl = { focus: vi.fn() }
  // The portal target. createPortal is mocked to return its child, so this is
  // only ever the second argument the component passes — never a real append.
  const body = {}
  const doc = {
    body,
    activeElement: activeEl,
    addEventListener: (type: string, fn: (event: { key?: string }) => void) => {
      const list = listeners.get(type) ?? []
      list.push(fn)
      listeners.set(type, list)
    },
    removeEventListener: (type: string, fn: (event: { key?: string }) => void) => {
      const list = listeners.get(type) ?? []
      const index = list.indexOf(fn)
      if (index >= 0) list.splice(index, 1)
    },
    querySelector: (selector: string) => (selector.includes('[data-wsb="close"]') ? closeEl : null),
  }
  ;(globalThis as { document?: unknown }).document = doc
  return {
    doc: doc as unknown as DomStub['doc'],
    body,
    closeEl,
    activeEl,
    fireKeydown: (key: string) => {
      for (const fn of [...(listeners.get('keydown') ?? [])]) fn({ key })
    },
    cleanup: () => { delete (globalThis as { document?: unknown }).document },
  }
}

beforeEach(() => {
  dom = installDomStub()
  portals.calls.length = 0
})

afterEach(() => {
  dom.cleanup()
  vi.unstubAllGlobals()
})

function renderFlow(overrides: Partial<MobileDirectoryFlowProps> = {}) {
  const listDirectory = vi.fn(async () => computerListing())
  const onPicked = vi.fn()
  const onCancel = vi.fn()
  const props = {
    open: true,
    busy: false,
    listDirectory,
    onPicked,
    onCancel,
    onError: vi.fn(),
    t,
    ...overrides,
  }
  // The renderer is created inside act but its .root is read OUTSIDE it:
  // reading .root while an async navigation is still pending inside act
  // trips react-test-renderer's "unmounted test renderer" assertion.
  let renderer!: TestRenderer.ReactTestRenderer
  const scrollBox = { scrollTop: 0 }
  act(() => {
    renderer = TestRenderer.create(createElement(MobileDirectoryFlow, props as MobileDirectoryFlowProps), {
      createNodeMock: element => element.props?.['data-wsb'] === 'content' ? scrollBox : {},
    })
  })
  return { renderer: renderer.root, container: renderer, listDirectory, onPicked, onCancel, props, scrollBox }
}

async function flush(): Promise<void> {
  await act(async () => {})
}

function findAll(renderer: TestRenderer.ReactTestInstance, attribute: string): TestRenderer.ReactTestInstance[] {
  return renderer.findAll(node => node.props?.['data-wsb'] === attribute)
}

describe('MobileDirectoryFlow — mobile workspace picker', () => {
  it('renders nothing while closed', () => {
    const { renderer } = renderFlow({ open: false })
    expect(findAll(renderer, 'sheet')).toHaveLength(0)
  })

  it('opens at the computer root and lists every discovered drive', async () => {
    const { renderer, listDirectory } = renderFlow()
    expect(listDirectory).toHaveBeenCalledWith(undefined, expect.any(AbortSignal))
    await flush()
    expect(findAll(renderer, 'row-name').map(node => node.props.children)).toEqual(['C:', 'D:'])
    expect(findAll(renderer, 'select')[0]?.props.disabled).toBe(true)
  })

  it('renders This computer as the first breadcrumb', async () => {
    const { renderer } = renderFlow()
    await flush()
    const crumbs = findAll(renderer, 'crumb')
    expect(crumbs[0]?.props.children).toBe('This computer')
  })

  it('navigates into a directory when a row is tapped', async () => {
    const { renderer, listDirectory } = renderFlow()
    await flush()
    listDirectory.mockResolvedValueOnce(listing(DRIVE, [{ name: 'dev', path: `${DRIVE}dev` }]))
    act(() => {
      findAll(renderer, 'row')[1]?.props.onClick()
    })
    expect(listDirectory).toHaveBeenLastCalledWith(DRIVE, expect.any(AbortSignal))
    await flush()
    const crumbs = findAll(renderer, 'crumb')
    expect(crumbs.map(node => node.props.children)).toEqual(['This computer', 'D:'])
  })

  it('steps back via a breadcrumb crumb', async () => {
    const { renderer, listDirectory } = renderFlow()
    await flush()
    listDirectory.mockResolvedValueOnce(listing(DRIVE, []))
    act(() => {
      findAll(renderer, 'row')[1]?.props.onClick()
    })
    await flush()
    listDirectory.mockResolvedValueOnce(computerListing())
    act(() => {
      findAll(renderer, 'crumb')[0]?.props.onClick()
    })
    expect(listDirectory).toHaveBeenLastCalledWith(undefined, expect.any(AbortSignal))
  })

  it('steps back one level with the visible Back action', async () => {
    const { renderer, listDirectory } = renderFlow()
    await flush()
    listDirectory.mockResolvedValueOnce(listing(DRIVE, []))
    act(() => { findAll(renderer, 'row')[1]?.props.onClick() })
    await flush()
    listDirectory.mockResolvedValueOnce(computerListing())
    act(() => { findAll(renderer, 'back')[0]?.props.onClick() })
    expect(listDirectory).toHaveBeenLastCalledWith(undefined, expect.any(AbortSignal))
  })

  it('adopts the current directory through onPicked (same path as desktop)', async () => {
    const listDirectory = vi.fn(async () => listing(HOME, [{ name: 'projects', path: PROJECTS }]))
    const { renderer, onPicked } = renderFlow({ listDirectory })
    await flush()
    act(() => {
      findAll(renderer, 'select')[0]?.props.onClick()
    })
    expect(onPicked).toHaveBeenCalledWith(HOME)
  })

  it('cancels through onCancel', () => {
    const { renderer, onCancel } = renderFlow()
    act(() => {
      findAll(renderer, 'cancel')[0]?.props.onClick()
    })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('surfaces a listing failure inline and retries the same level', async () => {
    // The FIRST listing call (the open navigation to home) rejects.
    const listDirectory = vi.fn()
      .mockRejectedValueOnce(new WorkspaceBrowseError('directory-unreadable'))
      .mockResolvedValue(listing(HOME, [{ name: 'projects', path: PROJECTS }]))
    const { renderer } = renderFlow({ listDirectory })
    await flush()
    const error = findAll(renderer, 'error')
    expect(error.length).toBe(1)
    act(() => {
      findAll(renderer, 'retry')[0]?.props.onClick()
    })
    expect(listDirectory).toHaveBeenLastCalledWith(undefined, expect.any(AbortSignal))
    await flush()
    expect(findAll(renderer, 'error')).toHaveLength(0)
  })

  it('hides host-flagged hidden rows (official default)', async () => {
    const { renderer } = renderFlow({
      listDirectory: vi.fn(async () => listing(HOME, [
        { name: '.ssh', path: `${HOME}\\.ssh`, hidden: true },
        { name: 'visible', path: `${HOME}\\visible` },
      ])),
    })
    await flush()
    const rows = findAll(renderer, 'row-name').map(node => node.props.children)
    expect(rows).toEqual(['visible'])
  })

  it('resets the directory-list scroll position after navigation', async () => {
    const { renderer, listDirectory, scrollBox } = renderFlow()
    await flush()
    scrollBox.scrollTop = 240
    listDirectory.mockResolvedValueOnce(listing(DRIVE, []))
    act(() => { findAll(renderer, 'row')[1]?.props.onClick() })
    await flush()
    expect(scrollBox.scrollTop).toBe(0)
  })

  it('disables the commit affordance while the owner is busy', async () => {
    const { renderer, onPicked } = renderFlow({ busy: true })
    await flush()
    // The commit button is disabled while the owner adopts a picked path.
    expect(findAll(renderer, 'select')[0]?.props.disabled).toBe(true)
    expect(onPicked).not.toHaveBeenCalled()
  })
})

describe('MobileDirectoryFlow — R14.2 portal + dialog a11y', () => {
  it('renders the sheet through a portal into document.body', () => {
    renderFlow()
    expect(portals.calls.length).toBeGreaterThan(0)
    const last = portals.calls[portals.calls.length - 1]
    expect(last[1]).toBe(dom.body)
  })

  it('ties the title to the dialog with aria-labelledby', () => {
    const { renderer } = renderFlow()
    const dialog = renderer.find(node => node.props?.['data-dsh-remote-workspace-picker'] !== undefined)
    const title = renderer.find(node => node.props?.['data-wsb'] === 'title')
    expect(dialog.props['aria-labelledby']).toBe(title.props.id)
  })

  it('marks breadcrumbs as explicit navigation so phone modal CSS excludes this dialog', async () => {
    const { renderer } = renderFlow()
    await flush()
    expect(findAll(renderer, 'crumbs')[0]?.props.role).toBe('navigation')
  })

  it('closes on Escape', () => {
    const { onCancel } = renderFlow()
    dom.fireKeydown('Escape')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('does not close on Escape while the owner is busy', () => {
    const { onCancel } = renderFlow({ busy: true })
    dom.fireKeydown('Escape')
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('moves focus into the sheet on open', () => {
    renderFlow()
    expect(dom.closeEl.focus).toHaveBeenCalled()
  })

  it('restores focus to the opener on close', () => {
    const { container, props } = renderFlow()
    act(() => {
      container.update(createElement(MobileDirectoryFlow, { ...props, open: false } as MobileDirectoryFlowProps))
    })
    expect(dom.activeEl.focus).toHaveBeenCalled()
  })
})
