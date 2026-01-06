/**
 * GitHub类推送服务
 * 负责将从GitHub仓库获取的类推送到远程服务
 * 完全独立实现，不依赖pushClassService.js
 */

const api = require('../api');
const path = require('path');

/**
 * 从GitHub获取unchangeableJson.json文件内容
 * @param {string} owner - 仓库所有者
 * @param {string} repo - 仓库名称
 * @param {string} branch - 分支名称
 * @param {string} targetDir - 目标目录
 * @returns {Promise<Object>} unchangeableJson内容
 */
const getUnchangeableJsonFromGitHub = async (owner, repo, branch, targetDir = '') => {
  try {
    const githubService = require('./githubService');
    
    const unchangeableJsonPath = targetDir ? `${targetDir}/unchangeableJson.json` : 'unchangeableJson.json';
    
    try {
      const content = await githubService.getFileContent(owner, repo, unchangeableJsonPath, branch);
      
      if (content && content.trim()) {
        const unchangeableJson = JSON.parse(content);
        return unchangeableJson;
      } else {
        return {};
      }
    } catch (error) {
      if (error.message && error.message.includes('404')) {
        return {};
      } else {
        throw error;
      }
    }
  } catch (error) {
    return {};
  }
};

/**
 * 从内容推送类（独立实现）
 * @param {string} filePath - 文件路径
 * @param {string} classContent - 类内容
 * @param {Object} unchangeableJson - unchangeableJson配置
 * @param {number} updateTime - 更新时间
 * @param {string} classId - 类ID
 * @param {string} nameSpace - 命名空间
 * @param {string} returnType - 返回类型
 * @param {string} bindingObjectApiName - 绑定对象API名称
 * @returns {Promise<Object>} 推送结果
 */
const pushClassFromContent = async (filePath, classContent, unchangeableJson = null, updateTime = 0, classId = null, nameSpace = null, returnType = null, bindingObjectApiName = null) => {
  try {
    const className = path.basename(filePath, path.extname(filePath));
    
    const classNameWithC = classId || `${className}__c`;
    
    let codeContent = classContent;
    
    const actualClassName = classNameWithC.includes('__c') ? classNameWithC.match(/(\S*)__c/)[1] : classNameWithC;
    if (codeContent.includes('#demo#')) {
      codeContent = codeContent.replace(/#demo#/g, actualClassName);
    }
    
    let funcJson = {};
    if (unchangeableJson) {
      const classKey = `class:${className}`;
      
      if (unchangeableJson[classKey]) {
        funcJson = unchangeableJson[classKey];
      }
    }
    
    const apiName = classNameWithC;
    const finalBindingObjectApiName = bindingObjectApiName || funcJson.bindingObjectApiName || 'FHH_EMDHFUNC_CustomFunction__c';
    const type = 'class';
    const finalNameSpace = nameSpace || funcJson.nameSpace || '';
    const finalReturnType = returnType || funcJson.returnType || '';
    const description = funcJson.description || '';
    const lang = funcJson.lang || 0;
    
    const commit = process.env.FX_COMMIT || 'fx-cli upload';
    const data = {
      type,
      lang: Number(lang),
      commit,
      apiName,
      nameSpace: finalNameSpace,
      description,
      name: className,
      bindingObjectApiName: finalBindingObjectApiName,
      metaXml: '',
      content: codeContent,
      updateTime
    };
    
    const defaultFunction = {
      api_name: apiName,
      application: '',
      binding_object_api_name: finalBindingObjectApiName,
      body: codeContent,
      commit_log: '',
      data_source: '',
      function_name: className,
      is_active: false,
      lang: Number(lang),
      name_space: finalNameSpace,
      parameters: [],
      remark: description,
      return_type: finalReturnType,
      status: 'not_used',
      type: 'class',
      version: 1
    };
    
    const analyzeResponse = await api.post('/FHH/EMDHFUNC/runtime/analyze', { function: defaultFunction });
    
    if (analyzeResponse.Result && analyzeResponse.Result.FailureMessage) {
      return { success: false, message: `类分析失败 [${className}]: ${analyzeResponse.Result.FailureMessage}`, name: className };
    }
    
    const { violations = [], success = true } = analyzeResponse.Value || {};
    const seriousError = violations.find((item) => item.priority >= 9);
    
    if (success === false && seriousError) {
      return { success: false, message: `类分析发现严重错误 [${className}]: ${seriousError?.message || '未知错误'}`, name: className };
    }
    
    const compileResponse = await api.post('/FHH/EMDHFUNC/runtime/compileCheck', { function: defaultFunction });
    
    if (compileResponse.Result?.FailureMessage) {
      return { success: false, message: `编译检查失败 [${className}]: ${compileResponse.Result.FailureMessage}`, name: className };
    }
    
    let uploadResponse;
    let retryCount = 0;
    const maxRetries = 2;
    
    while (retryCount <= maxRetries) {
      try {
        uploadResponse = await api.post('/FHH/EMDHFUNC/biz/upload', data);
        
        if (uploadResponse.Result && uploadResponse.Result.StatusCode !== 0) {
          const errorMessage = uploadResponse.Result.FailureMessage || '未知错误';
          
          if ((errorMessage.includes('已存在相同的apiName') || 
               errorMessage.includes('函数API名称已经存在') || 
               errorMessage.includes('当前代码在线上有更高版本')) && retryCount < maxRetries) {
            retryCount++;
            
            let latestUpdateTime = null;
            
            try {
              const classInfo = await api.getSingleFunction(apiName, 'class', finalBindingObjectApiName);
              
              if (classInfo && classInfo.update_time) {
                latestUpdateTime = classInfo.update_time;
              } else if (classInfo && classInfo.Value && classInfo.Value.update_time) {
                latestUpdateTime = classInfo.Value.update_time;
              } else if (classInfo && classInfo.updateTime) {
                latestUpdateTime = classInfo.updateTime;
              }
            } catch (serverError) {
            }
            
            if (!latestUpdateTime && unchangeableJson && unchangeableJson[`class:${className}`] && unchangeableJson[`class:${className}`].updateTime) {
              latestUpdateTime = unchangeableJson[`class:${className}`].updateTime;
            }
            
            if (latestUpdateTime) {
              data.updateTime = latestUpdateTime;
              continue;
            } else {
              return { success: false, message: `上传类失败 [${className}]: ${errorMessage}`, name: className };
            }
          } else {
            return { success: false, message: `上传类失败 [${className}]: ${errorMessage}`, name: className };
          }
        }
        break;
      } catch (err) {
        if ((err.message.includes('已存在相同的apiName') || 
             err.message.includes('函数API名称已经存在') || 
             err.message.includes('当前代码在线上有更高版本') ||
             err.message.includes('当前代码')) && retryCount < maxRetries) {
          retryCount++;
          
          let latestUpdateTime = null;
          
          try {
            const classInfo = await api.getSingleFunction(apiName, 'class', finalBindingObjectApiName);
            
            if (classInfo && classInfo.update_time) {
              latestUpdateTime = classInfo.update_time;
            } else if (classInfo && classInfo.Value && classInfo.Value.update_time) {
              latestUpdateTime = classInfo.Value.update_time;
            } else if (classInfo && classInfo.updateTime) {
              latestUpdateTime = classInfo.updateTime;
            }
          } catch (serverError) {
          }
          
          if (!latestUpdateTime && unchangeableJson && unchangeableJson[`class:${className}`] && unchangeableJson[`class:${className}`].updateTime) {
            latestUpdateTime = unchangeableJson[`class:${className}`].updateTime;
          }
          
          if (latestUpdateTime) {
            data.updateTime = latestUpdateTime;
            continue;
          } else {
            return { success: false, message: `上传类失败 [${className}]: ${err.message.substring(0, 200)}...`, name: className };
          }
        } else {
          return { success: false, message: `上传类失败 [${className}]: ${err.message.substring(0, 200)}...`, name: className };
        }
      }
    }
    
    return { 
      success: true, 
      message: `类 ${className} 推送成功`, 
      name: className, 
      id: (uploadResponse && uploadResponse.Value?.id) || apiName 
    };
  } catch (error) {
    return { success: false, message: `从内容推送类失败: ${error.message}` };
  }
};

/**
 * 从GitHub推送类
 * @param {Object} cls - 从GitHub API获取的类对象
 * @param {boolean} dryRun - 是否为模拟运行
 * @param {string} owner - 仓库所有者
 * @param {string} repo - 仓库名称
 * @param {string} branch - 分支名称
 * @param {string} targetDir - 目标目录
 * @returns {Promise<Object>} 推送结果
 */
const pushClassFromGitHub = async (cls, dryRun = false, owner = '', repo = '', branch = 'main', targetDir = '') => {
  try {
    const className = cls.metadata.name || cls.fileName;
    
    if (dryRun) {
      await new Promise(resolve => setTimeout(resolve, 100));
      return { name: className, success: true, message: '[DRY RUN] 类推送成功' };
    }
    
    const classContent = cls.content;
    
    if (!classContent) {
      throw new Error(`类内容为空: ${className}`);
    }
    
    let sanitizedClassName = className;
    if (sanitizedClassName.endsWith('.groovy')) {
      sanitizedClassName = sanitizedClassName.slice(0, -7);
    }
    sanitizedClassName = sanitizedClassName
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^(?=\d)/, '_');
    let classId = sanitizedClassName;
    
    let updateTime = 0;
    let nameSpace = '';
    let returnType = '';
    let bindingObjectApiName = '';
    let unchangeableJson = {};
    
    if (owner && repo && branch) {
      try {
        unchangeableJson = await getUnchangeableJsonFromGitHub(owner, repo, branch, targetDir);
        
        const possibleKeys = [
          `class:${className}`,
          `class:${sanitizedClassName}`,
          `class:${classId}`,
          className,
          sanitizedClassName,
          classId
        ];
        
        let classConfig = null;
        for (const key of possibleKeys) {
          if (unchangeableJson[key]) {
            classConfig = unchangeableJson[key];
            classId = classConfig.apiName || classId;
            updateTime = classConfig.updateTime || 0;
            break;
          }
        }
        
        if (classConfig) {
          nameSpace = classConfig.nameSpace || '';
          returnType = classConfig.returnType || '';
          bindingObjectApiName = classConfig.bindingObjectApiName || '';
        }
      } catch (error) {
      }
    }
    
    const filePath = path.join('/', `${sanitizedClassName}.groovy`);
    
    const result = await pushClassFromContent(filePath, classContent, unchangeableJson, updateTime, classId, nameSpace, returnType, bindingObjectApiName);
    
    if (result && result.success) {
      return { name: className, success: true, message: '类推送成功' };
    } else {
      throw new Error(result?.message || '类推送失败');
    }
  } catch (error) {
    return { 
      name: cls.metadata.name || cls.fileName, 
      success: false, 
      error: error.message 
    };
  }
};

module.exports = {
  pushClassFromGitHub
};
