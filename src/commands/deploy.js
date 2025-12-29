/**
 * 代码部署命令
 * 用于将组件、插件和函数代码推送到远程服务并部署
 */

const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');
const ora = require('ora');
const ConfigManager = require('../core/ConfigManager');
const { deployByType } = require('../services/pushService');

// 配置管理器实例
const configManager = new ConfigManager();

/**
 * 日志输出函数
 */
const logInfo = (message) => console.log(chalk.blue(message));
const logSuccess = (message) => console.log(chalk.green(message));
const logWarning = (message) => console.log(chalk.yellow(message));
const logError = (message) => console.log(chalk.red(message));

/**
 * 执行部署命令
 * @param {string} name - 组件/插件/函数名称（可选，默认为当前目录）
 * @param {Object} options - 命令选项
 */
const execute = async (name, options = {}) => {
  await checkAuth();
  
  // 合并命令行参数和默认值
  const type = options.type || 'component';
  const env = options.env || 'dev';
  
  // 验证类型
  const validTypes = ['component', 'plugin', 'function'];
  if (!validTypes.includes(type)) {
    throw new Error(`无效的类型: ${type}，支持的类型: ${validTypes.join(', ')}`);
  }

  // 验证环境
  const validEnvs = ['dev', 'test', 'prod'];
  if (!validEnvs.includes(env)) {
    throw new Error(`无效的环境: ${env}，支持的环境: ${validEnvs.join(', ')}`);
  }

  // 确定目标路径
  let targetPath;
  if (name) {
    // 如果指定了名称，使用当前目录下的同名目录
    targetPath = path.join(process.cwd(), name);
  } else {
    // 否则使用当前目录
    targetPath = process.cwd();
  }
  
  // 检查路径是否存在
  if (!await fs.pathExists(targetPath)) {
    throw new Error(`路径不存在: ${targetPath}`);
  }
  
  // 检查是否是目录
  const stats = await fs.stat(targetPath);
  if (!stats.isDirectory()) {
    throw new Error(`路径不是目录: ${targetPath}`);
  }
  
  logInfo(`开始部署 ${type} 代码到 ${env} 环境，来源路径: ${targetPath}`);
  
  // 启动加载动画
  const spinner = ora(`正在部署 ${type} 代码到 ${env} 环境...`).start();
  
  try {
    // 执行部署
    const result = await deployByType(targetPath, type, env);
    
    spinner.succeed();
    
    logSuccess(`成功部署 ${type}: ${result.name}`);
    if (result.id) {
      logInfo(`ID: ${result.id}`);
    }
    if (result.buildId) {
      logInfo(`构建ID: ${result.buildId}`);
    }
    logInfo(`环境: ${result.env}`);
    if (result.message) {
      logInfo(`消息: ${result.message}`);
    }
    
    logInfo('部署已完成，代码已生效');
  } catch (error) {
    spinner.fail();
    throw error;
  }
};

/**
 * 检查用户认证状态
 */
const checkAuth = async () => {
  const userInfo = configManager.get('userInfo');
  if (!userInfo) {
    throw new Error('请先登录: fx-cli auth');
  }
};

module.exports = {
  execute
};