/**
 * 代码推送命令
 * 用于将组件、插件和函数代码推送到远程服务
 */

const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk'); // 保留但不使用彩色输出
const { getConfigManager } = require('../core/ConfigManager');
const { pushByType } = require('../services/pushService');
const progressManager = require('../utils/progressManager');

// 配置管理器实例
const configManager = getConfigManager();
// 项目根目录
const projectRoot = configManager.getSync('project.rootDir') || process.cwd();

/**
 * 日志输出函数
 */
const logInfo = (message) => console.log('[信息] ' + message);
const logSuccess = (message) => console.log('[成功] ' + message);
const logWarning = (message) => console.log('[警告] ' + message);
const logError = (message) => console.log('[错误] ' + message);

/**
 * 执行推送命令
 * @param {string} name - 组件/插件/函数/类名称或路径
 * @param {Object} options - 命令选项
 * @returns {Promise<void>}
 */
const execute = async (name, options) => {
  await checkAuth();
  
  // 检查是否使用了--all选项
  if (options.all) {
    return await pushAll(options);
  }
  
  // 提取命令行参数
  let type = options.type;
  let singleFilePath = options.file;
  let pathParam = options.path; // 新增-p参数支持
  // let isNewFunction = options.new; // 移除--new参数支持
  
  // 验证类型或自动检测
  const validTypes = ['component', 'plugin', 'function', 'class'];
  
  // 如果提供了单个文件路径但没有指定类型，尝试自动检测
  if (singleFilePath && !type) {
    const fileExt = path.extname(singleFilePath).toLowerCase();
    const fileName = path.basename(singleFilePath, path.extname(singleFilePath));
    
    if (fileExt === '.groovy') {
      // Groovy文件可能是函数或类
      // 如果文件名以__c结尾，可能是类
      if (fileName.endsWith('__c')) {
        type = 'class';
        logInfo(`自动检测到类型: class`);
      } else {
        type = 'function';
        logInfo(`自动检测到类型: function`);
      }
    } else if (fileExt === '.vue') {
      type = 'component';
      logInfo(`自动检测到类型: component`);
    } else if (fileExt === '.js') {
      type = 'plugin';
      logInfo(`自动检测到类型: plugin`);
    } else {
      throw new Error(`无法自动检测文件类型: ${singleFilePath}，请使用 -t 参数指定类型`);
    }
  } else if (!type && name) {
    // 如果没有指定类型但有name参数，尝试从name推断类型
    const nameExt = path.extname(name).toLowerCase();
    if (nameExt === '.groovy' || nameExt === '.java') {
      const fileName = path.basename(name, nameExt);
      if (fileName.endsWith('__c')) {
        type = 'class';
        logInfo(`从文件名自动检测到类型: class`);
      } else {
        type = 'function';
        logInfo(`从文件名自动检测到类型: function`);
      }
    } else if (nameExt === '.vue') {
      type = 'component';
      logInfo(`从文件名自动检测到类型: component`);
    } else if (nameExt === '.js') {
      type = 'plugin';
      logInfo(`从文件名自动检测到类型: plugin`);
    } else {
      throw new Error(`无法自动检测文件类型: ${name}，请使用 -t 参数指定类型`);
    }
  }
  
  if (!validTypes.includes(type)) {
    throw new Error(`无效的类型: ${type}，支持的类型: ${validTypes.join(', ')}`);
  }
  
  // 确定目标路径和单个文件路径
  let targetPath;
  let resolvedSingleFilePath = null;
  
  // 检查name是否是一个文件
  if (name) {
    // 首先检查name是否是一个存在的路径（文件或目录）
    let actualPath = name;
    if (!path.isAbsolute(name)) {
      // 如果不是绝对路径，先检查当前目录下是否存在
      actualPath = path.join(process.cwd(), name);
      if (!await fs.pathExists(actualPath)) {
        // 如果当前目录下不存在，再检查类型目录下的路径
        let typeDir;
        if (type === 'component' || type === 'plugin') {
          typeDir = path.join(projectRoot, 'fx-app', 'main', 'PWC', type);
        } else if (type === 'function' || type === 'class') {
          typeDir = path.join(projectRoot, 'fx-app', 'main', 'APL', type + (type === 'class' ? 'es' : 's'));
        } else {
          typeDir = path.join(projectRoot, 'fx-app', type);
        }
        actualPath = path.join(typeDir, name);
      }
    }
    
    // 检查路径是否存在
    if (await fs.pathExists(actualPath)) {
      const stats = await fs.stat(actualPath);
      if (stats.isDirectory()) {
        // 如果是目录，直接使用
        targetPath = actualPath;
      } else {
        // 如果是文件，按单个文件处理
        resolvedSingleFilePath = actualPath;
        targetPath = path.dirname(actualPath);
      }
    } else {
      // 如果路径不存在，按原来的逻辑处理（可能是文件名）
      // 检查name是否是一个文件（有扩展名）
      const nameExt = path.extname(name).toLowerCase();
      let isSingleFile = false;
      
      // 如果name有扩展名，且是支持的文件类型，将其视为单个文件
      if ((type === 'class' && (nameExt === '.groovy' || nameExt === '.java')) ||
          (type === 'function' && nameExt === '.groovy') ||
          (type === 'component' && nameExt === '.vue') ||
          (type === 'plugin' && nameExt === '.js')) {
        isSingleFile = true;
      } else if ((type === 'function' || type === 'class') && !nameExt) {
        // 如果是function或class类型且没有扩展名，也视为单个文件，需要添加.groovy扩展名
        isSingleFile = true;
      } else if (!type && (nameExt === '.groovy' || nameExt === '.java' || nameExt === '.vue' || nameExt === '.js')) {
        // 如果没有指定类型但有扩展名，也视为单个文件
        isSingleFile = true;
      }
      
      if (isSingleFile) {
        // 处理单个文件
        let fileName = name;
        
        // 如果没有扩展名且是function或class类型，添加.groovy扩展名
        if (!nameExt && (type === 'function' || type === 'class')) {
          fileName = `${name}.groovy`;
        }
        
        resolvedSingleFilePath = fileName;
        
        // 如果不是绝对路径，先根据类型在fx-app下的正确目录中查找文件
        if (!path.isAbsolute(name)) {
          let typeDir;
          if (type === 'component' || type === 'plugin') {
            typeDir = path.join(projectRoot, 'fx-app', 'main', 'PWC', type);
          } else if (type === 'function' || type === 'class') {
            typeDir = path.join(projectRoot, 'fx-app', 'main', 'APL', type + (type === 'class' ? 'es' : 's'));
          } else {
            // 如果没有类型，使用当前目录
            typeDir = process.cwd();
          }
          const typeDirFilePath = path.join(typeDir, fileName);
          
          if (await fs.pathExists(typeDirFilePath)) {
            resolvedSingleFilePath = typeDirFilePath;
          } else {
            // 如果类型目录下不存在，检查当前目录下是否存在
            const currentDirFilePath = path.join(process.cwd(), fileName);
            if (await fs.pathExists(currentDirFilePath)) {
              resolvedSingleFilePath = currentDirFilePath;
            } else {
              // 尝试原始名称（不带扩展名）
              resolvedSingleFilePath = path.join(process.cwd(), name);
            }
          }
        }
        
        // 验证文件是否存在
        if (!await fs.pathExists(resolvedSingleFilePath)) {
          throw new Error(`文件不存在: ${resolvedSingleFilePath}`);
        }
        
        // 设置targetPath为文件所在目录
        targetPath = path.dirname(resolvedSingleFilePath);
      } else {
        // 处理目录
        if (path.isAbsolute(name)) {
          targetPath = name;
        } else {
          // 否则根据类型在fx-app下的正确目录中查找同名目录
          let typeDir;
          if (type === 'component' || type === 'plugin') {
            typeDir = path.join(projectRoot, 'fx-app', 'main', 'PWC', type);
          } else if (type === 'function' || type === 'class') {
            typeDir = path.join(projectRoot, 'fx-app', 'main', 'APL', type + (type === 'class' ? 'es' : 's'));
          } else {
            typeDir = path.join(projectRoot, 'fx-app', type);
          }
          const typeDirTargetPath = path.join(typeDir, name);
          
          // 检查类型目录下的路径是否存在
          if (await fs.pathExists(typeDirTargetPath)) {
            targetPath = typeDirTargetPath;
          } else {
            // 如果不存在，使用当前目录下的同名目录（保持向后兼容）
            targetPath = path.join(process.cwd(), name);
          }
        }
        
        // 检查目录是否存在
        if (!await fs.pathExists(targetPath)) {
          throw new Error(`路径不存在: ${targetPath}`);
        }
      }
    }
  } else {
    // 如果没有指定路径，根据类型自动选择默认目录
    if (type === 'component' || type === 'plugin') {
      // 组件和插件目录是复数形式
      targetPath = path.join(projectRoot, 'fx-app', 'main', 'PWC', type + 's');
    } else if (type === 'function') {
      targetPath = path.join(projectRoot, 'fx-app', 'main', 'APL', 'functions');
    } else if (type === 'class') {
      targetPath = path.join(projectRoot, 'fx-app', 'main', 'APL', 'classes');
    } else {
      // 如果类型未知，使用当前目录作为后备
      targetPath = process.cwd();
    }
    
    // 检查目录是否存在，如果不存在则使用当前目录
    if (!await fs.pathExists(targetPath)) {
      logWarning(`默认${type}目录不存在: ${targetPath}，使用当前目录`);
      targetPath = process.cwd();
    }
  }
  
  // 如果提供了-p选项，处理单个文件名（支持component、plugin、function和class）
  if (pathParam) {
    // 构建完整的文件路径
    let fileName;
    let typeDir;
    
    if (type === 'component' || type === 'plugin') {
      // 对于组件和插件，-p参数指定的是组件/插件名称，不是单个文件
      // 查找对应的组件/插件目录
      // 注意：组件目录名是复数形式（components/plugins）
      const typeDirName = type === 'component' ? 'components' : 'plugins';
      typeDir = path.join(projectRoot, 'fx-app', 'main', 'PWC', typeDirName);
      const componentPath = path.join(typeDir, pathParam);
      
      // 检查组件/插件目录是否存在
      if (await fs.pathExists(componentPath)) {
        targetPath = componentPath;
        logInfo(`使用-p参数指定${type}: ${pathParam}`);
      } else {
        throw new Error(`${type}不存在: ${componentPath}`);
      }
    } else if (type === 'function' || type === 'class') {
      // 对于函数和类，-p参数指定的是单个文件名
      fileName = pathParam.endsWith('.groovy') ? pathParam : `${pathParam}.groovy`;
      
      if (type === 'function') {
        typeDir = path.join(projectRoot, 'fx-app', 'main', 'APL', 'functions');
      } else if (type === 'class') {
        typeDir = path.join(projectRoot, 'fx-app', 'main', 'APL', 'classes');
      }
      
      const fullPath = path.join(typeDir, fileName);
      
      // 检查文件是否存在
      if (!await fs.pathExists(fullPath)) {
        throw new Error(`文件不存在: ${fullPath}`);
      }
      
      resolvedSingleFilePath = fullPath;
      targetPath = typeDir;
      logInfo(`使用-p参数指定文件: ${fileName}`);
    }
  }
  
  // 如果提供了-f选项，验证其存在性
  if (singleFilePath) {
    resolvedSingleFilePath = singleFilePath;
    
    // 检查是否为绝对路径
    if (!path.isAbsolute(singleFilePath)) {
      // 如果不是绝对路径，先根据类型在fx-app下的正确目录中查找文件
      let typeDir;
      if (type === 'component' || type === 'plugin') {
        // 注意：组件目录名是复数形式（components/plugins）
        const typeDirName = type === 'component' ? 'components' : 'plugins';
        typeDir = path.join(projectRoot, 'fx-app', 'main', 'PWC', typeDirName);
      } else if (type === 'function' || type === 'class') {
        typeDir = path.join(projectRoot, 'fx-app', 'main', 'APL', type + (type === 'class' ? 'es' : 's'));
      } else {
        typeDir = path.join(projectRoot, 'fx-app', type);
      }
      const typeDirFilePath = path.join(typeDir, singleFilePath);
      
      if (await fs.pathExists(typeDirFilePath)) {
        resolvedSingleFilePath = typeDirFilePath;
      } else {
        // 如果类型目录下不存在，检查当前目录下是否存在
        const currentDirFilePath = path.join(process.cwd(), singleFilePath);
        if (await fs.pathExists(currentDirFilePath)) {
          resolvedSingleFilePath = currentDirFilePath;
        }
      }
    }
    
    // 验证最终路径是否存在
    if (!await fs.pathExists(resolvedSingleFilePath)) {
      throw new Error(`单个文件不存在: ${resolvedSingleFilePath}`);
    }
    
    // 对于组件和插件，如果使用-f参数指定路径，需要更新targetPath为组件目录
    if (type === 'component' || type === 'plugin') {
      // 检查是否是组件目录
      const stats = await fs.stat(resolvedSingleFilePath);
      if (stats.isDirectory()) {
        // 如果是目录，直接使用该目录作为targetPath
        targetPath = resolvedSingleFilePath;
        // 对于组件目录，不需要设置resolvedSingleFilePath，因为我们要推送整个组件
        resolvedSingleFilePath = null;
      } else {
        // 如果是文件，需要获取其所在的组件目录
        let currentPath = resolvedSingleFilePath;
        while (currentPath !== path.dirname(currentPath)) {
          // 检查当前目录是否包含component.xml或plugin.xml
          const xmlFile = type === 'component' ? 'component.xml' : 'plugin.xml';
          const xmlPath = path.join(currentPath, xmlFile);
          if (await fs.pathExists(xmlPath)) {
            targetPath = currentPath;
            break;
          }
          currentPath = path.dirname(currentPath);
        }
        
        // 如果没有找到包含XML文件的目录，使用文件所在目录
        if (targetPath === projectRoot) {
          targetPath = path.dirname(resolvedSingleFilePath);
        }
      }
    }
  }
  
  // 如果未提供单个文件，检查是否是目录
  if (!resolvedSingleFilePath) {
    const stats = await fs.stat(targetPath);
    if (!stats.isDirectory()) {
      throw new Error(`路径不是目录: ${targetPath}`);
    }
  }
  
  // 显示开始消息
  const pushTarget = resolvedSingleFilePath ? `${path.basename(resolvedSingleFilePath)}` : `${path.basename(targetPath)}`;
  
  // 当推送单个class或function文件时，检查unchangeableJson.json
  let unchangeableJsonPath = path.join(projectRoot, 'unchangeableJson.json');
  let unchangeableJsonData = null;
  let fileToCheck = null;
  
  if (resolvedSingleFilePath && (type === 'class' || type === 'function')) {
    // 检查unchangeableJson.json是否存在
    if (await fs.pathExists(unchangeableJsonPath)) {
      // 读取unchangeableJson.json
      const jsonContent = await fs.readFile(unchangeableJsonPath, 'utf8');
      unchangeableJsonData = JSON.parse(jsonContent);
      
      // 获取要推送的文件名（不包含扩展名）
      const fileName = path.basename(resolvedSingleFilePath);
      const fileExtension = path.extname(fileName);
      // 构建key，格式为 "type:API_NAME"
      const apiName = fileName.replace(fileExtension, '');
      const key = `${type}:${apiName}`;
      
      // 检查文件是否在unchangeableJson.json中有记录
      if (!unchangeableJsonData[key]) {
        logError(`文件 ${fileName} 不在unchangeableJson.json中记录，无法推送`);
        throw new Error(`文件 ${fileName} 不在unchangeableJson.json中记录，无法推送`);
      }
      
      fileToCheck = key;
    } else {
      throw new Error(`unchangeableJson.json文件不存在，无法推送单个${type}文件`);
    }
  }
  
  try {
    // 启动spinner
    progressManager.startSpinner(`正在推送 ${type}: ${pushTarget}...`);
    
    let result;
    if (resolvedSingleFilePath) {
      // 推送单个文件
      result = await pushByType(targetPath, type, resolvedSingleFilePath);
      
      // 停止spinner
      progressManager.stopAllSpinners();
      
      // 检查推送结果是否成功
      if (!result.success) {
        logError(`推送失败: ${result.message || '未知错误'}`);
        throw new Error(result.message || '推送失败');
      }
      
      // 如果是单个class或function文件推送成功，更新unchangeableJson.json
      if ((singleFilePath || pathParam) && (type === 'class' || type === 'function')) {
        if (fileToCheck && unchangeableJsonData) {
          // 更新updateTime为当前时间戳
          unchangeableJsonData[fileToCheck].updateTime = Date.now();
          
          // 写回unchangeableJson.json
          await fs.writeFile(unchangeableJsonPath, JSON.stringify(unchangeableJsonData, null, 2), 'utf8');
        }
      }
      
      logSuccess(`推送成功！${result.message || ''}`);
    } else {
      // 推送目录，调用pushByTypeDirectory进行批量推送和统计
      const stats = await pushByTypeDirectory(targetPath, type);
      
      // 停止spinner
      progressManager.stopAllSpinners();
      
      // 汇总结果
      const totalSuccess = stats.success;
      const totalFailed = stats.failed;
      
      logSuccess(`${type}推送结果: 成功 ${totalSuccess}/${totalSuccess + totalFailed}`);
      
      // 输出失败的项目
      if (totalFailed > 0) {
        logInfo('失败列表:');
        stats.items.filter(item => !item.success).forEach(item => {
          logError(`  - ${item.name}: ${item.message}`);
        });
      }
      
      result = {
        success: true,
        message: `${type}目录推送完成，成功: ${totalSuccess}，失败: ${totalFailed}`
      };
    }
    
    return result;
  } catch (error) {
    // 停止所有进度显示
    progressManager.stopAll();
    logError('推送失败: ' + error.message);
    throw error;
  }
};

/**
 * 检查用户认证状态
 */
const checkAuth = async () => {
  const authInfo = await configManager.get('auth');
  if (!authInfo || !authInfo.certificate || !authInfo.domain) {
    throw new Error('请先登录: fx-cli auth');
  }
};

module.exports = {
  command: 'push',
  description: '推送组件、插件、类或函数',
  arguments: [
    {
      name: 'path',
      description: '组件、插件、类或函数的路径（可选，如果不指定则根据类型自动选择目录）',
      required: false
    }
  ],
  options: [
    {
      name: 'type',
      alias: 't',
      description: '类型：component、plugin、function或class',
      required: true
    },
    {
      name: 'file',
      alias: 'f',
      description: '单个文件路径（可选，用于推送单个文件）',
      required: false
    },
    {
      name: 'path',
      alias: 'p',
      description: '组件名称或单个文件名（可选，用于推送组件或单个文件）',
      required: false
    },
    {
      name: 'all',
      alias: 'a',
      description: '推送所有组件、插件、函数和类',
      required: false
    },
    // 移除--new选项
  ],
  execute
};

/**
 * 批量推送所有组件/插件/函数/类
 * @param {Object} options - 命令选项
 * @returns {Promise<Object>} 批量推送结果
 */
const pushAll = async (options) => {
  logInfo('开始批量推送所有组件/插件/函数/类...');
  
  const results = {
    components: { success: 0, failed: 0, items: [] },
    plugins: { success: 0, failed: 0, items: [] },
    functions: { success: 0, failed: 0, items: [] },
    classes: { success: 0, failed: 0, items: [] }
  };
  
  try {
    // 启动全局进度条
    progressManager.startSpinner('正在准备批量推送...');
    
    // 1. 推送所有组件
    await pushAllByType('component', results);
    
    // 2. 推送所有插件
    await pushAllByType('plugin', results);
    
    // 3. 推送所有函数
    await pushAllByType('function', results);
    
    // 4. 推送所有类
    await pushAllByType('class', results);
    
    // 停止全局进度条
    progressManager.stopAllSpinners();
    
    // 汇总结果
    const totalSuccess = results.components.success + results.plugins.success + 
                        results.functions.success + results.classes.success;
    const totalFailed = results.components.failed + results.plugins.failed + 
                       results.functions.failed + results.classes.failed;
    
    logSuccess(`批量推送完成！成功: ${totalSuccess}，失败: ${totalFailed}`);
    
    // 输出各类别的详细结果
    logInfo(`组件: 成功 ${results.components.success}，失败 ${results.components.failed}`);
    logInfo(`插件: 成功 ${results.plugins.success}，失败 ${results.plugins.failed}`);
    logInfo(`函数: 成功 ${results.functions.success}，失败 ${results.functions.failed}`);
    logInfo(`类: 成功 ${results.classes.success}，失败 ${results.classes.failed}`);
    
    // 输出失败的项目
    Object.entries(results).forEach(([type, stats]) => {
      const failedItems = stats.items.filter(item => !item.success);
      if (failedItems.length > 0) {
        logInfo(`${type}失败列表:`);
        failedItems.forEach(item => {
          logError(`  - ${item.name}: ${item.message}`);
        });
      }
    });
    
    return {
      success: totalFailed === 0,
      message: `批量推送完成！成功: ${totalSuccess}，失败: ${totalFailed}`,
      results
    };
  } catch (error) {
    progressManager.stopAll();
    logError(`批量推送过程中发生错误: ${error.message}`);
    throw error;
  }
};

/**
 * 推送指定类型的所有项目
 * @param {string} type - 类型：component/plugin/class/function
 * @param {Object} results - 结果对象
 */
const pushAllByType = async (type, results) => {
  try {
    let targetPath;
    
    // 确定目标路径
    if (type === 'component' || type === 'plugin') {
      targetPath = path.join(projectRoot, 'fx-app', 'main', 'PWC', type + 's');
    } else if (type === 'function') {
      targetPath = path.join(projectRoot, 'fx-app', 'main', 'APL', 'functions');
    } else if (type === 'class') {
      targetPath = path.join(projectRoot, 'fx-app', 'main', 'APL', 'classes');
    } else {
      logWarning(`不支持的类型: ${type}`);
      return;
    }
    
    // 调用pushByTypeDirectory处理目录推送
    await pushByTypeDirectory(targetPath, type, results);
  } catch (error) {
    logError(`推送${type}时发生错误: ${error.message}`);
  }
};

/**
 * 推送指定目录下的所有指定类型项目
 * @param {string} targetPath - 目标目录路径
 * @param {string} type - 类型：component/plugin/class/function
 * @param {Object} results - 结果对象（可选，用于pushAllByType调用）
 * @returns {Object|null} - 结果统计对象，如果传入了results则返回null
 */
const pushByTypeDirectory = async (targetPath, type, results = null) => {
  // 如果没有传入results对象，创建一个新的
  const localResults = results || {
    success: 0,
    failed: 0,
    items: []
  };
  
  try {
    // 检查目录是否存在
    if (!await fs.pathExists(targetPath)) {
      return results ? null : localResults;
    }
    
    // 对于组件和插件，处理子目录
    if (type === 'component' || type === 'plugin') {
      // 获取所有子目录
      const subdirs = await fs.readdir(targetPath);
      const validDirs = [];
      
      const xmlFile = type === 'component' ? 'component.xml' : 'plugin.xml';
      
      for (const subdir of subdirs) {
        const subdirPath = path.join(targetPath, subdir);
        const subdirStat = await fs.stat(subdirPath);
        if (subdirStat.isDirectory()) {
          const xmlPath = path.join(subdirPath, xmlFile);
          if (await fs.pathExists(xmlPath)) {
            validDirs.push(subdirPath);
          }
        }
      }
      
      if (validDirs.length === 0) {
        return results ? null : localResults;
      }
      
      // 停止spinner，启动进度条
      progressManager.stopAllSpinners();
      // 启动进度条，显示总量
      const progressBar = progressManager.startProgressBar(validDirs.length, `正在推送所有${type}资源...`);
      
      // 逐个推送
      for (let i = 0; i < validDirs.length; i++) {
        const dir = validDirs[i];
        const itemName = path.basename(dir);
        
        try {
          const result = await pushByType(dir, type, null);
          
          // 修复类名复数形式的问题
          const resultKey = results ? (type === 'class' ? 'classes' : `${type}s`) : null;
          
          if (result.success) {
            if (results) {
              results[resultKey].success++;
              results[resultKey].items.push({ name: itemName, success: true, message: result.message });
            } else {
              localResults.success++;
              localResults.items.push({ name: itemName, success: true, message: result.message });
            }
          } else {
            if (results) {
              results[resultKey].failed++;
              results[resultKey].items.push({ name: itemName, success: false, message: result.message });
            } else {
              localResults.failed++;
              localResults.items.push({ name: itemName, success: false, message: result.message });
            }
          }
        } catch (error) {
          const resultKey = results ? (type === 'class' ? 'classes' : `${type}s`) : null;
          if (results) {
            results[resultKey].failed++;
            results[resultKey].items.push({ name: itemName, success: false, message: error.message });
          } else {
            localResults.failed++;
            localResults.items.push({ name: itemName, success: false, message: error.message });
          }
        } finally {
          // 更新进度条（无论成功失败都更新）
          progressManager.updateProgressBar(i + 1, `${i+1}/${validDirs.length} 正在推送${type}: ${itemName}`);
        }
      }
      
      // 停止进度条
      progressManager.stopAllProgressBars();
    } 
    // 对于函数和类，处理单个文件
    else if (type === 'function' || type === 'class') {
      // 获取所有.groovy文件
      const files = await fs.readdir(targetPath);
      const validFiles = files.filter(file => path.extname(file).toLowerCase() === '.groovy');
      
      if (validFiles.length === 0) {
        return results ? null : localResults;
      }
      
      // 停止spinner，启动进度条
      progressManager.stopAllSpinners();
      // 启动进度条，显示总量
      const progressBar = progressManager.startProgressBar(validFiles.length, `正在推送所有${type}资源...`);
      
      // 逐个推送
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        
        try {
          const filePath = path.join(targetPath, file);
          
          // 执行推送，传入单个文件路径
          const result = await pushByType(targetPath, type, filePath);
          
          // 修复类名复数形式的问题
          const resultKey = results ? (type === 'class' ? 'classes' : `${type}s`) : null;
          
          if (result.success) {
            if (results) {
              results[resultKey].success++;
              results[resultKey].items.push({ name: file, success: true, message: result.message });
            } else {
              localResults.success++;
              localResults.items.push({ name: file, success: true, message: result.message });
            }
          } else {
            if (results) {
              results[resultKey].failed++;
              results[resultKey].items.push({ name: file, success: false, message: result.message });
            } else {
              localResults.failed++;
              localResults.items.push({ name: file, success: false, message: result.message });
            }
          }
        } catch (error) {
          const resultKey = results ? (type === 'class' ? 'classes' : `${type}s`) : null;
          if (results) {
            results[resultKey].failed++;
            results[resultKey].items.push({ name: file, success: false, message: error.message });
          } else {
            localResults.failed++;
            localResults.items.push({ name: file, success: false, message: error.message });
          }
        } finally {
          // 更新进度条（无论成功失败都更新）
          progressManager.updateProgressBar(i + 1, `${i+1}/${validFiles.length} 正在推送${type}: ${file}`);
        }
      }
      
      // 停止进度条
      progressManager.stopAllProgressBars();
    }
    
    // 如果没有传入results对象，返回localResults
    if (!results) {
      return localResults;
    }
  } catch (error) {
    // 停止进度条
    progressManager.stopAllProgressBars();
    logError(`推送${type}时发生错误: ${error.message}`);
    // 如果没有传入results对象，返回localResults
    if (!results) {
      return localResults;
    }
  }
  
  return null;
};