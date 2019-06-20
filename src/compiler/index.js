/* @flow */

import { parse } from './parser/index'
import { optimize } from './optimizer'
import { generate } from './codegen/index'
import { createCompilerCreator } from './create-compiler'

// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.
// 该函数用来编译器
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {
  // 调用parse函数将字符串模板解析成抽象语法树
  const ast = parse(template.trim(), options)
  if (options.optimize !== false) {
    // 调用optimize函数优化ast
    optimize(ast, options)
  }
  // 调用generate函数将ast编译成渲染函数函数体字符串
  const code = generate(ast, options)
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})