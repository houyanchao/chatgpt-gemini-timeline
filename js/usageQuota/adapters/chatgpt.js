const ChatGPTUsageQuota = (() => {
    const origin = 'https://chatgpt.com';
    const quotaPeriods = new Map([[18000, 'FiveHour'], [604800, 'Weekly']]);

    function isChatPage(page) {
        return page.origin === origin && /^\/(?:$|(?:c|g)\/[^/]+(?:\/|$))/.test(page.pathname);
    }

    function readMetrics(limits) {
        const windows = [limits?.primary_window, limits?.secondary_window];
        const metrics = [];
        for (const [seconds, period] of quotaPeriods) {
            const window = windows.find(item => item?.limit_window_seconds === seconds);
            if (!Number.isFinite(window?.used_percent) || window.used_percent < 0) continue;

            const resetAt = Number.isFinite(window.reset_at) ? window.reset_at * 1000 : NaN;
            metrics.push({
                labelKey: `${period}Limit`, summaryLabelKey: `${period}Period`, unit: 'percent',
                valueLabelKey: 'Remaining', value: Math.max(0, 100 - window.used_percent),
                resetAt: resetAt > 0 && Number.isFinite(new Date(resetAt).getTime()) ? resetAt : null
            });
        }
        return metrics;
    }

    async function readDirectUsage(signal) {
        if (!isChatPage(location)) return null;

        const options = {
            mode: 'same-origin', credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal
        };
        // The token stays inside the adapter and is only sent to ChatGPT.
        const sessionResponse = await fetch(`${origin}/api/auth/session`, options);
        if (sessionResponse.status === 401 || sessionResponse.status === 403) return { account: null };
        if (!sessionResponse.ok) return null;
        const session = await sessionResponse.json();
        const workspaceId = session?.account?.id;
        if (typeof session?.accessToken !== 'string' || !session.accessToken
            || typeof workspaceId !== 'string' || !workspaceId) return { account: null };

        const userId = session.user?.id;
        const account = typeof userId === 'string' && userId ? `${workspaceId}:${userId}` : workspaceId;
        const result = { account };
        try {
            const response = await fetch(`${origin}/backend-api/wham/usage`, {
                ...options,
                headers: { Authorization: `Bearer ${session.accessToken}`, 'ChatGPT-Account-Id': workspaceId }
            });
            if (response.status === 401 || response.status === 403) return { account: null };
            if (response.ok) result.metrics = readMetrics((await response.json())?.rate_limit);
        } catch {
            // Keep the verified account even if its quota request failed.
        }
        return result;
    }

    return {
        platformId: 'chatgpt', origin, isChatPage, readDirectUsage,
        summaryTitleKey: 'RemainingQuota', detailTitleKey: 'PlanLimits',
        getMount(input) {
            const form = input.closest('form');
            if (form) return { anchor: form, position: 'beforeend' };
            const composer = input.closest('[data-composer-body]');
            return composer ? { anchor: composer, position: 'afterend' } : null;
        }
    };
})();
