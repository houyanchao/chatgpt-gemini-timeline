/** Export-only controls hosted by the shared operation bar. */
class CEExportOptions {
    constructor(defaultThemeId, stored = {}) {
        this.element = document.createElement('div'); this.element.className = 'ait-ma-options ait-ma-export-options';
        this.events = new AbortController();
        const fields = document.createElement('div'); fields.className = 'ait-ma-export-fields';
        this.element.appendChild(fields);
        const select = (label, values, value) => {
            const control = MessageActionControls.select(label, values, value);
            fields.appendChild(control.wrapper);
            return control;
        };
        this.format = select(CE_TEXT.sectionFormat, CE_FORMATS.map(format => ({ value: format.id, label: format.label })),
            CE_FORMATS.some(format => format.id === stored.formatId) ? stored.formatId : CE_DEFAULT_FORMAT);
        this.theme = select(CE_TEXT.sectionTheme, CE_THEMES.map(theme => ({ value: theme.id, label: theme.label })),
            CE_THEMES.some(theme => theme.id === stored.themeId) ? stored.themeId : defaultThemeId || CE_DEFAULT_THEME);
        const visibility = () => { this.theme.wrapper.hidden = !['png', 'pdf'].includes(this.format.input.value); };
        this.format.input.addEventListener('change', visibility, { signal: this.events.signal }); visibility();
        const settings = document.createElement('div'); settings.className = 'ait-ma-export-settings';
        settings.setAttribute('role', 'group'); settings.setAttribute('aria-label', CE_TEXT.sectionHeader);
        const caption = document.createElement('span'); caption.className = 'ait-ma-export-settings-label'; caption.textContent = CE_TEXT.sectionHeader;
        const panel = document.createElement('div'); panel.className = 'ait-ma-export-settings-list';
        settings.append(caption, panel); this.element.appendChild(settings);
        for (const [key, text] of [['showUrl', CE_TEXT.headerShowUrl], ['showTime', CE_TEXT.headerShowTime], ['showConversationTime', CE_TEXT.headerShowConversationTime]]) {
            const { label, input } = MessageActionControls.checkbox(text); input.checked = stored[key] !== false;
            input.setAttribute('aria-label', text);
            panel.appendChild(label); this[key] = input;
        }
    }
    destroy() { this.events.abort(); }
    getValue() {
        return { formatId: this.format.input.value, themeId: this.theme.input.value,
            showUrl: this.showUrl.checked, showTime: this.showTime.checked, showConversationTime: this.showConversationTime.checked };
    }
}
