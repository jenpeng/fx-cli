/**
 * Create Command
 * Create component, plugin, function or class with template
 */

const path = require('path');
const fs = require('fs-extra');
const { logger } = require('../core/Logger');
const { ConfigManager } = require('../core/ConfigManager');

// 定义支持的命名空间详细信息（基于ns_range.md）
const NAMESPACE_INFO = [
  { group: 'BI', value: 'bi_dev', type: 'class', return_type_str: ['void'] },
  { group: 'CONSUME', value: 'dht_sales_plugin', type: 'class', return_type_str: ['void'] },
  { group: 'CONSUME', value: 'custom_fmcg_sales', type: 'class', return_type_str: ['void'] },
  { group: 'CONSUME', value: 'fmcg_checkin_action_text', type: 'function', return_type_str: ['Map'] },
  { group: 'CONSUME', value: 'fmcg_checkin_visit', type: 'class', return_type_str: ['void'] },
  { group: 'CONSUME', value: 'fmcg_reward_calculate', type: 'function', return_type_str: ['Number'] },
  { group: 'CONSUME', value: 'fmcg_reward_task_agg_metric_condition', type: 'function', return_type_str: ['Number'] },
  { group: 'CONSUME', value: 'fmcg_salary_kpi_calculate', type: 'function', return_type_str: ['Number'] },
  { group: 'CONSUME', value: 'fmcg_checkin_plan_pwc', type: 'function', return_type_str: ['UIAction'] },
  { group: 'CONSUME', value: 'fmcg_tpm_activity_display_customized_information', type: 'function', return_type_str: ['List'] },
  { group: 'ERPDSS', value: 'erpdss', type: 'function', return_type_str: ['Map'] },
  { group: 'ERPDSS', value: 'kingdee_cloud', type: 'function', return_type_str: ['Map'] },
  { group: 'ERPDSS', value: 'erpdss-class', type: 'class', return_type_str: ['void'] },
  { group: 'INDUSTRY', value: 'electronic_sign', type: 'class', return_type_str: ['void'] },
  { group: 'INDUSTRY', value: 'call_center', type: 'function', return_type_str: ['Map', 'void', 'String'] },
  { group: 'INDUSTRY', value: 'stock_replenishment', type: 'function', return_type_str: ['void', 'String'] },
  { group: 'MARKET', value: 'marketing_page', type: 'function', return_type_str: ['Map'] },
  { group: 'OBJECT', value: 'button', type: 'function', return_type_str: ['UIAction', 'String', 'Map', 'void'] },
  { group: 'OBJECT', value: 'scope_rule', type: 'function', return_type_str: ['List', 'QueryTemplate', 'RangeRule'] },
  { group: 'OBJECT', value: 'ui_event', type: 'function', return_type_str: ['UIEvent', 'Remind'] },
  { group: 'OBJECT', value: 'auto_number', type: 'function', return_type_str: ['IncrementNumber'] },
  { group: 'OBJECT', value: 'validate_function', type: 'function', return_type_str: ['ValidateResult'] },
  { group: 'OBJECT', value: 'import', type: 'function', return_type_str: ['ValidateResult'] },
  { group: 'OBJECT', value: 'print_template_snippet', type: 'function', return_type_str: ['Map'] },
  { group: 'OBJECT', value: 'related_scope', type: 'function', return_type_str: ['RelatedObject'] },
  { group: 'OBJECT', value: 'change_order_rule', type: 'function', return_type_str: ['ValidateResult'] },
  { group: 'OBJECT', value: 'object_controller_plugin', type: 'class', return_type_str: ['void'] },
  { group: 'OBJECT', value: 'object_export_plugin', type: 'class', return_type_str: ['void'] },
  { group: 'OBJECT', value: 'object_handler', type: 'class', return_type_str: ['void'] },
  { group: 'ORDER', value: 'promotion', type: 'function', return_type_str: ['List'] },
  { group: 'ORDER', value: 'dht_sales_plugin', type: 'class', return_type_str: ['void'] },
  { group: 'ORDER', value: 'customer_account_plugin', type: 'class', return_type_str: ['void'] },
  { group: 'PLATFORM', value: 'flow', type: 'function', return_type_str: ['void', 'List', 'Boolean'] },
  { group: 'PLATFORM', value: 'scheduler_task', type: 'function', return_type_str: ['void'] },
  { group: 'PLATFORM', value: 'controller', type: 'function', return_type_str: ['Map'] },
  { group: 'PLATFORM', value: 'library', type: 'class', return_type_str: ['void'] },
  { group: 'PLATFORM', value: 'custom_oauth_protocol', type: 'class', return_type_str: ['void'] },
  { group: 'PLATFORM', value: 'mandatory_notice', type: 'function', return_type_str: ['UIAction'] },
  { group: 'OBJECT', value: 'usable_record_type', type: 'class', return_type_str: ['void'] },
  { group: 'PLATFORM', value: 'event_listener', type: 'class', return_type_str: ['void'] },
  { group: 'PLATFORM', value: 'apl_controller', type: 'class', return_type_str: ['void'] },
  { group: 'PLATFORM', value: 'online_doc', type: 'class', return_type_str: ['void'] },
  { group: 'PLATFORM', value: 'ai_prompt', type: 'function', return_type_str: ['Map'] },
  { group: 'PLATFORM', value: 'ai_custom_model', type: 'class', return_type_str: ['Map'] },
  { group: 'PLATFORM', value: 'environment_deploy', type: 'class', return_type_str: ['void'] },
  { group: 'SERVICE', value: 'e_service', type: 'function', return_type_str: ['void', 'String'] },
  { group: 'SERVICE', value: 'e_service_sop', type: 'function', return_type_str: ['Boolean'] },
  { group: 'SFA', value: 'Activity提示词规则', type: 'function', return_type_str: ['Boolean'] },
  { group: 'SFA', value: 'automatch_function', type: 'function', return_type_str: ['List'] },
  { group: 'SFA', value: 'recovery', type: 'function', return_type_str: ['void'] },
  { group: 'SFA', value: 'enterprise_directory', type: 'function', return_type_str: ['ValidateResult'] },
  { group: 'SFA', value: 'condition', type: 'function', return_type_str: ['Map', 'RelatedObject'] },
  { group: 'SFA', value: 'execution', type: 'function', return_type_str: ['Map', 'RelatedObject'] },
  { group: 'SFA', value: 'change_result', type: 'function', return_type_str: ['Map', 'RelatedObject'] },
  { group: 'SFA', value: 'channel_notice', type: 'function', return_type_str: ['void'] },
  { group: 'SFA', value: 'channel_sign', type: 'function', return_type_str: ['String'] },
  { group: 'SFA', value: 'channel_range', type: 'function', return_type_str: ['List'] },
  { group: 'SFA', value: 'metric_condition', type: 'function', return_type_str: ['Number', 'Boolean'] },
  { group: 'SFA', value: 'incentive_rule_execute', type: 'function', return_type_str: ['Number', 'Boolean'] },
  { group: 'SYNC_DATA', value: 'er_login_oauth', type: 'class', return_type_str: ['void'] },
  { group: 'SYNC_DATA', value: 'er_login', type: 'class', return_type_str: ['void', 'String', 'Map', 'List', 'Boolean', 'Number'] },
  { group: 'SYNC_DATA', value: 'er_register', type: 'class', return_type_str: ['void', 'String', 'Map', 'List', 'Boolean', 'Number'] },
  { group: 'SYNC_DATA', value: 'sync_data', type: 'function', return_type_str: ['Map'] }
];

// 按类型分组的命名空间列表
const SUPPORTED_NAMESPACES = {
  class: NAMESPACE_INFO.filter(ns => ns.type === 'class').map(ns => ns.value),
  function: NAMESPACE_INFO.filter(ns => ns.type === 'function').map(ns => ns.value)
};

// 获取namespace的详细信息
function getNamespaceInfo(nameSpace, type) {
  return NAMESPACE_INFO.find(ns => ns.value === nameSpace && ns.type === type);
}

// 验证returnType是否在允许的范围内
function validateReturnType(returnType, nameSpace, type) {
  if (type === 'class') {
    // class的returnType可选，不需要验证
    return { valid: true, message: '' };
  }
  
  if (type === 'function') {
    // function的returnType必须，且需要验证范围
    const nsInfo = getNamespaceInfo(nameSpace, type);
    if (!nsInfo) {
      return { valid: false, message: `命名空间${nameSpace}不存在或类型不匹配` };
    }
    
    const allowedReturnTypes = nsInfo.return_type_str;
    if (!allowedReturnTypes.includes(returnType)) {
      return { valid: false, message: `命名空间${nameSpace}的function只允许以下返回类型：${allowedReturnTypes.join(',')}。请使用命令 'fx-cli create --list-namespaces' 查看详细信息` };
    }
  }
  
  return { valid: true, message: '' };
}

// 验证API名称是否符合规则
function validateApiName(apiName) {
  if (!apiName) {
    return { valid: false, message: 'API名称不能为空' };
  }
  
  if (!apiName.endsWith('__c')) {
    return { valid: false, message: 'API名称必须以__c结尾' };
  }
  
  // 验证是否符合代码变量名规则（除了__c后缀）
  const namePart = apiName.slice(0, -3); // 去掉__c后缀
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(namePart)) {
    return { valid: false, message: 'API名称必须符合代码变量名规则（只能包含字母、数字和下划线，且以字母或下划线开头）' };
  }
  
  return { valid: true, message: '' };
}

// 验证命名空间是否在支持的范围内
function validateNameSpace(nameSpace, type) {
  if (!nameSpace) {
    return { valid: false, message: '命名空间不能为空' };
  }
  
  // 获取对应类型支持的命名空间列表
  const supportedNamespaces = SUPPORTED_NAMESPACES[type] || [];
  if (!supportedNamespaces.includes(nameSpace)) {
    return { 
      valid: false, 
      message: `命名空间不在支持范围内。使用命令 'fx-cli create --list-namespaces' 查看${type}类型支持的命名空间清单` 
    };
  }
  
  return { valid: true, message: '' };
}

// 列出支持的命名空间
// 计算字符串的显示宽度（中文字符算2个，其他算1个）
function getDisplayWidth(str) {
  let width = 0;
  for (let i = 0; i < str.length; i++) {
    // 中文字符的Unicode范围
    if (str.charCodeAt(i) >= 0x4e00 && str.charCodeAt(i) <= 0x9fa5 || 
        str.charCodeAt(i) >= 0xff00 && str.charCodeAt(i) <= 0xffef || 
        str.charCodeAt(i) >= 0x3000 && str.charCodeAt(i) <= 0x303f) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

// 按显示宽度填充字符串
function padEndByDisplayWidth(str, targetWidth, padChar = ' ') {
  const currentWidth = getDisplayWidth(str);
  if (currentWidth >= targetWidth) {
    return str;
  }
  const padding = padChar.repeat(targetWidth - currentWidth);
  return str + padding;
}

function listSupportedNamespaces() {
  console.log('\n支持的命名空间清单：');
  console.log('┌───────────┬─────────────────────────────────────────────────────────┬─────────────┬──────────────────────────────────────┐');
  console.log('│  类型     │  命名空间                                               │  分组       │  允许的返回类型                      │');
  console.log('├───────────┼─────────────────────────────────────────────────────────┼─────────────┼──────────────────────────────────────┤');
  
  // 按类型排序并列出
  const sortedNs = [...NAMESPACE_INFO].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type.localeCompare(b.type);
    }
    return a.value.localeCompare(b.value);
  });
  
  sortedNs.forEach(ns => {
    const typeCol = padEndByDisplayWidth(ns.type, 8);
    const valueCol = padEndByDisplayWidth(ns.value, 54); // 增加命名空间列宽度以容纳中文字符
    const groupCol = padEndByDisplayWidth(ns.group, 10);
    const returnTypeCol = padEndByDisplayWidth(ns.return_type_str.join(','), 36);
    console.log(`│  ${typeCol} │  ${valueCol} │  ${groupCol} │ ${returnTypeCol} │`);
  });
  
  console.log('└───────────┴─────────────────────────────────────────────────────────┴─────────────┴──────────────────────────────────────┘');
}

async function createComponent(options) {
    const { name, type, targetPath, apiName } = options;
    const templatePath = type === 'ava' ? 'component-ava' : 'component';
    const fullTemplatePath = path.join(__dirname, '../../../extension/asset', templatePath);
    
    // 创建组件目录
    const componentDir = path.join(targetPath, name);
    fs.mkdirSync(componentDir, { recursive: true });
    
    // 复制模板文件
    if (type === 'ava') {
        // AVA组件模板结构
        const fileTreePath = path.join(fullTemplatePath, 'fileTree');
        await fs.copy(fileTreePath, componentDir);
        
        // 复制XML文件
        const xmlPath = path.join(fullTemplatePath, 'component.xml');
        await fs.copy(xmlPath, path.join(componentDir, `${name}.xml`));
    } else {
        // Vue组件模板结构
        // 复制整个sourceFiles目录（保留目录结构）
        const sourceFilesPath = path.join(fullTemplatePath, 'sourceFiles');
        const destSourceFilesPath = path.join(componentDir, 'sourceFiles');
        await fs.copy(sourceFilesPath, destSourceFilesPath);
        
        // 复制静态文件
        const staticPath = path.join(fullTemplatePath, 'static');
        if (fs.existsSync(staticPath)) {
            await fs.copy(staticPath, path.join(componentDir, 'static'));
        }
        
        // 复制XML文件，使用固定的component.xml文件名
        const xmlPath = path.join(fullTemplatePath, 'component.xml');
        await fs.copy(xmlPath, path.join(componentDir, 'component.xml'));
    }
    
    logger.info(`已创建组件: ${name} (${type})`);
    logger.info(`组件路径: ${componentDir}`);
    
    return componentDir;
}

async function createPlugin(options) {
    const { name, type, targetPath, apiName } = options;
    const templatePath = type === 'ava' ? 'plugin-ava' : 'plugin';
    const fullTemplatePath = path.join(__dirname, '../../../extension/asset', templatePath);
    
    // 创建插件目录
    const pluginDir = path.join(targetPath, name);
    fs.mkdirSync(pluginDir, { recursive: true });
    
    // 复制模板文件
    if (type === 'ava') {
        // AVA插件模板结构
        const fileTreePath = path.join(fullTemplatePath, 'fileTree');
        await fs.copy(fileTreePath, pluginDir);
        
        // 复制XML文件
        const xmlPath = path.join(fullTemplatePath, 'plugin.xml');
        await fs.copy(xmlPath, path.join(pluginDir, `${name}.xml`));
    } else {
        // Vue插件模板结构
        // 复制整个sourceFiles目录（保留目录结构）
        const sourceFilesPath = path.join(fullTemplatePath, 'sourceFiles');
        const destSourceFilesPath = path.join(pluginDir, 'sourceFiles');
        await fs.copy(sourceFilesPath, destSourceFilesPath);
        
        // 复制静态文件
        const staticPath = path.join(fullTemplatePath, 'static');
        if (fs.existsSync(staticPath)) {
            await fs.copy(staticPath, path.join(pluginDir, 'static'));
        }
        
        // 复制XML文件，使用固定的plugin.xml文件名
        const xmlPath = path.join(fullTemplatePath, 'plugin.xml');
        await fs.copy(xmlPath, path.join(pluginDir, 'plugin.xml'));
    }
    
    logger.info(`已创建插件: ${name} (${type})`);
    logger.info(`插件路径: ${pluginDir}`);
    
    return pluginDir;
}

async function createFunction(options) {
    const { name, targetPath, apiName, lang = 'groovy', nameSpace, returnType, bindingObjectApiName } = options;
    const fullTemplatePath = path.join(__dirname, '../../../extension/asset/function');
    
    // 确保目标目录存在
    fs.mkdirSync(targetPath, { recursive: true });
    
    // 创建函数文件
    const functionName = apiName ? apiName.replace(/__c$/, '') : name;
    const groovyPath = path.join(targetPath, `${functionName}.groovy`);
    
    // 读取模板文件内容
    const templateContent = fs.readFileSync(path.join(fullTemplatePath, 'function.groovy'), 'utf8');
    
    // 替换模板中的占位符
    let functionContent = templateContent.replace(/#demo#/g, functionName);
    functionContent = functionContent.replace(/#returnType#/g, returnType);
    functionContent = functionContent.replace(/#bindingObjectApiName#/g, bindingObjectApiName);
    
    // 写入替换后的内容到目标文件
    fs.writeFileSync(groovyPath, functionContent, 'utf8');
    
    logger.info(`已创建函数: ${name}`);
    logger.info(`函数文件: ${groovyPath}`);
    
    return { groovyPath };
}

async function createClass(options) {
    const { name, targetPath, apiName, lang = 'groovy', nameSpace, returnType } = options;
    const fullTemplatePath = path.join(__dirname, '../../../extension/asset/class');
    
    // 确保目标目录存在
    fs.mkdirSync(targetPath, { recursive: true });
    
    // 创建类文件
    const className = apiName ? apiName.replace(/__c$/, '') : name;
    const groovyPath = path.join(targetPath, `${className}.groovy`);
    
    // 读取模板文件内容
    const templateContent = fs.readFileSync(path.join(fullTemplatePath, 'class.groovy'), 'utf8');
    
    // 替换模板中的占位符
    let classContent = templateContent.replace(/#demo#/g, className);
    classContent = classContent.replace(/#returnType#/g, returnType || 'void');
    
    // 写入替换后的内容到目标文件
    fs.writeFileSync(groovyPath, classContent, 'utf8');
    
    logger.info(`已创建类: ${name}`);
    logger.info(`类文件: ${groovyPath}`);
    
    return { groovyPath };
}

async function updateUnchangeableJson(projectRoot, type, info) {
    try {
        const unchangeableJsonPath = path.join(projectRoot, 'unchangeableJson.json');
        let unchangeableJson = {};
        
        // 读取现有文件
        if (fs.existsSync(unchangeableJsonPath)) {
            unchangeableJson = JSON.parse(fs.readFileSync(unchangeableJsonPath, 'utf8'));
        }
        
        // 构建资源键名 - 使用去掉__c后缀的API名称作为键
        const apiName = info.apiName;
        const keyName = apiName.replace(/__c$/, '');
        const key = `${type}:${keyName}`;
        
        // 读取实际的文件内容
        let content = '';
        if (type === 'function' || type === 'class') {
            const fileName = keyName;
            const fileType = type === 'function' ? 'functions' : 'classes';
            const filePath = path.join(projectRoot, 'fx-app', 'main', 'APL', fileType, `${fileName}.groovy`);
            if (fs.existsSync(filePath)) {
                content = fs.readFileSync(filePath, 'utf8');
            }
        }
        
        // 根据资源类型构建不同的记录结构
        const baseRecord = {
            apiName, // apiName字段保持包含__c后缀
            name: info.name,
            updateTime: new Date().getTime(),
            content: content,
            bindingObjectApiName: info.bindingObjectApiName || (type === 'class' ? 'NONE' : ''),
            type,
            tenantId: '67000207', // 使用与现有记录一致的租户ID
            lang: 0 // 使用数字类型的lang，与现有记录一致
        };
        
        let resourceRecord;
        if (type === 'component' || type === 'plugin') {
            // component和plugin不需要lang、nameSpace和returnType字段
            resourceRecord = {
                ...baseRecord
            };
        } else {
            // function和class需要lang、nameSpace和returnType字段
            resourceRecord = {
                ...baseRecord,
                nameSpace: info.nameSpace || '',
                returnType: info.returnType || (type === 'class' ? 'void' : '')
            };
        }
        
        // 更新资源记录
        unchangeableJson[key] = resourceRecord;
        
        // 写回文件
        fs.writeFileSync(unchangeableJsonPath, JSON.stringify(unchangeableJson, null, 2), 'utf8');
        logger.info(`已更新unchangeableJson.json记录: ${key}`);
    } catch (error) {
        logger.warn(`更新unchangeableJson.json失败: ${error.message}`);
    }
}

async function execute(type, name, options) {
    try {
        // 检查是否需要列出命名空间
        if (options.listNamespaces) {
            listSupportedNamespaces();
            return;
        }
        
        logger.info(`开始创建${type}: ${name}`);
        
        // 验证类型
        const validTypes = ['component', 'plugin', 'function', 'class'];
        if (!validTypes.includes(type)) {
            throw new Error(`不支持的类型: ${type}，请使用以下类型之一: ${validTypes.join(', ')}`);
        }
        
        // 统一处理API名称，确保所有类型都有正确的API名称
        let apiName = options.apiName || `${name}__c`;
        if (!apiName.endsWith('__c')) {
            apiName += '__c';
        }
        
        // 验证API名称
        const apiNameValidation = validateApiName(apiName);
        if (!apiNameValidation.valid) {
            throw new Error(apiNameValidation.message);
        }
        
        options.apiName = apiName;
        
        // 参数验证
        if (type === 'component' || type === 'plugin') {
            // component和plugin的参数验证
            if (!options.subType) {
                throw new Error(`${type}类型必须指定--sub-type参数（vue或ava）`);
            }
            
            if (options.subType !== 'vue' && options.subType !== 'ava') {
                throw new Error(`${type}类型的sub-type参数只能是vue或ava`);
            }
        } else if (type === 'function' || type === 'class') {
            // function和class的参数验证
            // 验证命名空间
            if (!options.nameSpace) {
                throw new Error(`${type}类型必须指定--name-space参数`);
            }
            
            const nameSpaceValidation = validateNameSpace(options.nameSpace, type);
            if (!nameSpaceValidation.valid) {
                throw new Error(nameSpaceValidation.message);
            }
            
            if (type === 'class') {
                // class的returnType可选，默认void
                options.returnType = options.returnType || 'void';
            } else if (type === 'function') {
                // function的returnType必须设置
                if (!options.returnType) {
                    throw new Error(`function类型必须指定--return-type参数`);
                }
                
                // 验证returnType是否在允许的范围内
                const returnTypeValidation = validateReturnType(options.returnType, options.nameSpace, type);
                if (!returnTypeValidation.valid) {
                    throw new Error(returnTypeValidation.message);
                }
                
                // function的bindingObjectApiName必须设置
                if (!options.bindingObjectApiName) {
                    throw new Error(`function类型必须指定--binding-object-api-name参数，请去纷享销客管理端查询业务对象api名称`);
                }
            }
        }
        
        // 初始化配置管理器
        const configManager = new ConfigManager({ useProjectConfig: true });
        const projectRoot = configManager.projectRoot;
        
        // 处理路径参数
        let targetPath = options.path;
        if (!targetPath) {
            // 使用默认路径
            switch (type) {
                case 'component':
                    targetPath = path.join(projectRoot, 'fx-app', 'main', 'PWC', 'components');
                    break;
                case 'plugin':
                    targetPath = path.join(projectRoot, 'fx-app', 'main', 'PWC', 'plugins');
                    break;
                case 'function':
                    targetPath = path.join(projectRoot, 'fx-app', 'main', 'APL', 'functions');
                    break;
                case 'class':
                    targetPath = path.join(projectRoot, 'fx-app', 'main', 'APL', 'classes');
                    break;
                default:
                    targetPath = process.cwd();
            }
        }
        
        // 确保目标路径存在
        fs.mkdirSync(targetPath, { recursive: true });
        
        // 处理语言参数
        const lang = options.lang || 'groovy';
        
        // 根据类型执行创建操作
        let result;
        
        // 为不同类型设置不同的参数
        switch (type) {
            case 'component':
            case 'plugin':
                // component和plugin不需要nameSpace和returnType参数
                const uiCreateOptions = {
                    name,
                    type: options.subType || 'vue', // 用于component和plugin的子类型(vue/ava)
                    targetPath,
                    apiName: options.apiName
                };
                result = type === 'component' ? await createComponent(uiCreateOptions) : await createPlugin(uiCreateOptions);
                // 更新unchangeableJson记录（不包含nameSpace和returnType）
                await updateUnchangeableJson(projectRoot, type, {
                    apiName: options.apiName,
                    name,
                    lang: '' // component和plugin不需要lang
                });
                break;
            case 'function':
            case 'class':
                // function和class需要nameSpace参数
                const codeCreateOptions = {
                    name,
                    targetPath,
                    apiName: options.apiName,
                    lang,
                    nameSpace: options.nameSpace || '', // 空字符串作为默认值，与extension一致
                    returnType: options.returnType,
                    bindingObjectApiName: options.bindingObjectApiName
                };
                result = type === 'function' ? await createFunction(codeCreateOptions) : await createClass(codeCreateOptions);
                // 更新unchangeableJson记录（包含nameSpace和returnType）
                await updateUnchangeableJson(projectRoot, type, {
                    apiName: options.apiName,
                    name,
                    lang,
                    nameSpace: options.nameSpace || '',
                    returnType: options.returnType,
                    bindingObjectApiName: options.bindingObjectApiName || ''
                });
                break;
        }
        
        logger.info(`${type} 创建成功!`);
        
    } catch (error) {
        logger.error(`创建${type}失败:`, error.message || error);
        throw error;
    }
}

module.exports = {
    execute
};
