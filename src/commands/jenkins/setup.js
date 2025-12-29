/**
 * Jenkins配置命令
 * 用于配置Jenkins服务器的连接信息
 */

const ora = require('ora');
const inquirer = require('inquirer');
const { getConfigManager } = require('../../core/ConfigManager');
const { configureJenkins } = require('../../services/jenkinsService');

// 配置管理器实例
const configManager = getConfigManager();

/**
 * 日志输出函数
 */
const logInfo = (message) => console.log('[信息] ' + message);
const logSuccess = (message) => console.log('[成功] ' + message);
const logWarning = (message) => console.log('[警告] ' + message);
const logError = (message) => console.log('[错误] ' + message);

/**
 * 执行Jenkins配置命令
 */
const execute = async () => {
  try {
    logInfo('配置Jenkins连接信息');
    logInfo('===================');
    
    // 获取当前配置（如果存在）
    const currentConfig = configManager.get('jenkins') || {};
    
    if (currentConfig.url) {
      logWarning(`当前已配置Jenkins: ${currentConfig.url}`);
      logWarning('以下将显示当前配置作为默认值，直接回车保留当前值');
      logInfo('');
    }
    
    // 收集用户输入
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'url',
        message: 'Jenkins服务器URL:',
        default: currentConfig.url || '',
        validate: (input) => {
          if (!input.trim()) {
            return 'Jenkins URL不能为空';
          }
          // 简单的URL格式验证
          try {
            new URL(input);
            return true;
          } catch (error) {
            return 'Jenkins URL格式不正确';
          }
        }
      },
      {
        type: 'input',
        name: 'username',
        message: 'Jenkins用户名 (可选):',
        default: currentConfig.username || ''
      },
      {
        type: 'list',
        name: 'authType',
        message: '认证方式:',
        choices: ['密码', 'API Token', '无（匿名访问）'],
        default: currentConfig.token ? 'API Token' : currentConfig.password ? '密码' : '无（匿名访问）',
        when: (answers) => answers.username
      },
      {
        type: 'password',
        name: 'password',
        message: 'Jenkins密码:',
        default: currentConfig.password || '',
        when: (answers) => answers.username && answers.authType === '密码'
      },
      {
        type: 'password',
        name: 'token',
        message: 'Jenkins API Token:',
        default: currentConfig.token || '',
        when: (answers) => answers.username && answers.authType === 'API Token'
      }
    ]);
    
    // 构建配置对象
    const config = {
      url: answers.url.trim(),
      username: answers.username.trim() || null
    };
    
    // 添加认证信息
    if (answers.username) {
      if (answers.authType === '密码') {
        config.password = answers.password;
        config.token = null;
      } else if (answers.authType === 'API Token') {
        config.token = answers.token;
        config.password = null;
      }
    }
    
    logInfo('');
    logInfo('正在保存配置并测试连接...');
    
    // 启动加载动画
    const spinner = ora('正在连接Jenkins服务器...').start();
    
    try {
      // 配置并测试Jenkins连接
      const result = await configureJenkins(config);
      
      spinner.succeed();
      logSuccess('');
      logSuccess('✓ Jenkins配置成功！');
      logInfo(`  URL: ${config.url}`);
      if (config.username) {
        logInfo(`  用户名: ${config.username}`);
        logInfo(`  认证方式: ${config.token ? 'API Token' : '密码'}`);
      } else {
        logInfo('  认证方式: 匿名访问');
      }
      logSuccess('');
      logSuccess('可以使用以下命令开始使用Jenkins集成:');
      logInfo('  fx-cli jenkins pipeline - 查看所有流水线');
      logInfo('  fx-cli jenkins build <pipeline-name> - 触发流水线构建');
      logInfo('  fx-cli jenkins status <build-id> - 查看构建状态');
    } catch (error) {
      spinner.fail();
      throw error;
    }
  } catch (error) {
    logError('');
    logError('✗ 配置失败:', error.message);
    logInfo('');
    logInfo('请检查以下几点:');
    logInfo('1. Jenkins URL是否正确');
    logInfo('2. 用户名和凭证是否有效');
    logInfo('3. Jenkins服务器是否可以访问');
    logInfo('');
    throw error;
  }
};

module.exports = {
  execute
};