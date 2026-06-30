
/**
 * Built-in custom site configs.
 *
 * How to add a new platform from the "123456" detector:
 * 1. The detector searches for text containing "123456", then prints the
 *    matched node and up to 10 ancestor opening tags.
 * 2. Pickers must be as robust as possible. Prefer stable attributes, semantic
 *    containers, and platform-specific structure. Avoid broad utility classes
 *    or generic selectors that can also match buttons, menus, sidebars, cards,
 *    code blocks, or assistant messages.
 * 3. For the timeline, pick the stable user-message wrapper from that demo as
 *    `userMessageSelector`, and pick the text node/container inside it as
 *    `textSelector`.
 * 4. Verify `userMessageSelector` matches only real user turns, remains stable
 *    after message edits/regeneration/history loading, and does not rely on
 *    text content itself.
 * 5. Pick the scroll/message-list parent as `conversationContainerSelector`.
 * 6. Add `conversationUrlPattern` so the timeline only runs on real chat pages.
 * 7. If the demo comes from a sidebar/history item, keep those selectors in
 *    sidebar* fields for future sidebar-starred support; the timeline adapter
 *    currently reads only timeline fields.
 *
 * Fields used by CustomSiteAdapter:
 * - sites: hostnames that enable this config.
 * - conversationUrlPattern: regex matched against the full URL and URL without
 *   protocol.
 * - userMessageSelector: CSS selector for each user turn.
 * - textSelector: CSS selector inside a user turn. Use one CSS selector string;
 *   comma-separated selectors are OK.
 * - conversationContainerSelector: CSS selector for the message list / scroll
 *   content container.
 * - turnIdAttribute: optional stable id attribute on the user turn.
 * - timelineTop/timelineRight/timelineBottom/scrollOffset: optional timeline
 *   positioning and scroll tuning.
 * - timelineZIndex: optional timeline wrapper z-index for sites with high
 *   stacking contexts.
 * - timelineBarBackground: optional timeline bar background. Use
 *   { light, dark } when the platform has different light/dark themes.
 * - aiGeneratingSelector/aiGeneratingMode: optional reply-generation detector.
 * - hideTimelineSelectors: optional selectors that temporarily hide timeline.
 * - features: enables modules for this site.
 */
globalThis.CUSTOM_SITE_INFO = [
    {
        sites: ['copilot.microsoft.com'],
        conversationUrlPattern: '^copilot\\.microsoft\\.com/chats/[A-Za-z0-9_-]+(?:[/?#].*)?$',
        userMessageSelector: '[role="article"][id$="-user-message"]:has([data-content="user-message"])',
        textSelector: '[data-content="user-message"]',
        timelineBarBackground: {
            light: 'rgba(232, 232, 228, 0.9)',
            dark: 'rgba(45, 45, 48, 0.95)'
        },
        features: {
            timeline: true,
            questionList: true,
            notepad: true
        },
    },
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
    },
    {
        sites: ['chatglm.cn'],
        conversationUrlPattern: '^chatglm\\.cn/main/.*[?&]cid=[A-Za-z0-9]+',
        userMessageSelector: '.conversation.question',
        textSelector: '.question-txt span',
        conversationContainerSelector: '.conversation-list',
        features: {
            timeline: true,
            questionList: true,
            notepad: true
        },
    },
    {
        sites: ['www.meta.ai'],
        conversationUrlPattern: '^www\\.meta\\.ai/prompt/[0-9a-f-]+(?:[/?#].*)?$',
        userMessageSelector: '[data-message-type="user"]',
        textSelector: '[data-slot="text"]',
        conversationContainerSelector: 'div.box-border[style*="--composer-overlap"]',
        features: {
            timeline: true,
            questionList: true,
            notepad: true
        },
    },
    {
        sites: ['venice.ai'],
        conversationUrlPattern: '^venice\\.ai/chat/classic/[A-Za-z0-9_-]+(?:[/?#].*)?$',
        userMessageSelector: '[data-message-id]:has([data-testid="user-message"])',
        textSelector: '[data-testid="user-message"]',
        turnIdAttribute: 'data-message-id',
        sidebarContainerSelector: '[aria-hidden="true"] [data-viewport-type="window"], [aria-hidden="true"] [data-virtuoso-scroller="true"]',
        sidebarCurrentConversationSelector: 'a[data-active][href^="/chat/classic/"]',
        sidebarConversationTitleSelector: 'a[data-active][href^="/chat/classic/"][aria-label]',
        timelineBarBackground: {
            light: 'rgba(244, 244, 242, 0.88)',
            dark: 'rgba(34, 34, 34, 0.88)'
        },
        features: {
            timeline: true,
            questionList: true,
            notepad: true
        },
    },
    {
        sites: ['chat2.gptcat.cc'],
        conversationUrlPattern: '^chat2\\.gptcat\\.cc/(?:[^#]*)?#/chat(?:[/?].*)?$',
        userMessageSelector: '[modelname="我"]:has(.break-words.whitespace-pre-wrap)',
        textSelector: '.break-words.whitespace-pre-wrap',
        conversationContainerSelector: '#scrollRef',
        timelineZIndex: 60,
        features: {
            timeline: true,
            questionList: true,
            notepad: true
        },
    },
    {
        sites: ['chat.z.ai'],
        conversationUrlPattern: '^chat\\.z\\.ai/c/[0-9a-f-]+(?:[/?#].*)?$',
        userMessageSelector: '.user-message',
        textSelector: '.flex.justify-end .overflow-hidden.rounded-xl, .whitespace-pre-wrap .rounded-xl, .rounded-xl.p-3',
        conversationContainerSelector: '#messages-container',
        sidebarContainerSelector: '#sidebar',
        sidebarCurrentConversationSelector: '#sidebar button[data-selected="true"]',
        sidebarConversationTitleSelector: '[dir="auto"].truncate',
        timelineBarBackground: {
            light: 'rgba(232, 234, 238, 0.88)',
            dark: 'rgba(56, 56, 62, 0.92)'
        },
        features: {
            timeline: true,
            questionList: true,
            notepad: true
        },
    },
];
