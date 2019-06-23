/* @flow */

import { extend, warn, isObject } from 'core/util/index'

/**
 * Runtime helper for rendering <slot>
 * 渲染slot
 * 对于不同的插槽，是在父组件编译和渲染阶段生成vnode，所以数据的作用域是父组件实例，
 * 子组件在渲染的时候直接拿到这些渲染好的vnode，对于作用域插槽，父组件在编译和渲染的阶段并不会直接生成vnode，
 * 而是在父节点vnode的data中保留一个scopeslots对象，存储着不同名称的插槽以及他们对应的渲染函数，只有在编译和渲染
 * 子组件阶段才会执行这个渲染函数生成vnode，由于是在子组件环境中执行，所以对应的数据作用域是子组件实例。
 */
export function renderSlot (
  name: string,
  fallback: ?Array<VNode>,
  props: ?Object,
  bindObject: ?Object
): ?Array<VNode> {
  const scopedSlotFn = this.$scopedSlots[name]
  let nodes
  if (scopedSlotFn) { // scoped slot
    props = props || {}
    if (bindObject) {
      if (process.env.NODE_ENV !== 'production' && !isObject(bindObject)) {
        warn(
          'slot v-bind without argument expects an Object',
          this
        )
      }
      props = extend(extend({}, bindObject), props)
    }
    nodes = scopedSlotFn(props) || fallback
  } else {
    const slotNodes = this.$slots[name]
    // warn duplicate slot usage
    if (slotNodes) {
      if (process.env.NODE_ENV !== 'production' && slotNodes._rendered) {
        warn(
          `Duplicate presence of slot "${name}" found in the same render tree ` +
          `- this will likely cause render errors.`,
          this
        )
      }
      slotNodes._rendered = true
    }
    nodes = slotNodes || fallback
  }

  const target = props && props.slot
  if (target) {
    return this.$createElement('template', { slot: target }, nodes)
  } else {
    return nodes
  }
}
