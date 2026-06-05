# getSiteInfoList Async Migration Checklist

## Goal

`getSiteInfoList()` is being changed to async because it must read `mirrorSiteSourceDomain` from `chrome.storage.local`.

This means every direct caller of `getSiteInfoList()`, and every transitive caller of helpers built on it, must be updated. Do not only fix the first-level call sites.

## Progress

- [x] Global constants helpers
- [x] Timeline adapters and registry
- [x] Sidebar starred adapters and registry
- [x] Smart input aliases, adapters, and registry
- [x] Feature bootstraps and managers
- [x] Panel modal async flows
- [x] Mirror site detector
- [x] Verification searches

## Core Functions To Convert First

File: `js/global/constants.js`

These functions depend directly or indirectly on `getSiteInfoList()` and should become async unless a sync cached alternative is deliberately introduced.

| Function | Current dependency | Required change |
|---|---|---|
| `getSiteInfoList()` | reads storage | already async |
| `getSiteNameMap()` | `for...of getSiteInfoList()` | make async, `for...of await getSiteInfoList()` |
| `getSiteInfoByUrl(url)` | `for...of getSiteInfoList()` | make async |
| `matchesPlatform(url, platformId)` | `getSiteInfoList().find(...)` | make async |
| `matchesCurrentPlatform(platformId)` | `matchesPlatform(...)` | make async |
| `getPlatformByUrl(url)` | `for...of getSiteInfoList()` | make async |
| `getCurrentPlatform()` | `getPlatformByUrl(location.href)` | make async |
| `getPlatformById(platformId)` | `getSiteInfoList().find(...)` | make async |
| `getPlatformsByFeature(feature)` | `getSiteInfoList().filter(...)` | make async |
| `platformSupportsFeature(platformId, feature)` | `getSiteInfoList().find(...)` | make async |

## Direct `getSiteInfoList()` Call Sites

These are the direct call sites found by `rg "getSiteInfoList\(" js -n`.

| File | Current usage | Migration note |
|---|---|---|
| `js/global/constants.js` | core helper implementations | Convert all dependent helpers listed above. |
| `js/mirrorSiteDetector/mirror-site-detector.js` | `getSiteInfo()` returns `getSiteInfoList()` | Make `getSiteInfo()` / `isBuiltInSite()` async and update `detectAndSaveMirrorSite()`. |
| `js/runner/index.js` | `getSiteInfoList().some(...)` in AI platform gate | Make gate async; ensure `initialize()` awaits it and uses init-in-flight guard. |
| `js/timeline/adapters/registry.js` | `_isBuiltInSite()` uses `getSiteInfoList().some(...)` | Make custom adapter loading async, or pass a preloaded list into `_isBuiltInSite()`. This affects registry bootstrap. |
| `js/panelModal/tabs/mirrorSite/index.js` | native site list and native support lookup | Render placeholders synchronously, fill in async during `mounted()`, or make the relevant methods async. |
| `js/panelModal/tabs/smartInputBox/index.js` | renders platform toggle list from `getSiteInfoList()` | Render placeholder first, then async populate in `mounted()`. |
| `js/panelModal/tabs/prompt/index.js` | platform lists for prompt modal and render helpers | Preload/cache platform info before sync render paths, or make modal/list methods async. |
| `js/bridge/BRIDGE_SPEC.md` | documentation mention only | No runtime change needed unless examples are updated. |
| `js/smartInputBox/constants.js` | defines aliases for `matchesCurrentPlatform` and `getCurrentPlatform` | See Smart Input Alias Chain below. |

## `getCurrentPlatform()` Call Chain

`getCurrentPlatform()` will become async through:

`getCurrentPlatform()` -> `getPlatformByUrl()` -> `getSiteInfoList()`

All callers must use `await getCurrentPlatform()` or cache the result during async initialization for later sync use.

| File | Current usage | Migration note |
|---|---|---|
| `js/chat-width-manager/index.js` | platform feature gate in `init()` and bootstrap | Make init/bootstrap async and await platform. Guard duplicate init/listeners. |
| `js/preventAutoScroll/index.js` | `getSupportedPlatformId()` | Make helper and init async; await before constructing `ScrollAnchor`. |
| `js/quickAsk/index.js` | `isQuickAskSupported()` | Make support/page checks async; update state transitions and exposed enable method. |
| `js/quickAsk/quick-ask-manager.js` | `_loadPosition()` uses platform feature | Make position load async; ensure `init()` / `enable()` await it. |
| `js/scrollToBottom/scroll-to-bottom-manager.js` | init gate and manager feature checks | Preload current platform in async init; sync methods should read cached platform. |
| `js/sidebarStarred/index.js` | top-level platform feature gate | Wrap bootstrap in async IIFE; resolve platform before adapter/manager init. |
| `js/smartInputBox/index.js` | platform support gate | Make gate/bootstrap async and await adapter lookup if needed. |
| `js/smartInputBox/prompt-button-manager.js` | feature checks in init/sync methods | Preload platform in async init; sync methods should read cached platform. |
| `js/smartInputBox/smart-enter-manager.js` | feature checks in init/sync methods | Preload platform in async init; sync methods should read cached platform. |
| `js/timeline/chat-time-recorder.js` | `getPlatformFeatures()` sync method | Preload features in async `init()` and keep `getPlatformFeatures()` sync via cache. |
| `js/timeline/index.js` | platform enabled checks and storage listener | Make route/platform checks async; update bootstrap, URL change, and storage listener. |
| `js/timeline/timeline-manager.js` | constructor and several sync methods | Preload current platform in `init()`; sync methods should read cached platform. |
| `js/panelModal/tabs/chatWidth/index.js` | `shouldShow()` | Make `shouldShow()` async and update tab registry to await it. |

## `matchesPlatform()` Call Chain

`matchesPlatform()` will become async through:

`matchesPlatform()` -> `getSiteInfoList()`

Every adapter `matches()` method that returns `matchesPlatform(...)` must become async, and every registry that calls adapter `matches()` must await it.

### Timeline Adapters

These files call `matchesPlatform(url, platformId)`:

- `js/timeline/adapters/chatgpt.js`
- `js/timeline/adapters/gemini.js`
- `js/timeline/adapters/doubao.js`
- `js/timeline/adapters/deepseek.js`
- `js/timeline/adapters/yiyan.js`
- `js/timeline/adapters/tongyi.js`
- `js/timeline/adapters/qwen.js`
- `js/timeline/adapters/kimi.js`
- `js/timeline/adapters/yuanbao.js`
- `js/timeline/adapters/grok.js`
- `js/timeline/adapters/perplexity.js`
- `js/timeline/adapters/claude.js`

Required chain:

- Make each adapter `matches(url)` async.
- Make `SiteAdapterRegistry.detectAdapter()` async.
- Make `SiteAdapterRegistry.isSupportedSite()` async.
- Update every caller of `detectAdapter()` and `isSupportedSite()`:
  - `js/timeline/index.js`
  - `js/quickAsk/index.js`
  - `js/quickAsk/quick-ask-manager.js`

### Sidebar Starred Adapters

These files call `matchesPlatform(location.href, platformId)`:

- `js/sidebarStarred/adapters/chatgpt.js`
- `js/sidebarStarred/adapters/gemini.js`
- `js/sidebarStarred/adapters/deepseek.js`
- `js/sidebarStarred/adapters/doubao.js`
- `js/sidebarStarred/adapters/kimi.js`
- `js/sidebarStarred/adapters/claude.js`
- `js/sidebarStarred/adapters/tongyi.js`
- `js/sidebarStarred/adapters/qwen.js`

Required chain:

- Make each adapter `matches()` async.
- Make `SidebarStarredAdapterRegistry.getAdapter()` async in `js/sidebarStarred/adapters/registry.js`.
- Update callers:
  - `js/sidebarStarred/index.js`
  - `js/sidebarStarred/starred-tree-renderer.js`

## `matchesCurrentPlatform()` Call Chain

`matchesCurrentPlatform()` will become async through:

`matchesCurrentPlatform()` -> `matchesPlatform()` -> `getSiteInfoList()`

| File | Current usage | Migration note |
|---|---|---|
| `js/smartInputBox/prompt-dropdown-ui.js` | Gemini sync check while building dropdown HTML | Avoid async inside string-building path by using direct hostname check or precomputed platform cache. |
| `js/watermark/watermark-manager.js` | Gemini platform check | Make `_isGeminiPlatform()` async and await in init. |

### Smart Input Alias Chain

`js/smartInputBox/constants.js` defines compatibility aliases:

- `const matchesSmartInputPlatform = matchesCurrentPlatform;`
- `const getCurrentSmartInputPlatform = getCurrentPlatform;`

`matchesSmartInputPlatform()` therefore becomes async too. Every smart input adapter `matches()` method that returns `matchesSmartInputPlatform(...)` must become async, and `SmartEnterAdapterRegistry.getAdapter()` must await adapter `matches()`.

Smart input adapters to update:

- `js/smartInputBox/adapters/chatgpt.js`
- `js/smartInputBox/adapters/gemini.js`
- `js/smartInputBox/adapters/deepseek.js`
- `js/smartInputBox/adapters/kimi.js`
- `js/smartInputBox/adapters/perplexity.js`
- `js/smartInputBox/adapters/tongyi.js`
- `js/smartInputBox/adapters/qwen.js`
- `js/smartInputBox/adapters/grok.js`
- `js/smartInputBox/adapters/doubao.js`
- `js/smartInputBox/adapters/claude.js`
- `js/smartInputBox/adapters/yuanbao.js`
- `js/smartInputBox/adapters/notebooklm.js`

Required chain:

- Make each smart input adapter `matches()` async.
- Make `SmartEnterAdapterRegistry.getAdapter()` async in `js/smartInputBox/adapters/registry.js`.
- Update callers:
  - `js/smartInputBox/index.js`
  - `js/preventAutoScroll/index.js`
  - `js/scrollToBottom/scroll-to-bottom-manager.js`
  - `js/quickAsk/quick-ask-manager.js`

## `getSiteNameMap()` Call Chain

`getSiteNameMap()` will become async through:

`getSiteNameMap()` -> `getSiteInfoList()`

| File | Current usage | Migration note |
|---|---|---|
| `js/timeline/timeline-manager.js` | constructor sets `this.siteNameMap = getSiteNameMap()` | Do not await in constructor. Initialize `this.siteNameMap = {}` in constructor, then assign `await getSiteNameMap()` inside async `init()`. |

## `getSiteInfoByUrl()` Call Chain

`getSiteInfoByUrl()` will become async through:

`getSiteInfoByUrl(url)` -> `getSiteInfoList()`

| File | Current usage | Migration note |
|---|---|---|
| `js/sidebarStarred/starred-tree-renderer.js` | `renderStarredItem()` gets site info per item | Make tree rendering async, or preload/cache URL -> site info before synchronous render. Guard stale concurrent renders. |

## `getPlatformById()` Call Chain

`getPlatformById()` will become async through:

`getPlatformById(platformId)` -> `getSiteInfoList()`

| File | Current usage | Migration note |
|---|---|---|
| `js/panelModal/tabs/prompt/index.js` | `_getPlatformInfo(platformId)` called during prompt list rendering | Preload platform info cache before sync render, or make the render path async. |

## `getPlatformsByFeature()` Call Chain

`getPlatformsByFeature()` will become async through:

`getPlatformsByFeature(feature)` -> `getSiteInfoList()`

| File | Current usage | Migration note |
|---|---|---|
| `js/panelModal/tabs/timeline/index.js` | timeline platform settings lists | Await inside async setup methods. |
| `js/panelModal/tabs/starred/index.js` | sidebar starred platform settings section | Render placeholder first, then async append/populate section. |
| `js/panelModal/tabs/prompt/index.js` | prompt button platform options | Await when building prompt modal/options. |

## `platformSupportsFeature()` Call Chain

No current runtime call sites were found outside `js/global/constants.js`.

Still convert it to async for API consistency:

`platformSupportsFeature(platformId, feature)` -> `getSiteInfoList()`

## Panel Modal Chain Reactions

Several tabs need async `shouldShow()`, async `mounted()`, or async data population.

Files to update:

- `js/panelModal/tab-registry.js`
- `js/panelModal/index.js`
- `js/panelModal/base-tab.js`
- `js/panelModal/tabs/chatWidth/index.js`
- `js/panelModal/tabs/mirrorSite/index.js`
- `js/panelModal/tabs/prompt/index.js`
- `js/panelModal/tabs/smartInputBox/index.js`
- `js/panelModal/tabs/starred/index.js`
- `js/panelModal/tabs/timeline/index.js`

Required chain:

- `registerAllTabs()` should become async and await tab `shouldShow()`.
- `registerTimelineTabs()` / `initializePanelModalTabs()` should return/await `registerAllTabs()`.
- `PanelModal.show()` and `switchTab()` should become async.
- `BaseTab` should protect async `mounted()` completions from writing to stale DOM after tab switch.

## Managers With Sync Hot Paths

These modules currently call platform helpers from synchronous methods. Avoid making every event handler async if the value can be preloaded once during init.

| File | Sync-path concern | Safer migration |
|---|---|---|
| `js/timeline/timeline-manager.js` | `getTimelineFeatures()`, AI complete toast label, active color, platform enabled checks, stable node ID checks | Cache `this._currentPlatform` and `this.siteNameMap` during async `init()`. |
| `js/timeline/chat-time-recorder.js` | `getPlatformFeatures()` is sync | Cache `_platformFeatures` during async `init()`. |
| `js/smartInputBox/prompt-button-manager.js` | feature/platform checks used after init | Cache `_currentPlatform` during async `init()`. |
| `js/smartInputBox/smart-enter-manager.js` | feature/platform checks used after init | Cache `_currentPlatform` during async `init()`. |
| `js/scrollToBottom/scroll-to-bottom-manager.js` | feature checks after init | Cache `_currentPlatform` during async init. |
| `js/preventAutoScroll/index.js` | `_inputAdapter()` is used by sync scroll/input handling and currently calls `smartEnterAdapterRegistry.getAdapter()` | Cache the smart input adapter during async init; sync methods should read the cached adapter. |
| `js/quickAsk/quick-ask-manager.js` | adapter/platform lookup used during selection handling | Preload `_cachedAdapter` and `_inputAdapter` during async init/enable. |

## Mirror Site Detector Chain

File: `js/mirrorSiteDetector/mirror-site-detector.js`

Required changes:

- `getSiteInfo()` should become async if it calls `getSiteInfoList()`.
- `isBuiltInSite(domain)` should become async.
- `detectAndSaveMirrorSite()` should await `isBuiltInSite(domain)`.
- Add `.catch()` around async calls started from `initMirrorSiteDetector()`.
- Add in-flight guard/debounce around repeated mutation-triggered detections.

Known logic risk unrelated to async migration:

- `findSourcePlatformByInput()` only uses input selectors. Some selectors are shared across platforms, for example Claude and Grok both use `.ProseMirror[contenteditable="true"]`. This can misclassify mirror domains unless stronger platform fingerprints are added.

## Suggested Migration Order

1. Convert all helpers in `js/global/constants.js` to async.
2. Convert timeline and sidebar adapter `matches()` methods, then their registries.
3. Convert smart input adapter `matches()` methods and `SmartEnterAdapterRegistry.getAdapter()`.
4. Convert feature bootstrap files that gate on `getCurrentPlatform()`:
   - `js/chat-width-manager/index.js`
   - `js/preventAutoScroll/index.js`
   - `js/quickAsk/index.js`
   - `js/runner/index.js`
   - `js/scrollToBottom/scroll-to-bottom-manager.js`
   - `js/sidebarStarred/index.js`
   - `js/smartInputBox/index.js`
   - `js/timeline/index.js`
   - `js/watermark/watermark-manager.js`
5. Convert panel modal registry/show/switch logic and tabs.
6. Convert manager internals by preloading platform/site info into instance fields during async init.
7. Convert `mirrorSiteDetector`.
8. Re-run the search commands below and ensure no synchronous array/object usage remains.

## Related Mirror Site Support Outside This Async Chain

These are not direct `getSiteInfoList()` migrations, but they affect mirror-site behavior.

| File | Current behavior | Migration note |
|---|---|---|
| `js/background.js` | `SUPPORTED_DOMAINS` is a static built-in domain whitelist used by extension action click handling. | If mirror sites should support clicking the extension icon to open the panel, background must also read `mirrorSiteSourceDomain` or receive an updated mirror-domain list. |
| `js/customSite/custom-site-utils.js` | Uses `CUSTOM_SITE_INFO`, not `getSiteInfoList()`. | No async migration needed for mirror domain storage, but keep separate from custom-site support. |
| `js/timeline/adapters/custom-sites.js` | Defines `CUSTOM_SITE_INFO`. | No async migration needed unless custom sites and mirror sites are intentionally unified later. |

## Verification Searches

Run these after migration:

```sh
rg "getSiteInfoList\\(\\)\\.(some|find|filter|forEach|map)" js -n
rg "for \\(const .* of getSiteInfoList\\(\\)\\)" js -n
rg "getCurrentPlatform\\(\\)\\?\\." js -n
rg "const platform = getCurrentPlatform\\(\\)" js -n
rg "matchesSmartInputPlatform\\(" js -n
rg "matchesPlatform\\(" js -n
rg "detectAdapter\\(" js -n
rg "getAdapter\\(" js/sidebarStarred js/smartInputBox js/quickAsk js/scrollToBottom -n
```

Expected result:

- Direct `getSiteInfoList()` usages should all be awaited.
- Helpers that wrap `getSiteInfoList()` should be async.
- Adapter registries should await async `matches()`.
- Sync UI/event methods should use cached platform/site info rather than calling async helpers inline.
