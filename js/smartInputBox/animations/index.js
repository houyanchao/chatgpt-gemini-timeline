/**
 * InputBox Animation Manager
 *
 * 管理输入框区域的电子宠物。只允许同时开启一个动画。
 * 支持养成系统：发送消息越多，动物越多越大。
 *
 * Storage keys:
 *   activeAnimation — 当前选中的动画 id
 *   animationPetData — 养成数据 { [id]: { count, messages } }
 */

class InputBoxAnimationManager {
    constructor() {
        this._animations = new Map();
        this._active = null;
        this._storageKey = 'activeAnimation';
        this._petDataKey = 'animationPetData';
        this._petData = {};
    }

    register(animation) {
        this._animations.set(animation.id, animation);
    }

    getAll() {
        return [...this._animations.values()];
    }

    getActiveId() {
        return this._active?.id || null;
    }

    getPetData(id) {
        return this._petData[id] || { count: 1, messages: 0 };
    }

    async init() {
        await TimelineI18n.ready();

        this._petData = await StorageAdapter.get(this._petDataKey) || {};
        const savedId = await StorageAdapter.get(this._storageKey);
        // 默认动画为巫师
        const activeId = savedId !== undefined ? savedId : 'wizard';
        if (activeId && this._animations.has(activeId)) {
            this._activate(activeId);
        }
        this._startStorageListener();
        this._startAIStateListener();
        this.pauseActive();
    }

    async toggle(id) {
        this._cancelPreview();
        if (this._active?.id === id) {
            this._deactivate();
            await StorageAdapter.set(this._storageKey, '');
        } else {
            this._deactivate();
            this._activate(id);
            await StorageAdapter.set(this._storageKey, id);
            this._startPreview();
        }
    }

    async _onMessage() {
        const id = this.getActiveId();
        if (!id) return;
        const anim = this._animations.get(id);
        if (!anim || !anim.maxCount) return;

        const data = this.getPetData(id);
        const maxMsg = anim.growAt?.[anim.growAt.length - 1];
        if (maxMsg && data.messages >= maxMsg) return;
        data.messages++;
        let newCount = 1;
        if (anim.growAt) {
            for (let i = 0; i < anim.growAt.length; i++) {
                if (data.messages >= anim.growAt[i]) newCount = i + 2;
            }
            newCount = Math.min(newCount, anim.maxCount);
        }
        const grew = newCount > data.count;
        data.count = newCount;
        this._petData[id] = data;
        await StorageAdapter.set(this._petDataKey, this._petData);

        if (grew && anim.addFollower) {
            anim.addFollower(data.count);
        }
    }

    _startPreview() {
        this._cancelPreview();
        const aiMon = window.AIStateMonitor?.getInstance();
        if (aiMon?.isGenerating) return;
        this.resumeActive();
        const duration = this._active?.marchDuration || 60;
        this._previewTimer = setTimeout(() => {
            this._previewTimer = null;
            const aiMon = window.AIStateMonitor?.getInstance();
            if (!aiMon?.isGenerating) this.pauseActive();
        }, (duration / 3) * 1000);
    }

    _cancelPreview() {
        if (this._previewTimer) {
            clearTimeout(this._previewTimer);
            this._previewTimer = null;
        }
    }

    updatePosition(referenceRect) {
        if (this._active) {
            this._active.updatePosition(referenceRect);
        }
    }

    hideActive() {
        if (this._active) this._active.hide();
    }

    pauseActive() {
        if (!this._active?._el) return;
        this._active._el.classList.add('anim-paused');
    }

    resumeActive() {
        if (!this._active?._el) return;
        this._active._el.classList.remove('anim-paused');
    }

    destroy() {
        this._cancelPreview();
        this._deactivate();
        if (this._storageListener) {
            StorageAdapter.removeChangeListener(this._storageListener);
            this._storageListener = null;
        }
        if (this._aiStateHandler) {
            window.removeEventListener('ai:stateChange', this._aiStateHandler);
            this._aiStateHandler = null;
        }
    }

    _activate(id) {
        const anim = this._animations.get(id);
        if (!anim) return;
        const data = this.getPetData(id);
        if (anim.growAt) {
            let correct = 1;
            for (let i = 0; i < anim.growAt.length; i++) {
                if (data.messages >= anim.growAt[i]) correct = i + 2;
            }
            data.count = Math.min(correct, anim.maxCount);
        }
        anim.create(data.count);
        if (anim._el) {
            const clickTarget = anim._el.querySelector('[class$="-group"], [class$="-runner"]') || anim._el;
            clickTarget.addEventListener('click', () => {
                if (window.panelModal) window.panelModal.show('animation');
            });
            clickTarget.addEventListener('mouseenter', () => {
                if (window.globalTooltipManager) {
                    window.globalTooltipManager.show('anim-hint', 'button', clickTarget,
                        TimelineI18n.getMessage('animViewMore') || '更换宠物',
                        { style: 'mini', placement: 'top' }
                    );
                }
            });
            clickTarget.addEventListener('mouseleave', () => {
                if (window.globalTooltipManager) {
                    window.globalTooltipManager.hide();
                }
            });
        }
        this._active = anim;
        const aiMon = window.AIStateMonitor?.getInstance();
        if (!aiMon?.isGenerating) {
            this.pauseActive();
        }
    }

    _deactivate() {
        if (this._active) {
            this._active.destroy();
            this._active = null;
        }
    }

    _startAIStateListener() {
        this._aiStateHandler = (e) => {
            if (e.detail.generating) {
                this._cancelPreview();
                this.resumeActive();
                this._onMessage();
            } else {
                this.pauseActive();
            }
        };
        window.addEventListener('ai:stateChange', this._aiStateHandler);
    }

    _startStorageListener() {
        this._storageListener = (changes, areaName) => {
            if (areaName !== 'local' || !changes[this._storageKey]) return;
            const newId = changes[this._storageKey].newValue;
            if (newId !== this.getActiveId()) {
                this._deactivate();
                if (newId && this._animations.has(newId)) {
                    this._activate(newId);
                }
            }
        };
        StorageAdapter.addChangeListener(this._storageListener);
    }
}

if (typeof window.inputBoxAnimationManager === 'undefined') {
    window.inputBoxAnimationManager = new InputBoxAnimationManager();
    if (typeof SnailAnimation !== 'undefined') {
        window.inputBoxAnimationManager.register(new SnailAnimation());
    }
    if (typeof ZombieAnimation !== 'undefined') {
        window.inputBoxAnimationManager.register(new ZombieAnimation());
    }
    if (typeof AntAnimation !== 'undefined') {
        window.inputBoxAnimationManager.register(new AntAnimation());
    }
    if (typeof WizardAnimation !== 'undefined') {
        window.inputBoxAnimationManager.register(new WizardAnimation());
    }
}
