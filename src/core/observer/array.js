/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from '../util/index'

const arrayProto = Array.prototype
// vue中数组的代理原型
export const arrayMethods = Object.create(arrayProto)

// 数组的变异方法，既可以改变自身的方法
const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 */
methodsToPatch.forEach(function (method) {
  // cache original method
  const original = arrayProto[method]
  def(arrayMethods, method, function mutator (...args) {
    const result = original.apply(this, args)
    const ob = this.__ob__
    // 以下的数组方法，可能会增加一个新的元素进入数组，开始这些新增进来的不是响应式的，所以要把他们变成
    // 响应式的
    let inserted
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice':
      // 对于数组的splice方法，从第三个参数到结束才是新增的元素
        inserted = args.slice(2)
        break
    }
    // 进行观测新增进来的元素
    if (inserted) ob.observeArray(inserted)
    // notify change
    ob.dep.notify()
    return result
  })
})
