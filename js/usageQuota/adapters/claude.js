const ClaudeUsageQuota = (() => {
    const origin = 'https://claude.ai';
    const organizationIdPattern = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
    const unselected = 'unselected';

    function isChatPage(page) {
        return page.origin === origin && /^\/(?:$|(?:new|chat|project)(?:\/|$))/.test(page.pathname);
    }

    function readAccount() {
        const id = document.cookie.match(/(?:^|;\s*)lastActiveOrg=([^;]*)/)?.[1];
        return organizationIdPattern.test(id ?? '') ? id.toLowerCase() : unselected;
    }

    function metric(labelKey, value, reset, model = '') {
        if (!Number.isFinite(value) || value < 0) return null;
        const resetAt = typeof reset === 'string' ? Date.parse(reset) : NaN;
        return {
            labelKey, summaryLabelKey: model ? undefined : `${labelKey}Period`,
            unit: 'percent', valueLabelKey: 'Used', value: Math.min(100, value),
            resetAt: Number.isFinite(resetAt) ? resetAt : null,
            detailPrefix: model, detailOnly: !!model
        };
    }

    function readMetrics(usage) {
        const limits = Array.isArray(usage?.limits) ? usage.limits.filter(limit =>
            limit && limit.is_active !== false && Number.isFinite(limit.percent) && limit.percent >= 0
        ) : [];
        const metrics = [];
        for (const [kind, key, labelKey] of [
            ['session', 'five_hour', 'FiveHour'], ['weekly_all', 'seven_day', 'Weekly']
        ]) {
            const window = limits.find(limit => limit.kind === kind);
            const entry = window
                ? metric(labelKey, window.percent, window.resets_at)
                : metric(labelKey, usage?.[key]?.utilization, usage?.[key]?.resets_at);
            if (entry) metrics.push(entry);
        }

        const scoped = new Map();
        for (const limit of limits) {
            if (limit.kind !== 'weekly_scoped') continue;
            const name = limit.scope?.model?.display_name;
            if (typeof name !== 'string') continue;
            const model = name.trim();
            if (!model || model.length > 64 || /^all models$/i.test(model)) continue;
            scoped.set(model.toLowerCase(), metric('Weekly', limit.percent, limit.resets_at, model));
        }
        if (!scoped.size) {
            for (const [key, model] of [['seven_day_sonnet', 'Sonnet'], ['seven_day_opus', 'Opus']]) {
                const window = usage?.[key];
                const entry = metric('Weekly', window?.utilization, window?.resets_at, model);
                if (entry) scoped.set(model.toLowerCase(), entry);
            }
        }
        return metrics.concat([...scoped.values()]);
    }

    async function readDirectUsage(signal) {
        if (!isChatPage(location)) return null;
        const options = {
            mode: 'same-origin', credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal
        };

        // Use the active organization marker. The browser handles authentication.
        let organizationId = readAccount();
        if (organizationId === unselected) {
            const response = await fetch(`${origin}/api/organizations`, options);
            if (response.status === 401 || response.status === 403) return { account: null };
            if (!response.ok) return null;
            const organizations = await response.json();
            if (!Array.isArray(organizations)) return null;
            if (organizations.length !== 1 || !organizationIdPattern.test(organizations[0]?.uuid ?? '')) {
                return { account: null };
            }
            organizationId = organizations[0].uuid.toLowerCase();
        }

        const result = { account: organizationId };
        try {
            const response = await fetch(`${origin}/api/organizations/${organizationId}/usage`, options);
            if (response.status === 401 || response.status === 403) return { account: null };
            if (response.ok) result.metrics = readMetrics(await response.json());
        } catch {
            // Preserve the organization identity if the quota request fails.
        }
        return result;
    }

    return {
        platformId: 'claude', origin, isChatPage, readAccount, readDirectUsage,
        summaryTitleKey: 'UsedQuota', detailTitleKey: 'UsageLimits',
        getMount(input, inputAdapter) {
            const anchor = inputAdapter.getPositionReferenceElement(input);
            return anchor && anchor !== input ? { anchor, position: 'afterend' } : null;
        }
    };
})();
