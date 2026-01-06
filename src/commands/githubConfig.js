const { Command } = require('commander');
const chalk = require('chalk');
const { githubConfigManager } = require('../services/github-push/githubConfigManager');
const { logger } = require('../core/Logger');

// 日志输出函数
const logInfo = (message) => console.log(chalk.blue('ℹ'), message);
const logSuccess = (message) => console.log(chalk.green('✓'), message);
const logError = (message) => console.log(chalk.red('✗'), message);
const logWarning = (message) => console.log(chalk.yellow('⚠'), message);

/**
 * 执行GitHub配置管理命令
 * @param {Object} options - 命令选项
 */
async function execute(options) {
  try {
    const {
      list,
      add,
      remove,
      update,
      export: exportPath,
      import: importPath,
      clean,
      stats,
      url,
      name,
      branch,
      types,
      overwrite,
      dryRun
    } = options;

    // 列出所有仓库配置
    if (list) {
      const repositories = await githubConfigManager.listRepositories();
      
      if (repositories.length === 0) {
        logInfo('暂无仓库配置');
        return;
      }
      
      console.log(chalk.bold.blue('\\n=== GitHub仓库配置列表 ===\\n'));
      
      repositories.forEach((repo, index) => {
        console.log(chalk.bold(`${index + 1}. ${repo.name || repo.url}`));
        console.log(`  URL: ${repo.url}`);
        if (repo.branch) {
          console.log(`  默认分支: ${repo.branch}`);
        }
        if (repo.types) {
          console.log(`  推送类型: ${repo.types.join(', ')}`);
        }
        if (repo.targetDir) {
          console.log(`  目标目录: ${repo.targetDir}`);
        }
        if (repo.overwrite !== undefined) {
          console.log(`  覆盖已存在: ${repo.overwrite ? '是' : '否'}`);
        }
        if (repo.updatedAt) {
          console.log(`  更新时间: ${new Date(repo.updatedAt).toLocaleString()}`);
        }
        console.log('');
      });
      
      return;
    }

    // 添加仓库配置
    if (add && url) {
      const repoConfig = {
        name: name || '',
        branch: branch || 'main',
        types: types ? types.split(',') : ['component', 'plugin', 'function', 'class'],
        overwrite: overwrite !== undefined ? overwrite : false,
        dryRun: dryRun !== undefined ? dryRun : false,
        createdAt: new Date().toISOString()
      };
      
      await githubConfigManager.addOrUpdateRepository(url, repoConfig);
      logSuccess(`仓库配置已添加: ${url}`);
      return;
    }

    // 更新仓库配置
    if (update && url) {
      const existingRepo = await githubConfigManager.getRepository(url);
      
      if (!existingRepo) {
        logError(`仓库配置不存在: ${url}`);
        return;
      }
      
      const repoConfig = {
        ...existingRepo,
        name: name !== undefined ? name : existingRepo.name,
        branch: branch !== undefined ? branch : existingRepo.branch,
        types: types ? types.split(',') : existingRepo.types,
        overwrite: overwrite !== undefined ? overwrite : existingRepo.overwrite,
        dryRun: dryRun !== undefined ? dryRun : existingRepo.dryRun,
        updatedAt: new Date().toISOString()
      };
      
      await githubConfigManager.addOrUpdateRepository(url, repoConfig);
      logSuccess(`仓库配置已更新: ${url}`);
      return;
    }

    // 删除仓库配置
    if (remove && url) {
      await githubConfigManager.removeRepository(url);
      logSuccess(`仓库配置已删除: ${url}`);
      return;
    }

    // 导出配置
    if (exportPath) {
      await githubConfigManager.exportConfig(exportPath);
      logSuccess(`配置已导出到: ${exportPath}`);
      return;
    }

    // 导入配置
    if (importPath) {
      await githubConfigManager.importConfig(importPath);
      logSuccess(`配置已从 ${importPath} 导入`);
      return;
    }

    // 清理配置
    if (clean) {
      const { confirm } = require('inquirer');
      
      const { shouldClean } = await confirm({
        message: '确定要清理所有GitHub配置吗？此操作不可恢复。',
        default: false
      });
      
      if (shouldClean) {
        await githubConfigManager.cleanConfig();
        logSuccess('GitHub配置已清理');
      } else {
        logInfo('操作已取消');
      }
      
      return;
    }

    // 显示使用统计
    if (stats) {
      const statsData = await githubConfigManager.getUsageStats();
      
      console.log(chalk.bold.blue('\\n=== GitHub配置使用统计 ===\\n'));
      console.log(`总仓库数: ${statsData.totalRepositories}`);
      
      if (Object.keys(statsData.repositoriesByType).length > 0) {
        console.log('\\n按类型分组:');
        Object.entries(statsData.repositoriesByType).forEach(([type, count]) => {
          console.log(`  ${type}: ${count}`);
        });
      }
      
      if (Object.keys(statsData.repositoriesByBranch).length > 0) {
        console.log('\\n按分支分组:');
        Object.entries(statsData.repositoriesByBranch).forEach(([branch, count]) => {
          console.log(`  ${branch}: ${count}`);
        });
      }
      
      if (statsData.recentlyUsed.length > 0) {
        console.log('\\n最近使用的仓库:');
        statsData.recentlyUsed.forEach((repo, index) => {
          console.log(`  ${index + 1}. ${repo.url} (${new Date(repo.updatedAt).toLocaleDateString()})`);
        });
      }
      
      return;
    }

    // 如果没有指定任何操作，显示帮助信息
    console.log(chalk.bold.blue('\\n=== GitHub配置管理 ===\\n'));
    console.log('请指定要执行的操作:');
    console.log('  --list              列出所有仓库配置');
    console.log('  --add --url <url>   添加仓库配置');
    console.log('  --update --url <url> 更新仓库配置');
    console.log('  --remove --url <url> 删除仓库配置');
    console.log('  --export <path>     导出配置到文件');
    console.log('  --import <path>     从文件导入配置');
    console.log('  --clean             清理所有配置');
    console.log('  --stats             显示使用统计');
    console.log('\\n使用 fx-cli github-config --help 查看详细帮助');
  } catch (error) {
    logError(`GitHub配置管理失败: ${error.message}`);
    logger.error(`GitHub配置管理失败: ${error.message}`, error);
    process.exit(1);
  }
}

// 创建GitHub配置管理命令
const githubConfigCommand = new Command('github-config')
  .description('管理GitHub仓库配置')
  .option('--list', '列出所有仓库配置')
  .option('--add', '添加仓库配置')
  .option('--update', '更新仓库配置')
  .option('--remove', '删除仓库配置')
  .option('--export <path>', '导出配置到文件')
  .option('--import <path>', '从文件导入配置')
  .option('--clean', '清理所有配置')
  .option('--stats', '显示使用统计')
  .option('--url <url>', '仓库URL')
  .option('--name <name>', '仓库名称')
  .option('--branch <branch>', '默认分支')
  .option('--types <types>', '推送类型，逗号分隔')
  .option('--overwrite', '覆盖已存在的资源')
  .option('--dry-run', '试运行模式')
  .action(execute);

module.exports = githubConfigCommand;