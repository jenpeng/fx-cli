/**
 * 代码拉取命令
 * 用于从远程服务拉取组件、插件和函数代码
 */

const path = require('path');
const fs = require('fs-extra');
// 简化版的spinner实现，避免依赖问题
const simpleSpinner = {
  start: (text) => {
    console.log(`[处理中] ${text}`);
    return { stop: () => {} };
  }
};
const { getConfigManager } = require('../core/ConfigManager');
const { pullSingleComponent, pullAllComponents, pullSingleFunction, pullAllFunctions, pullSingleClass, pullAllClasses, pullAllResources, pullByName } = require('../services/pullService');

// 不需要全局配置管理器实例，将在工厂函数中创建

/**
 * 日志输出函数
 */
const logInfo = (message) => console.log('[信息] ' + message);
const logSuccess = (message) => console.log('[成功] ' + message);
const logWarning = (message) => console.log('[警告] ' + message);
const logError = (message) => console.log('[错误] ' + message);

/**
 * 创建拉取命令执行器
 * 使用工厂函数模式来确保正确初始化ConfigManager
 */
const createPullCommand = () => {
  // 在工厂函数内部创建配置管理器实例
  const configManager = getConfigManager();

  /**
   * 检查用户认证状态
   */
  const checkAuth = async () => {
    try {
      // 从auth对象中获取用户信息
      const authInfo = await configManager.get('auth');
      // 检查certificate而不是token，因为我们使用的是证书认证
      if (!authInfo || !authInfo.certificate) {
        throw new Error('请先登录: fx-cli auth');
      }
      return authInfo;
    } catch (error) {
      // 如果获取配置失败，也提示用户登录
      if (error.message !== '请先登录: fx-cli auth') {
        throw new Error('请先登录: fx-cli auth');
      }
      throw error;
    }
  };

  /**
   * 执行拉取命令
   * @param {string} name - 组件/插件/函数名称或类型（可选）
   * @param {Object} options - 命令选项
   */
  const execute = async (name, options = {}) => {
    // 获取当前工作目录作为项目根目录
    const projectRoot = process.cwd();
    
    // 记录当前使用的配置类型
    const configType = configManager.getConfigType();
    logInfo(`当前使用${configType === 'root' ? '项目根目录' : configType === 'project' ? '项目级别' : '全局'}配置: ${configManager.configPath}`);
    
    // 检查认证状态
    await checkAuth();
    
    // 合并命令行参数和默认值
    const all = options.all || false;
    
    // 参数解析逻辑优化：
    // 1. 首先检查--type参数
    // 2. 如果没有--type但name是有效的类型，则将name视为类型
    // 3. 如果使用--all但没有指定类型，需要看name是否是有效类型
    const validTypes = ['component', 'plugin', 'function', 'class'];
    let type = options.type;
    
    // 如果没有通过--type指定类型，但name是有效的类型
    if (!type && name && validTypes.includes(name)) {
      type = name;
      name = undefined; // 清除name，因为它被用作类型
    }
    
    // 默认类型为component（当既没有指定类型也没有指定名称时）
    if (!type && !all && !name) {
      type = 'component';
    }
    
    // 设置默认输出目录
    let output = options.output;
    
    // 1. 优先使用命令行参数
    // 2. 其次从配置管理器中获取
    if (!output) {
      try {
        // 尝试从项目配置中获取输出目录
        const projectConfig = await configManager.get('project');
        if (projectConfig && projectConfig.defaultOutputDir) {
          output = projectConfig.defaultOutputDir;
          logInfo(`从配置中读取输出目录: ${output}`);
        }
      } catch (error) {
        logWarning(`读取配置失败: ${error.message}`);
      }
    }
    
    // 3. 最后使用默认值
    if (!output) {
      output = './';
    }
    
    // 参数验证
    if (!name && !all) {
      throw new Error('必须指定组件/插件/函数名称或使用 --all 参数拉取所有项目');
    }

    // 验证类型：当使用--all且不指定类型时跳过验证
    if (!all && type === undefined && !name) {
      throw new Error('未指定类型，请使用 --type 指定类型（component/plugin/function/class）');
    }

    if (type !== undefined) {
      if (!validTypes.includes(type)) {
        throw new Error(`无效的类型: ${type}，支持的类型: ${validTypes.join(', ')}`);
      }
    }

    // 确保输出目录存在
    const outputDir = path.isAbsolute(output) ? output : path.join(projectRoot, output);
    await fs.ensureDir(outputDir);
    
    // 使用简化版的spinner
    const spinnerInstance = simpleSpinner.start(`准备拉取代码...`);
  
    try {
      // 停止spinner，因为不同的拉取操作有自己的进度提示
      spinnerInstance.stop();
      
      // 拉取逻辑处理
      if (name) {
        // 拉取单个项目 - 为不同类型构建正确的目录路径
        let targetOutputDir = outputDir;
        const fxAppDir = path.join(projectRoot, 'fx-app');
        const mainDir = path.join(fxAppDir, 'main');
        
        switch (type) {
          case 'component':
          case 'plugin':
            const pwcDir = path.join(mainDir, 'PWC');
            // 先使用name创建基础路径，但实际保存时会在pullByName中使用插件返回的真实name
            targetOutputDir = path.join(pwcDir, type === 'component' ? 'components' : 'plugins');
            break;
          case 'function':
            const aplDir = path.join(mainDir, 'APL');
            // 函数不创建额外文件夹，直接保存到functions目录
            targetOutputDir = path.join(aplDir, 'functions');
            break;
          case 'class':
            const classAplDir = path.join(mainDir, 'APL');
            // 类不创建额外文件夹，直接保存到classes目录
            targetOutputDir = path.join(classAplDir, 'classes');
            break;
        }
        
        const result = await pullByName(name, targetOutputDir, type);
        
        logSuccess(`成功拉取 ${type}: ${result.name}`);
        logInfo(`保存路径: ${result.path}`);
      } else if (all && type === undefined) {
        // 只有当完全没有指定类型时，才拉取所有类型的资源
        const allResults = await pullAllResources(outputDir);
        
        let totalCount = 0;
        let totalSuccess = 0;
        
        // 统计和显示每种类型的结果
        Object.entries(allResults).forEach(([resourceType, results]) => {
          const successCount = results.filter(r => r.success).length;
          const failCount = results.length - successCount;
          
          totalCount += results.length;
          totalSuccess += successCount;
          
          logInfo(`${resourceType} 资源拉取结果:`);
          logInfo(`  成功: ${successCount}, 失败: ${failCount}`);
          
          // 显示失败的项目
          results.filter(r => !r.success).forEach(item => {
            logError(`    - ${item.name || item.id || '未知'}: ${item.error || '未知错误'}`);
          });
        });
        
        logSuccess(`总拉取结果: 成功 ${totalSuccess}/${totalCount}`);
      } else if (type) {
        // 拉取指定类型的所有项目（这也包括all=true且type已指定的情况）
        let results;
        let targetOutputDir = outputDir;
        
        // 为不同类型构建正确的目录路径
        const fxAppDir = path.join(projectRoot, 'fx-app');
        const mainDir = path.join(fxAppDir, 'main');
        
        switch (type) {
          case 'component':
          case 'plugin':
            const pwcDir = path.join(mainDir, 'PWC');
            targetOutputDir = path.join(pwcDir, type === 'component' ? 'components' : 'plugins');
            results = await pullAllComponents(targetOutputDir, type);
            break;
          case 'function':
            const aplDir = path.join(mainDir, 'APL');
            targetOutputDir = path.join(aplDir, 'functions');
            results = await pullAllFunctions(targetOutputDir);
            break;
          case 'class':
            const classAplDir = path.join(mainDir, 'APL');
            targetOutputDir = path.join(classAplDir, 'classes');
            results = await pullAllClasses(targetOutputDir);
            break;
          default:
            throw new Error(`不支持的类型: ${type}`);
        }
        
        const successCount = results.filter(r => r.success).length;
        const failCount = results.length - successCount;
        
        logSuccess(`成功拉取 ${successCount}/${results.length} 个${type}`);
        
        if (failCount > 0) {
          logInfo('失败列表:');
          results.filter(r => !r.success).forEach(item => {
            logError(`  - ${item.name || item.id || '未知'}: ${item.error || '未知错误'}`);
          });
        }
      } else {
        throw new Error('参数错误，请检查命令参数');
      }
    } catch (error) {
      if (spinnerInstance) {
        spinnerInstance.stop();
      }
      logError('拉取失败: ' + error.message);
      // 不抛出错误，避免显示堆栈跟踪
    }
  };

// 返回命令对象
  return {
    execute
  };
};

// 导出工厂函数
module.exports = createPullCommand();