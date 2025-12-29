/**
 * 认证命令模块
 * 负责用户登录、登出和认证状态管理
 */
const ora = require('ora');
const chalk = require('chalk');
const inquirer = require('inquirer');
const fs = require('fs-extra');
const path = require('path');
const fsNative = require('fs');
const { getConfigManager } = require('../core/ConfigManager');

// 简化版的spinner实现，避免依赖问题
const simpleSpinner = {
  start: (text) => {
    console.log(`[处理中] ${text}`);
    return { stop: () => {} };
  }
};
const apiService = require('../services/api');
const { logger } = require('../core/Logger');
const { AuthError } = require('../core/ErrorHandler');

/**
 * 执行认证命令
 * @param {Object} options - 命令选项
 * @returns {Promise<void>}
 */
async function execute(options) {
  const configManager = getConfigManager();
  
  // 如果是登出命令
  if (options.logout) {
    await handleLogout(configManager);
    return;
  }
  
  // 如果是状态命令
  if (options.status) {
    await handleStatus(configManager);
    return;
  }
  
  // 如果是创建项目配置命令
  if (options.projectConfig) {
    await handleCreateProjectConfig(configManager);
    return;
  }
  
  // 如果是切换配置模式命令
  if (options.useGlobal !== undefined) {
    await handleSwitchConfigMode(configManager, !options.useGlobal);
    return;
  }
  
  // 默认执行登录命令
  await handleLogin(configManager);
}

/**
 * 处理登录逻辑
 * @param {ConfigManager} configManager - 配置管理器实例
 * @returns {Promise<void>}
 */
async function handleLogin(configManager) {
  const spinner = simpleSpinner.start('准备登录...');
  
  try {
    // 从环境变量或配置中获取认证信息，避免交互式提示
    let domain = process.env.FX_DOMAIN;
    let certificate = process.env.FX_CERTIFICATE;
    
    // 如果环境变量未设置，尝试从当前目录的certificate.json文件中获取
    if (!domain || !certificate) {
      try {
        const certFilePath = path.join(process.cwd(), 'certificate.json');
        if (fsNative.existsSync(certFilePath)) {
          const certData = JSON.parse(fsNative.readFileSync(certFilePath, 'utf8'));
          if (!domain && certData.domain && certData.domain !== 'YOUR_DOMAIN_HERE') {
            domain = certData.domain;
          }
          if (!certificate && certData.certificate && certData.certificate !== 'YOUR_CERTIFICATE_HERE') {
            certificate = certData.certificate;
          }
        }
      } catch (e) {
        console.log('[提示] 无法读取certificate.json文件，将尝试其他方式获取配置');
      }
    }
    
    // 如果certificate.json中没有，尝试从配置管理器中获取
    if (!domain || !certificate) {
      try {
        const config = configManager.getConfigSync();
        if (!domain) {
          domain = config.auth?.domain || '';
        }
        if (!certificate) {
          certificate = config.auth?.certificate || '';
        }
      } catch (e) {
        // 如果获取失败，保持当前值
      }
    }
    
    // 如果环境变量未设置，尝试从文件中获取
    if (!certificate && process.env.FX_CERTIFICATE_PATH) {
      try {
        if (await fs.pathExists(process.env.FX_CERTIFICATE_PATH)) {
          certificate = await fs.readFile(process.env.FX_CERTIFICATE_PATH, 'utf8');
        }
      } catch (e) {
        console.error(`[错误] 读取证书文件失败: ${e.message}`);
        process.exit(1);
      }
    }
    
    if (!domain || !certificate) {
      console.error('[错误] 缺少登录信息');
      console.error('请设置环境变量:');
      console.error('  FX_DOMAIN: 服务器域名');
      console.error('  FX_CERTIFICATE: 证书内容 或 FX_CERTIFICATE_PATH: 证书文件路径');
      process.exit(1);
    }
    
    spinner.text = '正在读取证书...';
    
    // 验证证书格式 - 移除严格的格式验证，支持base64编码的证书
      if (!certificate || certificate.trim().length === 0) {
        console.error('[错误] 证书内容不能为空');
        process.exit(1);
      }
    
    spinner.text = '正在验证认证信息...';
    
    // 构建认证数据
    const authInfo = {
      certificate: certificate.trim(),
      domain: domain.trim()
    };
    
    // 调用API验证权限
    let result;
    try {
      // 注意：fetchCheckPermission函数需要两个参数：url和certificateData
      result = await apiService.fetchCheckPermission('', authInfo);
      
      // 权限检查只返回true/false，我们需要构造成功结果
      if (result) {
        result = { success: true };
      } else {
        throw new Error('无效的证书或域名');
      }
    } catch (apiError) {
      // API调用失败，严格处理错误
      if (apiError && apiError.message) {
        throw new Error(`API调用失败: ${apiError.message}`);
      } else {
        throw new Error('API调用失败: 无效的证书或域名');
      }
    }
    
    // 登录成功处理
    console.log('[成功] 登录成功!');
    
    // 保存认证信息
    await configManager.set('auth.certificate', authInfo.certificate);
    await configManager.set('auth.domain', authInfo.domain);
    // await configManager.set('auth.userInfo', result.data || {});
    await configManager.set('auth.lastAuth', new Date().toISOString());
  
    // 显示配置类型
    const configType = configManager.getConfigType();
    console.log(`\n使用${configType === 'project' ? '项目级别' : '全局'}配置`);
    console.log(`配置路径: ${configManager.configPath}`);
  
    // 不显示具体的用户信息，只显示登录成功提示
    console.log(`\n登录成功，认证信息已保存`);
  } catch (error) {
    logger.error('登录失败', error);
    console.error(`[错误] 登录失败: ${error.message}`);
    process.exit(1);
  }
}

/**
 * 处理登出逻辑
 * @param {ConfigManager} configManager - 配置管理器实例
 * @returns {Promise<void>}
 */
async function handleLogout(configManager) {
  const spinner = simpleSpinner.start('正在登出...');
  
  try {
    // 获取认证信息
    const authInfo = await configManager.get('auth');
    
    if (!authInfo || !authInfo.certificate) {
        console.log('[警告] 您尚未登录');
        return;
      }
    
    // 清除认证信息
      await configManager.set('auth.certificate', '');
      await configManager.set('auth.userInfo', null);
      await configManager.set('auth.lastAuth', null);
      
      // 显示配置类型
      const configType = configManager.getConfigType();
      console.log('[成功] 登出成功!');
      console.log(`已清除${configType === 'project' ? '项目级别' : '全局'}配置中的认证信息`);
    } catch (error) {
      logger.error('登出失败', error);
      console.error(`[错误] 登出失败: ${error.message}`);
      process.exit(1);
    }
}

/**
 * 处理创建项目配置
 * @param {ConfigManager} configManager - 配置管理器实例
 * @returns {Promise<void>}
 */
async function handleCreateProjectConfig(configManager) {
  const spinner = simpleSpinner.start('创建项目配置...');
  
  try {
    // 创建项目配置
    await configManager.createProjectConfig();
    
    console.log('[成功] 项目配置创建成功!');
    console.log(`配置路径: ${configManager.configPath}`);
    console.log(`提示: 项目配置已激活，后续操作将使用项目级别的配置`);
  } catch (error) {
    logger.error('创建项目配置失败', error);
    console.error(`[错误] 创建项目配置失败: ${error.message}`);
    process.exit(1);
  }
}

/**
 * 处理切换配置模式
 * @param {ConfigManager} configManager - 配置管理器实例
 * @param {boolean} useProjectConfig - 是否使用项目配置
 * @returns {Promise<void>}
 */
async function handleSwitchConfigMode(configManager, useProjectConfig) {
  try {
    const spinner = simpleSpinner.start('切换配置模式...');
    configManager.setUseProjectConfig(useProjectConfig);
    
    // 确保配置初始化
    await configManager.initialize();
    
    const mode = useProjectConfig ? '项目级别' : '全局';
    console.log(`[成功] 已切换到${mode}配置模式`);
    console.log(`当前配置路径: ${configManager.configPath}`);
    
    // 检查是否有认证信息
    const authInfo = await configManager.get('auth');
    if (authInfo && authInfo.certificate) {
      console.log(`当前已登录: ${authInfo.domain}`);
    } else {
      console.log('[警告] 当前未登录，请使用 fx-cli auth 命令登录');
    }
  } catch (error) {
    logger.error('切换配置模式失败', error);
    console.error(`[错误] 切换配置模式失败: ${error.message}`);
    process.exit(1);
  }
}

/**
 * 处理状态查询逻辑
 * @param {ConfigManager} configManager - 配置管理器实例
 * @returns {Promise<void>}
 */
async function handleStatus(configManager) {
  try {
    // 获取配置类型
    const configType = configManager.getConfigType();
    
    console.log(`当前配置模式: ${configType === 'project' ? '项目级别' : '全局'}`);
    console.log(`配置路径: ${configManager.configPath}`);
    
    // 获取认证信息
    const authInfo = await configManager.get('auth');
    
    if (authInfo && authInfo.certificate) {
      console.log('[成功] 已登录');
      console.log('认证信息:');
      if (authInfo.lastAuth) {
        const authTime = new Date(authInfo.lastAuth).toLocaleString();
        console.log(`  上次认证: ${authTime}`);
      }
      console.log('  用户信息: 已认证 (具体信息已隐藏)')
    } else {
      console.log('\n✗ 未登录');
      console.log('提示: 使用 fx-cli auth 命令登录');
    }
  } catch (error) {
    logger.error('获取认证状态失败', error);
    console.error(`[错误] 获取认证状态失败: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { execute };
