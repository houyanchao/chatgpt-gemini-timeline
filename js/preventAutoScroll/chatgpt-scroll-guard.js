/** GPT MAIN world / document_start：在页面缓存原生滚动方法前安装拦截。 */
(function () {
    'use strict';

    const marker = '[data-ait-scroll-anchor]';
    const dispatch = EventTarget.prototype.dispatchEvent;
    const closest = Element.prototype.closest;
    const Event = CustomEvent;

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
                if (blocked(this, name)) return;
                return Reflect.apply(original, this, args);
            },
        });
    }

    const top = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    if (top?.set && top.configurable) {
        Object.defineProperty(Element.prototype, 'scrollTop', {
            ...top,
            set(value) {
                if (!blocked(this, 'scrollTop')) top.set.call(this, value);
            },
        });
    }
})();
