/**
 * MathJax v3 配置（对话导出专用，运行在扩展的隔离世界）。
 *
 * 必须在 mathjax-tex-svg.js 之前加载。
 * - startup.typeset:false —— 绝不自动排版宿主页面，仅按需调用 tex2svg
 * - svg.fontCache:'none'  —— 每个输出 SVG 自包含（内联字形路径），
 *   便于光栅化到 canvas，不依赖外部引用、也不会污染画布
 *
 * 说明：内容脚本处于隔离世界，此处的 window.MathJax 与页面自身的 MathJax 互不影响。
 */
window.MathJax = {
    loader: {
        // The combined build registers its bundled components before startup.
        // Refuse all other loads so MathJax cannot insert a script into the host page.
        require() {
            throw new Error('MathJax component is not bundled');
        },
    },
    startup: { typeset: false },
    tex: { packages: { '[-]': ['autoload', 'require', 'noundefined'] } },
    svg: { fontCache: 'none' },
};
