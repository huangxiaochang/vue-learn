/* @flow */

import { extend } from 'shared/util'
import { detectErrors } from './error-detector'
import { createCompileToFunctionFn } from './to-function'
// baseCompile -> src/compiler/index
export function createCompilerCreator (baseCompile: Function): Function {
  // baseOptions不同的平台传入不同，web平台时在web/compiler/index中传入
  return function createCompiler (baseOptions: CompilerOptions) {
    // 真正的编译工作是依托compile函数，主要的作用
    // 1.生成最终编译选项
    // 2.对错误进行收集
    // 3.调用baseCompile编译模板。
    function compile (
      template: string,
      options?: CompilerOptions
    ): CompiledResult {
      const finalOptions = Object.create(baseOptions)
      const errors = []
      const tips = []
      // 定义warn进行errors和tips的收集
      finalOptions.warn = (msg, tip) => {
        (tip ? tips : errors).push(msg)
      }

      // 将提供定制能力的options混合到finalOptions中
      if (options) {
        // merge custom modules
        if (options.modules) {
          finalOptions.modules =
            (baseOptions.modules || []).concat(options.modules)
        }
        // merge custom directives，会覆盖基本的选项中的同名属性
        if (options.directives) {
          finalOptions.directives = extend(
            Object.create(baseOptions.directives || null),
            options.directives
          )
        }
        // copy other options
        for (const key in options) {
          if (key !== 'modules' && key !== 'directives') {
            finalOptions[key] = options[key]
          }
        }
      }
      // 真正执行编译的过程
      const compiled = baseCompile(template, finalOptions)

      if (process.env.NODE_ENV !== 'production') {
        errors.push.apply(errors, detectErrors(compiled.ast))
      }
      compiled.errors = errors
      compiled.tips = tips
      return compiled
    }

    return {
      compile,
      compileToFunctions: createCompileToFunctionFn(compile) // compile 会在 compileToFunctions中被调用
    }
  }
}
