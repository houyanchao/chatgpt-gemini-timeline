window.AITPlatformFeatures.register('usage-quota', async () => {
    const adapter = [GeminiUsageQuota, ChatGPTUsageQuota, ClaudeUsageQuota]
        .find(item => item.origin === location.origin);
    const session = window.AITContentSession;
    if (!adapter || session?.active === false) return;
    await TimelineI18n.ready();
    const inputAdapter = await window.smartEnterAdapterRegistry.getAdapter();
    if (inputAdapter?.platformId !== adapter.platformId || session?.active === false) return;
    const generationAdapter = window.siteAdapterRegistry?.getAllAdapters()
        .find(item => item.platformId === adapter.platformId);
    const generationMonitor = window.AIStateMonitor?.getInstance();

    const label = (key, substitutions) => TimelineI18n.getMessage(`usageQuota${key}`, substitutions);
    const isChatPage = () => adapter.isChatPage(location);
    const readAccount = () => adapter.readAccount?.() ?? null;
    const row = document.createElement('div');
    row.className = `ait-usage-quota ait-usage-quota--${adapter.platformId}`;
    row.setAttribute('data-ait-owned-ui', '');
    row.hidden = true;
    const disclosure = document.createElement('details');
    const summary = document.createElement('summary');
    const panel = document.createElement('div');
    panel.id = 'ait-usage-quota-details';
    panel.className = 'ait-usage-quota-panel';
    panel.setAttribute('data-ait-owned-ui', '');
    summary.setAttribute('aria-controls', panel.id);
    const detailTitle = document.createElement('strong');
    detailTitle.className = 'ait-usage-quota-detail-title';
    const breakdown = document.createElement('div');
    const status = document.createElement('div');
    status.className = 'ait-usage-quota-status';
    status.setAttribute('role', 'status');
    const settingsLink = document.createElement('button');
    settingsLink.type = 'button';
    settingsLink.className = 'ait-usage-quota-settings';
    const refreshButton = document.createElement('button');
    refreshButton.type = 'button';
    refreshButton.className = 'ait-usage-quota-refresh';
    const svgNamespace = 'http://www.w3.org/2000/svg';
    function makeIcon(pathData) {
        const icon = document.createElementNS(svgNamespace, 'svg');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('aria-hidden', 'true');
        icon.setAttribute('fill', 'none');
        icon.setAttribute('stroke', 'currentColor');
        icon.setAttribute('stroke-width', '2');
        icon.setAttribute('stroke-linecap', 'round');
        icon.setAttribute('stroke-linejoin', 'round');
        const path = document.createElementNS(svgNamespace, 'path');
        path.setAttribute('d', pathData);
        icon.append(path);
        return icon;
    }
    refreshButton.append(makeIcon('M20 11a8 8 0 1 0-2.3 6.7M20 4v7h-7'));
    const gear = makeIcon('M9.67 4.14a2.34 2.34 0 0 1 4.66 0 2.34 2.34 0 0 0 3.32 1.91 2.34 2.34 0 0 1 2.33 4.04 2.34 2.34 0 0 0 0 3.82 2.34 2.34 0 0 1-2.33 4.04 2.34 2.34 0 0 0-3.32 1.91 2.34 2.34 0 0 1-4.66 0 2.34 2.34 0 0 0-3.32-1.91 2.34 2.34 0 0 1-2.33-4.04 2.34 2.34 0 0 0 0-3.82 2.34 2.34 0 0 1 2.33-4.04 2.34 2.34 0 0 0 3.32-1.91Z');
    const center = document.createElementNS(svgNamespace, 'circle');
    center.setAttribute('cx', '12');
    center.setAttribute('cy', '12');
    center.setAttribute('r', '3');
    gear.append(center);
    settingsLink.append(gear);
    const footer = document.createElement('div');
    footer.className = 'ait-usage-quota-footer';
    footer.append(settingsLink, status);
    panel.append(detailTitle, breakdown, footer);
    disclosure.append(summary);
    row.append(disclosure, refreshButton);

    let enabled = false;
    let unsubscribe = null;
    let account = null;
    let snapshot = null;
    let pending = null;
    let failed = false;
    let nextRefreshAt = 0;
    let hoverOpened = false;
    let closeTimer;
    let unwatchGeneration = null;
    let generationPath = null;
    let replyRefresh = null;
    let countdownTimer;
    const resetTimes = [];

    function updateResetCountdowns() {
        clearTimeout(countdownTimer);
        if (!resetTimes.length) return;
        const now = Date.now();
        const locale = TimelineI18n.getUILanguage();
        for (const { element, resetAt } of resetTimes) {
            const totalMinutes = Math.ceil((resetAt - now) / 60000);
            if (totalMinutes <= 0) {
                element.textContent = label('ResetDue');
                continue;
            }
            const days = Math.floor(totalMinutes / 1440);
            const hours = Math.floor(totalMinutes / 60) % 24;
            const parts = days ? [[days, 'day'], [hours, 'hour']] : [[hours, 'hour'], [totalMinutes % 60, 'minute']];
            const duration = parts.filter(([value]) => value > 0)
                .map(([value, unit]) => new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'long' }).format(value))
                .join(' ');
            element.textContent = label('ResetIn', duration);
        }
        if (disclosure.open && resetTimes.some(({ resetAt }) => resetAt > now)) {
            countdownTimer = setTimeout(updateResetCountdowns, 30000);
        }
    }

    function positionDetails() {
        if (!panel.isConnected) return;
        const anchor = row.getBoundingClientRect();
        const { clientWidth, clientHeight } = document.documentElement;
        if (!row.isConnected || anchor.bottom <= 0 || anchor.top >= clientHeight) {
            closeDetails();
            return;
        }

        const { width, height } = panel.getBoundingClientRect();
        const gap = 6;
        const gutter = 12;
        const above = anchor.top - gap - height;
        const below = above < gutter && clientHeight - anchor.bottom > anchor.top;
        const centered = anchor.left + (anchor.width - width) / 2;
        panel.classList.toggle('ait-usage-quota-panel--below', below);
        panel.style.left = `${Math.max(gutter, Math.min(centered, clientWidth - width - gutter))}px`;
        const top = below ? anchor.bottom + gap : above;
        panel.style.top = `${Math.max(gutter, Math.min(top, clientHeight - height - gutter))}px`;
    }

    function syncDetails() {
        if (!disclosure.open || !row.isConnected || row.hidden) {
            closeDetails();
            return;
        }
        if (!panel.isConnected) {
            // The composer's stacking context sits below the page-level pet animations.
            document.body.append(panel);
            window.addEventListener('scroll', positionDetails, true);
            window.addEventListener('resize', positionDetails);
        }
        updateResetCountdowns();
        positionDetails();
    }

    function render() {
        row.hidden = !snapshot;
        clearTimeout(countdownTimer);
        resetTimes.length = 0;
        breakdown.replaceChildren();
        if (!snapshot) {
            closeDetails();
            summary.textContent = '';
            status.textContent = '';
            return;
        }

        const refreshLabel = label(pending ? 'Loading' : 'Refresh');
        refreshButton.title = refreshLabel;
        refreshButton.setAttribute('aria-label', refreshLabel);
        refreshButton.setAttribute('aria-busy', String(!!pending));
        refreshButton.setAttribute('aria-disabled', String(!!pending));
        settingsLink.title = label('Settings');
        settingsLink.setAttribute('aria-label', settingsLink.title);
        detailTitle.textContent = label(adapter.detailTitleKey);

        const locale = TimelineI18n.getUILanguage();
        const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 });
        const summaryParts = adapter.summaryTitleKey ? [label(adapter.summaryTitleKey)] : [];
        const hasPrimaryMetrics = snapshot.metrics.some(metric => !metric.detailOnly);
        for (const metric of snapshot.metrics) {
            const name = [metric.detailPrefix, metric.labelKey ? label(metric.labelKey) : metric.label]
                .filter(Boolean).join(' ');
            const valueLabel = metric.valueLabelKey ? label(metric.valueLabelKey) : '';
            const value = metric.unit === 'percent' ? percent.format(metric.value / 100) : metric.value;
            const compactName = metric.summaryLabelKey ? label(metric.summaryLabelKey) : metric.summaryLabel;
            if (!metric.detailOnly || !hasPrimaryMetrics) {
                summaryParts.push(compactName ? `${compactName} ${value}` : [name, valueLabel, value]
                    .filter(part => part != null && part !== '').join(' '));
            }

            const line = document.createElement('div');
            line.className = 'ait-usage-quota-limit';
            const caption = document.createElement('div');
            const limitName = document.createElement('div');
            limitName.className = 'ait-usage-quota-limit-name';
            limitName.textContent = name;
            caption.append(limitName);
            if (metric.resetAt != null) {
                const countdown = document.createElement('time');
                countdown.className = 'ait-usage-quota-limit-reset';
                countdown.dateTime = new Date(metric.resetAt).toISOString();
                caption.append(countdown);
                resetTimes.push({ element: countdown, resetAt: metric.resetAt });
            }
            const amount = document.createElement('div');
            amount.className = 'ait-usage-quota-limit-value';
            if (valueLabel) {
                const prefix = document.createElement('span');
                prefix.className = 'ait-usage-quota-limit-value-label';
                prefix.textContent = valueLabel;
                amount.append(prefix);
            }
            const number = document.createElement('strong');
            number.textContent = value;
            amount.append(number);
            line.append(caption, amount);
            breakdown.append(line);
        }
        summary.textContent = summaryParts.join(' · ');
        status.textContent = pending ? label('Loading') : failed ? label('Unavailable') : '';
        updateResetCountdowns();
        positionDetails();
    }

    function closeDetails() {
        clearTimeout(closeTimer);
        clearTimeout(countdownTimer);
        hoverOpened = false;
        disclosure.open = false;
        panel.remove();
        window.removeEventListener('scroll', positionDetails, true);
        window.removeEventListener('resize', positionDetails);
    }

    function clearReplyRefresh() {
        clearTimeout(replyRefresh?.timer);
        replyRefresh = null;
    }

    function isSameReplyPage(path) {
        if (path === location.pathname) return true;
        // The first reply can start before the platform assigns a conversation URL.
        const previousId = generationAdapter.extractConversationId(path);
        const currentId = generationAdapter.extractConversationId(location.pathname);
        return !!currentId && (!previousId || currentId === previousId);
    }

    function onGenerationChange(generating) {
        if (generating) {
            clearReplyRefresh();
            generationPath = isChatPage() ? location.pathname : null;
            return;
        }

        const path = generationPath;
        generationPath = null;
        if (!path || !isChatPage() || readAccount() !== account || !isSameReplyPage(path)) return;
        const scheduled = { path: location.pathname, timer: null };
        replyRefresh = scheduled;
        scheduled.timer = setTimeout(() => {
            if (replyRefresh !== scheduled) return;
            scheduled.timer = null;
            sync();
        }, 1000);
    }

    function watchGeneration() {
        if (unwatchGeneration || !generationAdapter || !generationMonitor) return;
        unwatchGeneration = generationMonitor.watch(generationAdapter, onGenerationChange);
        if (generationMonitor.isGenerating && !generationPath) onGenerationChange(true);
    }

    function stopWatchingGeneration() {
        unwatchGeneration?.();
        unwatchGeneration = null;
    }

    function reset(nextAccount) {
        account = nextAccount;
        closeDetails();
        generationPath = null;
        clearReplyRefresh();
        pending?.abort();
        pending = snapshot = null;
        failed = false;
        nextRefreshAt = 0;
    }

    function unmount() {
        unsubscribe?.();
        unsubscribe = null;
        stopWatchingGeneration();
        row.remove();
        reset(null);
    }

    async function refresh(force = false) {
        if (!row.isConnected || (adapter.readAccount && !account) || pending
            || (!force && (document.hidden || Date.now() < nextRefreshAt))) return;
        clearReplyRefresh();
        const request = new AbortController();
        const requestAccount = account;
        pending = request;
        failed = false;
        render();
        const timeout = setTimeout(() => request.abort(), 10000);
        let data;
        try {
            data = await adapter.readDirectUsage(request.signal);
        } catch {
            // A failed read leaves any previous result for the same account available.
        } finally {
            clearTimeout(timeout);
        }
        if (pending !== request) return;
        pending = null;
        if (!isChatPage() || readAccount() !== requestAccount) {
            sync();
            return;
        }
        failed = !data?.metrics?.length;
        if (!failed) {
            snapshot = data;
        } else if (Array.isArray(data?.metrics) || (data?.account !== undefined && data.account !== snapshot?.account)) {
            // A successful response with no limits, or a changed account, invalidates the old quota.
            snapshot = null;
        }
        nextRefreshAt = Date.now() + (failed ? 60 : 300) * 1000;
        render();
        if (replyRefresh?.timer === null) sync();
    }

    function sync() {
        if (!enabled) return;
        if (!isChatPage()) {
            unmount();
            return;
        }
        unsubscribe ??= DOMObserverManager.getInstance().subscribeBody('usage-quota', {
            callback: sync, throttle: 250, debounce: 150
        });
        const currentAccount = readAccount();
        const accountChanged = currentAccount !== account;
        if (accountChanged) reset(currentAccount);
        watchGeneration();
        if (generationPath) {
            generationPath = isSameReplyPage(generationPath) ? location.pathname : null;
        }
        if (replyRefresh) {
            if (isSameReplyPage(replyRefresh.path)) replyRefresh.path = location.pathname;
            else clearReplyRefresh();
        }
        let mount;
        for (const input of document.querySelectorAll(inputAdapter.getInputSelector())) {
            if (!input.getClientRects().length) continue;
            mount = adapter.getMount(input, inputAdapter);
            if (mount) break;
        }
        if (!mount) {
            closeDetails();
            row.remove();
            return;
        }

        const { anchor, position } = mount;
        const current = {
            beforebegin: anchor.previousElementSibling, afterbegin: anchor.firstElementChild,
            beforeend: anchor.lastElementChild, afterend: anchor.nextElementSibling
        }[position];
        const moved = current !== row;
        if (moved) anchor.insertAdjacentElement(position, row);
        if (moved || accountChanged) render();
        else positionDetails();
        if (!replyRefresh) {
            void refresh();
        } else if (replyRefresh.timer === null && !document.hidden) {
            void refresh(true);
        }
    }

    function setEnabled(value) {
        if (enabled === value) return;
        enabled = value;
        if (value) {
            window.addEventListener('focus', sync);
            window.addEventListener('url:change', sync);
            document.addEventListener('visibilitychange', sync);
            window.addEventListener('timeline:i18n-changed', render);
            sync();
        } else {
            window.removeEventListener('focus', sync);
            window.removeEventListener('url:change', sync);
            document.removeEventListener('visibilitychange', sync);
            window.removeEventListener('timeline:i18n-changed', render);
            unmount();
        }
    }

    refreshButton.addEventListener('click', () => {
        sync();
        void refresh(true);
    });
    disclosure.addEventListener('toggle', syncDetails);
    summary.addEventListener('pointerenter', event => {
        if (event.pointerType !== 'mouse' || disclosure.open) return;
        hoverOpened = true;
        disclosure.open = true;
        syncDetails();
    });
    const containsDetailsTarget = target => disclosure.contains(target) || panel.contains(target);
    const isDetailsHovered = () => disclosure.matches(':hover') || panel.matches(':hover');
    for (const element of [disclosure, panel]) {
        element.addEventListener('pointerenter', () => clearTimeout(closeTimer));
        element.addEventListener('pointerleave', () => {
            if (!hoverOpened) return;
            clearTimeout(closeTimer);
            closeTimer = setTimeout(() => {
                if (!containsDetailsTarget(document.activeElement) && !isDetailsHovered()) closeDetails();
            }, 150);
        });
        element.addEventListener('focusout', event => {
            if (hoverOpened && !containsDetailsTarget(event.relatedTarget) && !isDetailsHovered()) closeDetails();
        });
    }
    summary.addEventListener('click', event => {
        if (!hoverOpened) return;
        event.preventDefault();
        hoverOpened = false;
        clearTimeout(closeTimer);
    });
    function onDetailsKeydown(event) {
        if (!disclosure.open) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            closeDetails();
            summary.focus();
        } else if (event.key === 'Tab') {
            // Keep the settings button between the summary and refresh in the tab order.
            if (event.target === settingsLink) {
                event.preventDefault();
                (event.shiftKey ? summary : refreshButton).focus();
            } else if (event.target === (event.shiftKey ? refreshButton : summary)) {
                event.preventDefault();
                settingsLink.focus();
            }
        }
    }
    for (const element of [disclosure, panel, refreshButton]) element.addEventListener('keydown', onDetailsKeydown);
    settingsLink.addEventListener('click', () => {
        closeDetails();
        void window.panelModal?.show('smartInputBox');
    });
    const { usageQuotaEnabled } = await chrome.storage.local.get('usageQuotaEnabled');
    if (session?.active === false) return;
    const onSettings = (changes, area) => {
        if (area === 'local' && changes.usageQuotaEnabled) setEnabled(changes.usageQuotaEnabled.newValue !== false);
    };
    chrome.storage.onChanged.addListener(onSettings);
    session?.onStop(() => {
        chrome.storage.onChanged.removeListener(onSettings);
        setEnabled(false);
    });
    setEnabled(usageQuotaEnabled !== false);
});
