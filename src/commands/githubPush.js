/**
 * GitHub推送命令
 * 从GitHub仓库推送代码到服务端
 */

const Command = require('commander').Command;
const chalk = require('chalk');
const chalkInstance = chalk.default || chalk;
const { getConfigManager } = require('../core/ConfigManager');
const githubPushService = require('../services/github-push/githubPushService');
const { logger } = require('../core/Logger');
const progressManager = require('../utils/progressManager');
const { ErrorHandler } = require('../core/ErrorHandler');
const Table = require('cli-table3');

// 颜色函数别名，方便使用
const blue = chalkInstance.blue;
const green = chalkInstance.green;
const red = chalkInstance.red;
const yellow = chalkInstance.yellow;
const gray = chalkInstance.gray;
const cyan = chalkInstance.cyan;
const bold = chalkInstance.bold;

// 日志输出函数
const logInfo = (message, detail) => console.log(blue('ℹ'), message, detail ? detail : '');
const logSuccess = (message, detail) => console.log(green('✓'), message, detail ? detail : '');
const logError = (message, detail) => console.log(red('✗'), message, detail ? detail : '');
const logWarning = (message, detail) => console.log(yellow('⚠'), message, detail ? detail : '');

/**
 * 执行GitHub推送命令
 * @param {Object} options - 命令选项
 * @returns {Promise<void>}
 */
async function execute(options = {}) {
  try {
    // 获取配置管理器实例
    const configManager = getConfigManager();
    
    // 设置命令选项的默认值
    const { repo, branch, commit, dir, types = 'component,plugin,function,class', dryRun, autoAuth = true, history, auth } = options;
    
    // 解析要推送的类型
    const pushTypes = types.split(',').map(type => type.trim());
    
    // 检查是否需要查看历史记录
    if (history) {
      try {
        progressManager.startSpinner('正在获取推送历史...');
        const historyData = await githubPushService.getPushHistory();
        
        if (historyData.length === 0) {
          progressManager.stopSpinner('暂无推送历史记录');
          return;
        }
        
        // 创建历史记录表格
        const table = new Table({
          head: ['ID', '时间', '仓库', '分支', '提交', '状态', '项目数'],
          colWidths: [5, 25, 30, 15, 12, 10, 8]
        });
        
        // 填充历史记录数据
        historyData.slice(-10).reverse().forEach(item => {
          let statusColor;
          if (item.status === 'success') statusColor = green;
          else if (item.status === 'partial') statusColor = yellow;
          else statusColor = red;
          
          table.push([
            item.id,
            new Date(item.timestamp).toLocaleString(),
            item.repo,
            item.branch,
            item.commit ? item.commit.slice(0, 7) : 'HEAD',
            statusColor(item.status),
            `${item.successCount}/${item.totalCount}`
          ]);
        });
        
        progressManager.stopSpinner('推送历史获取成功');
        console.log(bold(blue('\n=== GitHub推送历史 ===\n')));
        console.log(table.toString());
        console.log(gray('\n注: 成功/失败格式'));
      } catch (error) {
        progressManager.failSpinner('获取推送历史失败');
        throw error;
      }
    }

    // 如果请求认证
    if (auth) {
      console.log(chalkInstance.bold.blue('=== 服务端认证 ===\n'));
      
      // 检查是否已登录
      const isLoggedIn = await configManager.isAuthenticated();
      if (isLoggedIn) {
        logSuccess('已登录服务端');
        return;
      }
      
      // 如果未登录，提示用户输入认证信息
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      try {
        console.log(bold(cyan('\nGitHub代码推送服务端认证')));
        console.log(gray('请输入服务端认证信息：'));
        
        // 获取用户输入
        const domain = await new Promise(resolve => rl.question(green('服务端地址: '), resolve));
        const certificate = await new Promise(resolve => rl.question(green('认证令牌: '), resolve));
        
        // 验证输入
        if (!domain || !certificate) {
          console.log(red('错误: 服务端地址和认证令牌不能为空'));
          rl.close();
          return;
        }
        
        // 使用新的setAuthInfo方法保存认证信息
        await configManager.setAuthInfo({
          domain: domain,
          certificate: certificate
        });
        
        // 验证登录状态
        const isLoggedIn = await configManager.isAuthenticated();
        const authInfo = await configManager.getAuthInfo();
        if (isLoggedIn) {
          console.log(green('✅ 登录成功！'));
          console.log(gray(`服务端地址: ${authInfo.domain}`));
        } else {
          console.log(yellow('⚠️  登录信息已保存，但验证失败。请检查认证令牌是否正确。'));
        }
        
        // 显示当前认证信息
        // 打印当前认证域名
        if (authInfo) {
          logInfo('当前认证域名:', cyan(authInfo.domain));
        }
        
        return;
      } catch (error) {
        console.log(red(`❌ 登录失败: ${error.message}`));
        logger.error('Login failed:', error);
      } finally {
        rl.close();
      }
      
      return;
    }
    
    // 检查是否缺少必要的参数
    if (!repo) {
      logError('缺少必要参数: 请提供GitHub仓库URL');
      return;
    }
    
    // 开始执行推送操作
    progressManager.startSpinner('正在准备GitHub推送...');
    
    // 配置推送参数
    const pushConfig = {
      repo,
      branch,
      commit,
      dir,
      types: pushTypes,
      dryRun,
      autoAuth
    };
    
    // 打印推送配置信息
    console.log(bold(blue('\n=== GitHub推送配置 ===\n')));
    console.log(`仓库URL: ${cyan(repo)}`);
    console.log(`分支: ${cyan(branch || 'main')}`);
    
    if (commit) {
      console.log(`提交: ${cyan(commit)}`);
    }
    
    if (dir) {
      console.log(`目标目录: ${cyan(dir)}`);
    }
    
    if (pushTypes.length > 0) {
      console.log(`推送类型: ${cyan(pushTypes.join(', '))}`);
    }
    
    if (dryRun) {
      console.log(yellow('\n🔍 试运行模式: 不实际推送代码'));
    }
    
    // 执行推送操作
    progressManager.startSpinner('正在执行GitHub推送...');
    
    // 实际执行推送操作
    const pushResult = await githubPushService.pushRepository(repo, {
      branch,
      targetDir: dir,
      types: pushTypes,
      commitId: commit,
      dryRun,
      autoAuth: options.autoAuth !== false
    });
    
    // 停止进度条
    progressManager.stopSpinner();
    
    // 显示推送结果
    if (pushResult.success) {
      logSuccess('GitHub推送完成');
      
      if (pushResult.summary) {
        console.log('\n📊 推送摘要:');
        for (const [type, stats] of Object.entries(pushResult.summary)) {
          console.log(`${cyan(type)}: ${stats.success} 成功, ${stats.failed} 失败, ${stats.total} 总计`);
        }
      }
      
      if (pushResult.totalSuccess > 0) {
        console.log(green(`\n✅ 成功推送 ${pushResult.totalSuccess} 个资源`));
      }
      
      if (pushResult.totalFailed > 0) {
        console.log(red(`\n❌ 有 ${pushResult.totalFailed} 个资源推送失败`));
      }
      
      if (pushResult.errors && pushResult.errors.length > 0) {
        console.log('\n❌ 错误详情:');
        pushResult.errors.forEach((error, index) => {
          console.log(`${index + 1}. ${error.message}`);
        });
      }
      
      // 推送成功后退出进程
      process.exit(0);
    } else {
      logError('GitHub推送失败');
      if (pushResult.error) {
        console.log(red(`错误信息: ${pushResult.error.message}`));
      }
      process.exit(1);
    }
  } catch (error) {
    // 处理操作取消错误
    if (error.name === 'AbortError') {
      progressManager.stopSpinner('操作已取消');
      logWarning('操作已取消');
      return;
    }
    
    // 处理其他错误
    progressManager.stopSpinner('GitHub推送失败');
    
    logError(`GitHub推送失败: ${error.message}`);
    logger.error(`GitHub推送失败: ${error.message}`, error);
    
    // 提供错误解决建议
    if (error.code === 'ENOTFOUND') {
      console.log(yellow('\n建议: 请检查网络连接和GitHub仓库URL是否正确'));
    } else if (error.response && error.response.status === 401) {
      console.log(yellow('\n建议: 请检查GitHub访问令牌是否有效'));
    } else if (error.response && error.response.status === 404) {
      console.log(yellow('\n建议: 请检查GitHub仓库是否存在，以及分支名称是否正确'));
    } else if (error.code === 'ECONNREFUSED') {
      console.log(yellow('\n建议: 无法连接到服务端，请检查网络连接和服务端地址是否正确'));
    }
    
    process.exit(1);
  }
}

// 创建GitHub推送命令
const githubPushCommand = new Command('github-push')
  .description('从GitHub仓库推送代码到服务端')
  .option('-r, --repo <url>', 'GitHub仓库URL')
  .option('-b, --branch <name>', '分支名称 (默认: main)', 'main')
  .option('-c, --commit <id>', '特定的提交ID')
  .option('-d, --dir <path>', '仓库中的目标目录')
  .option('-t, --types <types>', '要推送的类型，逗号分隔 (component,plugin,function,class)', 'component,plugin,function,class')
  .option('--dry-run', '试运行模式，不实际推送')
  .option('--no-auto-auth', '禁用自动认证功能')
  .option('--history', '查看推送历史记录')
  .option('--auth', '登录服务端并验证登录状态')
  .action(execute);

module.exports = githubPushCommand;