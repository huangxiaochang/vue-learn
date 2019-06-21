/* @flow */
// 此文件主要是进行观察者Watcher类的创建
/*
  Watcher订阅者的实现原理：
    1.创建Watcher实例对象时，首先定义一些相关的标志：
      _watcher: 引用渲染函数观察者
      _watchers: 渲染函数，非渲染函数观察者集合，
      deep：是否进行深度观测
      user: 是否为开发者定义的观察者
      computed: 是否是内部实现计算属性创建的观察者
      sync: 是否同步求值
      before: 数据发生变化，重新更新之前的钩子
      depIds：用于重复求值去重
      newDepIds： 用于一次求值去重
      其他标识
    2.对于表达式形式的观测目标，进行.路径解析，转化成函数
    3.处理计算属性的观察者：

    4.其他观察者：
      通过调用get方法：该方法主要作用，1获取观测目标属性值。2.触发该属性的getter进行依赖的收集

      数据变化时触发依赖的过程：
      1.调用订阅者收集器dep调的notify方法。在该方法中所有所有以来的订阅者的update方法。
      订阅者Watcher的update方法：
        1.计算属性：
          1.在初始化计算属性的时候，会在vue实例上定义同名的存储器属性，其中对应的getter方法中, 会手动调用该
          计算属性的Watcher实例对象的depend添加依赖，然后再通过evaluate方法返回值。
          2.对于计算属性的Watcher观察者实例对象来说，该计算属性实例对象定义了一个Dep实例对象dep属性来收集依赖。其他的
            非计算属性的watcher并没有定义该dep属性。
          3.当我们在模板中使用计算属性的时候，渲染函数会读取该计算属性，所以会触发vue实例上定义同名的存储器属性
            的getter，执行该方法。
            在getter方法内部
              1.调用watcher的depend方法在watcher.dep中收集依赖，因为渲染函数执行的时候，Dep.target的
                是渲染函数的观察者对象，所以计算属性watcher.dep中收集的就是渲染函数的观察者对象。
              2.调用evalate方法。在内部会调用watcher.get方法（开发者定义的计算属性的get函数）求值。
                所以在开发者定义的计算属性的get函数中会访问所依赖的响应式属性，所以这些响应式属性的dep中会收集该计算
                属性的watcher。
          4. 当依赖的属性发生变化时，调用所收集到的watcher.update方法，对于计算属性来说，通过watcher.dep中收集到依赖改
             计算属性的订阅者，调用notify方法进行通知。

        2.同步更新：
          调用观察者实例对象的 run 方法完成更新
        3.渲染函数和其他的情况的update：
          将当前观察者对象放到一个异步更新队列，这个队列会在调用栈被清空之后按照一定的顺序执行
          调用观察者实例对象的 run 方法完成更新

          在run方法内部的getAndInvoke 函数会再次调用Watchet实例对象的get方法获取值来进行重新更新：
          对于渲染函数订阅者来说，执行get方法也就是再次执行了渲染函数，从而更新视图。
          其他的订阅者会把新值和旧值作为参数，调用观测时传来的回调函数。
          因为会再次重新求值，会触发数据属性的getter收集依赖，但是设置depIds来避免了收集重复的依赖，
          所以实际上并没有重复收集。

          异步更新的意义：
            如果采用的是同步更新，这意味着在同一次事件循环中，多次修改响应式的数据，会立即触发update, 如果
            也立即去重新求值和更新、重新渲染的话，这样会造成严重的问题。
          异步更新的原理：
            在同一次事件循环中，每次修改响应式数据属性之后，并没有立即进行重新求值和更新，而是将需要执行更新操作的
            观察者放入一个队列中，当在该次事件循环中，所有的数据属性修改完成之后，在一次性执行队列中所有的观察者的
            更新方法，同时清空队列。达到优化的目的。因为对于模板中依赖的响应式数据属性来说收集到的观察者都是相同的，
            那就是渲染函数，同时在加入异步更新队列的时候，只加入同一观察者一次。这个异步更新队列使用的时机是，在第
            一个观察者加入队列的时候，先使用nextTick函数加入一个回调函数cb进入JavaScript的下一次事件循环。nextTick函数
            （其实也是Vue.$nextTick）的实现方式，如果浏览器支持Promise,这使用Promise,否者降级使用setImmediate ，或者
            setTimeout等。这里的区分是宏观任务和微观任务的区别，详情可见JavaScript事件循环的任务队列的区别。因为Promise或者setTimeout的
            回调都是在JavaScript的下一次事件循环才会被执行，所以执行异步更新队列的回调函数cb,会在下一次JavaScript事件
            循环中被执行，进行异步更新队列中的Watcher的球星求值和更新操作都是在JavaScript的下一次事件循环中执行。

 */
import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  computed: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  dep: Dep;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  // 构造函数参数：组件实例对象，要观察的表达式，值变化是的回调函数，传递给观察者的对象选项，是否是渲染函数的观察者
  // render Watcher: vm, updateComponent, noop, {before: functio}, true
  // computed Watcher: vm, getter, noop, { computed: true }, undefined
  // watch Watcher: vm, watch key, watch handler, options: {deep,...}, undefined
  constructor (
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
    // 每一个观察者实例对象都有一个vm实例，该属性指明了这个观察者是属于哪一个组件的
    this.vm = vm
    if (isRenderWatcher) {
      // _watcher属性引用着该组件渲染函数观察者
      vm._watcher = this
    }
    // 把所有的观察者(渲染函数和非渲染函数的观察者)加入实例的_wathers中
    vm._watchers.push(this)
    // options
    if (options) {
      this.deep = !!options.deep // 告诉当前观察者实例对象是否是深度观测
      this.user = !!options.user  // 是开发者定义还是内部定义，一般内部定义的有：渲染函数的观察者，计算属性观察者等
      this.computed = !!options.computed // 是否是内部实现计算属性创建的观察者
      this.sync = !!options.sync  // 是否需要同步求值并执行回调
      this.before = options.before  // 可以理解为Watcher实例的钩子，当数据变化之后触发更新之前调用
    } else {
      this.deep = this.user = this.computed = this.sync = false
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.dirty = this.computed // for computed watchers
    this.deps = []
    this.newDeps = []
    this.depIds = new Set() // 用于重复求值去重
    this.newDepIds = new Set() // 用于一次求值去重
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // parse expression for getter
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      // parsePath函数返回一个函数，该函数作用是解析表达式，访问表达式指定的属性值，从而触发getter进行收集订阅者
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = function () {}
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    // 计算属性的观察者与其他观察者实例的实现方式不同
    if (this.computed) {
      this.value = undefined
      this.dep = new Dep()
    } else {
      // this.value属性保存着观察目标的值
      this.value = this.get()
    }
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   * 此方法的作用是求值，一是为了触发get拦截函数，另外是能够获取观察者的目标值
   */
  get () {
    // 设置Dep.target的值为该观察者对象
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      // 对被观察目标进行求值
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      if (this.deep) {
        // 如果需要深度观测，则递归访问value, 触发子项的getter，进行依赖的收集
        traverse(value)
      }
      popTarget()
      // 清空收集的无效依赖。
      // 如：我们有v-if条件渲染，当我们满足条件渲染a模板时，访问a模板中数据，进行了依赖的收集，
      // 然后我们改变渲染的条件，去渲染b模板，会对b模板中依赖的数据进行依赖的收集，
      // 如果不进行失效依赖的移除的话，当我们去修改a模板中数据，会通知a数据的订阅的回调，这会造成浪费，
      // 所以在这里进行了无效依赖的移除。
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   * 其中响应式数据闭包引用的dep调用depend，然后在depend中调用addDep，并传入参数this,
   * 所以这里的dep为响应式数据属性闭包引用的dep。
   * 所以调用addDep的结果为：在观察者watcher实例的newDeps中添加依赖的数据属性的dep,
   * 同时在依赖的数据属性引用的dep中添加watcher实例。
   */
  addDep (dep: Dep) {
    const id = dep.id
    // 用于一次求值过程去重复
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      // 用于多次求值过程去重复
      if (!this.depIds.has(id)) {
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   * 清空依赖收集
   */
  cleanupDeps () {
    let i = this.deps.length
    // 移除deps中不存在newDeps中的依赖，即不再和该属性相关的依赖
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    // 把depIds和deps设置新值为newDepIds和newDeps，并清空newDepIds，newDeps
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  update () {
    /* istanbul ignore else */
    if (this.computed) {
      // A computed property watcher has two modes: lazy and activated.
      // It initializes as lazy by default, and only becomes activated when
      // it is depended on by at least one subscriber, which is typically
      // another computed property or a component's render function.
      if (this.dep.subs.length === 0) {
        // In lazy mode, we don't want to perform computations until necessary,
        // so we simply mark the watcher as dirty. The actual computation is
        // performed just-in-time in this.evaluate() when the computed property
        // is accessed.
        this.dirty = true
      } else {
        // In activated mode, we want to proactively perform the computation
        // but only notify our subscribers when the value has indeed changed.
        this.getAndInvoke(() => {
          this.dep.notify()
        })
      }
    } else if (this.sync) {
      this.run()
    } else {
      // 渲染函数观察者不是同步更新变化，而是放在一个异步更新队列中
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run () {
    if (this.active) {
      this.getAndInvoke(this.cb)
    }
  }

  getAndInvoke (cb: Function) {
    // 重新求值，对于渲染函数观察者来说，就是重新执行渲染函数，也就是重新渲染的过程。
    const value = this.get()
    // 渲染函数观察者不会执行if里面的代码，因为渲染函数的this.get()返回的永远是undefined
    if (
      value !== this.value ||
      // Deep watchers and watchers on Object/Arrays should fire even
      // when the value is the same, because the value may
      // have mutated.
      isObject(value) ||
      this.deep
    ) {
      // set new value
      const oldValue = this.value
      this.value = value
      this.dirty = false // 用于计算属性，代表已经求值过
      if (this.user) {
        try {
          cb.call(this.vm, value, oldValue)
        } catch (e) {
          handleError(e, this.vm, `callback for watcher "${this.expression}"`)
        }
      } else {
        cb.call(this.vm, value, oldValue)
      }
    }
  }

  /**
   * Evaluate and return the value of the watcher.
   * This only gets called for computed property watchers.
   */
  evaluate () {
    if (this.dirty) {
      this.value = this.get()
      this.dirty = false
    }
    return this.value
  }

  /**
   * Depend on this watcher. Only for computed property watchers.
   * 计算属性的依赖收集，收集的依赖是渲染函数观察者对象
   */
  depend () {
    if (this.dep && Dep.target) {
      this.dep.depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
