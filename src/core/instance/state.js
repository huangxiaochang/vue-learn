/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute
} from '../util/index'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

// 初始化props, methods, data, computed, watch
export function initState (vm: Component) {
  vm._watchers = []
  const opts = vm.$options
  if (opts.props) initProps(vm, opts.props)
  if (opts.methods) initMethods(vm, opts.methods)
  if (opts.data) {
    initData(vm)
  } else {
    observe(vm._data = {}, true /* asRootData */)
  }
  if (opts.computed) initComputed(vm, opts.computed)
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}

// 初始化props
// 在实例对象的_props属性中设置props同名属性,并且通过defineReactive把他们设置成了响应式属性。
// 通过 proxy 把 vm._props.xxx 的访问代理到 vm.xxx 上
function initProps (vm: Component, propsOptions: Object) {
  // vm.$options.propsData外界传进来的数据
  const propsData = vm.$options.propsData || {}
  const props = vm._props = {}
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  const keys = vm.$options._propKeys = []
  const isRoot = !vm.$parent
  // root instance props should be converted
  if (!isRoot) {
    // 在这里把响应式的开关关掉，目的是不将prop的值转换为响应式的，因为这个值是父组件传递进来的，本身已经是一个
    // 响应式的。
    toggleObserving(false)
  }
  for (const key in propsOptions) {
    keys.push(key)
    // value保存着prop的值，但是要进行有效性检查
    const value = validateProp(key, propsOptions, propsData, vm)
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      // 使用hyphenate将prop的名字转为连字符加小写的形式
      const hyphenatedKey = hyphenate(key)
      // 判断是否是保留的属性：key,ref,slot,slot-scope,is
      if (isReservedAttribute(hyphenatedKey) ||
          config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      defineReactive(props, key, value, () => {
        // 不能直接修改props数据
        if (vm.$parent && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      // props通过defineReactive定义，所以props本身是响应式的，但是没有对值进行深度的定义
      defineReactive(props, key, value)
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    if (!(key in vm)) {
      // 把vm._props.xx的访问代理到vm.xx上
      proxy(vm, `_props`, key)
    }
  }
  toggleObserving(true)
}

// 初始化data选项
// 执行data函数获取data对象
// data中的键不能和props，methods同名，不能是Vue内部保留字等
// 进行_data的代理
// 观测数据的变化
function initData (vm: Component) {
  let data = vm.$options.data
  // 在前面的规范化的时候，data最终是一个函数，在这里之所以还要判断它是否是一个函数，是因为initData是在
  // beforeCreate生命钩子之后进行调用，用户有可能在这个生命周期中更改了data,所以在这里还要进行判断。
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)
    : data || {}
    // 到这里data变量已经不再是函数，而是一个最终的数据对象
  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }
  // proxy data on instance
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length
  while (i--) {
    const key = keys[i]
    if (process.env.NODE_ENV !== 'production') {
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) {
      // isReserved用来判断键是否是vue的保留字符。如$,_等，因为vue不会代理这些保留字，以避免
      // 与vue自身的这些属性和方法形成冲突。
      // proxy函数的作用是进行data的代理，即访问vm.a, 代理访问的是vm._data.a
      proxy(vm, `_data`, key)
    }
  }
  // observe data。data = vm._data
  observe(data, true /* asRootData */)
}

// 作用： 通过调用data选项从而获取数据对象
export function getData (data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  // 调用pushTarget和popTarget是为了避免收集冗余的依赖
  pushTarget()
  try {
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

const computedWatcherOptions = { computed: true }

// 初始化计算属性
// 创建计算属性观察者vm._computedWatchers属性中保存每一个计算属性的观察者
// 计算属性的键不能与data，props和methods中键同名，防止覆盖
// 在vm实例上定义和计算属性同名的访问器属性
function initComputed (vm: Component, computed: Object) {
  // $flow-disable-line
  const watchers = vm._computedWatchers = Object.create(null)
  // computed properties are just getters during SSR
  // 是否是服务器端渲染
  const isSSR = isServerRendering()

  for (const key in computed) {
    const userDef = computed[key]
    // 因为计算属性可以是函数的写法或者对象的写法，如果是对象的写法，则获取其中的get方法
    const getter = typeof userDef === 'function' ? userDef : userDef.get
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    if (!isSSR) {
      // create internal watcher for the computed property.
      // 创建计算属性观察者，第二个参数为getter，即计算属性观察者的求值对象是getter函数
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    // 计算属性的键不能与data，props和methods中键同名，防止覆盖
    if (!(key in vm)) {
      // 定义计算属性
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      }
    }
  }
}

// 此函数的作用主要是通过Object.defineProperty函数在组件实例对象上定义与计算属性同名的实例属性，且是一个访问器
// 属性，属性的配置为sharedPropertyDefinition对象
export function defineComputed (
  target: any,
  key: string,
  userDef: Object | Function
) {
  // 计算属性只有在非服务器端渲染的时候，才会缓存值
  const shouldCache = !isServerRendering()
  if (typeof userDef === 'function') {
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : userDef
    sharedPropertyDefinition.set = noop
  } else {
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : userDef.get
      : noop
    sharedPropertyDefinition.set = userDef.set
      ? userDef.set
      : noop
  }
  if (process.env.NODE_ENV !== 'production' &&
      sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

function createComputedGetter (key) {
  // 计算属性的拦截
  return function computedGetter () {
    // 获取该观察者，因为我们前面已经将计算属性的观察者存在当前实例的_computedWatchers属性上
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      watcher.depend()
      return watcher.evaluate()
    }
  }
}

// 初始化methods
// method键的有效性检查：不能和props同名，也不能是Vue实例对象的属性
// 在vm实例上定义同名方法，并绑定方法的this为该实例对象
function initMethods (vm: Component, methods: Object) {
  const props = vm.$options.props
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      if (methods[key] == null) {
        warn(
          `Method "${key}" has an undefined value in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    vm[key] = methods[key] == null ? noop : bind(methods[key], vm)
  }
}

// 初始化watch选项
// 使用实例vm上的$watch来创建
// $watch使用new Watcher()来创建
function initWatch (vm: Component, watch: Object) {
  for (const key in watch) {
    const handler = watch[key]
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  // key, handler, options
  return vm.$watch(expOrFn, handler, options)
}

export function stateMixin (Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {}
  dataDef.get = function () { return this._data }
  const propsDef = {}
  propsDef.get = function () { return this._props }
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function (newData: Object) {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  // 创建一个观察者并返回取消观察的函数
  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}
    options.user = true
    const watcher = new Watcher(vm, expOrFn, cb, options)
    if (options.immediate) {
      cb.call(vm, watcher.value)
    }
    return function unwatchFn () {
      watcher.teardown()
    }
  }
}
