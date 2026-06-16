/**
 * Common Utilities and Configuration
 * 
 * This file contains:
 * - TIMELINE_CONFIG: All timing and behavior constants
 * - TimelineUtils: Safe wrapper functions for common operations
 */

// ==================== Configuration ====================

const TIMELINE_CONFIG = {
    // Active state management
    MIN_ACTIVE_CHANGE_INTERVAL: 120, // ms - minimum interval between active state changes
    
    // UI interaction timings
    TOOLTIP_HIDE_DELAY: 100, // ms - delay before hiding tooltip
    DEBOUNCE_DELAY: 350, // ms - debounce delay for marker recalculation
    LONG_PRESS_DURATION: 550, // ms - duration to trigger long press
    LONG_PRESS_TOLERANCE: 6, // px - movement tolerance during long press
    CLICK_SUPPRESS_DURATION: 350, // ms - suppress clicks after long press
    
    // Resize and layout
    RESIZE_IDLE_DELAY: 140, // ms - settle time before min-gap correction
    RESIZE_IDLE_TIMEOUT: 200, // ms - timeout for requestIdleCallback
    
    // Route detection
    ROUTE_CHECK_INTERVAL: 800, // ms - polling interval for URL changes
    INIT_DELAY: 300, // ms - delay before initializing timeline (deprecated, use INIT_RETRY_DELAYS)
    INIT_RETRY_DELAYS: [500, 500, 1000, 1000, 1000, 1000], // ms - retry delays for initialization (exponential backoff)
    INITIAL_RENDER_DELAY: 100, // ms - delay before first render to ensure DOM stability
    
    // Observers
    OBSERVER_TIMEOUT: 5000, // ms - timeout for mutation observers
    ZERO_TURNS_TIMER: 350, // ms - wait before clearing UI when no turns found
    AI_COMPLETE_TOAST_DELAY: 200, // ms - wait for timeline markers to settle after AI output ends
    
    // Virtualization
    VIRTUAL_BUFFER_MIN: 100, // px - minimum buffer for virtualization
    
    // CSS detection
    CSS_VAR_DETECTION_TOLERANCE: 2, // px - tolerance for CSS var support detection
};

// ==================== Utility Functions ====================

const TimelineUtils = {
    /**
     * Safely clear a timeout
     */
    clearTimerSafe(timer) {
        try {
            if (timer) {
                clearTimeout(timer);
            }
        } catch {}
        return null;
    },

    /**
     * Safely clear an interval
     */
    clearIntervalSafe(intervalId) {
        try {
            if (intervalId) {
                clearInterval(intervalId);
            }
        } catch {}
        return null;
    },

    /**
     * Safely cancel a requestAnimationFrame
     */
    clearRafSafe(rafId) {
        try {
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
            }
        } catch {}
        return null;
    },

    /**
     * Safely cancel a requestIdleCallback
     */
    clearIdleCallbackSafe(ricId) {
        try {
            if (ricId && typeof cancelIdleCallback === 'function') {
                cancelIdleCallback(ricId);
            }
        } catch {}
        return null;
    },

    /**
     * Safely disconnect an observer
     */
    disconnectObserverSafe(observer) {
        try {
            if (observer) {
                observer.disconnect();
            }
        } catch {}
    },

    /**
     * Safely remove a DOM element
     */
    removeElementSafe(element) {
        try {
            if (element) {
                element.remove();
            }
        } catch {}
    },

    /**
     * Safely remove an event listener
     */
    removeEventListenerSafe(target, event, handler, options) {
        try {
            if (target && handler) {
                target.removeEventListener(event, handler, options);
            }
        } catch {}
    },

    /**
     * Safely add a CSS class
     */
    addClassSafe(element, className) {
        try {
            if (element) {
                element.classList.add(className);
            }
        } catch {}
    },

    /**
     * Safely remove a CSS class
     */
    removeClassSafe(element, className) {
        try {
            if (element) {
                element.classList.remove(className);
            }
        } catch {}
    },

    /**
     * Safely toggle a CSS class
     */
    toggleClassSafe(element, className, force) {
        try {
            if (element) {
                element.classList.toggle(className, force);
            }
        } catch {}
    },

    /**
     * Safely set an attribute
     */
    setAttributeSafe(element, name, value) {
        try {
            if (element) {
                element.setAttribute(name, value);
            }
        } catch {}
    },
};

// ==================== Storage Adapter ====================

/**
 * Storage Adapter - 跨网站存储
 * 
 * 使用 chrome.storage.local（跨网站、本地存储，5MB 容量）
 * 
 * 注意：v4.1.0 之前使用 chrome.storage.sync，已迁移至 local
 */
const StorageAdapter = {
    /**
     * 检查是否支持 chrome.storage
     */
    isChromeStorageAvailable() {
        return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
    },

    /**
     * 从 chrome.storage.sync 迁移数据到 chrome.storage.local
     * 迁移过程中同时将 Star/Pin 数据转换为数组格式：
     * - chatTimelineStar:xxx → chatTimelineStars 数组
     * - chatTimelinePin:xxx → chatTimelinePins 数组
     * - 其他数据原封不动迁移
     * 迁移完成后清空 sync，下次检查时 sync 为空则跳过
     * @returns {Promise<void>}
     */
    async migrateFromSyncToLocal() {
        // 检查 chrome.storage 是否可用
        if (!this.isChromeStorageAvailable()) return;
        
        try {
            // 检查 sync 是否可用（用于读取旧数据）
            if (!chrome.storage.sync) return;
            
            // 从 sync 读取所有数据
            const syncData = await new Promise((resolve) => {
                chrome.storage.sync.get(null, (items) => {
                    resolve(items || {});
                });
            });
            
            // 如果 sync 中没有数据，跳过
            const syncKeys = Object.keys(syncData);
            if (syncKeys.length === 0) return;
            
            // ✅ 分离 Star/Pin 数据，直接转换成数组格式
            const starItems = [];
            const pinItems = [];
            const otherData = {};
            
            syncKeys.forEach(key => {
                const value = syncData[key];
                
                if (key.startsWith('chatTimelineStar:')) {
                    // 收藏数据：加上 key 字段，放入数组
                    if (value && typeof value === 'object') {
                        starItems.push({ key, ...value });
                    }
                } else if (key.startsWith('chatTimelinePin:')) {
                    // Pin 数据：加上 key 字段，放入数组
                    if (value && typeof value === 'object') {
                        pinItems.push({ key, ...value });
                    }
                } else {
                    // 其他数据：原封不动保留
                    otherData[key] = value;
                }
            });
            
            // ✅ 构建新的 local 数据
            const newLocalData = { ...otherData };
            if (starItems.length > 0) {
                newLocalData.chatTimelineStars = starItems;
            }
            if (pinItems.length > 0) {
                newLocalData.chatTimelinePins = pinItems;
            }
            
            // 保存到 local
            await new Promise((resolve) => {
                chrome.storage.local.set(newLocalData, () => {
                    resolve();
                });
            });
            
            // 清空 sync（迁移完成标志）
            await new Promise((resolve) => {
                chrome.storage.sync.clear(() => {
                    resolve();
                });
            });
        } catch (e) {
            console.error('[StorageAdapter] Migration failed:', e);
        }
    },

    /**
     * 获取存储的值
     * @param {string} key - 存储键名
     * @returns {Promise<any>} - 返回存储的值
     */
    async get(key) {
        try {
            if (!this.isChromeStorageAvailable()) return undefined;

            return new Promise((resolve) => {
                chrome.storage.local.get([key], (result) => {
                    resolve(result[key]);
                });
            });
        } catch (e) {
            return undefined;
        }
    },

    /**
     * 设置存储的值
     * @param {string} key - 存储键名
     * @param {any} value - 要存储的值
     * @returns {Promise<void>}
     */
    async set(key, value) {
        try {
            if (!this.isChromeStorageAvailable()) return;

            return new Promise((resolve) => {
                chrome.storage.local.set({ [key]: value }, () => {
                    resolve();
                });
            });
        } catch (e) {
            // Silently fail
        }
    },

    /**
     * 删除存储的值
     * @param {string} key - 存储键名
     * @returns {Promise<void>}
     */
    async remove(key) {
        try {
            if (!this.isChromeStorageAvailable()) return;

            return new Promise((resolve) => {
                chrome.storage.local.remove([key], () => {
                    resolve();
                });
            });
        } catch (e) {
            // Silently fail
        }
    },

    /**
     * 获取所有匹配前缀的键值对
     * @param {string} prefix - 键名前缀
     * @returns {Promise<Object>} - 返回匹配的键值对对象
     */
    async getAllByPrefix(prefix) {
        try {
            if (!this.isChromeStorageAvailable()) return {};

            return new Promise((resolve) => {
                chrome.storage.local.get(null, (items) => {
                    const result = {};
                    Object.keys(items).forEach(key => {
                        if (key.startsWith(prefix)) {
                            result[key] = items[key];
                        }
                    });
                    resolve(result);
                });
            });
        } catch (e) {
            return {};
        }
    },

    /**
     * 监听存储变化
     * @param {Function} callback - 回调函数 (changes, areaName) => {}
     */
    addChangeListener(callback) {
        try {
            if (!this.isChromeStorageAvailable()) return;
            chrome.storage.onChanged.addListener(callback);
        } catch (e) {
            // Silently fail
        }
    },

    /**
     * 移除存储变化监听器
     * @param {Function} callback - 之前添加的回调函数
     */
    removeChangeListener(callback) {
        try {
            if (!this.isChromeStorageAvailable()) return;
            chrome.storage.onChanged.removeListener(callback);
        } catch (e) {
            // Silently fail
        }
    }
};

// ==================== Star Storage Manager ====================

/**
 * Star Storage Manager - 收藏数据管理
 * 使用数组结构存储：chatTimelineStars = [{ key, url, urlWithoutProtocol, nodeId/index, question, timestamp, folderId }, ...]
 */
const StarStorageManager = {
    STORAGE_KEY: 'chatTimelineStars',

    /**
     * 获取所有收藏
     * @returns {Promise<Array>}
     */
    async getAll() {
        const data = await StorageAdapter.get(this.STORAGE_KEY);
        return Array.isArray(data) ? data : [];
    },

    /**
     * 按 URL 筛选收藏（用于当前页面）
     * @param {string} urlWithoutProtocol - 不含协议的 URL
     * @returns {Promise<Array>}
     */
    async getByUrl(urlWithoutProtocol) {
        const items = await this.getAll();
        return items.filter(item => item.urlWithoutProtocol === urlWithoutProtocol);
    },

    /**
     * 添加或更新收藏
     * @param {Object} item - 收藏项（必须包含 key 字段）
     */
    async add(item) {
        if (!item || !item.key) return;
        const items = await this.getAll();
        const existingIndex = items.findIndex(i => i.key === item.key);
        if (existingIndex >= 0) {
            items[existingIndex] = item;
        } else {
            items.push(item);
        }
        await StorageAdapter.set(this.STORAGE_KEY, items);
    },

    /**
     * 移除收藏
     * @param {string} key - 收藏项的 key
     */
    async remove(key) {
        if (!key) return;
        const items = await this.getAll();
        const filtered = items.filter(item => item.key !== key);
        await StorageAdapter.set(this.STORAGE_KEY, filtered);
    },

    /**
     * 更新收藏项的部分字段
     * @param {string} key - 收藏项的 key
     * @param {Object} updates - 要更新的字段
     */
    async update(key, updates) {
        if (!key || !updates) return;
        const items = await this.getAll();
        const index = items.findIndex(item => item.key === key);
        if (index >= 0) {
            items[index] = { ...items[index], ...updates };
            await StorageAdapter.set(this.STORAGE_KEY, items);
        }
    },

    /**
     * 根据 key 查找收藏项
     * @param {string} key - 收藏项的 key
     * @returns {Promise<Object|undefined>}
     */
    async findByKey(key) {
        if (!key) return undefined;
        const items = await this.getAll();
        return items.find(item => item.key === key);
    },

    /**
     * 检查是否存在
     * @param {string} key - 收藏项的 key
     * @returns {Promise<boolean>}
     */
    async exists(key) {
        const item = await this.findByKey(key);
        return !!item;
    },

    /**
     * 批量更新（用于文件夹删除等场景）
     * @param {Function} updateFn - 更新函数，接收 items 数组，返回更新后的数组
     */
    async batchUpdate(updateFn) {
        if (typeof updateFn !== 'function') return;
        const items = await this.getAll();
        const updatedItems = updateFn(items);
        if (Array.isArray(updatedItems)) {
            await StorageAdapter.set(this.STORAGE_KEY, updatedItems);
        }
    }
};

// ==================== Pin Storage Manager ====================

/**
 * Pin Storage Manager - Pin 数据管理
 * 使用数组结构存储：chatTimelinePins = [{ key, url, urlWithoutProtocol, nodeId/index, question, siteName, timestamp }, ...]
 */
const PinStorageManager = {
    STORAGE_KEY: 'chatTimelinePins',

    /**
     * 获取所有 Pin
     * @returns {Promise<Array>}
     */
    async getAll() {
        const data = await StorageAdapter.get(this.STORAGE_KEY);
        return Array.isArray(data) ? data : [];
    },

    /**
     * 按 URL 筛选 Pin（用于当前页面）
     * @param {string} urlWithoutProtocol - 不含协议的 URL
     * @returns {Promise<Array>}
     */
    async getByUrl(urlWithoutProtocol) {
        const items = await this.getAll();
        return items.filter(item => item.urlWithoutProtocol === urlWithoutProtocol);
    },

    /**
     * 添加或更新 Pin
     * @param {Object} item - Pin 项（必须包含 key 字段）
     */
    async add(item) {
        if (!item || !item.key) return;
        const items = await this.getAll();
        const existingIndex = items.findIndex(i => i.key === item.key);
        if (existingIndex >= 0) {
            items[existingIndex] = item;
        } else {
            items.push(item);
        }
        await StorageAdapter.set(this.STORAGE_KEY, items);
    },

    /**
     * 移除 Pin
     * @param {string} key - Pin 项的 key
     */
    async remove(key) {
        if (!key) return;
        const items = await this.getAll();
        const filtered = items.filter(item => item.key !== key);
        await StorageAdapter.set(this.STORAGE_KEY, filtered);
    },

    /**
     * 根据 key 查找 Pin 项
     * @param {string} key - Pin 项的 key
     * @returns {Promise<Object|undefined>}
     */
    async findByKey(key) {
        if (!key) return undefined;
        const items = await this.getAll();
        return items.find(item => item.key === key);
    },

    /**
     * 检查是否存在
     * @param {string} key - Pin 项的 key
     * @returns {Promise<boolean>}
     */
    async exists(key) {
        const item = await this.findByKey(key);
        return !!item;
    }
};

// ==================== Chat Time Storage Manager ====================

/**
 * Chat Time Storage Manager - 提问时间记录管理
 * 用于记录每个提问节点的创建时间，方便用户了解对话时间线
 * 
 * 存储键：chatTimes
 * 数据结构：{ 
 *   conversationKey: { 
 *     createTime: timestamp,    // 会话首次创建时间（只在首次设置）
 *     lastVisit: timestamp,     // 上次进入时间（用于清理不活跃数据）
 *     nodes: { nodeId: timestamp, ... } 
 *   }, 
 *   ... 
 * }
 */
const ChatTimeStorageManager = {
    STORAGE_KEY: 'chatTimes',

    /**
     * 获取所有时间记录
     * @returns {Promise<Object>}
     */
    async getAllRecords() {
        const data = await StorageAdapter.get(this.STORAGE_KEY);
        return data && typeof data === 'object' ? data : {};
    },

    /**
     * 获取指定会话的时间记录
     * @param {string} conversationKey - 会话标识（urlWithoutProtocol）
     * @returns {Promise<Object>} - { createTime, lastVisit, nodes: { nodeId: timestamp, ... } }
     */
    async getByConversation(conversationKey) {
        if (!conversationKey) return { createTime: null, lastVisit: null, nodes: {} };
        const all = await this.getAllRecords();
        return all[conversationKey] || { createTime: null, lastVisit: null, nodes: {} };
    },

    /**
     * 更新会话的最后访问时间（只更新已有记录，不创建新记录）
     * @param {string} conversationKey - 会话标识
     * @returns {Promise<boolean>} - 是否实际更新
     */
    async updateLastVisit(conversationKey) {
        if (!conversationKey) return false;
        
        const all = await this.getAllRecords();
        
        // 只更新已有记录，不创建新记录（避免刷新旧对话时创建空记录）
        if (!all[conversationKey]) {
            return false;
        }
        
        all[conversationKey].lastVisit = Date.now();
        await StorageAdapter.set(this.STORAGE_KEY, all);
        return true;
    },

    /**
     * 清理临时节点 ID（格式：平台名-纯数字，如 gemini-0, chatgpt-8）
     * 仅用于 useStableNodeId=true 的平台
     * @param {string} conversationKey - 会话标识
     * @returns {Promise<number>} - 清理的数量
     */
    async cleanupTempIds(conversationKey) {
        if (!conversationKey) return 0;
        
        const all = await this.getAllRecords();
        
        if (!all[conversationKey] || !all[conversationKey].nodes) {
            return 0;
        }
        
        const nodes = all[conversationKey].nodes;
        const isTempId = (nodeId) => /^[a-z]+-\d+$/i.test(nodeId);
        let cleanedCount = 0;
        
        for (const nodeId of Object.keys(nodes)) {
            if (isTempId(nodeId)) {
                delete nodes[nodeId];
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            await StorageAdapter.set(this.STORAGE_KEY, all);
        }
        
        return cleanedCount;
    },

    /**
     * 设置会话的创建时间（只在新对话时调用，已有 createTime 时不覆盖）
     * @param {string} conversationKey - 会话标识
     * @param {number} timestamp - 时间戳（默认当前时间）
     * @returns {Promise<boolean>} - 是否实际写入
     */
    async setCreateTime(conversationKey, timestamp = Date.now()) {
        if (!conversationKey) return false;
        
        const all = await this.getAllRecords();
        
        if (!all[conversationKey]) {
            all[conversationKey] = { createTime: timestamp, lastVisit: timestamp, nodes: {} };
            await StorageAdapter.set(this.STORAGE_KEY, all);
            return true;
        }
        
        // 已有 createTime 时不覆盖
        if (all[conversationKey].createTime) {
            return false;
        }
        
        all[conversationKey].createTime = timestamp;
        await StorageAdapter.set(this.STORAGE_KEY, all);
        return true;
    },

    /**
     * 批量设置节点时间（只添加新的，同时更新 lastVisit）
     * @param {string} conversationKey - 会话标识
     * @param {Array<{nodeId: string, timestamp?: number}>} nodes - 节点数组
     * @returns {Promise<number>} - 实际新增的数量
     */
    async batchSetNodeTimes(conversationKey, nodes) {
        if (!conversationKey || !Array.isArray(nodes) || nodes.length === 0) return 0;
        
        const all = await this.getAllRecords();
        const now = Date.now();
        
        if (!all[conversationKey]) {
            all[conversationKey] = { createTime: null, lastVisit: now, nodes: {} };
        }
        if (!all[conversationKey].nodes) {
            all[conversationKey].nodes = {};
        }
        
        let addedCount = 0;
        
        for (const { nodeId, timestamp } of nodes) {
            if (nodeId !== undefined && nodeId !== null && all[conversationKey].nodes[nodeId] === undefined) {
                all[conversationKey].nodes[nodeId] = timestamp || now;
                addedCount++;
            }
        }
        
        // 更新 lastVisit
        all[conversationKey].lastVisit = now;
        
        if (addedCount > 0) {
            await StorageAdapter.set(this.STORAGE_KEY, all);
        }
        
        return addedCount;
    },

    /**
     * 迁移节点 ID（从临时 ID 迁移到真实 ID）
     * @param {string} conversationKey - 会话标识
     * @param {string} tempId - 临时节点 ID
     * @param {string} realId - 真实节点 ID
     * @returns {Promise<boolean>} - 是否成功迁移
     */
    async migrateNodeId(conversationKey, tempId, realId) {
        if (!conversationKey || !tempId || !realId) return false;
        
        const all = await this.getAllRecords();
        
        if (!all[conversationKey] || !all[conversationKey].nodes) {
            return false;
        }
        
        const nodes = all[conversationKey].nodes;
        
        // 如果临时 ID 存在，迁移到真实 ID
        if (nodes[tempId] !== undefined) {
            const timestamp = nodes[tempId];
            delete nodes[tempId];
            nodes[realId] = timestamp;
            await StorageAdapter.set(this.STORAGE_KEY, all);
            return true;
        }
        
        return false;
    },

    /**
     * 按节点时间数量清理最早的节点时间记录
     * @param {number} maxNodeTimes - 最大保留节点时间数（默认1000个）
     * @param {number} cleanupCount - 超限后清理的节点时间数（默认50个）
     * @returns {Promise<number>} - 清理的节点时间数量
     */
    async cleanup(maxNodeTimes = 1000, cleanupCount = 50) {
        const all = await this.getAllRecords();
        const nodeTimeEntries = [];
        
        for (const [convKey, data] of Object.entries(all)) {
            const nodes = data?.nodes;
            if (!nodes || typeof nodes !== 'object') continue;

            for (const [nodeId, timestamp] of Object.entries(nodes)) {
                nodeTimeEntries.push({ convKey, nodeId, timestamp: Number(timestamp) || 0 });
            }
        }
        
        if (nodeTimeEntries.length <= maxNodeTimes) {
            return 0;
        }
        
        const nodeTimesToRemove = nodeTimeEntries
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(0, cleanupCount);

        for (const { convKey, nodeId } of nodeTimesToRemove) {
            if (all[convKey]?.nodes) {
                delete all[convKey].nodes[nodeId];
                if (Object.keys(all[convKey].nodes).length === 0) {
                    delete all[convKey];
                }
            }
        }

        await StorageAdapter.set(this.STORAGE_KEY, all);
        return nodeTimesToRemove.length;
    }
};

// ==================== 执行迁移 ====================
// 在脚本加载时立即执行迁移检查（异步，不阻塞）
StorageAdapter.migrateFromSyncToLocal();

// chatTimes 节点时间超过 1000 个时，清理最早的 50 个节点时间（每次加载时检查）
ChatTimeStorageManager.cleanup(1000, 50).catch(() => {});
