// 原始Vue构造函数的定义

/*
	该文件主要的作用是，创建Vue构造函数，并且在构造函数原型上实现方法：
	方法：
		_init，$set, $del, $watcher，$on, $emit, $off, $once， _update, $forceUpdate, $destroy， $nextTick， _render

	然后劫持原型对象prototype的属性$data, $props。

	然后导出构造函数Vue
*/

import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

// 构造函数
function Vue (options) {
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  // 使用new Vue()实例化vue实例时，会调用这个方法
  this._init(options)
}

// 以下的这些方法的作用其实是封装Vue.prototype(vue构造函数的原型属性的拓展), 在其上挂载一些方法和属性
initMixin(Vue) // 在Vue.prototype挂载_init方法
stateMixin(Vue)  // 在Vue.prototype挂载$data, $props属性代理_data, _props， $set, $del, $watch方法
eventsMixin(Vue) // 在Vue.prototype挂载$on, $emit, $off, $once方法
lifecycleMixin(Vue)  // 在Vue.prototype挂载_update, $forceUpdate, $destroy方法
renderMixin(Vue)  // 在Vue.prototype挂载$nextTick， _render方法

export default Vue

// 创建一个Vue实例的大致流程
// new Vue(options) -> 调用_init(options)进行初始化 -> 进行options选项的合并(component, filter. direction等) ->
// 渲染函数作用代理 -> 初始化生命周期 -> 初始化事件 -> 初始化渲染函数 -> 调用beforeCreate -> 初始化inject ->
// 初始化props、methods、data、computed、watch -> 初始化provide -> 执行created生命周期钩子函数 -> 调用实例对象的
// vm.$mount()方法进行挂载.
