/* @flow */

// 完整版的入口
import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'

import Vue from './runtime/index'
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat'

// cached()函数的作用是通过缓存来避免重复求值，提升性能
const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})

// 先缓存运行时版的$mount
const mount = Vue.prototype.$mount
// 重写完整版的$mount函数，在运行时版本的基础之上加上编译，在此是为了在options上加上render函数，和staticRenderFns
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  el = el && query(el)

  /* istanbul ignore if */
  // 不能挂载在html或者body元素中，因为挂载点的本意是组件挂载的占位，它将会被组件自身的模板替换
  // 而body、html元素是不能被替换的
  if (el === document.body || el === document.documentElement) {
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }

  const options = this.$options
  // resolve template/el and convert to render function
  // 如果没有渲染函数，就使用template或者el选项构建渲染函数
  if (!options.render) {
    let template = options.template
    if (template) {
      if (typeof template === 'string') {
        if (template.charAt(0) === '#') {
          // idToTemplate()通过id获取innerHTML
          template = idToTemplate(template)
          /* istanbul ignore if */
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      } else if (template.nodeType) {
        // 如果template是元素节点
        template = template.innerHTML
      } else {
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    } else if (el) {
      // 如果模板不存在，使用el元素的outerHTML作为模板
      // getOuterHTML()可以获取包括el元素在内及其所有后代的html片段
      template = getOuterHTML(el)
    }
    // 运行到此时，template有可能是一个空字符串的情况
    if (template) {
      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }

      // 以下代码的作用只要是把字符串模板编译成渲染函数，并添加到options.render，options.staticRenderFns
      const { render, staticRenderFns } = compileToFunctions(template, {
        shouldDecodeNewlines,
        shouldDecodeNewlinesForHref,
        delimiters: options.delimiters, // 改变纯文本插入分隔符，默认["{{", "}}"]
        comments: options.comments // 编译时，是否保留模板中的注释, 默认去除
      }, this)
      options.render = render
      options.staticRenderFns = staticRenderFns

      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }
  // 有渲染函数，直接调用运行时版本的$mount进行挂载
  return mount.call(this, el, hydrating)
}

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
function getOuterHTML (el: Element): string {
  // 有些元素的outerHTML属性未必存在，如IE9-11中的SVG元素是没有innerHTML和outerHTML的
  if (el.outerHTML) {
    return el.outerHTML
  } else {
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

Vue.compile = compileToFunctions

// 此处导出的Vue, 在项目中引入时，已经在Vue构造函数的原型上定义了相关的属性和方法，同时也定义了一些全局
// 的api等

export default Vue
