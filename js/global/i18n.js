/**
 * Timeline i18n adapter.
 *
 * Browser extension metadata still follows the browser locale. Runtime UI can
 * use a user-selected locale through this adapter.
 */
(function initializeTimelineI18n(global) {
    if (typeof global.chrome === 'undefined' && typeof global.browser !== 'undefined') {
        global.chrome = global.browser;
    }

    const STORAGE_KEY = 'timelineInterfaceLanguage';
    const DEFAULT_LOCALE = 'en';
    const AUTO_LOCALE = 'auto';
    const SUPPORTED_LOCALES = new Set([AUTO_LOCALE, 'en', 'zh_CN']);

    class TimelineI18nAdapter {
        constructor() {
            this.locale = AUTO_LOCALE;
            this.messages = new Map();
            this._readyPromise = this._initialize();
        }

        async _initialize() {
            try {
                const result = await chrome.storage.local.get(STORAGE_KEY);
                const storedLocale = result?.[STORAGE_KEY];
                this.locale = SUPPORTED_LOCALES.has(storedLocale) ? storedLocale : AUTO_LOCALE;
                await this._loadSelectedMessages();
            } catch (error) {
                console.warn('[TimelineI18n] Failed to initialize, using browser language:', error);
                this.locale = AUTO_LOCALE;
            }
        }

        ready() {
            return this._readyPromise;
        }

        getLanguage() {
            return this.locale;
        }

        getUILanguage() {
            if (this.locale === 'zh_CN') return 'zh-CN';
            if (this.locale === 'en') return 'en';
            return chrome.i18n.getUILanguage?.() || navigator.language || DEFAULT_LOCALE;
        }

        getAvailableLanguages() {
            return [
                { id: AUTO_LOCALE, messageKey: 'languageOptionAuto' },
                { id: 'zh_CN', label: '简体中文' },
                { id: 'en', label: 'English' }
            ];
        }

        async setLanguage(locale) {
            if (!SUPPORTED_LOCALES.has(locale)) {
                throw new Error(`Unsupported interface language: ${locale}`);
            }

            const previousLocale = this.locale;
            const previousMessages = new Map(this.messages);

            try {
                this.locale = locale;
                this.messages.clear();
                await this._loadSelectedMessages();
                await chrome.storage.local.set({ [STORAGE_KEY]: locale });
            } catch (error) {
                this.locale = previousLocale;
                this.messages = previousMessages;
                throw error;
            }

            global.dispatchEvent?.(new CustomEvent('timeline:i18n-changed', {
                detail: { locale }
            }));
        }

        getMessage(key, substitutions) {
            if (this.locale === AUTO_LOCALE || this.messages.size === 0) {
                return chrome.i18n.getMessage(key, substitutions);
            }

            const entry = this.messages.get(this.locale)?.[key]
                || this.messages.get(DEFAULT_LOCALE)?.[key];

            if (!entry || typeof entry.message !== 'string') {
                return chrome.i18n.getMessage(key, substitutions);
            }

            return this._applySubstitutions(entry, substitutions);
        }

        async _loadSelectedMessages() {
            if (this.locale === AUTO_LOCALE) return;

            const locales = this.locale === DEFAULT_LOCALE
                ? [DEFAULT_LOCALE]
                : [this.locale, DEFAULT_LOCALE];

            await Promise.all(locales.map(async locale => {
                const response = await fetch(chrome.runtime.getURL(`_locales/${locale}/messages.json`));
                if (!response.ok) {
                    throw new Error(`Failed to load locale ${locale}: ${response.status}`);
                }
                this.messages.set(locale, await response.json());
            }));
        }

        _applySubstitutions(entry, substitutions) {
            const values = substitutions == null
                ? []
                : (Array.isArray(substitutions) ? substitutions : [substitutions]);
            const substitutePositionals = value => String(value).replace(/\$(\d+)/g, (match, index) => {
                const replacement = values[Number(index) - 1];
                return replacement == null ? match : String(replacement);
            });

            const escapedDollar = '\u0000TIMELINE_DOLLAR\u0000';
            let message = entry.message.replace(/\$\$/g, escapedDollar);

            if (entry.placeholders && typeof entry.placeholders === 'object') {
                for (const [name, placeholder] of Object.entries(entry.placeholders)) {
                    const content = substitutePositionals(placeholder?.content || '');
                    message = message.replace(new RegExp(`\\$${this._escapeRegExp(name)}\\$`, 'gi'), content);
                }
            }

            message = substitutePositionals(message);
            return message.replaceAll(escapedDollar, '$');
        }

        _escapeRegExp(value) {
            return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }
    }

    global.TimelineI18n = new TimelineI18nAdapter();
})(globalThis);
