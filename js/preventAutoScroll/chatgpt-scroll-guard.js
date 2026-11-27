/** GPT / Claude MAIN world / document_start：在页面缓存原生滚动方法前安装拦截。 */
(function () {
    'use strict';

    const marker = '[data-ait-scroll-anchor]';
    const dispatch = EventTarget.prototype.dispatchEvent;
    const closest = Element.prototype.closest;
    const Event = CustomEvent;
    let historyNavigation = null;
    let detachedScrollTarget;

    function endHistoryNavigation() {
        if (!historyNavigation) return;
        clearTimeout(historyNavigation.timer);
        historyNavigation.listeners.abort();
        historyNavigation = null;
    }

    function isChatNavigationKey(event, scroller) {
        const target = event.target;
        if (event.key !== 'Home' && event.key !== 'End') return false;
        if (event.isComposing || event.shiftKey || event.altKey || target.isContentEditable
            || closest.call(target, 'input, textarea, select, [role="textbox"], [role="combobox"], [role="slider"], [role="listbox"], [role="menu"], [role="tablist"], dialog, [role="dialog"], .ait-chat-timeline-wrapper, .ait-node-navigation-loading')) return false;
        if (target === document.body || target === document.documentElement) return true;
        if (!scroller.contains(target)) return false;
        for (let el = target; el && el !== scroller; el = el.parentElement) {
            if (el.scrollHeight > el.clientHeight + 1 && /^(auto|scroll|overlay)$/.test(getComputedStyle(el).overflowY)) return false;
        }
        return true;
    }

    if (location.hostname === 'chatgpt.com' || location.hostname === 'chat.openai.com') {
        document.addEventListener('ait:history-navigation-start', event => {
            const element = event.target;
            const token = event.detail;
            if (!(element instanceof Element) || typeof token !== 'string' || !token) return;
            if (historyNavigation?.element === element && historyNavigation.token === token) {
                // A long-running export renews the guard; preserve the previously observed scroll range.
                clearTimeout(historyNavigation.timer);
                historyNavigation.timer = setTimeout(endHistoryNavigation, 125000);
                return;
            }
            endHistoryNavigation();

            const listeners = new AbortController();
            const options = { capture: true, passive: true, signal: listeners.signal };
            historyNavigation = {
                element, token, listeners, range: element.scrollHeight - element.clientHeight,
                timer: setTimeout(endHistoryNavigation, 125000)
            };
            // 绑定在容器本身，React 即使已将它卸载，原导航仍可同步解除保护。
            element.addEventListener('ait:history-navigation-end', e => {
                if (e.target === element && e.detail === token) endHistoryNavigation();
            }, options);
            const onUserNavigation = e => {
                if (!e.isTrusted || e.defaultPrevented || !(e.target instanceof Element)) return;
                if (e.type === 'click') {
                    const button = closest.call(e.target, 'button[class~="group/scroll-to-bottom"]');
                    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true'
                        || !(element.contains(button) || element.parentElement?.contains(button))) return;
                } else if (!isChatNavigationKey(e, element)) return;
                endHistoryNavigation();
                dispatch.call(element, new Event('ait:history-navigation-takeover', { bubbles: true, detail: token }));
            };
            document.addEventListener('click', onUserNavigation, options);
            document.addEventListener('keydown', onUserNavigation, options);
            window.addEventListener('pagehide', endHistoryNavigation, options);
        }, true);
    }

    function blocksHistoryBottom(element, method, args) {
        if (!historyNavigation || historyNavigation.element !== element || method === 'scrollIntoView') return false;
        const first = args[0];
        // 只检查显式数值，避免触发页面选项对象的 getter，或误拦纯水平滚动。
        let y = args[1];
        if (method === 'scrollTop') y = first;
        else if (args.length === 1 && first && typeof first === 'object') {
            try {
                y = Object.getOwnPropertyDescriptor(first, 'top')?.value;
            } catch {
                // WebIDL 只需读取 top；页面的 Proxy 可能不允许查询描述符。
                return false;
            }
        }
        if (!Number.isFinite(y)) return false;
        const from = element.scrollTop;
        const top = method === 'scrollBy' ? from + y : y;
        const range = element.scrollHeight - element.clientHeight;
        const growth = range - historyNavigation.range;
        historyNavigation.range = range;
        const reachesBottom = top >= range - 1 && from < range - 1;
        const reachesReverseBottom = top >= -1 && from < -1;
        if (!reachesBottom && !reachesReverseBottom) return false;
        if (getComputedStyle(element).flexDirection === 'column-reverse') return reachesReverseBottom;
        // 前插页面后，站点按新增高度补偿原阅读位置；这种写入即使落在边界也应放行。
        const preservesPosition = growth > 1 && Math.abs(top - from - growth) <= 1;
        return reachesBottom && !preservesPosition;
    }

    function blocked(element, method) {
        if (!(element instanceof Element) || !closest.call(element, marker)) return false;
        // 同步、可取消的 DOM 事件跨 world 通知控制器；无人处理时保持原生行为。
        return !dispatch.call(element, new Event('ait:before-programmatic-scroll', {
            bubbles: true,
            cancelable: true,
            detail: method,
        }));
    }

    for (const name of ['scroll', 'scrollTo', 'scrollBy', 'scrollIntoView']) {
        const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, name);
        if (typeof descriptor?.value !== 'function' || !descriptor.configurable) continue;
        const original = descriptor.value;
        Object.defineProperty(Element.prototype, name, {
            ...descriptor,
            value: function (...args) {
                if (blocksHistoryBottom(this, name, args) || blocked(this, name)) {
                    // 由浏览器生成原生的无位移返回值（较新 Chromium 返回 Promise）。
                    detachedScrollTarget ||= document.createElement('div');
                    return Reflect.apply(original, detachedScrollTarget, []);
                }
                return Reflect.apply(original, this, args);
            },
        });
    }

    const top = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    if (top?.set && top.configurable) {
        Object.defineProperty(Element.prototype, 'scrollTop', {
            ...top,
            set(value) {
                if (!blocksHistoryBottom(this, 'scrollTop', [value]) && !blocked(this, 'scrollTop')) top.set.call(this, value);
            },
        });
    }
})();
