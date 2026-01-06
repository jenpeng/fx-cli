/**
 * GitHub推送服务
 * 负责将从GitHub仓库获取的各种资源推送到远程服务
 */

// 简化的日志记录器，只输出ERROR和WARN级别，保持进度条显示简洁
const logger = {
  info: () => {}, // 禁用INFO级别日志
  debug: () => {}, // 禁用DEBUG级别日志
  warn: (message) => console.warn(`[警告] ${message}`),
  error: (message) => console.error(`[错误] ${message}`),
  warning: (message) => console.warn(`[警告] ${message}`) // 兼容warning方法
};
const { pushComponentFromGitHub } = require('./githubPushComponentService');
const { pushPluginFromGitHub } = require('./githubPushPluginService');
const { pushFunctionFromGitHub } = require('./githubPushFunctionService');
const { pushClassFromGitHub } = require('./githubPushClassService');
const progressManager = require('../../utils/progressManager');

/**
 * GitHub推送服务类
 */
class GitHubPushService {
  constructor() {
    this.successCount = 0;
    this.failCount = 0;
    this.failedItems = [];
  }

  /**
   * 重置统计计数器
   */
  resetStats() {
    this.successCount = 0;
    this.failCount = 0;
    this.failedItems = [];
  }

  /**
   * 推送组件
   * @param {Object} component - 组件对象
   * @param {boolean} dryRun - 是否为模拟运行
   * @param {string} owner - 仓库所有者
   * @param {string} repo - 仓库名称
   * @param {string} branch - 分支名称
   * @param {string} targetDir - 目标目录
   * @returns {Promise<Object>} 推送结果
   */
  async pushComponent(component, dryRun = false, owner = '', repo = '', branch = 'main', targetDir = '') {
    try {
      const result = await pushComponentFromGitHub(component, dryRun, owner, repo, branch, targetDir);
      if (result.success) {
        this.successCount++;
      } else {
        this.failCount++;
        this.failedItems.push(`${result.name} (组件)`);
      }
      return result;
    } catch (error) {
      const componentName = component.metadata.name || component.fileName;
      logger.error(`推送组件失败: ${componentName}, 错误: ${error.message}`);
      this.failCount++;
      this.failedItems.push(`${componentName} (组件)`);
      return { name: componentName, success: false, error: error.message };
    }
  }

  /**
   * 推送插件
   * @param {Object} plugin - 插件对象
   * @param {boolean} dryRun - 是否为模拟运行
   * @param {string} owner - 仓库所有者
   * @param {string} repo - 仓库名称
   * @param {string} branch - 分支名称
   * @param {string} targetDir - 目标目录
   * @returns {Promise<Object>} 推送结果
   */
  async pushPlugin(plugin, dryRun = false, owner = '', repo = '', branch = 'main', targetDir = '') {
    try {
      const result = await pushPluginFromGitHub(plugin, owner, repo, branch, targetDir, dryRun);
      if (result.success) {
        this.successCount++;
      } else {
        this.failCount++;
        this.failedItems.push(`${result.name} (插件)`);
      }
      return result;
    } catch (error) {
      const pluginName = plugin.metadata.name || plugin.fileName;
      logger.error(`推送插件失败: ${pluginName}, 错误: ${error.message}`);
      this.failCount++;
      this.failedItems.push(`${pluginName} (插件)`);
      return { name: pluginName, success: false, error: error.message };
    }
  }

  /**
   * 推送函数
   * @param {Object} func - 函数对象
   * @param {boolean} dryRun - 是否为模拟运行
   * @param {string} owner - 仓库所有者
   * @param {string} repo - 仓库名称
   * @param {string} branch - 分支名称
   * @param {string} targetDir - 目标目录
   * @returns {Promise<Object>} 推送结果
   */
  async pushFunction(func, dryRun = false, owner = '', repo = '', branch = 'main', targetDir = '') {
    try {
      const result = await pushFunctionFromGitHub(func, dryRun, owner, repo, branch, targetDir);
      if (result.success) {
        this.successCount++;
      } else {
        this.failCount++;
        this.failedItems.push(`${result.name} (函数)`);
      }
      return result;
    } catch (error) {
      const functionName = func.metadata.name || func.fileName;
      logger.error(`推送函数失败: ${functionName}, 错误: ${error.message}`);
      this.failCount++;
      this.failedItems.push(`${functionName} (函数)`);
      return { name: functionName, success: false, error: error.message };
    }
  }

  /**
   * 推送类
   * @param {Object} cls - 类对象
   * @param {boolean} dryRun - 是否为模拟运行
   * @param {string} owner - 仓库所有者
   * @param {string} repo - 仓库名称
   * @param {string} branch - 分支名称
   * @param {string} targetDir - 目标目录
   * @returns {Promise<Object>} 推送结果
   */
  async pushClass(cls, dryRun = false, owner = '', repo = '', branch = 'main', targetDir = '') {
    try {
      const result = await pushClassFromGitHub(cls, dryRun, owner, repo, branch, targetDir);
      if (result.success) {
        this.successCount++;
      } else {
        this.failCount++;
        this.failedItems.push(`${result.name} (类)`);
      }
      return result;
    } catch (error) {
      const className = cls.metadata.name || cls.fileName;
      logger.error(`推送类失败: ${className}, 错误: ${error.message}`);
      this.failCount++;
      this.failedItems.push(`${className} (类)`);
      return { name: className, success: false, error: error.message };
    }
  }

  /**
   * 获取推送统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      successCount: this.successCount,
      failCount: this.failCount,
      failedItems: this.failedItems,
      totalCount: this.successCount + this.failCount
    };
  }

  /**
   * 从GitHub仓库推送代码到服务端
   * @param {string} repoUrl - GitHub仓库URL
   * @param {Object} options - 推送选项
   * @param {string} options.branch - 分支名称
   * @param {string} options.targetDir - 目标目录
   * @param {Array<string>} options.types - 要推送的类型
   * @param {string} options.commitId - 提交ID
   * @param {boolean} options.dryRun - 是否为模拟运行
   * @param {boolean} options.overwrite - 是否覆盖已存在的资源
   * @param {boolean} options.autoAuth - 是否启用自动认证
   * @param {boolean} options.force - 是否强制推送（忽略版本检查）
   * @returns {Promise<Object>} 推送结果
   */
  async pushRepository(repoUrl, options = {}) {
    const {
      branch = 'main',
      targetDir,
      types = ['component', 'plugin', 'function', 'class'],
      commitId,
      dryRun = false,
      autoAuth = true
    } = options;

    // 不再需要force参数，所有推送都会自动处理版本冲突

    const githubService = require('./githubService');
    const { codeScanner } = require('../../utils/codeScanner');

    try {
      // 重置统计计数器
      this.resetStats();

      // 解析仓库URL
      const { owner, repo } = githubService.parseRepoUrl(repoUrl);
      logger.info(`开始处理仓库: ${owner}/${repo}, 分支: ${branch}`);

      // 从GitHub仓库读取配置文件，获取纷享销客的认证信息
      const repoConfig = await githubService.readConfigFromRepo(owner, repo, branch);
      if (repoConfig && repoConfig.auth) {
        logger.info(`从GitHub仓库读取到纷享销客认证信息，域名: ${repoConfig.auth.domain}`);
        
        // 临时保存GitHub仓库的认证信息到ConfigManager
        const configManager = require('../../core/ConfigManager').getConfigManager();
        await configManager.set('auth', repoConfig.auth);
      } else {
        logger.warn(`GitHub仓库中未找到纷享销客认证信息，将使用本地配置`);
      }

      // 更新进度条消息，准备获取仓库目录树
      progressManager.updateSpinner('正在获取仓库目录树...');
      
      // 获取仓库目录树，如果认证失败则提示用户输入凭据
      let tree;
      try {
        tree = await githubService.getRepoTree(owner, repo, branch);
      } catch (error) {
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
          logger.warn(`GitHub认证失败，需要输入GitHub凭据`);
          const credentials = await githubService.promptForCredentials();
          if (credentials.success) {
            logger.info(`GitHub凭据已设置，重试获取目录树`);
            tree = await githubService.getRepoTree(owner, repo, branch);
          } else {
            throw new Error(`GitHub凭据设置失败: ${credentials.error}`);
          }
        } else {
          throw error;
        }
      }
      logger.info(`获取到 ${tree.length} 个文件/目录`);

      // 扫描代码资源，只扫描指定类型的资源
      const resources = await codeScanner.scanFromGitHubTree(tree, owner, repo, branch, targetDir, types);
      logger.info(`扫描到 ${resources.length} 个代码资源`);

      // 按类型分类资源
      const resourcesByType = {
        component: resources.filter(r => r.type === 'component'),
        plugin: resources.filter(r => r.type === 'plugin'),
        function: resources.filter(r => r.type === 'function'),
        class: resources.filter(r => r.type === 'class')
      };

      // 计算总资源数
      const totalResources = resources.length;

      // 推送摘要
      const summary = {};
      const errors = [];
      let processedCount = 0;

      // 启动进度条
      const progressBar = progressManager.startProgressBar(totalResources, '正在推送资源...');

      try {
        // 推送组件
        if (types.includes('component')) {
          for (const component of resourcesByType.component) {
            progressManager.updateProgressBar(processedCount, `正在推送: ${component.metadata.name} (组件)`);
            try {
              const result = await this.pushComponent(component, dryRun, owner, repo, branch, targetDir);
              if (!result.success) {
                errors.push({ type: 'component', name: component.metadata.name, error: result.error });
              }
            } catch (error) {
              errors.push({ type: 'component', name: component.metadata.name, error: error.message });
            }
            processedCount++;
          }
          summary.component = {
            success: resourcesByType.component.length - errors.filter(e => e.type === 'component').length,
            failed: errors.filter(e => e.type === 'component').length,
            total: resourcesByType.component.length
          };
        }

        // 推送插件
        if (types.includes('plugin')) {
          for (const plugin of resourcesByType.plugin) {
            progressManager.updateProgressBar(processedCount, `正在推送: ${plugin.metadata.name} (插件)`);
            try {
              const result = await this.pushPlugin(plugin, dryRun, owner, repo, branch, targetDir);
              if (!result.success) {
                errors.push({ type: 'plugin', name: plugin.metadata.name, error: result.error });
              }
            } catch (error) {
              errors.push({ type: 'plugin', name: plugin.metadata.name, error: error.message });
            }
            processedCount++;
          }
          summary.plugin = {
            success: resourcesByType.plugin.length - errors.filter(e => e.type === 'plugin').length,
            failed: errors.filter(e => e.type === 'plugin').length,
            total: resourcesByType.plugin.length
          };
        }

        // 推送函数
        if (types.includes('function')) {
          for (const func of resourcesByType.function) {
            progressManager.updateProgressBar(processedCount, `正在推送: ${func.metadata.name} (函数)`);
            try {
              const result = await this.pushFunction(func, dryRun, owner, repo, branch, targetDir);
              if (!result.success) {
                errors.push({ type: 'function', name: func.metadata.name, error: result.error });
              }
            } catch (error) {
              errors.push({ type: 'function', name: func.metadata.name, error: error.message });
            }
            processedCount++;
          }
          summary.function = {
            success: resourcesByType.function.length - errors.filter(e => e.type === 'function').length,
            failed: errors.filter(e => e.type === 'function').length,
            total: resourcesByType.function.length
          };
        }

        // 推送类
        if (types.includes('class')) {
          for (const cls of resourcesByType.class) {
            progressManager.updateProgressBar(processedCount, `正在推送: ${cls.metadata.name} (类)`);
            try {
              const result = await this.pushClass(cls, dryRun, owner, repo, branch, targetDir);
              if (!result.success) {
                errors.push({ type: 'class', name: cls.metadata.name, error: result.error });
              }
            } catch (error) {
              errors.push({ type: 'class', name: cls.metadata.name, error: error.message });
            }
            processedCount++;
          }
          summary.class = {
            success: resourcesByType.class.length - errors.filter(e => e.type === 'class').length,
            failed: errors.filter(e => e.type === 'class').length,
            total: resourcesByType.class.length
          };
        }
      } catch (error) {
        progressManager.stopAll();
        throw error;
      }

      progressManager.updateProgressBar(totalResources, '推送完成');
      progressManager.stopAllProgressBars();

      // 计算总成功和失败数
      const totalSuccess = Object.values(summary).reduce((sum, s) => sum + s.success, 0);
      const totalFailed = Object.values(summary).reduce((sum, s) => sum + s.failed, 0);

      return {
        success: true,
        summary,
        totalSuccess,
        totalFailed,
        errors,
        repo: repoUrl,
        branch,
        commitId
      };
    } catch (error) {
      logger.error(`推送仓库失败: ${error.message}`);
      return {
        success: false,
        error: error.message,
        repo: repoUrl,
        branch
      };
    }
  }
}

// 创建单例实例
const gitHubPushService = new GitHubPushService();

module.exports = gitHubPushService;