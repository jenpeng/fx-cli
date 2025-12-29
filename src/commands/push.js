/**
 * 代码推送命令
 * 用于将组件、插件和函数代码推送到远程服务
 */

const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk'); // 保留但不使用彩色输出
const { getConfigManager } = require('../core/ConfigManager');
const { pushByType, pushClassService } = require('../services/pushService');

// 配置管理器实例
const configManager = getConfigManager();
// 项目根目录
const projectRoot = configManager.getSync('project.rootDir') || process.cwd();

/**
 * 日志输出函数
 */
const logInfo = (message) => console.log(`[INFO] ${message}`);
const logSuccess = (message) => console.log(`[SUCCESS] ${message}`);
const logWarning = (message) => console.log(`[WARNING] ${message}`);
const logError = (message) => console.log(`[ERROR] ${message}`);

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
  // let isNewComponent = options.new; // 移除--new参数支持
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
          // 如果不是绝对路径，先检查当前目录下是否存在
          const currentDirPath = path.join(process.cwd(), name);
          if (await fs.pathExists(currentDirPath)) {
            targetPath = currentDirPath;
          } else {
            // 如果当前目录下不存在，再检查类型目录下的路径
            let typeDir;
            if (type === 'component' || type === 'plugin') {
              typeDir = path.join(projectRoot, 'fx-app', 'main', 'PWC', type);
            } else if (type === 'function' || type === 'class') {
              typeDir = path.join(projectRoot, 'fx-app', 'main', 'APL', type + (type === 'class' ? 'es' : 's'));
            } else {
              typeDir = path.join(projectRoot, 'fx-app', type);
            }
            targetPath = path.join(typeDir, name);
          }
        }
        
        // 验证目录是否存在
        if (!await fs.pathExists(targetPath)) {
          throw new Error(`目录不存在: ${targetPath}`);
        }
      }
    }
  } else {
    // 如果没有提供name参数，使用默认目录
    if (type === 'component' || type === 'plugin') {
      targetPath = path.join(projectRoot, 'fx-app', 'main', 'PWC', type + 's');
    } else if (type === 'function' || type === 'class') {
      targetPath = path.join(projectRoot, 'fx-app', 'main', 'APL', type + (type === 'class' ? 'es' : 's'));
    } else {
      targetPath = path.join(projectRoot, 'fx-app', type);
    }
    
    // 验证目录是否存在
    if (!await fs.pathExists(targetPath)) {
      throw new Error(`目录不存在: ${targetPath}`);
    }
  }
  
  // 如果指定了-p参数，则使用指定的路径
  if (pathParam) {
    // 检查pathParam是否是一个文件
    const stats = await fs.stat(pathParam).catch(() => null);
    if (stats && stats.isFile()) {
      // 如果是文件，则使用文件所在目录作为targetPath
      targetPath = path.dirname(pathParam);
      resolvedSingleFilePath = pathParam;
    } else {
      // 如果是目录，直接使用
      targetPath = pathParam;
    }
  }
  
  // 如果指定了-f参数，则使用指定的文件
  if (singleFilePath) {
    // 验证文件是否存在
    if (!await fs.pathExists(singleFilePath)) {
      throw new Error(`文件不存在: ${singleFilePath}`);
    }
    
    // 设置targetPath为文件所在目录
    targetPath = path.dirname(singleFilePath);
    resolvedSingleFilePath = singleFilePath;
  }
  
  // 如果未提供单个文件，检查是否是目录
  if (!resolvedSingleFilePath) {
    const stats = await fs.stat(targetPath);
    if (!stats.isDirectory()) {
      throw new Error(`路径不是目录: ${targetPath}`);
    }
    
    // 如果是components或plugins目录，且没有指定具体的组件/插件，则扫描所有子目录
    if ((type === 'component' || type === 'plugin') && !singleFilePath) {
      // 检查是否是components或plugins目录，或者是指定的组件/插件目录
      const isComponentsOrPluginsDir = path.basename(targetPath) === 'components' || path.basename(targetPath) === 'plugins';
      const hasComponentXml = await fs.pathExists(path.join(targetPath, type === 'component' ? 'component.xml' : 'plugin.xml'));
      
      // 如果是components/plugins目录，或者目录中没有对应的XML文件，则扫描子目录
      if (isComponentsOrPluginsDir || !hasComponentXml) {
        const xmlFile = type === 'component' ? 'component.xml' : 'plugin.xml';
        const subdirs = await fs.readdir(targetPath);
      
      // 过滤出包含对应XML文件的子目录
      const componentDirs = [];
      for (const subdir of subdirs) {
        const subdirPath = path.join(targetPath, subdir);
        const subdirStat = await fs.stat(subdirPath);
        if (subdirStat.isDirectory()) {
          const xmlPath = path.join(subdirPath, xmlFile);
          if (await fs.pathExists(xmlPath)) {
            componentDirs.push(subdirPath);
          }
        }
      }
      
      if (componentDirs.length === 0) {
        throw new Error(`在目录 ${targetPath} 中未找到任何有效的${type}（包含${xmlFile}）`);
      }
      
      logInfo(`找到 ${componentDirs.length} 个${type}，准备逐个推送...`);
      
      // 逐个推送组件/插件
      const results = [];
      let successCount = 0;
      let failCount = 0;
      
      for (const componentDir of componentDirs) {
        try {
          logInfo(`正在推送${type}: ${path.basename(componentDir)}`);
          // 移除isNewComponent参数，实现智能判断
          const result = await pushByType(componentDir, type, null);
          
          if (result.success) {
            logSuccess(`${type} ${path.basename(componentDir)} 推送成功`);
            successCount++;
            results.push({ name: path.basename(componentDir), success: true, message: result.message });
          } else {
            logError(`${type} ${path.basename(componentDir)} 推送失败: ${result.message}`);
            failCount++;
            results.push({ name: path.basename(componentDir), success: false, message: result.message });
          }
        } catch (error) {
          logError(`${type} ${path.basename(componentDir)} 推送失败: ${error.message}`);
          failCount++;
          results.push({ name: path.basename(componentDir), success: false, message: error.message });
        }
      }
      
      // 输出汇总结果
      logInfo(`推送完成！成功: ${successCount}，失败: ${failCount}`);
      
      // 如果有失败的组件，打印失败组件名称
      if (failCount > 0) {
        const failedComponents = results.filter(r => !r.success).map(r => r.name);
        logError(`失败的${type}名称: ${failedComponents.join(', ')}`);
      }
      
      // 返回汇总结果
      return {
        success: failCount === 0,
        message: `推送完成！成功: ${successCount}，失败: ${failCount}`,
        results
      };
      }
    }
  }
  
  // 显示开始消息
  const pushTarget = resolvedSingleFilePath ? `${path.basename(resolvedSingleFilePath)}` : `${path.basename(targetPath)}`;
  const pushMode = resolvedSingleFilePath ? `单个文件` : `整个${type}`;
  logInfo(`开始推送 ${type} ${pushMode}，来源路径: ${targetPath}`);
  
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
      // 从文件名中提取API名称（支持带或不带.groovy扩展名）
      const apiName = fileName.replace(fileExtension, '');
      const key = `${type}:${apiName}`;
      
      // 检查文件是否在unchangeableJson.json中有记录
      if (!unchangeableJsonData[key]) {
        logError(`文件 ${fileName} 不在unchangeableJson.json中记录，无法推送`);
        throw new Error(`文件 ${fileName} 不在unchangeableJson.json中记录，无法推送`);
      }
      
      fileToCheck = key;
      // logInfo(`文件 ${fileName} 在unchangeableJson.json中有记录，可以推送`);
    } else {
      throw new Error(`unchangeableJson.json文件不存在，无法推送单个${type}文件`);
    }
  }
  
  try {
    logInfo(`正在推送 ${type} ${pushMode}...`);
    logInfo(`targetPath: ${targetPath}`);
    logInfo(`singleFilePath: ${resolvedSingleFilePath}`);
    logInfo(`fileToCheck: ${fileToCheck}`);
    // 执行推送，传入单个文件路径（如果有）
    // 移除isNewComponent参数，实现智能判断
    const result = await pushByType(targetPath, type, resolvedSingleFilePath);
    
    // 检查推送结果是否成功
    if (!result.success) {
      throw new Error(result.message || '推送失败');
    }
    
    // 如果是单个class或function文件推送成功，更新unchangeableJson.json
    if ((singleFilePath || pathParam) && (type === 'class' || type === 'function') && resolvedSingleFilePath) {
      if (fileToCheck && unchangeableJsonData) {
        // 更新updateTime为当前时间戳
        unchangeableJsonData[fileToCheck].updateTime = Date.now();
        
        // 写回unchangeableJson.json
        await fs.writeFile(unchangeableJsonPath, JSON.stringify(unchangeableJsonData, null, 2), 'utf8');
        logInfo(`已更新unchangeableJson.json中${fileToCheck}的记录`);
      }
    }
    
    logSuccess(`推送成功！${result.message || ''}`);
    
    return result;
  } catch (error) {
    logError(`推送失败: ${error.message}`);
    logError(`错误类型: ${typeof error}`);
    logError(`错误对象: ${JSON.stringify(error)}`);
    logError(`错误堆栈: ${error.stack}`);
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
    }
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
    // 1. 推送所有组件
    await pushAllByType('component', results);
    
    // 2. 推送所有插件
    await pushAllByType('plugin', results);
    
    // 3. 推送所有函数
    await pushAllFunctions(results);
    
    // 4. 推送所有类
    await pushAllByType('class', results);
    
    // 汇总结果
    const totalSuccess = results.components.success + results.plugins.success + 
                        results.functions.success + results.classes.success;
    const totalFailed = results.components.failed + results.plugins.failed + 
                       results.functions.failed + results.classes.failed;
    
    logInfo(`批量推送完成！成功: ${totalSuccess}，失败: ${totalFailed}`);
    
    // 输出各类别的详细结果
    const componentFailedNames = results.components.items.filter(item => !item.success).map(item => item.name).join(', ');
    const pluginFailedNames = results.plugins.items.filter(item => !item.success).map(item => item.name).join(', ');
    const functionFailedNames = results.functions.items.filter(item => !item.success).map(item => item.name).join(', ');
    const classFailedNames = results.classes.items.filter(item => !item.success).map(item => item.name).join(', ');
    
    logInfo(`组件: 成功 ${results.components.success}，失败 ${results.components.failed}${componentFailedNames ? ` (${componentFailedNames})` : ''}`);
    logInfo(`插件: 成功 ${results.plugins.success}，失败 ${results.plugins.failed}${pluginFailedNames ? ` (${pluginFailedNames})` : ''}`);
    logInfo(`函数: 成功 ${results.functions.success}，失败 ${results.functions.failed}${functionFailedNames ? ` (${functionFailedNames})` : ''}`);
    logInfo(`类: 成功 ${results.classes.success}，失败 ${results.classes.failed}${classFailedNames ? ` (${classFailedNames})` : ''}`);
    
    return {
      success: totalFailed === 0,
      message: `批量推送完成！成功: ${totalSuccess}，失败: ${totalFailed}`,
      results
    };
  } catch (error) {
    logError(`批量推送过程中发生错误: ${error.message}`);
    throw error;
  }
};

/**
 * 推送指定类型的所有项目
 * @param {string} type - 类型：component/plugin/class
 * @param {Object} results - 结果对象
 */
const pushAllByType = async (type, results) => {
  try {
    let targetPath;
    
    // 确定目标路径
    if (type === 'component' || type === 'plugin') {
      targetPath = path.join(projectRoot, 'fx-app', 'main', 'PWC', type + 's');
    } else if (type === 'class') {
      targetPath = path.join(projectRoot, 'fx-app', 'main', 'APL', 'classes');
    } else {
      logWarning(`不支持的类型: ${type}`);
      return;
    }
    
    // 检查目录是否存在
    if (!await fs.pathExists(targetPath)) {
      logWarning(`目录不存在，跳过${type}: ${targetPath}`);
      return;
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
        logInfo(`未找到任何${type}，跳过`);
        return;
      }
      
      logInfo(`找到 ${validDirs.length} 个${type}，准备逐个推送...`);
      
      // 逐个推送
      for (const dir of validDirs) {
        try {
          logInfo(`正在推送${type}: ${path.basename(dir)}`);
          const result = await pushByType(dir, type, null);
          
          if (result.success) {
            logSuccess(`${type} ${path.basename(dir)} 推送成功`);
            results[type + 's'].success++;
            results[type + 's'].items.push({ name: path.basename(dir), success: true, message: result.message });
          } else {
            logError(`${type} ${path.basename(dir)} 推送失败: ${result.message}`);
            results[type + 's'].failed++;
            results[type + 's'].items.push({ name: path.basename(dir), success: false, message: result.message });
          }
        } catch (error) {
          logError(`${type} ${path.basename(dir)} 推送失败: ${error.message}`);
          results[type + 's'].failed++;
          results[type + 's'].items.push({ name: path.basename(dir), success: false, message: error.message });
        }
      }
    } 
    // 对于类，处理单个文件
    else if (type === 'class') {
      // 获取所有.groovy文件
      const files = await fs.readdir(targetPath);
      const validFiles = files.filter(file => path.extname(file).toLowerCase() === '.groovy');
      
      if (validFiles.length === 0) {
        logInfo(`未找到任何${type}，跳过`);
        return;
      }
      
      logInfo(`找到 ${validFiles.length} 个${type}，准备逐个推送...`);
      
      // 逐个推送
      for (const file of validFiles) {
        try {
          const filePath = path.join(targetPath, file);
          logInfo(`正在推送${type}: ${file}`);
          
          // 直接调用pushClassService.pushClass，绕过pushByType函数
          const classResult = await pushClassService.pushClass(targetPath, filePath);
          
          // 检查返回结果格式
          if (classResult && classResult.results && Array.isArray(classResult.results)) {
            // 如果是数组，取第一个结果（因为我们只推送了一个文件）
            const result = classResult.results[0];
            if (result && result.success) {
              logSuccess(`${type} ${file} 推送成功`);
              results.classes.success++;
              results.classes.items.push({ name: file, success: true, message: result.message });
            } else {
              logError(`${type} ${file} 推送失败: ${result ? result.message : '未知错误'}`);
              results.classes.failed++;
              results.classes.items.push({ name: file, success: false, message: result ? result.message : '未知错误' });
            }
          } else if (classResult && classResult.success !== undefined) {
            // 如果是单个结果对象
            if (classResult.success) {
              logSuccess(`${type} ${file} 推送成功`);
              results.classes.success++;
              results.classes.items.push({ name: file, success: true, message: classResult.message });
            } else {
              logError(`${type} ${file} 推送失败: ${classResult.message}`);
              results.classes.failed++;
              results.classes.items.push({ name: file, success: false, message: classResult.message });
            }
          } else {
            // 其他情况视为失败
            logError(`${type} ${file} 推送失败: 返回结果格式不正确`);
            results.classes.failed++;
            results.classes.items.push({ name: file, success: false, message: '返回结果格式不正确' });
          }
        } catch (error) {
          logError(`${type} ${file} 推送失败: ${error.message}`);
          results.classes.failed++;
          results.classes.items.push({ name: file, success: false, message: error.message });
        }
      }
    }
  } catch (error) {
    logError(`推送${type}时发生错误: ${error.message}`);
  }
};

/**
 * 推送所有函数
 * @param {Object} results - 结果对象
 */
const pushAllFunctions = async (results) => {
  try {
    const functionsDir = path.join(projectRoot, 'fx-app', 'main', 'APL', 'functions');
    
    // 检查目录是否存在
    if (!await fs.pathExists(functionsDir)) {
      logWarning(`函数目录不存在，跳过: ${functionsDir}`);
      return;
    }
    
    logInfo(`开始批量推送函数...`);
    
    // 使用pushFunctionService中的pushAllFunctions方法
    const { pushAllFunctions } = require('../services/pushFunctionService');
    const functionResults = await pushAllFunctions(functionsDir);
    
    // 更新结果
    if (functionResults.results) {
      for (const item of functionResults.results) {
        if (item.success) {
          results.functions.success++;
          results.functions.items.push({ name: item.name, success: true, message: item.message });
        } else {
          results.functions.failed++;
          results.functions.items.push({ name: item.name, success: false, message: item.message });
        }
      }
    }
  } catch (error) {
    logError(`推送函数时发生错误: ${error.message}`);
  }
};