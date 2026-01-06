/**
 * 组件推送服务
 * 负责将组件/插件的代码推送到远程服务
 */

const fs = require('fs-extra');
const path = require('path');
const { readFileContent, shouldIgnore } = require('../utils/fileUtils');
const api = require('./api');
const { getConfigManager } = require('../core/ConfigManager');

// 日志级别枚举
const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN', 
  INFO: 'INFO',
  DEBUG: 'DEBUG'
};

// 日志颜色
const COLORS = {
  ERROR: '\x1b[31m', // 红色
  WARN: '\x1b[33m',  // 黄色
  INFO: '\x1b[36m',  // 青色
  DEBUG: '\x1b[32m', // 绿色
  RESET: '\x1b[0m'   // 重置
};

// 错误码映射配置 - 用于识别和分类不同类型的错误消息
const ERROR_CODE_MAPPING = {
  // 系统提示类（降级为警告）
  SYSTEM_NOTICES: [
    '提示信息',
    '系统提示',
    '未查询到该自定义函数' // 将查询不到函数的错误视为系统提示，允许继续创建流程
  ],
  
  // 错误类型映射
  ERROR_TYPES: {
    PERMISSION_DENIED: ['权限不足', '无权限', 'permission denied'],
    VALIDATION_ERROR: ['参数错误', '验证失败', '格式错误', 'invalid'],
    NOT_FOUND: ['不存在', '未找到', 'not found'],
    NETWORK_ERROR: ['网络错误', '连接失败', 'timeout', 'connection'],
    SERVER_ERROR: ['服务器错误', 'internal error', '500'],
    DUPLICATE_ERROR: ['已存在', '重复', 'duplicate', 'already exists']
  }
};

// 获取当前时间戳
const getTimestamp = () => {
  return new Date().toISOString().replace('T', ' ').substring(0, 23);
};

// 带颜色的日志输出
const logWithColor = (level, message, module = 'pushComponentService') => {
  // 禁用所有控制台日志输出，保持进度条显示简洁
  // 只通过返回结果和错误对象传递信息
  return;
};

// 简化的日志函数 - 默认只输出ERROR和WARN级别，保持输出简洁
const logger = {
  error: (message, module) => logWithColor(LOG_LEVELS.ERROR, message, module),
  warn: (message, module) => logWithColor(LOG_LEVELS.WARN, message, module),
  info: (message, module) => {}, // 禁用INFO级别日志
  debug: (message, module) => {} // 禁用DEBUG级别日志
};

// 错误处理工具
const errorHandler = {
  /**
   * 判断错误是否为系统提示类错误（应降级为警告）
   * @param {string} errorMessage - 错误消息
   * @returns {boolean} 是否为系统提示
   */
  isSystemNotice: (errorMessage) => {
    if (!errorMessage) return false;
    const lowerMessage = errorMessage.toLowerCase();
    return ERROR_CODE_MAPPING.SYSTEM_NOTICES.some(notice => 
      lowerMessage.includes(notice.toLowerCase())
    );
  },
  
  /**
   * 获取错误类型
   * @param {string} errorMessage - 错误消息
   * @returns {string} 错误类型
   */
  getErrorType: (errorMessage) => {
    if (!errorMessage) return 'UNKNOWN_ERROR';
    const lowerMessage = errorMessage.toLowerCase();
    
    for (const [errorType, keywords] of Object.entries(ERROR_CODE_MAPPING.ERROR_TYPES)) {
      if (keywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()))) {
        return errorType;
      }
    }
    
    return 'UNKNOWN_ERROR';
  },
  
  /**
   * 处理API响应中的错误
   * @param {Object} response - API响应对象
   * @param {string} operation - 操作名称
   * @returns {Object} 处理后的结果 { isError, errorType, message }
   */
  handleApiError: (response, operation = '操作') => {
    // 添加详细的调试日志
    logger.debug(`handleApiError 被调用，response: ${JSON.stringify(response, null, 2)}`);
    logger.debug(`handleApiError 被调用，response类型: ${typeof response}`);
    logger.debug(`handleApiError 被调用，operation: ${operation}`);
    
    if (!response) {
      logger.error(`${operation}失败: 无效的响应对象`);
      return {
        isError: true,
        errorType: 'INVALID_RESPONSE',
        message: '无效的响应对象'
      };
    }
    
    if (response.Result && response.Result.StatusCode !== 0) {
      // StatusCode不为0，检查是否是特殊错误
      const errorMessage = response.Result?.FailureMessage || response.Error?.Message || '未知错误';
      
      // 特殊处理：将"未查询到该自定义函数"视为系统提示，允许继续创建流程
      if (errorHandler.isSystemNotice(errorMessage) || errorMessage.includes('未查询到该自定义函数')) {
        // 降级为警告
        logger.warn(`系统提示: ${errorMessage}`);
        return {
          isError: false,
          errorType: 'SYSTEM_NOTICE',
          message: errorMessage
        };
      }
      
      // 其他错误确认为错误
      const errorType = errorHandler.getErrorType(errorMessage);
      
      logger.error(`${operation}失败 [${errorType}]: ${errorMessage}`);
      return {
        isError: true,
        errorType,
        message: errorMessage
      };
    } else if (response?.Error?.Message) {
      // StatusCode为0但有Error，检查是否为系统提示或令牌升级提示
      const errorMessage = response.Error.Message;
      
      // 仅保留系统提示检查，令牌升级提示由api.js统一处理
      if (errorHandler.isSystemNotice(errorMessage)) {
        // 系统提示或令牌升级提示降级为警告
        logger.warn(`系统提示: ${errorMessage}`);
        return {
          isError: false,
          errorType: 'SYSTEM_NOTICE',
          message: errorMessage
        };
      } else {
        // 其他错误仍作为错误处理
        const errorType = errorHandler.getErrorType(errorMessage);
        logger.error(`${operation}发生错误 [${errorType}]: ${errorMessage}`);
        return {
          isError: true,
          errorType,
          message: errorMessage
        };
      }
    }
    
    // 没有错误
    return {
      isError: false,
      errorType: null,
      message: null
    };
  }
};

/**
 * 从服务器获取组件信息
 * @param {string} apiName - 组件的API名称
 * @returns {Promise<Object>} 组件信息
 */
const getComponent = async (apiName) => {
  try {
    logger.info(`正在从服务器获取组件信息: ${apiName}`);
    
    // 使用fetchComponents方法获取组件列表
    const components = await api.fetchComponents('component', apiName);
    
    // 查找匹配的组件
    const component = components.find(comp => 
      comp.apiName === apiName || 
      comp.api_name === apiName ||
      comp.name === apiName
    );
    
    if (component) {
      logger.info(`成功获取组件信息: ${apiName}`);
      return component;
    } else {
      logger.warn(`未找到组件: ${apiName}`);
      return null;
    }
  } catch (error) {
    logger.error(`获取组件信息失败: ${error.message}`);
    throw error;
  }
};

// 初始化ConfigManager
const configManager = getConfigManager();

/**
 * 从组件路径获取项目根目录路径
 * @param {string} componentPath - 组件目录路径
 * @returns {Promise<string>} 项目根目录路径
 */
const getProjectPath = async (componentPath) => {
  let currentPath = componentPath;
  
  // 向上遍历目录，直到找到包含unchangeableJson.json的目录
  // 最多向上查找10级目录，确保能找到项目根目录
  for (let i = 0; i < 10; i++) {
    const unchangeableJsonPath = path.join(currentPath, 'unchangeableJson.json');
    if (fs.existsSync(unchangeableJsonPath)) {
      logger.info(`找到unchangeableJson.json文件在: ${currentPath}`);
      return currentPath;
    }
    
    // 如果已经到达根目录，停止查找
    if (currentPath === path.dirname(currentPath)) {
      break;
    }
    
    // 向上移动一级目录
    currentPath = path.dirname(currentPath);
  }
  
  // 如果没有找到unchangeableJson.json，使用当前目录
  logger.warn('未找到unchangeableJson.json文件，使用当前目录作为项目根目录');
  return componentPath;
};

/**
 * 推送组件/插件代码
 * @param {string} componentPath - 组件/插件目录路径或单个文件路径
 * @param {string} type - 类型：component或plugin
 * @param {string} singleFilePath - 单个文件路径（可选，用于推送单个文件）
 * @returns {Promise<Object>} 推送结果
 */
const pushComponent = async (componentPath, type = 'component', singleFilePath = null) => {
  try {
    logger.info(`开始推送${type}: ${componentPath}`);
    
    // 初始化请求数据对象，确保所有字段都被正确初始化
    const askData = {
      sourceFiles: [],
      fileTree: [],
      images: []
    };
    
    logger.info('已初始化askData对象');
    // 获取组件/插件的基本信息
    const componentName = path.basename(componentPath);
    logger.info(`组件名称: ${componentName}`);
    
    // 根据类型使用固定的XML文件名
    const xmlFileName = type === 'component' ? 'component.xml' : type === 'plugin' ? 'plugin.xml' : `${componentName}.xml`;
    const xmlPath = path.join(componentPath, xmlFileName);
    logger.info(`XML文件路径: ${xmlPath}`);
    
    // 检查XML文件是否存在
    if (!fs.existsSync(xmlPath)) {
      logger.error(`找不到 ${xmlFileName} 文件`);
      throw new Error(`找不到 ${xmlFileName} 文件`);
    }

    // 读取XML内容
    const xmlContent = await readFileContent(xmlPath);
    logger.info(`XML内容长度: ${xmlContent ? xmlContent.length : 0}`);
    
    // 设置组件ID为组件名称，确保符合coding变量命名规则并带有__c后缀
    let sanitizedComponentName = componentName;
    
    // 移除__c后缀（如果存在）以便统一处理
    if (sanitizedComponentName.endsWith('__c')) {
      sanitizedComponentName = sanitizedComponentName.slice(0, -3);
    }
    
    // 清理组件名称，确保符合coding变量命名规则：
    // 1. 将非字母、数字、下划线的字符替换为下划线
    // 2. 如果以数字开头，在前面添加下划线
    sanitizedComponentName = sanitizedComponentName
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^(?=\d)/, '_');
    
    // 确保组件ID带有__c后缀
    let componentId = `${sanitizedComponentName}__c`;
    
    // 与extension完全一致：检查源代码目录
    const sourceFilesPath = path.join(componentPath, 'sourceFiles');
    const fileTreePath = path.join(componentPath, 'fileTree');
    logger.info(`检查源代码目录: sourceFiles=${sourceFilesPath}, fileTree=${fileTreePath}`);
    
    // 与extension完全一致：处理sourceFiles目录
    if (fs.existsSync(sourceFilesPath)) {
      logger.info('找到sourceFiles目录');
      const sourceDir = sourceFilesPath;
      
      if (singleFilePath) {
        // 如果指定了单个文件，只推送该文件
        logger.info('处理单个文件:', singleFilePath);
        const relativePath = path.relative(sourceDir, singleFilePath);
        if (!fs.existsSync(singleFilePath)) {
          logger.error(`文件不存在: ${singleFilePath}`);
          throw new Error(`文件不存在: ${singleFilePath}`);
        }
        
        // 创建单个文件对象
        const stats = await fs.stat(singleFilePath);
        askData.sourceFiles.push({
          fileSize: stats.size,
          fileName: path.basename(singleFilePath),
          filePath: relativePath,
          fullPath: singleFilePath  // 保存完整路径用于后续上传
        });
        logger.info('已添加单个文件到sourceFiles数组');
      } else {
        // 推送整个sourceFiles目录
        logger.info('处理整个sourceFiles目录');
        const readDir = async (dirPath, basePath = '') => {
          const files = await fs.readdir(dirPath);
          logger.info(`读取目录 ${dirPath}，文件数量: ${files.length}`);
          for (const file of files) {
            if (shouldIgnore(file)) continue;
            const filePath = path.join(dirPath, file);
            const stats = await fs.stat(filePath);
            if (stats.isDirectory()) {
              await readDir(filePath, basePath ? path.join(basePath, file) : file);
            } else {
              // 创建文件对象，不立即转换为base64
              logger.info(`添加文件: ${file}`);
              askData.sourceFiles.push({
                fileSize: stats.size,
                fileName: file,
                filePath: basePath ? path.join(basePath, file) : file,
                fullPath: filePath  // 保存完整路径用于后续上传
              });
            }
          }
        };
        await readDir(sourceDir);
        logger.info(`已添加所有文件到sourceFiles数组，总数: ${askData.sourceFiles.length}`);
      }
    }
    // 与extension完全一致：处理fileTree目录
    else if (fs.existsSync(fileTreePath)) {
      const sourceDir = fileTreePath;
      
      if (singleFilePath) {
        // 如果指定了单个文件，只推送该文件
        const relativePath = path.relative(sourceDir, singleFilePath);
        if (!fs.existsSync(singleFilePath)) {
          logger.error(`文件不存在: ${singleFilePath}`);
          throw new Error(`文件不存在: ${singleFilePath}`);
        }
        
        // 创建单个文件对象
        const stats = await fs.stat(singleFilePath);
        
        const fileObj = {
          fileSize: stats.size,
          fileName: path.basename(singleFilePath),
          filePath: relativePath,
          fullPath: singleFilePath,  // 保存完整路径用于后续上传
          path: ''
        };
        
        // 与extension完全一致：设置path属性
        const pathParts = relativePath.split('/');
        if (pathParts.length > 1) {
          pathParts.pop();
          fileObj.path = pathParts.join('/');
        }
        
        askData.fileTree.push(fileObj);
      } else {
        // 推送整个fileTree目录
        const readDir = async (dirPath, basePath = '') => {
          const files = await fs.readdir(dirPath);
          for (const file of files) {
            if (shouldIgnore(file)) continue;
            const filePath = path.join(dirPath, file);
            const stats = await fs.stat(filePath);
            if (stats.isDirectory()) {
              await readDir(filePath, basePath ? path.join(basePath, file) : file);
            } else {
              // 创建文件对象，不立即转换为base64
              const fileObj = {
                fileSize: stats.size,
                fileName: file,
                filePath: basePath ? path.join(basePath, file) : file,
                fullPath: filePath,  // 保存完整路径用于后续上传
                path: ''
              };
              
              // 与extension完全一致：设置path属性
              const fullFilePath = basePath ? path.join(basePath, file) : file;
              const pathParts = fullFilePath.split('/');
              if (pathParts.length > 1) {
                pathParts.pop();
                fileObj.path = pathParts.join('/');
              }
              
              askData.fileTree.push(fileObj);
            }
          }
        };
        await readDir(sourceDir);
      }
    }
    else {
      logger.error(`找不到源代码目录 sourceFiles 或 fileTree`);
      throw new Error(`找不到源代码目录 sourceFiles 或 fileTree`);
    }
    
    // 与extension完全一致：准备静态资源（如果存在）
    const staticDirPath = path.join(componentPath, 'static');
    if (fs.existsSync(staticDirPath)) {
      const readDir = async (dirPath, basePath = '') => {
        const files = await fs.readdir(dirPath);
        for (const file of files) {
          if (shouldIgnore(file)) continue;
          const filePath = path.join(dirPath, file);
          const stats = await fs.stat(filePath);
          if (stats.isDirectory()) {
            await readDir(filePath, basePath ? path.join(basePath, file) : file);
          } else {
            // 与extension完全一致：创建文件对象，不转换为base64，后续上传获取TempFileName
            askData.images.push({
              fileSize: stats.size,
              fileName: file,
              filePath: basePath ? path.join(basePath, file) : file,
              fullPath: filePath  // 保存完整路径用于后续上传
            });
          }
        }
      };
      await readDir(staticDirPath);
    }
    
    // 调试信息：打印构建的请求数据结构
    logger.info('构建的请求数据结构:');
    logger.info(`name: ${componentName}`);
    logger.info(`mateXml: ${xmlContent ? '存在' : '不存在'}`);
    logger.info(`apiName: ${componentId}`);
    logger.info(`sourceFiles数量: ${(askData.sourceFiles || []).length}`);
    logger.info(`fileTree数量: ${(askData.fileTree || []).length}`);
    logger.info(`images数量: ${(askData.images || []).length}`);
    logger.info(`type: ${type}`);
    logger.info(`updateTime: ${0}`);
    
    // 与extension完全一致：获取项目路径和unchangeableJson文件路径
    const projectPath = await getProjectPath(componentPath);
    const unchangeableJsonPath = path.join(projectPath, 'unchangeableJson.json');
    
    // 与extension完全一致：从unchangeableJson获取apiName和updateTime
    // 检查unchangeableJson.json文件是否存在
    let updateTime = Date.now(); // 默认使用当前时间
    
    // 智能判断：检查unchangeableJson.json文件中是否已存在该组件
    if (fs.existsSync(unchangeableJsonPath)) {
      // 读取unchangeableJson.json文件
      const unchangeableJsonContent = await readFileContent(unchangeableJsonPath);
      const unchangeableJson = JSON.parse(unchangeableJsonContent);
      
      // 尝试使用原始组件名称和清理后的组件名称作为键名
      const originalComponentKey = `component:${componentName}`;
      const sanitizedComponentKey = `component:${sanitizedComponentName}`;
      
      // 检查组件是否已存在于unchangeableJson.json中
      if (unchangeableJson[originalComponentKey]) {
        componentId = unchangeableJson[originalComponentKey].apiName;
        updateTime = unchangeableJson[originalComponentKey].updateTime;
        logger.info(`组件 ${componentName} 已存在于unchangeableJson.json中，apiName: ${componentId}, updateTime: ${updateTime}`);
      } else if (unchangeableJson[sanitizedComponentKey]) {
        componentId = unchangeableJson[sanitizedComponentKey].apiName;
        updateTime = unchangeableJson[sanitizedComponentKey].updateTime;
        logger.info(`组件 ${sanitizedComponentName} 已存在于unchangeableJson.json中，apiName: ${componentId}, updateTime: ${updateTime}`);
      } else {
        logger.info(`组件 ${componentName} 不存在于unchangeableJson.json中，将创建新组件`);
      }
    } else {
      logger.info(`unchangeableJson.json文件不存在，将创建新组件`);
    }
    
    // 上传所有文件并获取TempFileName
    if (askData.sourceFiles.length > 0) {
      for (const file of askData.sourceFiles) {
        try {
          const uploadResult = await api.uploadFile(file.fullPath);
          
          if (uploadResult && uploadResult.TempFileName) {
            // 与extension完全一致：将filePath替换为TempFileName
            file.filePath = uploadResult.TempFileName;
          } else {
            // 记录警告但继续执行，避免因令牌问题导致整个推送失败
            logger.warn(`上传文件 ${file.fileName} 未返回TempFileName，可能是令牌需要升级，将继续执行:`, uploadResult);
          }
          delete file.fullPath; // 移除本地路径
        } catch (error) {
          // 记录错误但继续执行，避免因单个文件上传失败导致整个推送失败
          logger.error(`上传文件 ${file.fileName} 失败:`, error.message);
        }
      }
    }

    // 上传fileTree中的文件
    if (askData.fileTree.length > 0) {
      for (const file of askData.fileTree) {
        try {
          const uploadResult = await api.uploadFile(file.fullPath);
          
          if (uploadResult && uploadResult.TempFileName) {
            // 与extension完全一致：将filePath替换为TempFileName
            file.filePath = uploadResult.TempFileName;
            delete file.fullPath; // 移除本地路径
          } else {
            // 记录警告但继续执行，避免因单个文件上传失败导致整个推送失败
            logger.warn(`上传文件 ${file.fileName} 未返回TempFileName，可能是令牌需要升级，将继续执行:`, uploadResult);
          }
        } catch (error) {
          // 记录错误但继续执行，避免因单个文件上传失败导致整个推送失败
          logger.error(`上传文件 ${file.fileName} 失败:`, error.message);
        }
      }
    }

    // 与extension完全一致：上传静态资源文件
    if (askData.images.length > 0) {
      for (const file of askData.images) {
        try {
          const uploadResult = await api.uploadFile(file.fullPath);
          
          if (uploadResult && uploadResult.TempFileName) {
            // 与extension完全一致：将filePath替换为TempFileName
            file.filePath = uploadResult.TempFileName;
            delete file.fullPath; // 移除本地路径
          } else {
            // 记录警告但继续执行，避免因单个文件上传失败导致整个推送失败
            logger.warn(`上传静态资源文件 ${file.fileName} 未返回TempFileName，可能是令牌需要升级，将继续执行:`, uploadResult);
          }
        } catch (error) {
          // 记录错误但继续执行，避免因单个文件上传失败导致整个推送失败
          logger.error(`上传静态资源文件 ${file.fileName} 失败:`, error.message);
        }
      }
    }

    // 与extension完全一致：构建请求数据
    const data = {
      name: componentName,
      mateXml: xmlContent,  // 与extension保持一致：使用mateXml而不是xml
      apiName: componentId,  // 与extension保持一致：使用apiName而不是id
      sourceFiles: askData.sourceFiles || [],  // 与extension完全一致：sourceFiles字段
      fileTree: askData.fileTree || [],  // 与extension完全一致：fileTree字段
      images: askData.images || [],  // 与extension完全一致：images字段
      type: 'component',  // 与extension完全一致：type固定为'component'
      updateTime: updateTime  // 与extension完全一致：从unchangeableJson获取updateTime
    };
    
    // 对于新组件，设置updateTime为0，让服务端自动生成
    // 对于已存在组件，使用从unchangeableJson获取的updateTime
    if (!fs.existsSync(unchangeableJsonPath)) {
      // unchangeableJson.json文件不存在，说明是新项目，所有组件都是新组件
      data.updateTime = 0;
      logger.info(`unchangeableJson.json文件不存在，设置updateTime为0，让服务端自动生成`);
    } else {
      // 读取unchangeableJson.json文件
      const unchangeableJsonContent = await readFileContent(unchangeableJsonPath);
      const unchangeableJson = JSON.parse(unchangeableJsonContent);
      
      // 尝试使用原始组件名称和清理后的组件名称作为键名
      const originalComponentKey = `component:${componentName}`;
      const sanitizedComponentKey = `component:${sanitizedComponentName}`;
      
      // 检查组件是否已存在于unchangeableJson.json中
      if (unchangeableJson[originalComponentKey]) {
        // 组件已存在，使用从unchangeableJson获取的updateTime
        data.updateTime = unchangeableJson[originalComponentKey].updateTime;
        logger.info(`组件 ${componentName} 已存在于unchangeableJson.json中，使用updateTime: ${data.updateTime}`);
      } else if (unchangeableJson[sanitizedComponentKey]) {
        // 组件已存在，使用从unchangeableJson获取的updateTime
        data.updateTime = unchangeableJson[sanitizedComponentKey].updateTime;
        logger.info(`组件 ${sanitizedComponentName} 已存在于unchangeableJson.json中，使用updateTime: ${data.updateTime}`);
      } else {
        // 组件不存在，设置updateTime为0，让服务端自动生成
        data.updateTime = 0;
        logger.info(`组件 ${componentName} 不存在于unchangeableJson.json中，设置updateTime为0，让服务端自动生成`);
      }
    }
    
    // 调试信息：打印构建的请求数据结构
    logger.info('构建的请求数据结构:');
    logger.info(`name: ${componentName}`);
    logger.info(`mateXml: ${xmlContent ? '存在' : '不存在'}`);
    logger.info(`apiName: ${componentId}`);
    logger.info(`sourceFiles数量: ${(data.sourceFiles || []).length}`);
    logger.info(`fileTree数量: ${(data.fileTree || []).length}`);
    logger.info(`images数量: ${(data.images || []).length}`);
    logger.info(`type: ${type}`);
    logger.info(`updateTime: ${updateTime}`);
    
    // 与extension完全一致：如果fileTree存在且有内容，删除sourceFiles字段
    if (data.fileTree && data.fileTree.length > 0) {
      logger.info('删除sourceFiles字段，因为fileTree存在且有内容');
      delete data.sourceFiles;
    } else {
      // 确保sourceFiles字段存在，避免"sourceFiles is not defined"错误
      if (!data.sourceFiles) {
        logger.info('添加空的sourceFiles字段');
        data.sourceFiles = [];
      }
    }
    
    // 再次检查sourceFiles字段
    logger.info(`处理后sourceFiles数量: ${(data.sourceFiles || []).length}`);
    logger.info(`处理后fileTree数量: ${(data.fileTree || []).length}`);
    
    // 确保sourceFiles字段存在，避免"sourceFiles is not defined"错误
    if (!data.sourceFiles) {
      logger.info('最终检查：添加空的sourceFiles字段');
      data.sourceFiles = [];
    }
    
    // 调用API上传代码 - 使用api.js中定义的uploadComponent函数
    // 注意：api.uploadComponent内部已经将数据包装在component对象中
    logger.info('请求数据概要:');
    logger.info(`name: ${data.name}`);
    logger.info(`apiName: ${data.apiName}`);
    logger.info(`type: ${data.type}`);
    logger.info(`updateTime: ${data.updateTime}`);
    logger.info(`mateXml长度: ${data.mateXml ? data.mateXml.length : 0}`);
    logger.info(`sourceFiles数量: ${(data.sourceFiles || []).length}`);
    logger.info(`fileTree数量: ${(data.fileTree || []).length}`);
    logger.info(`images数量: ${(data.images || []).length}`);
    
    let response;
    let errorResult;
    
    try {
      // 第一次尝试推送
      response = await api.uploadComponent(data);
      
      // 打印完整响应
      logger.info('API响应:', JSON.stringify(response, null, 2));
      
      // 使用errorHandler处理API响应错误
      errorResult = errorHandler.handleApiError(response, '推送组件');
      
      // 如果是错误，则抛出异常
      if (errorResult.isError) {
        // 如果错误是"已存在相同的apiName"，尝试使用正确的updateTime重试
        if (errorResult.message && errorResult.message.includes('已存在相同的apiName')) {
          logger.info(`检测到"已存在相同的apiName"错误，尝试使用updateTime=${updateTime}重试`);
          
          // 修改updateTime为从unchangeableJson获取的值
          data.updateTime = updateTime;
          
          // 再次调用API
          logger.info('使用正确的updateTime重试推送...');
          const retryResponse = await api.uploadComponent(data);
          
          // 打印重试响应
          logger.info('重试API响应:', JSON.stringify(retryResponse, null, 2));
          
          // 使用errorHandler处理重试响应错误
          const retryErrorResult = errorHandler.handleApiError(retryResponse, '推送组件');
          
          // 如果重试还是错误，则抛出异常
          if (retryErrorResult.isError) {
            throw new Error(retryErrorResult.message);
          }
          
          // 使用重试成功的响应
          response = retryResponse;
          errorResult = { isError: false };
        } else {
          throw new Error(errorResult.message);
        }
      }
    } catch (error) {
      // 如果是"系统出现异常"错误，尝试将updateTime设置为0并重试一次
      if (error.message && error.message.includes('系统出现异常') && data.updateTime !== 0) {
        logger.warn(`推送失败，尝试将updateTime设置为0并重试...`);
        data.updateTime = 0;
        
        try {
          // 再次调用API推送组件
          const retryResponse = await api.uploadComponent(data);
          
          // 打印重试响应
          logger.info('重试API响应:', JSON.stringify(retryResponse, null, 2));
          
          // 使用errorHandler处理重试响应错误
          const retryErrorResult = errorHandler.handleApiError(retryResponse, '推送组件');
          
          // 如果重试还是错误，则抛出原始错误
          if (retryErrorResult.isError) {
            logger.error(`重试失败: ${retryErrorResult.message}`);
            throw error;
          }
          
          // 使用重试成功的响应
          response = retryResponse;
          errorResult = { isError: false };
        } catch (retryError) {
          // 如果重试仍然失败，抛出原始错误
          logger.error(`重试失败: ${retryError.message}`);
          throw error;
        }
      } else if (error.message && error.message.includes('当前代码在线上有更高版本') && data.updateTime !== 0) {
        // 如果是"当前代码在线上有更高版本"错误，尝试从服务器获取最新组件信息并重试
        logger.warn(`检测到版本冲突，尝试从服务器获取最新组件信息...`);
        
        try {
          // 从服务器获取最新组件信息
          const componentInfo = await getComponent(componentId);
          
          if (componentInfo && componentInfo.updateTime) {
            // 使用服务器返回的最新updateTime
            const latestUpdateTime = componentInfo.updateTime;
            logger.info(`获取到服务器最新updateTime: ${latestUpdateTime}`);
            
            // 更新本地的unchangeableJson.json文件中的updateTime
            try {
              const projectRoot = configManager.getSync('project.rootDir') || process.cwd();
              const unchangeableJsonPath = path.join(projectRoot, 'unchangeableJson.json');
              
              if (fs.existsSync(unchangeableJsonPath)) {
                // 读取当前的unchangeableJson文件
                const unchangeableJsonContent = await readFileContent(unchangeableJsonPath);
                const unchangeableJson = JSON.parse(unchangeableJsonContent);
                
                // 构建组件的键名
                const originalComponentKey = `component:${componentName}`;
                const sanitizedComponentKey = `component:${sanitizedComponentName}`;
                
                // 智能判断：根据组件是否已存在于unchangeableJson.json中决定使用哪个键名
                let componentKey;
                if (unchangeableJson[originalComponentKey]) {
                  componentKey = originalComponentKey;
                } else if (unchangeableJson[sanitizedComponentKey]) {
                  componentKey = sanitizedComponentKey;
                } else {
                  componentKey = originalComponentKey;
                }
                
                // 更新组件记录
                if (unchangeableJson[componentKey]) {
                  unchangeableJson[componentKey].updateTime = latestUpdateTime;
                  logger.info(`更新本地unchangeableJson.json中的组件 ${componentKey} 的updateTime为 ${latestUpdateTime}`);
                  
                  // 保存更新后的unchangeableJson文件
                  await fs.writeFile(unchangeableJsonPath, JSON.stringify(unchangeableJson, null, 2));
                  logger.info(`成功更新本地unchangeableJson.json文件`);
                }
              }
            } catch (updateError) {
              logger.warn(`更新本地unchangeableJson.json文件失败: ${updateError.message}`);
            }
            
            // 使用最新的updateTime重试推送
            data.updateTime = latestUpdateTime;
            logger.info(`使用最新的updateTime=${latestUpdateTime}重试推送...`);
            
            // 再次调用API推送组件
            const retryResponse = await api.uploadComponent(data);
            
            // 打印重试响应
            logger.info('重试API响应:', JSON.stringify(retryResponse, null, 2));
            
            // 使用errorHandler处理重试响应错误
            const retryErrorResult = errorHandler.handleApiError(retryResponse, '推送组件');
            
            // 如果重试还是错误，则抛出原始错误
            if (retryErrorResult.isError) {
              logger.error(`重试失败: ${retryErrorResult.message}`);
              throw error;
            }
            
            // 使用重试成功的响应
            response = retryResponse;
            errorResult = { isError: false };
          } else {
            // 无法从服务器获取组件信息，使用本地updateTime重试
            logger.warn(`无法从服务器获取组件信息，使用本地updateTime=${updateTime}重试...`);
            data.updateTime = updateTime;
            
            // 再次调用API推送组件
            const retryResponse = await api.uploadComponent(data);
            
            // 打印重试响应
            logger.info('重试API响应:', JSON.stringify(retryResponse, null, 2));
            
            // 使用errorHandler处理重试响应错误
            const retryErrorResult = errorHandler.handleApiError(retryResponse, '推送组件');
            
            // 如果重试还是错误，则抛出原始错误
            if (retryErrorResult.isError) {
              logger.error(`重试失败: ${retryErrorResult.message}`);
              throw error;
            }
            
            // 使用重试成功的响应
            response = retryResponse;
            errorResult = { isError: false };
          }
        } catch (retryError) {
          // 如果重试仍然失败，抛出原始错误
          logger.error(`重试失败: ${retryError.message}`);
          throw error;
        }
      } else {
        // 如果不是可重试的错误，或者已经是第二次尝试，直接抛出错误
        throw error;
      }
    }
    
    // 更新本地的unchangeableJson.json文件
    try {
      const projectRoot = configManager.getSync('project.rootDir') || process.cwd();
      const unchangeableJsonPath = path.join(projectRoot, 'unchangeableJson.json');
      
      if (fs.existsSync(unchangeableJsonPath)) {
        // 读取当前的unchangeableJson文件
        const unchangeableJsonContent = await readFileContent(unchangeableJsonPath);
        const unchangeableJson = JSON.parse(unchangeableJsonContent);
        
        // 构建组件的键名
        // 尝试使用原始组件名称和清理后的组件名称作为键名
        const originalComponentKey = `component:${componentName}`;
        const sanitizedComponentKey = `component:${sanitizedComponentName}`;
        
        // 智能判断：根据组件是否已存在于unchangeableJson.json中决定使用哪个键名
        let componentKey;
        if (unchangeableJson[originalComponentKey]) {
          // 组件已存在，使用原始组件名称作为键名
          componentKey = originalComponentKey;
          logger.info(`组件已存在，使用原始组件名称作为组件键名: ${componentKey}`);
        } else if (unchangeableJson[sanitizedComponentKey]) {
          // 组件已存在，使用清理后的组件名称作为键名
          componentKey = sanitizedComponentKey;
          logger.info(`组件已存在，使用清理后的组件名称作为组件键名: ${componentKey}`);
        } else {
          // 组件不存在，使用原始组件名称作为键名
          componentKey = originalComponentKey;
          logger.info(`组件不存在，使用原始组件名称作为组件键名: ${componentKey}`);
        }
        
        // 获取最新的updateTime（如果API返回了话）
        const latestUpdateTime = response?.Value?.updateTime || Date.now();
        
        // 更新或创建组件记录
        if (unchangeableJson[componentKey]) {
          // 更新现有的组件记录
          unchangeableJson[componentKey].updateTime = latestUpdateTime;
          logger.info(`更新unchangeableJson.json中的组件 ${componentKey} 的updateTime为 ${latestUpdateTime}`);
        } else {
          // 创建新的组件记录
          unchangeableJson[componentKey] = {
            apiName: componentId,
            type: 'component',
            updateTime: latestUpdateTime,
            // 保存组件的基本信息
            name: componentName
          };
          logger.info(`在unchangeableJson.json中创建新的组件记录 ${componentKey}`);
        }
        
        // 保存更新后的unchangeableJson文件
        await fs.writeFile(unchangeableJsonPath, JSON.stringify(unchangeableJson, null, 2));
        logger.info(`成功更新unchangeableJson.json文件`);
      } else {
        logger.info(`unchangeableJson.json文件不存在，跳过更新`);
      }
    } catch (error) {
      logger.warn(`更新unchangeableJson.json文件失败: ${error.message}`);
    }

    return {
      success: true,
      name: componentName,
      id: response.Value?.id || componentId,  // 与extension保持一致：使用response.Value
      message: response.Value?.message || '推送成功'
    };
  } catch (error) {
    logger.error(`推送${type}失败 [${path.basename(componentPath)}]: ${error.message}`);
    throw new Error(`推送${type}失败 [${path.basename(componentPath)}]: ${error.message}`);
  }
};

/**
 * 部署组件/插件
 * @param {string} componentPath - 组件/插件目录路径
 * @param {string} type - 类型：component或plugin
 * @param {string} env - 环境：dev/test/prod
 * @returns {Promise<Object>} 部署结果
 */
const deployComponent = async (componentPath, type = 'component', env = 'dev') => {
  try {
    logger.info(`开始部署${type}到${env}环境...`);
    // 1. 首先推送代码
    const pushResult = await pushComponent(componentPath, type);
    
    // 2. 然后构建组件 - 使用api.js中的buildComponent函数
    logger.info(`开始构建${type}...`);
    const buildResult = await api.buildComponent(pushResult.id);
    
    // 3. 部署到指定环境（如果需要）
    // 注意：这里可能需要根据实际API调整部署逻辑
    // 有些系统可能在构建成功后自动部署到开发环境
    
    logger.info(`部署${type}到${env}环境成功!`);
    return {
      success: true,
      name: pushResult.name,
      id: pushResult.id,
      buildId: buildResult.data?.buildId || buildResult.buildId,
      env: env,
      message: '部署成功'
    };
  } catch (error) {
    logger.error(`部署${type}到${env}环境失败: ${error.message}`);
    throw new Error(`部署${type}失败: ${error.message}`);
  }
};

module.exports = {
  pushComponent,
  deployComponent
};