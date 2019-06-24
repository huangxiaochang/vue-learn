/* @flow */

import {
  warn,
  once,
  isDef,
  isUndef,
  isTrue,
  isObject,
  hasSymbol
} from 'core/util/index'

import { createEmptyVNode } from 'core/vdom/vnode'

// 确保拿到异步组件的构造函数
function ensureCtor (comp: any, base) {
  if (
    comp.__esModule ||
    (hasSymbol && comp[Symbol.toStringTag] === 'Module')
  ) {
    comp = comp.default
  }
  return isObject(comp)
    ? base.extend(comp)
    : comp
}

// 创建异步组件的占位符
export function createAsyncPlaceholder (
  factory: Function,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag: ?string
): VNode {
  const node = createEmptyVNode()
  node.asyncFactory = factory
  node.asyncMeta = { data, context, children, tag }
  return node
}

// 解析异步组件
// 异步组件实现的本质是2次渲染，除了0 delay的高级组件第一次直接渲染loading组件外，
// 其他的都是第一次渲染生成一个注释节点，当异步获取组件成功后，在通过forceRender强制重新渲染，
// 会再一次执行resolveAsyncComponent，从而能够获取到相应的异步加载结果
export function resolveAsyncComponent (
  factory: Function, // 加载异步组件的工厂函数
  baseCtor: Class<Component>, // Vue构造函数
  context: Component // 创建异步组件的当前组件实例对象
): Class<Component> | void {
  // 高级组件相关
  // 异步组件加载失败，返回factory.errorComp，渲染error组件
  if (isTrue(factory.error) && isDef(factory.errorComp)) {
    return factory.errorComp
  }

  // 异步组件加载成功，直接返回之前加载的结果，渲染成功加载的组件
  if (isDef(factory.resolved)) {
    return factory.resolved
  }

  // 异步组件加载中，返回 factory.loadingComp，渲染 loading 组件
  if (isTrue(factory.loading) && isDef(factory.loadingComp)) {
    return factory.loadingComp
  }

  if (isDef(factory.contexts)) {
    // already pending 已经处于pending状态
    factory.contexts.push(context)
  } else {
    const contexts = factory.contexts = [context]
    let sync = true

    // 强制重新渲染，会再次执行resolveAsyncComponent
    const forceRender = () => {
      for (let i = 0, l = contexts.length; i < l; i++) {
        contexts[i].$forceUpdate()
      }
    }

    const resolve = once((res: Object | Class<Component>) => {
      // cache resolved
      factory.resolved = ensureCtor(res, baseCtor)
      // invoke callbacks only if this is not a synchronous resolve
      // (async resolves are shimmed as synchronous during SSR)
      // 执行factory函数时，异步加载成功之后才执行resolve，所以之前已经执行到了resolveAsyncComponent的最后，
      // sync的值已经为false，所以异步加载成功之后，会执行forceRender函数，进行强制重新渲染组件，从而会在一次
      // 执行resolveAsyncComponent函数
      if (!sync) {
        forceRender()
      }
    })

    // 加载失败的reject函数
    const reject = once(reason => {
      process.env.NODE_ENV !== 'production' && warn(
        `Failed to resolve async component: ${String(factory)}` +
        (reason ? `\nReason: ${reason}` : '')
      )
      if (isDef(factory.errorComp)) {
        factory.error = true
        forceRender()
      }
    })

    const res = factory(resolve, reject)

    if (isObject(res)) {
      if (typeof res.then === 'function') {
        // 使用() => import()形式加载的异步组件
        // () => Promise
        if (isUndef(factory.resolved)) {
          res.then(resolve, reject)
        }
      } else if (isDef(res.component) && typeof res.component.then === 'function') {
        // 高级异步组件
        res.component.then(resolve, reject)

        if (isDef(res.error)) {
          factory.errorComp = ensureCtor(res.error, baseCtor)
        }

        if (isDef(res.loading)) {
          factory.loadingComp = ensureCtor(res.loading, baseCtor)
          if (res.delay === 0) {
            factory.loading = true
          } else {
            setTimeout(() => {
              if (isUndef(factory.resolved) && isUndef(factory.error)) {
                factory.loading = true
                forceRender()
              }
            }, res.delay || 200)
          }
        }

        if (isDef(res.timeout)) {
          setTimeout(() => {
            if (isUndef(factory.resolved)) {
              reject(
                process.env.NODE_ENV !== 'production'
                  ? `timeout (${res.timeout}ms)`
                  : null
              )
            }
          }, res.timeout)
        }
      }
    }

    // 在factory函数还没有resolve的时候，就已经执行这里，设置sync = false
    sync = false
    // return in case resolved synchronously
    // 因为在factory函数中，只有在异步加载成功之后才会执行resolved，
    // 把factory.resolved设置为异步加载的结果，所以第一次执行resolveAsyncComponent时候，
    // 执行到这里的时候，factory.resolved的值为undefined
    return factory.loading
      ? factory.loadingComp
      : factory.resolved
  }
}
