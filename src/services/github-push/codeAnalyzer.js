/**
 * 代码分析服务
 * 用于识别和分类代码文件，提取相关信息
 */

const fs = require('fs-extra');
const path = require('path');
const { logger } = require('../core/Logger');

class CodeAnalyzer {
  constructor() {
    // 文件类型映射
    this.fileTypeMap = {
      '.vue': 'component',
      '.js': 'plugin',
      '.groovy': 'groovy', // 需要进一步判断是函数还是类
      '.java': 'groovy' // 同上
    };

    // 代码识别模式
    this.patterns = {
      // Vue组件识别模式
      component: {
        template: /<template[\s\S]*?<\/template>/i,
        script: /<script[\s\S]*?<\/script>/i,
        style: /<style[\s\S]*?<\/style>/i
      },
      
      // 插件识别模式
      plugin: {
        export: /export\s+default\s*\{/,
        function: /function\s+\w+\s*\(/,
        class: /class\s+\w+/,
        vuePlugin: /install\s*:\s*function/
      },
      
      // Groovy函数识别模式
      function: {
        functionDef: /^(def|public|private|protected)\s+[\w<>,\s]+\s+(\w+)\s*\([^)]*\)\s*[\s{]*\{/m,
        apiName: /apiName\s*[:=]\s*['"`]([^'"`]+)['"`]/,
        nameSpace: /nameSpace\s*[:=]\s*['"`]([^'"`]+)['"`]/,
        returnType: /returnType\s*[:=]\s*['"`]([^'"`]+)['"`]/
      },
      
      // Groovy类识别模式
      class: {
        classDef: /^(public|private|protected)?\s*class\s+(\w+)/m,
        apiName: /apiName\s*[:=]\s*['"`]([^'"`]+)['"`]/,
        nameSpace: /nameSpace\s*[:=]\s*['"`]([^'"`]+)['"`]/,
        returnType: /returnType\s*[:=]\s*['"`]([^'"`]+)['"`]/
      }
    };
  }

  /**
   * 分析目录中的代码文件
   * @param {string} dirPath - 目录路径
   * @param {Object} options - 分析选项
   * @returns {Object} 分析结果
   */
  async analyzeDirectory(dirPath, options = {}) {
    const { 
      includePatterns = ['**/*.{vue,js,groovy,java}'], 
      excludePatterns = ['**/node_modules/**', '**/dist/**', '**/build/**'] 
    } = options;

    try {
      const files = await this.findFiles(dirPath, includePatterns, excludePatterns);
      const results = {
        components: [],
        plugins: [],
        functions: [],
        classes: [],
        unknown: []
      };

      for (const file of files) {
        const analysis = await this.analyzeFile(file);
        
        // 根据分析结果分类
        switch (analysis.type) {
          case 'component':
            results.components.push(analysis);
            break;
          case 'plugin':
            results.plugins.push(analysis);
            break;
          case 'function':
            results.functions.push(analysis);
            break;
          case 'class':
            results.classes.push(analysis);
            break;
          default:
            results.unknown.push(analysis);
            break;
        }
      }

      logger.info(`分析完成: 组件 ${results.components.length} 个, 插件 ${results.plugins.length} 个, 函数 ${results.functions.length} 个, 类 ${results.classes.length} 个`);
      
      return results;
    } catch (error) {
      logger.error(`分析目录失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 查找匹配的文件
   * @param {string} dirPath - 目录路径
   * @param {Array} includePatterns - 包含模式
   * @param {Array} excludePatterns - 排除模式
   * @returns {Array} 文件路径列表
   */
  async findFiles(dirPath, includePatterns, excludePatterns) {
    const { glob } = require('glob');
    const { promisify } = require('util');
    const globPromise = promisify(glob);

    try {
      const allFiles = [];
      
      // 查找所有匹配的文件
      for (const pattern of includePatterns) {
        const files = await globPromise(pattern, { 
          cwd: dirPath,
          absolute: true
        });
        allFiles.push(...files);
      }

      // 去重
      const uniqueFiles = [...new Set(allFiles)];
      
      // 过滤排除的文件
      const filteredFiles = [];
      for (const file of uniqueFiles) {
        let shouldExclude = false;
        
        for (const pattern of excludePatterns) {
          const excludeGlob = await globPromise(pattern, { 
            cwd: dirPath,
            absolute: true
          });
          
          if (excludeGlob.includes(file)) {
            shouldExclude = true;
            break;
          }
        }
        
        if (!shouldExclude) {
          filteredFiles.push(file);
        }
      }
      
      return filteredFiles;
    } catch (error) {
      logger.error(`查找文件失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 分析单个文件
   * @param {string} filePath - 文件路径
   * @returns {Object} 分析结果
   */
  async analyzeFile(filePath) {
    try {
      const ext = path.extname(filePath).toLowerCase();
      const fileName = path.basename(filePath, ext);
      const relativePath = path.relative(process.cwd(), filePath);
      const content = await fs.readFile(filePath, 'utf8');
      
      // 基础信息
      const result = {
        filePath,
        fileName,
        relativePath,
        ext,
        content,
        type: 'unknown',
        metadata: {}
      };

      // 根据文件扩展名确定初步类型
      const initialType = this.fileTypeMap[ext];
      
      if (!initialType) {
        return result;
      }

      // 特殊处理Groovy/Java文件，需要进一步判断是函数还是类
      if (initialType === 'groovy') {
        const groovyAnalysis = this.analyzeGroovyFile(content);
        result.type = groovyAnalysis.type;
        result.metadata = groovyAnalysis.metadata;
      } else {
        // 其他文件类型直接分析
        const analysis = this[`analyze${initialType.charAt(0).toUpperCase() + initialType.slice(1)}File`](content);
        result.type = initialType;
        result.metadata = analysis;
      }

      return result;
    } catch (error) {
      logger.error(`分析文件失败 ${filePath}: ${error.message}`);
      return {
        filePath,
        fileName: path.basename(filePath),
        relativePath: path.relative(process.cwd(), filePath),
        ext: path.extname(filePath),
        content: '',
        type: 'error',
        metadata: { error: error.message }
      };
    }
  }

  /**
   * 分析Vue组件文件
   * @param {string} content - 文件内容
   * @returns {Object} 分析结果
   */
  analyzeComponentFile(content) {
    // 参考pushComponentService.js的实现方式
    const metadata = {};
    
    // 检查是否包含template
    metadata.hasTemplate = /<template[^>]*>/i.test(content);
    
    // 检查是否包含script
    metadata.hasScript = /<script[^>]*>/i.test(content);
    
    // 检查是否包含style
    metadata.hasStyle = /<style[^>]*>/i.test(content);
    
    // 提取组件名称 - 参考pushComponentService.js的实现
    const nameMatch = content.match(/name\s*[:=]\s*['"`]([^'"`]+)['"`]/);
    if (nameMatch) {
      metadata.name = nameMatch[1];
    }
    
    // 提取API名称 - 参考pushComponentService.js的实现
    const apiNameMatch = content.match(/apiName\s*[:=]\s*['"`]([^'"`]+)['"`]/);
    if (apiNameMatch) {
      metadata.apiName = apiNameMatch[1];
    }
    
    // 提取绑定对象API名称 - 参考pushComponentService.js的实现
    const bindingObjectMatch = content.match(/bindingObjectApiName\s*[:=]\s*['"`]([^'"`]+)['"`]/);
    if (bindingObjectMatch) {
      metadata.bindingObjectApiName = bindingObjectMatch[1];
    } else {
      // 默认值，参考pushComponentService.js的实现
      metadata.bindingObjectApiName = 'FHH_EMDHFUNC_CustomFunction__c';
    }
    
    // 提取命名空间
    const nameSpaceMatch = content.match(/nameSpace\s*[:=]\s*['"`]([^'"`]+)['"`]/);
    if (nameSpaceMatch) {
      metadata.nameSpace = nameSpaceMatch[1];
    }
    
    // 提取返回类型
    const returnTypeMatch = content.match(/returnType\s*[:=]\s*['"`]([^'"`]+)['"`]/);
    if (returnTypeMatch) {
      metadata.returnType = returnTypeMatch[1];
    }
    
    // 提取描述
    const descriptionMatch = content.match(/description\s*[:=]\s*['"`]([^'"`]+)['"`]/);
    if (descriptionMatch) {
      metadata.description = descriptionMatch[1];
    }
    
    // 提取语言类型 - 参考pushComponentService.js的实现
    metadata.lang = 1; // 1表示vue
    
    // 提取类型 - 参考pushComponentService.js的实现
    metadata.type = "component"; // 组件类型为字符串"component"
    
    return { type: 'component', metadata };
  }

  /**
   * 分析JavaScript插件文件
   * @param {string} content - 文件内容
   * @returns {Object} 分析结果
   */
  analyzePluginFile(content) {
    // 参考pushPluginService.js的实现方式
    const metadata = {};
    
    // 检查是否是ES6模块导出
    const isES6Module = /export\s+(default\s+)?(class|function|const|let|var)\s+\w+/.test(content);
    
    // 检查是否是CommonJS模块导出
    const isCommonJS = /module\.exports\s*=/.test(content);
    
    // 提取插件名称 - 参考pushPluginService.js的实现
    const nameMatch = content.match(/name\s*[:=]\s*['"`]([^'"`]+)['"`]/);
    if (nameMatch) {
      metadata.name = nameMatch[1];
    }
    
    // 提取API名称 - 参考pushPluginService.js的实现
    const apiNameMatch = content.match(/apiName\s*[:=]\s*['"`]([^'"`]+)['"`]/);
    if (apiNameMatch) {
      metadata.apiName = apiNameMatch[1];
    }
    
    // 提取绑定对象API名称 - 参考pushPluginService.js的实现
    const bindingObjectMatch = content.match(/bindingObjectApiName\s*[:=]\s*['"`]([^'"`]+)['"`]/);
    if (bindingObjectMatch) {
      metadata.bindingObjectApiName = bindingObjectMatch[1];
    } else {
      // 默认值，参考pushPluginService.js的实现
      metadata.bindingObjectApiName = 'FHH_EMDHFUNC_CustomFunction__c';
    }
    
    // 提取命名空间
    const nameSpaceMatch = content.match(/nameSpace\s*[:=]\s*['"`]([^'"`]+)['"`]/);
    if (nameSpaceMatch) {
      metadata.nameSpace = nameSpaceMatch[1];
    }
    
    // 提取返回类型
    const returnTypeMatch = content.match(/returnType\s*[:=]\s*['"`]([^'"`]+)['"`]/);
    if (returnTypeMatch) {
      metadata.returnType = returnTypeMatch[1];
    }
    
    // 提取描述
    const descriptionMatch = content.match(/description\s*[:=]\s*['"`]([^'"`]+)['"`]/);
    if (descriptionMatch) {
      metadata.description = descriptionMatch[1];
    }
    
    // 提取语言类型 - 参考pushPluginService.js的实现
    metadata.lang = 2; // 2表示javascript
    
    // 提取类型 - 参考pushPluginService.js的实现
    metadata.type = "plugin"; // 插件类型为字符串"plugin"
    
    // 导出类型
    metadata.exportType = isES6Module ? 'es6' : (isCommonJS ? 'commonjs' : 'unknown');
    
    return { type: 'plugin', metadata };
  }

  /**
   * 分析Groovy文件，识别所有的函数和类
   * @param {string} content - 文件内容
   * @returns {Object} 分析结果，包含所有识别的函数和类
   */
  analyzeGroovyFile(content) {
    // 参考pushClassService.js和pushFunctionService.js的实现方式
    const functions = [];
    const classes = [];
    
    // 查找所有类定义
    const classRegex = /^(public|private|protected)?\s*class\s+(\w+)/gm;
    let classMatch;
    while ((classMatch = classRegex.exec(content)) !== null) {
      // 创建一个新的内容块，只包含当前类
      const classContent = this.extractClassContent(content, classMatch.index);
      const metadata = this.extractClassMetadata(classContent);
      classes.push({ type: 'class', metadata });
    }
    
    // 查找所有函数定义
    // 对于APL/functions目录下的文件，它们可能是脚本文件而不是正式的函数定义
    // 因此我们需要特殊处理，将文件名作为函数名
    const functionRegex = /^(def|public|private|protected)\s+[\w<>,\s]+\s+(\w+)\s*\([^)]*\)\s*[\s{]*\{/gm;
    let functionMatch;
    const foundFunctionNames = new Set();
    
    while ((functionMatch = functionRegex.exec(content)) !== null) {
      const functionName = functionMatch[2];
      foundFunctionNames.add(functionName);
      // 创建一个新的内容块，只包含当前函数
      const functionContent = this.extractFunctionContent(content, functionMatch.index);
      const metadata = this.extractFunctionMetadata(functionContent);
      functions.push({ type: 'function', metadata });
    }

    return { functions, classes };
  }
  
  /**
   * 从文件内容中提取类定义的完整内容
   * @param {string} content - 文件内容
   * @param {number} startIndex - 类定义的起始位置
   * @returns {string} 类的完整内容
   */
  extractClassContent(content, startIndex) {
    // 查找类定义的结束位置（下一个类定义或文件结束）
    const nextClassIndex = content.indexOf('class ', startIndex + 6); // 'class '.length = 6
    if (nextClassIndex === -1) {
      return content.substring(startIndex);
    }
    return content.substring(startIndex, nextClassIndex);
  }
  
  /**
   * 从文件内容中提取函数定义的完整内容
   * @param {string} content - 文件内容
   * @param {number} startIndex - 函数定义的起始位置
   * @returns {string} 函数的完整内容
   */
  extractFunctionContent(content, startIndex) {
    // 查找函数定义的结束位置（下一个函数/类定义或文件结束）
    // 支持JavaScript和Groovy/Java语法
    const nextFunctionIndex = Math.min(
      content.indexOf('function ', startIndex + 9) !== -1 ? content.indexOf('function ', startIndex + 9) : Infinity,
      content.indexOf('def ', startIndex + 4) !== -1 ? content.indexOf('def ', startIndex + 4) : Infinity,
      content.indexOf('public ', startIndex + 7) !== -1 ? content.indexOf('public ', startIndex + 7) : Infinity,
      content.indexOf('private ', startIndex + 8) !== -1 ? content.indexOf('private ', startIndex + 8) : Infinity,
      content.indexOf('protected ', startIndex + 10) !== -1 ? content.indexOf('protected ', startIndex + 10) : Infinity
    );
    const nextClassIndex = content.indexOf('class ', startIndex + 6); // 'class '.length = 6
    
    let endIndex = content.length;
    if (nextFunctionIndex !== Infinity && nextFunctionIndex < endIndex) {
      endIndex = nextFunctionIndex;
    }
    if (nextClassIndex !== -1 && nextClassIndex < endIndex) {
      endIndex = nextClassIndex;
    }
    
    return content.substring(startIndex, endIndex);
  }

  /**
   * 提取函数元数据
   * @param {string} content - 文件内容
   * @returns {Object} 元数据
   */
  extractFunctionMetadata(content) {
    // 参考pushFunctionService.js的实现方式
    const metadata = {};
    
    // 提取函数名
    const functionMatch = content.match(/^(def|public|private|protected)\s+[\w<>,\s]+\s+(\w+)\s*\([^)]*\)\s*[\s{]*\{/m);
    if (functionMatch) {
      metadata.name = functionMatch[2];
    }
    
    // 提取API名称 - 参考pushFunctionService.js的实现
    const apiNameMatch = content.match(/apiName\s*[:=]\s*['"`]([^'"`]+)['"`]/);
    if (apiNameMatch) {
      metadata.apiName = apiNameMatch[1];
    }
    
    // 提取绑定对象API名称 - 参考pushFunctionService.js的实现
    const bindingObjectMatch = content.match(/bindingObjectApiName\s*[:=]\s*['"`]([^'"`]+)['"`]/);
    if (bindingObjectMatch) {
      metadata.bindingObjectApiName = bindingObjectMatch[1];
    } else {
      // 默认值，参考pushFunctionService.js的实现
      metadata.bindingObjectApiName = 'FHH_EMDHFUNC_CustomFunction__c';
    }
    
    // 提取命名空间
    const nameSpaceMatch = content.match(/nameSpace\s*[:=]\s*['"`]([^'"`]+)['"`]/);
    if (nameSpaceMatch) {
      metadata.nameSpace = nameSpaceMatch[1];
    }
    
    // 提取返回类型
    const returnTypeMatch = content.match(/returnType\s*[:=]\s*['"`]([^'"`]+)['"`]/);
    if (returnTypeMatch) {
      metadata.returnType = returnTypeMatch[1];
    }
    
    // 提取描述
    const descriptionMatch = content.match(/description\s*[:=]\s*['"`]([^'"`]+)['"`]/);
    if (descriptionMatch) {
      metadata.description = descriptionMatch[1];
    }
    
    // 提取语言类型 - 参考pushFunctionService.js的实现
    metadata.lang = 0; // 0表示groovy
    
    // 提取类型 - 参考pushFunctionService.js的实现
    metadata.type = 0; // 函数类型为0
    
    return metadata;
  }

  /**
   * 提取类元数据
   * @param {string} content - 文件内容
   * @returns {Object} 元数据
   */
  extractClassMetadata(content) {
    // 参考pushClassService.js的实现方式
    const metadata = {};
    
    // 提取类名
    const classMatch = content.match(/^(public|private|protected)?\s*class\s+(\w+)/m);
    if (classMatch) {
      metadata.name = classMatch[2];
    }
    
    // 提取API名称 - 参考pushClassService.js的实现
    const apiNameMatch = content.match(/apiName\s*[:=]\s*['"`]([^'"`]+)['"`]/);
    if (apiNameMatch) {
      metadata.apiName = apiNameMatch[1];
    }
    
    // 提取绑定对象API名称 - 参考pushClassService.js的实现
    const bindingObjectMatch = content.match(/bindingObjectApiName\s*[:=]\s*['"`]([^'"`]+)['"`]/);
    if (bindingObjectMatch) {
      metadata.bindingObjectApiName = bindingObjectMatch[1];
    } else {
      // 默认值，参考pushClassService.js的实现
      metadata.bindingObjectApiName = 'FHH_EMDHFUNC_CustomFunction__c';
    }
    
    // 提取命名空间
    const nameSpaceMatch = content.match(/nameSpace\s*[:=]\s*['"`]([^'"`]+)['"`]/);
    if (nameSpaceMatch) {
      metadata.nameSpace = nameSpaceMatch[1];
    }
    
    // 提取返回类型
    const returnTypeMatch = content.match(/returnType\s*[:=]\s*['"`]([^'"`]+)['"`]/);
    if (returnTypeMatch) {
      metadata.returnType = returnTypeMatch[1];
    }
    
    // 提取描述
    const descriptionMatch = content.match(/description\s*[:=]\s*['"`]([^'"`]+)['"`]/);
    if (descriptionMatch) {
      metadata.description = descriptionMatch[1];
    }
    
    // 提取语言类型 - 参考pushClassService.js的实现
    metadata.lang = 0; // 0表示groovy
    
    // 提取类型 - 参考pushClassService.js的实现
    metadata.type = "class"; // 类类型为字符串"class"
    
    return metadata;
  }

  /**
   * 生成分析报告
   * @param {Object} analysisResult - 分析结果
   * @param {string} outputPath - 输出路径
   */
  async generateReport(analysisResult, outputPath) {
    try {
      // 参考pushService.js的实现方式
      const report = {
        timestamp: new Date().toISOString(),
        summary: {
          components: analysisResult.components.length,
          plugins: analysisResult.plugins.length,
          functions: analysisResult.functions.length,
          classes: analysisResult.classes.length,
          unknown: analysisResult.unknown.length,
          total: analysisResult.components.length + 
                 analysisResult.plugins.length + 
                 analysisResult.functions.length + 
                 analysisResult.classes.length + 
                 analysisResult.unknown.length
        },
        details: {
          components: analysisResult.components.map(item => ({
            path: item.path,
            type: 'component',
            metadata: item.metadata
          })),
          plugins: analysisResult.plugins.map(item => ({
            path: item.path,
            type: 'plugin',
            metadata: item.metadata
          })),
          functions: analysisResult.functions.map(item => ({
            path: item.path,
            type: 'function',
            metadata: item.metadata
          })),
          classes: analysisResult.classes.map(item => ({
            path: item.path,
            type: 'class',
            metadata: item.metadata
          })),
          unknown: analysisResult.unknown.map(item => ({
            path: item.path,
            type: 'unknown',
            metadata: item.metadata
          }))
        }
      };

      await fs.writeJSON(outputPath, report, { spaces: 2 });
      logger.info(`分析报告已生成: ${outputPath}`);
    } catch (error) {
      logger.error(`生成分析报告失败: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new CodeAnalyzer();