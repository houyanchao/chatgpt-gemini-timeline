/**
 * Smart Input Box - 主入口
 * 
 * 智能输入框功能初始化
 * 
 * 功能：
 * - 提示词按钮（独立开关控制）
 * - Enter 键换行 + 快速双击 Enter 发送（独立开关控制）
 * 
 * 支持平台：
 * - 所有 features.promptButton === true 或 features.smartEnter === true 的平台
 */

(function() {
    'use strict';

    // ✅ 检查当前平台是否支持智能输入功能
    function isPlatformSupported() {
        try {
            const platform = getCurrentPlatform();
            if (!platform) return false;

            // 检查平台是否支持智能输入功能（提示词按钮或智能回车之一）
            return platform.features?.promptButton === true || platform.features?.smartEnter === true;
        } catch (e) {
            return false;
        }
    }
    
    // 等待 DOM 和依赖加载完成
    const initSmartInputBox = async () => {
        try {
            // 检查依赖是否加载
            if (typeof SmartEnterAdapterRegistry === 'undefined') {
                console.error('[SmartInputBox] SmartEnterAdapterRegistry not loaded');
                return;
            }
            
            if (typeof SmartEnterManager === 'undefined') {
                console.error('[SmartInputBox] SmartEnterManager not loaded');
                return;
            }
            
            // 获取当前页面的适配器
            const registry = window.smartEnterAdapterRegistry;
            if (!registry) {
                console.error('[SmartInputBox] Registry not initialized');
                return;
            }
            
            const adapter = registry.getAdapter();
            
            if (!adapter) {
                // 当前页面不匹配任何适配器，不启用功能
                return;
            }
            
            // ✅ 检查当前平台是否支持智能输入功能
            if (!isPlatformSupported()) {
                return;
            }
            
            // ✅ 只要平台支持，就创建管理器实例
            // Enter 换行和提示词按钮各自受自己的开关控制
            const manager = new SmartEnterManager(adapter, {
                debug: SMART_ENTER_CONFIG.DEBUG
            });
            
            // 初始化
            await manager.init();
            
            // 保存到全局（方便调试和外部控制）
            window.smartEnterManager = manager;
            
        } catch (error) {
            console.error('[SmartInputBox] Initialization failed:', error);
        }
    };
    
    // DOM 加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSmartInputBox);
    } else {
        // DOM 已经加载完成
        initSmartInputBox();
    }
    
})();

