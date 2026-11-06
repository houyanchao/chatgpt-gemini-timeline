const GeminiUsageQuota = (() => {
    const origin = 'https://gemini.google.com';
    const chatPath = /^(?:\/u\/(\d+))?\/(?:$|(?:app|gem)(?:\/|$))/;
    const accountSelector = 'a[href^="https://accounts.google.com/SignOutOptions"][aria-label]';
    const quotaPeriods = [['GXU_FIVE_HOURLY', 'FiveHour'], ['GXU_WEEKLY', 'Weekly']];

    // Gemini's UsagePageQuery. Google may change the persisted query when it updates the page.
    const querySignature = '2/dWbCvkVB0X16r9NPnxifeOAAqdCqMf0xeWvau9yPy7g=';
    const queryVariables = JSON.stringify({
        g1Request: { entrypoints: ['GEMINI_USAGE_SETTINGS_UPGRADE_BANNER'] },
        workspaceRequest: { recommendationsForSurfaceRequests: [] }
    });

    function isChatPage(page) {
        return page.origin === origin && chatPath.test(page.pathname);
    }

    function getAccountIndex(page) {
        const pathIndex = page.pathname.match(chatPath)?.[1];
        const queryIndex = page.searchParams.get('authuser');
        if (queryIndex !== null && (!/^\d+$/.test(queryIndex) || (pathIndex && pathIndex !== queryIndex))) {
            return null;
        }
        return pathIndex ?? queryIndex ?? '0';
    }

    function readAccount() {
        const index = getAccountIndex(new URL(location.href));
        if (index === null) return null;
        const accounts = new Set();
        for (const link of document.querySelectorAll(accountSelector)) {
            const label = link.getAttribute('aria-label').normalize('NFKC');
            const account = label.match(/\(([^()\s]+@[^()\s]+)\)/u)?.[1];
            if (account) accounts.add(account.toLowerCase());
        }
        return accounts.size === 1 ? `${index}:${accounts.values().next().value}` : null;
    }

    async function readDirectUsage(signal) {
        const page = new URL(location.href);
        if (!isChatPage(page)) return null;
        const index = getAccountIndex(page);
        if (index === null) return null;

        const accountPath = index === '0' ? '' : `/u/${index}`;
        const url = new URL(`${accountPath}/_/BardChatUi/graphql/schemas/GEMINI_WEB_GRAPHQL/executeQuery`, origin);
        url.searchParams.set('query_signature', querySignature);
        url.searchParams.set('variables', queryVariables);
        const headers = { Accept: 'application/json' };
        if (accountPath) headers['X-Goog-AuthUser'] = index;

        const response = await fetch(url, {
            mode: 'same-origin', credentials: 'same-origin', redirect: 'error', cache: 'no-store', headers, signal
        });
        if (response.status === 401 || response.status === 403) return { account: null };
        if (!response.ok) return null;
        const results = JSON.parse((await response.text()).trimStart().replace(/^\)\]\}'\s*/, ''));
        if (!Array.isArray(results)) return null;
        const pools = results.find(item => item?.data?.viewer?.rpcs?.getUsageInfo)
            ?.data.viewer.rpcs.getUsageInfo.pools;
        if (!Array.isArray(pools)) {
            return results.some(item => item?.data?.viewer === null) ? { account: null } : null;
        }

        const metrics = [];
        for (const [type, labelKey] of quotaPeriods) {
            const pool = pools.find(item => item?.poolType === type);
            if (!Number.isFinite(pool?.percentageUsed) || pool.percentageUsed < 0) continue;
            const resetAt = Date.parse(pool.gxu?.windowRefreshesAt);
            metrics.push({
                labelKey, summaryLabelKey: `${labelKey}Period`, unit: 'percent',
                valueLabelKey: 'Used',
                value: Math.min(100, Math.round(pool.percentageUsed * 100)),
                resetAt: Number.isFinite(resetAt) ? resetAt : null
            });
        }
        return { metrics };
    }

    return {
        platformId: 'gemini', origin, isChatPage, readAccount, readDirectUsage,
        summaryTitleKey: 'UsedQuota', detailTitleKey: 'UsageLimits',
        getMount(input, inputAdapter) {
            const anchor = input.closest('input-area-v2') || inputAdapter.getPositionReferenceElement(input);
            return anchor ? { anchor, position: 'afterend' } : null;
        }
    };
})();
