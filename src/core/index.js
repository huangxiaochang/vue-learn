// 核心Vue的拓展

import Vue from './instance/index'
import { initGlobalAPI } from './global-api/index'
import { isServerRendering } from 'core/util/env'
import { FunctionalRenderContext } from 'core/vdom/create-functional-component'

// 代码执行到这里的实例，已经在vue构造函数的原型属性上增加了一些属性和方法

// Vue全局api(Vue构造函数的静态方法和属性)的定义:
// 包扣：util、set、delete、nextTick、options.components, options.directives, options.filters, options._base、
// use、mixin、components、directives、filters等
initGlobalAPI(Vue)

Object.defineProperty(Vue.prototype, '$isServer', {
  get: isServerRendering
})

Object.defineProperty(Vue.prototype, '$ssrContext', {
  get () {
    /* istanbul ignore next */
    return this.$vnode && this.$vnode.ssrContext
  }
})

// expose FunctionalRenderContext for ssr runtime helper installation
Object.defineProperty(Vue, 'FunctionalRenderContext', {
  value: FunctionalRenderContext
})

Vue.version = '__VERSION__'

export default Vue
