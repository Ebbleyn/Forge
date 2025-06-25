const fs = require('fs');
const readline = require('readline');
const path = require('path'); 

const VERSION = '1.3.7';

function makeEnv(parent = null) {
  const env = {
    vars: {},
    funcs: {},
    parent,
    getVar(name) {
      if (name in this.vars) return this.vars[name];
      if (this.parent) return this.parent.getVar(name);
      throw new Error(`Variable "${name}" is not defined`);
    },
    setVar(name, value) {
      if (name in this.vars) {
        this.vars[name] = value;
      } else if (this.parent && this.parent.hasVar(name)) {
        this.parent.setVar(name, value);
      } else {
        this.vars[name] = value;
      }
    },
    hasVar(name) {
      if (name in this.vars) return true;
      if (this.parent) return this.parent.hasVar(name);
      return false;
    },
    defineFunc(name, func) {
      this.funcs[name] = func;
    },
    getFunc(name) {
      if (name in this.funcs) return this.funcs[name];
      if (this.parent) return this.parent.getFunc(name);
      throw new Error(`Function "${name}" is not defined`);
    }
  };

  // Базовые функции
  env.funcs.sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  env.funcs.array = (...args) => args;
  env.funcs.push = (arr, val) => {
    if (!Array.isArray(arr)) throw new Error('push: first argument is not an array');
    arr.push(val);
    return arr.length;
  };
  env.funcs.pop = (arr) => {
    if (!Array.isArray(arr)) throw new Error('pop: argument is not an array');
    return arr.pop();
  };
  // В функции makeEnv добавь:
env.funcs.exit = () => {
  return new Promise(resolve => {
    console.log('Press any key to exit...');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.exit(0);
    });
  });
};
  env.funcs.length = (arr) => {
    if (!Array.isArray(arr)) throw new Error('length: argument is not an array');
    return arr.length;
  };
  env.funcs.slice = (arr, start, end) => {
    if (!Array.isArray(arr)) throw new Error('slice: first argument is not an array');
    return arr.slice(start, end);
  };
  env.funcs.input = (promptText = '') => {
    return new Promise(resolve => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      rl.question(promptText, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  };

  // Работа с файлами
  env.funcs.write = (filename, content) => {
    fs.writeFileSync(filename, String(content));
    return true;
  };
  env.funcs.append = (filename, content) => {
    fs.appendFileSync(filename, String(content));
    return true;
  };
  env.funcs.read = (filename) => {
    if (!fs.existsSync(filename)) throw new Error(`read: File "${filename}" not found`);
    return fs.readFileSync(filename, 'utf8');
  };

  // Работа со строками
  env.funcs.upper = (str) => String(str).toUpperCase();
  env.funcs.lower = (str) => String(str).toLowerCase();
  env.funcs.split = (str, sep) => String(str).split(sep);
  env.funcs.join = (arr, sep) => {
    if (!Array.isArray(arr)) throw new Error('join: first argument must be array');
    return arr.join(sep);
  };
  env.funcs.replace = (str, from, to) => String(str).split(from).join(to);
  env.funcs.contains = (str, substr) => String(str).includes(substr);

  // Работа с элементами массива
  env.funcs.get = (arr, index) => {
    if (!Array.isArray(arr)) throw new Error('get: first argument must be array');
    return arr[index];
  };
  env.funcs.set = (arr, index, value) => {
    if (!Array.isArray(arr)) throw new Error('set: first argument must be array');
    arr[index] = value;
    return true;
  };

  return env;
}

function log(...args) {
  const res = args.map(a => (typeof a === 'string' ? a : String(a))).join('');
  console.log(res);
}

function countIndent(line) {
  let count = 0;
  for (const ch of line) {
    if (ch === ' ') count++;
    else break;
  }
  return count;
}

function isComment(line) {
  const trim = line.trim();
  return trim.startsWith('//') || trim.startsWith('#');
}

function parseBlock(lines, startIndent = 0, startIndex = 0) {
  const block = [];
  let i = startIndex;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '' || isComment(line)) {
      i++;
      continue;
    }
    const indent = countIndent(line);
    if (indent < startIndent) break;
    if (indent > startIndent) {
      if (block.length === 0) throw new Error("Incorrect indentation");
      const last = block[block.length - 1];
      if (!last.block) last.block = [];
      const [nestedBlock, nextIndex] = parseBlock(lines, indent, i);
      last.block = nestedBlock;
      i = nextIndex;
      continue;
    }
    block.push({ line: line.trim(), block: null, __line: i + 1 });
    i++;
  }
  return [block, i];
}

function parsePrintArgs(str) {
  const res = [];
  let current = '';
  let inStr = false;
  let quote = '';
  let depth = 0;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inStr) {
      current += ch;
      if (ch === quote && str[i - 1] !== '\\') {
        inStr = false;
      }
    } else {
      if (ch === '"' || ch === "'") {
        inStr = true;
        quote = ch;
        current += ch;
      } else if (ch === '(') {
        depth++;
        current += ch;
      } else if (ch === ')') {
        depth--;
        current += ch;
      } else if (ch === ',' && depth === 0) {
        res.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  if (current.trim() !== '') res.push(current.trim());
  return res;
}

async function execBlock(block, env) {
  for (let i = 0; i < block.length; i++) {
    const { line, block: innerBlock, __line } = block[i];
    try {
      const res = await execLine(line, innerBlock, env, __line);
      if (res && res.type === 'return') return res;
    } catch (e) {
      console.error(`\x1b[31m[Error at line ${__line || 'unknown'}]: ${e.message}\x1b[0m`);
      process.exit(1);
    }
  }
  return null;
}
async function execLine(line, block, env, lineNumber = -1) {
  // Удаляем комментарии в конце строки
  line = line.split('//')[0].trim();

  if (isComment(line) || line === '') return null;

  if (/^(async\s+)?function\s+(\w+)\s*\(([^)]*)\):$/.test(line)) {
  const [, isAsync, name, argsStr] = line.match(/^(async\s+)?function\s+(\w+)\s*\(([^)]*)\):$/);
  const args = argsStr.trim() ? argsStr.split(',').map(a => a.trim()) : [];

  env.defineFunc(name, async function (...callArgs) {
    const localEnv = makeEnv(env);
    for (let i = 0; i < args.length; i++) {
      localEnv.vars[args[i]] = callArgs[i];
    }

    const result = await execBlock(block, localEnv);
    if (result && result.type === 'return') return result.value;
    return null;
  });

  return null;
}

if (/^await\s+(\w+)\((.*)\)$/.test(line)) {
  const [, funcName, argsStr] = line.match(/^await\s+(\w+)\((.*)\)$/);
  const func = env.getFunc(funcName);
  const args = argsStr.trim() ? parsePrintArgs(argsStr) : [];
  const evaluatedArgs = [];
  for (const a of args) {
    evaluatedArgs.push(await evalExpr(a, env));
  }
  await func(...evaluatedArgs);
  return null;
}


  // Оператор return
  if (/^return\s+(.+)$/.test(line)) {
    const expr = line.match(/^return\s+(.+)$/)[1];
    const val = await evalExpr(expr, env);
    return { type: 'return', value: val };
  }

  if (/^if\s+(.+):$/.test(line)) {
  let executed = false;

  // текущий блок if
  const condExpr = line.match(/^if\s+(.+):$/)[1];
  if (await evalExpr(condExpr, env)) {
    const res = await execBlock(block, env);
    if (res && res.type === 'return') return res;
    executed = true;
  }

  // ищем elif и else в блоке
  for (let i = 0; i < block?.length; i++) {
    const sub = block[i];

    // elif
    if (/^elif\s+(.+):$/.test(sub.line)) {
      if (!executed) {
        const elifExpr = sub.line.match(/^elif\s+(.+):$/)[1];
        if (await evalExpr(elifExpr, env)) {
          const res = await execBlock(sub.block, env);
          if (res && res.type === 'return') return res;
          executed = true;
        }
      }
    }

    // else
    else if (sub.line === 'else:' && !executed) {
      const res = await execBlock(sub.block, env);
      if (res && res.type === 'return') return res;
      executed = true;
    }
  }

  return null;
}

  // Оператор for
  if (/^for\s+(\w+)\s*=\s*(.+),\s*(.+)\s*do$/.test(line)) {
    const [, varName, startExpr, endExpr] = line.match(/^for\s+(\w+)\s*=\s*(.+),\s*(.+)\s*do$/);
    const startVal = await evalExpr(startExpr, env);
    const endVal = await evalExpr(endExpr, env);
    for (let i = startVal; i <= endVal; i++) {
      env.setVar(varName, i);
      const res = await execBlock(block, env);
      if (res && res.type === 'return') return res;
    }
    return null;
  }

  // Оператор while
  if (/^while\s+(.+):$/.test(line)) {
    const condExpr = line.match(/^while\s+(.+):$/)[1];
    while (await evalExpr(condExpr, env)) {
      const res = await execBlock(block, env);
      if (res && res.type === 'return') return res;
    }
    return null;
  }

  // Команда print(...)
  if (/^print\((.*)\)$/.test(line)) {
    const exprsStr = line.match(/^print\((.*)\)$/)[1];
    const exprs = parsePrintArgs(exprsStr);
    const vals = [];
    for (const e of exprs) {
      vals.push(await evalExpr(e, env));
    }
    log(...vals);
    return null;
  }

  // Присваивание переменной
  if (/^(\w+)\s*=\s*(.+)$/.test(line)) {
    const [, varName, expr] = line.match(/^(\w+)\s*=\s*(.+)$/);
    const val = await evalExpr(expr, env);
    env.setVar(varName, val);
    return null;
  }

  // Вызов функции
  if (/^(\w+)\((.*)\)$/.test(line)) {
    const [, funcName, argsStr] = line.match(/^(\w+)\((.*)\)$/);
    const func = env.getFunc(funcName);
    const args = argsStr.trim() ? parsePrintArgs(argsStr) : [];
    const evaluatedArgs = [];
    for (const a of args) {
      evaluatedArgs.push(await evalExpr(a, env));
    }
    const res = await func(...evaluatedArgs);
    if (res && res.type === 'return') return res;
    return null;
  }

 
if (/^load\s+from\s+(\w+)\s+(all|\w+\.(js|forge))$/.test(line)) {
  const [, folder, target] = line.match(/^load\s+from\s+(\w+)\s+(all|\w+\.(js|forge))$/);

  const folderPath = (typeof process.pkg !== 'undefined')
    ? path.join(path.dirname(process.execPath), folder)  // запуск из exe
    : path.join(process.cwd(), folder);                   // запуск из node

  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
    throw new Error(`Module folder "${folder}" not found`);
  }

  let filesToLoad;
  if (target === 'all') {
    filesToLoad = fs.readdirSync(folderPath).filter(f => f.endsWith('.forge') || f.endsWith('.js'));
  } else {
    filesToLoad = [target];
  }

  for (const file of filesToLoad) {
    const fullPath = path.join(folderPath, file);
    if (!fs.existsSync(fullPath)) throw new Error(`File "${fullPath}" not found`);

    if (file.endsWith('.forge')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      const [modBlock] = parseBlock(lines);
      await execBlock(modBlock, env);
    } else if (file.endsWith('.js')) {
      const mod = require(fullPath);
      for (const key in mod) {
        if (typeof mod[key] === 'function') {
          env.funcs[key] = mod[key];
        } else {
          env.setVar(key, mod[key]);
        }
      }
    } else {
      throw new Error(`Unsupported file type: "${file}"`);
    }
  }

  return null;
}



  throw new Error(`Unknown command: ${line}`);
}



async function evalExpr(expr, env) {
  expr = expr.trim();
  if (/^(['"]).*\1$/.test(expr)) {
    try {
      return JSON.parse(expr); // Поддержка \n, \t, и т.п.
    } catch {
      throw new Error(`Invalid string literal: ${expr}`);
    }
  }

  const context = {};
  for (const k in env.vars) context[k] = env.vars[k];
  for (const k in env.funcs) context[k] = env.funcs[k];

  const args = Object.keys(context);
  const vals = Object.values(context);

  try {
    const func = new Function(...args, `"use strict"; return (${expr});`);
    return func(...vals);
  } catch (e) {
    throw new Error(`Invalid expression "${expr}": ${e.message}`);
  }
}

async function main() {
  const filename = process.argv[2];
  if (!filename || !filename.endsWith('.forge')) {
    console.log('Usage: node inter.js program.forge');
    process.exit(1);
  }

  if (!fs.existsSync(filename)) {
    console.error(`File "${filename}" not found`);
    process.exit(1);
  }

  const content = fs.readFileSync(filename, 'utf8');
  const lines = content.split('\n');
  const [block] = parseBlock(lines);
  const env = makeEnv();
  await execBlock(block, env);
}

main();
