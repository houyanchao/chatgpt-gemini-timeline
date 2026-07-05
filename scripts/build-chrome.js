#!/usr/bin/env node

/**
 * Chrome Build Script
 *
 * 直接打包 Chrome 版扩展（manifest.json 已是 Chrome MV3 版本）。
 *
 * 排除：开发文件（.git / .DS_Store / .gitignore / scripts / web / *.md / *.zip / .cursor 等）
 *
 * 用法：
 *   node scripts/build-chrome.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');

function build() {
    const version = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')).version;
    const zipName = `AIChatTimeline-v${version}-chrome.zip`;
    const zipPath = path.join(ROOT, zipName);


    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

    execSync(`zip -r "${zipName}" . ` +
        `-x ".git/*" ` +
        `-x ".gitignore" ` +
        `-x "node_modules/*" ` +
        `-x ".DS_Store" ` +
        `-x "*/.DS_Store" ` +
        `-x "*.md" ` +
        `-x ".cursor/*" ` +
        `-x ".claude/*" ` +
        `-x "*.zip" ` +
        `-x "__MACOSX/*" ` +
        `-x "scripts/*" ` +
        `-x "web/*" ` +
        `-x "manifest.firefox.json" ` +
        `-x "READMEIMAGE/*"`,
        { cwd: ROOT, stdio: 'pipe' }
    );

    const stats = fs.statSync(zipPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
}

build();
