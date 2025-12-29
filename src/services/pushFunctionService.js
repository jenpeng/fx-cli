const fs = require('fs-extra');
const path = require('path');
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

// 获取当前时间戳
const getTimestamp = () => {
  return new Date().toISOString().replace('T', ' ').substring(0, 23);
};

// 带颜色的日志输出
const logWithColor = (level, message, module = 'pushFunctionService') => {
  const timestamp = getTimestamp();
  const color = COLORS[level] || COLORS.RESET;
  console.log(`${color}[${timestamp}] [${module}] [${level}] ${message}${COLORS.RESET}`);
};

// 简化的日志函数
const logger = {
  error: (message, module) => logWithColor(LOG_LEVELS.ERROR, message, module),
  warn: (message, module) => logWithColor(LOG_LEVELS.WARN, message, module),
  info: (message, module) => logWithColor(LOG_LEVELS.INFO, message, module),
  debug: (message, module) => logWithColor(LOG_LEVELS.DEBUG, message, module)
};

// 导入ConfigManager并初始化
const configManager = getConfigManager();

// 获取证书数据 - 优先从项目根目录的certificate.json读取，与extension行为保持一致
const getCertificateData = async () => {
  try {
    // 1. 优先尝试从项目根目录的certificate.json文件读取，这与extension的行为完全一致
    const certificateJsonPath = path.join(process.cwd(), 'certificate.json');
    if (await fs.pathExists(certificateJsonPath)) {
      logger.info(`从项目根目录的certificate.json读取证书信息`);
      const certificateContent = await fs.readFile(certificateJsonPath, 'utf8');
      const certificateData = JSON.parse(certificateContent);
      
      // 验证必要字段
      if (certificateData.domain && certificateData.certificate) {
        logger.info(`成功从certificate.json读取证书信息，域名: ${certificateData.domain}`);
        return certificateData;
      } else {
        logger.warn(`certificate.json文件缺少必要字段`);
      }
    }
    
    // 2. 备选方案：从ConfigManager读取
    const authInfo = await configManager.get('auth');
    if (authInfo && authInfo.domain && authInfo.certificate) {
      logger.info(`从ConfigManager读取证书信息，域名: ${authInfo.domain}`);
      return {
        domain: authInfo.domain,
        certificate: authInfo.certificate
      };
    }
    
    throw new Error('无法获取证书信息，请确保已登录或certificate.json文件存在且有效');
  } catch (error) {
    logger.error(`获取证书数据失败: ${error.message}`);
    throw error;
  }
};

/**
 * 推送函数服务
 */
class PushFunctionService {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.colors = {
      reset: '\x1b[0m',
      bright: '\x1b[1m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m'
    };
    this.errorCodes = {
      '400': '请求参数错误',
      '401': '未授权访问',
      '403': '访问被拒绝',
      '404': '资源不存在',
      '409': '资源冲突',
      '500': '服务器内部错误',
      '502': '网关错误',
      '503': '服务不可用'
    };
  }

  /**
   * 记录日志
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {string} color - 颜色代码
   */
  log(level, message, color = this.colors.reset) {
    const timestamp = new Date().toISOString();
    const levelColors = {
      info: this.colors.blue,
      warn: this.colors.yellow,
      error: this.colors.red,
      debug: this.colors.cyan
    };
    
    if (this.logLevel === 'debug' || ['info', 'warn', 'error'].includes(level)) {
      console.log(`${color}[${timestamp}] [${level.toUpperCase()}]${this.colors.reset} ${message}`);
    }
  }

  /**
   * 读取文件内容
   * @param {string} filePath - 文件路径
   * @returns {Promise<string>} 文件内容
   */
  async readFileContent(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return content;
    } catch (error) {
      this.log('error', `读取文件失败: ${filePath} - ${error.message}`, this.colors.red);
      throw error;
    }
  }

  /**
   * 获取函数信息
   * @param {string} functionName - 函数名称
   * @param {string} bindingObjectApiName - 绑定对象API名称
   * @returns {Promise<Object>} 函数信息
   */
  async getFunctionInfo(functionName, bindingObjectApiName = 'NONE') {
    try {
      // 如果传入的是函数ID，直接返回基本信息，不需要重新查询
      if (typeof functionName === 'string' && /^[0-9a-f]{24}$/.test(functionName)) {
        return {
          id: functionName,
          name: functionName,
          apiName: functionName,
          content: '',
          bindingObjectApiName: bindingObjectApiName,
          updateTime: Date.now()
        };
      }
      
      // 如果是函数名称，则进行查询
      const response = await api.getSingleFunction(functionName, 'function', bindingObjectApiName);
      
      console.log('getFunctionInfo收到的response:', JSON.stringify(response, null, 2));
      
      if (response) {
        // 现在api.getSingleFunction直接返回targetItem
        let functionData = response;
        
        if (functionData && functionData.id) {
          return {
            id: functionData.id,
            name: functionData.function_name || functionData.name || functionName,
            apiName: functionData.api_name || functionName,
            content: functionData.body || functionData.content || functionData.funcContent || '',
            bindingObjectApiName: functionData.binding_object_api_name || bindingObjectApiName,
            updateTime: functionData.update_time || Date.now()
          };
        }
      }
      
      return null;
    } catch (error) {
      // 如果函数不存在（HTTP 404或业务逻辑错误），返回null
      if (error.response && error.response.status === 404) {
        return null;
      }
      // 检查错误消息是否包含"未找到"信息
      if (error.message && error.message.includes('未找到')) {
        this.log('info', `函数 ${functionName} 不存在，将创建新函数`, this.colors.blue);
        return null;
      }
      throw error;
    }
  }

  /**
   * 创建函数 - 参考pushClassService的pushNewClass实现逻辑
   * @param {Object} functionData - 函数数据
   * @returns {Promise<Object>} 创建结果
   */
  async createFunction(functionData) {
    try {
      // 构建分析数据 - 模拟默认函数对象
      const defaultFunction = {
        api_name: functionData.apiName || functionData.name,
        application: '',
        binding_object_api_name: functionData.bindingObjectApiName || 'NONE',
        body: functionData.content || '',
        commit_log: '',
        data_source: '',
        function_name: functionData.name,
        is_active: false,
        lang: functionData.lang || 0, // groovy
        name_space: functionData.nameSpace || '',
        parameters: functionData.parameters || [],
        remark: functionData.description || '',
        return_type: functionData.returnType || '',
        status: 'not_used',
        type: 'function',
        version: 1
      };
      
      console.log(`[DEBUG] createFunction - 准备发送的分析数据:`, JSON.stringify(defaultFunction, null, 2));
      console.log(`[DEBUG] createFunction - nameSpace: ${defaultFunction.name_space}, returnType: ${defaultFunction.return_type}`);
      this.log('info', `createFunction - 调用API进行函数分析，nameSpace: ${defaultFunction.name_space}, returnType: ${defaultFunction.return_type}`, this.colors.blue);
      
      // 1. 调用API进行函数分析
      const analyzeResponse = await api.post('/FHH/EMDHFUNC/runtime/analyze', { function: defaultFunction });
      
      console.log(`[DEBUG] createFunction - 分析响应:`, JSON.stringify(analyzeResponse, null, 2));
      this.log('info', `createFunction - 分析响应成功，状态: ${analyzeResponse?.Result?.StatusCode}`, this.colors.blue);
      
      // 处理API响应错误
      if (analyzeResponse.Result && analyzeResponse.Result.FailureMessage) {
        this.log('error', `函数分析失败: ${analyzeResponse.Result.FailureMessage}`, this.colors.red);
        throw new Error(`函数分析失败: ${analyzeResponse.Result.FailureMessage}`);
      }
      
      // 处理分析结果
      const { violations = [], success = true } = analyzeResponse.Value || {};
      const seriousError = violations.find((item) => item.priority >= 9);
      
      if (success === false && seriousError) {
        // 有严重错误，需要确认是否继续
        this.log('error', `函数分析发现严重错误: ${seriousError?.message || '未知错误'}`, this.colors.red);
        throw new Error(`函数分析发现严重错误: ${seriousError?.message || '未知错误'}`);
      } else if (success === false) {
        // 有警告但不阻止上传
        this.log('warn', `函数分析发现警告，请检查代码质量`, this.colors.yellow);
      }
      
      // 2. 调用API进行编译检查
      this.log('info', `createFunction - 调用API进行编译检查，nameSpace: ${defaultFunction.name_space}, returnType: ${defaultFunction.return_type}`, this.colors.blue);
      const compileResponse = await api.post('/FHH/EMDHFUNC/runtime/compileCheck', { function: defaultFunction });
      
      console.log(`[DEBUG] createFunction - 编译检查响应:`, JSON.stringify(compileResponse, null, 2));
      this.log('info', `createFunction - 编译检查响应成功，状态: ${compileResponse?.Result?.StatusCode}`, this.colors.blue);
      
      // 处理API响应错误
      if (compileResponse.Result?.FailureMessage) {
        this.log('error', `编译检查失败: ${compileResponse.Result.FailureMessage}`, this.colors.red);
        throw new Error(`编译检查失败: ${compileResponse.Result.FailureMessage}`);
      }
      
      // 3. 构建上传数据对象
      const uploadData = {
        type: 'function',
        lang: functionData.lang || 0, // groovy
        commit: functionData.commit || 'fx-cli create function',
        apiName: functionData.apiName || functionData.name,
        nameSpace: functionData.nameSpace || '',
        description: functionData.description || '',
        name: functionData.name,
        bindingObjectApiName: functionData.bindingObjectApiName || 'NONE',
        returnType: functionData.returnType || '',
        metaXml: functionData.metaXml || '',
        content: functionData.content || '',
        updateTime: 0 // 新函数的updateTime为0
      };
      
      console.log(`[DEBUG] createFunction - 准备发送的上传数据:`, JSON.stringify(uploadData, null, 2));
      this.log('info', `createFunction - 调用API上传函数代码`, this.colors.blue);
      
      // 4. 调用API上传函数代码
      const uploadResponse = await api.post('/FHH/EMDHFUNC/biz/upload', uploadData);
      
      console.log(`[DEBUG] createFunction - 上传响应:`, JSON.stringify(uploadResponse, null, 2));
      this.log('info', `createFunction - 上传响应成功，状态: ${uploadResponse?.Result?.StatusCode}`, this.colors.blue);
      
      // 处理API响应错误
      if (uploadResponse.Result && uploadResponse.Result.StatusCode !== 0) {
        this.log('error', `上传函数失败: ${uploadResponse.Result.FailureMessage || '未知错误'}`, this.colors.red);
        throw new Error(`上传函数失败: ${uploadResponse.Result.FailureMessage || '未知错误'}`);
      }
      
      if (uploadResponse?.Error?.Message) {
        // 当StatusCode为0但有Error时，通常是系统级提示，不应阻止操作
        this.log('warn', `上传函数系统提示: ${uploadResponse?.Error?.Message}`, this.colors.yellow);
      }
      
      this.log('info', `函数创建并上传成功: ${functionData.name}`, this.colors.green);
      
      return {
        success: true,
        id: uploadResponse?.Value?.id || uploadData.apiName,
        data: uploadResponse,
        message: `函数创建成功: ${functionData.name}`
      };
      
    } catch (error) {
      this.log('error', `创建函数失败: ${error.message}`, this.colors.red);
      throw error;
    }
  }

  /**
   * 更新函数
   * @param {string} functionId - 函数ID
   * @param {Object} functionData - 函数数据
   * @returns {Promise<Object>} 更新结果
   */
  async updateFunction(functionId, functionData) {
    try {
      const response = await api.updateFunction(functionId, functionData);
      return response;
    } catch (error) {
      this.log('error', `更新函数失败: ${error.message}`, this.colors.red);
      throw error;
    }
  }

  /**
   * 上传函数代码
   * @param {string} functionId - 函数ID（可选，不用于API调用）
   * @param {Object} codeData - 代码数据
   * @param {Object} functionInfo - 函数信息对象
   * @returns {Promise<Object>} 上传结果
   */
  async uploadFunctionCode(functionId, codeData, functionInfo) {
    try {
      // 使用与pushClassService相同的策略：不依赖funcId，直接使用函数信息上传
      const data = {
        type: 'function',
        lang: 0, // groovy
        commit: process.env.FX_COMMIT || 'fx-cli upload',
        apiName: functionInfo.apiName,
        nameSpace: functionInfo.nameSpace || '',
        description: functionInfo.description || '',
        name: functionInfo.name,
        bindingObjectApiName: functionInfo.bindingObjectApiName,
        returnType: functionInfo.returnType || '',
        metaXml: '',
        content: codeData.files[0].content,
        updateTime: Date.now()
        // 注意：不包含funcId字段，与pushClassService保持一致
      };
      
      console.log(`[DEBUG] uploadFunctionCode - 准备发送的上传数据:`, JSON.stringify(data, null, 2));
      this.log('info', `uploadFunctionCode - nameSpace: ${data.nameSpace}, returnType: ${data.returnType}`, this.colors.blue);
      
      const response = await api.post('/FHH/EMDHFUNC/biz/upload', data);
      return response;
    } catch (error) {
    // 输出详细错误信息
    console.error(`[ERROR] 上传函数代码失败 - 详细错误信息:`);
    console.error(`  错误类型: ${error.constructor.name}`);
    console.error(`  错误消息: ${error.message}`);
    console.error(`  错误堆栈: ${error.stack}`);
    
    // 如果是API响应错误，尝试提取更多信息
    if (error.response) {
      console.error(`  HTTP状态码: ${error.response.status}`);
      console.error(`  响应头: ${JSON.stringify(error.response.headers, null, 2)}`);
      console.error(`  响应数据: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    
    // 增强错误处理，获取更详细的错误信息
    let errorDetails = error.message || '未知错误';
    
    // 如果错误对象包含更多详细信息，尝试提取
    if (error.response) {
      errorDetails += `\n响应状态: ${error.response.status}`;
      if (error.response.data) {
        errorDetails += `\n响应数据: ${JSON.stringify(error.response.data, null, 2)}`;
      }
    } else if (error.request) {
      errorDetails += '\n请求已发送但没有收到响应';
    } else {
      errorDetails += `\n错误详情: ${error.stack || error}`;
    }
    
    this.log('error', `上传函数代码失败: ${errorDetails}`, this.colors.red);
    throw new Error(`上传函数代码失败: ${errorDetails}`);
  }
  }

  /**
   * 分析函数
   * @param {Object} functionInfo - 函数信息对象
   * @returns {Promise<Object>} 分析结果
   */
  async analyzeFunction(functionInfo) {
    try {
      // 构造分析数据，与pushClassService保持一致
      const analyzeData = {
        api_name: functionInfo.apiName,
        application: '',
        binding_object_api_name: functionInfo.bindingObjectApiName,
        body: functionInfo.content || '', // 使用content字段
        commit_log: '',
        data_source: '',
        function_name: functionInfo.name,
        is_active: false,
        lang: 0, // groovy
        name_space: functionInfo.nameSpace || '',
        parameters: functionInfo.parameters || [],
        remark: functionInfo.description || '',
        return_type: functionInfo.returnType || '',
        status: 'not_used',
        type: 'function',
        version: 1
      };
      
      console.log(`[DEBUG] analyzeFunction - 准备发送的分析数据:`, JSON.stringify(analyzeData, null, 2));
      this.log('info', `analyzeFunction - nameSpace: ${analyzeData.name_space}, returnType: ${analyzeData.return_type}`, this.colors.blue);
      
      const response = await api.post('/FHH/EMDHFUNC/runtime/analyze', { function: analyzeData });
      console.log(`[DEBUG] analyzeFunction - API响应:`, JSON.stringify(response, null, 2));
      this.log('info', `analyzeFunction - API响应成功，状态: ${response?.Result?.StatusCode}`, this.colors.blue);
      return response;
    } catch (error) {
      this.log('error', `分析函数失败: ${error.message}`, this.colors.red);
      throw error;
    }
  }

  /**
   * 编译函数
   * @param {Object} functionInfo - 函数信息对象
   * @returns {Promise<Object>} 编译结果
   */
  async compileFunction(functionInfo) {
    try {
      // 构造编译检查数据，与pushClassService保持一致
      const compileData = {
        api_name: functionInfo.apiName,
        application: '',
        binding_object_api_name: functionInfo.bindingObjectApiName,
        body: functionInfo.content || '', // 使用content字段
        commit_log: '',
        data_source: '',
        function_name: functionInfo.name,
        is_active: false,
        lang: 0, // groovy
        name_space: functionInfo.nameSpace || '',
        parameters: functionInfo.parameters || [],
        remark: functionInfo.description || '',
        return_type: functionInfo.returnType || '',
        status: 'not_used',
        type: 'function',
        version: 1
      };
      
      console.log(`[DEBUG] compileFunction - 准备发送的编译数据:`, JSON.stringify(compileData, null, 2));
      this.log('info', `compileFunction - nameSpace: ${compileData.name_space}, returnType: ${compileData.return_type}`, this.colors.blue);
      
      const response = await api.post('/FHH/EMDHFUNC/runtime/compileCheck', { function: compileData });
      console.log(`[DEBUG] compileFunction - API响应:`, JSON.stringify(response, null, 2));
      this.log('info', `compileFunction - API响应成功，状态: ${response?.Result?.StatusCode}`, this.colors.blue);
      return response;
    } catch (error) {
      this.log('error', `编译函数失败: ${error.message}`, this.colors.red);
      throw error;
    }
  }

  /**
   * 推送函数
   * @param {string} functionDir - 函数目录路径
   * @param {string} singleFilePath - 单个文件路径（可选）
   * @returns {Promise<Object>} 推送结果
   */
  async pushFunction(functionDir, singleFilePath = null) {
    try {
      this.log('info', `开始推送函数...`, this.colors.green);
      
      // 获取证书数据
      const certificateData = await getCertificateData();
      
      // 确定要处理的文件路径
      let targetFilePath;
      if (singleFilePath) {
        targetFilePath = singleFilePath;
      } else {
        // 如果没有指定单个文件，查找functionDir下的.groovy文件
        const files = await fs.readdir(functionDir);
        const groovyFiles = files.filter(file => file.endsWith('.groovy'));
        
        if (groovyFiles.length === 0) {
          throw new Error(`在目录 ${functionDir} 中找不到.groovy文件`);
        }
        
        if (groovyFiles.length > 1) {
          this.log('warn', `找到多个.groovy文件，将使用第一个: ${groovyFiles[0]}`, this.colors.yellow);
        }
        
        targetFilePath = path.join(functionDir, groovyFiles[0]);
      }
      
      // 读取函数文件
      const functionContent = await this.readFileContent(targetFilePath);
      const fileName = path.basename(targetFilePath, '.groovy');
      
      // 尝试从函数文件注释中解析bindingObjectApiName和apiName
      let bindingObjectApiName = certificateData.bindingObjectApiName || 'NONE';
      let apiName = `${fileName}__c`; // 默认使用文件名+__c后缀，符合API规范
      let nameSpace = ''; // 声明nameSpace变量
      let returnType = ''; // 声明returnType变量
      
      // 尝试从函数文件注释中解析bindingObjectApiName和apiName
      // nameSpace和returnType从unchangeableJson.json中获取
      try {
        const bindingObjectMatch = functionContent.match(/@bindingObjectApiName\s+(\w+)/);
        if (bindingObjectMatch) {
          bindingObjectApiName = bindingObjectMatch[1];
          console.log(`[DEBUG] 从函数文件中解析到bindingObjectApiName: ${bindingObjectApiName}`);
          this.log('info', `从函数文件中解析到bindingObjectApiName: ${bindingObjectApiName}`, this.colors.blue);
        }
        
        const apiNameMatch = functionContent.match(/@apiName\s+(\w+)/);
        if (apiNameMatch) {
          apiName = apiNameMatch[1];
          console.log(`[DEBUG] 从函数文件中解析到apiName: ${apiName}`);
          this.log('info', `从函数文件中解析到apiName: ${apiName}`, this.colors.blue);
        }
        
        // 解析nameSpace和returnType
        const nameSpaceMatch = functionContent.match(/@nameSpace\s+(\w+)/);
        if (nameSpaceMatch) {
          nameSpace = nameSpaceMatch[1];
          console.log(`[DEBUG] 从函数文件中解析到nameSpace: ${nameSpace}`);
          this.log('info', `从函数文件中解析到nameSpace: ${nameSpace}`, this.colors.blue);
        }
        
        const returnTypeMatch = functionContent.match(/@returnType\s+(\w+)/);
        if (returnTypeMatch) {
          returnType = returnTypeMatch[1];
          console.log(`[DEBUG] 从函数文件中解析到returnType: ${returnType}`);
          this.log('info', `从函数文件中解析到returnType: ${returnType}`, this.colors.blue);
        }
        
        console.log(`[DEBUG] 最终使用的bindingObjectApiName: ${bindingObjectApiName}, apiName: ${apiName}, nameSpace: ${nameSpace}, returnType: ${returnType}`);
      } catch (error) {
        this.log('warn', `从函数文件中解析注释失败: ${error.message}`, this.colors.yellow);
      }
      
      // 从unchangeableJson.json中获取函数的完整信息，包括nameSpace和returnType
      // 注意：只有当从文件注释中未解析到值时，才从unchangeableJson.json中读取
      
      try {
        // 先在当前functionDir查找，如果找不到则向上一级目录查找
        let unchangeableJsonPath = path.join(functionDir, 'unchangeableJson.json');
        let found = false;
        
        // 尝试读取当前目录的unchangeableJson.json
        try {
          await fs.access(unchangeableJsonPath);
          found = true;
        } catch (error) {
          // 如果当前目录没有，尝试上级目录
          unchangeableJsonPath = path.join(functionDir, '..', '..', '..', 'unchangeableJson.json');
          try {
            await fs.access(unchangeableJsonPath);
            found = true;
          } catch (upperError) {
            // 再尝试上上级目录
            unchangeableJsonPath = path.join(functionDir, '..', '..', '..', '..', 'unchangeableJson.json');
            try {
              await fs.access(unchangeableJsonPath);
              found = true;
            } catch (upperUpperError) {
              found = false;
            }
          }
        }
        
        if (found) {
          const unchangeableContent = await fs.readFile(unchangeableJsonPath, 'utf8');
          const unchangeableJson = JSON.parse(unchangeableContent);
          const functionKey = `function:${fileName}`;
          
          if (unchangeableJson[functionKey]) {
            if (unchangeableJson[functionKey].bindingObjectApiName) {
              bindingObjectApiName = unchangeableJson[functionKey].bindingObjectApiName;
              this.log('info', `从unchangeableJson.json中获取到bindingObjectApiName: ${bindingObjectApiName}`, this.colors.blue);
            }
            if (unchangeableJson[functionKey].apiName) {
              apiName = unchangeableJson[functionKey].apiName;
              this.log('info', `从unchangeableJson.json中获取到apiName: ${apiName}`, this.colors.blue);
            }
            // 只有当从文件注释中未解析到值时，才从unchangeableJson.json中获取nameSpace和returnType
            if (!nameSpace && unchangeableJson[functionKey].nameSpace) {
              nameSpace = unchangeableJson[functionKey].nameSpace;
              this.log('info', `从unchangeableJson.json中获取到nameSpace: ${nameSpace}`, this.colors.blue);
            }
            if (!returnType && unchangeableJson[functionKey].returnType) {
              returnType = unchangeableJson[functionKey].returnType;
              this.log('info', `从unchangeableJson.json中获取到returnType: ${returnType}`, this.colors.blue);
            }
          }
        }
      } catch (error) {
        this.log('warn', `无法从unchangeableJson.json中读取函数信息，使用默认值`, this.colors.yellow);
      }
      
      // 自动检测函数是否已存在（使用正确的apiName）
      // 先尝试获取函数信息，如果不存在则创建新函数
      const existingFunction = await this.getFunctionInfo(apiName, bindingObjectApiName);
      
      let functionId;
      let isNewFunctionCreated = false; // 自动判断是否为新函数
      let functionInfo; // 用于存储函数信息，供上传使用
      
      if (existingFunction) {
        functionId = existingFunction.id || 'existing'; // 如果没有id字段，使用标记值
        functionInfo = existingFunction; // 保存完整的函数信息
        // 确保functionInfo包含从文件解析的nameSpace和returnType
        functionInfo.nameSpace = nameSpace;
        functionInfo.returnType = returnType;
        this.log('info', `函数已存在，将更新: ${fileName} (apiName: ${apiName})`, this.colors.blue);
      } else {
        isNewFunctionCreated = true;
        this.log('info', `函数不存在，将自动创建: ${fileName}`, this.colors.blue);
        
        // 创建函数
        const createFunctionData = {
          name: fileName,
          apiName: apiName, // 使用从unchangeableJson.json或文件解析的apiName
          description: `函数 ${fileName}`,
          type: 'function',
          bindingObjectApiName: bindingObjectApiName,
          nameSpace: nameSpace,
          returnType: returnType,
          lang: 0, // groovy
          metaXml: '', // 暂时为空
          content: functionContent,
          commit: 'fx-cli create function'
        };
        
        let createResult;
        try {
          createResult = await this.createFunction(createFunctionData);
        } catch (createError) {
          // 检查是否是"函数API名称已经存在"的错误
          if (createError.message && createError.message.includes('函数API名称已经存在')) {
            this.log('info', `函数已存在但查询不到，尝试强制更新逻辑: ${fileName}`, this.colors.yellow);
            
            // 构造函数信息用于强制更新
            functionInfo = {
              apiName: apiName,
              name: fileName,
              bindingObjectApiName: bindingObjectApiName,
              nameSpace: nameSpace,
              returnType: returnType,
              description: `函数 ${fileName}`,
              content: functionContent
            };
            
            // 直接使用上传API进行更新（不依赖函数ID）
            try {
              const uploadResult = await this.uploadFunctionCode(null, {
                files: [{
                  fileName: `${fileName}.groovy`,
                  content: functionContent
                }]
              }, functionInfo);
              
              if (!uploadResult || !uploadResult.Result || uploadResult.Result.StatusCode !== 0) {
                throw new Error(`强制更新失败: ${uploadResult?.Result?.FailureMessage || '未知错误'}`);
              }
              
              this.log('info', `函数强制更新成功: ${fileName}`, this.colors.green);
              
              // 分析函数
              try {
                await this.analyzeFunction(functionInfo);
                this.log('info', `函数分析完成: ${fileName}`, this.colors.blue);
              } catch (analyzeError) {
                this.log('warn', `函数分析失败，但继续执行: ${analyzeError.message}`, this.colors.yellow);
              }
              
              // 编译函数
              try {
                await this.compileFunction(functionInfo);
                this.log('info', `函数编译完成: ${fileName}`, this.colors.blue);
              } catch (compileError) {
                this.log('warn', `函数编译失败，但继续执行: ${compileError.message}`, this.colors.yellow);
              }
              
              // 更新test-1目录下的unchangeableJson.json文件
              await this.updateUnchangeableJson(functionDir, fileName, apiName, false, bindingObjectApiName, apiName, nameSpace, returnType, functionContent);
              
              this.log('info', `函数强制更新完成: ${fileName}`, this.colors.green);
              
              return {
                success: true,
                name: fileName,
                id: apiName,
                isNew: false,
                message: '函数强制更新成功（已存在但查询不到）'
              };
              
            } catch (forceUpdateError) {
              this.log('error', `强制更新失败: ${forceUpdateError.message}`, this.colors.red);
              
              // 如果强制更新也失败，尝试使用更灵活的查询方式
              if (forceUpdateError.message.includes('未查询到该自定义函数')) {
                console.log(`[DEBUG] 尝试使用更灵活的查询方式...`);
                
                try {
                  // 尝试只使用apiName查询，不指定bindingObjectApiName
                  const flexibleFunctionInfo = await api.getSingleFunction(functionInfo.apiName, 'function', 'NONE');
                  
                  if (flexibleFunctionInfo && flexibleFunctionInfo.Value) {
                    console.log(`[DEBUG] 灵活查询成功，获取到函数信息`);
                    
                    // 使用找到的函数ID进行更新
                    const functionId = flexibleFunctionInfo.Value.id || flexibleFunctionInfo.Value.funcId;
                    
                    // 重新构造函数信息，使用查询到的bindingObjectApiName
                    const updatedFunctionInfo = {
                      ...functionInfo,
                      bindingObjectApiName: flexibleFunctionInfo.Value.bindingObjectApiName || functionInfo.bindingObjectApiName
                    };
                    
                    // 准备上传数据
                    const uploadData = {
                      files: [{
                        fileName: `${functionInfo.name}.groovy`,
                        content: functionContent
                      }]
                    };
                    
                    // 再次尝试上传
                    const forceUploadResult = await this.uploadFunctionCode(functionId, uploadData, updatedFunctionInfo);
                    
                    // 分析和编译
                    await this.analyzeFunction(updatedFunctionInfo);
                    await this.compileFunction(updatedFunctionInfo);
                    
                    // 更新unchangeableJson.json
                    await this.updateUnchangeableJson(functionDir, functionInfo.name, functionId, false, updatedFunctionInfo.bindingObjectApiName, updatedFunctionInfo.apiName, updatedFunctionInfo.nameSpace, updatedFunctionInfo.returnType, functionContent);
                    
                    return {
                      success: true,
                      name: functionInfo.name,
                      id: functionId,
                      isNew: false,
                      message: `函数已存在但通过灵活查询成功更新: ${functionInfo.name}`
                    };
                  }
                } catch (flexibleError) {
          console.log(`[DEBUG] 灵活查询也失败: ${flexibleError.message}`);
          
          // 最后的解决方案：直接使用unchangeableJson.json中的信息，绕过查询
          console.log(`[DEBUG] 尝试直接使用unchangeableJson.json信息进行更新...`);
          
          try {
            // 从unchangeableJson.json中获取函数信息
            const unchangeableJsonPath = path.join(functionDir, '..', '..', '..', '..', 'unchangeableJson.json');
            const unchangeableContent = await fs.promises.readFile(unchangeableJsonPath, 'utf8');
            const unchangeableData = JSON.parse(unchangeableContent);
            
            const functionKey = `function:${functionInfo.name}`;
            const storedFunctionInfo = unchangeableData[functionKey];
            
            if (storedFunctionInfo) {
              console.log(`[DEBUG] 从unchangeableJson.json中找到函数记录:`, storedFunctionInfo);
              
              // 使用存储的信息构造函数数据
              const directUpdateFunctionInfo = {
                ...functionInfo,
                bindingObjectApiName: storedFunctionInfo.bindingObjectApiName || functionInfo.bindingObjectApiName,
                nameSpace: storedFunctionInfo.nameSpace || functionInfo.nameSpace,
                returnType: storedFunctionInfo.returnType || functionInfo.returnType,
                apiName: storedFunctionInfo.apiName || functionInfo.apiName
              };
              
              // 准备上传数据
              const directUploadData = {
                files: [{
                  fileName: `${functionInfo.name}.groovy`,
                  content: functionContent
                }]
              };
              
              // 直接使用上传API，不传functionId，让服务器根据apiName匹配
              console.log(`[DEBUG] 尝试直接上传更新...`);
              const directUploadResult = await this.uploadFunctionCode(null, directUploadData, directUpdateFunctionInfo);
              
              // 分析和编译
              await this.analyzeFunction(directUpdateFunctionInfo);
              await this.compileFunction(directUpdateFunctionInfo);
              
              // 更新unchangeableJson.json
              await this.updateUnchangeableJson(functionDir, functionInfo.name, null, false, directUpdateFunctionInfo.bindingObjectApiName, directUpdateFunctionInfo.apiName, directUpdateFunctionInfo.nameSpace, directUpdateFunctionInfo.returnType, functionContent);
              
              return {
                success: true,
                name: functionInfo.name,
                id: null,
                isNew: false,
                message: `函数已存在但通过直接更新成功: ${functionInfo.name}`
              };
            } else {
              console.log(`[DEBUG] unchangeableJson.json中未找到函数记录: ${functionKey}`);
            }
          } catch (directUpdateError) {
            console.log(`[DEBUG] 直接更新也失败: ${directUpdateError.message}`);
          }
        }
              }
              
              throw new Error(`函数已存在但查询失败，强制更新也失败: ${forceUpdateError.message}`);
            }
          } else {
            this.log('error', `创建函数失败: ${createError.message}`, this.colors.red);
            throw new Error(`创建函数失败: ${createError.message}`);
          }
        }
        
        functionId = createResult.data?.id || createResult.id;
        
        if (!functionId) {
          throw new Error(`创建函数失败，未获取到函数ID`);
        }
        
        this.log('info', `函数创建成功: ${fileName} (ID: ${functionId})`, this.colors.green);
        
        // 创建后重新获取函数信息，用于上传
        functionInfo = await this.getFunctionInfo(apiName, bindingObjectApiName);
        if (!functionInfo) {
          // 如果仍然获取不到，构造基本的函数信息
          functionInfo = {
            apiName: apiName,
            name: fileName,
            bindingObjectApiName: bindingObjectApiName,
            nameSpace: nameSpace,
            returnType: returnType,
            description: `函数 ${fileName}`
          };
        } else {
          // 确保获取到的函数信息包含从文件解析的nameSpace和returnType
          functionInfo.nameSpace = nameSpace;
          functionInfo.returnType = returnType;
        }
      }
      
      // 准备上传代码数据
      const uploadData = {
        files: [{
          fileName: `${fileName}.groovy`,
          content: functionContent
        }]
      };
      
      // 上传函数代码 - 传递functionInfo参数
      const uploadResult = await this.uploadFunctionCode(functionId, uploadData, functionInfo);
      
      // 检查API响应是否成功
      if (!uploadResult || !uploadResult.Result || uploadResult.Result.StatusCode !== 0) {
        throw new Error(`上传函数代码失败: ${uploadResult?.Result?.FailureMessage || '未知错误'}`);
      }
      
      this.log('info', `函数代码上传成功: ${fileName}`, this.colors.green);
      
      // 分析函数
      try {
        // 为functionInfo添加content字段，供分析使用
        functionInfo.content = functionContent;
        // 确保functionInfo包含正确的nameSpace和returnType
        functionInfo.nameSpace = nameSpace;
        functionInfo.returnType = returnType;
        console.log(`[DEBUG] 准备分析函数，functionInfo.nameSpace: ${functionInfo.nameSpace}, functionInfo.returnType: ${functionInfo.returnType}`);
        await this.analyzeFunction(functionInfo);
        this.log('info', `函数分析完成: ${fileName}`, this.colors.blue);
      } catch (analyzeError) {
        this.log('warn', `函数分析失败，但继续执行: ${analyzeError.message}`, this.colors.yellow);
      }
      
      // 编译函数
      try {
        // 确保functionInfo包含正确的nameSpace和returnType
        functionInfo.nameSpace = nameSpace;
        functionInfo.returnType = returnType;
        console.log(`[DEBUG] 准备编译函数，functionInfo.nameSpace: ${functionInfo.nameSpace}, functionInfo.returnType: ${functionInfo.returnType}`);
        await this.compileFunction(functionInfo);
        this.log('info', `函数编译完成: ${fileName}`, this.colors.blue);
      } catch (compileError) {
        this.log('warn', `函数编译失败，但继续执行: ${compileError.message}`, this.colors.yellow);
      }
      
      // 更新test-1目录下的unchangeableJson.json文件
      await this.updateUnchangeableJson(functionDir, fileName, functionId, isNewFunctionCreated, bindingObjectApiName, apiName, nameSpace, returnType, functionContent);
      
      this.log('info', `函数推送成功: ${fileName}`, this.colors.green);
      
      return {
        success: true,
        name: fileName,
        id: functionId,
        isNew: isNewFunctionCreated,
        message: isNewFunctionCreated ? '函数创建并推送成功' : '函数更新成功'
      };
      
    } catch (error) {
      this.log('error', `推送函数失败: ${error.message}`, this.colors.red);
      this.log('debug', `推送函数详细错误: ${error.stack}`, this.colors.red);
      return {
        success: false,
        message: `推送函数失败: ${error.message}`
      };
    }
  }

  /**
   * 更新info.json文件
   * @param {string} functionDir - 函数目录
   * @param {string} functionName - 函数名称
   * @param {string} functionId - 函数ID
   * @param {boolean} isNew - 是否为新函数
   */
  async updateInfoJson(functionDir, functionName, functionId, isNew) {
    try {
      const infoJsonPath = path.join(functionDir, 'info.json');
      
      let infoJson = {};
      try {
        const infoContent = await fs.readFile(infoJsonPath, 'utf8');
        infoJson = JSON.parse(infoContent);
      } catch (error) {
        // 如果文件不存在，创建新的
        this.log('info', `info.json文件不存在，将创建新文件`, this.colors.blue);
      }
      
      // 更新函数信息
      if (!infoJson.functions) {
        infoJson.functions = {};
      }
      
      infoJson.functions[functionName] = {
        id: functionId,
        name: functionName,
        type: 'function',
        lastUpdated: new Date().toISOString(),
        isNew: isNew
      };
      
      // 保存文件
      await fs.writeFile(infoJsonPath, JSON.stringify(infoJson, null, 2));
      this.log('info', `info.json文件更新成功`, this.colors.green);
      
    } catch (error) {
      this.log('warn', `更新info.json文件失败: ${error.message}`, this.colors.yellow);
      // 不影响主流程，继续执行
    }
  }

  /**
   * 更新test-1目录下的unchangeableJson.json文件
   * @param {string} functionDir - 函数目录
   * @param {string} functionName - 函数名称
   * @param {string} functionId - 函数ID
   * @param {boolean} isNew - 是否为新函数
   * @param {string} bindingObjectApiName - 绑定对象API名称
   * @param {string} apiName - 函数API名称
   * @param {string} nameSpace - 命名空间
   * @param {string} returnType - 返回类型
   * @param {string} content - 函数内容
   */
  async updateUnchangeableJson(functionDir, functionName, functionId, isNew, bindingObjectApiName, apiName, nameSpace, returnType, content) {
    try {
      // 获取test-1目录路径
      const test1Dir = path.join(functionDir, '..', '..', '..', '..');
      const unchangeableJsonPath = path.join(test1Dir, 'unchangeableJson.json');
      
      let unchangeableJson = {};
      try {
        const unchangeableContent = await fs.readFile(unchangeableJsonPath, 'utf8');
        unchangeableJson = JSON.parse(unchangeableContent);
        this.log('info', `成功读取test-1目录下的unchangeableJson.json文件`, this.colors.blue);
      } catch (error) {
        // 如果文件不存在，创建新的
        this.log('info', `test-1目录下的unchangeableJson.json文件不存在，将创建新文件`, this.colors.blue);
        unchangeableJson = {};
      }
      
      // 更新函数信息
      const functionKey = `function:${functionName}`;
      unchangeableJson[functionKey] = {
        updateTime: Date.now(),
        name: functionName,
        apiName: apiName,
        content: content,
        bindingObjectApiName: bindingObjectApiName,
        type: 'function',
        nameSpace: nameSpace,
        returnType: returnType,
        tenantId: '67000207',
        lang: 0
      };
      
      // 保存文件
      await fs.writeFile(unchangeableJsonPath, JSON.stringify(unchangeableJson, null, 2));
      this.log('info', `test-1目录下的unchangeableJson.json文件更新成功，包含nameSpace: ${nameSpace}, returnType: ${returnType}`, this.colors.green);
      
    } catch (error) {
      this.log('warn', `更新test-1目录下的unchangeableJson.json文件失败: ${error.message}`, this.colors.yellow);
      // 不影响主流程，继续执行
    }
  }

  /**
   * 批量推送函数目录下的所有函数
   * @param {string} functionsDir - 函数目录路径
   * @returns {Promise<Object>} 批量推送结果
   */
  async pushAllFunctions(functionsDir) {
    try {
      this.log('info', `开始批量推送函数目录: ${functionsDir}`, this.colors.green);
      
      // 获取目录下所有.groovy文件
      const files = await fs.readdir(functionsDir);
      const groovyFiles = files.filter(file => file.endsWith('.groovy'));
      
      if (groovyFiles.length === 0) {
        throw new Error(`在目录 ${functionsDir} 中找不到函数文件`);
      }
      
      this.log('info', `找到 ${groovyFiles.length} 个函数文件: ${groovyFiles.join(', ')}`, this.colors.blue);
      
      // 逐个推送每个函数文件
      const results = [];
      let successCount = 0;
      let failCount = 0;
      const failedFunctions = []; // 记录失败的函数名称
      
      for (const file of groovyFiles) {
        const filePath = path.join(functionsDir, file);
        try {
          this.log('info', `开始推送函数文件: ${file}`, this.colors.blue);
          const result = await this.pushFunction(functionsDir, filePath);
          results.push(result);
          if (result.success) {
            successCount++;
            this.log('info', `函数 ${file} 推送成功`, this.colors.green);
          } else {
            failCount++;
            failedFunctions.push(file);
            this.log('error', `函数 ${file} 推送失败: ${result.message}`, this.colors.red);
          }
        } catch (error) {
          failCount++;
          failedFunctions.push(file);
          this.log('error', `函数 ${file} 推送失败: ${error.message}`, this.colors.red);
          results.push({ 
            success: false, 
            name: file,
            message: `推送函数 ${file} 失败: ${error.message}` 
          });
        }
      }
      
      this.log('info', `函数推送完成: 成功 ${successCount} 个，失败 ${failCount} 个`, this.colors.green);
      
      if (failCount > 0) {
        this.log('warn', `有 ${failCount} 个函数推送失败: ${failedFunctions.join(', ')}`, this.colors.yellow);
      }
      
      return {
        success: successCount > 0, // 只要有成功的推送就返回true，完全失败才返回false
        message: `推送完成: 成功 ${successCount} 个，失败 ${failCount} 个`,
        results: results,
        successCount: successCount,
        failCount: failCount,
        failedFunctions: failedFunctions
      };
      
    } catch (error) {
      this.log('error', `批量推送函数失败: ${error.message}`, this.colors.red);
      return {
        success: false,
        message: `批量推送函数失败: ${error.message}`
      };
    }
  }
}

// 创建单例实例
const pushFunctionService = new PushFunctionService();

module.exports = {
  PushFunctionService,
  pushFunctionService,
  pushFunction: pushFunctionService.pushFunction.bind(pushFunctionService),
  pushAllFunctions: pushFunctionService.pushAllFunctions.bind(pushFunctionService)
};