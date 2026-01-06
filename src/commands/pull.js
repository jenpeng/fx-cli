/**
 * 代码拉取命令
 * 用于从远程服务拉取组件、插件和函数代码
 */

const path = require('path');
const fs = require('fs-extra');
const { getConfigManager } = require('../core/ConfigManager');
const { pullSingleComponent, pullAllComponents, pullSingleFunction, pullAllFunctions, pullSingleClass, pullAllClasses, pullAllResources, pullByName } = require('../services/pullService');
const progressManager = require('../utils/progressManager');
const api = require('../services/api');

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
    
    // 参数解析逻辑：与push命令保持一致，要求显式指定--type参数
    const validTypes = ['component', 'plugin', 'function', 'class'];
    let type = options.type;
    
    // 如果没有指定类型且不是拉取所有资源，要求用户指定类型
    if (!type && !all) {
      // 对于单个资源拉取，需要指定类型或名称
      if (!name) {
        throw new Error('必须指定类型（使用 -t 参数）或资源名称');
      }
      // 保留默认类型为component，当有名称但没有类型时
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
    // 如果没有指定名称且没有 --all，且也没有指定类型，则报错
    if (!name && !all && !type) {
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
    
    try {
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
            targetOutputDir = path.join(pwcDir, type === 'component' ? 'components' : 'plugins');
            break;
          case 'function':
            const aplDir = path.join(mainDir, 'APL');
            targetOutputDir = path.join(aplDir, 'functions');
            break;
          case 'class':
            const classAplDir = path.join(mainDir, 'APL');
            targetOutputDir = path.join(classAplDir, 'classes');
            break;
        }
        
        // 启动spinner
        progressManager.startSpinner(`正在拉取 ${type}: ${name}...`);
        const result = await pullByName(name, targetOutputDir, type);
        // 停止spinner并显示成功消息
        progressManager.succeedSpinner(`成功拉取 ${type}: ${result.name}`);
        
        logSuccess(`成功拉取 ${type}: ${result.name}`);
        logInfo(`保存路径: ${result.path}`);
      } else if (all && type === undefined) {
        // 只有当完全没有指定类型时，才拉取所有类型的资源
        progressManager.startSpinner('正在准备拉取所有资源...');
        
        // 先获取所有资源类型的总数
        const resourceTypes = ['component', 'plugin', 'function', 'class'];
        const allResults = {};
        
        // 预计算总资源数 - 先获取每种资源类型的列表
        let totalResourceCount = 0;
        const resourceLists = {};
        
        // 先获取所有资源列表，计算总数
        for (const resourceType of resourceTypes) {
          progressManager.updateSpinner(`正在获取${resourceType}列表...`);
          
          let resources = [];
          try {
            // 根据资源类型获取资源列表
            switch (resourceType) {
              case 'component':
              case 'plugin':
                // 直接调用API获取组件/插件列表
                resources = await api.fetchComponents(resourceType, '');
                break;
              case 'function':
              case 'class':
                // 获取认证信息
                const certificateData = await configManager.getAuthInfo() || {};
                // 获取函数/类列表
                const pageData = {
                  pageNumber: 1,
                  pageSize: 2000,
                  type: resourceType
                };
                const response = await api.syncFunction(pageData, certificateData);
                // 处理响应，兼容多种格式
                if (response && response.Value) {
                  if (Array.isArray(response.Value)) {
                    resources = response.Value;
                  } else if (Array.isArray(response.Value.list)) {
                    resources = response.Value.list;
                  } else if (Array.isArray(response.Value.items)) {
                    resources = response.Value.items;
                  }
                }
                break;
            }
            resourceLists[resourceType] = resources;
            totalResourceCount += resources.length;
          } catch (error) {
            resourceLists[resourceType] = [];
            logWarning(`获取${resourceType}列表失败: ${error.message}`);
          }
        }
        
        // 停止spinner，启动进度条
        progressManager.stopAllSpinners();
        const progressBar = progressManager.startProgressBar(totalResourceCount, '正在拉取所有资源...');
        
        let processedCount = 0;
        
        // 为每种资源类型构建输出目录
        const fxAppDir = path.join(projectRoot, 'fx-app');
        const mainDir = path.join(fxAppDir, 'main');
        const resourceOutputDirs = {
          'component': path.join(mainDir, 'PWC', 'components'),
          'plugin': path.join(mainDir, 'PWC', 'plugins'),
          'function': path.join(mainDir, 'APL', 'functions'),
          'class': path.join(mainDir, 'APL', 'classes')
        };
        
        // 逐个拉取每种资源类型的资源，实时更新进度条
        for (const resourceType of resourceTypes) {
          const resources = resourceLists[resourceType];
          const targetOutputDir = resourceOutputDirs[resourceType];
          
          // 确保输出目录存在
          await fs.ensureDir(targetOutputDir);
          
          allResults[resourceType] = [];
          
          // 逐个拉取该类型的资源
          for (const resource of resources) {
            try {
              let result;
              
              switch (resourceType) {
                case 'component':
                case 'plugin':
                  // 为每个组件/插件创建单独的目录
                  const resourceDir = path.join(targetOutputDir, resource.name);
                  result = await pullSingleComponent(resource, resourceDir, resourceType);
                  break;
                case 'function':
                  result = await pullSingleFunction(resource, targetOutputDir);
                  break;
                case 'class':
                  result = await pullSingleClass(resource, targetOutputDir);
                  break;
              }
              
              allResults[resourceType].push(result);
              processedCount++;
              // 更新进度条
              progressManager.updateProgressBar(processedCount, `${processedCount}/${totalResourceCount} 正在拉取${resourceType}: ${resource.name || resource.id || '未知'}`);
            } catch (error) {
              allResults[resourceType].push({
                success: false,
                name: resource.name || resource.id || '未知',
                error: error.message
              });
              processedCount++;
              // 更新进度条
              progressManager.updateProgressBar(processedCount, `${processedCount}/${totalResourceCount} 拉取${resourceType}失败: ${resource.name || resource.id || '未知'}`);
            }
          }
        }
        
        // 停止进度条
        progressManager.stopAllProgressBars();
        
        let totalCount = 0;
        let totalSuccess = 0;
        
        // 统计和显示每种类型的结果
        Object.entries(allResults).forEach(([resourceType, results]) => {
          const successCount = results.filter(r => r.success).length;
          const failCount = results.length - successCount;
          
          totalCount += results.length;
          totalSuccess += successCount;
          
          logInfo(`${resourceType}: 成功 ${successCount}，失败 ${failCount}`);
          
          // 显示失败的项目
          const failedItems = results.filter(r => !r.success);
          if (failedItems.length > 0) {
            logInfo(`${resourceType}失败列表:`);
            failedItems.forEach(item => {
              logError(`  - ${item.name || item.id || '未知'}: ${item.error || '未知错误'}`);
            });
          }
        });
        
        logSuccess(`总拉取结果: 成功 ${totalSuccess}/${totalCount}`);
      } else if (type) {
        // 拉取指定类型的所有项目
        let results;
        let targetOutputDir = outputDir;
        
        // 为不同类型构建正确的目录路径
        const fxAppDir = path.join(projectRoot, 'fx-app');
        const mainDir = path.join(fxAppDir, 'main');
        
        // 根据类型构建正确的目标目录
        switch (type) {
          case 'component':
          case 'plugin':
            const pwcDir = path.join(mainDir, 'PWC');
            targetOutputDir = path.join(pwcDir, type === 'component' ? 'components' : 'plugins');
            break;
          case 'function':
            const aplDir = path.join(mainDir, 'APL');
            targetOutputDir = path.join(aplDir, 'functions');
            break;
          case 'class':
            const classAplDir = path.join(mainDir, 'APL');
            targetOutputDir = path.join(classAplDir, 'classes');
            break;
        }
        
        // 获取资源列表（只获取一次）
        let totalResourceCount = 0;
        let resources = [];
        progressManager.startSpinner(`正在获取${type}列表...`);
        
        try {
          const certificateData = await configManager.getAuthInfo() || {};
          switch (type) {
            case 'component':
            case 'plugin':
              // 获取组件/插件列表
              resources = await api.fetchComponents(type, '');
              totalResourceCount = resources.length;
              break;
            case 'function':
            case 'class':
              // 获取函数/类列表
              const pageData = {
                pageNumber: 1,
                pageSize: 2000,
                type: type
              };
              const response = await api.syncFunction(pageData, certificateData);
              // 处理响应，兼容多种格式
              if (response && response.Value) {
                if (Array.isArray(response.Value)) {
                  resources = response.Value;
                } else if (Array.isArray(response.Value.list)) {
                  resources = response.Value.list;
                } else if (Array.isArray(response.Value.items)) {
                  resources = response.Value.items;
                }
              }
              totalResourceCount = resources.length;
              break;
          }
        } catch (error) {
          logWarning(`获取${type}列表失败，将使用默认进度显示: ${error.message}`);
        }
        
        // 停止spinner，启动进度条
        progressManager.stopAllSpinners();
        const progressBar = progressManager.startProgressBar(totalResourceCount, `正在拉取所有${type}资源...`);
        
        try {
          await fs.ensureDir(targetOutputDir);
          
          results = [];
          
          // 逐个拉取资源，实时更新进度条
          for (let i = 0; i < resources.length; i++) {
            const resource = resources[i];
            try {
              let result;
              
              switch (type) {
                case 'component':
                case 'plugin':
                  // 为每个组件/插件创建单独的目录
                  const resourceDir = path.join(targetOutputDir, resource.name);
                  result = await pullSingleComponent(resource, resourceDir, type);
                  break;
                case 'function':
                  result = await pullSingleFunction(resource, targetOutputDir);
                  break;
                case 'class':
                  result = await pullSingleClass(resource, targetOutputDir);
                  break;
              }
              
              results.push(result);
              // 更新进度条
              progressManager.updateProgressBar(i + 1, `${i+1}/${totalResourceCount} 正在拉取: ${resource.name || resource.id || '未知'}`);
            } catch (error) {
              results.push({
                success: false,
                name: resource.name || resource.id || '未知',
                error: error.message
              });
              // 更新进度条
              progressManager.updateProgressBar(i + 1, `${i+1}/${totalResourceCount} 拉取失败: ${resource.name || resource.id || '未知'}`);
            }
          }
        } finally {
          // 停止进度条
          progressManager.stopAllProgressBars();
        }
        
        const totalCount = results.length;
        const successCount = results.filter(r => r.success).length;
        const failCount = totalCount - successCount;
        
        logSuccess(`${type}拉取结果: 成功 ${successCount}/${totalCount}`);
        
        // 显示失败的项目
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
      // 停止所有进度显示
      progressManager.stopAll();
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