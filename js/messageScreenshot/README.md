# Message screenshots

Available on ChatGPT, Gemini, Claude, DeepSeek, Kimi and Doubao. The scissors button in each reply's native action
row opens the shared message selection surface. Users can select arbitrary
questions/replies and choose 1×, 2× (default), 3× or 4× resolution. The separate
export button uses the same selection surface with export-specific options.
The operation bar offers Copy image alongside Download screenshot. Each action
produces one PNG. Copy keeps the selection open. The renderer preserves message
backgrounds and the selected resolution when the full image fits.

## Responsibilities

- `index.js`: register the screenshot action on supported platforms.
- `screenshot-action.js`: screenshot options/settings, owned snapshot cache,
  renderer loading, cancellation and PNG downloads.
- `screenshot-options.js`: resolution controls hosted by the shared operation bar.
- `snapshot-utils.js`: styled DOM clones, safe media embedding, bounded waits and
  contiguous fragments. Native action rows, owned UI, accessibility-only headings
  and platform identity attributes are excluded; source messages are untouched.
- `capture-service.js`: staging, font embedding, slice compositing and PNG encoding.
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
persists the confirmed scale. Copy uses `AITClipboard`; download uses `AITDownload`.

## Limits and validation

The output is bounded to 32 million pixels and 16,000 pixels per side. The
renderer first tries to render the complete selection. If rendering or PNG
encoding fails, it renders up to 30 internal slices of at most 4,000 CSS pixels
high and combines them into one PNG. When needed, it scales down uniformly
and reports the resolution change. Cancellation or selections beyond the
layout limit fail without producing a partial file.
Image transfers have a bounded total wait across response headers, body
reading and data URL conversion; cancellation or timeout aborts their
network requests and active readers. Images/fonts must be readable
under existing browser permissions. Unreadable content images get placeholders,
and unreadable background layers are skipped. Partial output is reported after
copying or downloading. An image-only selection with no readable image produces
an error. Visible iframe/video/object content and unreadable canvases are unsupported.
Real-page validation covers reply/header entries, three rounds/six messages, select-all,
reply-only Markdown, full JSON, selected-role PNG and 1×/4× styled screenshots.
Renderer fixtures additionally cover text, tables, code, MathML, SVG, embedded
images, dark theme, long single-image captures, failed-image handling and staging cleanup.
