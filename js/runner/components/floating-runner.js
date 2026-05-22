/**
 * FloatingRunnerContainer - 悬浮代码运行容器（单例）
 * 
 * 职责：提供可拖动、可调整大小的悬浮窗口容器
 * 内部使用 RunnerPanel 核心组件
 */

(function() {
    'use strict';

    // ===== 配置 =====
    const CONFIG = {
        defaultWidth: 500,
        defaultHeight: 450,
        minWidth: 380,
        minHeight: 300,
        storageKey: '_floatingRunnerState'
    };

    class FloatingRunnerContainer {
        static instance = null;

        static getInstance() {
            if (!this.instance) {
                this.instance = new FloatingRunnerContainer();
            }
            return this.instance;
        }

        constructor() {
            this.container = null;
            this.panel = null;  // RunnerPanel 实例
            this.isVisible = false;

            // 位置和大小
            this.position = { x: null, y: null };
            this.size = { width: CONFIG.defaultWidth, height: CONFIG.defaultHeight };

            // 拖动状态
            this.isDragging = false;
            this.isResizing = false;
            this.dragOffset = { x: 0, y: 0 };
            this.resizeDirection = null;

            // 当前语言
            this.language = 'javascript';

            // 加载保存的状态
            this.loadState();
        }

        /**
         * 创建容器
         */
        createContainer() {
            if (this.container) return;

            // 创建悬浮容器（只有 body 和 resize handles，没有 header）
            this.container = document.createElement('div');
            this.container.className = 'floating-runner-container';
            this.container.innerHTML = `
                <div class="floating-runner-body"></div>
                <div class="floating-runner-resize-handle" data-direction="se"></div>
                <div class="floating-runner-resize-handle" data-direction="sw"></div>
                <div class="floating-runner-resize-handle" data-direction="ne"></div>
                <div class="floating-runner-resize-handle" data-direction="nw"></div>
                <div class="floating-runner-resize-handle" data-direction="e"></div>
                <div class="floating-runner-resize-handle" data-direction="w"></div>
                <div class="floating-runner-resize-handle" data-direction="n"></div>
                <div class="floating-runner-resize-handle" data-direction="s"></div>
            `;

            document.body.appendChild(this.container);

            // 创建 RunnerPanel（在 body 内部）
            const body = this.container.querySelector('.floating-runner-body');
            this.panel = new window.RunnerPanel(body, {
                language: this.language,
                showClose: true,   // 显示关闭按钮
                showPopout: false, // 已经是悬浮状态了
                onClose: () => {
                    this.hide();
                },
                onLanguageChange: (lang) => {
                    this.language = lang;
                    this.saveState();
                }
            });

            // 绑定事件
            this.bindEvents();

            // 应用保存的位置和大小
            this.applyState();
        }

        /**
         * 绑定事件
         */
        bindEvents() {
            // 拖动：只绑定到编辑器区域的 header（标题栏），不包括 output 区域的 header
            const editorHeader = this.container.querySelector('.runner-panel-editor-section .runner-panel-header');
            if (editorHeader) {
                editorHeader.style.cursor = 'move';
                editorHeader.addEventListener('mousedown', (e) => {
                    if (e.target.closest('button')) return;
                    this.startDrag(e);
                });
            }

            // 调整大小
            this.container.querySelectorAll('.floating-runner-resize-handle').forEach(handle => {
                handle.addEventListener('mousedown', (e) => {
                    this.startResize(e, handle.dataset.direction);
                });
            });

            // 全局事件
            document.addEventListener('mousemove', (e) => this.onMouseMove(e));
            document.addEventListener('mouseup', () => this.onMouseUp());

            // ESC 关闭
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.isVisible) {
                    this.hide();
                }
            });
        }

        // ===== 拖动 =====
        startDrag(e) {
            this.isDragging = true;
            const rect = this.container.getBoundingClientRect();
            this.dragOffset = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
            document.body.style.userSelect = 'none';
        }

        // ===== 调整大小 =====
        startResize(e, direction) {
            this.isResizing = true;
            this.resizeDirection = direction;
            this.resizeStart = {
                x: e.clientX,
                y: e.clientY,
                width: this.container.offsetWidth,
                height: this.container.offsetHeight,
                left: this.container.offsetLeft,
                top: this.container.offsetTop
            };
            document.body.style.userSelect = 'none';
            document.body.style.cursor = this.getCursorForDirection(direction);
        }

        getCursorForDirection(dir) {
            const cursors = {
                'n': 'ns-resize', 's': 'ns-resize',
                'e': 'ew-resize', 'w': 'ew-resize',
                'ne': 'nesw-resize', 'sw': 'nesw-resize',
                'nw': 'nwse-resize', 'se': 'nwse-resize'
            };
            return cursors[dir] || 'default';
        }

        onMouseMove(e) {
            if (this.isDragging) {
                const x = e.clientX - this.dragOffset.x;
                const y = e.clientY - this.dragOffset.y;
                this.setPosition(x, y);
            }

            if (this.isResizing) {
                this.doResize(e);
            }
        }

        doResize(e) {
            const { x, y, width, height, left, top } = this.resizeStart;
            const dx = e.clientX - x;
            const dy = e.clientY - y;
            const dir = this.resizeDirection;

            let newWidth = width;
            let newHeight = height;
            let newLeft = left;
            let newTop = top;

            if (dir.includes('e')) newWidth = Math.max(CONFIG.minWidth, width + dx);
            if (dir.includes('w')) {
                newWidth = Math.max(CONFIG.minWidth, width - dx);
                newLeft = left + (width - newWidth);
            }
            if (dir.includes('s')) newHeight = Math.max(CONFIG.minHeight, height + dy);
            if (dir.includes('n')) {
                newHeight = Math.max(CONFIG.minHeight, height - dy);
                newTop = top + (height - newHeight);
            }

            this.container.style.width = newWidth + 'px';
            this.container.style.height = newHeight + 'px';
            this.container.style.left = newLeft + 'px';
            this.container.style.top = newTop + 'px';

            this.size = { width: newWidth, height: newHeight };
            this.position = { x: newLeft, y: newTop };

            // 刷新内部 panel
            if (this.panel) {
                this.panel.refresh();
            }
        }

        onMouseUp() {
            if (this.isDragging || this.isResizing) {
                this.isDragging = false;
                this.isResizing = false;
                document.body.style.userSelect = '';
                document.body.style.cursor = '';
                this.saveState();
            }
        }

        // ===== 位置和大小 =====
        setPosition(x, y) {
            const minVisible = 150;
            const headerHeight = 60;

            const minX = -(this.container.offsetWidth - minVisible);
            const maxX = window.innerWidth - minVisible;
            const minY = 0;
            const maxY = window.innerHeight - headerHeight;

            x = Math.max(minX, Math.min(maxX, x));
            y = Math.max(minY, Math.min(maxY, y));

            this.container.style.left = x + 'px';
            this.container.style.top = y + 'px';
            this.position = { x, y };
        }

        // ===== 显示/隐藏 =====
        show(options = {}) {
            if (!this.container) {
                this.createContainer();
            }

            if (options.code !== undefined && this.panel) {
                this.panel.setCode(options.code);
            }
            if (options.language && this.panel) {
                this.panel.setLanguage(options.language);
                this.language = options.language;
            }

            this.container.classList.add('visible');
            this.isVisible = true;

            // 默认位置：右侧
            if (this.position.x === null) {
                this.position.x = window.innerWidth - this.size.width - 20;
                this.position.y = 100;
            }
            this.applyState();

            if (this.panel) {
                setTimeout(() => {
                    this.panel.refresh();
                    // 自动执行代码
                    this.panel.run();
                }, 50);
            }
        }

        hide() {
            if (this.container) {
                this.container.classList.remove('visible');
            }
            this.isVisible = false;
            this.saveState();
        }

        // ===== 状态持久化 =====
        applyState() {
            if (!this.container) return;

            this.container.style.width = this.size.width + 'px';
            this.container.style.height = this.size.height + 'px';
            this.container.style.left = this.position.x + 'px';
            this.container.style.top = this.position.y + 'px';
        }

        async saveState() {
            try {
                const state = {
                    position: this.position,
                    size: this.size,
                    language: this.language
                };
                await chrome.storage.local.set({ [CONFIG.storageKey]: state });
            } catch (e) {
                // ignore
            }
        }

        async loadState() {
            try {
                const result = await chrome.storage.local.get(CONFIG.storageKey);
                const state = result?.[CONFIG.storageKey];
                if (state) {
                    if (state.position) this.position = state.position;
                    if (state.size) this.size = state.size;
                    if (state.language) {
                        this.language = state.language;
                        if (this.panel) {
                            this.panel.setLanguage(this.language);
                        }
                    }
                    this.applyState();
                }
            } catch (e) {
                // ignore
            }
        }
    }

    // 导出（兼容旧名称）
    if (typeof window !== 'undefined') {
        window.FloatingRunnerContainer = FloatingRunnerContainer;
        window.FloatingRunnerPanel = FloatingRunnerContainer; // 兼容旧代码
    }

})();
