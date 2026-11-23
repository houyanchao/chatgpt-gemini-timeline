class SponsorTab extends BaseTab {
    constructor() {
        super();
        this.id = 'sponsor';
        this.name = TimelineI18n.getMessage('sponsorTabName');
        this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20.8 8.6c0 4.3-8.8 10-8.8 10s-8.8-5.7-8.8-10a4.6 4.6 0 0 1 8.8-1.9 4.6 4.6 0 0 1 8.8 1.9Z"/>
        </svg>`;
    }

    render() {
        const message = key => TimelineI18n.getMessage(key);
        const methods = [
            { id: 'wechat', name: message('sponsorWeChatPay'), image: 'images/weixin.jpg' },
            { id: 'alipay', name: message('sponsorAlipay'), image: 'images/zhifubao.jpg' }
        ];
        const container = document.createElement('div');
        container.className = 'ait-sponsor-tab';
        container.innerHTML = `
            <div class="ait-sponsor-intro">
                <h3>${message('sponsorHeadline')}</h3>
                <p>${message('sponsorIntro')}</p>
                <p class="ait-sponsor-support">${message('sponsorSupport')}</p>
            </div>
            <div class="ait-sponsor-methods">
                ${methods.map(({ id, name, image }) => `
                    <div class="ait-sponsor-method" data-payment-method="${id}">
                        <h3 class="ait-sponsor-method-name">${name}</h3>
                        <div class="ait-sponsor-qr-frame">
                            <img class="ait-sponsor-qr" src="${chrome.runtime.getURL(image)}"
                                alt="${TimelineI18n.getMessage('sponsorQrAlt', [name])}">
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        return container;
    }
}
