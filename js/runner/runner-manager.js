/**
 * RunnerManager - 代码运行器核心管理器
 * 
 * 协调各个模块，管理代码执行流程
 */

class RunnerManager {
    constructor() {
        this.languageRegistry = null;
        this.currentLanguage = 'javascript';
        this.isRunning = false;
        this.outputLimit = 1000; // 最多显示 1000 条输出
        this.outputCount = 0;
    }

    /**
     * 初始化
     */
    initialize() {
        if (!this.languageRegistry) {
            this.languageRegistry = new window.LanguageRegistry();
        }
    }

    /**
     * 运行代码
     * @param {string} code - 要执行的代码
     * @param {string} language - 语言类型
     * @param {Object} callbacks - 回调函数
     * @returns {Promise}
     */
    async run(code, language, callbacks = {}) {
        this.initialize();

        const {
            onStart = () => {},
            onOutput = () => {},
            onComplete = () => {},
            onError = () => {}
        } = callbacks;

        // 检查代码是否为空
        if (!code || !code.trim()) {
            onError({ message: '代码不能为空' });
            return { success: false, error: '代码不能为空' };
        }

        // 检查语言是否支持
        const runner = this.languageRegistry.getRunner(language);
        if (!runner) {
            onError({ message: `不支持的语言: ${language}` });
            return { success: false, error: `不支持的语言: ${language}` };
        }

        // 检查是否正在运行
        if (this.isRunning) {
            onError({ message: '代码正在运行中，请稍候...' });
            return { success: false, error: '代码正在运行中' };
        }

        try {
            if (language === 'mermaid') {
                await window.AITResourceLoader?.load('runner-mermaid');
            } else if (language === 'markdown') {
                await window.AITResourceLoader?.load('runner-markdown');
            }
        } catch (error) {
            const errorResult = { message: error.message || '运行器依赖加载失败' };
            onError(errorResult);
            return { success: false, error: errorResult.message };
        }

        // 重置输出计数
        this.outputCount = 0;
        this.isRunning = true;
        onStart();

        try {
            // 执行代码（使用各语言默认的超时时间）
            const result = await runner.execute(code, {
                onOutput: (output) => {
                    this.handleOutput(output, onOutput);
                }
            });

            this.isRunning = false;
            onComplete(result);
            return result;

        } catch (error) {
            this.isRunning = false;
            const errorResult = {
                success: false,
                error: error.message
            };
            onError(errorResult);
            return errorResult;
        }
    }

    /**
     * 处理输出
     * @param {Object} output - 输出数据
     * @param {Function} callback - 回调函数
     */
    handleOutput(output, callback) {
        // 检查输出限制
        if (this.outputCount >= this.outputLimit) {
            if (this.outputCount === this.outputLimit) {
                callback({
                    level: 'warn',
                    data: [`输出已达到上限 (${this.outputLimit} 条)，后续输出将被忽略...`],
                    truncated: true
                });
                this.outputCount++;
            }
            return;
        }

        this.outputCount++;
        callback(output);
    }

    /**
     * 停止当前运行
     */
    stop() {
        if (!this.isRunning) return;

        // 清理当前语言的运行器
        const runner = this.languageRegistry.getRunner(this.currentLanguage);
        if (runner && runner.cleanup) {
            runner.cleanup();
        }

        this.isRunning = false;
    }

    /**
     * 验证代码语法
     * @param {string} code - 代码
     * @param {string} language - 语言
     * @returns {Object}
     */
    validateSyntax(code, language) {
        this.initialize();

        const runner = this.languageRegistry.getRunner(language);
        if (!runner) {
            return { valid: false, error: '不支持的语言' };
        }

        if (runner.validateSyntax) {
            return runner.validateSyntax(code);
        }

        return { valid: true };
    }

    /**
     * 获取示例代码
     * @param {string} language - 语言
     * @returns {string}
     */
    getExampleCode(language) {
        this.initialize();

        const runner = this.languageRegistry.getRunner(language);
        if (runner && runner.getExampleCode) {
            return runner.getExampleCode();
        }

        return '';
    }

    /**
     * 获取所有语言
     * @returns {Array}
     */
    getAllLanguages() {
        this.initialize();
        return this.languageRegistry.getAllLanguages();
    }

    /**
     * 设置当前语言
     * @param {string} language - 语言
     */
    setCurrentLanguage(language) {
        this.currentLanguage = language;
    }

    /**
     * 获取当前语言
     * @returns {string}
     */
    getCurrentLanguage() {
        return this.currentLanguage;
    }

    /**
     * 清理资源
     */
    cleanup() {
        this.stop();
        if (this.languageRegistry) {
            this.languageRegistry.cleanup();
        }
    }
}

// 导出
if (typeof window !== 'undefined') {
    window.RunnerManager = RunnerManager;
}
