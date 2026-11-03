// MAIN world / document_start：只读取 Claude 自己加载的会话响应。
// 虚拟列表会卸载旧消息，使用当前分支的提问快照补齐时间轴；不额外请求接口。
(() => {
    'use strict';
    if (window.__aitClaudeApiCapture) return;
    window.__aitClaudeApiCapture = true;

    const snapshots = new Map();
    const requests = new Map();
    const rootId = '00000000-0000-4000-8000-000000000000';
    let sequence = 0;

    function conversationIdFromUrl(input) {
        try {
            const url = new URL(typeof input === 'string' || input instanceof URL ? input : input?.url, location.href);
            if (url.origin !== location.origin) return null;
            return url.pathname.match(/^\/api\/organizations\/[^/]+\/chat_conversations\/([a-f0-9-]+)$/i)?.[1] || null;
        } catch { return null; }
    }

    function parseSnapshot(data, conversationId, revision) {
        if (data?.uuid !== conversationId || !Array.isArray(data.chat_messages)) return null;
        const messages = new Map(data.chat_messages.map(message => [message.uuid, message]));
        const branch = [], visited = new Set();
        let id = data.current_leaf_message_uuid;
        if (!id && messages.size) return null;
        while (id && id !== rootId) {
            if (visited.has(id) || !messages.has(id)) return null;
            visited.add(id);
            const message = messages.get(id);
            branch.push(message);
            id = message.parent_message_uuid;
        }
        const visible = branch.reverse().filter(message => ['human', 'assistant'].includes(message.sender));
        const entries = visible.flatMap((message, rowIndex) => {
            if (message.sender !== 'human') return [];
            const text = (Array.isArray(message.content)
                ? message.content.filter(part => part?.type === 'text' && typeof part.text === 'string')
                    .map(part => part.text).join('\n')
                : '').trim() || String(message.text || '').trim();
            return [{ id: message.uuid, text: text || '[图片或文件]', rowIndex }];
        });
        return { conversationId, revision, leafId: data.current_leaf_message_uuid, entries, messageCount: visible.length };
    }

    document.addEventListener('ait-claude-timeline-pull', event => {
        const conversationId = location.pathname.match(/^\/(?:chat|share)\/([a-f0-9-]+)$/i)?.[1];
        if (!conversationId || event.detail !== conversationId) return;
        document.dispatchEvent(new CustomEvent('ait-claude-timeline-result', {
            detail: JSON.stringify(snapshots.get(conversationId) || { conversationId, entries: null })
        }));
    });

    const nativeFetch = window.fetch;
    window.fetch = function(input, init) {
        const conversationId = conversationIdFromUrl(input);
        const method = String(init?.method || input?.method || 'GET').toUpperCase();
        const request = conversationId && method === 'GET' ? ++sequence : null;
        if (request) requests.set(conversationId, request);
        const result = nativeFetch.apply(this, arguments);
        if (request) {
            void result.then(async response => {
                if (!response.ok) return;
                const data = await response.clone().json();
                if (requests.get(conversationId) !== request) return;
                const snapshot = parseSnapshot(data, conversationId, request);
                if (!snapshot) return;
                snapshots.delete(conversationId);
                snapshots.set(conversationId, snapshot);
                if (snapshots.size > 5) {
                    const oldest = snapshots.keys().next().value;
                    snapshots.delete(oldest);
                    requests.delete(oldest);
                }
                document.dispatchEvent(new CustomEvent('ait-claude-timeline-updated', {
                    detail: JSON.stringify({ conversationId })
                }));
            }).catch(() => {});
        }
        return result;
    };
})();
