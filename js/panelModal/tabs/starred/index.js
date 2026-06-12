/**
 * Starred Tab - 收藏列表（支持2级文件夹）
 *
 * 树渲染 + 交互 + 导航均委托给 StarredTreeRenderer（共享）。
 * 本类只负责：容器/工具栏、搜索框、BaseTab 生命周期。
 */

class StarredTab extends BaseTab {
    constructor() {
        super();
        this.id = 'starred';
        this.name = chrome.i18n.getMessage('vnkxpm');
        this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>`;

        this.folderManager = new FolderManager(StorageAdapter);

        this.toastColor = {
            light: { backgroundColor: '#0d0d0d', textColor: '#ffffff', borderColor: '#262626' },
            dark: { backgroundColor: '#ffffff', textColor: '#1f2937', borderColor: '#d1d5db' }
        };

        this.treeRenderer = new StarredTreeRenderer({
            scene: 'tab',
            showSearch: true,
            showPlatformIcon: true,
            emptyClass: 'timeline-starred-empty',
            toastOptions: { color: this.toastColor },
            folderManager: this.folderManager,
            getSearchQuery: () => this.getState('searchQuery'),
            getFolderStates: () => this.getPersistentState('folderStates'),
            setFolderStates: (s) => this.setPersistentState('folderStates', s),
            getListContainer: () => this.getDomRef('listContainer'),
            onAfterAction: () => this.updateList(),
            onAfterNavigate: () => { if (window.panelModal) window.panelModal.hide(); },
        });
    }

    getInitialState() {
        return {
            transient: { searchQuery: '' },
            persistent: { folderStates: {} }
        };
    }

    // ==================== 渲染 ====================

    render() {
        const container = document.createElement('div');
        container.className = 'starred-tab-container';

        const toolbar = document.createElement('div');
        toolbar.className = 'starred-toolbar';

        const addFolderBtn = document.createElement('button');
        addFolderBtn.className = 'starred-toolbar-btn';
        addFolderBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                <line x1="12" y1="11" x2="12" y2="17"/>
                <line x1="9" y1="14" x2="15" y2="14"/>
            </svg>
        `;
        this.addEventListener(addFolderBtn, 'mouseenter', () => {
            window.globalTooltipManager.show(
                'add-folder-btn', 'button', addFolderBtn,
                chrome.i18n.getMessage('kxvpmz'),
                { placement: 'top' }
            );
        });
        this.addEventListener(addFolderBtn, 'mouseleave', () => { window.globalTooltipManager.hide(); });
        this.addEventListener(addFolderBtn, 'click', () => this.treeRenderer.handleCreateFolder());
        toolbar.appendChild(addFolderBtn);

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'starred-toolbar-search';
        searchInput.placeholder = chrome.i18n.getMessage('mvkzpx');
        searchInput.autocomplete = 'off';
        searchInput.value = '';

        this.addEventListener(searchInput, 'input', (e) => {
            this.setState('searchQuery', e.target.value.trim().toLowerCase());
            this.updateList();
        });
        this.addEventListener(searchInput, 'keydown', (e) => {
            if (e.key === 'Escape') {
                const input = this.getDomRef('searchInput');
                if (input) input.value = '';
                this.setState('searchQuery', '');
                this.updateList();
            }
        });
        this.setDomRef('searchInput', searchInput);
        toolbar.appendChild(searchInput);

        container.appendChild(toolbar);

        const listContainer = document.createElement('div');
        listContainer.className = 'starred-list-tree';
        this.setDomRef('listContainer', listContainer);
        container.appendChild(listContainer);

        return container;
    }

    // ==================== 生命周期 ====================

    async mounted() {
        super.mounted();
        await this.updateList();
        this.addStorageListener(async () => {
            if (window.panelModal && window.panelModal.currentTabId === 'starred') {
                await this.updateList();
            }
        });
    }

    unmounted() {
        super.unmounted();
    }

    // ==================== 数据 → 渲染 ====================

    async updateList() {
        const tree = await this.folderManager.getStarredByFolder();
        this.treeRenderer.renderTree(tree);
    }

}
