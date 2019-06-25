/* @flow */

import VNode from './vnode'
import { resolveConstructorOptions } from 'core/instance/init'
import { queueActivatedComponent } from 'core/observer/scheduler'
import { createFunctionalComponent } from './create-functional-component'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isObject
} from '../util/index'

import {
  resolveAsyncComponent,
  createAsyncPlaceholder,
  extractPropsFromVNodeData
} from './helpers/index'

import {
  callHook,
  activeInstance,
  updateChildComponent,
  activateChildComponent,
  deactivateChildComponent
} from '../instance/lifecycle'

import {
  isRecyclableComponent,
  renderRecyclableComponentTemplate
} from 'weex/runtime/recycle-list/render-component-template'

// inline hooks to be invoked on component VNodes during patch
// patch阶段，会在适当的时机调用这些钩子函数
const componentVNodeHooks = {
  init (vnode: VNodeWithData, hydrating: boolean): ?boolean {
    if (
      vnode.componentInstance &&
      !vnode.componentInstance._isDestroyed &&
      vnode.data.keepAlive
    ) {
      // kept-alive components, treat as a patch
      // keep-alive组件的处理逻辑
      const mountedNode: any = vnode // work around flow
      componentVNodeHooks.prepatch(mountedNode, mountedNode)
    } else {
      // keep-alive组件命中缓存时，不会走这里，所以就不会再执行mounted，created等钩子函数
      const child = vnode.componentInstance = createComponentInstanceForVnode(
        vnode,
        activeInstance // 父级Vue实例对象
      )
      // 调用$munted挂载组件，即会调用_render,_update等方法
      child.$mount(hydrating ? vnode.elm : undefined, hydrating)
    }
  },

  prepatch (oldVnode: MountedComponentVNode, vnode: MountedComponentVNode) {
    const options = vnode.componentOptions
    const child = vnode.componentInstance = oldVnode.componentInstance
    updateChildComponent(
      child,
      options.propsData, // updated props
      options.listeners, // updated listeners
      vnode, // new parent vnode
      options.children // new children
    )
  },

  insert (vnode: MountedComponentVNode) {
    const { context, componentInstance } = vnode
    if (!componentInstance._isMounted) {
      componentInstance._isMounted = true
      callHook(componentInstance, 'mounted')
    }
    if (vnode.data.keepAlive) {
      if (context._isMounted) {
        // vue-router#1212
        // During updates, a kept-alive component's child components may
        // change, so directly walking the tree here may call activated hooks
        // on incorrect children. Instead we push them into a queue which will
        // be processed after the whole patch process ended.
        queueActivatedComponent(componentInstance)
      } else {
        activateChildComponent(componentInstance, true /* direct */)
      }
    }
  },

  destroy (vnode: MountedComponentVNode) {
    const { componentInstance } = vnode
    if (!componentInstance._isDestroyed) {
      if (!vnode.data.keepAlive) {
        componentInstance.$destroy()
      } else {
        deactivateChildComponent(componentInstance, true /* direct */)
      }
    }
  }
}

const hooksToMerge = Object.keys(componentVNodeHooks)

// 创建组件的vnode
export function createComponent (
  Ctor: Class<Component> | Function | Object | void, // 组件对象或者构造函数
  data: ?VNodeData,
  context: Component, // 父级组件
  children: ?Array<VNode>,
  tag?: string
): VNode | Array<VNode> | void {
  if (isUndef(Ctor)) {
    return
  }

  const baseCtor = context.$options._base

  // plain options object: turn it into a constructor
  // 使用Vue.extend来创建一个Vue子类，
  // Vue.extend定义在core/global-api中
  if (isObject(Ctor)) {
    Ctor = baseCtor.extend(Ctor)
  }

  // if at this stage it's not a constructor or an async component factory,
  // reject.
  if (typeof Ctor !== 'function') {
    if (process.env.NODE_ENV !== 'production') {
      warn(`Invalid Component definition: ${String(Ctor)}`, context)
    }
    return
  }

  // async component, 因为一部组件开始是，是开发者传递进来的函数，没有使用Vue.extend
  // 创建一个Vue的子类，所以是没有cid属性的，所以这里判断如果没有定义cid属性的haul，
  // 则为异步组件
  let asyncFactory
  if (isUndef(Ctor.cid)) {
    asyncFactory = Ctor
    // 解析异步组件，第一次解析的时候，在进行异步加载时，已经执行完resolveAsyncComponent，
    // 返回值为undefined，然后等到异步加载完成，进行resolve后，会进行强制重新渲染，从而会
    // 在此执行这里，再次执行resolveAsyncComponent，得到异步加载完成之后的结果(组件构造函数)。
    Ctor = resolveAsyncComponent(asyncFactory, baseCtor, context)
    if (Ctor === undefined) {
      // return a placeholder node for async component, which is rendered
      // as a comment node but preserves all the raw information for the node.
      // the information will be used for async server-rendering and hydration.
      // 第一次resolveAsyncComponent的返回值为undefined，所以会执行这里，创建一个异步组件的占位vnode
      return createAsyncPlaceholder(
        asyncFactory,
        data,
        context,
        children,
        tag
      )
    }
  }

  data = data || {}

  // resolve constructor options in case global mixins are applied after
  // component constructor creation
  // 解析合并构造函数的options选项，因为有一些情况下，在组件构造函数创建之后，有可能
  // 会有全局mixins的使用
  resolveConstructorOptions(Ctor)

  // transform component v-model data into props & events
  // 把组件中的v-model数据转化成props和events
  if (isDef(data.model)) {
    transformModel(Ctor.options, data)
  }

  // extract props
  // 提取props属性
  const propsData = extractPropsFromVNodeData(data, Ctor, tag)

  // functional component
  // 函数式组件
  if (isTrue(Ctor.options.functional)) {
    return createFunctionalComponent(Ctor, propsData, data, context, children)
  }

  // extract listeners, since these needs to be treated as
  // child component listeners instead of DOM listeners
  // 提取事件监听器，因为这些监听器需要作为子组件的监听器而不是Dom的监听器
  const listeners = data.on
  // replace with listeners with .native modifier
  // so it gets processed during parent component patch.
  // data.nativeOn赋值data.on，这样所有的原生的Dom事件会在当前组件环境中被处理
  data.on = data.nativeOn

  if (isTrue(Ctor.options.abstract)) {
    // abstract components do not keep anything
    // other than props & listeners & slot
    // 抽象组件的data不会保存任何东西，除了slot

    // work around flow
    const slot = data.slot
    data = {}
    if (slot) {
      data.slot = slot
    }
  }

  // install component management hooks onto the placeholder node
  // 安装组件管理钩子函数到占位node上面，即在data.hook中定义或者合并管理
  // 组件占位node的钩子函数，如init，prepatch，insert，destroy等钩子函数。
  installComponentHooks(data)

  // return a placeholder vnode
  const name = Ctor.options.name || tag
  // 实例化一个vnode，并返回。
  // 这里把自定义事件监听器参数传入，会在子组件中处理
  const vnode = new VNode(
    `vue-component-${Ctor.cid}${name ? `-${name}` : ''}`,
    data, undefined, undefined, undefined, context,
    { Ctor, propsData, listeners, tag, children },
    asyncFactory
  )

  // Weex specific: invoke recycle-list optimized @render function for
  // extracting cell-slot template.
  // https://github.com/Hanks10100/weex-native-directive/tree/master/component
  /* istanbul ignore if */
  if (__WEEX__ && isRecyclableComponent(vnode)) {
    return renderRecyclableComponentTemplate(vnode)
  }

  return vnode
}

export function createComponentInstanceForVnode (
  vnode: any, // we know it's MountedComponentVNode but flow doesn't
  parent: any, // activeInstance in lifecycle state
): Component {
  // 定义内部组件参数
  const options: InternalComponentOptions = {
    // 这里设置_isComponent为true,所以在执行_init初始化组件的时候，有些逻辑会不一样。
    _isComponent: true,
    // 组件的options选项的_parentVnode保存的为该组件的占位vnode,在执行_createElement的
    // createComponent创建组件vnode的时候，即对于模板中的组件来说，render执行阶段，只会创建
    // 一个组件vnode作为组件的占位(代表该组件)
    _parentVnode: vnode, 
    parent
  }
  // check inline-template render functions
  const inlineTemplate = vnode.data.inlineTemplate
  if (isDef(inlineTemplate)) {
    options.render = inlineTemplate.render
    options.staticRenderFns = inlineTemplate.staticRenderFns
  }
  // vnode.componentOptions.Ctor子组件的构造函数，即创建一个Vue子类实例返回
  return new vnode.componentOptions.Ctor(options)
}

// 安装组件hook： 把componentVNodeHooks 的钩子函数合并到 data.hook 中
// componentVNodeHooks 的钩子函数会在patch的过程中执行相关的钩子函数
function installComponentHooks (data: VNodeData) {
  const hooks = data.hook || (data.hook = {})
  for (let i = 0; i < hooksToMerge.length; i++) {
    const key = hooksToMerge[i]
    const existing = hooks[key]
    const toMerge = componentVNodeHooks[key]
    if (existing !== toMerge && !(existing && existing._merged)) {
      hooks[key] = existing ? mergeHook(toMerge, existing) : toMerge
    }
  }
}

function mergeHook (f1: any, f2: any): Function {
  const merged = (a, b) => {
    // flow complains about extra args which is why we use any
    f1(a, b)
    f2(a, b)
  }
  merged._merged = true
  return merged
}

// transform component v-model info (value and callback) into
// prop and event handler respectively.
// 把v-model指令转成props和event，即给data.props添加data.model.value,
// data.on添加data.model.callback。
// 也就是相当于我们在子组件占位符中编写：:value="xxx" @input="xxx=arguments[0]"
function transformModel (options, data: any) {
  // 允许我们在子组件中配置v-model接收的props名以及派发的event名，默认为value和input
  // 如:在子组件中加上model选项：
  /*
    model: {
      prop: 'msg',
      event: 'change'
    },
    然后子组件中绑定时使用msg, 在派发事件时，派发名为change的事件：this.$emit('change').
    然后父组件中使用v-model绑定时，并不需要额外的处理，即这个更改对于父组件是透明的。
   */
  const prop = (options.model && options.model.prop) || 'value'
  const event = (options.model && options.model.event) || 'input'

  ;(data.props || (data.props = {}))[prop] = data.model.value
  const on = data.on || (data.on = {})
  if (isDef(on[event])) {
    on[event] = [data.model.callback].concat(on[event])
  } else {
    on[event] = data.model.callback
  }
}
