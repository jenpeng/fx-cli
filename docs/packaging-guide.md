# fx-cli 打包和发布指南

本文档介绍如何将 fx-cli 项目打包和发布，以便用户可以安装和使用。

## 打包方式

### 1. 本地打包（开发测试）

使用 `npm pack` 命令可以创建一个 .tgz 包，用于本地测试：

```bash
# 在项目根目录执行
npm run pack
```

这将在当前目录生成一个 `fx-cli-1.0.0.tgz` 文件。

**实际执行示例**：
```bash
$ cd /Users/jenpeng/Downloads/fx-devtools/fx-cli
$ npm pack
npm notice 
npm notice 📦 fx-cli@1.0.0
npm notice === Tarball Contents ===
npm notice 1.2kB  bin/fx-cli.js
npm notice 6.9kB  docs/api-reference.md
npm notice 2.2kB  docs/implementation.md
npm notice 1.9kB  docs/new-parameter-issues-and-solutions.md
npm notice 4.1kB  docs/packaging-guide.md
npm notice 5.2kB  docs/pull-token-warning-fix-documentation.md
npm notice 10.3kB docs/push-all-implementation.md
npm notice 18.5kB docs/push-class-implementation.md
npm notice 10.1kB docs/push-component-guide.md
npm notice 8.6kB  docs/push-component-implementation.md
npm notice 9.6kB  docs/push-function-implementation.md
npm notice 7.6kB  docs/push-plugin-guide.md
npm notice 16.6kB docs/quickstart.md
npm notice 1.5kB  package.json
npm notice 10.0kB src/commands/auth.js
... (更多文件)
npm notice 
npm notice 📦 fx-cli@1.0.0
npm notice === Tarball Details ===
npm notice name:          fx-cli
npm notice version:       1.0.0
npm notice filename:      fx-cli-1.0.0.tgz
npm notice package size:  132.1 kB
npm notice unpacked size: 577.7 kB
npm notice shasum:        b6cc6022263297d6d57fc94ee0cd84771e6f2cc5
npm notice integrity:     sha512-B24MZ5YTP9MoZ[...]0M84PBGqMdhPg==
npm notice total files:   43
npm notice 
fx-cli-1.0.0.tgz
```

生成的文件大小约为 132KB，包含 43 个文件，解压后大小约为 578KB。

### 2. 本地安装测试

打包完成后，可以在本地安装测试：

```bash
# 全局安装本地包
npm run publish:local

# 或者手动安装
npm install -g ./fx-cli-1.0.0.tgz
```

安装完成后，可以测试命令是否正常工作：

```bash
fx-cli --version
fx-cli --help
```

**实际执行示例**：
```bash
$ npm run publish:local

> fx-cli@1.0.0 publish:local
> npm install -g .

up to date in 285ms

$ fx-cli --version
2025-12-29T03:04:31.518Z [INFO] fx-cli v1.0.0 启动
2025-12-29T03:04:31.657Z [DEBUG] 开始注册命令
2025-12-29T03:04:31.658Z [DEBUG] 所有命令注册完成
1.0.0

$ fx-cli --help
2025-12-29T03:04:34.741Z [INFO] fx-cli v1.0.0 启动
2025-12-29T03:04:34.812Z [DEBUG] 开始注册命令
2025-12-29T03:04:34.813Z [DEBUG] 所有命令注册完成
Usage: fx-cli [options] [command]

Options:
  -v, --version                   显示版本号
  -h, --help                      display help for command

Commands:
  auth [options]                  登录或管理认证状态和配置
  init [options] [project-name]   初始化项目（不指定项目名则在当前目录初始化）
  create [options] [type] [name]  创建组件/插件/函数/类
  pull [options] [name]           拉取代码
  push [options] [name]           推送代码
  deploy [options] [name]         推送并部署
  jenkins|j                       Jenkins流水线部署相关命令
  jenkins                         Jenkins集成相关命令
  config [options]                配置CLI工具
  help                            显示帮助信息
```

### 3. 发布到 npm

如果要将包发布到 npm，需要先确保已登录 npm：

```bash
# 登录 npm（如果尚未登录）
npm login

# 发布到 npm
npm run publish:npm
```

## 版本管理

### 版本号规则

fx-cli 遵循语义化版本控制 (SemVer) 规范：

- **主版本号 (Major)**：不兼容的 API 修改
- **次版本号 (Minor)**：向下兼容的功能性新增
- **修订号 (Patch)**：向下兼容的问题修正

### 版本更新命令

```bash
# 更新修订号（1.0.0 -> 1.0.1）
npm run version:patch

# 更新次版本号（1.0.0 -> 1.1.0）
npm run version:minor

# 更新主版本号（1.0.0 -> 2.0.0）
npm run version:major
```

## 发布流程

### 准备工作

1. 确保代码已提交到版本控制系统
2. 运行测试确保所有功能正常
3. 更新 CHANGELOG.md 记录变更内容

### 发布步骤

1. 更新版本号：
   ```bash
   npm run version:patch  # 或 version:minor/version:major
   ```

2. 打包测试：
   ```bash
   npm run pack
   npm run publish:local  # 本地测试
   ```

3. 发布到 npm：
   ```bash
   npm run publish:npm
   ```

## 打包内容

package.json 中的 `files` 字段指定了哪些文件和目录会被包含在发布的包中：

```json
"files": [
  "bin/",
  "src/",
  "docs/",
  "templates/",
  "README.md",
  "LICENSE"
]
```

## 注意事项

1. **依赖管理**：
   - 确保所有必要的依赖都在 `dependencies` 中
   - 开发依赖放在 `devDependencies` 中

2. **Node.js 版本**：
   - 项目要求 Node.js >= 14.0.0
   - 在 `engines` 字段中明确指定

3. **文件权限**：
   - 确保 `bin/fx-cli.js` 有执行权限
   - 在 Windows 上可能需要额外处理

4. **测试**：
   - 发布前务必在干净环境中测试安装和使用
   - 测试不同操作系统和 Node.js 版本的兼容性

5. **ESLint 配置**：
   - 项目包含 `.eslintrc.js` 配置文件
   - 可以使用 `npm run lint:fix` 自动修复大部分代码风格问题

## 其他分发方式

### 1. 二进制分发

对于需要独立二进制文件的场景，可以使用以下工具：

- **pkg**：将 Node.js 应用打包为可执行文件
- **nexe**：创建单个可执行文件
- **electron**：创建跨平台桌面应用

示例使用 pkg：

```bash
# 安装 pkg
npm install --save-dev pkg

# 添加打包脚本
"scripts": {
  "binary": "pkg bin/fx-cli.js --out-path dist/"
}

# 执行打包
npm run binary
```

### 2. Docker 镜像

创建 Dockerfile：

```dockerfile
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

RUN npm link

CMD ["fx-cli"]
```

构建和运行：

```bash
# 构建镜像
docker build -t fx-cli .

# 运行容器
docker run -it --rm fx-cli --help
```

## 故障排除

### 常见问题

1. **权限错误**：
   ```bash
   chmod +x bin/fx-cli.js
   ```

2. **路径问题**：
   - 确保 `bin` 字段正确指向入口文件
   - 检查文件路径是否正确

3. **依赖问题**：
   ```bash
   npm ci  # 清理并重新安装依赖
   ```

4. **发布失败**：
   - 检查包名是否已被占用
   - 确认 npm 登录状态
   - 检查网络连接

5. **ESLint 错误**：
   - 使用 `npm run lint:fix` 自动修复大部分问题
   - 手动修复剩余问题

### 调试技巧

1. 使用 `npm ls` 检查依赖关系
2. 使用 `npm explain <package>` 了解特定包的安装原因
3. 使用 `npm audit` 检查安全漏洞
4. 查看 `.npmignore` 确保不需要的文件被排除

## 参考资源

- [npm 官方文档](https://docs.npmjs.com/)
- [语义化版本控制](https://semver.org/)
- [Node.js 打包最佳实践](https://nodejs.dev/learn/an-introduction-to-the-npm-package-manager)