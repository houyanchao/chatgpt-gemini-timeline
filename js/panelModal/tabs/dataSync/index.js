/**
 * DataSync Tab - 数据导入导出
 * 
 * 功能：
 * - 导出：将 Storage 数据导出为 JSON 文件
 * - 导入：从 JSON 文件导入数据（支持覆盖/合并）
 */

class DataSyncTab extends BaseTab {
    constructor() {
        super();
        this.id = 'data-sync';
        this.name = TimelineI18n.getMessage('dataSyncTabName') || '数据同步';
        this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M16 3l4 4-4 4"/>
            <path d="M20 7H4"/>
            <path d="M8 21l-4-4 4-4"/>
            <path d="M4 17h16"/>
        </svg>`;
        
        // Toast 主题颜色配置（跟随项目主题变量）
        this.toastColors = {
            light: {
                backgroundColor: '#0d0d0d',
                textColor: '#ffffff',
                borderColor: '#0d0d0d'
            },
            dark: {
                backgroundColor: '#262626',
                textColor: '#f5f5f5',
                borderColor: '#404040'
            }
        };
    }
    
    /**
     * 渲染设置内容
     */
    render() {
        const container = document.createElement('div');
        container.className = 'data-sync-tab';
        
        container.innerHTML = `
            <div class="sync-section gdrive-section">
                <div class="sync-title">
                    <svg viewBox="0 0 87.3 78" width="18" height="16" style="margin-right: 6px; flex-shrink: 0;">
                        <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066DA"/>
                        <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L6.2 39.8C5.4 41.2 5 42.75 5 44.3h27.5z" fill="#00AC47"/>
                        <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 13.95z" fill="#EA4335"/>
                        <path d="M43.65 25l13.75-23.8C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832D"/>
                        <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684FC"/>
                        <path d="M73.4 26.5l-10.6-18.3c-.8-1.4-1.95-2.5-3.3-3.3L45.75 28.7 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#FFBA00"/>
                    </svg>
                    ${TimelineI18n.getMessage('gdriveTitle') || 'Google Drive 云同步'}
                </div>
                <div class="sync-hint">${TimelineI18n.getMessage('gdriveHint') || '将数据备份到你的 Google Drive 中，实现多设备同步。'}</div>
                <div class="gdrive-actions">
                    <button class="sync-btn" id="gdrive-upload-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <polyline points="16,16 12,12 8,16"/>
                            <line x1="12" y1="12" x2="12" y2="21"/>
                            <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>
                        </svg>
                        ${TimelineI18n.getMessage('gdriveUploadBtn') || '上传到云端'}
                    </button>
                    <button class="sync-btn gdrive-download-btn" id="gdrive-download-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <polyline points="8,17 12,21 16,17"/>
                            <line x1="12" y1="12" x2="12" y2="21"/>
                            <path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/>
                        </svg>
                        ${TimelineI18n.getMessage('gdriveDownloadBtn') || '从云端下载'}
                    </button>
                </div>

            </div>
            
            <div class="sync-divider"></div>
            
            <div class="sync-section">
                <div class="sync-title">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#4b5563" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; flex-shrink: 0;">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                        <polyline points="14,2 14,8 20,8"/>
                    </svg>
                    ${TimelineI18n.getMessage('exportTitle') || '手动同步'}
                </div>
                <div class="sync-hint">${TimelineI18n.getMessage('exportHint') || '通过 JSON 文件手动备份或恢复数据，用于迁移到其他浏览器。'}</div>
                
                <div class="local-sync-group">
                    <div class="local-sync-item">
                        <div class="local-sync-label">${TimelineI18n.getMessage('exportLabel') || '导出'}</div>
                        <div class="local-sync-body">
                            <button class="sync-btn export-btn" id="export-btn">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                                    <polyline points="14,2 14,8 20,8"/>
                                    <line x1="12" y1="12" x2="12" y2="18"/>
                                    <polyline points="9,15 12,18 15,15"/>
                                </svg>
                                ${TimelineI18n.getMessage('exportBtn') || '导出 JSON 文件'}
                            </button>
                        </div>
                    </div>
                    <div class="local-sync-item">
                        <div class="local-sync-label">${TimelineI18n.getMessage('importLabel') || '导入'}</div>
                        <div class="local-sync-body">
                            <div class="import-options">
                                <label class="import-option">
                                    <input type="radio" name="import-mode" value="merge" checked>
                                    <span class="option-radio"></span>
                                    <span class="option-content">
                                        <span class="option-label">${TimelineI18n.getMessage('importModeMerge') || '合并'}</span>
                                        <span class="option-desc">${TimelineI18n.getMessage('importModeMergeDesc') || '保留现有数据，与导入数据合并'}</span>
                                    </span>
                                </label>
                                <label class="import-option">
                                    <input type="radio" name="import-mode" value="overwrite">
                                    <span class="option-radio"></span>
                                    <span class="option-content">
                                        <span class="option-label">${TimelineI18n.getMessage('importModeOverwrite') || '覆盖'}</span>
                                        <span class="option-desc">${TimelineI18n.getMessage('importModeOverwriteDesc') || '清空现有数据，使用导入数据替换'}</span>
                                    </span>
                                </label>
                            </div>
                            <button class="sync-btn import-btn" id="import-btn">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                                    <polyline points="14,2 14,8 20,8"/>
                                    <line x1="12" y1="18" x2="12" y2="12"/>
                                    <polyline points="9,15 12,12 15,15"/>
                                </svg>
                                ${TimelineI18n.getMessage('importBtn') || '选择文件导入'}
                            </button>
                        </div>
                    </div>
                </div>
                <input type="file" id="import-file-input" accept=".json" style="display: none;">
            </div>
            
            <div class="sync-status" id="sync-status" style="display: none;"></div>
        `;
        
        return container;
    }
    
    /**
     * Tab 激活时加载状态
     */
    async mounted() {
        super.mounted();
        
        // --- Google Drive 云同步 ---
        const uploadBtn = document.getElementById('gdrive-upload-btn');
        const downloadBtn = document.getElementById('gdrive-download-btn');
        
        if (uploadBtn) {
            this.addEventListener(uploadBtn, 'click', () => this.handleGDriveUpload());
        }
        if (downloadBtn) {
            this.addEventListener(downloadBtn, 'click', () => this.handleGDriveDownload());
        }
        
        // --- 本地导入导出 ---
        const exportBtn = document.getElementById('export-btn');
        const importBtn = document.getElementById('import-btn');
        const fileInput = document.getElementById('import-file-input');
        
        if (exportBtn) {
            this.addEventListener(exportBtn, 'click', () => this.handleExport());
        }
        if (importBtn) {
            this.addEventListener(importBtn, 'click', () => fileInput?.click());
        }
        if (fileInput) {
            this.addEventListener(fileInput, 'change', (e) => this.handleImport(e));
        }
    }
    
    // ============================================
    // Google Drive 云同步方法
    // ============================================
    
    /**
     * 上传到 Google Drive（未登录或 token 失效时自动触发登录）
     */
    async handleGDriveUpload() {
        const uploadBtn = document.getElementById('gdrive-upload-btn');
        if (uploadBtn) {
            uploadBtn.disabled = true;
            uploadBtn.textContent = TimelineI18n.getMessage('gdriveUploading') || '上传中...';
        }
        
        try {
            const data = await this.getAllStorageData();
            const exportData = {
                _meta: this._buildMeta(),
                data: data
            };
            
            const resp = await chrome.runtime.sendMessage({ type: 'GDRIVE_UPLOAD', data: exportData });
            if (resp?.success) {
                if (window.globalToastManager) {
                    window.globalToastManager.success(TimelineI18n.getMessage('gdriveUploadSuccess') || '已上传到 Google Drive', null, { color: this.toastColors });
                }
            } else {
                throw new Error(resp?.error || (TimelineI18n.getMessage('gdriveUploadFailed') || '上传失败'));
            }
        } catch (e) {
            if (window.globalToastManager) {
                window.globalToastManager.error((TimelineI18n.getMessage('gdriveUploadFailed') || '上传失败') + ': ' + e.message, null, { color: this.toastColors });
            }
        } finally {
            if (uploadBtn) {
                uploadBtn.disabled = false;
                uploadBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <polyline points="16,16 12,12 8,16"/>
                        <line x1="12" y1="12" x2="12" y2="21"/>
                        <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>
                    </svg>
                    ${TimelineI18n.getMessage('gdriveUploadBtn') || '上传到云端'}`;
            }
        }
    }
    
    /**
     * 从 Google Drive 下载
     */
    async handleGDriveDownload() {
        const downloadBtn = document.getElementById('gdrive-download-btn');
        if (downloadBtn) {
            downloadBtn.disabled = true;
            downloadBtn.textContent = TimelineI18n.getMessage('gdriveDownloading') || '下载中...';
        }
        
        try {
            const resp = await chrome.runtime.sendMessage({ type: 'GDRIVE_DOWNLOAD' });
            if (!resp?.success) {
                throw new Error(resp?.error || (TimelineI18n.getMessage('gdriveDownloadFailed') || '下载失败'));
            }
            
            if (!resp.data) {
                if (window.globalToastManager) {
                    window.globalToastManager.info(TimelineI18n.getMessage('gdriveNoBackup') || '云端暂无备份数据', null, { color: this.toastColors });
                }
                return;
            }
            
            // 验证数据格式
            const importData = resp.data;
            if (!this._isValidBackup(importData)) {
                throw new Error(TimelineI18n.getMessage('gdriveDataInvalid') || '云端数据格式无效');
            }
            
            // 使用合并模式导入
            await this.mergeData(importData.data);
            
            // 提醒用户刷新
            if (window.globalPopconfirmManager) {
                const confirmed = await window.globalPopconfirmManager.show({
                    title: TimelineI18n.getMessage('gdriveMergeSuccess') || '云端数据已合并',
                    content: TimelineI18n.getMessage('gdriveMergeHint') || '数据已成功从 Google Drive 下载并合并，需要刷新页面后生效',
                    confirmText: TimelineI18n.getMessage('refreshPage') || '刷新页面',
                    cancelText: TimelineI18n.getMessage('refreshLater') || '稍后刷新',
                    confirmTextType: 'default'
                });
                if (confirmed) location.reload();
            }
        } catch (e) {
            if (window.globalToastManager) {
                window.globalToastManager.error((TimelineI18n.getMessage('gdriveDownloadFailed') || '下载失败') + ': ' + e.message, null, { color: this.toastColors });
            }
        } finally {
            if (downloadBtn) {
                downloadBtn.disabled = false;
                downloadBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <polyline points="8,17 12,21 16,17"/>
                        <line x1="12" y1="12" x2="12" y2="21"/>
                        <path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/>
                    </svg>
                    ${TimelineI18n.getMessage('gdriveDownloadBtn') || '从云端下载'}`;
            }
        }
    }
    
    /**
     * 导出数据
     */
    async handleExport() {
        try {
            this.showStatus('loading', TimelineI18n.getMessage('exportingData') || '正在导出...');
            
            // 获取所有存储数据
            const data = await this.getAllStorageData();
            
            // 添加元数据
            const exportData = {
                _meta: this._buildMeta(),
                data: data
            };
            
            // 创建并下载文件
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ai-timeline-backup-${this.formatDate(new Date())}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            // 使用全局 toast 提示（颜色跟随主题）
            if (window.globalToastManager) {
                window.globalToastManager.success(
                    TimelineI18n.getMessage('exportSuccess') || '导出成功',
                    null,
                    { color: this.toastColors }
                );
            }
        } catch (error) {
            console.error('[DataSyncTab] Export failed:', error);
            // 使用全局 toast 提示（颜色跟随主题）
            if (window.globalToastManager) {
                window.globalToastManager.error(
                    TimelineI18n.getMessage('exportFailed') || '导出失败',
                    null,
                    { color: this.toastColors }
                );
            }
        }
    }
    
    /**
     * 导入数据
     */
    async handleImport(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        
        // 重置 input，允许重复选择同一文件
        e.target.value = '';
        
        try {
            this.showStatus('loading', TimelineI18n.getMessage('importingData') || '正在导入...');
            
            // 读取文件
            const text = await file.text();
            const importData = JSON.parse(text);
            
            // 验证数据格式（含来源指纹，避免误导入非本扩展备份）
            if (!this._isValidBackup(importData)) {
                throw new Error('Invalid data format');
            }
            
            // 获取导入模式
            const modeRadio = document.querySelector('input[name="import-mode"]:checked');
            const mode = modeRadio?.value || 'merge';
            
            if (mode === 'overwrite') {
                // 覆盖模式：直接替换
                await this.overwriteData(importData.data);
            } else {
                // 合并模式：智能合并
                await this.mergeData(importData.data);
            }
            
            // 使用 popConfirm 展示导入成功，提醒用户刷新
            if (window.globalPopconfirmManager) {
                const confirmed = await window.globalPopconfirmManager.show({
                    title: TimelineI18n.getMessage('importSuccess') || '导入成功',
                    content: TimelineI18n.getMessage('importSuccessHint') || '数据已成功导入，需要刷新页面后生效',
                    confirmText: TimelineI18n.getMessage('refreshPage') || '刷新页面',
                    cancelText: TimelineI18n.getMessage('refreshLater') || '稍后刷新',
                    confirmTextType: 'default'
                });
                
                if (confirmed) {
                    location.reload();
                }
            }
        } catch (error) {
            console.error('[DataSyncTab] Import failed:', error);
            this.showStatus('error', (TimelineI18n.getMessage('importFailed') || '导入失败') + ': ' + error.message);
        }
    }
    
    /**
     * 构建备份文件元数据
     *  - source:          来源指纹，import 端用来识别"是不是本扩展的备份"，防止误导入
     *  - appVersion:      导出时的扩展版本号，便于后续排查脏数据 / 兼容性问题
     *  - exportTime:      ISO 字符串，人可读
     *  - exportTimestamp: 毫秒数，程序可直接比较
     */
    _buildMeta() {
        return {
            source: 'AIChatTimeline',
            appVersion: chrome.runtime.getManifest().version,
            exportTime: new Date().toISOString(),
            exportTimestamp: Date.now()
        };
    }

    /**
     * 校验是否是合法的本扩展备份
     *  - data 必须是对象
     *  - 若带 _meta，则 source 必须为 'AIChatTimeline'（缺 _meta 时放行，兼容极早期备份）
     */
    _isValidBackup(importData) {
        if (!importData || typeof importData !== 'object') return false;
        if (!importData.data || typeof importData.data !== 'object') return false;
        const meta = importData._meta;
        if (meta && meta.source !== undefined && meta.source !== 'AIChatTimeline') return false;
        return true;
    }

    /**
     * 获取所有存储数据（过滤掉 _ 开头的内部数据）
     */
    async getAllStorageData() {
        return new Promise((resolve) => {
            chrome.storage.local.get(null, (items) => {
                const filtered = {};
                for (const [key, value] of Object.entries(items)) {
                    if (!key.startsWith('_') && key !== 'gdriveToken') {
                        filtered[key] = value;
                    }
                }
                resolve(filtered);
            });
        });
    }
    
    /**
     * 覆盖模式：清空并写入新数据
     */
    async overwriteData(newData) {
        return new Promise((resolve, reject) => {
            // 先清空
            chrome.storage.local.clear(() => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                    return;
                }
                // 再写入
                chrome.storage.local.set(newData, () => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve();
                    }
                });
            });
        });
    }
    
    /**
     * 合并模式：智能合并数据
     * 
     * 合并规则：
     * - chatTimelineStars → 按 key 字段合并，导入覆盖
     * - chatTimelinePins → 按 key 字段合并，导入覆盖
     * - prompts（提示词）→ 按 id 字段合并，导入覆盖
     * - folders（文件夹）→ 按 id 字段合并，导入覆盖
     * - *PlatformSettings → 对象按 key 合并
     * - 其他类型 → 新值覆盖
     */
    async mergeData(newData) {
        const existingData = await this.getAllStorageData();
        const mergedData = { ...existingData };
        
        for (const [key, newValue] of Object.entries(newData)) {
            const existingValue = existingData[key];
            
            // 本地不存在，直接使用新值
            if (existingValue === undefined) {
                mergedData[key] = newValue;
                continue;
            }
            
            // 根据 key 类型选择合并策略
            mergedData[key] = this.mergeByKey(key, existingValue, newValue);
        }
        
        return new Promise((resolve, reject) => {
            chrome.storage.local.set(mergedData, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });
    }
    
    /**
     * 根据 key 类型选择合并策略
     */
    mergeByKey(key, existing, newValue) {
        // chatTimelineStars - 按 key 字段合并
        if (key === 'chatTimelineStars') {
            return this.mergeArrayByField(existing, newValue, 'key');
        }
        
        // chatTimelinePins - 按 key 字段合并
        if (key === 'chatTimelinePins') {
            return this.mergeArrayByField(existing, newValue, 'key');
        }
        
        // prompts（提示词）- 按 id 字段合并
        if (key === 'prompts') {
            return this.mergeArrayByField(existing, newValue, 'id');
        }
        
        // folders（文件夹）- 按 id 字段合并
        if (key === 'folders') {
            return this.mergeArrayByField(existing, newValue, 'id');
        }
        
        // *PlatformSettings - 对象按 key 合并
        if (key.endsWith('PlatformSettings')) {
            return { ...existing, ...newValue };
        }
        
        // 其他类型 - 新值覆盖
        return newValue;
    }
    
    /**
     * 按指定字段合并数组（导入数据覆盖现有数据）
     * @param {Array} existing - 现有数据
     * @param {Array} newArr - 导入数据
     * @param {string} field - 唯一标识字段名
     * @returns {Array} 合并后的数组
     */
    mergeArrayByField(existing, newArr, field) {
        if (!Array.isArray(existing) || !Array.isArray(newArr)) {
            return newArr;
        }
        
        const map = new Map();
        
        // 先添加现有数据
        for (const item of existing) {
            const key = item[field];
            if (key !== undefined) {
                map.set(key, item);
            }
        }
        
        // 导入数据覆盖（相同 key 的会被覆盖）
        for (const item of newArr) {
            const key = item[field];
            if (key !== undefined) {
                map.set(key, item);
            }
        }
        
        return Array.from(map.values());
    }
    
    /**
     * 格式化日期
     */
    formatDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${y}${m}${d}-${h}${min}`;
    }
    
    /**
     * 显示状态消息
     */
    showStatus(type, message) {
        const statusEl = document.getElementById('sync-status');
        if (!statusEl) return;
        
        statusEl.className = `sync-status ${type}`;
        statusEl.textContent = message;
        statusEl.style.display = 'block';
    }
    
    /**
     * 隐藏状态消息
     */
    hideStatus() {
        const statusEl = document.getElementById('sync-status');
        if (statusEl) {
            statusEl.style.display = 'none';
        }
    }
    
    /**
     * Tab 卸载时清理
     */
    unmounted() {
        super.unmounted();
    }
}
