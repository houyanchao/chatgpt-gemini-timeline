/**
 * Formula Module Entry Point
 * 公式复制功能的入口，自动初始化，完全独立运行
 * 
 * 特性：
 * - 完全独立，不依赖时间轴功能
 * - 自动初始化和清理
 * - 所有匹配的网站都会执行
 */

(function() {
    'use strict';
    
    // 全局 FormulaManager 实例
    let globalFormulaManager = null;
    
    /**
     * 初始化公式复制功能
     */
    async function initFormulaModule() {
        await TimelineI18n.ready();

        // 避免重复初始化
        if (globalFormulaManager) {
            return;
        }
        
        // 检查依赖
        if (typeof FormulaManager === 'undefined') {
            return;
        }
        
        if (typeof FormulaSourceParser === 'undefined') {
            return;
        }
        
        try {
            // 创建并初始化 FormulaManager（内部会检查是否启用）
            globalFormulaManager = new FormulaManager();
            await globalFormulaManager.init();
            
        } catch (error) {
        }
    }
    
    /**
     * 清理公式复制功能
     */
    function destroyFormulaModule() {
        if (globalFormulaManager) {
            try {
                globalFormulaManager.destroy();
                globalFormulaManager = null;
            } catch (error) {
            }
        }
    }
    
    /**
     * ✅ 监听功能开关变化，动态启用/禁用公式复制功能
     */
    function setupStorageListener() {
        chrome.storage.onChanged.addListener(async (changes, areaName) => {
            if (areaName !== 'local') return;
            
            if (changes.formulaLatexEnabled || changes.formulaMathMLEnabled) {
                const result = await chrome.storage.local.get(['formulaLatexEnabled', 'formulaMathMLEnabled']);
                const isEnabled = (result.formulaLatexEnabled !== false || result.formulaMathMLEnabled === true);
                
                if (isEnabled) {
                    if (!globalFormulaManager) {
                        initFormulaModule();
                    } else {
                        globalFormulaManager.rescan();
                    }
                } else {
                    if (globalFormulaManager) {
                        destroyFormulaModule();
                    }
                }
            }
        });
    }
    
    // 页面加载完成后自动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFormulaModule);
    } else {
        // 如果已经加载完成，立即初始化
        initFormulaModule();
    }
    
    // ✅ 设置 Storage 监听器
    setupStorageListener();
    
    // 页面卸载时清理
    window.addEventListener('beforeunload', destroyFormulaModule);
    
})();
