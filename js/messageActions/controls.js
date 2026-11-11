/** Small controls shared by message actions and their option panels. */
class MessageActionControls {
    // Reuse the product's toast checkmark and export-dialog close icon.
    static CHECK = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2.75 7.25L5.75 10.25L11.25 3.75" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    static CLOSE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';

    static icon(markup, className = '') {
        const icon = document.createElement('span');
        icon.className = `ait-ma-icon ${className}`;
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = markup;
        return icon;
    }

    static checkbox(text = '') {
        const label = document.createElement('label');
        label.className = 'ait-ma-check';
        const input = document.createElement('input');
        input.type = 'checkbox';
        const visual = this.icon(this.CHECK, 'ait-ma-check-visual');
        label.append(input, visual);
        if (text) {
            const caption = document.createElement('span');
            caption.textContent = text;
            label.appendChild(caption);
        }
        return { label, input };
    }

    static select(label, values, value) {
        const wrapper = document.createElement('label');
        wrapper.className = 'ait-ma-field';
        const caption = document.createElement('span');
        caption.className = 'ait-ma-field-label';
        caption.textContent = label;
        const input = document.createElement('select');
        input.setAttribute('aria-label', label);
        for (const item of values) {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = item.label;
            input.appendChild(option);
        }
        input.value = value;
        wrapper.append(caption, input);
        return { wrapper, input };
    }
}
