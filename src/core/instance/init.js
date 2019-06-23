/* @flow */
/*
  该文件主要是定义Vue.prototype上的_init()方法，在项目中使用new Vue的时候，是从该方法开始Vue的初始化工作。
  初始化的内容有：
  1._uid: 实例的id,
  2._isVue: 是否是Vue实例标志,
  3.初始化$options：合并父级构造函数和子实例的options
  4.初始化_renderProxy：渲染函数的作用域代理,
    对于模板中绑定的依赖属性，会代理成访问响应式系统_data的数据。所以该绑定的依赖属性的订阅者收集器Dep中，会注册
    渲染函数的Watcher。
  5._self,
  6.初始化与生命周期相关的标识，如，parent，children， _isMounted等等。
  7.初始化与事件相关的标识，如_parentListeners
  8.初始化与render相关的内容，如$createElement方法,$vnode, $slots, $scopedSlots， $attrs, $listeners属性等，
  9.调用beforeCreate生命周期钩子：（所以在改钩子中，还不能访问到data，methods等内容，因为该钩子之前，只是进行了一些初始化
  相关的标识）
  10.初始化inject
    1.根据inject中的键值去所有父级组件的_provide中获取属性值（找到第一个）
    2.如果没有找到，则获取inject提供的默认值，如果也没有默认值，则会错误提示。
    3.获取到_provide提供的相应的之后，在vm实例对象上设置同名的属性访问器。
    4.inject中的属性的值不是响应式的，但是如果_provide提供的数据本身是响应式的，那么inject也是相应式的。
  11.初始化props：
    1.在vue实例对象定义_propKeys属性收集所有的props的Key值,_props属性收集所有的props进来的属性。
    2.使用toggleObserving(false)先暂时关闭响应系统，之所以关闭，是因传进来的属性的值，本身已经是响应式的。
    3.检验props传进来的值是否有效。
      传来的类型和希望的类型是否一致
      是否设置require并没有传值
      设置默认值方式是否正确（对象或者数组，需要default方法返回），如果没有传进来值，会使用默认值，同时把默认值设置成
      响应式。
      不能直接修改props中的属性
      props中的键不能是保留字key,ref,slot,slot-scope,is
    4.设置代理，及访问vm.a时，代理成vm._props.a
    5.props中prop进来的值，不做响应式处理，但是如果它本身是响应式的，那么它也是响应式的。

  12.初始化methods：
    1.方法名不能与props中的键同名，不能以_,$开头，因为这个是Vue内部使用的。
    2.把定义在methods中的方法bind到该实例vm上，所以在methods中可以通过this来访问实例相关的内容，
    3.在vm实例对象上定义与方法选项中同名的方法，所以开发者可用通过vm实例方法methods中定义的方法
  13.初始化data：如：观测数据变化observer(data)等。
    在初始化data之前，会对data进行规范化检查等。如不能是$,_开头，内部关键字、不能与props中属性同名。优先级为props > data > methods
    data属性访问的代理，如vm.a实际访问的是vm._data.a
    以下是进行数据观测observer(data)的原理:
    1.data中的每一个属性都会闭包维护一个订阅者收集器Dep
    2.对于data中的对象，会进行深度观测，子属性的订阅者Watcher,会在所有的父级订阅者收集器Dep中注册监听。
    3. 观测数据属性的变化，采用的是使用defineProperty来进行数据劫持的方式，即劫持数据属性的getter/setter。
    4. 在getter的时候，把该数据属性的订阅者加入到自己的订阅者收集器Dep中。

    对于纯对象的响应式的原理：
      1. 同时由于defineProperty对于新添加和删除的属性的变动不能劫持到（这也是Vue3.0使用proxy来替换defineProperty来进行数据属性变动的观测的原因），
         所以每个数据属性同属通过childOb,来闭包引用子属性Dep,来收集相同的订阅者，目的是为$set,$delete的时候，通知订阅者数据的变动。
      2.在setter中通知该数据属性的所有订阅者，数据发生了改动，让订阅者进行相应的操作。方法数据遍历订阅者收集器，通过调用
        订阅者定义的notify方法来通知， 同时对于新的属性值(对象或者数组)进行了响应式处理。
      3.在进行defineProperty的同时，也进行了确保能正确返回属性值的处理，对于该数据属性原本定义了getter/setter的处理。

    对于数组的响应式的原理：
      1.由于JavaScript现阶段，对于数组的相关操作，没有原生的方法能够检测的到，所以Vue采用了变通的方法来进行，那就是在数组的
      变异的方法加了一个装饰器。所以在Vue中，对于数组的操作，只能响应数组的变异方法的操作(如splice，sort等)，其他的操作不能检查到（如slice，length等）。
      对于数组中的每一项，又进行了响应式处理。
      2.Vue处理数组变异方法响应式的方式：
        通过原生数组的原型(Array.prototype)建立一个对象arrayMethods。该对象是原生数组方法组成的，同时对于数组的变异方法
        进行了重新的定义，在方法的内部，首先通过原生数组方法获取结果val之后,进行了通知订阅者之后，然后返回操作的结果val.
        1.存在__proto__属性：
          设置数组实例的原型属性__proto__指向arrayMethods,这样，在数组中调用数组方法的时候，访问的是arrayMethods上的同名方法
        2.不存在__proto__属性：
          直接在数据实例上定义数组操作的同名方法，这些方法的值为arrayMethods上定义的方法。同时通过defineProperty把这些方法设置
          成不可遍历。这样访问数组实例的数组操作方法时，相当直接访问arrayMethods中定义的同名方法，从而达到了拦截的效果。
        3.如果数组中的数据项是纯对象或者数组，那么他们也是响应式的。

    $set方法的实现原理：
      1.对被设置属性的目标进行检查，不能是undefined，null，原始数据类型，因为只能给一个纯对象或者数组设置属性。
      2.如果设置的目标是一个数组并且要设置的索引是有效的，这直接调用array.splice(pos, 1, val)即可触发响应。
      3.如果是纯对象，并且要设置的key在目标中，并且不是在原型上的话，直接get一下该目标的该属性，便可触发响应
      4.如果是新添加的属性，这手动调用dep的notify方法来触发响应，并且设该属性成响应式的。
    $delete方法的实现原理：
      实现的原理和$set相似。

  14.初始化计算属性：
      1.判断计算属性的定义不能和data、props具有相同的名字。
      2.在vue实例对象定义_computedWatchers属性，该属性存储每一个计算属性的观察者Wactcher实例对象
      3.在vue实例对象上定义和计算属性同名的属性，并且是一个存储器属性，即defineProperty来定义，其中
        在get方法中，使用相应的计算属性的Watcher实例对象手动添加依赖，然后再返回开发者定义的计算属性计算的值。

  15.初始化watch选项：创建watch选项中属性的观察者Watcher等。
  16.初始化provide选项：
      1.在组件vm实例对象上定义_provide属性，如果提供的provide选项是函数，这执行该函数来获取数据赋值给_provide,
        否者如果是对象，_provide属性直接引用该对象。
  17.调用created的生命周期钩子。所以在created的生命周期的钩子中，可以访问以上已经初始化完成的内容。
  18.进行调用$mount方法来挂载到Dom节点中
      18-1.挂载之前，对于runtime + compiler版本，会先把模板template,或者el等模板内容编译成渲染函数render，并赋值到render
      属性，然后再进行挂载的操作。
        模板解析编译转化渲染函数的过程：
          调用parse函数将字符串模板解析成抽象语法树ast
          调用generate函数将ast编译成渲染函数函数体字符串
      18-2.调用beforeMount生命周期钩子。
      18-3.定义updateCompoent方法，该方法里面调用_render函数，生成虚拟的Dom,然后再调用_update去生成真实的DOM并挂载。
      18-4.把updateComponent方法作为参数去创建一个Watcher。创建了Watcher观察者之后，说明模板视图已经可以随着数据变化
      而自动更新。
      18-5.调用mounted生命周期钩子。
      18-6.在创建Watcher的时候，传进配置，如果数据发生变化，并且已经mounted,然后进行update的操作，在这之前，会先调用
      beforeUpdate的生命周期钩子。然后等到重新渲染完成之后，在调用updated的生命周期钩子。

 */
import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0

// 初始化函数，参数为Vue构造函数
export function initMixin (Vue: Class<Component>) {
  // Vue构造函数中增加原型属性_init,使用new来创建vue实例时，会首先调用这个方法
  Vue.prototype._init = function (options?: Object) {
    const vm: Component = this
    // a uid
    vm._uid = uid++

    // 性能测试相关
    let startTag, endTag
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // a flag to avoid this being observed
    vm._isVue = true
    // merge options
    if (options && options._isComponent) {
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      // 内部组件options的合并
      initInternalComponent(vm, options)
    } else {
      // 非内部组件的options合并
      // mergeOptions的第一个参数为Vue全局属性和方法，第二个参数为我们传入的options,第三个参数是当前对象vm
      // $options 这个属性是用于 Vue 实例初始化
      vm.$options = mergeOptions(
        // 解析构造者的options, 包扣内部全局的组件，指令（如：model）, filters, _base等
        resolveConstructorOptions(vm.constructor),
        options || {},
        vm
      )
    }
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      // 代理模板渲染函数作用域，即在模板中使用没有在vue实例上定义的属性或者不是全局变量会错误提示
      initProxy(vm)
    } else {
      vm._renderProxy = vm
    }
    // expose real self
    vm._self = vm
    initLifecycle(vm) // 初始化生命周期：设置$parent,$root,和一些生命周期相关的标志等
    initEvents(vm) // 初始化事件：添加_events属性，更新vm的事件监听等
    initRender(vm) // 初始化渲染函数: 定义_vnode,$vnode,createElement等属性和方法
    // 由此可以看出，在beforeCreate的生命钩子中，不能使用所有与props,methods,data,computed,watch,inject/provide
    // 相关的内容，因为这些都是在下面才进行初始化，所以只能在created钩子和其他的才能使用
    callHook(vm, 'beforeCreate')
    initInjections(vm) // resolve injections before data/props 解析inject: 在当前vm实例上定义和父级provide的同名属性，值为引用provide提供的值
    initState(vm) // 初始化props, methods, data, computed, watch
    initProvide(vm) // resolve provide after data/props
    callHook(vm, 'created')

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    if (vm.$options.el) {
      // 在platforms/web/runtime/index入口中先在Vue.prototype上定义的
      vm.$mount(vm.$options.el)
    }
  }
}

// 该函数的作用为初始化内部组件options的合并。主要是为创建的内部组件的options对象手动赋值，提升性能。
export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  const opts = vm.$options = Object.create(vm.constructor.options)
  // doing this because it's faster than dynamic enumeration.
  const parentVnode = options._parentVnode
  opts.parent = options.parent
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  // 拿到父组件传入的自定义事件监听器，在initEvents过程中会处理
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

// 合并构造器及构造器父级上定义的options, 这里的ctor也就是vm.constructor, 即Vue构造函数
export function resolveConstructorOptions (Ctor: Class<Component>) {
  // Ctor.options(在定义全局api的时候定义的)为vue全局属性和方法, 如components(内部组件),
  //  directives, filters, _base
  let options = Ctor.options
  // 有super属性，说明Ctor是通过Vue.extend()方法创建的子类,即是子组件
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options
  const extended = Ctor.extendOptions
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = dedupe(latest[key], extended[key], sealed[key])
    }
  }
  return modified
}

function dedupe (latest, extended, sealed) {
  // compare latest and sealed to ensure lifecycle hooks won't be duplicated
  // between merges
  if (Array.isArray(latest)) {
    const res = []
    sealed = Array.isArray(sealed) ? sealed : [sealed]
    extended = Array.isArray(extended) ? extended : [extended]
    for (let i = 0; i < latest.length; i++) {
      // push original options and not sealed options to exclude duplicated options
      if (extended.indexOf(latest[i]) >= 0 || sealed.indexOf(latest[i]) < 0) {
        res.push(latest[i])
      }
    }
    return res
  } else {
    return latest
  }
}
