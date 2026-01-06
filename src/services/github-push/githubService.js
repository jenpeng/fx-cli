/**
 * GitHub API服务模块
 * 提供与GitHub API交互的功能，包括获取仓库信息、文件内容等
 */

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { getConfigManager } = require('../../core/ConfigManager');
const { logger } = require('../../core/Logger');
const chalk = require('chalk');
const chalkInstance = chalk.default || chalk;
const readline = require('readline');

// 颜色函数别名，方便使用
const blue = chalkInstance.blue;
const green = chalkInstance.green;
const red = chalkInstance.red;
const yellow = chalkInstance.yellow;
const gray = chalkInstance.gray;
const cyan = chalkInstance.cyan;
const bold = chalkInstance.bold;

class GitHubService {
  constructor() {
    this.configManager = getConfigManager();
    this.baseURL = 'https://api.github.com';
    this.token = null;
    this.timeout = 30000; // 默认超时时间30秒（之前是60秒）
    this.init();
  }

  /**
   * 初始化服务，加载配置
   */
  async init() {
    try {
      // 不再从配置文件中读取GitHub token
      // 每次需要认证时都会提示用户输入
      this.token = null;
      
      // 支持自定义超时时间
      const githubConfig = await this.configManager.get('github') || {};
      if (githubConfig.timeout) {
        this.timeout = githubConfig.timeout;
      }
      
      logger.info('GitHub服务已初始化，需要认证时会提示输入凭据');
    } catch (error) {
      logger.error('初始化GitHub服务失败:', error.message);
    }
  }

  /**
   * 从GitHub仓库读取配置文件
   * @param {string} owner - 仓库所有者
   * @param {string} repo - 仓库名称
   * @param {string} branch - 分支
   * @returns {Promise<Object|null>} 配置对象，如果文件不存在返回null
   */
  async readConfigFromRepo(owner, repo, branch = 'main') {
    try {
      const content = await this.getFileContent(owner, repo, '.fx-cli/config.json', branch, true);
      const config = JSON.parse(content);
      return config;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        logger.warn(`GitHub仓库中不存在配置文件 .fx-cli/config.json`);
        return null;
      }
      
      // 如果是认证错误，提示用户输入凭据并重试
      if (error.response && (error.response.status === 401 || error.response.status === 403)) {
        logger.warn(`读取配置文件时GitHub认证失败，需要输入GitHub凭据`);
        const credentials = await this.promptForCredentials();
        if (credentials.success) {
          logger.info(`GitHub凭据已设置，重试读取配置文件`);
          // 重试时不再提示凭据
          const content = await this.getFileContent(owner, repo, '.fx-cli/config.json', branch, false);
          const config = JSON.parse(content);
          return config;
        } else {
          logger.error(`GitHub凭据设置失败: ${credentials.error}`);
          return null;
        }
      }
      
      logger.error(`读取配置文件失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取请求头
   * @returns {Object} 请求头
   */
  getHeaders() {
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'fx-cli'
    };

    if (this.token) {
      headers['Authorization'] = `token ${this.token}`;
    }

    return headers;
  }

  /**
   * 获取请求配置（包含超时设置）
   * @returns {Object} 请求配置
   */
  getRequestConfig() {
    return {
      headers: this.getHeaders(),
      timeout: this.timeout,
      // 添加代理配置
      proxy: false // 禁用代理，直接连接
    };
  }

  /**
   * 解析GitHub仓库URL
   * @param {string} repoUrl - 仓库URL
   * @returns {Object} 解析结果 {owner, repo}
   */
  parseRepoUrl(repoUrl) {
    // 支持多种URL格式
    // https://github.com/owner/repo
    // https://github.com/owner/repo.git
    // git@github.com:owner/repo.git
    // owner/repo

    let match = repoUrl.match(/github\.com[\/:]([^\/]+)\/([^\/?#]+?)(?:\.git)?$/i);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }

    match = repoUrl.match(/^([^\/]+)\/([^\/?#]+?)(?:\.git)?$/);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }

    throw new Error(`无效的GitHub仓库URL: ${repoUrl}`);
  }

  /**
   * 获取仓库信息
   * @param {string} owner - 仓库所有者
   * @param {string} repo - 仓库名称
   * @returns {Object} 仓库信息
   */
  async getRepoInfo(owner, repo) {
    try {
      const response = await axios.get(
        `${this.baseURL}/repos/${owner}/${repo}`,
        this.getRequestConfig()
      );

      return response.data;
    } catch (error) {
      logger.error(`获取仓库信息失败: ${error.message}`);
      
      // 如果是认证错误，提示用户输入凭据并重新尝试
      if (error.response && [401, 403].includes(error.response.status)) {
        console.log(yellow('⚠️ GitHub API认证失败，请重新输入凭据'));
        
        // 提示用户输入凭据
        const credentials = await this.promptForCredentials();
        
        // 如果成功设置凭据，重新尝试请求
        if (credentials.success) {
          return this.getRepoInfo(owner, repo);
        }
      }
      
      throw error;
    }
  }

  /**
   * 获取仓库内容
   * @param {string} owner - 仓库所有者
   * @param {string} repo - 仓库名称
   * @param {string} path - 路径
   * @param {string} branch - 分支
   * @returns {Object} 仓库内容
   */
  async getRepoContent(owner, repo, path = '', branch = 'main') {
    try {
      const response = await axios.get(
        `${this.baseURL}/repos/${owner}/${repo}/contents/${path}`,
        { 
          ...this.getRequestConfig(),
          params: { ref: branch }
        }
      );

      return response.data;
    } catch (error) {
      logger.error(`获取仓库内容失败: ${error.message}`);
      
      // 如果是认证错误，提示用户输入凭据并重新尝试
      if (error.response && [401, 403].includes(error.response.status)) {
        console.log(yellow('⚠️ GitHub API认证失败，请重新输入凭据'));
        
        // 提示用户输入凭据
        const credentials = await this.promptForCredentials();
        
        // 如果成功设置凭据，重新尝试请求
        if (credentials.success) {
          return this.getRepoContent(owner, repo, path, branch);
        }
      }
      
      throw error;
    }
  }

  /**
   * 获取文件内容
   * @param {string} owner - 仓库所有者
   * @param {string} repo - 仓库名称
   * @param {string} path - 文件路径
   * @param {string} branch - 分支
   * @param {boolean} promptForCreds - 是否提示用户输入凭据（默认: true）
   * @returns {string} 文件内容
   */
  async getFileContent(owner, repo, path, branch = 'main', promptForCreds = true) {
    let attempt = 0;
    const maxAttempts = 2; // 最多尝试两次，第一次可能失败，第二次使用新凭据

    while (attempt < maxAttempts) {
      try {
        const response = await axios.get(
          `${this.baseURL}/repos/${owner}/${repo}/contents/${path}`,
          { 
            ...this.getRequestConfig(),
            params: { ref: branch }
          }
        );

        if (response.data.type === 'file') {
          // GitHub API返回base64编码的内容
          return Buffer.from(response.data.content, 'base64').toString('utf8');
        } else {
          throw new Error(`指定的路径不是文件: ${path}`);
        }
      } catch (error) {
        // 检查是否为网络超时错误
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          console.log(yellow(`⚠️  网络超时，无法连接到GitHub API (${this.timeout}ms)`));
          throw new Error(`连接GitHub API超时，请检查网络连接: ${error.message}`);
        }
        
        attempt++;
        
        // 如果是认证错误，提示用户输入凭据并重新尝试
        if (error.response && [401, 403].includes(error.response.status) && promptForCreds && attempt <= maxAttempts) {
          console.log(yellow('⚠️ GitHub API认证失败，请重新输入凭据'));
          
          // 提示用户输入凭据
          const credentials = await this.promptForCredentials();
          
          // 如果成功设置凭据，重新尝试请求，但不再提示凭据
          if (credentials.success) {
            promptForCreds = false; // 不再提示凭据
            continue; // 继续循环，使用新凭据重试
          } else {
            // 如果凭据设置失败，跳出循环
            break;
          }
        } else if (error.response && [401, 403].includes(error.response.status)) {
          // 如果已经提示过凭据，不再重复提示
          logger.warn('GitHub API认证失败，但已提示过凭据，跳过重复提示');
          break; // 跳出循环
        } else {
          // 其他错误，跳出循环
          break;
        }
      }
    }
    
    // 如果所有尝试都失败，抛出最后一个错误
    throw new Error(`获取文件内容失败: 超过最大尝试次数 ${maxAttempts}`);
  }

  /**
   * 获取目录树
   * @param {string} owner - 仓库所有者
   * @param {string} repo - 仓库名称
   * @param {string} branch - 分支
   * @returns {Array} 目录树
   */
  async getRepoTree(owner, repo, branch = 'main') {
    try {
      // 首先获取分支的最新提交SHA
      const branchResponse = await axios.get(
        `${this.baseURL}/repos/${owner}/${repo}/branches/${branch}`,
        this.getRequestConfig()
      );

      const commitSha = branchResponse.data.commit.sha;

      // 获取目录树
      const treeResponse = await axios.get(
        `${this.baseURL}/repos/${owner}/${repo}/git/trees/${commitSha}`,
        { 
          ...this.getRequestConfig(),
          params: { recursive: 1 }
        }
      );

      return treeResponse.data.tree;
    } catch (error) {
      logger.error(`获取目录树失败: ${error.message}`);
      
      // 如果是认证错误，提示用户输入凭据并重新尝试
      if (error.response && [401, 403].includes(error.response.status)) {
        console.log(yellow('⚠️ GitHub API认证失败，请重新输入凭据'));
        
        // 提示用户输入凭据
        const credentials = await this.promptForCredentials();
        
        // 如果成功设置凭据，重新尝试请求
        if (credentials.success) {
          return this.getRepoTree(owner, repo, branch);
        }
      }
      
      throw error;
    }
  }

  /**
   * 搜索仓库中的文件
   * @param {string} owner - 仓库所有者
   * @param {string} repo - 仓库名称
   * @param {string} pattern - 文件模式（支持glob）
   * @param {string} branch - 分支
   * @returns {Array} 匹配的文件列表
   */
  async searchFiles(owner, repo, pattern, branch = 'main') {
    try {
      const tree = await this.getRepoTree(owner, repo, branch);
      const files = tree.filter(item => item.type === 'file');
      
      // 简单的glob模式匹配
      const regex = new RegExp(
        pattern
          .replace(/\./g, '\\.')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.')
      );

      return files.filter(file => regex.test(file.path));
    } catch (error) {
      logger.error(`搜索文件失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 下载仓库
   * @param {string} repoUrl - 仓库URL
   * @param {string} targetDir - 目标目录
   * @param {Object} options - 选项
   * @returns {string} 下载路径
   */
  async downloadRepo(repoUrl, targetDir, options = {}) {
    const { branch = 'main', depth = 1 } = options;
    
    try {
      const { owner, repo } = this.parseRepoUrl(repoUrl);
      
      // 创建目标目录
      await fs.ensureDir(targetDir);
      
      // 获取目录树
      const tree = await this.getRepoTree(owner, repo, branch);
      
      // 过滤出文件
      const files = tree.filter(item => item.type === 'file');
      
      // 下载文件
      const downloadPromises = files.map(async (file) => {
        const filePath = path.join(targetDir, file.path);
        await fs.ensureDir(path.dirname(filePath));
        
        const content = await this.getFileContent(owner, repo, file.path, branch);
        await fs.writeFile(filePath, content);
        
        return file.path;
      });
      
      const downloadedFiles = await Promise.all(downloadPromises);
      
      logger.info(`成功下载仓库 ${owner}/${repo} 到 ${targetDir}`);
      logger.info(`共下载 ${downloadedFiles.length} 个文件`);
      
      return targetDir;
    } catch (error) {
      logger.error(`下载仓库失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 克隆仓库（使用git命令）
   * @param {string} repoUrl - 仓库URL
   * @param {string} targetDir - 目标目录
   * @param {Object} options - 选项
   * @returns {string} 克隆路径
   */
  async cloneRepo(repoUrl, targetDir, options = {}) {
    const { branch = 'main', depth = 1 } = options;
    
    try {
      const { spawn } = require('child_process');
      
      // 创建目标目录
      await fs.ensureDir(targetDir);
      
      // 构建git clone命令
      const args = ['clone', repoUrl, targetDir];
      
      if (branch !== 'main') {
        args.push('--branch', branch);
      }
      
      if (depth > 0) {
        args.push('--depth', depth.toString());
      }
      
      logger.info(`开始克隆仓库: ${repoUrl}`);
      
      return new Promise((resolve, reject) => {
        const process = spawn('git', args);
        
        process.on('close', (code) => {
          if (code === 0) {
            logger.info(`成功克隆仓库到 ${targetDir}`);
            resolve(targetDir);
          } else {
            reject(new Error(`git clone 失败，退出码: ${code}`));
          }
        });
        
        process.on('error', (error) => {
          reject(new Error(`git clone 执行失败: ${error.message}`));
        });
      });
    } catch (error) {
      logger.error(`克隆仓库失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 交互式提示用户输入GitHub凭据
   * @returns {Promise<Object>} 包含success和error字段的对象
   */
  async promptForCredentials() {
    const readline = require('readline');
    const progressManager = require('../../utils/progressManager');
    
    // 停止进度条，避免干扰输入
    progressManager.stopSpinner();
    
    // 检查是否在交互式终端中运行
    if (!process.stdin.isTTY) {
      console.log(yellow('⚠️ 检测到非交互式环境，无法提示输入凭据'));
      console.log(yellow('请设置环境变量 GITHUB_USERNAME 和 GITHUB_TOKEN，或使用 GitHub CLI (gh auth login)'));
      return { success: false, error: '非交互式环境，无法提示输入凭据' };
    }
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    // 添加超时机制，避免无限等待
    const timeoutMs = 30000; // 30秒超时
    let hasTimedOut = false;
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        hasTimedOut = true;
        reject(new Error('输入超时'));
      }, timeoutMs);
    });
    
    try {
      console.log(bold(blue('\n=== GitHub 认证配置 ===\n')));
      console.log(yellow('提示: 您可以设置环境变量 GITHUB_USERNAME 和 GITHUB_TOKEN 来避免此提示\n'));
      
      // 提示用户输入GitHub用户名
      const usernamePromise = new Promise((resolve) => {
        rl.question(green('请输入GitHub用户名: '), resolve);
      });
      
      const username = await Promise.race([usernamePromise, timeoutPromise]);
      
      if (hasTimedOut) {
        throw new Error('输入超时');
      }
      
      // 提示用户输入GitHub个人访问令牌
      const tokenPromise = new Promise((resolve) => {
        rl.question(green('请输入GitHub个人访问令牌 (需要repo权限): '), resolve);
      });
      
      const token = await Promise.race([tokenPromise, timeoutPromise]);
      
      if (hasTimedOut) {
        throw new Error('输入超时');
      }
      
      // 验证输入
      if (!username || !token) {
        console.log(red('❌ 用户名和令牌不能为空'));
        return { success: false, error: '用户名和令牌不能为空' };
      }
      
      // 更新服务中的token
      this.token = token;
      
      console.log(green('✅ GitHub凭据已设置（仅当前会话有效）'));
      return { success: true };
    } catch (error) {
      if (hasTimedOut || error.message === '输入超时') {
        console.log(yellow('\n⚠️ 输入超时，已取消凭据设置'));
      } else {
        logger.error('设置GitHub凭据失败:', error);
        console.log(red(`❌ 设置凭据失败: ${error.message}`));
      }
      return { success: false, error: error.message };
    } finally {
      rl.close();
    }
  }
}

// 导出类的同时创建并初始化实例
const githubService = new GitHubService();
// 立即执行初始化，但不等待其完成（避免阻塞模块加载）
githubService.init().catch(error => {
  logger.error('GitHubService初始化失败:', error.message);
});

module.exports = githubService;