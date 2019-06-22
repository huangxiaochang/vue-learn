/* @flow */

import type Watcher from './watcher'
import config from '../config'
import { callHook, activateChildComponent } from '../instance/lifecycle'

import {
  warn,
  nextTick,
  devtools
} from '../util/index'

export const MAX_UPDATE_COUNT = 100

const queue: Array<Watcher> = []
const activatedChildren: Array<Component> = []
let has: { [key: number]: ?true } = {}
let circular: { [key: number]: number } = {}
let waiting = false
let flushing = false
let index = 0

/**
 * Reset the scheduler's state.
 */
function resetSchedulerState () {
  index = queue.length = activatedChildren.length = 0
  has = {}
  if (process.env.NODE_ENV !== 'production') {
    circular = {}
  }
  waiting = flushing = false
}

/**
 * Flush both queues and run the watchers.
 * 清空watcher队列，并且执行watcher
 */
function flushSchedulerQueue () {
  flushing = true
  let watcher, id

  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child)
  // 2. A component's user watchers are run before its render watcher (because
  //    user watchers are created before the render watcher)
  // 3. If a component is destroyed during a parent component's watcher run,
  //    its watchers can be skipped.
  // 进行队列的排序，主要是确保：
  // 1.组件的更新从父到子，因为组件的创建也是从父到子，所以执行顺序也应该是父到子。
  // 2.用户定义的watcher要先于渲染watcher，因为用户自定义的watcher是在渲染watcher之前创建的。
  // 3.如果一个组件在它的父组件的watcher执行期间进行销毁，那么它对应的watcher可以被跳过。
  queue.sort((a, b) => a.id - b.id)

  // do not cache length because more watchers might be pushed
  // as we run existing watchers
  // 遍历队列，执行watcher的run方法
  // 不进行queue队列长度的缓存，因为可能在我们执行已经存在的watcher的时候，会有其他的watcher添加进队列。
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index]
    if (watcher.before) {
      watcher.before()
    }
    id = watcher.id
    has[id] = null
    watcher.run()
    // in dev build, check and stop circular updates.
    // 避免循环更新，
    // 因为在执行watcher.run的过程中，会有其他watcher添加进队列，这时has[id]就不会为null
    // (在queueWatcher设置了为true),即使上面设置了has[id] = null。
    if (process.env.NODE_ENV !== 'production' && has[id] != null) {
      circular[id] = (circular[id] || 0) + 1
      if (circular[id] > MAX_UPDATE_COUNT) {
        warn(
          'You may have an infinite update loop ' + (
            watcher.user
              ? `in watcher with expression "${watcher.expression}"`
              : `in a component render function.`
          ),
          watcher.vm
        )
        break
      }
    }
  }

  // keep copies of post queues before resetting state
  const activatedQueue = activatedChildren.slice()
  const updatedQueue = queue.slice()

  // 恢复状态
  resetSchedulerState()

  // call component updated and activated hooks
  // 调用组件的updated和actived钩子函数
  callActivatedHooks(activatedQueue)
  callUpdatedHooks(updatedQueue)

  // devtool hook
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    devtools.emit('flush')
  }
}

function callUpdatedHooks (queue) {
  let i = queue.length
  while (i--) {
    const watcher = queue[i]
    const vm = watcher.vm
    if (vm._watcher === watcher && vm._isMounted) {
      callHook(vm, 'updated')
    }
  }
}

/**
 * Queue a kept-alive component that was activated during patch.
 * The queue will be processed after the entire tree has been patched.
 */
export function queueActivatedComponent (vm: Component) {
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  vm._inactive = false
  activatedChildren.push(vm)
}

function callActivatedHooks (queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true
    activateChildComponent(queue[i], true /* true */)
  }
}

/**
 * Push a watcher into the watcher queue.
 * Jobs with duplicate IDs will be skipped unless it's
 * pushed when the queue is being flushed.
 * 把观察者watcher添加进watcher队列。
 */
export function queueWatcher (watcher: Watcher) {
  const id = watcher.id
  // 保证同一个watcher值添加一次
  if (has[id] == null) {
    has[id] = true
    // 是否正在进行更新，在由于计算属性的特殊性，正在更新的时候，有可能还有计算属性的观察者进队列
    if (!flushing) {
      queue.push(watcher)
    } else {
      // if already flushing, splice the watcher based on its id
      // if already past its id, it will be run next immediately.
      // 保证观察者执行的顺序
      // 如果已经在清空watcher队列，则根据它的id拼接watcher
      // 如果已经超过它的id, 将立即执行下一个
      let i = queue.length - 1
      while (i > index && queue[i].id > watcher.id) {
        i--
      }
      queue.splice(i + 1, 0, watcher)
    }
    // queue the flush
    // 保证if内语句只调用一次，直到waiting手动变成false
    if (!waiting) {
      waiting = true
      nextTick(flushSchedulerQueue)
    }
  }
}
