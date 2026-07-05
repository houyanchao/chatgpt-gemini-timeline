#!/usr/bin/env node

/**
 * Firefox Build Script
 *
 * 从 Chrome 版 manifest.json 自动生成 Firefox 兼容版本并打包。
 *
 * 转换规则：
 *   1. background.service_worker → background.scripts[]
 *   2. 添加 browser_specific_settings.gecko.id
 *   3. 移除 oauth2（Firefox 不支持，认证走 launchWebAuthFlow）
 *   4. 移除 sandbox（Firefox 不支持，Runner 内部做降级处理）
 *   5. 移除 content_security_policy.sandbox
 *   6. permissions 中移除 identity（Firefox 用 browser.identity 无需声明）
 *
 * 用法：
 *   node scripts/build-firefox.js
 *   node scripts/build-firefox.js --gecko-id=your-addon@id
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');
const FIREFOX_MANIFEST_PATH = path.join(ROOT, 'manifest.firefox.json');
const DEFAULT_GECKO_ID = 'ai-timeline@timeline4ai.com';

function parseArgs() {
    const args = {};
    process.argv.slice(2).forEach(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        args[key] = value || true;
    });
    return args;
}

function generateFirefoxManifest(geckoId) {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));

    // 1. background: service_worker → scripts
    if (manifest.background?.service_worker) {
        manifest.background = {
            scripts: [manifest.background.service_worker]
        };
    }

    // 2. 添加 gecko ID + 数据收集声明
    manifest.browser_specific_settings = {
        gecko: {
            id: geckoId,
            strict_min_version: '109.0',
            data_collection_permissions: {
                required: ['none'],
                optional: ['technicalAndInteraction']
            }
        }
    };

    // 3. 移除 Chrome 专有字段
    delete manifest.oauth2;
    delete manifest.sandbox;

    // 4. 移除 sandbox CSP（Firefox 不支持 sandbox，也不允许 extension_pages 中使用 unsafe-eval）
    delete manifest.content_security_policy;

    // 5. 保留 identity 权限（Firefox 需要 identity 权限来使用 launchWebAuthFlow）

    return manifest;
}

function build() {
    const args = parseArgs();
    const geckoId = args['gecko-id'] || DEFAULT_GECKO_ID;
    const version = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')).version;
    const zipName = `AIChatTimeline-v${version}-firefox.zip`;
    const zipPath = path.join(ROOT, zipName);


    // 生成 Firefox manifest
    const firefoxManifest = generateFirefoxManifest(geckoId);
    fs.writeFileSync(FIREFOX_MANIFEST_PATH, JSON.stringify(firefoxManifest, null, 2) + '\n');

    // 临时替换 manifest.json
    const originalManifest = fs.readFileSync(MANIFEST_PATH, 'utf-8');
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(firefoxManifest, null, 2) + '\n');

    try {
        // 打包
        if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

        execSync(`zip -r "${zipName}" . ` +
            `-x ".git/*" ` +
            `-x ".gitignore" ` +
            `-x "node_modules/*" ` +
            `-x ".DS_Store" ` +
            `-x "*/.DS_Store" ` +
            `-x "*.md" ` +
            `-x ".cursor/*" ` +
            `-x "*.zip" ` +
            `-x "__MACOSX/*" ` +
            `-x "scripts/*" ` +
            `-x "web/*" ` +
            `-x "manifest.firefox.json"`,
            { cwd: ROOT, stdio: 'pipe' }
        );

        const stats = fs.statSync(zipPath);
        const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
    } finally {
        // 恢复原始 manifest.json
        fs.writeFileSync(MANIFEST_PATH, originalManifest);
    }

    // 清理临时文件
    if (fs.existsSync(FIREFOX_MANIFEST_PATH)) fs.unlinkSync(FIREFOX_MANIFEST_PATH);

}

build();
