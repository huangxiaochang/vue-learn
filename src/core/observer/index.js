/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 * Observer类的主要作用是给对象的属性添加getter/setter，用于依赖的收集和派发更新。
 */
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that has this object as root $data

  // 参数value为数据对象，如data选项
  constructor (value: any) {
    this.value = value
    this.dep = new Dep()
    this.vmCount = 0
    // 在数据对象设置__ob__属性，值为Observer实例对象，并且设置成不可遍历
    def(value, '__ob__', this)
    if (Array.isArray(value)) {
      // 这个if分支是处理数据的观测问题
      // hasProto用来检测当前环境是否可以使用__proto__属性,通过protoAugment的方法实现拦截的方法是
      // 把vue中的数组实例的原型指向代理原型arrayMethods,而代理原型的原型在指向Array的原型。这样vue数组实例调用
      // 数组方法时，首先执行的是arrayMethods上的同名方法。而在arrayMethods上为每一个同名的方法增加了拦截器，然后
      // 拦截器中在调用真正数组对象上__proto__来执行数组的方法。如果没有__proto__,兼容的方法是，直接在数组实例上
      // 定义同名的方法，然后在这个同名的方法中增加拦截器。所以当在数组实例调用数组方法时，首先执行的是定义在数组实例上的同名数组方法
      // 从而调用了定义在同名方法中的拦截器
      const augment = hasProto
        ? protoAugment
        : copyAugment
      augment(value, arrayMethods, arrayKeys)
      this.observeArray(value)
    } else {
      // 处理纯对象的观测
      this.walk(value)
    }
  }

  /**
   * Walk through each property and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   * 如果数组中的某一项是数组或者对象的话，进行递归观测
   */
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers
// 以下的两个方法的目的都是：把数组实例与代理原型或与代理原型中定义的函数联系起来，从而拦截数组变异方法。
/**
 * Augment an target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src: Object, keys: any) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment an target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 * 初始化时的value和asRootData分别是data选项和true
 * 该函数的作用是对传进来的value进行观测，并且返回观测Observer的实例.
 * 即给对象类型的数据添加一个Observer,如果已经添加过，则直接返回。
 * 本质是给对象添加__ob__属性，并且把对象的属性设置getter/setter。
 */
/*
  如我们组件的data选项处理后为： 
  data: {
    // a属性设置了getter/setter,并闭包引用一个Dep实例dep
    a: {
      // b属性设置了getter/setter,并闭包引用一个Dep实例dep
      b: 123,
      __ob__: observer
    },
    // c属性设置了getter/setter,并闭包引用一个Dep实例dep
    c: {
      // d属性设置了getter/setter,并闭包引用一个Dep实例dep
      d: 456,
      __ob__: observer
    },
    __ob__: { // Observer的实例
      dep: { // Dep的实例，用于收集$set设置的属性的依赖},
      value: 
    }
  }
 */
export function observe (value: any, asRootData: ?boolean): Observer | void {
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  let ob: Observer | void
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    // 避免重复观测一个对象，如果已经存在__ob__,直接使用。__ob__为一个O不server实例
    ob = value.__ob__
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    // 观测的数据必须是可拓展的，并且数据是数组或者纯对象
    ob = new Observer(value)
  }
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 * 此函数的核心是将数据对象的数据属性转换成访问器属性，同时在get属性值的时候，进行收集依赖，在set的时候，进行调用
 * 依赖.
 * 该函数功能：定义一个响应式对象，给对象动态添加getter/setter。
 */
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  // 在这里，每一个数据字段都通过闭包引用属于自己的dep常量
  const dep = new Dep()

  const property = Object.getOwnPropertyDescriptor(obj, key)
  if (property && property.configurable === false) {
    return
  }

  // cater for pre-defined getter/setters
  // 缓存该属性原本定义的getter/setter，目的是能按照开发者希望正确去返回和设置该属性的值
  const getter = property && property.get
  const setter = property && property.set

  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }
  // shallow 为是否需要进行深度观测，默认为true
  // 设置childOb闭合引用该数据字段属性值的观测对象实例，并添加相同的依赖，目的是为了$set,$delete能够触发依赖
  let childOb = !shallow && observe(val)
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      const value = getter ? getter.call(obj) : val

      if (Dep.target) {
        // 往该属性的订阅者收集器中添加订阅者
        dep.depend()
        if (childOb) {
          // 在childOb的dep订阅者收集器中添加该订阅者，目的是为了添加属性和删除属性的时候能够触发依赖
          childOb.dep.depend()
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      // (newVal !== newVal && value !== value)这个是判断是否设置的值是NaN,value !== value说明原值是NaN，
      // newVal !== newVal说明新值也是NaN，即设置的值前后相等，同样不用进行处理
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      childOb = !shallow && observe(newVal)
      dep.notify()
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 * $set,Vue.set
 */
export function set (target: Array<any> | Object, key: any, val: any): any {
  // 如果要设置的值是undefined，null或者是原始数据类型的值，错误提示
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  // 以下是添加全新的属性的处理
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  // 如果target原本就是非响应的，简单设置值即可，不进行依赖的通知
  if (!ob) {
    target[key] = val
    return val
  }
  // 如果是增加新的键，进行设置get/set
  defineReactive(ob.value, key, val)
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key]
  if (!ob) {
    return
  }
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 * 如果数组中的某一数据项是对象或者数组的话，也在这个数据项的dep中收集依赖，因为如果在某个地方引用了该数组
 * ，意味着观测者数组内部所以数据的变化，所以数组中的对象数据项中的属性发生变化的时候，也要调用该数组的所有的依赖。
 */
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
