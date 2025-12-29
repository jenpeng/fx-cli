/**
 * 文件操作工具函数
 * 提供文件和目录的各种操作功能
 */

const fs = require('fs-extra');
const path = require('path');
const JSZip = require('jszip');

// 忽略的文件和目录列表
const BLACK_LIST = [
  '.git',
  '.svn',
  '.DS_Store',
  'node_modules',
  'dist',
  'build',
  '.vscode',
  '.idea',
  '*.log',
  '*.tmp',
  '*.temp'
];

/**
 * 检查文件或目录是否应该被忽略
 * @param {string} name - 文件或目录名
 * @returns {boolean} 是否忽略
 */
const shouldIgnore = (name) => {
  return BLACK_LIST.some(pattern => {
    if (pattern.includes('*')) {
      // 简单的通配符匹配
      const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
      return regex.test(name);
    }
    return name === pattern;
  });
};

/**
 * 将目录结构转换为JSON对象
 * @param {string} dirPath - 目录路径
 * @returns {Promise<Object>} 目录结构的JSON表示
 */
const dir2json = async (dirPath) => {
  const result = {};
  
  try {
    const files = await fs.readdir(dirPath);
    
    for (const file of files) {
      // 忽略黑名单中的文件
      if (shouldIgnore(file)) continue;
      
      const filePath = path.join(dirPath, file);
      const stats = await fs.stat(filePath);
      
      if (stats.isDirectory()) {
        // 递归处理子目录
        result[file] = await dir2json(filePath);
      } else if (stats.isFile()) {
        // 对于文件，先不读取内容，只记录信息
        result[file] = {
          type: 'file',
          size: stats.size,
          mtime: stats.mtimeMs
        };
      }
    }
    
    return result;
  } catch (error) {
    throw new Error(`转换目录结构失败: ${error.message}`);
  }
};

/**
 * 根据JSON对象创建目录结构
 * @param {Object} json - 目录结构的JSON表示
 * @param {string} dirPath - 目标目录路径
 * @returns {Promise<void>}
 */
const json2Dir = async (json, dirPath) => {
  try {
    // 确保目标目录存在
    await fs.ensureDir(dirPath);
    
    for (const [name, content] of Object.entries(json)) {
      const targetPath = path.join(dirPath, name);
      
      if (typeof content === 'object' && !content.type) {
        // 如果是目录
        await json2Dir(content, targetPath);
      } else if (content.type === 'file') {
        // 如果是文件，只创建空文件（内容需要单独处理）
        await fs.ensureFile(targetPath);
        if (content.content) {
          await fs.writeFile(targetPath, content.content, 'utf8');
        }
      }
    }
  } catch (error) {
    throw new Error(`创建目录结构失败: ${error.message}`);
  }
};

/**
 * 读取文件内容
 * @param {string} filePath - 文件路径
 * @returns {Promise<string>} 文件内容
 */
const readFileContent = async (filePath) => {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(`读取文件失败: ${error.message}`);
  }
};

/**
 * 写入文件内容
 * @param {string} filePath - 文件路径
 * @param {string} content - 文件内容
 * @returns {Promise<void>}
 */
const writeFileContent = async (filePath, content) => {
  try {
    // 确保目录存在
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content, 'utf8');
  } catch (error) {
    throw new Error(`写入文件失败: ${error.message}`);
  }
};

/**
 * 下载文件到指定目录
 * @param {string} fileUrl - 文件URL
 * @param {string} dirPath - 目标目录
 * @param {string} fileName - 文件名（可选）
 * @returns {Promise<string>} 下载后的文件路径
 */
const downloadFileToDir = async (fileUrl, dirPath, fileName) => {
  try {
    // 确保目录存在
    await fs.ensureDir(dirPath);
    
    // 从URL中提取文件名
    if (!fileName) {
      const urlParts = fileUrl.split('/');
      fileName = urlParts[urlParts.length - 1];
    }
    
    const filePath = path.join(dirPath, fileName);
    
    // 这里需要使用axios或其他HTTP库来下载文件
    // 暂时返回文件路径
    return filePath;
  } catch (error) {
    throw new Error(`下载文件失败: ${error.message}`);
  }
};

/**
 * 将目录中的文件转换为上传格式
 * @param {string} dirPath - 目录路径
 * @returns {Promise<Object>} 上传格式的文件对象
 */
const prepareFilesForUpload = async (dirPath) => {
  const files = {};
  
  const processDir = async (currentPath, relativePath = '') => {
    const items = await fs.readdir(currentPath);
    
    for (const item of items) {
      // 忽略黑名单中的文件
      if (shouldIgnore(item)) continue;
      
      const itemPath = path.join(currentPath, item);
      const stats = await fs.stat(itemPath);
      const itemRelativePath = relativePath ? path.join(relativePath, item) : item;
      
      if (stats.isDirectory()) {
        // 递归处理子目录
        await processDir(itemPath, itemRelativePath);
      } else if (stats.isFile()) {
        // 读取文件内容
        const content = await fs.readFile(itemPath, 'utf8');
        files[itemRelativePath] = content;
      }
    }
  };
  
  await processDir(dirPath);
  return files;
};

/**
 * 压缩目录为ZIP文件
 * @param {string} dirPath - 要压缩的目录路径
 * @param {string} outputPath - 输出ZIP文件路径
 * @returns {Promise<string>} ZIP文件路径
 */
const zipDirectory = async (dirPath, outputPath) => {
  try {
    const zip = new JSZip();
    
    const addFilesToZip = async (currentPath, relativePath = '') => {
      const items = await fs.readdir(currentPath);
      
      for (const item of items) {
        // 忽略黑名单中的文件
        if (shouldIgnore(item)) continue;
        
        const itemPath = path.join(currentPath, item);
        const stats = await fs.stat(itemPath);
        const zipPath = relativePath ? path.join(relativePath, item) : item;
        
        if (stats.isDirectory()) {
          await addFilesToZip(itemPath, zipPath);
        } else if (stats.isFile()) {
          zip.file(zipPath, await fs.readFile(itemPath));
        }
      }
    };
    
    await addFilesToZip(dirPath);
    
    // 确保输出目录存在
    await fs.ensureDir(path.dirname(outputPath));
    
    // 生成ZIP文件
    const content = await zip.generateAsync({ type: 'nodebuffer' });
    await fs.writeFile(outputPath, content);
    
    return outputPath;
  } catch (error) {
    throw new Error(`压缩目录失败: ${error.message}`);
  }
};

/**
 * 解压ZIP文件
 * @param {string} zipPath - ZIP文件路径
 * @param {string} outputPath - 解压输出路径
 * @returns {Promise<void>}
 */
const unzipDirectory = async (zipPath, outputPath) => {
  try {
    // 确保输出目录存在
    await fs.ensureDir(outputPath);
    
    const data = await fs.readFile(zipPath);
    const zip = await JSZip.loadAsync(data);
    
    // 解压所有文件
    await Promise.all(
      Object.keys(zip.files).map(async (fileName) => {
        const file = zip.files[fileName];
        // 忽略目录条目
        if (!file.dir) {
          const content = await file.async('nodebuffer');
          const targetPath = path.join(outputPath, fileName);
          // 确保目标目录存在
          await fs.ensureDir(path.dirname(targetPath));
          await fs.writeFile(targetPath, content);
        }
      })
    );
  } catch (error) {
    throw new Error(`解压ZIP文件失败: ${error.message}`);
  }
};

/**
 * 解析Groovy文件注释中的配置信息
 * @param {string} filePath - Groovy文件路径
 * @returns {Promise<Object>} 提取的配置信息
 */
const parseGroovyComments = async (filePath) => {
  try {
    const content = await readFileContent(filePath);
    
    // 匹配Javadoc风格的注释块
    const commentRegex = /\/\*\*(.*?)\*\//s;
    const match = content.match(commentRegex);
    
    if (!match) {
      return {};
    }
    
    const comment = match[1];
    const config = {};
    
    // 提取@codeName
    const codeNameRegex = /@codeName\s+(\S+)/;
    const codeNameMatch = comment.match(codeNameRegex);
    if (codeNameMatch) {
      config.codeName = codeNameMatch[1];
    }
    
    // 提取@bindingObjectApiName
    const bindingObjectRegex = /@bindingObjectApiName\s+(\S+)/;
    const bindingObjectMatch = comment.match(bindingObjectRegex);
    if (bindingObjectMatch) {
      config.bindingObjectApiName = bindingObjectMatch[1];
    }
    
    // 提取@description (处理单行描述)
    const descRegex = /@description\s+([^@\n]*)/;
    const descMatch = comment.match(descRegex);
    if (descMatch) {
      config.description = descMatch[1].trim();
    }
    
    // 提取@returnType
    const returnTypeRegex = /@returnType\s+(\S+)/;
    const returnTypeMatch = comment.match(returnTypeRegex);
    if (returnTypeMatch) {
      config.returnType = returnTypeMatch[1];
    }
    
    // 提取@nameSpace
    const nameSpaceRegex = /@nameSpace\s+(\S+)/;
    const nameSpaceMatch = comment.match(nameSpaceRegex);
    if (nameSpaceMatch) {
      config.nameSpace = nameSpaceMatch[1];
    }
    
    return config;
  } catch (error) {
    console.error(`解析Groovy注释失败 [${filePath}]: ${error.message}`);
    return {};
  }
};

/**
 * 读取函数的info.json配置文件
 * @param {string} functionPath - 函数目录或文件路径
 * @returns {Promise<Object>} info.json配置信息
 */
const getInfoJson = async (functionPath) => {
  try {
    // 确定info.json文件路径
    let infoJsonPath;
    if ((await fs.stat(functionPath)).isDirectory()) {
      // 如果是目录，查找目录下的info.json
      infoJsonPath = path.join(functionPath, 'info.json');
    } else {
      // 如果是文件，查找同一目录下的info.json
      infoJsonPath = path.join(path.dirname(functionPath), 'info.json');
    }
    
    if (await fs.pathExists(infoJsonPath)) {
      const content = await readFileContent(infoJsonPath);
      return JSON.parse(content);
    }
    
    return {};
  } catch (error) {
    console.error(`读取info.json失败 [${functionPath}]: ${error.message}`);
    return {};
  }
};

/**
 * 写入函数的info.json配置文件
 * @param {string} functionPath - 函数目录或文件路径
 * @param {Object} data - 配置信息
 * @returns {Promise<void>}
 */
const setInfoJson = async (functionPath, data) => {
  try {
    // 确定info.json文件路径
    let infoJsonPath;
    if ((await fs.stat(functionPath)).isDirectory()) {
      // 如果是目录，在目录下创建info.json
      infoJsonPath = path.join(functionPath, 'info.json');
    } else {
      // 如果是文件，在同一目录下创建info.json
      infoJsonPath = path.join(path.dirname(functionPath), 'info.json');
    }
    
    // 如果文件已存在，合并现有数据
    if (await fs.pathExists(infoJsonPath)) {
      const existingData = JSON.parse(await readFileContent(infoJsonPath));
      data = { ...existingData, ...data };
    }
    
    await writeFileContent(infoJsonPath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`写入info.json失败 [${functionPath}]: ${error.message}`);
  }
};

module.exports = {
  BLACK_LIST,
  shouldIgnore,
  dir2json,
  json2Dir,
  readFileContent,
  writeFileContent,
  downloadFileToDir,
  prepareFilesForUpload,
  zipDirectory,
  unzipDirectory,
  parseGroovyComments,
  getInfoJson,
  setInfoJson
};