/**
 * Config-driven adapter for user-added AI sites.
 *
 * The adapter accepts selectors and declarative URL rules.
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
        return this._scopeConversationSelector(this.config.userMessageSelector);
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
        const urls = this.config.conversationUrls;
        const hasExactUrls = Array.isArray(urls) && urls.length > 0;
        if (hasExactUrls && urls.includes(location.href)) return true;

        if (this.config.conversationUrlPattern) {
            return this._matchConversationUrl(location.href) !== null;
        }

        const includes = this.config.conversationPathIncludes || [];
        if (!includes.length) return !hasExactUrls;
        return includes.some(part => part && pathname.includes(part));
    }

    findConversationContainer(firstMessage) {
        const selector = this._scopeConversationSelector(this.config.conversationContainerSelector);
        if (this.config.conversationScopeSelectors) {
            return selector ? firstMessage?.closest(selector) || null : null;
        }
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

    getTimelineBarBackground() {
        return this.config.timelineBarBackground || null;
    }

    getTimelineZIndex() {
        return this.config.timelineZIndex ?? null;
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

    _scopeConversationSelector(selector) {
        if (!selector) return '';
        const scopes = this.config.conversationScopeSelectors;
        if (!scopes) return selector;

        const url = location.href;
        const urls = this.config.conversationUrls;
        let scope = scopes.exactUrl;
        if (!Array.isArray(urls) || !urls.includes(url)) {
            const conversationId = this._matchConversationUrl(url)?.groups?.conversationId;
            scope = conversationId && scopes.urlPattern?.replace('{conversationId}', () => CSS.escape(conversationId));
        }
        return scope ? `:is(${scope}) :is(${selector})` : '';
    }

    _matchConversationUrl(url) {
        const pattern = this.config.conversationUrlPattern;
        if (!pattern) return null;

        try {
            const regex = new RegExp(pattern);
            const urlWithoutProtocol = String(url || '').replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
            return regex.exec(url) || regex.exec(urlWithoutProtocol);
        } catch {
            return null;
        }
    }

    _slugify(value) {
        return String(value || 'site')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'site';
    }
}
