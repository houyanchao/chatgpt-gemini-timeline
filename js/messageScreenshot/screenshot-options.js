class MessageScreenshotOptions {
    constructor(stored = {}) {
        this.element = document.createElement('div'); this.element.className = 'ait-ma-options';
        const storedScale = stored?.scale;
        const scale = [1, 2, 3, 4].includes(storedScale) ? storedScale : 2;
        const control = MessageActionControls.select(TimelineI18n.getMessage('messageActionsResolution'),
            [
                { value: '4', label: TimelineI18n.getMessage('messageScreenshotQualityUltra') },
                { value: '3', label: TimelineI18n.getMessage('messageScreenshotQualityHigh') },
                { value: '2', label: TimelineI18n.getMessage('messageScreenshotQualityMedium') },
                { value: '1', label: TimelineI18n.getMessage('messageScreenshotQualityLow') }
            ], String(scale));
        this.scale = control.input;
        this.element.appendChild(control.wrapper);
    }
    getValue() { return { scale: Number(this.scale.value) }; }
}
