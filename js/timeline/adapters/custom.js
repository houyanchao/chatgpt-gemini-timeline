/**
 * Config-driven adapter for user-added AI sites.
 *
 * The adapter intentionally accepts only selectors and simple URL includes.
 * It never executes user-provided JavaScript.
 */
class CustomSiteAdapter extends SiteAdapter {
    constructor(config) {
        super();
        this.config = config || {};
        this.id = this.config.id || `custom-${this._slugify(location.hostname)}`;
        this.isCustom = true;
    }

    matches(url) {
        if (this.config.enabled === false) return false;
        if (!Array.isArray(this.config.sites) || this.config.sites.length === 0) return false;
        try {
            const hostname = new URL(url).hostname;
            return this.config.sites.some(site => hostname === site || hostname.endsWith(`.${site}`));
        } catch {
            return false;
        }
    }

    getUserMessageSelector() {
        return this.config.userMessageSelector || '';
    }

    getFeatures() {
        return this.config.features || {};
    }

    generateTurnId(element, index) {
        const attr = this.config.turnIdAttribute;
        const attrValue = attr ? element?.getAttribute?.(attr) : null;
        return attrValue ? `${this.id}-${attrValue}` : `${this.id}-${index}`;
    }

    extractText(element) {
        const textSelector = this.config.textSelector || '';
        const target = textSelector ? element?.querySelector?.(textSelector) : element;
        const text = (target?.textContent || '').trim();
        return text || '[图片或文件]';
    }

    isConversationRoute(pathname) {
        if (this.config.conversationUrlPattern) {
            return this._matchesConversationUrl(location.href);
        }

        const includes = this.config.conversationPathIncludes || [];
        if (!includes.length) return true;
        return includes.some(part => part && pathname.includes(part));
    }

    findConversationContainer(firstMessage) {
        const selector = this.config.conversationContainerSelector || '';
        if (selector) {
            const container = document.querySelector(selector);
            if (container) return container;
        }
        return ContainerFinder.findConversationContainer(firstMessage, {
            messageSelector: this.getUserMessageSelector()
        }) || super.findConversationContainer(firstMessage);
    }

    getTimelinePosition() {
        return {
            top: this.config.timelineTop || '120px',
            right: this.config.timelineRight || '22px',
            bottom: this.config.timelineBottom || '120px'
        };
    }

    getScrollOffset() {
        const offset = Number(this.config.scrollOffset);
        return Number.isFinite(offset) ? offset : 30;
    }

    shouldHideTimeline() {
        const selectors = this.config.hideTimelineSelectors || [];
        return selectors.some(selector => {
            try {
                return !!selector && document.querySelector(selector) !== null;
            } catch {
                return false;
            }
        });
    }

    getTimelineVisibilitySelectors() {
        return (this.config.hideTimelineSelectors || []).filter(Boolean);
    }

    isAIGenerating() {
        const selector = this.config.aiGeneratingSelector || '';
        if (!selector) return null;
        try {
            const el = document.querySelector(selector);
            if (!el) return false;
            if (this.config.aiGeneratingMode === 'not-hidden') {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            }
            return true;
        } catch {
            return null;
        }
    }

    _matchesConversationUrl(url) {
        const pattern = this.config.conversationUrlPattern;
        if (!pattern) return true;

        try {
            const regex = new RegExp(pattern);
            const urlWithoutProtocol = String(url || '').replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
            return regex.test(url) || regex.test(urlWithoutProtocol);
        } catch {
            return false;
        }
    }

    _slugify(value) {
        return String(value || 'site')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'site';
    }
}
