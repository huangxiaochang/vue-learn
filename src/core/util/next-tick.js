/* @flow */
/* globals MessageChannel */

import { noop } from 'shared/util'
import { handleError } from './error'
import { isIOS, isNative } from './env'

const callbacks = []
let pending = false

function flushCallbacks () {
  pending = false
  const copies = callbacks.slice(0)
  callbacks.length = 0
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

// Here we have async deferring wrappers using both microtasks and (macro) tasks.
// In < 2.4 we used microtasks everywhere, but there are some scenarios where
// microtasks have too high a priority and fire in between supposedly
// sequential events (e.g. #4521, #6690) or even between bubbling of the same
// event (#6566). However, using (macro) tasks everywhere also has subtle problems
// when state is changed right before repaint (e.g. #6813, out-in transitions).
// Here we use microtask by default, but expose a way to force (macro) task when
// needed (e.g. in event handlers attached by v-on).
// 我们有使用微观、宏观任务的异步包装。在小于2.4的版本，我们都是使用微观任务，但是有些情况下，
// 微观任务拥有太高的优先级，所以在一些顺序的事件或者即使在同一事件的冒泡之间会发生冲突。然而，如果
// 我们全部使用宏观任务的话，也会发生一些微妙的问题，但状态在重绘之前已经正确改变的情况下。所在在这里我们
// 默认使用微观任务，但是暴露一个方法去强制使用宏观任务当需要的时候。
let microTimerFunc
let macroTimerFunc
let useMacroTask = false

// Determine (macro) task defer implementation.
// 宏观任务的延迟实现
// Technically setImmediate should be the ideal choice, but it's only available
// in IE. The only polyfill that consistently queues the callback after all DOM
// events triggered in the same loop is by using MessageChannel.
// 技术上来说，使用setImmediate是一个理想的选择，但是它只在ie上支持。在同一循环中触发所有的DOM事件后，
// 唯一一致地对回调进行排队的polyfill是使用MessageChannel。
/* istanbul ignore if */
// 把flushCallbacks注册为macrotask
// 优先使用setImmediate（因为它不需要做超时检查）,因为性能比较高，但是缺点是目前只有IE支持
if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  macroTimerFunc = () => {
    setImmediate(flushCallbacks)
  }
} else if (typeof MessageChannel !== 'undefined' && (
  isNative(MessageChannel) ||
  // PhantomJS
  MessageChannel.toString() === '[object MessageChannelConstructor]'
)) {
  // 一个 MessageChannel 实例对象拥有两个属性 port1 和 port2，我们只需要让其中一个 port 监听 onmessage 事件，
  // 然后使用另外一个 port 的 postMessage 向前一个 port 发送消息即可，这样前一个 port 的 onmessage 回调就会被注册为 (macro)task，
  // 由于它也不需要做任何检测工作，所以性能也要优于 setTimeout
  const channel = new MessageChannel()
  const port = channel.port2
  channel.port1.onmessage = flushCallbacks
  macroTimerFunc = () => {
    port.postMessage(1)
  }
} else {
  /* istanbul ignore next */
  macroTimerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}

// Determine microtask defer implementation.
/* istanbul ignore next, $flow-disable-line */
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  const p = Promise.resolve()
  microTimerFunc = () => {
    // 把flushCallBacks函数注册为microtask
    p.then(flushCallbacks)
    // in problematic UIWebViews, Promise.then doesn't completely break, but
    // it can get stuck in a weird state where callbacks are pushed into the
    // microtask queue but the queue isn't being flushed, until the browser
    // needs to do some other work, e.g. handle a timer. Therefore we can
    // "force" the microtask queue to be flushed by adding an empty timer.
    // 在一些UIWebViews中存在很怪异的问题，即microtask没有被刷新，其中一种解决的方案是
    // 让浏览器做一些其他的事情，比如注册一个macrotask，即使这个macrotask什么都不做，这样就能够
    // 间接触发microtask的触发
    if (isIOS) setTimeout(noop)
  }
} else {
  // fallback to macro
  microTimerFunc = macroTimerFunc
}

/**
 * Wrap a function so that if any code inside triggers state change,
 * the changes are queued using a (macro) task instead of a microtask.
 */
export function withMacroTask (fn: Function): Function {
  return fn._withTask || (fn._withTask = function () {
    useMacroTask = true
    const res = fn.apply(null, arguments)
    useMacroTask = false
    return res
  })
}

export function nextTick (cb?: Function, ctx?: Object) {
  let _resolve
  // 这里使用callback而不是直接在nextTick中执行回调函数的原因是为了保证在同一个tick
  // 内多次调用nextTick的时候，把这些异步任务都压成一个同步任务，在下一个tick中执行，而不是开启多个异步任务。
  callbacks.push(() => {
    if (cb) {
      try {
        cb.call(ctx)
      } catch (e) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) {
      _resolve(ctx)
    }
  })
  // 回调队列是否处于等待刷新的状态
  if (!pending) {
    pending = true
    if (useMacroTask) {
      macroTimerFunc()
    } else {
      microTimerFunc()
    }
  }
  // $flow-disable-line
  // 当不传cb时，提供一个Promise化的调用，比如nextTick().then(() => {})
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise(resolve => {
      _resolve = resolve
    })
  }
}
