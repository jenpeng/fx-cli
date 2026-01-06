/**
 * 代码扫描器
 * 从GitHub目录树中扫描并识别各种代码资源
 */

const githubService = require('../services/github-push/githubService');
const { logger } = require('../core/Logger');
const progressManager = require('./progressManager');

class CodeScanner {
  constructor() {
    // 组件识别规则
    this.componentPatterns = [
      /\.vue$/,
      /\.component\.js$/,
      /\.component\.ts$/,
      /components\/.*\.xml$/,
      /fx-app\/main\/.*\.vue$/,
      /fx-app\/main\/.*\.component\.js$/,
      /fx-app\/main\/.*\.component\.ts$/
    ];

    // 插件识别规则
    this.pluginPatterns = [
      /plugins\/.*\.js$/,
      /plugins\/.*\.ts$/,
      /plugin\.xml$/,
      /fx-app\/main\/plugins\/.*\.js$/,
      /fx-app\/main\/plugins\/.*\.ts$/,
      /fx-app\/main\/plugin\.xml$/
    ];

    // 函数识别规则
    this.functionPatterns = [
      /APL\/functions\/.*\.groovy$/,
      /APL\/functions\/.*\.java$/,
      /fx-app\/main\/APL\/functions\/.*\.groovy$/,
      /fx-app\/main\/APL\/functions\/.*\.java$/
    ];

    // 类识别规则
    this.classPatterns = [
      /APL\/classes\/.*\.groovy$/,
      /APL\/classes\/.*\.java$/,
      /fx-app\/main\/APL\/classes\/.*\.groovy$/,
      /fx-app\/main\/APL\/classes\/.*\.java$/
    ];
  }

  /**
   * 从GitHub目录树扫描代码资源
   * @param {Array} tree - GitHub目录树
   * @param {string} owner - 仓库所有者
   * @param {string} repo - 仓库名称
   * @param {string} branch - 分支名称
   * @param {string} targetDir - 目标目录（可选）
   * @param {Array<string>} types - 要处理的资源类型（可选）
   * @returns {Promise<Array>} 代码资源列表
   */
  async scanFromGitHubTree(tree, owner, repo, branch, targetDir = '', types = []) {
    const resources = [];

    // 过滤出文件（GitHub API返回的文件类型是'blob'）
    const files = tree.filter(item => item.type === 'blob');

    // 如果指定了目标目录，只处理该目录下的文件
    const filteredFiles = targetDir 
      ? files.filter(file => file.path.startsWith(targetDir))
      : files;

    // 标记是否已经提示过凭据，避免无限循环
    let hasPromptedCreds = false;
    // 标记是否已经成功设置凭据
    let hasSetCreds = false;

    // 过滤掉不需要处理的文件类型
    const relevantFiles = filteredFiles.filter(file => {
      const resourceType = this.identifyResourceType(file.path);
      // 如果没有指定类型，或者文件类型在指定类型列表中，就处理
      return !types || types.length === 0 || types.includes(resourceType);
    });

    // 识别所有资源，每个资源目录对应一个资源
    const resourceIdentifiers = new Map();
    
    // 为每种资源类型创建一个集合，用于去重
    const componentDirectories = new Set();
    const pluginDirectories = new Set();
    const functionFiles = new Set();
    const classFiles = new Set();
    
    // 识别所有资源标识符
    for (const file of relevantFiles) {
      const resourceType = this.identifyResourceType(file.path);
      if (!resourceType) continue;
      
      switch (resourceType) {
        case 'component':
          if (file.path.includes('/components/')) {
            const componentPathParts = file.path.split('/');
            const componentIndex = componentPathParts.indexOf('components');
            if (componentIndex !== -1 && componentIndex + 1 < componentPathParts.length) {
              componentDirectories.add(componentPathParts[componentIndex + 1]);
            }
          }
          break;
        
        case 'plugin':
          if (file.path.includes('/plugins/')) {
            const pluginPathParts = file.path.split('/');
            const pluginIndex = pluginPathParts.indexOf('plugins');
            if (pluginIndex !== -1 && pluginIndex + 1 < pluginPathParts.length) {
              pluginDirectories.add(pluginPathParts[pluginIndex + 1]);
            }
          }
          break;
        
        case 'function':
          // 函数文件本身就是一个资源
          functionFiles.add(file.path);
          break;
        
        case 'class':
          // 类文件本身就是一个资源
          classFiles.add(file.path);
          break;
      }
    }
    
    // 计算总资源数
    const totalResources = componentDirectories.size + pluginDirectories.size + functionFiles.size + classFiles.size;
    
    // 显示扫描开始信息
    console.log(`开始扫描 ${totalResources} 个资源...`);

    // 启动进度条
    progressManager.startProgressBar(totalResources, '正在扫描资源...', 'scan-progress');
    
    // 记录已处理的资源，避免重复处理
    const processedResources = new Map();
    processedResources.set('component', new Set());
    processedResources.set('plugin', new Set());
    processedResources.set('function', new Set());
    processedResources.set('class', new Set());

    for (const file of relevantFiles) {
      const resourceType = this.identifyResourceType(file.path);
      
      if (!resourceType) continue;

      let resourceId;
      let resourceName;
      
      // 获取资源标识符和名称
      switch (resourceType) {
        case 'component':
          if (file.path.includes('/components/')) {
            const componentPathParts = file.path.split('/');
            const componentIndex = componentPathParts.indexOf('components');
            if (componentIndex !== -1 && componentIndex + 1 < componentPathParts.length) {
              resourceId = componentPathParts[componentIndex + 1];
              resourceName = resourceId;
            }
          }
          break;
        
        case 'plugin':
          if (file.path.includes('/plugins/')) {
            const pluginPathParts = file.path.split('/');
            const pluginIndex = pluginPathParts.indexOf('plugins');
            if (pluginIndex !== -1 && pluginIndex + 1 < pluginPathParts.length) {
              resourceId = pluginPathParts[pluginIndex + 1];
              resourceName = resourceId;
            }
          }
          break;
        
        case 'function':
          resourceId = file.path;
          resourceName = file.path.split('/').pop().replace(/\.(groovy|java)$/, '');
          break;
        
        case 'class':
          resourceId = file.path;
          resourceName = file.path.split('/').pop().replace(/\.(groovy|java)$/, '');
          break;
      }
      
      if (!resourceId) continue;
      
      // 如果该资源已经处理过，跳过
      if (processedResources.get(resourceType).has(resourceId)) {
        continue;
      }
      
      try {
        const resource = await this.createResource(
          file,
          resourceType,
          owner,
          repo,
          branch,
          tree, // 传递完整目录树，避免重复获取
          !hasPromptedCreds && !hasSetCreds // 只有第一次调用允许提示凭据，设置成功后不再提示
        );
        resources.push(resource);
        processedResources.get(resourceType).add(resourceId);
        
        // 更新进度条
        const processedCount = resources.length;
        progressManager.updateProgressBar(processedCount, `正在扫描: ${resourceName} (${resourceType})`, 'scan-progress');
      } catch (error) {
        logger.error(`创建资源失败: ${file.path}, 错误: ${error.message}`);
        // 如果是认证错误，设置标记为已提示过凭据
        if (error.response && [401, 403].includes(error.response.status)) {
          hasPromptedCreds = true;
          // 如果凭据设置成功，允许后续文件使用新凭据
          if (error.message && error.message.includes('GitHub凭据已设置')) {
            hasSetCreds = true;
            hasPromptedCreds = false; // 重置已提示标记，允许后续文件使用新凭据
          }
        }
      }
    }

    // 停止扫描进度条
    progressManager.stopProgressBar('scan-progress');
    console.log(`扫描完成，从 ${relevantFiles.length} 个文件中识别到 ${resources.length} 个代码资源`);
    return resources;
  }

  /**
   * 识别资源类型
   * @param {string} filePath - 文件路径
   * @returns {string|null} 资源类型
   */
  identifyResourceType(filePath) {
    if (this.componentPatterns.some(pattern => pattern.test(filePath))) {
      return 'component';
    }
    if (this.pluginPatterns.some(pattern => pattern.test(filePath))) {
      return 'plugin';
    }
    if (this.functionPatterns.some(pattern => pattern.test(filePath))) {
      return 'function';
    }
    if (this.classPatterns.some(pattern => pattern.test(filePath))) {
      return 'class';
    }
    return null;
  }

  /**
   * 创建资源对象
   * @param {Object} file - 文件对象
   * @param {string} type - 资源类型
   * @param {string} owner - 仓库所有者
   * @param {string} repo - 仓库名称
   * @param {string} branch - 分支名称
   * @param {Array} tree - GitHub目录树
   * @param {boolean} allowPromptCreds - 是否允许提示凭据
   * @returns {Promise<Object>} 资源对象
   */
  async createResource(file, type, owner, repo, branch, tree, allowPromptCreds = true) {
    const fileName = this.extractFileName(file.path);
    const content = await githubService.getFileContent(owner, repo, file.path, branch, allowPromptCreds);

    const resource = {
      type,
      fileName,
      filePath: file.path,
      content,
      metadata: {
        name: fileName,
        path: file.path
      }
    };

    // 根据类型提取额外的元数据
    switch (type) {
    case 'component':
      await this.extractComponentMetadata(resource, owner, repo, branch, tree, allowPromptCreds);
      break;
    case 'plugin':
      await this.extractPluginMetadata(resource, owner, repo, branch, tree, allowPromptCreds);
      break;
    case 'function':
      this.extractFunctionMetadata(resource);
      break;
    case 'class':
      this.extractClassMetadata(resource);
      break;
    }

    return resource;
  }

  /**
   * 提取文件名
   * @param {string} filePath - 文件路径
   * @returns {string} 文件名
   */
  extractFileName(filePath) {
    const parts = filePath.split('/');
    return parts[parts.length - 1];
  }

  /**
   * 提取组件元数据
   * @param {Object} resource - 资源对象
   * @param {string} owner - 仓库所有者
   * @param {string} repo - 仓库名称
   * @param {string} branch - 分支名称
   * @param {Array} tree - GitHub目录树
   * @param {boolean} allowPromptCreds - 是否允许提示凭据
   */
  async extractComponentMetadata(resource, owner, repo, branch, tree, allowPromptCreds = true) {
    // 查找component.xml文件
    const componentDir = resource.filePath.substring(0, resource.filePath.lastIndexOf('/'));
    const xmlPath = `${componentDir}/component.xml`;

    try {
      const xmlContent = await githubService.getFileContent(owner, repo, xmlPath, branch, allowPromptCreds);
      resource.metadata.componentXml = xmlContent;
    } catch (error) {
      logger.warn(`找不到组件XML文件: ${xmlPath}`);
    }

    // 提取组件名称：从目录路径中提取，而不是从文件名
    // 例如：fx-app/main/PWC/components/pwc-header/component.xml -> pwc-header
    const pathParts = componentDir.split('/');
    const componentName = pathParts[pathParts.length - 1];
    resource.metadata.name = componentName;

    // 扫描sourceFiles、fileTree和staticFiles目录
    await this.scanComponentFiles(resource, componentDir, owner, repo, branch, tree, allowPromptCreds);
  }

  /**
   * 扫描组件文件
   * @param {Object} resource - 资源对象
   * @param {string} componentDir - 组件目录
   * @param {string} owner - 仓库所有者
   * @param {string} repo - 仓库名称
   * @param {string} branch - 分支名称
   * @param {Array} tree - GitHub目录树
   * @param {boolean} allowPromptCreds - 是否允许提示凭据
   */
  async scanComponentFiles(resource, componentDir, owner, repo, branch, tree, allowPromptCreds = true) {
    resource.metadata.sourceFiles = [];
    resource.metadata.fileTree = [];
    resource.metadata.staticFiles = [];

    try {
      // 直接使用传入的目录树，过滤出该组件目录下的所有文件
      const componentFiles = tree.filter(item => 
        item.type === 'blob' && item.path.startsWith(componentDir + '/')
      );

      // 遍历所有文件
      for (const file of componentFiles) {
        const relativePath = file.path.substring(componentDir.length + 1);
        const fileName = relativePath.split('/').pop();

        // 跳过component.xml文件
        if (fileName === 'component.xml') {
          continue;
        }

        // 根据路径分类文件
        if (relativePath.startsWith('sourceFiles/')) {
          // sourceFiles目录下的文件
          const content = await githubService.getFileContent(owner, repo, file.path, branch, allowPromptCreds);
          resource.metadata.sourceFiles.push({
            fileName: fileName,
            filePath: relativePath,
            content: content
          });
        } else if (relativePath.startsWith('fileTree/')) {
          // fileTree目录下的文件
          const content = await githubService.getFileContent(owner, repo, file.path, branch, allowPromptCreds);
          resource.metadata.fileTree.push({
            fileName: fileName,
            filePath: relativePath,
            content: content
          });
        } else if (relativePath.startsWith('static/')) {
          // static目录下的文件（静态资源）
          const content = await githubService.getFileContent(owner, repo, file.path, branch, allowPromptCreds);
          resource.metadata.staticFiles.push({
            fileName: fileName,
            filePath: relativePath,
            size: file.size || 0,
            content: content
          });
        } else {
          // 其他文件，默认放入fileTree
          const content = await githubService.getFileContent(owner, repo, file.path, branch, allowPromptCreds);
          resource.metadata.fileTree.push({
            fileName: fileName,
            filePath: relativePath,
            content: content
          });
        }
      }

      logger.debug(`组件 ${resource.metadata.name} 扫描完成: sourceFiles=${resource.metadata.sourceFiles.length}, fileTree=${resource.metadata.fileTree.length}, staticFiles=${resource.metadata.staticFiles.length}`);
    } catch (error) {
      logger.warn(`扫描组件文件失败: ${error.message}`);
    }
  }

  /**
   * 提取插件元数据
   * @param {Object} resource - 资源对象
   * @param {string} owner - 仓库所有者
   * @param {string} repo - 仓库名称
   * @param {string} branch - 分支名称
   * @param {Array} tree - GitHub目录树
   * @param {boolean} allowPromptCreds - 是否允许提示凭据
   */
  async extractPluginMetadata(resource, owner, repo, branch, tree, allowPromptCreds = true) {
    // 查找plugin.xml文件
    const pluginDir = resource.filePath.substring(0, resource.filePath.lastIndexOf('/'));
    const xmlPath = `${pluginDir}/plugin.xml`;

    try {
      const xmlContent = await githubService.getFileContent(owner, repo, xmlPath, branch, allowPromptCreds);
      resource.metadata.pluginXml = xmlContent;
    } catch (error) {
      logger.warn(`找不到插件XML文件: ${xmlPath}`);
    }

    // 提取插件名称：从目录路径中提取，而不是从文件名
    // 例如：fx-app/main/PWC/plugins/MyPlugin/plugin.xml -> MyPlugin
    const pathParts = pluginDir.split('/');
    const pluginName = pathParts[pathParts.length - 1];
    resource.metadata.name = pluginName;

    // 扫描fileTree和staticFiles目录
    await this.scanPluginFiles(resource, pluginDir, owner, repo, branch, tree, allowPromptCreds);
  }

  /**
   * 扫描插件文件
   * @param {Object} resource - 资源对象
   * @param {string} pluginDir - 插件目录
   * @param {string} owner - 仓库所有者
   * @param {string} repo - 仓库名称
   * @param {string} branch - 分支名称
   * @param {Array} tree - GitHub目录树
   * @param {boolean} allowPromptCreds - 是否允许提示凭据
   */
  async scanPluginFiles(resource, pluginDir, owner, repo, branch, tree, allowPromptCreds = true) {
    resource.metadata.sourceFiles = [];
    resource.metadata.fileTree = [];
    resource.metadata.staticFiles = [];

    try {
      // 直接使用传入的目录树，过滤出该插件目录下的所有文件
      const pluginFiles = tree.filter(item => 
        item.type === 'blob' && item.path.startsWith(pluginDir + '/')
      );

      // 遍历所有文件
      for (const file of pluginFiles) {
        const relativePath = file.path.substring(pluginDir.length + 1);
        const fileName = relativePath.split('/').pop();

        // 跳过plugin.xml文件
        if (fileName === 'plugin.xml') {
          continue;
        }

        // 根据路径分类文件
        if (relativePath.startsWith('sourceFiles/')) {
          // sourceFiles目录下的文件
          const content = await githubService.getFileContent(owner, repo, file.path, branch, allowPromptCreds);
          resource.metadata.sourceFiles.push({
            fileName: fileName,
            filePath: relativePath,
            content: content
          });
        } else if (relativePath.startsWith('fileTree/')) {
          // fileTree目录下的文件
          const content = await githubService.getFileContent(owner, repo, file.path, branch, allowPromptCreds);
          resource.metadata.fileTree.push({
            fileName: fileName,
            filePath: relativePath,
            content: content
          });
        } else if (relativePath.startsWith('static/')) {
          // static目录下的文件（静态资源）
          const content = await githubService.getFileContent(owner, repo, file.path, branch, allowPromptCreds);
          resource.metadata.staticFiles.push({
            fileName: fileName,
            filePath: relativePath,
            size: file.size || 0,
            content: content
          });
        } else {
          // 其他文件，默认放入fileTree
          const content = await githubService.getFileContent(owner, repo, file.path, branch, allowPromptCreds);
          resource.metadata.fileTree.push({
            fileName: fileName,
            filePath: relativePath,
            content: content
          });
        }
      }

      logger.debug(`插件 ${resource.metadata.name} 扫描完成: sourceFiles=${resource.metadata.sourceFiles.length}, fileTree=${resource.metadata.fileTree.length}, staticFiles=${resource.metadata.staticFiles.length}`);
    } catch (error) {
      logger.warn(`扫描插件文件失败: ${error.message}`);
    }
  }

  /**
   * 提取函数元数据
   * @param {Object} resource - 资源对象
   */
  extractFunctionMetadata(resource) {
    // 提取函数名称（去掉扩展名）
    const nameWithoutExt = resource.fileName.replace(/\.(groovy|java)$/, '');
    resource.metadata.name = nameWithoutExt;
  }

  /**
   * 提取类元数据
   * @param {Object} resource - 资源对象
   */
  extractClassMetadata(resource) {
    // 提取类名称（去掉扩展名）
    const nameWithoutExt = resource.fileName.replace(/\.(groovy|java)$/, '');
    resource.metadata.name = nameWithoutExt;
  }
}

// 创建单例实例
const codeScanner = new CodeScanner();

module.exports = {
  codeScanner,
  CodeScanner
};
