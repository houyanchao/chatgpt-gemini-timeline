/** Register platform entry points while loading core; activate them separately. */
(function () {
    'use strict';
    if (window.AITPlatformFeatures) return;

    const features = new Map();
    const session = window.AITContentSession;
    let domReady = null;

    function register(name, initialize, { delay = 0 } = {}) {
        if (!features.has(name)) features.set(name, { initialize, delay, task: null });
    }

    async function start() {
        if (document.readyState === 'loading') {
            domReady ||= new Promise(resolve => {
                document.addEventListener('DOMContentLoaded', resolve, { once: true });
            });
            await domReady;
        }

        const results = await Promise.allSettled([...features.values()].map(feature => {
            if (!feature.task) {
                feature.task = Promise.resolve().then(async () => {
                    if (feature.delay) await new Promise(resolve => setTimeout(resolve, feature.delay));
                    if (session?.active !== false) await feature.initialize();
                }).catch(error => {
                    // Retry only the failed entry; successful entries keep their instances/listeners.
                    feature.task = null;
                    throw error;
                });
            }
            return feature.task;
        }));
        return results.every(result => result.status === 'fulfilled');
    }

    window.AITPlatformFeatures = Object.freeze({ register, start });
})();
