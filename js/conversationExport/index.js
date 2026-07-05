/**
 * Conversation Export - 入口
 *
 * 检测当前平台是否开启对话导出（当前仅 Gemini），若是则初始化导出管理器。
 * 管理器自身监听 DOM 与路由变化，负责按钮的注入与重建。
 */

(function initConversationExport() {
    'use strict';

    let manager = null;
    let initInFlight = false;

    async function init() {
        if (manager || initInFlight) return;
        initInFlight = true;
        try {
            if (typeof TimelineI18n !== 'undefined' && TimelineI18n.ready) {
                await TimelineI18n.ready();
            }

            const adapter = getConversationExportAdapter();
            if (!adapter) return; // 当前平台未开启导出

            manager = new CEExportManager(adapter);
            manager.init();
        } catch (error) {
            manager = null;
        } finally {
            initInFlight = false;
        }
    }

    function cleanup() {
        if (manager) {
            manager.destroy();
            manager = null;
        }
    }

    window.addEventListener('beforeunload', cleanup);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 600));
    } else {
        setTimeout(init, 600);
    }
})();
