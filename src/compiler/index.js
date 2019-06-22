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
  // baseCompile函数真正执行编译的过程，之所以要经过createCompilerCreator等函数的处理，
  // 是因为Vue在不同的平台有不同的编译过程，通过在createCompilerCreator传入真正的编译函数
  // 来进行不同平台的处理。
  
  // 调用parse函数将字符串模板解析成抽象语法树
  const ast = parse(template.trim(), options)
  // 调用optimize函数优化ast，即标记静态节点和静态根
  if (options.optimize !== false) {
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
