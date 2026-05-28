/**
 * Static custom timeline site configs.
 *
 * These sites only enable the basic timeline behavior:
 * active state tracking and click-to-scroll navigation.
 *
 * Config fields:
 * - sites: Required. Domains that use this adapter. Use hostname only, without protocol.
 *   Matching includes the exact domain and its subdomains.
 * - features: Required. Feature flags for this custom site. Current custom sites use
 *   timeline: true, chatTimes: false, timeline_tooltipActions: false.
 * - conversationUrlPattern: Optional. Regular expression string used to decide whether
 *   the current page is a conversation page. Write it without http/https; the adapter
 *   tests both the full URL and a protocol-stripped URL.
 * - conversationPathIncludes: Optional fallback when conversationUrlPattern is absent.
 *   The page is treated as a conversation route if location.pathname contains any item.
 *   If both conversationUrlPattern and conversationPathIncludes are absent, every page
 *   on the matched domain is treated as a conversation page.
 * - userMessageSelector: Required. CSS selector for user message nodes. The matched
 *   elements become timeline nodes.
 * - textSelector: Optional. Selector inside each user message node used to extract
 *   display text. If omitted, textContent is read from the whole message node.
 * - conversationContainerSelector: Optional. CSS selector for the scrollable message
 *   container. If omitted, the adapter tries to infer it from the first message.
 * - turnIdAttribute: Optional. Attribute on the user message node used as a stable
 *   timeline id. If omitted, the message index is used.
 * - timelineTop / timelineRight / timelineBottom: Optional CSS length values for
 *   timeline placement. Defaults are 120px / 22px / 120px.
 * - scrollOffset: Optional number of pixels to offset when jumping to a message.
 * - hideTimelineSelectors: Optional selector list. If any selector exists on the page,
 *   the timeline is hidden.
 * - aiGeneratingSelector: Optional. Selector used to detect whether the AI is replying.
 * - aiGeneratingMode: Optional. Set to "not-hidden" when aiGeneratingSelector should
 *   count only visible elements; otherwise existence means generating.
 * - enabled: Optional. Set to false to keep a config in the file but disable it.
 */
globalThis.CUSTOM_SITE_INFO = [
    {
        sites: ['aistudio.xiaomimimo.com'],
        conversationUrlPattern: '^aistudio\\.xiaomimimo\\.com/(?:[^#]*)?#/chat/[A-Za-z0-9_-]+(?:[/?].*)?$',
        userMessageSelector: '#message-list .relative.flex.w-full.mx-auto:has(> .group.flex-row-reverse)',
        textSelector: '.bg-mimo-bg-message',
        conversationContainerSelector: '#message-list',
        features: {
            timeline: true,
            questionList: true,
            notepad: true
        },
    }
];
