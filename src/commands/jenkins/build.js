/**
 * Jenkins构建命令
 * 用于触发Jenkins任务的构建
 */
const ora = require('ora');
const chalk = require('chalk');
const { ConfigManager } = require('../../core/ConfigManager');
const { jenkinsService } = require('../../services/jenkinsService');

/**
 * 执行Jenkins构建命令
 * @param {Object} options - 命令选项
 * @param {string} options.jobName - 任务名称
 * @param {string} options.parameters - 构建参数（JSON字符串）
 * @returns {Promise<void>}
 */
async function execute(options) {
  const spinner = ora('正在准备触发Jenkins构建...').start();
  
  try {
    // 检查Jenkins配置
    const configManager = new ConfigManager();
    const jenkinsConfig = configManager.getConfig('jenkins');
    
    if (!jenkinsConfig || !jenkinsConfig.url || !jenkinsConfig.username || !jenkinsConfig.token) {
      spinner.fail(chalk.red('Jenkins未配置'));
      console.error(chalk.yellow('请先运行 `fx-cli jenkins setup` 命令配置Jenkins连接信息'));
      return;
    }
    
    const { jobName, parameters } = options;
    
    if (!jobName) {
      spinner.fail(chalk.red('任务名称不能为空'));
      return;
    }
    
    // 解析构建参数
    let buildParameters = {};
    if (parameters) {
      try {
        buildParameters = JSON.parse(parameters);
      } catch (error) {
        spinner.fail(chalk.red('构建参数格式错误'));
        console.error(chalk.yellow('构建参数必须是有效的JSON格式'));
        return;
      }
    }
    
    spinner.text = `正在触发Jenkins任务 ${chalk.cyan(jobName)} 的构建...`;
    
    // 触发构建
    const buildInfo = await jenkinsService.triggerBuild(jobName, buildParameters);
    
    if (buildInfo) {
      spinner.succeed(chalk.green('构建触发成功'));
      console.log(chalk.cyan(`\n构建信息:`));
      console.log(chalk.white(`  构建编号: ${buildInfo.number}`));
      console.log(chalk.white(`  构建URL: ${buildInfo.url}`));
      console.log(chalk.white(`  任务名称: ${buildInfo.jobName}`));
      
      console.log(chalk.yellow(`\n提示: 使用 fx-cli jenkins status ${jobName} ${buildInfo.number} 查看构建状态`));
    } else {
      spinner.fail(chalk.red('构建触发失败'));
    }
  } catch (error) {
    spinner.fail(chalk.red('触发构建时发生错误'));
    console.error(chalk.red(`错误信息: ${error.message}`));
  }
}

module.exports = { execute };
