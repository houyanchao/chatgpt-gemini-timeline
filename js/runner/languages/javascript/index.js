/**
 * JavaScriptRunner - JavaScript 代码执行器
 * 
 * 继承自 BaseRunner，使用 iframe 沙箱执行 JavaScript 代码
 */

class JavaScriptRunner extends BaseRunner {
    constructor() {
        super({
            language: 'javascript',
            displayName: 'JavaScript',
            icon: '🟨',
            fileExtension: '.js'
        });
        this.sandboxManager = null;
    }

    /**
     * 初始化
     */
    async initialize() {
        if (!this.sandboxManager) {
            this.sandboxManager = new window.JSSandboxManager();
        }
        await super.initialize();
    }

    /**
     * 执行代码
     * @param {string} code - 要执行的代码
     * @param {Object} options - 选项
     * @returns {Promise}
     */
    async execute(code, options = {}) {
        await this.initialize();
        
        const {
            onOutput = () => {},
            timeout = 30000  // JavaScript 超时 30 秒
        } = options;
        
        try {
            const result = await this.sandboxManager.execute(
                code,
                onOutput,
                timeout
            );
            
            return {
                success: true,
                duration: result.duration,
                language: this.language
            };
        } catch (error) {
            onOutput({
                level: 'error',
                data: [error.message]
            });
            
            return {
                success: false,
                error: error.message,
                language: this.language
            };
        }
    }

    /**
     * 清理资源
     */
    cleanup() {
        if (this.sandboxManager) {
            this.sandboxManager.destroy();
        }
    }

    /**
     * 获取占位符
     */
    getPlaceholder() {
        return '// 输入 JavaScript 代码\nconsole.log("Hello, World!");';
    }

    /**
     * 获取示例代码
     * @returns {string}
     */
    getExampleCode() {
        return `// JavaScript 示例代码
console.log('Hello, Runner!');

const numbers = [1, 2, 3, 4, 5];
const sum = numbers.reduce((a, b) => a + b, 0);
console.log('数组求和:', sum);

// 支持异步代码
async function fetchData() {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve('异步数据加载完成！');
        }, 1000);
    });
}

const data = await fetchData();
console.log(data);`;
    }
}

// 导出
if (typeof window !== 'undefined') {
    window.JavaScriptRunner = JavaScriptRunner;
}
