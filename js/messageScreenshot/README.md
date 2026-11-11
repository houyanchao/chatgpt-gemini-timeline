# Message screenshots

Available on ChatGPT, Gemini, Claude, DeepSeek, Kimi and Doubao. The scissors button in each reply's native action
row opens the shared message selection surface. Users can select arbitrary
questions/replies and choose 1×, 2× (default), 3× or 4× resolution. The separate
export button uses the same selection surface with export-specific options.
The operation bar offers Copy image alongside Download screenshot. Copy preserves
the selected resolution and message backgrounds, and keeps selection open. If a
capture requires multiple fragments, copying reports that it needs downloading
before rendering any fragment; no partial image is silently copied.

## Responsibilities

- `index.js`: register the screenshot action on supported platforms.
- `screenshot-action.js`: screenshot options/settings, owned snapshot cache,
  renderer loading, cancellation and PNG downloads.
- `screenshot-options.js`: resolution controls hosted by the shared operation bar.
- `snapshot-utils.js`: styled DOM clones, safe media embedding, bounded waits and
  contiguous fragments. Native action rows, owned UI, accessibility-only headings
  and platform identity attributes are excluded; source messages are untouched.
- `capture-service.js`: staging, font embedding, pixel limits and PNG blobs.
- `libs/`: fixed html-to-image npm version, MIT license and integrity provenance.

Message discovery, page adapters, checkbox UI, selection state and history loading
belong to `../messageActions`; do not duplicate these in screenshot code. The
renderer consumes prepared snapshots without Markdown conversion, remote capture
services or browser screenshot permissions. Closed sections keep their displayed
state. Cache reuse checks the source, markup, width and theme.
Messages containing Canvas are recaptured so redraws cannot reuse stale pixels.
Each message retains its own computed background, including transparency. The
capture canvas, spacing and padding stay transparent; ancestor backgrounds and
system-theme fallback colors are not added.

## Loading and settings

The source list in `scripts/content-bundles.config.json` declares inclusion/order.
The descriptor is lightweight core code; options live in `message-actions-ui`;
`message-screenshot-renderer` loads only when a snapshot is needed, exporting
`MessageScreenshotSnapshot` and `MessageScreenshotCaptureService`.

`SITE_INFO.features.messageScreenshot` explicitly enables supported platforms.
`messageScreenshotPlatformSettings` stores independent per-platform switches
(default on). The settings section shares the conversation-export tab but does
not depend on export capability or its switches. `messageScreenshotOptions`
persists the confirmed scale. Both business actions use `AITDownload`.

## Limits and validation

Fragments are bounded to 32 million pixels, 16,000 pixels per side, 4,000 CSS
pixels high and 30 files. This keeps ordinary multi-message 4× captures together
instead of separating a short trailing paragraph into its own file.
Paragraph-aligned cuts reserve enough capacity for the remaining fragments to
stay within the 30-file limit. Image transfers have a bounded total wait across
response headers, body reading and data URL conversion; cancellation or timeout
aborts their network requests and active readers.
The selected scale is preserved when splitting; huge captures fail explicitly
instead of silently lowering resolution/truncating. Images/fonts must be readable
under existing browser permissions. Failed images produce an error; visible
iframe/video/object content and unreadable canvases are unsupported. Multiple
fragments are subject to the browser's normal download controls.

Real-page validation covers reply/header entries, three rounds/six messages, select-all,
reply-only Markdown, full JSON, selected-role PNG and 1×/4× styled screenshots.
Renderer fixtures additionally cover text, tables, code, MathML, SVG, embedded
images, dark theme, long fragments, failed-image handling and staging cleanup.
