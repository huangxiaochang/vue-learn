/* @flow */

import { hasOwn } from 'shared/util'
import { warn, hasSymbol } from '../util/index'
import { defineReactive, toggleObserving } from '../observer/index'

// 初始化provide
// 在实例对象vm上设置_provided属性，值为provide函数的返回值或者provide对象(引用)
export function initProvide (vm: Component) {
  const provide = vm.$options.provide
  if (provide) {
    vm._provided = typeof provide === 'function'
      ? provide.call(vm)
      : provide
  }
}

// 初始化inject
// 在当前vm实例上定义inject的同名属性和方法，属性值为父级provide或者默认值（引用而不是copy）。
export function initInjections (vm: Component) {
  // 去父级中寻找注入的数据
  const result = resolveInject(vm.$options.inject, vm)
  if (result) {
    // 关闭响应开关。因为provide/inject绑定的不是可响应的。但是如果provide传入的数据本身是响应的，那么inject
    // 绑定的数据也是可响应的
    toggleObserving(false)
    // 以下代码的作用在当前组件实例对象上定义与注入名称相同的变量，并赋予取得的值，并且不能设置注入的数据
    Object.keys(result).forEach(key => {
      /* istanbul ignore else */
      if (process.env.NODE_ENV !== 'production') {
        defineReactive(vm, key, result[key], () => {
          warn(
            `Avoid mutating an injected value directly since the changes will be ` +
            `overwritten whenever the provided component re-renders. ` +
            `injection being mutated: "${key}"`,
            vm
          )
        })
      } else {
        defineReactive(vm, key, result[key])
      }
    })
    toggleObserving(true)
  }
}

// 此函数的作用是根据根据当前组件的inject选项去父代中寻找注入的数据，并最终返回数据
export function resolveInject (inject: any, vm: Component): ?Object {
  if (inject) {
    // inject is :any because flow is not smart enough to figure out cached
    const result = Object.create(null)
    // 获取inject中的键，如果宿主支持Symbol，则使用Reflect.ownKeys来获取对象中获取所以的可枚举的键名，否者使用
    // Object.keys，因为这样可以在宿主支持Symbol的环境使用Symbol类型作为键值
    const keys = hasSymbol
      ? Reflect.ownKeys(inject).filter(key => {
        /* istanbul ignore next */
        return Object.getOwnPropertyDescriptor(inject, key).enumerable
      })
      : Object.keys(inject)

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      const provideKey = inject[key].from
      let source = vm
      while (source) {
        if (source._provided && hasOwn(source._provided, provideKey)) {
          result[key] = source._provided[provideKey]
          break
        }
        source = source.$parent
      }
      // 如果找到根组件，都没有找到，那么看是否有默认值
      if (!source) {
        if ('default' in inject[key]) {
          const provideDefault = inject[key].default
          result[key] = typeof provideDefault === 'function'
            ? provideDefault.call(vm)
            : provideDefault
        } else if (process.env.NODE_ENV !== 'production') {
          warn(`Injection "${key}" not found`, vm)
        }
      }
    }
    return result
  }
}
