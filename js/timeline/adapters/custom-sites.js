
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
