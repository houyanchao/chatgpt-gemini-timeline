# Message actions

Shared interaction infrastructure for actions on selected conversation messages.
ChatGPT, Gemini, Claude, DeepSeek, Kimi and Doubao use this flow.

## Boundaries

- `adapters/`: page facts only: message identity, role, DOM node, turn identity,
  generation state, native action row, history targets/scroller/loading state,
  composer bounds, and snapshot exclusion rules. No format or renderer logic.
- `selection-store.js`: ordered message identities, independent role selection,
  explicit full-history completion, select-all intent and manual exclusions.
- `message-loader.js`: existing ChatGPT export traversal extracted for reuse.
  Visits stable top/history targets/bottom, collects each rendered window, restores
  the original position, and reports incomplete loading instead of partial success.
- `action-manager.js`: registered entries, session/cancellation, settings, lazy UI,
  shared selection/loading and collector lifecycle. It does not know action IDs,
  file formats, image libraries, or output implementation details.
- `selection-ui.js`: checkbox overlays and the bottom operation bar. Source
  messages are not wrapped or modified. Action-specific controls are supplied by
  the registered action. The compact bar shows the action title, select-all and
  selected/total count, action options, and confirmation. Deselecting all keeps
  the operation open; progress/status text appears only while needed.
  The close button exits and restores entry focus; no Escape listener is installed.
  Copy-capable actions place a text-only secondary button before download. Its
  label/visibility follows the action's current options; PDF keeps download only.
- `controls.js`: shared accessible checkbox, icon and select components in the
  lazy UI bundle. Business options reuse these without owning message selection.
- `index.js`: registry, platform activation, settings and content-session cleanup.

The reply entry selects that reply; a header entry starts with no selection.
While the operation bar is open, active input pets are temporarily hidden.
Closing the bar restores their normal visibility without changing pet settings.
Opening either never loads history or produces output. The operation remains
fixed until closed. Select-all explicitly loads history and selects new arrivals;
manual exclusions survive that load. Stopping retains the current selection but
stops future automatic selection. Generating replies cannot be selected.
Copy uses the same selected messages, collector and options as download. It keeps
the operation and selection open after success or failure, and reports progress
on the copy button. Clipboard writes begin synchronously on the click path with
deferred data; closing or changing branch aborts pending generation. No clipboard
read permission or additional extension permission is requested.
While loading, a shared top-of-page notice shows an animated spinner, loaded
message count and stop control. It is removed on completion, cancellation or
session cleanup; loading feedback is not duplicated in the bottom bar.
Changing the active branch or replacing a selected reply cancels the operation
and releases its captured content. Starting a new generation also invalidates
the operation before an edited branch can reuse old snapshots. Prepending history
or appending known branch turns does not invalidate selection.
Selection outlines are owned overlays, clipped to the page's visible content
area; adjacent outlines keep a gap and never enter the captured message DOM.
Each outline retains the full message bounds; viewport clipping hides offscreen
borders rather than moving the top and bottom borders into the visible area.

## Registering an action

Call `window.AITMessageActions.registerAction(descriptor)` from a platform feature
entry. It returns an unregister function. IDs must be unique lowercase slugs.

Required descriptor members:

- `id`, `icon` (trusted extension SVG), `label()` and `supports(platformId)`.
- `createOptions({adapter})`: return `{element, getValue(), destroy?()}` after the
  common lazy UI has loaded. Never trigger a download in this method.
- `execute({messages, collector, options, adapter, signal})`: consume messages in
  conversation order; check cancellation before any output side effect.

Optional members:

- `confirmLabel()`: confirmation-button text when it differs from the entry/title.
- `showConfirmIcon: false`: keep the confirmation button text-only independently
  of the operation bar layout.
- `barLayout: 'compact'`: a title-free bar with a text confirmation button and
  inline close control. Progress feedback still appears when needed.
- `barLayout: 'panel'`: options above a separate selection/confirmation footer,
  for actions with multiple always-visible settings.
- `settingsKey`: independent per-platform enablement (default enabled).
- `optionsKey`: local storage key for confirmed action options.
- `createHeaderButton({adapter})`, `mountHeader(button, {adapter})`: additional entry in the
  native header. An action-provided button keeps its own appearance and hover
  behavior; the shared layer only adds identity/accessibility and click handling.
  `headerClassName` can style the default button when no factory is provided.
- `errorMessage(error)`: action-specific localized error text.
- `copyType(options)`, `copyLabel(options)`, `copy(context)`: optional copy output.
  Return `text/plain` or `image/png` from `copyType`, or `null` to hide copying for
  the selected options. `copy` returns matching text/Blob data without downloading.
  `global/clipboard-utils.js` handles clipboard transfer; business actions own
  generation. Clipboard generation shares `prepareOutput` with downloads.
- `createCollector({adapter,signal})`: return `capture(message)`, `has(key)`,
  `get(key)`, `remove(key)` and `destroy()`. The action owns its payload/cache;
  the shared layer only passes message records and manages lifecycle. Collectors
  released after cancellation are destroyed immediately. Async capture must honor
  its signal. A detached message needs a previously captured payload to execute.

Message records are `{key,id,role,turnId,element,generating}`. `key` identifies the
actual message/branch, never its position. `turnId` groups related question/reply.

## Adding a platform

Implement a separate adapter extending `MessageActionsAdapter`, add it to the
registry and source list, then enable the relevant action capability. Reuse the
existing timeline adapter for page facts where possible. Verify native toolbar
placement, both roles, history completeness/order, branch replacement, SPA
navigation, cancellation and settings on the real platform before migration.
`getToolbarMount(toolbar)` supplies `{container, before}` for native insertion
points. ChatGPT places the shared entries before the last native action. Gemini
places them before the reply's more-options control. Repeated scans only move
entries when needed.
Business actions may also need platform content extraction; keep it outside the
shared manager. Export uses each platform's existing DOM extraction adapter.
`getConversationState()` may return `{turnIds}` only when the entire active branch
is known; return `null` for partial history or unavailable data.
`subscribeConversationChanges(callback)` reports fresh branch facts and returns
an unsubscribe function. Virtualized DOM windows must not be treated as complete
branch snapshots. ChatGPT reuses the timeline adapter's captured branch data.

## Loading

Declare source order and exports in `scripts/content-bundles.config.json`.
Shared adapters/store/loader/manager/registry and lightweight action descriptors
are in `core`; `message-actions-ui` loads on entry. `export-ui` only loads on
confirmed export; `message-screenshot-renderer` loads when snapshots are needed.
`AITClipboard` is exported from core for use by actions and lazy UI consumers.
The reusable `global/loading-notice` component loads with `message-actions-ui`;
its styles are declared in core and the manifest's web-accessible resources.
The shared CSS is in core and manifest web-accessible resources. Do not edit
bundles/config directly: run `node scripts/build-content.js` and `--check`.

The action glyphs use Lucide's `file-down` and `scissors` SVG paths, adapted to the
existing 18 px size and stroke. Source: https://github.com/lucide-icons/lucide/tree/main/icons.
The upstream license is included in `LUCIDE-LICENSE`; no icon runtime is loaded.
