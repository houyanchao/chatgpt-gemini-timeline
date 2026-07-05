/**
 * Global Dropdown Manager - 全局下拉菜单统一管理器
 * 
 * 负责管理整个扩展的所有下拉菜单
 * 
 * 特性：
 * - 全局单例模式
 * - 智能定位（自动调整位置避免超出视口）
 * - 点击外部自动关闭
 * - 支持图标、分割线、禁用状态
 * - DOM 自动清理
 * - ✨ 组件自治：URL 变化时自动清理
 */

class GlobalDropdownManager {
    constructor(options = {}) {
        // 状态管理
        this.state = {
            currentId: null,
            isVisible: false,
            triggerElement: null,
            currentUrl: location.href,
            activeSubmenus: []       // ✨ 修改：支持多层级子菜单（数组）
        };
        
        // DOM 实例
        this.dropdown = null;
        this.overlay = null;
        
        // 配置
        this.config = {
            debug: options.debug || false,
            defaultWidth: 200,
            defaultPosition: 'bottom-left',
            gap: 8,
            padding: 8
        };
        
        // 定时器管理
        this.timers = {
            hideAnimation: null,
            submenuHide: null        // ✨ 新增：子菜单延迟关闭定时器
        };
        
        // 绑定方法
        this._boundHandleClick = this._handleGlobalClick.bind(this);
        this._boundHandleUrlChange = this._handleUrlChange.bind(this);
        this._boundHandleResize = this._handleResize.bind(this);
        this._boundHandleScroll = this._handleScroll.bind(this);
        
        // 初始化
        this._setupGlobalListeners();
        this._attachUrlListeners();
        
        this._log('Dropdown manager initialized');
    }
    
    /**
     * 显示下拉菜单
     * @param {Object} options - 配置选项
     * @param {HTMLElement} options.trigger - 触发元素（用于定位）
     * @param {Array} options.items - 选项数组
     * @param {Function} options.onSelect - 选择回调
     * @param {string} options.position - 位置：bottom-left/bottom-right/top-left/top-right
     * @param {number} options.width - 宽度
     * @param {string} options.className - 自定义样式类
     * @param {string} options.id - 唯一标识
     */
    show(options = {}) {
        try {
            // 参数校验
            if (!this._validateParams(options)) {
                return;
            }
            
            const {
                trigger,
                items,
                onSelect,
                position = this.config.defaultPosition,
                width = this.config.defaultWidth,
                className = '',
                id = `dropdown-${Date.now()}`
            } = options;
            
            // 如果已经显示同一个下拉菜单，忽略
            if (this.state.isVisible && this.state.currentId === id) {
                this._log('Same dropdown already visible, ignoring');
                return;
            }
            
            // 先立即隐藏当前显示的下拉菜单（跳过动画，快速切换）
            this.hide(true);
            
            // 创建下拉菜单
            this._createDropdown(trigger, items, {
                onSelect,
                position,
                width,
                className,
                id
            });
            
            // 更新状态
            this.state.currentId = id;
            this.state.isVisible = true;
            this.state.triggerElement = trigger;
            
            this._log('Dropdown shown:', { id, position, items });
            
        } catch (error) {
            this.hide();
        }
    }
    
    /**
     * 隐藏下拉菜单
     * @param {boolean} immediate - 是否立即隐藏（跳过动画）
     */
    hide(immediate = false) {
        if (!this.state.isVisible) return;
        
        this._log('Hiding dropdown');
        
        // ✨ 清理子菜单
        this._hideAllSubmenus(true);
        if (this.timers.submenuHide) {
            clearTimeout(this.timers.submenuHide);
            this.timers.submenuHide = null;
        }
        
        // 清除之前的动画定时器
        if (this.timers.hideAnimation) {
            clearTimeout(this.timers.hideAnimation);
            this.timers.hideAnimation = null;
        }
        
        if (immediate) {
            // 立即移除 DOM
            this._removeDropdownDOM();
        } else {
            // 先播放退出动画
            if (this.dropdown) {
                this.dropdown.classList.remove('visible');
            }
            
            // 等待动画完成后移除 DOM
            this.timers.hideAnimation = setTimeout(() => {
                this.timers.hideAnimation = null;
                this._removeDropdownDOM();
            }, 150); // 与 CSS transition 时间一致
        }
        
        // 重置状态
        this.state.currentId = null;
        this.state.isVisible = false;
        this.state.triggerElement = null;
    }
    
    /**
     * 移除下拉菜单 DOM
     */
    _removeDropdownDOM() {
        if (this.dropdown && this.dropdown.parentNode) {
            this.dropdown.parentNode.removeChild(this.dropdown);
        }
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
        
        // 清空引用
        this.dropdown = null;
        this.overlay = null;
    }
    
    /**
     * 强制隐藏所有下拉菜单
     */
    forceHideAll() {
        this._log('Force hide all dropdowns');
        
        // 清除所有定时器
        this._clearAllTimers();
        
        // 立即隐藏（跳过动画）
        this.hide(true);
        
        // 清理可能残留的 dropdown
        document.querySelectorAll('.global-dropdown, .global-dropdown-overlay').forEach(el => {
            if (el.parentNode) {
                el.parentNode.removeChild(el);
            }
        });
    }
    
    /**
     * 销毁管理器
     */
    destroy() {
        this._log('Destroying dropdown manager');
        this.forceHideAll();
        this._removeGlobalListeners();
        this._detachUrlListeners();
    }
    
    // ==================== 内部方法 ====================
    
    /**
     * 创建下拉菜单
     */
    _createDropdown(trigger, items, config) {
        // 创建遮罩层（用于阻止点击其他元素）
        this.overlay = document.createElement('div');
        this.overlay.className = 'global-dropdown-overlay';
        
        // ✨ 遮罩层的鼠标事件（处理间隙中的鼠标移动）
        this.overlay.addEventListener('mouseleave', (e) => {
            const relatedTarget = e.relatedTarget;
            
            // 如果移动到子菜单，保持显示
            const isMovingToSubmenu = relatedTarget && 
                                     (relatedTarget.classList?.contains('global-dropdown-submenu') ||
                                      relatedTarget.closest('.global-dropdown-submenu'));
            
            if (isMovingToSubmenu) {
                return;
            }
            
            // 如果移动到主菜单，保持显示
            const isMovingToMainMenu = relatedTarget && 
                                      relatedTarget.closest('.global-dropdown:not(.global-dropdown-submenu)');
            
            if (isMovingToMainMenu) {
                return;
            }
            
            // 移出菜单区域，关闭子菜单
            this._hideAllSubmenus(true);
        });
        
        document.body.appendChild(this.overlay);
        
        // 创建下拉菜单容器
        this.dropdown = document.createElement('div');
        this.dropdown.className = `global-dropdown ${config.className}`;
        this.dropdown.style.width = `${config.width}px`;
        
        // 添加选项
        items.forEach((item, index) => {
            if (item.type === 'divider') {
                // 分割线
                const divider = document.createElement('div');
                divider.className = 'global-dropdown-divider';
                this.dropdown.appendChild(divider);
            } else {
                // 选项项
                const itemEl = this._createDropdownItem(item, config.onSelect);
                this.dropdown.appendChild(itemEl);
            }
        });
        
        // 添加到 body
        document.body.appendChild(this.dropdown);
        
        // 计算位置
        const position = this._calculatePosition(trigger, this.dropdown, config.position);
        this.dropdown.style.left = `${position.left}px`;
        this.dropdown.style.top = `${position.top}px`;
        
        // 设置 placement 属性（用于箭头样式）
        this.dropdown.setAttribute('data-placement', position.placement);
        
        // ✨ 主菜单的鼠标事件
        this.dropdown.addEventListener('mouseleave', (e) => {
            
            // 检查是否移动到子菜单或遮罩层（间隙）
            const relatedTarget = e.relatedTarget;
            
            // 移动到子菜单，保持显示
            const isMovingToSubmenu = relatedTarget && 
                                     (relatedTarget.classList?.contains('global-dropdown-submenu') ||
                                      relatedTarget.closest('.global-dropdown-submenu'));
            
            // 移动到遮罩层（可能在间隙中），暂时保持显示
            const isMovingToOverlay = relatedTarget && 
                                     relatedTarget.classList?.contains('global-dropdown-overlay');
            
            if (isMovingToSubmenu || isMovingToOverlay) {
                return;
            }
            
            // 移出主菜单区域，关闭所有子菜单
            this._hideAllSubmenus(true);
        });
        
        // 显示动画
        requestAnimationFrame(() => {
            this.dropdown.classList.add('visible');
        });
    }
    
    /**
     * 创建下拉菜单选项
     * @param {Object} item - 菜单项数据
     * @param {Function} onSelect - 选择回调
     * @param {number} level - 菜单层级（0=主菜单，1=二级，2=三级，默认 0）
     */
    _createDropdownItem(item, onSelect, level = 0) {
        const itemEl = document.createElement('div');
        itemEl.className = 'global-dropdown-item';
        
        // 禁用状态
        if (item.disabled) {
            itemEl.classList.add('disabled');
        }
        
        // 自定义样式类
        if (item.className) {
            itemEl.classList.add(item.className);
        }
        
        // ✨ 检测是否有子菜单
        const hasSubmenu = item.children && Array.isArray(item.children) && item.children.length > 0;
        if (hasSubmenu) {
            itemEl.classList.add('has-submenu');
        }
        
        // 图标
        if (item.icon) {
            const icon = document.createElement('span');
            icon.className = 'global-dropdown-item-icon';
            // 支持 HTML 格式的图标（如 SVG）
            if (typeof item.icon === 'string' && item.icon.trim().startsWith('<')) {
                icon.innerHTML = item.icon;
            } else {
                icon.textContent = item.icon;
            }
            itemEl.appendChild(icon);
        }
        
        // 文本
        const label = document.createElement('span');
        label.className = 'global-dropdown-item-label';
        label.textContent = item.label;
        itemEl.appendChild(label);
        
        // ✨ 子菜单箭头指示器
        if (hasSubmenu) {
            const arrow = document.createElement('span');
            arrow.className = 'global-dropdown-item-arrow';
            arrow.textContent = '›';
            itemEl.appendChild(arrow);
        }
        
        // ✨ 菜单项 hover 事件
        if (!item.disabled) {
            itemEl.addEventListener('mouseenter', (e) => {
                if (hasSubmenu) {
                    // 有子菜单：显示子菜单
                    this._showSubmenu(item, itemEl, level);
                } else {
                    // 没有子菜单：关闭比当前层级更深的子菜单
                    this._hideSubmenusFromLevel(level + 1);
                }
            });
        }
        
        // 点击事件（即使有子菜单也可以点击）
        if (!item.disabled) {
            itemEl.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // 触发 item 自己的回调
                if (item.onClick && typeof item.onClick === 'function') {
                    item.onClick(item);
                }
                
                // 触发全局回调
                if (onSelect && typeof onSelect === 'function') {
                    onSelect(item);
                }
                
                // 关闭下拉菜单（包括子菜单）
                this.hide();
            });
        }
        
        return itemEl;
    }
    
    /**
     * 计算下拉菜单位置
     */
    _calculatePosition(trigger, dropdown, preferredPosition) {
        const triggerRect = trigger.getBoundingClientRect();
        const dropdownRect = dropdown.getBoundingClientRect();
        const viewport = {
            width: window.innerWidth,
            height: window.innerHeight
        };
        
        const gap = this.config.gap;
        const padding = this.config.padding;
        
        let left, top, placement;
        
        // 根据首选位置计算
        switch (preferredPosition) {
            case 'bottom-left':
                left = triggerRect.left;
                top = triggerRect.bottom + gap;
                placement = 'bottom-left';
                break;
            case 'bottom-right':
                left = triggerRect.right - dropdownRect.width;
                top = triggerRect.bottom + gap;
                placement = 'bottom-right';
                break;
            case 'top-left':
                left = triggerRect.left;
                top = triggerRect.top - dropdownRect.height - gap;
                placement = 'top-left';
                break;
            case 'top-right':
                left = triggerRect.right - dropdownRect.width;
                top = triggerRect.top - dropdownRect.height - gap;
                placement = 'top-right';
                break;
            default:
                left = triggerRect.left;
                top = triggerRect.bottom + gap;
                placement = 'bottom-left';
        }
        
        // 边界检测 - 水平方向
        if (left < padding) {
            left = padding;
        } else if (left + dropdownRect.width > viewport.width - padding) {
            left = viewport.width - dropdownRect.width - padding;
        }
        
        // 边界检测 - 垂直方向
        // 如果下方空间不足，尝试放到上方
        if (top + dropdownRect.height > viewport.height - padding) {
            const topPosition = triggerRect.top - dropdownRect.height - gap;
            if (topPosition >= padding) {
                top = topPosition;
                placement = placement.replace('bottom', 'top');
            } else {
                // 上下都不够，只能调整到视口内
                top = viewport.height - dropdownRect.height - padding;
            }
        }
        
        // 如果上方空间不足，尝试放到下方
        if (top < padding) {
            const bottomPosition = triggerRect.bottom + gap;
            if (bottomPosition + dropdownRect.height <= viewport.height - padding) {
                top = bottomPosition;
                placement = placement.replace('top', 'bottom');
            } else {
                // 上下都不够，只能调整到视口内
                top = padding;
            }
        }
        
        return {
            left: Math.round(left),
            top: Math.round(top),
            placement
        };
    }
    
    /**
     * 参数校验
     */
    _validateParams(options) {
        if (!options.trigger || !(options.trigger instanceof HTMLElement)) {
            return false;
        }
        
        if (!options.trigger.isConnected) {
            // warn('[DropdownManager] Trigger not in DOM');
            return false;
        }
        
        if (!Array.isArray(options.items) || options.items.length === 0) {
            return false;
        }
        
        return true;
    }
    
    /**
     * 调试日志
     */
    _log(...args) {
        if (this.config.debug) {
        }
    }
    
    // ==================== 全局事件处理 ====================
    
    /**
     * 设置全局监听器
     */
    _setupGlobalListeners() {
        // 点击时隐藏（除非点击的是 dropdown 或 trigger）
        document.addEventListener('click', this._boundHandleClick, true);
        
        // 滚动时隐藏（capture 阶段，捕获所有滚动）
        document.addEventListener('scroll', this._boundHandleScroll, true);
        
        // 窗口大小改变时隐藏
        window.addEventListener('resize', this._boundHandleResize);
        
        this._log('Global listeners setup complete');
    }
    
    /**
     * 移除全局监听器
     */
    _removeGlobalListeners() {
        document.removeEventListener('click', this._boundHandleClick, true);
        document.removeEventListener('scroll', this._boundHandleScroll, true);
        window.removeEventListener('resize', this._boundHandleResize);
    }
    
    /**
     * 全局点击事件
     */
    _handleGlobalClick(e) {
        if (!this.state.isVisible) return;
        
        // 检查是否点击的是主菜单
        const clickedDropdown = this.dropdown && 
                                (e.target === this.dropdown || this.dropdown.contains(e.target));
        
        // ✨ 检查是否点击的是子菜单
        const clickedSubmenu = this.state.activeSubmenu &&
                               this.state.activeSubmenu.element &&
                               (e.target === this.state.activeSubmenu.element ||
                                this.state.activeSubmenu.element.contains(e.target));
        
        // 检查是否点击的是 trigger
        const clickedTrigger = this.state.triggerElement && 
                               (e.target === this.state.triggerElement || 
                                this.state.triggerElement.contains(e.target));
        
        if (clickedDropdown || clickedSubmenu) {
            // 点击了 dropdown 或子菜单内部，不做任何事（让 item 的点击事件处理）
            return;
        }
        
        if (clickedTrigger) {
            // 点击了 trigger，关闭下拉菜单（toggle 行为）
            this._log('Clicked trigger, closing dropdown');
            this.hide();
            return;
        }
        
        // 点击了外部区域，关闭下拉菜单
        this._log('Click outside dropdown, hiding');
        this.hide();
    }
    
    /**
     * 全局滚动事件
     */
    _handleScroll(e) {
        if (!this.state.isVisible) return;
        
        // 忽略来自 dropdown 内部的滚动
        if (this.dropdown && (e.target === this.dropdown || this.dropdown.contains(e.target))) {
            return;
        }
        
        // 忽略来自子菜单的滚动
        const isSubmenuScroll = this.state.activeSubmenus?.some(
            s => s.element && (e.target === s.element || s.element.contains(e.target))
        );
        if (isSubmenuScroll) {
            return;
        }
        
        this._log('External scroll detected, hiding dropdown');
            this.hide();
    }
    
    /**
     * 窗口大小改变事件
     */
    _handleResize() {
        if (this.state.isVisible) {
            this._log('Window resized, hiding dropdown');
            this.hide();
        }
    }
    
    /**
     * 清除所有定时器
     */
    _clearAllTimers() {
        Object.keys(this.timers).forEach(key => {
            if (this.timers[key] !== null && this.timers[key] !== undefined) {
                clearTimeout(this.timers[key]);
                this.timers[key] = null;
            }
        });
    }
    
    // ==================== 子菜单功能 ====================
    
    /**
     * 显示子菜单
     * @param {Object} item - 父菜单项数据
     * @param {HTMLElement} parentElement - 父菜单项元素
     * @param {number} level - 父菜单层级（0=主菜单，1=二级，2=三级）
     */
    _showSubmenu(item, parentElement, level = 0) {
        const submenuLevel = level + 1; // 子菜单的层级
        
        // ✨ 最大层级限制：3 级（0=主菜单, 1=二级, 2=三级）
        if (submenuLevel > 2) {
            return;
        }
        
        // 清除延迟关闭定时器
        if (this.timers.submenuHide) {
            clearTimeout(this.timers.submenuHide);
            this.timers.submenuHide = null;
        }
        
        // 检查是否已经显示同一个子菜单
        const existingSubmenu = this.state.activeSubmenus.find(
            s => s.level === submenuLevel && s.parentItem === item
        );
        if (existingSubmenu) {
            return;
        }
        
        // 移除同层级及更深层级的子菜单
        this._hideSubmenusFromLevel(submenuLevel);
        
        // 给父菜单项添加激活状态
        parentElement.classList.add('submenu-active');
        
        // 创建子菜单容器
        const submenu = document.createElement('div');
        submenu.className = 'global-dropdown global-dropdown-submenu';
        submenu.dataset.level = submenuLevel; // ✨ 标记子菜单层级
        
        // 子菜单的鼠标事件
        submenu.addEventListener('mouseleave', (e) => {
            
            const relatedTarget = e.relatedTarget;
            
            // 检查是否移到主菜单或父级子菜单
            const isMovingToMenu = relatedTarget && 
                                   relatedTarget.closest('.global-dropdown');
            
            if (isMovingToMenu) {
                // 移到其他菜单，检查层级
                const targetSubmenu = relatedTarget.closest('.global-dropdown-submenu');
                if (targetSubmenu) {
                    const targetLevel = parseInt(targetSubmenu.dataset.level);
                    if (targetLevel >= submenuLevel) {
                        // 移到同级或更深层级的子菜单，保持
                        return;
                    }
                } else {
                    // 移到主菜单，保持
                    return;
                }
            }
            
            // 移出菜单区域，关闭当前及更深层级
            this._hideSubmenusFromLevel(submenuLevel);
        });
        
        // 渲染子菜单项
        item.children.forEach(child => {
            if (child.type === 'divider') {
                const divider = document.createElement('div');
                divider.className = 'global-dropdown-divider';
                submenu.appendChild(divider);
            } else {
                // ✨ 传入子菜单层级
                const childItem = this._createDropdownItem(child, null, submenuLevel);
                submenu.appendChild(childItem);
            }
        });
        
        // 添加到 body
        document.body.appendChild(submenu);
        
        // 计算位置
        const position = this._calculateSubmenuPosition(parentElement, submenu);
        submenu.style.left = `${position.left}px`;
        submenu.style.top = `${position.top}px`;
        
        // ✨ 保存状态到数组
        this.state.activeSubmenus.push({
            level: submenuLevel,
            element: submenu,
            parentItem: item,
            parentElement: parentElement
        });
        
        // 显示动画
        requestAnimationFrame(() => {
            submenu.classList.add('visible');
        });
    }
    
    /**
     * 计算子菜单位置
     * @param {HTMLElement} parentElement - 父菜单项元素
     * @param {HTMLElement} submenu - 子菜单元素
     * @returns {Object} { left, top }
     */
    _calculateSubmenuPosition(parentElement, submenu) {
        const parentRect = parentElement.getBoundingClientRect();
        const submenuRect = submenu.getBoundingClientRect();
        const viewport = {
            width: window.innerWidth,
            height: window.innerHeight
        };
        
        const gap = 7; // 主菜单和子菜单之间的间隙
        let left, top;
        
        // 水平定位：优先显示在右侧
        if (parentRect.right + gap + submenuRect.width <= viewport.width - 10) {
            // 右侧有足够空间
            left = parentRect.right + gap;
        } else {
            // 右侧空间不足，显示在左侧
            left = parentRect.left - submenuRect.width - gap;
        }
        
        // 垂直定位：与父菜单项顶部对齐
        top = parentRect.top;
        
        // 检查下方是否超出视口
        if (top + submenuRect.height > viewport.height - 10) {
            // 向上调整
            top = viewport.height - submenuRect.height - 10;
        }
        
        // 确保不超出顶部
        top = Math.max(10, top);
        
        return { left, top };
    }
    
    /**
     * 延迟关闭子菜单
     */
    _scheduleSubmenuHide() {
        
        // 清除之前的定时器
        if (this.timers.submenuHide) {
            clearTimeout(this.timers.submenuHide);
        }
        
        // 300ms 后关闭子菜单（增加延迟，给用户更多时间移动鼠标）
        this.timers.submenuHide = setTimeout(() => {
            this._hideAllSubmenus();
            this.timers.submenuHide = null;
        }, 300);
    }
    
    /**
     * 关闭指定层级及更深层级的子菜单
     * @param {number} fromLevel - 从哪个层级开始关闭（包含该层级）
     */
    _hideSubmenusFromLevel(fromLevel) {
        if (!this.state.activeSubmenus || this.state.activeSubmenus.length === 0) {
            return;
        }
        
        
        // 找到需要关闭的子菜单
        const toClose = this.state.activeSubmenus.filter(s => s.level >= fromLevel);
        const toKeep = this.state.activeSubmenus.filter(s => s.level < fromLevel);
        
        // 关闭子菜单（添加淡出动画）
        toClose.forEach(submenu => {
            // 移除父元素激活状态
            if (submenu.parentElement) {
                submenu.parentElement.classList.remove('submenu-active');
            }
            
            // 先移除 visible 类（触发淡出动画）
            if (submenu.element) {
                submenu.element.classList.remove('visible');
                
                // 等待动画完成后移除元素
                setTimeout(() => {
                    if (submenu.element && submenu.element.parentNode) {
                        submenu.element.remove();
                    }
                }, 200); // 与 CSS transition 时间一致
            }
        });
        
        // 更新状态
        this.state.activeSubmenus = toKeep;
    }
    
    /**
     * 关闭所有子菜单
     * @param {boolean} immediate - 是否立即隐藏
     */
    _hideAllSubmenus(immediate = false) {
        if (!this.state.activeSubmenus || this.state.activeSubmenus.length === 0) {
            return;
        }
        
        this.state.activeSubmenus.forEach(submenu => {
            const element = submenu.element;
            const parentElement = submenu.parentElement;
            
            // 移除父菜单项的激活状态
            if (parentElement) {
                parentElement.classList.remove('submenu-active');
            }
            
            if (immediate) {
                // 立即移除
                if (element && element.parentNode) {
                    element.remove();
                }
            } else {
                // 播放退出动画
                element.classList.remove('visible');
                setTimeout(() => {
                    if (element && element.parentNode) {
                        element.remove();
                    }
                }, 150);
            }
        });
        
        // 清除状态
        this.state.activeSubmenus = [];
        
    }
    
    // ==================== URL 变化监听（组件自治）====================
    
    /**
     * 附加 URL 变化监听器
     */
    _attachUrlListeners() {
        try {
            window.addEventListener('url:change', this._boundHandleUrlChange);
            this._log('URL listeners attached');
        } catch (error) {
        }
    }
    
    /**
     * 移除 URL 变化监听器
     */
    _detachUrlListeners() {
        try {
            window.removeEventListener('url:change', this._boundHandleUrlChange);
            this._log('URL listeners detached');
        } catch (error) {
        }
    }
    
    /**
     * 处理 URL 变化
     */
    _handleUrlChange() {
        const newUrl = location.href;
        
        if (newUrl !== this.state.currentUrl) {
            this._log('URL changed, auto-hiding dropdown:', this.state.currentUrl, '->', newUrl);
            this.state.currentUrl = newUrl;
            
            if (this.state.isVisible) {
                this.forceHideAll();
            }
        }
    }
    
}

// ==================== 全局单例初始化 ====================

// 创建全局实例（只在第一次加载时）
if (typeof window.globalDropdownManager === 'undefined') {
    window.globalDropdownManager = new GlobalDropdownManager({
        debug: true  // 临时开启 debug，方便排查子菜单问题
    });
}

