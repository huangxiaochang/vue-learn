/* @flow */

import {
  tip,
  toArray,
  hyphenate,
  handleError,
  formatComponentName
} from '../util/index'
import { updateListeners } from '../vdom/helpers/index'

export function initEvents (vm: Component) {
  vm._events = Object.create(null)
  vm._hasHookEvent = false
  // init parent attached events
  // _parentListeners是父组件中绑定在自定义标签上的事件，供子组件处理
  const listeners = vm.$options._parentListeners
  if (listeners) {
    updateComponentListeners(vm, listeners)
  }
}

let target: any

// 自定义事件的添加，利用$on,$once方法来添加
function add (event, fn, once) {
  if (once) {
    target.$once(event, fn)
  } else {
    target.$on(event, fn)
  }
}

/*自定义事件的移除*/
function remove (event, fn) {
  target.$off(event, fn)
}

// 更新组件的事件监听
// 新增新添加的事件或者删除新添加事件中旧事件没有的事件，更新新旧同名事件的处理函数
export function updateComponentListeners (
  vm: Component,
  listeners: Object,
  oldListeners: ?Object
) {
  target = vm
  updateListeners(listeners, oldListeners || {}, add, remove, vm)
  target = undefined
}

// 组件自定义事件的处理： 添加，移除，触发
export function eventsMixin (Vue: Class<Component>) {
  // 事件名中的hook:是监听生命周期，即程序化事件监听器，
  // 如this.$on('hook:beforeDestroy', () => {})，或者在父组件中使用v-on:hook:beforeCreate="xxxhandler"
  // 来监听子组件的生命周期
  const hookRE = /^hook:/
  // 添加自定义事件
  Vue.prototype.$on = function (event: string | Array<string>, fn: Function): Component {
    const vm: Component = this
    if (Array.isArray(event)) {
      // 如果是数组，递归处理
      for (let i = 0, l = event.length; i < l; i++) {
        this.$on(event[i], fn)
      }
    } else {
      // 在组件实例对象的_events属性上把添加的自定义事件存储起来
      (vm._events[event] || (vm._events[event] = [])).push(fn)
      // optimize hook:event cost by using a boolean flag marked at registration
      // instead of a hash lookup
      if (hookRE.test(event)) {
        vm._hasHookEvent = true
      }
    }
    return vm
  }

  // 绑定自定义事件，只绑定一次。
  // 实现的原理：定义一个包裹函数，然后使用$on绑定事件的回调函数为该包裹函数，
  // 当事件第一次触发的时候会执行该包裹回调函数，在执行的过程中会执行开发者的回调函数，
  // 同时使用$off来移除该包裹回调函数。
  Vue.prototype.$once = function (event: string, fn: Function): Component {
    const vm: Component = this
    function on () {
      vm.$off(event, on)
      fn.apply(vm, arguments)
    }
    on.fn = fn
    vm.$on(event, on)
    return vm
  }

  // 移除自定义事件监听器
  Vue.prototype.$off = function (event?: string | Array<string>, fn?: Function): Component {
    const vm: Component = this
    // all，如果没有传参数，则全部移除
    if (!arguments.length) {
      vm._events = Object.create(null)
      return vm
    }
    // array of events，如果传进的是数组，则递归单个处理
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        this.$off(event[i], fn)
      }
      return vm
    }
    // specific event
    const cbs = vm._events[event]
    if (!cbs) {
      return vm
    }
    if (!fn) {
      // 如果没有传进要移除的监听器，则移除该类型事件名下所有的监听器
      vm._events[event] = null
      return vm
    }
    if (fn) {
      // specific handler，如果有传进要移除的监听器，则只移除该监听器
      let cb
      let i = cbs.length
      while (i--) {
        cb = cbs[i]
        if (cb === fn || cb.fn === fn) {
          cbs.splice(i, 1)
          break
        }
      }
    }
    return vm
  }

  // 触发自定义事件
  Vue.prototype.$emit = function (event: string): Component {
    const vm: Component = this
    // 事件名有效性检查
    if (process.env.NODE_ENV !== 'production') {
      const lowerCaseEvent = event.toLowerCase()
      if (lowerCaseEvent !== event && vm._events[lowerCaseEvent]) {
        tip(
          `Event "${lowerCaseEvent}" is emitted in component ` +
          `${formatComponentName(vm)} but the handler is registered for "${event}". ` +
          `Note that HTML attributes are case-insensitive and you cannot use ` +
          `v-on to listen to camelCase events when using in-DOM templates. ` +
          `You should probably use "${hyphenate(event)}" instead of "${event}".`
        )
      }
    }

    let cbs = vm._events[event]
    if (cbs) {
      cbs = cbs.length > 1 ? toArray(cbs) : cbs
      // 触发事件时携带的数据
      const args = toArray(arguments, 1)
      for (let i = 0, l = cbs.length; i < l; i++) {
        try {
          // 这里的cbs[i]绑定的是当前子组件实例对象，但是我们自定义事件处理回调中的this，一般指向
          // 的是父组件，这是因为这里的cns[i],并不是父组件的自定义事件的回调函数，而是他的包裹函数，
          // 定义在updateListeners -> createFnInvoker中,即invoker函数，该函数内才真正执行自定义事件的
          // 回调函数，他的执行绑定的上下文对象为null,所以最终指向了父组件实例对象。
          cbs[i].apply(vm, args)
        } catch (e) {
          handleError(e, vm, `event handler for "${event}"`)
        }
      }
    }
    return vm
  }
}
