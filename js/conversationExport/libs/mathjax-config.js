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
    startup: { typeset: false },
    svg: { fontCache: 'none' },
};
