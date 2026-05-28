/**
 * FormulaSourceParser - 公式源码解析器
 * 支持多种平台的公式格式，完全独立的提取逻辑
 * 
 * 支持的平台：
 * - ChatGPT (KaTeX + annotation)
 * - Gemini (KaTeX + data-math)
 * - DeepSeek (KaTeX + annotation)
 * - 豆包 (copy-text)
 * - Grok (KaTeX + annotation)
 * - 千问/Qwen (KaTeX MathML direct text + MathML)
 * - 维基百科 (MathML + annotation)
 * - MathJax (script[type="math/tex"])
 */

class FormulaSourceParser {
    /**
     * 从公式元素中解析 LaTeX 源码
     * 按优先级尝试多种方式，自动适配不同平台
     * 
     * @param {Element} formulaElement - 公式 DOM 元素
     * @returns {string|null} - LaTeX 源码，失败返回 null
     */
    static parseLatex(formulaElement) {
        if (!formulaElement) {
            return null;
        }

        // 方法1: 豆包格式 - copy-text 属性（当前元素）
        if (formulaElement.hasAttribute('copy-text')) {
            return FormulaSourceParser._stripMathDelimiters(formulaElement.getAttribute('copy-text').trim());
        }

        // 方法2: 豆包格式 - 向上查找 .math-inline 父元素
        let mathInlineParent = formulaElement.closest('.math-inline');
        if (mathInlineParent && mathInlineParent.hasAttribute('copy-text')) {
            return FormulaSourceParser._stripMathDelimiters(mathInlineParent.getAttribute('copy-text').trim());
        }

        // 方法3: 豆包格式 - copy-text 属性（子元素）
        const doubaoChild = formulaElement.querySelector('[copy-text]');
        if (doubaoChild) {
            return FormulaSourceParser._stripMathDelimiters(doubaoChild.getAttribute('copy-text').trim());
        }

        // 方法4: 当前元素的 data-math 属性
        if (formulaElement.hasAttribute('data-math')) {
            return formulaElement.getAttribute('data-math').trim();
        }

        // 方法5: Gemini 格式 - 从祖先元素的 data-math 属性获取
        let parent = formulaElement.parentElement;
        while (parent) {
            if (parent.hasAttribute('data-math')) {
                return parent.getAttribute('data-math').trim();
            }
            parent = parent.parentElement;
            if (!parent || parent === document.body) break;
        }

        // 方法6: 千问/Qwen 格式 - 从 .qwen-markdown-latex .katex-mathml math 的直接文本节点获取
        const qwenLatexRoot = formulaElement.closest('.qwen-markdown-latex');
        const qwenMath = qwenLatexRoot?.querySelector('.katex-mathml math');
        if (qwenLatexRoot && qwenMath) {
            const latex = Array.from(qwenMath.childNodes)
                .filter(node => node.nodeType === 3)
                .map(node => node.textContent)
                .join('')
                .trim();
            if (latex) return latex;
        }

        // 方法7: ChatGPT 格式 - 从 annotation 标签获取
        const annotation = formulaElement.querySelector('annotation[encoding="application/x-tex"]');
        if (annotation) {
            return annotation.textContent.trim();
        }

        // 方法8: 从 .katex-mathml 中的 annotation 获取
        const mathml = formulaElement.querySelector('.katex-mathml annotation');
        if (mathml) {
            return mathml.textContent.trim();
        }

        // 方法9: 维基百科格式 - mwe-math-element 中的 annotation
        let mweElement = formulaElement;
        if (!formulaElement.classList.contains('mwe-math-element')) {
            mweElement = formulaElement.closest('.mwe-math-element');
        }
        if (mweElement) {
            const wikiAnnotation = mweElement.querySelector('annotation');
            if (wikiAnnotation) {
                const latex = wikiAnnotation.textContent.trim();
                return latex || null;
            }
        }

        // 方法10: MathJax 格式 - 从兄弟 script 提取
        let nextSibling = formulaElement.nextElementSibling;
        if (nextSibling?.tagName === 'SCRIPT' && nextSibling.type?.startsWith('math/tex')) {
            return nextSibling.textContent.trim();
        }
        if (formulaElement.parentElement) {
            nextSibling = formulaElement.parentElement.nextElementSibling;
            if (nextSibling?.tagName === 'SCRIPT' && nextSibling.type?.startsWith('math/tex')) {
                return nextSibling.textContent.trim();
            }
        }

        // 方法11: 通用 data-latex 属性
        if (formulaElement.hasAttribute('data-latex')) {
            return formulaElement.getAttribute('data-latex').trim();
        }

        return null;
    }

    /**
     * 从公式元素中解析 MathML
     * 
     * 策略：
     * 1. 优先从 DOM 直接提取（零转换成本）
     * 2. 兜底：通过已提取的 LaTeX 经 temml 转换
     * 
     * @param {Element} formulaElement - 公式 DOM 元素
     * @returns {string|null} - MathML XML 字符串，失败返回 null
     */
    static parseMathML(formulaElement) {
        if (!formulaElement) return null;

        // ==================== 策略1: 从 DOM 直接提取 MathML ====================

        // 方法1: data-mathml 属性（MathJax 2.x SVG 输出）
        if (formulaElement.hasAttribute('data-mathml')) {
            const raw = formulaElement.getAttribute('data-mathml');
            if (raw) return raw;
        }

        // 方法2: .MJX_Assistive_MathML 中的 <math> 元素（MathJax 2.x 无障碍节点）
        const assistiveMath = formulaElement.querySelector('.MJX_Assistive_MathML math');
        if (assistiveMath) {
            return assistiveMath.outerHTML;
        }

        // 方法3: 千问/Qwen 格式 - 从 .qwen-markdown-latex .katex-mathml math 获取，移除混在 <math> 下的 LaTeX 文本
        const qwenMathmlRoot = formulaElement.closest('.qwen-markdown-latex');
        const qwenMath = qwenMathmlRoot?.querySelector('.katex-mathml math');
        if (qwenMathmlRoot && qwenMath) {
            const mathClone = qwenMath.cloneNode(true);
            Array.from(mathClone.childNodes)
                .filter(node => node.nodeType === 3)
                .forEach(node => node.remove());
            return mathClone.outerHTML;
        }

        // 方法4: 兄弟 script[type="math/mml"]（MathJax MathML 输入格式）
        const mmlScript = FormulaSourceParser._findMathMmlScript(formulaElement);
        if (mmlScript) {
            return mmlScript;
        }

        // ==================== 策略2: LaTeX → MathML 转换（兜底）====================

        const latexSource = formulaElement.getAttribute('data-latex-source');
        if (latexSource) {
            const generated = FormulaSourceParser.latexToMathML(latexSource);
            if (generated) return generated;
        }

        return null;
    }

    /**
     * 从兄弟元素中查找 math/mml script
     */
    static _findMathMmlScript(formulaElement) {
        let sibling = formulaElement.nextElementSibling;
        if (sibling?.tagName === 'SCRIPT' && sibling.type?.startsWith('math/mml')) {
            return sibling.textContent.trim();
        }
        sibling = formulaElement.previousElementSibling;
        if (sibling?.tagName === 'SCRIPT' && sibling.type?.startsWith('math/mml')) {
            return sibling.textContent.trim();
        }

        if (formulaElement.parentElement) {
            sibling = formulaElement.parentElement.nextElementSibling;
            if (sibling?.tagName === 'SCRIPT' && sibling.type?.startsWith('math/mml')) {
                return sibling.textContent.trim();
            }
            sibling = formulaElement.parentElement.previousElementSibling;
            if (sibling?.tagName === 'SCRIPT' && sibling.type?.startsWith('math/mml')) {
                return sibling.textContent.trim();
            }
        }

        return null;
    }

    /**
     * 剥离 LaTeX 数学分隔符：\(...\)  \[...\]  $$...$$  $...$
     */
    static _stripMathDelimiters(text) {
        if (!text) return text;
        if (text.startsWith('\\(') && text.endsWith('\\)')) {
            return text.slice(2, -2).trim();
        }
        if (text.startsWith('\\[') && text.endsWith('\\]')) {
            return text.slice(2, -2).trim();
        }
        if (text.startsWith('$$') && text.endsWith('$$') && text.length > 4) {
            return text.slice(2, -2).trim();
        }
        if (text.startsWith('$') && text.endsWith('$') && text.length > 2) {
            return text.slice(1, -1).trim();
        }
        return text;
    }

    /**
     * 通过 temml 引擎将 LaTeX 公式转为 MathML 标记
     * @param {string} latex - LaTeX 源码
     * @returns {string|null} MathML 字符串，转换失败返回 null
     */
    static latexToMathML(latex) {
        if (!latex) return null;

        const engine = typeof temml !== 'undefined' ? temml : null;
        if (!engine?.renderToString) return null;

        try {
            const output = engine.renderToString(latex, {
                displayMode: false,
                xml: true,
                annotate: false,
                throwOnError: false,
                trust: false
            });
            return FormulaSourceParser.stripMathMLWrapper(output);
        } catch (e) {
            console.warn('[FormulaSourceParser] LaTeX → MathML conversion error:', e);
            return null;
        }
    }

    /**
     * 移除 MathML 中的 annotation 和 semantics 包装
     * TODO: 后续重新实现
     */
    static stripMathMLWrapper(mathml) {
        return mathml;
    }

    /**
     * 转换为 Word 兼容的 MathML
     * Word 要求所有 MathML 标签带 mml: 命名空间前缀才能识别为公式
     * 
     * @param {string} mathml - 标准 MathML 字符串
     * @returns {string} Word 兼容的 MathML 字符串
     */
    static prefixForWord(mathml) {
        if (!mathml) return mathml;

        const NAMESPACE = 'http://www.w3.org/1998/Math/MathML';
        const parser = new DOMParser();
        const doc = parser.parseFromString(mathml, 'application/xml');

        if (doc.querySelector('parsererror')) {
            return mathml;
        }

        const serialize = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                return node.textContent;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) {
                return '';
            }

            const isMathML = node.namespaceURI === NAMESPACE;
            const tagName = isMathML ? `mml:${node.localName}` : node.localName;

            let attrs = '';
            for (const attr of node.attributes) {
                if (attr.name === 'xmlns' || attr.name.startsWith('xmlns:')) continue;
                attrs += ` ${attr.name}="${attr.value}"`;
            }

            if (node.localName === 'math' && isMathML) {
                attrs += ` xmlns:mml="${NAMESPACE}"`;
            }

            const children = Array.from(node.childNodes).map(serialize).join('');
            return `<${tagName}${attrs}>${children}</${tagName}>`;
        };

        return serialize(doc.documentElement);
    }
}
